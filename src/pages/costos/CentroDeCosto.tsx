/*
  El centro de costo.

  Lo que entra para operar, lo que cuesta producir y a cuánto sale el metro
  cúbico. Es una caja: se cierra y la foto se congela.

  TRES CIFRAS ARRIBA Y TODO LO DEMÁS EN PESTAÑAS

  El centro de costos viejo tenía siete cifras compitiendo en la misma vista.
  Aquí gerencia ve primero lo que decide el precio —costo por m³, costo de la
  caja, m³ salidos— y una franja que le dice si esas cifras ya son de fiar
  (cuánto falta por aceptar). El fondo, la deuda, el libro y las cajas
  cerradas van cada uno en su pestaña.

  EL COSTO POR M³ DICE LO QUE INCLUYE. Hoy es viajes + gastos + fijos; nómina
  y combustible entran cuando su fuente exista. Una cifra sin ese rótulo sería
  flete disfrazado de costo.
*/
import { useState } from 'react'
import { Landmark, Lock } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useAbrirPrimeraCaja, useCajaAbierta, useResumenCaja } from '@/lib/api/costos'
import { useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { enteros, fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { Cifra } from './Cifra'
import { diceQueIncluye, dineroONada, porM3 } from './formato'
import { PorAceptar } from './PorAceptar'
import { Movimientos } from './Movimientos'
import { FondoYDeuda } from './FondoYDeuda'
import { CajasCerradas } from './CajasCerradas'
import { Catalogos } from './Catalogos'
import { CerrarCaja } from './CerrarCaja'

type Pestana = 'aceptar' | 'movimientos' | 'fondo' | 'cerradas' | 'catalogos'

export function CentroDeCosto() {
  const { puede } = useMisPermisos()
  const caja = useCajaAbierta()
  const resumen = useResumenCaja(null, caja.data != null)
  const [pestana, setPestana] = useState<Pestana>('aceptar')
  const [cerrando, setCerrando] = useState(false)

  const puedeCerrar = puede('COSTOS', 'TOTAL')
  const r = resumen.data

  if (caja.isPending) return <Cargando />
  if (caja.error) return <ErrorDeCarga error={caja.error} />

  if (!caja.data) {
    return (
      <>
        <PageHeader
          title="Centro de costo"
          description="Lo que entra para operar, lo que cuesta producir y a cuánto sale el metro cúbico. Es una caja: se cierra y la foto se congela."
        />
        {puedeCerrar ? (
          <AbrirPrimeraCaja />
        ) : (
          <Vacio
            icono={<Lock />}
            titulo="Todavía no hay una caja abierta"
            descripcion="La abre quien tenga Total en el centro de costo. Hasta entonces no hay nada que mirar."
          />
        )}
      </>
    )
  }

  const c = caja.data
  const titulo = c.nombre ? `Caja ${c.numero} · ${c.nombre}` : `Caja ${c.numero}`
  const tapado = r?.dinero_tapado ?? false

  const pestanas: Array<{ id: Pestana; etiqueta: string; soloTotal?: boolean }> = [
    { id: 'aceptar', etiqueta: 'Por aceptar' },
    { id: 'movimientos', etiqueta: 'Movimientos' },
    { id: 'fondo', etiqueta: 'Fondo y deuda' },
    { id: 'cerradas', etiqueta: 'Cajas cerradas' },
    { id: 'catalogos', etiqueta: 'Catálogos', soloTotal: true },
  ]

  return (
    <>
      <PageHeader
        title="Centro de costo"
        description={`${titulo} · abierta desde el ${fmtFecha(c.fecha_inicio)}. Se cierra y la foto se congela; lo que llegue después entra en la siguiente.`}
        actions={
          puedeCerrar ? (
            <Button variant="outline" onClick={() => setCerrando(true)}>
              <Landmark className="size-4" />
              Cerrar caja
            </Button>
          ) : undefined
        }
      />

      {resumen.isPending ? <Cargando /> : null}
      {resumen.error ? <ErrorDeCarga error={resumen.error} /> : null}

      {r ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Cifra
              grande
              rotulo="Costo por m³"
              valor={tapado ? '—' : porM3(r.costo_por_m3)}
              pie={
                tapado
                  ? 'Sin la casilla de ver el pago de viajes el costo va en blanco'
                  : r.m3_planta === 0
                    ? `Falta anotar salidas de planta. Incluye ${diceQueIncluye(r.incluye)}.`
                    : `Incluye ${diceQueIncluye(r.incluye)} · sobre m³ estimados por carga útil`
              }
              apagada={tapado || r.costo_por_m3 === null}
            />
            <Cifra
              rotulo="Costo de la caja"
              valor={dineroONada(r.costo_usd)}
              pie={
                r.ajustes_tardios_usd && r.ajustes_tardios_usd !== 0
                  ? `Más ${dineroONada(r.ajustes_tardios_usd)} de ajustes de cajas cerradas, fuera del costo por m³`
                  : `Desde el ${fmtFecha(c.fecha_inicio)}`
              }
              apagada={tapado}
            />
            <Cifra
              rotulo="m³ salidos de planta"
              valor={enteros(r.m3_planta)}
              pie={`${enteros(r.m3_mina)} m³ bajaron de la mina · estimados por carga útil`}
              apagada={r.m3_planta === 0}
            />
          </div>

          {r.pendientes > 0 || r.reversos_pendientes > 0 ? (
            <Card className="border-warning/30 bg-warning-soft mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink/80 text-sm">
                {r.pendientes > 0 ? (
                  <>
                    <span className="tabular font-semibold">{r.pendientes}</span> por aceptar con fecha
                    dentro de esta caja
                  </>
                ) : null}
                {r.pendientes > 0 && r.reversos_pendientes > 0 ? ' · ' : null}
                {r.reversos_pendientes > 0 ? (
                  <>
                    <span className="tabular font-semibold">{r.reversos_pendientes}</span> anulados que hay
                    que reversar
                  </>
                ) : null}
                . Hasta que se decidan, las cifras de arriba no están completas.
              </p>
              <Button variant="soft" size="sm" onClick={() => setPestana('aceptar')}>
                Ir a por aceptar
              </Button>
            </Card>
          ) : null}
        </>
      ) : null}

      <div className="border-hairline mt-6 mb-5 flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pestanas
          .filter((p) => !p.soloTotal || puedeCerrar)
          .map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              aria-current={pestana === p.id}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                pestana === p.id
                  ? 'border-royal-600 text-royal-700 dark:text-royal-300'
                  : 'text-ink/55 hover:text-ink/80 border-transparent',
              )}
            >
              {p.etiqueta}
            </button>
          ))}
      </div>

      {pestana === 'aceptar' ? <PorAceptar caja={c} /> : null}
      {pestana === 'movimientos' ? <Movimientos caja={c} /> : null}
      {pestana === 'fondo' ? <FondoYDeuda caja={c} resumen={r ?? null} /> : null}
      {pestana === 'cerradas' ? <CajasCerradas /> : null}
      {pestana === 'catalogos' ? <Catalogos /> : null}

      {cerrando && r ? <CerrarCaja caja={c} resumen={r} onCerrar={() => setCerrando(false)} /> : null}
    </>
  )
}

