-- ---------------------------------------------------------------------------
-- Un solo catálogo de métodos de pago
--
-- EL PROBLEMA
--
-- Había cuatro listas escritas a mano, una por módulo, y ninguna igual a otra:
--
--   cobros_venta        transferencia, pago móvil, efectivo, zelle, binance,
--                       cheque, otro
--   pagos_compra        transferencia, pago móvil, efectivo, binance, cheque
--   instrucciones_pago  transferencia, pago móvil, efectivo, binance
--   empleados           transferencia, pago móvil, efectivo, binance
--
-- El resultado: se podía cobrar por Zelle pero no pagar por Zelle, y pagar una
-- factura de proveedor con cheque pero no una orden de compra. No es que
-- alguien lo decidiera así — cada módulo se escribió en su momento y las listas
-- se separaron solas.
--
-- Y no eran solo listas. `instrucciones_pago` llevaba además, en sus `check`,
-- qué campos exige cada método, en qué monedas vale y si necesita comprobante.
-- Reglas de negocio de verdad, escritas dentro de una restricción, imposibles
-- de leer desde la aplicación y de mantener en cuatro sitios a la vez.
--
-- LO QUE HACE ESTA MIGRACIÓN
--
-- Mueve todo eso a una tabla. Los cuatro módulos pasan a apuntar a ella, así
-- que añadir un método mañana es insertar una fila y no tocar cuatro
-- restricciones que volverán a divergir.
--
-- POR QUÉ NO SE PARTE EL EFECTIVO EN DOS
--
-- Se planteó separar "efectivo en bolívares" de "efectivo en divisas", porque
-- el IGTF grava uno y no el otro. No hace falta: el IGTF ya se deriva de la
-- moneda —`coalesce(p_igtf, moneda <> 'VES')`— y la moneda ya se elige al lado
-- del método. Dos campos diciendo lo mismo terminan diciendo cosas distintas:
-- alguien elegiría "efectivo en divisas" y dejaría la moneda en bolívares.
--
-- Queda un solo Efectivo, y la regla de moneda como atributo del catálogo.
-- ---------------------------------------------------------------------------

create table if not exists public.metodos_pago (
  codigo      text primary key,
  nombre      text not null,
  orden       smallint not null default 100,

  /*
    En qué monedas vale.

    No es adorno: el pago móvil es un sistema en bolívares y no existe en
    divisas; Binance y Zelle son lo contrario. Antes esto vivía en un `check`
    de `instrucciones_pago` que nombraba los métodos uno por uno.
  */
  moneda_regla text not null default 'CUALQUIERA'
               check (moneda_regla in ('CUALQUIERA', 'SOLO_VES', 'NUNCA_VES')),

  /*
    Qué datos hay que llenar para pagar por aquí.

    Un arreglo y no siete columnas booleanas: los campos que puede pedir un
    método no están cerrados —mañana entra uno que pide otra cosa— y una tabla
    con quince columnas `exige_*` en `false` no se lee.
  */
  campos_exigidos text[] not null default '{}',

  /*
    Si hace falta soporte del pago.

    El efectivo no lo lleva: se entrega en mano y lo que queda es la firma de
    quien recibe. Exigirle referencia bancaria a un pago en efectivo obliga a
    inventarse una, que es peor que no tenerla.
  */
  exige_comprobante boolean not null default true,

  activo      boolean not null default true
);

comment on table public.metodos_pago is
  'Cómo se mueve el dinero. Lo usan compras, ventas y nómina; antes cada una tenía su propia lista.';

insert into public.metodos_pago
  (codigo, nombre, orden, moneda_regla, campos_exigidos, exige_comprobante) values
  ('TRANSFERENCIA', 'Transferencia bancaria', 10, 'CUALQUIERA',
   array['banco','numero_cuenta','titular','documento'], true),
  ('PAGO_MOVIL',    'Pago móvil',             20, 'SOLO_VES',
   array['banco','telefono','documento'], true),
  ('EFECTIVO',      'Efectivo',               30, 'CUALQUIERA',
   array['receptor','documento'], false),
  ('ZELLE',         'Zelle',                  40, 'NUNCA_VES',
   array['correo_binance','titular'], true),
  ('BINANCE',       'Binance / USDT',         50, 'NUNCA_VES',
   array['titular'], true),
  ('CHEQUE',        'Cheque',                 60, 'CUALQUIERA',
   array['banco','numero_cuenta','titular'], true),
  ('OTRO',          'Otro',                   90, 'CUALQUIERA',
   '{}', true)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      orden = excluded.orden,
      moneda_regla = excluded.moneda_regla,
      campos_exigidos = excluded.campos_exigidos,
      exige_comprobante = excluded.exige_comprobante;

-- ---------------------------------------------------------------------------
-- Quién puede leerlo
--
-- Es un catálogo, como las monedas o las unidades: lo lee cualquiera que haya
-- entrado. Escribirlo no se abre a nadie desde la aplicación — un método nuevo
-- entra por migración, no por pantalla, porque añadir uno sin decidir sus
-- reglas de moneda y de campos deja pagos a medio validar.
-- ---------------------------------------------------------------------------
alter table public.metodos_pago enable row level security;

