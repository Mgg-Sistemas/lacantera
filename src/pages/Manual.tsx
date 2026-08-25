import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { enMayuscula } from '@/lib/texto'
import { esModuloEnObra } from '@/config/navigation'
import './manual.css'
/*
  El manual entra como texto, no como componentes.

  Lo escribe scripts/manual-a-html.mjs desde docs/manual-de-usuario.md, que es
  donde vive el manual de verdad. Convertirlo a JSX obligaria a mantener las
  mismas 4.700 lineas en dos sitios, y el dia que se desincronicen gana el que
  nadie esta leyendo.

  Viaja en su propio trozo del paquete, con el resto de esta pantalla: son 500
  kB que no tiene por que descargar quien entra a registrar una salida de
  almacen.
*/
import manualHtml from './manual.generado.html?raw'

interface Capitulo {
  id: string
  numero: string
  nombre: string
  /** Este capitulo habla de algo que hoy no se corresponde con el sistema. */
  aviso?: string
}

/*
  LOS CAPITULOS QUE HOY NO SE CORRESPONDEN CON EL SISTEMA

  El manual describe el sistema entero, y hay modulos que todavia no se ofrecen
  —el menu los esconde— y uno, Tesoreria, que directamente dejo de existir: la
  absorbio Compras.

  Publicar el manual sin decirlo seria darle a quien empieza cuatrocientas
  paginas donde cinco capitulos hablan de pantallas que no puede abrir, y una de
  un departamento que no existe. La primera vez que alguien busque «cuentas por
  cobrar» y no encuentre el menu, va a dejar de creerle al manual entero — y el
  manual es lo unico que tiene quien acaba de entrar.

  No se borran los capitulos: el trabajo esta hecho y vale para el dia que el
  modulo salga. Se marcan.

  Se ata por NOMBRE de capitulo y no por numero para que renumerar el manual no
  lo rompa en silencio; y la condicion se pregunta a `esModuloEnObra`, que sale
  del propio menu, para que el aviso se caiga solo el dia que el modulo vuelva
  al riel.
*/
const MODULO_DEL_CAPITULO: Record<string, string> = {
  Explotación: 'EXPLOTACION',
  Despachos: 'DESPACHOS',
  Ventas: 'VENTAS',
  Tesorería: 'TESORERIA',
  Asignaciones: 'ASIGNACIONES',
}

/** Tesoreria no es «todavia no»: es «ya no». Merece su propia frase. */
const AVISO_TESORERIA =
  'Tesorería ya no existe en La Cantera: Compras absorbió su función. Este capítulo está pendiente de reescribir. Los pagos de una compra se hacen hoy desde Compras › Pagos por hacer, y el libro del dinero desde Compras › Movimientos de dinero.'

const AVISO_EN_OBRA =
  'Este módulo todavía no está en el sistema: el menú no lo ofrece. El capítulo se queda como referencia de cómo va a funcionar cuando entre.'

function avisoDelCapitulo(nombre: string): string | undefined {
  const modulo = MODULO_DEL_CAPITULO[nombre.trim()]
  if (!modulo || !esModuloEnObra(modulo)) return undefined
  return modulo === 'TESORERIA' ? AVISO_TESORERIA : AVISO_EN_OBRA
}

interface Hallazgo {
  /** Lo que se muestra en la lista de resultados. */
  texto: string
  /** De donde salio: una seccion del manual o un mensaje del sistema. */
  donde: string
  /** A donde lleva al pulsarlo. */
  id: string
}

/** Mayusculas y sin tildes en los dos lados, para que «nomina» encuentre «Nómina». */
const compara = (texto: string) => enMayuscula(texto.toLowerCase())

