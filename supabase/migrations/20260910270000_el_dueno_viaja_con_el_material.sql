/*
  EL DUEÑO VIAJA CON EL MATERIAL.

  Christopher: «¿cómo hago un traslado solo de items de la gobernación a un
  almacén o taller? ¿los talleres también pueden ser de otros dueños?».

  Las dos preguntas tocan la misma costura. Hasta ahora el dueño lo ponía el
  SITIO: lo que estaba en un almacén de la gobernación era suyo, y punto. Eso
  funciona mientras cada dueño tenga sus propios sitios, y se rompe en el primer
  caso real: la bomba de la gobernación se manda a NUESTRO taller. Con el dueño
  en el sitio, esa bomba se volvía nuestra dos semanas y luego dejaba de serlo —
  y un cierre de mes en medio mentiría por los dos lados.

  Preguntado y decidido con él: un mismo sitio físico tiene que poder guardar
  material de dos dueños a la vez. Eso obliga a que el dueño viaje con cada
  movimiento, que es lo que hace esta migración.

  Se descartó la alternativa, que era darle a la gobernación su propia fila de
  taller —el patrón que esta casa ya usa con el tanque de combustible: mismo
  tanque, dos almacenes—. No toca nada del núcleo y funciona, pero parte en dos
  la cola del taller y su capacidad, y son de un solo galpón.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUÉ AHORA Y NO CUANDO HAGA FALTA
  ═══════════════════════════════════════════════════════════════════════════

  Hay 49 movimientos y los 49 están en almacenes de La Cantera. Comprobado antes
  de tocar nada. O sea que el valor por defecto es la verdad para todas las filas
  que existen, y no hay ni una que migrar a mano ni una que se pueda estropear.

  Dentro de seis meses habría cientos, y entonces cada fila sería una decisión.

  ═══════════════════════════════════════════════════════════════════════════
  LA COLUMNA SE AÑADE CON DEFAULT PORQUE EL LIBRO ES INMUTABLE
  ═══════════════════════════════════════════════════════════════════════════

  `trg_movimientos_inmutables` rechaza UPDATE, así que rellenar la columna
  después con un update no es posible — ni deseable. `add column ... not null
  default` no dispara triggers de fila y deja las 49 correctas de una vez.

  ═══════════════════════════════════════════════════════════════════════════
  DE DÓNDE SALE EL DUEÑO CUANDO NADIE LO DICE
  ═══════════════════════════════════════════════════════════════════════════

  Ésta es la regla que hace que las catorce puertas sigan funcionando sin
  tocarlas, y merece leerse dos veces:

    · ENTRA algo → es del dueño del almacén. Es lo que ya se suponía y sigue
      siendo cierto; quien meta material ajeno en un sitio nuestro lo dirá.

    · SALE algo y en ese sitio ese artículo es de UN SOLO dueño → sale de ése.
      No hay ambigüedad que resolver, así que no se pregunta.

    · SALE algo y ahí hay material de VARIOS dueños → se para y se pide que se
      diga. Es el único caso en que el sistema no puede acertar por su cuenta, y
      adivinar sería inventar de quién era lo que se llevaron.

  Hoy ningún sitio tiene material de dos dueños, así que la tercera rama no se
  dispara y el comportamiento es idéntico al de antes. Se enciende sola el día
  que llegue el primer caso mixto, que es justo cuando hace falta.

  Y ESO PROTEGE A LAS CATORCE PUERTAS DE GOLPE: cualquiera que intente sacar de
  un sitio mezclado sin decir de quién falla en voz alta en vez de repartirlo mal
  en silencio. Fallar ruidosamente es la única forma segura de no saber algo.
*/

alter table public.inventario_movimientos
  add column if not exists propietario text not null default 'LACANTERA';

do $fk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'inventario_movimientos_propietario_fkey'
                    and conrelid = 'public.inventario_movimientos'::regclass) then
    alter table public.inventario_movimientos
      add constraint inventario_movimientos_propietario_fkey
      foreign key (propietario) references public.propietarios(codigo);
  end if;
end $fk$;

comment on column public.inventario_movimientos.propietario is
  'De quien es el material que se movio. El dueño VIAJA con el movimiento y ya no lo pone el sitio: eso se rompia en el primer caso real —la bomba de la gobernacion mandada a NUESTRO taller se volvia nuestra dos semanas—. Decidido con Christopher el 10/09/2026. Al entrar es del dueño del almacen salvo que se diga; al salir, del unico que haya, y si hay varios se para y se pregunta, porque adivinar seria inventar de quien era lo que se llevaron.';

create index if not exists inventario_movimientos_dueno
  on public.inventario_movimientos (almacen_id, articulo_id, propietario);

