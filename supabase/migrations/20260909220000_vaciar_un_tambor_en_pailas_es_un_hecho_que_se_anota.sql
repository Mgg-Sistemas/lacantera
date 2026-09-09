/*
  VACIAR UN TAMBOR EN PAILAS ES UN HECHO, Y HASTA HOY ERA INVISIBLE.

  Christopher: «¿qué pasa si el día de mañana se usan los galones o pailas para
  llenar un tambor para almacenar, o al contrario, vaciar parte de un tambor para
  llenar algunas pailas y así darle movilidad o salida más fácil para los
  operadores? (más fácil mover pailas que un tambor al final)».

  Es una operación real de almacén y el sistema no tenía dónde anotarla. Peor: no
  tenía forma de saber que había pasado. Cuando alguien vacía un tambor en diez
  pailas, **los litros no cambian** —son los mismos 208— así que el libro no se
  entera de nada. Y sin embargo lo que hay en el estante cambió por completo.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ ESTO NO ES UN MOVIMIENTO DE INVENTARIO
  ═══════════════════════════════════════════════════════════════════════════

  La tentación era escribirlo como dos asientos, uno negativo y otro positivo. No
  se hace: `inventario_movimientos` es el libro de CUÁNTO HAY, y aquí no entró ni
  salió nada. Dos asientos que se anulan ensucian el libro con ruido que después
  hay que explicar en cada informe —«¿por qué salieron 208 L y entraron 208 L el
  mismo día?»— y encima obligarían a inventar un tipo de movimiento que no mueve.

  Un re-envase no cambia la cantidad. Cambia la FORMA, y la forma vive aparte.

  ═══════════════════════════════════════════════════════════════════════════
  LA REGLA QUE HACE QUE ESTO NO PUEDA MENTIR: SE CONSERVA EL VOLUMEN
  ═══════════════════════════════════════════════════════════════════════════

  Un tambor son 208 litros; diez pailas y 18 litros sueltos también. La puerta
  **exige que las dos orillas den lo mismo** y rechaza si no cuadran:

      1 TAMBOR  ->  10 PAILA + 18 L        208 = 190 + 18   ✓
      1 TAMBOR  ->  11 PAILA               208 ≠ 209        ✗

  Eso la vuelve auto-comprobable: no hay forma de anotar un trasvase que no
  cuadre, y quien se equivoque tecleando lo ve en el momento y no tres meses
  después. Es la misma idea que sostiene el conteo, aplicada a una operación que
  no toca la cantidad.

  El margen de un decilitro no es tolerancia a la chapuza: los factores son
  aproximados —Christopher, hoy: la paila trae 19 litros «de forma no estricta»—
  y exigir igualdad exacta rechazaría trasvases correctos por el redondeo del
  propio catálogo.

  ═══════════════════════════════════════════════════════════════════════════
  QUÉ SE PUEDE CONTESTAR CON ESTO, Y QUÉ NO
  ═══════════════════════════════════════════════════════════════════════════

  SÍ: «el 12 de octubre se vació un tambor en diez pailas para que los operadores
  pudieran moverlas». Con fecha, con firma y con motivo.

  NO: «cuántos tambores hay ahora mismo». Y conviene decirlo claro en vez de
  fingir lo contrario: para saberlo harían falta TODAS las operaciones anotadas
  —cada entrada, cada salida y cada trasvase diciendo su envase— y basta con que
  una se teclee sin envase para que la cuenta deje de valer. La respuesta honesta
  a esa pregunta sigue siendo el conteo: es el único momento en que alguien está
  delante del estante mirándolos.

  Lo que este registro sí hace es que, entre dos conteos, se pueda EXPLICAR el
  cambio en vez de descubrirlo.
*/

