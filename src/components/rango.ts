/*
  EL RANGO DE FECHAS, APARTE DEL COMPONENTE

  Un archivo que exporta un componente y además una constante rompe la recarga
  en caliente de Vite: al tocarlo, la página entera se recarga en vez de
  refrescar solo lo que cambió. Ya obligó a separar los catálogos de pestañas.
*/

export interface Rango {
  desde: string
  hasta: string
}

export const SIN_RANGO: Rango = { desde: '', hasta: '' }
