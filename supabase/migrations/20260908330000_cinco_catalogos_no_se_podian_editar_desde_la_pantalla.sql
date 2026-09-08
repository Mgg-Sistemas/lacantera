/*
  CINCO CATÁLOGOS NO SE PODÍAN EDITAR DESDE LA PANTALLA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, y probada creando y editando
  por las puertas reales en transacción deshecha.
  ————————————————————————————————————————————————————————————————————————

  Salió tirando del hilo que dejó el carril de base de datos —«dos catálogos
  guardan en minúscula»— y resultó ser otra cosa, y peor: **no es que guarden
  mal, es que no guardan.**

      select public.guardar_categoria_gasto(null, 'Fletes y acarreo', ...)
      -> ERROR 22004: FOREACH expression must not be null
         CONTEXT: private.auditar() line 23

  `private.auditar` recorre `TG_ARGV` para armar la clave de la fila auditada.
  Cuando el disparador se declara SIN argumentos, en PL/pgSQL **`TG_ARGV` no es
  un array vacío: es NULL**. Y `foreach ... in array NULL` revienta.

  Cinco tablas estaban así, y tres tienen puerta de usuario:

      categorias_gasto       pantalla Centro de Costos      -> rota
      motivos_despacho       pantalla Combustible           -> rota
      especialidades_taller  pantalla de talleres           -> rota
      taller_especialidades  la escribe la misma puerta     -> rota
      presentaciones         solo se carga por migración    -> no muerde hoy

  NO MORDÍA HASTA AHORA porque las cinco se sembraron por migración. La primera
  persona que intentara añadir una categoría de gasto se habría encontrado un
  error crudo de Postgres, sin nada que hacer y sin nada que entender.

  ═══════════════════════════════════════════════════════════════════════════
  SE ARREGLA EN LOS DOS SITIOS, Y ES A PROPÓSITO
  ═══════════════════════════════════════════════════════════════════════════

  1. **El ayudante deja de reventar**: `coalesce(TG_ARGV, '{}')`. Sin clave, la
     fila se audita igual y `fila_id` queda nula — peor que tenerla, pero
     infinitamente mejor que no poder escribir. Es la séptima vez esta semana
     que aparece la forma «la regla en una puerta y no en la de al lado», y la
     lección ya conocida: **la que vive en el ayudante no se le puede escapar a
     la tabla que se cree mañana.**

  2. **Los cinco disparadores nombran su clave**, que es lo que hace útil el
     registro. Sin eso la auditoría diría «se creó algo» sin decir qué.

  Se descartó arreglar solo los disparadores: deja el ayudante armado para la
  sexta tabla. Y se descartó arreglar solo el ayudante: deja cinco tablas
  auditadas sin poder decir de qué fila hablan.

  ═══════════════════════════════════════════════════════════════════════════
  Y DE PASO, LO QUE EL OTRO CARRIL LEVANTÓ: NO HAY QUE PONERLOS EN MAYÚSCULA
  ═══════════════════════════════════════════════════════════════════════════

  Su diagnóstico era correcto —esas dos tablas no tienen `trg_normalizar`— pero
  la receta habría empeorado el sistema, y los números lo dicen:

      categorias_gasto   26 filas   codigo 26/26 en mayuscula   nombre 0/26
      motivos_despacho    6 filas   codigo  6/6  en mayuscula   nombre  0/6

  **La clave foránea apunta a `codigo`, no a `nombre`**:
  `tesoreria_movimientos.categoria -> categorias_gasto.codigo` y
  `despachos_combustible.motivo -> motivos_despacho.codigo`. Y el `codigo` no se
  teclea: lo deriva la base en mayúscula y con guiones bajos, comprobado —
  «Fletes y acarreo de terceros» -> `FLETES_Y_ACARREO_DE_TERCEROS`.

  `nombre` es una **etiqueta de pantalla**. Pasarla por `trg_normalizar` la
  dejaría gritando y sin tildes: la tabla hermana `clases_de_salida` sí lo hace y
  por eso muestra «SE DAÑO» y «SE USO TRABAJANDO». El riesgo que el otro carril
  temía —«buscar `where nombre = 'COMBUSTIBLE'` no encuentra nada»— es sobre una
  columna por la que no se une nada.

  Así que aquí no se normaliza `nombre`. Queda dicho para que no se «arregle»
  dentro de tres meses.
*/

-- ---------------------------------------------------------------------------
-- 1. El ayudante, que no puede reventar por algo que no le dieron
-- ---------------------------------------------------------------------------
do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='private' and p.proname='auditar';
  v_antes := v_def;

  v_def := replace(v_def,
    '  foreach v_col in array TG_ARGV loop
    v_partes := v_partes || coalesce(v_fila ->> v_col, ''?'');
  end loop;',
    '  -- `coalesce` porque un disparador declarado SIN argumentos deja TG_ARGV en
  -- NULL, no en un array vacio, y `foreach in array NULL` revienta con 22004.
  -- Cinco catalogos estaban asi y no se podian editar desde la pantalla.
  foreach v_col in array coalesce(TG_ARGV, ''{}''::text[]) loop
    v_partes := v_partes || coalesce(v_fila ->> v_col, ''?'');
  end loop;');

  if v_def = v_antes then
    if position('coalesce(TG_ARGV' in v_antes) > 0 then
      raise notice 'private.auditar ya esta a salvo del TG_ARGV nulo.';
    else
      raise exception 'No se encontro el foreach sobre TG_ARGV.';
    end if;
  else
    execute v_def;
    raise notice 'private.auditar ya no revienta sin argumentos.';
  end if;
end $patch$;

-- ---------------------------------------------------------------------------
-- 2. Y cada disparador nombra su clave
-- ---------------------------------------------------------------------------
do $disparadores$
declare
  v_pares text[][] := array[
    array['categorias_gasto',      'codigo'],
    array['motivos_despacho',      'codigo'],
    array['especialidades_taller', 'codigo'],
    array['presentaciones',        'codigo'],
    array['taller_especialidades', 'taller_id'', ''especialidad']
  ];
  v_par text[]; v_hechos int := 0;
begin
  foreach v_par slice 1 in array v_pares loop
    execute format('drop trigger if exists trg_auditar on public.%I', v_par[1]);
    execute format(
      'create trigger trg_auditar after insert or update or delete on public.%I
         for each row execute function private.auditar(%L)', v_par[1], v_par[2]);
    v_hechos := v_hechos + 1;
  end loop;
  raise notice '% disparadores de auditoria nombran su clave.', v_hechos;
end $disparadores$;

/*
  COMPROBADO el 8 de septiembre por las puertas reales, en transaccion deshecha:

    categoria de gasto nueva ... codigo «FLETES_Y_ACARREO_DE_TERCEROS»
                                 nombre «Fletes y acarreo de terceros»
    la auditoria dice .......... INSERT sobre la fila «FLETES_Y_ACARREO_DE_TERCEROS»
    motivo de despacho nuevo ... codigo «OBRA_CIVIL_DE_LA_COMUNIDAD»
    la auditoria dice .......... fila «OBRA_CIVIL_DE_LA_COMUNIDAD»
    editar el motivo ........... queda «Obra civil de la comunidad II»

  Los cuatro fallaban antes con 22004. Al terminar: 19 movimientos,
  868.927.307,04. Nada de produccion tocado.
*/
