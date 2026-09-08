/*
  EL PAPEL QUE SE FIRMA DICE LO QUE SE CONTÓ.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada en transacción
  deshecha con una salida en bultos.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE VIENE

  Desde el 7 de septiembre el movimiento guarda lo que la persona contó —«7
  TAMBOR + 10 L»— al lado de lo que el sistema opera —«1.466 L»—. La nota de
  salida imprimía solo lo segundo, y `nota_de_salida` ni siquiera devolvía las
  tres columnas, así que el papel no podía decirlo aunque quisiera.

  Lo levantó la revisión de los bultos como MENOR y no lo es tanto: **quien
  entregó siete tambores y firma un papel que dice «1.466 L» no puede cotejar lo
  que firma con lo que sacó del estante.** Y ese papel es la única prueba de la
  entrega: si mañana falta material, es contra él que se compara.

  DÓNDE VA EN EL PAPEL, Y POR QUÉ NO EN COLUMNA PROPIA

  La tabla reparte ciento cincuenta milímetros exactos entre seis columnas y no
  sobra ninguno. Pero `tabla()` no recorta las celdas: las parte en renglones y
  ensancha la fila —eso se decidió en su día para que una categoría no quedara
  como «SEGURID...» para siempre en el archivador—. Así que el dato va detrás
  del nombre del material, se parte solo, y el papel no hay que rediseñarlo.

      BOTAS DE SEGURIDAD · se contó 3 PAR y 7

  SE SUELTA LA FIRMA, y es la quinta vez en dos días: añadir columnas a un
  `returns table` cambia el tipo de retorno, y eso `create or replace` no lo
  admite.
*/

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='inventario_movimientos'
                    and column_name='cantidad_capturada') then
    raise exception 'Falta inventario_movimientos.cantidad_capturada.';
  end if;
end $guarda$;

drop function if exists public.nota_de_salida(text);

create function public.nota_de_salida(p_numero text)
returns table (
  nota text, fecha date, almacen text, tipo text, motivo text,
  articulo_codigo text, articulo text, cantidad numeric, unidad text,
  costo_usd numeric, valor_usd numeric, registrado_en timestamp with time zone,
  cantidad_capturada numeric, unidad_capturada text, suelto_capturado numeric
) language plpgsql security definer set search_path to ''
as $function$
begin
  /*
    EL PAPEL QUE ALGUIEN FIRMA TIENE QUE DECIR LO QUE SE LE ENTREGO.

    Las tres columnas van NULAS cuando se conto directamente en la unidad de
    operacion, que es lo normal, y entonces el papel se imprime como siempre.
  */
  perform private.exigir_permiso('INVENTARIO', 'LECTURA');

  return query
  select m.nota_salida, m.fecha, a.nombre, m.tipo, m.nota,
         ar.codigo, ar.nombre, m.cantidad, m.unidad,
         m.costo_usd, m.valor_usd, m.registrado_en,
         m.cantidad_capturada, m.unidad_capturada, m.suelto_capturado
    from public.inventario_movimientos m
    join public.almacenes a  on a.id  = m.almacen_id
    join public.articulos ar on ar.id = m.articulo_id
   where m.nota_salida = p_numero
   order by m.id;
end;
$function$;

comment on function public.nota_de_salida(text) is
  'Los renglones de una nota de salida, para reimprimir el papel. Devuelve tambien lo que la persona conto —«7 TAMBOR + 10»— al lado de lo que el sistema opera: quien entrego siete tambores no puede cotejar un papel que solo dice «1.466 L», y ese papel es la unica prueba de la entrega.';

revoke execute on function public.nota_de_salida(text) from public, anon;
grant execute on function public.nota_de_salida(text) to authenticated;

/*
  COMPROBADO en transaccion deshecha: una entrada de 5 bultos y una salida de
  «3 bultos y 7 sueltos» de BOTAS DE SEGURIDAD (20 por PAR).

    NS-2026-0002
      EPP-0001 · 67,0000 PAR   [capturado: 3 PAR + 7]

  Al terminar: 19 movimientos, MOV-2026-0019, valor 868.927.307,04, 1 nota.
  Nada de produccion tocado.

  SE VE DE PASO el defecto del catalogo que ya esta en la lista: BOTAS DE
  SEGURIDAD tiene `unidad` PAR y `presentacion` PAR, asi que el papel dira «se
  contó 3 PAR y 7 PAR». Una caja de veinte pares no es un par.
*/
