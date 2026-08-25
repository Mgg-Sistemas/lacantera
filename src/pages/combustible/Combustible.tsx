import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Droplets, FileText, Fuel, Plus, Settings2, Tags, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMaquinaria } from '@/lib/api/maquinaria'
import { ListaEditable } from '@/components/ListaEditable'
import {
  useBorrarMotivoDespacho,
  useConsumoCombustible,
  useDespachosCombustible,
  useDespacharCombustible,
  useGuardarMotivoDespacho,
  useMotivosDespacho,
  usePersonasParaVale,
  useTanques,
  useCombustibleFueraDeTanque,
} from '@/lib/api/combustible'
import type { CombustibleEnSitio } from '@/lib/api/combustible'
import { useAlmacenes, useTransferir } from '@/lib/api/inventario'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMisRoles } from '@/lib/api/catalogo'
import { useEmpresa } from '@/lib/api/empresa'
import { useFirmas } from '@/lib/api/firmas'
import { Visor } from '@/components/Visor'
import { Link } from 'react-router'
import { ModalCargarCombustible } from './ModalCargarCombustible'
import { armarValeDeCombustible } from '@/lib/ficha/valeCombustiblePdf'
import type { DespachoCombustible } from '@/lib/api/combustible'
import { dolares, enPlural, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

function litros(valor: string | number, unidad = 'L'): string {
  return `${Number(valor).toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${unidad}`
}

/**
 * El combustible.
 *
 * TRES BLOQUES, EN EL ORDEN EN QUE SE PREGUNTAN
 *
 * Cuánto queda —porque quedarse sin gasoil para el frente para la cantera un
 * día entero—, cuánto consume cada máquina, y el detalle de cada despacho.
 *
 * EL CONSUMO POR HORA ES EL BLOQUE QUE JUSTIFICA EL MÓDULO
 *
 * El saldo ya lo daba Existencias. Lo que no existía era el litro por hora, y
 * es el único número de esta pantalla que avisa de algo antes de que pase: una
 * máquina que sube de 8 a 12 litros por hora tiene un problema mecánico que
 * todavía no se oye.
 *
 * Cuando falta el horómetro la columna va vacía. No se estima: un consumo por
 * hora inventado se parece demasiado a uno medido.
 */
export function Combustible() {
  const tanques = useTanques()
  const consumo = useConsumoCombustible()
  const despachos = useDespachosCombustible()
  const motivos = useMotivosDespacho()
  const { puede } = useMisPermisos()
  const { puede: tieneRol } = useMisRoles()
  const empresa = useEmpresa()
  const firmas = useFirmas()
  const [despachando, setDespachando] = useState(false)
  const [vale, setVale] = useState<{ blob: Blob; nombre: string } | null>(null)
  const [ordenando, setOrdenando] = useState(false)
  const [cargando, setCargando] = useState(false)

  /*
    EL VALE EN PAPEL

    Es el unico documento de este modulo que sale de la mano de quien despacha y
    va a la mano de quien recibe, en el patio y sin pantalla de por medio. Por
    eso se arma aqui y no se descarga de golpe: se ve primero, se comprueba que
    los litros y la maquina son los que se acordaron, y despues se imprime.

    La firma guardada de quien recibe se estampa si la tiene. Si no, la raya
    sale en blanco para firmarla a mano — que es el caso normal en el patio y no
    puede parecer que algo fallo.
  */
  const imprimirVale = async (d: DespachoCombustible) => {
    setVale(
      await armarValeDeCombustible({
        numero: d.numero,
        fecha: fecha(d.fecha),
        hora: d.hora,
        combustible: d.combustible,
        unidad: d.unidad,
        cantidad: d.cantidad,
        tanque: d.tanque,
        motivo:
          (motivos.data?.find((m) => m.codigo === d.motivo)?.nombre ?? d.motivo) +
          (d.motivo_detalle ? ` · ${d.motivo_detalle.toLowerCase()}` : ''),
        destino: d.destino,
        maquinaCodigo: d.maquina_codigo,
        sinFicha: d.maquina_id === null,
        horometro: d.horometro,
        recibio: d.recibio,
        recibioCedula: d.recibio_cedula,
        recibioFirma: d.empleado_id ? (firmas.data?.porEmpleado[d.empleado_id] ?? null) : null,
        surtio: d.surtio,
        surtioFirma: d.registrado_por
          ? (firmas.data?.porPerfil[d.registrado_por] ?? null)
          : null,
        costoUsd: d.costo_usd,
        nota: d.nota,
        empresa: {
          razonSocial: empresa.data?.razon_social ?? '',
          rif: empresa.data?.rif ?? '',
        },
        momento: new Date(),
      }),
    )
  }

  /*
    EL COMBUSTIBLE QUE NO ESTA EN UN TANQUE

    Una compra se recibe en el patio o en el almacen general, y el gasoil se
    queda ahi hasta que alguien lo pasa al tanque. Antes esos litros aparecian
    bajo el titulo «En el tanque» y se ofrecian para despachar; la base lo
    paraba al guardar —«ese almacen es de tipo PATIO»— y el aviso parecia un
    fallo del sistema. Ahora se dicen aparte, por su nombre, con la puerta al
    lado.
  */
  const fuera = useCombustibleFueraDeTanque()
  const [pasarAlTanque, setPasarAlTanque] = useState<CombustibleEnSitio | null>(null)

  const puedeDespachar = puede('COMBUSTIBLE', 'ESCRITURA')
  /*
    Dos cosas distintas que estaban gobernadas por la misma reja.

    EDITAR LA LISTA de motivos pedia COMBUSTIBLE:TOTAL, y ese nivel solo lo
    tienen las cuatro cuentas de administrador. La lista se hizo editable
    justamente para que quien despacha no tuviera que pedirlo, asi que la reja
    la dejaba inservible. Ahora ESCRITURA, igual que la funcion de la base.

    PASAR EL COMBUSTIBLE AL TANQUE es un traslado, y `transferir_existencia`
    pide el ROL ALMACEN, no un nivel de combustible. Se comprueba lo que de
    verdad se va a exigir: ofrecer un boton que la base va a rechazar es
    ensenar una puerta cerrada, y esconderlo a quien si puede es peor.
  */
  const puedeOrdenar = puede('COMBUSTIBLE', 'ESCRITURA')
  const puedeTrasladar = tieneRol('ALMACEN')
  const bajos = (tanques.data ?? []).filter(
    (t) => Number(t.stock_minimo) > 0 && Number(t.existencia) <= Number(t.stock_minimo),
  )

  return (
    <>
      <PageHeader
        title="Combustible"
        description="Cuánto queda, cuánto consume cada máquina y a qué se le echó. Entra por una compra recibida, o a mano desde Cargar."
        actions={
          puedeDespachar ? (
            <>
              {/* La lista de motivos se toca desde aquí: quien despacha es quien
                  descubre que falta uno, y no debería tener que pedirlo. */}
              {puedeOrdenar ? (
                <Button variant="ghost" onClick={() => setOrdenando(true)}>
                  <Tags className="size-4" />
                  Motivos
                </Button>
              ) : null}
              {/* El modulo sabia sacar y no sabia meter, y quien preguntaba
                  como cargar el tanque estaba parado justo aqui. Las tres
                  puertas del combustible viven ahora en su pantalla. */}
              <Link to="/app/inventario/almacenes">
                <Button variant="ghost" icon={<Settings2 />}>
                  Tanques
                </Button>
              </Link>
              <Button variant="outline" icon={<Droplets />} onClick={() => setCargando(true)}>
                Cargar
              </Button>
              <Button icon={<Plus />} onClick={() => setDespachando(true)}>
                Despachar
              </Button>
            </>
          ) : undefined
        }
      />

      {bajos.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <TriangleAlert className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {bajos.map((t) => t.articulo).join(' y ')} en el mínimo o por debajo
            </strong>
            . Quedarse sin combustible para el frente para la cantera un día entero.
          </p>
        </div>
      ) : null}

      {/* --------------------------------------------------- cuánto queda */}
      <h2 className="text-ink/80 mb-3 text-sm font-semibold">En el tanque</h2>

      {tanques.isPending ? <Cargando /> : null}
      {tanques.error ? <ErrorDeCarga error={tanques.error} /> : null}

      {/* Con litros esperando fuera, «el tanque está vacío» es verdad y
          engaña: suena a que no hay combustible, y hay 5.400 litros a cien
          metros. El bloque de abajo lo cuenta, y este se calla. */}
      {!tanques.isPending &&
      (tanques.data ?? []).length === 0 &&
      (fuera.data ?? []).length === 0 ? (
        <Card className="mb-6">
          <Vacio
            icono={<Fuel />}
            titulo="El tanque está vacío"
            descripcion="El combustible entra por una compra recibida, o a mano con el botón Cargar de arriba. Desde el tanque se despacha a las máquinas."
          />
        </Card>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(tanques.data ?? []).map((t) => {
          const hay = Number(t.existencia)
          const minimo = Number(t.stock_minimo)
          const bajo = minimo > 0 && hay <= minimo

          return (
            <Card key={`${t.almacen_id}-${t.articulo_id}`}>
              <p className="text-ink/55 text-xs">{t.almacen}</p>
              <p className="text-ink/90 mt-0.5 text-base font-medium">{t.articulo}</p>
              <p
                className={cn(
                  'tabular mt-2 text-2xl font-semibold',
                  bajo ? 'text-warning' : 'text-ink/90',
                )}
              >
                {litros(t.existencia, t.unidad)}
              </p>
              <p className="text-ink/45 mt-1 text-xs">
                {t.costo_promedio_usd
                  ? `${dolares(t.costo_promedio_usd)} por ${t.unidad.toLowerCase()}`
                  : 'Sin costo registrado'}
                {minimo > 0 ? ` · mínimo ${litros(t.stock_minimo, t.unidad)}` : ''}
              </p>
            </Card>
          )
        })}
      </div>

      {(fuera.data ?? []).length > 0 ? (
        <div className="mb-6">
          <h2 className="text-ink/80 mb-1 text-sm font-semibold">Fuera de tanque</h2>
          <p className="text-ink/50 mb-3 text-xs">
            Combustible que la empresa tiene, pero en un sitio que no es un tanque —normalmente
            porque la compra se recibió ahí—. No se puede despachar desde ahí: pásalo primero.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(fuera.data ?? []).map((c) => (
              <Card key={`fuera-${c.almacen_id}-${c.articulo_id}`}>
                <div className="flex items-start gap-2">
                  <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-ink/55 text-xs">
                      {c.almacen} · {c.almacen_tipo}
                    </p>
                    <p className="text-ink/90 mt-0.5 text-base font-medium">{c.articulo}</p>
                  </div>
                </div>
                <p className="tabular text-ink/90 mt-2 text-2xl font-semibold">
                  {litros(c.existencia, c.unidad)}
                </p>
                {puedeTrasladar ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    icon={<Droplets />}
                    onClick={() => setPasarAlTanque(c)}
                  >
                    Pasarlo a un tanque
                  </Button>
                ) : null}
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ cuánto consume */}
      <h2 className="text-ink/80 mb-1 text-sm font-semibold">Consumo por máquina</h2>
      <p className="text-ink/50 mb-3 text-xs leading-relaxed">
        Los litros por hora salen de cruzar lo despachado con las horas del parte diario. Donde no
        hay lecturas de horómetro la columna va vacía: un consumo estimado se parece demasiado a
        uno medido.
      </p>

      {consumo.isPending ? <Cargando /> : null}
      {!consumo.isPending && (consumo.data ?? []).length === 0 ? (
        <Card className="mb-6">
          <Vacio
            icono={<Fuel />}
            titulo="Todavía no se ha despachado a ninguna máquina"
            descripcion="Cuando se le eche combustible a una máquina anotando su horómetro, aquí aparecerá cuánto consume por hora."
          />
        </Card>
      ) : null}

      {(consumo.data ?? []).length > 0 ? (
        <Card flush className="mb-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Máquina</th>
                  <th className="px-3 py-3 text-right font-medium">Litros</th>
                  <th className="px-3 py-3 text-right font-medium">Horas</th>
                  <th className="px-3 py-3 text-right font-medium">L/hora</th>
                  <th className="px-3 py-3 text-right font-medium">USD/hora</th>
                  <th className="px-5 py-3 text-right font-medium">Gasto</th>
                </tr>
              </thead>
              <tbody>
                {(consumo.data ?? []).map((c) => (
                  <tr key={c.maquina_id} className="border-hairline border-b last:border-0">
                    <td className="px-5 py-3">
                      <p className="text-ink/85 font-medium">{c.maquina}</p>
                      <p className="text-ink/45 text-2xs">
                        <span className="font-mono">{c.maquina_codigo}</span> · {c.veces} despacho
                        {c.veces === 1 ? '' : 's'} desde el {fecha(c.desde)}
                      </p>
                    </td>
                    <td className="tabular text-ink/85 px-3 py-3 text-right">
                      {Number(c.litros).toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="tabular text-ink/65 px-3 py-3 text-right">
                      {c.horas
                        ? Number(c.horas).toLocaleString('es-VE', { maximumFractionDigits: 0 })
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {c.litros_por_hora ? (
                        <span className="tabular text-ink/90 font-semibold">
                          {Number(c.litros_por_hora).toLocaleString('es-VE', {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      ) : (
                        <span
                          className="text-ink/35"
                          title="Falta anotar el horómetro en el parte diario"
                        >
                          —
                        </span>
                      )}
                    </td>
                    <td className="tabular text-ink/65 px-3 py-3 text-right">
                      {c.costo_por_hora_usd ? dolares(c.costo_por_hora_usd) : '—'}
                    </td>
                    <td className="tabular text-ink/85 px-5 py-3 text-right">
                      {dolares(c.costo_usd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* -------------------------------------------------- cada despacho */}
      <h2 className="text-ink/80 mb-3 text-sm font-semibold">Últimos despachos</h2>

      {despachos.isPending ? <Cargando /> : null}
      {despachos.error ? <ErrorDeCarga error={despachos.error} /> : null}

      {!despachos.isPending && (despachos.data ?? []).length === 0 ? (
        <Card>
          <Vacio
            icono={<Fuel />}
            titulo="Sin despachos todavía"
            descripcion="Cada vez que se le eche combustible a algo quedará anotado aquí: a qué, para qué, cuánto y quién lo recibió."
          />
        </Card>
      ) : null}

      {(despachos.data ?? []).length > 0 ? (
        <Card flush>
          <ul className="divide-hairline divide-y">
            {(despachos.data ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 grow">
                  <p className="text-ink/85 text-sm">
                    <span className="tabular font-semibold">{litros(d.cantidad, d.unidad)}</span> de{' '}
                    {d.combustible} · {d.destino}
                    {d.maquina_codigo ? (
                      <span className="text-ink/45 text-2xs ml-1.5 font-mono">
                        {d.maquina_codigo}
                      </span>
                    ) : (
                      <Chip tone="neutral" className="ml-2">
                        Sin ficha
                      </Chip>
                    )}
                    {/* El detalle va pegado al motivo y no escondido en la nota:
                        un «Otro» sin decir cual es lo que vacia un catalogo, y
                        verlo repetido es lo que avisa de que falta una opcion. */}
                    <Chip tone={d.motivo === 'OTRO' ? 'warning' : 'neutral'} className="ml-2">
                      {motivos.data?.find((m) => m.codigo === d.motivo)?.nombre ?? d.motivo}
                      {d.motivo_detalle ? `: ${d.motivo_detalle.toLowerCase()}` : ''}
                    </Chip>
                  </p>
                  {/* La segunda línea responde las cinco preguntas del vale:
                      cuándo, para qué, quién lo recibió y quién lo surtió. La
                      hora solo sale cuando se sabe — un vale transcrito al día
                      siguiente no la tiene, y nula es más honesto que inventada. */}
                  <p className="text-ink/45 text-xs">
                    {fecha(d.fecha)}
                    {d.hora ? ` a las ${d.hora.slice(0, 5)}` : ''}
                    {d.numero ? ` · ${d.numero}` : ''}
                    {d.horometro ? ` · horómetro ${Number(d.horometro)}` : ' · sin horómetro'}
                    {` · recibió ${d.recibio}`}
                    {d.surtio ? ` · surtió ${d.surtio}` : ''}
                  </p>
                  {d.nota ? <p className="text-ink/60 mt-1 text-sm">{d.nota}</p> : null}
                </div>
                {d.costo_usd ? (
                  <span className="tabular text-ink/70 text-sm">{dolares(d.costo_usd)}</span>
                ) : null}

                {/* El vale se imprime desde su propia linea y no desde una
                    pantalla de detalle: quien lo necesita lo pide justo despues
                    de despachar, con la maquina esperando fuera. */}
                <Button
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => void imprimirVale(d)}
                  title="Imprimir el vale"
                >
                  <FileText className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ModalDespacho abierto={despachando} onCerrar={() => setDespachando(false)} />

      <ModalCargarCombustible abierto={cargando} onCerrar={() => setCargando(false)} />

      <ModalMotivos abierto={ordenando} onCerrar={() => setOrdenando(false)} />

      <Visor
        abierto={vale !== null}
        onCerrar={() => setVale(null)}
        blob={vale?.blob ?? null}
        nombreArchivo={vale?.nombre ?? 'vale-combustible.pdf'}
        titulo="Vale de combustible"
        descripcion="Compruébalo antes de imprimirlo: lo que diga este papel es lo que se va a firmar."
      />
      <ModalPasarAlTanque origen={pasarAlTanque} onCerrar={() => setPasarAlTanque(null)} />
    </>
  )
}

/**
 * Echarle combustible a algo.
 *
 * EL HORÓMETRO SE PIDE ARRIBA, NO ABAJO
 *
 * Va justo debajo de la máquina porque es cuando quien despacha lo tiene
 * delante: está parado al lado del equipo con el reloj a la vista. Preguntarlo
 * al final, después de la cantidad y la fecha, es preguntarlo cuando ya se dio
 * la vuelta.
 *
 * No es obligatorio. Un generador de emergencia también consume y puede no
 * llevar horómetro; exigirlo obligaría a inventar un número, y un horómetro
 * inventado estropea el cálculo de todos los demás despachos de esa máquina.
 */
function ModalDespacho({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const despachar = useDespacharCombustible()
  const tanques = useTanques()
  const { data: maquinas } = useMaquinaria(true)
  const { data: personas } = usePersonasParaVale()
  const motivos = useMotivosDespacho()

  const hoy = new Date().toLocaleDateString('en-CA')
  const [tanque, setTanque] = useState('')
  const [maquina, setMaquina] = useState('')
  const [destino, setDestino] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [horometro, setHorometro] = useState('')
  const [empleado, setEmpleado] = useState('')
  // Para quien no esta en la nomina: el chofer de un fletero al que se le echa
  // gasoil no tiene ficha, y sin esto el vale se quedaria sin nombre.
  const [otroNombre, setOtroNombre] = useState('')
  const [otraCedula, setOtraCedula] = useState('')
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [dia, setDia] = useState(hoy)
  const [nota, setNota] = useState('')

  const conSaldo = (tanques.data ?? []).filter((t) => Number(t.existencia) > 0)

  useEffect(() => {
    if (!abierto) return
    setTanque(conSaldo.length === 1 ? `${conSaldo[0].almacen_id}|${conSaldo[0].articulo_id}` : '')
    setMaquina('')
    setDestino('')
    setCantidad('')
    setHorometro('')
    setEmpleado('')
    setOtroNombre('')
    setOtraCedula('')
    setMotivo('')
    setDetalle('')
    setDia(hoy)
    setNota('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const elegido = conSaldo.find((t) => `${t.almacen_id}|${t.articulo_id}` === tanque)

  /*
    Las maquinas que pueden recibir ESTE combustible.

    Una que no declara cual quema entra igual: no esta mal, esta sin declarar, y
    esconderla obligaria a abrir Maquinaria antes de poder surtir. Una que
    declara OTRO no entra: la base la rechaza al guardar, y ofrecerla es hacer
    que alguien llene el vale entero para que se lo tumben al final.
  */
  const maquinasQuePueden = (maquinas ?? []).filter(
    (m) => !elegido || !m.combustible_id || m.combustible_id === elegido.articulo_id,
  )
  const ocultasPorCombustible = (maquinas ?? []).length - maquinasQuePueden.length
  const pedidos = Number(cantidad)
  const excede = elegido ? pedidos > Number(elegido.existencia) : false
  const sinFicha = maquina === ''

  // Quien recibe es obligatorio, de la nomina o escrito a mano. El combustible
  // es de lo que mas se pierde, y un vale sin nombre no se le puede preguntar
  // a nadie.
  const hayQuienRecibe = empleado !== '' || otroNombre.trim().length >= 3

  // Si el motivo elegido obliga a explicarse, el boton no se enciende sin la
  // explicacion. Lo pidio la lider: «que el usuario especifique en pocas
  // palabras».
  const elMotivo = motivos.data?.find((m) => m.codigo === motivo)
  const faltaDetalle = elMotivo?.exige_detalle === true && detalle.trim().length < 3

  const valido =
    elegido !== undefined &&
    pedidos > 0 &&
    !excede &&
    motivo !== '' &&
    !faltaDetalle &&
    hayQuienRecibe &&
    (!sinFicha || destino.trim().length >= 3)

  const enviar = async () => {
    if (!elegido) return
    await despachar.mutateAsync({
      articulo_id: elegido.articulo_id,
      almacen_id: elegido.almacen_id,
      cantidad: pedidos,
      motivo,
      motivo_detalle: elMotivo?.exige_detalle ? detalle.trim() : null,
      maquina_id: maquina ? Number(maquina) : null,
      destino: sinFicha ? destino.trim() : null,
      horometro: horometro ? Number(horometro) : null,
      empleado_id: empleado ? Number(empleado) : null,
      recibio_nombre: empleado ? null : otroNombre.trim(),
      recibio_cedula: empleado ? null : otraCedula.trim() || null,
      fecha: dia,
      nota: nota.trim() || null,
    })
    onCerrar()
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Despachar combustible"
      descripcion="Se descuenta del tanque al costo promedio que tenga ahora."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || despachar.isPending}>
            {despachar.isPending ? 'Guardando…' : 'Despachar'}
          </Button>
        </>
      }
    >
      <Select
        label="De qué tanque"
        vacio="Elegir"
        value={tanque}
        onChange={(e) => setTanque(e.target.value)}
        opciones={conSaldo.map((t) => ({
          valor: `${t.almacen_id}|${t.articulo_id}`,
          etiqueta: `${t.articulo} · quedan ${litros(t.existencia, t.unidad)}`,
        }))}
        hint={
          conSaldo.length === 0
            ? 'No hay combustible cargado en ningún tanque.'
            : undefined
        }
      />

      {/* El «para qué» va antes que el «a qué»: son preguntas distintas, y si
          van juntas la gente contesta la máquina y da el motivo por sabido. */}
      <div className="mt-4">
        <Select
          label="Para qué"
          vacio="Elegir"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          opciones={(motivos.data ?? []).map((m) => ({ valor: m.codigo, etiqueta: m.nombre }))}
          hint={
            elMotivo?.pista ??
            'No es lo mismo que a qué máquina: la misma excavadora se surte para producir o para probarla tras repararla.'
          }
        />

        {/* Solo aparece cuando el motivo lo pide. Un campo de texto siempre a la
            vista se rellena con cualquier cosa; uno que sale porque hiciste una
            elección concreta, se contesta. */}
        {elMotivo?.exige_detalle ? (
          <div className="mt-4">
            <Input
              label="¿Para qué exactamente?"
              placeholder="Prueba de la bomba nueva"
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              hint="En pocas palabras. Si esto se repite mucho, conviene que sea una opción propia."
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        {/*
          Solo las maquinas que queman ESTE combustible.

          Christopher: «¿una maquina de gasolina es seleccionable para
          despacharle gasoil? ¿validaste eso?». No lo estaba: la base lo paraba
          al guardar —«"X" usa gasolina y se le esta echando gasoil»— y el
          desplegable las ofrecia todas. Es el mismo fallo que ya salio hoy tres
          veces: la pantalla ofrece lo que la base va a rechazar.

          Las que no dicen que queman SI salen. No estan mal: estan sin declarar,
          y esconderlas obligaria a abrir Maquinaria antes de poder surtir.
        */}
        <SelectBuscable
          label="A qué máquina"
          vacio="No está en la ficha"
          valor={maquina}
          onCambio={(v) => setMaquina(v)}
          opciones={maquinasQuePueden.map((m) => ({
            valor: String(m.id),
            codigo: m.codigo,
            nombre: m.nombre,
            detalle: m.combustible_id
              ? m.capacidad_combustible
                ? `le caben ${Number(m.capacidad_combustible)} ${elegido?.unidad ?? ''}`
                : 'quema este combustible'
              : 'no dice qué quema',
          }))}
          hint={
            (maquinas ?? []).length === 0
              ? 'Todavía no hay máquinas cargadas en la ficha. El vale se puede emitir igual: escribe abajo a qué se le echó. Cuando se carguen en Maquinaria aparecerán aquí y se podrá llevar el consumo por hora.'
              : ocultasPorCombustible > 0
                ? `No salen ${ocultasPorCombustible} que queman otro combustible. Si la ficha de alguna está equivocada, corrígela en Maquinaria.`
                : 'Sin máquina no hay consumo por hora: solo cuenta para el gasto.'
          }
        />
      </div>

      {sinFicha ? (
        <div className="mt-4">
          <Input
            label="A qué se le echó"
            placeholder="Planta eléctrica de la oficina"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
          />
        </div>
      ) : (
        <div className="mt-4">
          <Input
            label="Horómetro al echarle"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Si el reloj se puede leer"
            value={horometro}
            onChange={(e) => setHorometro(e.target.value)}
            hint="Es lo que convierte los litros en litros por hora."
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label={`Cuántos ${enPlural(elegido?.unidad) || 'litros'}`}
          type="number"
          min="0.01"
          step="0.01"
          inputMode="decimal"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          error={
            excede && elegido
              ? `En el tanque solo quedan ${litros(elegido.existencia, elegido.unidad)}`
              : undefined
          }
        />
        <Input label="Fecha" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>

      <div className="mt-4">
        <SelectBuscable
          label="Quién lo recibió"
          vacio="No está en la nómina"
          valor={empleado}
          onCambio={(v) => setEmpleado(v)}
          opciones={(personas ?? []).map((e) => ({
            valor: String(e.id),
            etiqueta: e.cargo ? `${e.nombre} · ${e.cargo}` : e.nombre,
          }))}
          hint="El combustible es de lo que más se pierde: un vale sin nombre no se le puede preguntar a nadie."
        />
      </div>

      {/* A la cantera entran gandolas de fleteros a las que se les echa gasoil,
          y su chófer no está en la nómina. Sin esta salida, o el vale se queda
          sin nombre o alguien acaba poniendo el suyo. */}
      {empleado === '' ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre de quien recibió"
            placeholder="José Ramírez"
            value={otroNombre}
            onChange={(e) => setOtroNombre(e.target.value)}
          />
          <Input
            label="Cédula"
            placeholder="V-12345678"
            value={otraCedula}
            onChange={(e) => setOtraCedula(e.target.value)}
            hint="Opcional, pero es lo que permite dar con la persona después."
          />
        </div>
      ) : null}

      <div className="mt-4">
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>

      {despachar.error ? <ErrorDeCarga error={despachar.error} className="mt-3" /> : null}
    </Modal>
  )
}

/*
  LOS MOTIVOS DEL VALE, EN MANOS DE LA EMPRESA

  La lider pidio anadir «Produccion» y costo un despliegue. Esto es para que la
  proxima no cueste nada.

  Va aqui, en la pantalla de combustible, y no en Configuracion: quien descubre
  que falta un motivo es quien esta despachando y no encuentra donde poner lo que
  tiene delante. Mandarlo a otro menu es garantizar que en vez de arreglarlo elija
  «Otro» y siga.
*/
function ModalMotivos({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const motivos = useMotivosDespacho(true)
  const guardar = useGuardarMotivoDespacho()
  const borrar = useBorrarMotivoDespacho()

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Para qué se surte"
      descripcion="La lista que sale al despachar. Cámbiala cuando haga falta; los vales viejos siguen diciendo lo que decían."
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Listo
        </Button>
      }
    >
      <ListaEditable
        elementos={(motivos.data ?? []).map((m) => ({
          codigo: m.codigo,
          nombre: m.nombre,
          pista: m.exige_detalle ? `${m.pista ?? ''} · pide explicación` : m.pista,
          activo: m.activo !== false,
        }))}
        error={guardar.error ?? borrar.error}
        guardando={guardar.isPending || borrar.isPending}
        etiquetaAnadir="Añadir motivo"
        placeholderNuevo="Traslado a otro frente"
        nota="Apagar un motivo lo quita del formulario sin tocar los vales ya emitidos. Borrar solo funciona con los que nunca se usaron."
        onGuardar={(e) => {
          const actual = (motivos.data ?? []).find((m) => m.codigo === e.codigo)
          return guardar.mutateAsync({
            codigo: e.codigo,
            nombre: e.nombre,
            pista: actual?.pista ?? null,
            exige_detalle: actual?.exige_detalle ?? false,
            activo: e.activo,
          })
        }}
        onBorrar={(codigo) => borrar.mutateAsync(codigo)}
        onAnadir={(nombre) => guardar.mutateAsync({ nombre })}
      />
    </Modal>
  )
}

/**
 * Pasar al tanque el combustible que está en otro sitio.
 *
 * No es una carga: es un TRASLADO. La diferencia importa. Cargar añadiría
 * litros que ya están contados en el patio, y la empresa acabaría teniendo el
 * doble de gasoil en el sistema que en el suelo. Trasladar los mueve: salen de
 * un sitio y entran en el otro, con su costo, y el total no cambia.
 */
function ModalPasarAlTanque({
  origen,
  onCerrar,
}: {
  origen: CombustibleEnSitio | null
  onCerrar: () => void
}) {
  const qc = useQueryClient()
  const transferir = useTransferir()
  const { data: almacenes } = useAlmacenes()
  const [tanque, setTanque] = useState('')
  const [cuanto, setCuanto] = useState('')
  const [motivo, setMotivo] = useState('')

  const tanques = (almacenes ?? []).filter((a) => a.tipo === 'COMBUSTIBLE')

  useEffect(() => {
    if (!origen) return
    // Con un solo tanque no hay nada que preguntar. Y por defecto se pasa todo:
    // el combustible en el patio está de paso, no repartido a propósito.
    setTanque(tanques.length === 1 ? String(tanques[0].id) : '')
    setCuanto(String(Number(origen.existencia)))
    setMotivo('')
    // Los tanques cambian de identidad en cada pintado; lo que decide es el
    // origen, que es lo que abre este formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origen])

  if (!origen) return null

  const hay = Number(origen.existencia)
  const pedido = Number(cuanto || 0)
  const pasado = pedido > hay
  const capacidad = tanques.find((t) => String(t.id) === tanque)?.capacidad

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Pasar al tanque"
      descripcion="Se mueve de un sitio al otro con su costo. No se crea combustible: el total de la empresa no cambia."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              void (async () => {
                await transferir.mutateAsync({
                  origen_id: origen.almacen_id,
                  destino_id: Number(tanque),
                  articulo_id: origen.articulo_id,
                  cantidad: pedido,
                  motivo,
                })

                /*
                  `useTransferir` invalida existencias, movimientos, compras y
                  avisos — no combustible, porque un traslado no escribe en
                  `despachos_combustible`. Sin esto, las dos tarjetas de arriba
                  siguen diciendo lo de antes: «Fuera de tanque» con los mismos
                  litros y el tanque vacio. El operador concluye que no paso
                  nada y lo pasa otra vez.
                */
                await qc.invalidateQueries({ queryKey: ['combustible'] })
                onCerrar()
              })()
            }
            disabled={
              !tanque || pedido <= 0 || pasado || motivo.trim().length < 4 || transferir.isPending
            }
          >
            {transferir.isPending ? 'Pasando…' : 'Pasar'}
          </Button>
        </>
      }
    >
      <div className="border-hairline bg-canvas rounded-card mb-4 border p-3">
        <p className="text-ink/85 text-sm font-medium">{origen.articulo}</p>
        <p className="text-ink/55 text-xs">
          {origen.almacen} · hay {litros(origen.existencia, origen.unidad)}
        </p>
      </div>

      {tanques.length === 0 ? (
        <p className="text-danger text-sm">
          No hay ningún tanque creado. Créalo primero en Tanques, arriba, y vuelve aquí.
        </p>
      ) : (
        <>
          <SelectBuscable
            label="A qué tanque"
            vacio="Elige el tanque"
            valor={tanque}
            onCambio={setTanque}
            opciones={tanques.map((t) => ({
              valor: String(t.id),
              codigo: t.codigo,
              nombre: t.nombre,
              detalle: t.capacidad ? `le caben ${Number(t.capacidad)}` : 'sin tope declarado',
            }))}
          />

          <Input
            className="mt-3"
            label="Cuánto se pasa"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={cuanto}
            onChange={(e) => setCuanto(e.target.value)}
            hint={
              pasado
                ? `Ahí solo hay ${litros(origen.existencia, origen.unidad)}`
                : capacidad
                  ? `Al tanque le caben ${Number(capacidad)} ${origen.unidad}`
                  : `En ${origen.unidad}`
            }
          />

          <Textarea
            className="mt-3"
            label="Por qué se mueve"
            rows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Basta con «la compra se recibió en el patio y va al tanque»."
          />

          {/* La base puede negarse por varias razones —el tanque no tiene sitio,
              falta el rol ALMACEN— y sin esto el boton se quedaria mudo. */}
          {transferir.error ? (
            <ErrorDeCarga error={transferir.error} className="mt-3" />
          ) : null}
        </>
      )}
    </Modal>
  )
}
