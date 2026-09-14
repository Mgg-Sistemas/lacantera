/*
  Los catálogos del centro de costo, en manos de la empresa.

  Orígenes del fondo, gastos fijos que se repiten cada caja, categorías de
  gasto, y el corte mensual. Todo se toca desde donde se ve, sin pedir un
  despliegue.
*/
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { ListaEditable } from '@/components/ListaEditable'
import {
  useConfiguracionCostos,
  useConfigurarCostos,
  useGastosFijos,
  useGuardarGastoFijo,
  useGuardarOrigenFondo,
  useOrigenesFondo,
  type GastoFijo,
} from '@/lib/api/costos'
import { useBorrarCategoriaGasto, useCategoriasGasto, useGuardarCategoriaGasto } from '@/lib/api/categoriasGasto'
import { useMonedasUsables } from '@/lib/api/tasas'
import { dinero } from '@/lib/formato'
import { aTexto } from './formato'

export function Catalogos() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <CorteMensual />
      <Origenes />
      <Fijos />
      <Categorias />
    </div>
  )
}

function CorteMensual() {
  const conf = useConfiguracionCostos()
  const configurar = useConfigurarCostos()
  const encendido = conf.data?.corte_mensual ?? false
  return (
    <Card>
      <CardHeader
        title="Corte mensual"
        subtitle="Con esto encendido, al cerrar la caja se propone el último día del mes y se avisa si se elige otra fecha. Un solo calendario."
      />
      <label className="mt-4 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={encendido}
          disabled={conf.isPending || configurar.isPending}
          onChange={(e) => void configurar.mutateAsync({ corte_mensual: e.target.checked })}
        />
        <span className="text-ink/80">Las cajas se cortan a fin de mes</span>
      </label>
      {configurar.error ? <ErrorDeCarga error={configurar.error} className="mt-3" /> : null}
    </Card>
  )
}

/*
  Los orígenes del fondo. «Venta propia» no viene sembrado a propósito: el día
  que Ventas tenga cobros se decide con datos delante.
*/
function Origenes() {
  const origenes = useOrigenesFondo(true)
  const guardar = useGuardarOrigenFondo()
  const [generaDeuda, setGeneraDeuda] = useState('si')

  return (
    <Card>
      <CardHeader
        title="Orígenes del fondo"
        subtitle="Quién entrega dinero para operar. Los que generan deuda suman a lo que se le debe."
      />
      <div className="mt-4">
        <Select
          label="Los nuevos"
          value={generaDeuda}
          onChange={(e) => setGeneraDeuda(e.target.value)}
          opciones={[
            { valor: 'si', etiqueta: 'Generan deuda (se les devuelve)' },
            { valor: 'no', etiqueta: 'No generan deuda' },
          ]}
        />
      </div>
      <div className="mt-3">
        <ListaEditable
          elementos={(origenes.data ?? []).map((o) => ({
            codigo: o.codigo,
            nombre: o.nombre,
            pista: o.genera_deuda ? 'Genera deuda' : 'No genera deuda',
            activo: o.activo,
          }))}
          error={guardar.error}
          guardando={guardar.isPending}
          etiquetaAnadir="Añadir origen"
          placeholderNuevo="Socio minoritario"
          nota="Apagar un origen lo quita del formulario; sus entregas viejas siguen contando. No se borra."
          onGuardar={(e) => {
            const actual = (origenes.data ?? []).find((o) => o.codigo === e.codigo)
            return guardar.mutateAsync({
              codigo: e.codigo,
              nombre: e.nombre,
              genera_deuda: actual?.genera_deuda ?? true,
              activo: e.activo,
              orden: actual?.orden ?? 100,
            })
          }}
          onBorrar={async () => {
            throw new Error('Los orígenes no se borran: apágalo.')
          }}
          onAnadir={(nombre) => guardar.mutateAsync({ nombre, genera_deuda: generaDeuda === 'si' })}
        />
      </div>
    </Card>
  )
}

/*
  Lo que se repite cada caja y ningún módulo registra. Sin esto el costo por
  m³ sería el flete disfrazado de costo.
*/
function Fijos() {
  const fijos = useGastosFijos()
  const guardar = useGuardarGastoFijo()
  const categorias = useCategoriasGasto()
  const monedas = useMonedasUsables()
  const [editando, setEditando] = useState<GastoFijo | 'nuevo' | null>(null)

  const hojas = (categorias.data ?? []).filter((c) => c.padre !== null)

  return (
    <Card>
      <CardHeader
        title="Gastos fijos"
        subtitle="Explosivos, energía, alquiler, administración: cada uno aparece por aceptar al abrir una caja."
        action={
          <Button size="sm" variant="outline" onClick={() => setEditando('nuevo')}>
            <Plus className="size-4" />
            Añadir
          </Button>
        }
      />
      <ul className="divide-hairline mt-4 divide-y text-sm">
        {(fijos.data ?? []).map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-ink/85">{f.nombre}</p>
              <p className="text-ink/45 text-xs">
                {hojas.find((c) => c.codigo === f.categoria)?.nombre ?? 'Sin clasificar'}
                {!f.activo ? ' · apagado' : ''}
              </p>
            </div>
            <span className="tabular text-ink/85">{dinero(f.moneda, f.monto)}</span>
            <Button size="sm" variant="ghost" onClick={() => setEditando(f)}>
              Editar
            </Button>
          </li>
        ))}
        {(fijos.data ?? []).length === 0 ? (
          <li className="text-ink/45 py-2 text-xs">Ninguno todavía. Sin ellos el costo por m³ es solo viajes y gastos sueltos.</li>
        ) : null}
      </ul>

      {editando ? (
        <FormularioFijo
          fijo={editando === 'nuevo' ? null : editando}
          hojas={hojas.map((c) => {
            const padre = (categorias.data ?? []).find((p) => p.codigo === c.padre)
            return { valor: c.codigo, etiqueta: padre ? `${padre.nombre} · ${c.nombre}` : c.nombre }
          })}
          monedas={(monedas.data ?? []).map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
          onGuardar={async (f) => {
            await guardar.mutateAsync(f)
            setEditando(null)
          }}
          onCerrar={() => setEditando(null)}
          error={guardar.error}
          ocupado={guardar.isPending}
        />
      ) : null}
    </Card>
  )
}

