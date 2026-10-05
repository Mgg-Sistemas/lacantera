-- ═══════════════════════════════════════════════════════════════════════════
-- LA CATEGORÍA «VÍVERES»
--
-- Va en su propia migración porque es el único paso del control de
-- alimentación que toca algo compartido: la regla de categorías de
-- `articulos`. Un CHECK no se amplía en sitio —hay que soltarlo y volverlo a
-- poner con la lista nueva—, y una operación así merece aprobarse sola, no
-- escondida dentro de un módulo entero. Es el mismo molde con que entró
-- EQUIPO el 09/09/2026.
--
-- Las cuatro decisiones de la categoría: nombre «Víveres», prefijo VIV, clase
-- de gasto ALIMENTACION (ya existía como raíz), y ninguna conducta especial
-- fuera del módulo de alimentación, que es el único que la consume.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 2. La categoría VIVERES, con el mismo molde que EQUIPO
-- ───────────────────────────────────────────────────────────────────────────
do $categoria$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.articulos'::regclass
       and conname = 'articulos_categoria_check'
       and pg_get_constraintdef(oid) like '%VIVERES%'
  ) then
    alter table public.articulos drop constraint articulos_categoria_check;
    alter table public.articulos add constraint articulos_categoria_check
      check (categoria = any (array[
        'PRODUCTO', 'REPUESTO', 'INSUMO', 'COMBUSTIBLE', 'LUBRICANTE',
        'EPP', 'HERRAMIENTA', 'EXPLOSIVO', 'SERVICIO', 'EQUIPO', 'VIVERES']));
    raise notice 'articulos.categoria acepta VIVERES.';
  else
    raise notice 'articulos.categoria ya aceptaba VIVERES.';
  end if;
end $categoria$;

do $prefijo$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'codigo_de_articulo';

  if position('''VIVERES''' in v_def) = 0 then
    v_def := replace(v_def,
      '                 when ''EQUIPO''      then ''EQU''',
      '                 when ''EQUIPO''      then ''EQU''' || chr(10) ||
      '                 when ''VIVERES''     then ''VIV''');
    execute v_def;
    raise notice 'codigo_de_articulo: VIVERES -> VIV.';
  else
    raise notice 'codigo_de_articulo ya conocia VIVERES.';
  end if;
end $prefijo$;

