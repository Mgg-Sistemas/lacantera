/*
  LO QUE SE MIDE EN METROS CÚBICOS O EN TONELADAS LLEVA SU DENSIDAD

  Christopher, 16/09/2026: «en los formularios al cargar algo en m3, debe pedir
  directamente su densidad y expresar su conversión a ton, viceversa de ton a
  m3». Preguntado dónde vive esa densidad, eligió UNA POR MATERIAL: la del
  catálogo. Y precisó: «el formulario de compra no debería consultar la
  densidad (pero sí mostrar la conversión); de eso se habrá encargado Catálogo».
  Los formularios enseñan la conversión con la del catálogo; la pide el catálogo
  al crear el material, y cambiarla pide motivo.

  1. NINGÚN MATERIAL EN M3 O EN TON SIN DENSIDAD. Una regla de la tabla, y las
     tres puertas que crean o editan artículos lo dicen con palabras antes de
     que la regla hable. Hoy los seis que hay en M3 ya la tienen.

     `crear_articulo` no aceptaba densidad: un artículo nuevo en M3 nacía sin
     ella y había que editarlo después. Ahora la recibe, y sin ella no nace.

  2. CAMBIARLA PIDE MOTIVO. Los papeles calculan la conversión al imprimirse,
     con la densidad del catálogo de ese momento: cambiarla cambia también lo
     que dice un papel viejo al reimprimirlo. `editar_articulo` la cambiaba en
     silencio; ahora pide por qué y guarda quién y cuándo. La primera vez que se
     pone no pide motivo: no cambia nada que ya estuviera dicho.

  3. LA PLANILLA NO LA PISA. Una fila con otra densidad para un artículo que ya
     la tiene se rechaza, con el mismo mensaje: eso se hace en el catálogo.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Quién la cambió, cuándo y por qué
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.articulos
  add column densidad_motivo       text,
  add column densidad_cambiada_por uuid references public.perfiles(id),
  add column densidad_cambiada_en  timestamptz;

comment on column public.articulos.densidad_motivo is
  'Por qué se cambió la densidad la última vez. Nula si nunca se cambió después de ponerla.';

drop trigger trg_normalizar on public.articulos;
create trigger trg_normalizar before insert or update on public.articulos
  for each row execute function private.normalizar_texto('nombre', 'descripcion', 'motivo_estado', 'densidad_motivo');

alter table public.articulos
  add constraint articulos_m3_y_ton_llevan_densidad
  check (unidad not in ('M3', 'TON') or densidad_ton_m3 is not null);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Crear: nace con su densidad
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def  text;
  v_n    integer;
  r      record;
begin
  v_def := pg_get_functiondef(
    'public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean)'::regprocedure);

  for r in
    select * from (values
      (1,
       $a$p_confirmado boolean DEFAULT false)
 RETURNS bigint$a$,
       $b$p_confirmado boolean DEFAULT false, p_densidad_ton_m3 numeric DEFAULT NULL::numeric)
 RETURNS bigint$b$),

      (2,
       $a$  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, reparable, presentacion, unidades_por_presentacion,
     marca, numero_parte, creado_por)$a$,
       $b$  /*
    LO QUE SE MIDE EN M3 O EN TON NACE CON SU DENSIDAD. Sin ella no se puede
    expresar en la otra medida, y Christopher pidió que se exprese siempre.
    En lo demás no se guarda: preguntarle su densidad a un par de botas es ruido.
  */
  if p_densidad_ton_m3 is not null and p_densidad_ton_m3 <= 0 then
    raise exception 'La densidad, si se pone, es mayor que cero.' using errcode = '22023';
  end if;

  if p_unidad in ('M3', 'TON') and p_densidad_ton_m3 is null then
    raise exception 'Lo que se mide en % necesita su densidad, en toneladas por metro cúbico: sin ella no se puede expresar en %.',
      case p_unidad when 'M3' then 'metros cúbicos' else 'toneladas' end,
      case p_unidad when 'M3' then 'toneladas' else 'metros cúbicos' end
      using errcode = '22023';
  end if;

  insert into public.articulos
    (codigo, nombre, descripcion, categoria, unidad, inventariable, stock_minimo,
     modo_entrega, reparable, presentacion, unidades_por_presentacion,
     marca, numero_parte, creado_por, densidad_ton_m3)$b$),

      (3,
       $a$     nullif(trim(coalesce(p_numero_parte, '')), ''),
     (select auth.uid()))
  returning id into v_id;$a$,
       $b$     nullif(trim(coalesce(p_numero_parte, '')), ''),
     (select auth.uid()),
     case when p_unidad in ('M3', 'TON') then p_densidad_ton_m3 end)
  returning id into v_id;$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En crear_articulo el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;

  drop function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean);
  execute v_def;
