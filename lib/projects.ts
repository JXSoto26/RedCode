export type ProjectImage = {
  /** Path under /public. */
  src: string;
  width: number;
  height: number;
  alt: string;
};

export type Project = {
  /** URL segment of the case study: /proyectos/<slug>. */
  slug: string;
  title: string;
  category: string;
  /** One or two sentences for the portfolio section and the page description. */
  desc: string;
  /** Public URL of the live project. */
  href?: string;
  /** Three or four short labels for the portfolio section. */
  highlights: string[];
  /** Real screenshots of the live site (no form data). */
  images: { desktop: ProjectImage; mobile: ProjectImage };
  caseStudy: {
    intro: string;
    goal: string;
    need: string;
    solution: string;
    /** Only features verified on the public site, or confirmed by the client. */
    features: string[];
  };
};

/**
 * Real, client-approved projects only. While this list is empty the portfolio
 * section, its navigation link and the case studies stay hidden.
 */
export const PROJECTS: Project[] = [
  {
    slug: "tabernaculo-de-poder",
    title: "Tabernáculo de Poder",
    category: "Sitio web para iglesia",
    desc: "Sitio web de una iglesia cristiana en Cabo Rojo, Puerto Rico: información de la iglesia, ministerios, eventos, prédicas y un formulario para conectar con quienes la visitan.",
    href: "https://tabernaculodepoder.com",
    highlights: ["Ministerios, eventos y prédicas", "Formulario de conexión", "Panel privado de contenido y contactos", "Adaptado a celulares"],
    images: {
      desktop: {
        src: "/projects/tabernaculo-de-poder/escritorio.webp",
        width: 1440,
        height: 900,
        alt: "Portada del sitio de Tabernáculo de Poder en una computadora: el mensaje “Una iglesia de comunidad para la comunidad” junto a una foto de la congregación.",
      },
      mobile: {
        src: "/projects/tabernaculo-de-poder/movil.webp",
        width: 780,
        height: 1688,
        alt: "Portada del sitio de Tabernáculo de Poder en un celular, con el menú compacto y el mensaje de bienvenida.",
      },
    },
    caseStudy: {
      intro:
        "Tabernáculo de Poder es una iglesia cristiana en Cabo Rojo, Puerto Rico. En RedCode Web Design Studio diseñamos y desarrollamos su sitio web.",
      goal: "Ofrecer a la congregación y a quienes visitan la iglesia por primera vez un lugar claro donde conocerla, saber cuándo y dónde se reúne, y ponerse en contacto.",
      need: "La iglesia necesitaba centralizar su información (servicios, ministerios, eventos y formas de contacto) y poder actualizarla con facilidad.",
      solution:
        "Un sitio a la medida, adaptado a celulares, con una página para cada área de la iglesia y un panel privado desde el que la iglesia gestiona el contenido y los contactos que recibe.",
      features: [
        "Páginas de la iglesia: inicio, nosotros y “Visítanos”, con los horarios de servicio, qué esperar en la primera visita y preguntas frecuentes.",
        "Ministerios con página propia: niños, jóvenes y evangelismo.",
        "Eventos próximos y pasados, cada uno con su página de detalle.",
        "Formulario de conexión para quienes visitan la iglesia y aviso de visita (“Avísanos que vienes”).",
        "Contacto con horarios, cómo llegar y enlace al mapa.",
        "Sección de media para las prédicas, con enlaces a las redes sociales de la iglesia.",
        "Panel privado para gestionar el contenido y los contactos.",
      ],
    },
  },
];

export const projectBySlug = (slug: string) => PROJECTS.find((p) => p.slug === slug) ?? null;
