/*
  LOS CUERPOS QUE DE VERDAD CORREN, ESCRITOS DONDE SE PUEDEN RECONSTRUIR.

  GENERADO — no se edita a mano.

      node scripts/deriva.mjs <volcado.json> --volcar <este archivo>

  3 funciones cuyo cuerpo vivo no coincidia con el ultimo archivo que
  las crea. No cambia nada en la base: son los mismos cuerpos que ya corren,
  puestos donde reconstruir desde cero da lo mismo que hay.

  POR QUE APARECIO ESTA DIFERENCIA, que es lo unico interesante de este archivo:
  las migraciones de esta casa parchean con `pg_get_functiondef` + `replace` en
  vez de reescribir funciones de siete mil letras. El parche es correcto y el
  motivo es bueno —copiar a mano es lo que introduce diferencias—, pero deja el
  cuerpo repartido entre el archivo que la creo y los cinco que la tocaron
  despues. El archivo deja de servir para reconstruir aunque cada parche este
  bien.

  Lo levanto el carril de base de datos, tres veces en un dia, y la tercera con
  el diagnostico que lo explica: no es falta de cuidado, es que la verificacion
  se hace UNA VEZ al escribir y seis migraciones despues otra cosa toca la misma
  funcion. Un md5 comprobado el lunes no dice nada del miercoles.

  Por eso esto es generado y no transcrito: volcar la salida de Postgres no puede
  introducir una diferencia, y teclearla si.

  QUE SE COMPROBO ANTES DE GUARDARLO

  Cada cuerpo de aqui se comparo BYTE A BYTE contra `pg_proc.prosrc` de la base
  viva —no normalizado, no perdonando comentarios— y los 3 coinciden. Y el
  detector, que antes marcaba estas 3, pasa a cero.

  NO SE APLICO, Y ES A PROPOSITO

  Aplicarlo seria un no-op: son exactamente los cuerpos que ya corren, sacados de
  `pg_get_functiondef`. Su valor no esta en cambiar la base sino en que
  reconstruirla desde cero de lo mismo que hay.

  Y LA TRAMPA QUE ESO DEJA, dicha aqui para que no sorprenda: si manana otra
  migracion toca una de estas funciones y alguien corre ESTE archivo suelto,
  despues, la revierte al cuerpo de hoy. En orden no pasa —va fechado con su dia y
  detras de todo lo de ese dia—, pero un volcado no es una migracion normal y
  conviene saberlo antes de ejecutarlo a mano.
*/

