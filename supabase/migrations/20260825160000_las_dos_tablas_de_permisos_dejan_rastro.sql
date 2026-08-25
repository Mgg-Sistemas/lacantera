-- ---------------------------------------------------------------------------
-- Las dos tablas de permisos dejan rastro, y fuera las firmas viejas
--
-- Las dos las cazó el carril de base en su barrido del 25/08. Las dos son
-- reglas de la casa rotas por mí al montar el sistema de acciones.
--
-- =========================================================================
-- 1. LA REGLA 5, ROTA: `acciones` Y `rol_acciones` NACIERON SIN AUDITORÍA
-- =========================================================================
--
-- Toda tabla nueva necesita `trg_auditar`, y yo creé las dos sin él. De las
-- once tablas del sistema que no dejan rastro, `rol_acciones` es con diferencia
-- la que más falta hace: **es la tabla que dice quién puede hacer qué**. Marcar
-- o desmarcar una casilla de permisos no dejaba ninguna huella — ni quién, ni
-- cuándo, ni qué había antes.
--
-- Y llega justo cuando importa: el sistema empieza a usarse de verdad esta
-- semana, y la primera pregunta que se hace cuando algo sale mal es quién tenía
-- permiso para hacerlo.
--
-- `trg_normalizar` NO va, y es a propósito, no un olvido. `normalizar_texto`
-- pasa a mayúscula lo que toca; en un código eso está bien, pero `nombre` y
-- `dice` son las frases que lee en pantalla quien arma un rol. «LA VOLADURA
-- QUEDA MARCADA COMO ANULADA» es ilegible, y de paso perdería los acentos.
-- `codigo` y `modulo` ya nacen en mayúscula por convención. Queda escrito para
-- que el próximo barrido no lo cuente como hueco.
--
-- =========================================================================
-- 2. LA REGLA 7, EN DIRECTO: CUATRO FUNCIONES DONDE DEBÍA HABER DOS
-- =========================================================================
--
-- `create or replace` con un parámetro nuevo deja las DOS funciones vivas. Al
-- darle a los roles la bandera `a_la_medida` quedaron:
--
--   crear_rol(text,text,text)             <- vieja. NO toca a_la_medida
--   crear_rol(text,text,text,boolean)     <- la buena
--   guardar_rol(text,text,text)           <- vieja. NO toca a_la_medida
--   guardar_rol(text,text,text,boolean)   <- la buena
--
-- Hoy no rompe nada: el front manda los cuatro argumentos con nombre y
-- PostgREST resuelve por nombre. El problema es el día que alguien llame con
-- tres: corre la vieja, que no escribe `a_la_medida`, y esa bandera decide si
-- el rol se rige por casillas o por escalón. Equivocarla cambia lo que el rol
-- puede hacer, en silencio y sin error.
-- ---------------------------------------------------------------------------

create trigger trg_auditar
  after insert or delete or update on public.acciones
  for each row execute function private.auditar('codigo');

create trigger trg_auditar
  after insert or delete or update on public.rol_acciones
  for each row execute function private.auditar('rol', 'accion');

comment on table public.rol_acciones is
  'Las casillas marcadas de cada rol. Solo mandan en los roles detallados; en los de escalon se guardan pero no deciden. Lleva trg_auditar pero no trg_normalizar: no hay columna de texto que normalizar, y las de acciones son prosa que se lee en pantalla.';

drop function if exists public.crear_rol(text, text, text);
drop function if exists public.guardar_rol(text, text, text);
