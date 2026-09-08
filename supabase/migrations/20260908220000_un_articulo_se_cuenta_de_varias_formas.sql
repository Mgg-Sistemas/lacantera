/*
  UN ARTÍCULO SE CUENTA DE VARIAS FORMAS, Y SIGUE SIENDO UNA SOLA EXISTENCIA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP, en seis trozos, y probada de
  punta a punta en transacción deshecha. Este archivo los junta: es la regla 7
  —«comprueba que lo que aplicaste por MCP acabe en un archivo»— cerrada el
  mismo día, y no tres semanas después como las nueve funciones huérfanas que
  el carril de base de datos encontró esta mañana.
  ————————————————————————————————————————————————————————————————————————

  LO QUE PIDIÓ CHRISTOPHER

  El 7 de septiembre: «puede existir la posibilidad de que la presentación de un
  producto varíe a pesar de su unidad de operación». Aceite en tambor y en
  galón; tuercas en pack de 6, de 12, par y unidad.

  Hasta hoy un artículo tenía UNA presentación, en dos columnas de `articulos`:
  `presentacion` y `unidades_por_presentacion`. Con eso, el aceite que llega en
  tambores de 208 y en bidones de 20 solo podía declarar uno de los dos, y el
  otro había que teclearlo en litros de cabeza — que es de donde salen los
  errores que llevamos toda la semana persiguiendo.

  LA REGLA QUE LO SOSTIENE TODO

  Un artículo tiene UNA unidad de operación y UNA existencia. Estas son maneras
  de contar, no maneras de almacenar. El aceite en tambor y en bidón es el mismo
  aceite y el mismo número de litros — y por eso se puede preguntar «cuánto
  aceite SAE 50 hay» y que haya una respuesta.

  SE DESCARTÓ crear «ACEITE (TAMBOR)» y «ACEITE (GALÓN)» como dos artículos,
  precisamente por eso: parte la existencia, parte el costo promedio, parte el
  mínimo de stock, y los informes cuentan dos cosas donde hay una.

  POR QUÉ EL FACTOR CUELGA DEL ARTÍCULO Y NO DE UNA TABLA GLOBAL

  Un tambor es 208 litros para un aceite y 200 para otro. Una tabla de
  equivalencias compartida obligaría a inventar un tambor estándar y a mentir en
  todos los que no lo son. Lo compartido es el NOMBRE —TAMBOR, CAJA, SACO, de
  `presentaciones`— para que nadie escriba «Tambor», «TAMBORES» y «tambor» y
  acaben siendo tres.

  LAS DOS COLUMNAS VIEJAS NO SE BORRAN, Y ES A PROPÓSITO

  `crear_articulo`, `editar_articulo` y `cargar_articulos_por_lote` siguen
  escribiéndolas, y la pantalla sigue leyéndolas. Migrar las tres puertas para
  la misma regla es cómo se rompen las cosas que funcionan —llevo cuatro
  incidentes esta semana que empiezan exactamente así—, de modo que las columnas
  quedan como la versión de una sola presentación y un disparador las mantiene
  diciendo lo mismo que la tabla. Quien solo conoce las columnas sigue
  funcionando; quien declara varias usa la tabla.

  LO QUE SE COMPROBÓ, en transacción deshecha, contra la base viva:

      entran 3 BIDON ......... opera 60,00, capturado 3,00 BIDON
      entra 1 sin decir cuál . opera 208,00, capturado en TAMBOR (la de defecto)
      salen 2 BIDON .......... opera 40,00, capturado en BIDON
      contado 1 TAMBOR y 12 L. AJUSTE_NEGATIVO de 8,00, capturado 1,00 TAMBOR
                               y 12,00 suelto
      EXISTENCIA FINAL ....... 220,00 L, una sola, contada de dos maneras
      SACO, que no declara ... rebota: «"ACEITE..." no se cuenta en SACO — esa
                               presentación no está declarada o está apagada.»

  Al terminar: 19 movimientos, 868.927.307,04. Nada de producción tocado.
*/

do $guarda$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relname='presentaciones') then
    raise exception 'Falta public.presentaciones, el catálogo de nombres.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='numero_es') then
    raise exception 'Falta private.numero_es, que usan los mensajes.';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='private' and p.proname='exigir_accion') then
    raise exception 'Falta private.exigir_accion.';
  end if;
end $guarda$;

