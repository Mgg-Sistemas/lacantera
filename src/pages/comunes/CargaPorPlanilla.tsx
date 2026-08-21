import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Download, Upload, FileSpreadsheet, Check, TriangleAlert } from 'lucide-react'
import type { UseMutationResult } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { leerHoja, ErrorDePlanilla } from '@/lib/hojas/leerHoja'
import type { FilaDeHoja } from '@/lib/hojas/leerHoja'
import { descargarPlantilla } from '@/lib/hojas/plantilla'
import type { ColumnaPlantilla } from '@/lib/hojas/plantilla'
import type { InformeDeCarga } from '@/lib/api/cargaLote'

/*
  CARGAR UNA PLANILLA, SEA DE LO QUE SEA

  Artículos, personal y proveedores se cargan igual, y no por ahorrar código:
  porque quien aprendió a hacerlo una vez no tiene que aprenderlo otras dos. La
  líder pidió las tres «de la misma forma», y esta pantalla es esa forma.

  Tres pasos y se ven los tres a la vez, sin asistentes ni ventanas
  encadenadas: se baja la plantilla, se sube llena, y se confirma lo que el
  sistema entendió. La queja que dio origen a todo esto era «muchos procesos
  para hacer una funcionalidad», así que meter la carga dentro de un asistente
  de cuatro pantallas habría sido contestarla repitiéndola.

  Lo que se enseña antes de confirmar no lo calcula el navegador: es la misma
  función de la base que va a escribir, llamada en modo mirar. Así lo que se ve
  es exactamente lo que va a pasar.
*/

/** El estado de una fila, dicho como se lee. */
const COMO_SE_DICE: Record<string, { texto: string; tono: 'success' | 'info' | 'danger' }> = {
  NUEVO: { texto: 'Se crea', tono: 'success' },
  ACTUALIZA: { texto: 'Se actualiza', tono: 'info' },
  ERROR: { texto: 'No entra', tono: 'danger' },
}

type Accion = UseMutationResult<InformeDeCarga, Error, FilaDeHoja[], unknown>

export interface CargaPorPlanillaProps {
  /** «Cargar artículos por planilla». */
  titulo: string
  /** El módulo, para el rótulo de encima. */
  eyebrow: string
  descripcion: string
  /** Cómo se llaman las cosas que se cargan: «artículos», «trabajadores». */
  loQueSeCarga: string
  columnas: ColumnaPlantilla[]
  nombrePlantilla: string
  /** La columna que identifica cada fila, para avisar si la planilla no es. */
  columnaClave: string
  volverA: { a: string; etiqueta: string }
  revisar: Accion
  cargar: Accion
}

