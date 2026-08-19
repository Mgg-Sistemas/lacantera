-- ---------------------------------------------------------------------------
-- El IVA y el IGTF se deciden en cada operación
--
-- LO QUE PASABA
--
-- Las columnas ya estaban: `alicuota_iva` vive en cada cotización, nota de
-- entrega y factura, con 16 por defecto. Y el IGTF ya se decidía por cobro.
--
-- El problema era que ninguna pantalla lo preguntaba. El 16 % entraba siempre
-- porque nadie tenía cómo decir que no, y la dirección de Sistemas avisa de
-- que la cantera no necesariamente lo cobra.
--
-- POR QUÉ ADEMÁS HAY UN VALOR POR DEFECTO EN LA EMPRESA
--
-- «Por operación» no puede significar «hay que acordarse en cada una». Una
-- empresa está o no está en el régimen, y eso no cambia de una venta a otra;
-- lo que cambia es el caso particular. Así que la casilla llega marcada o
-- desmarcada según lo que diga la ficha de la empresa, y quien emite la
-- cambia cuando toca.
--
-- Sin esto, olvidarse de marcarla una vez es facturar sin el impuesto, y
-- olvidarse al revés es cobrarlo de más. Las dos se pagan caras.
-- ---------------------------------------------------------------------------
alter table public.empresa
  add column if not exists aplica_iva  boolean not null default true,
  add column if not exists aplica_igtf boolean not null default true;

comment on column public.empresa.aplica_iva is
  'Si la empresa cobra IVA por defecto. Cada operación puede decir otra cosa: '
  'esto solo decide cómo llega la casilla al emitir.';
comment on column public.empresa.aplica_igtf is
  'Si se aplica IGTF por defecto a los cobros en divisas. Cada cobro puede '
  'decir otra cosa.';

-- ---------------------------------------------------------------------------
-- Fijar los dos, sin tocar la función grande de la empresa
--
-- `actualizar_empresa` lleva quince parámetros. Añadirle dos obliga a
-- recrearla entera y a que las cuatro pantallas que la llaman pasen los
-- quince, para cambiar dos casillas que no tienen nada que ver con el RIF ni
-- con el domicilio fiscal. Una función corta al lado es más barata de leer y
-- de llamar.
-- ---------------------------------------------------------------------------
create or replace function public.fijar_tributos(
  p_aplica_iva  boolean,
  p_aplica_igtf boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $func$
begin
  perform private.exigir_permiso('CONFIGURACION', 'ESCRITURA');

  update public.empresa
     set aplica_iva     = coalesce(p_aplica_iva, aplica_iva),
         aplica_igtf    = coalesce(p_aplica_igtf, aplica_igtf),
         actualizado_por = (select auth.uid()),
         actualizado_en  = now()
   where id = 1;

  if not found then
    raise exception 'Todavía no se han cargado los datos de la empresa.'
      using errcode = 'P0002';
  end if;
end;
$func$;

revoke execute on function public.fijar_tributos(boolean, boolean) from public, anon;
grant  execute on function public.fijar_tributos(boolean, boolean) to authenticated;