-- ===========================================================================
-- 1. La tabla
-- ===========================================================================

create table if not exists public.articulo_presentaciones (
  id           bigint generated always as identity primary key,
  articulo_id  bigint not null references public.articulos(id) on delete cascade,
  -- El nombre sale del catalogo compartido. Es lo unico compartido: el factor
  -- no, porque un tambor no trae lo mismo en todos los articulos.
  presentacion text   not null references public.presentaciones(codigo),
  unidades     numeric not null check (unidades > 0),
  por_defecto  boolean not null default false,
  -- Se apagan, no se borran: los movimientos viejos guardan el NOMBRE que se
  -- uso, no un puntero a esta fila, y tienen que seguir legibles.
  activa       boolean not null default true,
  creada_en    timestamptz not null default now(),
  creada_por   uuid,
  unique (articulo_id, presentacion)
);

-- Una sola por defecto y por articulo. Parcial, porque el resto puede repetir
-- el falso tantas veces como haga falta.
create unique index if not exists articulo_presentaciones_defecto_idx
  on public.articulo_presentaciones (articulo_id) where por_defecto;

create index if not exists articulo_presentaciones_articulo_idx
  on public.articulo_presentaciones (articulo_id) where activa;

alter table public.articulo_presentaciones enable row level security;

do $politica$
begin
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='articulo_presentaciones'
                    and policyname='articulo_presentaciones_lectura') then
    -- Se lee con el permiso del modulo y se escribe solo por funcion, como todo
    -- lo demas: `authenticated` no tiene INSERT, UPDATE ni DELETE aqui.
    create policy articulo_presentaciones_lectura on public.articulo_presentaciones
      for select to authenticated
      using (private.tiene_permiso('INVENTARIO', 'LECTURA'));
  end if;
end $politica$;

revoke insert, update, delete on public.articulo_presentaciones from authenticated;
grant select on public.articulo_presentaciones to authenticated;

-- Regla 5: toda tabla nueva lleva sus dos disparadores.
drop trigger if exists trg_auditar on public.articulo_presentaciones;
create trigger trg_auditar
  after insert or update or delete on public.articulo_presentaciones
  for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.articulo_presentaciones;
create trigger trg_normalizar
  before insert or update on public.articulo_presentaciones
  for each row execute function private.normalizar_texto('presentacion');

comment on table public.articulo_presentaciones is
  'De cuantas formas se puede contar un articulo. La existencia sigue siendo UNA, en la unidad de operacion: estas son maneras de contar, no maneras de almacenar. El nombre viene del catalogo compartido `presentaciones`; el factor cuelga del articulo porque un tambor son 208 litros de un aceite y 200 de otro.';

-- ===========================================================================
-- 2. Las dos columnas viejas siembran la tabla
-- ===========================================================================

insert into public.articulo_presentaciones (articulo_id, presentacion, unidades, por_defecto)
select a.id, upper(btrim(a.presentacion)), a.unidades_por_presentacion, true
  from public.articulos a
 where a.presentacion is not null
   and coalesce(a.unidades_por_presentacion, 0) > 0
   and exists (select 1 from public.presentaciones p where p.codigo = upper(btrim(a.presentacion)))
on conflict (articulo_id, presentacion) do nothing;

/*
  LA SIEMBRA NO FILTRA LO QUE YA ESTABA MAL, y conviene decirlo aqui.

  BOTAS DE SEGURIDAD tiene unidad PAR y presentacion PAR, asi que estrena una
  fila que dice «un PAR trae 20 PAR». `guardar_presentacion_de_articulo` rechaza
  crear eso desde hoy —es una de sus rejas— pero la siembra lo copia tal cual:
  arreglarlo aqui seria decidir por el almacen si la caja de veinte pares se
  llama CAJA o BULTO, y ese dato no lo tengo. Queda anotado como lo que es, uno
  de los quince articulos del catalogo por revisar.
*/

-- ===========================================================================
-- 3. El ayudante que convierte, ahora con nombre de presentacion
-- ===========================================================================

-- `create or replace` con una firma distinta ANADE una funcion, no la cambia.
-- La vieja de tres argumentos se va a mano o quedan las dos y gana la que el
-- planificador prefiera.
drop function if exists private.en_unidad_base(bigint, numeric, numeric);

