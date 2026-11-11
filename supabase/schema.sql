-- Cúcuta Deportivo · Pizarra Táctica — Anexo A, FA6–FA8 (cuentas de usuario)
--
-- Ejecutar una sola vez en el SQL Editor de tu proyecto Supabase
-- (https://supabase.com/dashboard/project/_/sql/new), de arriba a abajo.
-- Es idempotente: usa `create or replace` / `if not exists` donde aplica,
-- así que puede volver a ejecutarse sin duplicar nada si algo falla a medio camino.
--
-- Resumen de lo que crea:
--   - public.perfiles           1 fila por usuario (auth.users), rol y estado
--   - public.codigos_invitacion códigos que el club reparte para registrarse ya "activo"
--   - public.intentos_login     historial de accesos (FA8), inmutable desde el cliente
--   - Funciones SECURITY DEFINER para todo lo que el cliente anónimo necesita
--     hacer sin poder leer las tablas directamente (verificar código, resolver
--     usuario→correo, registrar un intento, comprobar bloqueo por fuerza bruta).
--   - Políticas de Row Level Security en las tres tablas.
--   - Un trigger que crea el perfil automáticamente al registrarse.

-- ============================================================
-- 1. TABLAS
-- ============================================================

create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  usuario text not null unique,
  nombre_completo text not null default '',
  rol text not null default 'entrenador' check (rol in ('entrenador', 'invitado')),
  estado text not null default 'pendiente' check (estado in ('activo', 'pendiente', 'bloqueado')),
  creado_en timestamptz not null default now()
);

create table if not exists public.codigos_invitacion (
  codigo text primary key,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.intentos_login (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  usuario_intentado text not null,
  resultado text not null check (resultado in ('exito', 'fallido', 'bloqueado')),
  metodo text not null default 'password' check (metodo in ('password', 'remember_token')),
  dispositivo text,
  user_agent text,
  ip text,
  ciudad text,
  pais text,
  session_id uuid,
  ocurrido_en timestamptz not null default now()
);

create index if not exists intentos_login_usuario_idx on public.intentos_login (lower(usuario_intentado), ocurrido_en desc);
create index if not exists intentos_login_user_id_idx on public.intentos_login (user_id, ocurrido_en desc);

-- ============================================================
-- 2. FUNCIONES (SECURITY DEFINER: se ejecutan con permisos elevados,
--    así el cliente anónimo puede usarlas sin acceso directo a las tablas)
-- ============================================================

create or replace function public.es_entrenador_activo()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol = 'entrenador' and estado = 'activo'
  );
$$;

create or replace function public.verificar_codigo_invitacion(p_codigo text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.codigos_invitacion
    where codigo = p_codigo and activo = true
  );
$$;

