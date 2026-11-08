import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  ClipboardList,
  FileText,
  MessageCircle,
  PackageCheck,
  PackageMinus,
  SendHorizontal,
  Smartphone,
  X,
} from 'lucide-react'
import { Ayuda } from '@/components/Ayuda'
import { FotosDeCarga } from '@/components/FotosDeCarga'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { usePerfiles } from '@/lib/api/catalogo'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useSesion } from '@/lib/sesion'
import { useMiFirma } from '@/lib/api/firmas'
import { nombreDeGrupo, useGruposDeSalida } from '@/lib/api/inventario'
import {
  ESTADO_DE_SOLICITUD,
  nombreDeEmpleado,
  quePuedoHacerConLaSolicitud,
  useAprobarSolicitud,
  useCancelarSolicitud,
  useComoAprueboSalidas,
  useEntregarSolicitud,
  usePersonasDeLaEmpresa,
  useRechazarSolicitud,
  useSolicitudesDeSalida,
} from '@/lib/api/salidas'
import type { SolicitudDeSalida } from '@/lib/api/salidas'
import { ModalSalida } from './ModalSalida'
import { ModalReporteSalida } from './ModalReporteSalida'
import { useNotaDeSalida } from './NotaDeSalida'
import { useEmpresa } from '@/lib/api/empresa'
import { fechaHora } from '@/lib/formato'
import { enCastellano } from '@/lib/castellano'
import { CabeceraSalidas } from './CabeceraSalidas'
import { Tablero } from './Tablero'
import { DetalleSolicitud, TarjetaSalida } from './TarjetasSalidas'
import { HistoricoSolicitudes } from './Historicos'
import { ResumenSalidas } from './ResumenSalidas'
import {
  COLUMNAS_SALIDA,
  cantidadLegible,
  guardarModo,
  leerModo,
  type ModoTablero,
} from './tableroSalidas'

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

/*
  COMO MGG (FASE 5), 08/11/2026.

  Arriba, la cabecera de MGG: «↘ Salidas / ↔ Traslados» y «🗂 Solicitudes /
  📚 Histórico / 📜 Historial / 📊 Resumen». La sub-vista va en la dirección
  (`?vista=historico`, `?vista=resumen`), así el menú conserva sus rutas.

  «🗂 Solicitudes» es el tablero de MGG con las cuatro columnas de aquí —«Por
  aprobar» · «Por entregar» · «Entregada» · «Rechazada / Cancelada»—, 10
  tarjetas por columna, chips para ocultar columnas y filtros por usuario y
  solicitante. La lista de tarjetas de antes sigue a un clic («☰ Lista»), con
  todo lo que tenía. La tarjeta abre «Solicitud {numero}» con su historial y
  LOS MISMOS botones de la lista: `botonesDe` es uno solo para las dos vistas,
  así que aprobar, no aprobar, entregar, cancelar y el reporte siguen siendo
  exactamente lo de antes. No cambia la máquina de estados.
*/

const ESPERAN = ['PEDIDA', 'APROBADA']

