/*
  LAS FOTOS DE LA MÁQUINA SE PUEDEN VER, AÑADIR Y QUITAR.

  Christopher, abriendo la ficha de la 44: «¿dónde está la foto o las fotos? En
  caso de que exista imagen deben ser mínimo dos, y se deben poder apreciar».

  Tenía razón por partida doble, y la primera parte es un fallo mío de bulto.

  ═══════════════════════════════════════════════════════════════════════════
  LAS FOTOS ESTABAN, Y NO SE VEÍAN POR NINGÚN LADO
  ═══════════════════════════════════════════════════════════════════════════

  El 10/09 se exigió que ninguna máquina naciera sin dos fotos, con el argumento
  de que «el día que se devuelva a su dueño o se discuta un golpe, lo que vale es
  lo que se fotografió al recibirla». La reja funcionó: las seis máquinas que
  cargaron esta mañana tienen sus doce fotos guardadas.

  Y la ficha no enseñaba ninguna. Solo mostraba la foto de perfil —esa sí, vacía—
  así que quien abría la ficha veía «Sin foto» sobre un registro fotográfico
  completo. Pedir un trabajo cuyo resultado nadie puede mirar es peor que no
  pedirlo: cuesta lo mismo y no sirve para lo único que tenía que servir.

  Eso se arregla en la pantalla. Lo que falta aquí son las dos puertas.

  ═══════════════════════════════════════════════════════════════════════════
  DOS PUERTAS QUE NO EXISTÍAN
  ═══════════════════════════════════════════════════════════════════════════

  `guardar_maquina` escribía las fotos del alta y nadie más tocaba esa tabla. O
  sea que una máquina que se repinta, que vuelve del taller con otra cara o que
  llega con una foto movida se quedaba con lo que tuviera para siempre.

  EL MÍNIMO SE DEFIENDE AL QUITAR, no solo al nacer. Si se pudiera bajar de dos,
  la regla del alta sería un peaje de un día: se entra con dos y al minuto
  siguiente se borra una. Una regla que solo se aplica al nacer no es una regla.
*/

create or replace function public.agregar_foto_maquina(
  p_maquina_id bigint,
  p_path       text,
  p_nota       text default null
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id     bigint;
  v_existe boolean;
  v_orden  smallint;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select true into v_existe from public.maquinaria where id = p_maquina_id;
  if v_existe is null then
    raise exception 'Esa maquina no existe.' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_path, ''))) = 0 then
    raise exception 'Falta la ruta de la foto.' using errcode = '23514';
  end if;

  /* Detras de la ultima, para que el orden de la ficha sea el de subida. */
  select coalesce(max(orden), 0) + 1 into v_orden
    from public.maquina_fotos where maquina_id = p_maquina_id;

  insert into public.maquina_fotos (maquina_id, path, nota, orden, subida_por)
  values (p_maquina_id, btrim(p_path),
          nullif(btrim(coalesce(p_nota, '')), ''), v_orden, auth.uid())
  returning id into v_id;

  return v_id;
end
$function$;

create or replace function public.quitar_foto_de_maquina(p_id bigint)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_maquina bigint;
  v_path    text;
  v_quedan  int;
begin
  perform private.exigir_permiso('MAQUINARIA', 'ESCRITURA');

  select maquina_id, path into v_maquina, v_path
    from public.maquina_fotos where id = p_id;
  if v_maquina is null then
    raise exception 'Esa foto no existe.' using errcode = '22023';
  end if;

  /*
    EL MINIMO SE DEFIENDE AQUI. La reja del alta pide dos fotos; si se pudiera
    bajar de dos despues, esa reja seria un peaje de un dia — se entra con dos y
    al minuto siguiente se borra una.
  */
  select count(*) into v_quedan from public.maquina_fotos where maquina_id = v_maquina;
  if v_quedan <= 2 then
    raise exception 'Una maquina no puede quedarse con menos de dos fotos.'
      using errcode = '22023',
            hint = 'Sube la nueva primero y despues quita la que sobra: asi nunca queda sin registro.';
  end if;

  delete from public.maquina_fotos where id = p_id;

  /* Se devuelve la ruta para que quien llama borre el fichero del almacen. */
  return v_path;
end
$function$;

revoke all on function public.agregar_foto_maquina(bigint, text, text) from public;
grant execute on function public.agregar_foto_maquina(bigint, text, text) to authenticated;
revoke all on function public.quitar_foto_de_maquina(bigint) from public;
grant execute on function public.quitar_foto_de_maquina(bigint) to authenticated;

comment on function public.agregar_foto_maquina(bigint, text, text) is
  'Añade una foto al registro de una maquina ya creada. Hacia falta porque `guardar_maquina` solo escribia las del alta y nadie mas tocaba la tabla: una maquina que se repinta o que vuelve del taller con otra cara se quedaba con lo que tuviera para siempre.';

comment on function public.quitar_foto_de_maquina(bigint) is
  'Quita una foto, y se niega a dejar la maquina con menos de dos. El minimo se defiende AQUI y no solo al nacer: si se pudiera bajar despues, la reja del alta seria un peaje de un dia. Devuelve la ruta para que quien llama borre el fichero del almacen.';

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 la máquina tiene ........: 2 fotos
    2 quitar una de dos .......: «Una maquina no puede quedarse con menos de dos
                                 fotos.»
    3 al añadir una tercera ...: 3 fotos, y entra con orden 21 — detrás de las del
                                 alta, que van de diez en diez
    4 con tres, quitar una ....: devuelve la ruta para borrar el fichero y quedan 2

  Y comprobado en pantalla: las dos fotos del TRACTOR 28HB57 se ven en la ficha, y
  en el visor se lee la placa en la carrocería, que es de lo que se trataba.
*/
