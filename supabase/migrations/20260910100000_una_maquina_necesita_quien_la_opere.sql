/*
  UNA MÁQUINA NECESITA QUIEN LA OPERE.

  Christopher: «una máquina necesita de un conductor, operador o responsable para
  funcionar o trasladarse». Y en el mismo mensaje: «una máquina no necesariamente
  tiene un único sitio de resguardo, o mejor dicho, puede estar en constante
  exploración o traslado y viajes».

  Las dos cosas apuntan a lo mismo: lo que ata una máquina no es un sitio, es una
  persona. El sitio ya era opcional en la base —`p_almacen_id` admite nulo— y lo
  que faltaba era decir quién la lleva.

  ═══════════════════════════════════════════════════════════════════════════
  ES UN CARGO, NO UNA ASIGNACIÓN DE TURNO
  ═══════════════════════════════════════════════════════════════════════════

  `operador_id` dice quién responde por la máquina, igual que
  `almacenes.responsable_id` dice quién responde por un almacén. No es quién la
  condujo ayer: eso es un hecho con fecha y ya vive en los despachos y en
  `horometro_lecturas.operador_id`, que es otra columna y contesta otra pregunta.

  Uno y no varios, por la misma razón: con dos, «a quién se le pregunta dónde
  está» deja de tener respuesta, y esa pregunta es justo la que Christopher
  plantea cuando dice que la máquina anda de viaje.

  ═══════════════════════════════════════════════════════════════════════════
  PUEDE QUEDAR VACÍO, Y ESO TAMBIÉN LO PIDIÓ ÉL
  ═══════════════════════════════════════════════════════════════════════════

  «Puede haber un grupo de máquinas que están a la espera, que aún no se ingresan
  pero se desea registrar en el sistema». Una máquina que todavía no ha llegado
  no tiene a nadie llevándola, y exigir un operador para registrarla obligaría a
  inventar uno. Así que se admite el hueco, y el hueco dice algo: nadie responde
  por ella todavía.

  Si el empleado se va, la máquina se queda sin operador —`on delete set null`—
  en vez de arrastrar a alguien que ya no está.
*/

alter table public.maquinaria
  add column if not exists operador_id bigint references public.empleados(id) on delete set null;

comment on column public.maquinaria.operador_id is
  'Quien responde por esta maquina: el conductor, operador o encargado que la hace funcionar o la traslada. Es un CARGO, no quien la condujo ayer —eso es un hecho con fecha y vive en los despachos y en horometro_lecturas.operador_id—. Uno y no varios: con dos, «a quien se le pregunta donde esta» deja de tener respuesta, que es justo lo que hace falta cuando la maquina anda de viaje. Puede quedar vacio: una maquina en espera, que todavia no ha llegado, no tiene a nadie llevandola y exigirlo obligaria a inventar uno.';

create index if not exists maquinaria_operador on public.maquinaria (operador_id);

-- ---------------------------------------------------------------------------
-- La puerta
-- ---------------------------------------------------------------------------
do $puerta$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guardar_maquina';
  v_antes := v_def;

  if position('p_operador_id' in v_def) = 0 then
    /* Anclado en la forma NORMALIZADA que devuelve `pg_get_functiondef`, no en
       la que yo escribiria: esa confusion rompio `guardar_almacen` esta misma
       tarde, dejandole el cuerpo cambiado y la firma sin cambiar, y por tanto un
       parametro nombrado que no existia. */
    v_def := replace(v_def,
      'p_fotos jsonb DEFAULT NULL::jsonb)',
      'p_fotos jsonb DEFAULT NULL::jsonb, p_operador_id bigint DEFAULT NULL::bigint)');

    v_def := replace(v_def,
      'combustible_id, capacidad_combustible, propietario, creada_por)',
      'combustible_id, capacidad_combustible, propietario, operador_id, creada_por)');

    v_def := replace(v_def,
      'coalesce(nullif(btrim(coalesce(p_propietario, '''')), ''''), ''LACANTERA''),
       (select auth.uid()))',
      'coalesce(nullif(btrim(coalesce(p_propietario, '''')), ''''), ''LACANTERA''),
       p_operador_id,
       (select auth.uid()))');

    /* Tal cual y no con coalesce: quitarle el operador a una maquina es una
       decision, y con coalesce mandar nulo se leeria como «dejalo como esta». */
    v_def := replace(v_def,
      'propietario = coalesce(nullif(btrim(coalesce(p_propietario, '''')), ''''), propietario)',
      'propietario = coalesce(nullif(btrim(coalesce(p_propietario, '''')), ''''), propietario),
           operador_id = p_operador_id');
  end if;

  if v_def = v_antes then
    raise notice 'guardar_maquina ya conocia al operador.';
  else
    /* Se comprueba que la firma cambio ANTES de soltar la vieja: si el anclaje
       de la firma fallara y el del cuerpo no, quedaria una funcion que nombra un
       parametro inexistente — que es exactamente lo que paso con el almacen. */
    if position('p_operador_id bigint DEFAULT' in v_def) = 0 then
      raise exception 'El anclaje de la firma no encajo: no se toca nada.';
    end if;

    drop function if exists public.guardar_maquina(
      bigint, text, text, text, text, text, text, smallint, bigint,
      numeric, numeric, numeric, smallint, text, bigint, numeric, text, text, jsonb);
    execute v_def;
    raise notice 'una maquina necesita quien la opere.';
  end if;
end $puerta$;

/*
  Y QUE EXISTA DE VERDAD.

  La comprobación en frío devolvió esto al mandar un empleado inventado:

      insert or update on table "maquinaria" violates foreign key constraint
      "maquinaria_operador_id_fkey"

  La clave ajena hizo su trabajo —no se guardó— pero eso no es un mensaje para
  nadie. `guardar_almacen` ya contesta «Ese empleado no existe o ya no está
  activo» en el mismo caso, y aquí faltaba.

  Y hay un caso que la clave ajena NO ve: un empleado dado de baja sigue teniendo
  fila. Poner de conductor a alguien que ya no trabaja aquí pasa el FK y deja la
  máquina a cargo de quien no puede responder por ella.
*/
do $existe$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guardar_maquina';
  v_antes := v_def;

  if position('Ese empleado no existe' in v_def) = 0 then
    /* En dos lineas juntas porque `if p_id is null then` a secas aparece mas
       arriba, en la comprobacion del estado. */
    v_def := replace(v_def,
'  if p_id is null then
    insert into public.maquinaria',
'  if p_operador_id is not null
     and not exists (select 1 from public.empleados e
                      where e.id = p_operador_id and e.activo) then
    raise exception ''Ese empleado no existe o ya no esta activo.''
      using errcode = ''22023'',
            hint = ''Una maquina a cargo de quien ya no trabaja aqui esta a cargo de nadie.'';
  end if;

  if p_id is null then
    insert into public.maquinaria');
  end if;

  if v_def = v_antes then
    raise notice 'guardar_maquina ya comprobaba al operador.';
  else
    if position('Ese empleado no existe' in v_def) = 0 then
      raise exception 'El anclaje no encajo: no se toca nada.';
    end if;
    execute v_def;   -- misma firma: no hace falta soltar la vieja
    raise notice 'el operador tiene que existir y estar activo.';
  end if;
end $existe$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 nace con quien la lleva: VICENTE ARAON PESTANO CAMPOS
    2 empleado inventado ....: Ese empleado no existe o ya no esta activo.
    3 empleado de baja ......: Ese empleado no existe o ya no esta activo.
    4 al soltar el puesto ...: (nadie, como debe)
*/
