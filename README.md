# Sistema de Seguridad para Clínica Veterinaria (Corte 3)

Sistema full-stack para la evaluación de "Base de Datos Avanzadas" utilizando PostgreSQL + Redis + Node.js.

## Stack Tecnológico

- PostgreSQL 16 (roles, RLS, procedimientos almacenados, triggers, funciones, vistas)
- Redis 7 (caché para el listado de vacunación pendiente)
- Node.js 22 + Express + TypeScript en modo estricto
- Frontend en Vanilla HTML/CSS/JS (interfaz enfocada en la evaluación)
- Docker Compose para ejecución local reproducible

## Estructura del Proyecto

- `infra/migrations/00_schema.sql`: esquema base proporcionado por el profesor.
- `backend/01_procedures.sql`: `sp_agendar_cita`
- `backend/02_triggers.sql`: `trg_historial_cita`
- `backend/03_views.sql`: `fn_total_facturado` + `v_mascotas_vacunacion_pendiente`
- `backend/04_roles_y_permisos.sql`: roles y principio de menor privilegio
- `backend/05_rls.sql`: políticas RLS
- `api/`: capa HTTP segura con SQL parametrizado
- `frontend/`: pantallas requeridas para la evaluación
- `docker-compose.yml`: PostgreSQL + Redis + API

## Ejecución

1. Iniciar los servicios:

```bash
docker compose up -d
```

2. Abrir la interfaz en tu navegador:

`http://localhost:3000`

3. Detener los servicios:

```bash
docker compose down
```

## Modelo de Seguridad

### Roles y Permisos

- Roles de PostgreSQL:
  - `role_app_veterinarian`
  - `role_app_reception`
  - `role_app_admin`
- Rol de conexión de la API: `api_user` (NOINHERIT), el cual activa un rol de aplicación por petición usando `SET LOCAL ROLE`.
- Los permisos siguen el principio de menor privilegio:
  - Recepción no puede hacer `SELECT` en `vacunas_aplicadas`.
  - El veterinario solo puede trabajar con las mascotas asignadas a él mediante RLS.
  - El administrador puede manejar todas las tablas del negocio.

### Propagación de Identidad en RLS

Para cada petición, la API establece el contexto de sesión dentro de una transacción:

- `SET LOCAL ROLE role_app_<...>`
- `SELECT set_config('app.current_vet_id', $1, true)` para sesiones de veterinario

Este contexto es consumido por la función `app_current_vet_id()` en `infra/postgres/05_rls.sql`.

### Fortalecimiento contra Inyección SQL

- Todo el código SQL influenciado por el usuario en la API usa parámetros vinculados (placeholders como `$1`, `$2`, ...).
- No se utiliza concatenación de cadenas de texto para armar sentencias SQL con los inputs de los usuarios.
- El input es validado estructuralmente con la librería `zod` antes de cualquier ejecución en la base de datos.

### Fortalecimiento con SECURITY DEFINER

La función del trigger usa `SECURITY DEFINER` para asegurar que las escrituras del historial siempre ocurran, sin importar si el usuario actual tiene permisos en la tabla de destino.
La mitigación contra la inyección en el `search_path` está configurada explícitamente:

- `SET search_path = public, pg_temp`

Implementado en `infra/postgres/02_triggers.sql`.

## Estrategia de Caché con Redis

- Recurso en caché: endpoint del listado de vacunación pendiente.
- Formato de la llave: `vaccination:pending:<scope>:v1`
  - `scope = reception | admin | vet:<id>`
- TTL: `300` segundos (`CACHE_TTL_SECONDS`).
- Invalidación: después de aplicar una vacuna con éxito, se eliminan todas las llaves que coincidan con el patrón `vaccination:pending:*`.
- Registro (Logs) de actividad:
  - `[CACHE MISS] ...`
  - `[CACHE HIT] ...`
  - `[CACHE INVALIDATE] ...`

## Documento de Decisiones de Diseño (Respuestas a la evaluación)

