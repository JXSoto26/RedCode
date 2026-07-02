import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/reveal";

interface SectionHeadingProps {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <Reveal
      className={cn(
        "flex flex-col gap-5",
        align === "center" ? "items-center text-center" : "items-start",
        className
      )}
    >
      <Badge>{eyebrow}</Badge>
      <h2
        className={cn(
          "text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl",
          align === "center" && "max-w-3xl"
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cn(
            "text-pretty text-base leading-relaxed text-muted sm:text-lg",
            align === "center" && "max-w-2xl"
          )}
        >
          {description}
        </p>
      )}
    </Reveal>
  );
}
