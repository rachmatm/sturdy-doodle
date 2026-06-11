'use client';

import { MAX_TRAITS, PERSONALITY_TRAITS, type PersonalityTrait } from '@/lib/types';

interface PersonalityStepProps {
  selected: PersonalityTrait[];
  onToggle: (trait: PersonalityTrait) => void;
}

export default function PersonalityStep({ selected, onToggle }: PersonalityStepProps) {
  const atLimit = selected.length >= MAX_TRAITS;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Pick your brand personality
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Choose up to {MAX_TRAITS}. This is optional — skip it and we&apos;ll keep
          things clean and professional.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERSONALITY_TRAITS.map((trait) => {
          const isSelected = selected.includes(trait);
          const isDisabled = !isSelected && atLimit;
          return (
            <button
              key={trait}
              type="button"
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => onToggle(trait)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                isSelected
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : isDisabled
                    ? 'cursor-not-allowed border-zinc-200 text-zinc-300 dark:border-zinc-800 dark:text-zinc-700'
                    : 'border-zinc-300 text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500'
              }`}
            >
              {trait}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-zinc-400">
        {selected.length}/{MAX_TRAITS} selected
      </p>
    </div>
  );
}
