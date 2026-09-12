/*
  LA CATEGORIA SE LEE EN LA PLANILLA COMO SE VE EN EL SISTEMA.

  Christopher, con el desplegable abierto: «¿dónde está el equipo de oficina?
  Necesita estar, y la categoría necesita aparecer en la planilla exactamente
  como en el sistema».

  Estaba: es EQUIPO. Pero la palabra «EQUIPO» no dice oficina, y quien busca
  dónde poner una laptop busca lo que la pantalla le enseña —«Equipo de oficina
  y cómputo»— y no lo encuentra. Ofrecer el código y esperar que alguien lo
  traduzca de cabeza es pedirle a la planilla que se explique sola.

  La función pasa a devolver las dos cosas: el código, que es lo que se guarda, y
  el nombre con el que se ve. La planilla ofrece el nombre; el cargador admite
  los dos, para que una planilla bajada antes de hoy siga entrando. Y sin tildes
  en la comparación, porque el desplegable las pone y quien teclea a mano casi
  nunca: rechazar una fila por un acento sería el peor de los motivos.

  Los códigos siguen saliendo del CHECK de la tabla, que es quien manda. Los
  nombres se escriben aquí porque el CHECK no los tiene, y al final se comprueba
  que ningún código se quede sin nombre: es lo que impide que añadir una
  categoría deje la planilla ofreciendo una lista con un hueco.

  Comprobado en caliente, sin escribir nada: entran «Equipo de oficina y
  cómputo», «equipo de oficina y computo» y «EQUIPO»; «MOBILIARIO» se rechaza
  listando los diez nombres.
*/

-- Cambia el tipo de retorno, así que hay que tirarla antes: `create or replace`
-- con otra firma añadiría una segunda función en vez de sustituirla.
drop function if exists public.categorias_de_articulo();

create function public.categorias_de_articulo()
returns table (codigo text, etiqueta text)
language sql
stable
security definer
set search_path to ''
as $function$
  select c.codigo,
         case c.codigo
           when 'PRODUCTO'    then 'Producto de cantera'
           when 'REPUESTO'    then 'Repuesto'
           when 'INSUMO'      then 'Insumo'
           when 'COMBUSTIBLE' then 'Combustible'
           when 'LUBRICANTE'  then 'Lubricante'
           when 'EPP'         then 'Equipo de protección'
           when 'HERRAMIENTA' then 'Herramienta'
           when 'EXPLOSIVO'   then 'Explosivo'
           when 'EQUIPO'      then 'Equipo de oficina y cómputo'
           when 'SERVICIO'    then 'Servicio'
         end as etiqueta
    from (
      select btrim(replace(replace(v, '''', ''), '::text', '')) as codigo
        from pg_constraint c
        cross join lateral unnest(
          regexp_split_to_array(
            substring(pg_get_constraintdef(c.oid) from 'ARRAY\[(.*)\]'), ',\s*')) as u(v)
       where c.conrelid = 'public.articulos'::regclass
         and c.contype = 'c'
         and pg_get_constraintdef(c.oid) like '%categoria = ANY%'
    ) c
   order by 2;
$function$;

revoke all on function public.categorias_de_articulo() from public;
grant execute on function public.categorias_de_articulo() to authenticated;

comment on function public.categorias_de_articulo() is
  'Las categorías que admite un artículo: el código, que sale del propio CHECK de la tabla, y el nombre con el que se ve en pantalla. La planilla ofrece el nombre —«EQUIPO» no dice oficina, y quien busca dónde poner una laptop busca lo que la pantalla le enseña— y el cargador admite los dos.';

do $mig$
declare
  v_def   text;
  v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cargar_articulos_por_lote';

  v_antes := v_def;
  v_def := replace(v_def, $t$  v_categoria text;$t$,
                          $t$  v_categoria text;
  v_cat_txt   text;$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 1 (declaracion) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    v_categoria := upper(btrim(coalesce(v_fila->>'categoria', '')));$t$,
    $t$    /*
      SE ESCRIBE EL NOMBRE, SE GUARDA EL CODIGO.

      La planilla ofrece «Equipo de oficina y computo» porque es lo que dice la
      pantalla; la tabla guarda EQUIPO. Aqui se traduce, admitiendo tambien el
      codigo para que una planilla bajada antes de hoy siga entrando.

      Sin tildes en los dos lados: el desplegable las pone y quien teclea a mano
      casi nunca, y rechazar una fila por un acento seria el peor de los motivos.

      Si no se reconoce, se queda el texto tal cual y la reja de abajo lo nombra
      con las palabras que la persona escribio.
    */
    v_cat_txt := upper(btrim(coalesce(v_fila->>'categoria', '')));
    v_categoria := coalesce(
      (select c.codigo from public.categorias_de_articulo() c
        where upper(c.codigo) = v_cat_txt
           or translate(upper(c.etiqueta), 'ÁÉÍÓÚÜÑ', 'AEIOUUN')
              = translate(v_cat_txt, 'ÁÉÍÓÚÜÑ', 'AEIOUUN')
        limit 1),
      v_cat_txt);$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 2 (lectura de la categoria) no encontrada.' using errcode = '22023';
  end if;

  v_antes := v_def;
  v_def := replace(v_def,
    $t$    /* La lista sale del CHECK de la tabla: ver `public.categorias_de_articulo`. */
    elsif not (v_categoria = any(public.categorias_de_articulo())) then
      v_motivo := format('«%s» no es una categoría del sistema. Las que hay: %s.',
        v_categoria, array_to_string(public.categorias_de_articulo(), ', '));$t$,
    $t$    /* La lista sale del CHECK de la tabla: ver `public.categorias_de_articulo`. */
    elsif not exists (select 1 from public.categorias_de_articulo() c
                       where c.codigo = v_categoria) then
      v_motivo := format('«%s» no es una categoría del sistema. Las que hay: %s.',
        v_cat_txt,
        (select string_agg(c.etiqueta, ', ' order by c.etiqueta)
           from public.categorias_de_articulo() c));$t$);
  if v_def = v_antes then
    raise exception 'ANCLA 3 (reja de la categoria) no encontrada.' using errcode = '22023';
  end if;

  execute v_def;
end
$mig$;

do $ver$
declare v_sin_nombre text; v_cuantas int;
begin
  /*
    NINGUN CODIGO PUEDE QUEDARSE SIN NOMBRE. Es lo que impide que añadir una
    categoria al CHECK deje la planilla ofreciendo una lista con un hueco.
  */
  select string_agg(c.codigo, ', '), count(*) into v_sin_nombre, v_cuantas
    from public.categorias_de_articulo() c where c.etiqueta is null;
  if v_cuantas > 0 then
    raise exception 'Estas categorias no tienen nombre para la planilla: %.', v_sin_nombre
      using errcode = '22023',
            hint = 'Añadelas al CASE de public.categorias_de_articulo.';
  end if;

  select count(*) into v_cuantas from public.categorias_de_articulo();
  if v_cuantas <> 10 then
    raise exception 'Se esperaban 10 categorias y salieron %.', v_cuantas using errcode = '22023';
  end if;

  if not exists (select 1 from public.categorias_de_articulo()
                  where codigo = 'EQUIPO' and etiqueta = 'Equipo de oficina y cómputo') then
    raise exception 'EQUIPO no salio con su nombre.' using errcode = '22023';
  end if;
end
$ver$;
