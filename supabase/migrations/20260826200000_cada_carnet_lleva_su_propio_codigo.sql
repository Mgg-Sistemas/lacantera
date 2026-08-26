/*
  CADA CARNET LLEVA SU PROPIO CÓDIGO, Y SE PUEDE ANULAR

  Va a haber un QR impreso en el carnet que lleva a una página de verificación.
  La decisión que lo ordena todo la tomó Christopher: si un carnet se pierde o se
  lo roban, ESE carnet tiene que dejar de valer. Por eso el QR no apunta al
  trabajador sino a una EMISIÓN concreta, que se anula y se reemplaza.

  Con el identificador del trabajador dentro del QR —que es lo que hace el
  modelo que mandaron— un carnet perdido sigue escaneando como bueno para
  siempre, y no hay manera de distinguir el viejo del nuevo. Un carnet es una
  llave; una llave que no se puede cambiar no es una llave.

  EL CÓDIGO NO ES EL id DEL TRABAJADOR

  Son nueve bytes al azar en hexadecimal —setenta y dos bits—, así que no se
  adivina ni se recorre probando. Y no dice nada de quién es: un código filtrado
  no revela cuántos empleados hay ni en qué orden entraron, que es justo lo que
  sí cuenta un id correlativo.

  EN MAYÚSCULA, Y NO ES CAPRICHO

  Un QR con solo cifras y letras mayúsculas cabe en el modo alfanumérico, que
  gasta 5,5 bits por carácter en vez de los 8 del modo byte. Y en mayúscula se
  puede teclear del carnet cuando el QR ya no se lee.
*/

create table if not exists public.carnets (
  id             bigint generated always as identity primary key,
  empleado_id    bigint not null references public.empleados(id) on delete cascade,
  codigo         text   not null unique,
  estado         text   not null default 'VIGENTE'
                        check (estado in ('VIGENTE', 'ANULADO')),
  emitido_por    uuid references auth.users(id),
  emitido_en     timestamptz not null default now(),
  anulado_por    uuid references auth.users(id),
  anulado_en     timestamptz,
  anulado_motivo text,
  -- Anular sin decir por qué deja un carnet muerto que nadie sabe explicar el
  -- día que su dueño aparece con él en la mano.
  constraint carnet_anulado_dice_por_que
    check (estado <> 'ANULADO'
           or (anulado_en is not null and length(btrim(coalesce(anulado_motivo, ''))) >= 4))
);

/*
  UNO SOLO VIGENTE POR PERSONA, Y LO GARANTIZA UN ÍNDICE

  Comprobarlo en la función que emite dejaría la puerta abierta a que dos
  emisiones simultáneas pasaran las dos la comprobación —las dos leen que no hay
  ninguno vigente— y acabaran las dos vigentes. Con dos carnets vigentes, anular
  el perdido no cierra nada.
*/
create unique index if not exists carnets_uno_vigente_por_empleado
  on public.carnets (empleado_id) where estado = 'VIGENTE';

alter table public.carnets enable row level security;

drop policy if exists carnets_lectura on public.carnets;
create policy carnets_lectura on public.carnets
  for select to authenticated
  using (private.tiene_permiso('NOMINA', 'LECTURA'));

drop trigger if exists trg_auditar on public.carnets;
create trigger trg_auditar
after insert or update or delete on public.carnets
for each row execute function private.auditar('id');

drop trigger if exists trg_normalizar on public.carnets;
create trigger trg_normalizar
before insert or update on public.carnets
for each row execute function private.normalizar_texto('anulado_motivo');

/*
  Un código nuevo, comprobando que no exista ya.

  La probabilidad de repetir setenta y dos bits es despreciable, pero
  «despreciable» no es «imposible» y el precio de comprobarlo es una consulta por
  índice único. Lo que no se puede es descubrirlo al insertar: el INSERT
  fallaría y quien pidió el carnet vería un error de restricción única.
*/
create or replace function private.codigo_de_carnet()
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_codigo text;
  v_intentos integer := 0;
begin
  loop
    v_codigo := upper(encode(extensions.gen_random_bytes(9), 'hex'));
    exit when not exists (select 1 from public.carnets c where c.codigo = v_codigo);

    v_intentos := v_intentos + 1;
    if v_intentos > 10 then
      raise exception 'No se pudo generar un código de carnet.' using errcode = '55000';
    end if;
  end loop;

  return v_codigo;
end;
$function$;

/*
  Anular sin emitir otro: el carnet de quien ya no está.

  Es el caso que separa este módulo de una impresora: alguien se va, se lleva el
  plástico en el bolsillo, y a partir de esa tarde el carnet escanea como no
  válido sin que nadie tenga que quitárselo.
*/
create or replace function public.anular_carnet(
  p_empleado_id bigint,
  p_motivo      text
) returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare v_id bigint;
begin
  perform private.exigir_permiso('NOMINA', 'ESCRITURA');

  if length(btrim(coalesce(p_motivo, ''))) < 4 then
    raise exception 'Hay que decir por qué se anula el carnet.' using errcode = '23514';
  end if;

  update public.carnets
     set estado = 'ANULADO',
         anulado_por = (select auth.uid()),
         anulado_en = now(),
         anulado_motivo = btrim(p_motivo)
   where empleado_id = p_empleado_id and estado = 'VIGENTE'
  returning id into v_id;

  if v_id is null then
    raise exception 'Ese trabajador no tiene ningún carnet vigente que anular.'
      using errcode = 'P0002';
  end if;

  return v_id;
end;
$function$;

revoke all on function public.anular_carnet(bigint, text) from public;
grant execute on function public.anular_carnet(bigint, text) to authenticated;
