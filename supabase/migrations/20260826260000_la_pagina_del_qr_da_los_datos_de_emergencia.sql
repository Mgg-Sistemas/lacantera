/*
  LA PÁGINA DEL QR DA LOS DATOS DE EMERGENCIA

  La líder los pidió: «mostrando contacto de emergencia, edad, dirección todo».
  Se le planteó a Christopher que eso sale a internet sin sesión —lo abre quien
  escanee, y también quien fotografíe un carnet ajeno, incluido el teléfono de
  un familiar que no trabaja aquí ni ha consentido nada— y lo confirmó. Queda
  escrito para que quien lea esto dentro de un año sepa que fue una decisión
  tomada con el riesgo delante, y no un descuido.

  ESTOS DATOS VAN EN VIVO, NO CONGELADOS AL EMITIR

  Es la diferencia con el nombre y el cargo, que sí se guardan tal como se
  imprimieron para que el plástico y la pantalla digan lo mismo. Aquí es al
  revés: el teléfono al que hay que llamar si alguien se cae en la planta tiene
  que ser el de HOY, no el que estaba en la ficha el día que se plastificó el
  carnet. Un teléfono viejo en una emergencia es peor que ninguno, porque se
  marca y se pierde el tiempo.

  LA EDAD, NO LA FECHA DE NACIMIENTO

  Se pide la edad y se da la edad, calculada al vuelo. La fecha exacta de
  nacimiento se usa para suplantar identidades y no le sirve a nadie en un
  portón ni en una emergencia. Y guardada envejecería mal sola.

  Y DEL EGRESADO SIGUE SIN SALIR NADA

  La regla de antes no cambia: quien ya no trabaja aquí conserva solo nombre,
  cédula y ficha. No hay ninguna emergencia de la empresa que atender con la
  dirección de casa de alguien que se fue.

  ENSAYADO EN UNA TRANSACCIÓN DESHECHA

  Con una ficha real: la edad sale 41 para quien nació en 1984, aparecen sangre,
  teléfono, dirección y contacto de emergencia, y al dar de baja al trabajador
  los cinco vuelven a nulo. Y por HTTP como `anon`, un código inexistente sigue
  devolviendo `{"existe": false}` y nada más.
*/

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
  select * into v_c
  from public.carnets
  where codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));

  if v_c.id is null then
    return jsonb_build_object('existe', false);
  end if;

  select * into v_e from public.empleados where id = v_c.empleado_id;

  v_ido := v_e.fecha_egreso is not null;

  v_causa := case
    when v_ido then 'EGRESADO'
    when v_c.estado = 'ANULADO' then 'ANULADO'
  end;

  return jsonb_build_object(
    'existe',  true,
    'vigente', v_c.estado = 'VIGENTE' and not v_ido,
    'causa',   v_causa,

    -- Lo impreso manda, para que el plástico y la pantalla digan lo mismo.
    'nombre',  coalesce(v_c.nombre_impreso, v_e.nombres || ' ' || v_e.apellidos),
    'cedula',  coalesce(v_c.cedula_impresa, v_e.cedula),
    'ficha',   coalesce(v_c.ficha_impresa, v_e.ficha),

    'cargo',        case when v_ido then null else coalesce(v_c.cargo_impreso, v_e.cargo) end,
    'departamento', case when v_ido then null else coalesce(v_c.departamento_impreso, v_e.departamento) end,
    'desde',        case when v_ido then null else v_e.fecha_ingreso end,
    'foto',         case when v_ido then null else v_c.foto_verificacion end,

    /*
      En vivo, y solo del que sigue trabajando aquí. La edad se calcula al
      vuelo: si se guardara, envejecería mal sola.
    */
    'edad', case
      when v_ido or v_e.fecha_nacimiento is null then null
      else extract(year from age(current_date, v_e.fecha_nacimiento))::int
    end,
    'direccion',           case when v_ido then null else nullif(btrim(coalesce(v_e.direccion, '')), '') end,
    'telefono',            case when v_ido then null else nullif(btrim(coalesce(v_e.telefono, '')), '') end,
    'sangre',              case when v_ido then null else nullif(btrim(coalesce(v_e.grupo_sanguineo, '')), '') end,
    'contacto_emergencia', case when v_ido then null else nullif(btrim(coalesce(v_e.contacto_emergencia, '')), '') end,
    'telefono_emergencia', case when v_ido then null else nullif(btrim(coalesce(v_e.telefono_emergencia, '')), '') end,

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
