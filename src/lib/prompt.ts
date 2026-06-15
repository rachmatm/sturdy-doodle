/**
 * Prompt construction + brief validation (architecture.md §4, §8).
 *
 * Turns a structured {@link LogoBrief} into the text prompt sent to the AI, and
 * is the single source of truth for the brief's validation rules (so the same
 * length bound applies in the API route and nowhere is it duplicated). For the
 * 12 concepts, it emits distinct prompt variations (layout / typography / icon
 * directions) derived from one brief.
 *
 * Pure and dependency-free (no server-only imports), so it is unit-testable and
 * usable from either side if needed; in practice it runs server-side.
 */

import {
  LOGO_STYLES,
  MAX_TRAITS,
  PERSONALITY_TRAITS,
  type LogoBrief,
  type RefinementChange,
  type RefinementDirective,
} from './types';

export const BUSINESS_NAME_MAX = 80;
export const BUSINESS_DESCRIPTION_MAX = 2000;

/** Number of distinct concepts produced per generation (PRD FR-004). */
export const CONCEPT_COUNT = 6;

export interface BriefValidationError {
  field: 'businessName' | 'businessDescription' | 'traits' | 'style';
  message: string;
}

/**
 * Validate and normalize a raw brief. Returns either the cleaned brief or a
 * list of field errors. Whitespace is trimmed; over-long fields are an error
 * rather than silently truncated (acceptance TC-005 allows validation or
 * truncation — we validate).
 */
export function validateBrief(
  input: unknown,
): { ok: true; brief: LogoBrief } | { ok: false; errors: BriefValidationError[] } {
  const errors: BriefValidationError[] = [];
  const raw = (input ?? {}) as Partial<Record<keyof LogoBrief, unknown>>;

  const businessName = typeof raw.businessName === 'string' ? raw.businessName.trim() : '';
  if (!businessName) {
    errors.push({ field: 'businessName', message: 'Business name is required.' });
  } else if (businessName.length > BUSINESS_NAME_MAX) {
    errors.push({
      field: 'businessName',
      message: `Business name must be ${BUSINESS_NAME_MAX} characters or fewer.`,
    });
  }

  const businessDescription =
    typeof raw.businessDescription === 'string' ? raw.businessDescription.trim() : '';
  if (!businessDescription) {
    errors.push({
      field: 'businessDescription',
      message: 'Business description is required.',
    });
  } else if (businessDescription.length > BUSINESS_DESCRIPTION_MAX) {
    errors.push({
      field: 'businessDescription',
      message: `Business description must be ${BUSINESS_DESCRIPTION_MAX} characters or fewer.`,
    });
  }

  const rawTraits = Array.isArray(raw.traits) ? raw.traits : [];
  const traits = rawTraits.filter(
    (t): t is (typeof PERSONALITY_TRAITS)[number] =>
      typeof t === 'string' &&
      (PERSONALITY_TRAITS as readonly string[]).includes(t),
  );
  if (traits.length > MAX_TRAITS) {
    errors.push({
      field: 'traits',
      message: `Select at most ${MAX_TRAITS} personality traits.`,
    });
  }

  const style = raw.style;
  if (
    typeof style !== 'string' ||
    !(LOGO_STYLES as readonly string[]).includes(style)
  ) {
    errors.push({ field: 'style', message: 'Select a logo style.' });
  }

  if (errors.length > 0) return { ok: false, errors };

  const colorPreference =
    typeof raw.colorPreference === 'string' && raw.colorPreference.trim()
      ? raw.colorPreference.trim()
      : undefined;

  return {
    ok: true,
    brief: {
      businessName,
      businessDescription,
      traits,
      style: style as LogoBrief['style'],
      colorPreference,
    },
  };
}

const DESIGN_PRINCIPLES =
  'The logo must be simple, memorable, scalable, and flat — clean vector style, high contrast, readable at small sizes, on a plain background, no photorealism, no mockups, no extraneous text.';

/** Distinct creative directions so the 12 concepts differ meaningfully. */
const VARIATIONS: readonly string[] = [
  'a balanced horizontal lockup',
  'a stacked/vertical lockup',
  'an enclosed badge or emblem',
  'a bold monogram or lettermark',
  'a minimal line-art icon paired with the name',
  'a geometric abstract symbol',
  'a friendly rounded wordmark',
  'a sharp modern sans-serif wordmark',
  'a negative-space concept',
  'a single strong focal icon',
  'an elegant serif treatment',
  'a playful asymmetric arrangement',
];

function describeColor(brief: LogoBrief): string {
  return brief.colorPreference
    ? `Use this color guidance: ${brief.colorPreference}.`
    : 'Choose a color palette that fits the brand; pick colors automatically.';
}

function describeTraits(brief: LogoBrief): string {
  return brief.traits.length
    ? `Brand personality: ${brief.traits.join(', ')}.`
    : 'Brand personality: clean and professional.';
}

/** Base prompt for a brief, without a specific layout variation. */
export function buildBasePrompt(brief: LogoBrief): string {
  return [
    `Design a professional logo for "${brief.businessName}".`,
    `Business: ${brief.businessDescription}.`,
    describeTraits(brief),
    `Logo style: ${brief.style}.`,
    describeColor(brief),
    DESIGN_PRINCIPLES,
  ].join(' ');
}

/**
 * Build the {@link CONCEPT_COUNT} prompt variations for a brief — one per
 * creative direction — so the generated concepts are visually distinct.
 */
export function buildConceptPrompts(brief: LogoBrief): string[] {
  const base = buildBasePrompt(brief);
  return VARIATIONS.slice(0, CONCEPT_COUNT).map(
    (direction) => `${base} Composition for this concept: ${direction}.`,
  );
}

/** Fold a refinement directive / change into a fresh prompt from the brief. */
export function buildRefinePrompt(
  brief: LogoBrief,
  refinement: { directive?: RefinementDirective; change?: RefinementChange },
): string {
  const parts = [buildBasePrompt(brief)];
  if (refinement.directive) {
    parts.push(`Refinement: make it ${refinement.directive.replace(/^More /, '').toLowerCase()}.`);
  }
  if (refinement.change) {
    const { target, value } = refinement.change;
    parts.push(
      value
        ? `Change the ${target} to ${value}.`
        : `Try a different ${target}.`,
    );
  }
  return parts.join(' ');
}
