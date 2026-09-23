import { useState } from 'react'
import { FileText, HandCoins, Plus, Receipt, Wallet, XCircle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import {
  useAbonarPrestamo,
  useAnularPrestamo,
  useCobrarCuota,
  usePrestamosDeEmpleado,
  useRegistrarPrestamo,
  type Prestamo,
} from '@/lib/api/nomina'
import { dinero, fecha as fmtFecha } from '@/lib/formato'
import type { Empleado } from '@/lib/api/nomina'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { armarReciboDePrestamo } from '@/lib/ficha/prestamoPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'

/*
  LOS PRÉSTAMOS DE UN TRABAJADOR

  El cálculo de nómina ya sabía descontar una cuota —`DED-PRE` existe desde
  antes— y el tope del tercio de la LOTTT 154 lo aplica la base. Lo que no
  existía era el préstamo: ni capital, ni cuántas cuotas, ni saldo.

  LAS TRES FORMAS DE COBRAR SON UNA SOLA COSA

  Se pidieron tres: en N quincenas, en una sola, o pagado por el propio
  trabajador. Las dos primeras son la misma con N distinto, y la tercera baja
  el MISMO saldo. Por eso aquí no hay tres flujos sino dos botones —«Cobrar por
  nómina» y «Registró un pago»— contra el mismo número.

  EL SALDO MANDA, NO LAS CUOTAS

  No se generan cuotas por adelantado. Si se generaran, un pago voluntario a
  mitad obligaría a rehacer las que faltan. Las cuotas pactadas se enseñan como
  lo que son: lo que se acordó, no un calendario que el sistema persigue.
*/

const TONO: Record<Prestamo['estado'], 'success' | 'warning' | 'neutral'> = {
  VIGENTE: 'warning',
  SALDADO: 'success',
  ANULADO: 'neutral',
}

export function PrestamosDelTrabajador({
  empleadoId,
  puedeEditar,
  empleado,
}: {
  empleadoId: number
  puedeEditar: boolean
  /**
   * La ficha entera, para el recibo.
   *
   * Llega del padre en vez de volver a pedirla: la ficha ya la tiene cargada,
   * y una segunda consulta por los mismos datos solo sirve para que el nombre
   * del papel y el de la pantalla puedan discrepar un instante.
   */
  empleado?: Empleado
}) {
  const prestamos = usePrestamosDeEmpleado(empleadoId)
  const registrar = useRegistrarPrestamo()
  const cobrar = useCobrarCuota()
  const abonar = useAbonarPrestamo()
  const anular = useAnularPrestamo()
  const { data: empresa } = useEmpresa()
  const [recibo, setRecibo] = useState<ArchivoArmado | null>(null)

  /*
    EL RECIBO SE ARMA AL PEDIRLO, NO AL CARGAR LA FICHA.

    Son tres o cuatro préstamos por persona y cada PDF pesa. Armarlos todos
    por si acaso cuesta medio segundo de ficha a cambio de nada: casi siempre
    no se imprime ninguno.
  */
  const imprimir = async (p: Prestamo) => {
    if (!empleado || !empresa) return
    setRecibo(
      await armarReciboDePrestamo({
        empresa: empresaDelPapel(empresa),
        momento: new Date(),
        trabajador: {
          nombre: `${empleado.nombres} ${empleado.apellidos}`.trim(),
          cedula: empleado.cedula,
          ficha: empleado.ficha,
          cargo: empleado.cargo,
          telefono: empleado.telefono,
          activo: empleado.activo,
          banco: empleado.banco,
          numeroCuenta: empleado.numero_cuenta,
          telefonoPago: empleado.telefono_pago,
        },
        prestamo: {
          id: p.id,
          fecha: p.fecha,
          capital: Number(p.capital),
          moneda: p.moneda,
          motivo: p.motivo,
          cuotasPactadas: p.cuotas_pactadas,
          estado: p.estado,
          abonado: Number(p.abonado),
          saldo: Number(p.saldo),
          nota: p.nota,
        },
      }),
    )
  }

  const [nuevo, setNuevo] = useState<{
    capital: string
    motivo: string
    cuotas: string
    moneda: string
  } | null>(null)
  const [pagando, setPagando] = useState<{
    prestamo: Prestamo
    como: 'NOMINA' | 'DIRECTO'
    monto: string
    nota: string
  } | null>(null)
  const [anulando, setAnulando] = useState<{ prestamo: Prestamo; motivo: string } | null>(null)

  const lista = prestamos.data ?? []
  const vivos = lista.filter((p) => p.estado === 'VIGENTE')

  /*
    SE DEBE POR MONEDA, NO UN NÚMERO SOLO.

    Un préstamo puede pactarse en bolívares o en dólares. Sumar los dos en una
    cifra daría un número que no significa nada —y que además parecería
    razonable, que es lo peor—. Si alguien debe 3.000 Bs y 50 $, se dicen los
    dos y no «3.050».
  */
  const debePorMoneda = vivos.reduce<Record<string, number>>((acc, p) => {
    acc[p.moneda] = (acc[p.moneda] ?? 0) + Number(p.saldo)
    return acc
  }, {})
  const debeAlgo = Object.values(debePorMoneda).some((v) => v > 0)

  return (
    <>
      <Card className="mt-4">
        <CardHeader
          title="Préstamos"
          subtitle="Lo que se le prestó y lo que le queda por pagar. Se cobra por nómina, o lo paga él."
          action={
            puedeEditar ? (
              <Button
                size="sm"
                variant="outline"
                icon={<Plus />}
                onClick={() => setNuevo({ capital: '', motivo: '', cuotas: '', moneda: 'VES' })}
              >
                Prestar
              </Button>
            ) : null
          }
        />

        {prestamos.isPending ? (
          <Cargando />
        ) : prestamos.error ? (
          <ErrorDeCarga error={prestamos.error} />
        ) : lista.length === 0 ? (
          <p className="text-ink/45 mt-4 text-sm">No tiene préstamos.</p>
        ) : (
          <>
            {/* Lo que se pregunta al abrir una ficha no es «cuántos préstamos
                tuvo» sino «cuánto debe hoy». Va arriba y en una sola cifra. */}
            <div className="mt-4 flex flex-wrap gap-2">
              {debeAlgo ? (
                Object.entries(debePorMoneda)
                  .filter(([, v]) => v > 0)
                  .map(([m, v]) => (
                    <Chip key={m} tone="warning" icon={<Wallet />}>
                      Debe {dinero(m, v)}
                    </Chip>
                  ))
              ) : (
                <Chip tone="success" icon={<Wallet />}>
                  No debe nada
                </Chip>
              )}
              {vivos.length > 0 ? (
                <Chip>
                  {vivos.length} {vivos.length === 1 ? 'préstamo vigente' : 'préstamos vigentes'}
                </Chip>
              ) : null}
            </div>

            <ul className="divide-hairline mt-4 divide-y">
              {lista.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <HandCoins className="text-ink/30 size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {p.motivo}
                      <span className="text-ink/50 font-normal"> · PRE-{p.id}</span>
                    </p>
                    <p className="text-ink/45 text-xs">
                      {[
                        `${fmtFecha(p.fecha)}`,
                        `capital ${dinero(p.moneda, p.capital)}`,
                        `abonado ${dinero(p.moneda, p.abonado)}`,
                        p.cuotas_pactadas ? `${p.cuotas_pactadas} cuotas pactadas` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="tabular text-sm font-medium">{dinero(p.moneda, p.saldo)}</p>
                    <p className="text-ink/45 text-xs">saldo</p>
                  </div>

                  <Chip tone={TONO[p.estado]}>
                    {p.estado === 'VIGENTE'
                      ? 'Vigente'
                      : p.estado === 'SALDADO'
                        ? 'Saldado'
                        : 'Anulado'}
                  </Chip>

                  {/* Imprimir no cambia nada, así que no pide permiso de
                      escritura: quien ve el préstamo puede sacar su recibo. */}
                  {empleado ? (
                    <Button size="sm" variant="ghost" icon={<FileText />} onClick={() => void imprimir(p)}>
                      Recibo
                    </Button>
                  ) : null}

                  {puedeEditar && p.estado === 'VIGENTE' ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Receipt />}
                        onClick={() =>
                          setPagando({ prestamo: p, como: 'NOMINA', monto: '', nota: '' })
                        }
                      >
                        Cobrar por nómina
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Wallet />}
                        onClick={() =>
                          setPagando({ prestamo: p, como: 'DIRECTO', monto: '', nota: '' })
                        }
                      >
                        Registró un pago
                      </Button>
                      {p.abonos === 0 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<XCircle />}
                          onClick={() => setAnulando({ prestamo: p, motivo: '' })}
                        >
                          Anular
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}

        {cobrar.error ? <ErrorDeCarga error={cobrar.error} className="mt-3" /> : null}
        {abonar.error ? <ErrorDeCarga error={abonar.error} className="mt-3" /> : null}
        {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
      </Card>

      {/* ── Prestar ─────────────────────────────────────────────────────── */}
      {nuevo ? (
        <Modal
          abierto
          onCerrar={() => setNuevo(null)}
          titulo="Prestar"
          descripcion="Las cuotas que se pacten son una intención, no un calendario: lo que manda es el saldo."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  registrar.isPending ||
                  !(Number(nuevo.capital) > 0) ||
                  nuevo.motivo.trim().length < 5
                }
                onClick={() =>
                  registrar.mutate(
                    {
                      empleado_id: empleadoId,
                      capital: Number(nuevo.capital),
                      motivo: nuevo.motivo,
                      moneda: nuevo.moneda,
                      cuotas: nuevo.cuotas ? Number(nuevo.cuotas) : null,
                    },
                    { onSuccess: () => setNuevo(null) },
                  )
                }
              >
                {registrar.isPending ? 'Guardando…' : 'Prestar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Cuánto"
              type="number"
              inputMode="decimal"
              value={nuevo.capital}
              onChange={(e) => setNuevo({ ...nuevo, capital: e.target.value })}
            />
            <Select
              label="Moneda"
              value={nuevo.moneda}
              onChange={(e) => setNuevo({ ...nuevo, moneda: e.target.value })}
              opciones={[
                { valor: 'VES', etiqueta: 'Bolívares' },
                { valor: 'USD', etiqueta: 'Dólares' },
              ]}
            />
            <Input
              label="En cuántas quincenas"
              type="number"
              hint="Opcional. Una sola quincena es 1."
              value={nuevo.cuotas}
              onChange={(e) => setNuevo({ ...nuevo, cuotas: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Textarea
                label="Para qué es"
                rows={2}
                value={nuevo.motivo}
                onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })}
              />
            </div>
          </div>

          {registrar.error ? <ErrorDeCarga error={registrar.error} /> : null}
        </Modal>
      ) : null}

      {/* ── Cobrar o abonar ─────────────────────────────────────────────── */}
      {pagando ? (
        <Modal
          abierto
          onCerrar={() => setPagando(null)}
          titulo={pagando.como === 'NOMINA' ? 'Cobrar por nómina' : 'Registrar un pago suyo'}
          descripcion={
            pagando.como === 'NOMINA'
              ? 'Se carga al período de nómina abierto y baja el saldo, en el mismo acto.'
              : 'Un pago que trajo él, por fuera de la nómina. Baja el mismo saldo.'
          }
          acciones={
            <>
              <Button variant="ghost" onClick={() => setPagando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  cobrar.isPending || abonar.isPending || !(Number(pagando.monto) > 0)
                }
                onClick={() => {
                  const comun = {
                    prestamo_id: pagando.prestamo.id,
                    monto: Number(pagando.monto),
                    nota: pagando.nota || null,
                  }
                  const cerrar = { onSuccess: () => setPagando(null) }
                  if (pagando.como === 'NOMINA') cobrar.mutate(comun, cerrar)
                  else abonar.mutate(comun, cerrar)
                }}
              >
                {cobrar.isPending || abonar.isPending ? 'Guardando…' : 'Registrar'}
              </Button>
            </>
          }
        >
          <p className="text-ink/70 mb-4 text-sm">
            A <strong>PRE-{pagando.prestamo.id}</strong> le quedan{' '}
            <strong>{dinero(pagando.prestamo.moneda, pagando.prestamo.saldo)}</strong>.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Cuánto"
              type="number"
              inputMode="decimal"
              hint={`Máximo ${dinero(pagando.prestamo.moneda, pagando.prestamo.saldo)}`}
              value={pagando.monto}
              onChange={(e) => setPagando({ ...pagando, monto: e.target.value })}
            />
            <Input
              label="Nota"
              value={pagando.nota}
              onChange={(e) => setPagando({ ...pagando, nota: e.target.value })}
            />
          </div>

          {pagando.como === 'NOMINA' ? (
            <p className="text-ink/45 mt-4 text-xs">
              Si la cuota pasa del tercio de lo que gana en el período, el cálculo la rechazará
              con su propio aviso: es el artículo 154 de la LOTTT, no un límite del sistema.
            </p>
          ) : null}
        </Modal>
      ) : null}

      {/* ── Anular ──────────────────────────────────────────────────────── */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo="Anular el préstamo"
          descripcion="Solo se anula lo que no se ha empezado a cobrar."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={anular.isPending || anulando.motivo.trim().length < 10}
                onClick={() =>
                  anular.mutate(
                    { id: anulando.prestamo.id, motivo: anulando.motivo },
                    { onSuccess: () => setAnulando(null) },
                  )
                }
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se anula"
            rows={2}
            hint="Al menos diez letras: dentro de un año esto será lo único que lo explique."
            value={anulando.motivo}
            onChange={(e) => setAnulando({ ...anulando, motivo: e.target.value })}
          />
        </Modal>
      ) : null}

      <Visor
        abierto={recibo !== null}
        onCerrar={() => setRecibo(null)}
        blob={recibo?.blob ?? null}
        nombreArchivo={recibo?.nombre ?? ''}
        titulo="Recibo de préstamo"
        descripcion="Se imprime y se firma: quien recibe el dinero reconoce la deuda y autoriza el descuento."
      />
    </>
  )
}
