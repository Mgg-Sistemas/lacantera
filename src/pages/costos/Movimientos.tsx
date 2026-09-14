/*
  El libro de la caja abierta.

  Una fila por hecho. Las que vienen de otro módulo no se tocan aquí; las
  que se teclearon aquí tampoco: se reversan. Lo que llegó tarde lleva su
  chip, y el reverso se pinta en gris apuntando a lo que anula.
*/
import { useState } from 'react'
import { BookOpen, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { CLASES, useMovimientosCaja, useRegistrarGastoCosto, type CajaCosto, type ClaseCosto } from '@/lib/api/costos'
import { useCategoriasGasto } from '@/lib/api/categoriasGasto'
import { useMonedasUsables } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { dinero, dolares, enteros, fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { ORIGENES } from './formato'

export function Movimientos({ caja }: { caja: CajaCosto }) {
  const { puede } = useMisPermisos()
  const [clase, setClase] = useState('')
  const [agregando, setAgregando] = useState(false)
  const filas = useMovimientosCaja(caja.id, { clase: clase || undefined })

  return (
    <>
      <Card className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label="Clase"
          vacio="Todas"
          value={clase}
          onChange={(e) => setClase(e.target.value)}
          opciones={(Object.keys(CLASES) as ClaseCosto[]).map((c) => ({ valor: c, etiqueta: CLASES[c] }))}
          className="w-52"
        />
        {puede('COSTOS', 'ESCRITURA') ? (
          <Button variant="outline" onClick={() => setAgregando(true)} className="mb-0.5">
            <Plus className="size-4" />
            Agregar gasto
          </Button>
        ) : null}
      </Card>

      {filas.isPending ? <Cargando /> : null}
      {filas.error ? <ErrorDeCarga error={filas.error} /> : null}

      {filas.data && filas.data.length === 0 ? (
        <Vacio
          icono={<BookOpen />}
          titulo="El libro está vacío"
          descripcion="Lo que se acepte en «Por aceptar» y lo que se teclee aquí aparece en esta lista."
        />
      ) : null}

      {filas.data && filas.data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-2.5 font-medium">Fecha</th>
                  <th className="px-5 py-2.5 font-medium">Descripción</th>
                  <th className="px-5 py-2.5 font-medium">Clase</th>
                  <th className="px-5 py-2.5 text-right font-medium">m³</th>
                  <th className="px-5 py-2.5 text-right font-medium">Monto</th>
                  <th className="px-5 py-2.5 text-right font-medium">USD</th>
                </tr>
              </thead>
              <tbody className="divide-hairline divide-y">
                {filas.data.map((m) => (
                  <tr key={m.id} className={cn(m.sentido === 'REVERSO' && 'text-ink/45')}>
                    <td className="px-5 py-2.5 whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                    <td className="px-5 py-2.5">
                      <span className="text-ink/85">{m.descripcion}</span>
                      <span className="text-ink/40 block text-xs">
                        {ORIGENES[m.origen] ?? m.origen}
                        {m.categoria_nombre ? ` · ${m.categoria_nombre}` : m.clase === 'GASTO' ? ' · sin clasificar' : ''}
                        {m.origen_fondo_nombre ? ` · ${m.origen_fondo_nombre}` : ''}
                        {m.sentido === 'REVERSO' ? ` · reverso de n.º ${m.reversa_a}` : ''}
                        {m.nota ? ` · ${m.nota}` : ''}
                      </span>
                      {m.llego_tarde ? (
                        <Chip tone="warning" className="mt-1">
                          Llegó tarde
                        </Chip>
                      ) : null}
                      {m.tasa_arrastrada ? (
                        <Chip tone="info" className="mt-1 ml-1">
                          Tasa de un día anterior
                        </Chip>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5">
                      <Chip tone={m.clase === 'ENTREGA' ? 'success' : m.clase === 'ABONO' ? 'info' : 'neutral'}>
                        {CLASES[m.clase] ?? m.clase}
                      </Chip>
                    </td>
                    <td className="tabular px-5 py-2.5 text-right whitespace-nowrap">
                      {m.m3 === null ? <span className="text-ink/25">—</span> : enteros(m.m3)}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right whitespace-nowrap">
                      {Number(m.monto) === 0 ? <span className="text-ink/25">—</span> : dinero(m.moneda, m.monto)}
                    </td>
                    <td className="tabular text-ink/85 px-5 py-2.5 text-right whitespace-nowrap">
                      {Number(m.monto_usd) === 0 ? <span className="text-ink/25">—</span> : dolares(m.monto_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {agregando ? <AgregarGasto onCerrar={() => setAgregando(false)} /> : null}
    </>
  )
}

/*
  Un gasto suelto: comida, viáticos, permisos. La categoría es opcional: sin
  ella sale «sin clasificar», a la vista, y no se le inventa casilla.
*/
function AgregarGasto({ onCerrar }: { onCerrar: () => void }) {
  const registrar = useRegistrarGastoCosto()
  const categorias = useCategoriasGasto()
  const monedas = useMonedasUsables()
  const hoy = hoyEnCaracas()

  const [fecha, setFecha] = useState(hoy)
  const [moneda, setMoneda] = useState('USD')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('')
  const [nota, setNota] = useState('')

  const hojas = (categorias.data ?? []).filter((c) => c.padre !== null)
  const valido = fecha !== '' && fecha <= hoy && Number(monto) > 0 && descripcion.trim().length >= 3

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Agregar gasto"
      descripcion="Lo que ningún módulo registra. Se valora con la tasa del día del gasto."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!valido || registrar.isPending}
            onClick={async () => {
              await registrar.mutateAsync({
                fecha,
                moneda,
                monto: Number(monto),
                descripcion: descripcion.trim(),
                categoria: categoria || null,
                nota: nota.trim() || null,
              })
              onCerrar()
            }}
          >
            {registrar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Fecha" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Select
          label="Moneda"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          opciones={(monedas.data ?? []).map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
        />
        <Input
          label="Monto"
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
        <Select
          label="Categoría (opcional)"
          vacio="Sin clasificar"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          opciones={hojas.map((c) => {
            const padre = (categorias.data ?? []).find((p) => p.codigo === c.padre)
            return { valor: c.codigo, etiqueta: padre ? `${padre.nombre} · ${c.nombre}` : c.nombre }
          })}
        />
      </div>
      <div className="mt-4">
        <Input
          label="Qué es"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Comida del turno de la tarde"
        />
      </div>
      <div className="mt-4">
        <Textarea label="Nota (opcional)" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-3" /> : null}
    </Modal>
  )
}
