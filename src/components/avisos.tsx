import { Boxes, Fuel, HandHelping, Settings, ShoppingCart, Users, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Importancia, Modulo } from '@/lib/api/notificaciones'

/*
  Lo que se sabe de cada módulo al pintarlo, en un solo sitio.

  Estaba repartido entre la campana y no existía en ningún otro lado; ahora lo
  usan la campana y el modal de todas, que tienen que dar el mismo icono al
  mismo aviso o dejan de parecer la misma cosa.

  ICONOS Y NOMBRES SON LOS DEL RIEL, no unos elegidos aquí.

  `src/config/navigation.ts` ya decide con qué cara se enseña cada módulo. Un
  aviso de maquinaria con un icono distinto del que tiene maquinaria en el menú
  obliga a traducir dos veces la misma cosa.

  Y no es una preocupación de estilo: el primer intento puso `Truck` en
  MAQUINARIA, que es el icono de DESPACHOS. La referencia de la base ya avisa de
  esa confusión —`maquinaria.tipo` (EXCAVADORA, CARGADOR, CAMION) no es
  `vehiculos.tipo` (VOLTEO, CHUTO, GANDOLA), son dos catálogos distintos—, y el
  icono la habría repetido en pantalla.
*/
export const ICONO_DE_MODULO: Record<Modulo, LucideIcon> = {
  COMPRAS: ShoppingCart,
  NOMINA: Users,
  MAQUINARIA: Wrench,
  COMBUSTIBLE: Fuel,
  ASIGNACIONES: HandHelping,
  SISTEMA: Settings,
}

export const NOMBRE_DE_MODULO: Record<Modulo, string> = {
  COMPRAS: 'Compras',
  NOMINA: 'Nómina',
  MAQUINARIA: 'Maquinaria',
  COMBUSTIBLE: 'Combustible',
  ASIGNACIONES: 'Asignaciones',
  SISTEMA: 'Sistema',
}

/*
  `modulo` es texto libre en la base, así que puede llegar algo que esta lista
  no conozca. Antes eso daba el engranaje sin decir nada; ahora sigue dando el
  engranaje, pero el nombre se enseña tal cual viene en vez de quedarse en
  blanco: un aviso de un módulo nuevo se lee igual, solo que sin icono propio.
*/
export const iconoDe = (m: Modulo): LucideIcon => ICONO_DE_MODULO[m] ?? Boxes
export const nombreDe = (m: Modulo): string => NOMBRE_DE_MODULO[m] ?? m

export const TONO_DE_IMPORTANCIA: Record<Importancia, string> = {
  INFO: 'bg-royal-600/12 text-royal-700 dark:text-royal-300',
  ATENCION: 'bg-warning/16 text-warning',
  URGENTE: 'bg-danger/12 text-danger',
}
