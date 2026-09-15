import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowLeft,
  Download,
  Upload,
  FileSpreadsheet,
  Check,
  Pencil,
  TriangleAlert,
} from 'lucide-react'
import type { UseMutationResult } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
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
  /*
    LOS COSTOS RAROS SE MIRAN ANTES DE CONFIRMAR.

    La planilla carga sus renglones con `confirmado: true`: la revisión fila por
    fila hace de confirmación, que es lo que en el formulario hace la casilla de
    cada renglón. Pero la revisión no enseñaba los costos, así que un artículo
    nuevo podía entrar a un precio disparatado sin que nadie lo mirara — el
    escenario de los cinco aceites del 5 de septiembre, por la vía de lote.

    La base ahora marca esas filas y dice cuántas son. Aquí no se deja cargar sin
    que alguien diga que las miró.
  */
  const [costosRevisados, setCostosRevisados] = useState(false)
  /*
    Y DOS COSAS MÁS QUE HAY QUE DECIR QUE SE MIRARON.

    Los parecidos: un artículo nuevo que se llama casi igual que uno del
    catálogo acaba con la existencia repartida entre dos fichas. No se para
    —DISCO DE CORTE 7 y 9 son dos—, pero se pide mirarlo.

    La planilla sin existencia: un usuario cargó 130 artículos creyendo que
    metía lo que había en el almacén, y solo entró el catálogo. Cuando ninguna
    fila trae existencia, se dice con todas las letras y se pide entenderlo.
  */
  const [parecidosRevisados, setParecidosRevisados] = useState(false)
  const [soloCatalogoEntendido, setSoloCatalogoEntendido] = useState(false)
  const [cargado, setCargado] = useState<InformeDeCarga | null>(null)
  /*
    LA FILA MALA SE CORRIGE AQUÍ, SIN VOLVER AL ARCHIVO.

    Christopher: el sistema «recibe los datos, pero no los guarda directamente,
    ofrece opción directa a editar esa fila». Antes la única salida era abrir la
    planilla, buscar la fila, arreglarla y subirla entera otra vez — por una
    moneda olvidada en una fila de trescientas.

    Lo corregido se vuelve a revisar con la misma función de la base, así que lo
    que se enseña sigue siendo lo que se va a escribir. El archivo guardado en el
    equipo no cambia, y por eso se cuentan las filas tocadas aquí: quien lo vuelva
    a subir mañana tiene que saber que trae el error de hoy.
  */
  const [corrigiendo, setCorrigiendo] = useState<{
    fila: number
    campo: string | null
    motivo: string | null
  } | null>(null)
  const [corregidas, setCorregidas] = useState<number[]>([])

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
  /*
    LAS FECHAS DE EXCEL NO SON FECHAS

    Excel no guarda «2026-01-15»: guarda 46037, el numero de dias desde el 30 de
    diciembre de 1899, y la hoja solo lo ENSEÑA como fecha. Al leer el .xlsx
    llega el numero, no el texto, asi que la planilla de personal —donde la fecha
    de ingreso es obligatoria— se rechazaba entera y quien la llenaba no podia
    saber por que: en su pantalla ponia 15/01/2026.

    Se traduce aqui, y solo en las columnas marcadas como fecha, porque un
    numero suelto en una columna de texto es un numero y no hay que tocarlo.

    Se admite tambien el formato de toda la vida —15/03/2024— porque es lo que
    escribe la gente cuando la celda esta como texto.
  */
  const enFecha = (v: string): string => {
    const t = v.trim()
    if (!t) return ''

    // El numero de serie de Excel. El origen es el 30/12/1899 y no el 1/1/1900:
    // Excel arrastra desde Lotus 1-2-3 el error de creer que 1900 fue bisiesto,
    // y esa fecha de origen es la que lo compensa.
    if (/^\d{1,6}(\.\d+)?$/.test(t)) {
      const serie = Number(t)
      // Menos de 367 es mas probable que sea un numero de verdad que una fecha
      // de 1900, y mas de 60000 se sale de cualquier fecha razonable.
      if (serie > 367 && serie < 60000) {
        const d = new Date(Date.UTC(1899, 11, 30) + serie * 86400000)
        return d.toISOString().slice(0, 10)
      }
      return t
    }

    // 15/03/2024 o 15-03-2024. El dia va primero, que es como se escribe aqui.
    const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`

    return t
  }

  const esFecha = new Set(p.columnas.filter((c) => c.fecha).map((c) => c.columna))

  const preparar = (crudas: FilaDeHoja[]): FilaDeHoja[] =>
    crudas
      .map((f) => {
        const limpia: FilaDeHoja = {}
        for (const campo of campos) {
          const bruto = (f[campo] ?? '').trim()
          limpia[campo] = esFecha.has(campo) ? enFecha(bruto) : bruto
        }
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
    setCorrigiendo(null)
    setCorregidas([])
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

      /*
        El aviso decia «esas filas se cargaran sin ese dato», y eso solo es
        cierto en un alta. En una correccion —y la planilla existe para
        corregir: «el RIF es lo que decide si la fila crea al proveedor o lo
        corrige»— una columna ausente significa que se deja lo que habia.

        Decirlo mal costo caro: las tres columnas de proveedores se pisaban con
        el valor por defecto y el aviso prometia lo contrario.
      */
      setAvisos(
        hoja.faltan.length > 0
          ? `El archivo no trae ${hoja.faltan.join(', ')}. En las filas nuevas quedarán con su valor por defecto; en las que ya existen, se respeta lo que tengan.`
          : null,
      )

      setFilas(limpias)
      // Se revisa sola al soltar el archivo. Obligar a pulsar «Revisar» sería
      // un paso más para llegar al mismo sitio.
      // Un informe nuevo trae otros costos: lo marcado sobre el anterior no vale.
      setCostosRevisados(false)
      setParecidosRevisados(false)
      setSoloCatalogoEntendido(false)
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
    setCorregidas([])
    setNombreArchivo(null)
    if (entrada.current) entrada.current.value = ''
  }

  async function guardarCorreccion(fila: number, borrador: FilaDeHoja) {
    if (!filas) return
    // Pasa por la misma limpieza que el archivo: sin espacios de sobra y con
    // las fechas traducidas. `?? borrador` es la fila que se dejó toda vacía,
    // que la base rechazará diciendo qué falta.
    const nueva = preparar([borrador])[0] ?? borrador
    const nuevas = filas.map((f, i) => (i === fila - 1 ? nueva : f))
    setFilas(nuevas)
    setCorrigiendo(null)
    setCorregidas((antes) => (antes.includes(fila) ? antes : [...antes, fila]))
    // Un informe nuevo trae otros costos: lo marcado sobre el anterior no vale.
    setCostosRevisados(false)
    setParecidosRevisados(false)
    setSoloCatalogoEntendido(false)
    try {
      setInforme(await p.revisar.mutateAsync(nuevas))
    } catch {
      // El error ya se enseña bajo el archivo. El informe viejo no describe las
      // filas nuevas, así que no se deja a la vista.
      setInforme(null)
    }
  }

  /* «Es el mismo»: la fila pasa a corregir el artículo que ya está, en vez de crear otro. */
  const usarElQueYaEsta = (fila: number, codigo: string) => {
    if (!filas) return
    void guardarCorreccion(fila, { ...(filas[fila - 1] ?? {}), codigo })
  }

  // Solo la planilla de artículos cuenta la existencia; en las otras no aplica.
  const soloCatalogo = informe != null && informe.errores === 0 && informe.con_existencia === 0
  const faltaMirar =
    informe != null &&
    (((informe.avisos_de_costo ?? 0) > 0 && !costosRevisados) ||
      ((informe.avisos_de_parecido ?? 0) > 0 && !parecidosRevisados) ||
      (soloCatalogo && !soloCatalogoEntendido))

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
                      ? 'Con una sola fila mal no entra ninguna. Corrígela aquí con «Corregir», o en el archivo y súbelo otra vez.'
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
                  {(informe.con_existencia ?? 0) > 0 ? (
                    <Chip tone="royal">{informe.con_existencia} con existencia</Chip>
                  ) : null}
                </div>

                {corregidas.length > 0 ? (
                  <p className="text-ink/55 mt-3 text-xs">
                    {corregidas.length === 1
                      ? 'Corregiste 1 fila aquí.'
                      : `Corregiste ${corregidas.length} filas aquí.`}{' '}
                    Se carga con la corrección, pero el archivo que tienes guardado sigue como
                    estaba.
                  </p>
                ) : null}

                {(informe.avisos_de_costo ?? 0) > 0 && informe.errores === 0 ? (
                  <label
                    className={`mt-4 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm ${
                      costosRevisados ? 'border-hairline' : 'border-warning/30 bg-warning-soft'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-royal-600 mt-0.5 size-4 shrink-0"
                      checked={costosRevisados}
                      onChange={(e) => setCostosRevisados(e.target.checked)}
                    />
                    <span className="text-ink/80">
                      {informe.avisos_de_costo === 1
                        ? 'Revisé el costo marcado abajo'
                        : `Revisé los ${informe.avisos_de_costo} costos marcados abajo`}
                      <span className="text-ink/50 mt-0.5 block text-xs">
                        Lo que entra por primera vez pasa a ser la referencia de todo lo que
                        venga después, y un cero de más no lo corrige nadie. Compruébalos con
                        la factura antes de cargar.
                      </span>
                    </span>
                  </label>
                ) : null}

                {(informe.avisos_de_parecido ?? 0) > 0 && informe.errores === 0 ? (
                  <label
                    className={`mt-3 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm ${
                      parecidosRevisados ? 'border-hairline' : 'border-warning/30 bg-warning-soft'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-royal-600 mt-0.5 size-4 shrink-0"
                      checked={parecidosRevisados}
                      onChange={(e) => setParecidosRevisados(e.target.checked)}
                    />
                    <span className="text-ink/80">
                      {informe.avisos_de_parecido === 1
                        ? 'Revisé el artículo nuevo que se parece a uno del catálogo'
                        : `Revisé los ${informe.avisos_de_parecido} artículos nuevos que se parecen a uno del catálogo`}
                      <span className="text-ink/50 mt-0.5 block text-xs">
                        Si es el mismo, pulsa «Es el mismo» en su fila y se actualiza ese en vez
                        de crear otro. Dos fichas del mismo artículo acaban con la existencia
                        repartida y ninguna cuadra.
                      </span>
                    </span>
                  </label>
                ) : null}

                {soloCatalogo ? (
                  <label
                    className={`mt-3 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm ${
                      soloCatalogoEntendido ? 'border-hairline' : 'border-warning/30 bg-warning-soft'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-royal-600 mt-0.5 size-4 shrink-0"
                      checked={soloCatalogoEntendido}
                      onChange={(e) => setSoloCatalogoEntendido(e.target.checked)}
                    />
                    <span className="text-ink/80">
                      Entendido: esta planilla solo carga el catálogo, sin existencia
                      <span className="text-ink/50 mt-0.5 block text-xs">
                        Ninguna fila dice cuánto hay en un almacén, así que los artículos quedan
                        creados con cero. Si querías meter lo que hay, llena almacén, cantidad,
                        costo y moneda en cada fila y vuelve a subirla.
                      </span>
                    </span>
                  </label>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2 pb-4">
                  <Button
                    icon={<Check />}
                    disabled={ocupado || informe.errores > 0 || faltaMirar}
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
                          f.estado !== 'ERROR' && f.aviso && 'bg-warning-soft',
                        )}
                      >
                        <span className="text-ink/40 tabular w-14 shrink-0 text-xs">
                          Fila {f.fila}
                        </span>
                        <Chip tone={dicho.tono}>{dicho.texto}</Chip>
                        {f.estado !== 'ERROR' && corregidas.includes(f.fila) ? (
                          <Chip tone="neutral">Corregida aquí</Chip>
                        ) : null}
                        <span className="text-ink/80 text-sm font-medium">
                          {/* Sin código en una fila nueva no es un problema: la
                              base le pone uno al guardar. Solo es «sin
                              identificar» cuando la fila además falló. */}
                          {f.codigo || (f.estado === 'NUEVO' ? '(se le pondrá uno)' : '(sin identificar)')}
                        </span>
                        <span className="text-ink/55 min-w-0 flex-1 truncate text-sm">
                          {f.nombre}
                        </span>
                        {f.motivo ? (
                          <span className="text-danger w-full text-xs sm:w-auto sm:flex-none">
                            {f.motivo}
                          </span>
                        ) : null}
                        {f.estado === 'ERROR' && filas ? (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Pencil />}
                            className="sm:ml-auto"
                            disabled={ocupado}
                            onClick={() =>
                              setCorrigiendo({
                                fila: f.fila,
                                campo: f.campo ?? null,
                                motivo: f.motivo,
                              })
                            }
                          >
                            Corregir
                          </Button>
                        ) : null}
                        {/* El aviso no impide cargar: es lo que hay que mirar
                            antes de confirmar. Dos artículos casi iguales
                            acaban con la existencia repartida entre los dos y
                            ninguno cuadrando. */}
                        {!f.motivo && f.aviso ? (
                          <span className="text-ink/70 w-full text-xs sm:w-auto sm:flex-none">
                            {f.aviso}
                          </span>
                        ) : null}
                        {f.estado === 'NUEVO' && f.parecido_codigo && filas ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="sm:ml-auto"
                            disabled={ocupado}
                            onClick={() => usarElQueYaEsta(f.fila, f.parecido_codigo!)}
                          >
                            Es el mismo ({f.parecido_codigo})
                          </Button>
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

      {corrigiendo && filas ? (
        <CorregirFila
          key={corrigiendo.fila}
          fila={corrigiendo.fila}
          campo={corrigiendo.campo}
          motivo={corrigiendo.motivo}
          valores={filas[corrigiendo.fila - 1] ?? {}}
          columnas={p.columnas}
          ocupado={p.revisar.isPending}
          onCerrar={() => setCorrigiendo(null)}
          onGuardar={(borrador) => void guardarCorreccion(corrigiendo.fila, borrador)}
        />
      ) : null}
    </>
  )
}

