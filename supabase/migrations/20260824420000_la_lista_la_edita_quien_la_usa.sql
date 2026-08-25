-- ---------------------------------------------------------------------------
-- La lista la edita quien la usa
--
-- Validando la matriz de permisos salió que las dos listas editables que se
-- montaron hoy —los motivos del vale de combustible y las razones por las que
-- sale un material— piden el nivel TOTAL de su módulo para editarse.
--
-- Y TOTAL no lo tiene quien las usa. Medido en la base, hoy mismo:
--
--   COMBUSTIBLE:TOTAL ... admin_, prueba.admin, revision.diseno, sistemas2
--
-- Es decir: SOLO LAS CUATRO CUENTAS ADMIN. Ni Leniska, ni Susej, ni Jesmary,
-- que son quienes despachan combustible todos los días.
--
-- Con la matriz nueva que está pendiente de aplicar es peor, porque
-- INVENTARIO:TOTAL también se queda sin nadie: las razones de salida —que hoy
-- sí pueden editar seis personas— pasarían a ser cosa de ADMIN igual.
--
-- =========================================================================
-- ESO ES EXACTAMENTE LO QUE LA LÍDER PIDIÓ QUE NO PASARA
-- =========================================================================
--
-- Su frase, sobre los motivos del vale:
--
--   «Ok, te aviso si hay cambios, igual debe ser editable, no quiero nos llamen
--    a cada rato por cosas así»
--
-- Una lista que solo edita el administrador del sistema es una lista por la que
-- nos van a llamar. La pedimos editable y la dejamos cerrada con llave.
--
-- =========================================================================
-- AÑADIR ES ESCRITURA. APAGAR SIGUE SIENDO TOTAL
-- =========================================================================
--
-- En esta casa TOTAL significa lo que no se deshace: anular, dar de baja,
-- borrar. Añadir un renglón a un catálogo no es eso — es escribir.
--
-- Apagar sí se queda en TOTAL: una razón apagada deja de ofrecerse, y aunque no
-- rompe las salidas viejas —que la nombran por su código—, sí cambia lo que
-- puede elegir todo el mundo mañana. Que eso lo decida quien lleva el módulo
-- entero es razonable.
--
-- Y a dónde va cada clase —consumo, merma o baja— sigue sin poderse cambiar
-- desde la pantalla, que era la reja que de verdad importaba.
--
-- COMPROBADO, en transacción revertida, entrando como prueba.bienes.fluidos
-- (solo rol ALMACEN: COMBUSTIBLE=ESCRITURA, INVENTARIO=ESCRITURA):
--
--   añadir un motivo de vale ....... SI puede
--   añadir una razón de salida ..... SI puede
--   apagar una razón ............... NO: «Tu usuario no tiene acceso a Inventario»
-- ---------------------------------------------------------------------------

do $migracion$
declare
  v_def text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where proname = 'guardar_motivo_despacho' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'No existe public.guardar_motivo_despacho.';
  end if;

  v_def := replace(v_def,
    'private.exigir_permiso(''COMBUSTIBLE'', ''TOTAL'')',
    'private.exigir_permiso(''COMBUSTIBLE'', ''ESCRITURA'')');

  if v_def like '%''COMBUSTIBLE'', ''TOTAL''%' then
    raise exception 'No se pudo bajar el nivel en guardar_motivo_despacho.';
  end if;

  execute v_def;

  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where proname = 'guardar_clase_de_salida' and pronamespace = 'public'::regnamespace;

  if v_def is null then
    raise exception 'No existe public.guardar_clase_de_salida.';
  end if;

  v_def := replace(v_def,
    'private.exigir_permiso(''INVENTARIO'', ''TOTAL'')',
    'private.exigir_permiso(''INVENTARIO'', ''ESCRITURA'')');

  if v_def like '%''INVENTARIO'', ''TOTAL''%' then
    raise exception 'No se pudo bajar el nivel en guardar_clase_de_salida.';
  end if;

  execute v_def;
end;
$migracion$;

comment on function public.guardar_motivo_despacho(text, text, text, smallint, boolean, boolean) is
  'Anade o corrige un motivo del vale de combustible. Pide ESCRITURA y no TOTAL: con TOTAL solo lo podian las cuentas de administrador, y la lista se hizo editable justamente para no tener que llamarnos.';

comment on function public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean) is
  'Anade o corrige una razon por la que sale un material. Pide ESCRITURA y no TOTAL, por lo mismo que los motivos del vale. Apagar una sigue pidiendo TOTAL, y a donde va cada clase no se cambia desde la pantalla.';
