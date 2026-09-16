import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ClipboardList, FileText, PackageCheck, PackageMinus, SendHorizontal, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_SALIDAS } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { usePerfiles } from '@/lib/api/catalogo'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMiFirma } from '@/lib/api/firmas'
import { nombreDeGrupo, useGruposDeSalida } from '@/lib/api/inventario'
import {
  ESTADO_DE_SOLICITUD,
  quePuedoHacerConLaSolicitud,
  useAprobarSolicitud,
  useCancelarSolicitud,
  useComoAprueboSalidas,
  useEntregarSolicitud,
  useRechazarSolicitud,
  useSolicitudesDeSalida,
} from '@/lib/api/salidas'
import type { SolicitudDeSalida } from '@/lib/api/salidas'
import { ModalSalida } from './ModalSalida'
import { useNotaDeSalida } from './NotaDeSalida'
import { fechaHora } from '@/lib/formato'

/*
  LO QUE SE PIDE ANTES DE ENTREGARLO

  Christopher, 16/09/2026: «nos piden que manejemos las solicitudes de salida,
  así como la opción de salida directa. Por igual con traslados».

  La pantalla es la del traslado, con la misma forma y el mismo orden: lo que
  espera a alguien primero, y lo demás detrás de un botón. Quien responde por el
  almacén ve «Aprobar» y «No aprobar»; quien lo entrega ve «Entregar»; quien la
  pidió puede cancelarla mientras no haya salido nada.

  Ni pedir ni aprobar mueven material: la existencia baja al entregar, y ahí
  sale el papel que alguien firma.

  LA PESTAÑA SE LLAMA «SALIDAS». Christopher, al verla como «Solicitudes»:
  «¿atiende qué exactamente? ¿Solicitudes de salida y traslado por igual?». Solo
  atendía salidas y no lo decía. Los traslados tienen las suyas en «Traslados»:
  «Necesitamos no dejar asumir al usuario, mantener lo explícito como norma».

  Y DESDE LA TARDE DEL 16/09 SOLO HAY UNA FORMA. Se encontraron salidas de
  material anotadas como venta desde la salida directa, y Christopher: «todas
  las salidas necesitarán de autorización, ocultaremos las salidas y traslados
  directos por ahora». El botón de la salida directa se quitó, y la base la
  rechaza aunque alguien la llame a mano. Lo que llega de Existencias con
  `?solicitar=` —o con el `?sacar=` de antes— abre la solicitud con el material
  y el sitio puestos.
*/

const ESPERAN = ['PEDIDA', 'APROBADA']

const cantidadLegible = (v: string | number): string =>
  Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

