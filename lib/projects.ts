export type Project = {
  title: string;
  category: string;
  desc: string;
  /** Public URL of the live project. Optional. */
  href?: string;
  /** Screenshot path under /public (e.g. "/projects/name.webp"). Optional. */
  image?: string;
};

/**
 * Real, client-approved projects only. While this list is empty the portfolio
 * section and its navigation link stay hidden.
 */
export const PROJECTS: Project[] = [];
