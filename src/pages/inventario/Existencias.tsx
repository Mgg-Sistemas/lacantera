import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  Boxes,
  MapPin,
  PackageMinus,
  PackagePlus,
  Plus,
  Printer,
  Scale,
  Search,
  TriangleAlert,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_MATERIAL } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Visor } from '@/components/Visor'
import { useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { armarActaExistencias } from '@/lib/ficha/actaExistencias'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisRoles, useArticulos } from '@/lib/api/catalogo'
import { useMonedasUsables, enSimbolos } from '@/lib/api/tasas'
import {
  useAlmacenes,
  useExistencias,
  useExistenciasDeArticulo,
  useExistenciasTotales,
  useMovimientos,
  useRegistrarAjuste,
  useRegistrarBaja,
  CAUSAS_DE_BAJA,
  CLASES_DE_SALIDA,
  useRegistrarEntradas,
  useRegistrarSalida,
} from '@/lib/api/inventario'
import type { Existencia, ExistenciaTotal } from '@/lib/api/inventario'
import { dolares, enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'

function cantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? enteros(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/**
 * Lo que hay, empezando por el total de la empresa.
 *
 * PRIMERO TODO, DESPUÉS DÓNDE
 *
 * Antes esta pantalla abría con una fila por almacén y artículo: el mismo saco
 * de cemento aparecía cuatro veces y en ninguna decía cuántos hay en total. Con
 * un solo almacén no se notaba; con patio, almacenes y varios talleres, la
 * primera pregunta —cuánto tiene la empresa— no tenía respuesta en pantalla.
 *
 * Ahora se entra al total, y de ahí se baja: cuántos sitios lo tienen, cuáles
 * son, y en cada uno se saca o se cuenta. La dirección de Sistemas lo pidió en
 * ese orden y es también el orden en que se piensa.
 *
 * LAS ACCIONES SIGUEN COLGANDO DE UN ALMACÉN, NO DEL TOTAL
 *
 * Sacar material del «inventario general» no significa nada: el material sale
 * de un sitio concreto y de ahí se descuenta. Por eso desde el total no se saca
 * nada; se abre el desglose, se elige el almacén, y ahí sí. La pantalla no
 * ofrece lo que no se puede hacer.
 */
/** Un renglón mientras se escribe: todo texto, que es lo que da un input. */
interface RenglonEnCurso {
  clave: string
  articulo: string
  cantidad: string
  costo: string
  moneda: string
}

let siguienteClave = 0
const renglonVacio = (articulo: string): RenglonEnCurso => ({
  clave: String(++siguienteClave),
  articulo,
  cantidad: '',
  costo: '',
  moneda: 'USD',
})

export function Existencias() {
  const { data: almacenes } = useAlmacenes()

  // El sitio puede venir en la URL: desde Talleres se llega aquí con el taller
  // ya elegido. Sin esto el enlace prometía un filtro que no aplicaba.
  const [params, setParams] = useSearchParams()
  const almacenId = params.get('almacen') ?? ''
  const setAlmacenId = (v: string) =>
    setParams(v ? { almacen: v } : {}, { replace: true })
  const enTotal = almacenId === ''

  const totales = useExistenciasTotales(enTotal)
  const porAlmacen = useExistencias(almacenId ? Number(almacenId) : undefined, !enTotal)
  const { isPending, error } = enTotal ? totales : porAlmacen

  /*
    Los movimientos del sitio, para poder decir qué se movió aquí.

    Se piden acotados al almacén: en el total de la empresa la cifra sería la
    suma de todo el libro, que no informa de nada — siempre es «muchos».
  */
  const movimientos = useMovimientos(
    almacenId ? { almacenId: Number(almacenId) } : {},
  )

  const { puede } = useMisRoles()
  const salida = useRegistrarSalida()
  const ajuste = useRegistrarAjuste()
  const baja = useRegistrarBaja()
  const entrada = useRegistrarEntradas()
  const { data: articulos } = useArticulos()
  const monedas = useMonedasUsables()
  const { data: empresa } = useEmpresa()
  const { nombre: yo } = useSesion()
  const [acta, setActa] = useState<ArchivoArmado | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [soloBajas, setSoloBajas] = useState(false)
  const [desglose, setDesglose] = useState<ExistenciaTotal | null>(null)
  const [modal, setModal] = useState<
    null | { tipo: 'salida' | 'ajuste' | 'entrada' | 'baja'; fila: Existencia | null }
  >(null)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  // Solo para la entrada: el costo es lo que la distingue de un ajuste, y el
  // almacén y el artículo hacen falta cuando se abre sin fila debajo.
  const [referencia, setReferencia] = useState('')
  const [aDonde, setADonde] = useState('')
  /*
    LA ENTRADA ES DE VARIOS RENGLONES

    Christopher: «¿tengo que repetir ese formulario N veces?». Cargar el saldo
    inicial de un almacén con veinte artículos eran veinte formularios, veinte
    veces eligiendo el mismo sitio. Ahora el sitio se elige una vez y debajo se
    van añadiendo renglones.

    La clave es para React: sin una estable, borrar un renglón del medio
    reordena los de abajo y el foco salta al campo equivocado.
  */
  const [renglones, setRenglones] = useState<RenglonEnCurso[]>([])

  // La referencia tiene que ser estable o el filtrado se recalcula en cada
  // pintado: `?? []` crea un arreglo nuevo cada vez.
  const crudos = enTotal ? totales.data : porAlmacen.data
  const datos = useMemo<Array<Existencia | ExistenciaTotal>>(() => crudos ?? [], [crudos])

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return datos.filter((e) => {
      const bajo = Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)
      if (soloBajas && !bajo) return false
      if (!texto) return true
      return (
        e.articulo.toLowerCase().includes(texto) || e.articulo_codigo.toLowerCase().includes(texto)
      )
    })
  }, [datos, busqueda, soloBajas])

  const valorTotal = filtradas.reduce((s, e) => s + Number(e.valor_usd), 0)

  /*
    LO QUE ESTE SITIO TIENE, VALE, NECESITA Y MUEVE

    Christopher: «cada almacén o taller debe informar cuánto tiene, cuánto
    vale, cuánto necesita reponer y cuánto transfiere». El tablero del módulo
    ya lo dice de la empresa entera; aquí hace falta del sitio que se está
    mirando, que es la pregunta que se hace estando en esta pantalla.

    Van en una franja y no en tarjetas grandes, a propósito: el protagonista
    de esta pantalla es la lista, no el resumen. Las cifras acompañan.

    Se calculan sobre `filtradas` y no sobre todo, porque si alguien filtró por
    «solo bajo mínimo» o buscó una palabra, el resumen tiene que hablar de lo
    que está viendo. Un total que no cuadra con la lista de debajo se lee como
    un error del sistema.
  */
  const conExistencia = filtradas.filter((e) => Number(e.existencia) > 0).length
  const porReponer = filtradas.filter(
    (e) => Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo),
  ).length
  const traslados = (movimientos.data ?? []).filter((m) =>
    m.tipo.startsWith('TRANSFERENCIA'),
  ).length
  const bajas = datos.filter(
    (e) => Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo),
  )

  /*
    EL ACTA SE ARMA CON LO QUE SE ESTÁ VIENDO

    Y no con todo el almacén: si alguien filtró por «solo bajo mínimo» y pide
    el papel, lo que quiere en la mano es esa lista. Por eso el filtro aplicado
    va impreso en el acta — un papel con quince renglones que no dice que son
    quince de doscientos se lee como si fueran todos.
  */
  const imprimirActa = async () => {
    const sitio = almacenes?.find((a) => String(a.id) === almacenId)
    const filtros = [
      busqueda.trim() ? `Búsqueda: «${busqueda.trim()}»` : null,
      soloBajas ? 'Solo lo que está en el mínimo o por debajo' : null,
    ].filter(Boolean)

    setActa(
      await armarActaExistencias({
        almacen: sitio?.nombre ?? null,
        filtro: filtros.length > 0 ? filtros.join(' · ') : null,
        renglones: filtradas.map((e) => ({
          codigo: e.articulo_codigo,
          articulo: e.articulo,
          unidad: e.unidad,
          existencia: e.existencia,
          // Nulo cuando el articulo nunca entro con un costo. Se imprime
          // cero, que es lo que vale en libros: la alternativa es un hueco,
          // y un hueco en una columna de dinero se lee como un error.
          costoUsd: e.costo_promedio_usd ?? 0,
          valorUsd: e.valor_usd,
        })),
        empresa: {
          razonSocial: empresa?.razon_social ?? '',
          rif: empresa?.rif ?? '',
        },
        emitidoPor: yo ?? '',
        momento: new Date(),
      }),
    )
  }

  /*
    LA BAJA NO ES UNA SALIDA MÁS

    Sacar material es darlo a quien lo va a usar; darlo de baja es decir que
    dejó de existir para la empresa. Comparten el formulario porque preguntan
    casi lo mismo, pero la causa solo aparece en la baja: es lo que después
    permite responder cuánto se perdió por obsolescencia y cuánto por robo.
  */
  const [causa, setCausa] = useState(CAUSAS_DE_BAJA[0].valor)
  const [destino, setDestino] = useState('')
  const [clase, setClase] = useState(CLASES_DE_SALIDA[0].valor)

  const abrir = (tipo: 'salida' | 'ajuste' | 'entrada' | 'baja', fila: Existencia | null) => {
    setCausa(CAUSAS_DE_BAJA[0].valor)
    setDestino('')
    setClase(CLASES_DE_SALIDA[0].valor)
    setValor(tipo === 'ajuste' && fila ? fila.existencia : '')
    setMotivo('')
    setReferencia('')
    // Abierta desde una fila, el primer renglón viene con ese artículo puesto.
    setRenglones(
      tipo === 'entrada'
        ? [renglonVacio(fila ? String(fila.articulo_id) : '')]
        : [],
    )
    // Abierta desde una fila, ya se sabe dónde y qué. Abierta desde la
    // cabecera —el caso del saldo inicial— no hay fila que preguntar, porque
    // justamente todavía no existe.
    setADonde(fila ? String(fila.almacen_id) : almacenId)
    setModal({ tipo, fila })
  }

  const guardar = async () => {
    if (!modal) return

    if (modal.tipo === 'entrada') {
      await entrada.mutateAsync({
        almacen_id: Number(aDonde),
        renglones: renglones
          .filter((r) => r.articulo && r.cantidad && r.costo)
          .map((r) => ({
            articulo_id: Number(r.articulo),
            cantidad: Number(r.cantidad),
            costo: Number(r.costo),
            moneda: r.moneda,
          })),
        motivo,
        referencia: referencia || null,
      })
    } else if (modal.tipo === 'baja') {
      await baja.mutateAsync({
        almacen_id: modal.fila!.almacen_id,
        articulo_id: modal.fila!.articulo_id,
        cantidad: Number(valor),
        causa,
        motivo,
        destino: destino || null,
      })
    } else if (modal.tipo === 'salida') {
      await salida.mutateAsync({
        almacen_id: modal.fila!.almacen_id,
        articulo_id: modal.fila!.articulo_id,
        cantidad: Number(valor),
        motivo,
        tipo: clase,
      })
    } else {
      await ajuste.mutateAsync({
        almacen_id: modal.fila!.almacen_id,
        articulo_id: modal.fila!.articulo_id,
        contado: Number(valor),
        motivo,
      })
    }

    setModal(null)
  }

  return (
    <>
      <PageHeader
        title="Existencias"
        description={
          enTotal
            ? 'Todo lo que tiene la empresa, sumado. Elige un almacén o taller para ver y mover lo que hay en él.'
            : 'Lo que hay en este sitio ahora mismo, calculado sumando el libro de movimientos.'
        }
        actions={
          puede('ALMACEN') ? (
            /*
              Antes esto era un atajo a Explotación, que hoy está fuera del
              MVP y detrás del cartel de obra: el botón principal de esta
              pantalla mandaba a una puerta cerrada.

              Y sobre todo, Inventario tiene que valerse solo. Sin esta
              entrada, la única forma de meter mercancía con su costo era una
              orden de compra, y un almacén que arranca no tiene ninguna
              todavía.
            */
            <>
              <Button
                variant="outline"
                icon={<Printer />}
                disabled={filtradas.length === 0}
                onClick={() => void imprimirActa()}
              >
                Acta de conteo físico
              </Button>
              <Button
                variant="outline"
                icon={<PackagePlus />}
                onClick={() => abrir('entrada', null)}
              >
                Registrar entrada
              </Button>
            </>
          ) : undefined
        }
      />

      <Pestanas pestanas={PESTANAS_MATERIAL} />

      {bajas.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {bajas.length} artículo{bajas.length === 1 ? '' : 's'} en el mínimo o por debajo
            </strong>
            . Conviene pedirlos antes de que hagan falta.{' '}
            <button
              type="button"
              onClick={() => setSoloBajas((v) => !v)}
              className="text-royal-600 dark:text-royal-300 font-medium underline"
            >
              {soloBajas ? 'Ver todo' : 'Ver solo esos'}
            </button>
          </p>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_240px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Nombre o código del artículo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <SelectBuscable
            label="Dónde"
            vacio="Todo el inventario"
            valor={almacenId}
            onCambio={(v) => setAlmacenId(v)}
            opciones={(almacenes ?? []).map((a) => ({
              valor: String(a.id),
              etiqueta: `${a.nombre}${a.tipo === 'TALLER' ? ' · taller' : ''}`,
            }))}
          />
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error && datos.length > 0 ? (
        <Franja
          sitio={enTotal ? null : (almacenes ?? []).find((a) => String(a.id) === almacenId)?.nombre ?? null}
          conExistencia={conExistencia}
          listados={filtradas.length}
          valor={valorTotal}
          porReponer={porReponer}
          traslados={traslados}
          onVerBajos={() => setSoloBajas(true)}
        />
      ) : null}

      {!isPending && !error && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Boxes />}
            titulo={datos.length === 0 ? 'El inventario está vacío' : 'Nada coincide'}
            descripcion={
              datos.length === 0
                ? 'Las existencias aparecen cuando entra material. Si el almacén arranca ahora, usa «Registrar entrada» para cargar el saldo inicial con su costo.'
                : undefined
            }
          />
        </Card>
      ) : null}

      {filtradas.length > 0 ? (
        <Card flush>
          <div className="border-hairline flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
            <p className="text-ink/60 text-sm">
              {filtradas.length} artículo{filtradas.length === 1 ? '' : 's'}
              {enTotal ? ' en toda la empresa' : ''}
            </p>
            <p className="text-ink/80 text-sm">
              Valor del inventario:{' '}
              <span className="tabular font-semibold">{dolares(valorTotal)}</span>
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Artículo</th>
                  <th className="px-3 py-3 text-right font-medium">Existencia</th>
                  <th className="px-3 py-3 font-medium">{enTotal ? 'Repartido en' : 'Almacén'}</th>
                  <th className="px-3 py-3 text-right font-medium">Costo prom.</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e) => {
                  const bajo =
                    Number(e.stock_minimo) > 0 && Number(e.existencia) <= Number(e.stock_minimo)
                  const total = enTotal ? (e as ExistenciaTotal) : null
                  const fila = enTotal ? null : (e as Existencia)

                  return (
                    <tr
                      key={enTotal ? `t-${e.articulo_id}` : `${fila!.almacen_id}-${e.articulo_id}`}
                      className="border-hairline border-b last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{e.articulo}</p>
                        <p className="text-ink/45 text-2xs font-mono">{e.articulo_codigo}</p>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <span
                          className={cn(
                            'tabular font-semibold',
                            bajo ? 'text-warning' : 'text-ink/85',
                          )}
                        >
                          {cantidad(e.existencia)}
                        </span>
                        <span className="text-ink/45 ml-1 text-xs">{e.unidad}</span>
                        {bajo ? (
                          <Chip tone="warning" className="ml-2">
                            Mínimo {cantidad(e.stock_minimo)}
                          </Chip>
                        ) : null}

                        {/*
                          EXISTIR NO ES ESTAR DISPONIBLE

                          Diez cascos en el libro pueden ser diez cascos en diez
                          cabezas. Lo prestado sigue contando como existencia
                          —es de la empresa y vale— pero no se puede entregar.

                          Solo se dice cuando difieren: repetir «10 · 10
                          disponibles» en cada renglón enseñaría a no leerlo, y
                          entonces no se leería el día que dice cero.
                        */}
                        {Number(e.prestadas) > 0 ? (
                          <p
                            className={cn(
                              'text-2xs mt-0.5',
                              Number(e.disponibles) <= 0 ? 'text-warning' : 'text-ink/50',
                            )}
                          >
                            {cantidad(e.disponibles)} disponible
                            {Number(e.disponibles) === 1 ? '' : 's'} ·{' '}
                            {cantidad(e.prestadas)} en manos de alguien
                          </p>
                        ) : null}

                        {/* La otra medida, solo en los materiales cuya densidad
                            se midió. Sin ese dato no se supone: se calla. */}
                        {total?.existencia_equivalente ? (
                          <p className="text-ink/40 text-2xs mt-0.5">
                            ≈ {cantidad(total.existencia_equivalente)} {total.unidad_equivalente}
                          </p>
                        ) : null}
                      </td>

                      <td className="text-ink/65 px-3 py-3">
                        {enTotal
                          ? `${total!.almacenes} sitio${total!.almacenes === 1 ? '' : 's'}`
                          : fila!.almacen}
                      </td>

                      <td className="tabular text-ink/65 px-3 py-3 text-right">
                        {e.costo_promedio_usd ? dolares(e.costo_promedio_usd) : '—'}
                      </td>
                      <td className="tabular text-ink/85 px-3 py-3 text-right">
                        {dolares(e.valor_usd)}
                      </td>

                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {enTotal ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<MapPin />}
                            onClick={() => setDesglose(total)}
                          >
                            Ver dónde está
                          </Button>
                        ) : puede('ALMACEN') ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<PackageMinus />}
                              onClick={() => abrir('salida', fila!)}
                            >
                              Sacar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Scale />}
                              onClick={() => abrir('ajuste', fila!)}
                            >
                              Contar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Trash2 />}
                              onClick={() => abrir('baja', fila!)}
                            >
                              Dar de baja
                            </Button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <ModalDesglose
        articulo={desglose}
        onCerrar={() => setDesglose(null)}
        puedeMover={puede('ALMACEN')}
        onSacar={(f) => {
          setDesglose(null)
          abrir('salida', f)
        }}
        onContar={(f) => {
          setDesglose(null)
          abrir('ajuste', f)
        }}
      />

      {modal ? (
        <Modal
          abierto
          onCerrar={() => setModal(null)}
          titulo={
            modal.tipo === 'entrada'
              ? 'Entrada de material'
              : modal.tipo === 'salida'
                ? 'Sacar material'
                : modal.tipo === 'baja'
                  ? 'Dar de baja'
                  : 'Conteo físico'
          }
          descripcion={
            modal.tipo === 'entrada'
              ? 'Para lo que entra sin una compra de por medio: el saldo con el que arranca el almacén, algo comprado por fuera, material que trae alguien.'
              : modal.tipo === 'salida'
                ? 'Sale del almacén al costo promedio que tiene ahora. Di de qué clase es: lo que se usa trabajando y lo que se pierde en el manejo se miran por separado.'
                : modal.tipo === 'baja'
                  ? 'Para lo que dejó de servir: se dañó, quedó obsoleto, venció, no aparece. Sale del inventario y su valor se da por perdido.'
                  : 'Escribe lo que contaste. El sistema calcula la diferencia y la deja registrada.'
          }
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void guardar()}
                disabled={
                  (modal.tipo !== 'entrada' && !valor) ||
                  motivo.trim().length < 4 ||
                  (modal.tipo === 'entrada' &&
                    (!aDonde ||
                      renglones.filter((r) => r.articulo && r.cantidad && r.costo).length === 0)) ||
                  // Una baja pide más explicación: es lo único que quedará
                  // dentro de un año para justificar la pérdida.
                  (modal.tipo === 'baja' && motivo.trim().length < 10) ||
                  salida.isPending ||
                  ajuste.isPending ||
                  entrada.isPending ||
                  baja.isPending
                }
              >
                {salida.isPending || ajuste.isPending || entrada.isPending || baja.isPending
                  ? 'Guardando…'
                  : 'Registrar'}
              </Button>
            </>
          }
        >
          {/* Con fila debajo ya se sabe dónde y qué, y repetirlo como campos
              sería preguntar lo que se acaba de pulsar. Sin ella —el caso del
              saldo inicial— hay que elegirlo, y por eso el artículo sale del
              catálogo entero y no de lo que ya tiene existencia: justamente lo
              que se está cargando todavía no la tiene. */}
          {/* La entrada tiene su propio cuerpo: se elige el sitio una vez y
              debajo van los renglones. Salida y ajuste siguen siendo de una
              fila, que es como se hacen. */}
          {modal.tipo === 'entrada' ? (
            <>
              <SelectBuscable
                label="A qué almacén entra"
                vacio="Elige el sitio"
                valor={aDonde}
                onCambio={setADonde}
                opciones={(almacenes ?? []).map((a) => ({
                  valor: String(a.id),
                  codigo: a.codigo,
                  nombre: a.nombre,
                  detalle: a.tipo,
                }))}
              />

              <div className="mt-4 space-y-3">
                {renglones.map((r, i) => {
                  const art = (articulos ?? []).find((a) => String(a.id) === r.articulo)
                  return (
                    <div
                      key={r.clave}
                      className="border-hairline rounded-card border border-dashed p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
                          Renglón {i + 1}
                        </span>
                        {renglones.length > 1 ? (
                          <button
                            type="button"
                            className="text-ink/40 hover:text-danger text-xs underline underline-offset-2"
                            onClick={() =>
                              setRenglones((v) => v.filter((x) => x.clave !== r.clave))
                            }
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>

                      <SelectBuscable
                        label="Qué entra"
                        vacio="Elige el artículo"
                        valor={r.articulo}
                        onCambio={(v) =>
                          setRenglones((lista) =>
                            lista.map((x) => (x.clave === r.clave ? { ...x, articulo: v } : x)),
                          )
                        }
                        opciones={(articulos ?? [])
                          .filter((a) => a.inventariable)
                          .map((a) => ({
                            valor: String(a.id),
                            codigo: a.codigo,
                            nombre: a.nombre,
                            detalle: `${a.categoria} · ${a.unidad}`,
                          }))}
                      />

                      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                        <Input
                          label="Cantidad"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={r.cantidad}
                          onChange={(e) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                x.clave === r.clave ? { ...x, cantidad: e.target.value } : x,
                              ),
                            )
                          }
                          // La unidad la trae el artículo. Veinte de algo que
                          // se mide en pares no es veinte de algo que se mide
                          // en metros cúbicos.
                          hint={art ? `En ${art.unidad}` : 'Elige antes el artículo'}
                        />

                        <Input
                          label="Costo por unidad"
                          type="number"
                          min="0"
                          step="0.0001"
                          inputMode="decimal"
                          value={r.costo}
                          onChange={(e) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                x.clave === r.clave ? { ...x, costo: e.target.value } : x,
                              ),
                            )
                          }
                          hint="Lo que costó, en la moneda en que se pagó."
                        />

                        {/* La moneda no se asume. El sistema maneja cuatro, y
                            convertir de cabeza es como se cargan los costos
                            equivocados. La conversión a dólares la hace la
                            base con la tasa del día. */}
                        <Select
                          label="Moneda"
                          value={r.moneda}
                          onChange={(e) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                x.clave === r.clave ? { ...x, moneda: e.target.value } : x,
                              ),
                            )
                          }
                          opciones={enSimbolos(monedas.data)}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                icon={<Plus />}
                onClick={() => setRenglones((v) => [...v, renglonVacio('')])}
              >
                Añadir otro artículo
              </Button>
            </>
          ) : (
            <>
              <div className="border-hairline bg-canvas rounded-card mb-4 border p-3">
                <p className="text-ink/85 text-sm font-medium">{modal.fila?.articulo}</p>
                <p className="text-ink/55 text-xs">
                  {modal.fila?.almacen} · hay {cantidad(modal.fila?.existencia ?? 0)}{' '}
                  {modal.fila?.unidad}
                </p>
              </div>

              <Input
                label={
                  modal.tipo === 'salida'
                    ? 'Cantidad que sale'
                    : modal.tipo === 'baja'
                      ? 'Cantidad que se da de baja'
                      : 'Cantidad contada'
                }
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                autoFocus
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                hint={
                  modal.tipo === 'ajuste' && modal.fila && valor !== ''
                    ? `Diferencia: ${(Number(valor) - Number(modal.fila.existencia)).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${modal.fila.unidad}`
                    : modal.fila
                      ? `En ${modal.fila.unidad}`
                      : undefined
                }
              />

              {/*
                POR QUÉ DEJÓ DE SERVIR

                Debajo de la cantidad y antes del motivo: primero cuánto, luego
                de qué clase de pérdida se trata, y al final el relato. La causa
                es lo que después deja responder «cuánto se perdió por
                obsolescencia» sin leer doscientas notas a mano.
              */}
              {modal.tipo === 'salida' ? (
                <Select
                  label="¿De qué clase?"
                  value={clase}
                  onChange={(e) => setClase(e.target.value)}
                  hint={CLASES_DE_SALIDA.find((c) => c.valor === clase)?.dice}
                  opciones={CLASES_DE_SALIDA.map((c) => ({
                    valor: c.valor,
                    etiqueta: c.etiqueta,
                  }))}
                />
              ) : null}

              {modal.tipo === 'baja' ? (
                <>
                  <Select
                    label="¿Por qué?"
                    value={causa}
                    onChange={(e) => setCausa(e.target.value)}
                    hint={CAUSAS_DE_BAJA.find((c) => c.valor === causa)?.dice}
                    opciones={CAUSAS_DE_BAJA.map((c) => ({
                      valor: c.valor,
                      etiqueta: c.etiqueta,
                    }))}
                  />

                  <Input
                    label="¿Y qué se hizo con eso?"
                    value={destino}
                    onChange={(e) => setDestino(e.target.value)}
                    hint="Opcional. Se desechó, se vendió como chatarra, se guardó para repuestos — para que nadie lo salga a buscar después."
                  />
                </>
              ) : null}
            </>
          )}

          {modal.tipo === 'entrada' ? (
            <Input
              className="mt-4"
              label="Referencia"
              hint="Opcional: quién lo trajo, o el número de una factura de fuera."
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          ) : null}

          <Textarea
            label={
              modal.tipo === 'entrada'
                ? 'De dónde vino'
                : modal.tipo === 'salida'
                  // «Para qué sale» no encaja con una merma: nada se derrama
                  // para algo. Cada clase pregunta lo que de verdad se
                  // responde.
                  ? clase === 'SALIDA_MERMA'
                    ? 'Qué pasó'
                    : 'Para qué sale'
                  : modal.tipo === 'baja'
                    ? 'Qué pasó'
                    : 'Qué explica la diferencia'
            }
            className="mt-4"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint={
              modal.tipo === 'baja'
                ? 'Con detalle: dentro de un año esta frase será lo único que quede para justificar la pérdida. Queda en el libro y no se puede editar.'
                : 'Queda en el libro y no se puede editar después.'
            }
          />

          {salida.error ? <ErrorDeCarga error={salida.error} className="mt-3" /> : null}
          {ajuste.error ? <ErrorDeCarga error={ajuste.error} className="mt-3" /> : null}
          {entrada.error ? <ErrorDeCarga error={entrada.error} className="mt-3" /> : null}
          {baja.error ? <ErrorDeCarga error={baja.error} className="mt-3" /> : null}
        </Modal>
      ) : null}

      <Visor
        abierto={acta !== null}
        onCerrar={() => setActa(null)}
        blob={acta?.blob ?? null}
        nombreArchivo={acta?.nombre ?? ''}
        titulo="Acta de existencias"
      />
    </>
  )
}

