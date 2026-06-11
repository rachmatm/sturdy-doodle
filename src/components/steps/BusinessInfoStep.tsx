'use client';

import { BUSINESS_DESCRIPTION_MAX, BUSINESS_NAME_MAX } from '@/lib/prompt';

interface BusinessInfoStepProps {
  businessName: string;
  businessDescription: string;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  /** Field errors to show inline, keyed by field; only shown once surfaced. */
  errors: { businessName?: string; businessDescription?: string };
}

const inputBase =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100';

export default function BusinessInfoStep({
  businessName,
  businessDescription,
  onNameChange,
  onDescriptionChange,
  errors,
}: BusinessInfoStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Tell us about your business
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Just the basics — we turn these into a logo prompt for you.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Business name
        </span>
        <input
          type="text"
          value={businessName}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={BUSINESS_NAME_MAX}
          placeholder="e.g. Joe's Coffee"
          aria-invalid={Boolean(errors.businessName)}
          className={`${inputBase} ${
            errors.businessName
              ? 'border-red-400 dark:border-red-700'
              : 'border-zinc-300 dark:border-zinc-700'
          }`}
        />
        <div className="flex items-center justify-between">
          {errors.businessName ? (
            <span className="text-xs text-red-600 dark:text-red-400">
              {errors.businessName}
            </span>
          ) : (
            <span />
          )}
          <span className="text-xs text-zinc-400">
            {businessName.length}/{BUSINESS_NAME_MAX}
          </span>
        </div>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          What does it do?
        </span>
        <textarea
          value={businessDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          maxLength={BUSINESS_DESCRIPTION_MAX}
          rows={4}
          placeholder="e.g. A neighborhood coffee shop serving small-batch espresso and pastries."
          aria-invalid={Boolean(errors.businessDescription)}
          className={`${inputBase} resize-none ${
            errors.businessDescription
              ? 'border-red-400 dark:border-red-700'
              : 'border-zinc-300 dark:border-zinc-700'
          }`}
        />
        <div className="flex items-center justify-between">
          {errors.businessDescription ? (
            <span className="text-xs text-red-600 dark:text-red-400">
              {errors.businessDescription}
            </span>
          ) : (
            <span />
          )}
          <span className="text-xs text-zinc-400">
            {businessDescription.length}/{BUSINESS_DESCRIPTION_MAX}
          </span>
        </div>
      </label>
    </div>
  );
}