create or replace function private.en_unidad_base(
  p_articulo_id bigint,
  p_presentaciones numeric default null,
  p_sueltas numeric default 0,
  p_presentacion text default null
) returns numeric language plpgsql stable security definer set search_path to ''
as $function$
declare
  v_art    record;
  v_nombre text;
  v_por    numeric;
begin
  /*
    SIETE TAMBORES Y DIEZ LITROS SON 1.466 LITROS.

        7 tambores y 10 L   ->  7 * 208 + 10  =  1.466
        3 tambores          ->  3 * 208 +  0  =    624
        50 L                ->  0        + 50 =     50

    NO SE NORMALIZA EL SUELTO A PROPOSITO. «1 tambor y 300 L» de un articulo de
    208 son 508 y no se convierte en «2 tambores y 92 L». Contar asi es raro
    pero no es falso, y reescribirle a alguien lo que conto es como se pierde la
    confianza en un inventario.
  */
  select nombre, unidad, presentacion, unidades_por_presentacion
    into v_art from public.articulos where id = p_articulo_id;

  if v_art.unidad is null then
    raise exception 'No existe el artículo %.', p_articulo_id using errcode = 'P0002';
  end if;

  /*
    UN BULTO ES ENTERO, Y AQUI ES DONDE TIENE QUE DECIRLO.

    Las tres puertas que cuentan por bultos llaman a este ayudante: la regla que
    vive aqui no se puede quedar fuera de ninguna, y la puerta que aparezca
    manana la hereda sin que nadie se acuerde.
  */
  if p_presentaciones is not null then
    if p_presentaciones < 0 then
      raise exception 'No se pueden contar bultos en negativo.' using errcode = '22023';
    end if;
    if p_presentaciones <> trunc(p_presentaciones) then
      raise exception 'Los bultos se cuentan enteros: % no es un número de bultos. Lo que sobra del último va en lo suelto.',
        private.numero_es(p_presentaciones, 2)
        using errcode = '22023',
              hint = 'Un tambor y medio se cuenta como 1 tambor y lo que quede, en la unidad del artículo.';
    end if;
  end if;

  if coalesce(p_presentaciones, 0) = 0 then
    return coalesce(p_sueltas, 0);
  end if;

  /*
    DE CUANTAS FORMAS SE PUEDE CONTAR ESTE ARTICULO.

    Christopher, el 7 de septiembre: «puede existir la posibilidad de que la
    presentacion de un producto varie a pesar de su unidad de operacion». Aceite
    en tambor y en galon; tuercas en pack de 6, de 12, par y unidad.

    La existencia sigue siendo UNA, en la unidad de operacion. Lo unico que
    crece es de cuantas formas se puede teclear la misma cantidad.

    Se pide una por nombre; si no se pide ninguna, manda la marcada por defecto.
    Y si el articulo no tiene ninguna declarada todavia, se cae a las dos
    columnas de siempre — que es lo que hace que esto no rompa nada el dia que
    se aplica.
  */
  if p_presentacion is not null then
    select ap.presentacion, ap.unidades into v_nombre, v_por
      from public.articulo_presentaciones ap
     where ap.articulo_id = p_articulo_id
       and ap.presentacion = upper(btrim(p_presentacion))
       and ap.activa;

    if v_nombre is null then
      raise exception '"%" no se cuenta en % — esa presentación no está declarada o está apagada.',
        v_art.nombre, upper(btrim(p_presentacion))
        using errcode = '22023',
              hint = 'Las presentaciones de un artículo se declaran en su ficha del catálogo.';
    end if;
  else
    select ap.presentacion, ap.unidades into v_nombre, v_por
      from public.articulo_presentaciones ap
     where ap.articulo_id = p_articulo_id and ap.activa
     order by ap.por_defecto desc, ap.id
     limit 1;

    if v_nombre is null then
      v_nombre := v_art.presentacion;
      v_por    := v_art.unidades_por_presentacion;
    end if;
  end if;

  if v_nombre is null or coalesce(v_por, 0) <= 0 then
    raise exception '"%" no dice en qué presentación viene, así que no se puede contar por bultos.',
      v_art.nombre
      using errcode = '22023',
            hint = 'La presentación y cuántas unidades trae se declaran en el catálogo del artículo.';
  end if;

  return p_presentaciones * v_por + coalesce(p_sueltas, 0);
end;
$function$;

