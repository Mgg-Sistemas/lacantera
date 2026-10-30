-- ═══════════════════════════════════════════════════════════════════════════
-- DE DÓNDE SALEN LAS FOTOS DE UN MOVIMIENTO
--
-- Christopher, 30/10/2026: un botón de reporte por WhatsApp para el libro de
-- movimientos, con fotos adjuntas igual que el de notas de entrega.
--
-- El problema: `inventario_movimientos` no guarda a qué papel con fotos
-- pertenece. Hay que encontrarlo cruzando tablas, y cada tipo de salida lo
-- guarda distinto:
--   · Una salida con su propio papel (NS-...) ya lo trae en `nota_salida` —no
--     hace falta cruzar nada.
--   · Una salida por despacho (la mayoría de lo que sale a un cliente) no trae
--     `nota_salida`: su nota de entrega nace directo de `aprobar_despacho`, y
--     el renglón que descontó ese movimiento queda en
--     `nota_entrega_renglones.movimiento_id`. De ahí a la nota, y de la nota a
--     la solicitud de despacho (SD-...) que sí tiene fotos.
--   · Una entrada, un ajuste, un reverso o un traslado interno no tiene papel
--     con fotos: no hay nada que cruzar, y el reporte sale sin ellas.
--
-- Se resuelve en una función de la base y no en el cliente porque
-- `fotos_de_carga` exige permiso de SALIDAS o FACTURACION según el origen
-- —correcto: las fotos del vehículo son de quien gestiona esa salida o ese
-- despacho—, y quien ve el libro de movimientos solo tiene por qué tener
-- permiso de INVENTARIO. La función cruza las tablas con sus propios
-- privilegios (`security definer`) y solo devuelve el número del papel, nunca
-- las fotos ni nada más de esas tablas.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.referencia_de_fotos_del_movimiento(p_movimiento_id bigint)
returns table (origen text, referencia text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nota_salida text;
  v_sd_numero   text;
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  select m.nota_salida into v_nota_salida
    from public.inventario_movimientos m
   where m.id = p_movimiento_id;

  if v_nota_salida is not null then
    origen := 'SALIDA';
    referencia := v_nota_salida;
    return next;
    return;
  end if;

  select sd.numero into v_sd_numero
    from public.nota_entrega_renglones r
    join public.notas_entrega n on n.id = r.nota_id
    join public.solicitudes_despacho sd on sd.nota_id = n.id
   where r.movimiento_id = p_movimiento_id
   limit 1;

  if v_sd_numero is not null then
    origen := 'DESPACHO';
    referencia := v_sd_numero;
    return next;
  end if;

  return;
end;
$$;

comment on function public.referencia_de_fotos_del_movimiento(bigint) is
  'A qué papel (NS-... o SD-...) hay que preguntarle las fotos de este movimiento, '
  'o ninguna fila si no nació de ninguno de los dos.';

revoke all on function public.referencia_de_fotos_del_movimiento(bigint) from public, anon;
grant execute on function public.referencia_de_fotos_del_movimiento(bigint) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Comprobación
--
-- Solo que la función quedó creada con la forma correcta. No se la llama
-- aquí: adentro exige sesión (`private.exigir_permiso`), y una migración
-- corre sin una —reventaría con «Sesión no válida» sin que signifique nada.
-- ───────────────────────────────────────────────────────────────────────────
do $ver$
begin
  if to_regprocedure('public.referencia_de_fotos_del_movimiento(bigint)') is null then
    raise exception 'referencia_de_fotos_del_movimiento no quedó creada.';
  end if;
end
$ver$;