/*
  LA FILA, CASILLA POR CASILLA

  Las mismas columnas de la plantilla y con las mismas listas: donde el archivo
  ofrecía un desplegable, aquí también, para que la corrección no pueda escribir
  lo que la planilla no admitía.

  La casilla del problema va primero, con el motivo debajo y el cursor dentro,
  cuando la base sabe cuál es. Cuando no lo sabe —«hay un número que no se
  entiende»— el motivo va arriba y se enseña la fila entera.
*/
function CorregirFila({
  fila,
  campo,
  motivo,
  valores,
  columnas,
  ocupado,
  onCerrar,
  onGuardar,
}: {
  fila: number
  campo: string | null
  motivo: string | null
  valores: FilaDeHoja
  columnas: ColumnaPlantilla[]
  ocupado: boolean
  onCerrar: () => void
  onGuardar: (borrador: FilaDeHoja) => void
}) {
  const [borrador, setBorrador] = useState<FilaDeHoja>(() => ({ ...valores }))
  const base = useId()

  const conocida = campo != null && columnas.some((c) => c.columna === campo)
  const orden = conocida
    ? [
        ...columnas.filter((c) => c.columna === campo),
        ...columnas.filter((c) => c.columna !== campo),
      ]
    : columnas

  // El cursor va a la casilla del problema al abrir. Va después del foco que
  // pone el modal en su panel: los efectos del hijo corren antes que los de
  // quien lo monta.
  const idDelProblema = conocida ? `${base}-${campo}` : null
  useEffect(() => {
    if (idDelProblema) document.getElementById(idDelProblema)?.focus()
  }, [idDelProblema])

  const poner = (columna: string, valor: string) =>
    setBorrador((b) => ({ ...b, [columna]: valor }))

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo={`Corregir la fila ${fila}`}
      descripcion="Vale solo para esta carga y se vuelve a revisar al instante. No se guarda nada hasta que pulses «Cargar»."
      acciones={
        <>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button icon={<Check />} disabled={ocupado} onClick={() => onGuardar(borrador)}>
            Revisar otra vez
          </Button>
        </>
      }
    >
      {motivo && !conocida ? <p className="text-danger mb-4 text-sm">{motivo}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {orden.map((c) => {
          const esElProblema = conocida && c.columna === campo
          const valor = borrador[c.columna] ?? ''
          const comun = {
            id: `${base}-${c.columna}`,
            label: c.columna,
            value: valor,
            error: esElProblema ? (motivo ?? undefined) : undefined,
            className: esElProblema ? 'sm:col-span-2' : undefined,
          }

          if (c.opciones && c.opciones.length > 0) {
            const opciones = c.opciones.map((o) => ({ valor: o, etiqueta: o }))
            // Lo que el archivo trae y la lista no —mal escrito, o de una
            // plantilla vieja— se enseña tal cual. Si no, el desplegable lo
            // cambiaría en silencio por otro valor.
            if (valor !== '' && !c.opciones.includes(valor)) {
              opciones.unshift({ valor, etiqueta: valor })
            }
            return (
              <Select
                key={c.columna}
                {...comun}
                opciones={opciones}
                vacio="Vacía"
                onChange={(e) => poner(c.columna, e.target.value)}
              />
            )
          }

          return (
            <Input
              key={c.columna}
              {...comun}
              // Tal como la trae la planilla: la base ya pone la mayúscula al
              // guardar, y un número o una fecha no se tocan.
              sinNormalizar
              onChange={(e) => poner(c.columna, e.target.value)}
            />
          )
        })}
      </div>
    </Modal>
  )
}
