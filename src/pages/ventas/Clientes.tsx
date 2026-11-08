import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useMonedasUsables } from '@/lib/api/tasas'
import { Building2, Plus, Printer, Search } from 'lucide-react'
import { Interruptor } from '@/components/ui/Interruptor'
import { Visor } from '@/components/Visor'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import {
  agruparPorCliente,
  armarReporteClientesPorCobrar,
  diasVencida,
  type ClienteQueDebe,
} from '@/lib/ficha/clientesPorCobrarPdf'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { CampoDocumento } from '@/components/CampoDocumento'
import { CampoTelefono } from '@/components/CampoTelefono'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { bolivares, documento, dolares, fecha } from '@/lib/formato'
import { useFiltroEnLaDireccion } from '@/lib/enLaDireccion'
import { enMayuscula } from '@/lib/texto'
import {
  CONDICIONES_PAGO,
  useClientes,
  useGuardarCliente,
  useNotasPorCobrarDeClientes,
  type Cliente,
} from '@/lib/api/ventas'

const vacio = {
  rif: '',
  nombre: '',
  nombre_comercial: '',
  contacto: '',
  telefono: '',
  correo: '',
  direccion: '',
  condicion_pago: 'CONTADO',
  limite_credito: '',
  moneda_preferida: 'USD',
  contribuyente_especial: false,
  retencion_iva: '75',
  exento_iva: false,
  activo: true,
  notas: '',
}

