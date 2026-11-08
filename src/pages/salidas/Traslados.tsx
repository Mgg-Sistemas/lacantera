import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowRight, FileText, MoveRight, PackageCheck, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Segmento } from '@/components/ui/Segmento'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMiFirma } from '@/lib/api/firmas'
import {
  ESTADO_TRASLADO,
  FORMA_DE_TRASLADO,
  formaDelTraslado,
  queFaltaAlTraslado,
  quePuedoHacer,
  useAceptarTraslado,
  useCancelarTraslado,
  useComoActuoEnTraslados,
  useRecibirTraslado,
  useTraslados,
} from '@/lib/api/inventario'
import type { Traslado } from '@/lib/api/inventario'
import { fechaHora } from '@/lib/formato'
/*
  El modal de pedir un traslado se quedó en Inventario: se abre desde una fila
  de Existencias, que es donde está el material. Cuando el formulario de sacar
  se mude aquí, se muda con él.
*/
import { ModalTraslado } from '@/pages/inventario/ModalTraslado'
import { useNotaDeTraslado } from './NotaDeTraslado'
import { enCastellano } from '@/lib/castellano'
import { CabeceraSalidas } from './CabeceraSalidas'
import { Tablero } from './Tablero'
import { DetalleTraslado, TarjetaTraslado } from './TarjetasSalidas'
import { HistoricoTraslados } from './Historicos'
import {
  COLUMNAS_TRASLADO,
  guardarModo,
  leerModo,
  ultimoPasoDeTraslado,
  type ModoTablero,
} from './tableroSalidas'

/*
  COMO MGG (FASE 5), 08/11/2026.

  La misma cabecera de Salidas («↘ Salidas / ↔ Traslados» y «🗂 Solicitudes /
  📚 Histórico / 📜 Historial»), y en «🗂 Solicitudes» el tablero de MGG con
  los cuatro pasos de aquí: «Solicitado» (SOLICITUD) · «En tránsito»
  (ACEPTADA) · «Recibido» (RECIBIDA) · «Cancelado» (CANCELADA). La tabla de
  antes sigue a un clic («☰ Lista»). La tarjeta abre el traslado con su
  historial y LOS MISMOS botones de la tabla (`botonesDe`): aprobar y enviar,
  confirmar llegada, la nota y cancelar no cambian.
*/
const TOPE_TABLERO = 300
const CLAVE_MODO = 'salidas.traslados.modo'

