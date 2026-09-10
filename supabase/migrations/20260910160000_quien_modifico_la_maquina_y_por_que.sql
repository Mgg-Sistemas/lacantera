/*
  QUIÉN MODIFICÓ LA MÁQUINA, Y POR QUÉ.

  Christopher, a los siete minutos de pedir los agregados: «cuando se realiza la
  modificación de la máquina, es importante indicar quién lo hizo o la razón de
  por qué se modificó».

  ═══════════════════════════════════════════════════════════════════════════
  «QUIÉN LO HIZO» NO ES «QUIÉN LO ANOTÓ», Y HACEN FALTA LOS DOS
  ═══════════════════════════════════════════════════════════════════════════

  `puesto_por` ya existía y guarda el usuario que tecleó el apunte. Eso es
  trazabilidad del sistema y no contesta la pregunta: quien monta una antena
  Starlink casi nunca es quien está delante del computador. Suele ser el taller
  de la esquina, el proveedor que la vendió, o un mecánico de la casa.

  Por eso `hecho_por` es TEXTO LIBRE y no un empleado. Se probó con los tres
  casos reales y en dos de los tres la respuesta no es un empleado: «Starlink
  Venezuela» y «el taller de Upata» no tienen ficha de nómina y no deben tenerla.
  Un desplegable de empleados obligaría a poner al mecánico que estaba mirando,
  que es peor que un hueco porque parece un dato.

  Y no se obliga: a veces de verdad no se sabe quién lo montó —una máquina que
  llega con la antena puesta— y un nombre inventado es peor que el hueco.

  ═══════════════════════════════════════════════════════════════════════════
  EL PORQUÉ SÍ ES OBLIGATORIO, IGUAL QUE AL QUITARLO
  ═══════════════════════════════════════════════════════════════════════════

  Al retirar ya se exigía el motivo, y el argumento vale igual al montar: dentro
  de un año, «tiene una antena» no explica nada y «se le puso para tener señal en
  el frente norte» explica si sigue haciendo falta.

  Sin motivo obligatorio la tabla acabaría siendo una lista de cosas sueltas, que
  es exactamente lo que ya se puede leer mirando la máquina.

  NADA QUE MIGRAR: la tabla se creó veinte minutos antes y tiene cero filas.
  Comprobado antes de poner el `not null`, porque con filas dentro habría hecho
  falta un valor de relleno y ese valor habría sido una mentira.
*/

alter table public.maquina_agregados
  add column if not exists motivo    text,
  add column if not exists hecho_por text;

/* Se pone en dos pasos —añadir y luego exigir— para que falle ruidosamente si
   alguien la corre con filas dentro, en vez de rellenar el hueco a la calladita. */
do $exigir$
begin
  if exists (select 1 from public.maquina_agregados where motivo is null) then
    raise exception 'Hay agregados sin motivo: no se pone el NOT NULL a ciegas.';
  end if;
  alter table public.maquina_agregados alter column motivo set not null;
end $exigir$;

alter table public.maquina_agregados
  drop constraint if exists maquina_agregados_motivo_explicado;
alter table public.maquina_agregados
  add constraint maquina_agregados_motivo_explicado
  check (length(btrim(motivo)) >= 4);

comment on column public.maquina_agregados.motivo is
  'Por que se le monto. Obligatorio, igual que el motivo al quitarlo: dentro de un año «tiene una antena» no explica nada y «se le puso para tener señal en el frente norte» explica si sigue haciendo falta. Sin el, la tabla seria una lista de cosas sueltas — que es lo que ya se puede leer mirando la maquina.';

comment on column public.maquina_agregados.hecho_por is
  'Quien hizo el trabajo. TEXTO LIBRE y no un empleado: quien monta una antena casi nunca es quien esta delante del computador, y de los tres casos reales —el taller de la esquina, el proveedor, un mecanico de la casa— dos no tienen ficha de nomina. Un desplegable de empleados obligaria a poner al mecanico que estaba mirando, que es peor que un hueco porque parece un dato. Distinto de `puesto_por`, que es quien lo anoto en el sistema.';

/* El disparador de normalizacion tiene que conocer los dos campos nuevos. */
drop trigger if exists trg_normalizar on public.maquina_agregados;
create trigger trg_normalizar
  before insert or update on public.maquina_agregados
  for each row execute function private.normalizar_texto(
    'nombre', 'serial', 'nota', 'motivo_retiro', 'motivo', 'hecho_por');

-- ---------------------------------------------------------------------------
-- La puerta pregunta las dos cosas
-- ---------------------------------------------------------------------------
/* La firma cambia: la vieja se va en la MISMA migracion. */
drop function if exists public.montar_agregado(bigint, text, bigint, text, numeric, date, numeric, text);

