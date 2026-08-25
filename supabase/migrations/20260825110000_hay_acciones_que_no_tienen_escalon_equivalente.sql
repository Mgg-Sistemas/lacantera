-- ---------------------------------------------------------------------------
-- Hay acciones que no tienen escalón equivalente, y decirlo evita regalar poder
--
-- El escalón equivalente existe para que los roles de siempre sigan
-- funcionando: la acción declara «esto lo cubría CONFIGURACION:ESCRITURA» y
-- quien tenía ese nivel la conserva. Funciona para las 65 funciones que se
-- rejaban por nivel.
--
-- Para las otras 60 NO funciona, y comprobarlo antes de migrarlas salvó tres
-- ascensos silenciosos. `guardar_empresa` exige hoy el ROL ADMIN o
-- GERENTE_GENERAL, y ningún nivel de módulo la abre. Si se le pone
-- CONFIGURACION:TOTAL como equivalente, la ganan de golpe:
--
--   leni12, susi, prueba.supervisor    <- hoy NO pueden cambiar el RIF
--
-- Tres personas más pudiendo cambiar la razón social y el RIF de la empresa
-- —lo que sale impreso en cada factura— por una migración que no debía cambiar
-- nada. Eso no es un detalle: es el tipo de cosa que nadie descubre hasta que
-- alguien la usa.
--
-- Así que el escalón equivalente pasa a ser OPCIONAL. Nulo significa: esta
-- acción no la abre ningún nivel. Solo la marca explícita, o ADMIN.
--
-- Y para las que vienen de un rol literal se siembra la marca en el rol que hoy
-- las tiene, de modo que después de esto todo el mundo puede exactamente lo
-- mismo que antes. ADMIN no hace falta sembrarlo: pasa siempre.
--
-- COMPROBADO, persona por persona, comparando con quién podía antes:
--
--   corregir los datos de la empresa .... 0 diferencias (5 cuentas)
--   ver los documentos legales .......... 0 diferencias (9 cuentas)
--   fijar tributos ...................... 0 diferencias con su escalón
-- ---------------------------------------------------------------------------

alter table public.acciones alter column nivel_equivalente drop not null;

comment on column public.acciones.nivel_equivalente is
  'El escalón de rol_permisos que cubría esta acción antes, para que los roles de siempre no pierdan nada. NULO cuando ningún nivel la abría —las que se rejaban por rol literal—: esas solo se tienen marcándolas, o siendo ADMIN. Ponerles un escalón regalaría el poder a quien tuviera ese nivel por otra razón.';

update public.acciones set nivel_equivalente = null
 where codigo in (
   'CONFIGURACION.EDITAR_EMPRESA',    -- guardar_empresa: rol ADMIN o GERENTE_GENERAL
   'CONFIGURACION.CARGAR_DOCUMENTO',  -- registrar_documento_legal: idem
   'CONFIGURACION.EDITAR_DOCUMENTO',  -- actualizar_documento_legal: idem
   'CONFIGURACION.QUITAR_DOCUMENTO',  -- eliminar_documento_legal: idem
   'CONFIGURACION.VER_DOCUMENTOS'     -- RLS: ADMIN, GERENTE_GENERAL, TESORERIA, RRHH
 );

-- Quien las tiene hoy, marcadas. Así nadie pierde nada al migrar las funciones.
insert into public.rol_acciones (rol, accion)
select r.codigo, a.codigo
  from (values ('GERENTE_GENERAL')) as r(codigo)
 cross join (values ('CONFIGURACION.EDITAR_EMPRESA'),
                    ('CONFIGURACION.CARGAR_DOCUMENTO'),
                    ('CONFIGURACION.EDITAR_DOCUMENTO'),
                    ('CONFIGURACION.QUITAR_DOCUMENTO'),
                    ('CONFIGURACION.VER_DOCUMENTOS')) as a(codigo)
on conflict do nothing;

-- Y los documentos los ven además tesorería y recursos humanos, por la RLS.
insert into public.rol_acciones (rol, accion)
select r.codigo, 'CONFIGURACION.VER_DOCUMENTOS'
  from (values ('TESORERIA'), ('RRHH')) as r(codigo)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- La primera función que pasa a la puerta nueva
--
-- `fijar_tributos` es la única de Configuración que ya se rejaba por nivel
-- —CONFIGURACION:ESCRITURA—, así que migrarla no mueve a nadie: la acción
-- declara ese mismo escalón como equivalente.
--
-- Las otras cuatro esperan a que exista la pantalla de marcar casillas. Migrar
-- una reja de rol literal sin poder marcar la casilla desde ninguna parte
-- dejaría el rol a la medida sin forma de recuperarla.
-- ---------------------------------------------------------------------------
create or replace function public.fijar_tributos(
  p_aplica_iva boolean,
  p_aplica_igtf boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $func$
begin
  perform private.exigir_accion('CONFIGURACION.FIJAR_TRIBUTOS');

  update public.empresa
     set aplica_iva  = coalesce(p_aplica_iva, aplica_iva),
         aplica_igtf = coalesce(p_aplica_igtf, aplica_igtf);
end;
$func$;

comment on function public.fijar_tributos(boolean, boolean) is
  'Enciende o apaga el IVA y el IGTF para todo el sistema. Primera funcion que pasa a la puerta de acciones: pide CONFIGURACION.FIJAR_TRIBUTOS, que declara ESCRITURA como escalon equivalente y por eso no mueve a nadie de sitio.';

revoke all on function public.fijar_tributos(boolean, boolean) from public, anon;
grant execute on function public.fijar_tributos(boolean, boolean) to authenticated;