/*
  MATERIAL QUE CAMBIA DE SITIO, PASO A PASO.

  Hasta el 15/09/2026 un traslado nacía y terminaba en el mismo instante: dos
  movimientos hermanos y un «Deshacer». Christopher pidió que pase por
  solicitud, aceptada y recibida, y con eso la pantalla deja de listar
  movimientos y lista traslados: cada uno con su número, su paso y lo que le
  toca hacer a quien la mira.

  LOS BOTONES SON DE QUIEN PUEDE. «Aceptar» lo ve quien responde por el sitio de
  donde sale, «Recibir» quien responde por el de destino, y los dos
  administración. Ofrecerlos a todos sería enseñar puertas que la base cierra.

  PENDIENTES PRIMERO. Lo que espera a alguien es lo que se viene a buscar aquí;
  lo terminado se consulta, y va en «Todos».

  YA NO HAY «DESHACER». Lo pedido o lo que va de camino se cancela —y si ya
  salió, vuelve—; lo recibido se devuelve con un traslado de vuelta, que deja
  escrito que hubo ida y vuelta.

  CADA FILA DICE CÓMO NACIÓ Y QUÉ LE FALTA. Christopher, 16/09/2026: «necesitamos
  no dejar asumir al usuario, mantener lo explícito como norma». Un «Por
  aceptar» a secas obligaba a saber de memoria quién acepta; ahora la fila dice
  si fue pedido, enviado o directo, y qué falta y a quién le toca.

  LA FIRMA SE ELIGE AL DAR EL PASO. Quien envía dice si su firma va en «Envió»
  de la nota —marcado de entrada: enviar es autorizar que salga—, y quien
  confirma la llegada, si va en «Recibió», sin marcar. A quien no tiene firma
  encendida no se le pregunta nada: su raya sale en blanco con su nombre.
*/
export function Traslados() {
  const { puede } = useMisPermisos()
  const { data: traslados, isPending, error: fallo } = useTraslados()
  const { data: yo } = useComoActuoEnTraslados()
  const aceptar = useAceptarTraslado()
  const recibir = useRecibirTraslado()
  const cancelar = useCancelarTraslado()
  const nota = useNotaDeTraslado()
  const { data: miFirma } = useMiFirma()
  const tengoFirma = miFirma?.usar === true

  const [abierto, setAbierto] = useState(false)
  const [firmando, setFirmando] = useState<{ t: Traslado; paso: 'aceptar' | 'recibir' } | null>(
    null,
  )
  const [conMiFirma, setConMiFirma] = useState(true)
  const [verTodos, setVerTodos] = useState(false)
  const [error, setError] = useState('')
  const [enCurso, setEnCurso] = useState<number | null>(null)
  const [cancelando, setCancelando] = useState<Traslado | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorAlCancelar, setErrorAlCancelar] = useState('')

  const [parametros] = useSearchParams()
  const navegar = useNavigate()
  const vista = parametros.get('vista') === 'historico' ? 'historico' : 'solicitudes'
  const [modo, setModo] = useState<ModoTablero>(() => leerModo(CLAVE_MODO))
  const [fUsuario, setFUsuario] = useState('')
  const [fDestino, setFDestino] = useState('')
  const [detalleId, setDetalleId] = useState<number | null>(null)

  const cargados = useMemo(() => traslados ?? [], [traslados])
  const usuariosOpc = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of cargados) if (t.solicitado_por) m.set(t.solicitado_por, t.solicitado_por_nombre ?? '—')
    return [...m.entries()]
      .map(([valor, etiqueta]) => ({ valor, etiqueta }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
  }, [cargados])
  const destinosOpc = [...new Set(cargados.map((t) => t.destino ?? '—'))].sort((a, b) => a.localeCompare(b, 'es'))
  const filtrados = cargados.filter(
    (t) => (!fUsuario || t.solicitado_por === fUsuario) && (!fDestino || (t.destino ?? '—') === fDestino),
  )
  const detalle = detalleId !== null ? (cargados.find((t) => t.id === detalleId) ?? null) : null

  const pendientes = filtrados.filter((t) => t.estado === 'SOLICITUD' || t.estado === 'ACEPTADA')
  const lista = verTodos ? filtrados : pendientes

  const darPaso = async (t: Traslado, paso: 'aceptar' | 'recibir', conFirma: boolean) => {
    setError('')
    setEnCurso(t.id)
    try {
      if (paso === 'aceptar') {
        await aceptar.mutateAsync({ id: t.id, con_firma: conFirma })
        // Al aceptar sale el material, y el papel viaja con él.
        void nota.abrirTraslado(t.id)
      } else {
        await recibir.mutateAsync({ id: t.id, con_firma: conFirma })
      }
    } catch (e) {
      setError(enCastellano(e))
    } finally {
      setEnCurso(null)
    }
  }

  /* Con firma encendida se pregunta antes; sin ella, el paso se da y la raya sale en blanco. */
  const pedirPaso = (t: Traslado, paso: 'aceptar' | 'recibir') => {
    if (tengoFirma) {
      setConMiFirma(paso === 'aceptar')
      setFirmando({ t, paso })
      return
    }
    void darPaso(t, paso, false)
  }

  const confirmarCancelacion = async () => {
    if (!cancelando) return
    setErrorAlCancelar('')
    try {
      await cancelar.mutateAsync({ id: cancelando.id, motivo: motivo.trim() })
      setCancelando(null)
      setMotivo('')
    } catch (e) {
      setErrorAlCancelar(enCastellano(e))
    }
  }

  /*
    LOS BOTONES DE UN TRASLADO, LOS DE SIEMPRE. Los usan la tabla y el detalle
    del tablero; la lógica no se toca.
  */
  const botonesDe = (t: Traslado) => {
    const puedo = quePuedoHacer(t, yo)
    const ocupado = enCurso === t.id
    return (
      <>
        {puedo.aceptar ? (
          <Button
            size="sm"
            icon={<MoveRight className="size-4" />}
            disabled={ocupado}
            onClick={() => pedirPaso(t, 'aceptar')}
          >
            {ocupado ? 'Enviando…' : 'Aprobar y enviar'}
          </Button>
        ) : null}
        {puedo.recibir ? (
          <Button
            size="sm"
            icon={<PackageCheck className="size-4" />}
            disabled={ocupado}
            onClick={() => pedirPaso(t, 'recibir')}
          >
            {ocupado ? 'Confirmando…' : 'Confirmar llegada'}
          </Button>
        ) : null}
        {/* La nota existe desde que el material sale: una solicitud
            todavía no ha movido nada que acompañar con un papel. */}
        {t.mov_salida ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<FileText className="size-4" />}
            disabled={nota.armando === t.id}
            onClick={() => void nota.abrirTraslado(t.id)}
          >
            {nota.armando === t.id ? 'Armando…' : 'Nota'}
          </Button>
        ) : null}
        {puedo.cancelar ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="size-4" />}
            disabled={ocupado}
            onClick={() => {
              setCancelando(t)
              setMotivo('')
              setErrorAlCancelar('')
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
        title="Traslados"
        description="Traslados de material entre almacenes: solicitados, enviados o directos. Cada fila indica lo pendiente y a quién le corresponde."
        actions={
          puede('SALIDAS', 'ESCRITURA') ? (
            <Button icon={<MoveRight className="size-[18px]" />} onClick={() => setAbierto(true)}>
              Nuevo traslado
            </Button>
          ) : null
        }
      />

      <CabeceraSalidas alcance="traslados" vista={vista} />

      {error ? <p className="text-danger mb-3 text-sm">{error}</p> : null}

      {vista === 'historico' ? (
        isPending ? (
          <Cargando />
        ) : fallo ? (
          <ErrorDeCarga error={fallo} />
        ) : (
          <HistoricoTraslados
            key={parametros.toString()}
            traslados={cargados}
            inicial={{
              columna: parametros.get('columna') ?? undefined,
              usuario: parametros.get('usuario') ?? undefined,
              solicitante: parametros.get('destino') ?? undefined,
            }}
            onVer={(t) => setDetalleId(t.id)}
            topeAlcanzado={cargados.length >= TOPE_TABLERO}
          />
        )
      ) : (
        <>
          {/* Filtros encima del tablero (MGG) y el conmutador «▦ Kanban / ☰ Lista». */}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Select
              label="👤 Usuario (quien lo pidió)"
              vacio="Todos"
              className="w-full sm:w-56"
              value={fUsuario}
              onChange={(e) => setFUsuario(e.target.value)}
              opciones={usuariosOpc}
            />
            <Select
              label="🏬 Almacén destino"
              vacio="Todos"
              className="w-full sm:w-56"
              value={fDestino}
              onChange={(e) => setFDestino(e.target.value)}
              opciones={destinosOpc.map((x) => ({ valor: x, etiqueta: x }))}
            />
            {fUsuario || fDestino ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFUsuario('')
                  setFDestino('')
                }}
              >
                ✕ Limpiar
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-ink/50 text-xs">
                {filtrados.length} de {cargados.length} traslado(s)
              </span>
              <Segmento
                valor={modo}
                onCambio={(v) => {
                  const m = v === 'lista' ? 'lista' : 'kanban'
                  setModo(m)
                  guardarModo(CLAVE_MODO, m)
                }}
                opciones={[
                  { valor: 'kanban', etiqueta: '▦ Kanban', pista: 'Tablero por paso' },
                  { valor: 'lista', etiqueta: '☰ Lista', pista: 'La tabla de traslados, con sus botones' },
                ]}
              />
            </div>
          </div>

          {modo === 'kanban' ? (
            isPending ? (
              <Cargando />
            ) : fallo ? (
              <ErrorDeCarga error={fallo} />
            ) : (
              <Tablero
                items={filtrados}
                columnas={COLUMNAS_TRASLADO}
                claveLocal="salidas.traslados.tablero.ocultas"
                claveDe={(t) => t.id}
                vacio="No hay traslados en esta vista. Creá uno con el botón de arriba."
                onVerAnteriores={(columna) => {
                  const q = new URLSearchParams({ vista: 'historico', columna })
                  if (fUsuario) q.set('usuario', fUsuario)
                  if (fDestino) q.set('destino', fDestino)
                  void navegar(`/app/salidas/traslados?${q.toString()}`)
                }}
                tarjeta={(t) => <TarjetaTraslado t={t} onAbrir={() => setDetalleId(t.id)} />}
              />
            )
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Button size="sm" variant={verTodos ? 'ghost' : 'soft'} onClick={() => setVerTodos(false)}>
                  Pendientes{traslados ? ` (${pendientes.length})` : ''}
                </Button>
                <Button size="sm" variant={verTodos ? 'soft' : 'ghost'} onClick={() => setVerTodos(true)}>
                  Todos
                </Button>
              </div>


              {isPending ? (
                <Cargando />
              ) : fallo ? (
                <ErrorDeCarga error={fallo} />
              ) : lista.length === 0 ? (
                <Vacio
                  icono={<MoveRight className="size-6" />}
                  titulo={verTodos ? 'Sin traslados registrados' : 'Sin traslados pendientes'}
                  descripcion={
                    verTodos
                      ? 'Cada traslado solicitado, enviado o directo se registra aquí con sus etapas.'
                      : 'Ningún traslado está pendiente de envío ni en tránsito. Los finalizados están en «Todos».'
                  }
                />
              ) : (
                <Card className="overflow-x-auto p-0">
                  <table className="w-full min-w-[60rem] text-sm">
                    <thead className="text-ink/50 border-ink/10 border-b text-left text-xs">
                      <tr>
                        <th className="px-4 py-3 font-medium">Traslado</th>
                        <th className="px-4 py-3 font-medium">Artículo</th>
                        <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                        <th className="px-4 py-3 font-medium">Recorrido</th>
                        <th className="px-4 py-3 font-medium">Seguimiento</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-ink/8 divide-y">
                      {lista.map((t) => {
                        const estado = ESTADO_TRASLADO[t.estado]
                        const paso = ultimoPasoDeTraslado(t)
                        const falta = queFaltaAlTraslado(t)
                        return (
                          <tr key={t.id} className="hover:bg-ink/3 align-top">
                            <td className="px-4 py-3">
                              <span className="text-ink/70 tabular block font-mono text-xs">{t.numero}</span>
                              <div className="mt-1">
                                <Chip tone={estado.tono}>{estado.texto}</Chip>
                              </div>
                              <span className="text-ink/45 mt-1 block text-2xs">
                                {FORMA_DE_TRASLADO[formaDelTraslado(t)].enLaLista}
                              </span>
                            </td>
                            <td className="text-ink/85 px-4 py-3">
                              {t.articulo ?? '—'}
                              <span className="text-ink/45 line-clamp-2 block text-xs">{t.motivo}</span>
                            </td>
                            <td className="tabular text-ink/85 px-4 py-3 text-right whitespace-nowrap">
                              {Number(t.cantidad).toLocaleString('es-VE')} {t.unidad}
                            </td>
                            <td className="text-ink/70 px-4 py-3">
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                {t.origen ?? '—'}
                                <ArrowRight className="text-ink/35 size-3.5" />
                                <span className="text-ink/85">{t.destino ?? '—'}</span>
                              </span>
                            </td>
                            <td className="text-ink/55 px-4 py-3 text-xs">
                              <span className="text-ink/70 block">{paso.quien}</span>
                              {paso.cuando ? fechaHora(paso.cuando) : null}
                              {t.estado === 'CANCELADA' && t.motivo_cancelacion ? (
                                <span className="text-ink/45 line-clamp-2 block">{t.motivo_cancelacion}</span>
                              ) : null}
                              {falta ? <span className="text-warning mt-1 block">{falta}</span> : null}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">{botonesDe(t)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/*
        El traslado abierto desde el tablero, con su historial y los botones de
        siempre. Un botón que abre otra ventana cierra esta primero.
      */}
      {detalle ? (
        <Modal
          abierto
          onCerrar={() => setDetalleId(null)}
          titulo={`Traslado ${detalle.numero}`}
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
          <DetalleTraslado t={detalle} />
        </Modal>
      ) : null}

      <ModalTraslado
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        // Enviado o directo, el material ya salió y su papel sale al momento.
        onTrasladado={(t) => {
          if (t.forma !== 'PEDIR') void nota.abrirTraslado(t.id)
        }}
      />

      {nota.visor}

      {firmando ? (
        <Modal
          abierto
          onCerrar={() => setFirmando(null)}
          titulo={
            firmando.paso === 'aceptar'
              ? `Aprobar y enviar ${firmando.t.numero}`
              : `Confirmar la llegada de ${firmando.t.numero}`
          }
          descripcion={
            firmando.paso === 'aceptar'
              ? `El material sale de ${firmando.t.origen ?? 'su origen'} y su nombre va en «Envió» de la nota de traslado.`
              : `El material entra en ${firmando.t.destino ?? 'su destino'} y su nombre va en «Recibió» de la nota de traslado.`
          }
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setFirmando(null)}>
                Volver
              </Button>
              <Button
                icon={
                  firmando.paso === 'aceptar' ? (
                    <MoveRight className="size-4" />
                  ) : (
                    <PackageCheck className="size-4" />
                  )
                }
                onClick={() => {
                  const { t, paso } = firmando
                  setFirmando(null)
                  void darPaso(t, paso, conMiFirma)
                }}
              >
                {firmando.paso === 'aceptar' ? 'Aprobar y enviar' : 'Confirmar llegada'}
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
              Poner mi firma digital en «{firmando.paso === 'aceptar' ? 'Envió' : 'Recibió'}»
              <span className="text-ink/50 mt-0.5 block text-xs">
                Sin marcar, la raya sale en blanco con su nombre debajo.
              </span>
            </span>
          </label>
        </Modal>
      ) : null}

      <Modal
        abierto={cancelando !== null}
        onCerrar={() => setCancelando(null)}
        titulo={`Cancelar ${cancelando?.numero ?? ''}`}
        descripcion={
          cancelando?.estado === 'ACEPTADA'
            ? `El material ya salió de ${cancelando?.origen ?? 'su origen'} y va en camino: al cancelar vuelve ahí, al mismo costo con el que salió.`
            : 'Todavía no se ha movido nada: se anula el pedido.'
        }
        ancho="sm"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setCancelando(null)}>
              Volver
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmarCancelacion()}
              disabled={motivo.trim().length < 4 || cancelar.isPending}
            >
              {cancelar.isPending ? 'Cancelando…' : 'Cancelar el traslado'}
            </Button>
          </>
        }
      >
        <Textarea
          label="Motivo"
          rows={2}
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <p className="text-ink/55 mt-3 text-xs">
          No se borra nada: el traslado queda cancelado con su motivo, y si el material ya había
          salido, su vuelta queda escrita en el libro.
        </p>
        {errorAlCancelar ? <p className="text-danger mt-3 text-sm">{errorAlCancelar}</p> : null}
      </Modal>
    </>
  )
}
