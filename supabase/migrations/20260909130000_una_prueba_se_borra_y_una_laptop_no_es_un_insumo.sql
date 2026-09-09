/*
  UNA PRUEBA SE PUEDE BORRAR, Y UNA LAPTOP NO ES UN INSUMO.

  Dos cosas que levantó Christopher con la pantalla delante, y que resultan ser
  la misma pregunta hecha desde dos sitios: qué se puede corregir sin un
  programador y qué no.

  ═══════════════════════════════════════════════════════════════════════════
  1. LO QUE SE PUSO PARA PROBAR SE TIENE QUE PODER QUITAR
  ═══════════════════════════════════════════════════════════════════════════

  «Necesitamos que elimines de este item, el "Barril" pues fue puesto por
  prueba, pero unas botas no llegan en barril».

  Tenía razón y el sistema no le daba salida. Una forma de contar se podía
  APAGAR —`cambiar_estado_presentacion`— y eso es lo correcto para la que se usó:
  el papel viejo dice esa cantidad y tiene que seguir diciéndola. Pero para la
  que no se usó nunca, apagar deja basura visible para siempre: una fila tachada
  que no significa nada y que hay que explicarle a quien la vea dentro de un año.

  LA REGLA QUE SEPARA LOS DOS CASOS ya estaba escrita y solo había que
  apoyarse en ella: `private.presentacion_ya_se_uso` mira los movimientos, los
  renglones de orden y los de cotización, y devuelve DÓNDE se usó o nada. Si
  devuelve nada, la fila no sostiene ningún papel y se puede borrar. Si devuelve
  algo, se dice qué y se manda a apagar.

  Y no se deja borrar la que se propone por defecto sin tener otra: el artículo
  se quedaría sin forma sugerida y los formularios elegirían por su cuenta.

  ═══════════════════════════════════════════════════════════════════════════
  2. LA CATEGORÍA QUE FALTABA ERA UNA DE VERDAD
  ═══════════════════════════════════════════════════════════════════════════

  «¿Dónde puedo editar esta categoría? El caso es que se desea añadir una laptop
  y eso ya es un equipo electrónico o de oficina, la opción no está».

  La respuesta corta es que no se edita desde la pantalla, y eso no es un olvido.
  Se miró antes de contestar: **veintiún objetos de la base se ramifican
  comparando contra el valor literal de la categoría** —dieciocho funciones y
  tres vistas—. COMBUSTIBLE es lo que deja despachar en la pantalla de
  Combustible; PRODUCTO es lo que se puede vender y producir; SERVICIO es lo que
  no puede ser inventariable, y hay un CHECK que lo obliga. Esas palabras no son
  rótulos: son ramas del programa. Una categoría nacida desde un botón no daría
  error, se quedaría sin rama y nadie se enteraría.

  Pero la carencia que nombró Christopher es real y concreta, y ésa sí se
  atiende: hoy INS-0006 «COMPUTADORAS LAPTOP» está clasificada como INSUMO, que
  es lo mismo que un guante o un rollo de teflón. Así que se añade **EQUIPO**,
  con las cuatro decisiones que una categoría nueva obliga a tomar:

      cómo se llama en la lista .... «Equipo de oficina y cómputo»
      qué prefijo lleva su código .. EQU (EQU-0001, EQU-0002…)
      a qué clase de gasto cae ..... EQUIPOS, colgando de ADMINISTRATIVOS
      qué conducta especial tiene ... ninguna, y es lo que la hace segura

  LA CUARTA ES LA QUE IMPORTA. EQUIPO no habilita despachos, no se produce, no
  se vende, no fuerza retorno. Es una categoría que solo clasifica — por eso
  añadirla es barato y por eso las otras ocho no lo son.

  Se separa de la clase de gasto a propósito: `categorias_gasto` SÍ tiene puerta
  desde la pantalla (`guardar_categoria_gasto`), así que el rótulo «Equipos y
  cómputo» se puede corregir sin tocar la base. Lo que no se puede es inventar
  una categoría de artículo, y ahora se ve por qué son cosas distintas.
*/

-- ---------------------------------------------------------------------------
-- 1. Borrar una forma de contar que no dejó rastro
-- ---------------------------------------------------------------------------
create or replace function public.borrar_presentacion_de_articulo(p_id bigint)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_fila   record;
  v_donde  text;
  v_otras  integer;
