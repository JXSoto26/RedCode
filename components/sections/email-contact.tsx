"use client";

import * as React from "react";
import { Check, Copy, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

/**
 * Email contact: a plain mailto link plus the visible address and a "Copiar
 * email" button. Opening the mail app or copying sends nothing, so nothing
 * here says a message was sent. If the device has no mail app configured,
 * the mailto link does nothing: the address and the copy button cover that.
 */
export function EmailContact({ email, href, primary }: { email: string; href: string; primary: boolean }) {
  const [state, setState] = React.useState<CopyState>("idle");
  const addressRef = React.useRef<HTMLSpanElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setState("copied");
    } catch {
      // Without clipboard access (old browser, blocked permission): select the
      // address so the visitor can copy it by hand.
      const node = addressRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setState("failed");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button asChild size="lg" variant={primary ? "primary" : "secondary"} className="w-full">
        <a href={href}>
          <Mail className="size-4" aria-hidden /> Abrir en tu app de correo
        </a>
      </Button>

      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background/40 p-3 sm:flex-row sm:justify-between">
        <span ref={addressRef} className="select-all break-all text-center font-medium text-foreground sm:text-left">
          {email}
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={copy} className="shrink-0">
          {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
          {state === "copied" ? "Copiado" : "Copiar email"}
        </Button>
      </div>

      <p role="status" aria-live="polite" className={cn("text-center text-sm", state === "failed" ? "text-amber-200" : "text-success-300", state === "idle" && "sr-only")}>
        {state === "copied" && `Dirección copiada: ${email}. Pégala en tu correo para escribirnos.`}
        {state === "failed" &&
          "No se pudo copiar automáticamente. La dirección quedó seleccionada: cópiala con Ctrl+C (o Cmd+C), o mantén pulsado sobre ella en el celular y elige Copiar."}
      </p>

      <p className="text-center text-xs text-muted-2">
        Si al pulsar el botón no se abre ninguna aplicación, es posible que tu dispositivo no tenga una app de correo
        configurada. Copia la dirección y escríbenos desde tu correo habitual.
      </p>
    </div>
  );
}
