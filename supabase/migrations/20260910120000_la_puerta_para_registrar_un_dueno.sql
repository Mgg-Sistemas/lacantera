/*
  LA PUERTA PARA REGISTRAR UN DUEÑO.

  Christopher, mirando lo que se entregó ayer: «no se apreció dónde ubicar lo de
  la gobernación o registrarlo».

  Tenía razón. La tabla `propietarios` nació con sus dos filas metidas a mano en
  la migración y sin ninguna manera de tocarla desde el sistema: el desplegable
  del almacén ofrecía «La Cantera» y «Gobernación» y no había forma de añadir el
  tercero. Y ya se sabe que va a haber un tercero — en la conversación de
  facturación aparecieron Rápido y la comunidad.

  ═══════════════════════════════════════════════════════════════════════════
  «QUIÉN SOMOS NOSOTROS» NO SE EDITA DESDE AQUÍ
  ═══════════════════════════════════════════════════════════════════════════

  `es_la_casa` no entra como parámetro. No es un olvido: de esa marca cuelga
  «cuánto vale lo NUESTRO», y moverla desde un formulario de catálogo cambiaría
  esa respuesta sin que nadie relacionara las dos cosas. El índice único la
  protege de haber dos; esto la protege de cambiar de sitio.

  Si algún día La Cantera se llamara de otro modo, se cambia el NOMBRE, que es
  lo que se lee. El código y la marca se quedan.

  ═══════════════════════════════════════════════════════════════════════════
  NI SE BORRA, NI SE CAMBIA EL CÓDIGO
  ═══════════════════════════════════════════════════════════════════════════

  El código es la clave primaria y de él cuelgan los almacenes y las máquinas.
  Se desactiva —deja de ofrecerse en los desplegables— y lo que ya apuntaba a él
  sigue apuntando, que es la verdad: esas sillas siguieron siendo de quien eran.

  Un dueño con material a su nombre no se puede desactivar. Si desapareciera de
  las listas, sus almacenes quedarían señalando un dueño que el sistema ya no
  ofrece, y el rótulo de la existencia diría un código en crudo.
*/
create or replace function public.guardar_propietario(
  p_codigo text,
  p_nombre text,
  p_activo boolean default true,
  p_orden  smallint default null
) returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_existe boolean;
  v_casa   boolean;
  v_cuelga int;
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if length(v_codigo) < 3 then
    raise exception 'El dueño necesita un código de al menos tres letras.'
      using errcode = '23514',
            hint = 'Sin espacios ni tildes: GOBERNACION, ALCALDIA, RAPIDO.';
  end if;
  if v_codigo !~ '^[A-Z0-9_]+$' then
    raise exception 'El código solo admite letras, números y guion bajo: %.', v_codigo
      using errcode = '22023';
  end if;
  if length(v_nombre) < 2 then
    raise exception 'El dueño necesita un nombre para poder leerlo en una lista.'
      using errcode = '23514';
  end if;

  select true, es_la_casa into v_existe, v_casa
    from public.propietarios where codigo = v_codigo;

  /*
    NOSOTROS NO NOS APAGAMOS. Sin la casa, «cuánto vale lo nuestro» se queda sin
    responder y ningún desplegable ofrecería la empresa que usa el sistema.
  */
  if coalesce(v_casa, false) and not coalesce(p_activo, true) then
    raise exception 'A la propia empresa no se la puede desactivar.'
      using errcode = '22023',
            hint = 'De esta marca cuelga «cuanto vale lo nuestro». Si cambio el nombre, cambia el nombre.';
  end if;

  if coalesce(v_existe, false) and not coalesce(p_activo, true) then
    select count(*) into v_cuelga
      from (select 1 from public.almacenes where propietario = v_codigo
            union all
            select 1 from public.maquinaria where propietario = v_codigo) t;
    if v_cuelga > 0 then
      raise exception 'No se puede desactivar: hay % almacenes o maquinas a nombre de %.',
        v_cuelga, v_nombre
        using errcode = '22023',
              hint = 'Si desapareciera de las listas, esos sitios señalarian un dueño que el sistema ya no ofrece.';
    end if;
  end if;

  insert into public.propietarios (codigo, nombre, activo, orden)
  values (v_codigo, v_nombre, coalesce(p_activo, true), coalesce(p_orden, 100::smallint))
  on conflict (codigo) do update
     set nombre = excluded.nombre,
         activo = excluded.activo,
         orden  = excluded.orden;
  -- `es_la_casa` no se toca en ninguna de las dos ramas, a proposito.

  return v_codigo;
end
$function$;

revoke all on function public.guardar_propietario(text, text, boolean, smallint) from public;
grant execute on function public.guardar_propietario(text, text, boolean, smallint) to authenticated;

comment on function public.guardar_propietario(text, text, boolean, smallint) is
  'Alta y correccion de un dueño de material. Nace porque Christopher no encontro donde registrar a la gobernacion: la tabla tenia sus dos filas metidas a mano en una migracion y ninguna puerta. No acepta `es_la_casa`: de esa marca cuelga «cuanto vale lo nuestro» y moverla desde un formulario de catalogo cambiaria esa respuesta sin que nadie relacionara las dos cosas. Tampoco borra: desactiva, y solo si no le cuelga ningun almacen ni maquina.';

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 nace ..................: RAPIDO
    2 se corrige el nombre ..: Rapido de Guayana
    3 apagar la casa ........: A la propia empresa no se la puede desactivar.
    4 apagar con un almacén .: No se puede desactivar: hay 1 almacenes o
                               maquinas a nombre de Rápido C.A.
    5 código con espacios ...: El código solo admite letras, números y guion
                               bajo: MI CASA.
    6 casas que quedan ......: 1
*/
