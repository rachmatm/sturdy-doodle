'use client';

import { LOGO_STYLES, type LogoStyle } from '@/lib/types';

interface StyleStepProps {
  selected: LogoStyle | null;
  onSelect: (style: LogoStyle) => void;
  error?: string;
}

/** Short plain-language hint per style, so the user never needs design vocabulary. */
const STYLE_HINTS: Record<LogoStyle, string> = {
  'Text Only': 'Your name as the logo — a clean wordmark.',
  'Icon + Text': 'A small symbol next to your name.',
  Badge: 'An enclosed emblem or seal.',
  'Abstract Symbol': 'A simple geometric mark.',
  Mascot: 'A friendly character that represents you.',
};

export default function StyleStep({ selected, onSelect, error }: StyleStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Choose a logo style
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Pick the shape that fits your brand. You can re-generate in other styles
          later.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Logo style"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {LOGO_STYLES.map((style) => {
          const isSelected = selected === style;
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(style)}
              className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors ${
                isSelected
                  ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900'
                  : 'border-zinc-300 hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500'
              }`}
            >
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {style}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {STYLE_HINTS[style]}
              </span>
            </button>
          );
        })}
      </div>

      {error ? (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : null}
    </div>
  );
}