export function Manual() {
  const contenido = useRef<HTMLDivElement>(null)
  const [capitulos, setCapitulos] = useState<Capitulo[]>([])
  const [buscable, setBuscable] = useState<Hallazgo[]>([])
  const [activo, setActivo] = useState('')
  const [busqueda, setBusqueda] = useState('')

  /*
    El indice se lee del documento ya montado en vez de generarse aparte.

    Es un archivo mas que no hay que mantener sincronizado: si el manual gana un
    capitulo, el riel lo muestra sin tocar nada.
  */
  useEffect(() => {
    const raiz = contenido.current
    if (!raiz) return

    const secciones = Array.from(raiz.querySelectorAll<HTMLElement>('section.cap'))

    const leidos = secciones
      .filter((s) => s.dataset.cap)
      .map((s) => {
        const nombre = s.querySelector('.cap-tit span:last-child')?.textContent?.trim() ?? ''
        return { seccion: s, id: s.id, numero: s.dataset.cap ?? '', nombre, aviso: avisoDelCapitulo(nombre) }
      })

    /*
      El aviso se mete en el documento, no encima de él: así viaja también al
      PDF. Quien imprima el capítulo de Ventas para repartirlo tiene que
      llevárselo con la advertencia puesta, o el papel dirá que existe algo que
      no existe.

      Con guarda de idempotencia porque en desarrollo el efecto corre dos veces
      y si no saldría el aviso duplicado.
    */
    for (const c of leidos) {
      if (!c.aviso || c.seccion.querySelector('.cap-aviso')) continue
      const banda = document.createElement('p')
      banda.className = 'cap-aviso'
      banda.textContent = c.aviso
      c.seccion.querySelector('.cap-tit')?.after(banda)
    }

    setCapitulos(leidos.map(({ id, numero, nombre, aviso }) => ({ id, numero, nombre, aviso })))

    const encontrables: Hallazgo[] = []

    for (const h of raiz.querySelectorAll<HTMLElement>('h2.cap-tit, h3, h4')) {
      const seccion = h.closest<HTMLElement>('section.cap')
      if (!seccion) continue
      encontrables.push({
        texto: h.textContent?.trim() ?? '',
        donde: 'Sección',
        id: h.id || seccion.id,
      })
    }

    /*
      Los mensajes de error se buscan aparte porque son la consulta mas comun:
      alguien tiene una franja roja en pantalla y quiere saber que hacer. Sin
      esto habria que adivinar en que capitulo esta.
    */
    for (const fila of raiz.querySelectorAll<HTMLElement>('table.tabla-mensajes tbody tr')) {
      const primera = fila.querySelector('td')
      const seccion = fila.closest<HTMLElement>('section.cap')
      if (!primera || !seccion) continue
      const capitulo = seccion.querySelector('.cap-tit span:last-child')?.textContent?.trim() ?? ''
      encontrables.push({
        texto: primera.textContent?.trim() ?? '',
        donde: `Mensaje · ${capitulo}`,
        id: seccion.id,
      })
    }

    setBuscable(encontrables)
  }, [])

  /** Marca en el riel el capitulo que se esta leyendo. */
  useEffect(() => {
    const raiz = contenido.current
    if (!raiz || !capitulos.length) return

    const secciones = Array.from(raiz.querySelectorAll<HTMLElement>('section.cap[data-cap]'))
    const visibles = new Map<string, boolean>()

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visibles.set(e.target.id, e.isIntersecting)
        const primero = secciones.find((s) => visibles.get(s.id))
        if (primero) setActivo(primero.id)
      },
      { rootMargin: '-10% 0px -70% 0px' },
    )

    for (const s of secciones) observador.observe(s)
    return () => observador.disconnect()
  }, [capitulos])

  const hallazgos = useMemo(() => {
    const termino = compara(busqueda.trim())
    if (termino.length < 2) return []
    return buscable.filter((h) => compara(h.texto).includes(termino)).slice(0, 30)
  }, [busqueda, buscable])

  const irA = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setBusqueda('')
  }

  const buscando = busqueda.trim().length >= 2

  return (
    <>
      <PageHeader
        title="Manual de usuario"
        description="Cómo se usa el sistema, explicado para quien trabaja con él todos los días. Se puede leer aquí, buscar por un mensaje de error, o descargarlo en PDF para repartirlo en el patio."
        actions={
          /*
            Dice PDF y no «Imprimir» porque es lo que la gente viene a buscar, y
            porque con «Imprimir» nadie adivinaba que de ahí salía el archivo.

            Por dentro sigue siendo el diálogo del navegador, y es a propósito:
            el manual son cuatrocientas páginas con tablas y diagramas, y
            armarlas con jsPDF daría un resultado peor que el que ya da el
            navegador con la hoja de estilos de impresión —que además parte cada
            capítulo en su hoja, para poder repartir solo el que le toca a cada
            quien—. El `title` dice qué hacer por si el destino no viene puesto.
          */
          <Button
            variant="outline"
            icon={<Download />}
            title="Abre el diálogo de impresión. Elige «Guardar como PDF» como destino."
            onClick={() => window.print()}
          >
            Descargar en PDF
          </Button>
        }
      />

      <div className="flex flex-col gap-8 pb-16 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="relative mb-8 max-w-md">
            <Input
              label="Buscar"
              type="search"
              sinNormalizar
              icon={<Search />}
              placeholder="Un mensaje de error o un tema"
              hint="Busca en los títulos y en los mensajes que muestra el sistema."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />

            {buscando ? (
              <div className="border-ink/15 rounded-card bg-surface shadow-popover absolute inset-x-0 top-[4.6rem] z-20 max-h-96 overflow-y-auto border">
                {hallazgos.length ? (
                  <ul>
                    {hallazgos.map((h, n) => (
                      <li key={`${h.id}-${n}`}>
                        <button
                          type="button"
                          onClick={() => irA(h.id)}
                          className="border-hairline hover:bg-canvas block w-full border-b px-3 py-2 text-left last:border-b-0"
                        >
                          <span className="text-ink/85 block text-sm">{h.texto}</span>
                          <span className="text-ink/50 mt-0.5 block text-xs">{h.donde}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink/50 px-3 py-3 text-sm">Nada coincide con esa búsqueda.</p>
                )}
              </div>
            ) : null}
          </div>

          {/*
            Contenido de nuestro propio repositorio, generado en la compilación
            desde el markdown del manual. No hay nada aquí que venga de un
            usuario ni de la base, que es lo que haría peligroso este montaje.
          */}
          <div
            ref={contenido}
            className="manual"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: manualHtml }}
          />
        </div>

        {/*
          El riel va a la derecha: a la izquierda ya está el menú del sistema, y
          dos columnas de navegación pegadas se leen como una sola rota.
        */}
        <nav
          aria-label="Capítulos del manual"
          className="border-hairline sticky top-6 hidden w-56 shrink-0 border-l pl-4 xl:block"
        >
          <p className="text-ink/45 mb-2 text-2xs font-semibold tracking-[0.12em] uppercase">
            Capítulos
          </p>
          <ul className="max-h-[calc(100svh-9rem)] space-y-0.5 overflow-y-auto">
            {capitulos.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => irA(c.id)}
                  className={
                    activo === c.id
                      ? 'text-royal-600 dark:text-royal-300 flex w-full gap-2 rounded px-1.5 py-1 text-left text-sm font-medium'
                      : 'text-ink/65 hover:text-ink/90 hover:bg-ink/5 flex w-full gap-2 rounded px-1.5 py-1 text-left text-sm'
                  }
                >
                  <span className="tabular text-ink/40 w-4 shrink-0 text-xs leading-5">
                    {c.numero}
                  </span>
                  <span className="min-w-0">
                    {c.nombre}
                    {/* En el riel basta un punto: el porqué está arriba del
                        capítulo, que es donde se va a leer. */}
                    {c.aviso ? (
                      <span className="text-warning ml-1.5" title={c.aviso} aria-label={c.aviso}>
                        ·
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  )
}
