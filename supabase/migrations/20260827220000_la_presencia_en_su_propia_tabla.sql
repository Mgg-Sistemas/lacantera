/*
  LA SEÑAL DE VIDA SE MUDA FUERA DE `perfiles`, ANTES DE QUE ESTO LLEGUE A NADIE.

  La migracion anterior puso `perfiles.visto_en` y el navegador la refresca cada
  dos minutos. Al repasarla antes de subirla salio lo que tenia que salir:
  **`perfiles` lleva `trg_auditar`**.

  `private.auditar()` solo se calla cuando un UPDATE no cambio nada, y aqui
  cambia siempre —esa es toda la gracia de la columna—. Asi que cada latido de
  cada persona habria escrito una linea en la auditoria: diez personas por
  treinta latidos a la hora por ocho horas son dos mil cuatrocientas lineas
  diarias de ruido, ahogando justo el rastro que la pantalla existe para
  enseñar. Y en el modulo que se acababa de pedir revisar.

  Se podia excluir la columna del disparador, pero el sintoma señalaba algo mas
  de fondo: la presencia no es un dato del perfil. Un perfil dice quien es
  alguien y se cambia cuatro veces al año; esto se escribe cada dos minutos y
  no vale nada pasado mañana. Metidas en la misma tabla, la que se escribe sin
  parar arrastra a la que se lee todo el rato.

  En su propia tabla el problema desaparece por construccion en vez de por
  excepcion: `presencia` no tiene disparador de auditoria porque no lo necesita
  —nadie va a preguntar quien cambio un latido—, y `perfiles` se queda como
  estaba, auditada entera y sin churn.

  La vista `v_presencia` no cambia de forma, asi que la pantalla no se entera.
*/

create table if not exists public.presencia (
  usuario_id uuid primary key references public.perfiles(id) on delete cascade,
  visto_en   timestamptz not null default now()
);

comment on table public.presencia is
  'La ultima señal de vida de cada quien. Aparte de perfiles a proposito: se escribe cada dos minutos y perfiles esta auditada.';

alter table public.presencia enable row level security;

drop policy if exists presencia_lectura on public.presencia;
create policy presencia_lectura on public.presencia
  for select to authenticated using (true);

grant select on public.presencia to authenticated;

create index if not exists presencia_visto_en_idx on public.presencia (visto_en desc);

-- Lo que hubiera en la columna vieja se conserva antes de quitarla.
insert into public.presencia (usuario_id, visto_en)
select id, visto_en from public.perfiles where visto_en is not null
on conflict (usuario_id) do update set visto_en = excluded.visto_en;

create or replace function public.sigo_aqui()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then
    return;
  end if;

  insert into public.presencia (usuario_id, visto_en)
  values ((select auth.uid()), now())
  on conflict (usuario_id) do update set visto_en = now();
end;
$function$;

revoke all on function public.sigo_aqui() from public, anon;
grant execute on function public.sigo_aqui() to authenticated, service_role;

create or replace view public.v_presencia as
select
  p.id,
  p.nombre,
  p.usuario,
  p.cargo,
  p.activo,
  s.visto_en,
  (s.visto_en is not null and s.visto_en > now() - interval '5 minutes') as en_linea,
  (select max(a.ocurrido_en) from public.auditoria a
    where a.usuario_id = p.id and a.operacion = 'ACCESO') as ultimo_acceso
from public.perfiles p
left join public.presencia s on s.usuario_id = p.id
where p.activo;

grant select on public.v_presencia to authenticated;

drop index if exists public.perfiles_visto_en_idx;
alter table public.perfiles drop column if exists visto_en;

/*
  COMPROBADO DESPUES DE APLICARLA

    -- La columna se fue de perfiles, la tabla esta, y NO tiene disparadores
    select count(*) from information_schema.columns
     where table_schema='public' and table_name='perfiles' and column_name='visto_en';  -- 0
    select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
     where c.relname='presencia' and not t.tgisinternal;                                -- 0

    -- Y la vista sigue devolviendo lo mismo
    select count(*) from public.v_presencia;                                            -- 8
*/
