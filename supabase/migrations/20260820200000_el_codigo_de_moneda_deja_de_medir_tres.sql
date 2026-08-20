-- ---------------------------------------------------------------------------
-- El código de moneda deja de medir tres
--
-- POR QUÉ
--
-- `monedas.codigo` era `character(3)`. Cabían VES, USD y EUR, y se acabó el
-- alfabeto: el Tether se escribe USDT y son cuatro letras. Entró provisional
-- como `UST` en 20260820190000 para no bloquear la fuente de tasa, con el
-- compromiso de ensancharlo después. Esto es ese después.
--
-- POR QUÉ `text` Y NO `character(4)`
--
-- `character(n)` rellena con espacios hasta el largo fijo. `'USD'::char(4)` es
-- `'USD '`. La comparación bpchar ignora ese relleno, así que un `where moneda =
-- 'USD'` seguiría funcionando y nadie notaría nada — hasta que el valor entra en
-- una concatenación. `registrar_cobro` arma la referencia del efectivo con
-- `'EFE' || case when moneda = 'VES' ...`, y ahí el espacio viaja y sale
-- impreso. `text` no rellena, y es lo que el resto de catálogos del proyecto ya
-- usa para sus códigos.
--
-- POR QUÉ HAY QUE BORRAR Y REHACER 21 VISTAS
--
-- Una vista congela el tipo de cada columna que proyecta. Mientras exista una
-- que proyecte `moneda`, Postgres no deja cambiar el tipo debajo. No hay forma
-- de esquivarlo: se capturan, se borran, se cambia el tipo y se vuelven a
-- crear. Por eso todo va en un solo bloque, dentro de una transacción: si algo
-- falla a mitad, no queda una base con la mitad de las vistas.
--
-- LO QUE SE CAPTURA ANTES DE BORRAR, Y POR QUÉ CADA COSA
--
--   La definición   — evidente.
--   `security_invoker=on` — **lo más caro de olvidar de toda la migración.**
--     Sin esa opción la vista se ejecuta con los permisos de su dueño, que es
--     `postgres`, y entonces la RLS de las tablas de debajo deja de aplicarse:
--     cualquiera con sesión vería la nómina entera. No da error, no avisa, y la
--     pantalla se ve igual de bien. Se restaura explícitamente en el `create`.
--   Los permisos — un `drop` se los lleva. Se capturan de `relacl` y se
--     reponen tal cual estaban, sin confiar en que las default privileges los
--     vuelvan a poner.
--   El comentario — solo una de las 21 lo tiene, pero cuesta lo mismo.
--
-- LAS CLAVES FORÁNEAS SE QUITAN Y SE REPONEN
--
-- Cambiar el tipo de la columna referenciada con las 24 FK puestas puede
-- funcionar, porque bpchar y text comparten almacenamiento. «Puede» no es
-- suficiente para una migración sobre datos vivos: se quitan, se cambia el
-- tipo, se reponen. Así el resultado no depende de un detalle de implementación.
-- ---------------------------------------------------------------------------

do $migracion$
declare
  v_vistas   jsonb := '[]'::jsonb;
  v_fks      jsonb := '[]'::jsonb;
  v_cols     jsonb := '[]'::jsonb;
  r          record;
  e          jsonb;
  v_pend     jsonb;
  v_quedan   jsonb;
  v_avance   boolean;
  v_vuelta   int := 0;
