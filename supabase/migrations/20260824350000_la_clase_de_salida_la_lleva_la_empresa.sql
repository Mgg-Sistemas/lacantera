-- ---------------------------------------------------------------------------
-- De qué clase es la salida, y esa lista la lleva la empresa
--
-- Es la SEGUNDA vez que sale la misma queja. La primera:
--
--   «Esta lista no da las opciones necesarias o al menos otorga la opción
--    "Otro" para especificar por qué sale, es que está el caso en que no se
--    dañó, no se perdió, pero es obsoleto por ejemplo»
--
-- Y hoy, otra vez: «solo 2 opciones no da apertura necesaria, ¿y si solo lo
-- sacan porque está obsoleto? Y si mejor se le añade la opción "Otro" y que
-- especifique».
--
-- La primera vez se contestó con un puente: obsoleto no es una salida, es una
-- BAJA, y para eso está la otra puerta. Es cierto contablemente y es una mala
-- respuesta, porque cuando alguien pregunta dos veces lo mismo el problema no es
-- que no se lo hayan explicado.
--
-- =========================================================================
-- EL USUARIO NO TIENE POR QUÉ SABER POR QUÉ PUERTA ENTRA
-- =========================================================================
--
-- Desde el patio, «sacar material» es una sola acción. El sistema la parte en
-- dos —`registrar_salidas` y `registrar_baja`— por razones de contabilidad que
-- son buenas y que a quien entrega el material no le sirven de nada. Obligarle a
-- elegir la puerta antes de decir qué pasó es pedirle que sepa nuestra
-- estructura.
--
-- Así que la lista es UNA, y cada opción sabe a dónde va:
--
--   Se usó trabajando ....... SALIDA_CONSUMO
--   Se perdió en el manejo .. SALIDA_MERMA
--   Quedó obsoleto .......... SALIDA_BAJA, causa OBSOLETO   <- el caso que pidió
--   Se dañó ................. SALIDA_BAJA, causa DANADO
--   Se venció ............... SALIDA_BAJA, causa VENCIDO
--   No aparece .............. SALIDA_BAJA, causa EXTRAVIADO
--   Se lo llevaron .......... SALIDA_BAJA, causa ROBADO
--   Otro .................... SALIDA_CONSUMO, y obliga a explicarse
--
-- La merma sigue separada del consumo, que era el motivo de tener clases: el
-- porcentaje de merma es lo que se vigila para detectar un faltante, y si todo
-- lo que se pierde se anota como consumo, la merma da cero para siempre.
--
-- =========================================================================
-- Y ES EDITABLE, PORQUE ES LO QUE PIDIÓ LA LÍDER
-- =========================================================================
--
-- «Igual debe ser editable, no quiero nos llamen a cada rato por cosas así».
-- Lo dijo de los motivos del vale de combustible y vale igual aquí: es la
-- tercera lista del sistema que se pasa de CHECK a tabla por el mismo motivo,
-- después de los motivos de despacho y las categorías de gasto. Mismo patrón,
-- misma pantalla de edición.
--
-- Lo que NO es editable es a dónde va cada opción: `tipo` y `causa_baja` los fija
-- quien crea la clase, y de ahí no se mueven solos. Una lista donde el usuario
-- pudiera recolgar «se usó trabajando» a una baja cambiaría informes ya emitidos.
--
-- COMPROBADO, en transacción revertida:
--
--   «Quedó obsoleto» ......... NS-0001, escribe SALIDA_BAJA y su ficha en
--                              `inventario_bajas` con causa OBSOLETO
--   «Se usó trabajando» ...... NS-0002 -> SALIDA_CONSUMO
--   «Otro» sin explicar ...... parado: «Explica qué pasó, con detalle»
--   «Otro» explicado ......... NS-0003
--   'SALIDA_CONSUMO' crudo ... NS-0004, sigue funcionando
--   una clase inventada ...... parado: «Tipo de salida no válido: INVENTADA»
-- ---------------------------------------------------------------------------

