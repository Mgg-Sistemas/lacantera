/*
  LAS DOS PLANTAS Y LA BASE TIENEN DÓNDE CAER.

  Christopher, el 12/09/2026, sobre lo que produce cada sitio:

    «Coraza no pasa por planta, se traslada desde exploración hasta base.
     Gavión, filtro y cernida: planta fija.
     Arrocillo, piedra, arena lavada y polvo de piedra: planta de lavado.»

  Hasta hoy el sistema solo tenía UN patio —«PATIO DE MATERIA PRIMA»—, que es
  donde cae lo que baja de la mina sin clasificar. No tenía dónde poner lo que
  sale de cada planta, y por eso el parte de producción no se podía usar
  aunque estuviera construido: no había destino.

  ═══════════════════════════════════════════════════════════════════════════
  TRES SITIOS, PORQUE SON TRES COSAS DISTINTAS
  ═══════════════════════════════════════════════════════════════════════════

  · PAT-MP    lo que baja de la mina, sin clasificar. Ya existía.
  · PAT-PF    lo que sale de la planta fija: gavión, filtro, cernida.
  · PAT-LAV   lo que sale de la planta de lavado: arrocillo, piedra, arena
              lavada, polvo de piedra.
  · PAT-BASE  la base. La coraza no pasa por ninguna planta: sale de
              exploración ya terminada y se traslada directo aquí.

  Separarlos no es burocracia: es lo que permite preguntar «cuánto rindió la
  planta fija esta semana», que es toneladas que salieron de PAT-PF sobre
  toneladas que entraron de PAT-MP. Con un patio único esa división no se
  puede hacer, porque la materia prima y el producto estarían revueltos.

  ═══════════════════════════════════════════════════════════════════════════
  LOS OCHO AGREGADOS NO SE SIEMBRAN AQUÍ, Y ESO ES UNA DECISIÓN SUYA
  ═══════════════════════════════════════════════════════════════════════════

  La tentación era meter también los ocho productos con su precio. No se hace,
  y el motivo está escrito en la migración del 21 de agosto que vació el
  catálogo:

    «El catálogo sembrado. Sale por decisión de Christopher: el real entra
     después por planilla, con `cargar_articulos_por_lote`.»

  Esa regla sigue siendo buena por dos razones. Una: los precios cambian, y un
  precio dentro de una migración es un precio que nadie sabe dónde actualizar.
  Dos: este repositorio es público, y la lista de precios de la empresa no
  tiene por qué vivir en él.

  Los sitios sí van aquí porque son estructura —el mapa de la cantera, que no
  cambia cada mes— y porque ya hay precedente: PAT-MP y el tanque de
  combustible se crearon exactamente así.
*/

insert into public.almacenes (codigo, nombre, tipo, ubicacion, recibe_compras, activo) values
  ('PAT-PF',   'PATIO DE PLANTA FIJA',      'PATIO', 'Planta fija',     false, true),
  ('PAT-LAV',  'PATIO DE PLANTA DE LAVADO', 'PATIO', 'Planta de lavado', false, true),
  ('PAT-BASE', 'BASE',                      'PATIO', 'Base',            false, true)
on conflict (codigo) do update
  set nombre = excluded.nombre,
      tipo   = excluded.tipo;

comment on table public.almacenes is
  'Donde se guarda algo. Los de tipo PATIO son los de la cantera: PAT-MP la '
  'materia prima que baja de la mina, PAT-PF y PAT-LAV lo que sale de cada '
  'planta, y PAT-BASE la coraza, que no pasa por planta.';
