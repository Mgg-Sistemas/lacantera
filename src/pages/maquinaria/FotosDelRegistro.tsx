import { useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { SoltarArchivo } from '@/components/SoltarArchivo'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { FOTOS_MINIMAS } from '@/components/FotosDeLaMaquina'
import {
  useAgregarFotoMaquina,
  useFotosDeMaquina,
  useImagenesDeMaquina,
  useQuitarFotoDeMaquina,
} from '@/lib/api/maquinaria'
import { fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  LAS FOTOS DEL REGISTRO, DONDE SE PUEDEN APRECIAR.

  Christopher, abriendo la ficha de una máquina: «¿dónde está la foto o las
  fotos? En caso de que exista imagen deben ser mínimo dos, y se deben poder
  apreciar».

  El 10/09 se exigió que ninguna máquina naciera sin dos fotos, con el argumento
  de que «el día que se devuelva a su dueño o se discuta un golpe, lo que vale es
  lo que se fotografió al recibirla». La reja funcionó —las seis máquinas que
  cargaron esta mañana tienen sus doce fotos— y la ficha no enseñaba ninguna.
  Solo la foto de perfil, vacía, así que la pantalla decía «Sin foto» encima de un
  registro fotográfico completo.

  Pedir un trabajo cuyo resultado nadie puede mirar es peor que no pedirlo: cuesta
  lo mismo y no sirve para lo único que tenía que servir.

  ═══════════════════════════════════════════════════════════════════════════
  NO ES LA FOTO DE PERFIL, Y POR ESO ES OTRA TARJETA
  ═══════════════════════════════════════════════════════════════════════════

  La de perfil es la cara recortada que se ve en las listas: una, encuadrada,
  para reconocer la máquina de un vistazo. Éstas son el ESTADO en que se recibió:
  varias, sin recortar, y su valor está en verlas enteras.

  Son el retrato del carnet y el álbum. Juntarlas en una tarjeta habría obligado a
  explicar cuál es cuál en cada visita.

  ═══════════════════════════════════════════════════════════════════════════
  «QUE SE PUEDAN APRECIAR» ES LA MITAD DEL PEDIDO
  ═══════════════════════════════════════════════════════════════════════════

  Una rejilla de miniaturas no cumple eso: una raya en la carrocería no se ve en
  un recuadro de cien píxeles. Las miniaturas son el índice y el visor es la
  respuesta — a pantalla casi completa, con flechas para recorrerlas sin cerrar y
  volver a abrir.
*/
export function FotosDelRegistro({
  maquinaId,
  editable,
}: {
  maquinaId: number
  editable: boolean
}) {
  const { data, isPending, error } = useFotosDeMaquina(maquinaId)
  const fotos = data ?? []
  const urls = useImagenesDeMaquina(fotos.map((f) => f.path))

  const agregar = useAgregarFotoMaquina()
  const quitar = useQuitarFotoDeMaquina()

  /* Cuál se está mirando en grande. Nulo es «ninguna». */
  const [mirando, setMirando] = useState<number | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nota, setNota] = useState('')

  const enGrande = mirando !== null ? fotos[mirando] : null

  const mover = (paso: number) => {
    if (mirando === null || fotos.length === 0) return
    setMirando((mirando + paso + fotos.length) % fotos.length)
  }

  return (
    <>
      <Card className="mt-4">
        <CardHeader
          title="Fotos del equipo"
          subtitle="Cómo se recibió. El día que se devuelva a su dueño o se discuta un golpe, esto es lo que vale."
          action={
            editable ? (
              <Button
                size="sm"
                variant="soft"
                icon={<ImagePlus />}
                onClick={() => {
                  setArchivo(null)
                  setNota('')
                  setSubiendo(true)
                }}
              >
                Añadir foto
              </Button>
            ) : null
          }
        />

        {isPending ? <Cargando /> : null}
        {error ? <ErrorDeCarga error={error} /> : null}

        {/*
          Una máquina sin fotos hoy solo puede ser una de antes de la regla. Se
          dice cuál es el caso en vez de dejar un hueco: «no tiene» y «no se ven»
          se distinguen mal en una pantalla.
        */}
        {!isPending && !error && fotos.length === 0 ? (
          <p className="text-ink/45 mt-4 text-sm leading-relaxed">
            Esta máquina se registró antes de que se pidieran las fotos. Desde
            entonces ninguna nace sin al menos {FOTOS_MINIMAS}.
          </p>
        ) : null}

        {fotos.length > 0 ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {fotos.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMirando(i)}
                  className={cn(
                    'border-hairline group relative aspect-4/3 overflow-hidden rounded-lg border',
                    'bg-ink/4 transition-opacity hover:opacity-90',
                    'focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
                  )}
                >
                  {urls[f.path] ? (
                    <img
                      src={urls[f.path]}
                      alt={f.nota ?? `Foto ${i + 1} del equipo`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-ink/30 grid size-full place-items-center text-xs">
                      Cargando…
                    </span>
                  )}

                  {/* El pie solo cuando dice algo. Un rótulo «Foto 1» sobre la
                      foto 1 no informa y tapa la imagen. */}
                  {f.nota ? (
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left text-xs text-white">
                      {f.nota}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            <p className="text-ink/40 mt-3 text-xs">
              {fotos.length} foto{fotos.length === 1 ? '' : 's'} · toca una para verla en grande
            </p>
          </>
        ) : null}
      </Card>

      {/* ------------------------------- El visor ------------------------------- */}
      {enGrande ? (
        <Modal
          abierto
          onCerrar={() => setMirando(null)}
          ancho="lg"
          titulo={enGrande.nota ?? `Foto ${mirando! + 1} de ${fotos.length}`}
          descripcion={`Subida el ${fecha(enGrande.subida_en)}`}
          acciones={
            <>
              {/*
                QUITAR ESTÁ AQUÍ Y NO EN LA MINIATURA. Borrar una foto desde una
                rejilla, con un icono pequeño al lado de otro, es la manera de
                borrar la que no era. Dentro del visor se está mirando
                exactamente la que se va a quitar.
              */}
              {editable && fotos.length > FOTOS_MINIMAS ? (
                <Button
                  variant="ghost"
                  icon={<Trash2 />}
                  disabled={quitar.isPending}
                  onClick={async () => {
                    await quitar.mutateAsync({ id: enGrande.id })
                    setMirando(null)
                  }}
                >
                  Quitar esta
                </Button>
              ) : null}

              {editable && fotos.length <= FOTOS_MINIMAS ? (
                <span className="text-ink/40 mr-auto text-xs">
                  No se puede quitar: quedarían menos de {FOTOS_MINIMAS}.
                </span>
              ) : null}

              <Button variant="outline" onClick={() => setMirando(null)}>
                Cerrar
              </Button>
            </>
          }
        >
          <div className="bg-ink/5 relative overflow-hidden rounded-lg">
            {urls[enGrande.path] ? (
              <img
                src={urls[enGrande.path]}
                alt={enGrande.nota ?? 'Foto del equipo'}
                className="max-h-[65vh] w-full object-contain"
              />
            ) : (
              <div className="grid h-64 place-items-center">
                <Cargando />
              </div>
            )}

            {/* Las flechas solo con más de una. Con una sola no hay a dónde ir y
                dos botones muertos invitan a pulsarlos. */}
            {fotos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => mover(-1)}
                  aria-label="La anterior"
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white transition-colors hover:bg-black/65"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => mover(1)}
                  aria-label="La siguiente"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white transition-colors hover:bg-black/65"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            ) : null}
          </div>

          {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      {/* ------------------------------ Añadir una ------------------------------ */}
      {subiendo ? (
        <Modal
          abierto
          onCerrar={() => setSubiendo(false)}
          titulo="Añadir una foto"
          descripcion="Se suma a las que ya tiene. Las de antes no se tocan: son el estado en que se recibió."
          acciones={
            <>
              <Button variant="outline" onClick={() => setSubiendo(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!archivo || agregar.isPending}
                onClick={async () => {
                  await agregar.mutateAsync({
                    maquina_id: maquinaId,
                    archivo: archivo!,
                    nota: nota.trim() || null,
                  })
                  setSubiendo(false)
                }}
              >
                {agregar.isPending ? 'Subiendo…' : 'Añadir'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            <SoltarArchivo
              valor={archivo}
              onCambio={setArchivo}
              acepta="image/*"
              tope={8 * 1024 * 1024}
              deshabilitado={agregar.isPending}
              pista="Arrastra una imagen o toca para elegirla."
            />
            <Input
              label="Qué se ve"
              placeholder="El golpe del guardafango derecho"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              hint="Opcional, pero dentro de un año esta frase es lo que hará buscar esta foto y no otra."
            />
            {agregar.error ? <ErrorDeCarga error={agregar.error} /> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
