# RedCode Web Design Studio

Sitio web de RedCode Web Design Studio, estudio independiente de diseño web en Puerto Rico. Hecho con Next.js 16, React 19, Tailwind CSS v4 y `motion`.

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test             # pruebas locales (sin red, sin Supabase ni email reales)
npm run test:dev     # pruebas reales contra Supabase DEV
npm run db:status    # migraciones locales vs. Supabase DEV
npm run build
npm run start        # sirve el build de producción
```

## Datos públicos pendientes

Hay contenido que se muestra solo cuando sus datos están configurados, para que la página nunca publique enlaces de relleno:

| Dato | Archivo | Qué activa |
| --- | --- | --- |
| `contact.email`, `contact.whatsapp` | `lib/site.ts` | Sección de contacto y enlace "Contacto" |
| `socials` | `lib/site.ts` | Enlaces a redes en el footer |
| `url` (dominio) | `lib/site.ts` | `metadataBase`, URL canónica, Open Graph, sitemap y referencia al sitemap en `robots.txt` |
| `PROJECTS` | `lib/projects.ts` | Sección de portafolio y su enlace en la navegación |

El número de WhatsApp va en formato internacional, solo dígitos (por ejemplo `1787XXXXXXX`). Las capturas de proyectos van en `public/projects/`.

`lib/site.ts` solo contiene datos públicos. Los secretos van en variables de entorno del servidor (ver abajo).

## Solicitudes de cotización (`/cotizar`)

Formulario guiado de tres pasos más un resumen editable. Las solicitudes se guardan en Supabase y generan dos emails: una confirmación al visitante y un aviso interno. No calcula precios ni envía propuestas.

**Flujo:** `components/quote/quote-form.tsx` → `POST /api/quote-requests` (`app/api/quote-requests/route.ts`) → `lib/quote/service.ts`. La validación (`lib/quote/schema.ts`) se comparte entre el cliente y el servidor; el servidor es la fuente de verdad.

Sin configuración, `/cotizar` muestra que el envío no está disponible, el botón de enviar queda desactivado y los botones "Solicita una cotización" del sitio no llevan al formulario.

### Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores. Ninguna variable usa el prefijo `NEXT_PUBLIC_`: todas se leen solo en el servidor. Nunca hagas commit de `.env.local`.

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `SUPABASE_URL` | Sí | URL del proyecto (`https://<ref>.supabase.co`) |
| `SUPABASE_SECRET_KEY` | Sí | Clave secreta (`sb_secret_…`) o `service_role`. Ignora RLS: solo para el servidor |
| `QUOTE_RATE_LIMIT_SECRET` | Sí | Cadena aleatoria para cifrar (hash) las IP y los emails en los límites de envío |
| `RESEND_API_KEY` | Para email | Clave de Resend |
| `QUOTE_EMAIL_FROM` | Para email | Remitente con dominio verificado en Resend |
| `QUOTE_NOTIFY_EMAIL` | Para email | Destinatario interno de los avisos |
| `QUOTE_EMAIL_REPLY_TO` | No | Reply-To de la confirmación al visitante |
| `QUOTE_EMAIL_ALLOWLIST` | En DEV | Destinatarios autorizados, separados por comas |
| `QUOTE_EMAIL_DELIVERY` | No | `allowlist` (predeterminado) o `all` (solo en producción) |
| `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_PUBLISHABLE_KEY` | Solo `test:dev` | Pruebas reales contra DEV |

Las páginas leen `isQuoteSubmissionEnabled()`. La portada se genera de forma estática, así que después de cambiar las variables hay que volver a hacer `build`.

### Supabase DEV

El proyecto de desarrollo es **`redcode-dev`** (ref `namtdzqeachgaldlbpmf`). La CLI de Supabase está fijada como dependencia de desarrollo (`supabase` en `package.json`), así que se usa con `npx supabase`. No hace falta Docker: ningún comando de este flujo lo usa.

**Configuración inicial** (una vez por equipo):

1. Completa `.env.local` con los datos de `redcode-dev` (ver la tabla de variables).
2. `npx supabase login`: abre el navegador y guarda la sesión en el equipo. No se copia ningún token.
3. `npx supabase link --project-ref namtdzqeachgaldlbpmf`. El vínculo se guarda en `supabase/.temp/`, que no se sube al repo.
4. `npm run db:target`: confirma que la CLI está vinculada a DEV.

**Verificar el proyecto vinculado:** `npm run db:target` falla si la CLI está vinculada a otro proyecto que no sea `SUPABASE_DEV_PROJECT_REF`, o si `SUPABASE_URL` apunta a otro sitio. Todos los scripts `db:*` que tocan la base remota lo ejecutan antes. Ojo: la cuenta de Supabase tiene proyectos de otros clientes; `npx supabase projects list` muestra cuál está vinculado (`linked: true`).