create table if not exists public.clases_de_salida (
  codigo        text primary key,
  nombre        text not null,
  pista         text,
  -- A dónde va este renglón del libro. No lo elige el usuario: lo fija quien
  -- crea la clase, porque cambiarlo movería de sitio salidas ya registradas.
  tipo          text not null
    check (tipo in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_BAJA')),
  -- Solo cuando es baja: es lo que después permite responder «cuánto se perdió
  -- por obsolescencia» sin leer doscientas notas a mano.
  causa_baja    text
    check (causa_baja is null
           or causa_baja in ('DANADO', 'OBSOLETO', 'VENCIDO', 'EXTRAVIADO', 'ROBADO')),
  orden         smallint not null default 100,
  exige_detalle boolean not null default false,
  activa        boolean not null default true,
  creada_en     timestamptz not null default now(),

  -- Una baja sin causa no se puede justificar, y una causa sin baja no
  -- significa nada. Van juntas o no van.
  constraint la_baja_lleva_causa check (
    (tipo = 'SALIDA_BAJA' and causa_baja is not null) or
    (tipo <> 'SALIDA_BAJA' and causa_baja is null)
  )
);

alter table public.clases_de_salida enable row level security;

drop policy if exists clases_de_salida_lectura on public.clases_de_salida;
create policy clases_de_salida_lectura on public.clases_de_salida
  for select using (auth.uid() is not null);

drop trigger if exists trg_auditar on public.clases_de_salida;
create trigger trg_auditar
  after insert or delete or update on public.clases_de_salida
  for each row execute function private.auditar('codigo');

drop trigger if exists trg_normalizar on public.clases_de_salida;
create trigger trg_normalizar
  before insert or update on public.clases_de_salida
  for each row execute function private.normalizar_texto('nombre', 'pista');

comment on table public.clases_de_salida is
  'Por qué sale un material, en una sola lista. Cada opción sabe si es consumo, merma o baja —y con qué causa—, para que quien entrega el material no tenga que saber por qué puerta del sistema entra.';

insert into public.clases_de_salida (codigo, nombre, pista, tipo, causa_baja, orden, exige_detalle)
values
  ('SE_USO_TRABAJANDO', 'Se usó trabajando',
   'El repuesto que se montó, el aceite del cambio, el combustible que se quemó.',
   'SALIDA_CONSUMO', null, 10, false),
  ('SE_PERDIO_EN_EL_MANEJO', 'Se perdió en el manejo',
   'Lo que se derrama, se evapora o se rompe moviéndolo. Se vigila: una merma que sube sin explicación es la primera señal de un faltante.',
   'SALIDA_MERMA', null, 20, false),
  ('QUEDO_OBSOLETO', 'Quedó obsoleto',
   'Sirve, pero ya no para lo que tenemos. Sale del inventario y su valor se da por perdido.',
   'SALIDA_BAJA', 'OBSOLETO', 30, false),
  ('SE_DANO', 'Se dañó',
   'Dejó de servir. Sale del inventario y su valor se da por perdido.',
   'SALIDA_BAJA', 'DANADO', 40, false),
  ('SE_VENCIO', 'Se venció',
   'Pasó su fecha y no se puede usar.',
   'SALIDA_BAJA', 'VENCIDO', 50, false),
  ('NO_APARECE', 'No aparece',
   'Falta y no se sabe dónde está.',
   'SALIDA_BAJA', 'EXTRAVIADO', 60, false),
  ('SE_LO_LLEVARON', 'Se lo llevaron',
   'Falta, y hay motivos para creer que se lo llevaron.',
   'SALIDA_BAJA', 'ROBADO', 70, false),
  ('OTRO', 'Otro',
   'Cualquier otra razón. Hay que decir cuál: dentro de un año esa frase será lo único que quede.',
   'SALIDA_CONSUMO', null, 99, true)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- Leer la lista
-- ---------------------------------------------------------------------------
create or replace function public.clases_de_salida(p_incluir_apagadas boolean default false)
returns setof public.clases_de_salida
language sql
stable
security definer
set search_path to ''
as $func$
  select * from public.clases_de_salida
   where activa or coalesce(p_incluir_apagadas, false)
   order by orden, nombre;
$func$;

revoke all on function public.clases_de_salida(boolean) from public;
revoke all on function public.clases_de_salida(boolean) from anon;
grant execute on function public.clases_de_salida(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Editarla, con el mismo patrón que los motivos del vale
-- ---------------------------------------------------------------------------
create or replace function public.guardar_clase_de_salida(
  p_codigo        text default null,
  p_nombre        text default null,
  p_pista         text default null,
  p_tipo          text default 'SALIDA_CONSUMO',
  p_causa_baja    text default null,
  p_orden         smallint default null,
  p_exige_detalle boolean default false,
  p_activa        boolean default true
)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_codigo text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
begin
  perform private.exigir_permiso('INVENTARIO', 'TOTAL');

  if length(v_nombre) < 3 then
    raise exception 'La clase necesita un nombre.' using errcode = '22023';
  end if;

  if p_codigo is null then
    v_codigo := private.codigo_desde_nombre(v_nombre);
    if exists (select 1 from public.clases_de_salida c where c.codigo = v_codigo) then
      raise exception 'Ya hay una clase que se llama así.' using errcode = '23505';
    end if;

    insert into public.clases_de_salida
      (codigo, nombre, pista, tipo, causa_baja, orden, exige_detalle, activa)
    values
      (v_codigo, v_nombre, nullif(btrim(coalesce(p_pista, '')), ''),
       p_tipo, nullif(btrim(coalesce(p_causa_baja, '')), ''),
       coalesce(p_orden, 100::smallint), coalesce(p_exige_detalle, false),
       coalesce(p_activa, true));

    return v_codigo;
  end if;

  if not exists (select 1 from public.clases_de_salida c where c.codigo = p_codigo) then
    raise exception 'No existe la clase "%".', p_codigo using errcode = 'P0002';
  end if;

  -- El nombre y la pista se corrigen; a dónde va NO se toca al editar. Recolgar
  -- «se usó trabajando» a una baja cambiaría informes ya emitidos, y quien lo
  -- hiciera no tendría forma de saberlo.
  update public.clases_de_salida
     set nombre = v_nombre,
         pista = nullif(btrim(coalesce(p_pista, '')), ''),
         orden = coalesce(p_orden, orden),
         exige_detalle = coalesce(p_exige_detalle, exige_detalle),
         activa = coalesce(p_activa, true)
   where codigo = p_codigo;

  return p_codigo;
end;
$func$;

revoke all on function public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean) from public;
revoke all on function public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean) from anon;
grant execute on function public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean) to authenticated;

