'use client';

import Script from 'next/script';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
} from 'react';

/**
 * Cloudflare Turnstile widget (bot protection). Renders the challenge and hands
 * the resulting one-time token to the parent via {@link TurnstileWidgetProps.onToken};
 * the parent sends it with a submission and the server verifies it
 * (`src/lib/turnstile.ts`). Tokens are single-use, so the parent calls the
 * imperative {@link TurnstileHandle.reset} after each submission to mint a fresh one.
 *
 * The site key is public by design (it ships in the HTML), so it is read from
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and falls back to the project's configured key.
 */

const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();

/** Minimal typings for the slice of the Turnstile JS API we use. */
interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string | undefined;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  /** Clear the current token and re-issue a fresh challenge. */
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Receives the token on solve, or `null` when it expires / errors / resets. */
  onToken: (token: string | null) => void;
}

const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

    // Render once the script + container are both available. Guarded so a second
    // call (script onLoad racing the mount effect) doesn't double-render.
    const renderWidget = useCallback(() => {
      if (widgetIdRef.current !== null) return;
      const el = containerRef.current;
      if (!el || !window.turnstile) return;
      widgetIdRef.current = window.turnstile.render(el, {
        sitekey: SITE_KEY,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    }, [onToken]);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          onToken(null);
          if (widgetIdRef.current !== null && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
          }
        },
      }),
      [onToken],
    );

    return (
      <>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={renderWidget}
        />
        {/* Cloudflare injects the challenge here; empty until the script renders. */}
        <div ref={containerRef} />
      </>
    );
  },
);

export default TurnstileWidget;
