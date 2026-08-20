-- ---------------------------------------------------------------------------
-- Lo que le pasa a una persona, anotado donde se busca
--
-- LO QUE HABÍA, Y POR QUÉ NO SERVÍA
--
-- «Incidencia» en este sistema significaba una cosa que le pasó a una
-- herramienta: perdida, dañada, repuesta. Sobre la persona no había nada.
--
-- Lo más parecido era `nomina_novedades.faltas_injustificadas`, y no sirve: es
-- **un número dentro de un período de nómina**. Dice que alguien faltó dos días
-- para poder restarlos del pago, y no dice cuándo, ni por qué, ni si estaba
-- enfermo. Una lesión en el trabajo o un altercado no caben ahí de ninguna
-- forma.
--
-- LA FORMA LA DIO CHRISTOPHER, CON DOS EJEMPLOS
--
--   Fecha · Conflicto verbal · Planta 01 · En la mañana · {participantes}
--          · Motivo: desacuerdo por uso de maquinaria
--
--   Fecha · Ausencia justificada por razón médica · Planta 01 · Todo el día
--          · Individual · Motivo: dificultad para respirar
--
-- De ahí salen las columnas: cuándo, de qué tipo, dónde, cuánto duró, con
-- quién, y por qué. «Individual» no es un valor: es no tener participantes.
--
-- LOS PARTICIPANTES VAN EN SU TABLA, NO EN UN ARREGLO
--
-- Un conflicto tiene dos lados y los dos son trabajadores del sistema. Con una
-- columna de texto se escribiría el nombre y quedaría suelto; con un arreglo de
-- identificadores no habría clave foránea que impida apuntar a alguien que no
-- existe. Con su tabla, el altercado aparece en la ficha de los dos.
--
-- LA LESIÓN LABORAL NO ES UNA NOTA INTERNA
--
-- En Venezuela un accidente de trabajo se declara al INPSASEL y abre reposo.
-- Por eso `dias_reposo` está aquí desde el principio: quien registre una lesión
-- va a necesitar ese dato después, y pedirlo cuando ya pasó es pedirlo tarde.
--
-- Lo que esto **no** hace es tocar la nómina. Una ausencia anotada aquí no
-- descuenta sola: eso cambia lo que cobra la gente y lo decide quien lleva la
-- nómina, en su período, a la vista. Enlazarlas es una conversación aparte.
-- ---------------------------------------------------------------------------
create table if not exists public.incidencias_personal (
  id            bigserial primary key,
  numero        text not null unique,
  empleado_id   bigint not null references public.empleados(id),
  fecha         date not null,
  tipo          text not null,
  lugar         text,
  momento       text not null default 'TODO_EL_DIA',
  -- Solo tiene sentido en lo que aparta a alguien del trabajo. Nulo en un
  -- conflicto: no se reposa de una discusión.
  dias_reposo   numeric(5,1),
  motivo        text not null,
  nota          text,
  registrado_por uuid references auth.users(id),
  registrado_en  timestamptz not null default now(),

  constraint incidencias_tipo_check check (tipo in (
    'CONFLICTO', 'ENFERMEDAD', 'LESION_LABORAL', 'ACCIDENTE_COMUN',
    'AUSENCIA_JUSTIFICADA', 'AUSENCIA_INJUSTIFICADA', 'LLEGADA_TARDE', 'OTRA')),

  constraint incidencias_momento_check check (momento in (
    'MANANA', 'TARDE', 'NOCHE', 'TODO_EL_DIA', 'VARIOS_DIAS')),

  constraint incidencias_motivo_dice_algo check (length(btrim(motivo)) >= 5),

  constraint incidencias_reposo_no_negativo check (dias_reposo is null or dias_reposo >= 0),

  -- Varios días sin decir cuántos deja un dato a medias que después nadie
  -- puede reconstruir.
  constraint incidencias_varios_dias_dice_cuantos check (
    momento <> 'VARIOS_DIAS' or dias_reposo is not null)
);

comment on table public.incidencias_personal is
  'Lo que le pasa a un trabajador: enfermedad, lesión en labores, ausencia, '
  'conflicto. No es la novedad de nómina —esa es un número para calcular un '
  'pago— sino el hecho, con su fecha, su sitio y su motivo.';

create index if not exists incidencias_personal_empleado
  on public.incidencias_personal (empleado_id, fecha desc);

-- ---------------------------------------------------------------------------
create table if not exists public.incidencia_participantes (
  incidencia_id bigint not null references public.incidencias_personal(id) on delete cascade,
  empleado_id   bigint not null references public.empleados(id),
  primary key (incidencia_id, empleado_id)
);

comment on table public.incidencia_participantes is
  'Los demás trabajadores metidos en la incidencia. Sin filas, la incidencia '
  'es individual — que es lo que quiere decir «Individual» en el papel.';

-- ---------------------------------------------------------------------------
alter table public.incidencias_personal   enable row level security;
alter table public.incidencia_participantes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where tablename='incidencias_personal' and policyname='incidencias_lectura') then
    create policy incidencias_lectura on public.incidencias_personal
      for select to authenticated
      using (private.tiene_permiso('NOMINA', 'LECTURA'));
  end if;

  if not exists (select 1 from pg_policies
                  where tablename='incidencia_participantes' and policyname='incidencia_participantes_lectura') then
    create policy incidencia_participantes_lectura on public.incidencia_participantes
      for select to authenticated
      using (private.tiene_permiso('NOMINA', 'LECTURA'));
  end if;
end $$;

