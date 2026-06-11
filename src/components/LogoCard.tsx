'use client';

import Image from 'next/image';
import type { LogoConcept } from '@/lib/types';

interface LogoCardProps {
  concept: LogoConcept;
  selected: boolean;
  onSelect: (id: string) => void;
}

/**
 * One saved logo concept. The image is a selectable region (selection feeds the
 * refine flow); a Download link exports the PNG via `GET /api/download`, which
 * returns the bytes as an attachment, so a plain link is enough — no JS fetch.
 * The image is served same-origin from `/api/images/...`, so `next/image` needs
 * no remote-pattern config.
 */
export default function LogoCard({ concept, selected, onSelect }: LogoCardProps) {
  const brief = concept.params?.brief;
  const title = brief?.businessName ?? 'Logo concept';

  return (
    <figure
      className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-colors dark:bg-zinc-900 ${
        selected
          ? 'border-zinc-900 ring-2 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`Select logo for ${title}`}
        onClick={() => onSelect(concept.id)}
        className="relative aspect-square w-full bg-zinc-50 dark:bg-zinc-950"
      >
        <Image
          src={concept.imageUrl}
          alt={`Logo for ${title}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-contain p-2"
          unoptimized
        />
      </button>
      <figcaption className="flex items-center justify-between gap-2 border-t border-zinc-100 p-3 dark:border-zinc-800">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {title}
          </span>
          {brief?.style ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{brief.style}</span>
          ) : null}
        </div>
        <a
          href={`/api/download?id=${encodeURIComponent(concept.id)}`}
          download
          className="shrink-0 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Download
        </a>
      </figcaption>
    </figure>
  );
}