/** Cuántas solicitudes trae el tablero para poder contar «las N anteriores». */
const TOPE_TABLERO = 1000
const CLAVE_MODO = 'salidas.solicitudes.modo'

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

  const { data: solicitudes, isPending, error } = useSolicitudesDeSalida(TOPE_TABLERO)
  const { data: perfiles } = usePerfiles()
  const { session } = useSesion()
  const { puede: alcanza } = useMisPermisos()
  const grupos = useGruposDeSalida()
  const { data: personas } = usePersonasDeLaEmpresa()
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
  const { data: empresa } = useEmpresa()

  /*
    EL AVISO DE QUE EL REPORTE YA ESTÁ LISTO, igual que en Notas de entrega:
    sale solo al entregar, sin forzar una ventana encima de quien entrega
    varias seguidas. El botón de Reporte, en cada tarjeta, lo deja disponible
    después también, por si hay que reenviarlo.
  */
  const [avisoEntrega, setAvisoEntrega] = useState<{ s: SolicitudDeSalida; notaSalida: string } | null>(
    null,
  )
  const [verReporteSalida, setVerReporteSalida] = useState<{ s: SolicitudDeSalida; notaSalida: string } | null>(
    null,
  )

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

  const navegar = useNavigate()
  const vistaPedida = parametros.get('vista')
  const vista = vistaPedida === 'historico' || vistaPedida === 'resumen' ? vistaPedida : 'solicitudes'
  const [modo, setModo] = useState<ModoTablero>(() => leerModo(CLAVE_MODO))
  const [fUsuario, setFUsuario] = useState('')
  const [fSolicitante, setFSolicitante] = useState('')
  const [detalleId, setDetalleId] = useState<number | null>(null)

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const paraQuien = (s: SolicitudDeSalida) =>
    nombreDeEmpleado(personas, s.empleado_id) ??
    nombreDeGrupo(grupos.data, s.grupo_id) ??
    (s.destino_externo
      ? `${s.destino_externo}, de fuera de la empresa${s.responsable_externo ? ` · responde ${s.responsable_externo}` : ''}`
      : '—')

  /*
    LOS FILTROS DEL TABLERO (MGG): «👤 Usuario (quien la hizo)» es quien la
    pidió en el sistema; «🏷 Solicitante» es para quién es —la persona, el área
    o quien sea de fuera—, que es lo que aquí hace de «solicitante» de MGG.
  */
  const cargadas = useMemo(() => solicitudes ?? [], [solicitudes])
  const usuariosOpc = useMemo(() => {
    const ids = [...new Set(cargadas.map((s) => s.pedida_por).filter((u): u is string => Boolean(u)))]
    return ids
      .map((id) => ({ valor: id, etiqueta: perfiles?.find((p) => p.id === id)?.nombre || '—' }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
  }, [cargadas, perfiles])
  const solicitantesOpc = [...new Set(cargadas.map(paraQuien))].sort((a, b) => a.localeCompare(b, 'es'))

  const todas = cargadas.filter(
    (s) => (!fUsuario || s.pedida_por === fUsuario) && (!fSolicitante || paraQuien(s) === fSolicitante),
  )
  const esperando = todas.filter((s) => ESPERAN.includes(s.estado))
  const alaVista = verTodas ? todas : esperando
  const detalle = detalleId !== null ? (cargadas.find((s) => s.id === detalleId) ?? null) : null

  const faltaDe = (s: SolicitudDeSalida) =>
    s.estado === 'PEDIDA'
      ? `Falta que la apruebe quien responde por ${s.almacen?.nombre ?? 'el almacén'} o quien tenga el permiso de aprobar salidas.`
      : s.estado === 'APROBADA'
        ? 'Aprobada. Falta que alguien de almacén la entregue: al entregarla sale la nota y se descuenta la existencia.'
        : null

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
      setFallo(enCastellano(e))
    }
  }

  /*
    LOS BOTONES DE UNA SOLICITUD, LOS DE SIEMPRE. Los usan la lista y el
    detalle del tablero; la lógica no se toca.
  */
  const botonesDe = (s: SolicitudDeSalida) => {
    const puedo = quePuedoHacerConLaSolicitud(s, comoApruebo, puedoSacar)
    return (
      <>
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
                { onError: (e) => setFallo(enCastellano(e)) },
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
          Orden {s.numero}
        </Button>

        {s.nota_salida ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<FileText />}
            onClick={() => {
              setFallo(null)
              void nota.abrir(s.nota_salida!, s.motivo)
            }}
          >
            Nota {s.nota_salida}
          </Button>
        ) : null}

        {s.nota_salida ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<MessageCircle />}
            onClick={() => setVerReporteSalida({ s, notaSalida: s.nota_salida! })}
          >
            Reporte
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
                onSuccess: (numero) => {
                  void nota.abrir(numero as string, s.motivo)
                  /*
                    `s` es la solicitud de antes de entregar, así que
                    su `entregada_por` todavía está en null — la base
                    recién lo escribió en esta misma llamada. Quien
                    entregó es, con certeza, quien tiene la sesión
                    abierta ahora mismo.
                  */
                  setAvisoEntrega({
                    s: { ...s, entregada_por: session?.user.id ?? s.entregada_por },
                    notaSalida: numero as string,
                  })
                },
                onError: (e) => setFallo(enCastellano(e)),
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
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Salidas"
        description="Solicitudes de salida de material de un almacén. Ninguna salida descuenta existencias hasta que la aprueba el responsable del almacén y el personal de almacén la entrega. Las ventas salen por Facturación › Notas de entrega; las compras se gestionan en Compras."
        actions={
          <>
            <Link to="/app/inventario/almacen/salida">
              <Button variant="ghost" icon={<Smartphone />}>
                Vista de teléfono
              </Button>
            </Link>
            <Button icon={<SendHorizontal />} onClick={() => setPidiendo(true)}>
              Solicitar salida
            </Button>
          </>
        }
      />

      <CabeceraSalidas alcance="salidas" vista={vista} />

      {avisoEntrega ? (
        <div className="border-success/30 bg-success-soft mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] border p-3.5">
          <p className="text-ink/80 flex items-center gap-2 text-sm">
            <PackageCheck className="text-success size-[18px] shrink-0" />
            <span>
              <strong className="font-semibold">Material entregado</strong> — el reporte para
              compartir ya está listo.
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              icon={<MessageCircle />}
              onClick={() => {
                setVerReporteSalida(avisoEntrega)
                setAvisoEntrega(null)
              }}
            >
              Ver reporte
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<X />}
              aria-label="Cerrar aviso"
              onClick={() => setAvisoEntrega(null)}
            />
          </div>
        </div>
      ) : null}

      {fallo ? <p className="text-danger mb-3 text-sm">{fallo}</p> : null}

      {vista === 'resumen' ? (
        <ResumenSalidas />
      ) : isPending ? (
        <Cargando />
      ) : error ? (
        <ErrorDeCarga error={error} />
      ) : vista === 'historico' ? (
        /*
          El histórico se lleva lo que ya estaba filtrado en el tablero (MGG):
          llega por «📚 Ver las N anteriores» con la columna en la dirección.
        */
        <HistoricoSolicitudes
          key={parametros.toString()}
          sols={cargadas}
          inicial={{
            columna: parametros.get('columna') ?? undefined,
            usuario: parametros.get('usuario') ?? undefined,
            solicitante: parametros.get('solicitante') ?? undefined,
          }}
          nombreDe={nombreDe}
          paraQuien={paraQuien}
          onVer={(s) => setDetalleId(s.id)}
          topeAlcanzado={cargadas.length >= TOPE_TABLERO}
        />
      ) : (
        <>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-ink/85 font-titular text-lg">Solicitudes de salida</h2>
            <Ayuda>
              <p className="text-ink/45 text-xs">
                Toda salida pasa por solicitud. Las salidas directas están en «Historial».
              </p>
            </Ayuda>
          </div>

          {/* Se dice, en vez de dejar que lo descubra buscando un botón que no está. */}
          {comoApruebo?.restringida ? (
            <p className="text-ink/60 mb-3 text-sm">
              Aprobar salidas se le restringió: puede solicitarlas y cancelar las suyas, y las aprueba
              quien tenga ese permiso.
            </p>
          ) : null}

          {/* Filtros encima del tablero (MGG) y el conmutador «▦ Kanban / ☰ Lista». */}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Select
              label="👤 Usuario (quien la hizo)"
              vacio="Todos"
              className="w-full sm:w-56"
              value={fUsuario}
              onChange={(e) => setFUsuario(e.target.value)}
              opciones={usuariosOpc}
            />
            <Select
              label="🏷 Solicitante"
              vacio="Todos"
              className="w-full sm:w-64"
              value={fSolicitante}
              onChange={(e) => setFSolicitante(e.target.value)}
              opciones={solicitantesOpc.map((x) => ({ valor: x, etiqueta: x }))}
            />
            {fUsuario || fSolicitante ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFUsuario('')
                  setFSolicitante('')
                }}
              >
                ✕ Limpiar
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-ink/50 text-xs">
                {todas.length} de {cargadas.length} solicitud(es)
              </span>
              <Segmento
                valor={modo}
                onCambio={(v) => {
                  const m = v === 'lista' ? 'lista' : 'kanban'
                  setModo(m)
                  guardarModo(CLAVE_MODO, m)
                }}
                opciones={[
                  { valor: 'kanban', etiqueta: '▦ Kanban', pista: 'Tablero por estado' },
                  { valor: 'lista', etiqueta: '☰ Lista', pista: 'La lista de tarjetas, con sus botones' },
                ]}
              />
            </div>
          </div>

          {modo === 'kanban' ? (
            <Tablero
              items={todas}
              columnas={COLUMNAS_SALIDA}
              claveLocal="salidas.tablero.ocultas"
              claveDe={(s) => s.id}
              vacio="No hay solicitudes en esta vista. Creá una con el botón de arriba."
              onVerAnteriores={(columna) => {
                const q = new URLSearchParams({ vista: 'historico', columna })
                if (fUsuario) q.set('usuario', fUsuario)
                if (fSolicitante) q.set('solicitante', fSolicitante)
                void navegar(`/app/salidas/solicitudes?${q.toString()}`)
              }}
              tarjeta={(s) => (
                <TarjetaSalida
                  s={s}
                  hizo={nombreDe(s.pedida_por)}
                  paraQuien={paraQuien(s)}
                  onAbrir={() => setDetalleId(s.id)}
                />
              )}
            />
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant={verTodas ? 'ghost' : 'soft'} onClick={() => setVerTodas(false)}>
                  Esperan{solicitudes ? ` (${esperando.length})` : ''}
                </Button>
                <Button size="sm" variant={verTodas ? 'soft' : 'ghost'} onClick={() => setVerTodas(true)}>
                  Todas
                </Button>
              </div>

              {solicitudes && alaVista.length === 0 ? (
                <Card>
                  <Vacio
                    icono={<ClipboardList />}
                    titulo={verTodas ? 'Sin solicitudes' : 'Sin solicitudes pendientes'}
                    descripcion={
                      verTodas
                        ? 'Las solicitudes de salida aparecen aquí antes de su entrega.'
                        : 'Ninguna solicitud está pendiente de aprobación ni de entrega. Las cerradas están en «Todas».'
                    }
                  />
                </Card>
              ) : null}

              <div className="space-y-3">
                {alaVista.map((s) => {
                  const estado = ESTADO_DE_SOLICITUD[s.estado]
                  const falta = faltaDe(s)

                  return (
                    <Card key={s.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ink/70 tabular font-mono text-xs">
                              Orden {s.numero}
                            </span>
                            <Chip tone={estado.tono}>{estado.texto}</Chip>
                          </div>

                          {/*
                            LA NOTA QUE SALIÓ DE ESTA ORDEN, DICHA ENTERA. Decía «nota
                            NS-2026-0010» en letra de código al lado del número, y
                            Christopher: «no se está apreciando su correlación».
                          */}
                          {s.nota_salida ? (
                            <p className="text-ink/60 mt-1 text-xs">
                              Se entregó con la nota de salida{' '}
                              <span className="tabular text-ink/80 font-mono">{s.nota_salida}</span>
                              {s.entregada_en ? ` · ${fechaHora(s.entregada_en)}` : ''}
                            </p>
                          ) : null}

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
                              ? ` · ${s.estado === 'RECHAZADA' ? 'la rechazó' : 'la aprobó'} ${nombreDe(s.aprobada_por)}`
                              : ''}
                            {s.aprobada_de_respaldo ? ' (de respaldo)' : ''}
                            {s.entregada_en ? ` · la entregó ${nombreDe(s.entregada_por)}` : ''}
                          </p>

                          {s.cierre_motivo ? (
                            <p className="text-ink/55 mt-1 text-xs italic">{s.cierre_motivo}</p>
                          ) : null}

                          {falta ? <p className="text-warning mt-1 text-xs">{falta}</p> : null}

                          <FotosDeCarga
                            origen="SALIDA"
                            referencia={s.numero}
                            puedeAnadir={puedoSacar && s.estado !== 'RECHAZADA' && s.estado !== 'CANCELADA'}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">{botonesDe(s)}</div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/*
        «Solicitud {numero}» (MGG `SolicitudDetalleModal`): los datos, los
        materiales y el historial, con los botones de siempre al pie. Un botón
        que abre otra ventana (aprobar con firma, no aprobar, cancelar, la orden
        o la nota) cierra esta primero, para no apilar dos ventanas.
      */}
      {detalle ? (
        <Modal
          abierto
          onCerrar={() => setDetalleId(null)}
          titulo={`Solicitud ${detalle.numero}`}
          ancho="lg"
          acciones={
            <div
              className="flex flex-wrap items-center justify-end gap-2"
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest('button')) setDetalleId(null)
              }}
            >
              {botonesDe(detalle)}
              <Button variant="ghost" onClick={() => setDetalleId(null)}>
                Cerrar
              </Button>
            </div>
          }
        >
          <DetalleSolicitud
            s={detalle}
            nombreDe={nombreDe}
            paraQuien={paraQuien(detalle)}
            aviso={faltaDe(detalle)}
            puedeAnadirFotos={puedoSacar && detalle.estado !== 'RECHAZADA' && detalle.estado !== 'CANCELADA'}
          />
        </Modal>
      ) : null}

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
        onRegistrada={(_numero, _motivo, aviso) => {
          setPidiendo(false)
          setDesdeFila({})
          if (aviso) setFallo(aviso)
        }}
      />

      {cerrando ? (
        <Modal
          abierto
          onCerrar={() => setCerrando(null)}
          titulo={cerrando.como === 'RECHAZAR' ? 'No aprobar la solicitud' : 'Cancelar la solicitud'}
          descripcion={
            cerrando.como === 'RECHAZAR'
              ? 'Lo lee quien la pidió.'
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
            label="Motivo"
            rows={3}
            autoFocus
            maxLength={500}
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
          descripcion="Su nombre va en «Autorizado por» de la orden y de la nota que salga al entregarla."
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
                        setFallo(enCastellano(e))
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
                Sin marcar, la raya sale en blanco con su nombre debajo.
              </span>
            </span>
          </label>
        </Modal>
      ) : null}

      {nota.visor}

      {verReporteSalida ? (
        <ModalReporteSalida
          s={verReporteSalida.s}
          numeroNota={verReporteSalida.notaSalida}
          razonSocial={empresa?.razon_social ?? ''}
          destino={paraQuien(verReporteSalida.s)}
          camiones={verReporteSalida.s.vehiculo ? [{ vehiculo: verReporteSalida.s.vehiculo, chofer: null }] : []}
          pedidoPor={nombreDe(verReporteSalida.s.pedida_por)}
          aprobadoPor={nombreDe(verReporteSalida.s.aprobada_por)}
          entregadoPor={nombreDe(verReporteSalida.s.entregada_por)}
          onCerrar={() => setVerReporteSalida(null)}
        />
      ) : null}
    </>
  )
}
