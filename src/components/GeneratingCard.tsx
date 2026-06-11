'use client';

/**
 * Meaningful loading state for the 10–30s generation (C4 / FR-7). Tells the user
 * the wait is expected rather than a hang, and never blocks the gallery — the
 * host renders this alongside the existing saved logos.
 */
export default function GeneratingCard() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Generating your logo concepts…
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          This usually takes 10–30 seconds. Each concept is saved to your gallery
          as soon as it&apos;s ready.
        </p>
      </div>
    </div>
  );
}
