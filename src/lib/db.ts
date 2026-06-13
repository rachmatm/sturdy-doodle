/**
 * Persistence for saved logo records (architecture.md §5, §7).
 *
 * Two interchangeable backends, selected at runtime from the environment:
 *  - **Turso** (`@libsql/client`) when `TURSO_AUTH_TOKEN` and
 *    `TURSO_DATABASE_URL` are both set — used on hosts without a writable disk
 *    (e.g. Vercel). The schema and queries are plain SQLite, just over the wire.
 *  - **SQLite** (`better-sqlite3`, WAL + busy_timeout) otherwise — the local /
 *    persistent-disk default.
 *
 * Both expose the same async API. SQLite is synchronous under the hood; the
 * promises resolve immediately, so callers can `await` uniformly regardless of
 * which backend is active. All access is parameterized (bound args, never
 * concatenated), closing the SQL-injection surface (TC-SEC-001).
 *
 * Server-only: this module loads a native binary (`better-sqlite3`) and reads
 * the Turso credentials, so it must never be imported by a client component.
 * `better-sqlite3` is marked external in `next.config.ts`; both backends are
 * dynamically imported so only the one in use is ever loaded.
 */

import { join } from 'node:path';
import type { LogoConcept, LogoParams } from './types';

const DEFAULT_DB_PATH = join(process.cwd(), 'storage', 'gallery.db');

/** True when the Turso credentials are present and the cloud DB should be used. */
function tursoEnabled(): boolean {
  return Boolean(
    process.env.TURSO_AUTH_TOKEN?.trim() && process.env.TURSO_DATABASE_URL?.trim(),
  );
}

/** Resolve the SQLite file path from env, defaulting to ./storage/gallery.db. */
function databasePath(): string {
  return process.env.DATABASE_PATH?.trim() || DEFAULT_DB_PATH;
}

/** Row shape as stored; `params` is serialized JSON. */
interface GalleryRow {
  id: string;
  prompt: string;
  image_filename: string;
  image_url: string;
  content_type: string;
  model: string;
  created_at: string;
  params: string | null;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS gallery (
    id             TEXT PRIMARY KEY,
    prompt         TEXT NOT NULL,
    image_filename TEXT NOT NULL,
    image_url      TEXT NOT NULL,
    content_type   TEXT NOT NULL,
    model          TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    params         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_gallery_created_at
    ON gallery (created_at DESC);

  CREATE TABLE IF NOT EXISTS mistral_agents (
    key_fingerprint TEXT PRIMARY KEY,
    agent_id        TEXT NOT NULL,
    model           TEXT NOT NULL,
    created_at      TEXT NOT NULL
  );
`;

const INSERT_SQL = `
  INSERT INTO gallery
    (id, prompt, image_filename, image_url, content_type, model, created_at, params)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;
const COUNT_SQL = 'SELECT COUNT(*) AS n FROM gallery';
const LIST_SQL =
  'SELECT * FROM gallery ORDER BY created_at DESC LIMIT ? OFFSET ?';
const GET_SQL = 'SELECT * FROM gallery WHERE id = ?';

const AGENT_GET_SQL =
  'SELECT agent_id FROM mistral_agents WHERE key_fingerprint = ?';
// Upsert: re-saving a fingerprint (e.g. after the old agent was deleted upstream)
// overwrites the stale id rather than failing the primary-key constraint.
const AGENT_UPSERT_SQL = `
  INSERT INTO mistral_agents (key_fingerprint, agent_id, model, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(key_fingerprint) DO UPDATE SET
    agent_id   = excluded.agent_id,
    model      = excluded.model,
    created_at = excluded.created_at
`;

/** Ordered bind args for an insert, matching INSERT_SQL's `?` placeholders. */
function insertArgs(c: LogoConcept): (string | null)[] {
  return [
    c.id,
    c.prompt,
    c.imageFilename,
    c.imageUrl,
    c.contentType,
    c.model,
    c.createdAt,
    c.params ? JSON.stringify(c.params) : null,
  ];
}

/** Common backend surface; the two implementations resolve to this. */
interface DbBackend {
  insert(concept: LogoConcept): Promise<void>;
  count(): Promise<number>;
  list(limit: number, offset: number): Promise<GalleryRow[]>;
  get(id: string): Promise<GalleryRow | null>;
  getAgent(keyFingerprint: string): Promise<string | null>;
  saveAgent(keyFingerprint: string, agentId: string, model: string): Promise<void>;
}

let backendPromise: Promise<DbBackend> | null = null;

/** Lazily build (and cache) the active backend for the life of the process. */
function getBackend(): Promise<DbBackend> {
  if (!backendPromise) {
    backendPromise = (tursoEnabled() ? createTursoBackend() : createSqliteBackend()).catch(
      (err) => {
        // Don't cache a failed init — let the next call retry.
        backendPromise = null;
        throw err;
      },
    );
  }
  return backendPromise;
}

async function createTursoBackend(): Promise<DbBackend> {
  const { createClient } = await import('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!.trim(),
    authToken: process.env.TURSO_AUTH_TOKEN!.trim(),
  });
  await client.executeMultiple(CREATE_TABLE);

  return {
    async insert(concept) {
      await client.execute({ sql: INSERT_SQL, args: insertArgs(concept) });
    },
    async count() {
      const res = await client.execute(COUNT_SQL);
      return Number((res.rows[0] as unknown as { n: number }).n);
    },
    async list(limit, offset) {
      const res = await client.execute({ sql: LIST_SQL, args: [limit, offset] });
      return res.rows as unknown as GalleryRow[];
    },
    async get(id) {
      const res = await client.execute({ sql: GET_SQL, args: [id] });
      return (res.rows[0] as unknown as GalleryRow) ?? null;
    },
    async getAgent(keyFingerprint) {
      const res = await client.execute({ sql: AGENT_GET_SQL, args: [keyFingerprint] });
      const row = res.rows[0] as unknown as { agent_id: string } | undefined;
      return row?.agent_id ?? null;
    },
    async saveAgent(keyFingerprint, agentId, model) {
      await client.execute({
        sql: AGENT_UPSERT_SQL,
        args: [keyFingerprint, agentId, model, new Date().toISOString()],
      });
    },
  };
}

async function createSqliteBackend(): Promise<DbBackend> {
  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const { default: Database } = await import('better-sqlite3');

  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });

  const connection = new Database(path);
  connection.pragma('journal_mode = WAL');
  connection.pragma('busy_timeout = 5000');
  connection.pragma('foreign_keys = ON');
  connection.exec(CREATE_TABLE);

  const insertStmt = connection.prepare(INSERT_SQL);
  const countStmt = connection.prepare(COUNT_SQL);
  const listStmt = connection.prepare(LIST_SQL);
  const getStmt = connection.prepare(GET_SQL);
  const agentGetStmt = connection.prepare(AGENT_GET_SQL);
  const agentUpsertStmt = connection.prepare(AGENT_UPSERT_SQL);

  return {
    async insert(concept) {
      insertStmt.run(insertArgs(concept));
    },
    async count() {
      return (countStmt.get() as { n: number }).n;
    },
    async list(limit, offset) {
      return listStmt.all(limit, offset) as GalleryRow[];
    },
    async get(id) {
      return (getStmt.get(id) as GalleryRow | undefined) ?? null;
    },
    async getAgent(keyFingerprint) {
      const row = agentGetStmt.get(keyFingerprint) as { agent_id: string } | undefined;
      return row?.agent_id ?? null;
    },
    async saveAgent(keyFingerprint, agentId, model) {
      agentUpsertStmt.run(keyFingerprint, agentId, model, new Date().toISOString());
    },
  };
}