-- Resuelve un nombre de usuario a su correo, para permitir "iniciar sesión
-- con usuario o correo" (Supabase Auth solo acepta correo/teléfono). Devuelve
-- NULL si no existe. SOLO la llama la Edge Function `login-usuario` con la
-- service_role: el navegador nunca debe poder ejecutarla, porque revelaría el
-- correo de cualquier entrenador (ver los revoke más abajo).
create or replace function public.resolver_correo_por_usuario(p_usuario text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email::text from auth.users u
  join public.perfiles p on p.id = u.id
  where lower(p.usuario) = lower(p_usuario)
  limit 1;
$$;

-- Para el registro: dice solo si un nombre de usuario está libre, nunca de
-- quién es ni su correo. SECURITY DEFINER porque quien se registra no tiene
-- sesión y el RLS de perfiles le ocultaría las filas de los demás (siempre
-- vería "disponible").
create or replace function public.usuario_disponible(p_usuario text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1 from public.perfiles
    where lower(usuario) = lower(p_usuario)
  );
$$;

-- Cuenta intentos fallidos recientes para el bloqueo temporal (5 en 15 min).
-- Desde Seg1 (2026-11-11) no la usa nadie: el bloqueo lo decide reservar_intento_login.
-- Sin permisos para el navegador; se puede borrar cuando no quede ninguna pizarra antigua.
create or replace function public.verificar_bloqueo_usuario(p_usuario text)
returns table (bloqueado boolean, intentos_recientes int)
language sql
security definer
set search_path = public
stable
as $$
  select
    count(*) filter (where resultado = 'fallido' and ocurrido_en > now() - interval '15 minutes') >= 5,
    count(*) filter (where resultado = 'fallido' and ocurrido_en > now() - interval '15 minutes')::int
  from public.intentos_login
  where lower(usuario_intentado) = lower(p_usuario);
$$;

-- Versión anterior a Seg1: confiaba en el cliente, y cualquiera podía anotar fallidos a
-- nombre de otro. Desde el 2026-11-11 solo escriben en intentos_login reservar_intento_login
-- y cerrar_intento_login, desde la Edge Function; esta queda sin permisos hasta borrarla.
create or replace function public.registrar_intento_login(
  p_usuario_intentado text,
  p_resultado text,
  p_metodo text default 'password',
  p_dispositivo text default null,
  p_user_agent text default null,
  p_ip text default null,
  p_ciudad text default null,
  p_pais text default null,
  p_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  -- La sesión la decide el servidor, desde el JWT ya validado de esta petición;
  -- p_session_id se ignora (se mantiene solo para no romper la firma). En un
  -- intento fallido no hay sesión y queda NULL.
  v_session_id uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  select u.id into v_user_id
  from auth.users u
  left join public.perfiles p on p.id = u.id
  where lower(u.email) = lower(p_usuario_intentado) or lower(p.usuario) = lower(p_usuario_intentado)
  limit 1;

  insert into public.intentos_login
    (user_id, usuario_intentado, resultado, metodo, dispositivo, user_agent, ip, ciudad, pais, session_id)
  values
    (v_user_id, p_usuario_intentado, p_resultado, p_metodo, p_dispositivo, p_user_agent, p_ip, p_ciudad, p_pais, v_session_id);
end;
$$;

-- Seg1 y Seg2 (aplicado el 2026-11-11). Solo las usa la Edge Function `login-usuario`,
-- con la service_role (ver los revoke más abajo). Antes de probar la contraseña:
-- reservar_intento_login dice si hay bloqueo y anota el intento como 'fallido' (si la
-- contraseña es buena, cerrar_intento_login lo pasa a 'exito'). Cuenta por CUENTA
-- (usuario y correo juntos) y solo los fallidos posteriores a su último éxito dentro de
-- los 15 min; lo que no es de ninguna cuenta, por el texto, para que exista o no se
-- comporte igual. El cerrojo pone en fila los intentos simultáneos de la misma cuenta.
create or replace function public.reservar_intento_login(
  p_identificador text,
  p_ip text default null,
  p_user_agent text default null,
  p_dispositivo text default null,
  p_ciudad text default null,
  p_pais text default null
)
returns table (intento_id bigint, esta_bloqueado boolean, correo_cuenta text, estado_cuenta text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := lower(trim(p_identificador));
  v_user_id uuid;
  v_correo text;
  v_estado text;
  v_desde timestamptz := now() - interval '15 minutes';
  v_fallidos int;
  v_bloqueado boolean;
  v_id bigint;
begin
  if coalesce(v_texto, '') = '' then
    raise exception 'identificador vacío';
  end if;

  select u.id, u.email::text, p.estado
    into v_user_id, v_correo, v_estado
  from auth.users u
  join public.perfiles p on p.id = u.id
  where case when strpos(v_texto, '@') > 0 then lower(u.email) = v_texto
             else lower(p.usuario) = v_texto end
  limit 1;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_user_id::text, 'texto:' || v_texto), 0));

  if v_user_id is not null then
    -- Un acceso correcto reinicia el contador.
    select greatest(v_desde, coalesce(max(i.ocurrido_en), '-infinity'::timestamptz))
      into v_desde
    from public.intentos_login i
    where i.user_id = v_user_id and i.resultado = 'exito';

    select count(*) into v_fallidos
    from public.intentos_login i
    where i.user_id = v_user_id and i.resultado = 'fallido' and i.ocurrido_en > v_desde;
  else
    select count(*) into v_fallidos
    from public.intentos_login i
    where i.user_id is null and lower(i.usuario_intentado) = v_texto
      and i.resultado = 'fallido' and i.ocurrido_en > v_desde;
  end if;

  v_bloqueado := v_fallidos >= 5;

  insert into public.intentos_login
    (user_id, usuario_intentado, resultado, metodo, dispositivo, user_agent, ip, ciudad, pais)
  values
    (v_user_id, left(trim(p_identificador), 256),
     case when v_bloqueado then 'bloqueado' else 'fallido' end, 'password',
     left(p_dispositivo, 120), left(p_user_agent, 512), left(p_ip, 64),
     left(p_ciudad, 120), left(p_pais, 120))
  returning id into v_id;

  -- Bloqueada: no se prueba la contraseña, así que el correo no sale de aquí.
  return query select v_id, v_bloqueado,
    case when v_bloqueado then null else v_correo end,
    case when v_bloqueado then null else v_estado end;
