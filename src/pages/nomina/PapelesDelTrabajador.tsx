import { useState } from 'react'
import { FileText, Paperclip, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { SoltarArchivo } from '@/components/SoltarArchivo'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { diasParaVencer } from '@/lib/api/empresa'
import {
  urlDeDocumentoDeEmpleado,
  useDocumentosDeEmpleado,
  useEliminarDocumentoDeEmpleado,
  useSubirDocumentoDeEmpleado,
  useTiposDeDocumento,
  type DocumentoDeEmpleado,
} from '@/lib/api/nomina'
import { fecha as fmtFecha } from '@/lib/formato'

/*
  LOS PAPELES DEL TRABAJADOR

  Christopher, 22/09/2026: «Documentación del Trabajador (Cédula, Rif,
  Currículum)». Hasta hoy lo único que se adjuntaba de una persona era su foto.

  DOS AVISOS ARRIBA, Y SOLO DOS. Falta la cédula y falta el RIF se dicen en la
  cabecera porque son los que se piden para todo —el banco, el seguro, el
  SENIAT—; que falte el currículum no detiene ningún trámite, así que no se
  convierte en una alarma que se aprende a ignorar.

  LO QUE VENCE SE VE VENIR. La cédula, la licencia y el certificado médico
  caducan. La fila lo dice antes de que pase, no después.

  EL ARCHIVO NUNCA TIENE DIRECCIÓN PÚBLICA: se pide firmado en el momento de
  abrirlo y el enlace caduca. La cédula de alguien no puede quedar colgada de
  una dirección que se reenvía.
*/

/** 50 MB, el mismo tope que los documentos legales de la empresa. */
const TOPE_BYTES = 50 * 1024 * 1024

/** Los que se piden para todo. Si faltan, se avisa. */
const IMPRESCINDIBLES = [
  { codigo: 'CEDULA', falta: 'Falta la cédula' },
  { codigo: 'RIF', falta: 'Falta el RIF' },
]

const peso = (bytes: number | null) =>
  bytes === null
    ? ''
    : bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`

export function PapelesDelTrabajador({
  empleadoId,
  puedeEditar,
}: {
  empleadoId: number
  puedeEditar: boolean
}) {
  const papeles = useDocumentosDeEmpleado(empleadoId)
  const tipos = useTiposDeDocumento()
  const quitar = useEliminarDocumentoDeEmpleado()
  const [subiendo, setSubiendo] = useState(false)
  const [viendo, setViendo] = useState<{ doc: DocumentoDeEmpleado; url: string } | null>(null)
  const [quitando, setQuitando] = useState<DocumentoDeEmpleado | null>(null)
  const [falloAbrir, setFalloAbrir] = useState<unknown>(null)

  const nombreDelTipo = (codigo: string) =>
    tipos.data?.find((t) => t.codigo === codigo)?.nombre ?? codigo

  const hay = (codigo: string) => (papeles.data ?? []).some((d) => d.tipo === codigo)

  const abrir = async (doc: DocumentoDeEmpleado) => {
    setFalloAbrir(null)
    try {
      setViendo({ doc, url: await urlDeDocumentoDeEmpleado(doc.archivo_path) })
    } catch (e) {
      setFalloAbrir(e)
    }
  }

  return (
    <>
      <Card className="mt-4">
        <CardHeader
          title="Papeles"
          subtitle="La cédula, el RIF, el currículum y lo que haga falta. Se guardan en privado: el enlace para verlos caduca a los diez minutos."
          action={
            puedeEditar ? (
              <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setSubiendo(true)}>
                Agregar papel
              </Button>
            ) : null
          }
        />

        {papeles.isPending ? (
          <Cargando />
        ) : papeles.error ? (
          <ErrorDeCarga error={papeles.error} />
        ) : (
          <>
            {IMPRESCINDIBLES.some((x) => !hay(x.codigo)) ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {IMPRESCINDIBLES.filter((x) => !hay(x.codigo)).map((x) => (
                  <Chip key={x.codigo} tone="warning" icon={<TriangleAlert />}>
                    {x.falta}
                  </Chip>
                ))}
              </div>
            ) : null}

            {(papeles.data ?? []).length === 0 ? (
              <p className="text-ink/45 mt-4 text-sm">
                No tiene ningún papel cargado.
                {puedeEditar ? ' Se empieza por la cédula y el RIF.' : ''}
              </p>
            ) : (
              <ul className="divide-hairline mt-4 divide-y">
                {(papeles.data ?? []).map((d) => {
                  const dias = diasParaVencer(d.vence_el)
                  return (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <Paperclip className="text-ink/30 size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {nombreDelTipo(d.tipo)}
                          {d.nombre.toUpperCase() !== nombreDelTipo(d.tipo).toUpperCase() ? (
                            <span className="text-ink/50 font-normal"> · {d.nombre}</span>
                          ) : null}
                        </p>
                        <p className="text-ink/45 text-xs">
                          {[
                            d.emitido_el ? `Emitido el ${fmtFecha(d.emitido_el)}` : null,
                            d.vence_el ? `Vence el ${fmtFecha(d.vence_el)}` : null,
                            peso(d.bytes),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          {d.nota ? <span className="block">{d.nota}</span> : null}
                        </p>
                      </div>
                      {dias !== null && dias <= 60 ? (
                        <Chip tone="warning">{dias < 0 ? 'Vencido' : `Vence en ${dias} días`}</Chip>
                      ) : null}
                      <Button size="sm" variant="ghost" icon={<FileText />} onClick={() => void abrir(d)}>
                        Ver
                      </Button>
                      {puedeEditar ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 />}
                          disabled={quitar.isPending}
                          onClick={() => setQuitando(d)}
                        >
                          Quitar
                        </Button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}

            {falloAbrir ? <ErrorDeCarga error={falloAbrir} /> : null}
            {quitar.error ? <ErrorDeCarga error={quitar.error} /> : null}
          </>
        )}
      </Card>

      {subiendo ? (
        <AgregarPapel empleadoId={empleadoId} onCerrar={() => setSubiendo(false)} />
      ) : null}

      {/*
        Se pregunta, y se dice qué pasa: el archivo se va del depósito y no hay
        papelera. La fila se puede volver a subir; el escaneo, no.
      */}
      <Modal
        abierto={quitando !== null}
        onCerrar={() => setQuitando(null)}
        titulo="Quitar el papel"
        descripcion={
          quitando
            ? `«${quitando.nombre}» se borra del depósito y no se recupera. Habría que volver a escanearlo.`
            : undefined
        }
        acciones={
          <>
            <Button variant="ghost" onClick={() => setQuitando(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={quitar.isPending}
              onClick={() =>
                quitando && quitar.mutate(quitando.id, { onSuccess: () => setQuitando(null) })
              }
            >
              {quitar.isPending ? 'Quitando…' : 'Quitar'}
            </Button>
          </>
        }
      >
        <p className="text-ink/70 text-sm">
          El archivo sale del depósito. La fila se puede volver a subir; el escaneo, no.
        </p>
      </Modal>


      <Visor
        abierto={viendo !== null}
        onCerrar={() => setViendo(null)}
        href={viendo?.url ?? null}
        mime={viendo?.doc.mime ?? null}
        nombreArchivo={viendo?.doc.nombre ?? 'documento'}
        titulo={viendo ? nombreDelTipo(viendo.doc.tipo) : ''}
        descripcion={viendo?.doc.nombre}
      />
    </>
  )
}

/* ────────────────────────────────────────────────────── subir uno nuevo */

function AgregarPapel({ empleadoId, onCerrar }: { empleadoId: number; onCerrar: () => void }) {
  const tipos = useTiposDeDocumento()
  const subir = useSubirDocumentoDeEmpleado()

  const [tipo, setTipo] = useState('CEDULA')
  const [nombre, setNombre] = useState('')
  const [tocado, setTocado] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [emitido, setEmitido] = useState('')
  const [vence, setVence] = useState('')
  const [nota, setNota] = useState('')

  // El nombre se escribe solo con el del tipo hasta que alguien lo cambie: casi
  // siempre «Cédula de identidad» es exactamente lo que se quería poner.
  const nombreDelTipo = (codigo: string) =>
    tipos.data?.find((t) => t.codigo === codigo)?.nombre ?? codigo
  const nombreFinal = tocado ? nombre : nombreDelTipo(tipo)

  const fechasAlReves = Boolean(emitido && vence && vence < emitido)
  const listo = Boolean(archivo) && nombreFinal.trim().length >= 3 && !fechasAlReves

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Agregar un papel"
      descripcion="El archivo se guarda en privado. Solo lo abre quien pueda ver el personal, y con un enlace que caduca."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || subir.isPending}
            onClick={() =>
              subir.mutate(
                {
                  empleado_id: empleadoId,
                  tipo,
                  nombre: nombreFinal.trim(),
                  archivo: archivo!,
                  emitido_el: emitido,
                  vence_el: vence,
                  nota,
                },
                { onSuccess: onCerrar },
              )
            }
          >
            {subir.isPending ? 'Subiendo…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Qué papel es"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            opciones={(tipos.data ?? [])
              .filter((t) => t.activo)
              .map((t) => ({ valor: t.codigo, etiqueta: t.nombre }))}
          />
          <Input
            label="Nombre"
            value={nombreFinal}
            onChange={(e) => {
              setTocado(true)
              setNombre(e.target.value)
            }}
            hint="Como quieras encontrarlo después."
          />
        </div>

        <SoltarArchivo
          etiqueta="Archivo"
          valor={archivo}
          onCambio={setArchivo}
          acepta="application/pdf,image/jpeg,image/png,image/webp"
          tope={TOPE_BYTES}
          pista="PDF o foto, hasta 50 MB."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Emitido el"
            type="date"
            value={emitido}
            onChange={(e) => setEmitido(e.target.value)}
          />
          <Input
            label="Vence el"
            type="date"
            value={vence}
            onChange={(e) => setVence(e.target.value)}
            error={fechasAlReves ? 'No puede vencer antes de emitirse.' : undefined}
            hint="Solo si caduca. La cédula y la licencia, sí; el currículum, no."
          />
        </div>

        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />

        {subir.error ? <ErrorDeCarga error={subir.error} /> : null}
      </div>
    </Modal>
  )
}
