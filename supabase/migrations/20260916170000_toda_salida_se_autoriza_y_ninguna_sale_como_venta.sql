/*
  TODA SALIDA SE AUTORIZA, Y NINGUNA SALE COMO VENTA

  Christopher, 16/09/2026, al encontrar salidas de material anotadas con la
  razón «VENTA»: «habíamos acordado la razón de por qué eso no debería estar»;
  «el material sale sin precio ni relación ni nada»; «nadie puede registrar
  salida con motivo de venta fuera del módulo correspondiente». Y enseguida:
  «todas las salidas necesitarán de autorización, ocultaremos las salidas y
  traslados directos por ahora».

  POR QUÉ SEGUÍA AHÍ. La razón se había apagado esa misma mañana, pero la lista
  se edita desde la pantalla de salidas y nada impedía volver a encenderla:
  `guardar_clase_de_salida` no sabía lo que es una venta. Apagarla una vez no
  bastaba; hacía falta que no se pudiera volver a poner.

  Lo que cambia:

  1. `private.nombra_una_venta` reconoce una venta en el nombre de una razón o
     en el texto de para qué se pide algo.
  2. La razón VENTA se apaga, y ninguna razón que nombre una venta puede quedar
     encendida: lo impide `guardar_clase_de_salida` y, por si otra puerta la
     tocara, una regla de la propia tabla.
  3. `registrar_salidas` solo descuenta cuando la llama la entrega de una
     solicitud aprobada. La salida directa queda cerrada en la base y no solo
     escondida en la pantalla: llamando a la API a mano tampoco se abre. La
     puerta vieja de un renglón, `registrar_salida`, igual.
  4. `pedir_salida` no acepta un «para qué» que describa una venta, y la entrega
     tampoco descuenta una solicitud de antes que lo diga.
  5. `solicitar_traslado` no acepta el traslado directo. Pedir y enviar siguen:
     en los dos, quien responde por el destino confirma que llegó.

  LO QUE NO SE TOCA: las salidas ya registradas con esa razón. Mover el libro
  para «arreglarlas» sería escribir lo que no pasó; las revisa Christopher.

  POR AHORA. Cuando vuelva la salida directa, se reabre en `registrar_salidas`
  y en `registrar_salida`; lo de la venta se queda.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Qué es nombrar una venta
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function private.nombra_una_venta(p_texto text, p_es_nombre boolean default false)
returns boolean
language sql
immutable
set search_path to ''
as $func$
  /*
    ¿DICE ESTE TEXTO QUE ALGO SE VENDIÓ?

    Dos varas, porque no se lee igual el nombre de una razón que una frase.

    En el NOMBRE DE UNA RAZÓN basta la palabra: «VENTAS», «CLIENTES», «PAGO» o
    «CANJE» son una venta con otro nombre, vengan con más palabras o sin ellas.

    En el TEXTO de para qué se pide hace falta que la frase lo diga: «venta»,
    «vendido», «pago con material», «cruce de facturas», «para el cliente». El
    plural «ventas» no cuenta ahí, porque también es el nombre de una oficina, y
    las «vendas» son del botiquín.

    Se quitan acentos y guiones bajos antes de mirar, para que «VENTA_A_CLIENTE»
    y «se vendió» cuenten igual.
  */
  select translate(upper(coalesce(p_texto, '')), 'ÁÉÍÓÚÜ_', 'AEIOUU ')
         ~ case when coalesce(p_es_nombre, false)
                then '\m(VENTAS?|VENDER|VENDID[OA]S?|VENDIO|VENDE|CLIENTES?|FACTURAS?|FACTURAR|FACTURAD[OA]S?|PAGOS?|PAGAR|PERMUTAS?|TRUEQUES?|CANJES?|CRUCES?)\M'
                else '\m(VENTA|VENDER|VENDID[OA]S?|VENDIO|SE VENDE|CLIENTES?|PERMUTAS?|TRUEQUES?|CANJES?|CRUCE DE FACTURAS?|PAGO CON MATERIAL(ES)?|PAGO EN MATERIAL(ES)?|PAGO EN ESPECIE)\M'
           end;
$func$;

revoke all on function private.nombra_una_venta(text, boolean) from public, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. La razón VENTA se apaga y no vuelve
-- ═══════════════════════════════════════════════════════════════════════════

update public.clases_de_salida
   set activa = false
 where activa
   and codigo <> 'ENTREGA_POR_SOLICITUD'
   and private.nombra_una_venta(codigo || ' ' || nombre, true);

alter table public.clases_de_salida
  add constraint clase_de_salida_no_nombra_una_venta
  check (not activa or not private.nombra_una_venta(codigo || ' ' || nombre, true));

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Las puertas, por parche anclado
-- ═══════════════════════════════════════════════════════════════════════════

do $parche$
declare
  v_def text;
  r     record;