create or replace function public.borrar_clase_de_salida(p_codigo text)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('INVENTARIO', 'TOTAL');

  -- No se borra: se apaga. Una salida de hace tres meses la nombra, y borrarla
  -- dejaría esa salida sin poder decir por qué se hizo.
  update public.clases_de_salida set activa = false where codigo = p_codigo;

  if not found then
    raise exception 'No existe la clase "%".', p_codigo using errcode = 'P0002';
  end if;
end;
$func$;

revoke all on function public.borrar_clase_de_salida(text) from public;
revoke all on function public.borrar_clase_de_salida(text) from anon;
grant execute on function public.borrar_clase_de_salida(text) to authenticated;

-- ---------------------------------------------------------------------------
-- `registrar_salidas` entiende la clase, y encamina
--
-- Acepta el código de una clase O uno de los tipos de siempre, para que lo que
-- ya la llame no se entere. Si la clase es una baja, escribe además su fila en
-- `inventario_bajas` con la causa, que es lo que después permite responder
-- «cuánto se perdió por obsolescencia».
-- ---------------------------------------------------------------------------
create or replace function public.registrar_salidas(
  p_almacen_id bigint default null,
  p_renglones  jsonb default null,
  p_motivo     text default null,
  p_tipo       text default 'SALIDA_CONSUMO',
  p_fecha      date default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_r        jsonb;
  v_n        int := 0;
  v_almacen  bigint;
  v_articulo bigint;
  v_cantidad numeric;
  v_nombre   text;
  v_sitio    text;
  v_hay      numeric;
  v_costo    numeric;
  v_nota     text;
  v_clase    public.clases_de_salida;
  v_tipo     text;
  v_mov      bigint;
begin
  perform private.exigir_rol('ALMACEN');

  -- Puede venir el código de una clase o un tipo de los de siempre.
  select * into v_clase from public.clases_de_salida where codigo = p_tipo;

  if v_clase.codigo is not null then
    if not v_clase.activa then
      raise exception 'La clase "%" está apagada.', v_clase.nombre using errcode = '22023';
    end if;
    v_tipo := v_clase.tipo;
  else
    v_tipo := p_tipo;
    if v_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then
      raise exception 'Tipo de salida no válido: %.', p_tipo using errcode = '22023';
    end if;
  end if;

  if jsonb_typeof(p_renglones) <> 'array' or jsonb_array_length(p_renglones) = 0 then
    raise exception 'No hay nada que sacar: la salida no trae renglones.' using errcode = '22023';
  end if;

  -- Una baja pide más explicación que una salida: destruye valor en libros, y
  -- dentro de un año esa frase será lo único que quede para justificarla.
  if v_tipo = 'SALIDA_BAJA' or coalesce(v_clase.exige_detalle, false) then
    if length(btrim(coalesce(p_motivo, ''))) < 10 then
      raise exception 'Explica qué pasó, con detalle. Dentro de un año esta frase será lo único que quede.'
        using errcode = '22023';
    end if;
  elsif length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe para qué sale. Una salida sin motivo no se puede auditar.'
      using errcode = '22023';
  end if;

  -- Primera pasada: comprobar. Nada se mueve todavía, para que un renglón malo
  -- no deje tres salidas hechas y dos no.
  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_n := v_n + 1;
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := nullif(btrim(coalesce(v_r->>'articulo_id', '')), '')::bigint;
    v_cantidad := coalesce(nullif(btrim(coalesce(v_r->>'cantidad', '')), '')::numeric, 0);

    select nombre into v_sitio from public.almacenes where id = v_almacen and activo;
    if v_sitio is null then
      raise exception 'El renglón %: no dice de qué almacén sale, o ese almacén está inactivo.', v_n
        using errcode = '23503';
    end if;

    select nombre into v_nombre from public.articulos where id = v_articulo and activo;
    if v_nombre is null then
      raise exception 'El renglón %: ese artículo no existe o está inactivo.', v_n
        using errcode = '23503';
    end if;

    if v_cantidad <= 0 then
      raise exception 'El renglón % (%): la cantidad tiene que ser mayor que cero.', v_n, v_nombre
        using errcode = '22023';
    end if;

    v_hay := private.existencia_para_escribir(v_almacen, v_articulo) - coalesce((
      select sum(nullif(btrim(coalesce(r->>'cantidad', '')), '')::numeric)
        from jsonb_array_elements(p_renglones) with ordinality as t(r, i)
       where t.i < v_n
         and coalesce(nullif(btrim(coalesce(r->>'almacen_id', '')), '')::bigint, p_almacen_id) = v_almacen
         and nullif(btrim(coalesce(r->>'articulo_id', '')), '')::bigint = v_articulo
    ), 0);

    if v_cantidad > v_hay then
      raise exception 'El renglón % (% en %): solo quedan % y se intentan sacar %.',
        v_n, v_nombre, v_sitio, v_hay, v_cantidad using errcode = '22023';
    end if;
  end loop;

  v_nota := private.siguiente_numero('NS');

  for v_r in select * from jsonb_array_elements(p_renglones) loop
    v_almacen  := coalesce(nullif(btrim(coalesce(v_r->>'almacen_id', '')), '')::bigint, p_almacen_id);
    v_articulo := (v_r->>'articulo_id')::bigint;
    v_cantidad := (v_r->>'cantidad')::numeric;
    v_costo := private.costo_promedio(v_almacen, v_articulo);

    v_mov := private.registrar_movimiento(
      v_tipo, -1, v_almacen, v_articulo, v_cantidad, v_costo,
      btrim(p_motivo), null, null, null, p_fecha, null, null, v_nota);

    -- La baja deja además su ficha con la causa. Sin ella, «cuánto se perdió por
    -- obsolescencia» no se puede responder sin leer las notas a mano.
    if v_tipo = 'SALIDA_BAJA' then
      insert into public.inventario_bajas (movimiento_id, causa, solicitada_por)
      values (v_mov, v_clase.causa_baja, (select auth.uid()));
    end if;
  end loop;

  return v_nota;
end;
$func$;

comment on function public.registrar_salidas(bigint, jsonb, text, text, date) is
  'Saca varios materiales en una sola operación y bajo un mismo número de nota. `p_tipo` admite el código de una clase de salida —y entonces la función encamina a consumo, merma o baja según diga— o un tipo de movimiento de los de siempre.';

revoke all on function public.registrar_salidas(bigint, jsonb, text, text, date) from public;
revoke all on function public.registrar_salidas(bigint, jsonb, text, text, date) from anon;
grant execute on function public.registrar_salidas(bigint, jsonb, text, text, date) to authenticated;
