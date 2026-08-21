import { useState } from 'react'
import { Paperclip, Trash2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Select } from '@/components/ui/Select'
import { Visor } from '@/components/Visor'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  TIPOS_DE_PAPEL,
  enlaceDelPapel,
  useAdjuntarPapel,
  usePapelesDeCompra,
  useQuitarPapel,
  type TipoDePapel,
} from '@/lib/api/papelesDeCompra'
import { fechaHora } from '@/lib/formato'

/*
  LOS PAPELES QUE LLEGARON CON LA COMPRA

  Christopher: «al registrar una compra, se pueda cargar el comprobante de
  pago, nota de entrega o factura que haya recibido la empresa o persona, ya
  sea una imagen o un pdf», y después: «es el que recibe, que con el tiempo se
  daña, por eso una imagen en la base tiene importancia».

  Son papeles de fuera. El de dentro —la orden, el comprobante que emite la
  empresa— lo imprime el sistema cuando haga falta y no hay nada que guardar.

  Cuelgan de la orden y no de la factura porque llegan en momentos distintos y
  de manos distintas: tesorería paga, almacén recibe, compras archiva. La orden
  es el único documento presente en los tres momentos.
*/

const NOMBRE_DEL_TIPO = Object.fromEntries(
  TIPOS_DE_PAPEL.map((t) => [t.valor, t.etiqueta]),
) as Record<string, string>

export function PapelesDeCompra({
  ordenId,
  puedeCargar,
  puedeQuitar,
}: {
  ordenId: number
  puedeCargar: boolean
  puedeQuitar: boolean
}) {
  const { data: papeles } = usePapelesDeCompra(ordenId)
  const adjuntar = useAdjuntarPapel()
  const quitar = useQuitarPapel()

  const [tipo, setTipo] = useState<TipoDePapel>('COMPROBANTE_PAGO')
  const [viendo, setViendo] = useState<{ href: string; nombre: string } | null>(null)
  const [abriendo, setAbriendo] = useState<number | null>(null)

  const queDice = TIPOS_DE_PAPEL.find((t) => t.valor === tipo)?.dice ?? ''

  return (
    <Card>
      <CardHeader
        title="Papeles recibidos"
        subtitle="Lo que entregó el proveedor: el comprobante del pago, la nota de entrega, la factura. Con los años el papel se pierde; esta copia no."
      />

      {(papeles ?? []).length > 0 ? (
        <ul className="mt-4 space-y-2">
          {(papeles ?? []).map((p) => (
            <li
              key={p.id}
              className="border-hairline flex flex-wrap items-center gap-2 rounded-[6px] border px-3 py-2"
            >
              <Chip tone="neutral">{NOMBRE_DEL_TIPO[p.tipo] ?? p.tipo}</Chip>

              <span className="text-ink/75 min-w-0 flex-1 truncate text-sm">
                {p.archivo_nombre}
              </span>

              <span className="text-ink/40 hidden text-xs sm:inline">
                {fechaHora(p.subido_en)}
              </span>

              <Button
                size="sm"
                variant="outline"
                icon={<Paperclip />}
                disabled={abriendo === p.id}
                onClick={async () => {
                  setAbriendo(p.id)
                  try {
                    const href = await enlaceDelPapel(p.archivo_path)
                    setViendo({ href, nombre: p.archivo_nombre })
                  } finally {
                    setAbriendo(null)
                  }
                }}
              >
                {abriendo === p.id ? 'Abriendo…' : 'Ver'}
              </Button>

              {puedeQuitar ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  icon={<Trash2 />}
                  disabled={quitar.isPending}
                  onClick={() => void quitar.mutateAsync({ id: p.id })}
                >
                  Quitar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink/50 mt-4 text-sm">
          Todavía no se ha guardado ningún papel de esta compra.
        </p>
      )}

      {puedeCargar ? (
        <div className="border-hairline mt-4 border-t pt-4">
          {/*
            Se elige QUÉ es antes de elegir el archivo.

            Al revés, el navegador abre el explorador de archivos de inmediato
            y quien vuelve con el papel cargado ya no se acuerda de decir qué
            era. Un montón de adjuntos sin nombrar es un montón que hay que
            abrir uno por uno.
          */}
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="¿Qué papel es?"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDePapel)}
              className="min-w-[220px] flex-1"
              opciones={TIPOS_DE_PAPEL.map((t) => ({
                valor: t.valor,
                etiqueta: t.etiqueta,
              }))}
            />

            <label className="border-ink/20 hover:border-ink/32 text-ink/75 flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-sm transition-colors">
              <Paperclip className="size-4" />
              {adjuntar.isPending ? 'Guardando…' : 'Elegir el archivo'}
              <input
                type="file"
                className="hidden"
                accept="application/pdf,image/*"
                disabled={adjuntar.isPending}
                onChange={(e) => {
                  const archivo = e.target.files?.[0]
                  // El campo se limpia para que volver a elegir el mismo
                  // archivo tras un fallo dispare el `change` otra vez.
                  e.target.value = ''
                  if (archivo) void adjuntar.mutateAsync({ orden_id: ordenId, tipo, archivo })
                }}
              />
            </label>
          </div>

          <p className="text-ink/45 mt-2 text-xs">{queDice} PDF o foto, hasta 10 MB.</p>
        </div>
      ) : null}

      {adjuntar.error ? <ErrorDeCarga error={adjuntar.error} className="mt-3" /> : null}
      {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}

      <Visor
        abierto={viendo !== null}
        onCerrar={() => setViendo(null)}
        href={viendo?.href}
        nombreArchivo={viendo?.nombre ?? 'papel'}
        titulo="Papel recibido"
      />
    </Card>
  )
}
