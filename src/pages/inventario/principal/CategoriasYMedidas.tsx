import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { useArticulos, useUnidades } from '@/lib/api/catalogo'
import { enteros } from '@/lib/formato'
import { GestionDeCategorias } from '../Articulos'

/*
  ⚙ «CATEGORÍAS Y MEDIDAS DE INVENTARIO» (fase 4 de «Almacén e Inventario como
  MGG», 08/11/2026). La forma de `GestionarCategoriasModal.tsx` de MGG: dos
  modos, «Categorías» y «Medidas».

  - Categorías: la ventana de siempre del catálogo (`GestionDeCategorias`):
    crear con su prefijo, marcar cocina y eliminar la que nadie usa. Renombrar
    en cascada, como MGG, aquí no se hace: el código de cada artículo lleva el
    prefijo de su categoría y ya está impreso en órdenes y notas.
  - Medidas: las unidades con cuántos productos las usan. Aquí no se crean ni
    se renombran desde la pantalla: son las mismas en compras, ventas,
    combustible y despachos, y la base convierte entre ellas.
*/
export function CategoriasYMedidas({ onCerrar }: { onCerrar: () => void }) {
  const [modo, setModo] = useState('categorias')
  const { data: unidades } = useUnidades()
  const { data: articulos } = useArticulos(false)

  const usos = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of articulos ?? []) if (a.activo) m.set(a.unidad, (m.get(a.unidad) ?? 0) + 1)
    return m
  }, [articulos])

  return (
    <Modal
      abierto
      ancho="lg"
      onCerrar={onCerrar}
      titulo="Categorías y medidas de inventario"
      acciones={<Button onClick={onCerrar}>Listo</Button>}
    >
      <Segmento
        opciones={[
          { valor: 'categorias', etiqueta: 'Categorías' },
          { valor: 'medidas', etiqueta: 'Medidas' },
        ]}
        valor={modo}
        onCambio={setModo}
        className="mb-4"
      />

      {modo === 'categorias' ? (
        <GestionDeCategorias />
      ) : (
        <div className="space-y-3">
          <ul className="divide-hairline border-hairline rounded-card divide-y border">
            {(unidades ?? []).map((u) => (
              <li key={u.codigo} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-ink/85 text-sm">{u.nombre}</p>
                  <p className="text-ink/40 font-mono text-xs">{u.codigo}</p>
                </div>
                <span className="text-ink/55 text-xs">
                  {enteros(usos.get(u.codigo) ?? 0)} producto{(usos.get(u.codigo) ?? 0) === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink/45 text-xs">
            Las medidas son las mismas en compras, ventas, combustible y despachos, y la base convierte entre ellas: se
            mantienen desde Sistemas, no desde aquí.
          </p>
        </div>
      )}
    </Modal>
  )
}
