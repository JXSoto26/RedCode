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
| `SUPABASE_PUBLISHABLE_KEY` | Para el panel | Clave pública (`sb_publishable_…`). El panel `/admin` la usa en el servidor con la sesión del administrador, así que RLS se aplica. También la usa `test:dev` |
| `SUPABASE_DEV_PROJECT_REF` | Solo `test:dev` y `db:*` | Ref del proyecto DEV, para que las pruebas y migraciones no toquen otro proyecto |

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

La migración inicial crea `quote_requests` y `quote_rate_limits` con RLS activado y todos los permisos revocados para `anon` y `authenticated`. La clave pública sin sesión no puede leer, crear ni modificar solicitudes. No existe ningún endpoint público para consultar una solicitud, ni siquiera por su referencia. La migración del panel (`*_admin_panel.sql`) añade lectura solo para los administradores; ver "Panel privado".

### Panel privado (`/admin`)

| Ruta | Qué hace |
| --- | --- |
| `/admin/login` | Entrada con email y contraseña (Supabase Auth). No hay registro público |
| `/admin/solicitudes` | Bandeja: referencia, negocio, contacto, servicio, fecha y estado. Más recientes primero, búsqueda por referencia, negocio o contacto, filtro por estado y paginación de 20 en 20 en el servidor |
| `/admin/solicitudes/[id]` | Detalle: toda la información enviada, estado de los dos emails, cambio de estado con historial, notas internas, enlaces de email y WhatsApp, y el borrador de cotización |
| `/admin/solicitudes/[id]/cotizacion` | Vista previa privada e imprimible del borrador (Imprimir → Guardar como PDF) |

**Acceso:**

- Iniciar sesión no basta: la cuenta debe estar en la tabla `admin_users`. Esa tabla solo se modifica con SQL; ninguna clave de la app ni de la API puede añadir administradores.
- Cada página, cada lectura y cada Server Action comprueban la sesión (`getClaims`) y el permiso de administrador (`lib/admin/auth.ts`). `proxy.ts` solo refresca la sesión y redirige al login a quien no tiene sesión; no autoriza nada.
- El panel consulta Supabase con la clave pública **y la sesión del administrador**, así que RLS se aplica también aquí. La clave secreta no se usa en el panel.
- Las cookies de sesión son `HttpOnly`, `SameSite=Lax`, `Secure` en producción y solo se envían a `/admin`.
- Tablas nuevas: `admin_users`, `quote_status_history`, `quote_notes`, `quote_drafts` y `quote_draft_items`. Tienen RLS: solo los administradores pueden leerlas. Las escrituras pasan por las funciones `admin_set_quote_status`, `admin_add_quote_note` y `admin_save_quote_draft`, que comprueban el permiso y son atómicas. `anon` no tiene acceso, y `service_role` (la clave del formulario público) tampoco puede leer notas ni borradores.

**Crear el administrador (una vez por proyecto):**

