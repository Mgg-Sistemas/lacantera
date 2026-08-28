/*
  LA ALIANZA CON LA GOBERNACIÓN, Y LO QUE HAY QUE ENTREGARLE CADA MES.

  ————————————————————————————————————————————————————————————————————————
  SIN APLICAR. Escrita el 28 de agosto de 2026 con el MCP de Supabase caído.
  Ni ejecutada ni comprobada contra el catálogo.
  ————————————————————————————————————————————————————————————————————————

  DE DÓNDE SALE CADA CIFRA

  Del contrato «ALIANZA ESTRATÉGICA COMERCIAL ENTRE EL ESTADO LA GUAIRA Y LA
  SOCIEDAD MERCANTIL CONSORCIO BRAVA HORIZONTE, C.A.», sobre la cantera del río
  Naiguatá. Se leyó entero; lo que sigue lleva la cláusula al lado, porque una
  cifra de reparto sin su origen es una cifra que nadie puede auditar.

    Cláusula Segunda, Parágrafo Primero
      LA GOBERNACIÓN .... 14 % de los ingresos brutos de cada mes
      LA ALIADA ......... 86 % de los ingresos brutos de cada mes

    Cláusula Segunda, Parágrafo Tercero
      Responsabilidad social ... 3 % de los ingresos NETOS mensuales

    Cláusula Tercera, Parágrafo Cuarto
      Recargo por retraso ...... 0,5 % del aporte trimestral por cada día

    Cláusula Tercera, Parágrafo Segundo
      La distribución se hace dentro de los CINCO primeros días hábiles del
      mes siguiente a aquel en que se generó la facturación.

  SOBRE QUÉ SE CALCULA EL 14 %, QUE ES LA DECISIÓN QUE MÁS PESA

  El contrato se contradice a primera vista y se resuelve solo. La Cláusula
  Segunda dice «efectivamente facturadas y pagadas». Pero la Cláusula Tercera,
  Parágrafo Primero, punto 3, dice:

    «la concesión de créditos o impago de los clientes en ningún momento
     representará una limitante para la rendición de la participación... es
     innegociable e impostergable independientemente que LA ALIADA haya
     recaudado o no, lo facturado, NO OBSTANTE LO ESTABLECIDO EN LA CLÁUSULA
     SEGUNDA.»

  Esa última frase es explícita: priva sobre la Segunda. Así que **el 14 % se
  devenga al FACTURAR, no al cobrar**, y Christopher lo confirmó.

  La consecuencia es cara y conviene decirla en voz alta: una venta a crédito
  crea la obligación con la Gobernación el mismo día que se emite la factura,
  antes de que entre un bolívar. Si se factura mucho a crédito, hay que tener
  caja para el 14 % de algo que todavía no se ha cobrado.

  Por eso la vista calcula **las dos cifras y la brecha**. Lo devengado es lo
  que se debe; lo cobrado es lo que hay. La diferencia entre las dos es
  exactamente el dinero que la empresa tiene que poner de su bolsillo ese mes,
  y no se descubre sumando facturas a mano.

  POR QUÉ LOS PORCENTAJES SON DATO Y NO CONSTANTE

  El contrato dura diez años y admite renovación. Un 14 escrito en una función
  obliga a una migración el día que se renegocie, y ese día nadie se acuerda de
  dónde estaba escrito. Van en una tabla con fecha de vigencia, como las tasas.
*/

create table if not exists public.alianzas (
  id            bigserial primary key,
  numero        text not null,
  contraparte   text not null,
  objeto        text,
  desde         date not null,
  hasta         date,
  /* Cláusula Segunda, Parágrafo Primero. */
  pct_gobernacion numeric(6,3) not null,
  pct_aliada      numeric(6,3) not null,
  /* Parágrafo Tercero: sobre los ingresos NETOS, no sobre los brutos. */
  pct_social      numeric(6,3) not null default 0,
  /* Cláusula Tercera, Parágrafo Cuarto: por cada día de retraso. */
  recargo_diario_pct numeric(6,3) not null default 0,
  /* Parágrafo Segundo: días hábiles del mes siguiente para entregar. */
  dias_habiles_para_entregar smallint not null default 5,
  activa        boolean not null default true,
  nota          text,
  creada_en     timestamptz not null default now(),
  creada_por    uuid references public.perfiles(id)
);

