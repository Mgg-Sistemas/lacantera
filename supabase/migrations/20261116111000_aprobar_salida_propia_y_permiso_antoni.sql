-- Permitir que quien tiene permiso de aprobar salidas (como el encargado de
-- almacén o usuario autorizado) pueda aprobar también las solicitudes que él
-- mismo transcribió/registró en el sistema, y asegurar permisos de Antoni Vargas.

create or replace function private.es_aprobador_de_salidas()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.tiene_rol('ADMIN')
      or exists (
           select 1
             from public.usuarios_autorizados a
             join public.perfiles p on p.id = a.usuario_id
            where a.usuario_id = (select auth.uid())
              and a.aprobar_salidas
              and p.activo
         )
      or private.puede_accion('SALIDAS.APROBAR_SOLICITUD');
$function$;

create or replace function private.como_aprueba_salida(p_almacen bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when private.responde_por(p_almacen) then 'RESPONSABLE'
    when private.es_aprobador_de_salidas() then 'RESPALDO'
  end;
$function$;

create or replace function public.como_apruebo_salidas()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesión no válida. Vuelva a entrar.' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'yo', (select auth.uid()),
    'respaldo', private.es_aprobador_de_salidas(),
    'restringida', false,
    'sitios', coalesce(
      (select jsonb_agg(a.id order by a.id)
         from public.almacenes a
         join public.empleados e on e.id = a.responsable_id
         join public.perfiles p on p.id = e.perfil_id
        where e.perfil_id = (select auth.uid()) and e.activo and p.activo),
      '[]'::jsonb
    )
  );
end;
$function$;

create or replace function public.aprobar_solicitud_salida(
  p_id bigint,
  p_con_firma boolean default true
)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_s    public.solicitudes_salida;
  v_alm  public.almacenes;
  v_como text;
begin
  select * into v_s from public.solicitudes_salida where id = p_id for update;
  if v_s.id is null then
    raise exception 'No existe la solicitud %.', p_id using errcode = 'P0002';
  end if;
  if v_s.estado <> 'PEDIDA' then
    raise exception 'La solicitud % ya no espera aprobación: está %.', v_s.numero, lower(v_s.estado)
      using errcode = '55000';
  end if;

  select * into v_alm from public.almacenes where id = v_s.almacen_id;

  v_como := private.como_aprueba_salida(v_s.almacen_id);
  if v_como is null then
    raise exception 'La solicitud % la aprueba quien responde por "%"%, o quien tenga el permiso de aprobar salidas.',
      v_s.numero, v_alm.nombre, private.quien_responde_frase(v_s.almacen_id)
      using errcode = '42501';
  end if;

  update public.solicitudes_salida
     set estado = 'APROBADA',
         aprobada_por = (select auth.uid()),
         aprobada_en = now(),
         aprobada_de_respaldo = (v_como = 'RESPALDO'),
         firma_de_quien_aprueba = coalesce(p_con_firma, true) and private.tengo_firma_encendida()
   where id = p_id;

  perform private.notificar(
    'SALIDAS',
    'SALIDA_APROBADA',
    format('%s: aprobada', v_s.numero),
    format('Se puede entregar desde %s.', v_alm.nombre),
    '/app/salidas/solicitudes',
    array['ALMACEN'],
    'INFO'
  );

  return p_id;
end;
$function$;

-- Autorizar a Antoni Vargas (antoni204) para aprobar y entregar salidas e inventario
insert into public.usuarios_autorizados (usuario_id, aprobar_oc, aprobar_salidas)
select p.id, true, true
  from public.perfiles p
 where upper(btrim(p.nombre)) = 'ANTONI VARGAS'
    or lower(btrim(p.usuario)) = 'antoni204'
on conflict (usuario_id) do update
  set aprobar_salidas = true;

insert into public.rol_permisos (rol, modulo, nivel)
select distinct ur.rol, m.modulo, 'TOTAL'
  from public.perfiles p
  join public.usuarios_roles ur on ur.usuario_id = p.id
  cross join (values ('SALIDAS'), ('INVENTARIO')) as m(modulo)
 where upper(btrim(p.nombre)) = 'ANTONI VARGAS'
    or lower(btrim(p.usuario)) = 'antoni204'
on conflict (rol, modulo) do update
  set nivel = 'TOTAL';
