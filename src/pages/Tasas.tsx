import { useState } from 'react'
import { Banknote, CircleCheck, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useTasaBcv } from '@/lib/tasaBcv'
import {
  hoyEnCaracas,
  useRegistrarTasa,
  useTasaVigente,
  useTasasRegistradas,
} from '@/lib/api/tasas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { tasa as fmtTasa } from '@/lib/formato'

function fecha(iso: string): string {
  return new Intl.DateTimeFormat('es-VE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${iso}T12:00:00`))
}

export function Tasas() {
  const enVivo = useTasaBcv()
  const vigente = useTasaVigente()
  const historial = useTasasRegistradas()
  const registrar = useRegistrarTasa()

  /*
    Cargar la tasa dejó de estar al alcance de cualquiera que entre. Es con lo
    que se valora todo el sistema y, como las tasas no se corrigen, un valor
    mal tecleado se queda. Quien solo la consulta ve la pantalla completa —el
    historial, la del BCV— pero no el formulario: un botón que siempre rebota
    enseña a ignorar los errores.
  */
  const { puede } = useMisPermisos()
  const puedeRegistrar = puede('TASAS', 'ESCRITURA')

  const hoy = hoyEnCaracas()
  const [valor, setValor] = useState('')
  const [dia, setDia] = useState(hoy)

  const yaRegistradaHoy = vigente.data?.fecha === hoy

  return (
    <>
      <PageHeader
        title="Tasas de cambio"
        description="La tasa que valora los documentos. No es la del indicador de arriba: esa informa, esta compromete."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={puedeRegistrar ? 'Registrar la tasa del día' : 'La tasa del día'}
            subtitle={
              puedeRegistrar
                ? 'Una vez registrada no se puede corregir. Si el BCV publica una corrección, se registra una fila nueva.'
                : 'La carga administración o tesorería. Aquí se consulta cuál está rigiendo.'
            }
          />

          {yaRegistradaHoy ? (
            <div className="border-success/25 bg-success-soft mt-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
              <CircleCheck className="text-success mt-px size-[18px] shrink-0" />
              <p className="text-ink/80 text-sm">
                La tasa de hoy ya está registrada:{' '}
                <span className="tabular font-semibold">Bs {fmtTasa(vigente.data!.tasa)}</span> por
                dólar. Las compras que se emitan hoy se valoran con esta.
              </p>
            </div>
          ) : (
            <div className="border-warning/30 bg-warning-soft mt-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
              <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
              <p className="text-ink/80 text-sm">
                Todavía no se ha registrado la tasa de hoy.{' '}
                {vigente.data
                  ? `Los documentos se están valorando con la del ${fecha(vigente.data.fecha)}.`
                  : 'Sin ninguna tasa registrada no se puede cargar ninguna cotización.'}
              </p>
            </div>
          )}

          {!puedeRegistrar ? null : (
          <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr_auto] sm:items-end">
            <Input label="Fecha" type="date" max={hoy} value={dia} onChange={(e) => setDia(e.target.value)} />

            <Input
              label="Bolívares por dólar"
              type="number"
              min="0"
              step="0.00000001"
              inputMode="decimal"
              placeholder={enVivo.data ? String(enVivo.data.valor) : '0,0000'}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              hint={
                enVivo.data
                  ? `Publicada por el BCV: Bs ${fmtTasa(enVivo.data.valor)}${enVivo.data.vigente ? '' : ' (no es de hoy)'}`
                  : 'No se pudo consultar la fuente pública; escribe el valor a mano.'
              }
            />

            <div className="flex gap-2 pb-6">
              {enVivo.data ? (
                <Button variant="outline" onClick={() => setValor(String(enVivo.data.valor))}>
                  Usar la del BCV
                </Button>
              ) : null}
              <Button
                disabled={!valor || registrar.isPending}
                onClick={async () => {
                  await registrar.mutateAsync({ fecha: dia, tasa: Number(valor) })
                  setValor('')
                }}
              >
                {registrar.isPending ? 'Guardando…' : 'Registrar'}
              </Button>
            </div>
          </div>
          )}

          {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-2" /> : null}
        </Card>

        <Card>
          <CardHeader title="Ahora mismo" />
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-ink/50 text-xs">Publicada por el BCV</p>
              <p className="text-ink/90 tabular text-3xl font-semibold">
                {enVivo.data ? fmtTasa(enVivo.data.valor) : '—'}
              </p>
              {enVivo.data ? (
                <Chip tone={enVivo.data.vigente ? 'success' : 'warning'} className="mt-1.5">
                  {enVivo.data.vigente ? 'De hoy' : 'De un día anterior'}
                </Chip>
              ) : null}
            </div>

            <div className="border-hairline border-t pt-4">
              <p className="text-ink/50 text-xs">Con la que valora el sistema</p>
              <p className="text-ink/90 tabular text-3xl font-semibold">
                {vigente.data ? fmtTasa(vigente.data.tasa) : '—'}
              </p>
              {vigente.data ? (
                <p className="text-ink/45 mt-1 text-xs">
                  Registrada el {fecha(vigente.data.fecha)}
                  {vigente.data.arrastrada ? ' · arrastrada' : ''}
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      <Card flush className="mt-4">
        <div className="px-5 pt-5">
          <CardHeader title="Historial" subtitle="Últimas tasas registradas." />
        </div>

        {historial.isPending ? <Cargando /> : null}
        {historial.error ? (
          <div className="p-5">
            <ErrorDeCarga error={historial.error} />
          </div>
        ) : null}

        {historial.data && historial.data.length === 0 ? (
          <Vacio icono={<Banknote />} titulo="Sin tasas registradas todavía" />
        ) : null}

        {historial.data && historial.data.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Bs por dólar</th>
                  <th className="px-5 py-3 text-right font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {historial.data.map((t) => (
                  <tr key={t.id} className="border-hairline border-b last:border-0">
                    <td className="text-ink/80 px-5 py-2.5">{fecha(t.fecha)}</td>
                    <td className="tabular text-ink/85 px-3 py-2.5 text-right font-medium">
                      {fmtTasa(t.tasa)}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Chip tone={t.fuente === 'BCV' ? 'royal' : 'neutral'}>{t.fuente}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </>
  )
}