-- ---------------------------------------------------------------------------
-- 1. El libro de las formas, que no es el libro de las cantidades
-- ---------------------------------------------------------------------------
create table if not exists public.reenvases (
  id                  bigserial primary key,
  almacen_id          bigint not null references public.almacenes(id),
  articulo_id         bigint not null references public.articulos(id),
  /* Nulo en cualquiera de las dos orillas significa «suelto», en la unidad de
     operación: se puede llenar un tambor con lo que estaba suelto, y vaciarlo
     hasta dejarlo suelto. */
  desde_presentacion  text references public.presentaciones(codigo),
  desde_cantidad      numeric not null,
  hacia_presentacion  text references public.presentaciones(codigo),
  hacia_cantidad      numeric not null,
  /* Lo que las dos orillas tienen que dar. Se guarda calculado para no
     recalcularlo al leer y para que el asiento diga por sí solo de cuánto
     hablaba. */
  volumen             numeric not null,
  motivo              text not null,
  fecha               date not null default private.hoy_aqui(),
  registrado_por      uuid references auth.users(id),
  registrado_en       timestamptz not null default now(),
  constraint reenvases_orillas_distintas check (
    desde_presentacion is distinct from hacia_presentacion),
  constraint reenvases_cantidades check (desde_cantidad > 0 and hacia_cantidad > 0)
);

comment on table public.reenvases is
  'Trasvases: material que cambia de envase sin cambiar de cantidad. Vaciar un tambor en diez pailas para que los operadores puedan moverlas, o juntar pailas en un tambor para guardar. NO es un movimiento de inventario y por eso no vive en `inventario_movimientos`: ahi no entro ni salio nada, y dos asientos que se anulan solo ensucian el libro. Esto es el libro de las FORMAS; aquel es el de las cantidades. La puerta exige que las dos orillas den el mismo volumen, asi que un trasvase que no cuadra no se puede anotar.';

comment on column public.reenvases.desde_presentacion is
  'De que envase salio. Nulo = estaba suelto, en la unidad de operacion.';
comment on column public.reenvases.hacia_presentacion is
  'A que envase fue. Nulo = quedo suelto, en la unidad de operacion.';

create index if not exists reenvases_donde
  on public.reenvases (almacen_id, articulo_id, fecha desc);

alter table public.reenvases enable row level security;

drop policy if exists reenvases_lectura on public.reenvases;
create policy reenvases_lectura on public.reenvases
  for select to authenticated
  using (private.tiene_permiso('INVENTARIO', 'LECTURA'));

-- Regla 1: el navegador no escribe. Solo entra por `reenvasar`.
revoke insert, update, delete on public.reenvases from authenticated;
grant select on public.reenvases to authenticated;

drop trigger if exists trg_auditar on public.reenvases;
create trigger trg_auditar
  after insert or update or delete on public.reenvases
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.reenvases;
create trigger trg_normalizar
  before insert or update on public.reenvases
  for each row execute function private.normalizar_texto('motivo');

-- ---------------------------------------------------------------------------
-- 2. La puerta
-- ---------------------------------------------------------------------------
create or replace function public.reenvasar(
  p_almacen_id         bigint,
  p_articulo_id        bigint,
  p_desde_presentacion text,
  p_desde_cantidad     numeric,
  p_hacia_presentacion text,
  p_hacia_cantidad     numeric,
  p_motivo             text,
  p_fecha              date default null
)
returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_desde   text := nullif(btrim(coalesce(p_desde_presentacion, '')), '');
  v_hacia   text := nullif(btrim(coalesce(p_hacia_presentacion, '')), '');
  v_vol_a   numeric;
  v_vol_b   numeric;
  v_art     record;
  v_hay     numeric;
  v_id      bigint;
