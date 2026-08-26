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
  NOMBRE_DE_PAPEL,
  useRespaldarAutorizacion,
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

export function PapelesDeCompra({
  ordenId,
  puedeCargar,
  puedeQuitar,
  puedeRespaldar = false,
}: {
  ordenId: number
  puedeCargar: boolean
  puedeQuitar: boolean
  /**
   * Quien puede aprobar puede subir el respaldo de la autorización, aunque no
   * sea de compras ni de almacén. Va por otra puerta en la base, pero por el
   * mismo sitio en la pantalla: quien busca dónde subir un papel de la orden
   * busca aquí, no en otra tarjeta.
   */
  puedeRespaldar?: boolean
}) {
  const { data: papeles } = usePapelesDeCompra(ordenId)
  const adjuntar = useAdjuntarPapel()
  const respaldar = useRespaldarAutorizacion()
  const quitar = useQuitarPapel()

  const [tipo, setTipo] = useState<TipoDePapel>('COMPROBANTE_PAGO')
  const [viendo, setViendo] = useState<{ href: string; nombre: string } | null>(null)
  const [abriendo, setAbriendo] = useState<number | null>(null)

  /*
    El respaldo de la autorización solo aparece en la lista si quien mira puede
    aprobar. A los demás no se les ofrece porque la base se lo va a rechazar, y
    una opción que siempre falla es peor que no tenerla.
  */
  const ofrecidos = [
    ...(puedeCargar ? TIPOS_DE_PAPEL : []),
    ...(puedeRespaldar
      ? [
          {
            valor: 'AUTORIZACION' as TipoDePapel,
            etiqueta: NOMBRE_DE_PAPEL.AUTORIZACION,
            dice: 'La captura de WhatsApp, el correo o el PDF donde el gerente autorizó esta compra.',
          },
        ]
      : []),
  ]

  /*
    El tipo elegido, pero solo si sigue estando ofrecido.

    Quien unicamente puede subir el respaldo de la autorizacion no tiene
    «Comprobante de pago» en su lista, y ese es el valor con el que arranca el
    estado: el desplegable salia en blanco y el archivo se iba por la puerta
    equivocada. Se cae al primero que si se le ofrece.
  */
  const elegido = ofrecidos.some((t) => t.valor === tipo) ? tipo : (ofrecidos[0]?.valor ?? 'OTRO')

  const subiendo = adjuntar.isPending || respaldar.isPending
  const queDice = ofrecidos.find((t) => t.valor === elegido)?.dice ?? ''

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
              <Chip tone="neutral">{NOMBRE_DE_PAPEL[p.tipo] ?? p.tipo}</Chip>

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

      {ofrecidos.length > 0 ? (
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
              value={elegido}
              onChange={(e) => setTipo(e.target.value as TipoDePapel)}
              className="min-w-[220px] flex-1"
              opciones={ofrecidos.map((t) => ({
                valor: t.valor,
                etiqueta: t.etiqueta,
              }))}
            />

            <label className="border-ink/20 hover:border-ink/32 text-ink/75 flex cursor-pointer items-center gap-2 rounded-[6px] border px-3 py-2 text-sm transition-colors">
              <Paperclip className="size-4" />
              {subiendo ? 'Guardando…' : 'Elegir el archivo'}
              <input
                type="file"
                className="hidden"
                accept="application/pdf,image/*"
                disabled={subiendo}
                onChange={(e) => {
                  const archivo = e.target.files?.[0]
                  // El campo se limpia para que volver a elegir el mismo
                  // archivo tras un fallo dispare el `change` otra vez.
                  e.target.value = ''
                  if (!archivo) return
                  // Dos puertas distintas en la base: el respaldo lo sube quien
                  // puede aprobar, los demás papeles quien los tiene en la mano.
                  if (elegido === 'AUTORIZACION') {
                    void respaldar.mutateAsync({ orden_id: ordenId, archivo })
                  } else {
                    void adjuntar.mutateAsync({ orden_id: ordenId, tipo: elegido, archivo })
                  }
                }}
              />
            </label>
          </div>

          <p className="text-ink/45 mt-2 text-xs">{queDice} PDF o foto, hasta 10 MB.</p>
        </div>
      ) : null}

      {adjuntar.error ? <ErrorDeCarga error={adjuntar.error} className="mt-3" /> : null}
      {respaldar.error ? <ErrorDeCarga error={respaldar.error} className="mt-3" /> : null}
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
