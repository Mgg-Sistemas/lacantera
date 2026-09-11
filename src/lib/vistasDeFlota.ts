/*
  LAS TRES MANERAS DE MIRAR LA FLOTA.

  Viven aparte del archivo que las dibuja por un motivo mecánico, el mismo de
  `pestanasDeModulos`: un archivo que exporta componentes y además constantes
  rompe el refresco en caliente de Vite.

  Qué contesta cada una está escrito junto a su componente, en `VistasDeLaFlota`.
*/
export type VistaDeFlota = 'ficha' | 'lista' | 'patio'

export const VISTAS: { valor: VistaDeFlota; etiqueta: string; pista: string }[] = [
  { valor: 'ficha', etiqueta: 'Fichas', pista: 'Cada equipo con su detalle y sus botones' },
  { valor: 'lista', etiqueta: 'Lista', pista: 'Una línea por máquina, la flota de un vistazo' },
  { valor: 'patio', etiqueta: 'Patio', pista: 'Solo el código y cómo está, todo en una pantalla' },
]
