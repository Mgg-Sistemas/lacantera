/*
  LA FACTURACIÓN ES SU PROPIO MÓDULO.

  Christopher, 15/09/2026: «Necesitamos progresar con el aspecto de facturación,
  haciéndolo un módulo independiente de ser necesario». Lo es. Facturas, notas de
  crédito, cobros y lo que deben los clientes vivían dentro de VENTAS, con su mismo
  permiso, y son otra cosa: gastan número de control, entran al libro de ventas y
  dejan a alguien debiendo. Quien lleva eso —administración, el contador— no tiene
  por qué poder cotizar ni despachar, ni al revés.

  VENTAS se queda con el camino del material: clientes, precios, cotizaciones y
  notas de entrega. FACTURACION empieza donde la nota de entrega se vuelve factura.

  NADIE GANA NI PIERDE ACCESO CON ESTA MIGRACIÓN.
  - Cada rol recibe en FACTURACION el nivel que tenía en VENTAS (hoy: ADMIN TOTAL,
    los demás NINGUNO).
  - Las seis acciones fiscales se mudan con el mismo nivel equivalente. Ningún rol
    ni ninguna autorización las tenía concedidas, y se comprueba antes de moverlas.
  - La casilla que deja ver el dinero de las facturas pasa a ser
    FACTURACION.VER_FACTURACION, concedida a nadie, igual que VENTAS.VER_VENTAS.

  LO QUE SÍ CAMBIA, Y ES A PROPÓSITO:
  - Las facturas, sus renglones y los cobros dejan de leerse con cualquier sesión:
    las políticas eran `true`. Ahora piden FACTURACION en lectura, como ya pedían
    las notas de crédito con VENTAS. Lo encontró la auditoría de facturación del
    14/09/2026.
  - La tabla de clientes NO se cierra: la leen también las guías, los tickets de
    romana y las salidas de planta, y cerrarla dejaría a Despachos y Explotación sin
    el nombre del cliente. Lo que un cliente debe sale de las facturas, que sí se
    cierran.
*/

-- 1. El módulo.
insert into public.modulos (codigo, nombre, descripcion, orden)
values ('FACTURACION', 'Facturación',
        'Facturas de venta, notas de crédito, cobros y lo que deben los clientes.', 65)
on conflict (codigo) do nothing;

-- 2. Cada rol, con el nivel que tenía en Ventas.
insert into public.rol_permisos (rol, modulo, nivel)
select rol, 'FACTURACION', nivel
  from public.rol_permisos
 where modulo = 'VENTAS'
on conflict (rol, modulo) do nothing;

-- 3. Las acciones fiscales se mudan con el módulo.
do $mig$
declare
  v_viejas text[] := array['VENTAS.FACTURAR', 'VENTAS.ANULAR_FACTURA', 'VENTAS.REGISTRAR_COBRO',
                           'VENTAS.ANULAR_COBRO', 'VENTAS.EMITIR_NOTA_CREDITO',
                           'VENTAS.ANULAR_NOTA_CREDITO'];
  v_n      integer;
begin
  -- Borrar una acción concedida se lleva la concesión en cascada, en silencio.
  -- Si alguien la tuviera, hay que moverla a mano antes: se para aquí.
  select count(*) into v_n from public.rol_acciones where accion = any(v_viejas);
  if v_n > 0 then
    raise exception 'Hay % acciones fiscales de VENTAS concedidas a roles: muévelas antes.', v_n
      using errcode = '55000';
  end if;

  select count(*) into v_n from public.autorizaciones where accion = any(v_viejas);
  if v_n > 0 then
    raise exception 'Hay % autorizaciones sobre acciones fiscales de VENTAS: muévelas antes.', v_n
      using errcode = '55000';
  end if;

  insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
  select 'FACTURACION.' || substr(a.codigo, length('VENTAS.') + 1), 'FACTURACION',
         a.nombre, a.dice, a.orden, a.nivel_equivalente, a.activa
    from public.acciones a
   where a.codigo = any(v_viejas)
  on conflict (codigo) do nothing;

  delete from public.acciones where codigo = any(v_viejas);
