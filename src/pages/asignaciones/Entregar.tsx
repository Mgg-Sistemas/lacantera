import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, PackageCheck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useEmpleados } from '@/lib/api/nomina'
import { useEntregables, useEntregarATrabajador } from '@/lib/api/asignaciones'
import type { Entregable } from '@/lib/api/asignaciones'
import { useAlmacenes } from '@/lib/api/inventario'
import { useArticulos, useMisRoles } from '@/lib/api/catalogo'
import { hoyEnCaracas } from '@/lib/api/tasas'

/**
 * La cantidad como se dice, no como se guarda.
 *
 * Doce tornillos son «12», no «12,00». Los decimales solo aparecen cuando los
 * hay, que es en lo que se mide por litros o por metros.
 */
function fmtCantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/*
  ENTREGARLE VARIAS COSAS A UNA PERSONA, DESDE EL MÓDULO

  Hasta ahora había dos puertas y ninguna hacía las dos cosas. Desde la lista de
  asignaciones se prestaba **un** artículo; desde la ficha del trabajador se
  entregaban varios, pero se consumían todos — un torquímetro entregado desde
  la ficha desaparecía del almacén en vez de quedar a nombre de nadie.

  Esta pantalla es la puerta de la persona: se elige a quién, de qué almacén, y
  se marcan las cantidades de lo que se lleva. Lo que pasa con cada cosa lo
  decide el catálogo, no desde dónde se pulsó, y se ve antes de guardar: al lado
  de cada renglón dice si vuelve o si se gasta.

  Es una pantalla y no un modal porque son varios renglones y hace falta sitio,
  y porque tiene dirección propia: alguien puede dejarla a medias, mirar una
  existencia en otra pestaña y volver.
*/
/*
  SE PUEDE LLEGAR AQUÍ CON LA PERSONA YA PUESTA.

  Antes esta pantalla siempre empezaba en blanco, y desde la ficha del
  trabajador o desde la dotación había que volver a buscar en el desplegable a
  la persona que se acababa de pulsar. Es de las cosas que hacen perder el rato
  y equivocarse de nombre.

  Se lee de la dirección:

    ?empleado=18&clase=DOTACION&pide=4:2,9:1

  `pide` es lo que le toca —artículo y cantidad—, y no se aplica hasta que hay
  almacén elegido: lo que le corresponde por su cargo no tiene por qué estar en
  el almacén desde el que se entrega hoy. Lo que no esté se dice, no se calla.
*/
function leerPide(crudo: string | null): Array<{ articulo_id: number; cantidad: number }> {
  if (!crudo) return []
  return crudo
    .split(',')
    .map((par) => {
      const [a, c] = par.split(':')
      return { articulo_id: Number(a), cantidad: Number(c) }
    })
    .filter((r) => Number.isFinite(r.articulo_id) && r.articulo_id > 0 && r.cantidad > 0)
}

