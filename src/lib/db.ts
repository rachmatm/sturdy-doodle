/**
 * SQLite persistence for saved logo records (architecture.md §5, §7).
 *
 * Embedded `better-sqlite3` in WAL mode: many readers proceed during a write,
 * and `busy_timeout` makes concurrent writers wait rather than throw under
 * contention. All access goes through prepared statements — user input is bound,
 * never concatenated — which closes the SQL-injection surface (test-plan
 * TC-SEC-001).
 *
 * Server-only: this module loads the native `better-sqlite3` binary and must
 * never be imported by a client component. It is marked external in
 * `next.config.ts` (`serverExternalPackages`).
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import type { LogoConcept, LogoParams } from './types';

const DEFAULT_DB_PATH = join(process.cwd(), 'storage', 'gallery.db');

/** Resolve the SQLite file path from env, defaulting to ./storage/gallery.db. */
function databasePath(): string {
  return process.env.DATABASE_PATH?.trim() || DEFAULT_DB_PATH;
}

/** Row shape as stored on disk; `params` is serialized JSON. */
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

let db: Database.Database | null = null;

/**
 * Lazily open (and migrate) the database, caching the connection for the life
 * of the process. WAL + busy_timeout are set on first open.
 */
function getDb(): Database.Database {
  if (db) return db;

  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });

  const connection = new Database(path);
  connection.pragma('journal_mode = WAL');
  connection.pragma('busy_timeout = 5000');
  connection.pragma('foreign_keys = ON');

  connection.exec(`
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
  `);

  db = connection;
  return db;
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
export function insertConcept(concept: LogoConcept): LogoConcept {
  const stmt = getDb().prepare(`
    INSERT INTO gallery
      (id, prompt, image_filename, image_url, content_type, model, created_at, params)
    VALUES
      (@id, @prompt, @image_filename, @image_url, @content_type, @model, @created_at, @params)
  `);
  stmt.run({
    id: concept.id,
    prompt: concept.prompt,
    image_filename: concept.imageFilename,
    image_url: concept.imageUrl,
    content_type: concept.contentType,
    model: concept.model,
    created_at: concept.createdAt,
    params: concept.params ? JSON.stringify(concept.params) : null,
  });
  return concept;
}

/** Total number of saved records (for pagination). */
export function countConcepts(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM gallery').get() as {
    n: number;
  };
  return row.n;
}

/** List saved records newest-first, paginated. */
export function listConcepts(limit = 24, offset = 0): LogoConcept[] {
  const rows = getDb()
    .prepare(
      'SELECT * FROM gallery ORDER BY created_at DESC LIMIT @limit OFFSET @offset',
    )
    .all({ limit, offset }) as GalleryRow[];
  return rows.map(rowToConcept);
}

/** Fetch a single record by id, or null if absent. */
export function getConcept(id: string): LogoConcept | null {
  const row = getDb()
    .prepare('SELECT * FROM gallery WHERE id = @id')
    .get({ id }) as GalleryRow | undefined;
  return row ? rowToConcept(row) : null;
}