function rowToConcept(row: GalleryRow): LogoConcept {
  return {
    id: row.id,
    prompt: row.prompt,
    imageUrl: row.image_url,
    imageFilename: row.image_filename,
    contentType: row.content_type,
    model: row.model,
    createdAt: row.created_at,
    params: row.params ? (JSON.parse(row.params) as LogoParams) : undefined,
  };
}

/** Insert a saved logo record. Returns the stored concept. */
export async function insertConcept(concept: LogoConcept): Promise<LogoConcept> {
  await (await getBackend()).insert(concept);
  return concept;
}

/** Total number of saved records (for pagination). */
export async function countConcepts(): Promise<number> {
  return (await getBackend()).count();
}

/** List saved records newest-first, paginated. */
export async function listConcepts(limit = 24, offset = 0): Promise<LogoConcept[]> {
  const rows = await (await getBackend()).list(limit, offset);
  return rows.map(rowToConcept);
}

/** Fetch a single record by id, or null if absent. */
export async function getConcept(id: string): Promise<LogoConcept | null> {
  const row = await (await getBackend()).get(id);
  return row ? rowToConcept(row) : null;
}

/**
 * Look up a previously-created Mistral agent id for an API key, addressed by an
 * opaque fingerprint of that key (never the key itself). Returns null if none is
 * recorded. Lets the agent survive process restarts so we don't re-create one
 * per boot (see `ai.ts` `ensureAgent`).
 */
export async function getStoredAgentId(keyFingerprint: string): Promise<string | null> {
  return (await getBackend()).getAgent(keyFingerprint);
}

/** Persist (upsert) the Mistral agent id for a key fingerprint. */
export async function saveAgentId(
  keyFingerprint: string,
  agentId: string,
  model: string,
): Promise<void> {
  await (await getBackend()).saveAgent(keyFingerprint, agentId, model);
}
