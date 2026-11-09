import { TanquesView } from './escritorio/TanquesView'

/**
 * El combustible, en la PC (`/app/combustible`).
 *
 * Desde el 10/11/2026 es la pantalla de tanques de Golden Touch
 * (`escritorio/TanquesView.tsx`): banners, tarjetas, el libro de cada tanque y
 * los reportes de la cabecera. Lo que vivía aquí —despachar, cargar, «Consumo
 * por máquina» y «Últimos despachos»— quedó dentro: surtir y cargar son tipos
 * de «+ Nuevo movimiento», el consumo es «📊 Consumo por equipo» y los vales
 * están en el libro de su tanque y en el 📚 Histórico.
 */
export function Combustible() {
  return <TanquesView />
}
