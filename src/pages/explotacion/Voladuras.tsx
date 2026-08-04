import { useState } from 'react'
import { Bomb, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { enteros, fecha } from '@/lib/formato'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import {
  useAnularVoladura,
  useFrentes,
  useRegistrarVoladura,
  useVoladuras,
  type Voladura,
} from '@/lib/api/explotacion'

/**
 * Voladuras.
 *
 * Cada una es un evento con explosivo de por medio: lleva permiso, lleva
 * responsable y no se borra. Lo que enseña la tabla, además del consumo, es el
 * desvío entre lo que se estimó arrancar y lo que después se produjo de verdad:
 * es el número que dice si quien calcula las voladuras está calibrado.
 */

const vacio = {
  frente_id: '',
  fecha: '',
  hora: '',
  barrenos: '',
  metros: '',
  diametro: '',
  explosivo_tipo: '',
  explosivo_kg: '',
  detonadores: '',
  cordon: '',
  toneladas: '',
  responsable: '',
  permiso: '',
  observacion: '',
}

export function Voladuras() {
  const { data, isPending, error } = useVoladuras()
  const { data: frentes } = useFrentes()
  const registrar = useRegistrarVoladura()
  const anular = useAnularVoladura()
  const { puede } = useMisPermisos()

  const [nueva, setNueva] = useState<typeof vacio | null>(null)
  const [detalle, setDetalle] = useState<Voladura | null>(null)
  const [anulando, setAnulando] = useState<Voladura | null>(null)
  const [motivo, setMotivo] = useState('')

  // Un frente de martillo no admite voladura, así que no aparece en la lista.
  // Es la misma regla de la base, dicha antes de que la persona escriba.
  const disponibles = (frentes ?? [])
    .filter((f) => f.estado === 'ACTIVO' && f.metodo_arranque !== 'MARTILLO')
    .map((f) => ({ valor: String(f.id), etiqueta: `${f.codigo} · ${f.nombre}` }))

  return (
    <>
      <PageHeader
        title="Voladuras"
        description="Lo que se arranca del cerro, con su permiso y su responsable."
        actions={
          puede('EXPLOTACION', 'ESCRITURA') ? (
            <Button
              icon={<Plus />}
              disabled={disponibles.length === 0}
              onClick={() => setNueva({ ...vacio, fecha: hoyEnCaracas() })}
            >
              Registrar voladura
            </Button>
          ) : undefined
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Bomb />}
            titulo="No hay voladuras registradas"
            descripcion={
              disponibles.length === 0
                ? 'Primero hace falta un frente activo que se trabaje con voladura. Se crean en Frentes y bancos.'
                : 'Cada voladura queda con su fecha, su consumo de explosivo y quién la dirigió.'
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Voladura</th>
                  <th className="px-3 py-3 font-medium">Frente</th>
                  <th className="px-3 py-3 text-right font-medium">Barrenos</th>
                  <th className="px-3 py-3 text-right font-medium">Explosivo</th>
                  <th className="px-3 py-3 text-right font-medium">Estimado</th>
                  <th className="px-3 py-3 text-right font-medium">Producido</th>
                  <th className="px-5 py-3 text-right font-medium">Desvío</th>
                </tr>
              </thead>
              <tbody>
                {data.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => setDetalle(v)}
                    className={`border-hairline hover:bg-ink/3 cursor-pointer border-b transition-colors last:border-0 ${
                      v.estado === 'ANULADA' ? 'opacity-45' : ''
                    }`}
                  >
                    <td className="px-5 py-3">
                      <p className="tabular text-ink/85 font-medium">{v.numero}</p>
                      <p className="text-ink/45 text-xs">
                        {fecha(v.fecha)}
                        {v.hora ? ` · ${v.hora.slice(0, 5)}` : ''}
                      </p>
                    </td>
                    <td className="text-ink/70 px-3 py-3">
                      {v.frente}
                      {v.banco ? <span className="text-ink/45 block text-xs">{v.banco}</span> : null}
                    </td>
                    <td className="tabular text-ink/70 px-3 py-3 text-right">{v.barrenos ?? '—'}</td>
                    <td className="tabular text-ink/70 px-3 py-3 text-right">
                      {v.explosivo_kg ? `${enteros(v.explosivo_kg)} kg` : '—'}
                    </td>
                    <td className="tabular text-ink/70 px-3 py-3 text-right">
                      {v.toneladas_estimadas ? `${enteros(v.toneladas_estimadas)} t` : '—'}
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right font-medium">
                      {enteros(v.toneladas_producidas)} t
                    </td>
                    <td className="px-5 py-3 text-right">
                      {v.estado === 'ANULADA' ? (
                        <Chip tone="neutral">Anulada</Chip>
                      ) : v.desvio_pct === null ? (
                        <span className="text-ink/30">—</span>
                      ) : (
                        <Chip tone={Math.abs(Number(v.desvio_pct)) <= 15 ? 'success' : 'warning'}>
                          {Number(v.desvio_pct) > 0 ? '+' : ''}
                          {Number(v.desvio_pct).toLocaleString('es-VE')}%
                        </Chip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ------------------------------------------------------- nueva */}
      {nueva ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setNueva(null)}
          titulo="Registrar voladura"
          descripcion="Lo que se cargó y lo que se estima haber arrancado. El tonelaje real aparece después, en los partes de turno."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setNueva(null)}>
                Cancelar
              </Button>
              <Button
                disabled={registrar.isPending || !nueva.frente_id}
                onClick={async () => {
                  await registrar.mutateAsync({
                    frente_id: Number(nueva.frente_id),
                    fecha: nueva.fecha || null,
                    hora: nueva.hora || null,
                    barrenos: Number(nueva.barrenos) || null,
                    metros: Number(nueva.metros) || null,
                    diametro_mm: Number(nueva.diametro) || null,
                    explosivo_tipo: nueva.explosivo_tipo || null,
                    explosivo_kg: Number(nueva.explosivo_kg) || null,
                    detonadores: Number(nueva.detonadores) || null,
                    cordon_metros: Number(nueva.cordon) || null,
                    toneladas: Number(nueva.toneladas) || null,
                    responsable: nueva.responsable || null,
                    permiso: nueva.permiso || null,
                    observacion: nueva.observacion || null,
                  })
                  setNueva(null)
                }}
              >
                {registrar.isPending ? 'Registrando…' : 'Registrar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Frente"
              vacio="Elige el frente"
              value={nueva.frente_id}
              onChange={(e) => setNueva({ ...nueva, frente_id: e.target.value })}
              opciones={disponibles}
              className="sm:col-span-2"
              required
            />
            <Input
              label="Fecha"
              type="date"
              value={nueva.fecha}
              onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })}
            />
            <Input
              label="Hora"
              type="time"
              value={nueva.hora}
              onChange={(e) => setNueva({ ...nueva, hora: e.target.value })}
            />
            <Input
              label="Barrenos"
              type="number"
              min="1"
              inputMode="numeric"
              value={nueva.barrenos}
              onChange={(e) => setNueva({ ...nueva, barrenos: e.target.value })}
            />
            <Input
              label="Metros perforados"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={nueva.metros}
              onChange={(e) => setNueva({ ...nueva, metros: e.target.value })}
            />
            <Input
              label="Diámetro (mm)"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={nueva.diametro}
              onChange={(e) => setNueva({ ...nueva, diametro: e.target.value })}
            />
            <Input
              label="Tipo de explosivo"
              placeholder="Emulsión"
              value={nueva.explosivo_tipo}
              onChange={(e) => setNueva({ ...nueva, explosivo_tipo: e.target.value })}
            />
            <Input
              label="Explosivo (kg)"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={nueva.explosivo_kg}
              onChange={(e) => setNueva({ ...nueva, explosivo_kg: e.target.value })}
            />
            <Input
              label="Detonadores"
              type="number"
              min="0"
              inputMode="numeric"
              value={nueva.detonadores}
              onChange={(e) => setNueva({ ...nueva, detonadores: e.target.value })}
            />
            <Input
              label="Cordón (m)"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              value={nueva.cordon}
              onChange={(e) => setNueva({ ...nueva, cordon: e.target.value })}
            />
            <Input
              label="Toneladas estimadas"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={nueva.toneladas}
              onChange={(e) => setNueva({ ...nueva, toneladas: e.target.value })}
            />
            <Input
              label="Responsable"
              placeholder="Quién la dirigió"
              value={nueva.responsable}
              onChange={(e) => setNueva({ ...nueva, responsable: e.target.value })}
            />
            <Input
              label="Permiso"
              placeholder="Autorización de explosivos"
              value={nueva.permiso}
              onChange={(e) => setNueva({ ...nueva, permiso: e.target.value })}
              className="sm:col-span-2"
            />
          </div>

          <Textarea
            label="Observación"
            rows={2}
            className="mt-4"
            value={nueva.observacion}
            onChange={(e) => setNueva({ ...nueva, observacion: e.target.value })}
          />

          {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}

      {/* ----------------------------------------------------- detalle */}
      {detalle ? (
        <Modal
          abierto
          onCerrar={() => setDetalle(null)}
          titulo={detalle.numero}
          descripcion={`${detalle.frente} · ${fecha(detalle.fecha)}`}
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDetalle(null)}>
                Cerrar
              </Button>
              {detalle.estado === 'REGISTRADA' && puede('EXPLOTACION', 'TOTAL') ? (
                <Button
                  variant="outline"
                  className="text-danger"
                  onClick={() => {
                    setAnulando(detalle)
                    setMotivo('')
                  }}
                >
                  Anular
                </Button>
              ) : null}
            </>
          }
        >
          {detalle.motivo_anulacion ? (
            <p className="text-danger mb-3 text-sm">Anulada: {detalle.motivo_anulacion}</p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {[
              ['Barrenos', detalle.barrenos ?? '—'],
              ['Metros perforados', detalle.metros_perforados ? enteros(detalle.metros_perforados) : '—'],
              ['Diámetro', detalle.diametro_mm ? `${detalle.diametro_mm} mm` : '—'],
              ['Explosivo', detalle.explosivo_tipo ?? '—'],
              ['Kilos', detalle.explosivo_kg ? `${enteros(detalle.explosivo_kg)} kg` : '—'],
              ['Detonadores', detalle.detonadores ?? '—'],
              ['Cordón', detalle.cordon_metros ? `${enteros(detalle.cordon_metros)} m` : '—'],
              ['Estimado', detalle.toneladas_estimadas ? `${enteros(detalle.toneladas_estimadas)} t` : '—'],
              ['Producido', `${enteros(detalle.toneladas_producidas)} t`],
              ['Responsable', detalle.responsable ?? '—'],
              ['Permiso', detalle.permiso ?? '—'],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-ink/45 text-xs">{k}</dt>
                <dd className="tabular text-ink/80">{v}</dd>
              </div>
            ))}
          </dl>

          {detalle.observacion ? (
            <p className="text-ink/60 border-hairline mt-4 border-t pt-3 text-sm">
              {detalle.observacion}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {/* ------------------------------------------------------ anular */}
      {anulando ? (
        <Modal
          abierto
          onCerrar={() => setAnulando(null)}
          titulo={`Anular la voladura ${anulando.numero}`}
          descripcion="No se borra: queda con su número y marcada como anulada."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnulando(null)}>
                No anular
              </Button>
              <Button
                disabled={anular.isPending || motivo.trim().length < 4}
                onClick={async () => {
                  await anular.mutateAsync({ id: anulando.id, motivo })
                  setAnulando(null)
                  setDetalle(null)
                }}
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          }
        >
          <Textarea
            label="Por qué se anula"
            hint="Queda en el registro de auditoría con tu nombre y la hora."
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
          {anular.error ? <ErrorDeCarga error={anular.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
