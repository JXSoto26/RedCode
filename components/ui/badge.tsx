import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-brand-600/30 bg-brand-600/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-300",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