drop policy if exists metodos_pago_lectura on public.metodos_pago;
create policy metodos_pago_lectura on public.metodos_pago
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Las cuatro columnas pasan a apuntar aquí
--
-- Se cambia el `check` por una clave foránea. La diferencia práctica: con el
-- `check`, añadir un método obliga a reescribir la restricción en cuatro
-- tablas; con la clave foránea, se inserta una fila y las cuatro lo admiten.
--
-- Antes de cada `alter` se comprueba que lo que ya está guardado exista en el
-- catálogo. Si algo no cuadra, la migración se detiene con un mensaje que dice
-- qué valor sobra, en vez de fallar con un error de restricción que no explica
-- nada.
-- ---------------------------------------------------------------------------
do $vincular$
declare
  v_tabla   text;
  v_columna text;
  v_huerfanos text;
begin
  foreach v_tabla in array array[
    'instrucciones_pago', 'pagos_compra', 'cobros_venta', 'empleados'
  ] loop
    v_columna := case when v_tabla = 'empleados' then 'forma_pago' else 'metodo' end;

    execute format(
      'select string_agg(distinct %I::text, '', '') from public.%I
        where %I is not null
          and %I::text not in (select codigo from public.metodos_pago)',
      v_columna, v_tabla, v_columna, v_columna)
    into v_huerfanos;

    if v_huerfanos is not null then
      raise exception 'En %.% hay valores que no están en el catálogo: %. Añádelos antes de vincular.',
        v_tabla, v_columna, v_huerfanos using errcode = '23514';
    end if;
  end loop;
end $vincular$;

-- Fuera los `check` de lista cerrada. Los de reglas —moneda, campos,
-- comprobante— se tratan más abajo y no se tocan aquí.
alter table public.instrucciones_pago drop constraint if exists instrucciones_pago_metodo_check;
alter table public.pagos_compra        drop constraint if exists pagos_compra_metodo_check;
alter table public.cobros_venta        drop constraint if exists cobros_venta_metodo_check;
alter table public.empleados           drop constraint if exists empleados_forma_pago_check;

alter table public.instrucciones_pago
  add constraint instrucciones_pago_metodo_fkey
  foreign key (metodo) references public.metodos_pago(codigo);

alter table public.pagos_compra
  add constraint pagos_compra_metodo_fkey
  foreign key (metodo) references public.metodos_pago(codigo);

alter table public.cobros_venta
  add constraint cobros_venta_metodo_fkey
  foreign key (metodo) references public.metodos_pago(codigo);

alter table public.empleados
  add constraint empleados_forma_pago_fkey
  foreign key (forma_pago) references public.metodos_pago(codigo);

-- ---------------------------------------------------------------------------
-- Las reglas de moneda y de campos, leídas del catálogo
--
-- Estaban en dos `check` de `instrucciones_pago` que nombraban los métodos uno
-- por uno con un `case`. Eso tenía un fallo silencioso: el `case` terminaba en
-- `else null`, y un `check` que da NULL pasa. Es decir, los métodos nuevos
-- —Zelle, cheque, otro— habrían entrado sin validar ni un campo.
--
-- Un disparador puede leer el catálogo; un `check` no. Por eso el cambio.
-- ---------------------------------------------------------------------------
-- Los nombres se leyeron de la base, no se supusieron. Un `drop ... if exists`
-- con el nombre equivocado no falla: no hace nada, y la regla vieja se queda
-- puesta bloqueando en silencio los métodos nuevos.
alter table public.instrucciones_pago drop constraint if exists instrucciones_datos_por_metodo;
alter table public.instrucciones_pago drop constraint if exists instrucciones_moneda_por_metodo;
alter table public.instrucciones_pago drop constraint if exists instrucciones_referencia_al_pagar;

create or replace function private.validar_metodo_pago()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_m       public.metodos_pago%rowtype;
  v_campo   text;
  v_valor   text;
  v_faltan  text[] := '{}';
begin
  select * into v_m from public.metodos_pago where codigo = new.metodo;

  if not found then
    raise exception 'El método de pago "%" no existe en el catálogo.', new.metodo
      using errcode = '23503';
  end if;

  if not v_m.activo then
    raise exception 'El método "%" ya no está en uso.', v_m.nombre using errcode = '55000';
  end if;

  -- La moneda
  if v_m.moneda_regla = 'SOLO_VES' and new.moneda <> 'VES' then
    raise exception '% solo funciona en bolívares.', v_m.nombre using errcode = '22023';
  end if;

  if v_m.moneda_regla = 'NUNCA_VES' and new.moneda = 'VES' then
    raise exception '% no funciona en bolívares.', v_m.nombre using errcode = '22023';
  end if;

  -- Los campos que exige el método. Se leen por nombre de columna para no
  -- tener que repetir aquí la lista que ya está en el catálogo.
  foreach v_campo in array v_m.campos_exigidos loop
    execute format('select ($1).%I::text', v_campo) into v_valor using new;
    if v_valor is null or btrim(v_valor) = '' then
      v_faltan := v_faltan || v_campo;
    end if;
  end loop;

  if array_length(v_faltan, 1) > 0 then
    raise exception 'Para pagar por % faltan estos datos: %.',
      v_m.nombre, array_to_string(v_faltan, ', ') using errcode = '23514';
  end if;

  -- El comprobante, solo cuando el pago ya salió.
  if new.estado = 'PAGADA' and v_m.exige_comprobante
     and (new.referencia is null or btrim(new.referencia) = '') then
    raise exception 'Un pago por % necesita su referencia para darse por ejecutado.', v_m.nombre
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_metodo_pago on public.instrucciones_pago;
create trigger trg_validar_metodo_pago
  before insert or update on public.instrucciones_pago
  for each row execute function private.validar_metodo_pago();
