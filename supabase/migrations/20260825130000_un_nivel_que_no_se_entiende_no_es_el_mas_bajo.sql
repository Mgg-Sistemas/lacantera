-- ---------------------------------------------------------------------------
-- Un nivel que no se entiende no es el más bajo: es ninguno
--
-- `private.rango_nivel` traduce el escalón a un número para poder compararlo:
-- TOTAL 3, ESCRITURA 2, LECTURA 1, y CUALQUIER OTRA COSA cero — incluido el
-- nulo, y también un «ESCRITUAR» mal escrito.
--
-- Cero es el mismo número que NINGUNO. Y ahí está el problema, porque el número
-- se usa a los dos lados de la comparación:
--
--   rango_nivel(lo_que_tienes) >= rango_nivel(lo_que_hace_falta)
--
-- A la IZQUIERDA, cero significa «no tienes nada» y está bien. A la DERECHA
-- significa «no hace falta nada», o sea que pasa cualquiera. La misma función
-- devuelve lo correcto en un lado y lo contrario en el otro.
--
-- Ya se cobró una: `puede_accion` comparaba contra un `nivel_equivalente` nulo
-- —que quería decir «ningún escalón abre esto»— y acababa abriéndoselo a las
-- doce cuentas activas. Está contado en la migración que lo corrigió.
--
-- Hoy no hay más sitios alcanzables: el navegador resuelve los niveles en
-- memoria desde `mis_permisos` y no manda nulos, y las llamadas a
-- `tiene_permiso` desde SQL pasan el nivel escrito a mano. Pero la trampa está
-- puesta y la siguiente llamada que reciba un nulo se la encuentra.
--
-- Devolver NULO para lo que no se entiende la desactiva sola: una comparación
-- contra nulo da nulo, que no es cierto, así que la puerta queda CERRADA. Que
-- es lo que hay que hacer cuando no se entiende la pregunta.
--
-- NINGUNO sigue siendo cero, que es lo correcto: es un nivel válido y significa
-- exactamente eso.
--
-- COMPROBADO:
--
--   TOTAL=3  ESCRITURA=2  LECTURA=1  NINGUNO=0  nulo=NULO  inventado=NULO
--   tiene_permiso('COMPRAS', null) para un SOLICITANTE: false (antes, true)
--   0 diferencias en 24 comprobaciones de lo que ya funcionaba
-- ---------------------------------------------------------------------------

create or replace function private.rango_nivel(p_nivel text)
returns smallint
language sql
immutable
as $func$
  select case p_nivel
           when 'TOTAL'     then 3
           when 'ESCRITURA' then 2
           when 'LECTURA'   then 1
           when 'NINGUNO'   then 0
           -- Nulo, o cualquier cosa que no sea uno de los cuatro. Antes caía en
           -- cero y eso, del lado derecho de una comparación, abre la puerta a
           -- todo el mundo. Nulo la cierra.
           else null
         end::smallint;
$func$;

comment on function private.rango_nivel(text) is
  'El escalón como número, para compararlo. NINGUNO es cero; lo que no se entiende —un nulo, una palabra mal escrita— es NULO y no cero, porque cero a la derecha de la comparación significa «no hace falta nada» y deja pasar a cualquiera.';
