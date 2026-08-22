-- ---------------------------------------------------------------------------
-- El inventario sabe dar de baja
--
-- La líder: «el inventario registra entradas, pero no registra salidas que no
-- necesariamente son ventas (ej. equipo dañado e irreparable, desechado,
-- obsoleto, etc.)».
--
-- Había tres salidas y ninguna servía:
--
--   SALIDA_CONSUMO  — se gastó haciendo el trabajo. El cemento que se usó.
--   SALIDA_MERMA    — se perdió en el manejo. El granel que se evapora o se
--                     derrama. Es una pérdida esperada y proporcional.
--   SALIDA_DESPACHO — se vendió y salió en un camión.
--
-- Un taladro quemado no es ninguna de las tres. No se gastó, no se derramó y no
-- se vendió: se decidió que ya no sirve. Meterlo en merma haría que el
-- porcentaje de merma —que se vigila para detectar robo— subiera por una razón
-- que no tiene nada que ver.
--
-- POR QUÉ UNA TABLA APARTE Y NO UNA COLUMNA MÁS
--
-- Una baja es un hecho administrativo, no solo un movimiento: alguien decide
-- que un bien deja de existir para la empresa, y eso destruye valor en libros.
-- Lleva causa, lleva quién lo pidió y llevará quién lo autorice.
--
-- Además los movimientos son inmutables por disparador: no se pueden actualizar
-- después, así que la causa no podría añadirse en un segundo paso. Y ampliar
-- `private.registrar_movimiento` significaría cambiar la lista de parámetros de
-- la función que mueve TODO el inventario, que es el sitio del sistema con
-- menos margen de error.
--
-- Con tabla aparte no se toca nada de lo que ya funciona.
--
-- LAS CAUSAS SON CINCO Y NO HAY «OTRO»
--
-- Con una opción «otro» acaba todo ahí, y en un año nadie puede responder
-- cuánto se perdió por obsolescencia. Si aparece una causa que no está, se
-- añade a la lista: eso es una decisión, y las decisiones deben verse.
--
-- QUIÉN PUEDE
--
-- Rol ALMACEN, como el resto de las salidas. Queda anotado que dar de baja
-- destruye valor y que en una empresa más grande eso pide una segunda firma;
-- la tabla ya tiene sitio para ella el día que se decida.
-- ---------------------------------------------------------------------------

alter table public.inventario_movimientos
  drop constraint if exists inventario_movimientos_tipo_check;

alter table public.inventario_movimientos
  add constraint inventario_movimientos_tipo_check
  check (tipo = any (array[
    'ENTRADA_COMPRA', 'ENTRADA_PRODUCCION', 'ENTRADA_DEVOLUCION', 'ENTRADA_DIRECTA',
    'SALIDA_CONSUMO', 'SALIDA_DESPACHO', 'SALIDA_MERMA', 'SALIDA_BAJA',
    'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO',
    'TRANSFERENCIA_SALIDA', 'TRANSFERENCIA_ENTRADA',
    'REVERSO'
  ]));

create table if not exists public.inventario_bajas (
  movimiento_id bigint primary key references public.inventario_movimientos(id) on delete cascade,

  causa text not null check (causa = any (array[
    'DANADO',      -- se rompió y no compensa repararlo
    'OBSOLETO',    -- funciona, pero ya no sirve para lo que se hace hoy
    'VENCIDO',     -- caducó: químicos, filtros con vida útil, consumibles
    'EXTRAVIADO',  -- no aparece y nadie sabe dónde está
    'ROBADO'       -- falta y hay motivos para creer que se lo llevaron
  ])),

  -- Lo que se hizo con el bien después. Un equipo dado de baja puede haberse
  -- desechado, vendido como chatarra o guardado para repuestos, y eso cambia si
  -- alguien debe ir a buscarlo.
  destino text,

  solicitada_por uuid references public.perfiles(id),
  registrada_en  timestamptz not null default now()
);

comment on table public.inventario_bajas is
  'Por que dejo de existir un bien para la empresa. Va aparte del movimiento '
  'porque una baja destruye valor en libros y eso lleva causa y responsable, no '
  'solo cantidad.';

