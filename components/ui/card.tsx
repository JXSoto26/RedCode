import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "card-surface rounded-2xl p-6 transition-colors duration-300",
        className
      )}
      {...props}
    />
  );
}
