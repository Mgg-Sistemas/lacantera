/*
  SOLO `verificar_carnet` SE ABRE SIN SESIÓN. LAS DEMÁS SE CIERRAN.

  Al dar permiso a `anon` sobre `verificar_carnet` —que lo necesita: la escanea
  un vigilante en un portón, y ese vigilante no tiene cuenta— salió que había
  NUEVE funciones alcanzables sin sesión, y ocho eran mías del mismo día.

  Supabase concede `execute` a `anon` por omisión sobre lo que se cree en
  `public`. `revoke ... from public` no lo deshace: `PUBLIC` es el pseudo-rol de
  «todo el mundo», y esa concesión es directa sobre `anon`. Escribí el revoke de
  siempre y me quedé tranquilo sin comprobarlo.

  NO ERAN EXPLOTABLES, Y AUN ASÍ SE CIERRAN

  Se probó una por una haciéndose pasar por `anon`: las cuatro que escriben
  contestan «Sesión no válida» o «No tienes permiso», porque todas empiezan
  llamando a `exigir_permiso` o `exigir_accion` y sin `auth.uid()` no pasa nadie.
  El guardia de dentro aguanta.

  Pero las otras 189 funciones del esquema SÍ están cerradas, así que esto no es
  el comportamiento normal de la casa: es deriva. Y una puerta abierta que hoy
  tiene un guardia detrás es una puerta abierta el día que alguien escriba una
  función y se olvide del guardia.

  LA LISTA SALE DEL CATÁLOGO, NO DE MI MEMORIA

  Se revoca sobre lo que `has_function_privilege` diga que `anon` alcanza, menos
  la que tiene que quedarse. Escribir los ocho nombres a mano es cómo se queda
  uno fuera.

  Y por eso mismo esto es idempotente y sirve de red: si mañana alguien crea una
  función y no la cierra, volver a correr este bloque la cierra sola.
*/

do $cierre$
declare
  v_f record;
  v_cerradas text[] := '{}';
begin
  for v_f in
    select p.oid,
           p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as firma
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname <> 'verificar_carnet'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function public.%s from anon', v_f.firma);
    v_cerradas := v_cerradas || v_f.firma;
  end loop;

  raise notice 'Cerradas a anon: %', coalesce(array_length(v_cerradas, 1), 0);
end
$cierre$;