function FormularioFijo({
  fijo,
  hojas,
  monedas,
  onGuardar,
  onCerrar,
  error,
  ocupado,
}: {
  fijo: GastoFijo | null
  hojas: { valor: string; etiqueta: string }[]
  monedas: { valor: string; etiqueta: string }[]
  onGuardar: (f: { id: number | null; nombre: string; moneda: string; monto: number; categoria: string | null; activo: boolean }) => Promise<unknown>
  onCerrar: () => void
  error: unknown
  ocupado: boolean
}) {
  const [nombre, setNombre] = useState(fijo?.nombre ?? '')
  const [moneda, setMoneda] = useState(fijo?.moneda ?? 'USD')
  const [monto, setMonto] = useState(aTexto(fijo?.monto))
  const [categoria, setCategoria] = useState(fijo?.categoria ?? '')
  const [activo, setActivo] = useState(fijo?.activo ?? true)
  const valido = nombre.trim().length >= 2 && Number(monto) > 0

  return (
    <div className="border-hairline mt-4 rounded-[6px] border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Energía de planta" />
        <Select
          label="Categoría (opcional)"
          vacio="Sin clasificar"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          opciones={hojas}
        />
        <Select label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)} opciones={monedas} />
        <Input
          label="Monto por caja"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </div>
      {fijo ? (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          <span className="text-ink/80">Activo</span>
          {!activo ? <Chip tone="neutral">No aparecerá en las cajas nuevas</Chip> : null}
        </label>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={!valido || ocupado}
          onClick={() =>
            void onGuardar({
              id: fijo?.id ?? null,
              nombre: nombre.trim(),
              moneda,
              monto: Number(monto),
              categoria: categoria || null,
              activo,
            })
          }
        >
          {ocupado ? 'Guardando…' : 'Guardar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
    </div>
  )
}

/*
  Las categorías, en dos niveles. Añadir crea siempre dentro del grupo
  elegido: los seis de primer nivel son los que la líder dio.
*/
function Categorias() {
  const categorias = useCategoriasGasto(true)
  const guardar = useGuardarCategoriaGasto()
  const borrar = useBorrarCategoriaGasto()
  const [dentroDe, setDentroDe] = useState('')

  const raices = (categorias.data ?? []).filter((c) => c.padre === null)
  const enOrden = raices.flatMap((r) => [
    { codigo: r.codigo, nombre: r.nombre, activo: r.activa !== false, esGrupo: true },
    ...(categorias.data ?? [])
      .filter((h) => h.padre === r.codigo)
      .map((h) => ({ codigo: h.codigo, nombre: h.nombre, activo: h.activa !== false })),
  ])

  return (
    <Card>
      <CardHeader
        title="Categorías de gasto"
        subtitle="Clasifican lo que se teclea. Lo que ya está registrado sigue contando igual aunque cambien."
      />
      <div className="mt-4">
        <Select
          label="Añadir dentro de"
          vacio="Elegir grupo"
          value={dentroDe}
          onChange={(e) => setDentroDe(e.target.value)}
          opciones={raices.map((r) => ({ valor: r.codigo, etiqueta: r.nombre }))}
        />
      </div>
      <div className="mt-3">
        <ListaEditable
          elementos={enOrden}
          error={guardar.error ?? borrar.error}
          guardando={guardar.isPending || borrar.isPending}
          etiquetaAnadir="Añadir categoría"
          placeholderNuevo="Seguros"
          nota="Apagar una categoría la quita del formulario y deja los gastos viejos donde estaban. Borrar solo funciona con las que nunca se usaron."
          onGuardar={(e) => {
            const actual = (categorias.data ?? []).find((c) => c.codigo === e.codigo)
            return guardar.mutateAsync({ codigo: e.codigo, nombre: e.nombre, padre: actual?.padre ?? null, activa: e.activo })
          }}
          onBorrar={(codigo) => borrar.mutateAsync(codigo)}
          onAnadir={(nombre) => guardar.mutateAsync({ nombre, padre: dentroDe || null })}
        />
      </div>
    </Card>
  )
}