-- ---------------------------------------------------------------------------
-- El único escritor del libro resuelve de quién es
-- ---------------------------------------------------------------------------
do $escritor$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'registrar_movimiento';

  if position('v_dueno' in v_def) > 0 then
    raise notice 'registrar_movimiento ya resolvia el dueño.';
    return;
  end if;

  -- 1. El parámetro nuevo, al final para no mover ninguno de los veintiuno.
  v_def := replace(v_def,
    'p_moneda_capturada text DEFAULT NULL::text)',
    'p_moneda_capturada text DEFAULT NULL::text, p_propietario text DEFAULT NULL::text)');

  -- 2. Las variables.
  v_def := replace(v_def,
    'v_unidad text; v_id bigint; v_capacidad numeric; v_nombre text; v_hay numeric;',
    'v_unidad text; v_id bigint; v_capacidad numeric; v_nombre text; v_hay numeric;
  v_dueno text; v_duenos text[];');

  -- 3. La resolución, justo después de comprobar que el artículo existe.
  v_def := replace(v_def,
'  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre from public.almacenes where id = p_almacen;',
'  /*
    DE QUIEN ES LO QUE SE MUEVE. Ver el comentario de la columna: al entrar es
    del dueño del almacen salvo que se diga; al salir, del unico que haya; y si
    hay varios se para, porque adivinar seria inventar de quien era.
  */
  v_dueno := nullif(btrim(coalesce(p_propietario, '''')), '''');

  if v_dueno is null then
    if p_signo = 1 then
      select a.propietario into v_dueno from public.almacenes a where a.id = p_almacen;
      v_dueno := coalesce(v_dueno, ''LACANTERA'');
    else
      select array_agg(distinct t.propietario) into v_duenos
        from (select m.propietario, sum(m.cantidad * m.signo) as saldo
                from public.inventario_movimientos m
               where m.almacen_id = p_almacen and m.articulo_id = p_articulo
               group by m.propietario
              having sum(m.cantidad * m.signo) > 0) t;

      if coalesce(array_length(v_duenos, 1), 0) = 1 then
        v_dueno := v_duenos[1];
      elsif coalesce(array_length(v_duenos, 1), 0) > 1 then
        raise exception ''Aqui hay material de varios dueños (%): hay que decir de cual sale.'',
          array_to_string(v_duenos, '', '')
          using errcode = ''22023'',
                hint = ''Un mismo sitio puede guardar cosas de la casa y de otro; sacarlas sin decir de quien eran seria inventarlo.'';
      else
        -- No hay saldo de nadie. El aviso de «no alcanza» lo da quien llama, con
        -- mejor contexto; aqui solo hace falta un dueño valido para el asiento.
        select a.propietario into v_dueno from public.almacenes a where a.id = p_almacen;
        v_dueno := coalesce(v_dueno, ''LACANTERA'');
      end if;
    end if;
  end if;

  /*
    Y QUE ALCANCE LO DE ESE DUEÑO, no lo que hay en total.

    Siempre en las salidas, lo diga quien lo diga. La primera version solo
    comprobaba cuando el dueño se habia resuelto solo —`v_duenos` solo se rellena
    en esa rama— asi que protegia el caso en que no hace falta y dejaba suelto el
    otro: sacar 500 de la gobernacion de un sitio donde tenia 7 pasaba sin
    chistar. Lo cazo la prueba en frio.

    No cambia nada de lo que hay hoy: con un solo dueño en cada sitio su saldo ES
    el total, y quien llama ya lo habia comprobado con mejor mensaje. Lo que
    añade es que ese «ya lo comprobo» deje de ser una suposicion.
  */
  if p_signo = -1 then
    select coalesce(sum(m.cantidad * m.signo), 0) into v_hay
      from public.inventario_movimientos m
     where m.almacen_id = p_almacen and m.articulo_id = p_articulo
       and m.propietario = v_dueno;
    if v_hay < p_cantidad then
      select nombre into v_nombre from public.articulos where id = p_articulo;
      raise exception ''De «%» ahi solo hay % de ese dueño: no alcanza para %.'',
        v_nombre, private.cantidad_es(v_hay), private.cantidad_es(p_cantidad)
        using errcode = ''55000'';
    end if;
  end if;

  if p_signo = 1 then
    select capacidad, nombre into v_capacidad, v_nombre from public.almacenes where id = p_almacen;');

  -- 4. Y se escribe.
  v_def := replace(v_def,
    'entrega_clase, registrado_por, nota_salida, aviso_costo,',
    'entrega_clase, registrado_por, nota_salida, aviso_costo, propietario,');
  v_def := replace(v_def,
    'p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo,',
    'p_clase, (select auth.uid()), p_nota_salida, p_aviso_costo, v_dueno,');

  if position('v_dueno text; v_duenos text[];' in v_def) = 0
     or position('p_propietario text DEFAULT' in v_def) = 0
     or position('aviso_costo, propietario,' in v_def) = 0
     or position('p_aviso_costo, v_dueno,' in v_def) = 0 then
    raise exception 'Algun anclaje no encajo: no se toca nada.';
  end if;

  drop function if exists private.registrar_movimiento(
    text, integer, bigint, bigint, numeric, numeric, text, bigint, bigint, bigint,
    date, bigint, text, text, numeric, numeric, text, numeric, numeric, text, text);
  execute v_def;
  raise notice 'el dueño viaja con el material.';
end $escritor$;

-- ---------------------------------------------------------------------------
-- Existencia y costo, por dueño
-- ---------------------------------------------------------------------------
/*
  Un mismo sitio puede tener tres bombas nuestras a 10 USD y ocho de la
  gobernación a 40. «Cuánto hay» y «a cuánto sale» dejan de tener UNA respuesta.

  SE AÑADEN, NO SE CAMBIAN. Las de dos parámetros siguen contestando lo FÍSICO —
  cuánto hay ahí en total, sea de quien sea— que es lo correcto para las vistas y
  para la capacidad de un tanque. Las de tres contestan por dueño.

  SIN VALOR POR DEFECTO en el tercer parámetro, a propósito: con `default null`
  una llamada de dos argumentos se volvería ambigua y Postgres la rechazaría con
  un 42725 en producción.
*/
create or replace function private.existencia(
  p_almacen bigint, p_articulo bigint, p_propietario text
) returns numeric
language sql stable security definer set search_path to ''
as $function$
  select coalesce(sum(cantidad * signo), 0)
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo
    and propietario = p_propietario;
$function$;

comment on function private.existencia(bigint, bigint, text) is
  'Cuanto hay de ese articulo en ese sitio Y DE ESE DUEÑO. La de dos parametros contesta lo fisico —cuanto hay en total, sea de quien sea— y esta contesta de quien es. Son dos preguntas distintas desde que el dueño viaja con el material.';

create or replace function private.costo_promedio(
  p_almacen bigint, p_articulo bigint, p_propietario text
) returns numeric
language sql stable security definer set search_path to ''
as $function$
  select case when sum(cantidad * signo) > 0
              then round(sum(valor_usd * signo) / sum(cantidad * signo), 6)
              else 0 end
  from public.inventario_movimientos
  where almacen_id = p_almacen and articulo_id = p_articulo
    and propietario = p_propietario;
$function$;

comment on function private.costo_promedio(bigint, bigint, text) is
  'El promedio DE ESE DUEÑO en ese sitio. Hace falta porque el valor declarado de lo ajeno no puede mezclarse con lo que costo lo nuestro: tres bombas nuestras a 10 y ocho suyas a 40 no promedian a nada que sirva para valorar ninguna de las dos.';

create or replace function private.existencia_para_escribir(
  p_almacen_id bigint, p_articulo_id bigint, p_propietario text
) returns numeric
language plpgsql security definer set search_path to ''
as $function$
begin
  /*
    EL MISMO CERROJO QUE LA DE DOS, sin el dueño dentro. Dos transacciones sobre
    el mismo par almacen/articulo tienen que ponerse en fila aunque muevan
    material de dueños distintos: las dos leen y escriben las mismas filas.
    Partirlo por dueño seria dejar pasar a la vez a dos que se van a pisar.

    Y de todos modos no cabria: `pg_advisory_xact_lock` solo existe como
    `(bigint)` y como `(integer, integer)`.
  */
  perform pg_catalog.pg_advisory_xact_lock(p_almacen_id::int, p_articulo_id::int);
  return private.existencia(p_almacen_id, p_articulo_id, p_propietario);
end;
$function$;

comment on function private.existencia_para_escribir(bigint, bigint, text) is
  'Toma el cerrojo y devuelve el saldo DE ESE DUEÑO. El cerrojo no lleva el dueño a proposito: partirlo por dueño dejaria pasar a la vez dos transacciones que escriben las mismas filas.';

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 entrada normal .....................: LACANTERA (el dueño del almacén)
    2 entrada ajena en sitio nuestro .....: GOBERNACION (porque se dijo)
    3 salida sin decir, con mezcla .......: «Aqui hay material de varios dueños
                                            (GOBERNACION, LACANTERA): hay que
                                            decir de cual sale.»
    4 diciendo de quién ..................: sale a nombre de GOBERNACION
    5 más de lo que ese dueño tiene ......: «ahi solo hay 9 de ese dueño: no
                                            alcanza para 500»
    6 cuando deja de haber mezcla ........: vuelve a resolverse solo
*/
