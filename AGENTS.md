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
- El código público (`app/api`, `app/cotizar`, `components/quote`, `lib/quote`, `scripts`) no puede referenciar notas, borradores, historial ni `lib/admin`. `tests/admin/privacy.test.ts` lo comprueba.
- No añadas eliminación de solicitudes, envío de propuestas, enlaces públicos, pagos ni IA sin que se pida.
- Los importes se manejan en centavos enteros con `lib/admin/money.ts`. Nunca uses coma flotante para dinero.

## Pruebas
- `npm test` no usa red. `npm run test:dev` usa Supabase DEV y no envía emails.
- Las pruebas que envían email real solo pueden tener como destinatario `redcodepr@gmail.com`, y `QUOTE_EMAIL_DELIVERY` debe ser `allowlist`.
- Distingue siempre entre email **aceptado** por Resend (`enviado`, o respuesta con `id`) y **entrega confirmada**. La clave de Resend es de solo envío y no permite confirmar la entrega.
- Al terminar, detén los servidores que hayas iniciado (`next dev`) y comprueba que el puerto quedó libre.

## Git, GitHub y Vercel
- No hagas commit, push, merge, ni crees ramas remotas o repositorios sin que el usuario lo pida.
- Vercel ya está conectado al repo: **un push a `master` despliega en Production**. Cualquier otra rama crea un Preview.
- Preview usa Supabase DEV. Production necesita un Supabase PROD independiente. Nunca asignes credenciales de DEV al entorno Production de Vercel.
- No ejecutes `vercel deploy`, `vercel --prod`, `vercel git connect` ni cambies variables de Production sin autorización explícita.
- El equipo `red-code-web-desing` contiene proyectos de otros clientes. Indica siempre `--scope red-code-web-desing` y el proyecto `red-code`, y no toques otros proyectos.
- No ejecutes `vercel link` ni `vercel env pull` en la raíz del repo: escriben `.env.local` y sustituyen la configuración local. Si necesitas un vínculo, crea una carpeta temporal fuera del repo.