-- public.cambiar_estado_articulo(p_id bigint, p_activo boolean)
-- venia de: 20260727145000_catalogo_y_correlativos.sql
CREATE OR REPLACE FUNCTION public.cambiar_estado_articulo(p_id bigint, p_activo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');
  /*
    UN ARTÍCULO SE DESACTIVA SIN NADA A MEDIAS. Antes se desactivaba sin mirar:
    con existencia en un patio, o dentro de una cotización enviada.
  */
  if not coalesce(p_activo, true)
     and exists (select 1 from public.articulos a where a.id = p_id and a.activo)
     and exists (select 1 from private.comprobar_desactivar_articulo(p_id) c where c.nivel = 'BLOQUEA') then
    raise exception 'No se puede desactivar todavía: %',
      (select string_agg(c.detalle, ' ' order by c.que)
         from private.comprobar_desactivar_articulo(p_id) c where c.nivel = 'BLOQUEA')
      using errcode = '55000';
  end if;

  update public.articulos set activo = p_activo where id = p_id;
end;
$function$;

-- public.cerrar_sitio(p_id bigint, p_fecha date, p_motivo text)
-- venia de: 20260916130000_plantas_rutas_y_viajes_que_se_aprueban.sql
CREATE OR REPLACE FUNCTION public.cerrar_sitio(p_id bigint, p_fecha date, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s public.sitios_operacion;
begin
  perform private.exigir_accion('EXPLOTACION.GESTIONAR_SITIOS');

  select * into v_s from public.sitios_operacion where id = p_id for update;
  if v_s.id is null then
    raise exception 'Ese sitio no existe.' using errcode = 'P0002';
  end if;
  if v_s.estado = 'CERRADO' then
    raise exception '«%» ya está cerrada desde el %.', v_s.nombre, to_char(v_s.cerrado_en, 'DD/MM/YYYY')
      using errcode = '55000';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Escribe por qué se cierra.' using errcode = '22023';
  end if;
  if p_fecha is null or p_fecha > private.hoy_aqui() then
    raise exception 'La fecha de cierre no puede ir en blanco ni ser del futuro.' using errcode = '22023';
  end if;

  if exists (select 1 from private.comprobar_cierre_de_sitio(p_id) c where c.nivel = 'BLOQUEA') then
    raise exception '«%» no se puede cerrar todavía: %', v_s.nombre,
      (select string_agg(c.detalle, ' ' order by c.que)
         from private.comprobar_cierre_de_sitio(p_id) c where c.nivel = 'BLOQUEA')
      using errcode = '55000',
            hint = 'La ventana de cierre enseña cada pendiente y dónde se resuelve.';
  end if;

  update public.sitios_operacion
     set estado = 'CERRADO', cerrado_en = p_fecha, motivo_cierre = btrim(p_motivo)
   where id = p_id;
end;
$function$;

-- public.guardar_almacen(p_id bigint, p_codigo text, p_nombre text, p_tipo text, p_ubicacion text, p_recibe_compras boolean, p_activo boolean, p_capacidad numeric, p_trabajos_a_la_vez smallint, p_propietario text, p_responsable_id bigint)
-- venia de: 20260915171000_los_traslados_que_de_verdad_corren.sql
CREATE OR REPLACE FUNCTION public.guardar_almacen(p_id bigint DEFAULT NULL::bigint, p_codigo text DEFAULT NULL::text, p_nombre text DEFAULT NULL::text, p_tipo text DEFAULT 'ALMACEN'::text, p_ubicacion text DEFAULT NULL::text, p_recibe_compras boolean DEFAULT false, p_activo boolean DEFAULT true, p_capacidad numeric DEFAULT NULL::numeric, p_trabajos_a_la_vez smallint DEFAULT NULL::smallint, p_propietario text DEFAULT NULL::text, p_responsable_id bigint DEFAULT NULL::bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id     bigint;
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  v_dueno  text := nullif(btrim(coalesce(p_propietario, '')), '');
begin
  perform private.exigir_permiso('INVENTARIO', 'ESCRITURA');

  if length(v_codigo) < 2 then
    raise exception 'El almacén necesita un código que lo identifique.' using errcode = '23514';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'El almacén necesita un nombre.' using errcode = '23514';
  end if;
  -- «En camino» lo lleva el sistema: ver `traslados`.
  if p_tipo = 'TRANSITO'
     or exists (select 1 from public.almacenes where id = p_id and tipo = 'TRANSITO') then
    raise exception '«En camino» lo lleva el sistema: es donde espera lo que va de un sitio a otro, y no se crea ni se edita a mano.'
      using errcode = '22023';
  end if;

  if p_tipo not in ('PATIO', 'ALMACEN', 'TALLER', 'COMBUSTIBLE', 'TRANSITO', 'PATIO_MAQUINAS') then
    raise exception 'Tipo de almacén no válido: %.', p_tipo using errcode = '22023';
  end if;

  if p_capacidad is not null and p_capacidad <= 0 then
    raise exception 'La capacidad tiene que ser mayor que cero.' using errcode = '22023';
  end if;

  -- La capacidad solo significa algo en un tanque: un patio no tiene tope y un
  -- almacén tampoco.
  if p_capacidad is not null and p_tipo <> 'COMBUSTIBLE' then
    raise exception 'Solo un tanque de combustible dice cuánto le cabe.'
      using errcode = '22023',
            hint = 'Un patio o un almacén no tienen tope: déjalo vacío.';
  end if;

  if p_trabajos_a_la_vez is not null and p_tipo <> 'TALLER' then
    raise exception 'Solo un taller dice cuántos trabajos aguanta a la vez.'
      using errcode = '22023';
  end if;

  /*
    EL DUEÑO SE COMPRUEBA AQUÍ Y NO SE DEJA A LA CLAVE FORÁNEA: «viola la
    restricción almacenes_propietario_fkey» no le sirve a nadie.
  */
  if v_dueno is not null
     and not exists (select 1 from public.propietarios d
                      where d.codigo = v_dueno and d.activo) then
    raise exception 'No hay ningún dueño que se llame "%".', v_dueno
      using errcode = '23503',
            hint = 'Hoy están La Cantera y la Gobernación.';
  end if;

  /* Y el responsable, por lo mismo: con el nombre delante se corrige sin salir. */
  if p_responsable_id is not null
     and not exists (select 1 from public.empleados e
                      where e.id = p_responsable_id and e.activo) then
    raise exception 'Ese empleado no existe o ya no está activo.'
      using errcode = '23503';
  end if;

  /*
    EL DUEÑO NO CAMBIA CON EL ALMACÉN LLENO. Reescribiría de quién es todo lo que
    hay dentro sin un solo asiento que lo explique.
  */
  if p_id is not null and v_dueno is not null then
    if exists (select 1 from public.almacenes a
                where a.id = p_id and a.propietario is distinct from v_dueno)
       and exists (select 1 from public.v_existencias e
                    where e.almacen_id = p_id and e.existencia <> 0) then
      raise exception 'No se puede cambiar de dueño un almacén que tiene cosas dentro.'
        using errcode = '22023',
              hint = 'Sácalo todo primero. Cambiarlo lleno reescribiría de quién es lo que hay sin dejar rastro de por qué.';
    end if;
  end if;

  /*
    UN PATIO SE DESACTIVA VACÍO Y SIN PENDIENTES. Antes se podía con material
    dentro, y ese material quedaba en un sitio que ya no se ofrecía para sacarlo.
  */
  if p_id is not null and not coalesce(p_activo, true)
     and exists (select 1 from public.almacenes a where a.id = p_id and a.activo)
     and exists (select 1 from private.comprobar_desactivar_almacen(p_id) c where c.nivel = 'BLOQUEA') then
    raise exception 'No se puede desactivar todavía: %',
      (select string_agg(c.detalle, ' ' order by c.que)
         from private.comprobar_desactivar_almacen(p_id) c where c.nivel = 'BLOQUEA')
      using errcode = '55000';
  end if;

  if p_id is null then
    insert into public.almacenes
      (codigo, nombre, tipo, ubicacion, recibe_compras, activo, capacidad,
       trabajos_a_la_vez, propietario, responsable_id)
    values
      (v_codigo, btrim(p_nombre), p_tipo,
       nullif(btrim(coalesce(p_ubicacion, '')), ''),
       coalesce(p_recibe_compras, false), coalesce(p_activo, true),
       p_capacidad, p_trabajos_a_la_vez, coalesce(v_dueno, 'LACANTERA'),
       p_responsable_id)
    returning id into v_id;
  else
    update public.almacenes
       set codigo = v_codigo,
           nombre = btrim(p_nombre),
           tipo = p_tipo,
           ubicacion = nullif(btrim(coalesce(p_ubicacion, '')), ''),
           recibe_compras = coalesce(p_recibe_compras, false),
           activo = coalesce(p_activo, true),
           capacidad = p_capacidad,
           trabajos_a_la_vez = p_trabajos_a_la_vez,
           propietario = coalesce(v_dueno, propietario),
           /*
             TAL CUAL Y NO CON coalesce: quitarle el responsable a un almacén es
             una decisión, y con coalesce mandar nulo se leería como «déjalo como
             está», así que el cargo no se podría soltar nunca.
           */
           responsable_id = p_responsable_id
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No existe el almacén %.', p_id using errcode = 'P0002';
    end if;
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un almacén con el código %.', v_codigo using errcode = '23505';
end;
$function$;
