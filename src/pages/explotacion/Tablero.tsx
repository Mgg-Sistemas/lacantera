import { Link } from 'react-router'
import { Map, Route, Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { GrupoAcciones, type Accion } from '@/components/tablero/GrupoAcciones'
import { PrimeraVez } from '@/components/tablero/PrimeraVez'
import { useSalidasDelDia } from '@/lib/api/salidasPlanta'
import { useMisPermisos } from '@/lib/api/usuarios'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { enteros } from '@/lib/formato'

/**
 * Por dónde se empieza en explotación.
 *
 * REHECHO EL 24/09/2026, CON LA REMODELACIÓN DEL PUNTO 3
 *
 * Este tablero estaba escrito para tres pantallas que ya no se pueden abrir.
 * Enseñaba «Frentes activos», «Voladuras registradas» y «Partes de hoy» —tres
 * ceros—, un botón grande a «Cargar parte de turno», y una explicación de
 * cómo van en orden las tres. Las tres llevan el marbete `fueraDelMvp` desde el
 * 23/09/2026, así que `GrupoAcciones` las filtraba y el recorrido se quedaba
 * sin ninguna tarjeta: quedaban los ceros, el botón al cartel de obra y un
 * texto explicando puertas cerradas.
 *
 * No es que el tablero estuviera mal escrito: es que el módulo cambió debajo y
 * el tablero no se enteró. Es justo lo que un tablero no puede permitirse,
 * porque es lo primero que se ve al entrar al módulo.
 *
 * LO QUE HAY ABIERTO SON TRES PANTALLAS: salidas de planta, viajes de camiones
 * y plantas y rutas. Las tres se ofrecen aquí.
 *
 * Y CONVIENE DECIR QUE EL PRIMER INTENTO SE QUEDÓ CORTO. Al rehacerlo esa misma
 * mañana se miró qué estaba `fueraDelMvp` y se dejó solo salidas de planta,
 * olvidando las otras dos, que nunca estuvieron en obra. Lo vio el usuario a la
 * primera: el menú ofrecía cuatro entradas y el tablero una. Un tablero que
 * ofrece menos que el menú de al lado es peor que no tenerlo, porque enseña que
 * el módulo tiene menos de lo que tiene.
 *
 * Y CONVIENE SABERLO AL MIRAR LA CIFRA: `salidas_planta` no tiene ni una fila
 * desde que existe. El cero de aquí es verdad y no un fallo. Está preguntado a
 * planta por qué; hasta que se sepa, no se toca nada más de este módulo.
 */
export function TableroExplotacion() {
  const dia = hoyEnCaracas()
  const { data: salidas, isPending, error } = useSalidasDelDia(dia)
  const { puede } = useMisPermisos()

  const puedeEscribir = puede('EXPLOTACION', 'ESCRITURA')

  // Las anuladas no cuentan: el tablero dice qué salió, y una salida anulada
  // no salió. El detalle de por qué se anuló vive en la pantalla.
  const vivas = (salidas ?? []).filter((s) => s.estado === 'REGISTRADO')
  const m3 = vivas.reduce((s, x) => s + Number(x.m3 ?? 0), 0)

  /*
    En el orden en que se usan, no en el que se explican.

    Las salidas se anotan todos los días —veinte o treinta veces—, los viajes se
    revisan al cuadrar el acarreo, y las plantas y rutas se tocan cuando abre o
    cierra un sitio o cambia una tarifa. Lo que más se usa, primero.
  */
  const pasos: Accion[] = [
    {
      titulo: 'Anotar una salida',
      detalle:
        'Cada camión que sale de la planta con producto. Es lo que se mide de verdad: el patio no se entera de otra forma.',
      icono: Truck,
      ruta: '/app/explotacion/salidas',
      cuenta: vivas.length,
      exigeEscritura: true,
    },
    {
      titulo: 'Viajes de camiones',
      detalle:
        'El acarreo: qué camión movió qué, de dónde a dónde, y cuánto se le paga al transportista por ello.',
      icono: Route,
      ruta: '/app/explotacion/viajes',
    },
    {
      titulo: 'Plantas y rutas',
      detalle:
        'Las minas, plantas y bases, quién las opera y las rutas con su tarifa. Se toca cuando abre o cierra un sitio.',
      icono: Map,
      ruta: '/app/explotacion/plantas',
    },
  ]

  return (
    <>
      <PageHeader
        title="Explotación"
        description="El acarreo y lo que sale de la planta, camión por camión. Los frentes y el parte de turno siguen en obra."
        actions={
          puedeEscribir ? (
            <Link to="/app/explotacion/salidas">
              <Button icon={<Truck />}>Anotar una salida</Button>
            </Link>
          ) : undefined
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Salidas de hoy
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">
                {enteros(vivas.length)}
              </p>
              <p className="text-ink/45 mt-2 text-xs">
                {vivas.length === 0 ? 'Todavía no ha salido nada' : 'Camiones que salieron'}
              </p>
            </Card>

            <Card>
              <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
                Metros cúbicos de hoy
              </p>
              <p className="text-ink/90 tabular mt-3 text-3xl font-light">{enteros(m3)}</p>
              <p className="text-ink/45 mt-2 text-xs">Estimados por la carga útil del camión</p>
            </Card>
          </div>

          <div className="mt-8 space-y-8">
            <GrupoAcciones acciones={pasos} puedeEscribir={puedeEscribir} />

            <PrimeraVez>
              <p>
                Tres pantallas abiertas y cada una contesta una pregunta distinta.{' '}
                <strong>Salidas de planta</strong> es lo que sale con producto, camión por camión —y
                los metros cúbicos se llenan solos con la carga útil—.{' '}
                <strong>Viajes de camiones</strong> es el acarreo y lo que se le paga al
                transportista. <strong>Plantas y rutas</strong> es dónde están los sitios y qué
                tarifa tiene cada ruta.
              </p>
              <p className="text-ink/50">
                Frentes y bancos, voladuras y el parte de turno están en obra y vuelven en la fase
                3. No es que falten de hacer: están construidos y no pueden guardar nada todavía
                —el parte exige un frente y un producto, y no hay ni frentes cargados ni artículos
                con categoría PRODUCTO—. Voladuras además no se usa aquí: la cantera arranca el
                material con máquina, no con explosivo.
              </p>
            </PrimeraVez>
          </div>
        </>
      ) : null}
    </>
  )
}
