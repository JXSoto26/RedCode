"use client";

import * as React from "react";
import Script from "next/script";
import { RefreshCw } from "lucide-react";

/** Must match TURNSTILE_ACTION in lib/quote/turnstile.ts (checked on the server). */
const ACTION = "quote_request";

type RenderOptions = {
  sitekey: string;
  action: string;
  theme: "dark" | "light" | "auto";
  language: string;
  "refresh-expired": "auto" | "manual" | "never";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
  "timeout-callback": () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, options: RenderOptions): string;
      reset(widgetId: string): void;
      remove(widgetId: string): void;
    };
  }
}

export type TurnstileHandle = {
  /** Discards the current token and asks Cloudflare for a new one. */
  reset(): void;
};

type Props = { siteKey: string; onToken: (token: string | null) => void };

/**
 * Cloudflare Turnstile widget (explicit rendering). The token renews itself
 * when it expires, and a failed check can be retried without reloading, so
 * the form never loses what the visitor typed.
 */
export const TurnstileWidget = React.forwardRef<TurnstileHandle, Props>(function TurnstileWidget(
  { siteKey, onToken },
  ref
) {
  const container = React.useRef<HTMLDivElement>(null);
  const widgetId = React.useRef<string | null>(null);
  const onTokenRef = React.useRef(onToken);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const render = React.useCallback(() => {
    const turnstile = window.turnstile;
    if (!turnstile || !container.current || widgetId.current) return;
    widgetId.current = turnstile.render(container.current, {
      sitekey: siteKey,
      action: ACTION,
      theme: "dark",
      language: "es",
      "refresh-expired": "auto",
      callback: (token) => {
        setFailed(false);
        onTokenRef.current(token);
      },
      "expired-callback": () => onTokenRef.current(null),
      "timeout-callback": () => onTokenRef.current(null),
      "error-callback": () => {
        onTokenRef.current(null);
        setFailed(true);
      },
    });
  }, [siteKey]);

  const reset = React.useCallback(() => {
    onTokenRef.current(null);
    setFailed(false);
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    else render();
  }, [render]);

  React.useImperativeHandle(ref, () => ({ reset }), [reset]);

  React.useEffect(() => {
    render();
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [render]);

  return (
    <div className="flex flex-col gap-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={render}
        onError={() => setFailed(true)}
      />
      <p className="text-sm font-medium text-foreground/90">Verificación anti-spam</p>
      <div ref={container} className="min-h-[65px]" />
      {failed && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-brand-200">
          <span>No se pudo completar la verificación. Tus datos siguen aquí.</span>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-4"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Reintentar verificación
          </button>
        </div>
      )}
    </div>
  );
});
