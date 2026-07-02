import { Code2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600/15 text-brand-500 ring-1 ring-inset ring-brand-600/30">
        <Code2 className="size-5" strokeWidth={2.5} />
      </span>
      <span className="text-lg font-bold tracking-tight">
        <span className="text-brand-500">Red</span>
        <span className="text-foreground">Code</span>
      </span>
    </span>
  );
}
