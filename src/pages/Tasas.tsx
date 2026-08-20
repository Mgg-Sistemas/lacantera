import { useEffect, useState } from 'react'
import { Banknote, CircleCheck, TriangleAlert } from 'lucide-react'
import { Conversor } from '@/components/Conversor'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useTasaEnVivo } from '@/lib/tasaBcv'
import {
  hoyEnCaracas,
  useMonedasConTasa,
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
  const monedas = useMonedasConTasa()

  /*
    EL DÓLAR ABRE, PERO NO ES LA ÚNICA

    La cantera cobra en dólares, en euros y en USDT —hay cuenta de Binance—, y
    esta pantalla solo dejaba registrar el dólar. Las otras dos existían en el
    catálogo sin una sola tasa, así que elegirlas en cualquier formulario
    terminaba en «no hay tasa de X a bolívares» después de llenarlo entero.

    El dólar sigue abriendo porque es con lo que se mide todo el sistema; las
    demás están a un clic. Lo que no hay es una lista escrita a mano: son las
    monedas activas del catálogo, así que el día que entre otra aparece sola.
  */
  const [codigo, setCodigo] = useState('USD')
  const elegida = monedas.data?.find((m) => m.codigo === codigo)

  const enVivo = useTasaEnVivo(elegida)
  const vigente = useTasaVigente(codigo, elegida?.fuente_tasa ?? 'BCV')
  const historial = useTasasRegistradas(60, codigo)
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

  // Cambiar de moneda vacía el campo: un número tecleado para el euro no debe
  // quedarse esperando en el formulario del dólar.
  useEffect(() => setValor(''), [codigo])

  const yaRegistradaHoy = vigente.data?.fecha === hoy

  /*
    Las tres tienen fuente, pero no la misma.

    El BCV publica el dólar y el euro —dos endpoints hermanos del mismo
    agregador— y el USDT no lo publica ningún organismo: sale de la mediana del
    libro P2P de Binance, por la función `tasa-usdt`, porque esa consulta el
    navegador no la puede hacer.

    Se mira el símbolo y no el código: el Tether entró como `UST` mientras
    `monedas.codigo` medía tres, y pasó a `USDT` al ensancharse. El símbolo dice
    lo mismo en los dos casos.
  */
  const porBinance = elegida?.simbolo === 'USDT'
  const conFuentePublica = codigo === 'USD' || codigo === 'EUR' || porBinance
  const quienPublica = porBinance ? 'la mediana del P2P de Binance' : 'el BCV'
  const unidad = elegida?.simbolo ?? codigo

  return (
    <>
      <PageHeader
        title="Tasas de cambio"
        description="La tasa que valora los documentos. No es la del indicador de arriba: esa informa, esta compromete."
      />

      {monedas.data && monedas.data.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {monedas.data.map((m) => (
            <button
              key={m.codigo}
              type="button"
              onClick={() => setCodigo(m.codigo)}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                m.codigo === codigo
                  ? 'border-royal-600 bg-royal-600/12 text-ink/90 font-medium'
                  : 'border-hairline bg-surface text-ink/60 hover:text-ink/85',
              )}
            >
              {m.nombre}
              <span className="text-ink/40 ml-1.5 font-mono text-xs">{m.simbolo}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={puedeRegistrar ? `Registrar la tasa del día · ${unidad}` : `La tasa del día · ${unidad}`}
            subtitle={
              puedeRegistrar
                ? 'Una vez registrada no se puede corregir. Si se publica una corrección, se registra una fila nueva.'
                : 'La carga administración o tesorería. Aquí se consulta cuál está rigiendo.'
            }
          />

          {yaRegistradaHoy ? (
            <div className="border-success/25 bg-success-soft mt-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
              <CircleCheck className="text-success mt-px size-[18px] shrink-0" />
              <p className="text-ink/80 text-sm">
                La tasa de hoy ya está registrada:{' '}
                <span className="tabular font-semibold">Bs {fmtTasa(vigente.data!.tasa)}</span> por{' '}
                {unidad}. Los documentos que se emitan hoy en {unidad} se valoran con esta.
              </p>
            </div>
          ) : (
            <div className="border-warning/30 bg-warning-soft mt-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
              <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
              <p className="text-ink/80 text-sm">
                Todavía no se ha registrado la tasa de hoy en {unidad}.{' '}
                {vigente.data
                  ? `Los documentos se están valorando con la del ${fecha(vigente.data.fecha)}.`
                  : `Sin ninguna tasa registrada no se puede emitir nada en ${unidad}.`}
              </p>
            </div>
          )}

          {!puedeRegistrar ? null : (
            <>
              {/* Los dos campos arriba y los botones en su propia fila.

                  Estaban los tres en la misma línea con la columna del medio en
                  `1fr`, y con la tarjeta a dos tercios del ancho los dos botones se
                  comían el espacio: el campo del valor quedaba en noventa píxeles y
                  su pista se partía en cuatro renglones verticales, que además
                  empujaban la fecha hacia abajo por el `items-end`. Un botón no
                  debe decidir el ancho del campo que lo acompaña. */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  label="Fecha"
                  type="date"
                  max={hoy}
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                />

                <Input
                  label={`Bolívares por ${unidad}`}
                  type="number"
                  min="0"
                  step="0.00000001"
                  inputMode="decimal"
                  placeholder={conFuentePublica && enVivo.data ? String(enVivo.data.valor) : '0,0000'}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  hint={
                    !conFuentePublica
                      ? `Se registra como ${elegida?.fuente_tasa ?? 'PARALELO'}: no hay fuente pública que consultar.`
                      : enVivo.data
                        ? `Según ${quienPublica}: Bs ${fmtTasa(enVivo.data.valor)}${enVivo.data.vigente ? '' : ' (no es de hoy)'}`
                        : `No se pudo consultar ${quienPublica}; escribe el valor a mano.`
                  }
                />
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {conFuentePublica && enVivo.data ? (
                  <Button variant="outline" onClick={() => setValor(String(enVivo.data.valor))}>
                    {porBinance ? 'Usar la de Binance' : 'Usar la del BCV'}
                  </Button>
                ) : null}
                <Button
                  disabled={!valor || registrar.isPending}
                  onClick={async () => {
                    await registrar.mutateAsync({
                      origen: codigo,
                      fecha: dia,
                      tasa: Number(valor),
                      fuente: elegida?.fuente_tasa ?? 'BCV',
                    })
                    setValor('')
                  }}
                >
                  {registrar.isPending ? 'Guardando…' : 'Registrar'}
                </Button>
              </div>
            </>
          )}

          {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-2" /> : null}
        </Card>

        <Card>
          <CardHeader title="Ahora mismo" />
          <div className="mt-4 space-y-4">
            {conFuentePublica ? (
              <div>
                <p className="text-ink/50 text-xs">
                  {porBinance ? 'Mediana del P2P de Binance' : 'Publicada por el BCV'}
                </p>
                <p className="text-ink/90 tabular text-3xl font-semibold">
                  {enVivo.data ? fmtTasa(enVivo.data.valor) : '—'}
                </p>
                {enVivo.data ? (
                  <Chip tone={enVivo.data.vigente ? 'success' : 'warning'} className="mt-1.5">
                    {porBinance
                      ? 'De ahora mismo'
                      : enVivo.data.vigente
                        ? 'De hoy'
                        : 'De un día anterior'}
                  </Chip>
                ) : null}
              </div>
            ) : (
              <div>
                <p className="text-ink/50 text-xs">Fuente</p>
                <p className="text-ink/85 text-lg font-medium">{elegida?.fuente_tasa}</p>
                <p className="text-ink/45 mt-1 text-xs">
                  Nadie la publica oficialmente. La carga quien la negocia.
                </p>
              </div>
            )}

            <div className={cn(conFuentePublica && 'border-hairline border-t pt-4')}>
              <p className="text-ink/50 text-xs">Con la que valora el sistema</p>
              <p className="text-ink/90 tabular text-3xl font-semibold">
                {vigente.data ? fmtTasa(vigente.data.tasa) : '—'}
              </p>
              {vigente.data ? (
                <p className="text-ink/45 mt-1 text-xs">
                  Registrada el {fecha(vigente.data.fecha)}
                  {vigente.data.arrastrada ? ' · arrastrada' : ''}
                </p>
              ) : (
                <p className="text-ink/45 mt-1 text-xs">Ninguna todavía.</p>
              )}
            </div>
          </div>

          <div className="border-hairline mt-5 border-t pt-5">
            <Conversor />
          </div>
        </Card>
      </div>

      <Card flush className="mt-4">
        <div className="px-5 pt-5">
          <CardHeader title="Historial" subtitle={`Últimas tasas registradas en ${unidad}.`} />
        </div>

        {historial.isPending ? <Cargando /> : null}
        {historial.error ? (
          <div className="p-5">
            <ErrorDeCarga error={historial.error} />
          </div>
        ) : null}

        {historial.data && historial.data.length === 0 ? (
          <Vacio icono={<Banknote />} titulo={`Sin tasas registradas en ${unidad}`} />
        ) : null}

        {historial.data && historial.data.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 text-right font-medium">Bs por {unidad}</th>
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
