'use client';

import {
  REFINEMENT_CHANGE_TARGETS,
  REFINEMENT_DIRECTIVES,
  type LogoConcept,
  type RefinementChange,
  type RefinementDirective,
} from '@/lib/types';

/** One refinement instruction: a directive or a change target (never empty). */
export type Refinement =
  | { directive: RefinementDirective }
  | { change: RefinementChange };

interface RefineToolbarProps {
  /** The concept being refined. */
  concept: LogoConcept;
  /** Apply a refinement (fires `POST /api/refine` in the host). */
  onRefine: (refinement: Refinement) => void;
  /** Clear the selection / close the toolbar. */
  onClear: () => void;
  /** True while a refine request is in flight. */
  refining?: boolean;
}

const chip =
  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50';
const chipIdle =
  'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';

/**
 * Re-generation from a saved concept (PRD §5.1 / FR-5 / TC-004). The user picks
 * a directive ("More Modern") or a change ("different color"); the host folds it
 * into the prompt and generates new variations, keeping the original. No free
 * text — an empty tweak is impossible here, which keeps the invalid-prompt state
 * a server-side guard rather than something the UI can trigger by accident.
 */
export default function RefineToolbar({
  concept,
  onRefine,
  onClear,
  refining = false,
}: RefineToolbarProps) {
  const title = concept.params?.brief?.businessName ?? 'this logo';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Refine “{title}”
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Make a tweak — we generate new variations and keep the original.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Close refine"
          className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span aria-hidden>✕</span>
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Direction
        </span>
        <div className="flex flex-wrap gap-2">
          {REFINEMENT_DIRECTIVES.map((directive) => (
            <button
              key={directive}
              type="button"
              disabled={refining}
              onClick={() => onRefine({ directive })}
              className={`${chip} ${chipIdle}`}
            >
              {directive}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Change
        </span>
        <div className="flex flex-wrap gap-2">
          {REFINEMENT_CHANGE_TARGETS.map((target) => (
            <button
              key={target}
              type="button"
              disabled={refining}
              onClick={() => onRefine({ change: { target } })}
              className={`${chip} ${chipIdle}`}
            >
              Different {target}
            </button>
          ))}
        </div>
      </div>

      {refining ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Generating variations…</p>
      ) : null}
    </div>
  );
}
