-- ---------------------------------------------------------------------------
-- No caben cien litros en un tanque de cuarenta
--
-- Christopher: «es posible que las máquinas tengan un máximo de combustible
-- (capacidad), por lo que, por ejemplo, no pudiera suministrar 100 L a una
-- máquina que soporta 40 L».
--
-- Es el hermano de `combustible_id`, que ya impedía echarle gasolina a un motor
-- diésel. Aquella comprueba QUÉ se le echa; esta, CUÁNTO.
--
-- POR QUÉ ES UN BLOQUEO Y NO UN AVISO
--
-- Casi todo lo que comprueba este módulo avisa en vez de parar —el horómetro que
-- no arrastra suele ser un tablero roto, y bloquearlo dejaría la máquina sin
-- gasoil—. Esto no: meter cien litros en un tanque de cuarenta no es raro, es
-- imposible. Si el vale lo dice, el vale está mal.
--
-- Y el mensaje ofrece la salida del caso legítimo que existe: cuando parte del
-- combustible va a un envase aparte, son dos vales y no uno inflado.
--
-- NULA MIENTRAS NO SE SEPA
--
-- Igual que el combustible de cada máquina. Exigir la capacidad para dar de alta
-- un equipo sería pedir un dato que nadie tiene a mano el primer día, y el
-- primer día es justo cuando hay que cargar la flota entera.
-- ---------------------------------------------------------------------------

alter table public.maquinaria
  add column if not exists capacidad_combustible numeric(10,2)
  check (capacidad_combustible is null or capacidad_combustible > 0);

comment on column public.maquinaria.capacidad_combustible is
  'Cuántos litros le caben al tanque de la máquina. Nula mientras no se sepa; en cuanto está, un vale que la pase se para: no se pueden meter 100 L en un tanque de 40.';

-- ---------------------------------------------------------------------------
-- La comprobación, dentro del despacho
--
-- Va junto a la del tipo de combustible porque las dos responden a lo mismo
-- —«esto no le entra a esta máquina»— y quien lea la función tiene que verlas
-- juntas o acabará añadiendo la tercera en otro sitio.
--
-- COMPROBADO, en transacción revertida:
--
--   100 L en un tanque de 40 ... bloqueado, «le caben 40.00 L y se están
--                                 despachando 100»
--   exactamente 40 L .......... pasa
--   máquina sin capacidad ..... pasa, no estorba
-- ---------------------------------------------------------------------------
do $migracion$
declare
  v_def   text;
  v_viejo text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
   where p.proname = 'despachar_combustible'
     and p.pronamespace = 'public'::regnamespace;

  v_viejo := '    if v_maq.combustible_id is not null and v_maq.combustible_id <> p_articulo_id then';

  -- Si ya está puesta, no se hace nada: esta migración es idempotente.
  if position('capacidad_combustible' in v_def) > 0 then
    return;
  end if;

  if position(v_viejo in v_def) = 0 then
    raise exception 'La función despachar_combustible no tiene la forma esperada: revísala antes de aplicar esto.';
  end if;

  v_nuevo := '    -- No caben cien litros en un tanque de cuarenta. Se comprueba solo cuando
    -- la ficha lo dice: exigir la capacidad para cargar la flota seria pedir un
    -- dato que nadie tiene a mano el primer dia.
    if v_maq.capacidad_combustible is not null and p_cantidad > v_maq.capacidad_combustible then
      raise exception ''Al tanque de "%" le caben % %, y se estan despachando %.'',
        v_maq.nombre, v_maq.capacidad_combustible, v_art.unidad, p_cantidad
        using errcode = ''22023'',
              hint = ''Si el combustible va a un envase aparte, registralo como otro vale sin ficha de maquina.'';
    end if;

    if v_maq.combustible_id is not null and v_maq.combustible_id <> p_articulo_id then';

  execute replace(v_def, v_viejo, v_nuevo);
end;
$migracion$;
