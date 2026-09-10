/*
  LA VISTA DE MAQUINARIA NO DECÍA DE QUIÉN ERA LA MÁQUINA.

  Encontrado al ir a añadirle el operador: `v_maquinaria` no trae `propietario`.
  La columna se creó esta mañana, `guardar_maquina` la escribe y la ficha la
  pinta — pero la ficha lee de esta vista, así que siempre le llegaba nulo.

  Y eso no era solo que no se viera. El formulario hace
  `maquina.propietario ?? 'LACANTERA'`, o sea que al abrir un chuto de la
  gobernación el desplegable decía «La Cantera», y al guardar cualquier otra
  corrección —el año, una nota— se lo cambiaba de dueño sin que nadie lo pidiera.

  Hoy no llegó a hacer daño porque la única máquina cargada es nuestra, pero eso
  es suerte, no diseño.

  Se arregla añadiendo las columnas al final. Al final y no en medio porque
  `create or replace view` no deja reordenar ni renombrar lo que ya había: solo
  agregar detrás.

  La definición no se vuelve a teclear —son noventa líneas de cálculo de
  horómetros y semáforos que no tienen por qué pasar por mis dedos— sino que se
  parchea la que devuelve `pg_get_viewdef`, igual que se hace con las funciones.

  EL JOIN CON `empleados` ES POR FUERA A PROPÓSITO. La vista es
  `security_invoker`, así que si a alguien las políticas le esconden la nómina,
  con un join interior desaparecerían las máquinas. Por fuera, lo que desaparece
  es el nombre del conductor y la máquina se sigue viendo, que es el lado bueno
  del que fallar.
*/
do $vista$
declare v_def text;
begin
  select pg_get_viewdef('public.v_maquinaria'::regclass, true) into v_def;

  if position('m.propietario' in v_def) > 0 then
    raise notice 'v_maquinaria ya decia de quien es.';
    return;
  end if;

  v_def := replace(v_def,
'    m.foto_y
   FROM maquinaria m',
'    m.foto_y,
    m.propietario,
    m.operador_id,
    ((op.nombres || '' ''::text) || op.apellidos) AS operador,
    op.ficha AS operador_ficha
   FROM maquinaria m');

  v_def := replace(v_def,
'     LEFT JOIN almacenes a ON a.id = m.almacen_id;',
'     LEFT JOIN almacenes a ON a.id = m.almacen_id
     LEFT JOIN empleados op ON op.id = m.operador_id;');

  if position('m.propietario' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca la vista.';
  end if;

  execute 'create or replace view public.v_maquinaria as ' || v_def;
  raise notice 'v_maquinaria dice de quien es y quien la lleva.';
end $vista$;

/* `create or replace view` conserva los permisos, pero decirlo cuesta nada. */
grant select on public.v_maquinaria to authenticated;
