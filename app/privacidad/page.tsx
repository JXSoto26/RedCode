import type { Metadata } from "next";
import { connection } from "next/server";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Badge } from "@/components/ui/badge";
import {
  PRIVACY_FACTS,
  PRIVACY_PENDING,
  PRIVACY_POLICY,
  PRIVACY_REQUESTS,
  PROSPECT_RETENTION_MONTHS,
  privacyPolicyFinal,
} from "@/lib/privacy";
import { isQuoteSubmissionEnabled } from "@/lib/quote/config";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Cómo ${site.name} trata los datos enviados en el formulario de cotización.`,
  alternates: { canonical: "/privacidad" },
  // The draft is not indexed until the reviewed text is final.
  ...(!privacyPolicyFinal() && { robots: { index: false, follow: true } }),
};

/** Marks a paragraph that depends on something not confirmed yet (draft only). */
function Pending({ id }: { id: string }) {
  const text = PRIVACY_PENDING[id];
  if (!text) return null;
  return (
    <p className="rounded-xl border border-dashed border-amber-400/40 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
      <strong className="font-semibold">Por confirmar:</strong> {text}
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

function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-6">{children}</ul>;
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand-300 underline underline-offset-4">
      {children}
    </a>
  );
}

export default async function PrivacyPage() {
  await connection();
  const final = privacyPolicyFinal();
  const contact = site.contact.email;
  const mail = contact ? (
    <a href={`mailto:${contact}`} className="text-brand-300 underline underline-offset-4">
      {contact}
    </a>
  ) : (
    "el email de contacto del estudio"
  );

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
              cómo funciona el sitio y las reglas internas del estudio, pero aún tiene puntos por confirmar (marcados
              abajo) y no tiene fecha de entrada en vigor. No debe considerarse la política definitiva.
            </div>
          )}

          <p className="mt-8 text-base leading-relaxed text-foreground/85">
            Esta política explica qué datos personales recoge {site.name} a través de este sitio, para qué los usa, con
            quién los comparte, cuánto tiempo los conserva y cómo puedes pedir verlos, corregirlos o eliminarlos. Los
            plazos que aparecen aquí son reglas de funcionamiento del estudio; no sustituyen ni limitan los derechos que
            te reconozca la ley aplicable.
          </p>

          <Section title="1. Quién es el responsable">
            <p>
              {site.name}, estudio de diseño web de {site.owner} en {site.location}. Para cualquier asunto sobre tus
              datos personales, escribe a {mail}.
            </p>
          </Section>

          <Section title="2. Qué datos se recogen">
            <p>
              <strong>Lo que escribes en el formulario de cotización:</strong>
            </p>
            <List>
              <li>Tu nombre, el nombre de tu negocio u organización y tu email.</li>
              <li>Tu número de WhatsApp, si decides indicarlo.</li>
              <li>
                Información del proyecto: tipo de negocio, servicio, objetivo, página actual y mejoras deseadas,
                secciones y funciones, estado de logo, textos y fotos, presupuesto aproximado, fecha deseada y
                comentarios.
              </li>
              <li>Que aceptaste el aviso de uso de datos, con la fecha y la versión del texto aceptado.</li>
            </List>
            <p>
              <strong>Lo que el estudio genera al atender tu solicitud:</strong> notas internas, cambios de estado,
              borradores de cotización, cotizaciones finalizadas (también en PDF), el registro de los emails de
              cotización enviados (destinatario, asunto, texto y si el proveedor aceptó el envío) y si la relación
              comercial sigue abierta o terminó.
            </p>
            <p>
              <strong>Datos técnicos:</strong> para limitar el abuso del formulario se cuentan las solicitudes que llegan
              desde una misma conexión y para un mismo email. La dirección IP y el email no se guardan en claro para
              esto: se guarda una huella (hash) con clave secreta que no permite leerlos, junto con un contador que se
              elimina periódicamente. La verificación anti-spam de Cloudflare Turnstile procesa datos técnicos de tu
              navegador y tu conexión (ver la sección 7). Al visitar el sitio, el proveedor de alojamiento (Vercel)
              registra datos técnicos de cada petición, como la dirección IP, el navegador y la página solicitada, para
              que el sitio funcione y para su seguridad (ver la sección 6).
            </p>
            <p>
              El formulario no permite adjuntar archivos. Si nos envías archivos o información por email o WhatsApp, se
              tratan con las mismas reglas que tu solicitud (sección 5).
            </p>
          </Section>

          <Section title="3. Para qué se usan">
            <List>
              <li>Evaluar tu proyecto, responderte y, si corresponde, prepararte y enviarte una cotización.</li>
              <li>
                Enviarte un email de confirmación de que la solicitud llegó y avisar internamente al estudio de que hay
                una solicitud nueva.
              </li>
              <li>Si contratas, prestar el servicio, el mantenimiento o el soporte acordados.</li>
              <li>Proteger el formulario contra spam y abuso.</li>
              <li>Atender tus solicitudes sobre tus datos.</li>
            </List>
            <p>
              El formulario no te suscribe a ninguna lista de correo. Tus datos no se usan para enviarte publicidad, no se
              venden y no se usan para crear perfiles publicitarios.
            </p>
          </Section>

          <Section title="4. Quién más interviene (proveedores)">
            <p>
              Para funcionar, el sitio usa estos servicios, que tratan los datos para prestar su servicio al estudio.
              Pueden procesar los datos fuera de Puerto Rico, incluido el territorio continental de Estados Unidos.
            </p>
            <List>
              <li>
                <strong>Vercel</strong>: aloja y ejecuta el sitio web. <Ext href="https://vercel.com/legal/privacy-policy">Política de Vercel</Ext>
              </li>
              <li>
                <strong>Supabase</strong>: base de datos de las solicitudes, almacenamiento privado de las cotizaciones en
                PDF y acceso al panel privado. Los datos de producción se alojan en la región us-east-1 (Estados
                Unidos). <Ext href="https://supabase.com/privacy">Política de Supabase</Ext>
              </li>
              <li>
                <strong>Resend</strong>: envío de los emails del sitio (confirmación, aviso interno y cotizaciones).{" "}
                <Ext href="https://resend.com/legal/privacy-policy">Política de Resend</Ext>
              </li>
              <li>
                <strong>Cloudflare Turnstile</strong>: verificación anti-spam del formulario.{" "}
                <Ext href="https://www.cloudflare.com/privacypolicy/">Política de Cloudflare</Ext>
              </li>
              <li>
                <strong>Google (Gmail)</strong>: el buzón del estudio ({contact ?? "email de contacto"}) recibe los
                avisos internos y las respuestas que nos envíes. <Ext href="https://policies.google.com/privacy">Política de Google</Ext>
              </li>
            </List>
            <p>
              Solo se comparten tus datos con otras personas o entidades si tú lo pides, si hace falta para prestar el
              servicio que contrates o si lo exige la ley.
            </p>
          </Section>

          <Section title="5. Cuánto tiempo se conservan">
            <p>
              <strong>Solicitudes que no se convierten en un proyecto.</strong> Se eliminan cuando pasan{" "}
              {PROSPECT_RETENTION_MONTHS} meses sin actividad comercial documentada, en la revisión mensual siguiente.
              Por eso, en la práctica, pueden conservarse hasta un mes más. Cuenta como actividad: que recibamos tu
              solicitud, un cambio de estado, una nota interna, un borrador o una cotización, el envío de una cotización
              y un cambio en la relación comercial. Abrir o consultar la solicitud, los reintentos técnicos y las tareas
              automáticas no cuentan.
            </p>
            <p>
              <strong>Si contratas.</strong> Conservamos los datos necesarios mientras dure el proyecto, el mantenimiento
              o el soporte. Al terminar la relación, revisamos el expediente y eliminamos lo que ya no sea necesario.
            </p>
            <p>
              <strong>Documentos contractuales y contables</strong> (por ejemplo, propuestas aceptadas, contratos o
              facturas): se conservan mientras sean necesarios para cumplir el contrato, atender reclamaciones o
              garantías relacionadas con el servicio, y durante el tiempo que exijan las obligaciones fiscales,
              contables o legales que apliquen al estudio. Al terminar ese plazo se eliminan. Solo se conserva lo que
              esas finalidades requieren, no el resto del expediente.
            </p>
            <p>
              <strong>Excepciones.</strong> No se elimina un expediente mientras exista una obligación legal documentada
              de conservarlo, una reclamación o disputa abierta, o un envío de email cuyo resultado esté pendiente de
              comprobar. En esos casos se conserva solo lo necesario y durante el tiempo necesario.
            </p>
            <p>
              <strong>Qué se elimina.</strong> Al eliminar un expediente se borran del sistema del estudio la solicitud,
              las notas, el historial, los borradores, las cotizaciones, sus PDF y el registro de envíos. Se conserva un
              registro mínimo de la eliminación (un identificador interno aleatorio, la fecha y cuántos elementos se
              borraron, sin nombres, emails ni contenido) para poder repetir la eliminación si alguna vez hubiera que
              restaurar una copia de seguridad.
            </p>
            <p>
              <strong>Emails y archivos fuera del sistema.</strong> Al eliminar un expediente también se buscan en el
              buzón del estudio los emails y archivos adjuntos relacionados y se eliminan los que no haya que conservar
              por las razones anteriores. Gmail mantiene los mensajes eliminados en la papelera hasta 30 días antes de
              borrarlos definitivamente.
            </p>
          </Section>

          <Section title="6. Copias de seguridad y registros de proveedores">
            <p>
              Eliminar un expediente no es instantáneo en todas partes. Durante un tiempo limitado pueden quedar copias
              en sistemas de los proveedores que el estudio no puede borrar de forma selectiva:
            </p>
            <List>
              <li>
                <strong>Copias de seguridad de la base de datos (Supabase):</strong> Supabase hace una copia completa
                diaria que se conserva {PRIVACY_FACTS.supabaseBackupDays} días y luego caduca sola. No se usan para
                consultar datos. Si alguna
                vez hubiera que restaurar una, se volverían a eliminar los expedientes ya borrados antes de volver a usar
                el sistema. Los PDF guardados en el almacenamiento privado no forman parte de esas copias.
              </li>
              <li>
                <strong>Emails enviados por el sitio (Resend):</strong> según su documentación, Resend conserva los datos
                de los emails enviados durante 30 días y sus copias de seguridad durante 7 días más.
              </li>
              <li>
                <strong>Registros técnicos (Vercel y Supabase):</strong> los registros de peticiones al sitio en Vercel,
                que incluyen la dirección IP, se conservan como máximo un día; los registros técnicos de la base de datos
                en Supabase, {PRIVACY_FACTS.supabaseLogDays} días. Caducan solos. Vercel puede tratar además datos técnicos por su cuenta para la seguridad de su
                plataforma, según su propia política de privacidad.
              </li>
            </List>
            <p>
              Los emails que ya recibiste de nosotros, o que tú reenviaste a otras personas, están en buzones que no
              controlamos y no podemos eliminarlos.
            </p>
          </Section>

          <Section title="7. Cookies y verificación anti-spam">
            <p>
              El sitio no usa cookies de analítica ni de publicidad. Las únicas cookies propias son las de sesión del
              panel privado, que solo usa el administrador del estudio.
            </p>
            <p>
              En la página del formulario se carga Cloudflare Turnstile para distinguir personas de programas
              automáticos. Según Cloudflare, procesa la dirección IP, el navegador (User-Agent), una huella técnica de
              la conexión (TLS) y la página donde está el widget. Usa esos datos para detectar y bloquear bots y para
              mejorar ese servicio, no para identificarte, crear perfiles sobre ti ni segmentarte. Con la configuración
              de este sitio, Turnstile no instala la cookie de autorización de Cloudflare (cf_clearance): genera un
              código de un solo uso que el formulario envía con tu solicitud. Cloudflare no publica cuánto tiempo conserva estos datos. Esta verificación es necesaria
              para que el formulario funcione.
            </p>
          </Section>

          <Section title="8. Acceso y protección">
            <p>
              Las solicitudes no son públicas: solo el administrador del estudio puede verlas, desde un panel privado
              que exige iniciar sesión con una cuenta autorizada. Las cotizaciones en PDF se guardan en un
              almacenamiento privado, sin enlaces públicos. La comunicación con el sitio va cifrada (HTTPS). Ninguna
              medida es infalible, pero se aplican las razonables para el tamaño del estudio.
            </p>
          </Section>

          <Section title="9. Tus solicitudes sobre tus datos">
            <p>
              Puedes pedir saber qué datos tuyos tenemos, que se corrijan o que se eliminen, escribiendo a {mail}. No hace
              falta ningún formulario especial.
            </p>
            <List>
              <li>
                Confirmaremos que recibimos tu solicitud en un plazo de {PRIVACY_REQUESTS.acknowledgeBusinessDays} días
                laborables.
              </li>
              <li>
                Antes de entregar o cambiar datos comprobaremos de forma razonable que eres la persona a quien se
                refieren; normalmente basta con que escribas desde el email que usaste en la solicitud. Solo te pediremos
                más información si de verdad hace falta, y no te pediremos documentos de identidad salvo que no haya
                otra forma razonable.
              </li>
              <li>
                Procuraremos resolver en un plazo de {PRIVACY_REQUESTS.resolveCalendarDays} días naturales desde esa
                comprobación. Si la ley aplicable fija un plazo más corto, se respetará ese plazo.
              </li>
              <li>
                Si no podemos atender la solicitud en todo o en parte (por ejemplo, porque hay que conservar un
                documento por una obligación legal), te explicaremos el motivo y qué se conserva.
              </li>
            </List>
            <p>
              Guardamos un registro mínimo de cada solicitud (fecha, tipo, respuesta y fecha de respuesta) para poder
              demostrar que se atendió.
            </p>
          </Section>

          <Section title="10. Cambios en esta política">
            <p>
              Si esta política cambia, se publicará aquí la nueva versión con su fecha. El formulario guarda qué versión
              del aviso de uso de datos aceptaste.
            </p>
            {!final && (
              <p className="rounded-xl border border-dashed border-amber-400/40 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
                <strong className="font-semibold">Por confirmar:</strong> fecha de entrada en vigor (día del
                lanzamiento).
              </p>
            )}
            <Pending id="review" />
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}
