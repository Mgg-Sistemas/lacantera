import { useState } from 'react'
import { Eye, FileText, Pencil, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { VisorPdf } from '@/components/VisorPdf'
import { useMisRoles } from '@/lib/api/catalogo'
import {
  diasParaVencer,
  urlDocumento,
  useActualizarDocumento,
  useDocumentos,
  useEliminarDocumento,
  useSubirDocumento,
  useTiposDocumento,
  type DocumentoLegal,
} from '@/lib/api/empresa'
import { fecha } from '@/lib/formato'

const TOPE_BYTES = 50 * 1024 * 1024

const peso = (bytes: number | null) =>
  bytes == null
    ? '—'
    : bytes > 1048576
      ? `${(bytes / 1048576).toFixed(1)} MB`
      : `${Math.round(bytes / 1024)} kB`

const VACIO = { tipo: '', nombre: '', emitido_el: '', vence_el: '', nota: '' }

/**
 * Los papeles de la empresa, donde se consultan.
 *
 * Van a un almacén privado del sistema y no a la carpeta pública: la alianza
 * con la Gobernación, el registro mercantil o un poder son documentos de la
 * persona jurídica, y una carpeta pública se sirve en internet sin clave.
 *
 * Se ven antes de descargarlos y se corrigen sin volver a subirlos. Las dos
 * cosas por el mismo motivo: con papeles escaneados de quince megas, cualquier
 * cosa que obligue a mover el archivo otra vez termina en que nadie los
 * mantiene al día.
 */
export function Documentos() {
  const { data: documentos, isPending, error } = useDocumentos()
  const { data: tipos } = useTiposDocumento()
  const subir = useSubirDocumento()
  const actualizar = useActualizarDocumento()
  const eliminar = useEliminarDocumento()
  const { puede } = useMisRoles()
  const gestiona = puede('ADMIN') || puede('GERENTE_GENERAL')

  // `null` cerrado, `0` cargando uno nuevo, `id` corrigiendo el que sea.
  const [editando, setEditando] = useState<number | null>(null)
  const [form, setForm] = useState(VACIO)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [fallo, setFallo] = useState('')

  const [viendo, setViendo] = useState<{ doc: DocumentoLegal; url: string } | null>(null)
  const [abriendo, setAbriendo] = useState<number | null>(null)
  const [borrando, setBorrando] = useState<DocumentoLegal | null>(null)

  const cambiar = (parte: Partial<typeof VACIO>) => setForm((v) => ({ ...v, ...parte }))

  const corrigiendo = editando !== null && editando > 0
  const tipo = tipos?.find((t) => t.codigo === form.tipo)
  const guardando = subir.isPending || actualizar.isPending

  // Al corregir, el archivo es opcional: se cambia la fecha y no viaja nada.
  const listo =
    form.tipo &&
    form.nombre.trim().length >= 3 &&
    (corrigiendo || archivo) &&
    (!archivo || archivo.size <= TOPE_BYTES)

  const nombreTipo = (codigo: string) => tipos?.find((t) => t.codigo === codigo)?.nombre ?? codigo

  const abrirNuevo = () => {
    setForm(VACIO)
    setArchivo(null)
    setFallo('')
    setEditando(0)
  }

  const abrirCorreccion = (d: DocumentoLegal) => {
    setForm({
      tipo: d.tipo,
      nombre: d.nombre,
      emitido_el: d.emitido_el ?? '',
      vence_el: d.vence_el ?? '',
      nota: d.nota ?? '',
    })
    setArchivo(null)
    setFallo('')
    setEditando(d.id)
  }

  const ver = async (doc: DocumentoLegal) => {
    setFallo('')
    setAbriendo(doc.id)
    try {
      setViendo({ doc, url: await urlDocumento(doc.archivo_path) })
    } catch (e) {
      setFallo(e instanceof Error ? e.message : String(e))
    } finally {
      setAbriendo(null)
    }
  }

  const enviar = async () => {
    setFallo('')
    try {
      if (corrigiendo) {
        await actualizar.mutateAsync({
          id: editando,
          tipo: form.tipo,
          nombre: form.nombre.trim(),
          emitido_el: form.emitido_el || undefined,
          vence_el: form.vence_el || undefined,
          nota: form.nota || undefined,
          archivo,
        })
      } else {
        if (!archivo) return
        await subir.mutateAsync({
          tipo: form.tipo,
          nombre: form.nombre.trim(),
          archivo,
          emitido_el: form.emitido_el || undefined,
          vence_el: form.vence_el || undefined,
          nota: form.nota || undefined,
        })
      }
      setForm(VACIO)
      setArchivo(null)
      setEditando(null)
    } catch (e) {
      setFallo(e instanceof Error ? e.message : String(e))
    }
  }

  const quitar = async () => {
    if (!borrando) return
    setFallo('')
    try {
      await eliminar.mutateAsync(borrando.id)
      setBorrando(null)
    } catch (e) {
      setFallo(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Documentos legales"
        description="Los papeles de la empresa, guardados dentro del sistema y no en una carpeta pública."
        actions={
          gestiona ? (
            <Button icon={<Upload className="size-[18px]" />} onClick={abrirNuevo}>
              Cargar documento
            </Button>
          ) : null
        }
      />

      <div className="border-royal-600/25 bg-royal-600/6 text-ink/70 mb-4 flex items-start gap-3 rounded-[8px] border p-3 text-xs">
        <ShieldCheck className="text-royal-600 dark:text-royal-300 mt-0.5 size-4 shrink-0" />
        <p>
          Estos archivos no se publican en internet. Al abrir uno, el sistema firma una dirección
          contra la sesión de quien lo pide y esa dirección deja de servir a los diez minutos.
        </p>
      </div>

      {fallo ? <p className="text-danger mb-4 text-sm">{fallo}</p> : null}

      {isPending ? (
        <Cargando />
      ) : error ? (
        <ErrorDeCarga error={error} />
      ) : (documentos ?? []).length === 0 ? (
        <Vacio
          icono={<FileText className="size-6" />}
          titulo="Todavía no hay documentos cargados"
          descripcion="El acta de alianza con la Gobernación, el comprobante del RIF, el registro mercantil y lo que haga falta van aquí."
          accion={
            gestiona ? (
              <Button icon={<Upload className="size-[18px]" />} onClick={abrirNuevo}>
                Cargar el primero
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3">
          {(documentos ?? []).map((d) => {
            const dias = diasParaVencer(d.vence_el)
            return (
              <Card key={d.id} className="flex flex-wrap items-center gap-4">
                <div className="bg-ink/6 text-ink/55 flex size-10 shrink-0 items-center justify-center rounded-[8px]">
                  <FileText className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-ink/90 truncate font-medium">{d.nombre}</h3>
                    <Chip tone="neutral">{nombreTipo(d.tipo)}</Chip>
                    {dias !== null && dias < 0 ? (
                      <Chip tone="danger">Vencido</Chip>
                    ) : dias !== null && dias <= 90 ? (
                      <Chip tone="warning">Vence en {dias} días</Chip>
                    ) : null}
                  </div>
                  <p className="text-ink/50 mt-1 text-xs">
                    {d.emitido_el ? `Emitido el ${fecha(d.emitido_el)}` : 'Sin fecha de emisión'}
                    {d.vence_el ? ` · vence el ${fecha(d.vence_el)}` : ''}
                    {' · '}
                    {peso(d.bytes)}
                  </p>
                  {d.nota ? <p className="text-ink/55 mt-1 text-xs">{d.nota}</p> : null}
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Eye className="size-4" />}
                    onClick={() => void ver(d)}
                    disabled={abriendo === d.id}
                  >
                    {abriendo === d.id ? 'Abriendo…' : 'Ver'}
                  </Button>
                  {gestiona ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Corregir ${d.nombre}`}
                        icon={<Pencil className="size-4" />}
                        onClick={() => abrirCorreccion(d)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Quitar ${d.nombre}`}
                        icon={<Trash2 className="size-4" />}
                        onClick={() => setBorrando(d)}
                      />
                    </>
                  ) : null}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
        titulo={corrigiendo ? 'Corregir documento' : 'Cargar documento'}
        descripcion={
          corrigiendo
            ? 'Cambia lo que haga falta. El archivo solo se toca si subes uno nuevo.'
            : 'PDF o imagen, hasta 50 MB. Queda guardado dentro del sistema.'
        }
        acciones={
          <>
            <Button variant="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void enviar()} disabled={!listo || guardando}>
              {guardando ? 'Guardando…' : corrigiendo ? 'Guardar cambios' : 'Cargar'}
            </Button>
          </>
        }
      >
        <Select
          label="Tipo de documento"
          vacio="Elige el tipo"
          value={form.tipo}
          onChange={(e) => cambiar({ tipo: e.target.value })}
          opciones={(tipos ?? []).map((t) => ({ valor: t.codigo, etiqueta: t.nombre }))}
        />

        <Input
          className="mt-4"
          label="Nombre"
          value={form.nombre}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          hint="Como lo buscará quien lo necesite dentro de un año."
        />

        <div className="mt-4">
          <span className="text-ink/70 mb-1.5 block text-sm font-medium">
            {corrigiendo ? 'Reemplazar el archivo' : 'Archivo'}
          </span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-ink/70 file:bg-royal-600/10 file:text-royal-700 dark:file:text-royal-300 hover:file:bg-royal-600/16 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-[6px] file:border-0 file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          {archivo ? (
            <p
              className={`mt-1.5 text-xs ${archivo.size > TOPE_BYTES ? 'text-danger' : 'text-ink/50'}`}
            >
              {archivo.name} · {peso(archivo.size)}
              {archivo.size > TOPE_BYTES ? ' — pasa del tope de 50 MB.' : ''}
            </p>
          ) : corrigiendo ? (
            <p className="text-ink/50 mt-1.5 text-xs">
              Déjalo vacío y se queda el que ya está. Solo elige uno si llegó una versión nueva del
              papel.
            </p>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Emitido el"
            type="date"
            value={form.emitido_el}
            onChange={(e) => cambiar({ emitido_el: e.target.value })}
          />
          <Input
            label="Vence el"
            type="date"
            value={form.vence_el}
            onChange={(e) => cambiar({ vence_el: e.target.value })}
            hint={tipo?.caduca ? 'Este tipo suele caducar.' : 'Déjalo vacío si no caduca.'}
          />
        </div>

        <Textarea
          className="mt-4"
          label="Nota"
          rows={2}
          value={form.nota}
          onChange={(e) => cambiar({ nota: e.target.value })}
        />

        {fallo ? <p className="text-danger mt-3 text-sm">{fallo}</p> : null}
      </Modal>

      <Modal
        abierto={borrando !== null}
        onCerrar={() => setBorrando(null)}
        titulo="Quitar documento"
        ancho="sm"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setBorrando(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void quitar()} disabled={eliminar.isPending}>
              {eliminar.isPending ? 'Quitando…' : 'Quitar'}
            </Button>
          </>
        }
      >
        <p className="text-ink/70 text-sm">
          Se borra <strong className="text-ink/90">{borrando?.nombre}</strong> y también el archivo.
          Esto no se puede deshacer: si es el único ejemplar que queda, tendrás que volver a
          escanearlo.
        </p>
      </Modal>

      <VisorPdf
        abierto={viendo !== null}
        onCerrar={() => setViendo(null)}
        href={viendo?.url ?? null}
        nombreArchivo={`${viendo?.doc.nombre ?? 'documento'}.pdf`}
        titulo={viendo?.doc.nombre ?? ''}
        descripcion={viendo ? nombreTipo(viendo.doc.tipo) : undefined}
      />
    </>
  )
}
