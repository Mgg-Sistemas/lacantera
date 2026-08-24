-- ---------------------------------------------------------------------------
-- El detalle del gasto se ve desde Compras, y la deducción no adivina
--
-- Cuatro defectos del centro de costos, todos de lo escrito esta misma mañana.
-- Los encontró el carril de apoyo al comparar con el PERAMANAL de Golden Touch,
-- y los cuatro se comprobaron contra la base antes de tocar nada.
--
-- =========================================================================
-- 1. LA TABLA DE DETALLE SALÍA VACÍA, SIN DAR NINGÚN ERROR
-- =========================================================================
--
-- El peor de los cuatro, y el más vergonzoso: el encabezado de
-- `centroDeCostos.ts` explicaba por qué el detalle no puede leer la vista
-- directamente, y seis líneas después la leía.
--
-- `v_gastos` es `security_invoker` sobre `tesoreria_movimientos`, cuya única
-- política de SELECT exige TESORERIA:LECTURA. El centro de costos vive en
-- Compras. Resultado para un usuario de Compras:
--
--   las tarjetas de arriba ... bien, llegan por funciones `security definer`
--   la tabla de abajo ........ VACÍA, y sin un solo error en pantalla
--
-- Una pantalla que miente en silencio es peor que una que falla: quien la mira
-- concluye que no hubo gastos.
--
-- `gastos_del_periodo` es la misma consulta con la reja correcta dentro. Es el
-- mismo remedio que ya se aplicó esta mañana a los empleados en el vale de
-- combustible — y el hecho de que haya vuelto a pasar dice que el patrón
-- «pantalla en un módulo, datos en otro» hay que mirarlo siempre.
--
-- =========================================================================
-- 2. UNA ORDEN CON RENGLONES A MANO SE PODÍA DECLARAR TODA DE COMBUSTIBLE
-- =========================================================================
--
-- La deducción hacía INNER JOIN contra `articulos`, así que los renglones de
-- texto libre —que no tienen artículo— desaparecían antes de contarse. Con un
-- renglón de gasoil y tres escritos a mano, `bool_and(categoria='COMBUSTIBLE')`
-- daba cierto y el pago entero se clasificaba como GASOIL.
--
-- No es hipotético: hoy hay dos renglones sin artículo en la base, los dos de la
-- orden 11 — que por eso desaparecía entera del cálculo.
--
-- Ahora se cuentan los renglones y los clasificables, y «todo combustible» solo
-- se afirma cuando coinciden. Si no se pudo mirar todo, no se afirma nada: cae
-- en INSUMOS_VARIOS, que es lo honesto.
--
-- =========================================================================
-- 3. LOS REPUESTOS SE CLASIFICABAN COMO LUBRICANTES
-- =========================================================================
--
-- `hay_taller` metía REPUESTO y LUBRICANTE en el mismo saco y lo mapeaba a
-- LUBRICANTES, cuando REPUESTOS existe en el catálogo desde el primer día.
-- Cada uno a lo suyo.
--
-- =========================================================================
-- 4. EL PRESUPUESTO NO AVISABA EN VIVO
-- =========================================================================
--
-- `presupuestos` no estaba en la publicación de tiempo real, así que quien
-- tuviera la pantalla abierta seguía viendo «sin fondo asignado» después de que
-- otro lo cargara. Va en `tiempoReal.ts` y en la publicación.
-- ---------------------------------------------------------------------------

create or replace view public.v_gastos as
with clase_de_orden as (
  select r.orden_id,
         count(*)              as renglones,
         count(r.articulo_id)  as clasificables,
         bool_or(a.categoria = 'COMBUSTIBLE')  as hay_combustible,
         bool_or(a.categoria = 'LUBRICANTE')   as hay_lubricante,
         bool_or(a.categoria = 'REPUESTO')     as hay_repuesto,
         bool_or(a.categoria = 'HERRAMIENTA')  as hay_herramienta,
         bool_or(a.categoria = 'EPP')          as hay_epp
    from public.orden_renglones r
    left join public.articulos a on a.id = r.articulo_id
   group by r.orden_id
),
con_clase as (
  select
    m.*,
    coalesce(
      m.categoria,
      case
        when m.nomina_periodo_id is not null then 'SUELDOS'
        when co.renglones = co.clasificables and co.hay_combustible
             and not (co.hay_lubricante or co.hay_repuesto or co.hay_herramienta or co.hay_epp)
          then 'GASOIL'
        when co.hay_repuesto    then 'REPUESTOS'
        when co.hay_lubricante  then 'LUBRICANTES'
        when co.hay_herramienta then 'HERRAMIENTAS'
        when co.hay_epp         then 'EPP'
        when m.orden_id is not null then 'INSUMOS_VARIOS'
      end
    ) as clase
  from public.tesoreria_movimientos m
  left join clase_de_orden co on co.orden_id = m.orden_id
  where m.signo = -1
)
select
  g.id, g.numero, g.fecha, g.concepto, g.contraparte, g.referencia, g.tipo,
  g.monto, g.monto_usd, g.monto_bs, g.cuenta_id, g.orden_id, g.nomina_periodo_id,
  g.registrado_en,
  g.categoria as categoria_puesta,
  g.clase     as categoria,
  c.nombre    as categoria_nombre,
  coalesce(c.padre, c.codigo)  as categoria_raiz,
  coalesce(p.nombre, c.nombre) as categoria_raiz_nombre
from con_clase g
left join public.categorias_gasto c on c.codigo = g.clase
left join public.categorias_gasto p on p.codigo = c.padre;

alter view public.v_gastos set (security_invoker = on);

comment on view public.v_gastos is
  'Los egresos con su clase, en dos niveles. Solo se deduce lo que la evidencia sostiene: una orden con renglones de texto libre no puede declararse «toda de combustible». Nula significa sin clasificar.';

create or replace function public.gastos_del_periodo(
  p_desde     date default null,
  p_hasta     date default null,
  p_categoria text default null,
  p_limite    integer default 300
)
returns table (
  id                    bigint,
  numero                text,
  fecha                 date,
  concepto              text,
  contraparte           text,
  tipo                  text,
  monto_usd             numeric,
  categoria             text,
  categoria_nombre      text,
  categoria_raiz        text,
  categoria_raiz_nombre text
)
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_permiso('COMPRAS', 'LECTURA');

  return query
  select g.id, g.numero, g.fecha, g.concepto, g.contraparte, g.tipo,
         g.monto_usd, g.categoria, g.categoria_nombre,
         g.categoria_raiz, g.categoria_raiz_nombre
    from public.v_gastos g
   where (p_desde is null or g.fecha >= p_desde)
     and (p_hasta is null or g.fecha <= p_hasta)
     and (p_categoria is null or g.categoria_raiz = p_categoria)
   order by g.fecha desc, g.id desc
   limit coalesce(p_limite, 300);
end;
$func$;

comment on function public.gastos_del_periodo(date, date, text, integer) is
  'El detalle de gastos del centro de costos. Existe porque la vista es security_invoker sobre un libro que exige TESORERIA:LECTURA, y esta pantalla vive en Compras.';

revoke all on function public.gastos_del_periodo(date, date, text, integer) from public;
revoke all on function public.gastos_del_periodo(date, date, text, integer) from anon;
grant execute on function public.gastos_del_periodo(date, date, text, integer) to authenticated;

alter publication supabase_realtime add table public.presupuestos;
