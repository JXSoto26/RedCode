import type { Metadata } from "next";
import { connection } from "next/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import { PRIVACY_POLICY, privacyPolicyFinal } from "@/lib/privacy";
import { isQuoteSubmissionEnabled } from "@/lib/quote/config";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Cómo ${site.name} trata los datos enviados en el formulario de cotización.`,
  alternates: { canonical: "/privacidad" },
  // The draft is not indexed until the reviewed text is final.
  ...(!privacyPolicyFinal() && { robots: { index: false, follow: true } }),
};

function Pending({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-dashed border-amber-400/40 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
      <strong className="font-semibold">Pendiente de decisión:</strong> {children}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-foreground/85">{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  await connection();
  const final = privacyPolicyFinal();
  const contact = site.contact.email;

  return (
    <>
      <Navbar quoteEnabled={isQuoteSubmissionEnabled()} />
      <main className="relative pt-28 pb-24 md:pt-36">
        <div className="container-page relative mx-auto max-w-3xl">
          <Badge>Privacidad</Badge>
          <h1 className="mt-5 text-balance text-3xl font-bold tracking-tight sm:text-4xl">Política de privacidad</h1>

          {final ? (
            <p className="mt-4 text-sm text-muted">Vigente desde el {PRIVACY_POLICY.effectiveDate}.</p>
          ) : (
            <div
              role="note"
              className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-400/[0.08] p-5 text-sm leading-relaxed text-amber-100"
            >
              <strong className="font-semibold">Borrador en revisión, todavía no vigente.</strong> Este texto describe
              cómo funciona hoy el sitio, pero faltan decisiones (por ejemplo, cuánto tiempo se conservan los datos).
              No debe considerarse la política definitiva.
            </div>
          )}

          <Section title="Quién trata tus datos">
            <p>
              {site.name}, estudio de diseño web de {site.owner} en {site.location}.
              {contact && (
                <>
                  {" "}
                  Para cualquier consulta sobre tus datos puedes escribir a{" "}
                  <a href={`mailto:${contact}`} className="text-brand-300 underline underline-offset-4">
                    {contact}
                  </a>
                  .
                </>
              )}
            </p>
          </Section>

          <Section title="Qué datos se recogen">
            <p>Cuando envías el formulario de cotización se guardan los datos que escribes en él:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>Tu nombre, el nombre de tu negocio u organización y tu email.</li>
              <li>Tu número de WhatsApp, si decides indicarlo.</li>
              <li>
                Información del proyecto: tipo de negocio, servicio, objetivo, página actual y mejoras deseadas,
                secciones y funciones, estado de logo, textos y fotos, presupuesto aproximado, fecha deseada y
                comentarios.
              </li>
              <li>Que aceptaste el aviso de uso de datos, con la fecha y la versión del texto aceptado.</li>
            </ul>
            <p>
              Para limitar el abuso del formulario se registra cuántas solicitudes llegan desde una misma conexión y
              para un mismo email. No se guardan la dirección IP ni el email en claro para esto: se guardan como una
              huella cifrada (hash) que no permite leerlos, junto con un contador que se elimina periódicamente.
            </p>
            <p>No se piden ni se aceptan archivos adjuntos.</p>
          </Section>

          <Section title="Para qué se usan">
            <ul className="list-disc space-y-1 pl-6">
              <li>Evaluar tu proyecto y responderte.</li>
              <li>Preparar y, si corresponde, enviarte una cotización.</li>
              <li>
                Enviarte un email de confirmación de que la solicitud llegó, y un aviso interno al estudio con los
                datos de la solicitud.
              </li>
            </ul>
            <p>
              El formulario no te suscribe a ninguna lista de correo ni boletín, y estos datos no se usan para enviar
              publicidad.
            </p>
          </Section>

          <Section title="Quién más interviene (proveedores)">
            <p>Para funcionar, el sitio usa estos servicios, que tratan los datos por cuenta del estudio:</p>
            <ul className="list-disc space-y-1 pl-6">
              <li>
                <strong>Vercel</strong>: aloja y ejecuta el sitio web.
              </li>
              <li>
                <strong>Supabase</strong>: base de datos donde se guardan las solicitudes, almacenamiento privado de las
                cotizaciones en PDF y acceso al panel privado.
              </li>
              <li>
                <strong>Resend</strong>: envío de los emails (confirmación, aviso interno y cotizaciones).
              </li>
              <li>
                <strong>Cloudflare Turnstile</strong>: verificación anti-spam del formulario. Para distinguir personas de
                programas automáticos, Cloudflare procesa información técnica de tu navegador y de la conexión.
              </li>
            </ul>
          </Section>

          <Section title="Acceso y protección">
            <p>
              Las solicitudes no son públicas: solo el administrador del estudio puede verlas, desde un panel privado
              que exige iniciar sesión con una cuenta autorizada. Las cotizaciones en PDF se guardan en un
              almacenamiento privado, sin enlaces públicos. La comunicación con el sitio va cifrada (HTTPS).
            </p>
          </Section>

          <Section title="Cookies y tecnologías similares">
            <p>
              El sitio no usa cookies de analítica ni de publicidad. Las únicas cookies propias son las de sesión del
              panel privado, que solo afectan al administrador. En la página del formulario se carga Cloudflare
              Turnstile, que puede leer o guardar información técnica en tu navegador necesaria para la verificación
              anti-spam.
            </p>
          </Section>

          <Section title="Cuánto tiempo se conservan">
            {final ? null : (
              <Pending>
                plazo de conservación de las solicitudes, notas, cotizaciones y registros de envío, y qué ocurre con
                ellos al vencer (eliminación o anonimización).
              </Pending>
            )}
          </Section>

          <Section title="Tus solicitudes sobre tus datos">
            <p>
              Puedes pedir información sobre tus datos, su corrección o su eliminación escribiendo a{" "}
              {contact ? (
                <a href={`mailto:${contact}`} className="text-brand-300 underline underline-offset-4">
                  {contact}
                </a>
              ) : (
                "el email de contacto del estudio"
              )}
              .
            </p>
            {final ? null : (
              <Pending>cómo y en qué plazo se atienden estas solicitudes, y qué datos se conservan tras una eliminación.</Pending>
            )}
          </Section>

          <Section title="Cambios en esta política">
            <p>
              Si esta política cambia, se publicará aquí la nueva versión con su fecha. El formulario guarda qué versión
              del aviso de uso de datos aceptaste.
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}