end
$mig$;

insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente, activa)
values ('FACTURACION.VER_FACTURACION', 'FACTURACION',
        'Ver las facturas y lo que deben los clientes',
        'Facturas, cobros y la cuenta de cada cliente, con sus totales. Sin esta casilla los documentos se ven, pero las cifras de dinero llegan vacías, también si se consulta la API a mano. No la concede ningún nivel de módulo: hay que darla a mano o por permiso extendido.',
        10, null, true)
on conflict (codigo) do nothing;

update public.acciones
   set dice = 'Cotizaciones, notas de entrega y la cuenta de cada cliente, incluidos los precios y los totales. Sin esta casilla los documentos se ven, pero las cifras de dinero llegan vacías, también si se consulta la API a mano. Las facturas y los cobros tienen su propia casilla, en Facturación. No la concede ningún nivel de módulo: hay que darla a mano o por permiso extendido.'
 where codigo = 'VENTAS.VER_VENTAS';

-- 4. La auditoría enseña estas tablas bajo su módulo nuevo.
update public.auditoria_modulos
   set modulo = 'FACTURACION'
 where tabla in ('facturas_venta', 'factura_venta_renglones', 'cobros_venta',
                 'notas_credito', 'nota_credito_renglones');

-- 5. Las seis puertas fiscales piden FACTURACION. En cada una, las únicas
--    apariciones de 'VENTAS' son la comprobación de permiso: se cuentan antes de
--    tocarlas, y si el número no es el esperado no se toca nada.
do $mig$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('facturar_notas', 2),
      ('anular_factura', 1),
      ('registrar_cobro', 1),
      ('anular_cobro', 1),
      ('emitir_nota_credito', 1),
      ('anular_nota_credito', 1)
    ) as t(funcion, veces)
  loop
    select pg_get_functiondef(p.oid) into strict v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.funcion;

    if (length(v_def) - length(replace(v_def, '''VENTAS''', ''))) / length('''VENTAS''') <> r.veces then
      raise exception '% no nombra VENTAS exactamente % veces.', r.funcion, r.veces
        using errcode = '22023';
    end if;

    execute replace(v_def, '''VENTAS''', '''FACTURACION''');
  end loop;
end
$mig$;

-- 6. Lo fiscal se lee con permiso de Facturación.
drop policy if exists facturas_venta_lectura on public.facturas_venta;
create policy facturas_venta_lectura on public.facturas_venta
  for select to authenticated using (private.tiene_permiso('FACTURACION', 'LECTURA'));

drop policy if exists factura_venta_renglones_lectura on public.factura_venta_renglones;
create policy factura_venta_renglones_lectura on public.factura_venta_renglones
  for select to authenticated using (private.tiene_permiso('FACTURACION', 'LECTURA'));

drop policy if exists cobros_venta_lectura on public.cobros_venta;
create policy cobros_venta_lectura on public.cobros_venta
  for select to authenticated using (private.tiene_permiso('FACTURACION', 'LECTURA'));

drop policy if exists notas_credito_lectura on public.notas_credito;
create policy notas_credito_lectura on public.notas_credito
  for select to authenticated using (private.tiene_permiso('FACTURACION', 'LECTURA'));

drop policy if exists nota_credito_renglones_lectura on public.nota_credito_renglones;
create policy nota_credito_renglones_lectura on public.nota_credito_renglones
  for select to authenticated using (private.tiene_permiso('FACTURACION', 'LECTURA'));

-- 7. Las cifras de dinero: la factura, con su casilla; la nota de entrega, con
--    cualquiera de las dos, porque la miran quien despacha y quien factura.
do $mig$
declare
  v_def     text;
  v_llamada text := 'private.puede_accion(''VENTAS.VER_VENTAS''::text)';
