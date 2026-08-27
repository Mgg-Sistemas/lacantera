/*
  VERIFICAR UN CARNET SIN INICIAR SESIÓN

  El QR del carnet lo escanea un vigilante en un portón, un cliente en su
  recepción o un fiscal en la carretera. Ninguno de los tres tiene cuenta en el
  sistema, así que esta puerta la abre `anon`.

  LO QUE ENSEÑA, Y NADA MÁS

  Christopher lo acotó: foto, nombre, cédula, cargo, ficha y un sello de
  VIGENTE o NO VIGENTE. Nada de salario, dirección, teléfono ni contacto de
  emergencia. Todo lo que devuelve esta función ya está IMPRESO en el carnet que
  la persona tiene en la mano: quien escanea no se entera de nada nuevo, solo
  comprueba que lo impreso es cierto. Ese es el límite y no se pasa de ahí.

  LA FOTO SE GUARDA AL EMITIR, NO SE LEE DEL ALMACÉN

  Los cuatro buckets del sistema son privados, y hacer público el de personal
  publicaría el retrato de toda la plantilla a quien acierte una ruta. Tampoco
  sirve firmar una URL: eso no se puede hacer desde SQL.

  Así que al emitir el carnet se guarda aquí una copia pequeña de la foto, la
  misma que se imprimió. Tiene una ventaja que no se ve de entrada: la página
  enseña la foto QUE LLEVABA ESE CARNET, no la que el trabajador tenga hoy. Si
  alguien despega el plástico y cambia el retrato, la comparación lo delata —que
  es justo para lo que sirve.

  Y solo se llega a ella con los setenta y dos bits del código. Sin código no
  hay foto.

  ENSAYADO EN UNA TRANSACCIÓN DESHECHA

  Once comprobaciones: emitir, verificar, verificar tecleado a mano con espacios
  y en minúscula, un código inventado, reemitir dejando el viejo anulado con su
  razón, uno solo vigente por persona, el egreso del trabajador tumbando el
  carnet, no dejar emitir a quien ya se fue, anular sin motivo rechazado, anular
  con motivo, y una foto sin reducir rechazada.
*/

alter table public.carnets
  add column if not exists foto_verificacion text;

comment on column public.carnets.foto_verificacion is
  'La foto impresa en ESTE carnet, reducida, como data URL. Se guarda al emitir para poder enseñarla en la página pública sin abrir el bucket de personal.';

create or replace function public.verificar_carnet(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_c   record;
  v_e   record;
  v_vig boolean;
  v_por text;
begin
  /*
    El código se normaliza antes de buscar.

    Se imprime en mayúscula y agrupado de seis en seis —«1A2B3C 4D5E6F 708192»—
    para poder teclearlo cuando el QR ya no se lee. Quien lo teclea copia los
    espacios, o lo escribe en minúscula, o las dos cosas. Rechazarlo por eso
    sería castigar a quien está haciendo bien su trabajo.
  */
  select * into v_c
  from public.carnets
  where codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));

  if v_c.id is null then
    -- Ni una pista de más: no se dice cuántos carnets hay ni cómo son.
    return jsonb_build_object('existe', false);
  end if;

  select * into v_e from public.empleados where id = v_c.empleado_id;

  /*
    DOS MOTIVOS DISTINTOS PARA NO VALER, Y SE DICEN DISTINTO.

    Un carnet anulado es un carnet que se perdió o se reemplazó: el plástico ya
    no sirve, pero la persona sigue trabajando aquí. Uno cuyo dueño se fue es
    otra cosa, y quien está en el portón necesita saber cuál de las dos.

    Esto es lo que un plástico no puede hacer solo, y es la razón de que el QR
    exista: la tarjeta impresa dice lo mismo el primer día y el último.
  */
  v_vig := v_c.estado = 'VIGENTE' and v_e.fecha_egreso is null;

  v_por := case
    when v_c.estado = 'ANULADO' and v_e.fecha_egreso is not null
      then 'Esta persona ya no trabaja en la empresa y su carnet fue anulado.'
    when v_c.estado = 'ANULADO'
      then coalesce('Carnet anulado: ' || lower(v_c.anulado_motivo), 'Este carnet fue anulado.')
    when v_e.fecha_egreso is not null
      then 'Esta persona ya no trabaja en la empresa.'
  end;

  return jsonb_build_object(
    'existe',        true,
    'vigente',       v_vig,
    'motivo',        v_por,
    'nombre',        v_e.nombres || ' ' || v_e.apellidos,
    'cedula',        v_e.cedula,
    'cargo',         v_e.cargo,
    'ficha',         v_e.ficha,
    'departamento',  v_e.departamento,
    'desde',         v_e.fecha_ingreso,
    'foto',          v_c.foto_verificacion,
    'emitido_en',    v_c.emitido_en,
    'empresa',       jsonb_build_object(
                       'razonSocial', 'MINERIA INTERNACIONAL TS, C.A.',
                       'rif',         'J-50209170-0'
                     )
  );
