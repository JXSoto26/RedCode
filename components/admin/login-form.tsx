"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/quote/fields";
import { login, type ActionState } from "@/lib/admin/actions";

const initial: ActionState = { ok: false, message: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium text-foreground/90">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          className={fieldClass}
          aria-invalid={state.message ? true : undefined}
          aria-describedby={state.message ? "login-error" : undefined}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium text-foreground/90">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          className={fieldClass}
          aria-invalid={state.message ? true : undefined}
          aria-describedby={state.message ? "login-error" : undefined}
        />
      </div>
      {state.message && (
        <p id="login-error" role="alert" className="rounded-xl border border-brand-600/40 bg-brand-600/10 p-3 text-sm text-brand-200">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