end;
$$;

-- Después de probar la contraseña. 'exito': pasa a éxito con su sesión.
-- 'fallido': se queda igual. 'descartado': Auth no contestó; no fue un intento real.
create or replace function public.cerrar_intento_login(
  p_intento_id bigint,
  p_resultado text,
  p_session_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_resultado = 'exito' then
    update public.intentos_login
    set resultado = 'exito', session_id = p_session_id
    where id = p_intento_id and resultado = 'fallido';
  elsif p_resultado = 'descartado' then
    delete from public.intentos_login
    where id = p_intento_id and resultado = 'fallido';
  elsif p_resultado is distinct from 'fallido' then
    raise exception 'resultado no válido: %', p_resultado;
  end if;
end;
$$;

-- Aprobar una cuenta "pendiente" (registrada sin código de invitación válido).
-- Solo un entrenador activo puede llamarla.
create or replace function public.aprobar_usuario(p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_entrenador_activo() then
    raise exception 'Solo un entrenador puede aprobar cuentas.';
  end if;
  update public.perfiles set estado = 'activo' where id = p_usuario_id;
end;
$$;

grant execute on function public.verificar_codigo_invitacion(text) to anon, authenticated;
-- PUBLIC no basta: Supabase también da EXECUTE explícito a anon y authenticated.
revoke execute on function public.resolver_correo_por_usuario(text) from public, anon, authenticated;
grant execute on function public.resolver_correo_por_usuario(text) to service_role;
revoke execute on function public.usuario_disponible(text) from public;
grant execute on function public.usuario_disponible(text) to anon, authenticated;
-- Seg1 (SQL B, 2026-11-11): el navegador ya no consulta bloqueos ni anota intentos.
revoke execute on function public.verificar_bloqueo_usuario(text) from public, anon, authenticated;
revoke execute on function public.registrar_intento_login(text, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.aprobar_usuario(uuid) to authenticated;
grant execute on function public.es_entrenador_activo() to authenticated;
-- Seg1 y Seg2: solo la Edge Function. Supabase da EXECUTE a anon y authenticated en
-- las funciones nuevas, así que hay que quitárselo de forma explícita.
revoke execute on function public.reservar_intento_login(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.cerrar_intento_login(bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.reservar_intento_login(text, text, text, text, text, text) to service_role;
grant execute on function public.cerrar_intento_login(bigint, text, uuid) to service_role;

-- ============================================================
-- 3. TRIGGER: crear el perfil automáticamente al registrarse
-- ============================================================

create or replace function public.manejar_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
  v_codigo_valido boolean := false;
  v_estado text;
  v_es_primero boolean;
begin
  select not exists (select 1 from public.perfiles) into v_es_primero;

  v_codigo := new.raw_user_meta_data ->> 'codigo_invitacion';
  if v_codigo is not null and v_codigo <> '' then
    select public.verificar_codigo_invitacion(v_codigo) into v_codigo_valido;
  end if;

  -- El primer usuario del club siempre queda activo (si no, nadie podría
  -- aprobar cuentas jamás: se necesitaría un entrenador activo para crear
  -- al primer entrenador activo).
  v_estado := case when v_es_primero or v_codigo_valido then 'activo' else 'pendiente' end;

  insert into public.perfiles (id, usuario, nombre_completo, rol, estado)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'usuario', ''), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'nombre_completo', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'rol', ''), 'entrenador'),
    v_estado
  );
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_nuevo_usuario();

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.perfiles enable row level security;
alter table public.codigos_invitacion enable row level security;
alter table public.intentos_login enable row level security;

drop policy if exists "ver_propio_perfil" on public.perfiles;
create policy "ver_propio_perfil" on public.perfiles
  for select using (id = auth.uid());

drop policy if exists "entrenadores_ven_todos_los_perfiles" on public.perfiles;
create policy "entrenadores_ven_todos_los_perfiles" on public.perfiles
  for select using (public.es_entrenador_activo());

drop policy if exists "entrenadores_actualizan_perfiles" on public.perfiles;
create policy "entrenadores_actualizan_perfiles" on public.perfiles
  for update using (public.es_entrenador_activo());

-- codigos_invitacion: sin políticas de lectura directa a propósito — solo se
-- consulta a través de verificar_codigo_invitacion(), que no revela la lista.

drop policy if exists "ver_propios_intentos" on public.intentos_login;
create policy "ver_propios_intentos" on public.intentos_login
  for select using (user_id = auth.uid());

-- Seg4 (2026-11-11): cada cuenta ve solo sus propios intentos (ver_propios_intentos). Se quitó la
-- política que dejaba a los entrenadores activos ver los de todas las cuentas sin saber de quién
-- eran; este drop la borra también en una base creada con una versión anterior de este archivo.
drop policy if exists "entrenadores_ven_todos_los_intentos" on public.intentos_login;

-- ============================================================
-- 5. (Opcional) Purga automática a los 90 días — requiere la extensión
--    pg_cron, habilítala primero en el Dashboard → Database → Extensions.
--    Si no la habilitas, simplemente omite este bloque; nada más depende de él.
-- ============================================================

-- select cron.schedule(
--   'purgar_intentos_login',
--   '0 3 * * *',
--   $$ delete from public.intentos_login where ocurrido_en < now() - interval '90 days'; $$
-- );

-- ============================================================
-- 6. Primer código de invitación de ejemplo (bórralo o cámbialo)
-- ============================================================

insert into public.codigos_invitacion (codigo) values ('CUCUTA-2026')
  on conflict (codigo) do nothing;

-------------------------------------------------------------------
-- ============================================================
-- Pizarra tactica Cucuta Deportivo
-- Esquema: plantilla de jugadores y alineaciones guardadas
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- Categorias del club
-- ------------------------------------------------------------
create table if not exists categorias (
  id          text primary key,          -- 'profesional', 'sub20', ...
  nombre      text not null,             -- 'Profesional', 'Sub-20', ...
  orden       smallint not null default 0
);

-- 'profesional' no se crea por defecto: la pizarra es para las
-- categorias formativas. Se agrega cuando el club la necesite:
--   insert into categorias (id, nombre, orden) values ('profesional', 'Profesional', 1);
insert into categorias (id, nombre, orden) values
  ('sub20',       'Sub-20',      2),
  ('sub17',       'Sub-17',      3),
  ('sub17b',      'Sub-17 B',    4),
  ('sub15',       'Sub-15',      5),
  ('sub13',       'Sub-13',      6)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Plantilla: un registro por jugador y categoria
-- ------------------------------------------------------------
create table if not exists jugadores (
  id                   uuid primary key default gen_random_uuid(),
  categoria_id         text not null references categorias (id),
  dorsal               smallint,
  nombre               text not null default '',
  apellido             text not null,
  posicion_principal   text,
  posicion_secundaria  text,
  foto_path            text,             -- ruta dentro del bucket: 'profesional/7.webp'
  activo               boolean not null default true,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now(),

  constraint jugadores_dorsal_rango
    check (dorsal is null or (dorsal between 1 and 99)),

  constraint jugadores_posiciones_distintas
    check (posicion_secundaria is null
           or posicion_secundaria is distinct from posicion_principal)
);

-- Un dorsal no se repite dentro de la misma categoria entre jugadores activos
create unique index if not exists jugadores_dorsal_categoria_idx
  on jugadores (categoria_id, dorsal)
  where activo and dorsal is not null;

create index if not exists jugadores_categoria_idx
  on jugadores (categoria_id)
  where activo;

-- ------------------------------------------------------------
-- Alineaciones guardadas, compartidas entre dispositivos (S1)
--
-- Una fila por alineacion con TODO su documento en `documento`,
-- que es la fuente de verdad; `nombre` y `formacion` se copian
-- para listar sin descargarlo. La version, la fecha de cambio y
-- los autores los pone el servidor (triggers de mas abajo): la
-- app sube desde la version de la que partio y, si ya no es la
-- del servidor, hay conflicto y su trabajo se guarda como copia.
-- `ultimo_cambio` lo genera la app en cada subida, para reconocer
-- su propio cambio si se perdio la respuesta. Borrar es solo
-- marcar `eliminada_en`: el borrado real, desde el SQL Editor.
-- ------------------------------------------------------------
create table if not exists alineaciones (
  id              uuid primary key default gen_random_uuid(),
  categoria_id    text references categorias (id),   -- opcional
  nombre          text not null,          -- 'Salida ante presion'
  formacion       text,                   -- '4-3-3'
  rival           text,
  fecha_partido   date,
  notas           text,
  creada_por      uuid references auth.users (id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  documento       jsonb not null,
  version         integer not null default 1,
  ultimo_cambio   uuid not null,
  eliminada_en    timestamptz,
  actualizada_por uuid references auth.users (id) on delete set null,

  constraint alineaciones_documento_valido
    check (jsonb_typeof(documento) = 'object' and octet_length(documento::text) <= 1048576)
);

create index if not exists alineaciones_categoria_idx
  on alineaciones (categoria_id, creado_en desc);

create index if not exists alineaciones_actualizado_idx
  on alineaciones (actualizado_en desc);

-- Las antiguas alineacion_jugadores y alineacion_objetos se
-- borraron el 2026-11-09 (S1.14a): estaban vacias, nada dependia
-- de ellas y la alineacion completa va en alineaciones.documento.

-- ------------------------------------------------------------
-- Marca de tiempo automatica
-- ------------------------------------------------------------
create or replace function tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists jugadores_tocar on jugadores;
create trigger jugadores_tocar
  before update on jugadores
  for each row execute function tocar_actualizado_en();

-- Alineaciones: la version, la fecha de cambio y los autores los
-- pone el servidor, nunca la app (S1). Sustituyen al antiguo
-- alineaciones_tocar; tocar_actualizado_en() sigue para jugadores.
create or replace function public.alineacion_al_crear()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := 1;
  new.actualizado_en := now();
  new.creada_por := auth.uid();
  new.actualizada_por := auth.uid();
  return new;
end;
$$;

create or replace function public.alineacion_nueva_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.version := old.version + 1;
  new.actualizado_en := now();
  new.actualizada_por := auth.uid();
  new.creada_por := old.creada_por;
  new.creado_en := old.creado_en;
  return new;
end;
$$;

drop trigger if exists alineaciones_tocar on alineaciones;

drop trigger if exists alineaciones_alta on alineaciones;
create trigger alineaciones_alta
  before insert on alineaciones
  for each row execute function public.alineacion_al_crear();

drop trigger if exists alineaciones_version on alineaciones;
create trigger alineaciones_version
  before update on alineaciones
  for each row execute function public.alineacion_nueva_version();

-- ------------------------------------------------------------
-- Seguridad
--
-- Solo entrenadores con cuenta activa (es_entrenador_activo):
-- tener sesion no basta, porque una cuenta "pendiente" o un
-- "invitado" tambien la tienen. Todos los entrenadores activos
-- comparten plantilla y alineaciones. Si algun dia cada uno debe
-- ver solo lo suyo, estas politicas son el unico sitio a cambiar.
-- ------------------------------------------------------------
alter table categorias            enable row level security;
alter table jugadores             enable row level security;
alter table alineaciones          enable row level security;

drop policy if exists "categorias lectura" on categorias;
create policy "categorias lectura"
  on categorias for select to authenticated
  using ((select public.es_entrenador_activo()));

drop policy if exists "jugadores acceso" on jugadores;
create policy "jugadores acceso"
  on jugadores for all to authenticated
  using ((select public.es_entrenador_activo()))
  with check ((select public.es_entrenador_activo()));

-- Alineaciones: leer, crear y editar si; borrar no (S1). El borrado
-- es solo marcar eliminada_en; el real, desde el SQL Editor.
drop policy if exists "alineaciones acceso" on alineaciones;

drop policy if exists "alineaciones lectura" on alineaciones;
create policy "alineaciones lectura"
  on alineaciones for select to authenticated
  using ((select public.es_entrenador_activo()));

drop policy if exists "alineaciones alta" on alineaciones;
create policy "alineaciones alta"
  on alineaciones for insert to authenticated
  with check ((select public.es_entrenador_activo()));

drop policy if exists "alineaciones edicion" on alineaciones;
create policy "alineaciones edicion"
  on alineaciones for update to authenticated
  using ((select public.es_entrenador_activo()))
  with check ((select public.es_entrenador_activo()));

-- Sin esto, un DELETE desde la app no daria error: solo no borraria nada.
revoke delete, truncate on alineaciones from anon, authenticated;

-- ------------------------------------------------------------
-- Acceso a las fotos del bucket privado 'jugadores'
-- Crear antes el bucket en Storage, sin marcarlo como publico.
--
-- Solo entrenadores con cuenta activa (es_entrenador_activo): tener sesión
-- no basta, porque una cuenta "pendiente" o un "invitado" también la tienen.
-- El `(select ...)` hace que Postgres evalúe la función una vez por consulta,
-- no una vez por fila.
-- ------------------------------------------------------------
drop policy if exists "fotos lectura entrenadores" on storage.objects;
create policy "fotos lectura entrenadores"
  on storage.objects for select to authenticated
  using (bucket_id = 'jugadores' and (select public.es_entrenador_activo()));

drop policy if exists "fotos escritura entrenadores" on storage.objects;
create policy "fotos escritura entrenadores"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'jugadores' and (select public.es_entrenador_activo()));

drop policy if exists "fotos reemplazo entrenadores" on storage.objects;
create policy "fotos reemplazo entrenadores"
  on storage.objects for update to authenticated
  using (bucket_id = 'jugadores' and (select public.es_entrenador_activo()))
  with check (bucket_id = 'jugadores' and (select public.es_entrenador_activo()));

drop policy if exists "fotos borrado entrenadores" on storage.objects;
create policy "fotos borrado entrenadores"
  on storage.objects for delete to authenticated
  using (bucket_id = 'jugadores' and (select public.es_entrenador_activo()));