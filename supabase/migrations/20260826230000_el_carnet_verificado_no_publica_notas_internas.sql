/*
  TRES COSAS QUE ESTABAN MAL EN `verificar_carnet`, Y NO SE VEÍAN

  Salieron de someter el diseño de la página pública a tres propuestas
  independientes y nueve jueces. Las tres son de la base, no de la pantalla, y
  ninguna se habría notado dibujando.

  1. SE ESTABA PUBLICANDO UNA NOTA INTERNA EN INTERNET

  La función devolvía «Carnet anulado: » concatenado con `anulado_motivo`. Ese
  texto lo teclea alguien de nómina en una pantalla interna —«se lo robaron en
  el terminal», «se la dejó en el bar»— y acababa impreso en una página abierta,
  al lado de una cara y de una cédula. Ahora se devuelve una CAUSA, que es una
  de dos palabras fijas, y la nota se queda dentro.

  2. AL QUE YA NO TRABAJA AQUÍ SE LE PUBLICABA TODO

  Devolvía foto, cargo, departamento y fecha de ingreso de cualquiera, incluidos
  los que se fueron. Para quien está en el portón la decisión ya está tomada —no
  pasa— y comparar la cara no cambia nada: publicar el retrato y el puesto de un
  ex trabajador en una página abierta no compra seguridad, la regala. Ahora del
  egresado salen solo el nombre, la cédula y la ficha.

  Y cuando alguien está egresado Y con el carnet anulado, manda el egreso: es la
  causa que no tiene vuelta.

  3. SE DEVOLVÍAN LOS DATOS VIVOS, NO LOS IMPRESOS

  El plástico dice el cargo que la persona tenía el día que se imprimió. Si
  desde entonces cambió de puesto, la pantalla decía uno y el cartón otro, y
  quien compara ve una discrepancia donde no la hay — que es justo lo que esta
  página existe para evitar. Ahora la emisión guarda lo que se imprimió, igual
  que ya guardaba la foto.

  ENSAYADO EN UNA TRANSACCIÓN DESHECHA

  Cuatro casos: vigente con todo; cambiarle el cargo DESPUÉS de emitir y ver que
  la página sigue diciendo el impreso; anular con una nota larga y comprobar que
  ni una palabra de esa nota aparece en la respuesta; y dar de baja al trabajador
  para ver que manda el egreso y que se van la foto, el cargo, el departamento y
  la fecha de ingreso, quedando solo nombre, cédula y ficha.
*/

alter table public.carnets
  add column if not exists nombre_impreso       text,
  add column if not exists cedula_impresa       text,
  add column if not exists cargo_impreso        text,
  add column if not exists ficha_impresa        text,
  add column if not exists departamento_impreso text;

comment on column public.carnets.nombre_impreso is
  'Lo que decía el carnet el día que se imprimió. La página pública enseña esto y no el dato vivo: si la persona cambió de cargo, el plástico y la pantalla tienen que seguir diciendo lo mismo.';

create or replace function public.verificar_carnet(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_c     record;
  v_e     record;
  v_causa text;
  v_ido   boolean;
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

  v_ido := v_e.fecha_egreso is not null;

  /*
    UNA CAUSA, NO UNA FRASE. Y MANDA EL EGRESO.

    Sale una de dos palabras fijas y la escribe esta función, no una persona.
    Quien está en el portón actúa igual en los dos casos —no pasa— pero necesita
    saber cuál es: con «carnet anulado» el trabajador sigue siendo de la casa y
    hay que pedirle el nuevo; con «ya no trabaja aquí», no.
  */
  v_causa := case
    when v_ido then 'EGRESADO'
    when v_c.estado = 'ANULADO' then 'ANULADO'
  end;

  return jsonb_build_object(
    'existe',  true,
    'vigente', v_c.estado = 'VIGENTE' and not v_ido,
    'causa',   v_causa,

    -- Lo impreso manda; si el carnet es de antes de que se guardara, se cae al
    -- dato vivo, que es mejor que un hueco.
    'nombre',  coalesce(v_c.nombre_impreso, v_e.nombres || ' ' || v_e.apellidos),
    'cedula',  coalesce(v_c.cedula_impresa, v_e.cedula),
    'ficha',   coalesce(v_c.ficha_impresa, v_e.ficha),

    /*
      Y del que ya no trabaja aquí no sale nada más.

      No es discreción de más: la decisión ya está tomada, la cara no hay que
      compararla con nadie, y el retrato y el puesto de un ex trabajador en una
      página abierta en internet no le sirven a quien verifica.
    */
    'cargo',        case when v_ido then null else coalesce(v_c.cargo_impreso, v_e.cargo) end,
    'departamento', case when v_ido then null else coalesce(v_c.departamento_impreso, v_e.departamento) end,
    'desde',        case when v_ido then null else v_e.fecha_ingreso end,
    'foto',         case when v_ido then null else v_c.foto_verificacion end,

    'emitido_en', v_c.emitido_en,
    'empresa',    jsonb_build_object(
                    'razonSocial', 'MINERIA INTERNACIONAL TS, C.A.',
                    'rif',         'J-50209170-0'
                  )
  );
end;
$function$;

revoke all on function public.verificar_carnet(text) from public;
grant execute on function public.verificar_carnet(text) to anon, authenticated;

-- Y emitir guarda lo que se va a imprimir, igual que ya guardaba la foto.
create or replace function public.emitir_carnet(
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

  if p_foto is not null and length(p_foto) > 400000 then
    raise exception 'La foto del carnet es demasiado grande: hay que reducirla antes de guardarla.'
      using errcode = '22023';
  end if;

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

  insert into public.carnets
    (empleado_id, codigo, emitido_por, foto_verificacion,
     nombre_impreso, cedula_impresa, cargo_impreso, ficha_impresa, departamento_impreso)
  values
    (p_empleado_id, v_codigo, (select auth.uid()),
     nullif(btrim(coalesce(p_foto, '')), ''),
     v_emp.nombres || ' ' || v_emp.apellidos, v_emp.cedula,
     v_emp.cargo, v_emp.ficha, v_emp.departamento);

  return v_codigo;
end;
$function$;

revoke all on function public.emitir_carnet(bigint, text, text) from public;
grant execute on function public.emitir_carnet(bigint, text, text) to authenticated;
revoke execute on function public.emitir_carnet(bigint, text, text) from anon;
