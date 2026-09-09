/*
  UN CÓDIGO RETIRADO NO VUELVE A ESTAR LIBRE.

  Christopher, en cuanto vio la renumeración de la laptop: «deberá bloquear el
  que tenía (no puede estar disponible para evitar confusión o malos entendidos)
  y añadirse a serie que ya existe de la categoría por la que fue cambiada».

  Lo segundo ya pasaba: EQU-0001 salió del correlativo de EQU, no de un número
  inventado. Lo primero era un agujero, y lo vio antes de que se usara: al
  renumerar, INS-0006 quedaba libre. El acuñador nunca lo repetiría —la serie de
  INS solo avanza— pero `crear_articulo` acepta un código escrito a mano, y nada
  impedía teclearlo. A partir de ahí, cualquier papel viejo que dijera INS-0006
  apuntaría a otra cosa. Es el mismo daño que la renumeración existe para evitar,
  entrando por la otra puerta.

  Esta migración recoge el estado final de un ciclo que se hizo en cinco trozos,
  tres de ellos arreglando lo que enseñaron las pruebas del anterior. Van
  nombrados porque las lecciones valen más que el código:

  1. **El prefijo vivía dentro del acuñador.** `codigo_de_articulo` consume la
     serie en cada llamada, así que preguntarle «¿qué prefijo le toca?» gastaba
     un correlativo. La guarda de `renumerar_articulo` comparaba el código entero
     contra uno recién acuñado —siempre distintos— y renumerar dos veces pasaba,
     gastando un número en cada intento. El prefijo sale a
     `private.prefijo_de_categoria` y las dos funciones le preguntan a ella.

  2. **El aviso se disfrazaba de duplicado.** Levanté el rechazo del código
     retirado con `errcode = '23505'`, que es unique_violation, y
     `crear_articulo` tiene un manejador de unique_violation que reescribe
     cualquier cosa con ese código en su propio mensaje. La frase entraba por la
     puerta y salía diciendo «Ya existe un artículo con el código INS-0006», que
     además es falso. No era un duplicado: nada violó una restricción única. El
     código de error no es decoración, es a quién le habla el mensaje.

  3. **La función se contaba a sí misma.** `renumerar_articulo` pasea las claves
     foráneas que apuntan a `articulos` y cuenta cualquier fila como rastro. En
     cuanto existió `codigos_retirados` —que también apunta ahí— renumerar por
     segunda vez rechazaba con «ya se le nombró en codigos retirados (1)», que es
     verdad y no viene al caso. Es el precio del paseo automático, y se paga
     gustosamente: la tabla de mañana entra sola, y a cambio hay que decirle
     cuáles no son hechos ocurridos.
*/

-- ---------------------------------------------------------------------------
-- 1. El prefijo, en un solo sitio y sin consumir la serie
-- ---------------------------------------------------------------------------
create or replace function private.prefijo_de_categoria(p_categoria text)
returns text language sql immutable set search_path to ''
as $function$
  select case upper(coalesce(p_categoria, ''))
           when 'COMBUSTIBLE' then 'CMB'
           when 'EPP'         then 'EPP'
           when 'EQUIPO'      then 'EQU'
           when 'HERRAMIENTA' then 'HER'
           when 'INSUMO'      then 'INS'
           when 'LUBRICANTE'  then 'LUB'
           when 'PRODUCTO'    then 'PRD'
           when 'REPUESTO'    then 'REP'
           when 'SERVICIO'    then 'SRV'
           -- La red para lo imprevisto: las tres primeras letras que sirvan.
           else left(regexp_replace(upper(coalesce(p_categoria, 'ART')), '[^A-Z]', '', 'g') || 'ART', 3)
         end;
$function$;

comment on function private.prefijo_de_categoria(text) is
  'Las tres letras con las que empieza el codigo de un articulo de esa categoria. Vive aparte porque hacen falta dos cosas distintas con ella: acunar el siguiente codigo —`codigo_de_articulo`, que consume la serie— y PREGUNTAR si un codigo ya corresponde a su categoria, que no debe gastar nada.';

grant execute on function private.prefijo_de_categoria(text) to authenticated;