create index if not exists inventario_bajas_causa_idx on public.inventario_bajas (causa);

alter table public.inventario_bajas enable row level security;

drop policy if exists inventario_bajas_lectura on public.inventario_bajas;
create policy inventario_bajas_lectura on public.inventario_bajas
  for select to authenticated
  using (private.tiene_permiso('INVENTARIO', 'LECTURA'));

revoke insert, update, delete on public.inventario_bajas from anon, authenticated;

-- Los dos disparadores de la casa reciben por `TG_ARGV` las columnas sobre las
-- que trabajan, y sin argumento revientan con «FOREACH expression must not be
-- null» — que desde el navegador no se lee como un disparador mal declarado,
-- se lee como un 400 al guardar. Ya costó dos intentos hoy.
drop trigger if exists trg_auditar on public.inventario_bajas;
create trigger trg_auditar
  after insert or update or delete on public.inventario_bajas
  for each row execute function private.auditar('movimiento_id');

-- Solo `destino`: `causa` viene de un catálogo cerrado y ya está en mayúscula.
drop trigger if exists trg_normalizar on public.inventario_bajas;
create trigger trg_normalizar
  before insert or update on public.inventario_bajas
  for each row execute function private.normalizar_texto('destino');

-- ---------------------------------------------------------------------------
-- Darla de baja
-- ---------------------------------------------------------------------------
create or replace function public.registrar_baja(
  p_almacen_id  bigint,
  p_articulo_id bigint,
  p_cantidad    numeric,
  p_causa       text,
  p_motivo      text,
  p_destino     text default null,
  p_fecha       date default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_existencia numeric;
  v_costo      numeric;
  v_articulo   text;
  v_id         bigint;
begin
  perform private.exigir_rol('ALMACEN');

  if p_causa not in ('DANADO', 'OBSOLETO', 'VENCIDO', 'EXTRAVIADO', 'ROBADO') then
    raise exception 'Esa no es una causa de baja: dañado, obsoleto, vencido, extraviado o robado.'
      using errcode = '22023';
  end if;

  if coalesce(p_cantidad, 0) <= 0 then
    raise exception 'La cantidad que se da de baja tiene que ser mayor que cero.'
      using errcode = '22023';
  end if;

  -- Más exigente que en una salida normal: dar de baja destruye valor y el
  -- único rastro de por qué será lo que se escriba aquí. «Dañado» no explica
  -- nada que la causa no diga ya.
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Explica que paso, con detalle. Dentro de un año esta frase sera lo unico que quede para justificar la perdida.'
      using errcode = '22023';
  end if;

  v_existencia := private.existencia(p_almacen_id, p_articulo_id);

  if p_cantidad > v_existencia then
    select nombre into v_articulo from public.articulos where id = p_articulo_id;
    raise exception 'De "%" solo hay % en existencia y se intentan dar de baja %.',
      coalesce(v_articulo, p_articulo_id::text), v_existencia, p_cantidad
      using errcode = '22023';
  end if;

  -- Al costo promedio, como toda salida: lo que se pierde vale lo que valía
  -- mientras estaba.
  v_costo := private.costo_promedio(p_almacen_id, p_articulo_id);

  v_id := private.registrar_movimiento(
    'SALIDA_BAJA', -1, p_almacen_id, p_articulo_id, p_cantidad, v_costo,
    btrim(p_motivo), null, null, null, p_fecha, null, null);

  insert into public.inventario_bajas (movimiento_id, causa, destino, solicitada_por)
  values (v_id, p_causa, nullif(btrim(coalesce(p_destino, '')), ''), (select auth.uid()));

  return v_id;
end;
$func$;

comment on function public.registrar_baja(bigint, bigint, numeric, text, text, text, date) is
  'Saca del inventario lo que dejo de servir: dañado, obsoleto, vencido, '
  'extraviado o robado. No es merma —que es perdida de manejo y se vigila para '
  'detectar robo— ni consumo, que es haberlo gastado trabajando.';

revoke execute on function public.registrar_baja(bigint, bigint, numeric, text, text, text, date) from public, anon;
grant  execute on function public.registrar_baja(bigint, bigint, numeric, text, text, text, date) to authenticated;