export function Solicitudes() {
  const [verTodas, setVerTodas] = useState(false)
  const [pidiendo, setPidiendo] = useState(false)
  const [desdeFila, setDesdeFila] = useState<{ articulo?: string; almacen?: string }>({})
  const [cerrando, setCerrando] = useState<{ s: SolicitudDeSalida; como: 'RECHAZAR' | 'CANCELAR' } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [fallo, setFallo] = useState<string | null>(null)
  /*
    APROBAR PREGUNTA POR LA FIRMA, SI HAY FIRMA QUE PONER.

    Christopher eligió que la firma la decide su dueño al actuar, y que todo
    papel lleve por defecto la de quien autoriza. Quien tiene su firma guardada
    y encendida la ve marcada y puede quitarla; quien no tiene, aprueba sin que
    se le pregunte nada: no hay nada que poner.
  */
  const { data: miFirma } = useMiFirma()
  const tengoFirma = miFirma?.usar === true
  const [aprobando, setAprobando] = useState<SolicitudDeSalida | null>(null)
  const [conMiFirma, setConMiFirma] = useState(true)

  const { data: solicitudes, isPending, error } = useSolicitudesDeSalida()
  const { data: perfiles } = usePerfiles()
  const { puede: alcanza } = useMisPermisos()
  const grupos = useGruposDeSalida()
  /*
    Quién aprueba ya no se decide como en el traslado. Desde el 16/09 es una
    casilla: la gerencia la trae por su rol, se le extiende a quien haga falta,
    y a quien se le restringe no aprueba ni respondiendo por el almacén. Lo
    pidió Christopher al repartir las aprobaciones: «mediante permisos».
  */
  const { data: comoApruebo } = useComoAprueboSalidas()

  const aprobar = useAprobarSolicitud()
  const rechazar = useRechazarSolicitud()
  const cancelar = useCancelarSolicitud()
  const entregar = useEntregarSolicitud()
  const nota = useNotaDeSalida()
  const puedoSacar = alcanza('SALIDAS', 'ESCRITURA')

  /*
    LA SOLICITUD, TAMBIÉN DESDE UNA FILA DE EXISTENCIAS.

    Existencias enseña lo que hay y manda aquí con el artículo y el sitio en la
    dirección; el formulario se abre con el primer renglón puesto. La marca se
    borra de la dirección en cuanto se usa: recargar no vuelve a abrirlo. Un
    enlace viejo con `?sacar=` abre lo mismo: la salida directa ya no existe.
  */
  const [parametros, setParametros] = useSearchParams()
  useEffect(() => {
    if (!parametros.has('solicitar') && !parametros.has('sacar')) return
    setDesdeFila({
      articulo: parametros.get('articulo') ?? undefined,
      almacen: parametros.get('almacen') ?? undefined,
    })
    setPidiendo(true)
    setParametros(new URLSearchParams(), { replace: true })
  }, [parametros, setParametros])

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const paraQuien = (s: SolicitudDeSalida) =>
    nombreDeGrupo(grupos.data, s.grupo_id) ??
    (s.destino_externo
      ? `${s.destino_externo}, de fuera de la empresa${s.responsable_externo ? ` · responde ${s.responsable_externo}` : ''}`
      : '—')

  const todas = solicitudes ?? []
  const esperando = todas.filter((s) => ESPERAN.includes(s.estado))
  const alaVista = verTodas ? todas : esperando

  const cerrar = async () => {
    if (!cerrando) return
    try {
      if (cerrando.como === 'RECHAZAR') {
        await rechazar.mutateAsync({ id: cerrando.s.id, motivo })
      } else {
        await cancelar.mutateAsync({ id: cerrando.s.id, motivo })
      }
      setCerrando(null)
      setMotivo('')
    } catch (e) {
      setFallo(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Salidas"
        description="Sacar material que ya hay en un almacén. Toda salida se solicita: no descuenta nada hasta que la aprueba quien responde por el almacén y alguien de almacén la entrega. Una venta no sale por aquí, sino por Facturación › Notas de entrega. Comprar lo que no hay se hace en Compras."
        actions={
          <Button icon={<SendHorizontal />} onClick={() => setPidiendo(true)}>
            Solicitar salida
          </Button>
        }
      />

      <Pestanas pestanas={PESTANAS_SALIDAS} />

      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink/85 font-titular text-lg">Solicitudes de salida</h2>
        <p className="text-ink/45 text-xs">
          Por ahora no hay salida directa: todo pasa por solicitud. Las de antes están en
          «Historial».
        </p>
      </div>

      {/* Se dice, en vez de dejar que lo descubra buscando un botón que no está. */}
      {comoApruebo?.restringida ? (
        <p className="text-ink/60 mb-3 text-sm">
          Aprobar salidas se te restringió: puedes solicitarlas y cancelar las tuyas, y las aprueba
          quien tenga ese permiso.
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={verTodas ? 'ghost' : 'soft'} onClick={() => setVerTodas(false)}>
          Esperan{solicitudes ? ` (${esperando.length})` : ''}
        </Button>
        <Button size="sm" variant={verTodas ? 'soft' : 'ghost'} onClick={() => setVerTodas(true)}>
          Todas
        </Button>
      </div>

      {fallo ? <p className="text-danger mb-3 text-sm">{fallo}</p> : null}
      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {solicitudes && alaVista.length === 0 ? (
        <Card>
          <Vacio
            icono={<ClipboardList />}
            titulo={verTodas ? 'Todavía no hay solicitudes' : 'Nada esperando'}
            descripcion={
              verTodas
                ? 'Cuando alguien solicite una salida, aparecerá aquí antes de que se entregue.'
                : 'Ninguna solicitud espera aprobación ni entrega. Las cerradas están en «Todas».'
            }
          />
        </Card>
      ) : null}

      <div className="space-y-3">
        {alaVista.map((s) => {
          const estado = ESTADO_DE_SOLICITUD[s.estado]
          const puedo = quePuedoHacerConLaSolicitud(s, comoApruebo, puedoSacar)
          const falta =
            s.estado === 'PEDIDA'
              ? `Falta que la apruebe quien responde por ${s.almacen?.nombre ?? 'el almacén'} o quien tenga el permiso de aprobar salidas.`
              : s.estado === 'APROBADA'
                ? 'Aprobada. Falta que alguien de almacén la entregue: al entregarla sale la nota y se descuenta la existencia.'
                : null

          return (
            <Card key={s.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink/70 tabular font-mono text-xs">{s.numero}</span>
                    <Chip tone={estado.tono}>{estado.texto}</Chip>
                    {s.nota_salida ? (
                      <span className="text-ink/45 tabular font-mono text-2xs">
                        nota {s.nota_salida}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-ink/85 mt-1.5 text-sm font-medium">
                    De {s.almacen?.nombre ?? '—'} · para {paraQuien(s)}
                  </p>
                  <p className="text-ink/55 text-xs">Para: {s.motivo}</p>

                  <ul className="text-ink/75 mt-2 space-y-0.5 text-sm">
                    {(s.renglones ?? []).map((r) => (
                      <li key={r.id}>
                        {cantidadLegible(r.cantidad)} {r.articulo?.unidad ?? ''} ·{' '}
                        {r.articulo?.nombre ?? '—'}
                        {r.propietario ? (
                          <span className="text-ink/45 text-xs"> · de {r.propietario}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  <p className="text-ink/40 mt-2 text-xs">
                    La solicitó {nombreDe(s.pedida_por)} · {fechaHora(s.pedida_en)}
                    {s.aprobada_en
                      ? ` · ${s.estado === 'RECHAZADA' ? 'la resolvió' : 'la aprobó'} ${nombreDe(s.aprobada_por)}`
                      : ''}
                    {s.aprobada_de_respaldo ? ' (de respaldo)' : ''}
                    {s.entregada_en ? ` · la entregó ${nombreDe(s.entregada_por)}` : ''}
                  </p>

                  {s.cierre_motivo ? (
                    <p className="text-ink/55 mt-1 text-xs italic">{s.cierre_motivo}</p>
                  ) : null}

                  {falta ? <p className="text-warning mt-1 text-xs">{falta}</p> : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {puedo.aprobar ? (
                    <Button
                      size="sm"
                      icon={<PackageCheck />}
                      disabled={aprobar.isPending}
                      onClick={() => {
                        setFallo(null)
                        if (tengoFirma) {
                          setConMiFirma(true)
                          setAprobando(s)
                          return
                        }
                        aprobar.mutate(
                          { id: s.id, con_firma: false },
                          { onError: (e) => setFallo(e instanceof Error ? e.message : String(e)) },
                        )
                      }}
                    >
                      Aprobar
                    </Button>
                  ) : null}

                  {/* La orden se imprime en cualquier estado, con el suyo a la vista. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<FileText />}
                    onClick={() => {
                      setFallo(null)
                      void nota.abrirOrden(s)
                    }}
                  >
                    Orden
                  </Button>

                  {puedo.rechazar ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<X />}
                      onClick={() => {
                        setMotivo('')
                        setCerrando({ s, como: 'RECHAZAR' })
                      }}
                    >
                      No aprobar
                    </Button>
                  ) : null}

                  {puedo.entregar ? (
                    <Button
                      size="sm"
                      icon={<PackageMinus />}
                      disabled={entregar.isPending}
                      onClick={() => {
                        setFallo(null)
                        entregar.mutate(s.id, {
                          onSuccess: (numero) => void nota.abrir(numero as string, s.motivo),
                          onError: (e) => setFallo(e instanceof Error ? e.message : String(e)),
                        })
                      }}
                    >
                      Entregar material
                    </Button>
                  ) : null}

                  {puedo.cancelar ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setMotivo('')
                        setCerrando({ s, como: 'CANCELAR' })
                      }}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/*
        SOLICITAR Y SACAR COMPARTEN COMPONENTE por los renglones: lo que se
        solicita es exactamente lo que se entrega. Las preguntas no son las
        mismas: al solicitar no se elige razón, se escribe para qué.
      */}
      <ModalSalida
        abierto={pidiendo}
        modo="pedir"
        articuloInicial={desdeFila.articulo}
        almacenInicial={desdeFila.almacen}
        onCerrar={() => {
          setPidiendo(false)
          setDesdeFila({})
        }}
        onRegistrada={() => {
          setPidiendo(false)
          setDesdeFila({})
        }}
      />

      {cerrando ? (
        <Modal
          abierto
          onCerrar={() => setCerrando(null)}
          titulo={cerrando.como === 'RECHAZAR' ? 'No aprobar la solicitud' : 'Cancelar la solicitud'}
          descripcion={
            cerrando.como === 'RECHAZAR'
              ? 'Quien la pidió va a leer el motivo, así que conviene que diga algo.'
              : 'Queda escrito y no se puede editar después.'
          }
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setCerrando(null)}>
                Volver
              </Button>
              <Button
                disabled={motivo.trim().length < 4 || rechazar.isPending || cancelar.isPending}
                onClick={() => void cerrar()}
              >
                {rechazar.isPending || cancelar.isPending ? 'Guardando…' : 'Confirmar'}
              </Button>
            </>
          }
        >
          <Textarea
            label={cerrando.como === 'RECHAZAR' ? 'Por qué no se aprueba' : 'Por qué se cancela'}
            rows={3}
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </Modal>
      ) : null}

      {aprobando ? (
        <Modal
          abierto
          onCerrar={() => setAprobando(null)}
          titulo={`Aprobar ${aprobando.numero}`}
          descripcion="Tu nombre va en «Autorizado por» de la orden y de la nota que salga al entregarla."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAprobando(null)}>
                Volver
              </Button>
              <Button
                icon={<PackageCheck />}
                disabled={aprobar.isPending}
                onClick={() =>
                  aprobar.mutate(
                    { id: aprobando.id, con_firma: conMiFirma },
                    {
                      onSuccess: () => setAprobando(null),
                      onError: (e) => {
                        setAprobando(null)
                        setFallo(e instanceof Error ? e.message : String(e))
                      },
                    },
                  )
                }
              >
                {aprobar.isPending ? 'Aprobando…' : 'Aprobar'}
              </Button>
            </>
          }
        >
          <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
              checked={conMiFirma}
              onChange={(e) => setConMiFirma(e.target.checked)}
            />
            <span className="text-ink/80">
              Poner mi firma digital en «Autorizado por»
              <span className="text-ink/50 mt-0.5 block text-xs">
                Sin marcar, la raya sale en blanco con tu nombre debajo, para firmarla a mano.
              </span>
            </span>
          </label>
        </Modal>
      ) : null}

      {nota.visor}
    </>
  )
}
