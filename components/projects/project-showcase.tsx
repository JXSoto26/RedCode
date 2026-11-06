import Image from "next/image";
import type { Project } from "@/lib/projects";
import { cn } from "@/lib/utils";

/** Domain shown in the mock browser bar, from the project URL. */
const domainOf = (href?: string) => (href ? new URL(href).host : null);

/**
 * Desktop screenshot in a browser frame with the mobile screenshot in a phone
 * frame overlapping it. Real screenshots only; both images keep their ratio.
 */
export function ProjectShowcase({
  project,
  priority = false,
  className,
}: {
  project: Project;
  priority?: boolean;
  className?: string;
}) {
  const { desktop, mobile } = project.images;
  const domain = domainOf(project.href);

  return (
    <div className={cn("relative pb-10 pr-6 sm:pb-14 sm:pr-12", className)}>
      {/* Browser frame */}
      <figure className="overflow-hidden rounded-xl border border-white/10 bg-surface-2 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2" aria-hidden>
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          {domain && (
            <span className="ml-2 truncate rounded-md bg-white/[0.06] px-2.5 py-0.5 font-mono text-[11px] text-muted-2">
              {domain}
            </span>
          )}
        </div>
        <Image
          src={desktop.src}
          width={desktop.width}
          height={desktop.height}
          alt={desktop.alt}
          priority={priority}
          sizes="(min-width: 1024px) 640px, 100vw"
          className="block h-auto w-full"
        />
      </figure>

      {/* Phone frame */}
      <figure className="absolute bottom-0 right-0 w-[28%] min-w-24 max-w-44 overflow-hidden rounded-[1.4rem] border-[5px] border-[#111114] bg-[#111114] shadow-2xl shadow-black/60 ring-1 ring-white/10">
        <Image
          src={mobile.src}
          width={mobile.width}
          height={mobile.height}
          alt={mobile.alt}
          priority={priority}
          sizes="176px"
          className="block h-auto w-full rounded-[1rem]"
        />
      </figure>
    </div>
  );
}
