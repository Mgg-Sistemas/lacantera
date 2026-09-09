import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  History,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  POR_PAGINA,
  TONO,
  VERBOS,
  cambiosDeFondo,
  camposApartados,
  camposOrdenados,
  camposSinCambiar,
  copiarEvento,
  jsonDeEvento,
  narracion,
  nombreApuntado,
  nombreDeCampo,
  nombreDeTabla,
  useAuditoria,
  textoDeEvento,
  useNombresDeAuditoria,
  useTablasAuditadas,
  valorLegible,
  useModulosAuditados,
  copiarAuditoriaCsv,
  copiarAuditoriaJson,
  TOPE_DE_COPIA,
} from '@/lib/api/auditoria'
import type {
  FiltrosAuditoria,
  Movimiento,
  NombresApuntados,
  Operacion,
} from '@/lib/api/auditoria'
import { usePerfiles } from '@/lib/api/catalogo'
import { usePresencia } from '@/lib/api/usuarios'
import { fechaHora, hace } from '@/lib/formato'
import { cn } from '@/lib/cn'

const OPERACIONES: { valor: Operacion; etiqueta: string }[] = [
  { valor: 'INSERT', etiqueta: 'Creaciones' },
  { valor: 'UPDATE', etiqueta: 'Modificaciones' },
  { valor: 'DELETE', etiqueta: 'Borrados' },
  { valor: 'ACCESO', etiqueta: 'Entradas al sistema' },
  { valor: 'CLAVE', etiqueta: 'Cambios de clave' },
]

const sinFiltros: FiltrosAuditoria = {
  desde: '',
  hasta: '',
  usuario_id: '',
  tabla: '',
  operacion: '',
  texto: '',
}

/*
  LA FRASE DE UNA LÍNEA: QUÉ HIZO Y SOBRE QUÉ, CON NOMBRE.

  Decía «Creó articulo presentaciones», que describe el esquema y no el hecho.
  Ahora dice «Creó una forma de contar · BOTAS DE SEGURIDAD · Barril»: el verbo,
  la cosa en palabras, y la etiqueta que la identifica.

  Las tablas hijas llevan su propio nombre porque el de la tabla no se puede
  leer: «articulo presentaciones» no es castellano, y «renglón de cotización» sí.
*/
const EN_PALABRAS: Record<string, string> = {
  articulo_presentaciones: 'una forma de contar un artículo',
  cotizacion_renglones: 'un renglón de cotización',
  orden_renglones: 'un renglón de pedido',
  nomina_recibos: 'un recibo de nómina',
  nomina_faltas: 'una falta',
  nomina_novedades: 'una novedad de nómina',
  horometro_lecturas: 'una lectura de horómetro',
  inventario_movimientos: 'un movimiento de inventario',
  tasas_cambio: 'una tasa del día',
  autorizaciones: 'una autorización',
  instrucciones_pago: 'una instrucción de pago',
  compras_bitacora: 'una anotación de compras',
}

function frase(m: Movimiento): string {
  if (m.operacion === 'ACCESO') return 'Entró al sistema'
  if (m.operacion === 'CLAVE') return 'Cambió una clave'
  const cosa = EN_PALABRAS[m.tabla] ?? nombreDeTabla(m.tabla).toLowerCase()
  return `${VERBOS[m.operacion]} ${cosa}${m.etiqueta ? ` · ${m.etiqueta}` : ''}`
}

/**
 * Quien esta en el sistema ahora mismo.
 *
 * Va en Auditoria y no en Usuarios a proposito: esta lista no sirve para
 * administrar a nadie, sirve para saber quien esta trabajando —a quien se le
 * puede preguntar algo, y quien pudo hacer lo que se acaba de ver en el
 * registro de abajo—. Es la misma pregunta que responde el resto de esta
 * pantalla, pero en presente.
 *
 * EN LINEA ES UNA VENTANA DE CINCO MINUTOS, y conviene saberlo al leerla. El
 * navegador manda una señal cada dos, asi que se puede perder una sin que la
 * persona desaparezca; pero nadie se apaga en el momento exacto en que cierra.
 */
