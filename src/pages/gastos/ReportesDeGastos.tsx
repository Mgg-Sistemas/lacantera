import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Interruptor } from '@/components/ui/Interruptor'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import type { Rango } from '@/components/rango'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil, useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { traerInformeGastosYVentas, type CategoriaDeGasto } from '@/lib/api/gastos'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  armarComparativoGastosVentas,
  armarInformeDeGastos,
  type Agrupacion,
  type MonedaDelReporte,
} from '@/lib/ficha/gastosPdf'

/*
  LOS REPORTES PDF DE GASTOS (10/11/2026).

  Dos papeles desde el mismo sitio: el informe de gastos y el comparativo de
  gastos con las ventas de material (notas de entrega despachadas, sin las que
  siguen por cobrar). Las opciones son las que cambian la respuesta: el
  período (con atajos de mes, trimestre y año, y un mes cualquiera), las
  categorías, cómo se agrupa, en qué moneda se presenta y qué se incluye.

  El comparativo solo se ofrece a quien ve Ventas o Facturación; las órdenes de
  Compras, a quien ve Compras. La base cierra igual la puerta: esto es solo
  para no ofrecer un botón que va a fallar.
*/

type QueReporte = 'GASTOS' | 'COMPARATIVO'

function primeroDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

function ultimoDeMes(anioMes: string): string {
  const [a, m] = anioMes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

function mesPasado(hoy: string): Rango {
  const [a, m] = hoy.split('-').map(Number)
  const am = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
  return { desde: `${am}-01`, hasta: ultimoDeMes(am) }
}

function esteTrimestre(hoy: string): Rango {
  const [a, m] = hoy.split('-').map(Number)
  const inicio = Math.floor((m - 1) / 3) * 3 + 1
  return { desde: `${a}-${String(inicio).padStart(2, '0')}-01`, hasta: hoy }
}

export function ReportesDeGastos({
  categorias,
  onCerrar,
}: {
  categorias: CategoriaDeGasto[]
  onCerrar: () => void
}) {
  const { puede } = useMisPermisos()
  const puedeComparar = puede('VENTAS', 'LECTURA') || puede('FACTURACION', 'LECTURA')
  const puedeCompras = puede('COMPRAS', 'LECTURA')
  const puedeNomina = puede('NOMINA', 'LECTURA')
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()

  const hoy = hoyEnCaracas()
  const [que, setQue] = useState<QueReporte>(puedeComparar ? 'COMPARATIVO' : 'GASTOS')
  const [rango, setRango] = useState<Rango>(mesPasado(hoy))
  const [mes, setMes] = useState('')
  const [elegidas, setElegidas] = useState<string[]>([])
  const [agrupar, setAgrupar] = useState<Agrupacion>('mes')
  const [moneda, setMoneda] = useState<MonedaDelReporte>('AMBAS')
  const [conDetalle, setConDetalle] = useState(false)
  const [conPorCobrar, setConPorCobrar] = useState(true)
  const [conCompras, setConCompras] = useState(false)
  // La nómina del período (11/11/2026): encendida de entrada para quien ve
  // Nómina. Se guarda si la apagó, porque los permisos llegan después del
  // primer pintado y un useState(puedeNomina) se quedaría apagado.
  const [sinNomina, setSinNomina] = useState(false)
  const conNomina = puedeNomina && !sinNomina
  const [conAnuladas, setConAnuladas] = useState(false)
  const [conLogo, setConLogo] = useState(true)

  const [armando, setArmando] = useState(false)
  const [falla, setFalla] = useState<unknown>(null)
  const [vacio, setVacio] = useState<string | null>(null)
  const [archivo, setArchivo] = useState<ArchivoArmado | null>(null)

  const rangoListo = Boolean(rango.desde && rango.hasta && rango.desde <= rango.hasta)

  const elegirMes = (am: string) => {
    setMes(am)
    if (am) setRango({ desde: `${am}-01`, hasta: ultimoDeMes(am) })
  }

  const ponerRango = (r: Rango) => {
    setMes('')
    setRango(r)
  }

  const alternarCategoria = (codigo: string) =>
    setElegidas((ya) => (ya.includes(codigo) ? ya.filter((c) => c !== codigo) : [...ya, codigo]))

  const armar = async () => {
    setArmando(true)
    setFalla(null)
    setVacio(null)
    try {
      const comparativo = que === 'COMPARATIVO'
      const todos = await traerInformeGastosYVentas({
        desde: rango.desde,
        hasta: rango.hasta,
        conVentas: comparativo,
        conCompras: comparativo && conCompras,
        conNomina,
      })
      /*
        La nómina entra a los papeles como un gasto más, en su categoría
        «Nómina»: así suma en el total, en las categorías, en los períodos y en
        el detalle sin un camino aparte. Las categorías elegidas filtran solo
        las facturas; la nómina la manda su propio interruptor.
      */
      const documentos = todos
        .filter((x) => {
          if (x.tipo === 'GASTO' || x.tipo === 'GASTO_ANULADO') {
            if (elegidas.length && !elegidas.includes(x.categoria ?? '')) return false
            if (x.tipo === 'GASTO_ANULADO') return !comparativo && conAnuladas
          }
          return true
        })
        .map((x) => (x.tipo === 'NOMINA' ? { ...x, tipo: 'GASTO' as const } : x))

      const hayAlgo = comparativo
        ? documentos.some((x) => x.tipo === 'VENTA' || x.tipo === 'GASTO' || x.tipo === 'COMPRA')
        : documentos.some((x) => x.tipo === 'GASTO' || x.tipo === 'GASTO_ANULADO')
      if (!hayAlgo) {
        setVacio(
          comparativo
            ? 'No hay ventas ni gastos en ese período con esas opciones.'
            : 'No hay gastos en ese período con esas categorías.',
        )
        return
      }

      const hayNomina = todos.some((x) => x.tipo === 'NOMINA')
      const nombresCategorias = elegidas.length
        ? categorias
            .filter((c) => elegidas.includes(c.codigo))
            .map((c) => c.nombre)
            .concat(hayNomina ? ['Nómina'] : [])
            .join(', ')
        : 'Todas'
      let nombre = `${comparativo ? 'gastos-vs-ventas' : 'informe-de-gastos'}-${rango.desde}-al-${rango.hasta}`
      if (conDetalle) nombre += '-detalle'
      if (!conLogo) nombre += '-sin-logo'

      const base = {
        documentos,
        desde: rango.desde,
        hasta: rango.hasta,
        agrupar,
        moneda,
        categorias: nombresCategorias,
        conDetalle,
        conLogo,
        nombreArchivo: `${nombre}.pdf`,
        empresa: empresaDelPapel(empresa),
        emitidoPor: yo?.nombre ?? '',
        momento: new Date(),
      }
      setArchivo(
        comparativo
          ? await armarComparativoGastosVentas({ ...base, conCompras, conPorCobrar })
          : await armarInformeDeGastos(base),
      )
    } catch (e) {
      setFalla(e)
    } finally {
      setArmando(false)
    }
  }

  return (
    <>
      <Modal
        abierto={archivo === null}
        onCerrar={onCerrar}
        titulo="Reportes PDF"
        descripcion="Informe ejecutivo de gastos o comparativo financiero de gastos frente a las ventas cobradas."
        acciones={
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button icon={<Printer />} disabled={armando || !rangoListo} onClick={() => void armar()}>
              {armando ? 'Armando…' : 'Generar PDF'}
            </Button>
          </>
        }
      >
        <div role="radiogroup" aria-label="Qué reporte" className="grid gap-2 sm:grid-cols-2">
          {[
            {
              valor: 'GASTOS' as const,
              titulo: 'Informe ejecutivo de gastos',
              texto: 'Consolidado por categoría y por período en moneda original y equivalente BCV.',
              puede: true,
            },
            {
              valor: 'COMPARATIVO' as const,
              titulo: 'Comparativo de gastos y ventas',
              texto: puedeComparar
                ? 'Balance operativo de ventas cobradas frente a los gastos registrados, margen neto y absorción.'
                : 'Requiere acceso de lectura en Ventas o Facturación para consultar los ingresos.',
              puede: puedeComparar,
            },
          ].map((o) => (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={que === o.valor}
              disabled={!o.puede}
              onClick={() => setQue(o.valor)}
              className={`rounded-[6px] border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                que === o.valor ? 'border-royal-600 bg-royal-600/10' : 'border-hairline hover:bg-ink/3'
              }`}
            >
              <span className="text-ink/85 block text-sm font-medium">{o.titulo}</span>
              <span className="text-ink/55 mt-0.5 block text-xs">{o.texto}</span>
            </button>
          ))}
        </div>

        <p className="text-ink/80 mt-5 mb-2 text-sm font-medium">Modalidad del informe</p>
        <div role="radiogroup" aria-label="Modalidad del informe" className="grid gap-2 sm:grid-cols-2">
          {[
            {
              detalle: false,
              titulo: 'Solo resumen',
              texto:
                que === 'COMPARATIVO'
                  ? 'Balance operativo con barra comparativa, indicadores ejecutivos, evolución por período, categorías y clientes.'
                  : 'Total de gastos operativos, indicadores ejecutivos, distribución por categoría y evolución por período.',
            },
            {
              detalle: true,
              titulo: 'Resumen + detalle',
              texto:
                que === 'COMPARATIVO'
                  ? 'El resumen ejecutivo más el desglose individual de cada factura de gasto y nota de entrega.'
                  : 'El resumen ejecutivo más la relación detallada de cada factura de gasto registrada.',
            },
          ].map((o) => (
            <button
              key={String(o.detalle)}
              type="button"
              role="radio"
              aria-checked={conDetalle === o.detalle}
              onClick={() => setConDetalle(o.detalle)}
              className={`rounded-[6px] border p-3 text-left transition-colors ${
                conDetalle === o.detalle ? 'border-royal-600 bg-royal-600/10' : 'border-hairline hover:bg-ink/3'
              }`}
            >
              <span className="text-ink/85 block text-sm font-medium">{o.titulo}</span>
              <span className="text-ink/55 mt-0.5 block text-xs">{o.texto}</span>
            </button>
          ))}
        </div>

        <p className="text-ink/80 mt-5 mb-2 text-sm font-medium">Período</p>
        <RangoDeFechas valor={rango} onCambio={ponerRango} />
        <div className="mt-3 grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            label="O un mes completo"
            type="month"
            max={hoy.slice(0, 7)}
            value={mes}
            onChange={(e) => elegirMes(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => ponerRango(esteTrimestre(hoy))}>
              Este trimestre
            </Button>
            <Button variant="outline" onClick={() => ponerRango({ desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy })}>
              Este año
            </Button>
          </div>
        </div>
        {!rangoListo ? (
          <p className="text-warning mt-2 text-xs">
            {rango.desde && rango.hasta
              ? 'La fecha final no puede ser anterior a la inicial.'
              : 'Indique desde qué fecha y hasta qué fecha.'}
          </p>
        ) : null}
        {rangoListo && rango.hasta >= primeroDeMes(hoy) && que === 'COMPARATIVO' ? (
          <p className="text-ink/50 mt-2 text-xs">
            El período incluye el mes en curso: puede haber gastos que todavía no se han registrado.
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Select
            label="Agrupar por"
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value as Agrupacion)}
            opciones={[
              { valor: 'mes', etiqueta: 'Mes' },
              { valor: 'semana', etiqueta: 'Semana' },
              { valor: 'dia', etiqueta: 'Día' },
            ]}
          />
          <Select
            label="Montos en"
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as MonedaDelReporte)}
            opciones={[
              { valor: 'AMBAS', etiqueta: 'Dólares y bolívares' },
              { valor: 'USD', etiqueta: 'Dólares' },
              { valor: 'VES', etiqueta: 'Bolívares' },
            ]}
          />
        </div>

        <p className="text-ink/80 mt-5 mb-2 text-sm font-medium">
          Categorías de gasto{' '}
          <span className="text-ink/45 font-normal">
            {elegidas.length ? `(${elegidas.length} elegida${elegidas.length === 1 ? '' : 's'})` : '(todas)'}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {categorias.map((c) => {
            const puesta = elegidas.includes(c.codigo)
            return (
              <button
                key={c.codigo}
                type="button"
                aria-pressed={puesta}
                onClick={() => alternarCategoria(c.codigo)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  puesta ? 'border-royal-600 bg-royal-600/10 text-ink/90' : 'border-hairline text-ink/65 hover:bg-ink/3'
                }`}
              >
                {c.nombre}
              </button>
            )
          })}
          {elegidas.length ? (
            <button type="button" className="text-ink/50 px-2 text-xs underline" onClick={() => setElegidas([])}>
              Todas
            </button>
          ) : null}
        </div>

        <div className="mt-5 space-y-3">
          <Interruptor
            encendido={conNomina}
            onCambio={(v) => setSinNomina(!v)}
            deshabilitado={!puedeNomina}
            etiqueta="Incluir la nómina"
            detalle={
              puedeNomina
                ? 'Suma cada nómina aprobada o pagada como gasto, en la categoría «Nómina»: lo asignado más los aportes, en el mes en que termina su período (la quincena del 16 al 31 cuenta en ese mes aunque se pague después).'
                : 'Requiere permiso de lectura en el módulo Nómina.'
            }
          />
          {que === 'COMPARATIVO' ? (
            <>
              <Interruptor
                encendido={conPorCobrar}
                onCambio={setConPorCobrar}
                etiqueta="Informar el saldo pendiente por cobrar"
                detalle="Incluye en el recuadro principal una nota informativa con las entregas despachadas pendientes de cobro (sin sumarlas a los ingresos)."
              />
              <Interruptor
                encendido={conCompras}
                onCambio={setConCompras}
                deshabilitado={!puedeCompras}
                etiqueta="Incluir las órdenes de Compras pagadas"
                detalle={
                  puedeCompras
                    ? 'Consolida las órdenes pagadas del módulo Compras, según su fecha de pago, en una columna adicional.'
                    : 'Requiere permiso de lectura en el módulo Compras.'
                }
              />
            </>
          ) : (
            <Interruptor
              encendido={conAnuladas}
              onCambio={setConAnuladas}
              etiqueta="Incluir relación de facturas anuladas"
              detalle="Las presenta en una sección de auditoría separada al final del informe, sin sumarlas al total."
            />
          )}
          <Interruptor encendido={conLogo} onCambio={setConLogo} etiqueta="Incluir logo institucional" />
        </div>

        {vacio ? <p className="text-warning mt-4 text-sm font-medium">{vacio}</p> : null}
        {falla ? <ErrorDeCarga error={falla} className="mt-4" /> : null}
      </Modal>

      <Visor
        abierto={archivo !== null}
        onCerrar={() => setArchivo(null)}
        blob={archivo?.blob ?? null}
        nombreArchivo={archivo?.nombre ?? ''}
        titulo={que === 'COMPARATIVO' ? 'Comparativo de gastos y ventas' : 'Informe de gastos'}
      />
    </>
  )
}
