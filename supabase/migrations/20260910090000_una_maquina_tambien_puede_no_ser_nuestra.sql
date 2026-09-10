/*
  UNA MÁQUINA TAMBIÉN PUEDE NO SER NUESTRA.

  Christopher, minutos después de lo de las sillas: «este mismo aspecto se aplica
  también para las máquinas (ej. algún volvo, chuto con volqueta, etc.)».

  El dueño ya existe como catálogo —`public.propietarios`, con La Cantera y la
  Gobernación— así que aquí solo hace falta que la ficha de la máquina lo diga.

  ═══════════════════════════════════════════════════════════════════════════
  EN LA MÁQUINA Y NO EN EL VEHÍCULO, AUNQUE HABLE DE UN CHUTO
  ═══════════════════════════════════════════════════════════════════════════

  `vehiculos` ya tiene `propio` y `transportista`, y contesta una pregunta
  distinta: si la placa que se escribe en una guía es de la casa o de un
  transportista contratado. Es papeleo de despacho, no patrimonio.

  Un chuto de la gobernación que conduce la cantera no es un transportista
  contratado: es una máquina a disposición de la empresa que pertenece a otro. Va
  en `maquinaria`, que es donde vive el activo, y `vehiculos.maquina_id` ya
  permite colgarle su placa cuando haga falta para una guía.

  Meter `propietario` también en `vehiculos` habría dejado dos columnas
  contestando casi lo mismo con matices distintos, que es como se llega a dos
  verdades. Si algún día un vehículo sin máquina resulta ser de otro dueño, se
  añade entonces y con el caso delante.

  NADA QUE MIGRAR, otra vez: hay una sola máquina —«123 RETRO», que tiene pinta
  de prueba— y cero vehículos. Comprobado antes de decidir.
*/

alter table public.maquinaria
  add column if not exists propietario text not null default 'LACANTERA';

do $fk$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'maquinaria_propietario_fkey'
                    and conrelid = 'public.maquinaria'::regclass) then
    alter table public.maquinaria
      add constraint maquinaria_propietario_fkey
      foreign key (propietario) references public.propietarios(codigo);
  end if;
end $fk$;

comment on column public.maquinaria.propietario is
  'De quien es la maquina. Lo pidio Christopher el 10/09/2026: «este mismo aspecto se aplica tambien para las maquinas (ej. algun volvo, chuto con volqueta)». Va aqui y no en `vehiculos` porque aquel `propio` contesta otra cosa —si la placa de una guia es de la casa o de un transportista contratado, que es papeleo de despacho— y un chuto de la gobernacion conducido por la cantera no es un transportista contratado: es un activo ajeno a disposicion de la empresa.';

/*
  LA PUERTA. Se parchea con anclajes COMPROBADOS contra el cuerpo vivo —los
  cuatro se leyeron antes de escribirlos— porque la funcion es larga y copiarla
  entera invitaria a que las dos copias diverjan. Al ir a hacerlo con
  `guardar_almacen` hace un rato, tres de cuatro anclajes imaginados no existian;
  la leccion se aplica aqui mirando primero.
*/
do $puerta$
declare v_def text; v_antes text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'guardar_maquina';
  v_antes := v_def;

  if position('p_propietario' in v_def) = 0 then
    v_def := replace(v_def,
      'p_capacidad_combustible numeric DEFAULT NULL::numeric)',
      'p_capacidad_combustible numeric DEFAULT NULL::numeric, p_propietario text DEFAULT NULL::text)');

    v_def := replace(v_def,
      'combustible_id, capacidad_combustible, creada_por)',
      'combustible_id, capacidad_combustible, propietario, creada_por)');

    v_def := replace(v_def,
      'p_combustible_id, p_capacidad_combustible, (select auth.uid()))',
      'p_combustible_id, p_capacidad_combustible,
       coalesce(nullif(btrim(coalesce(p_propietario, '''')), ''''), ''LACANTERA''),
       (select auth.uid()))');

    v_def := replace(v_def,
      'capacidad_combustible = p_capacidad_combustible
     where id = p_id',
      'capacidad_combustible = p_capacidad_combustible,
           propietario = coalesce(nullif(btrim(coalesce(p_propietario, '''')), ''''), propietario)
     where id = p_id');
  end if;

  if v_def = v_antes then
    raise notice 'guardar_maquina ya conocia el dueno.';
  else
    -- La firma cambia: la vieja se va en la MISMA migracion.
    drop function if exists public.guardar_maquina(
      bigint, text, text, text, text, text, text, smallint, bigint,
      numeric, numeric, numeric, smallint, text, bigint, numeric);
    execute v_def;
    raise notice 'guardar_maquina acepta el dueno.';
  end if;
end $puerta$;
