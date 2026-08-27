/*
  QUIEN ESTA EN EL SISTEMA, Y CUANDO SE LE VIO SI NO LO ESTA.

  POR QUE NO BASTA LA AUDITORIA

  Ya estaba todo lo que hace falta para saber quien entro: la auditoria apunta
  cada ACCESO con su fecha y su hora. Lo que no dice es quien sigue delante de
  la pantalla, y esa es la pregunta que se hizo.

  La auditoria solo apunta entradas y escrituras. Alguien que entra a las siete
  y se pasa la mañana leyendo el tablero, mirando existencias y comparando
  cotizaciones no deja ni una linea — y figuraria desconectado desde las siete.
  Justo al reves de lo que se quiere ver.

  Por eso hace falta una señal aparte: `perfiles.visto_en`, que el navegador
  refresca cada dos minutos mientras la pestaña este a la vista.

  CINCO MINUTOS DE VENTANA

  El latido va cada dos, asi que se puede perder uno —una pestaña dormida, una
  conexion que se cae en la cantera— sin que la persona desaparezca de la
  lista. Con dos minutos justos cualquier hipo la apagaria; con quince, alguien
  que cerro hace diez seguiria figurando conectado, que es peor: esta lista se
  mira para saber a quien se le puede preguntar AHORA.

  DOS FECHAS Y NO UNA

  `visto_en` dice cuando se le vio; `ultimo_acceso` —de la auditoria— dice
  cuando entro. No son lo mismo y las dos hacen falta: juntas distinguen a
  quien entro y sigue ahi de quien entro y cerro. Y `ultimo_acceso` es ademas
  lo unico que hay de quien no ha vuelto desde que existe la señal.

  LO QUE ESTO NO ES

  No es presencia en vivo. Nadie se apaga en el momento exacto en que cierra la
  pestaña, y la pantalla lo dice en vez de disimularlo con un punto que late.

  ---

  Y DE PASO, CINCO CATALOGOS QUE NO SE AUDITABAN

  Se pidio revisar el modulo de auditoria. Lo que salio de mirarlo: diez tablas
  sin `trg_auditar`, de las cuales cinco si debian tenerlo. `presentaciones` es
  de hace un rato y es mia — la regla 5 de la casa dice que toda tabla nueva lo
  lleva, y se me paso.

  Las otras cinco se quedan fuera con motivo: `auditoria` se auditaria a si
  misma, `correlativos` lo escribe la maquina, `notificaciones` y
  `notificaciones_leidas` son ruido, y `nomina_recibo_lineas` sale de un
  calculo cuyo recibo si esta auditado.

  Ninguna lleva `trg_normalizar`, como el resto de los catalogos —`unidades`,
  `monedas`, `roles`, `modulos` tampoco—. Su `nombre` es un rotulo para leer,
  «Metro cubico», «Bidon»; normalizarlo lo dejaria en mayuscula y sin tildes,
  que es lo correcto para un dato y no para un rotulo.
*/

alter table public.perfiles
  add column if not exists visto_en timestamptz;

comment on column public.perfiles.visto_en is
  'Ultima señal de vida del navegador de esa persona. Nulo: nunca ha entrado desde que esto existe.';

create index if not exists perfiles_visto_en_idx on public.perfiles (visto_en desc nulls last);

/*
  Escribe solo su propia fila y solo esa columna. No exige rol: cualquiera con
  sesion puede decir que sigue ahi, y no puede decirlo por otro.
*/
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

  update public.perfiles set visto_en = now() where id = (select auth.uid());
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
  p.visto_en,
  (p.visto_en is not null and p.visto_en > now() - interval '5 minutes') as en_linea,
  (select max(a.ocurrido_en) from public.auditoria a
    where a.usuario_id = p.id and a.operacion = 'ACCESO') as ultimo_acceso
from public.perfiles p
where p.activo;

grant select on public.v_presencia to authenticated;

create trigger trg_auditar after insert or update or delete on public.presentaciones
  for each row execute function private.auditar();

create trigger trg_auditar after insert or update or delete on public.categorias_gasto
  for each row execute function private.auditar();

create trigger trg_auditar after insert or update or delete on public.motivos_despacho
  for each row execute function private.auditar();

create trigger trg_auditar after insert or update or delete on public.especialidades_taller
  for each row execute function private.auditar();

create trigger trg_auditar after insert or update or delete on public.taller_especialidades
  for each row execute function private.auditar();

/*
  COMPROBADO DESPUES DE APLICARLA

    -- La columna, la vista, y anon fuera de la señal
    select count(*) from information_schema.views
     where table_schema='public' and table_name='v_presencia';           -- 1
    select has_function_privilege('anon', p.oid, 'execute')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='sigo_aqui';                 -- false

    -- Cuantas tablas quedan sin auditar: 5, y son las cinco que no deben.
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r'
       and not exists (select 1 from pg_trigger t
                        where t.tgrelid=c.oid and not t.tgisinternal
                          and t.tgname='trg_auditar');
*/
