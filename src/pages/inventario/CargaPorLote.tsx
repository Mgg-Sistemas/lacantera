import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Download, Upload, FileSpreadsheet, Check, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { leerHoja, ErrorDePlanilla } from '@/lib/hojas/leerHoja'
import type { FilaDeHoja } from '@/lib/hojas/leerHoja'
import {
  descargarPlantillaArticulos,
  AYUDA_COLUMNAS,
} from '@/lib/hojas/plantillaArticulos'
import {
  prepararFilas,
  useRevisarArticulos,
  useCargarArticulos,
} from '@/lib/api/cargaLote'
import type { InformeDeCarga } from '@/lib/api/cargaLote'

/*
  CARGAR EL CATÁLOGO DE UNA VEZ

  Tres pasos y se ven los tres a la vez, sin modales ni asistentes: se baja la
  plantilla, se sube llena, y se confirma lo que el sistema entendió. La queja
  que dio origen a esta pantalla era «muchos procesos para hacer una
  funcionalidad», así que meter la carga dentro de un asistente de cuatro
  ventanas habría sido contestar la queja repitiéndola.

  Lo que se enseña antes de confirmar no lo calcula el navegador: es la misma
  función de la base que va a escribir, llamada en modo mirar. Así lo que se ve
  en pantalla es exactamente lo que va a pasar.
*/

/** El estado de una fila, dicho como se lee. */
const COMO_SE_DICE: Record<string, { texto: string; tono: 'success' | 'info' | 'danger' }> = {
  NUEVO: { texto: 'Se crea', tono: 'success' },
  ACTUALIZA: { texto: 'Se actualiza', tono: 'info' },
  ERROR: { texto: 'No entra', tono: 'danger' },
}

