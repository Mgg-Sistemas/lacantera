/*
  LA PLANILLA DE ARTÍCULOS YA NO SUPONE LA MONEDA

  Christopher: «La planilla de artículos: si viene sin moneda, la sigue
  rellenando en dólares. En el sistema se debe frenar esos items en específico
  advirtiendo y permitiendo su corrección en sistema».

  La entrada a mano dejó de suponer dólares con `20260915130000`:
  `registrar_entradas` exige la moneda. Pero la planilla escribía USD en la
  celda vacía antes de llamarla, así que por la vía de lote seguía colándose lo
  mismo que se cerró a mano: un costo o un precio en bolívares guardado como si
  fueran dólares.

  QUÉ CAMBIA

  Una fila con precio o con costo y sin moneda es una fila con problema, y como
  cualquier otra, con una sola así no entra ninguna. Sin precio ni costo la
  moneda no se usa y no se pide; lo que entra sin valorar tampoco la necesita,
  porque no trae cifra.

  Y el informe dice QUÉ COLUMNA tiene el problema —`campo`— cuando es la moneda,
  para que la pantalla abra esa fila con el cursor en esa casilla. La corrección
  se hace en el sistema y la revisión vuelve a pasar por esta misma función: lo
  que se enseña sigue siendo exactamente lo que se va a escribir.
*/
do $mig$
declare
  v_def   text := pg_get_functiondef('public.cargar_articulos_por_lote(jsonb,boolean)'::regprocedure);
  v_ancla text;
begin
  -- 1. La columna del problema, junto al motivo.
  v_ancla := $a$  v_motivo    text;
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 1 (declarar el campo) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$  v_motivo    text;
  -- La casilla del problema, cuando se sabe: la pantalla abre la fila ahí.
  v_campo     text;
$n$);

  -- 2. Se limpia con el motivo, fila a fila.
  v_ancla := $a$    v_motivo := null;
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 2 (limpiar el campo) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$    v_motivo := null;
    v_campo  := null;
$n$);

  -- 3. La celda vacía se queda vacía.
  v_ancla := $a$    v_moneda    := upper(btrim(coalesce(nullif(btrim(coalesce(v_fila->>'moneda','')), ''), 'USD')));
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 3 (la moneda por defecto) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$    -- Vacía se queda vacía: rellenarla con dólares es lo que guardaba bolívares
    -- como si fueran dólares. Las dos rejas de la moneda van más abajo.
    v_moneda    := upper(btrim(coalesce(v_fila->>'moneda', '')));
$n$);

  -- 4. Precio sin moneda.
  v_ancla := $a$      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 4 (precio sin moneda) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$      elsif v_precio is not null and v_moneda = '' then
        v_motivo := 'Trae precio pero no dice en qué moneda. Elige la moneda: el sistema ya no supone dólares.';
        v_campo  := 'moneda';
      elsif v_precio is not null
            and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
        v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
        v_campo  := 'moneda';
$n$);

  -- 5. Costo sin moneda. Lo que entra sin valorar no trae cifra y no la pide.
  v_ancla := $a$        elsif not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 5 (costo sin moneda) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$        elsif not v_sin_val and v_moneda = '' then
          v_motivo := 'Trae costo pero no dice en qué moneda. Elige la de la factura: el sistema ya no supone dólares.';
          v_campo  := 'moneda';
        elsif v_moneda <> ''
              and not exists (select 1 from public.monedas where codigo = v_moneda and activa) then
          v_motivo := format('La moneda «%s» no está activa en el sistema.', v_moneda);
          v_campo  := 'moneda';
$n$);

  -- 6. El campo viaja en el informe.
  v_ancla := $a$      'motivo', v_motivo,
$a$;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'ancla 6 (el campo en el informe) no aparece exactamente una vez';
  end if;
  v_def := replace(v_def, v_ancla, $n$      'motivo', v_motivo,
      'campo', v_campo,
$n$);

  execute v_def;
end
$mig$;

do $ver$
declare
  v_def text := pg_get_functiondef('public.cargar_articulos_por_lote(jsonb,boolean)'::regprocedure);
begin
  if position($t$'USD')));$t$ in v_def) > 0 then
    raise exception 'la planilla sigue rellenando la moneda con USD';
  end if;
  if position('Trae precio pero no dice en qué moneda' in v_def) = 0
     or position('Trae costo pero no dice en qué moneda' in v_def) = 0
     or position($t$'campo', v_campo,$t$ in v_def) = 0 then
    raise exception 'falta una de las rejas de la moneda o el campo en el informe';
  end if;
end
$ver$;
