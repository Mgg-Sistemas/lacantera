-- El «Teléfono de administración del proveedor» deja de pedirse al indicar el
-- método de pago (la dueña, 08/11/2026: «quítame esto»).
--
-- Vacío ya no es error: la función devuelve null. Si viene, se sigue
-- validando como antes. Y un teléfono vacío no borra el que el proveedor ya
-- tenga en su ficha: las tres funciones que lo guardan solo actualizan la
-- ficha cuando llega uno.

create or replace function private.compras_telefono_admin(p_tel text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_tel, ''));
begin
  if v = '' then
    return null;
  end if;
  if length(v) > 40 or v !~ '^[0-9+().\s-]+$' or length(regexp_replace(v, '\D', '', 'g')) < 7 then
    raise exception 'El teléfono de administración no parece un teléfono (mínimo 7 dígitos; se admiten +, espacios, guiones y paréntesis).'
      using errcode = '22023';
  end if;
  return v;
end;
$$;

-- La misma frase en las tres: se le agrega «y llegó un teléfono».
do $parche$
declare
  v_fn regprocedure;
  v_def text;
  v_nuevo text;
begin
  foreach v_fn in array array[
    'public.compras_indicar_metodo_pago(bigint, jsonb)'::regprocedure,
    'public.compras_corregir_metodo_pago(bigint, jsonb)'::regprocedure,
    'public.compras_metodo_pago_servicio_directo(bigint, jsonb)'::regprocedure]
  loop
    v_def := pg_get_functiondef(v_fn);
    if v_def like '%numero_administracion is distinct from v_tel and v_tel is not null%' then
      continue;
    end if;
    v_nuevo := replace(v_def,
      'numero_administracion is distinct from v_tel',
      'numero_administracion is distinct from v_tel and v_tel is not null');
    if v_nuevo = v_def then
      raise exception 'No se encontró dónde se guarda el teléfono en %', v_fn;
    end if;
    execute v_nuevo;
  end loop;
end
$parche$;
