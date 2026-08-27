import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { BadgeCheck, IdCard, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_PERSONAL } from '@/components/pestanasDeModulos'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { rpc } from '@/lib/api/rpc'
import { cargarFoto } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { useEmitirCarnet, fotoParaVerificar } from '@/lib/api/carnets'
import { fechaHora } from '@/lib/formato'

/*
  QUIÉN TIENE CARNET Y QUIÉN NO, Y EMITIRLOS DE UNA VEZ

  Lo pidió Christopher: «dar una opción o pestaña para generar carnets por
  primera vez a todos aquellos que no tengan». Es el caso de arranque —veintidós
  trabajadores y ningún carnet emitido— y hacerlo ficha por ficha son veintidós
  visitas a veintidós pantallas.

  SE EMITEN DE UNO EN UNO, AUNQUE EL BOTÓN SEA UNO

  No hay una función que emita en tanda a propósito. Cada emisión necesita la
  foto de esa persona descargada del almacén, recortada con SU encuadre y
  reducida, y eso ocurre en el navegador: una función de la base no puede
  hacerlo. Emitir sin foto sería más rápido y dejaría veintidós carnets cuya
  página de verificación no puede comparar ninguna cara — que es para lo único
  que existe la foto ahí.

  Y por eso se ve avanzar: con veintidós fotos que descargar, un botón que se
  queda pensando sin decir nada se lee como que se colgó.
*/

interface EstadoCarnet {
  empleado_id: number
  ficha: string
  nombre: string
  cargo: string | null
  foto_path: string | null
  foto_zoom: string | number | null
  foto_x: string | number | null
  foto_y: string | number | null
  /** Nulo cuando esa persona todavía no tiene carnet. */
  codigo: string | null
  emitido_en: string | null
}

function useEstadoDeLosCarnets() {
  return useQuery({
    queryKey: ['carnets', 'estado'],
    queryFn: () => rpc<EstadoCarnet[]>('estado_de_los_carnets'),
  })
}