comment on table public.alianzas is
  'El convenio con la Gobernacion y sus porcentajes. Con fecha porque el contrato dura diez anos y admite renovacion.';
comment on column public.alianzas.pct_gobernacion is
  'Clausula Segunda, Paragrafo Primero. Sobre los ingresos brutos mensuales.';
comment on column public.alianzas.pct_social is
  'Paragrafo Tercero. Sobre los ingresos NETOS, no sobre los brutos: son bases distintas.';

/*
  Los dos porcentajes de reparto tienen que sumar cien. Es la clase de cifra
  que alguien corrige a medias —baja el 14 al 12 y se olvida de subir el 86— y
  el error no se ve hasta que la conciliacion no cuadra con la Gobernacion.
*/
alter table public.alianzas
  drop constraint if exists alianzas_reparto_check;
alter table public.alianzas
  add constraint alianzas_reparto_check
  check (pct_gobernacion >= 0 and pct_aliada >= 0
         and round(pct_gobernacion + pct_aliada, 3) = 100);

alter table public.alianzas enable row level security;

/*
  SOLO ADMINISTRACION, como pidio la lider: «que sea solo para los admins».

  No es una pantalla de trabajo diario: es lo que la empresa le rinde a la
  Gobernacion. Quien factura no necesita ver el reparto, y ensenarselo invita a
  conversaciones que no le tocan.
*/
drop policy if exists alianzas_lectura on public.alianzas;
create policy alianzas_lectura on public.alianzas
  for select to authenticated
  using (private.tiene_rol('ADMIN', 'GERENTE_GENERAL'));

grant select on public.alianzas to authenticated;

create trigger trg_auditar after insert or update or delete on public.alianzas
  for each row execute function private.auditar();

/*
  El convenio vivo. Se siembra con lo que dice el contrato leido.

  `numero` va sin rellenar el hueco del original —«GELG-______-2.025»— porque en
  el papel escaneado el numero esta en blanco. Se completa cuando se sepa; poner
  uno inventado seria peor que dejarlo dicho.
*/
insert into public.alianzas
  (numero, contraparte, objeto, desde, hasta,
   pct_gobernacion, pct_aliada, pct_social, recargo_diario_pct,
   dias_habiles_para_entregar, nota)
values
  ('GELG-POR-COMPLETAR-2025',
   'GOBERNACION BOLIVARIANA DEL ESTADO LA GUAIRA',
   'Explotacion y produccion de minerales no metalicos y sus agregados en la cantera del rio Naiguata',
   '2025-09-01', null,
   14, 86, 3, 0.5, 5,
   'Sembrada del contrato escaneado. El numero de la alianza esta en blanco en el original y hay que completarlo.')
on conflict do nothing;

