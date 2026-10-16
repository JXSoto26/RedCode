<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas operativas de RedCode

El flujo completo está en el README (secciones "Supabase DEV", "Pruebas", "Entornos y despliegue" y "Secretos"). Estas reglas son obligatorias para cualquier agente.

## Secretos
- Nunca muestres, registres, copies ni pidas por chat el valor de un secreto (`SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `QUOTE_RATE_LIMIT_SECRET`, tokens de CLI, contraseñas de la base). Para comprobar una variable, informa solo si tiene valor y su prefijo (`sb_secret_`, `re_`…).
- Si un comando puede imprimir secretos, filtra la salida antes de mostrarla.
- Si hace falta una sesión (`npx supabase login`, `npx vercel login`, `gh auth login`), indica el comando al usuario y espera a que la complete. No pidas tokens.
- El repositorio es público: antes de proponer un commit, revisa que no incluya `.env*` (salvo `.env.example`), `supabase/.temp/` ni `.vercel/`.

## Supabase
- La CLI solo puede estar vinculada a `redcode-dev` (`SUPABASE_DEV_PROJECT_REF`). Ejecuta `npm run db:target` antes de cualquier comando contra la base remota. Si falla, detente.
- La cuenta de Supabase contiene proyectos de otros clientes. Nunca vincules, consultes ni modifiques un proyecto que no sea `redcode-dev` sin autorización explícita.
- **Migraciones en DEV:** está autorizado aplicar en `redcode-dev` las migraciones necesarias para la tarea pedida, siguiendo este orden:
  1. Revisa el SQL.
  2. Ejecuta `npm run db:target`.
  3. Ejecuta `npm run db:push:dry` y confirma que solo aparecen las migraciones esperadas.
  4. Ejecuta `npm run db:push`.
  5. Ejecuta `npm run db:status`, `npm run test:dev` y `npm run test:db`.
- **Requieren autorización específica del usuario:**
  - Cambios destructivos: `drop`, `truncate`, `delete` de datos, cambios de tipo con pérdida, retirar RLS o ampliar permisos a `anon` o `authenticated`.
  - `migration repair`. Solo después de comparar el esquema real con el archivo.
  - Cualquier operación contra producción.
- No edites migraciones ya aplicadas; crea una nueva con `npm run db:new -- <nombre>`.
- No uses Docker: no funciona en este equipo. No uses `db diff`, `db dump`, `db pull`, `db reset` ni `supabase start`. Para inspeccionar el esquema usa `npx supabase db query --linked` con consultas de solo lectura al catálogo.

## Panel privado (`/admin`)
- Cada página, lectura y Server Action del panel llama a `requireAdmin()` (`lib/admin/auth.ts`) por su cuenta. No dependas de `proxy.ts`, del layout ni de ocultar componentes para proteger datos.
- El panel usa la clave pública con la sesión del usuario (RLS). Nunca uses `SUPABASE_SECRET_KEY` ni `createSupabaseAdminClient` en `lib/admin/` o `app/admin/`.
- Las escrituras del panel van solo por las funciones `admin_*` de la base. No concedas `insert`, `update` ni `delete` sobre las tablas del panel a `authenticated` ni a `service_role`.
- Nunca añadas administradores, cambies `admin_users` ni crees usuarios reales sin que el usuario lo pida. Los usuarios temporales de las pruebas se crean sin enviar emails y se borran al terminar.
- El código público (`app/api`, `app/cotizar`, `components/quote`, `lib/quote`, `scripts/retry-quote-emails.ts`) no puede referenciar notas, borradores, historial ni `lib/admin`. `tests/admin/privacy.test.ts` lo comprueba. Los `scripts/prod-*.ts` solo nombran esas tablas para comprobar que NO son legibles.
- No añadas eliminación de solicitudes, envío de propuestas, enlaces públicos, pagos ni IA sin que se pida.
- Los importes se manejan en centavos enteros con `lib/admin/money.ts`. Nunca uses coma flotante para dinero.

## Cotizaciones finalizadas y envíos
- Las revisiones (`quotes`, `quote_items`) son inmutables, y sus PDFs en el bucket privado `quote-pdfs` no se sobrescriben ni se borran. No intentes saltarte el trigger ni crees políticas de `update`/`delete` en ese bucket.
- Nunca hagas público el bucket ni crees enlaces públicos o firmados para clientes sin que se pida.
- Solo `confirmSend` (el botón "Confirmar envío") y `reconcileSend` ("Repetir envío con la misma clave") llaman a Resend. Finalizar, abrir pantallas o guardar borradores no puede enviar nada.
- **Pruebas con envío real:** solo a `redcodepr@gmail.com`, sobre solicitudes de prueba, con contenido marcado como PRUEBA. Nunca uses ni modifiques los borradores del usuario para probar.
- Un envío "incierto" nunca se reintenta con una clave nueva. Reconciliar solo con la misma fila y la misma clave, dentro de 23 h; después, solo resolución manual comprobada en el panel de Resend.
- "Aceptado por Resend" no es "entregado". No lo presentes así.
- `pdfmake` y `fontkit` son paquetes externos del servidor (`next.config.ts`). Si cambias cómo se cargan, comprueba que el trazado del build los incluye y que el PDF se genera con `next start`.

## Supabase PROD (`redcode-prod`)
- Nada se escribe ni se consulta en PROD sin que el usuario haya confirmado explícitamente la referencia como PROD y la operación concreta.
- Solo con `npm run prod:db` (workdir `.supabase-prod/`) y `npm run prod:verify`. Nunca cambies el vínculo habitual del repo (`supabase/.temp`) a PROD ni debilites `npm run db:target`.
- Primero el dry run (`migrate` sin `--apply`): muestra al usuario las migraciones exactas y el destino, y espera su confirmación antes de `--apply --confirm=<ref>`.
- Nunca ejecutes `test:dev`, `test:db`, fixtures, usuarios temporales ni scripts de envío contra PROD. `prod:verify` es solo de lectura.
- No copies datos de DEV a PROD.

## Privacidad y conservación
- La política (`lib/privacy.ts`) sigue en `borrador`. No la marques `vigente`, no fijes `effectiveDate` ni vacíes `PRIVACY_PENDING` sin que Jeremy apruebe el texto y confirme cada pendiente.
- `npm run retention` / `retention:prod` solo en modo simulación (`plan`, o `erase --only=<id>` sin `--env`/`--confirm`) salvo orden explícita. **Nunca** ejecutes `execute` ni `erase` real sobre datos reales; en DEV solo sobre fixtures de prueba identificados.
- No programes la revisión mensual (cron, Vercel Cron, pg_cron): es manual.
- La eliminación solo pasa por `private.retention_begin`/`erasure_begin` + `retention_finish` (propietario, CLI). No concedas permisos sobre ellas a ningún rol de la API ni añadas un botón de borrar al panel.
- "Sin actividad" se mide con `last_activity_at`: lecturas, reintentos, envíos fallidos/inciertos, tareas automáticas y la conservación documentada no lo reinician. No cambies eso sin decisión explícita.
- No llames "anonimización" a conservar el id interno ni "eliminación completa" a algo que deja copias (backups, Resend, Gmail, buzones de terceros).

## Turnstile y guardas de entorno
- Production exige Turnstile con claves reales y `TURNSTILE_EXPECTED_HOSTNAMES`; las claves de prueba de Cloudflare solo se usan en pruebas, local y Preview.
- No debilites `lib/deployment.ts` ni la quites de `next.config.ts` / `instrumentation.ts`: Production nunca puede apuntar a DEV, ni Preview o local a otro proyecto que no sea DEV.
- Un fallo de Turnstile no guarda ni envía nada; los reintentos de solicitudes ya guardadas no piden token. Mantén ese orden en `lib/quote/service.ts`.
- No cambies `PRIVACY_POLICY` a `vigente` sin el texto revisado y las decisiones del usuario: es la compuerta de lanzamiento del formulario en Production.

## Pruebas
- `npm test` no usa red. `npm run test:dev` usa Supabase DEV y no envía emails.
- Las pruebas que envían email real solo pueden tener como destinatario `redcodepr@gmail.com`, y `QUOTE_EMAIL_DELIVERY` debe ser `allowlist`.
- Distingue siempre entre email **aceptado** por Resend (`enviado`, o respuesta con `id`) y **entrega confirmada**. La clave de Resend es de solo envío y no permite confirmar la entrega.
- Al terminar, detén los servidores que hayas iniciado (`next dev`) y comprueba que el puerto quedó libre.

## Git, GitHub y Vercel
- No hagas commit, push, merge, ni crees ramas remotas o repositorios sin que el usuario lo pida.
- Vercel ya está conectado al repo: **un push a `master` despliega en Production**. Cualquier otra rama crea un Preview.
- Preview usa Supabase DEV. Production necesita un Supabase PROD independiente. Nunca asignes credenciales de DEV al entorno Production de Vercel.
- No ejecutes `vercel deploy`, `vercel --prod`, `vercel git connect`, `vercel promote` ni cambies variables de Production sin autorización explícita. `vercel redeploy` solo sobre despliegues Preview, cuando el usuario haya pedido actualizar Preview.
- No cambies DNS, nameservers ni registros de correo, ni conectes dominios, sin autorización explícita.
- El equipo `red-code-web-desing` contiene proyectos de otros clientes. Indica siempre `--scope red-code-web-desing` y el proyecto `red-code`, y no toques otros proyectos.
- No ejecutes `vercel link` ni `vercel env pull` en la raíz del repo: escriben `.env.local` y sustituyen la configuración local. Si necesitas un vínculo, crea una carpeta temporal fuera del repo.
