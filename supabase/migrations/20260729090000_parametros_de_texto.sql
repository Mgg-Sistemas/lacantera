/*
  Parámetros que dicen algo en vez de valer algo.

  La tabla ya contemplaba la unidad TEXTO desde el principio, pero su columna
  `valor` es numeric: no había dónde escribirlo. Hasta ahora daba igual, porque
  todos los parámetros eran cifras de ley — el salario mínimo, el tope del
  IVSS, los días de utilidades.

  El recibo de pago obliga a guardar algo que no es un número: quién firma por
  la empresa. Y tiene que vivir en la base, no en el código, porque el día que
  cambie la persona eso lo corrige Recursos Humanos desde su pantalla, no un
  despliegue.

  Se aprovecha la vigencia que la tabla ya lleva. Un recibo de marzo lo firmó
  quien era jefa en marzo, y si en agosto hay otra, el papel de marzo no debe
  cambiar de firmante retroactivamente. Es la misma razón por la que aquí no se
  borra un parámetro: se cierra y se abre el siguiente.
*/

-- 1. La columna, y que cada unidad use la suya --------------------------------

alter table public.nomina_parametros
  add column if not exists valor_texto text;

alter table public.nomina_parametros
  alter column valor drop not null;

/*
  Un parámetro es un número o es un texto, nunca las dos cosas y nunca ninguna.
  Sin esta restricción se pueden guardar filas mudas —unidad TEXTO con el texto
  vacío— que el cálculo de nómina leería como cero.
*/
alter table public.nomina_parametros
  drop constraint if exists parametros_valor_segun_unidad;

alter table public.nomina_parametros
  add constraint parametros_valor_segun_unidad check (
    case
      when unidad = 'TEXTO'
        then valor is null and nullif(trim(valor_texto), '') is not null
      else valor is not null and valor_texto is null
    end
  );

-- 2. La RPC acepta ambos ------------------------------------------------------

/*
  Se reemplaza la firma anterior en vez de añadir una sobrecarga: dos funciones
  con el mismo nombre y distinto número de argumentos se eligen por resolución
  de tipos, y desde PostgREST un null sin castear vuelve ambigua la llamada.
*/
drop function if exists public.guardar_parametro_nomina(text, numeric, text, date, text, text);

create or replace function public.guardar_parametro_nomina(
  p_clave       text,
  p_unidad      text,
  p_desde       date,
  p_descripcion text,
  p_valor       numeric default null,
  p_texto       text    default null,
  p_fuente      text    default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id    bigint;
  v_texto text := nullif(trim(coalesce(p_texto, '')), '');
begin
  perform private.exigir_rol('RRHH');

  if p_unidad = 'TEXTO' then
    if v_texto is null then
      raise exception 'Un parámetro de texto necesita un valor escrito.';
    end if;
  elsif p_valor is null then
    raise exception 'Un parámetro de unidad % necesita un número.', p_unidad;
  end if;

  -- Se cierra la vigencia anterior en vez de borrarla: sin el histórico, una
  -- nómina de marzo recalculada en agosto usaría cifras que en marzo no
  -- existían.
  update public.nomina_parametros
     set vigencia_hasta = p_desde - 1
   where clave = p_clave and vigencia_hasta is null and vigencia_desde < p_desde;

  insert into public.nomina_parametros
    (clave, valor, valor_texto, unidad, vigencia_desde, descripcion, fuente, registrado_por)
  values (
    p_clave,
    case when p_unidad = 'TEXTO' then null else p_valor end,
    case when p_unidad = 'TEXTO' then v_texto else null end,
    p_unidad, p_desde, p_descripcion,
    nullif(trim(coalesce(p_fuente, '')), ''), (select auth.uid())
  )
  on conflict (clave, vigencia_desde) do update set
    valor = excluded.valor,
    valor_texto = excluded.valor_texto,
    unidad = excluded.unidad,
    descripcion = excluded.descripcion,
    fuente = excluded.fuente,
    registrado_por = excluded.registrado_por,
    registrado_en = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function
  public.guardar_parametro_nomina(text, text, date, text, numeric, text, text)
  from public, anon;

grant execute on function
  public.guardar_parametro_nomina(text, text, date, text, numeric, text, text)
  to authenticated;

-- 3. Quién firma por la empresa ----------------------------------------------

/*
  Se siembran los tres campos vacíos de contenido real y con una descripción que
  dice qué poner. Inventar un nombre aquí sería peor que dejarlo en blanco: el
  recibo saldría firmado por alguien que no existe y nadie lo notaría hasta
  tener el papel delante. El PDF omite la línea que esté sin llenar.
*/
insert into public.nomina_parametros
  (clave, valor, valor_texto, unidad, vigencia_desde, descripcion, fuente)
values
  ('RRHH_FIRMA_NOMBRE', null, 'Por definir', 'TEXTO', date '2026-01-01',
   'Nombre de quien firma los recibos de pago por la empresa.', null),
  ('RRHH_FIRMA_CARGO', null, 'Jefa de Recursos Humanos', 'TEXTO', date '2026-01-01',
   'Cargo que aparece bajo la firma en el recibo de pago.', null),
  ('RRHH_FIRMA_CEDULA', null, 'Por definir', 'TEXTO', date '2026-01-01',
   'Cédula de quien firma los recibos. Déjala en "Por definir" para no imprimirla.', null)
on conflict (clave, vigencia_desde) do nothing;