1. **¿Qué política RLS aplicaste a la tabla mascotas? Pega la cláusula exacta y explica con tus palabras qué hace.**

   Cláusula exacta (`infra/postgres/05_rls.sql`):

   ```sql
   CREATE POLICY mascotas_veterinarian_select
   ON mascotas
   FOR SELECT
   TO role_app_veterinarian
   USING (
       EXISTS (
           SELECT 1
           FROM vet_atiende_mascota vam
           WHERE vam.mascota_id = mascotas.id
             AND vam.vet_id = app_current_vet_id()
             AND vam.activa = TRUE
       )
   );
   ```

   Esta política permite que un veterinario solo pueda ver las mascotas que le han sido asignadas de forma activa. Utiliza la función `app_current_vet_id()` para leer la variable de sesión y confirmar su identidad.

2. **Cualquiera que sea la estrategia que elegiste para identificar al veterinario actual en RLS, tiene un vector de ataque posible. ¿Cuál es? ¿Tu sistema lo previene? ¿Cómo?**

   Vector de ataque: Un usuario malicioso podría intentar enviar un `vetId` falso en el cuerpo de la petición (payload) para suplantar a otro veterinario y ver sus pacientes.
   El sistema lo previene obteniendo la identidad del veterinario directamente desde el token criptográfico de la sesión en el servidor, no del texto de la solicitud. Luego, lo asigna con `set_config` y `SET LOCAL ROLE` por transacción (`api/src/db.ts`). De esta forma, el filtrado es ineludible por parte del motor RLS.

3. **Si usas SECURITY DEFINER en algún procedure, ¿qué medida específica tomaste para prevenir la escalada de privilegios que ese modo habilita? Si no lo usas, justifica por qué no era necesario.**

   `SECURITY DEFINER` se utiliza en el trigger de auditoría. Para prevenir que un usuario malicioso engañe al trigger reemplazando objetos o funciones mediante el esquema, se fijó una ruta de búsqueda segura con `SET search_path = public, pg_temp` en la declaración de la función (`infra/postgres/02_triggers.sql:5`).

4. **¿Qué TTL le pusiste al caché Redis y por qué ese valor específico? ¿Qué pasaría si fuera demasiado bajo? ¿Demasiado alto?**

   Se configuró un TTL de `300` segundos (5 minutos). Es el punto ideal para reducir consultas pesadas sin servir datos excesivamente viejos.
   Si fuera demasiado bajo, tendríamos muchos "Cache Miss" y la base de datos se saturaría nuevamente.
   Si fuera demasiado alto, los usuarios podrían ver mascotas en la lista de "pendientes" mucho tiempo después de que ya hayan sido vacunadas (aunque esto se mitigó implementando la invalidación explícita del caché al registrar vacunas).

5. **Tu frontend manda input del usuario al backend. Elige un endpoint crítico y pega la línea exacta donde el backend maneja ese input antes de enviarlo a la base de datos. Explica qué protege esa línea y de qué. Indica archivo y número de línea.**

   Endpoint crítico: Búsqueda de mascotas (`/api/pets/search`).
   Línea exacta (`api/src/server.ts:97`):
   ```typescript
   [`%${parsed.q}%`]
   ```
   Esta línea pasa el input del usuario (ya validado por Zod) como un parámetro vinculado a la base de datos en lugar de concatenar cadenas. Esto protege completamente contra ataques de Inyección SQL, ya que el driver de PostgreSQL (`pg`) tratará el contenido estrictamente como un valor de búsqueda literal para la cláusula `ILIKE`, no como instrucciones ejecutables.

6. **Si revocas todos los permisos del rol de veterinario excepto SELECT en mascotas, ¿qué deja de funcionar en tu sistema? Lista tres operaciones que se romperían.**

   - Agendar citas: Fallaría la ejecución del procedimiento almacenado `sp_agendar_cita` y los inserts a la tabla `citas`.
   - Aplicar vacunas: El veterinario no tendría permisos de escritura (`INSERT`) sobre la tabla `vacunas_aplicadas` ni de actualizar (`UPDATE`) el inventario.
   - Leer el historial de vacunas: No podría hacer consultas a `vacunas_aplicadas` por falta de permisos `SELECT`, rompiendo cualquier vista clínica.

## Notas para la Defensa Oral

- El comportamiento de RLS se puede demostrar rápidamente iniciando sesión como dos veterinarios distintos y presionando "Load All Visible Pets".
- La resistencia a la Inyección SQL se puede mostrar en la búsqueda de mascotas con los ataques documentados en el cuaderno (ej. `' OR '1'='1`).
- El comportamiento del caché en Redis se demuestra llamando al endpoint de vacunación pendiente, aplicando luego una vacuna y repitiendo la consulta para verificar la invalidación.
