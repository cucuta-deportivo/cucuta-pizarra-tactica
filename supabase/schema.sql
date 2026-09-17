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
-- NULL si no existe: el código que llama a esto nunca debe mostrar esa
-- diferencia al usuario final (mensaje de error siempre genérico).
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

-- Cuenta intentos fallidos recientes para el bloqueo temporal (5 en 15 min).
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

-- Único punto de escritura en intentos_login: el cliente nunca inserta
-- directamente (evita que alguien manipule o borre su propio historial).
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
begin
  select u.id into v_user_id
  from auth.users u
  left join public.perfiles p on p.id = u.id
  where lower(u.email) = lower(p_usuario_intentado) or lower(p.usuario) = lower(p_usuario_intentado)
  limit 1;

  insert into public.intentos_login
    (user_id, usuario_intentado, resultado, metodo, dispositivo, user_agent, ip, ciudad, pais, session_id)
  values
    (v_user_id, p_usuario_intentado, p_resultado, p_metodo, p_dispositivo, p_user_agent, p_ip, p_ciudad, p_pais, p_session_id);
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
grant execute on function public.resolver_correo_por_usuario(text) to anon, authenticated;
grant execute on function public.verificar_bloqueo_usuario(text) to anon, authenticated;
grant execute on function public.registrar_intento_login(text, text, text, text, text, text, text, text, uuid) to anon, authenticated;
grant execute on function public.aprobar_usuario(uuid) to authenticated;
grant execute on function public.es_entrenador_activo() to authenticated;

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

drop policy if exists "entrenadores_ven_todos_los_intentos" on public.intentos_login;
create policy "entrenadores_ven_todos_los_intentos" on public.intentos_login
  for select using (public.es_entrenador_activo());

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

insert into categorias (id, nombre, orden) values
  ('profesional', 'Profesional', 1),
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
-- Alineaciones guardadas
-- ------------------------------------------------------------
create table if not exists alineaciones (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   text not null references categorias (id),
  nombre         text not null,          -- 'Salida ante presion'
  formacion      text,                   -- '4-3-3'
  rival          text,
  fecha_partido  date,
  notas          text,
  creada_por     uuid references auth.users (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists alineaciones_categoria_idx
  on alineaciones (categoria_id, creado_en desc);

-- ------------------------------------------------------------
-- Fichas dentro de una alineacion
--
-- Guardan copia de dorsal y apellido: si manana se edita la
-- plantilla, la alineacion vieja conserva lo que se jugo ese dia.
-- jugador_id es opcional: permite escribir un nombre suelto que
-- no este en la plantilla, y en ese caso la ficha no lleva foto.
-- ------------------------------------------------------------
create table if not exists alineacion_jugadores (
  id                   uuid primary key default gen_random_uuid(),
  alineacion_id        uuid not null references alineaciones (id) on delete cascade,
  jugador_id           uuid references jugadores (id) on delete set null,
  dorsal               smallint,
  apellido             text not null,
  posicion_principal   text,
  posicion_secundaria  text,
  foto_path            text,             -- copia, para que el historico no se rompa
  pos_x                numeric(5,2) not null,   -- 0 a 100
  pos_y                numeric(5,2) not null,   -- 0 a 100
  es_suplente          boolean not null default false,
  orden                smallint not null default 0,

  constraint alineacion_jugadores_x_rango check (pos_x between 0 and 100),
  constraint alineacion_jugadores_y_rango check (pos_y between 0 and 100)
);

create index if not exists alineacion_jugadores_alineacion_idx
  on alineacion_jugadores (alineacion_id);

-- ------------------------------------------------------------
-- Objetos dibujados sobre el campo (conos, vallas, flechas...)
-- ------------------------------------------------------------
create table if not exists alineacion_objetos (
  id             uuid primary key default gen_random_uuid(),
  alineacion_id  uuid not null references alineaciones (id) on delete cascade,
  tipo           text not null,          -- 'cono', 'valla', 'flecha', ...
  datos          jsonb not null default '{}'::jsonb,  -- posicion, escala, rotacion, puntos
  orden          smallint not null default 0
);

create index if not exists alineacion_objetos_alineacion_idx
  on alineacion_objetos (alineacion_id);

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

drop trigger if exists alineaciones_tocar on alineaciones;
create trigger alineaciones_tocar
  before update on alineaciones
  for each row execute function tocar_actualizado_en();

-- ------------------------------------------------------------
-- Seguridad
--
-- Hoy los entrenadores comparten una cuenta, asi que cualquier
-- usuario con sesion iniciada ve y edita todo. Cuando cada uno
-- tenga la suya, estas politicas son el unico sitio a cambiar.
-- ------------------------------------------------------------
alter table categorias            enable row level security;
alter table jugadores             enable row level security;
alter table alineaciones          enable row level security;
alter table alineacion_jugadores  enable row level security;
alter table alineacion_objetos    enable row level security;

drop policy if exists "categorias lectura" on categorias;
create policy "categorias lectura"
  on categorias for select to authenticated using (true);

drop policy if exists "jugadores acceso" on jugadores;
create policy "jugadores acceso"
  on jugadores for all to authenticated using (true) with check (true);

drop policy if exists "alineaciones acceso" on alineaciones;
create policy "alineaciones acceso"
  on alineaciones for all to authenticated using (true) with check (true);

drop policy if exists "alineacion jugadores acceso" on alineacion_jugadores;
create policy "alineacion jugadores acceso"
  on alineacion_jugadores for all to authenticated using (true) with check (true);

drop policy if exists "alineacion objetos acceso" on alineacion_objetos;
create policy "alineacion objetos acceso"
  on alineacion_objetos for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Acceso a las fotos del bucket privado 'jugadores'
-- Crear antes el bucket en Storage, sin marcarlo como publico.
-- ------------------------------------------------------------
drop policy if exists "fotos lectura entrenadores" on storage.objects;
create policy "fotos lectura entrenadores"
  on storage.objects for select to authenticated
  using (bucket_id = 'jugadores');

drop policy if exists "fotos escritura entrenadores" on storage.objects;
create policy "fotos escritura entrenadores"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'jugadores');

drop policy if exists "fotos reemplazo entrenadores" on storage.objects;
create policy "fotos reemplazo entrenadores"
  on storage.objects for update to authenticated
  using (bucket_id = 'jugadores');