import { useState } from 'react'
import { Plus, Power, Star } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  useCambiarEstadoPresentacion,
  useGuardarPresentacionDeArticulo,
  usePresentaciones,
  usePresentacionesDeArticulo,
} from '@/lib/api/catalogo'
import { cn } from '@/lib/cn'

/*
  DE CUÁNTAS FORMAS SE PUEDE CONTAR ESTE ARTÍCULO.

  Christopher, el 7 de septiembre: «puede existir la posibilidad de que la
  presentación de un producto varíe a pesar de su unidad de operación». Aceite
  en tambor y en galón; tuercas en pack de 6, de 12, par y unidad.

  LA REGLA QUE LO SOSTIENE TODO: un artículo tiene UNA unidad de operación y UNA
  existencia. Estas son maneras de contar, no maneras de almacenar. El aceite en
  tambor y en bidón es el mismo aceite y el mismo número de litros — y por eso
  se puede preguntar «cuánto aceite SAE 50 hay» y que haya una respuesta.

  Se descartó la alternativa de crear «ACEITE (TAMBOR)» y «ACEITE (GALÓN)» como
  dos artículos precisamente por eso: parte la existencia, parte el costo
  promedio, parte el mínimo de stock, y los informes cuentan dos cosas donde hay
  una.

  POR QUÉ APARECE SOLO AL CORREGIR Y NO AL CREAR

  Una presentación cuelga de un artículo, y mientras el artículo no existe no
  hay de dónde colgarla. Al crear se declara la primera con los dos campos de
  arriba —cómo llega y cuántas trae— y desde aquí se añaden las demás.
*/

interface Props {
  articuloId: number
  unidad: string
  className?: string
}

export function OtrasPresentaciones({ articuloId, unidad, className }: Props) {
  const { data: catalogo } = usePresentaciones()
  const { data: suyas, isPending } = usePresentacionesDeArticulo(articuloId)
  const guardar = useGuardarPresentacionDeArticulo()
  const cambiarEstado = useCambiarEstadoPresentacion()

  const [nombre, setNombre] = useState('')
  const [cuantas, setCuantas] = useState('')

  const lista = suyas ?? []
  const yaEstan = new Set(lista.map((p) => p.presentacion))
  const cuantasNum = Number(cuantas)
  const listo = Boolean(nombre) && Number.isFinite(cuantasNum) && cuantasNum > 0

  const anadir = async () => {
    await guardar.mutateAsync({
      articulo_id: articuloId,
      presentacion: nombre,
      unidades: cuantasNum,
      // La primera manda; las siguientes se añaden sin quitarle el sitio a la
      // que ya se estaba usando.
      por_defecto: lista.filter((p) => p.activa).length === 0,
    })
    setNombre('')
    setCuantas('')
  }

  return (
    <div className={cn('border-hairline rounded-card border border-dashed p-3', className)}>
      <p className="text-ink/75 text-sm font-medium">Otras formas de contarlo</p>
      <p className="text-ink/50 mt-0.5 text-xs">
        El mismo material puede llegar de varias maneras. Sigue habiendo una sola existencia, en{' '}
        {unidad || 'su unidad'}.
      </p>

      {isPending ? null : lista.length === 0 ? (
        <p className="text-ink/45 mt-3 text-xs">
          Solo se cuenta en {unidad || 'su unidad'}. Añade una forma si llega en bultos.
        </p>
      ) : (
        <ul className="divide-hairline mt-3 divide-y">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <span
                className={cn(
                  'text-sm font-medium',
                  p.activa ? 'text-ink/85' : 'text-ink/40 line-through',
                )}
              >
                {p.presentacion}
              </span>
              <span className="text-ink/50 tabular text-xs">
                = {Number(p.unidades).toLocaleString('es-VE', { maximumFractionDigits: 4 })}{' '}
                {unidad}
              </span>

              {p.por_defecto ? (
                <span className="text-royal-600 dark:text-royal-300 text-2xs inline-flex items-center gap-1">
                  <Star className="size-3" /> la que se propone
                </span>
              ) : p.activa ? (
                <button
                  type="button"
                  className="text-ink/45 hover:text-ink/80 text-2xs underline underline-offset-2"
                  onClick={() =>
                    void guardar.mutateAsync({
                      articulo_id: articuloId,
                      presentacion: p.presentacion,
                      unidades: Number(p.unidades),
                      por_defecto: true,
                    })
                  }
                >
                  proponer esta
                </button>
              ) : null}

              {/*
                SE APAGAN, NO SE BORRAN. Un proveedor deja de vender en galones y
                la presentación se apaga; los movimientos viejos siguen legibles
                porque el asiento guarda el nombre que se usó, no un puntero a
                esta fila.
              */}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                icon={<Power />}
                onClick={() =>
                  void cambiarEstado.mutateAsync({ id: p.id, activa: !p.activa })
                }
              >
                {p.activa ? 'Apagar' : 'Encender'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <Select
          label="Cómo llega"
          vacio="Elige"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          opciones={(catalogo ?? [])
            // La que ya está declarada no se ofrece otra vez: para cambiarle el
            // factor se corrige la de arriba, no se añade una segunda.
            .filter((c) => !yaEstan.has(c.codigo))
            // Ni la que se llama igual que la unidad: «un PAR trae un PAR» no
            // es una forma de contar, y la base lo rechaza.
            .filter((c) => c.codigo !== unidad.toUpperCase())
            .map((c) => ({ valor: c.codigo, etiqueta: c.nombre }))}
        />
        <Input
          label={`Cuántas ${unidad} trae`}
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          disabled={!nombre}
          value={cuantas}
          onChange={(e) => setCuantas(e.target.value)}
        />
        <Button
          variant="ghost"
          icon={<Plus />}
          disabled={!listo || guardar.isPending}
          onClick={() => void anadir()}
        >
          Añadir
        </Button>
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-2" /> : null}
      {cambiarEstado.error ? <ErrorDeCarga error={cambiarEstado.error} className="mt-2" /> : null}
    </div>
  )
}
