-- ============================================================================
-- CAMBIAR EL MONTO APLICADO A UNA NOTA ES PERMISO APARTE (11/11/2026)
--
-- Pedido: «darle el permiso a Genesis de enlazar y registrar pagos en este
-- módulo (Conciliación de pagos); lo único que no podrá es editar montos de
-- las notas enlazadas». Los permisos van por rol (desde el 09/11/2026), y se
-- decidió dárselo al rol «Analista de ventas» (VENTAS), que también tiene
-- Rafael Quilarquez.
--
--   · VENTAS.REGISTRAR_PAGOS pasa al rol VENTAS: registrar, importar, editar y
--     anular pagos, y enlazar o quitar notas.
--   · Nueva casilla VENTAS.CAMBIAR_MONTO_APLICADO: cambiar el monto aplicado a
--     una nota ya enlazada. Solo la tiene el ADMIN (que además lo puede todo).
--     La exige cambiar_monto_aplicado_pago y también asociar_notas_a_pago_
--     bancario cuando la nota ya estaba enlazada y el monto cambia —si no,
--     volver a enlazarla con otro monto sería la misma puerta por otro lado—.
--     Enlazar una nota nueva no la pide.
-- ============================================================================

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values (
  'VENTAS.CAMBIAR_MONTO_APLICADO', 'VENTAS',
  'Cambiar el monto aplicado a una nota enlazada',
  'En Conciliación de pagos: corregir cuánto de un pago del banco se aplica a una nota que ya está enlazada. Registrar y enlazar pagos es la otra casilla; esta mueve cuánto se da por cobrado de cada nota. No la concede ningún nivel de módulo.',
  61, null, true)
on conflict (codigo) do nothing;

insert into public.rol_acciones (rol, accion)
values ('ADMIN', 'VENTAS.CAMBIAR_MONTO_APLICADO'),
       ('VENTAS', 'VENTAS.REGISTRAR_PAGOS')
on conflict do nothing;

create or replace function public.cambiar_monto_aplicado_pago(p_enlace_id bigint, p_monto numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enlace public.pagos_bancarios_notas;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');
  perform private.exigir_accion('VENTAS.CAMBIAR_MONTO_APLICADO');

  select * into v_enlace from public.pagos_bancarios_notas where id = p_enlace_id for update;
  if v_enlace.id is null or v_enlace.quitado_en is not null then
    raise exception 'Esa nota ya no está asociada a ese pago.' using errcode = 'P0002';
  end if;
  if coalesce(p_monto, 0) <= 0 then
    raise exception 'El monto aplicado tiene que ser mayor que cero.' using errcode = '22023';
  end if;
  if round(p_monto, 2) > v_enlace.monto_aplicado then
    perform private.exigir_nota_no_cubierta_de_mas(v_enlace.nota_id, v_enlace.pago_id, round(p_monto, 2));
  end if;

  update public.pagos_bancarios_notas set monto_aplicado = round(p_monto, 2) where id = p_enlace_id;
end;
$$;

create or replace function public.asociar_notas_a_pago_bancario(p_pago_id bigint, p_notas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago  public.pagos_bancarios;
  v_item  jsonb;
  v_nota  public.notas_entrega;
  v_monto numeric;
  v_antes numeric;
begin
  perform private.exigir_accion('VENTAS.REGISTRAR_PAGOS');

  select * into v_pago from public.pagos_bancarios where id = p_pago_id for update;
  if v_pago.id is null then
    raise exception 'Ese pago no existe.' using errcode = 'P0002';
  end if;
  if v_pago.anulado_en is not null then
    raise exception 'Ese pago está anulado: no se le asocian notas.' using errcode = '55000';
  end if;
  if p_notas is null or jsonb_typeof(p_notas) <> 'array' or jsonb_array_length(p_notas) = 0 then
    raise exception 'No hay notas que asociar.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_notas) loop
    select * into v_nota from public.notas_entrega where id = (v_item ->> 'nota_id')::bigint for update;
    if v_nota.id is null then
      raise exception 'Una de las notas no existe.' using errcode = 'P0002';
    end if;
    if v_nota.estado = 'ANULADA' then
      raise exception 'La nota % está anulada: no se asocia a un pago.', v_nota.numero using errcode = '55000';
    end if;

    v_monto := round(coalesce(nullif(v_item ->> 'monto', '')::numeric,
                              private.nota_pendiente_en_moneda_del_pago(v_nota.id, p_pago_id)), 2);
    if coalesce(v_monto, 0) <= 0 then
      raise exception 'La nota % ya está cubierta por otros pagos. Si este pago es el suyo, quítela primero del otro.', v_nota.numero
        using errcode = '22023';
    end if;
    perform private.exigir_nota_no_cubierta_de_mas(v_nota.id, p_pago_id, v_monto);

    -- Ya enlazada: cambiarle el monto es la casilla aparte.
    select monto_aplicado into v_antes
      from public.pagos_bancarios_notas
     where pago_id = p_pago_id and nota_id = v_nota.id and quitado_en is null;
    if found and v_antes is distinct from v_monto then
      perform private.exigir_accion('VENTAS.CAMBIAR_MONTO_APLICADO');
    end if;

    update public.pagos_bancarios_notas
       set monto_aplicado = v_monto
     where pago_id = p_pago_id and nota_id = v_nota.id and quitado_en is null;

    if not found then
      insert into public.pagos_bancarios_notas (pago_id, nota_id, monto_aplicado, asociado_por)
      values (p_pago_id, v_nota.id, v_monto, (select auth.uid()));
    end if;
  end loop;
end;
$$;
