/*
  SALIDAS Y TRASLADOS SON SU PROPIO MÓDULO

  Christopher, 16/09/2026: «debemos extraer de inventario las salidas y los
  traslados, convirtiéndolos en un módulo que se alimenta de inventario».

  Lo pidieron los usuarios para ver las dos cosas juntas y poder contestar
  «¿cuántos X entregó tal almacenista a tal grupo entre tales fechas?».
  Inventario se queda con lo que es suyo —existencias, catálogo, conteos y el
  libro— y el módulo nuevo lee de ahí y escribe por las mismas puertas.

  PERMISOS ESPEJO, Y POR QUÉ NO SE REPARTE DE CERO

  Cada rol entra en SALIDAS con el nivel que ya tenía en INVENTARIO. El día de
  la mudanza nadie gana ni pierde acceso, que es la única forma de mover un
  módulo sin que alguien se quede fuera de su trabajo a las seis de la mañana.
  Repartir distinto se hace después, en la matriz, con calma.

  Y LAS DOS PUERTAS QUE ESCRIBEN PREGUNTAN POR EL MÓDULO NUEVO

  `registrar_salidas` y `solicitar_traslado` exigían el ROL ALMACEN. Con el rol,
  la matriz de permisos no manda: quien lo tiene entra aunque su módulo esté en
  NINGUNO. Ahora preguntan por SALIDAS en escritura, que con el espejo es
  exactamente la misma gente —ALMACEN tiene INVENTARIO en escritura y por tanto
  SALIDAS en escritura—, pero deja de mentir: si mañana se le quita el módulo a
  un rol, se le quita de verdad.

  Las otras tres puertas del traslado —aceptar, recibir y cancelar— no se tocan:
  ya preguntan por el responsable del almacén, con respaldo de Administrador y
  Gerente general, que es la regla que Christopher eligió también para aprobar
  una solicitud de salida.
*/
insert into public.modulos (codigo, nombre, descripcion, orden)
values ('SALIDAS', 'Salidas y traslados',
        'Lo que sale del almacén y lo que se mueve entre almacenes: por qué salió, para quién y quién lo entregó.',
        32)
on conflict do nothing;

insert into public.rol_permisos (rol, modulo, nivel)
select rp.rol, 'SALIDAS', rp.nivel
  from public.rol_permisos rp
 where rp.modulo = 'INVENTARIO'
on conflict do nothing;

-- La auditoría de un traslado pasa a leerse bajo el módulo nuevo. El libro de
-- movimientos se queda en INVENTARIO: ahí también entran las compras.
update public.auditoria_modulos set modulo = 'SALIDAS' where tabla = 'traslados';

do $mig$
declare
  v_firmas text[] := array[
    'public.registrar_salidas(bigint,jsonb,text,text,date,bigint,text,text)',
    'public.solicitar_traslado(bigint,bigint,bigint,numeric,text,date,numeric,text,numeric,text,boolean)'];
  v_def   text;
  v_ancla text := $a$perform private.exigir_rol('ALMACEN');$a$;
  v_nueva text := $n$perform private.exigir_permiso('SALIDAS', 'ESCRITURA');$n$;
  v_firma text;
begin
  foreach v_firma in array v_firmas loop
    v_def := pg_get_functiondef(v_firma::regprocedure);
    if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
      raise exception '%: la reja no aparece exactamente una vez', v_firma;
    end if;
    execute replace(v_def, v_ancla, v_nueva);
  end loop;
end
$mig$;

do $ver$
begin
  if not exists (select 1 from public.modulos m where m.codigo = 'SALIDAS') then
    raise exception 'el módulo no existe';
  end if;
  if exists (select 1 from public.rol_permisos i
              where i.modulo = 'INVENTARIO'
                and not exists (select 1 from public.rol_permisos s
                                 where s.modulo = 'SALIDAS' and s.rol = i.rol and s.nivel = i.nivel)) then
    raise exception 'el espejo de permisos no está completo';
  end if;
  if not exists (select 1 from public.auditoria_modulos where tabla = 'traslados' and modulo = 'SALIDAS') then
    raise exception 'la auditoría de los traslados sigue colgando de inventario';
  end if;
  if position('SALIDAS' in pg_get_functiondef('public.registrar_salidas'::regproc)) = 0
     or position('SALIDAS' in pg_get_functiondef('public.solicitar_traslado'::regproc)) = 0 then
    raise exception 'alguna puerta sigue preguntando por el rol y no por el módulo';
  end if;
end
$ver$;
