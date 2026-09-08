/*
  LA FIRMA DE UN TRABAJADOR SE VE SI SE VE AL TRABAJADOR.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP. Corrige la reja que puse el 7,
  que no rejaba.
  ————————————————————————————————————————————————————————————————————————

  LO QUE PASÓ, Y EL ERROR ES DE MÉTODO

  El 7 de septiembre la política de `firmas` era literalmente `true` y la cambié
  por un OR de tres módulos: NOMINA, COMBUSTIBLE o ASIGNACIONES en LECTURA. Lo
  comprobé quitándole permisos a `jlozada` y midiendo que pasaba de 9 firmas a
  1, y lo di por cerrado.

  El carril de base de datos lo volvió a medir hoy, contra la población real:

      compras (NOMINA=NINGUNO, COMBUSTIBLE=ESCRITURA)
        empleados que ve ... 0
        firmas que ve ...... 9   (1.318.390 bytes)

  **Medí el mecanismo y no la población.** La reja funciona: rechaza a quien no
  tiene ninguna de las tres llaves. Lo que no comprobé es que los diez usuarios
  tienen alguna, así que no rechazaba a nadie.

  Es la segunda vez en dos días que cometo el mismo error —la otra fue dar por
  bueno el aviso del costo sin mirar que ALMACEN no ve valoraciones— y la forma
  es idéntica: comprobar que la regla distingue, sin comprobar **a quién**.

  QUÉ SE MIDIÓ ANTES DE ESCRIBIR ESTO

      exigir ESCRITURA en vez de LECTURA ..... pasan los 10. No sirve de nada.
      exigir solo NOMINA .................... pasan 8 de 10.
      «si ves al trabajador» ................ pasan 8 de 10, y los dos que
                                              caen son los que ven CERO
                                              empleados.

  Las dos últimas dan hoy el mismo resultado, porque ver un empleado es
  exactamente `tiene_permiso('NOMINA','LECTURA')`. Se elige la tercera igual, y
  por una razón concreta: **un OR de módulos se queda viejo sin que nadie lo
  note** —que es lo que acaba de pasar—, mientras que «si ves al trabajador»
  sigue siendo cierta aunque mañana cambie quién ve trabajadores.

  POR QUÉ NO ROMPE NADA

  Los dos que pierden las firmas de trabajador —`compras` y `administrador2`—
  ven cero empleados. No pueden elegir a quién imprimirle un vale ni una
  dotación, así que no tenían con qué usarlas.

  RESIDUO CONSCIENTE, y conviene tenerlo escrito

  Si mañana se le da COMBUSTIBLE a alguien SIN NOMINA para que emita vales, el
  vale saldrá sin la firma del trabajador y sin decir por qué: RLS no da error,
  devuelve cero filas. La respuesta correcta ese día no es volver a abrir esto:
  es que quien emite vales a un trabajador pueda ver a ese trabajador.

  La firma de la casa —la de quien firma lo que la empresa emite— se queda
  abierta, como el 7 de septiembre: aparece en órdenes de compra, notas de
  salida y papeles de venta que se imprimen desde media docena de módulos.
*/

do $guarda$
begin
  if not exists (select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid
                  join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname='public' and c.relname='empleados') then
    raise exception 'public.empleados no tiene politica: esta reja se apoya en la suya.';
  end if;
  if position('firmas' in coalesce((
        select string_agg(pg_get_expr(pol.polqual, pol.polrelid), ' ')
          from pg_policy pol join pg_class c on c.oid = pol.polrelid
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname='public' and c.relname='empleados'), '')) > 0 then
    raise exception 'La politica de empleados menciona firmas: apoyarse en ella seria recursivo.';
  end if;
end $guarda$;

drop policy if exists firmas_lectura on public.firmas;

create policy firmas_lectura on public.firmas
for select to authenticated
using (
  -- La tuya, siempre.
  perfil_id = (select auth.uid())
  -- La de la casa: va en ordenes, notas de salida y papeles de venta.
  or (perfil_id is not null and usar)
  /*
    Y la de un trabajador, solo si se ve a ese trabajador. La subconsulta hereda
    la politica de `empleados`, asi que esta regla no puede quedarse vieja: si
    manana cambia quien ve trabajadores, esto cambia con ella.
  */
  or (empleado_id is not null
      and exists (select 1 from public.empleados e where e.id = firmas.empleado_id))
);

comment on table public.firmas is
  'Las firmas escaneadas. La de un trabajador solo la ve quien ve a ese trabajador —la politica se apoya en la de `empleados` para no quedarse vieja—; una firma manuscrita se recorta y se pega, asi que no es una fila cualquiera. La de la casa se queda abierta: va en papeles de media docena de modulos.';

/*
  MEDIDO DESPUES, sobre los diez usuarios activos:

    admin_            26 empleados · 9 firmas
    administrador2     0 empleados · 1 firma    (antes 9)
    administradora_   26 empleados · 9 firmas
    compras            0 empleados · 1 firma    (antes 9)
    dorianne19        26 empleados · 9 firmas
    jlozada           26 empleados · 9 firmas
    leni12            26 empleados · 9 firmas
    revision.sistema  26 empleados · 9 firmas
    sistemas2         26 empleados · 9 firmas
    susi              26 empleados · 9 firmas

  Y LA LECCION, que vale mas que la politica: **medir el mecanismo no es medir
  la reja**. Una regla que distingue en el laboratorio y no distingue a nadie en
  produccion es una regla que no existe. La comprobacion buena es recorrer los
  usuarios reales, uno por uno, como hace el bloque de arriba.
*/
