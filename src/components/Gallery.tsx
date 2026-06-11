'use client';

import type { LogoConcept } from '@/lib/types';
import LogoCard from './LogoCard';

export type GalleryStatus = 'loading' | 'error' | 'ready';

interface GalleryProps {
  concepts: LogoConcept[];
  total: number;
  status: GalleryStatus;
  /** Hydration error message (initial load failed); presentational only. */
  errorMessage?: string;
  /** True when a "load more" page is in flight. */
  loadingMore?: boolean;
  /** Non-null when there is another page to fetch. */
  nextOffset: number | null;
  onRetry: () => void;
  onLoadMore: () => void;
  /** Currently selected concept id, or null. */
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Presentational persistent gallery (PRD FR-4 / TC-003). The host owns fetching
 * and state so newly generated concepts can be prepended; this component renders
 * the loading / retryable-error / empty / grid states from props.
 */
export default function Gallery({
  concepts,
  total,
  status,
  errorMessage,
  loadingMore = false,
  nextOffset,
  onRetry,
  onLoadMore,
  selectedId,
  onSelect,
}: GalleryProps) {
  if (status === 'loading') {
    return (
      <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading your gallery…
      </p>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 py-12 text-center dark:border-red-900 dark:bg-red-950"
      >
        <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (concepts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-700">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Your gallery is empty.
        </p>
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          Generated logos will appear here and stay saved across refreshes.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Saved logos">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {total} saved {total === 1 ? 'logo' : 'logos'}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {concepts.map((concept) => (
          <LogoCard
            key={concept.id}
            concept={concept}
            selected={concept.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>

      {nextOffset !== null ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
