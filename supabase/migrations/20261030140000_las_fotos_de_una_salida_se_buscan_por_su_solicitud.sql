-- ═══════════════════════════════════════════════════════════════════════════
-- LAS FOTOS DE UNA SALIDA SE BUSCAN POR SU SOLICITUD, NO POR SU NOTA
--
-- Corrige `referencia_de_fotos_del_movimiento` (30/10/2026, misma tarde).
--
-- El error: para una salida con papel, la función usaba `nota_salida`
-- (NS-...) tal cual como referencia en `fotos_de_carga`. Pero las fotos de
-- una salida no cuelgan del NS: cuelgan del SS-... de la SOLICITUD que la
-- originó —son dos papeles distintos, y `ModalReporteSalida.tsx` ya lo hacía
-- bien, cruzando por `s.numero` y no por `s.nota_salida`—.
--
-- Encontrado el mismo 30/10/2026: Christopher adjuntó una foto a la
-- solicitud SS-2026-0111 (nota de salida NS-2026-0117, movimiento
-- MOV-2026-1256) y el reporte decía «0 fotos adjuntas» aunque la foto
-- estaba —se buscó con el número equivocado—.
--
-- El cruce que faltaba: `inventario_movimientos.nota_salida` ->
-- `solicitudes_salida.nota_salida` -> `solicitudes_salida.numero` (el SS-...
-- de verdad). Si un NS no viene de ninguna solicitud —una salida registrada
-- a mano, sin pasar por pedir/aprobar—, no hay SS que preguntarle y el
-- movimiento se queda sin fotos, igual que una entrada o un ajuste.
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
  v_ss_numero   text;
  v_sd_numero   text;
begin
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  select m.nota_salida into v_nota_salida
    from public.inventario_movimientos m
   where m.id = p_movimiento_id;

  if v_nota_salida is not null then
    select s.numero into v_ss_numero
      from public.solicitudes_salida s
     where s.nota_salida = v_nota_salida;

    if v_ss_numero is not null then
      origen := 'SALIDA';
      referencia := v_ss_numero;
      return next;
    end if;
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
  'A qué papel (SS-... o SD-...) hay que preguntarle las fotos de este movimiento, '
  'o ninguna fila si no nació de ninguno de los dos, o si su salida no vino de una solicitud.';

-- ───────────────────────────────────────────────────────────────────────────
-- Comprobación
-- ───────────────────────────────────────────────────────────────────────────
do $ver$
begin
  if to_regprocedure('public.referencia_de_fotos_del_movimiento(bigint)') is null then
    raise exception 'referencia_de_fotos_del_movimiento no quedó creada.';
  end if;
end
$ver$;