**Migraciones:**

| Paso | Comando |
| --- | --- |
| Crear | `npm run db:new -- <nombre>`. Crea `supabase/migrations/<fecha>_<nombre>.sql`; escribe el SQL ahí |
| Ver el estado | `npm run db:status`. Compara el historial local con el remoto |
| Revisar qué se aplicaría | `npm run db:push:dry`. No ejecuta nada |
| Aplicar en DEV | `npm run db:push`. Pide confirmación antes de ejecutar |

- Nunca edites una migración que ya está aplicada: crea una nueva.
- Revisa el SQL antes de aplicarlo, sobre todo `drop`, `truncate`, `delete`, `alter … type` y cambios en `grant`/`revoke` o RLS.
- Toda tabla nueva en `public` debe activar RLS y revocar permisos a `anon` y `authenticated`, salvo que se decida lo contrario de forma explícita. `tests/quote/migration.test.ts` comprueba esto para las tablas actuales.
- Para comparar el esquema real con una migración sin Docker, consulta el catálogo con `npx supabase db query --linked "<sql>"` (por ejemplo `pg_get_constraintdef`, `pg_get_functiondef`, `relacl`). Es solo lectura.
- Si alguien aplicó una migración a mano (por ejemplo desde el editor SQL), compara primero el esquema real con el archivo y, solo si coincide, regístrala con `npx supabase migration repair <versión> --status applied --linked`. Así se hizo con la migración inicial `20261014120000`.
- La conexión directa a la base a veces da `Connection timed out` o `Connection terminated unexpectedly`. Es un fallo de red: vuelve a ejecutar el comando y confirma el resultado con `npm run db:status`.

La migración crea `quote_requests` y `quote_rate_limits` con RLS activado, **sin políticas** y con todos los permisos revocados para `anon` y `authenticated`. La clave pública no puede leer, crear ni modificar solicitudes; solo el servidor, con la clave secreta. No existe ningún endpoint para consultar una solicitud, ni siquiera por su referencia.

### Seguimiento

Las solicitudes se gestionan desde el Table Editor de Supabase, en la tabla `quote_requests`:

- `status`: `nueva` → `por_aclarar` → `propuesta_enviada` → `aceptada` / `cerrada`.
- `internal_notes`: notas propias.
- `visitor_email_*` y `owner_email_*`: estado de cada email (`pendiente`, `enviado`, `fallido` u `omitido`), número de intentos y último código de error. Nunca se guarda el mensaje completo del proveedor.

### Email (Resend)

- La solicitud **se guarda primero**. Si un email falla, la solicitud sigue siendo válida, el fallo queda registrado en la fila y el visitante ve un mensaje honesto, sin que se le pida reenviar.
- **Entrega restringida por defecto:** solo reciben email las direcciones de `QUOTE_EMAIL_ALLOWLIST`, y con la lista vacía no se envía nada. En producción, configura `QUOTE_EMAIL_DELIVERY=all`.
- **Reintentos:** `npm run quote:retry-emails` reenvía los emails `pendiente` o `fallido`. Para reenviar también los `omitido` (por ejemplo, después de configurar el email), usa `npm run quote:retry-emails -- --include-omitted`. Cada email lleva una clave de idempotencia de Resend, así que un reintento no envía dos veces el mismo mensaje.
- Mientras no haya un dominio verificado, Resend solo permite el remitente de prueba `onboarding@resend.dev`, que entrega únicamente a la dirección de la cuenta de Resend.

### Protección contra spam y duplicados

- **Campo trampa (honeypot)** oculto, más una espera mínima de 3 segundos entre que se carga el formulario y se envía.
- **Límites de envío compartidos en Supabase** (funcionan en serverless): 5 solicitudes por hora por IP y 3 por día por email. Las IP y los emails se guardan como hash HMAC, nunca en claro.
- **Idempotencia:** cada envío lleva una clave única. Un reintento o un doble clic devuelve la misma referencia sin crear otra solicitud ni reenviar emails. Si el visitante cambia los datos después de un fallo, el formulario genera una clave nueva.
- **Otras protecciones:** solo se aceptan peticiones del mismo origen, en JSON y de hasta 32 KB. No se aceptan archivos adjuntos.
- **Turnstile:** pendiente de decidir; no está implementado.

### Pruebas