/*
  El acuñador le pregunta a ella, para que no haya dos listas que un día dejen de
  decir lo mismo. Se parchea sobre el cuerpo vivo en vez de reescribirlo entero
  porque el resto de la función —el bucle del correlativo, el tope de mil vueltas
  contra el bucle infinito— no cambia y copiarlo aquí sería invitar a que las dos
  copias diverjan.
*/
do $acunador$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'codigo_de_articulo';
  v_antes := v_def;

  if position('prefijo_de_categoria' in v_def) = 0 then
    v_def := regexp_replace(v_def,
      'v_prefijo := case upper\(coalesce\(p_categoria, ''''\)\).*?end;',
      'v_prefijo := private.prefijo_de_categoria(p_categoria);',
      'ns');
  end if;

  if v_def = v_antes then
    raise notice 'codigo_de_articulo ya usaba prefijo_de_categoria.';
  else
    execute v_def;
    raise notice 'codigo_de_articulo pregunta el prefijo en un solo sitio.';
  end if;
end $acunador$;

-- ---------------------------------------------------------------------------
-- 2. Los códigos retirados
-- ---------------------------------------------------------------------------
create table if not exists public.codigos_retirados (
  codigo          text primary key,
  articulo_id     bigint not null references public.articulos(id),
  codigo_nuevo    text not null,
  retirado_en     timestamptz not null default now(),
  retirado_por    uuid references auth.users(id)
);

comment on table public.codigos_retirados is
  'Codigos de articulo que se usaron y ya no. No se pueden volver a asignar: un papel viejo que diga INS-0006 tiene que seguir refiriendose a lo mismo, y si el codigo se reutiliza no hay forma de saber a cual de los dos apunta. Se guarda a que articulo pertenecia y que codigo lo sustituyo, para que encontrarse uno retirado no obligue a investigar: «era la laptop, ahora se llama EQU-0001».';

alter table public.codigos_retirados enable row level security;

drop policy if exists codigos_retirados_lectura on public.codigos_retirados;
create policy codigos_retirados_lectura on public.codigos_retirados
  for select to authenticated
  using (private.tiene_permiso('INVENTARIO', 'LECTURA'));

revoke insert, update, delete on public.codigos_retirados from authenticated;
grant select on public.codigos_retirados to authenticated;

drop trigger if exists trg_auditar on public.codigos_retirados;
create trigger trg_auditar
  after insert or update or delete on public.codigos_retirados
  for each row execute function private.auditar('codigo');

-- ---------------------------------------------------------------------------
-- 3. El renumerador, en su forma final
-- ---------------------------------------------------------------------------
create or replace function public.renumerar_articulo(p_id bigint)
returns text language plpgsql security definer set search_path to ''
as $function$
declare
  v_art     record;
  v_fk      record;
  v_cuantas bigint;
  v_donde   text[] := '{}';
  v_nuevo   text;
begin
  perform private.exigir_rol('COMPRAS', 'ALMACEN');

  select id, codigo, nombre, categoria into v_art
    from public.articulos where id = p_id;
  if v_art.id is null then
    raise exception 'No existe el artículo %.', p_id using errcode = 'P0002';
  end if;

  /*
    ¿DEJÓ RASTRO EN ALGÚN SITIO?

    Se pasean las claves foráneas en vez de listar las tablas: hoy son veinte y
    la de mañana entraría sola. Las cuatro que se saltan son configuración del
    propio artículo —sus formas de contar, su precio, la dotación de un cargo, la
    máquina que lo quema— y no un hecho ocurrido: bloquear por ellas sería
    impedir corregir un artículo por haberlo terminado de configurar.
  */
  for v_fk in
    select t.relname as tabla, att.attname as columna
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_class cl on cl.oid = c.confrelid
      join pg_attribute att on att.attrelid = c.conrelid and att.attnum = c.conkey[1]
     where c.contype = 'f'
       and n.nspname = 'public'
       and cl.relname = 'articulos'
       -- Configuracion del propio articulo o historia de su nombre, no hechos.
       and t.relname not in ('articulo_presentaciones', 'precios_venta',
                             'dotacion_por_cargo', 'maquinaria',
                             'codigos_retirados')
     order by t.relname
  loop
    execute format('select count(*) from public.%I where %I = $1', v_fk.tabla, v_fk.columna)
      into v_cuantas using p_id;

    if v_cuantas > 0 then
      v_donde := v_donde || format('%s (%s)',
        replace(v_fk.tabla, '_', ' '), private.numero_es(v_cuantas, 0));
    end if;
  end loop;

  if cardinality(v_donde) > 0 then
    raise exception 'A "%" ya se le nombró con % en %. El código no se puede cambiar: está escrito en papeles que no se pueden reimprimir.',
      v_art.nombre, v_art.codigo, array_to_string(v_donde, ', ')
      using errcode = '23503',
            hint = 'La categoría sí queda corregida; lo que se queda es el código, que a partir de ahora es solo un nombre propio.';
  end if;

  /*
    SE COMPARA EL PREFIJO Y NO EL CODIGO, y lo enseño la prueba: acunar uno
    nuevo para compararlo consume la serie, asi que el recien acunado nunca es
    igual al que hay y renumerar dos veces pasaba, gastando un correlativo en
    cada intento. Se pregunta antes de acunar.
  */
  if split_part(v_art.codigo, '-', 1) = private.prefijo_de_categoria(v_art.categoria) then
    raise exception 'El código ya corresponde a la categoría.' using errcode = '22023';
  end if;

  v_nuevo := private.codigo_de_articulo(v_art.categoria);

  /*
    EL VIEJO SE RETIRA, no queda libre. Christopher: «no puede estar disponible
    para evitar confusion o malos entendidos». La serie nunca lo repetiria, pero
    `crear_articulo` acepta un codigo escrito a mano y nada impedia teclearlo.
  */
  insert into public.codigos_retirados (codigo, articulo_id, codigo_nuevo, retirado_por)
  values (v_art.codigo, p_id, v_nuevo, auth.uid())
  on conflict (codigo) do update
    set codigo_nuevo = excluded.codigo_nuevo,
        retirado_en  = now(),
        retirado_por = excluded.retirado_por;

  update public.articulos set codigo = v_nuevo where id = p_id;

  return v_nuevo;
end;
$function$;

grant execute on function public.renumerar_articulo(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. El que crea no acepta uno retirado
-- ---------------------------------------------------------------------------
do $crea$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'crear_articulo';
  v_antes := v_def;

  if position('codigos_retirados' in v_def) = 0 then
    v_def := replace(v_def,
'  if v_codigo is null then
    v_codigo := private.codigo_de_articulo(p_categoria);',
'  /*
    UN CODIGO RETIRADO NO SE PUEDE REUTILIZAR. Se dice de quien era y como se
    llama ahora: encontrarse un «no disponible» a secas obliga a investigar lo
    mismo que retirarlo pretendia ahorrar.

    Y el errcode NO es 23505: esta funcion tiene un manejador de unique_violation
    que reescribiria este mensaje con el suyo —«Ya existe un articulo con el
    codigo»— que ademas seria falso, porque ningun articulo lo tiene ya.
  */
  if v_codigo is not null then
    declare v_r record;
    begin
      select r.codigo_nuevo, a.nombre into v_r
        from public.codigos_retirados r
        join public.articulos a on a.id = r.articulo_id
       where r.codigo = v_codigo;

      if v_r.codigo_nuevo is not null then
        raise exception ''El código % ya se usó: era "%" y ahora se llama %. No se puede reutilizar.'',
          v_codigo, v_r.nombre, v_r.codigo_nuevo
          using errcode = ''22023'',
                hint = ''Un papel viejo con ese código tiene que seguir refiriéndose a lo mismo.'';
      end if;
    end;
  end if;

  if v_codigo is null then
    v_codigo := private.codigo_de_articulo(p_categoria);');
  end if;

  if v_def = v_antes then
    raise notice 'crear_articulo ya rechazaba los codigos retirados.';
  else
    execute v_def;
    raise notice 'crear_articulo rechaza los codigos retirados.';
  end if;
end $crea$;

/*
  COMPROBADO el 9 de septiembre con la reja de ADMIN, en transacción deshecha:

    renumerar la laptop ....... INS-0006 -> EQU-0001, de la serie de EQU
    renumerar otra vez ........ «El código ya corresponde a la categoría»
    reutilizar INS-0006 ....... «ya se usó: era "COMPUTADORAS LAPTOP" y ahora se
                                 llama EQU-0001»
    un código libre ........... entra
    renumerar el GASOIL ....... «ya se le nombró con CT-GASOIL en despachos
                                 combustible (26), inventario movimientos (28)»

  Y después, de verdad: la laptop es EQU-0001. Auditado en los asientos 10129
  —el retiro de INS-0006— y 10130 —el artículo—.
*/