export function CargaPorLote() {
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaDeHoja[] | null>(null)
  const [informe, setInforme] = useState<InformeDeCarga | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [cargado, setCargado] = useState<InformeDeCarga | null>(null)

  const entrada = useRef<HTMLInputElement>(null)
  const revisar = useRevisarArticulos()
  const cargar = useCargarArticulos()

  const ocupado = revisar.isPending || cargar.isPending

  async function alElegirArchivo(archivo: File) {
    setErrorLectura(null)
    setInforme(null)
    setCargado(null)
    setNombreArchivo(archivo.name)

    try {
      const hoja = await leerHoja(archivo)
      const limpias = prepararFilas(hoja.filas)

      if (limpias.length === 0) {
        setErrorLectura('La planilla no trae ninguna fila con datos.')
        setFilas(null)
        return
      }

      if (!hoja.cabecera.includes('codigo')) {
        setErrorLectura(
          'La planilla no tiene una columna «codigo». ¿Seguro que es la plantilla del sistema?',
        )
        setFilas(null)
        return
      }

      setFilas(limpias)
      // Se revisa sola al soltar el archivo. Obligar a pulsar «Revisar» sería
      // un paso más para llegar al mismo sitio.
      setInforme(await revisar.mutateAsync(limpias))
    } catch (e) {
      setFilas(null)
      setErrorLectura(
        e instanceof ErrorDePlanilla
          ? e.message
          : 'No se pudo leer el archivo. Comprueba que sea la plantilla en CSV o en Excel.',
      )
    }
  }

  async function confirmar() {
    if (!filas) return
    setCargado(await cargar.mutateAsync(filas))
    setInforme(null)
    setFilas(null)
    setNombreArchivo(null)
    if (entrada.current) entrada.current.value = ''
  }

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Cargar artículos por planilla"
        description="Para dar de alta muchos artículos de una vez, o corregir los que ya están."
        actions={
          <Link to="/app/inventario/articulos">
            <Button variant="outline" size="sm" icon={<ArrowLeft />}>
              Al catálogo
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* ------------------------------ 1. La plantilla ----------------------------- */}
          <Card>
            <CardHeader
              title="1 · Baja la plantilla"
              subtitle="Trae las columnas en el orden que el sistema espera y dos filas de ejemplo para que se vea cómo se llena."
            />
            <Button
              className="mt-3"
              variant="outline"
              icon={<Download />}
              onClick={descargarPlantillaArticulos}
            >
              Descargar plantilla
            </Button>
            <p className="text-ink/45 mt-2 text-xs">
              Se abre en Excel de un doble clic. Al terminar puedes guardarla como CSV o como
              Excel: el sistema lee las dos.
            </p>
          </Card>

          {/* -------------------------------- 2. Subirla -------------------------------- */}
          <Card>
            <CardHeader
              title="2 · Súbela llena"
              subtitle="Se revisa al instante y se te dice qué va a pasar con cada fila, antes de tocar nada."
            />

            <input
              ref={entrada}
              type="file"
              accept=".csv,.xlsx,text/csv"
              className="sr-only"
              onChange={(e) => {
                const archivo = e.target.files?.[0]
                if (archivo) void alElegirArchivo(archivo)
              }}
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                icon={<Upload />}
                disabled={ocupado}
                onClick={() => entrada.current?.click()}
              >
                Elegir archivo
              </Button>
              {nombreArchivo ? (
                <span className="text-ink/60 inline-flex items-center gap-1.5 text-sm">
                  <FileSpreadsheet className="size-4 shrink-0" />
                  {nombreArchivo}
                </span>
              ) : null}
            </div>

            {errorLectura ? (
              <p className="text-danger mt-3 text-sm">{errorLectura}</p>
            ) : null}
            {revisar.error ? <ErrorDeCarga error={revisar.error} className="mt-3" /> : null}
          </Card>

          {/* ------------------------------ 3. El informe ------------------------------- */}
          {informe ? (
            <Card flush>
              <div className="px-5 pt-5">
                <CardHeader
                  title="3 · Esto es lo que va a pasar"
                  subtitle={
                    informe.errores > 0
                      ? 'Con una sola fila mal no entra ninguna. Corrige la planilla y vuelve a subirla.'
                      : 'Nada se ha escrito todavía.'
                  }
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip tone="success">{informe.nuevos} se crean</Chip>
                  <Chip tone="info">{informe.actualizados} se actualizan</Chip>
                  {informe.errores > 0 ? (
                    <Chip tone="danger">{informe.errores} con problemas</Chip>
                  ) : null}
                  <Chip tone="neutral">{informe.total} filas en total</Chip>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 pb-4">
                  <Button
                    icon={<Check />}
                    disabled={ocupado || informe.errores > 0}
                    onClick={() => void confirmar()}
                  >
                    {informe.errores > 0
                      ? 'No se puede cargar todavía'
                      : `Cargar ${informe.total} artículo${informe.total === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </div>

              {/* Las que fallan van arriba: son las únicas sobre las que hay
                  algo que hacer, y en una planilla de trescientas filas buscar
                  tres rojas por la lista entera es trabajo inútil. */}
              <ul className="border-hairline border-t">
                {[...informe.filas]
                  .sort((a, b) =>
                    a.estado === b.estado ? a.fila - b.fila : a.estado === 'ERROR' ? -1 : 1,
                  )
                  .map((f) => {
                    const dicho = COMO_SE_DICE[f.estado] ?? COMO_SE_DICE.ERROR
                    return (
                      <li
                        key={f.fila}
                        className={cn(
                          'border-hairline flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-5 py-2.5 last:border-b-0',
                          f.estado === 'ERROR' && 'bg-danger/4',
                        )}
                      >
                        <span className="text-ink/40 tabular w-14 shrink-0 text-xs">
                          Fila {f.fila}
                        </span>
                        <Chip tone={dicho.tono}>{dicho.texto}</Chip>
                        <span className="text-ink/80 text-sm font-medium">
                          {f.codigo || '(sin código)'}
                        </span>
                        <span className="text-ink/55 min-w-0 flex-1 truncate text-sm">
                          {f.nombre}
                        </span>
                        {f.motivo ? (
                          <span className="text-danger w-full text-xs sm:w-auto sm:flex-none">
                            {f.motivo}
                          </span>
                        ) : null}
                      </li>
                    )
                  })}
              </ul>
            </Card>
          ) : null}

          {cargar.error ? <ErrorDeCarga error={cargar.error} /> : null}

          {cargado ? (
            <Card>
              <div className="flex items-start gap-3">
                <span className="text-success mt-0.5 shrink-0">
                  <Check className="size-5" />
                </span>
                <div>
                  <p className="text-ink/85 font-medium">Cargado.</p>
                  <p className="text-ink/60 mt-1 text-sm">
                    {cargado.nuevos} artículo{cargado.nuevos === 1 ? '' : 's'} nuevo
                    {cargado.nuevos === 1 ? '' : 's'} y {cargado.actualizados} actualizado
                    {cargado.actualizados === 1 ? '' : 's'}.
                  </p>
                  <Link
                    to="/app/inventario/articulos"
                    className="text-royal-600 mt-2 inline-block text-sm"
                  >
                    Ver el catálogo
                  </Link>
                </div>
              </div>
            </Card>
          ) : null}
        </div>

        {/* --------------------------------- La leyenda -------------------------------- */}
        <Card flush className="h-fit">
          <div className="px-5 pt-5">
            <CardHeader
              title="Qué va en cada columna"
              subtitle="Las que no son obligatorias se pueden dejar vacías."
            />
          </div>
          <ul className="mt-2">
            {AYUDA_COLUMNAS.map((c) => (
              <li key={c.columna} className="border-hairline border-t px-5 py-2.5">
                <div className="flex items-baseline gap-2">
                  <code className="text-ink/85 text-sm font-medium">{c.columna}</code>
                  {c.obligatoria ? (
                    <Chip tone="warning" icon={<TriangleAlert className="size-3" />}>
                      Obligatoria
                    </Chip>
                  ) : null}
                </div>
                <p className="text-ink/55 mt-0.5 text-xs">{c.dice}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