begin
  perform private.exigir_rol('ALMACEN');

  select nombre, unidad into v_art from public.articulos where id = p_articulo_id;
  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se cambió de envase. Dentro de un año será lo único que lo explique.'
      using errcode = '22023';
  end if;

  if v_desde is not distinct from v_hacia then
    raise exception 'Las dos orillas son el mismo envase: eso no es un trasvase.'
      using errcode = '22023';
  end if;

  /*
    LAS DOS ORILLAS, EN LA UNIDAD DE OPERACIÓN.

    `en_unidad_base` convierte y de paso valida que el envase esté declarado para
    ese artículo — es quien rechaza una garrafa donde solo hay pailas—. Con
    presentación nula, la cantidad ya viene en la unidad de operación y se toma
    tal cual: eso es llenar un envase con lo que estaba suelto, o vaciarlo.
  */
  v_vol_a := case when v_desde is null then p_desde_cantidad
                  else private.en_unidad_base(p_articulo_id, p_desde_cantidad, 0, v_desde) end;
  v_vol_b := case when v_hacia is null then p_hacia_cantidad
                  else private.en_unidad_base(p_articulo_id, p_hacia_cantidad, 0, v_hacia) end;

  /*
    SE CONSERVA EL VOLUMEN, Y ESO ES LO QUE HACE QUE ESTO NO PUEDA MENTIR.

    Un tambor son 208 L; diez pailas y 18 sueltos también. Si las dos orillas no
    dan lo mismo, o el trasvase está mal contado o el factor del catálogo está
    mal: en los dos casos hay que enterarse ahora.

    El margen de un decilitro no es tolerancia a la chapuza: los factores son
    aproximados —la paila trae 19 L «de forma no estricta»— y exigir igualdad
    exacta rechazaría trasvases correctos por el redondeo del propio catálogo.
  */
  if abs(v_vol_a - v_vol_b) > 0.1 then
    raise exception 'No cuadra: de un lado hay % % y del otro %. Un trasvase no crea ni pierde material.',
      private.numero_es(v_vol_a, 4), v_art.unidad, private.numero_es(v_vol_b, 4)
      using errcode = '22023',
            hint = 'Revisa cuántos envases son, o lo que trae cada uno en el catálogo del artículo.';
  end if;

  /*
    NO SE PUEDE TRASVASAR LO QUE NO HAY. El libro no cambia con esto, pero un
    trasvase de más envases de los que caben en la existencia es un error de
    conteo que conviene frenar aquí.
  */
  v_hay := private.existencia_para_escribir(p_almacen_id, p_articulo_id);
  if v_vol_a > v_hay + 0.0001 then
    raise exception 'Aquí solo hay % % de "%", y se están trasvasando %.',
      private.numero_es(v_hay, 4), v_art.unidad, v_art.nombre, private.numero_es(v_vol_a, 4)
      using errcode = '22023';
  end if;

  insert into public.reenvases (
    almacen_id, articulo_id,
    desde_presentacion, desde_cantidad,
    hacia_presentacion, hacia_cantidad,
    volumen, motivo, fecha, registrado_por)
  values (
    p_almacen_id, p_articulo_id,
    v_desde, p_desde_cantidad,
    v_hacia, p_hacia_cantidad,
    v_vol_a, p_motivo, coalesce(p_fecha, private.hoy_aqui()), auth.uid())
  returning id into v_id;

  return v_id;
end;
$function$;

comment on function public.reenvasar(bigint, bigint, text, numeric, text, numeric, text, date) is
  'Anota que material cambio de envase sin cambiar de cantidad: vaciar un tambor en diez pailas para que los operadores puedan moverlas, o juntar pailas en un tambor para guardar. Lo pidio Christopher el 9/09/2026 describiendo la operacion real: «mas facil mover pailas que un tambor al final». EXIGE QUE SE CONSERVE EL VOLUMEN —208 L de un lado, 10 pailas y 18 L del otro— con un margen de un decilitro para el redondeo de los factores, que son aproximados. Eso la vuelve auto-comprobable: un trasvase mal contado no se puede anotar. Presentacion nula en cualquiera de las dos orillas significa «suelto», en la unidad de operacion. No escribe en `inventario_movimientos` a proposito: ahi no entro ni salio nada.';

grant execute on function public.reenvasar(bigint, bigint, text, numeric, text, numeric, text, date) to authenticated;
