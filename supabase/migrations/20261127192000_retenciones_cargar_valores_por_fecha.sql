-- Completa los valores nacionales que el formulario fiscal consulta por fecha.
-- Las alícuotas heredan la configuración de La Cantera y la fecha base de GT.
with config as (
  select value from public.config where key = 'retenciones.parametros'
), valores as (
  select null::text as impuesto, 'ut'::text as clave, '43'::jsonb as valor,
         date '2025-06-02' as desde, 'Providencia SNAT/2025/000048, G.O. 43.140'::text as fuente,
         'Unidad tributaria vigente desde la publicación de la providencia.'::text as motivo
  union all
  select v.impuesto, v.clave, c.value -> v.config_clave, date '2020-01-01', 'Configuración fiscal de La Cantera',
         'Valor inicial del catálogo histórico, con la misma fecha base que Golden Touch.'
    from config c
    cross join (values ('IVA','alicuota','iva_alicuota'),
                       ('IVA','pct_retencion','iva_retencion'),
                       ('IGTF','alicuota','igtf_alicuota')) as v(impuesto,clave,config_clave)
)
insert into public.retencion_parametros (impuesto_clave, clave, valor, desde, fuente, motivo)
select v.impuesto, v.clave, v.valor, v.desde, v.fuente, v.motivo
  from valores v
 where jsonb_typeof(v.valor) = 'number'
   and not exists (
     select 1 from public.retencion_parametros p
      where p.impuesto_clave is not distinct from v.impuesto and p.clave = v.clave
   )
on conflict do nothing;