begin
  -- -------------------------------------------------------------------------
  -- 1. Capturar lo que hay que reponer
  -- -------------------------------------------------------------------------
  for r in
    select c.oid, c.relname,
           pg_get_viewdef(c.oid, true)          as def,
           obj_description(c.oid, 'pg_class')   as comentario,
           (select coalesce(string_agg(
                     format('grant %s on public.%I to %I',
                            a.privilege_type, c.relname, a.grantee::regrole::text), '; '), '')
              from aclexplode(c.relacl) a)      as permisos
    from pg_class c
    where c.relkind = 'v'
      and c.relnamespace = 'public'::regnamespace
      and exists (
        select 1
        from pg_depend d
        join pg_rewrite w on w.oid = d.objid
        join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
        where w.ev_class = c.oid
          and d.classid   = 'pg_rewrite'::regclass
          and d.refclassid = 'pg_class'::regclass
          and format_type(a.atttypid, a.atttypmod) = 'character(3)')
  loop
    v_vistas := v_vistas || jsonb_build_object(
      'nombre', r.relname, 'def', r.def,
      'com', r.comentario, 'perm', r.permisos);
  end loop;

  for r in
    select con.conname, con.conrelid::regclass::text as tabla,
           pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    where con.contype = 'f' and con.confrelid = 'public.monedas'::regclass
  loop
    v_fks := v_fks || jsonb_build_object('nombre', r.conname, 'tabla', r.tabla, 'def', r.def);
  end loop;

  for r in
    select c.relname as tabla, a.attname as columna
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and a.attnum > 0 and not a.attisdropped
      and format_type(a.atttypid, a.atttypmod) = 'character(3)'
  loop
    v_cols := v_cols || jsonb_build_object('tabla', r.tabla, 'columna', r.columna);
  end loop;

  raise notice 'capturado: % vistas, % claves foraneas, % columnas',
    jsonb_array_length(v_vistas), jsonb_array_length(v_fks), jsonb_array_length(v_cols);

  if jsonb_array_length(v_cols) = 0 then
    raise notice 'no queda ninguna columna character(3): la migracion ya corrio';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Quitar lo que impide el cambio de tipo
  -- -------------------------------------------------------------------------
  for e in select jsonb_array_elements(v_vistas) loop
    execute format('drop view if exists public.%I cascade', e->>'nombre');
  end loop;

  for e in select jsonb_array_elements(v_fks) loop
    execute format('alter table %s drop constraint if exists %I', e->>'tabla', e->>'nombre');
  end loop;

  -- -------------------------------------------------------------------------
  -- 3. El cambio de tipo
  -- -------------------------------------------------------------------------
  for e in select jsonb_array_elements(v_cols) loop
    execute format('alter table public.%I alter column %I type text',
                   e->>'tabla', e->>'columna');
  end loop;

  -- -------------------------------------------------------------------------
  -- 4. Reponer las claves foráneas
  -- -------------------------------------------------------------------------
  for e in select jsonb_array_elements(v_fks) loop
    execute format('alter table %s add constraint %I %s',
                   e->>'tabla', e->>'nombre', e->>'def');
  end loop;

  -- -------------------------------------------------------------------------
  -- 5. Rehacer las vistas
  --
  -- Dos de las 21 se apoyan en otras de la lista —`v_panel_resumen` en tres, y
  -- `v_cuentas_por_cobrar` en `v_facturas_venta`— así que el orden importa y no
  -- viene dado. En vez de escribirlo a mano, se intenta crear todas y las que
  -- fallen por dependencia se reintentan en la vuelta siguiente. Converge
  -- cuando una vuelta entera no consigue crear ninguna: si a esas alturas
  -- quedan vistas, es un fallo de verdad y la transacción cae.
  -- -------------------------------------------------------------------------
  v_pend := v_vistas;

  loop
    v_vuelta := v_vuelta + 1;
    v_quedan := '[]'::jsonb;
    v_avance := false;

    for e in select jsonb_array_elements(v_pend) loop
      begin
        execute format('create view public.%I with (security_invoker = on) as %s',
                       e->>'nombre', e->>'def');
        v_avance := true;
      exception when others then
        v_quedan := v_quedan || e;
      end;
    end loop;

    exit when jsonb_array_length(v_quedan) = 0;

    if not v_avance then
      raise exception 'no se pudieron rehacer % vistas tras % vueltas: %',
        jsonb_array_length(v_quedan), v_vuelta,
        (select string_agg(x->>'nombre', ', ') from jsonb_array_elements(v_quedan) x);
    end if;

    v_pend := v_quedan;
  end loop;

  raise notice 'vistas rehechas en % vuelta(s)', v_vuelta;

  -- -------------------------------------------------------------------------
  -- 6. Reponer comentarios y permisos
  -- -------------------------------------------------------------------------
  for e in select jsonb_array_elements(v_vistas) loop
    if e->>'com' is not null then
      execute format('comment on view public.%I is %L', e->>'nombre', e->>'com');
    end if;
    if coalesce(e->>'perm', '') <> '' then
      execute e->>'perm';
    end if;
  end loop;
