"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-base text-foreground placeholder:text-muted-2 transition-colors focus:border-brand-600/60 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-brand-500/80 sm:text-sm";

function describedBy(...ids: (string | false | null | undefined)[]) {
  const value = ids.filter(Boolean).join(" ");
  return value || undefined;
}

function Label({
  htmlFor,
  required,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-foreground/90">
      {children}
      {required ? (
        <span className="text-brand-400"> *<span className="sr-only"> (obligatorio)</span></span>
      ) : (
        <span className="font-normal text-muted-2"> (opcional)</span>
      )}
    </label>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-brand-300">
      {message}
    </p>
  );
}

function Hint({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-sm text-muted-2">
      {children}
    </p>
  );
}

type BaseProps = {
  id: string;
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
};

export function TextField({
  id,
  label,
  required,
  hint,
  error,
  ...input
}: BaseProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "required">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <input
        id={id}
        name={id}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint ? `${id}-hint` : null, error ? `${id}-error` : null)}
        className={fieldClass}
        {...input}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function TextAreaField({
  id,
  label,
  required,
  hint,
  error,
  ...textarea
}: BaseProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "required">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <textarea
        id={id}
        name={id}
        rows={4}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint ? `${id}-hint` : null, error ? `${id}-error` : null)}
        className={cn(fieldClass, "resize-y")}
        {...textarea}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

type Option = { value: string; label: string; hint?: string };

/** Native radio/checkbox group in a fieldset, styled as selectable cards. */
export function ChoiceGroup({
  id,
  legend,
  type,
  options,
  selected,
  onChange,
  required,
  hint,
  error,
  columns = 2,
}: {
  id: string;
  legend: string;
  type: "radio" | "checkbox";
  options: readonly Option[];
  selected: string[];
  onChange: (value: string, checked: boolean) => void;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset
      className="flex flex-col gap-3"
      aria-describedby={describedBy(hint ? `${id}-hint` : null, error ? `${id}-error` : null)}
    >
      <legend className="mb-1 text-sm font-medium text-foreground/90">
        {legend}
        {required ? (
          <span className="text-brand-400"> *<span className="sr-only"> (obligatorio)</span></span>
        ) : (
          <span className="font-normal text-muted-2"> (opcional)</span>
        )}
      </legend>
      <Hint id={`${id}-hint`}>{hint}</Hint>
      <div
        className={cn(
          "grid gap-2.5",
          columns >= 2 && "sm:grid-cols-2",
          columns === 3 && "lg:grid-cols-3"
        )}
      >
        {options.map((option, i) => {
          const optionId = `${id}-${option.value}`;
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cn(
                "group flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-brand-500/70",
                checked
                  ? "border-brand-600/60 bg-brand-600/10"
                  : "border-border bg-background/40 hover:border-white/20"
              )}
            >
              <input
                id={optionId}
                type={type}
                name={id}
                value={option.value}
                checked={checked}
                onChange={(e) => onChange(option.value, e.target.checked)}
                aria-invalid={error && i === 0 ? true : undefined}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center border transition-colors",
                  type === "radio" ? "rounded-full" : "rounded-md",
                  checked ? "border-brand-500 bg-brand-600 text-white" : "border-white/25"
                )}
              >
                {checked &&
                  (type === "radio" ? (
                    <span className="size-2 rounded-full bg-white" />
                  ) : (
                    <Check className="size-3.5" strokeWidth={3} />
                  ))}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                {option.hint && <span className="mt-0.5 text-sm text-muted-2">{option.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id={`${id}-error`} message={error} />
    </fieldset>
  );
}

/** Single standalone checkbox (e.g. "No lo tengo definido", consent). */
export function CheckboxField({
  id,
  checked,
  onChange,
  children,
  error,
  required,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg focus-within:ring-2 focus-within:ring-brand-500/70">
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
            checked ? "border-brand-500 bg-brand-600 text-white" : "border-white/25"
          )}
        >
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span className="text-sm text-foreground/90">{children}</span>
      </label>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