/*
  Abrir la primera caja. Las siguientes las abre el cierre de la anterior.
*/
function AbrirPrimeraCaja() {
  const abrir = useAbrirPrimeraCaja()
  const hoy = hoyEnCaracas()
  const [desde, setDesde] = useState(`${hoy.slice(0, 8)}01`)
  const [nombre, setNombre] = useState('')
  const [saldo, setSaldo] = useState('')

  const valido = desde !== '' && desde <= hoy && (saldo === '' || Number(saldo) >= 0)

  return (
    <Card className="max-w-lg">
      <p className="text-ink/85 text-base font-medium">Abrir la primera caja</p>
      <p className="text-ink/55 mt-1 text-sm">
        Desde qué día se cuenta el costo. Los viajes ya registrados con fecha dentro de la caja aparecen
        por aceptar en cuanto se abra.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input label="Desde" type="date" max={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Input
          label="Nombre (opcional)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Septiembre"
        />
        <Input
          label="Saldo inicial (USD)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={saldo}
          onChange={(e) => setSaldo(e.target.value)}
          hint="Lo que ya había en fondo al arrancar. Cero si se empieza de nada."
        />
      </div>
      <Button
        className="mt-4"
        disabled={!valido || abrir.isPending}
        onClick={() =>
          void abrir.mutateAsync({
            fecha_inicio: desde,
            nombre: nombre.trim() || null,
            saldo_inicial: saldo === '' ? 0 : Number(saldo),
          })
        }
      >
        {abrir.isPending ? 'Abriendo…' : 'Abrir caja'}
      </Button>
      {abrir.error ? <ErrorDeCarga error={abrir.error} className="mt-3" /> : null}
    </Card>
  )
}