export function CargaPorPlanilla(p: CargaPorPlanillaProps) {
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaDeHoja[] | null>(null)
  const [informe, setInforme] = useState<InformeDeCarga | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string | null>(null)
  const [cargado, setCargado] = useState<InformeDeCarga | null>(null)

  const entrada = useRef<HTMLInputElement>(null)
  const ocupado = p.revisar.isPending || p.cargar.isPending

  const campos = p.columnas.map((c) => c.columna)

  /**
   * Solo viajan las columnas que la función conoce.
   *
   * Una planilla puede traer columnas de más —notas del almacenista, un total
   * calculado— y mandarlas no aportaría nada. Se recortan aquí para que lo que
   * sube sea exactamente lo que se va a interpretar.
   */
  const preparar = (crudas: FilaDeHoja[]): FilaDeHoja[] =>
    crudas
      .map((f) => {
        const limpia: FilaDeHoja = {}
        for (const campo of campos) limpia[campo] = (f[campo] ?? '').trim()
        return limpia
      })
      // Excel casi siempre arrastra filas en blanco al final. Contarlas como
      // error haría que un archivo correcto pareciera roto.
      .filter((f) => Object.values(f).some((v) => v !== ''))

  async function alElegirArchivo(archivo: File) {
    setErrorLectura(null)
    setAvisos(null)
    setInforme(null)
    setCargado(null)
    setNombreArchivo(archivo.name)

    try {
      /*
        Se le dice al lector qué busca.

        Con la clave encuentra la fila de columnas por su cuenta, así que da
        igual cuántas líneas de título lleve la plantilla encima —o cuántas
        añada quien la llena, que las añadirá—. Y con la lista completa avisa
        de las que faltan antes de mandar nada.
      */
      const hoja = await leerHoja(archivo, {
        claveEsperada: p.columnaClave,
        columnasEsperadas: campos,
      })
      const limpias = preparar(hoja.filas)

      if (limpias.length === 0) {
        setErrorLectura(
          'La planilla trae la fila de columnas pero ninguna fila con datos debajo.',
        )
        setFilas(null)
        return
      }

      // Faltar una obligatoria es no poder seguir. Faltar una opcional es que
      // esas filas se van a cargar sin ese dato, y eso hay que decirlo antes,
      // no descubrirlo cuando ya está dentro.
      const obligatoriasQueFaltan = hoja.faltan.filter(
        (c) => p.columnas.find((x) => x.columna === c)?.obligatoria,
      )
      if (obligatoriasQueFaltan.length > 0) {
        setErrorLectura(
          `A la planilla le faltan columnas que hacen falta: ${obligatoriasQueFaltan.join(', ')}. ` +
            'Vuelve a bajar la plantilla y llena esa, sin cambiarle los nombres a las columnas.',
        )
        setFilas(null)
        return
      }

      setAvisos(
        hoja.faltan.length > 0
          ? `El archivo no trae ${hoja.faltan.join(', ')}. Esas filas se cargarán sin ese dato.`
          : null,
      )

      setFilas(limpias)
      // Se revisa sola al soltar el archivo. Obligar a pulsar «Revisar» sería
      // un paso más para llegar al mismo sitio.
      setInforme(await p.revisar.mutateAsync(limpias))
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
    setCargado(await p.cargar.mutateAsync(filas))
    setInforme(null)
    setFilas(null)
    setNombreArchivo(null)
    if (entrada.current) entrada.current.value = ''
  }

  return (
    <>
      <PageHeader
        eyebrow={p.eyebrow}
        title={p.titulo}
        description={p.descripcion}
        actions={
          <Link to={p.volverA.a}>
            <Button variant="outline" size="sm" icon={<ArrowLeft />}>
              {p.volverA.etiqueta}
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
              subtitle="Trae las columnas en el orden que el sistema espera, dos filas de ejemplo, y una segunda hoja que explica qué va en cada una."
            />
            <Button
              className="mt-3"
              variant="outline"
              icon={<Download />}
              onClick={() => descargarPlantilla(p.nombrePlantilla, p.loQueSeCarga, p.columnas)}
            >
              Descargar plantilla
            </Button>
            <p className="text-ink/45 mt-2 text-xs">
              Es un archivo de Excel con dos hojas: la que se llena y otra con las
              instrucciones. Al terminar, guárdala como está.
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
              <Button icon={<Upload />} disabled={ocupado} onClick={() => entrada.current?.click()}>
                Elegir archivo
              </Button>
              {nombreArchivo ? (
                <span className="text-ink/60 inline-flex items-center gap-1.5 text-sm">
                  <FileSpreadsheet className="size-4 shrink-0" />
                  {nombreArchivo}
                </span>
              ) : null}
            </div>

            {errorLectura ? <p className="text-danger mt-3 text-sm">{errorLectura}</p> : null}
            {avisos ? <p className="text-warning mt-3 text-sm">{avisos}</p> : null}
            {p.revisar.error ? <ErrorDeCarga error={p.revisar.error} className="mt-3" /> : null}
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
                      : `Cargar ${informe.total} ${p.loQueSeCarga}`}
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
                          {f.codigo || '(sin identificar)'}
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

          {p.cargar.error ? <ErrorDeCarga error={p.cargar.error} /> : null}

          {cargado ? (
            <Card>
              <div className="flex items-start gap-3">
                <span className="text-success mt-0.5 shrink-0">
                  <Check className="size-5" />
                </span>
                <div>
                  <p className="text-ink/85 font-medium">Cargado.</p>
                  <p className="text-ink/60 mt-1 text-sm">
                    {cargado.nuevos} nuevo{cargado.nuevos === 1 ? '' : 's'} y{' '}
                    {cargado.actualizados} actualizado
                    {cargado.actualizados === 1 ? '' : 's'}.
                  </p>
                  <Link to={p.volverA.a} className="text-royal-600 mt-2 inline-block text-sm">
                    {p.volverA.etiqueta}
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
            {p.columnas.map((c) => (
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