comment on function private.en_unidad_base(bigint, numeric, numeric, text) is
  'Pasa «N presentaciones y M sueltas» a la unidad de operacion: 7 tambores y 10 L de un articulo de 208 son 1.466 L. Con `p_presentacion` se elige cual de las declaradas; sin ella manda la de por defecto, y si el articulo no tiene ninguna se cae a las dos columnas viejas. Exige que los bultos sean enteros y no negativos, y lo exige AQUI y no en cada puerta: las tres que cuentan por bultos llaman a este ayudante, y una regla repetida tres veces es una regla que se queda fuera de la cuarta.';

-- ===========================================================================
-- 4. Como se llama la que se uso, para escribirla en el asiento
-- ===========================================================================

create or replace function private.presentacion_usada(
  p_articulo_id bigint, p_presentacion text default null
) returns text language sql stable security definer set search_path to ''
as $function$
  select coalesce(
    (select ap.presentacion from public.articulo_presentaciones ap
      where ap.articulo_id = p_articulo_id and ap.activa
        and (p_presentacion is null or ap.presentacion = upper(btrim(p_presentacion)))
      order by (p_presentacion is not null) desc, ap.por_defecto desc, ap.id
      limit 1),
    (select a.presentacion from public.articulos a where a.id = p_articulo_id));
$function$;

comment on function private.presentacion_usada(bigint, text) is
  'El nombre de la presentacion con la que se conto, para escribirlo en `unidad_capturada`. Resuelve igual que `en_unidad_base`: la pedida, si no la de por defecto, si no la columna vieja. Existe para que las tres puertas no repitan esa cascada.';

-- ===========================================================================
-- 5. Declarar y apagar presentaciones
-- ===========================================================================

create or replace function public.guardar_presentacion_de_articulo(
  p_articulo_id bigint, p_presentacion text, p_unidades numeric,
  p_por_defecto boolean default false
) returns bigint language plpgsql security definer set search_path to ''
as $function$
declare
  v_id     bigint;
  v_nombre text := upper(btrim(coalesce(p_presentacion, '')));
  v_art    record;
begin
  /*
    DECLARAR DE QUE FORMAS SE PUEDE CONTAR UN ARTICULO.

    El nombre sale del catalogo compartido —TAMBOR, CAJA, SACO— para que nadie
    escriba «Tambor», «TAMBORES» y «tambor» y acaben siendo tres. El factor
    cuelga del articulo: un tambor es 208 litros para un aceite y 200 para otro,
    y una tabla global de equivalencias obligaria a inventar un tambor estandar
    y a mentir en todos los que no lo son.
  */
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  select nombre, unidad into v_art from public.articulos where id = p_articulo_id;
  if v_art.nombre is null then
    raise exception 'No existe ese artículo.' using errcode = 'P0002';
  end if;

  if v_nombre = '' then
    raise exception 'Dime en qué presentación viene.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.presentaciones where codigo = v_nombre) then
    raise exception '«%» no está en la lista de presentaciones.', v_nombre
      using errcode = '23503',
            hint = 'Las que hay: ' || (select string_agg(codigo, ', ' order by orden)
                                         from public.presentaciones);
  end if;

  if coalesce(p_unidades, 0) <= 0 then
    raise exception 'Dime cuántos % trae un %.', v_art.unidad, v_nombre
      using errcode = '22023';
  end if;

  /*
    UN BULTO QUE TRAE UNA UNIDAD NO ES UN BULTO.

    «Un PAR trae 1 PAR» no aporta nada y confunde la pantalla, que ofreceria dos
    formas de teclear lo mismo. Y es un error real del catalogo de hoy —botas
    con unidad PAR y presentacion PAR— que conviene no dejar repetir.
  */
  if v_nombre = upper(btrim(v_art.unidad)) then
    raise exception 'La presentación no puede llamarse igual que la unidad: «%» ya es la unidad de %.',
      v_nombre, v_art.nombre
      using errcode = '22023',
            hint = 'Si el artículo se cuenta en pares y viene en cajas de veinte pares, la presentación es CAJA.';
  end if;

  -- Solo una por defecto. Se apaga la anterior ANTES de encender esta, porque
  -- el indice unico parcial no admite dos ni por un instante.
  if p_por_defecto then
    update public.articulo_presentaciones
       set por_defecto = false
     where articulo_id = p_articulo_id and por_defecto;
  end if;

  insert into public.articulo_presentaciones
    (articulo_id, presentacion, unidades, por_defecto, creada_por)
  values (p_articulo_id, v_nombre, p_unidades, coalesce(p_por_defecto, false), (select auth.uid()))
  on conflict (articulo_id, presentacion) do update
     set unidades = excluded.unidades,
         por_defecto = excluded.por_defecto,
         activa = true
  returning id into v_id;

  /*
    Y LAS DOS COLUMNAS VIEJAS SIGUEN LA DE POR DEFECTO.

    `articulos.presentacion` y `unidades_por_presentacion` son la version de una
    sola presentacion, y todavia las leen la pantalla y las funciones que no se
    han migrado. Mientras existan tienen que decir lo mismo que la tabla, o
    volvemos a tener dos fuentes que discrepan — que es el problema del que
    venimos toda la semana.
  */
  update public.articulos a
     set presentacion = d.presentacion,
         unidades_por_presentacion = d.unidades
    from (select ap.presentacion, ap.unidades
            from public.articulo_presentaciones ap
           where ap.articulo_id = p_articulo_id and ap.activa
           order by ap.por_defecto desc, ap.id limit 1) d
   where a.id = p_articulo_id;

  return v_id;