function QuienEstaConectado() {
  const { data, isPending } = usePresencia()

  const gente = data ?? []
  const dentro = gente.filter((p) => p.en_linea)
  const fuera = gente.filter((p) => !p.en_linea)

  return (
    <Card className="mb-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink/90 text-base font-semibold">Quién está en el sistema</h2>
        <span className="text-ink/45 text-xs">
          {isPending
            ? 'Cargando…'
            : dentro.length === 0
              ? 'Nadie conectado ahora'
              : `${dentro.length} de ${gente.length} conectad${dentro.length === 1 ? 'o' : 'os'}`}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {dentro.map((p) => (
          <span
            key={p.id}
            className="border-success/30 bg-success/10 rounded-card flex items-center gap-2 border px-2.5 py-1.5"
          >
            {/*
              El punto es el dato, no el adorno: es lo que se busca al abrir
              esta tarjeta. Con `animate-pulse` diria «en vivo», que seria
              prometer mas de lo que hay — la ventana es de cinco minutos.
            */}
            <span className="bg-success size-2 shrink-0 rounded-full" />
            <span className="min-w-0">
              <span className="text-ink/85 block text-sm">{p.nombre}</span>
              {p.cargo ? <span className="text-ink/45 block text-2xs">{p.cargo}</span> : null}
            </span>
          </span>
        ))}

        {dentro.length === 0 && !isPending ? (
          <p className="text-ink/50 text-sm">
            Nadie tiene el sistema abierto en este momento.
          </p>
        ) : null}
      </div>

      {fuera.length > 0 ? (
        <div className="border-hairline mt-3 border-t pt-3">
          <p className="text-ink/45 text-2xs mb-2 tracking-wide uppercase">
            Los demás, y cuándo se les vio
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {fuera.map((p) => (
              <span key={p.id} className="text-ink/60 text-xs">
                {p.nombre}{' '}
                <span className="text-ink/40">
                  {/*
                    `visto_en` es cuando se le vio; `ultimo_acceso` es cuando
                    entro. Se prefiere el primero y se cae al segundo, que es lo
                    unico que hay de quien no ha vuelto a entrar desde que
                    existe la señal. Sin ninguno de los dos, no se inventa nada.
                  */}
                  {p.visto_en
                    ? hace(p.visto_en)
                    : p.ultimo_acceso
                      ? `entró ${hace(p.ultimo_acceso)}`
                      : 'sin registro'}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  )
}

export function Auditoria() {
  const modulos = useModulosAuditados()
  const [filtros, setFiltros] = useState<FiltrosAuditoria>(sinFiltros)
  const [copiando, setCopiando] = useState<'csv' | 'json' | null>(null)
  const [avisoCopia, setAvisoCopia] = useState<string | null>(null)

  /*
    Se dice CUÁNTOS renglones se llevó, y se avisa si llegó al tope.

    Una descarga que sale sin decir nada deja a quien la pidió sin saber si
    trajo tres renglones o tres mil, ni si se quedó corta. Y una copia
    incompleta y silenciosa es peor que ninguna: se usa para defender algo y
    falta justo lo que faltaba.
  */
  const copiar = async (formato: 'csv' | 'json') => {
    setCopiando(formato)
    setAvisoCopia(null)
    try {
      const n = formato === 'csv'
        ? await copiarAuditoriaCsv(filtros)
        : await copiarAuditoriaJson(filtros)
      setAvisoCopia(
        n >= TOPE_DE_COPIA
          ? `Se llevó ${n.toLocaleString('es-VE')} renglones, que es el tope. Acota las fechas para llevarte el resto.`
          : `${n.toLocaleString('es-VE')} renglones.`,
      )
    } catch (e) {
      setAvisoCopia(e instanceof Error ? e.message : 'No se pudo preparar la copia.')
    } finally {
      setCopiando(null)
    }
  }
  const [pagina, setPagina] = useState(0)
  const [detalle, setDetalle] = useState<Movimiento | null>(null)

  const { data, isPending, error } = useAuditoria(filtros, pagina)
  const tablas = useTablasAuditadas()
  const perfiles = usePerfiles()

  const cambiar = (c: Partial<FiltrosAuditoria>) => {
    setFiltros((f) => ({ ...f, ...c }))
    // Cambiar un filtro estando en la página 4 devolvería una lista vacía con
    // resultados detrás. Se vuelve al principio.
    setPagina(0)
  }

  const hayFiltro = useMemo(
    () => Object.values(filtros).some((v) => v !== '' && v !== undefined),
    [filtros],
  )

  const total = data?.total ?? 0
  const ultima = Math.max(0, Math.ceil(total / POR_PAGINA) - 1)

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Todo lo que se escribe en el sistema queda aquí, con la fecha, la hora y quién lo hizo. Esta pantalla la abre solo la administración."
      />

      <QuienEstaConectado />

      {/* ------------------------------ Filtros ------------------------------ */}
      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Buscar"
            placeholder="Nombre, usuario, número de documento"
            icon={<Search />}
            sinNormalizar
            value={filtros.texto ?? ''}
            onChange={(e) => cambiar({ texto: e.target.value })}
          />
          <Select
            label="Quién"
            vacio="Cualquiera"
            value={filtros.usuario_id ?? ''}
            onChange={(e) => cambiar({ usuario_id: e.target.value })}
            opciones={(perfiles.data ?? []).map((p) => ({
              valor: p.id,
              etiqueta: `${p.nombre} (${p.usuario})`,
            }))}
          />
          <Select
            label="Qué hizo"
            vacio="Todo"
            value={filtros.operacion ?? ''}
            onChange={(e) => cambiar({ operacion: e.target.value })}
            opciones={OPERACIONES.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
          />
          {/*
            EL MÓDULO VA ANTES QUE LA TABLA, y no es orden alfabético.

            «¿Qué pasó ayer en Nómina?» es la pregunta que se hace de verdad;
            «¿qué pasó en nomina_novedades_montos?» la hace quien ya sabe dónde
            mirar. Poner primero lo ancho deja que quien no sabe llegue igual.
          */}
          <Select
            label="En qué módulo"
            vacio="Todo el sistema"
            value={filtros.modulo ?? ''}
            onChange={(e) => cambiar({ modulo: e.target.value })}
            opciones={(modulos.data ?? []).map((m) => ({ valor: m, etiqueta: m }))}
          />
          <Select
            label="Sobre qué"
            vacio="Todo"
            value={filtros.tabla ?? ''}
            onChange={(e) => cambiar({ tabla: e.target.value })}
            opciones={(tablas.data ?? []).map((t) => ({ valor: t, etiqueta: nombreDeTabla(t) }))}
          />
          <Input
            label="Desde"
            type="date"
            value={filtros.desde ?? ''}
            onChange={(e) => cambiar({ desde: e.target.value })}
          />
          <Input
            label="Hasta"
            type="date"
            value={filtros.hasta ?? ''}
            onChange={(e) => cambiar({ hasta: e.target.value })}
          />
        </div>

        {/* Va con los filtros y no en un menú aparte porque cambia lo que se
            está contando justo debajo, y eso hay que verlo sin buscarlo. */}
        <label className="text-ink/70 mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            className="accent-royal-600 size-4 rounded"
            checked={filtros.incluirSistema ?? false}
            onChange={(e) => cambiar({ incluirSistema: e.target.checked || undefined })}
          />
          Mostrar también lo que hizo el sistema
        </label>

        {/*
          LLEVARSE UNA COPIA DE LO QUE SE ESTÁ MIRANDO.

          Van aquí, con los filtros, porque lo que se descarga es exactamente lo
          que los filtros dicen — no la página que cabe en el cristal. Ponerlos
          arriba, junto al título, sugeriría que bajan «el registro» entero y
          entonces la copia no sería la que alguien creyó pedir.

          Son dos porque son dos preguntas distintas. La hoja de cálculo se abre
          para leer y para pasarle algo a alguien; el JSON lleva el `antes` y el
          `después` enteros y es el que sirve para averiguar qué pasó de verdad.
        */}
        <div className="border-hairline mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="text-ink/55 mr-1 text-sm">Llevarse una copia:</span>
          <Button
            size="sm"
            variant="outline"
            icon={<Download />}
            disabled={copiando !== null}
            onClick={() => copiar('csv')}
          >
            {copiando === 'csv' ? 'Preparando…' : 'Hoja de cálculo'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Download />}
            disabled={copiando !== null}
            onClick={() => copiar('json')}
          >
            {copiando === 'json' ? 'Preparando…' : 'JSON con el detalle'}
          </Button>
          {avisoCopia ? <span className="text-ink/55 text-xs">{avisoCopia}</span> : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-ink/50 text-sm">
            {isPending
              ? 'Contando…'
              : total === 0
                ? 'Ningún movimiento con estos filtros'
                : `${total.toLocaleString('es-VE')} ${total === 1 ? 'movimiento' : 'movimientos'}`}
          </p>
          {hayFiltro ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<X />}
              onClick={() => {
                setFiltros(sinFiltros)
                setPagina(0)
              }}
            >
              Quitar filtros
            </Button>
          ) : null}
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.filas.length === 0 ? (
        <Card>
          <Vacio
            icono={<History />}
            titulo={hayFiltro ? 'Nada con esos filtros' : 'Todavía no hay movimientos anotados'}
            descripcion={
              hayFiltro
                ? 'Prueba con un rango de fechas más amplio o quita algún filtro.'
                : 'El registro empieza a llenarse desde que se activó. Lo que pasó antes de eso no está aquí, y no se puede inventar.'
            }
          />
        </Card>
      ) : null}

      {data && data.filas.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Cuándo</th>
                  <th className="px-3 py-3 font-medium">Quién</th>
                  <th className="px-3 py-3 font-medium">Qué hizo</th>
                  <th className="px-3 py-3 font-medium">Sobre qué</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((m) => (
                  <tr key={m.id} className="border-hairline border-b last:border-0">
                    <td className="text-ink/70 tabular px-5 py-3 text-xs whitespace-nowrap">
                      {fechaHora(m.ocurrido_en)}
                    </td>
                    <td className="px-3 py-3">
                      {/* El nombre se guardó en el momento. Si esa persona se
                          cambió el nombre después, aquí sigue el de entonces —
                          que es lo correcto en un registro de auditoría. */}
                      <span className="text-ink/85 font-medium">{m.nombre ?? m.usuario}</span>
                      <span className="text-ink/45 block text-xs">{m.usuario}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Chip tone={TONO[m.operacion]}>{frase(m)}</Chip>
                      {/* El módulo debajo y en pequeño, no en columna propia: la
                          tabla ya tiene cinco y una sexta la parte en pantallas
                          estrechas. Aquí sitúa sin robar sitio. */}
                      {m.modulo ? (
                        <span className="text-ink/40 mt-1 block text-2xs tracking-wide uppercase">
                          {m.modulo}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-ink/70 max-w-[260px] px-3 py-3">
                      {m.etiqueta ? (
                        <>
                          <span className="line-clamp-2">{m.etiqueta}</span>
                          {/* EL PORQUÉ, A LA VISTA Y NO DENTRO DEL JSON.
                              «El sistema siempre debe de reflejar en lo posible
                              la razón, para que todo sea transparente»
                              —Christopher, 7/09/2026—. Estaba guardado desde
                              siempre, pero había que abrir el detalle para
                              leerlo, y entonces no se lee. */}
                          {m.motivo ? (
                            <span className="text-ink/45 mt-0.5 line-clamp-2 text-xs italic">
                              «{m.motivo}»
                            </span>
                          ) : null}
                        </>
                      ) : (
                        /* Sin etiqueta queda la clave. Se recorta porque hay
                           tablas cuya clave es un uuid, y treinta y seis
                           caracteres de identificador rompen la fila para no
                           decir nada: el detalle la trae entera. */
                        <span className="text-ink/40 tabular text-xs">
                          {m.fila_id
                            ? `n.º ${m.fila_id.length > 18 ? `${m.fila_id.slice(0, 8)}…${m.fila_id.slice(-6)}` : m.fila_id}`
                            : 'sin referencia'}
                        </span>
                      )}
                      {/* El mismo recuento que el detalle: si aquí dijera "3
                          campos" y al abrirlo se vieran dos, el registro
                          parecería estar escondiendo uno. */}
                      {cambiosDeFondo(m.cambios).length > 0 ? (
                        <span className="text-ink/45 block text-xs">
                          {cambiosDeFondo(m.cambios).length === 1
                            ? nombreDeCampo(cambiosDeFondo(m.cambios)[0])
                            : `${cambiosDeFondo(m.cambios).length} campos`}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetalle(m)}>
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ultima > 0 ? (
            <div className="border-hairline flex items-center justify-between gap-4 border-t px-5 py-3">
              <Button
                size="sm"
                variant="outline"
                icon={<ChevronLeft />}
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-ink/50 tabular text-xs">
                Página {pagina + 1} de {ultima + 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={pagina >= ultima}
                onClick={() => setPagina((p) => Math.min(ultima, p + 1))}
              >
                Siguiente
                <ChevronRight className="size-[18px]" />
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------ Detalle ------------------------------ */}
      {detalle ? (
        <Modal
          abierto
          onCerrar={() => setDetalle(null)}
          titulo={frase(detalle)}
          descripcion={`${detalle.nombre ?? detalle.usuario} · ${fechaHora(detalle.ocurrido_en)}`}
          ancho="lg"
          acciones={
            <>
              <CopiarEvento movimiento={detalle} />
              <Button onClick={() => setDetalle(null)}>Cerrar</Button>
            </>
          }
        >
          <dl className="border-hairline mb-5 grid gap-x-6 gap-y-2 rounded-[6px] border p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink/45 text-xs">Usuario</dt>
              <dd className="text-ink/80">{detalle.usuario}</dd>
            </div>
            <div>
              <dt className="text-ink/45 text-xs">Sobre</dt>
              <dd className="text-ink/80">
                {nombreDeTabla(detalle.tabla)}
                {detalle.fila_id ? (
                  <span className="text-ink/45 tabular"> · {detalle.fila_id}</span>
                ) : null}
              </dd>
            </div>
            {detalle.etiqueta ? (
              <div className="sm:col-span-2">
                <dt className="text-ink/45 text-xs">Referencia</dt>
                <dd className="text-ink/80">{detalle.etiqueta}</dd>
              </div>
            ) : null}
            {/*
              LO QUE EL ASIENTO GUARDA Y LA FICHA NO ENSEÑABA.

              El módulo contesta «¿qué pasó ayer en Nómina?» sin saberse qué
              tablas son de Nómina; el motivo es el porqué que alguien escribió
              al hacerlo, y es lo primero que se busca cuando algo no cuadra; y
              el número del asiento es con lo que se señala este renglón en una
              conversación. Estaban guardados y no se veían.
            */}
            <div>
              <dt className="text-ink/45 text-xs">Módulo</dt>
              <dd className="text-ink/80">{detalle.modulo ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-ink/45 text-xs">Asiento</dt>
              <dd className="text-ink/80 tabular">n.º {detalle.id}</dd>
            </div>
            {detalle.motivo ? (
              <div className="sm:col-span-2">
                <dt className="text-ink/45 text-xs">Por qué se hizo</dt>
                <dd className="text-ink/85">{detalle.motivo}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-ink/45 text-xs">Desde</dt>
              <dd className="text-ink/80 tabular">{detalle.ip ?? 'no registrada'}</dd>
            </div>
          </dl>

          {detalle.operacion === 'ACCESO' ? (
            <p className="text-ink/55 flex items-start gap-2 text-sm leading-relaxed">
              <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" />
              Se anota la entrada, no la salida. Supabase borra la sesión al cerrarla, pero también
              al caducar y al cambiar la clave, y desde la base no hay forma de distinguirlas:
              escribir «salió» cuando en realidad se le venció la sesión sería falso, y esto no
              puede contener nada falso.
            </p>
          ) : null}

          {detalle.operacion === 'CLAVE' ? (
            <p className="text-ink/55 flex items-start gap-2 text-sm leading-relaxed">
              <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" />
              Queda anotado que la clave cambió y quién lo hizo. La clave —ni la vieja ni la
              nueva— no se guarda aquí ni en ninguna otra parte legible.
            </p>
          ) : null}

          {/* Una modificación se lee por lo que cambió, no por la fila entera:
              con cuarenta columnas, mostrarlas todas esconde las dos que
              importan. Un alta o un borrado sí van completos, porque ahí la
              fila entera ES la noticia. */}
          <Explicado movimiento={detalle} />

          <EnCrudo movimiento={detalle} />
        </Modal>
      ) : null}
    </>
  )
}

/*
  COPIAR UN SOLO EVENTO.

  Lo pidió Christopher: «¿qué pasa si solo quiero hacer el copy de un evento
  puntual?». Se podía copiar el registro entero filtrado —hasta cinco mil
  filas— y no se podía copiar uno, que es lo que se necesita a diario para
  mandárselo a alguien.

  Sale como texto plano y con todo dentro: la frase, quién, cuándo, desde dónde,
  el módulo, el porqué y los campos con sus nombres resueltos. Quien lo pega no
  es un programa, es una persona, y lo va a leer fuera del sistema.
*/
function CopiarEvento({ movimiento }: { movimiento: Movimiento }) {
  const { data: nombres } = useNombresDeAuditoria(movimiento.id)
  const [copiado, setCopiado] = useState(false)

  return (
    <Button
      variant="outline"
      icon={<Copy />}
      onClick={async () => {
        const texto = textoDeEvento(movimiento, {
          frase: narracion(movimiento, (campo, valor) =>
            nombreApuntado(nombres, campo, valor),
          ),
          nombreDeTabla,
          nombreDeCampo,
          nombreApuntado: (campo, valor) => nombreApuntado(nombres, campo, valor),
        })
        setCopiado(await copiarEvento(texto))
      }}
    >
      {copiado ? 'Copiado' : 'Copiar este evento'}
    </Button>
  )
}

/*
  Pide los nombres de lo que la fila apunta y se los pasa a las dos vistas. Una
  sola llamada al abrir la ficha: la lista de arriba no la necesita.
*/
function Explicado({ movimiento }: { movimiento: Movimiento }) {
  const { data: nombres } = useNombresDeAuditoria(movimiento.id)

  /*
    LA FRASE VA PRIMERO, Y LOS CAMPOS DEBAJO.

    Es lo que pedía Christopher: que la ficha diga qué significa el asiento, no
    qué columnas tiene. Los campos se quedan —hacen falta para desmentir la
    frase— pero dejan de ser lo primero que se lee.

    Se calcula con los nombres ya resueltos, así que la frase dice «BOTAS DE
    SEGURIDAD» donde el dato guarda un 278.
  */
  const frase = narracion(movimiento, (campo, valor) => nombreApuntado(nombres, campo, valor))

  const campos =
    movimiento.operacion === 'UPDATE' && movimiento.cambios?.length ? (
      <Diferencias movimiento={movimiento} nombres={nombres} />
    ) : movimiento.operacion === 'INSERT' && movimiento.despues ? (
      <FilaCompleta titulo="Cómo quedó" fila={movimiento.despues} nombres={nombres} />
    ) : movimiento.operacion === 'DELETE' && movimiento.antes ? (
      <FilaCompleta
        titulo="Lo que había antes de borrarlo"
        fila={movimiento.antes}
        nombres={nombres}
      />
    ) : null

  return (
    <>
      {frase ? (
        <p className="border-hairline bg-ink/4 rounded-card text-ink/85 mb-4 border p-3 text-sm leading-relaxed">
          {frase}
        </p>
      ) : null}
      {campos}
    </>
  )
}

/*
  Un valor, escrito para leerlo: si la columna apunta a otra fila se escribe su
  NOMBRE, y el número queda detrás en pequeño por si hace falta rastrearlo. Ese
  «articulo id 278» suelto es justo lo que no dice nada.
*/
function Valor({
  campo,
  valor,
  nombres,
}: {
  campo: string
  valor: unknown
  nombres: NombresApuntados | undefined
}) {
  const nombre = nombreApuntado(nombres, campo, valor)
  if (!nombre) return <>{valorLegible(valor)}</>
  return (
    <>
      {nombre}
      <span className="text-ink/40 tabular text-xs"> · {valorLegible(valor)}</span>
    </>
  )
}

function Diferencias({
  movimiento,
  nombres,
}: {
  movimiento: Movimiento
  nombres?: NombresApuntados
}) {
  const campos = cambiosDeFondo(movimiento.cambios)
  const ocultos = (movimiento.cambios?.length ?? 0) - campos.length
  const resto = camposSinCambiar(movimiento.despues ?? {}, movimiento.cambios, nombreDeCampo)

  // Guardar sin cambiar nada de fondo pasa: se abre una ficha, se pulsa
  // guardar y lo único que se movió fue la marca de quién guardó. Decirlo es
  // mejor que enseñar una tabla vacía, que se lee como un fallo.
  if (campos.length === 0) {
    return (
      <>
        <p className="text-ink/55 mb-3 text-sm leading-relaxed">
          Se volvió a guardar sin cambiar ningún dato: solo se movió la marca de quién guardó y
          cuándo, que es justo lo que dice la cabecera de arriba.
        </p>
        {/* Aunque no cambiara nada, la fila sigue haciendo falta: enterarse de
            que alguien abrió y guardó ESTA fila es la mitad del dato. */}
        <Plegado
          cuantos={resto.length}
          abrir={`Ver la fila como está (${resto.length})`}
          cerrar="Ocultar la fila"
        >
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {resto.map(([campo, valor]) => (
              <div key={campo} className="border-hairline border-b py-1.5">
                <dt className="text-ink/45 text-xs">{nombreDeCampo(campo)}</dt>
                <dd className="text-ink/70 break-words">
                  <Valor campo={campo} valor={valor} nombres={nombres} />
                </dd>
              </div>
            ))}
          </dl>
        </Plegado>
      </>
    )
  }

  return (
    <>
      <h3 className="text-ink/80 mb-3 text-sm font-semibold">Lo que cambió ({campos.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline border-b text-left text-xs">
              <th className="py-2 pr-3 font-medium">Campo</th>
              <th className="px-3 py-2 font-medium">Antes</th>
              <th className="py-2 pl-3 font-medium">Después</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((campo) => (
              <tr key={campo} className="border-hairline border-b last:border-0 align-top">
                <td className="text-ink/70 py-2.5 pr-3">{nombreDeCampo(campo)}</td>
                <td className="text-ink/45 px-3 py-2.5 line-through">
                  <Valor campo={campo} valor={movimiento.antes?.[campo]} nombres={nombres} />
                </td>
                <td className="text-ink/85 py-2.5 pl-3 font-medium">
                  <Valor campo={campo} valor={movimiento.despues?.[campo]} nombres={nombres} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ocultos > 0 ? (
        <p className="text-ink/40 mt-2 text-xs">
          No se listan {ocultos} {ocultos === 1 ? 'campo' : 'campos'} de control —quién guardó y
          cuándo—, porque es lo mismo que ya dice la cabecera.
        </p>
      ) : null}

      {/*
        EL CONTEXTO, DEBAJO DE LA NOTICIA.

        «El costo pasó de 5 a 7» no dice de qué artículo ni en qué almacén, y
        una modificación sin contexto no se puede auditar. Va plegado porque lo
        primero que hay que ver sigue siendo lo que cambió.
      */}
      <Plegado
        cuantos={resto.length}
        abrir={`Ver el resto de la fila, que no cambió (${resto.length})`}
        cerrar="Ocultar el resto de la fila"
      >
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {resto.map(([campo, valor]) => (
            <div key={campo} className="border-hairline border-b py-1.5">
              <dt className="text-ink/45 text-xs">{nombreDeCampo(campo)}</dt>
              <dd className="text-ink/70 break-words">
                <Valor campo={campo} valor={valor} nombres={nombres} />
              </dd>
            </div>
          ))}
        </dl>
      </Plegado>
    </>
  )
}

function FilaCompleta({
  titulo,
  fila,
  nombres,
}: {
  titulo: string
  fila: Record<string, unknown>
  nombres?: NombresApuntados
}) {
  /*
    Fuera lo vacío —no dice nada— y fuera quién guardó y cuándo, que está en la
    cabecera del movimiento y aquí saldría como un identificador ilegible.

    Y ORDENADO POR SIGNIFICADO. Antes salía en el orden de `jsonb`, que ordena
    las claves por longitud del nombre: la ficha de una presentación empezaba
    por un `id` y dejaba `presentación` la última, debajo del pliegue. No
    faltaba — estaba donde nadie la ve.
  */
  const campos = camposOrdenados(fila, nombreDeCampo)
  const apartados = camposApartados(fila, nombreDeCampo)

  return (
    <>
      <h3 className="text-ink/80 mb-3 text-sm font-semibold">{titulo}</h3>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {campos.map(([campo, valor]) => (
          <div key={campo} className="border-hairline border-b py-1.5">
            <dt className="text-ink/45 text-xs">{nombreDeCampo(campo)}</dt>
            <dd className="text-ink/80 break-words">
              <Valor campo={campo} valor={valor} nombres={nombres} />
            </dd>
          </div>
        ))}
      </dl>
      {campos.length === 0 ? <p className="text-ink/50 text-sm">La fila estaba vacía.</p> : null}

      {/*
        NADA DE LO QUE EL ASIENTO GUARDA QUEDA FUERA DE ALCANCE.

        Arriba se aparta lo de registro y lo vacío para que se lea. Aquí se
        devuelve, porque auditando «este campo estaba vacío» ES el dato: es
        justo lo que se mira cuando falta una firma, una fecha o un motivo.
      */}
      <Plegado
        cuantos={apartados.registro.length + apartados.vacios.length}
        abrir="Ver también lo que se apartó: registro del guardado y campos vacíos"
        cerrar="Ocultar lo apartado"
      >
        {apartados.registro.length > 0 ? (
          <dl className="mb-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {apartados.registro.map(([campo, valor]) => (
              <div key={campo} className="border-hairline border-b py-1.5">
                <dt className="text-ink/45 text-xs">{nombreDeCampo(campo)}</dt>
                <dd className="text-ink/70 break-words">
                  <Valor campo={campo} valor={valor} nombres={nombres} />
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {apartados.vacios.length > 0 ? (
          <p className="text-ink/50 text-xs leading-relaxed">
            <span className="text-ink/70">Sin valor ({apartados.vacios.length}):</span>{' '}
            {apartados.vacios.map(nombreDeCampo).join(' · ')}
          </p>
        ) : null}
      </Plegado>
    </>
  )
}

/*
  UN PLIEGUE, PARA QUE «TODO» NO SIGNIFIQUE «UNA PARED».

  La ficha tiene que enseñar todo lo que el asiento guarda —es un registro de
  auditoría, no un resumen— y a la vez tiene que poderse leer. La salida es el
  orden: primero lo que importa, y detrás de un botón que dice CUÁNTAS cosas
  hay, el resto. Nunca un botón que no diga cuánto esconde: eso es lo que hace
  que nadie lo abra.
*/
function Plegado({
  cuantos,
  abrir,
  cerrar,
  children,
}: {
  cuantos: number
  abrir: string
  cerrar: string
  children: ReactNode
}) {
  const [visible, setVisible] = useState(false)
  if (cuantos === 0) return null

  return (
    <div className="border-hairline mt-4 border-t pt-3">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-ink/55 hover:text-ink/85 flex items-center gap-1.5 text-xs"
      >
        <ChevronRight className={cn('size-3.5 transition-transform', visible && 'rotate-90')} />
        {visible ? cerrar : abrir}
      </button>
      {visible ? <div className="mt-3">{children}</div> : null}
    </div>
  )
}

/*
  EL ASIENTO EN CRUDO.

  Lo de arriba está escrito para leerse; esto es para cotejarse. Cuando lo que
  se discute es el dato y no la redacción, hace falta la fila tal como está
  guardada: nombres de columna sin traducir, valores sin formato, y las dos
  caras —antes y después— completas.

  Va cerrado. Quien lo necesita sabe que lo busca, y quien no, no debería
  tropezarse con un bloque de JSON al abrir una ficha.
*/
function EnCrudo({ movimiento }: { movimiento: Movimiento }) {
  const [visible, setVisible] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const texto = jsonDeEvento(movimiento)

  return (
    <div className="border-hairline mt-5 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-ink/55 hover:text-ink/85 flex items-center gap-1.5 text-xs"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', visible && 'rotate-90')} />
          {visible ? 'Ocultar el asiento en crudo' : 'Ver el asiento en crudo, como está guardado'}
        </button>
        {visible ? (
          <button
            type="button"
            onClick={async () => setCopiado(await copiarEvento(texto))}
            className="text-ink/55 hover:text-ink/85 flex items-center gap-1.5 text-xs"
          >
            <Copy className="size-3.5" />
            {copiado ? 'Copiado' : 'Copiar en JSON'}
          </button>
        ) : null}
      </div>

      {visible ? (
        <pre className="border-hairline bg-ink/4 text-ink/70 mt-3 max-h-80 overflow-auto rounded-[6px] border p-3 text-2xs leading-relaxed">
          {texto}
        </pre>
      ) : null}
    </div>
  )
}