-- Las tres tablas nuevas de agosto se quedaron sin auditoría por olvidarlo tres
-- veces seguidas. Aquí va desde el principio, y con la normalización que pone
-- el texto en mayúscula como en todo el sistema.
drop trigger if exists trg_auditar on public.incidencias_personal;
create trigger trg_auditar after insert or update or delete on public.incidencias_personal
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.incidencias_personal;
create trigger trg_normalizar before insert or update on public.incidencias_personal
  for each row execute function private.normalizar_texto('lugar', 'motivo', 'nota');

-- ---------------------------------------------------------------------------
create or replace function public.registrar_incidencia(
  p_empleado_id   bigint,
  p_fecha         date,
  p_tipo          text,
  p_motivo        text,
  p_lugar         text default null,
  p_momento       text default 'TODO_EL_DIA',
  p_dias_reposo   numeric default null,
  p_participantes bigint[] default null,
  p_nota          text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path to ''
as $function$
declare
  v_id  bigint;
  v_emp record;
  v_otro bigint;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  select * into v_emp from public.empleados where id = p_empleado_id;

  if v_emp.id is null then
    raise exception 'No existe ese trabajador.' using errcode = 'P0002';
  end if;

  if p_fecha > current_date then
    raise exception 'No se registra una incidencia con fecha futura.' using errcode = '22023';
  end if;

  -- Antes de entrar no puede haberle pasado nada aquí.
  if p_fecha < v_emp.fecha_ingreso then
    raise exception 'Esa fecha es anterior al ingreso de % (%).',
      v_emp.nombres || ' ' || v_emp.apellidos, to_char(v_emp.fecha_ingreso, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  insert into public.incidencias_personal
    (numero, empleado_id, fecha, tipo, lugar, momento, dias_reposo, motivo, nota, registrado_por)
  values
    (private.siguiente_numero('INC'), p_empleado_id, p_fecha, p_tipo,
     nullif(btrim(coalesce(p_lugar, '')), ''), coalesce(p_momento, 'TODO_EL_DIA'),
     p_dias_reposo, btrim(p_motivo), nullif(btrim(coalesce(p_nota, '')), ''),
     (select auth.uid()))
  returning id into v_id;

  foreach v_otro in array coalesce(p_participantes, array[]::bigint[]) loop
    -- El propio protagonista no es «otro participante»: ya es de quien es la
    -- incidencia, y duplicarlo la haría salir dos veces en su ficha.
    if v_otro is not null and v_otro <> p_empleado_id then
      insert into public.incidencia_participantes (incidencia_id, empleado_id)
      values (v_id, v_otro)
      on conflict do nothing;
    end if;
  end loop;

  return v_id;
end;
$function$;

comment on function public.registrar_incidencia is
  'Anota lo que le pasó a un trabajador. Los participantes son los demás '
  'metidos en el hecho; sin ellos la incidencia es individual.';

revoke execute on function public.registrar_incidencia(bigint, date, text, text, text, text, numeric, bigint[], text) from public, anon;
grant  execute on function public.registrar_incidencia(bigint, date, text, text, text, text, numeric, bigint[], text) to authenticated;

-- ---------------------------------------------------------------------------
create or replace view public.v_incidencias_personal as
select i.id,
       i.numero,
       i.empleado_id,
       e.nombres || ' ' || e.apellidos as empleado,
       e.ficha,
       i.fecha,
       i.tipo,
       i.lugar,
       i.momento,
       i.dias_reposo,
       i.motivo,
       i.nota,
       i.registrado_en,
       -- Los demás metidos en el hecho, con nombre para poder leerlo sin otra
       -- consulta. Vacío es «individual».
       coalesce(
         (select array_agg(o.nombres || ' ' || o.apellidos order by o.apellidos)
            from public.incidencia_participantes p
            join public.empleados o on o.id = p.empleado_id
           where p.incidencia_id = i.id),
         array[]::text[]) as participantes,
       coalesce(
         (select array_agg(p.empleado_id) from public.incidencia_participantes p
           where p.incidencia_id = i.id),
         array[]::bigint[]) as participantes_id
  from public.incidencias_personal i
  join public.empleados e on e.id = i.empleado_id;

alter view public.v_incidencias_personal set (security_invoker = on);

comment on view public.v_incidencias_personal is
  'Las incidencias con el nombre de quien las protagoniza y de quienes '
  'estuvieron. Un conflicto sale en la ficha de todos los implicados.';

grant select on public.v_incidencias_personal to authenticated;

-- ---------------------------------------------------------------------------
-- La dotación entregada, que es lo consumible que se llevó una persona
--
-- Vive en el libro de inventario, no en las asignaciones: se gastó, no se
-- presta. Estaba ahí desde siempre —`inventario_movimientos.empleado_id`— y no
-- había forma de leerlo por persona sin armar el JOIN a mano.
-- ---------------------------------------------------------------------------
create or replace view public.v_dotacion_entregada as
select m.id,
       m.numero,
       m.empleado_id,
       m.fecha,
       m.articulo_id,
       a.codigo as articulo_codigo,
       a.nombre as articulo,
       a.unidad,
       a.categoria,
       m.cantidad,
       al.nombre as almacen,
       m.nota
  from public.inventario_movimientos m
  join public.articulos a  on a.id = m.articulo_id
  join public.almacenes al on al.id = m.almacen_id
 where m.empleado_id is not null
   and m.tipo = 'SALIDA_CONSUMO'
   and m.signo = -1;

alter view public.v_dotacion_entregada set (security_invoker = on);

comment on view public.v_dotacion_entregada is
  'Lo consumible que se le entregó a cada persona: casco, guantes, uniforme, '
  'botas. No vuelve, así que no es una asignación — pero sí es algo que se le '
  'dio y que conviene poder mirar.';

grant select on public.v_dotacion_entregada to authenticated;
