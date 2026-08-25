-- El mensaje de permiso denegado decía «Comprass».
--
-- En PL/pgSQL el hueco de `raise` es `%`, no `%s`. Yo escribí `%s`: el `%`
-- metía el texto y la `s` se quedaba pegada detrás.
--
--   No tienes permiso para aprobar la compra en Comprass.
--                                                      ^
--
-- Salía así en TODOS los mensajes de esta puerta, que es la que va a rejar las
-- ciento cincuenta casillas del catálogo.
--
-- Lo cazó un ensayo de punta a punta, no una lectura. Leyendo la función no se
-- ve: `%s` es lo que uno espera de tanto formato en otros lenguajes y el ojo lo
-- da por bueno. Solo aparece cuando alguien provoca el error y lee la frase
-- entera — que es, además, exactamente lo que va a leer quien se tope con ella
-- en la pantalla.

create or replace function private.exigir_accion(p_accion text)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $func$
declare
  v_nombre text;
  v_modulo text;
begin
  if private.puede_accion(p_accion) then
    return;
  end if;

  select a.nombre, m.nombre into v_nombre, v_modulo
    from public.acciones a
    join public.modulos  m on m.codigo = a.modulo
   where a.codigo = p_accion;

  -- El mensaje nombra la acción, no el código: quien lo lee es quien la
  -- intentó, no quien la programó.
  raise exception 'No tienes permiso para %.',
    coalesce(lower(v_nombre) || case when v_modulo is not null
                                     then ' en ' || v_modulo else '' end,
             'hacer eso')
    using errcode = '42501';
end;
$func$;