end
$parche$;

revoke all on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric) from public, anon;
grant execute on function public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Editar: cambiarla pide motivo
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def  text;
  v_n    integer;
  r      record;
begin
  v_def := pg_get_functiondef(
    'public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric)'::regprocedure);

  for r in
    select * from (values
      (1,
       $a$p_densidad_ton_m3 numeric DEFAULT NULL::numeric)
 RETURNS void$a$,
       $b$p_densidad_ton_m3 numeric DEFAULT NULL::numeric, p_motivo_densidad text DEFAULT NULL::text)
 RETURNS void$b$),

      (2,
       $a$declare
  v_existe boolean;$a$,
       $b$declare
  v_existe boolean;
  v_densidad_antes numeric;
  v_densidad       numeric;
  -- Cambia una que ya estaba; ponerla por primera vez no es cambiarla.
  v_cambia         boolean := false;
  v_pone           boolean := false;$b$),

      (3,
       $a$  update public.articulos set
    nombre         = trim(p_nombre),$a$,
       $b$  /*
    LA DENSIDAD: UNA POR MATERIAL, Y CAMBIARLA PIDE MOTIVO.

    Los papeles calculan la conversión al imprimirse con la densidad del
    catálogo, así que cambiarla cambia también lo que dice un papel viejo al
    reimprimirlo. Por eso no se cambia en silencio: se dice por qué, y queda
    quién y cuándo. Ponerla por primera vez no cambia nada dicho y no lo pide.
  */
  select densidad_ton_m3 into v_densidad_antes from public.articulos where id = p_id;

  if p_densidad_ton_m3 is not null and p_densidad_ton_m3 <= 0 then
    raise exception 'La densidad, si se pone, es mayor que cero.' using errcode = '22023';
  end if;

  v_densidad := coalesce(p_densidad_ton_m3, v_densidad_antes);

  if p_unidad in ('M3', 'TON') and v_densidad is null then
    raise exception 'Lo que se mide en % necesita su densidad, en toneladas por metro cúbico: sin ella no se puede expresar en %.',
      case p_unidad when 'M3' then 'metros cúbicos' else 'toneladas' end,
      case p_unidad when 'M3' then 'toneladas' else 'metros cúbicos' end
      using errcode = '22023';
  end if;

  v_cambia := v_densidad_antes is not null and p_densidad_ton_m3 is not null
              and p_densidad_ton_m3 <> v_densidad_antes;
  v_pone   := v_densidad_antes is null and p_densidad_ton_m3 is not null;

  if v_cambia and length(btrim(coalesce(p_motivo_densidad, ''))) < 10 then
    raise exception 'La densidad era % t/m³. Cambiarla cambia la conversión de todo lo que se imprima desde ahora, también de papeles viejos: escribe por qué, con al menos diez letras.',
      rtrim(rtrim(private.numero_es(v_densidad_antes, 4), '0'), ',')
      using errcode = '22023';
  end if;

  update public.articulos set
    nombre         = trim(p_nombre),$b$),

      (4,
       $a$    densidad_ton_m3 = coalesce(p_densidad_ton_m3, densidad_ton_m3),$a$,
       $b$    densidad_ton_m3 = v_densidad,
    densidad_motivo = case when v_cambia then btrim(p_motivo_densidad)
                           when v_pone then null
                           else densidad_motivo end,
    densidad_cambiada_por = case when v_cambia or v_pone then (select auth.uid())
                                 else densidad_cambiada_por end,
    densidad_cambiada_en  = case when v_cambia or v_pone then now()
                                 else densidad_cambiada_en end,$b$)
    ) as t(n, antes, despues)
    order by n
  loop
    v_n := (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes);
    if v_n <> 1 then
      raise exception 'En editar_articulo el texto % aparece % veces.', r.n, v_n;
    end if;
    v_def := replace(v_def, r.antes, r.despues);
  end loop;

  drop function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric);
  execute v_def;
