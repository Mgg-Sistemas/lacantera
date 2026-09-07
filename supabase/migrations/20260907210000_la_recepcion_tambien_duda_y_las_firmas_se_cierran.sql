/*
  LA RECEPCIÓN TAMBIÉN DUDA DEL PRECIO, Y LAS FIRMAS SE CIERRAN.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 7 de septiembre de 2026, por MCP, y probada en transacción
  deshecha sobre una orden real que estaba esperando recepción.
  ————————————————————————————————————————————————————————————————————————

  Dos hallazgos del carril de base de datos, verificados por este carril antes
  de tocar nada.

  ═══════════════════════════════════════════════════════════════════════════
  1. `registrar_recepcion` metía cualquier precio al libro
  ═══════════════════════════════════════════════════════════════════════════

  Es la puerta que faltaba, y el carril de base de datos se corrige a sí mismo
  al encontrarla: había dado esto por revisado suponiendo que «el número viene
  de una orden y ya lo miró alguien». Es una suposición sobre el proceso, no una
  lectura del código — el precio del renglón se teclea, y de ahí pasaba al libro
  sin que nada dudara:

      v_costo_usd := round(v_renglon.precio_unitario * v_tasa / v_tasa_usd, 6);
      perform private.registrar_movimiento( … v_costo_usd … );

  Lo que le confundió merece anotarse porque es un error de conteo fácil de
  repetir: esta función SÍ tiene reja —la del papel del proveedor, «sin factura
  o nota de entrega el material no entra»—. Esa comprueba que exista un
  documento, no que el precio sea sensato. **Son dos controles y los contó como
  uno.**

  Y va la tercera con la misma forma: el vale con destino escrito a mano, el
  traslado entre almacenes, y ahora la recepción. La comprobación existe y hay
  una puerta al lado que no pasa por ella. Ya no es un incidente: es un patrón,
  y la manera de cazarlo es enumerar TODAS las funciones que escriben en la
  misma tabla, no las que parecen relacionadas.

  La confirmación viaja EN EL RENGLÓN de `p_renglones` y no como parámetro
  nuevo: añadir un argumento crea una firma nueva que hay que soltar a mano, y
  eso ya mordió dos veces hoy.

  ═══════════════════════════════════════════════════════════════════════════
  2. Las nueve firmas manuscritas las bajaba cualquier sesión
  ═══════════════════════════════════════════════════════════════════════════

  La política de SELECT de `public.firmas` era, literalmente, `true`. Medido:
  `jlozada` sin NOMINA leía **0 empleados** y a la vez **las 9 firmas, 1.287 kB
  de imagen**.

  El daño no es «vio una fila que no debía»: una firma manuscrita en PNG se
  recorta y se pega en cualquier papel. Con ella se puede **fabricar un
  documento**, y ocho de las nueve son de trabajadores — con esas se firma haber
  cobrado la nómina y haber recibido una dotación.

  LO QUE SE CIERRA Y LO QUE NO, Y POR QUÉ

  Las de trabajadores se cierran a quien imprime los papeles que ellos firman:
  nómina, combustible y asignaciones. Son las tres pantallas que llaman a
  `useFirmas` para estampar una firma en un PDF; se comprobó una por una.

  La del firmante de la casa —una sola, la de quien firma lo que la empresa
  emite— **se queda abierta**, y se dice por qué: aparece en órdenes de compra,
  notas de salida y papeles de venta que se imprimen desde media docena de
  módulos. Cerrarla por permiso obligaría a enumerar esos módulos en la política
  y a volver aquí cada vez que aparezca uno nuevo, que es la clase de reja que
  se queda vieja sin que nadie lo note. Queda como **residuo consciente**, no
  como descuido.

  Medido después: sin permiso se ve 1 firma de 9, 47 kB de 1.287.
*/

do $guarda$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='registrar_recepcion') <> 1 then
    raise exception 'registrar_recepcion no es unica.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es, que usa el mensaje.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- Las firmas
-- ---------------------------------------------------------------------------
drop policy if exists firmas_lectura on public.firmas;

create policy firmas_lectura on public.firmas
for select to authenticated
using (
  perfil_id = (select auth.uid())
  or (perfil_id is not null and usar)
  or (empleado_id is not null and (
        private.tiene_permiso('NOMINA', 'LECTURA')
     or private.tiene_permiso('COMBUSTIBLE', 'LECTURA')
     or private.tiene_permiso('ASIGNACIONES', 'LECTURA')))
);

comment on table public.firmas is
  'Las firmas escaneadas. Las de trabajadores solo las ve quien imprime los papeles que firman —nomina, combustible, asignaciones—; una firma manuscrita se recorta y se pega, asi que no es una fila cualquiera.';

/*
  El cuerpo de `public.registrar_recepcion` con la reja puesta es el que devuelve
  `pg_get_functiondef` tras esta migracion. Se aplico por MCP parcheando el
  cuerpo vivo —regla 7— y lleva sus comentarios dentro.

      select pg_get_functiondef('public.registrar_recepcion(bigint,bigint,jsonb,text,date)'::regprocedure);

  Lo que se le anadio, justo antes de llamar al insertador: leer el costo
  promedio del par (almacen, articulo), comparar con el precio del renglon, y
  parar si se sale diez veces salvo que el renglon traiga `confirmado`. El
  mensaje respeta INVENTARIO.VER_VALORACION, igual que en las entradas: a quien
  no puede ver el costo se le dice QUE se sale, no CUANTO. Y el factor queda en
  `aviso_costo` del movimiento.
*/

/*
  COMPROBADO en transaccion deshecha, sobre la orden real que esperaba
  recepcion, con el renglon a 999.999 y el ATF viniendo de 6.074,64:

    recibir sin confirmar ... AVISA: «viene costando 6.074,6400 por unidad y en
                              esta orden entra a 999.999,0000: son 164,62 veces
                              mas»
    confirmando el renglon .. entran 10 a 999.999 y el movimiento queda marcado
                              con x164,62

  Y las firmas, quitandole a jlozada nomina, combustible y asignaciones:

    empleados que ve ........ 0
    firmas que ve ........... 1 de 9   (47 kB de 1.287)

  Al terminar: 19 movimientos, MOV-2026-0019, 7 renglones de orden, 0 papeles.
  Nada de produccion tocado.
*/
