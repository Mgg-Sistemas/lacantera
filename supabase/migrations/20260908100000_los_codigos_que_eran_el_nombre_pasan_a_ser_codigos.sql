/*
  LOS CÓDIGOS QUE ERAN EL NOMBRE PASAN A SER CÓDIGOS.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP. **Esta migración CAMBIA DATOS
  DE PRODUCCIÓN**: renumera once artículos del catálogo. Christopher lo decidió
  expresamente el 8 de septiembre, con el parte delante.
  ————————————————————————————————————————————————————————————————————————

  QUÉ HABÍA

  Once de los quince artículos llevaban su propio nombre en el campo del código:

      ACEITE AGROFLUIDOS   ->  codigo = 'ACEITE AGROFLUIDOS'
      CABILLAS 3/8         ->  codigo = 'CABILLAS 3/8'
      ELECTRODO 6013/332   ->  codigo = 'ELECTRODO 6013/332'

  No fue un descuido de quien los cargó: `cargar_articulos_por_lote` EXIGÍA un
  código y quien llenó la planilla no tenía ninguno que escribir, así que copió
  el nombre. La regla que iba a evitar errores es la que los produjo, y se quitó
  el 7 de septiembre.

  El daño es que un código que es el nombre no distingue nada: el índice único
  deja pasar «VALVULINA 140» y «Valvulina  140» como dos artículos, porque son
  dos textos distintos. Christopher: «todos los items sin importar en qué
  almacén estén, deben manejar un código, debemos disminuir el porcentaje de
  error al respecto».

  POR QUÉ ESTO NO ROMPIÓ NADA, Y SE COMPROBÓ ANTES DE TOCAR

  Al decidirlo se dio por asumido el riesgo de que los papeles ya emitidos
  dejaran de coincidir. Medido, ese riesgo no existía:

    las claves foráneas .... las diecisiete que apuntan a `articulos` son por
                             `id`. Ninguna tabla guarda el código.
    la orden de compra ..... el PDF imprime `descripcion`, nunca el código.
    la nota de salida ...... el PDF SÍ imprime el código, pero no hay ni un
                             papel emitido para ninguno de los once.
    facturas y notas de
    entrega ................ cero renglones con estos artículos.

  Conviene decirlo así de claro porque la decisión se tomó aceptando un riesgo
  que luego resultó no estar: no fue suerte, fue que se midió después.

  EL CÓDIGO VIEJO SE GUARDA, y no por nostalgia

  `codigo_anterior` existe porque alguien pudo apuntar el viejo en una planilla
  suya o en un papel a mano, y esa persona no tiene por qué enterarse de que
  renumeramos. La búsqueda de artículos lo mira: escribir «ACEITE AGROFLUIDOS»
  sigue encontrando el artículo después de que pase a llamarse LUB-0001.

  DOS PASADAS, COMO LA CARGA POR PLANILLA

  La primera solo mira y devuelve el parte; la segunda escribe. Es la misma
  función a propósito: dos —una que revisa y otra que aplica— acabarían
  divergiendo el día que se añada una regla a una sola.

  Y el correlativo se pide SOLO al confirmar. Revisar tres veces gastaría tres
  números por artículo y dejaría huecos en la serie — el mismo cuidado que ya
  se tuvo en `cargar_articulos_por_lote`.

  QUIÉN FIGURA EN EL REGISTRO

  `revision.sistema`, no una persona. Esto no lo decidió nadie en su pantalla:
  lo hizo una corrección de catálogo, y el registro debe decir eso. Los once
  cambios quedan en la auditoría con su antes y su después.
*/

do $guarda$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='codigo_de_articulo') then
    raise exception 'Falta private.codigo_de_articulo, que es quien pone el codigo.';
  end if;
end $guarda$;

alter table public.articulos add column if not exists codigo_anterior text;

comment on column public.articulos.codigo_anterior is
  'El codigo que tenia antes de renumerarlo, cuando lo tuvo. Existe para que quien apunto el viejo en una planilla o en un papel a mano siga encontrando el articulo: la busqueda lo mira. Nulo en los que nunca cambiaron.';

