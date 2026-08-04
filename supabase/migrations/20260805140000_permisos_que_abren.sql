-- ============================================================================
-- La matriz de permisos pasa a abrir puertas, no solo a taparlas
--
-- Hoy el sistema cierra las puertas de dos maneras distintas y eso se nota al
-- usarlo:
--
--   · Las funciones nuevas —ventas, explotación, despachos, prestaciones—
--     preguntan `exigir_permiso(módulo, nivel)`. Ahí la pantalla de Usuarios y
--     roles manda: das Ventas en escritura y la persona vende.
--
--   · Las viejas —nómina, tesorería, compras, almacén— preguntan
--     `exigir_rol('RRHH')`, `exigir_rol('TESORERIA')`… el NOMBRE del rol. Ahí
--     la pantalla no manda: das Nómina en escritura a un rol propio, la
--     pantalla se abre, la persona llena la ficha y al guardar le rebota
--     "Tu usuario no tiene ese rol". Es el peor error posible, porque llega
--     después del trabajo.
--
-- La migración de permisos por módulo (28/07) decía que la matriz solo podía
-- restringir, y tenía razón para el miedo que la movía: si la matriz otorgara
-- CUALQUIER cosa, una tarde de clics distraídos abriría el sistema entero.
--
-- Lo que se hace aquí no es quitar esa cautela, es dirigirla. Cada rol del
-- sistema gobierna un módulo a un nivel concreto, y eso se escribe una sola vez
-- abajo. Exigir el rol RRHH pasa a significar "exigir escritura en Nómina", que
-- es lo que siempre quiso decir. El rol literal SIGUE VALIENDO, así que nadie
-- pierde lo que hoy tiene; lo que se gana es que la pantalla de permisos por fin
-- gobierne las cuarenta y tantas puertas que hoy no gobierna.
--
-- Dos roles se quedan a propósito sin equivalencia:
--
--   ADMIN, porque crear usuarios y repartir roles es la llave maestra. Colgarla
--   de un nivel de la escalera significaría que quien administra un módulo
--   puede darse a sí mismo todos los demás.
--
--   GERENTE_GENERAL, porque lo que guarda no es acceso sino firma: aprobar una
--   compra, aprobar una nómina, devolver algo a cotización. Separar quién hace
--   de quién aprueba no es un nivel más alto de lo mismo — es otra cosa. Si
--   "Control total en Compras" bastara para aprobar, el mismo comprador que
--   arma la orden la firmaría.
--
-- De paso se tapan las dos únicas funciones del sistema que no preguntan nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- La equivalencia
--
-- Se escribe aquí y en ningún otro sitio. Un rol nuevo creado desde la pantalla
-- no aparece en esta lista y no le hace falta: no hay función que lo nombre, así
-- que a él la matriz ya lo gobernaba desde el primer día.
-- ---------------------------------------------------------------------------
create or replace function private.equivalencia_rol(p_rol text)
returns table (modulo text, nivel text)
language sql
immutable
as $$
  select e.modulo, e.nivel
  from (values
    -- Quien lleva la nómina la escribe entera: fichas, novedades, períodos,
    -- tabulador.
    ('RRHH',        'NOMINA',      'ESCRITURA'),

    -- Tesorería mueve dinero: cuentas, pagos, ingresos, egresos, y el pago de
    -- la nómina ya calculada.
    ('TESORERIA',   'TESORERIA',   'ESCRITURA'),

    -- Almacén es quien recibe, despacha y ajusta lo que hay en el patio.
    ('ALMACEN',     'INVENTARIO',  'ESCRITURA'),

    -- Compras va a TOTAL y no a ESCRITURA a propósito. En la matriz sembrada,
    -- "Compras en escritura" lo tienen también Solicitante, Operaciones y RRHH,
    -- que son quienes PIDEN material. Si el comprador y el que pide compartieran
    -- nivel, cualquiera podría confirmar un pedido o dar de alta un proveedor.
    -- Pedir es escritura; comprar es total.
    ('COMPRAS',     'COMPRAS',     'TOTAL'),
    ('SOLICITANTE', 'COMPRAS',     'ESCRITURA'),

    -- Operaciones vive en el frente y pide lo que le hace falta.
    ('OPERACIONES', 'EXPLOTACION', 'ESCRITURA')
  ) as e(rol, modulo, nivel)
  where e.rol = p_rol;
$$;