end
$parche$;

revoke all on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric, text) from public, anon;
grant execute on function public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. La planilla: la pide, y no la pisa
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def  text;
  v_n    integer;
  v_antes text := $a$      elsif v_densidad is not null and v_densidad <= 0 then
        v_motivo := 'La densidad, si se pone, es mayor que cero.';$a$;
begin
  v_def := pg_get_functiondef('public.cargar_articulos_por_lote(jsonb, boolean)'::regprocedure);

  v_n := (length(v_def) - length(replace(v_def, v_antes, ''))) / length(v_antes);
  if v_n <> 1 then
    raise exception 'En cargar_articulos_por_lote la densidad aparece % veces.', v_n;
  end if;

  execute replace(v_def, v_antes, v_antes || $b$

      -- Lo que se mide en M3 o en TON lleva su densidad: la trae la fila, o ya
      -- la tiene el artículo que la fila actualiza.
      elsif v_unidad in ('M3', 'TON') and v_densidad is null
            and not exists (select 1 from public.articulos a
                             where v_codigo <> ''
                               and (a.codigo = v_codigo or a.codigo_anterior = v_codigo)
                               and a.densidad_ton_m3 is not null) then
        v_motivo := format('Lo que se mide en %s necesita su densidad, en toneladas por metro cúbico: sin ella no se puede expresar en %s.',
          case v_unidad when 'M3' then 'metros cúbicos' else 'toneladas' end,
          case v_unidad when 'M3' then 'toneladas' else 'metros cúbicos' end);
        v_campo := 'densidad_ton_m3';

      -- Y la que ya estaba no se pisa desde aquí: cambiarla pide motivo.
      elsif v_densidad is not null
            and exists (select 1 from public.articulos a
                         where v_codigo <> ''
                           and (a.codigo = v_codigo or a.codigo_anterior = v_codigo)
                           and a.densidad_ton_m3 is not null
                           and a.densidad_ton_m3 <> v_densidad) then
        v_motivo := format('Ese artículo ya tiene densidad %s t/m³. Cambiarla pide un motivo, y se hace desde el catálogo. Deja la celda vacía o con la misma.',
          (select rtrim(rtrim(private.numero_es(a.densidad_ton_m3, 4), '0'), ',') from public.articulos a
            where a.codigo = v_codigo or a.codigo_anterior = v_codigo limit 1));
        v_campo := 'densidad_ton_m3';$b$);
end
$parche$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Comprobación
-- ═══════════════════════════════════════════════════════════════════════════

do $ver$
begin
  if exists (select 1 from public.articulos where unidad in ('M3', 'TON') and densidad_ton_m3 is null) then
    raise exception 'quedó un material en M3 o TON sin densidad';
  end if;
  if position('p_densidad_ton_m3' in pg_get_functiondef(
       'public.crear_articulo(text, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric)'::regprocedure)) = 0 then
    raise exception 'crear_articulo no recibe la densidad';
  end if;
  if position('v_cambia' in pg_get_functiondef(
       'public.editar_articulo(bigint, text, text, text, text, boolean, numeric, text, boolean, text, numeric, text, text, boolean, numeric, text)'::regprocedure)) = 0 then
    raise exception 'editar_articulo cambia la densidad sin motivo';
  end if;
  if position('Cambiarla pide un motivo' in pg_get_functiondef('public.cargar_articulos_por_lote(jsonb, boolean)'::regprocedure)) = 0 then
    raise exception 'la planilla pisa la densidad';
  end if;
end
$ver$;