export function Entregar() {
  const navegar = useNavigate()
  const { puede } = useMisRoles()
  const [params] = useSearchParams()

  const { data: empleados } = useEmpleados(true)
  const { data: almacenes } = useAlmacenes()
  const { data: catalogo } = useArticulos()
  const entregar = useEntregarATrabajador()

  const [empleado, setEmpleado] = useState(params.get('empleado') ?? '')
  const [almacen, setAlmacen] = useState('')
  const [fecha, setFecha] = useState(hoyEnCaracas())
  /*
    PARA QUÉ SE LE DA, QUE NO ES LO MISMO QUE QUÉ SE LE DA

    Dotación es lo que necesita por su rol, mientras trabaje: casco, botas,
    uniforme, la laptop. Asignación es lo que se le da para una faena concreta y
    por un tiempo: el kit de llaves, el taladro, la motosierra.

    No se puede deducir del artículo. El mismo taladro es dotación del mecánico
    y asignación del ayudante que lo pidió para el martes. Por eso se pregunta.
  */
  const [clase, setClase] = useState<'DOTACION' | 'ASIGNACION'>(
    params.get('clase') === 'DOTACION' ? 'DOTACION' : 'ASIGNACION',
  )
  const [nota, setNota] = useState('')
  const [cuantas, setCuantas] = useState<Record<number, string>>({})

  const disponibles = useEntregables(almacen ? Number(almacen) : undefined)

  /*
    Lo que le toca se rellena solo, una vez, cuando llega la lista del almacén.

    Una sola vez y no en cada pintado: la consulta se refresca sola, y volver a
    escribir las cantidades borraría lo que quien entrega acabara de corregir.
    Cambiar de almacén sí lo vuelve a intentar, porque las existencias son otras.
  */
  const pide = useMemo(() => leerPide(params.get('pide')), [params])
  const yaSePuso = useRef('')
  const [sinExistencia, setSinExistencia] = useState<number[]>([])

  useEffect(() => {
    const lista = disponibles.data
    if (!almacen || !lista || pide.length === 0) return
    if (yaSePuso.current === almacen) return
    yaSePuso.current = almacen

    const puestas: Record<number, string> = {}
    const faltan: number[] = []
    for (const r of pide) {
      const hay = lista.find((x) => x.articulo_id === r.articulo_id)
      if (hay) puestas[r.articulo_id] = String(r.cantidad)
      else faltan.push(r.articulo_id)
    }
    setCuantas(puestas)
    setSinExistencia(faltan)
  }, [almacen, disponibles.data, pide])

  const renglones = useMemo(
    () =>
      Object.entries(cuantas)
        .map(([articulo_id, c]) => ({ articulo_id: Number(articulo_id), cantidad: Number(c) }))
        .filter((r) => r.cantidad > 0),
    [cuantas],
  )

  /*
    El resumen se calcula antes de enviar, no después.

    Entregar unas botas y un torquímetro el mismo día son dos cosas distintas
    —una se gasta, el otro hay que pedirlo de vuelta— y quien firma la entrega
    tiene que saber cuál es cuál antes de firmarla, no leerlo en un mensaje de
    éxito.
  */
  const resumen = useMemo(() => {
    const lista = disponibles.data ?? []
    let prestados = 0
    let gastados = 0
    for (const r of renglones) {
      const art = lista.find((x) => x.articulo_id === r.articulo_id)
      if (art?.modo_entrega === 'RETORNABLE') prestados++
      else gastados++
    }
    return { prestados, gastados }
  }, [renglones, disponibles.data])

  if (!puede('ALMACEN', 'RRHH', 'ADMIN')) {
    return (
      <Card>
        <p className="text-ink/60 text-sm">
          Entregar material lo hace almacén o recursos humanos.
        </p>
      </Card>
    )
  }

  const listo = empleado && almacen && renglones.length > 0

  const enviar = async () => {
    await entregar.mutateAsync({
      empleado_id: Number(empleado),
      almacen_id: Number(almacen),
      renglones,
      clase,
      fecha,
      nota: nota || null,
    })
    void navegar('/app/asignaciones')
  }

  return (
    <>
      <PageHeader
        title="Entregar a un trabajador"
        description="Varias cosas de una vez. Lo que vuelve queda a su nombre; lo que se gasta sale del almacén."
        actions={
          <Link to="/app/asignaciones">
            <Button variant="outline" size="sm" icon={<ArrowLeft />}>
              A las asignaciones
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4">
        <Card>
          <CardHeader title="A quién y de dónde" />

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SelectBuscable
              label="Trabajador"
              vacio="Elige el trabajador"
              valor={empleado}
              onCambio={setEmpleado}
              opciones={(empleados ?? []).map((e) => ({
                valor: String(e.id),
                etiqueta: `${e.nombres} ${e.apellidos} · ficha ${e.ficha}`,
              }))}
            />

            <SelectBuscable
              label="De qué almacén sale"
              vacio="Elige el almacén"
              valor={almacen}
              onCambio={(v) => {
                setAlmacen(v)
                // Las cantidades eran de otro almacén: lo que había allí no
                // tiene por qué estar aquí.
                setCuantas({})
                setSinExistencia([])
              }}
              opciones={(almacenes ?? []).map((a) => ({
                valor: String(a.id),
                etiqueta: a.nombre,
              }))}
            />

            <Input
              label="Fecha"
              type="date"
              max={hoyEnCaracas()}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>

          {/*
            Dos botones y no un desplegable: son dos opciones, se leen de una
            vez, y con la explicación debajo nadie tiene que adivinar cuál es
            cuál. Un desplegable escondería la mitad de la pregunta.
          */}
          <div className="border-hairline mt-5 border-t pt-5">
            <p className="text-ink/75 mb-2 text-sm font-medium">¿Para qué se le da?</p>

            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    valor: 'DOTACION' as const,
                    titulo: 'Dotación',
                    detalle: 'Por su rol, mientras trabaje. Casco, botas, uniforme, la laptop.',
                  },
                  {
                    valor: 'ASIGNACION' as const,
                    titulo: 'Asignación',
                    detalle: 'Para una actividad concreta y por un tiempo. Kit de llaves, taladro.',
                  },
                ]
              ).map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => setClase(o.valor)}
                  className={cn(
                    'rounded-[8px] border p-3 text-left transition-colors',
                    clase === o.valor
                      ? 'border-royal-600 bg-royal-600/8'
                      : 'border-ink/15 hover:border-ink/30',
                  )}
                >
                  <p
                    className={cn(
                      'text-sm font-medium',
                      clase === o.valor ? 'text-ink/90' : 'text-ink/70',
                    )}
                  >
                    {o.titulo}
                  </p>
                  <p className="text-ink/50 mt-0.5 text-xs leading-relaxed">{o.detalle}</p>
                </button>
              ))}
            </div>

            {/* Lo que vuelve y lo que se gasta lo decide el catálogo, no esta
                pregunta. Decirlo aquí evita que alguien crea que eligiendo
                «dotación» las botas dejan de descontarse. */}
            <p className="text-ink/40 text-2xs mt-2 leading-relaxed">
              Esto no decide si el bien vuelve: eso lo dice cada artículo en el catálogo. Una
              laptop es dotación y vuelve; unas mascarillas son dotación y se gastan.
            </p>
          </div>
        </Card>

        {!almacen ? (
          <Card>
            <p className="text-ink/50 text-sm">Elige un almacén para ver qué hay en él.</p>
          </Card>
        ) : disponibles.isPending ? (
          <Cargando />
        ) : (disponibles.data ?? []).length === 0 ? (
          <Vacio
            icono={<PackageCheck />}
            titulo="En ese almacén no hay nada que entregar"
            descripcion="Entra por una compra recibida o por una transferencia. Lo que se vende no aparece aquí: no se le entrega a una persona."
          />
        ) : (
          <Card flush>
            <div className="px-5 pt-5">
              <CardHeader
                title="Qué se lleva"
                subtitle={
                  pide.length > 0
                    ? 'Viene puesto lo que le toca por su cargo. Corrige lo que haga falta.'
                    : 'Deja en blanco lo que no se entrega.'
                }
              />

              {/*
                Lo que le toca y este almacén no tiene se dice, no se calla. Si
                no, quien entrega cree que ya le dio todo y la persona se va sin
                las botas.
              */}
              {sinExistencia.length > 0 ? (
                <p className="border-warning/30 bg-warning-soft text-ink/75 mt-3 rounded-[6px] border p-3 text-sm leading-relaxed">
                  {sinExistencia.length === 1
                    ? 'Una de las cosas que le tocan no está en este almacén'
                    : `${sinExistencia.length} de las cosas que le tocan no están en este almacén`}
                  : {sinExistencia
                    .map((id) => (catalogo ?? []).find((a) => a.id === id)?.nombre)
                    .filter(Boolean)
                    .join(', ')}
                  . Prueba con otro almacén, o entrégale lo que sí hay y lo demás después.
                </p>
              ) : null}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                    <th className="px-5 py-3 font-medium">Artículo</th>
                    <th className="px-3 py-3 font-medium">Al entregarlo</th>
                    <th className="px-3 py-3 text-right font-medium">Disponible</th>
                    <th className="px-5 py-3 text-right font-medium">Cuánto</th>
                  </tr>
                </thead>
                <tbody>
                  {(disponibles.data ?? []).map((a: Entregable) => (
                    <tr key={a.articulo_id} className="border-hairline border-b last:border-0">
                      <td className="px-5 py-2.5">
                        <p className="text-ink/85 font-medium">{a.articulo}</p>
                        <p className="text-ink/40 text-2xs font-mono">{a.articulo_codigo}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Chip tone={a.modo_entrega === 'RETORNABLE' ? 'royal' : 'neutral'}>
                          {a.modo_entrega === 'RETORNABLE' ? 'Vuelve' : 'Se gasta'}
                        </Chip>
                      </td>
                      <td className="tabular text-ink/70 px-3 py-2.5 text-right">
                        {fmtCantidad(a.disponibles)} {a.unidad}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Input
                          label=""
                          type="number"
                          min="0"
                          max={a.disponibles}
                          inputMode="decimal"
                          className="w-28"
                          value={cuantas[a.articulo_id] ?? ''}
                          onChange={(e) =>
                            setCuantas((c) => ({ ...c, [a.articulo_id]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {almacen ? (
          <Card>
            <Textarea
              label="Nota"
              rows={2}
              placeholder="Opcional: para qué frente, quién autorizó"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </Card>
        ) : null}
      </div>

      {entregar.error ? <ErrorDeCarga error={entregar.error} className="mt-4" /> : null}

      <div className="border-hairline bg-surface sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 border-t px-1 py-3">
        {renglones.length > 0 ? (
          <p className="text-ink/55 mr-auto text-xs">
            {resumen.prestados > 0
              ? `${resumen.prestados} queda${resumen.prestados === 1 ? '' : 'n'} a su nombre`
              : ''}
            {resumen.prestados > 0 && resumen.gastados > 0 ? ' · ' : ''}
            {resumen.gastados > 0
              ? `${resumen.gastados} sale${resumen.gastados === 1 ? '' : 'n'} del almacén`
              : ''}
          </p>
        ) : (
          <p className="text-ink/45 mr-auto text-xs">Marca al menos una cantidad.</p>
        )}

        <Link to="/app/asignaciones">
          <Button variant="ghost">Cancelar</Button>
        </Link>

        <Button disabled={!listo || entregar.isPending} onClick={enviar}>
          {entregar.isPending ? 'Entregando…' : 'Entregar'}
        </Button>
      </div>
    </>
  )
}