-- ---------------------------------------------------------------------------
-- La puerta
--
-- Se conserva el mensaje que nombra el rol que falta, porque un "no autorizado"
-- seco obliga a adivinar y termina en una llamada a sistemas. Solo se le añade
-- la otra forma de entrar, para que quien administra los permisos sepa dónde
-- tocar sin tener que abrir el código.
-- ---------------------------------------------------------------------------
create or replace function private.exigir_rol(variadic p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_eq  record;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelve a entrar.' using errcode = '28000';
  end if;

  -- El rol literal, como siempre. Nadie pierde lo que ya tenía.
  if private.tiene_rol(variadic p_roles) then
    return;
  end if;

  -- Y ahora sí: el permiso equivalente. Basta con uno de los roles pedidos.
  foreach v_rol in array p_roles loop
    for v_eq in select * from private.equivalencia_rol(v_rol) loop
      if private.tiene_permiso(v_eq.modulo, v_eq.nivel) then
        return;
      end if;
    end loop;
  end loop;

  raise exception 'Esta acción la realiza: %. Tu usuario no tiene ese rol%.',
    coalesce(
      (select string_agg(r.nombre, ' o ' order by r.orden)
         from public.roles r where r.codigo = any(p_roles)),
      array_to_string(p_roles, ' o ')),
    coalesce(
      (select ', ni ' || string_agg(distinct lower(eq.nivel) || ' en ' || m.nombre, ' o ')
         from unnest(p_roles) as rol
         cross join lateral private.equivalencia_rol(rol) as eq
         join public.modulos m on m.codigo = eq.modulo),
      '')
    using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- La tasa del día
--
-- La función nació con este comentario encima: "La comprobación de permiso se
-- añade cuando exista el módulo de roles; por ahora exige sesión válida". El
-- módulo existe desde el 28 de julio y la comprobación nunca se añadió.
--
-- No es una función menor. La tasa del BCV es con lo que se valora TODO: cada
-- cotización, cada factura, cada recibo de pago congela la tasa del día en que
-- se hizo. Quien la carga mal no equivoca un dato, mueve todos los números del
-- sistema a la vez, y como las tasas no se corrigen —esa regla ya estaba— el
-- error se queda.
--
-- Se pide escritura en Tasas de cambio. Hoy la tienen administración y
-- tesorería, que es quien la consulta todas las mañanas.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_tasa(
  p_origen  char(3),
  p_destino char(3),
  p_fecha   date,
  p_tasa    numeric,
  p_fuente  text default 'BCV'
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  bigint;
begin
  perform private.exigir_permiso('TASAS', 'ESCRITURA');

  if p_tasa is null or p_tasa <= 0 then
    raise exception 'La tasa debe ser mayor que cero (recibido: %)', p_tasa
      using errcode = '22023';
  end if;

  if p_fecha > current_date then
    raise exception 'No se puede registrar una tasa con fecha futura'
      using errcode = '22023';
  end if;

  insert into public.tasas_cambio
    (moneda_origen, moneda_destino, fecha, tasa, fuente, registrado_por)
  values
    (p_origen, p_destino, p_fecha, p_tasa, p_fuente, v_uid)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe una tasa % para %/% del %', p_fuente, p_origen, p_destino, p_fecha
      using errcode = '23505',
            hint = 'Las tasas no se corrigen: si el valor cambió, consulte con administración.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Enviar un pedido
--
-- Era la única función de escritura del sistema sin ninguna comprobación:
-- cualquiera que entrara podía tomar el borrador de otro y mandarlo a compras
-- con su nombre encima.
--
-- Se copia la regla que ya usa `actualizar_pedido`, que es la correcta: el
-- borrador es de quien lo escribió, y compras puede moverlo porque a veces el
-- que pidió se fue de vacaciones con el pedido a medias.
-- ---------------------------------------------------------------------------
create or replace function public.enviar_pedido(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_dueno  uuid;
begin
  select estado, registrada_por into v_estado, v_dueno
  from public.solicitudes_pedido where id = p_id;

  if v_estado is null then
    raise exception 'No existe el pedido %.', p_id using errcode = 'P0002';
  end if;

  if v_estado is distinct from 'BORRADOR' then
    raise exception 'Solo se envía un borrador. Este pedido está en "%".', v_estado
      using errcode = '55000';
  end if;

  if v_dueno is distinct from (select auth.uid())
     and not private.tiene_rol('COMPRAS')
     and not private.tiene_permiso('COMPRAS', 'TOTAL') then
    raise exception 'Solo quien creó el borrador puede enviarlo.' using errcode = '42501';
  end if;

  update public.solicitudes_pedido
     set estado = 'PEDIDO', enviada_en = now()
   where id = p_id;

  perform private.anotar('SOLICITUD', p_id, 'BORRADOR', 'PEDIDO');
end;
$$;

revoke execute on function public.enviar_pedido(bigint) from public, anon;
grant   execute on function public.enviar_pedido(bigint) to authenticated;
