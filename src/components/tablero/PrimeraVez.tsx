import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

/*
  LA EXPLICACIÓN PARA QUIEN ENTRA POR PRIMERA VEZ.

  Va al final de cada tablero y no arriba: quien ya sabe no tiene que
  saltársela cada mañana, y quien no sabe la encuentra al terminar de mirar.

  VIVÍA DENTRO DE `GrupoAcciones.tsx` y sale de ahí el 24/09/2026. La usan los
  ocho tableros y aquel componente solo cuatro, así que la mitad tenía que
  importarla de un archivo que no usaba para nada más.

  Y salió porque estaba copiada. El tablero de inventario tenía el bloque
  escrito a mano —mismo título, mismo comentario explicando por qué va al
  final, mismo estilo— sin usar el componente. Es la quinta pieza de esta
  remodelación que aparece escrita dos veces; la tarjeta de acción lo estaba
  tres. Cuando algo se copia tantas veces no es descuido de nadie: es que
  compartirlo costaba más de encontrar que volver a escribirlo.

  QUÉ SE ESCRIBE AQUÍ, Y QUÉ NO. Lo que hace falta saber para que el módulo se
  entienda, no lo que hace cada pantalla —eso lo dicen las tarjetas—. Sirve
  bien para deshacer un malentendido: que despachar en ventas no es lo mismo
  que despachar en la romana, que la existencia no se escribe sino que se
  deduce, que un rol es un lote de permisos con nombre.
*/
export function PrimeraVez({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn(className)}>
      <p className="text-ink/40 text-2xs font-mono tracking-[0.18em] uppercase">
        Si es la primera vez
      </p>
      <div className="text-ink/75 mt-3 space-y-2 text-sm leading-relaxed">{children}</div>
    </Card>
  )
}
