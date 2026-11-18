import { useRef, useState } from 'react'
import { Camera, FileText, Plus, Trash2, UserPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Visor } from '@/components/Visor'
import { useEmpresa } from '@/lib/api/empresa'
import { usePersonasDeLaEmpresa } from '@/lib/api/salidas'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { ENCUADRE_CENTRADO, fotoRecortada } from '@/lib/ficha/encuadre'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  armarFormatoSalidaAutorizada,
  type RenglonEspecificacionSalida,
  type ResponsableTrasladoSalida,
} from '@/lib/ficha/formatoSalidaAutorizadaPdf'

interface FotoCargada {
  id: string
  nombreArchivo: string
  previewUrl: string
  leyenda: string
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = src
  })
}

export function ModalFormatoSalidaAutorizada({
  abierto,
  onCerrar,
}: {
  abierto: boolean
  onCerrar: () => void
}) {
  const { data: empresa } = useEmpresa()
  const { data: personas } = usePersonasDeLaEmpresa()
  const inputFotosRef = useRef<HTMLInputElement>(null)

  // Encabezado y autorización (prellenado con Norbelis Sequea por defecto)
  const [titulo, setTitulo] = useState('Autorización de Salida de Componente / Material')
  const [lugar, setLugar] = useState('Naiguatá')
  const [fechaIso, setFechaIso] = useState(() => hoyEnCaracas())
  const [autorizadoPor, setAutorizadoPor] = useState('Norbelis Sequea')
  const [autorizadoCedula, setAutorizadoCedula] = useState('V-25.445.835')
  const [autorizadoCargo, setAutorizadoCargo] = useState(
    'la Gerencia / Administración de la Cantera, ciudadana',
  )
  const [instalacion, setInstalacion] = useState('Cantera de Naiguatá')
  const [firmaPieLinea2, setFirmaPieLinea2] = useState(
    'ALMACEN GENERAL DE LA CANTERA DE NAIGUATA',
  )

  // Especificaciones principales del artículo / material que sale (no inventariado)
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [modeloSerial, setModeloSerial] = useState('')
  const [procedencia, setProcedencia] = useState('Área de la Cantera de Naiguatá')
  const [destino, setDestino] = useState('')
  const [motivoSalida, setMotivoSalida] = useState('Mantenimiento y reparación')
  const [asuntoPersonalizado, setAsuntoPersonalizado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [renglonesExtra, setRenglonesExtra] = useState<RenglonEspecificacionSalida[]>([])

  // Responsables del traslado / técnico
  const [responsables, setResponsables] = useState<ResponsableTrasladoSalida[]>([
    { nombre: '', cedula: '', rol: 'Responsable de traslado / técnico' },
  ])

  // Anexo fotográfico
  const [fotos, setFotos] = useState<FotoCargada[]>([])
  const [subtituloAnexo, setSubtituloAnexo] = useState('')

  // Estado de generación y visor PDF
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfArmado, setPdfArmado] = useState<ArchivoArmado | null>(null)

  const agregarFotos = (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return
    setError(null)
    const nuevas: FotoCargada[] = []
    for (const file of Array.from(archivos)) {
      if (!file.type.startsWith('image/')) continue
      const url = URL.createObjectURL(file)
      nuevas.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        nombreArchivo: file.name,
        previewUrl: url,
        leyenda: '',
      })
    }
    setFotos((prev) => [...prev, ...nuevas].slice(0, 12))
    if (inputFotosRef.current) inputFotosRef.current.value = ''
  }

  const quitarFoto = (id: string) => {
    setFotos((prev) => {
      const quitada = prev.find((f) => f.id === id)
      if (quitada) URL.revokeObjectURL(quitada.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  const cambiarNombreResponsable = (idx: number, valor: string) => {
    setResponsables((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, nombre: valor } : r)),
    )
  }

  const generarPdf = async () => {
    if (!descripcion.trim()) {
      setError('Indique la descripción del artículo, material o componente que va a salir.')
      return
    }
    setError(null)
    setGenerando(true)
    try {
      const especificaciones: RenglonEspecificacionSalida[] = [
        { concepto: 'Descripción', detalle: descripcion.trim() },
        ...(cantidad.trim() ? [{ concepto: 'Cantidad / Condición', detalle: cantidad.trim() }] : []),
        {
          concepto: 'Modelo / Serial',
          detalle: modeloSerial.trim() || 'S/N',
        },
        {
          concepto: 'Procedencia / Ubicación',
          detalle: procedencia.trim() || 'Área de la Cantera de Naiguatá',
        },
        ...(destino.trim() ? [{ concepto: 'Destino', detalle: destino.trim() }] : []),
        {
          concepto: 'Motivo de Salida',
          detalle: motivoSalida.trim() || 'Traslado autorizado',
        },
        ...renglonesExtra.filter((r) => r.concepto.trim() || r.detalle.trim()),
        ...(observaciones.trim()
          ? [{ concepto: 'Observaciones', detalle: observaciones.trim() }]
          : []),
      ]

      // Preparar fotos recortadas con proporción limpia para las tarjetas del Anexo Fotográfico
      const fotosProcesadas = []
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i]
        const img = await cargarImagen(f.previewUrl)
        // En lotes de 3 fotos, la 3ra tarjeta es más apaisada (104×82) y las dos superiores son 80×92
        const esTerceraDeTres = fotos.length % 3 === 0 && i % 3 === 2
        const dataUrl = fotoRecortada(
          img,
          esTerceraDeTres ? 98 : 80,
          esTerceraDeTres ? 82 : 92,
          ENCUADRE_CENTRADO,
          220,
          0.9,
        )
        fotosProcesadas.push({
          dataUrl,
          leyenda: f.leyenda.trim() || `Vista de referencia ${i + 1}`,
        })
      }

      const asuntoFinal =
        asuntoPersonalizado.trim() ||
        `Autorización de salida de ${descripcion.trim()}${
          cantidad.trim() ? ` (${cantidad.trim()})` : ''
        }.`

      const archivo = await armarFormatoSalidaAutorizada({
        lugar,
        fechaIso,
        titulo: titulo.trim() || 'Autorización de Salida de Componente / Material',
        asunto: asuntoFinal,
        autorizadoPor: autorizadoPor.trim() || 'Norbelis Sequea',
        autorizadoCedula: autorizadoCedula.trim() || 'V-25.445.835',
        autorizadoCargo: autorizadoCargo.trim(),
        instalacion: instalacion.trim() || 'Cantera de Naiguatá',
        descripcionCorta: descripcion.trim(),
        motivoResumen: (motivoSalida.trim() || 'mantenimiento y operación autorizada').toLowerCase(),
        especificaciones,
        responsables,
        firmaPieLinea1: autorizadoCedula.trim() ? `C.I.: ${autorizadoCedula.trim()}` : '',
        firmaPieLinea2: firmaPieLinea2.trim(),
        subtituloAnexo: subtituloAnexo.trim() || undefined,
        fotos: fotosProcesadas,
        empresa: {
          razonSocial: empresa?.razon_social || 'MINERÍA INTERNACIONAL TS, C.A.',
          subtitulo: 'OPERACIONES Y MANTENIMIENTO',
        },
      })

      setPdfArmado(archivo)
    } catch (e) {
      console.error(e)
      setError('No se pudo armar el PDF del formato de salida. Verifique las fotos adjuntas.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <>
      <Modal
        abierto={abierto}
        onCerrar={onCerrar}
        titulo="Formato de salida autorizada (fuera de inventario)"
        descripcion="Constancia y autorización operativa para dar salida a neumáticos, componentes mecánicos, piezas o equipos ubicados en el área de la cantera que no forman parte del stock regular de almacén, con anexo fotográfico."
        ancho="lg"
        acciones={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cerrar
            </Button>
            <Button
              icon={<FileText />}
              disabled={generando || !descripcion.trim()}
              onClick={() => void generarPdf()}
            >
              {generando ? 'Generando PDF…' : 'Generar formato en PDF'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* 1. Datos de autorización y cabecera */}
          <div className="border-hairline bg-ink/[0.02] space-y-3 rounded-card border p-3.5">
            <p className="text-ink/80 text-xs font-semibold tracking-wider uppercase">
              1. Encabezado y autorización
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Input
                  label="Título del documento"
                  sinNormalizar
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej. Autorización de Salida de Componente Mecánico"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Lugar"
                  sinNormalizar
                  value={lugar}
                  onChange={(e) => setLugar(e.target.value)}
                />
                <Input
                  label="Fecha"
                  type="date"
                  value={fechaIso}
                  onChange={(e) => setFechaIso(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Autorizado por"
                sinNormalizar
                value={autorizadoPor}
                onChange={(e) => setAutorizadoPor(e.target.value)}
                placeholder="Norbelis Sequea"
              />
              <Input
                label="Cédula de quien autoriza"
                sinNormalizar
                value={autorizadoCedula}
                onChange={(e) => setAutorizadoCedula(e.target.value)}
                placeholder="V-25.445.835"
              />
              <Input
                label="Cargo / introducción en constancia"
                sinNormalizar
                value={autorizadoCargo}
                onChange={(e) => setAutorizadoCargo(e.target.value)}
                placeholder="la Administración de la Cantera, ciudadana"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Instalación de origen"
                sinNormalizar
                value={instalacion}
                onChange={(e) => setInstalacion(e.target.value)}
                placeholder="Cantera de Naiguatá"
              />
              <Input
                label="Rótulo bajo la firma"
                sinNormalizar
                value={firmaPieLinea2}
                onChange={(e) => setFirmaPieLinea2(e.target.value)}
                placeholder="ALMACEN GENERAL DE LA CANTERA DE NAIGUATA"
              />
            </div>
          </div>

          {/* 2. Especificaciones de lo que sale */}
          <div className="border-hairline space-y-3 rounded-card border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink/80 text-xs font-semibold tracking-wider uppercase">
                2. Especificaciones del artículo o componente
              </p>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus />}
                onClick={() =>
                  setRenglonesExtra((prev) => [...prev, { concepto: '', detalle: '' }])
                }
              >
                Añadir especificación
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Input
                  label="Descripción de lo que sale *"
                  sinNormalizar
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej. Neumáticos usados de cargador / Cámara de máquina John Deere"
                />
              </div>
              <Input
                label="Cantidad / Condición (opcional)"
                sinNormalizar
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="Ej. 4 unidades"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Modelo / Serial / Medida"
                sinNormalizar
                value={modeloSerial}
                onChange={(e) => setModeloSerial(e.target.value)}
                placeholder="Ej. 29.5R25 o XUG0050GNRVB61422"
              />
              <Input
                label="Procedencia / Ubicación actual"
                sinNormalizar
                value={procedencia}
                onChange={(e) => setProcedencia(e.target.value)}
                placeholder="Ej. Área de la Cantera de Naiguatá"
              />
              <Input
                label="Destino (opcional)"
                sinNormalizar
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Ej. Taller externo / Vulcanizadora"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Motivo de salida"
                sinNormalizar
                value={motivoSalida}
                onChange={(e) => setMotivoSalida(e.target.value)}
                placeholder="Ej. Mantenimiento y reparación"
              />
              <Input
                label="Asunto (opcional — se genera solo si se deja vacío)"
                sinNormalizar
                value={asuntoPersonalizado}
                onChange={(e) => setAsuntoPersonalizado(e.target.value)}
                placeholder={
                  descripcion.trim()
                    ? `Autorización de salida de ${descripcion.trim()}.`
                    : 'Se armará automáticamente con la descripción'
                }
              />
            </div>

            {renglonesExtra.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="text-ink/55 text-xs">Filas adicionales en la tabla de especificaciones:</p>
                {renglonesExtra.map((r, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_1.6fr_auto] items-end gap-2">
                    <Input
                      label="Concepto"
                      ocultarEtiqueta={idx > 0}
                      sinNormalizar
                      placeholder="Ej. Placa del vehículo"
                      value={r.concepto}
                      onChange={(e) =>
                        setRenglonesExtra((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, concepto: e.target.value } : item,
                          ),
                        )
                      }
                    />
                    <Input
                      label="Detalle"
                      ocultarEtiqueta={idx > 0}
                      sinNormalizar
                      placeholder="Ej. A11A56G · Iveco"
                      value={r.detalle}
                      onChange={(e) =>
                        setRenglonesExtra((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, detalle: e.target.value } : item,
                          ),
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 />}
                      aria-label="Quitar fila"
                      onClick={() =>
                        setRenglonesExtra((prev) => prev.filter((_, i) => i !== idx))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <Textarea
              label="Observaciones adicionales (opcional)"
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Cualquier nota sobre el estado físico, compromiso de retorno o condición de salida…"
            />
          </div>

          {/* 3. Responsables del traslado / técnico */}
          <div className="border-hairline space-y-3 rounded-card border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink/80 text-xs font-semibold tracking-wider uppercase">
                3. Responsables del traslado / técnico
              </p>
              <Button
                size="sm"
                variant="ghost"
                icon={<UserPlus />}
                onClick={() =>
                  setResponsables((prev) => [
                    ...prev,
                    { nombre: '', cedula: '', rol: 'Responsable de traslado / técnico' },
                  ])
                }
              >
                Añadir responsable
              </Button>
            </div>

            <datalist id="lista-personal-salida-autorizada">
              {(personas ?? []).map((p) => (
                <option key={p.id} value={p.nombre}>
                  {p.cargo}
                </option>
              ))}
            </datalist>

            <div className="space-y-2.5">
              {responsables.map((r, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 sm:grid-cols-[1.3fr_0.9fr_1.2fr_auto] sm:items-end"
                >
                  <Input
                    label="Nombre y Apellido"
                    ocultarEtiqueta={idx > 0}
                    sinNormalizar
                    list="lista-personal-salida-autorizada"
                    placeholder="Ej. Nelsi Méndez"
                    value={r.nombre}
                    onChange={(e) => cambiarNombreResponsable(idx, e.target.value)}
                  />
                  <Input
                    label="Cédula de Identidad"
                    ocultarEtiqueta={idx > 0}
                    sinNormalizar
                    placeholder="Ej. 15.551.681"
                    value={r.cedula}
                    onChange={(e) =>
                      setResponsables((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, cedula: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    label="Rol / Cargo"
                    ocultarEtiqueta={idx > 0}
                    sinNormalizar
                    placeholder="Responsable de traslado / técnico"
                    value={r.rol}
                    onChange={(e) =>
                      setResponsables((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, rol: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  {responsables.length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 />}
                      aria-label="Quitar responsable"
                      onClick={() =>
                        setResponsables((prev) => prev.filter((_, i) => i !== idx))
                      }
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* 4. Anexo fotográfico */}
          <div className="border-hairline space-y-3 rounded-card border p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-ink/80 text-xs font-semibold tracking-wider uppercase">
                  4. Anexo fotográfico (fotos de referencia)
                </p>
                <p className="text-ink/50 text-xs">
                  Salen en la segunda página del PDF con su marco y leyenda («Fotografía 1 — …»).
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<Camera />}
                onClick={() => inputFotosRef.current?.click()}
              >
                Adjuntar fotos ({fotos.length})
              </Button>
              <input
                ref={inputFotosRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => agregarFotos(e.target.files)}
              />
            </div>

            {fotos.length > 0 ? (
              <>
                <Input
                  label="Descripción general del anexo fotográfico (opcional)"
                  sinNormalizar
                  value={subtituloAnexo}
                  onChange={(e) => setSubtituloAnexo(e.target.value)}
                  placeholder="Registro visual del estado físico en el que se autoriza la salida del material o componente de las instalaciones de la Cantera de Naiguatá."
                />

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {fotos.map((f, idx) => (
                    <div
                      key={f.id}
                      className="border-hairline bg-surface flex flex-col gap-2 rounded-card border p-2.5"
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[6px] bg-black/10">
                        <img
                          src={f.previewUrl}
                          alt={`Fotografía ${idx + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => quitarFoto(f.id)}
                          className="bg-ink/75 text-canvas hover:bg-danger absolute top-1.5 right-1.5 rounded-full p-1 transition-colors"
                          title="Quitar fotografía"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <Input
                        label={`Fotografía ${idx + 1} — Leyenda`}
                        sinNormalizar
                        placeholder={
                          idx === 0
                            ? 'Ej. Detalle del estado físico'
                            : idx === 1
                              ? 'Ej. Vista superior del conjunto'
                              : 'Ej. Vista general de las piezas'
                        }
                        value={f.leyenda}
                        onChange={(e) =>
                          setFotos((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, leyenda: e.target.value } : item,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div
                onClick={() => inputFotosRef.current?.click()}
                className="border-hairline hover:border-royal-600/40 text-ink/55 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border border-dashed py-6 text-center text-xs transition-colors"
              >
                <Camera className="text-ink/40 size-6" />
                <span>Pulse aquí para seleccionar las fotos de referencia de lo que está saliendo</span>
                <span className="text-ink/40 text-[11px]">
                  Puede elegir 1, 2, 3 o más fotografías a la vez
                </span>
              </div>
            )}
          </div>

          {error ? <p className="text-danger text-xs font-medium">{error}</p> : null}
        </div>
      </Modal>

      <Visor
        abierto={pdfArmado !== null}
        onCerrar={() => setPdfArmado(null)}
        blob={pdfArmado?.blob ?? null}
        nombreArchivo={pdfArmado?.nombre ?? 'autorizacion-salida.pdf'}
        titulo="Formato de salida autorizada"
        descripcion="Constancia y autorización operativa con anexo fotográfico, lista para imprimir o descargar."
      />
    </>
  )
}
