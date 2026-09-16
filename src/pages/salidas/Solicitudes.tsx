import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ClipboardList, PackageCheck, PackageMinus, SendHorizontal, X } from 'lucide-react'
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
import { nombreDeGrupo, useComoActuoEnTraslados, useGruposDeSalida } from '@/lib/api/inventario'
import {
  ESTADO_DE_SOLICITUD,
  quePuedoHacerConLaSolicitud,
  useAprobarSolicitud,
  useCancelarSolicitud,
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

  LA PESTAÑA SE LLAMA «SALIDAS» Y TIENE LAS DOS FORMAS. Christopher, al verla
  como «Solicitudes»: «¿atiende qué exactamente? ¿Solicitudes de salida y
  traslado por igual?». Solo atendía salidas, no lo decía, y la salida directa
  vivía en otra pestaña. Ahora pedir y registrar la salida directa están juntos,
  cada botón con su nombre entero, y los traslados tienen las suyas en
  «Traslados»: «Necesitamos no dejar asumir al usuario, mantener lo explícito
  como norma».
*/

const ESPERAN = ['PEDIDA', 'APROBADA']

const cantidadLegible = (v: string | number): string =>
  Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

export function Solicitudes() {
  const [verTodas, setVerTodas] = useState(false)
  const [pidiendo, setPidiendo] = useState(false)
  const [sacando, setSacando] = useState(false)
  const [desdeFila, setDesdeFila] = useState<{ articulo?: string; almacen?: string }>({})
  const [cerrando, setCerrando] = useState<{ s: SolicitudDeSalida; como: 'RECHAZAR' | 'CANCELAR' } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [fallo, setFallo] = useState<string | null>(null)

  const { data: solicitudes, isPending, error } = useSolicitudesDeSalida()
  const { data: perfiles } = usePerfiles()
  const { puede: alcanza } = useMisPermisos()
  const grupos = useGruposDeSalida()
  // Los sitios por los que respondo: la misma lista que usa el traslado.
  const { data: comoActuo } = useComoActuoEnTraslados()

  const aprobar = useAprobarSolicitud()
  const rechazar = useRechazarSolicitud()
  const cancelar = useCancelarSolicitud()
  const entregar = useEntregarSolicitud()
  const nota = useNotaDeSalida()
  const puedoSacar = alcanza('SALIDAS', 'ESCRITURA')

  /*
    LA SALIDA DIRECTA, TAMBIÉN DESDE UNA FILA DE EXISTENCIAS.

    Existencias enseña lo que hay y manda aquí con el artículo y el sitio en la
    dirección; el formulario se abre con el primer renglón puesto. La marca se
    borra de la dirección en cuanto se usa: recargar no vuelve a abrirlo.
  */
  const [parametros, setParametros] = useSearchParams()
  useEffect(() => {
    if (!parametros.has('sacar')) return
    setDesdeFila({
      articulo: parametros.get('articulo') ?? undefined,
      almacen: parametros.get('almacen') ?? undefined,
    })
    setSacando(true)
    setParametros(new URLSearchParams(), { replace: true })
  }, [parametros, setParametros])

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const paraQuien = (s: SolicitudDeSalida) =>
    nombreDeGrupo(grupos.data, s.grupo_id) ??
    (s.destino_externo
      ? `${s.destino_externo}${s.responsable_externo ? ` · ${s.responsable_externo}` : ''}`
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
        description="Sacar material que ya hay en un almacén, de una de dos formas. «Solicitar salida» deja una solicitud: no descuenta nada hasta que la aprueba quien responde por el almacén y alguien de almacén la entrega. «Registrar salida directa» descuenta en este momento, sin solicitud. Comprar lo que no hay se hace en Compras."
        actions={
          <>
            <Button
              variant={puedoSacar ? 'outline' : 'primary'}
              icon={<SendHorizontal />}
              onClick={() => setPidiendo(true)}
            >
              Solicitar salida
            </Button>
            {puedoSacar ? (
              <Button icon={<PackageMinus />} onClick={() => setSacando(true)}>
                Registrar salida directa
              </Button>
            ) : null}
          </>
        }
      />

      <Pestanas pestanas={PESTANAS_SALIDAS} />

      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-ink/85 font-titular text-lg">Solicitudes de salida</h2>
        <p className="text-ink/45 text-xs">
          Las salidas directas no pasan por solicitud: se ven en «Historial».
        </p>
      </div>

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
          const puedo = quePuedoHacerConLaSolicitud(s, comoActuo, puedoSacar)
          const falta =
            s.estado === 'PEDIDA'
              ? `Falta que la apruebe quien responde por ${s.almacen?.nombre ?? 'el almacén'}, o administración.`
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
                        aprobar.mutate(s.id, {
                          onError: (e) => setFallo(e instanceof Error ? e.message : String(e)),
                        })
                      }}
                    >
                      Aprobar
                    </Button>
                  ) : null}

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
        onCerrar={() => setPidiendo(false)}
        onRegistrada={() => setPidiendo(false)}
      />

      <ModalSalida
        abierto={sacando}
        articuloInicial={desdeFila.articulo}
        almacenInicial={desdeFila.almacen}
        onCerrar={() => {
          setSacando(false)
          setDesdeFila({})
        }}
        onRegistrada={(numero, motivo) => {
          /*
            El modal se cierra AQUÍ, antes de armar el papel.

            Armarlo tarda: dos viajes de red y la descarga del trozo de jsPDF la
            primera vez. Durante esa espera el botón vuelve a dejarse pulsar, y
            el segundo toque registra una SEGUNDA salida completa, con su propio
            número de nota, sin que nadie se entere.
          */
          setSacando(false)
          setDesdeFila({})
          void nota.abrir(numero, motivo)
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

      {nota.visor}
    </>
  )
}
