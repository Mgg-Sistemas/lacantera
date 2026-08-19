-- ---------------------------------------------------------------------------
-- Lo que se sabe del proveedor se usa
--
-- LO QUE PASABA
--
-- La ficha del proveedor pregunta su condición de pago y la moneda con la que
-- cotiza, y después nadie las miraba: al cargar una cotización había que
-- volver a elegir las dos a mano, y al pagar también. Preguntar un dato y no
-- usarlo es peor que no preguntarlo — enseña que los campos de la ficha no
-- sirven para nada, y entonces se llenan de cualquier manera.
--
-- Y faltaba el tercero, que es el que más se necesita a la hora de pagar: cómo
-- cobra. Un proveedor cobra por transferencia, otro por pago móvil, otro pide
-- Zelle. Eso vivía en la cabeza de quien paga.
--
-- POR QUÉ ES UNA PREFERENCIA Y NO UNA REGLA
--
-- Se guarda como lo que suele hacer, no como lo que tiene que hacer. La
-- pantalla lo propone y quien paga puede cambiarlo: el proveedor que siempre
-- cobra por transferencia un día pide efectivo, y el sistema no puede
-- discutirlo. La utilidad está en no tener que acordarse, no en impedir.
-- ---------------------------------------------------------------------------
alter table public.proveedores
  add column if not exists metodo_pago_preferido text references public.metodos_pago(codigo);

comment on column public.proveedores.metodo_pago_preferido is
  'Cómo suele cobrar. Se propone al pagarle; no obliga. Nulo mientras no se '
  'sepa: proponer un método inventado hace que alguien lo acepte sin mirar.';

comment on column public.proveedores.condicion_pago is
  'Su condición habitual. Se propone al cargarle una cotización.';

comment on column public.proveedores.moneda_preferida is
  'La moneda con la que suele cotizar. Se propone al cargarle una cotización.';

-- ---------------------------------------------------------------------------
-- La función que guarda el proveedor, con el campo nuevo al final
--
-- Copiada de su definición viva. Solo se añade el parámetro y su validación:
-- el resto —la normalización del RIF, que acepta «J123456789» y guarda
-- «J-12345678-9» porque la gente lo escribe de las dos formas— se deja tal
-- cual estaba.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_proveedor(
  p_id bigint,
  p_rif text,
  p_nombre text,
  p_nombre_comercial text default null,
  p_contacto text default null,
  p_telefono text default null,
  p_correo text default null,
  p_direccion text default null,
  p_condicion_pago text default 'CONTADO',
  p_moneda_preferida character default 'USD',
  p_contribuyente_especial boolean default false,
  p_notas text default null,
  p_activo boolean default true,
  p_metodo_pago_preferido text default null
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rif text := upper(regexp_replace(coalesce(p_rif, ''), '\s', '', 'g'));
  v_id  bigint;
begin
  perform private.exigir_rol('COMPRAS');

  if v_rif ~ '^[VEJPGC][0-9]{9}$' then
    v_rif := substr(v_rif, 1, 1) || '-' || substr(v_rif, 2, 8) || '-' || substr(v_rif, 10, 1);
  end if;

  if v_rif !~ '^[VEJPGC]-[0-9]{8}-[0-9]$' then
    raise exception 'El RIF "%" no tiene forma válida. Se espera J-12345678-9.', p_rif
      using errcode = '22023';
  end if;

  if length(trim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'El nombre o razón social del proveedor es obligatorio.' using errcode = '22023';
  end if;

  -- El método tiene que existir y estar activo: proponer uno que ya nadie usa
  -- es peor que no proponer ninguno.
  if p_metodo_pago_preferido is not null then
    perform 1 from public.metodos_pago where codigo = p_metodo_pago_preferido and activo;
    if not found then
      raise exception 'El método de pago "%" no existe o está desactivado.', p_metodo_pago_preferido
        using errcode = '23503';
    end if;
  end if;

  if p_id is null then
    insert into public.proveedores
      (rif, nombre, nombre_comercial, contacto, telefono, correo, direccion,
       condicion_pago, moneda_preferida, contribuyente_especial, notas, activo, creado_por,
       metodo_pago_preferido)
    values
      (v_rif, trim(p_nombre), nullif(trim(coalesce(p_nombre_comercial, '')), ''),
       nullif(trim(coalesce(p_contacto, '')), ''), nullif(trim(coalesce(p_telefono, '')), ''),
       nullif(trim(coalesce(p_correo, '')), ''), nullif(trim(coalesce(p_direccion, '')), ''),
       p_condicion_pago, p_moneda_preferida, coalesce(p_contribuyente_especial, false),
       nullif(trim(coalesce(p_notas, '')), ''), coalesce(p_activo, true), (select auth.uid()),
       p_metodo_pago_preferido)
    returning id into v_id;
  else
    update public.proveedores set
      rif = v_rif,
      nombre = trim(p_nombre),
      nombre_comercial = nullif(trim(coalesce(p_nombre_comercial, '')), ''),
      contacto = nullif(trim(coalesce(p_contacto, '')), ''),
      telefono = nullif(trim(coalesce(p_telefono, '')), ''),
      correo = nullif(trim(coalesce(p_correo, '')), ''),
      direccion = nullif(trim(coalesce(p_direccion, '')), ''),
      condicion_pago = p_condicion_pago,
      moneda_preferida = p_moneda_preferida,
      contribuyente_especial = coalesce(p_contribuyente_especial, false),
      notas = nullif(trim(coalesce(p_notas, '')), ''),
      activo = coalesce(p_activo, true),
      metodo_pago_preferido = p_metodo_pago_preferido
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el proveedor %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya hay un proveedor registrado con el RIF %.', v_rif using errcode = '23505';
end;
$function$;

revoke execute on function public.guardar_proveedor(
  bigint, text, text, text, text, text, text, text, text, character, boolean, text, boolean, text)
  from public, anon;
grant execute on function public.guardar_proveedor(
  bigint, text, text, text, text, text, text, text, text, character, boolean, text, boolean, text)
  to authenticated;

-- La firma vieja quedaria como sobrecarga y PostgREST no sabria cual llamar.
drop function if exists public.guardar_proveedor(
  bigint, text, text, text, text, text, text, text, text, character, boolean, text, boolean);