end;
$function$;

create or replace function public.cambiar_estado_presentacion(
  p_id bigint, p_activa boolean
) returns void language plpgsql security definer set search_path to ''
as $function$
declare v_art bigint; v_defecto boolean;
begin
  /*
    SE APAGAN, NO SE BORRAN.

    Un proveedor deja de vender en galones y la presentacion se apaga; los
    movimientos viejos siguen legibles porque el asiento guarda el NOMBRE que se
    uso, no un puntero a esta fila.
  */
  perform private.exigir_accion('INVENTARIO.EDITAR_CATALOGO');

  select articulo_id, por_defecto into v_art, v_defecto
    from public.articulo_presentaciones where id = p_id;
  if v_art is null then
    raise exception 'No existe esa presentación.' using errcode = 'P0002';
  end if;

  -- Apagar la de por defecto dejaria al articulo sin ninguna propuesta.
  if not p_activa and v_defecto
     and exists (select 1 from public.articulo_presentaciones
                  where articulo_id = v_art and activa and id <> p_id) then
    raise exception 'Esa es la presentación por defecto. Marca otra antes de apagarla.'
      using errcode = '22023';
  end if;

  update public.articulo_presentaciones
     set activa = p_activa, por_defecto = case when p_activa then por_defecto else false end
   where id = p_id;

  update public.articulos a
     set presentacion = d.presentacion,
         unidades_por_presentacion = d.unidades
    from (select ap.presentacion, ap.unidades
            from public.articulo_presentaciones ap
           where ap.articulo_id = v_art and ap.activa
           order by ap.por_defecto desc, ap.id limit 1) d
   where a.id = v_art;

  -- Sin ninguna activa, el articulo vuelve a contarse solo en su unidad.
  if not exists (select 1 from public.articulo_presentaciones
                  where articulo_id = v_art and activa) then
    update public.articulos
       set presentacion = null, unidades_por_presentacion = null
     where id = v_art;
  end if;
end;
$function$;

grant execute on function public.guardar_presentacion_de_articulo(bigint, text, numeric, boolean) to authenticated;
grant execute on function public.cambiar_estado_presentacion(bigint, boolean) to authenticated;

-- ===========================================================================
-- 6. Las dos columnas viejas siguen sembrando la tabla, para siempre
-- ===========================================================================

create or replace function private.presentacion_desde_el_articulo()
returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  /*
    LAS DOS COLUMNAS VIEJAS SIEMBRAN LA TABLA, Y NO AL REVES.

    `crear_articulo`, `editar_articulo` y `cargar_articulos_por_lote` siguen
    escribiendo `presentacion` y `unidades_por_presentacion`. Migrarlas las tres
    seria tocar tres puertas para la misma regla — y llevo cuatro incidentes esta
    semana que empiezan exactamente asi.

    Asi que la regla vive aqui: cuando esas dos columnas quedan llenas, el
    articulo estrena su fila en `articulo_presentaciones` y queda marcada por
    defecto si no habia ninguna. Quien solo conoce las columnas sigue
    funcionando; quien declara varias presentaciones usa la tabla; y las dos
    dicen lo mismo sin que nadie tenga que acordarse.

    NO BORRA NADA. Vaciar la presentacion del articulo no apaga las declaradas:
    un articulo puede tener tambor y bidon, y las columnas solo reflejan la de
    por defecto. Apagar es cosa de `cambiar_estado_presentacion`, que si sabe lo
    que hace.
  */
  if new.presentacion is null or coalesce(new.unidades_por_presentacion, 0) <= 0 then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.presentacion is not distinct from old.presentacion
     and new.unidades_por_presentacion is not distinct from old.unidades_por_presentacion then
    return new;
  end if;

  insert into public.articulo_presentaciones
    (articulo_id, presentacion, unidades, por_defecto, creada_por)
  values (
    new.id, upper(btrim(new.presentacion)), new.unidades_por_presentacion,
    not exists (select 1 from public.articulo_presentaciones
                 where articulo_id = new.id and por_defecto),
    new.creado_por)
  on conflict (articulo_id, presentacion) do update
     set unidades = excluded.unidades, activa = true;

  return new;