begin
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  select ap.articulo_id, ap.presentacion, ap.por_defecto
    into v_fila
    from public.articulo_presentaciones ap
   where ap.id = p_id;

  if v_fila.articulo_id is null then
    raise exception 'Esa forma de contar ya no existe.' using errcode = 'P0002';
  end if;

  /*
    LA PREGUNTA NO ES SI ESTÁ APAGADA, ES SI SOSTIENE ALGÚN PAPEL.

    `presentacion_ya_se_uso` devuelve dónde se usó —movimientos, renglones de
    orden, renglones de cotización— o nada. Si sostiene algo, borrarla dejaría
    un asiento diciendo «3 BARRIL» sin nada detrás que explique qué era un
    barril de eso. Para ese caso está apagarla, que deja de ofrecerla sin tocar
    lo escrito.
  */
  v_donde := private.presentacion_ya_se_uso(v_fila.articulo_id, v_fila.presentacion);

  if v_donde is not null then
    raise exception 'No se puede borrar: % ya se usó %. Apágala en su lugar: deja de ofrecerse y lo ya escrito sigue igual.',
      v_fila.presentacion, v_donde
      using errcode = '23503';
  end if;

  /*
    Y NO SE DEJA AL ARTÍCULO SIN LA QUE SE PROPONE. Sin una por defecto, cada
    formulario elegiría por su cuenta cuál sugerir, que es como se teclea una
    cantidad en la forma equivocada sin darse cuenta.
  */
  if v_fila.por_defecto then
    select count(*) into v_otras
      from public.articulo_presentaciones ap
     where ap.articulo_id = v_fila.articulo_id and ap.id <> p_id and ap.activa;

    if v_otras > 0 then
      raise exception 'Ésa es la que se propone. Marca otra como propuesta antes de borrarla.'
        using errcode = '22023';
    end if;
  end if;

  delete from public.articulo_presentaciones where id = p_id;
end;
$function$;

comment on function public.borrar_presentacion_de_articulo(bigint) is
  'Borra una forma de contar de un articulo, y solo si no sostiene ningun papel: `private.presentacion_ya_se_uso` mira movimientos, renglones de orden y de cotizacion. La que si se uso se APAGA, no se borra —el asiento viejo dice esa cantidad y tiene que seguir diciendola—; la que se puso para probar y no se uso nunca se borra, porque apagarla dejaria una fila tachada que no significa nada. Tampoco deja al articulo sin la que se propone teniendo otras.';

grant execute on function public.borrar_presentacion_de_articulo(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. La categoría que faltaba
-- ---------------------------------------------------------------------------
do $categoria$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.articulos'::regclass
       and conname = 'articulos_categoria_check'
       and pg_get_constraintdef(oid) like '%EQUIPO%'
  ) then
    alter table public.articulos drop constraint articulos_categoria_check;
    alter table public.articulos add constraint articulos_categoria_check
      check (categoria = any (array[
        'PRODUCTO', 'REPUESTO', 'INSUMO', 'COMBUSTIBLE', 'LUBRICANTE',
        'EPP', 'HERRAMIENTA', 'EXPLOSIVO', 'SERVICIO', 'EQUIPO']));
    raise notice 'articulos.categoria acepta EQUIPO.';
  else
    raise notice 'articulos.categoria ya aceptaba EQUIPO.';
  end if;
end $categoria$;

/*
  EL PREFIJO, ESCRITO Y NO HEREDADO.

  `codigo_de_articulo` tiene una salida por defecto que recorta las tres
  primeras letras, y para EQUIPO daría EQU igualmente. Se escribe explícito de
  todos modos: la salida por defecto es una red para lo imprevisto, y una
  categoría que existe de verdad no debería depender de una red.
*/
do $prefijo$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'codigo_de_articulo';

  if position('''EQUIPO''' in v_def) = 0 then
    v_def := replace(v_def,
      '                 when ''EPP''         then ''EPP''',
      '                 when ''EPP''         then ''EPP''' || chr(10) ||
      '                 when ''EQUIPO''      then ''EQU''');
    execute v_def;
    raise notice 'codigo_de_articulo: EQUIPO -> EQU.';
  else
    raise notice 'codigo_de_articulo ya conocia EQUIPO.';
  end if;
end $prefijo$;

/*
  LA CLASE DE GASTO. Cuelga de ADMINISTRATIVOS y no de COMPRAS_INSUMOS: una
  laptop no es un insumo que se consume trabajando, es un bien que se queda. Y
  como `categorias_gasto` sí tiene puerta desde la pantalla, este rótulo se
  puede corregir sin volver aquí.
*/
insert into public.categorias_gasto (codigo, nombre, padre, orden, activa)
values ('EQUIPOS', 'Equipos y cómputo', 'ADMINISTRATIVOS', 235, true)
on conflict (codigo) do nothing;
