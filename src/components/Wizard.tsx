'use client';

import { useState } from 'react';
import { BUSINESS_DESCRIPTION_MAX, BUSINESS_NAME_MAX } from '@/lib/prompt';
import type { LogoBrief, LogoStyle, PersonalityTrait } from '@/lib/types';
import { MAX_TRAITS } from '@/lib/types';
import BusinessInfoStep from './steps/BusinessInfoStep';
import PersonalityStep from './steps/PersonalityStep';
import StyleStep from './steps/StyleStep';

interface WizardProps {
  /** Called with the validated brief when the user finishes the last step. */
  onSubmit: (brief: LogoBrief) => void;
  /** When true, the final action is in flight (e.g. generating) and is disabled. */
  submitting?: boolean;
}

const STEPS = ['Business', 'Personality', 'Style'] as const;

interface FieldErrors {
  businessName?: string;
  businessDescription?: string;
  style?: string;
}

/**
 * Client-side wizard state machine (architecture.md §3). Collects the 4-field
 * brief over three steps, each validating its own input before advancing. The
 * brief is the only output; generation, loading, and results are handled by the
 * parent via {@link WizardProps.onSubmit}.
 */
export default function Wizard({ onSubmit, submitting = false }: WizardProps) {
  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [traits, setTraits] = useState<PersonalityTrait[]>([]);
  const [style, setStyle] = useState<LogoStyle | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  function toggleTrait(trait: PersonalityTrait) {
    setTraits((current) => {
      if (current.includes(trait)) return current.filter((t) => t !== trait);
      if (current.length >= MAX_TRAITS) return current;
      return [...current, trait];
    });
  }

  /** Validate the current step; on success returns true, else sets errors. */
  function validateStep(): boolean {
    if (step === 0) {
      const next: FieldErrors = {};
      const name = businessName.trim();
      const desc = businessDescription.trim();
      if (!name) next.businessName = 'Business name is required.';
      else if (name.length > BUSINESS_NAME_MAX)
        next.businessName = `Business name must be ${BUSINESS_NAME_MAX} characters or fewer.`;
      if (!desc) next.businessDescription = 'Business description is required.';
      else if (desc.length > BUSINESS_DESCRIPTION_MAX)
        next.businessDescription = `Business description must be ${BUSINESS_DESCRIPTION_MAX} characters or fewer.`;
      setErrors(next);
      return Object.keys(next).length === 0;
    }
    if (step === 2) {
      if (!style) {
        setErrors({ style: 'Select a logo style.' });
        return false;
      }
    }
    setErrors({});
    return true;
  }

  function handleNext() {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    // Last step: assemble the brief and hand it off.
    onSubmit({
      businessName: businessName.trim(),
      businessDescription: businessDescription.trim(),
      traits,
      style: style as LogoStyle,
    });
  }

  function handleBack() {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i <= step
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`hidden text-xs font-medium sm:inline ${
                i <= step ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 ? (
              <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            ) : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <BusinessInfoStep
          businessName={businessName}
          businessDescription={businessDescription}
          onNameChange={(v) => {
            setBusinessName(v);
            if (errors.businessName) setErrors((e) => ({ ...e, businessName: undefined }));
          }}
          onDescriptionChange={(v) => {
            setBusinessDescription(v);
            if (errors.businessDescription)
              setErrors((e) => ({ ...e, businessDescription: undefined }));
          }}
          errors={errors}
        />
      ) : null}

      {step === 1 ? (
        <PersonalityStep selected={traits} onToggle={toggleTrait} />
      ) : null}

      {step === 2 ? (
        <StyleStep
          selected={style}
          onSelect={(s) => {
            setStyle(s);
            if (errors.style) setErrors((e) => ({ ...e, style: undefined }));
          }}
          error={errors.style}
        />
      ) : null}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 0 || submitting}
          className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={submitting}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isLastStep ? (submitting ? 'Generating…' : 'Generate logos') : 'Next'}
        </button>
      </div>
    </div>
  );
}