end;
$function$;

drop trigger if exists trg_presentacion_desde_el_articulo on public.articulos;
create trigger trg_presentacion_desde_el_articulo
  after insert or update of presentacion, unidades_por_presentacion on public.articulos
  for each row execute function private.presentacion_desde_el_articulo();

-- ===========================================================================
-- 7. Las tres puertas dicen en que presentacion se conto
-- ===========================================================================

/*
  SE PARCHEAN, NO SE REESCRIBEN.

  Las tres pasan de las siete mil letras y llevan dentro rejas ya probadas —el
  costo raro, la existencia, el bulto entero—. Copiarlas a mano para cambiar
  cuatro lineas es exactamente como se introduce una diferencia entre el archivo
  y la base, que es el problema del que viene la regla 7.

  Las sustituciones van por expresion regular y no por texto exacto, a proposito:
  asi valen tanto sobre la version anterior como sobre la ya parcheada, y este
  archivo se puede volver a correr sin romper nada.

  CORREGIDO EL 8/09/2026, TRAS LA REVISION ADVERSARIAL, y el archivo se edita a
  sabiendas de que ya corrio: lo que cambia NO altera la base —el cuerpo vivo es
  correcto— sino lo que pasa si esto se vuelve a correr. Los patrones decian
  `[^)]*\)`, que para en el PRIMER parentesis; sobre la version ya parcheada
  —donde el cuarto argumento es `nullif(btrim(coalesce(...)))`— el corte caia
  dentro del `coalesce` y la sustitucion dejaba dos parentesis colgando. Un
  archivo que se corrompe al replicarse es peor que uno que no existe: el
  primero se aplica y revienta la funcion.

  Ahora anclan al fin de la sentencia con `[^;]*\)`, y cada bloque comprueba
  antes si ya esta puesto.
*/

do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='registrar_entradas';
  v_antes := v_def;

  -- La variable, si no esta ya.
  if position('v_nombre_pres' in v_def) = 0 then
    v_def := replace(v_def,
      '  v_pres numeric; v_sueltas numeric; v_por_pres numeric; v_unidad_pres text;',
      '  v_pres numeric; v_sueltas numeric; v_por_pres numeric; v_unidad_pres text;'
      || chr(10) || '  v_nombre_pres text;');

    v_def := replace(v_def,
      '    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>''presentaciones'', '''')), '''')::numeric, 0);',
      '    v_pres     := coalesce(nullif(btrim(coalesce(v_r->>''presentaciones'', '''')), '''')::numeric, 0);'
      || chr(10) || '    -- En que presentacion se conto este renglon. Nula: la de por defecto.'
      || chr(10) || '    v_nombre_pres := nullif(btrim(coalesce(v_r->>''presentacion'', '''')), '''');');
  end if;

  -- Si ya lleva el cuarto argumento, no se toca: volver a sustituir sobre el
  -- resultado es como se corrompe una funcion al replicar el archivo.
  if position('v_sueltas, v_nombre_pres)' in v_def) = 0 then
    v_def := regexp_replace(v_def,
      'private\.en_unidad_base\(v_articulo, v_pres, v_sueltas[^;]*\)',
      'private.en_unidad_base(v_articulo, v_pres, v_sueltas, v_nombre_pres)', 'g');
  end if;

  v_def := regexp_replace(v_def,
    'p_unidad_capturada => case when v_pres > 0 then [^\n]*end,',
    'p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, v_nombre_pres) end,');

  if v_def = v_antes then
    raise notice 'registrar_entradas ya estaba; no se toca.';
  else
    execute v_def;
    raise notice 'registrar_entradas dice en que presentacion se conto.';
  end if;