begin
  for r in
    select * from (values
      ('public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean)',
       $a$  if p_codigo = 'ENTREGA_POR_SOLICITUD' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud: no se edita.' using errcode = '22023';
  end if;$a$,
       $b$  if p_codigo = 'ENTREGA_POR_SOLICITUD' then
    raise exception 'Esa razón la pone el sistema al entregar una solicitud: no se edita.' using errcode = '22023';
  end if;

  /*
    UNA VENTA NO ES UNA RAZÓN DE SALIDA. Sale por Facturación, con cliente,
    precio y número, y una salida de almacén no sabe nada de eso. La razón VENTA
    se apagó una vez y se volvió a encender desde esta misma lista: por eso ya no
    se deja ni crear ni editar una que nombre una venta.
  */
  if private.nombra_una_venta(coalesce(p_codigo, '') || ' ' || v_nombre, true) then
    raise exception 'Una venta no es una razón de salida: se registra en Facturación › Notas de entrega, con cliente, precio y su número.'
      using errcode = '22023';
  end if;$b$),

      ('public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)',
       $a$  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;$a$,
       $b$  perform private.exigir_permiso('SALIDAS', 'ESCRITURA');

  /*
    POR AHORA TODA SALIDA SE AUTORIZA. Christopher, 16/09/2026: «todas las
    salidas necesitarán de autorización, ocultaremos las salidas y traslados
    directos por ahora». La única llamada que descuenta es la de la entrega de
    una solicitud aprobada, que enciende esta marca solo mientras dura. Sin ella
    es una salida directa, y se cierra aquí y no solo en la pantalla.
  */
  if nullif(current_setting('lacantera.entregando_solicitud', true), '') is null then
    raise exception 'Por ahora toda salida necesita autorización: solicítala en Salidas › Salidas y se entrega cuando la apruebe quien responde por el almacén.'
      using errcode = '42501';
  end if;

  -- Y ninguna sale como venta, aunque la solicitud sea de antes de esta regla.
  if private.nombra_una_venta(p_motivo) then
    raise exception 'Una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número.'
      using errcode = '22023';
  end if;

  select * into v_clase from public.clases_de_salida where codigo = p_tipo;$b$),

      ('public.registrar_salida(bigint, bigint, numeric, text, text, date)',
       $a$  perform private.exigir_rol('ALMACEN');

  if p_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then$a$,
       $b$  perform private.exigir_rol('ALMACEN');

  -- La puerta vieja de un renglón tampoco saca nada sin autorización: ver
  -- `registrar_salidas`.
  raise exception 'Por ahora toda salida necesita autorización: solicítala en Salidas › Salidas y se entrega cuando la apruebe quien responde por el almacén.'
    using errcode = '42501';

  if p_tipo not in ('SALIDA_CONSUMO', 'SALIDA_MERMA', 'SALIDA_DESPACHO') then$b$),

      ('public.pedir_salida(bigint, jsonb, text, bigint, text, text)',
       $a$  if length(v_motivo) < 10 then
    raise exception 'Escribe para qué se necesita: es lo que lee quien la aprueba.' using errcode = '22023';
  end if;$a$,
       $b$  if length(v_motivo) < 10 then
    raise exception 'Escribe para qué se necesita: es lo que lee quien la aprueba.' using errcode = '22023';
  end if;

  -- Una venta no se pide por aquí, ni lo que se le da a un cliente sin cobrarlo:
  -- va por Facturación, que es donde lleva cliente, precio y número.
  if private.nombra_una_venta(v_motivo) then
    raise exception 'Una venta no sale por aquí: se registra en Facturación › Notas de entrega, con cliente, precio y su número. Lo que se le da a un cliente sin cobrarlo también va por allá, como sin cargo.'
      using errcode = '22023';
  end if;$b$),

      ('public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean)',
       $a$  if coalesce(p_inmediato, false) and coalesce(p_enviar, false) then
    raise exception 'Un traslado se envía o es directo, no las dos cosas.' using errcode = '22023';
  end if;$a$,
       $b$  if coalesce(p_inmediato, false) and coalesce(p_enviar, false) then
    raise exception 'Un traslado se envía o es directo, no las dos cosas.' using errcode = '22023';
  end if;

  /*
    EL TRASLADO DIRECTO, APAGADO POR AHORA. Christopher, 16/09/2026:
    «ocultaremos las salidas y traslados directos por ahora». Pedir y enviar
    siguen abiertos: en los dos, quien responde por el destino confirma que
    llegó.
  */
  if coalesce(p_inmediato, false) then
    raise exception 'Por ahora no hay traslado directo: pide el material o envíalo, y quien responde por el almacén de destino confirma que llegó.'
      using errcode = '42501';
  end if;$b$)
    ) as t(funcion, antes, despues)
  loop
    v_def := pg_get_functiondef(r.funcion::regprocedure);
    if (length(v_def) - length(replace(v_def, r.antes, ''))) / length(r.antes) <> 1 then
      raise exception 'En % el texto «%» no aparece exactamente una vez.', r.funcion, r.antes;
    end if;
    execute replace(v_def, r.antes, r.despues);
  end loop;
end
$parche$;

do $ver$
begin
  if exists (select 1 from public.clases_de_salida where activa and codigo = 'VENTA') then
    raise exception 'la razón VENTA sigue encendida';
  end if;
  if position('POR AHORA TODA SALIDA SE AUTORIZA' in pg_get_functiondef('public.registrar_salidas(bigint, jsonb, text, text, date, bigint, text, text)'::regprocedure)) = 0 then
    raise exception 'registrar_salidas sigue aceptando salidas directas';
  end if;
  if position('necesita autorización' in pg_get_functiondef('public.registrar_salida(bigint, bigint, numeric, text, text, date)'::regprocedure)) = 0 then
    raise exception 'registrar_salida sigue abierta';
  end if;
  if position('nombra_una_venta' in pg_get_functiondef('public.pedir_salida(bigint, jsonb, text, bigint, text, text)'::regprocedure)) = 0
     or position('nombra_una_venta' in pg_get_functiondef('public.guardar_clase_de_salida(text, text, text, text, text, smallint, boolean, boolean)'::regprocedure)) = 0 then
    raise exception 'pedir_salida o guardar_clase_de_salida no miran si es una venta';
  end if;
  if position('EL TRASLADO DIRECTO, APAGADO POR AHORA' in pg_get_functiondef('public.solicitar_traslado(bigint, bigint, bigint, numeric, text, date, numeric, text, numeric, text, boolean, boolean)'::regprocedure)) = 0 then
    raise exception 'solicitar_traslado sigue aceptando el traslado directo';
  end if;
end
$ver$;
