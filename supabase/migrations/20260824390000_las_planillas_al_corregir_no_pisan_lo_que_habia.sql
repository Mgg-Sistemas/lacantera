-- ---------------------------------------------------------------------------
-- Al corregir por planilla, una celda vacía no pisa lo que había
--
-- Salió de revisar las tres planillas de Excel, y es el hallazgo caro.
--
-- =========================================================================
-- 1. PROVEEDORES: TRES COLUMNAS SE PISABAN
-- =========================================================================
--
-- En `cargar_proveedores_por_lote`, la rama que ACTUALIZA trataba sus columnas
-- de dos formas distintas. Seis preservaban lo que había:
--
--   nombre_comercial = coalesce(nullif(btrim(...), ''), nombre_comercial)
--
-- Y tres, no:
--
--   condicion_pago         = v_condicion    -- '' ya se había vuelto CONTADO
--   moneda_preferida       = v_moneda       -- '' ya se había vuelto USD
--   contribuyente_especial = v_especial     -- '' ya se había vuelto false
--
-- La asimetría es literal y es un descuido, no un diseño: la propia plantilla
-- documenta la semántica de preservación donde sí existe —«si se deja vacía en
-- un artículo que ya existe, se respeta la que tenía»— y en estas tres solo dice
-- «vacío es CONTADO / USD / NO», que describe el alta y no la corrección.
--
-- LO QUE COSTABA. Alguien sube la planilla para corregir un teléfono y deja esas
-- celdas en blanco, que es justo lo que la hoja de instrucciones autoriza:
--
--   · El contribuyente especial deja de serlo. La siguiente factura se registra
--     con retención de IVA en CERO y la pantalla lo justifica por escrito: «a
--     este proveedor no se le retiene». El IVA que había que enterarle al
--     SENIAT se le acaba pagando al proveedor.
--   · El crédito a 30 días pasa a CONTADO, y de ahí a la orden por el disparador
--     que hereda la condición: la orden pide pagar antes de recibir.
--   · La moneda pasa a USD.
--
-- Y el radio no es la fila corregida, es el archivo entero: doscientos renglones
-- resubidos para arreglar tres teléfonos resetean los doscientos. El informe
-- decía «Se actualiza», sin motivo ni aviso.
--
-- =========================================================================
-- 2. ARTÍCULOS: LA PLANILLA NO SABÍA DE `reparable`
-- =========================================================================
--
-- Hace unas horas se añadió `articulos.reparable` para que un pote de aceite no
-- saliera en el selector del taller. El formulario lo deduce de la categoría y
-- la planilla no se enteró: cargar cuarenta repuestos por planilla los dejaba
-- todos en false. Dos puertas, dos reglas, y la de la planilla es justo la que
-- se usa para cargar cuarenta de golpe.
--
-- Se deduce igual que en la otra puerta, se puede decir con SI o NO, y al
-- corregir vacía significa «no lo toques» — la misma lección del punto 1,
-- aplicada el mismo día para no repetir el error.
--
-- =========================================================================
-- POR QUÉ SE INYECTA EN VEZ DE REESCRIBIR
-- =========================================================================
--
-- Las dos funciones suman trece mil caracteres. Copiarlas aquí enteras es
-- garantizar que un día este archivo y la base digan cosas distintas — que es la
-- regla 7 mirada desde el otro lado. Se parchea su propia definición viva y los
-- dos bloques son idempotentes: en la segunda pasada no hacen nada.
--
-- COMPROBADO, en transacciones revertidas:
--
--   proveedor CREDITO_30 / VES / especial, resubido solo con el teléfono
--     ............... conserva las tres, y el teléfono cambia
--   proveedor nuevo sin esas celdas ... nace CONTADO / USD / no especial
--   si SÍ las dicen ................... cambia solo la que dicen
--   repuesto nuevo por planilla ....... reparable = true
--   lubricante nuevo por planilla ..... reparable = false
--   diciendo NO en un repuesto ........ reparable = false
--   corregir el nombre con la celda vacía ... el reparable no se mueve
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Proveedores
-- ---------------------------------------------------------------------------
do $migracion$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where proname = 'cargar_proveedores_por_lote' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'No existe public.cargar_proveedores_por_lote.';
  end if;

  if v_def like '%no lo toques%' then
    return;   -- ya está puesto
  end if;

  v_def := replace(
    v_def,
    '                 condicion_pago = v_condicion,
                 moneda_preferida = v_moneda,
                 contribuyente_especial = v_especial,',
    '                 -- Al corregir, la celda vacia significa «no lo toques», igual
                 -- que en las otras seis. El valor por defecto es cosa del alta:
                 -- aplicarlo aqui desmarcaba al contribuyente especial de quien
                 -- solo venia a cambiar un telefono.
                 condicion_pago = case
                   when nullif(btrim(coalesce(v_fila->>''condicion_pago'','''')), '''') is null
                     then condicion_pago else v_condicion end,
                 moneda_preferida = case
                   when nullif(btrim(coalesce(v_fila->>''moneda_preferida'','''')), '''') is null
                     then moneda_preferida else v_moneda end,
                 contribuyente_especial = case
                   when nullif(btrim(coalesce(v_fila->>''contribuyente_especial'','''')), '''') is null
                     then contribuyente_especial else v_especial end,'
  );

  if v_def not like '%no lo toques%' then
    raise exception 'No se pudo inyectar el arreglo: la rama UPDATE no tiene la forma esperada.';
  end if;

  execute v_def;
end;
$migracion$;

comment on function public.cargar_proveedores_por_lote(jsonb, boolean) is
  'Carga o corrige proveedores desde una planilla. Al corregir, una celda vacia deja el valor que habia — incluidas condicion de pago, moneda y contribuyente especial, que antes se pisaban con el valor por defecto.';

-- ---------------------------------------------------------------------------
-- Artículos
-- ---------------------------------------------------------------------------
do $migracion$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where proname = 'cargar_articulos_por_lote' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'No existe public.cargar_articulos_por_lote.';
  end if;

  if v_def like '%v_reparable%' then
    return;   -- ya está puesto
  end if;

  v_def := replace(v_def, E'declare\n', E'declare\n  v_reparable boolean;\n');

  v_def := replace(
    v_def,
    '          insert into public.articulos
            (codigo, nombre, descripcion, categoria, unidad, inventariable,
             stock_minimo, densidad_ton_m3, modo_entrega, creado_por)
          values
            (v_codigo, v_nombre, nullif(btrim(coalesce(v_fila->>''descripcion'','''')), ''''),
             v_categoria, v_unidad, v_inv, v_minimo, v_densidad, v_modo, (select auth.uid()))',
    '          -- Vacia se deduce de la categoria, la misma regla que crear_articulo:
          -- una herramienta y un repuesto vuelven arreglados del taller, un
          -- lubricante o un producto se gastan.
          v_reparable := case lower(btrim(coalesce(v_fila->>''reparable'', '''')))
                           when ''si'' then true when ''sí'' then true
                           when ''1'' then true  when ''true'' then true
                           when ''no'' then false when ''0'' then false
                           when ''false'' then false
                           else null end;

          insert into public.articulos
            (codigo, nombre, descripcion, categoria, unidad, inventariable,
             stock_minimo, densidad_ton_m3, modo_entrega, reparable, creado_por)
          values
            (v_codigo, v_nombre, nullif(btrim(coalesce(v_fila->>''descripcion'','''')), ''''),
             v_categoria, v_unidad, v_inv, v_minimo, v_densidad, v_modo,
             coalesce(v_reparable, v_categoria in (''HERRAMIENTA'', ''REPUESTO'')),
             (select auth.uid()))'
  );

  v_def := replace(
    v_def,
    '          update public.articulos
             set nombre = v_nombre,',
    '          v_reparable := case lower(btrim(coalesce(v_fila->>''reparable'', '''')))
                           when ''si'' then true when ''sí'' then true
                           when ''1'' then true  when ''true'' then true
                           when ''no'' then false when ''0'' then false
                           when ''false'' then false
                           else null end;

          update public.articulos
             set nombre = v_nombre,
                 reparable = coalesce(v_reparable, reparable),'
  );

  if v_def not like '%v_reparable%' then
    raise exception 'No se pudo inyectar: la funcion no tiene la forma esperada.';
  end if;

  execute v_def;
end;
$migracion$;

comment on function public.cargar_articulos_por_lote(jsonb, boolean) is
  'Carga o corrige articulos desde una planilla. La columna «reparable» es opcional: vacia se deduce de la categoria al crear, y al corregir deja lo que habia.';