1. En Supabase → **Authentication → Users → Add user → Create new user**, escribe tu email y una contraseña, y marca **Auto Confirm User**. Así no se envía ningún email.
2. En **Authentication → Sign In / Providers**, desactiva **Allow new users to sign up**. Aunque alguien se registrara, no tendría acceso, pero así no se crean cuentas.
3. Autoriza la cuenta con SQL. En el editor SQL, o con `npx supabase db query --linked` después de `npm run db:target`:
   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'tu-email@ejemplo.com';
   ```
4. Entra en `/admin/login`. Para quitar el acceso: `delete from public.admin_users where user_id = '<id>';`.

**Seguimiento:**

- **Estados:** `nueva` → `por_aclarar` → `propuesta_enviada` → `aceptada` / `cerrada`. Cambiar el estado guarda el cambio, la fecha y el administrador en el historial, en la misma transacción. **No envía ningún email.** Si otra pestaña cambió el estado antes, el cambio se rechaza.
- **Notas internas:** se añaden desde el detalle, con fecha y autor. Nunca aparecen en la respuesta del formulario ni en los emails. La columna antigua `quote_requests.internal_notes` ya no se edita desde el panel; si tiene contenido, el detalle la muestra como "Nota anterior".
- **Emails:** `enviado` aparece como "Aceptado por Resend": Resend lo aceptó, pero la entrega no está confirmada. `omitido` indica el motivo (por ejemplo, destinatario fuera de la lista autorizada).

**Borrador de cotización:**

- Un borrador por solicitud, con título, resumen y alcance, entregables, exclusiones, partidas (descripción, cantidad y precio unitario en USD), y de forma opcional tiempo estimado, condiciones y vigencia.
- No se precarga nada: ni precios, ni impuestos, ni depósitos, ni plazos, ni condiciones.
- Se puede guardar incompleto. El detalle lista lo que falta, y la vista previa lo marca como "Pendiente".
- **Importes:** se guardan en centavos enteros (cantidades con hasta 2 decimales) y el total se calcula en el servidor sin coma flotante (`lib/admin/money.ts`), redondeando cada línea al centavo. Si hay partidas sin cantidad o precio, el total se marca como parcial.
- **Dos pestañas:** cada guardado indica la versión de la que parte. Si otra pestaña guardó antes, el guardado se rechaza y avisa, en lugar de sobrescribir.
- Guardar un borrador **no** cambia el estado ni envía nada. Esta fase no incluye envío de propuestas, enlaces públicos, PDF generado en el servidor, aceptación electrónica ni pagos.
- No existe forma de borrar solicitudes desde el panel ni desde la API.

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
  También prueban el panel: acceso sin sesión y sin permiso en cada action y lectura, validación, conflictos de estado y de borrador, cálculo de importes, privacidad de notas y reglas estáticas de la migración.
- `npm run test:dev`: pruebas **reales contra Supabase DEV** a través de la API:
  - La clave pública no puede acceder a nada.
  - El servidor guarda una sola solicitud por clave de idempotencia.
  - Un usuario con sesión pero sin permiso de administrador no ve filas ni puede escribir. Se crea un usuario temporal, sin enviar ningún email, y se borra al terminar.
  - La clave secreta no puede leer notas ni borradores.

  No se ejecutan si `SUPABASE_URL` no coincide con `SUPABASE_DEV_PROJECT_REF`. Dejan filas marcadas como "Prueba automatizada" en DEV y no envían emails.
- `npm run test:db`: ejecuta [supabase/tests/admin_access.sql](supabase/tests/admin_access.sql) contra DEV con los roles reales (`anon`, usuario sin permiso, administrador y `service_role`). Cubre los permisos, el cambio de estado con historial atómico, el conflicto entre pestañas, las notas y los borradores. Todo ocurre dentro de una transacción que se revierte, así que no deja datos.
- **Formulario completo (manual):** con `npm run dev`, envía una solicitud desde `/cotizar` usando como email del visitante una dirección de `QUOTE_EMAIL_ALLOWLIST`. Comprueba en `quote_requests` que la fila existe con `status = nueva` y los dos `*_email_status = enviado`. `enviado` significa que Resend **aceptó** el email, no que se haya entregado; la entrega se confirma en el panel de Resend (**Emails**) o en el buzón.

Orden recomendado antes de subir cambios: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y, si hubo cambios en la base, en `lib/quote/` o en `lib/admin/`, `npm run db:status`, `npm run test:dev` y `npm run test:db`.

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
- `SUPABASE_PUBLISHABLE_KEY` se configura en Vercel para el panel (la de DEV solo en Preview). `SUPABASE_DEV_PROJECT_REF` solo sirve para las pruebas y los scripts `db:*`; no se configura en Vercel.
- Los administradores son por proyecto de Supabase: el de DEV no existe en PROD. Cuando exista PROD, habrá que crear allí su propio administrador.
- Cambiar variables en Vercel no redespliega solo: hay que volver a desplegar para que la portada (estática) las lea.
- Las migraciones de la base PROD se aplicarán con un vínculo y un procedimiento propios, que todavía no existen. Ningún script `db:*` funciona contra un proyecto que no sea `SUPABASE_DEV_PROJECT_REF`.

## Secretos

- Los secretos viven solo en `.env.local` (ignorado por git) y en las variables de entorno de Vercel. Nunca en el código, en `lib/site.ts`, en `.env.example`, en commits, en issues ni en mensajes de chat.
- El repositorio es **público**: revisa `git diff --cached` antes de cada commit.
- Ninguna variable usa `NEXT_PUBLIC_`; si una variable nueva lo necesitara, no puede ser un secreto.
- `SUPABASE_SECRET_KEY` ignora RLS: solo se usa en el servidor, para el formulario público. El panel nunca la usa.
- Las contraseñas de administrador solo se escriben en el panel de Supabase y en `/admin/login`. Nunca en código, variables ni chat.
- `RESEND_API_KEY` debe ser de tipo "Sending access". Con ese tipo no se puede consultar el estado de entrega por la API; se revisa en el panel de Resend.
- Las sesiones de las CLI (`supabase login`, `vercel login`) se inician en el navegador y se guardan en el equipo. Los tokens no se pegan en ningún sitio.
- Los registros de la app guardan solo referencias y códigos de error, nunca datos personales ni mensajes del proveedor.
- Si un secreto se filtra, rótalo en el panel del servicio y actualízalo en `.env.local` y en Vercel.

### Pendiente antes de publicar

- Política de privacidad. El formulario pide autorización para usar los datos (`CONSENT_TEXT` y `CONSENT_VERSION` en `lib/quote/options.ts`; si cambias el texto, cambia también la versión), pero no enlaza a ninguna política porque todavía no existe.
- Proyecto Supabase PROD independiente, con las migraciones aplicadas, registro público desactivado, su propio administrador y sus variables solo en el entorno Production de Vercel.
- Dominio verificado en Resend y `QUOTE_EMAIL_DELIVERY=all` en producción.