export function Carnets() {
  const { data, isPending, error, refetch } = useEstadoDeLosCarnets()
  const emitir = useEmitirCarnet()
  const { puede } = useMisRoles()
  const puedeEmitir = puede('RRHH') || puede('ADMIN') || puede('GERENTE_GENERAL')

  const [yendo, setYendo] = useState<{ hechos: number; total: number; quien: string } | null>(null)
  const [fallos, setFallos] = useState<string[]>([])

  const todos = data ?? []
  const sin = todos.filter((e) => !e.codigo)
  const con = todos.filter((e) => e.codigo)

  const emitirATodos = async () => {
    setFallos([])
    const pendientes = [...sin]

    for (let i = 0; i < pendientes.length; i++) {
      const e = pendientes[i]
      setYendo({ hechos: i, total: pendientes.length, quien: e.nombre })

      try {
        /*
          La foto se carga aquí, una por una, y no todas de golpe.

          Veinte descargas simultáneas contra el almacén acaban en peticiones
          rechazadas y en carnets emitidos sin foto sin que nadie se entere. De
          una en una tarda más y termina bien, que es lo que importa cuando el
          resultado se plastifica.
        */
        const img = await cargarFoto(e.foto_path)
        const foto = img
          ? fotoParaVerificar(img, {
              zoom: Number(e.foto_zoom ?? 1),
              x: Number(e.foto_x ?? 0.5),
              y: Number(e.foto_y ?? 0.5),
            })
          : null

        await emitir.mutateAsync({ empleado_id: e.empleado_id, foto })
      } catch (err) {
        /*
          Un fallo no detiene la tanda.

          Si la ficha diecisiete falla, parar deja las cinco siguientes sin
          carnet y a quien pulsó sin saber por dónde iba. Se anota quién falló
          y se sigue: al final se dice, y esos se reintentan.
        */
        setFallos((f) => [...f, `${e.ficha} · ${e.nombre}: ${(err as Error).message}`])
      }
    }

    setYendo(null)
    await refetch()
  }

  return (
    <>
      <PageHeader
        title="Carnets"
        description="Quién tiene carnet emitido y quién no. El carnet lleva un QR que abre una página diciendo si sigue valiendo."
      />

      <Pestanas pestanas={PESTANAS_PERSONAL} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {/* ------------------------------------------------ los que faltan */}
      {!isPending && sin.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title={`${sin.length} sin carnet`}
            subtitle="Se emite el de cada uno con su foto, y queda listo para imprimir desde su ficha."
            action={
              puedeEmitir ? (
                <Button
                  icon={<BadgeCheck />}
                  disabled={yendo !== null}
                  onClick={() => void emitirATodos()}
                >
                  {yendo ? 'Emitiendo…' : `Emitir los ${sin.length}`}
                </Button>
              ) : undefined
            }
          />

          {/*
            Se dice por quién va. Con veintidós fotos que descargar, un botón
            pensando en silencio se lee como que se colgó.
          */}
          {yendo ? (
            <div className="border-hairline mt-4 rounded-[6px] border p-3">
              <p className="text-ink/80 text-sm">
                {yendo.hechos + 1} de {yendo.total} · {yendo.quien}
              </p>
              <div className="bg-hairline mt-2 h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-royal-600 h-full transition-[width] duration-300"
                  style={{ width: `${((yendo.hechos + 1) / yendo.total) * 100}%` }}
                />
              </div>
            </div>
          ) : null}

          <ul className="divide-hairline mt-3 divide-y">
            {sin.map((e) => (
              <li key={e.empleado_id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 grow">
                  <Link
                    to={`/app/nomina/personal/${e.empleado_id}`}
                    className="text-ink/85 hover:text-royal-600 text-sm font-medium"
                  >
                    {e.nombre}
                  </Link>
                  <p className="text-ink/45 text-xs">
                    Ficha {e.ficha}
                    {e.cargo ? ` · ${e.cargo}` : ''}
                    {e.foto_path ? '' : ' · sin foto cargada'}
                  </p>
                </div>
                <Chip tone="neutral">Sin carnet</Chip>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!isPending && sin.length === 0 && todos.length > 0 ? (
        <Card className="mt-4">
          <Vacio
            icono={<BadgeCheck />}
            titulo="Todo el mundo tiene carnet"
            descripcion="Los trabajadores activos tienen su carnet emitido. Cuando entre alguien nuevo aparecerá aquí."
          />
        </Card>
      ) : null}

      {/* ------------------------------------------------- lo que fallo */}
      {fallos.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title={`${fallos.length} no se pudieron emitir`}
            subtitle="Los demás sí. Estos se reintentan pulsando otra vez, o desde su ficha."
          />
          <ul className="mt-3 space-y-1.5">
            {fallos.map((f) => (
              <li key={f} className="text-danger text-sm">
                {f}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ------------------------------------------------ los que tienen */}
      {!isPending && con.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title={`${con.length} con carnet`} subtitle="Emitidos y vigentes." />
          <ul className="divide-hairline mt-3 divide-y">
            {con.map((e) => (
              <li key={e.empleado_id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 grow">
                  <Link
                    to={`/app/nomina/personal/${e.empleado_id}`}
                    className="text-ink/85 hover:text-royal-600 text-sm font-medium"
                  >
                    {e.nombre}
                  </Link>
                  <p className="text-ink/45 text-xs">
                    Ficha {e.ficha}
                    {e.emitido_en ? ` · emitido el ${fechaHora(e.emitido_en)}` : ''}
                  </p>
                </div>
                <span className="tabular text-ink/50 text-xs tracking-wider">
                  {(e.codigo!.match(/.{1,6}/g) ?? []).join(' ')}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!isPending && todos.length === 0 ? (
        <Card className="mt-4">
          <Vacio
            icono={<IdCard />}
            titulo="No hay personal activo"
            descripcion="Los carnets se emiten a los trabajadores en nómina. Cuando haya alguno, aparecerá aquí."
          />
        </Card>
      ) : null}

      {emitir.error && !yendo ? <ErrorDeCarga error={emitir.error} className="mt-4" /> : null}

      {/*
        Emitir de nuevo a alguien que YA tiene no se ofrece aquí a propósito.

        Reemitir anula el carnet anterior, y eso es una decisión de una persona
        concreta —se le perdió, se le rompió— que se toma en su ficha, con su
        motivo. Un botón de «reemitir a todos» convertiría en un clic el anular
        veintidós plásticos que están en veintidós bolsillos.
      */}
      <p className="text-ink/40 mt-4 text-center text-xs leading-relaxed">
        <ShieldAlert className="mr-1 -mt-0.5 inline size-3.5" />
        Aquí solo se emiten los que faltan. Reemitir a alguien que ya tiene anula su carnet
        actual, y eso se hace en su ficha, diciendo por qué.
      </p>
    </>
  )
}