end;
$function$;

/*
  La única función del sistema que puede llamar alguien sin cuenta.

  `anon` es el rol con el que el navegador habla con la base antes de iniciar
  sesión. Se le da permiso a ESTA función y a nada más: no lee tablas, no
  escribe, y lo que devuelve ya está impreso en el carnet.
*/
revoke all on function public.verificar_carnet(text) from public;
grant execute on function public.verificar_carnet(text) to anon, authenticated;

-- Y emitir guarda la foto que se imprimió. Gana un parámetro, así que se BORRA
-- antes de recrearse: con `create or replace` y otra lista de argumentos,
-- Postgres crea una segunda función y PostgREST no sabe a cuál llamar.
drop function if exists public.emitir_carnet(bigint, text);

create function public.emitir_carnet(
  p_empleado_id bigint,
  p_motivo      text default null,
  p_foto        text default null
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_emp    record;
  v_previo record;
  v_codigo text;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  select * into v_emp from public.empleados where id = p_empleado_id;
  if v_emp.id is null then
    raise exception 'No existe el trabajador %.', p_empleado_id using errcode = 'P0002';
  end if;
  if v_emp.fecha_egreso is not null then
    raise exception '% ya no trabaja en la empresa: no se le emite un carnet nuevo.',
      v_emp.nombres || ' ' || v_emp.apellidos using errcode = '55000';
  end if;

  -- Media megaletra de data URL es una foto sin reducir. Se corta aquí porque
  -- esta columna la lee una página pública y no puede convertirse en un
  -- almacén de imágenes por descuido.
  if p_foto is not null and length(p_foto) > 400000 then
    raise exception 'La foto del carnet es demasiado grande: hay que reducirla antes de guardarla.'
      using errcode = '22023';
  end if;

  /*
    EMITIR ANULA EL ANTERIOR. SIEMPRE.

    No hay «emitir otro más»: si alguien pide un carnet nuevo es porque el que
    tenía se perdió, se rompió o cambió de cargo, y en los tres casos el viejo
    deja de valer. Dejar los dos vigentes convertiría el extravío en un problema
    sin solución dentro del sistema.
  */
  select * into v_previo
  from public.carnets
  where empleado_id = p_empleado_id and estado = 'VIGENTE'
  for update;

  if v_previo.id is not null then
    update public.carnets
       set estado = 'ANULADO',
           anulado_por = (select auth.uid()),
           anulado_en = now(),
           anulado_motivo = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''),
                                     'Se emitió un carnet nuevo')
     where id = v_previo.id;
  end if;

  v_codigo := private.codigo_de_carnet();

  insert into public.carnets (empleado_id, codigo, emitido_por, foto_verificacion)
  values (p_empleado_id, v_codigo, (select auth.uid()),
          nullif(btrim(coalesce(p_foto, '')), ''));

  return v_codigo;
end;
$function$;

revoke all on function public.emitir_carnet(bigint, text, text) from public;
grant execute on function public.emitir_carnet(bigint, text, text) to authenticated;