end $patch$;

do $patch$
declare v_def text; v_antes text; v_expr constant text :=
  'nullif(btrim(coalesce(v_r->>''presentacion'', '''')), '''')';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='registrar_salidas';
  v_antes := v_def;

  /*
    LA CONVERSION ENTRA EN LOS TRES SITIOS, y lo dice la propia funcion: aqui,
    en la suma de los renglones anteriores, y en la pasada de escritura.
    Convertir solo en uno deja la reja de existencia comparando tambores contra
    litros, que es peor que no convertir. El nombre tiene que entrar en los
    tres, y el tercero usa el alias `r` en vez de `v_r`.
  */
  if position('v_sueltas, ' || v_expr in v_def) = 0 then
    v_def := regexp_replace(v_def,
      'private\.en_unidad_base\(v_articulo, v_pres, v_sueltas[^;]*\)',
      'private.en_unidad_base(v_articulo, v_pres, v_sueltas, ' || v_expr || ')', 'g');
  end if;

  v_def := replace(v_def,
'                   coalesce(nullif(btrim(coalesce(r->>''cantidad'', '''')), '''')::numeric, 0)))',
'                   coalesce(nullif(btrim(coalesce(r->>''cantidad'', '''')), '''')::numeric, 0),
                   nullif(btrim(coalesce(r->>''presentacion'', '''')), '''')))');

  v_def := regexp_replace(v_def,
    'p_unidad_capturada => case when v_pres > 0 then [^\n]*end,',
    'p_unidad_capturada => case when v_pres > 0 then private.presentacion_usada(v_articulo, ' || v_expr || ') end,');

  if v_def = v_antes then
    raise notice 'registrar_salidas ya estaba; no se toca.';
  else
    execute v_def;
    raise notice 'registrar_salidas dice en que presentacion se conto, en los tres sitios.';
  end if;
end $patch$;

/*
  EL AJUSTE LLEVA LA PRESENTACION EN LA FIRMA, no en un jsonb, asi que hay que
  anadir el argumento — y `create or replace` con una firma distinta ANADE una
  funcion en vez de cambiarla. La vieja se borra a mano; van seis veces esta
  semana que esto muerde.
*/
do $patch$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='registrar_ajuste';
  v_antes := v_def;

  v_def := replace(v_def,
    'p_presentaciones numeric DEFAULT NULL::numeric)',
    'p_presentaciones numeric DEFAULT NULL::numeric, p_presentacion text DEFAULT NULL::text)');

  v_def := regexp_replace(v_def,
    'private\.en_unidad_base\(p_articulo_id, p_presentaciones, coalesce\(p_contado, 0\)[^)]*\)',
    'private.en_unidad_base(p_articulo_id, p_presentaciones, coalesce(p_contado, 0), p_presentacion)');

  v_def := regexp_replace(v_def,
    'private\.presentacion_usada\(p_articulo_id[^)]*\)',
    'private.presentacion_usada(p_articulo_id, p_presentacion)', 'g');

  if v_def = v_antes then
    raise notice 'registrar_ajuste ya estaba; no se toca.';
  else
    drop function if exists public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric);
    execute v_def;
    grant execute on function public.registrar_ajuste(bigint, bigint, numeric, text, date, numeric, text) to authenticated;
    raise notice 'registrar_ajuste acepta la presentacion.';
  end if;
end $patch$;

/*
  COMPROBADO el 8 de septiembre contra la base viva, en transaccion deshecha, y
  ademas por md5 de `pg_proc.prosrc` sin comentarios: los cuerpos que deja este
  archivo son los que corren.

      select md5(regexp_replace(regexp_replace(prosrc, '/\*.*?\*''/', '', 'gs'),
                                '\s+', ' ', 'g'))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'private' and p.proname = 'en_unidad_base';

  LO QUE QUEDA ABIERTO, y va nombrado para que no se pierda:

    - `transferir_existencia` y `despachar_combustible` todavia no cuentan por
      bultos. No es un defecto de esto: es que nunca lo hicieron.
    - BOTAS DE SEGURIDAD estrena «un PAR trae 20 PAR» por la siembra. Ver la
      nota de la seccion 2.
*/
