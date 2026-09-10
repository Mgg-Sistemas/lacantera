/*
  QUÉ TIENE CADA PERSONA A SU CARGO.

  Christopher: «en nómina - personal, se debe indicar si la persona tiene o no
  algún almacén, área o proceso a su cargo».

  El dato ya existe, repartido: `almacenes.responsable_id` desde esta mañana y
  `maquinaria.operador_id` desde hace un rato. Lo que faltaba era poder
  preguntarlo desde el otro lado — mirando a la persona en vez de mirando al
  sitio.

  Y es la pregunta que se hace de verdad cuando alguien renuncia: antes de firmar
  la liquidación hay que saber de qué responde, porque eso hay que entregarlo.

  ═══════════════════════════════════════════════════════════════════════════
  «ÁREA O PROCESO» TODAVÍA NO ES NADA EN ESTE SISTEMA, Y NO SE INVENTA
  ═══════════════════════════════════════════════════════════════════════════

  Él nombra tres cosas: almacén, área y proceso. Dos existen —los almacenes y las
  máquinas— y la tercera no: lo más parecido es `organigrama_nodos`, pero su
  `titular` es TEXTO LIBRE, no una ficha de empleado. Cruzarlo por nombre daría
  aciertos y fallos sin manera de distinguirlos, y un «no tiene nada a cargo»
  falso es peor que no contestar.

  Así que se contesta lo que se sabe y la pantalla dice qué está contando. Cuando
  las áreas tengan titular de verdad, se añade aquí y la pantalla no cambia.

  ═══════════════════════════════════════════════════════════════════════════
  ES FUNCIÓN Y NO VISTA, POR LAS POLÍTICAS
  ═══════════════════════════════════════════════════════════════════════════

  Una vista `security_invoker` sobre `almacenes` le devolvería cero almacenes a
  quien lleva nómina y no tiene INVENTARIO, y eso se leería como «no tiene nada a
  cargo». Una respuesta falsa, no una respuesta vacía — que es peor, porque no se
  distingue de la verdadera.

  Con `SECURITY DEFINER` y `exigir_permiso('NOMINA', 'LECTURA')`, quien puede ver
  la ficha de una persona ve de qué responde. Es el mismo criterio que ya usa
  `historial_maquina`.

  Y es `plpgsql` y no `sql` por la reja: en una función `sql` el `exigir_permiso`
  tendría que ir dentro del `where`, donde se evaluaría por fila o no se
  evaluaría en absoluto. La reja va antes del `return query`, que es donde esta
  casa la pone siempre.
*/
create or replace function public.a_cargo_de_empleados()
returns table (
  empleado_id bigint,
  almacenes   integer,
  maquinas    integer,
  detalle     text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  perform private.exigir_permiso('NOMINA', 'LECTURA');

  return query
  select e.id,
         coalesce(al.cuantos, 0)::integer,
         coalesce(mq.cuantas, 0)::integer,
         nullif(concat_ws(' · ', al.nombres, mq.codigos), '')
    from public.empleados e
    left join lateral (
      select count(*) as cuantos, string_agg(a.nombre, ', ' order by a.nombre) as nombres
        from public.almacenes a
       where a.responsable_id = e.id and a.activo
    ) al on true
    left join lateral (
      /* Las desincorporadas no cuentan: ya no hay de que responder. */
      select count(*) as cuantas, string_agg(m.codigo, ', ' order by m.codigo) as codigos
        from public.maquinaria m
       where m.operador_id = e.id and m.estado <> 'DESINCORPORADA'
    ) mq on true;
end
$function$;

revoke all on function public.a_cargo_de_empleados() from public;
grant execute on function public.a_cargo_de_empleados() to authenticated;

comment on function public.a_cargo_de_empleados() is
  'De que responde cada persona: cuantos almacenes lleva y cuantas maquinas tiene asignadas, con sus nombres. Lo pidio Christopher el 10/09/2026 para la pantalla de Personal, y la pregunta de verdad es la de una renuncia: antes de firmar la liquidacion hay que saber que hay que entregar. Es funcion y no vista porque una vista `security_invoker` sobre `almacenes` le devolveria cero a quien lleva nomina sin permiso de inventario, y eso se leeria como «no tiene nada a cargo» — una respuesta falsa, no una vacia. No incluye «areas o procesos»: `organigrama_nodos.titular` es texto libre y cruzarlo por nombre daria aciertos y fallos indistinguibles.';

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 una fila por persona ..: 26 de 26 empleados
    2 con dos almacenes y una máquina a su nombre:
        «2 almacenes, 1 maquinas: DEPOSITO DOS, DEPOSITO UNO · 123»
*/