export function Clientes() {
  const monedas = useMonedasUsables()
  const { data, isPending, error } = useClientes()

  /*
    El buscador global aterriza aquí con el nombre puesto —el cliente es el
    único de las nueve fuentes que no tiene ficha propia— y esta caja es lo que
    lo recoge. Sirve igual escribiendo a mano: quince clientes hoy, y la lista
    solo crece.
  */
  const [busqueda, setBusqueda] = useFiltroEnLaDireccion()

  /*
    LO QUE DEBEN POR NOTAS DE ENTREGA (07/11/2026): «un apartado de los clientes
    que tienen cuentas por cobrar […] desde notas de entregas». Va aparte de
    «Deuda», que es de facturas y descuenta del límite de crédito.
  */
  const porCobrar = useNotasPorCobrarDeClientes()
  const deudores = useMemo(() => agruparPorCliente(porCobrar.data ?? []), [porCobrar.data])
  const deudaDe = useMemo(() => new Map(deudores.map((d) => [d.clave, d])), [deudores])
  const [soloDeudores, setSoloDeudores] = useState(false)
  const [viendoDeuda, setViendoDeuda] = useState<ClienteQueDebe | null>(null)
  const [pidiendoReporte, setPidiendoReporte] = useState(false)
  const [reporte, setReporte] = useState<ArchivoArmado | null>(null)

  const filtrados = useMemo(() => {
    const aguja = enMayuscula(busqueda.trim())
    const base = soloDeudores ? (data ?? []).filter((c) => deudaDe.has(String(c.id))) : (data ?? [])
    if (!aguja) return base
    return base.filter((c) =>
      [c.nombre, c.nombre_comercial, c.rif, c.contacto].some((x) =>
        enMayuscula(x ?? '').includes(aguja),
      ),
    )
  }, [data, busqueda, soloDeudores, deudaDe])
  const guardar = useGuardarCliente()
  const [edicion, setEdicion] = useState<(typeof vacio & { id?: number }) | null>(null)

  const abrir = (c?: Cliente) =>
    setEdicion(
      c
        ? {
            id: c.id,
            rif: c.rif,
            nombre: c.nombre,
            nombre_comercial: c.nombre_comercial ?? '',
            contacto: c.contacto ?? '',
            telefono: c.telefono ?? '',
            correo: c.correo ?? '',
            direccion: c.direccion ?? '',
            condicion_pago: c.condicion_pago,
            limite_credito: String(Number(c.limite_credito) || ''),
            moneda_preferida: c.moneda_preferida,
            contribuyente_especial: c.contribuyente_especial,
            retencion_iva: String(Number(c.retencion_iva)),
            exento_iva: c.exento_iva,
            activo: c.activo,
            notas: c.notas ?? '',
          }
        : { ...vacio },
    )

  const cambiar = (c: Partial<typeof vacio>) => setEdicion((e) => (e ? { ...e, ...c } : e))

  const aCredito = edicion ? edicion.condicion_pago !== 'CONTADO' : false

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Registro de clientes. La dirección se imprime en la factura y el límite de crédito se aplica al facturar."
        actions={
          <>
            <Button
              variant="outline"
              icon={<Printer />}
              disabled={deudores.length === 0}
              onClick={() => setPidiendoReporte(true)}
            >
              Reporte por cobrar
            </Button>
            <Button icon={<Plus />} onClick={() => abrir()}>
              Nuevo cliente
            </Button>
          </>
        }
      />
      {porCobrar.error ? <ErrorDeCarga error={porCobrar.error} className="mb-4" /> : null}

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Building2 />}
            titulo="Sin clientes registrados"
            descripcion="Sin clientes no se puede despachar ni facturar."
            accion={
              <Button icon={<Plus />} onClick={() => abrir()}>
                Registrar el primero
              </Button>
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card className="mb-4">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Nombre, RIF o contacto"
            maxLength={100}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full sm:w-80"
          />
          {deudores.length > 0 ? (
            <div className="mt-4">
              <Interruptor
                encendido={soloDeudores}
                onCambio={setSoloDeudores}
                etiqueta={`Solo los que deben por notas de entrega (${deudores.filter((d) => d.clave !== 'sin-cliente').length})`}
                detalle="Las notas marcadas «por cobrar» que todavía no se han cobrado."
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      {data && data.length > 0 && filtrados.length === 0 ? (
        <Card>
          <Vacio
            icono={<Search />}
            titulo="Sin resultados"
            descripcion="Busque por parte del nombre o por el RIF sin guiones."
          />
        </Card>
      ) : null}

      {filtrados.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Identificación</th>
                  <th className="px-3 py-3 font-medium">Condición</th>
                  <th className="px-3 py-3 text-right font-medium">Deuda</th>
                  <th className="px-3 py-3 text-right font-medium">Por cobrar</th>
                  <th className="px-3 py-3 text-right font-medium">Última venta</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const debe = Number(c.deuda_usd)
                  const limite = Number(c.limite_credito)
                  const pasado = limite > 0 && debe > limite
                  const enNotas = deudaDe.get(String(c.id))

                  return (
                    <tr
                      key={c.id}
                      onClick={() => abrir(c)}
                      className="border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0"
                    >
                      <td className="px-5 py-3">
                        <p className="text-ink/85 font-medium">{c.nombre}</p>
                        {c.nombre_comercial ? (
                          <p className="text-ink/45 text-xs">{c.nombre_comercial}</p>
                        ) : null}
                      </td>
                      <td className="tabular text-ink/70 px-3 py-3">{documento(c.rif)}</td>
                      <td className="text-ink/70 px-3 py-3">
                        {CONDICIONES_PAGO.find((x) => x.valor === c.condicion_pago)?.etiqueta}
                        {c.contribuyente_especial ? (
                          <Chip tone="warning" className="ml-2">
                            Agente de retención
                          </Chip>
                        ) : null}
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        <span className={debe > 0 ? 'text-ink/85 font-medium' : 'text-ink/35'}>
                          {dolares(debe)}
                        </span>
                        {limite > 0 ? (
                          <span
                            className={`block text-xs ${pasado ? 'text-danger' : 'text-ink/40'}`}
                          >
                            de {dolares(limite)}
                          </span>
                        ) : null}
                      </td>
                      <td className="tabular px-3 py-3 text-right">
                        {enNotas ? (
                          <button
                            type="button"
                            title="Ver las notas que debe"
                            onClick={(e) => {
                              e.stopPropagation()
                              setViendoDeuda(enNotas)
                            }}
                            className="hover:bg-ink/5 -mx-2 rounded-md px-2 py-1 text-right"
                          >
                            <span
                              className={`block font-medium underline decoration-dotted underline-offset-2 ${enNotas.vencidas > 0 ? 'text-danger' : 'text-ink/85'}`}
                            >
                              {dolares(enNotas.usd)}
                            </span>
                            <span className="text-ink/45 block text-xs">
                              {bolivares(enNotas.bs)} · {enNotas.notas.length} nota{enNotas.notas.length === 1 ? '' : 's'}
                              {enNotas.vencidas > 0 ? `, ${enNotas.vencidas} vencida${enNotas.vencidas === 1 ? '' : 's'}` : ''}
                            </span>
                          </button>
                        ) : (
                          <span className="text-ink/35">—</span>
                        )}
                      </td>
                      <td className="text-ink/60 px-3 py-3 text-right text-xs">
                        {c.ultima_venta ? fecha(c.ultima_venta) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Chip tone={c.activo ? 'success' : 'neutral'}>
                          {c.activo ? 'Activo' : 'Inactivo'}
                        </Chip>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.id ? 'Editar cliente' : 'Nuevo cliente'}
          descripcion="La identificación y la dirección salen impresas en la factura."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={guardar.isPending}
                onClick={async () => {
                  await guardar.mutateAsync({
                    ...edicion,
                    limite_credito: Number(edicion.limite_credito) || 0,
                    retencion_iva: Number(edicion.retencion_iva) || 75,
                  })
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {/*
              «IDENTIFICACIÓN» Y NO «RIF». Christopher, 17/09/2026: el rótulo
              asumía una empresa, y «si es persona natural, no puede tener RIF».
              El campo acepta la cédula de quien no tiene RIF, y la factura dice
              cuál de las dos es.
            */}
            <CampoDocumento
              label="Identificación"
              tipo="identificacion"
              valor={edicion.rif}
              onCambiar={(v) => cambiar({ rif: v })}
              required
            />
            <Input
              label="Razón social"
              maxLength={120}
              value={edicion.nombre}
              onChange={(e) => cambiar({ nombre: e.target.value })}
              required
            />
            <Input
              label="Nombre comercial"
              maxLength={120}
              value={edicion.nombre_comercial}
              onChange={(e) => cambiar({ nombre_comercial: e.target.value })}
            />
            <Input
              label="Persona de contacto"
              solo="letras"
              maxLength={60}
              value={edicion.contacto}
              onChange={(e) => cambiar({ contacto: e.target.value })}
            />
            <CampoTelefono
              valor={edicion.telefono}
              onCambiar={(v) => cambiar({ telefono: v })}
            />
            <Input
              label="Correo"
              type="email"
              maxLength={120}
              value={edicion.correo}
              onChange={(e) => cambiar({ correo: e.target.value })}
            />
          </div>

          <Input
            label="Domicilio fiscal"
            className="mt-4"
            maxLength={200}
            hint="Va impreso en la factura. Una factura sin la dirección del comprador está mal emitida."
            value={edicion.direccion}
            onChange={(e) => cambiar({ direccion: e.target.value })}
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Select
              label="Condición de pago"
              value={edicion.condicion_pago}
              onChange={(e) => cambiar({ condicion_pago: e.target.value })}
              opciones={CONDICIONES_PAGO}
            />
            <Select
              label="Moneda preferida"
              value={edicion.moneda_preferida}
              onChange={(e) => cambiar({ moneda_preferida: e.target.value })}
              opciones={monedas.data ?? []}
            />
          </div>

          {aCredito ? (
            <div className="border-warning/30 bg-warning-soft rounded-card mt-4 border p-3">
              <Input
                label="Límite de crédito, en dólares"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                limite={{ maxDecimales: 2, sinNegativos: true }}
                hint="Por encima de este monto no se le factura a crédito. En cero, no se le vende a crédito."
                value={edicion.limite_credito}
                onChange={(e) => cambiar({ limite_credito: e.target.value })}
              />
              <p className="text-warning mt-2 text-xs leading-relaxed">
                Solo lo fija quien tenga control total sobre Ventas.
              </p>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.contribuyente_especial}
                onChange={(e) => cambiar({ contribuyente_especial: e.target.checked })}
              />
              Contribuyente especial — retiene IVA al pagar
            </label>

            {edicion.contribuyente_especial ? (
              <Input
                label="Retención de IVA"
                type="number"
                min="0"
                max="100"
                step="1"
                limite={{ maxEnteros: 3, maxDecimales: 2, sinNegativos: true }}
                className="ml-6"
                hint="Normalmente 75%. Se descuenta de lo que hay que cobrarle, no del total de la factura."
                value={edicion.retencion_iva}
                onChange={(e) => cambiar({ retencion_iva: e.target.value })}
              />
            ) : null}

            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.exento_iva}
                onChange={(e) => cambiar({ exento_iva: e.target.checked })}
              />
              Exento de IVA — sus documentos salen con alícuota cero
            </label>

            <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={edicion.activo}
                onChange={(e) => cambiar({ activo: e.target.checked })}
              />
              Activo — aparece al cotizar y despachar
            </label>
          </div>

          <Textarea
            label="Notas"
            className="mt-4"
            rows={2}
            maxLength={500}
            value={edicion.notas}
            onChange={(e) => cambiar({ notas: e.target.value })}
          />

          {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {viendoDeuda ? <NotasQueDebe deuda={viendoDeuda} onCerrar={() => setViendoDeuda(null)} /> : null}

      {pidiendoReporte ? (
        <ModalReportePorCobrar
          deudores={deudores}
          onCerrar={() => setPidiendoReporte(false)}
          onListo={(archivo) => {
            setPidiendoReporte(false)
            setReporte(archivo)
          }}
        />
      ) : null}

      <Visor
        abierto={reporte !== null}
        onCerrar={() => setReporte(null)}
        blob={reporte?.blob ?? null}
        nombreArchivo={reporte?.nombre ?? ''}
        titulo="Clientes con cuentas por cobrar"
      />
    </>
  )
}

// ──────────────────────── lo que debe un cliente ────────────────────────────

function NotasQueDebe({ deuda, onCerrar }: { deuda: ClienteQueDebe; onCerrar: () => void }) {
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={deuda.cliente}
      descripcion="Notas de entrega por cobrar. Se cobran marcándolas en Facturación › Notas de entrega."
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <div className="bg-ink/3 mb-4 rounded-lg px-4 py-3">
        <p className="text-ink/50 text-xs">Debe en total</p>
        <p className="tabular text-ink/90 text-lg font-semibold">
          {dolares(deuda.usd)} <span className="text-ink/50 text-sm font-normal">· {bolivares(deuda.bs)}</span>
        </p>
        {deuda.vencidas > 0 ? (
          <p className="text-danger text-xs">
            Vencido: {dolares(deuda.usdVencido)} en {deuda.vencidas} nota{deuda.vencidas === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
      <ul className="divide-hairline divide-y">
        {deuda.notas.map((n) => {
          const dias = n.vencida ? diasVencida(n.fecha_pago) : 0
          return (
            <li key={n.nota_id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <Link
                  to={`/app/facturacion/notas-entrega?nota=${encodeURIComponent(n.numero)}`}
                  className="text-royal-600 font-medium hover:underline"
                >
                  {n.numero}
                </Link>
                <p className="text-ink/50 text-xs">Del {fecha(n.fecha)}</p>
                {n.fecha_pago ? (
                  <Chip tone={n.vencida ? 'danger' : 'warning'} className="mt-1">
                    {n.vencida
                      ? `Vencida hace ${dias} día${dias === 1 ? '' : 's'}`
                      : `Vence el ${fecha(n.fecha_pago)}`}
                  </Chip>
                ) : null}
              </div>
              <div className="tabular text-right">
                <p className="text-ink/85 font-medium">{dolares(n.total_usd ?? 0)}</p>
                <p className="text-ink/45 text-xs">{bolivares(n.total_bs ?? 0)}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

// ─────────────────────────────── el reporte ─────────────────────────────────

function ModalReportePorCobrar({
  deudores,
  onCerrar,
  onListo,
}: {
  deudores: ClienteQueDebe[]
  onCerrar: () => void
  onListo: (a: ArchivoArmado) => void
}) {
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const [soloVencidas, setSoloVencidas] = useState(false)
  const [conDetalle, setConDetalle] = useState(true)
  const [conLogo, setConLogo] = useState(true)
  const [armando, setArmando] = useState(false)
  const [falla, setFalla] = useState<string | null>(null)

  // Con «solo vencidas», cada cliente se vuelve a sumar con solo esas notas.
  const salen = soloVencidas
    ? agruparPorCliente(deudores.flatMap((d) => d.notas).filter((n) => n.vencida))
    : deudores
  const notas = salen.reduce((s, c) => s + c.notas.length, 0)

  const armar = async () => {
    setArmando(true)
    setFalla(null)
    try {
      let nombre = `clientes-por-cobrar-${new Date().toISOString().slice(0, 10)}`
      if (soloVencidas) nombre += '-vencidas'
      if (!conDetalle) nombre += '-resumen'
      if (!conLogo) nombre += '-sin-logo'
      onListo(
        await armarReporteClientesPorCobrar({
          clientes: salen,
          alcance: [['Notas', soloVencidas ? 'Solo las vencidas' : 'Todas las pendientes por cobrar']],
          conDetalle,
          conLogo,
          nombreArchivo: `${nombre}.pdf`,
          empresa: empresaDelPapel(empresa),
          emitidoPor: yo?.nombre ?? '',
          momento: new Date(),
        }),
      )
    } catch (e) {
      setFalla(e instanceof Error ? e.message : 'No se pudo armar el reporte.')
    } finally {
      setArmando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Reporte de cuentas por cobrar"
      descripcion="Los clientes que deben por notas de entrega, de quien más debe a quien menos."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button icon={<Printer />} disabled={armando || salen.length === 0} onClick={() => void armar()}>
            {armando ? 'Armando…' : 'Generar PDF'}
          </Button>
        </>
      }
    >
      <p className={`text-sm ${salen.length === 0 ? 'text-warning font-medium' : 'text-ink/65'}`}>
        {salen.length === 0
          ? 'No hay notas vencidas: no hay nada que informar.'
          : `Saldrán ${salen.length} cliente${salen.length === 1 ? '' : 's'} con ${notas} nota${notas === 1 ? '' : 's'}.`}
      </p>
      <div className="mt-5 space-y-3">
        <Interruptor
          encendido={soloVencidas}
          onCambio={setSoloVencidas}
          etiqueta="Solo las notas vencidas"
          detalle="Deja fuera las que todavía no llegan a su fecha de pago."
        />
        <Interruptor
          encendido={conDetalle}
          onCambio={setConDetalle}
          etiqueta="Incluir el detalle de notas de cada cliente"
          detalle="Apagado, el papel lleva solo una fila por cliente."
        />
        <Interruptor encendido={conLogo} onCambio={setConLogo} etiqueta="Con logo" />
      </div>
      {falla ? <ErrorDeCarga error={new Error(falla)} className="mt-4" /> : null}
    </Modal>
  )
}
