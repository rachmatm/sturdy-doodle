/**
 * Shared client/server contract for the AI Logo Generator.
 *
 * This module is the single source of truth for the shapes exchanged between
 * the wizard UI and the API routes. It is import-safe from both client and
 * server components: it contains only types and plain constants, and must never
 * import a server-only module (`better-sqlite3`, the AI key, fs, etc.).
 */

// --- Brand personality (PRD §6: select up to 3) ---

export const PERSONALITY_TRAITS = [
  'Trustworthy',
  'Modern',
  'Friendly',
  'Premium',
  'Creative',
  'Professional',
  'Innovative',
  'Fun',
  'Elegant',
  'Strong',
  'Simple',
] as const;

export type PersonalityTrait = (typeof PERSONALITY_TRAITS)[number];

export const MAX_TRAITS = 3;

// --- Logo style (PRD §6: select one) ---

export const LOGO_STYLES = [
  'Text Only',
  'Icon + Text',
  'Badge',
  'Abstract Symbol',
  'Mascot',
] as const;

export type LogoStyle = (typeof LOGO_STYLES)[number];

// --- The brief collected by wizard steps 1-3 ---

export interface LogoBrief {
  businessName: string;
  businessDescription: string;
  /** Up to {@link MAX_TRAITS} selected traits. */
  traits: PersonalityTrait[];
  style: LogoStyle;
  /**
   * Optional color guidance. When omitted or empty, the prompt builder lets the
   * AI choose an appropriate palette ("Let AI Choose", TC-002).
   */
  colorPreference?: string;
}

// --- Refinement (PRD §6) ---

export const REFINEMENT_DIRECTIVES = [
  'More Professional',
  'More Modern',
  'More Friendly',
  'More Premium',
  'More Minimalist',
] as const;

export type RefinementDirective = (typeof REFINEMENT_DIRECTIVES)[number];

export const REFINEMENT_CHANGE_TARGETS = ['color', 'icon', 'font'] as const;

export type RefinementChangeTarget = (typeof REFINEMENT_CHANGE_TARGETS)[number];

export interface RefinementChange {
  target: RefinementChangeTarget;
  /** Optional desired value, e.g. a color name or font family. */
  value?: string;
}

// --- Download formats (PRD §6) ---

/** Free format. */
export const FREE_DOWNLOAD_FORMAT = 'png' as const;

/** Premium-ready formats. */
export const PREMIUM_DOWNLOAD_FORMATS = ['svg', 'png-transparent', 'favicon'] as const;

export const DOWNLOAD_FORMATS = [
  FREE_DOWNLOAD_FORMAT,
  ...PREMIUM_DOWNLOAD_FORMATS,
] as const;

export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

// --- A generated logo concept / saved record ---

/**
 * One generated logo. Mirrors the `gallery` table (see architecture.md §5):
 * the client receives `imageUrl` to render and `id` to select/refine/download.
 */
export interface LogoConcept {
  /** UUID; also the image filename stem and the gallery primary key. */
  id: string;
  /** Prompt actually sent to the AI. */
  prompt: string;
  /** Public path used to fetch the bytes: `/api/images/<filename>`. */
  imageUrl: string;
  /** File on disk under the storage root. */
  imageFilename: string;
  /** Detected from magic bytes, not a caller-supplied extension. */
  contentType: string;
  /** Generating model. */
  model: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** Structured brief / refinement metadata, enough to regenerate or refine. */
  params?: LogoParams;
}

/** Context stored alongside a logo so it can be regenerated or refined again. */
export interface LogoParams {
  brief?: LogoBrief;
  directive?: RefinementDirective;
  change?: RefinementChange;
  /** ID of the concept this one was refined from, if any. */
  refinedFrom?: string;
}

// --- API request / response contracts ---

export interface GenerateRequest {
  brief: LogoBrief;
}

export interface GenerateResponse {
  concepts: LogoConcept[];
}

export interface RefineRequest {
  /** The selected concept to refine. */
  conceptId: string;
  directive?: RefinementDirective;
  change?: RefinementChange;
}

export interface RefineResponse {
  concepts: LogoConcept[];
}

export interface GalleryResponse {
  concepts: LogoConcept[];
  total: number;
  /** Cursor/offset for the next page, or null when exhausted. */
  nextOffset: number | null;
}

export interface HealthResponse {
  status: 'ok';
  /** Whether the AI provider key is configured server-side. */
  aiKeyConfigured: boolean;
}

// --- Uniform error shape (architecture.md §6) ---

export const ERROR_CODES = [
  'INVALID_REQUEST',
  'INVALID_PROMPT',
  'TIMEOUT',
  'NO_IMAGE',
  'UPSTREAM_ERROR',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Every API failure returns this shape: branch on `code`, show `error`. */
export interface ApiError {
  error: string;
  code: ErrorCode;
}

/** Helper for callers that hold either a success payload or an error. */
export type ApiResult<T> = T | ApiError;

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'error' in value
  );
}