/*
  LA FRANJA DE CIFRAS DEL SITIO

  Cuatro datos en una línea, con un separador entre ellos. No son tarjetas: una
  tarjeta pide atención y aquí la atención es de la lista.

  El de reponer es el único que se enciende, y solo cuando hay algo que
  atender. Los demás informan; ese reclama, y además lleva — pulsarlo filtra la
  lista a lo que está bajo mínimo, que es lo que se quiere ver justo después de
  leer que hay siete.
*/
function Franja({
  sitio,
  conExistencia,
  listados,
  valor,
  porReponer,
  traslados,
  onVerBajos,
}: {
  sitio: string | null
  conExistencia: number
  listados: number
  valor: number
  porReponer: number
  traslados: number
  onVerBajos: () => void
}) {
  return (
    <div className="border-hairline mb-4 rounded-[6px] border px-4 py-3">
      <p className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
        {sitio ?? 'Toda la empresa'}
      </p>

      <dl className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink/45 text-xs">Tiene</dt>
          <dd className="text-ink/85 tabular text-sm font-semibold">
            {enteros(conExistencia)}
          </dd>
          <span className="text-ink/40 text-xs">
            de {enteros(listados)} artículo{listados === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink/45 text-xs">Vale</dt>
          <dd className="text-ink/85 tabular text-sm font-semibold">{dolares(valor)}</dd>
          <span className="text-ink/40 text-xs">a costo promedio</span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink/45 text-xs">Por reponer</dt>
          {porReponer > 0 ? (
            <button
              type="button"
              onClick={onVerBajos}
              className="text-warning tabular text-sm font-semibold underline underline-offset-2"
            >
              {enteros(porReponer)}
            </button>
          ) : (
            <dd className="text-ink/30 tabular text-sm font-semibold">0</dd>
          )}
          <span className="text-ink/40 text-xs">
            {porReponer > 0 ? 'en el mínimo o por debajo' : 'nada pendiente'}
          </span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <dt className="text-ink/45 text-xs">Traslados</dt>
          <dd className="text-ink/85 tabular text-sm font-semibold">{enteros(traslados)}</dd>
          <span className="text-ink/40 text-xs">
            {sitio ? 'entrados y salidos de aquí' : 'en el libro'}
          </span>
        </div>
      </dl>
    </div>
  )
}

/**
 * En qué sitios está repartido un artículo, y qué se puede hacer en cada uno.
 *
 * Es el puente entre el total y el almacén. Las filas con existencia en cero se
 * muestran igual, apagadas: saber que un taller tuvo el repuesto y se le acabó
 * es distinto de no verlo listado, que se lee como que nunca lo manejó.
 */
function ModalDesglose({
  articulo,
  onCerrar,
  puedeMover,
  onSacar,
  onContar,
}: {
  articulo: ExistenciaTotal | null
  onCerrar: () => void
  puedeMover: boolean
  onSacar: (fila: Existencia) => void
  onContar: (fila: Existencia) => void
}) {
  const { data, isPending, error } = useExistenciasDeArticulo(articulo?.articulo_id ?? null)

  return (
    <Modal
      abierto={articulo !== null}
      onCerrar={onCerrar}
      titulo={articulo?.articulo ?? ''}
      descripcion={
        articulo
          ? `Hay ${cantidad(articulo.existencia)} ${articulo.unidad} en total. Aquí es donde están.`
          : undefined
      }
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data ? (
        <ul className="divide-hairline divide-y">
          {data.map((f) => {
            const vacio = Number(f.existencia) <= 0
            return (
              <li key={f.almacen_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 grow">
                  <p className={cn('text-sm font-medium', vacio ? 'text-ink/40' : 'text-ink/85')}>
                    {f.almacen}
                  </p>
                  <p className="text-ink/45 text-xs">
                    <span className="tabular">{cantidad(f.existencia)}</span> {f.unidad}
                    {f.costo_promedio_usd ? ` · ${dolares(f.costo_promedio_usd)} c/u` : ''}
                  </p>
                </div>

                {puedeMover ? (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<PackageMinus />}
                      disabled={vacio}
                      onClick={() => onSacar(f)}
                    >
                      Sacar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Scale />}
                      onClick={() => onContar(f)}
                    >
                      Contar
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </Modal>
  )
}