/*
  LO QUE SE LE DEBE A LA GOBERNACION CADA MES.

  Una fila por mes con las dos cifras que hacen falta para la conciliacion que
  pide el contrato: lo devengado —que es lo que se debe— y lo cobrado, que es lo
  que hay. La brecha entre las dos sale de las ventas a credito.

  Se cuenta sobre `total_usd` y no sobre `total`: las facturas pueden estar en
  monedas distintas y el reparto es uno solo. La conversion ya la hace la
  columna generada de cada factura con la tasa congelada de su dia, que es la
  que vale.

  LAS ANULADAS NO CUENTAN, y las notas de credito restan. Una nota de credito
  es dinero que se le devuelve al cliente: si no restara, la empresa le estaria
  entregando a la Gobernacion el 14 % de una venta que se deshizo.
*/
create or replace view public.v_alianza_mensual as
with facturado as (
  select
    date_trunc('month', f.fecha)::date as mes,
    sum(f.total_usd)                   as facturado_usd,
    sum(f.cobrado_usd)                 as cobrado_usd,
    count(*)                           as facturas
  from public.facturas_venta f
  where f.estado <> 'ANULADA'
  group by 1
),
acreditado as (
  select
    date_trunc('month', n.fecha)::date as mes,
    sum(n.total_usd)                   as acreditado_usd
  from public.notas_credito n
  where n.estado <> 'ANULADA'
  group by 1
)
select
  f.mes,
  a.id                                  as alianza_id,
  a.pct_gobernacion,
  a.pct_aliada,
  a.pct_social,
  f.facturas,
  f.facturado_usd,
  coalesce(c.acreditado_usd, 0)         as acreditado_usd,
  f.facturado_usd - coalesce(c.acreditado_usd, 0) as bruto_usd,
  round((f.facturado_usd - coalesce(c.acreditado_usd, 0)) * a.pct_gobernacion / 100, 2)
                                        as gobernacion_devengado_usd,
  round((f.facturado_usd - coalesce(c.acreditado_usd, 0)) * a.pct_aliada / 100, 2)
                                        as aliada_usd,
  f.cobrado_usd,
  round(f.cobrado_usd * a.pct_gobernacion / 100, 2)
                                        as gobernacion_sobre_cobrado_usd,
  /*
    La brecha: lo que se debe menos lo que se tendria si solo se debiera lo
    cobrado. Es el dinero que la empresa pone de su bolsillo ese mes por haber
    facturado a credito.
  */
  round(
    (f.facturado_usd - coalesce(c.acreditado_usd, 0)) * a.pct_gobernacion / 100
    - f.cobrado_usd * a.pct_gobernacion / 100, 2)
                                        as brecha_usd,
  /*
    Clausula Tercera, Paragrafo Segundo: dentro de los cinco primeros dias
    habiles del mes siguiente. Se da la fecha del mes siguiente y que la
    pantalla cuente los habiles: contar feriados en SQL exigiria un calendario
    de fiestas que el sistema no tiene, e inventarlo aqui daria una fecha
    equivocada con aire de exacta.
  */
  (f.mes + interval '1 month')::date    as entregar_desde,
  a.dias_habiles_para_entregar
from facturado f
left join acreditado c on c.mes = f.mes
cross join lateral (
  select * from public.alianzas al
   where al.activa and al.desde <= f.mes and (al.hasta is null or al.hasta >= f.mes)
   order by al.desde desc limit 1
) a;

grant select on public.v_alianza_mensual to authenticated;

/*
  COMPROBAR DESPUÉS DE APLICARLA

    -- Lo primero: que los nombres existan. Esta migracion da por ciertas
    -- `facturas_venta(fecha, total_usd, cobrado_usd, estado)` y
    -- `notas_credito(fecha, total_usd, estado)` leyendo el front, sin catalogo
    -- delante. La regla 7 dice que eso no se da por bueno.
    select column_name from information_schema.columns
     where table_schema='public' and table_name in ('facturas_venta','notas_credito')
     order by table_name, ordinal_position;

    -- El freno del reparto muerde
    do $x$ begin
      update public.alianzas set pct_gobernacion = 12 where activa;
      raise exception 'ENSAYO: acepto 12+86, el freno no sirve';
    exception when check_violation then
      raise exception 'ENSAYO: lo rechazo, bien';
    end $x$;

    -- Y que la vista cuadre a mano con un mes real
    select mes, facturado_usd, acreditado_usd, bruto_usd,
           gobernacion_devengado_usd, aliada_usd, brecha_usd
      from public.v_alianza_mensual order by mes desc;
*/
