import { useMemo, useState } from 'react'
import { ArrowRight, FileText, MoveRight, PackageCheck, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisRoles } from '@/lib/api/catalogo'
import {
  ESTADO_TRASLADO,
  quePuedoHacer,
  useAceptarTraslado,
  useCancelarTraslado,
  useComoActuoEnTraslados,
  useRecibirTraslado,
  useTraslados,
} from '@/lib/api/inventario'
import type { Traslado } from '@/lib/api/inventario'
import { fechaHora } from '@/lib/formato'
import { ModalTraslado } from './ModalTraslado'
import { useNotaDeTraslado } from './NotaDeTraslado'

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
*/
export function Transferencias() {
  const { puede } = useMisRoles()
  const { data: traslados, isPending, error: fallo } = useTraslados()
  const { data: yo } = useComoActuoEnTraslados()
  const aceptar = useAceptarTraslado()
  const recibir = useRecibirTraslado()
  const cancelar = useCancelarTraslado()
  const nota = useNotaDeTraslado()

  const [abierto, setAbierto] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const [error, setError] = useState('')
  const [enCurso, setEnCurso] = useState<number | null>(null)
  const [cancelando, setCancelando] = useState<Traslado | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorAlCancelar, setErrorAlCancelar] = useState('')

  const pendientes = useMemo(
    () => (traslados ?? []).filter((t) => t.estado === 'SOLICITUD' || t.estado === 'ACEPTADA'),
    [traslados],
  )
  const lista = verTodos ? (traslados ?? []) : pendientes

  const darPaso = async (t: Traslado, paso: 'aceptar' | 'recibir') => {
    setError('')
    setEnCurso(t.id)
    try {
      if (paso === 'aceptar') {
        await aceptar.mutateAsync(t.id)
        // Al aceptar sale el material, y el papel viaja con él.
        void nota.abrirTraslado(t.id)
      } else {
        await recibir.mutateAsync(t.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCurso(null)
    }
  }

  const confirmarCancelacion = async () => {
    if (!cancelando) return
    setErrorAlCancelar('')
    try {
      await cancelar.mutateAsync({ id: cancelando.id, motivo: motivo.trim() })
      setCancelando(null)
      setMotivo('')
    } catch (e) {
      setErrorAlCancelar(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <PageHeader
        title="Transferencias"
        description="Material que cambia de sitio. Se pide, lo acepta quien responde por el sitio de donde sale y lo recibe quien responde por el de destino."
        actions={
          puede('ALMACEN') ? (
            <Button icon={<MoveRight className="size-[18px]" />} onClick={() => setAbierto(true)}>
              Nuevo traslado
            </Button>
          ) : null
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={verTodos ? 'ghost' : 'soft'} onClick={() => setVerTodos(false)}>
          Pendientes{traslados ? ` (${pendientes.length})` : ''}
        </Button>
        <Button size="sm" variant={verTodos ? 'soft' : 'ghost'} onClick={() => setVerTodos(true)}>
          Todos
        </Button>
      </div>

      {error ? <p className="text-danger mb-3 text-sm">{error}</p> : null}

      {isPending ? (
        <Cargando />
      ) : fallo ? (
        <ErrorDeCarga error={fallo} />
      ) : lista.length === 0 ? (
        <Vacio
          icono={<MoveRight className="size-6" />}
          titulo={verTodos ? 'Todavía no se ha movido nada de sitio' : 'No hay traslados pendientes'}
          descripcion={
            verTodos
              ? 'Cuando alguien pida mover material de un sitio a otro, el traslado queda aquí con cada uno de sus pasos.'
              : 'Nada espera a que lo acepten ni va de camino. Lo terminado está en «Todos».'
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
                <th className="px-4 py-3 font-medium">Último paso</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-ink/8 divide-y">
              {lista.map((t) => {
                const puedo = quePuedoHacer(t, yo)
                const estado = ESTADO_TRASLADO[t.estado]
                const paso = ultimoPaso(t)
                const ocupado = enCurso === t.id
                return (
                  <tr key={t.id} className="hover:bg-ink/3 align-top">
                    <td className="px-4 py-3">
                      <span className="text-ink/70 tabular block font-mono text-xs">{t.numero}</span>
                      <div className="mt-1">
                        <Chip tone={estado.tono}>{estado.texto}</Chip>
                      </div>
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
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {puedo.aceptar ? (
                        <Button
                          size="sm"
                          icon={<MoveRight className="size-4" />}
                          disabled={ocupado}
                          onClick={() => void darPaso(t, 'aceptar')}
                        >
                          {ocupado ? 'Aceptando…' : 'Aceptar'}
                        </Button>
                      ) : null}
                      {puedo.recibir ? (
                        <Button
                          size="sm"
                          icon={<PackageCheck className="size-4" />}
                          disabled={ocupado}
                          onClick={() => void darPaso(t, 'recibir')}
                        >
                          {ocupado ? 'Recibiendo…' : 'Recibir'}
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <ModalTraslado
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        // En el acto el material ya se movió y su papel sale al momento.
        onTrasladado={(t) => {
          if (t.inmediato) void nota.abrirTraslado(t.id)
        }}
      />

      {nota.visor}

      <Modal
        abierto={cancelando !== null}
        onCerrar={() => setCancelando(null)}
        titulo={`Cancelar ${cancelando?.numero ?? ''}`}
        descripcion={
          cancelando?.estado === 'ACEPTADA'
            ? `El material ya salió de ${cancelando?.origen ?? 'su origen'}: al cancelar vuelve ahí, al mismo costo con el que salió.`
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
          label="Por qué se cancela"
          rows={2}
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

/** El último paso, dicho como pasó: quién y cuándo. */
function ultimoPaso(t: Traslado): { quien: string; cuando: string | null } {
  const deRespaldo = (v: boolean | null) => (v ? ' (administración)' : '')
  switch (t.estado) {
    case 'SOLICITUD':
      return { quien: `Pedido por ${t.solicitado_por_nombre ?? '—'}`, cuando: t.solicitado_en }
    case 'ACEPTADA':
      return {
        quien: `Aceptado por ${t.aceptado_por_nombre ?? '—'}${deRespaldo(t.aceptado_de_respaldo)}`,
        cuando: t.aceptado_en,
      }
    case 'RECIBIDA':
      return t.inmediato
        ? { quien: `En el acto, por ${t.recibido_por_nombre ?? '—'}`, cuando: t.recibido_en }
        : {
            quien: `Recibido por ${t.recibido_por_nombre ?? '—'}${deRespaldo(t.recibido_de_respaldo)}`,
            cuando: t.recibido_en,
          }
    default:
      return { quien: `Cancelado por ${t.cancelado_por_nombre ?? '—'}`, cuando: t.cancelado_en }
  }
}