end;
$migracion$;

-- ---------------------------------------------------------------------------
-- Las cinco funciones que llevaban la moneda en una variable de tres
--
-- Ensanchar la columna no basta. Estas cinco declaran `v_moneda char(3)` en su
-- cuerpo, y una variable `char(3)` **trunca**: `'USDT'` entra y se guarda
-- `'USD'`. Sin excepción, sin aviso y sin diferencia visible en pantalla.
--
-- El camino no es hipotético. `guardar_cuenta` hace
-- `select moneda into v_moneda from cuentas_tesoreria`, y la cuenta BIL-BIN es
-- justamente la que quedó en Tether: editarla la devolvería a dólares. Lo mismo
-- en `crear_cotizacion_venta` y `despachar`, que resuelven la moneda con
-- `coalesce(p_moneda, v_cliente.moneda_preferida)` — un cliente que prefiera
-- USDT cotizaría en USD.
--
-- Se cambia solo el tipo de la variable. Cada una de las cinco tiene una única
-- aparición de `char(3)`, comprobado antes de escribir esto, así que la
-- sustitución no puede tocar nada más. Se lee la definición viva y se reescribe:
-- así el arreglo no depende de que el archivo de la función esté al día.
-- ---------------------------------------------------------------------------
do $funciones$
declare
  r      record;
  v_def  text;
  v_n    int := 0;
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('registrar_recepcion', 'guardar_cuenta',
                        'crear_cotizacion_venta', 'despachar', 'indicar_pago')
  loop
    v_def := regexp_replace(r.def, '\mchar(acter)?\s*\(\s*3\s*\)', 'text', 'gi');

    if v_def <> r.def then
      execute v_def;
      v_n := v_n + 1;
      raise notice 'moneda ensanchada dentro de %', r.proname;
    end if;
  end loop;

  if v_n <> 5 then
    raise exception 'se esperaban 5 funciones con char(3) dentro y se cambiaron %', v_n;
  end if;
end;
$funciones$;

-- ---------------------------------------------------------------------------
-- UST pasa a llamarse USDT
--
-- No puede ir por `update`: las 24 claves foráneas son `NO ACTION`, así que
-- cambiar el código con una fila hija colgando lo rechaza. Se inserta el nuevo,
-- se repuntan las hijas y se borra el viejo. Hoy la única hija es la cuenta
-- BIL-BIN; el `update` de abajo repunta las que haya, sean las que sean.
-- ---------------------------------------------------------------------------
do $renombrar$
declare v_hijas int;
begin
  if not exists (select 1 from public.monedas where codigo = 'UST') then
    raise notice 'no hay UST que renombrar';
    return;
  end if;

  insert into public.monedas (codigo, nombre, simbolo, decimales, es_curso_legal, activa, fuente_tasa)
  select 'USDT', nombre, simbolo, decimales, es_curso_legal, activa, fuente_tasa
  from public.monedas where codigo = 'UST'
  on conflict (codigo) do nothing;

  update public.cuentas_tesoreria set moneda = 'USDT' where moneda = 'UST';
  get diagnostics v_hijas = row_count;

  delete from public.monedas where codigo = 'UST';

  raise notice 'UST -> USDT, % cuenta(s) repuntada(s)', v_hijas;
end;
$renombrar$;

comment on column public.monedas.codigo is
  'Código de la moneda. Es `text`, no `character(n)`: el Tether necesita cuatro '
  'letras y el relleno de bpchar se colaba en las referencias que concatenan la '
  'moneda.';