- `npm test`: pruebas locales de validación, idempotencia, doble clic, spam, límites de envío, fallos de persistencia y de email, endpoint, migración (RLS y permisos) y flujo del formulario. Usan dobles de prueba; no se conectan a ningún servicio.
- `npm run test:dev`: pruebas **reales contra Supabase DEV**. Comprueban que la clave pública no puede acceder a nada y que el servidor guarda una sola solicitud por clave de idempotencia. No se ejecutan si `SUPABASE_URL` no coincide con `SUPABASE_DEV_PROJECT_REF`. Dejan filas marcadas como "Prueba automatizada" en DEV y no envían emails.
- **Formulario completo (manual):** con `npm run dev`, envía una solicitud desde `/cotizar` usando como email del visitante una dirección de `QUOTE_EMAIL_ALLOWLIST`. Comprueba en `quote_requests` que la fila existe con `status = nueva` y los dos `*_email_status = enviado`. `enviado` significa que Resend **aceptó** el email, no que se haya entregado; la entrega se confirma en el panel de Resend (**Emails**) o en el buzón.

Orden recomendado antes de subir cambios: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y, si hubo cambios en la base o en `lib/quote/`, `npm run db:status` y `npm run test:dev`.

## Entornos y despliegue

| Entorno | Dónde corre | Supabase | Email |
| --- | --- | --- | --- |
| **Local (DEV)** | `npm run dev`, con `.env.local` | `redcode-dev` | Resend, solo a `QUOTE_EMAIL_ALLOWLIST` |
| **Preview** | Vercel, ramas distintas de `master` | `redcode-dev` | Resend, solo a `QUOTE_EMAIL_ALLOWLIST` |
| **Production** | Vercel, rama `master` | Un proyecto **PROD independiente** (pendiente de crear) | Dominio verificado y `QUOTE_EMAIL_DELIVERY=all` |

- **Repositorio:** `github.com/JXSoto26/RedCode` (público), rama principal `master`.
- **Vercel:** el proyecto `red-code` (equipo `red-code-web-desing`) ya está conectado al repositorio. **Un push a `master` despliega en Production** (`red-code-brown.vercel.app`) y un push a cualquier otra rama crea un despliegue Preview. Trabaja en ramas y fusiona a `master` solo lo que deba publicarse.
- **Variables en Vercel:** se configuran por entorno (Settings → Environment Variables). Preview usa las de `redcode-dev`. Las credenciales de DEV **nunca** se asignan a Production. Mientras Production no tenga sus propias variables de Supabase, `/cotizar` aparece como "no disponible", que es el comportamiento seguro.
- Los despliegues Preview tienen la protección estándar de Vercel: para abrirlos hay que iniciar sesión en Vercel con una cuenta del equipo.
- El equipo de Vercel también contiene proyectos de otros clientes. Usa siempre `--scope red-code-web-desing` y el proyecto `red-code` de forma explícita.
- `SUPABASE_DEV_PROJECT_REF` y `SUPABASE_PUBLISHABLE_KEY` solo sirven para `test:dev`; no se configuran en Vercel.
- Cambiar variables en Vercel no redespliega solo: hay que volver a desplegar para que la portada (estática) las lea.
- Las migraciones de la base PROD se aplicarán con un vínculo y un procedimiento propios, que todavía no existen. Ningún script `db:*` funciona contra un proyecto que no sea `SUPABASE_DEV_PROJECT_REF`.

## Secretos

- Los secretos viven solo en `.env.local` (ignorado por git) y en las variables de entorno de Vercel. Nunca en el código, en `lib/site.ts`, en `.env.example`, en commits, en issues ni en mensajes de chat.
- El repositorio es **público**: revisa `git diff --cached` antes de cada commit.
- Ninguna variable usa `NEXT_PUBLIC_`; si una variable nueva lo necesitara, no puede ser un secreto.
- `SUPABASE_SECRET_KEY` ignora RLS: solo se usa en el servidor.
- `RESEND_API_KEY` debe ser de tipo "Sending access". Con ese tipo no se puede consultar el estado de entrega por la API; se revisa en el panel de Resend.
- Las sesiones de las CLI (`supabase login`, `vercel login`) se inician en el navegador y se guardan en el equipo. Los tokens no se pegan en ningún sitio.
- Los registros de la app guardan solo referencias y códigos de error, nunca datos personales ni mensajes del proveedor.
- Si un secreto se filtra, rótalo en el panel del servicio y actualízalo en `.env.local` y en Vercel.

### Pendiente antes de publicar

- Política de privacidad. El formulario pide autorización para usar los datos (`CONSENT_TEXT` y `CONSENT_VERSION` en `lib/quote/options.ts`; si cambias el texto, cambia también la versión), pero no enlaza a ninguna política porque todavía no existe.
- Proyecto Supabase PROD independiente, con la migración aplicada, y sus variables solo en el entorno Production de Vercel.
- Dominio verificado en Resend y `QUOTE_EMAIL_DELIVERY=all` en producción.
