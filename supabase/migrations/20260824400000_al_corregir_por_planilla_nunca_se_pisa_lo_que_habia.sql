-- ---------------------------------------------------------------------------
-- Al corregir por planilla, NUNCA se pisa lo que había
--
-- Terminando la revisión de las tres planillas: la asimetría que costó el
-- contribuyente especial en proveedores estaba también en las otras dos, y en
-- personal es peor.
--
-- =========================================================================
-- PERSONAL — EL SUELDO SE PONÍA EN CERO
-- =========================================================================
--
--   salario_base      = v_salario     -- celda vacía → 0
--   moneda_salario    = v_moneda      -- celda vacía → VES
--   frecuencia        = v_frec        -- celda vacía → QUINCENAL
--   base_estipulacion = v_base        -- celda vacía → MENSUAL
--   tipo_jornada      = v_jornada     -- celda vacía → DIURNA
--
-- Al lado, `telefono`, `direccion`, `banco` y `numero_cuenta` sí preservaban con
-- coalesce. El autor conocía la distinción; faltaba aplicarla donde más pesa.
--
-- Alguien resube la planilla para corregirle el teléfono a un trabajador y deja
-- el sueldo en blanco —que es lo que la hoja de instrucciones autorizaba:
-- «vacío es cero, se le pondrá desde el tabulador»— y ese trabajador pasa de
-- USD 350 a VES 0. Hoy hay 19 cargados y casi todos están en USD 350. La
-- siguiente nómina le paga cero, o el importe del tabulador en la moneda
-- equivocada.
--
-- Es el hallazgo más caro de los tres porque el error no se ve: la ficha sigue
-- ahí, con su nombre y su cargo, y el número malo solo aparece cuando se paga.
--
-- =========================================================================
-- ARTÍCULOS — LA HERRAMIENTA DEJABA DE PRESTARSE
-- =========================================================================
--
--   inventariable = v_inv       -- celda vacía → true
--   stock_minimo  = v_minimo    -- celda vacía → 0
--   modo_entrega  = v_modo      -- celda vacía → CONSUMIBLE
--
-- El caro es `modo_entrega`: un juego de llaves RETORNABLE al que se le corrige
-- el nombre pasa a CONSUMIBLE, y entonces deja de salir en asignaciones. No se
-- puede prestar ni anotar que volvió, y un préstamo abierto se queda sin forma
-- de cerrarse.
--
-- Y `stock_minimo` a cero apaga en silencio el aviso de reposición que alguien
-- se molestó en configurar.
--
-- =========================================================================
-- LA REGLA, AHORA IGUAL EN LAS TRES
-- =========================================================================
--
-- Al CREAR, la celda vacía toma el valor por defecto: es un alta y hay que poner
-- algo. Al CORREGIR, la celda vacía significa «no lo toques».
--
-- Es lo que la propia plantilla ya decía de `descripcion` —«si se deja vacía en
-- un artículo que ya existe, se respeta la que tenía»—; lo que faltaba era
-- aplicarlo a las demás.
--
-- Se inyecta sobre `pg_get_functiondef` en vez de reescribir las dos funciones
-- enteras: son largas, no cambia nada más, y copiarlas para tocar cinco líneas
-- es cinco ocasiones de arrastrar una errata. El bloque es idempotente —mira si
-- ya está la marca antes de tocar— y revienta si la rama UPDATE no tiene la
-- forma que espera, en vez de aplicar a medias.
--
-- COMPROBADO, en transacción revertida:
--
--   trabajador USD 350, resubido solo con el teléfono ... sigue 350 USD
--   si SÍ dicen el sueldo .............................. pasa a 999
--   alta sin sueldo .................................... nace 0 / VES
--   herramienta RETORNABLE con mínimo 5, solo el nombre  sigue RETORNABLE / 5
--   si SÍ dicen el modo y el mínimo .................... pasa a CONSUMIBLE / 2
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Personal
-- ---------------------------------------------------------------------------
do $migracion$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where proname = 'cargar_personal_por_lote' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'No existe public.cargar_personal_por_lote.';
  end if;

  if v_def like '%no lo toques%' then
    return;   -- ya está puesto
  end if;

  v_def := replace(
    v_def,
    '                 salario_base = v_salario,
                 moneda_salario = v_moneda,
                 frecuencia = v_frec,
                 base_estipulacion = v_base,
                 tipo_jornada = v_jornada,',
    '                 -- Al corregir, la celda vacia significa «no lo toques». El
                 -- valor por defecto es cosa del alta: aplicarlo aqui ponia el
                 -- sueldo en cero a quien solo venia a cambiar un telefono.
                 salario_base = case
                   when nullif(btrim(coalesce(v_fila->>''salario_base'','''')), '''') is null
                     then salario_base else v_salario end,
                 moneda_salario = case
                   when nullif(btrim(coalesce(v_fila->>''moneda_salario'','''')), '''') is null
                     then moneda_salario else v_moneda end,
                 frecuencia = case
                   when nullif(btrim(coalesce(v_fila->>''frecuencia'','''')), '''') is null
                     then frecuencia else v_frec end,
                 base_estipulacion = case
                   when nullif(btrim(coalesce(v_fila->>''base_estipulacion'','''')), '''') is null
                     then base_estipulacion else v_base end,
                 tipo_jornada = case
                   when nullif(btrim(coalesce(v_fila->>''tipo_jornada'','''')), '''') is null
                     then tipo_jornada else v_jornada end,'
  );

  if v_def not like '%no lo toques%' then
    raise exception 'No se pudo inyectar en personal: la rama UPDATE no tiene la forma esperada.';
  end if;

  execute v_def;
end;
$migracion$;

comment on function public.cargar_personal_por_lote(jsonb, boolean) is
  'Carga o corrige personal desde una planilla. Al corregir, una celda vacia deja el valor que habia — incluidos el sueldo y su moneda, que antes se pisaban con cero y bolivares.';

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

  if v_def like '%no lo toques%' then
    return;   -- ya está puesto
  end if;

  v_def := replace(
    v_def,
    '                 inventariable = v_inv,
                 stock_minimo = v_minimo,
                 densidad_ton_m3 = coalesce(v_densidad, densidad_ton_m3),
                 modo_entrega = v_modo',
    '                 -- Al corregir, la celda vacia significa «no lo toques». Con
                 -- el valor por defecto, una herramienta RETORNABLE a la que se
                 -- le corregia el nombre pasaba a CONSUMIBLE y dejaba de poder
                 -- prestarse.
                 inventariable = case
                   when nullif(btrim(coalesce(v_fila->>''inventariable'','''')), '''') is null
                     then inventariable else v_inv end,
                 stock_minimo = case
                   when nullif(btrim(coalesce(v_fila->>''stock_minimo'','''')), '''') is null
                     then stock_minimo else v_minimo end,
                 densidad_ton_m3 = coalesce(v_densidad, densidad_ton_m3),
                 modo_entrega = case
                   when nullif(btrim(coalesce(v_fila->>''modo_entrega'','''')), '''') is null
                     then modo_entrega else v_modo end'
  );

  if v_def not like '%no lo toques%' then
    raise exception 'No se pudo inyectar en articulos: la rama UPDATE no tiene la forma esperada.';
  end if;

  execute v_def;
end;
$migracion$;

comment on function public.cargar_articulos_por_lote(jsonb, boolean) is
  'Carga o corrige articulos desde una planilla. Al corregir, una celda vacia deja el valor que habia — incluidos el modo de entrega y el minimo, que antes se pisaban con CONSUMIBLE y cero.';