begin
  v_def := pg_get_viewdef('public.v_facturas_venta'::regclass, true);
  if (length(v_def) - length(replace(v_def, v_llamada, ''))) / length(v_llamada) <> 13 then
    raise exception 'v_facturas_venta no pide VENTAS.VER_VENTAS 13 veces.' using errcode = '22023';
  end if;
  execute 'create or replace view public.v_facturas_venta with (security_invoker = on) as '
       || replace(v_def, v_llamada, 'private.puede_accion(''FACTURACION.VER_FACTURACION''::text)');

  v_def := pg_get_viewdef('public.v_notas_entrega'::regclass, true);
  if (length(v_def) - length(replace(v_def, v_llamada, ''))) / length(v_llamada) <> 8 then
    raise exception 'v_notas_entrega no pide VENTAS.VER_VENTAS 8 veces.' using errcode = '22023';
  end if;
  execute 'create or replace view public.v_notas_entrega with (security_invoker = on) as '
       || replace(v_def, v_llamada,
                  '(private.puede_accion(''VENTAS.VER_VENTAS''::text) or private.puede_accion(''FACTURACION.VER_FACTURACION''::text))');
end
$mig$;

-- 8. Comprobado al aplicar.
do $ver$
declare
  v_def text;
  r     record;
begin
  if not exists (select 1 from public.modulos where codigo = 'FACTURACION') then
    raise exception 'Falta el módulo FACTURACION.' using errcode = '22023';
  end if;

  if exists (select rol, nivel from public.rol_permisos where modulo = 'VENTAS'
             except
             select rol, nivel from public.rol_permisos where modulo = 'FACTURACION') then
    raise exception 'Algún rol no quedó en Facturación con el nivel que tenía en Ventas.' using errcode = '22023';
  end if;

  if (select count(*) from public.acciones where modulo = 'FACTURACION') <> 7 then
    raise exception 'Facturación no tiene sus 7 acciones.' using errcode = '22023';
  end if;

  if exists (select 1 from public.acciones
              where codigo in ('VENTAS.FACTURAR', 'VENTAS.ANULAR_FACTURA', 'VENTAS.REGISTRAR_COBRO',
                               'VENTAS.ANULAR_COBRO', 'VENTAS.EMITIR_NOTA_CREDITO', 'VENTAS.ANULAR_NOTA_CREDITO')) then
    raise exception 'Quedaron acciones fiscales en VENTAS.' using errcode = '22023';
  end if;

  for r in
    select * from (values ('facturar_notas'), ('anular_factura'), ('registrar_cobro'),
                          ('anular_cobro'), ('emitir_nota_credito'), ('anular_nota_credito')) as t(funcion)
  loop
    select p.prosrc into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.funcion;
    if strpos(v_def, '''VENTAS''') > 0 or strpos(v_def, '''FACTURACION''') = 0 then
      raise exception '% no quedó pidiendo FACTURACION.', r.funcion using errcode = '22023';
    end if;
  end loop;

  if exists (select 1 from pg_policies
              where schemaname = 'public'
                and tablename in ('facturas_venta', 'factura_venta_renglones', 'cobros_venta',
                                  'notas_credito', 'nota_credito_renglones')
                and cmd = 'SELECT'
                and qual not like '%FACTURACION%') then
    raise exception 'Alguna tabla fiscal se sigue leyendo sin permiso de Facturación.' using errcode = '22023';
  end if;

  for r in select * from (values ('v_facturas_venta'), ('v_notas_entrega')) as t(vista) loop
    if not exists (select 1 from pg_class
                    where oid = ('public.' || r.vista)::regclass
                      and array_to_string(reloptions, ',') like '%security_invoker=on%') then
      raise exception '% perdió security_invoker.', r.vista using errcode = '22023';
    end if;
  end loop;

  if strpos(pg_get_viewdef('public.v_facturas_venta'::regclass), 'VENTAS.VER_VENTAS') > 0 then
    raise exception 'v_facturas_venta sigue pidiendo VENTAS.VER_VENTAS.' using errcode = '22023';
  end if;
end
$ver$;