create or replace function public.renumerar_codigos_que_son_el_nombre(p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_a      record;
  v_nuevo  text;
  v_filas  jsonb := '[]'::jsonb;
  v_n      int := 0;
begin
  /*
    Los articulos cuyo codigo es su propio nombre. Re-ejecutable: cuando no
    queda ninguno, no hace nada. Sin confirmar solo devuelve el parte.
  */
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  for v_a in
    select a.id, a.codigo, a.nombre, a.categoria
      from public.articulos a
     where upper(btrim(a.codigo)) = upper(btrim(a.nombre))
     order by a.categoria, a.nombre
  loop
    v_n := v_n + 1;

    -- El correlativo se pide SOLO al confirmar: revisar tres veces gastaria
    -- tres numeros por articulo y dejaria huecos en la serie.
    if p_confirmar then
      v_nuevo := private.codigo_de_articulo(v_a.categoria);

      update public.articulos
         set codigo = v_nuevo,
             codigo_anterior = v_a.codigo
       where id = v_a.id;
    else
      v_nuevo := '(se le pondrá uno de ' || v_a.categoria || ')';
    end if;

    v_filas := v_filas || jsonb_build_object(
      'id', v_a.id, 'nombre', v_a.nombre,
      'codigo_antes', v_a.codigo, 'codigo_ahora', v_nuevo);
  end loop;

  return jsonb_build_object('cuantos', v_n, 'aplicado', p_confirmar, 'filas', v_filas);
end;
$function$;

comment on function public.renumerar_codigos_que_son_el_nombre(boolean) is
  'Les pone codigo de verdad a los articulos cuyo codigo es su propio nombre, guardando el viejo en `codigo_anterior` para que quien lo apunto siga encontrandolos. Sin confirmar solo devuelve el parte. Es re-ejecutable: cuando no queda ninguno, no hace nada.';

revoke execute on function public.renumerar_codigos_que_son_el_nombre(boolean) from public, anon;
grant execute on function public.renumerar_codigos_que_son_el_nombre(boolean) to authenticated;

/*
  Y LA LLAMADA QUE SE HIZO, para que quede escrito que esta migracion cambio
  datos y no solo estructura. Va condicionada: cuando ya no queda ninguno
  —que es el caso en cuanto corre una vez— no hace nada.

  Si se aplica este archivo en una base limpia, renumera lo que encuentre; si se
  aplica sobre produccion otra vez, no encuentra nada y pasa de largo.
*/
do $aplicar$
declare v_pendientes int;
begin
  select count(*) into v_pendientes from public.articulos
   where upper(btrim(codigo)) = upper(btrim(nombre));

  if v_pendientes = 0 then
    raise notice 'No hay codigos que sean el nombre; no se toca nada.';
    return;
  end if;

  -- La cuenta de revision del sistema: esto no lo decidio una persona en su
  -- pantalla, lo hizo una correccion de catalogo.
  perform set_config('request.jwt.claims',
    json_build_object('sub','a021de44-445e-45dc-9af1-19d8060ab948','role','authenticated')::text, true);

  perform public.renumerar_codigos_que_son_el_nombre(true);
  raise notice 'Renumerados % articulos.', v_pendientes;
end $aplicar$;

/*
  COMPROBADO el 8 de septiembre, primero en transaccion deshecha y despues de
  verdad. El catalogo quedo asi:

    CT-GASOIL   GASOIL                        (no se toco: ya tenia codigo)
    EPP-0001    BOTAS DE SEGURIDAD            (no se toco)
    EPP-0002    LENTE DE SEGURIDAD            (no se toco)
    HE-0213     HERRAMIENTAS                  (no se toco)
    INS-0001    CABILLAS 3/8
    INS-0002    DISCOS DE TRAZADORAS DE 8P
    INS-0003    ELECTRODO 6013/332
    INS-0004    RELE TERMICO 23 A 32 AMP
    INS-0005    TIZA DE HERRERIA
    LUB-0001    ACEITE AGROFLUIDOS
    LUB-0002    ACEITE ATF DEXRON 3
    LUB-0003    ACEITE DE MOTOR SAE 50
    LUB-0004    ACEITE HIDRAULICO 68
    LUB-0005    GRASA MULTIUSO
    LUB-0006    VALVULINA 140

    once con codigo_anterior · cero que sigan siendo el nombre
    segunda vuelta: 0 pendientes (es re-ejecutable)

  Y lo que NO cambio: 15 articulos, 19 movimientos, MOV-2026-0019, valor
  868.927.307,04, 7 renglones de orden. Solo se movio el codigo.

  LOS CUATRO QUE NO SE TOCARON siguen sin seguir la convencion del generador
  —CT- en vez de CMB-, HE- en vez de HER-—. Se dejan: tienen codigo de verdad,
  que es lo que se pidio, y cambiarlos seria mover datos por estetica.
*/
