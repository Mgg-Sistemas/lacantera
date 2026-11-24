-- ============================================================================
-- COMBUSTIBLE · ENTRADA DIRECTA SOLO CON LITROS Y TANQUE (24/11/2026)
--
-- Al registrar una entrada de combustible en un tanque solo se indica el
-- tanque y cuántos litros ingresaron: no exige autorización, motivo escrito a
-- mano ni costo por litro obligatorio. Si no se pasa costo en un tanque
-- normal, conserva el costo promedio vigente del tanque (o cero si arranca
-- vacío).
-- ============================================================================

create or replace function public.combustible_registrar_entrada(
  p_almacen_id bigint,
  p_litros numeric,
  p_costo_litro numeric default null,
  p_sin_costo boolean default false,
  p_motivo text default null,
  p_referencia text default null,
  p_fecha date default null,
  p_hora time default null,
  p_recibidos numeric default null,
  p_merma_motivo text default null,
  p_autorizado text default null,
  p_ubicacion text default null,
  p_cuaderno boolean default false,
  p_cuaderno_litros numeric default null,
  p_confirmado boolean default false,
  p_articulo_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_factor constant numeric := 10;
  v_tanque public.almacenes;
  v_art    public.articulos;
  v_fecha  date := coalesce(p_fecha, private.hoy_aqui());
  v_motivo text := coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'ENTRADA DE COMBUSTIBLE AL TANQUE');
  v_costo  numeric;
  v_nota   text;
  v_ref    numeric;
  v_veces  numeric;
  v_msg    text;
  v_mov    bigint;
  v_merma  record;
  v_mmov   bigint;
  v_bidon  boolean;
  v_margen numeric;
  v_hora   time;
begin
  perform private.exigir_accion('COMBUSTIBLE.ENTRADA');

  v_tanque := private.combustible_tanque(p_almacen_id);
  select coalesce(t.es_bidon, false), coalesce(t.margen_merma_pct, 10) into v_bidon, v_margen
    from public.combustible_tanques t where t.almacen_id = p_almacen_id;
  if coalesce(v_bidon, false) then
    raise exception '«%» es un bidón: no guarda combustible. Lo que se le pasa se da por usado.', v_tanque.nombre
      using errcode = '22023';
  end if;

  select * into v_art from public.articulos
   where id = coalesce(p_articulo_id, private.combustible_articulo_del_tanque(p_almacen_id));
  if v_art.id is null or not v_art.activo then
    raise exception 'Ese combustible no existe o está inactivo.' using errcode = '23503';
  end if;
  if v_art.categoria <> 'COMBUSTIBLE' then
    raise exception '"%" no es combustible.', v_art.nombre using errcode = '22023';
  end if;

  if coalesce(p_litros, 0) <= 0 then
    raise exception 'Los litros que entran tienen que ser más que cero.' using errcode = '22023';
  end if;
  if v_fecha > private.hoy_aqui() then
    raise exception 'No se registra combustible con fecha futura.' using errcode = '22023';
  end if;

  if v_tanque.admite_sin_costo or coalesce(p_sin_costo, false) then
    v_costo := 0;
  else
    v_costo := coalesce(nullif(p_costo_litro, 0), private.costo_promedio(p_almacen_id, v_art.id), 0);
  end if;

  if not v_tanque.admite_sin_costo and not coalesce(p_sin_costo, false) and v_costo > 0 then
    v_ref := private.costo_promedio(p_almacen_id, v_art.id);
    if coalesce(v_ref, 0) > 0 then
      v_veces := round(v_costo / v_ref, 6);
      if v_veces >= c_factor or v_veces <= (1 / c_factor) then
        if not coalesce(p_confirmado, false) then
          v_msg := case when private.puede_accion('INVENTARIO.VER_VALORACION')
            then format('En «%s» el litro viene costando %s y lo estás metiendo a %s: son %s. Si es correcto, aceptalo y quedará anotado.',
                        v_tanque.nombre, private.numero_es(v_ref, 4), private.numero_es(v_costo, 4),
                        case when v_veces >= 1 then private.numero_es(v_veces, 2) || ' veces más'
                             else private.numero_es(v_ref / nullif(v_costo, 0), 2) || ' veces menos' end)
            else format('El costo del litro se sale mucho de lo que viene costando en «%s». Comprobalo con la factura; si es correcto, aceptalo y quedará anotado.',
                        v_tanque.nombre)
          end;
          raise exception '%', v_msg
            using errcode = '22023',
                  hint = 'Comprobá la factura y la moneda antes de aceptar: un cero de más aquí se arrastra a cada surtido.';
        end if;
      else
        v_veces := null;
      end if;
    end if;
  end if;

  select * into v_merma from private.combustible_merma_recepcion(p_litros, p_recibidos, v_margen);
  if coalesce(v_merma.o_merma, 0) > 0 then
    perform private.combustible_exigir_merma(p_almacen_id, v_merma.o_pct, v_merma.o_excede, p_merma_motivo);
  end if;

  v_nota := v_motivo;
  if nullif(btrim(coalesce(p_referencia, '')), '') is not null then
    v_nota := v_nota || ' · Ref.: ' || btrim(p_referencia);
  end if;
  if v_tanque.admite_sin_costo or coalesce(p_sin_costo, false) then
    v_nota := v_nota || ' · Sin costo para esta empresa.';
  end if;

  v_mov := private.registrar_movimiento(
    'ENTRADA_DIRECTA', 1::smallint, p_almacen_id, v_art.id, p_litros,
    v_costo,
    v_nota, null, null, null, v_fecha,
    p_aviso_costo => v_veces);

  v_hora := coalesce(p_hora, case when v_fecha = private.hoy_aqui()
                                  then (now() at time zone 'America/Caracas')::time end);

  insert into public.combustible_mov_datos
    (movimiento_id, hora, autorizado, ubicacion, observacion, cuaderno, cuaderno_litros)
  values
    (v_mov, v_hora,
     nullif(btrim(coalesce(p_autorizado, '')), ''),
     nullif(btrim(coalesce(p_ubicacion, '')), ''),
     v_motivo,
     coalesce(p_cuaderno, false),
     case when coalesce(p_cuaderno, false) then coalesce(p_cuaderno_litros, p_litros) end);

  if coalesce(v_merma.o_merma, 0) > 0 then
    v_mmov := private.combustible_escribir_merma_de(
      v_mov, p_almacen_id, v_art.id, v_merma.o_merma, v_merma.o_pct, v_merma.o_excede, p_merma_motivo,
      'entrada', 'del ' || to_char(v_fecha, 'DD/MM/YYYY'), v_fecha, v_hora,
      p_autorizado, p_ubicacion,
      (select m.propietario from public.inventario_movimientos m where m.id = v_mov));
  end if;

  return jsonb_build_object('movimiento_id', v_mov, 'merma_movimiento_id', v_mmov);
end;
$$;

notify pgrst, 'reload schema';