create or replace function public.montar_agregado(
  p_maquina_id  bigint,
  p_nombre      text,
  p_motivo      text,
  p_articulo_id bigint  default null,
  p_serial      text    default null,
  p_cantidad    numeric default null,
  p_fecha       date    default null,
  p_costo_usd   numeric default null,
  p_hecho_por   text    default null,
  p_nota        text    default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id     bigint;
  v_estado text;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select estado into v_estado from public.maquinaria where id = p_maquina_id;
  if v_estado is null then
    raise exception 'Esa maquina no existe.' using errcode = '22023';
  end if;

  /*
    A UNA MAQUINA DESINCORPORADA NO SE LE MONTA NADA. Salio de la flota; anotarle
    una antena hoy diria que sigue operando, y la lista de «que lleva encima»
    dejaria de servir para lo unico que sirve: saber que hay que recuperar.
  */
  if v_estado = 'DESINCORPORADA' then
    raise exception 'Esa maquina esta desincorporada: ya no se le monta nada.'
      using errcode = '22023',
            hint = 'Si vuelve a la flota, primero se le cambia el estado explicando por que.';
  end if;

  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Hace falta decir que se le monto.'
      using errcode = '23514',
            hint = 'Una antena Starlink, unos cauchos 29.5, un blindaje de cabina.';
  end if;

  /*
    Y POR QUE. Christopher: «es importante indicar quien lo hizo o la razon de
    por que se modifico». El porque se exige; el quien se pide pero no se obliga,
    porque a veces de verdad no se sabe quien lo monto y un nombre inventado es
    peor que el hueco.
  */
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hace falta decir por que se modifico la maquina.'
      using errcode = '23514',
            hint = 'Para tener señal en el frente norte; el terreno rompia los cauchos normales.';
  end if;

  /* No se puede haber montado mañana. */
  if coalesce(p_fecha, private.hoy_aqui()) > private.hoy_aqui() then
    raise exception 'Esa fecha todavia no ha llegado.' using errcode = '22023';
  end if;

  insert into public.maquina_agregados
    (maquina_id, nombre, motivo, hecho_por, articulo_id, serial, cantidad,
     fecha, costo_usd, nota, puesto_por)
  values
    (p_maquina_id, p_nombre, p_motivo,
     nullif(btrim(coalesce(p_hecho_por, '')), ''),
     p_articulo_id, nullif(btrim(coalesce(p_serial, '')), ''),
     p_cantidad, coalesce(p_fecha, private.hoy_aqui()), p_costo_usd,
     nullif(btrim(coalesce(p_nota, '')), ''), auth.uid())
  returning id into v_id;

  return v_id;
end
$function$;

revoke all on function public.montar_agregado(bigint, text, text, bigint, text, numeric, date, numeric, text, text) from public;
grant execute on function public.montar_agregado(bigint, text, text, bigint, text, numeric, date, numeric, text, text) to authenticated;

comment on function public.montar_agregado(bigint, text, text, bigint, text, numeric, date, numeric, text, text) is
  'Anota algo que se le añade a una maquina y no venia con ella, con el porque —obligatorio— y quien hizo el trabajo. No mueve inventario: el caso corriente es que el agregado nunca paso por el almacen.';

-- ---------------------------------------------------------------------------
-- Y el historial cuenta las dos cosas
-- ---------------------------------------------------------------------------
/*
  EL CENTINELA DE ESTE BLOQUE SE ESCRIBIÓ MAL LA PRIMERA VEZ, y merece quedar
  escrito porque no dio error.

  Decía `if position('g.motivo' in v_def) > 0 then ... return;`, y `g.motivo` es
  PREFIJO de `g.motivo_retiro`, que ya estaba en la función desde el bloque de
  retiro. La condición fue cierta desde el primer momento: la migración salió por
  la puerta de «esto ya estaba hecho», no tocó nada, y devolvió un notice
  tranquilizador y un «success».

  Se cazó porque la comprobación en caliente miró el RESULTADO y no el «success»
  de la migración: el renglón del historial seguía diciendo «KIT-99812 · 1
  unidades · VA EN LA CABINA», sin el motivo y sin quién lo hizo.

  Un centinela que se puede cumplir por accidente no es un centinela. Ahora se
  busca `g.motivo,` con la coma, que solo existe en el texto nuevo.

  El motivo va DELANTE en el detalle porque es lo que se lee, y `persona` pasa a
  ser quien hizo el trabajo con `quien` —el que lo anotó— detrás: es el orden en
  que interesan.
*/
do $historial$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'hechos_de_maquina';

  if position('g.motivo,' in v_def) > 0 then
    raise notice 'el historial ya contaba el porque.';
    return;
  end if;

  v_def := replace(v_def,
'         concat_ws('' · '',
           nullif(g.serial, ''''),
           case when g.cantidad is not null
                then format(''%s unidades'', private.cantidad_es(g.cantidad)) end,
           nullif(g.nota, '''')),
         g.cantidad, null::text, 1::smallint, g.costo_usd,
         null::text, null::text, coalesce(pp.nombre, pp.usuario),',
'         concat_ws('' · '',
           g.motivo,
           nullif(g.serial, ''''),
           case when g.cantidad is not null
                then format(''%s unidades'', private.cantidad_es(g.cantidad)) end,
           nullif(g.nota, '''')),
         g.cantidad, null::text, 1::smallint, g.costo_usd,
         null::text, nullif(g.hecho_por, ''''), coalesce(pp.nombre, pp.usuario),');

  if position('g.motivo,' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca nada.';
  end if;

  execute v_def;
  raise notice 'el historial cuenta el porque y quien lo hizo.';
end $historial$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    motivo de tres letras : Hace falta decir por que se modifico la maquina.
    al montar ............: «Se le instaló ANTENA STARLINK» — PARA TENER SEÑAL EN
                            EL FRENTE NORTE · KIT-99812 · 1 unidades · VA EN LA
                            CABINA — lo hizo STARLINK VENEZUELA, lo anotó REVISION
    al quitar ............: «Se le quitó ANTENA STARLINK» — SE PASO A LA 0453 ·
                            lo llevó desde el 10/09/2026
    sin quién lo hizo ....: se admite, queda vacío
*/
