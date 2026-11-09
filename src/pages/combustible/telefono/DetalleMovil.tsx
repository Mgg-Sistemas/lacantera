import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando } from '@/components/ui/Estado'
import { FotosDeCarga } from '@/components/FotosDeCarga'
import {
  useAnularMovimientoCombustible,
  useMarcarCuaderno,
  useMotivosDespacho,
  useMovimientoLibro,
} from '@/lib/api/combustible'
import { referenciaDeFotos } from '@/lib/api/combustibleTelefono'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { fechaHora, tasa } from '@/lib/formato'
import { horaParaLeer } from '@/lib/combustible/horaMovimiento'
import { horasTrabajadas } from '@/lib/combustible/medidores'
import { fechaCorta, mensajeMovimiento } from '@/lib/combustible/mensajeMovimiento'
import { cuenta, type MovimientoLibro } from '@/lib/combustible/tipos'
import { CompartirWhatsapp } from '@/pages/inventario/telefono/piezas'
import { ICONO, NOMBRE_TIPO, litros } from './comun'
import { Aviso, Fila, Rotulo } from './piezas'

/*
  EL DETALLE DE UN MOVIMIENTO EN EL TELÉFONO (Golden Touch, `DetalleMovil`).

  Arriba el aviso para WhatsApp —el que surte lo manda al grupo apenas
  carga—, después los datos, el «📖 Registro Cuaderno» que se cambia con un
  toque, y las fotos.

  «🗑 ELIMINAR» DE GOLDEN TOUCH ES «ANULAR» AQUÍ (decisión de la dueña): el
  libro no se borra. Se pide el motivo, el combustible vuelve con un REVERSO y
  el renglón queda a la vista, tachado. Los litros, el equipo, la hora y los
  medidores se corrigen desde la PC.
*/

const num = (v: string | number | null | undefined) => (v == null ? '—' : litros(v))

/** En la llegada de un traslado, el aviso se cuenta desde el tanque de donde salió. */
function paraElMensaje(m: MovimientoLibro): MovimientoLibro {
  if (m.tipo !== 'traslado' || m.signo !== 1 || !m.tanque_destino) return m
  return { ...m, tanque: m.tanque_destino, tanque_destino: m.tanque }
}

export function DetalleMovil({
  id,
  inicial,
  avisoFotos,
  puedeEscribir,
  soloTelefono,
  onCerrar,
}: {
  id: number
  /** El renglón de la lista, para pintar sin esperar; se refresca con el del libro. */
  inicial?: MovimientoLibro | null
  /** Si las fotos no subieron al guardar, se dice aquí. */
  avisoFotos?: string | null
  puedeEscribir: boolean
  soloTelefono: boolean
  onCerrar: () => void
}) {
  const navegar = useNavigate()
  const consulta = useMovimientoLibro(id)
  const motivos = useMotivosDespacho(true)
  const anular = useAnularMovimientoCombustible()
  const marcarCuaderno = useMarcarCuaderno()
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const mov = consulta.data ?? inicial ?? null
  const titulo = mov
    ? `${ICONO[mov.tipo]} ${NOMBRE_TIPO[mov.tipo]} · ${litros(mov.litros)} L${mov.anulado ? ' · anulado' : ''}`
    : 'Movimiento'

  const puedeAnular = puedeEscribir && !!mov && cuenta(mov) && mov.tipo !== 'ajuste'
  const motivoNombre = mov?.motivo ? (motivos.data ?? []).find((m) => m.codigo === mov.motivo)?.nombre : null

  const hacerAnular = () => {
    if (!mov) return
    anular.mutate(
      { movimiento_id: mov.id, motivo: motivo.trim() },
      {
        onSuccess: () => {
          toast('Movimiento anulado: el combustible volvió con su reverso', 'success')
          setConfirmando(false)
          setMotivo('')
        },
        onError: (e) => toast(mensajeDe(e, 'No se pudo anular'), 'error'),
      },
    )
  }

  const cambiarCuaderno = () => {
    if (!mov) return
    const nuevo = !mov.registrado_en_cuaderno
    marcarCuaderno.mutate(
      { movimiento_id: mov.id, cuaderno: nuevo, litros: nuevo ? Number(mov.cuaderno_litros ?? mov.litros) : null },
      {
        onSuccess: () =>
          toast(nuevo ? 'Marcado como registrado en cuaderno' : 'Marcado como no registrado', 'success'),
        onError: (e) => toast(mensajeDe(e, 'No se pudo actualizar'), 'error'),
      },
    )
  }

  const horas = mov ? (mov.horas_utilizadas ?? horasTrabajadas(mov.horometro_ini, mov.horometro_fin)) : null
  const otroTanque =
    mov?.tipo === 'traslado' && mov.tanque_destino
      ? [mov.signo === -1 ? 'A qué tanque' : 'Desde qué tanque', mov.tanque_destino]
      : null

  return (
    <Modal
      abierto
      onCerrar={() => {
        if (!anular.isPending) onCerrar()
      }}
      titulo={titulo}
      ancho="md"
      acciones={
        <div className="grid w-full gap-2">
          {puedeAnular && !confirmando ? (
            <Button variant="danger" size="lg" className="h-14 w-full" onClick={() => setConfirmando(true)}>
              ❌ Anular
            </Button>
          ) : null}
          {!soloTelefono ? (
            <Button
              variant="outline"
              size="lg"
              className="h-14 w-full"
              onClick={() => {
                onCerrar()
                void navegar('/app/combustible')
              }}
            >
              🖥 Corregir en la PC
            </Button>
          ) : null}
          <Button size="lg" className="h-14 w-full" onClick={onCerrar} disabled={anular.isPending}>
            Cerrar
          </Button>
        </div>
      }
    >
      {!mov ? (
        <Cargando />
      ) : (
        <div className="space-y-3">
          {avisoFotos ? (
            <Aviso tono="alerta" icono="📷">
              {avisoFotos}
            </Aviso>
          ) : null}
          {mov.anulado ? (
            <Aviso tono="peligro" icono="❌">
              <strong>Anulado.</strong> {mov.anulado_motivo ?? ''} El combustible volvió al tanque con su reverso; el
              renglón queda en el libro, tachado.
            </Aviso>
          ) : null}

          {/* El que surte manda el aviso al grupo apenas carga el surtido. */}
          {!mov.anulado && mov.tipo !== 'reverso' ? (
            <div className="border-hairline bg-ink/3 rounded-card space-y-2 border p-3">
              <CompartirWhatsapp
                texto={mensajeMovimiento({
                  mov: paraElMensaje(mov),
                  motivoNombre,
                  registradoPor: mov.actor_name,
                })}
              />
            </div>
          ) : null}

          <div className="flex flex-col">
            <Fila k="Tanque" v={mov.tanque} />
            <Fila k={mov.vale_numero ? 'Vale' : 'Movimiento'} v={mov.vale_numero ?? mov.numero} />
            <Fila
              k="Fecha"
              v={`${fechaCorta(mov.fecha)}${mov.hora ? ` · ${horaParaLeer(mov.hora)}` : ''}`}
            />
            {mov.tipo !== 'traslado' ? <Fila k="Equipo" v={mov.equipo} /> : null}
            {otroTanque ? <Fila k={otroTanque[0]} v={otroTanque[1]} /> : null}
            <Fila k="Recibió" v={mov.recibio} />
            <Fila
              k="Para qué"
              v={
                motivoNombre || mov.motivo
                  ? `${motivoNombre ?? mov.motivo}${mov.motivo_detalle ? ` · ${mov.motivo_detalle}` : ''}`
                  : null
              }
            />
            <Fila k="Autorizado por" v={mov.autorizado_por} />
            <Fila k="Destino / mina" v={mov.ubicacion} />
            <Fila k="Observación" v={mov.observacion} />
            {mov.tipo === 'entrada' ? (
              <Fila
                k="Costo por litro"
                v={mov.sin_costo ? 'sin costo' : mov.tasa_usd_litro != null ? `$ ${tasa(mov.tasa_usd_litro)}` : null}
              />
            ) : null}
            <Fila
              k="Contador"
              v={
                mov.contador_global_ini != null || mov.contador_global_fin != null
                  ? `${num(mov.contador_global_ini)} → ${num(mov.contador_global_fin)}`
                  : null
              }
            />
            <Fila
              k="Horómetro"
              v={
                mov.horometro_ini != null || mov.horometro_fin != null
                  ? `${num(mov.horometro_ini)} → ${num(mov.horometro_fin)}`
                  : null
              }
            />
            <Fila k="Horas trabajadas" v={horas != null ? `${litros(horas)} h` : null} />
            <Fila k="Kilometraje" v={mov.kilometraje != null ? litros(mov.kilometraje) : null} />
            <div className="border-hairline flex items-center justify-between gap-3 border-b py-2">
              <span className="text-ink/55">📖 Registro Cuaderno</span>
              <span className="flex items-center gap-2">
                <span className={mov.registrado_en_cuaderno ? 'text-success font-bold' : 'text-danger font-bold'}>
                  {mov.registrado_en_cuaderno
                    ? `✓ ${mov.cuaderno_litros != null ? `${litros(mov.cuaderno_litros)} L` : 'Registrado'}`
                    : '✕ No registrado'}
                </span>
                {puedeEscribir && cuenta(mov) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11"
                    disabled={marcarCuaderno.isPending}
                    onClick={cambiarCuaderno}
                  >
                    Cambiar
                  </Button>
                ) : null}
              </span>
            </div>
            <Fila
              k="Registrado"
              v={`${fechaHora(mov.registrado_en)}${mov.actor_name ? ` · ${mov.actor_name}` : ''}`}
            />
          </div>

          {confirmando ? (
            <div className="border-danger bg-danger-soft rounded-card space-y-3 border-2 p-3.5" role="alertdialog">
              <div>
                <strong className="text-danger text-[1.05rem]">
                  ¿Anular este {NOMBRE_TIPO[mov.tipo].toLowerCase()} de {litros(mov.litros)} L?
                </strong>
                <p className="text-ink/70 mt-1 text-sm">
                  El combustible vuelve al tanque con un reverso
                  {mov.mov_vinculado_id ? ', y también se anula la otra pata del traslado' : ''}
                  {mov.vale_numero ? ` y el vale ${mov.vale_numero} queda anulado` : ''}. El renglón queda en el libro,
                  tachado, con el motivo. Se refleja al instante en la PC.
                </p>
              </div>
              <Textarea label="Motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <div className="grid grid-cols-2 gap-2.5">
                <Button
                  variant="danger"
                  className="h-[60px] text-[1.05rem] font-extrabold"
                  disabled={motivo.trim().length < 3 || anular.isPending}
                  onClick={hacerAnular}
                >
                  {anular.isPending ? 'Anulando…' : '❌ SÍ, ANULAR'}
                </Button>
                <Button
                  variant="outline"
                  className="h-[60px] text-[1.05rem] font-extrabold"
                  disabled={anular.isPending}
                  onClick={() => setConfirmando(false)}
                >
                  ↩ VOLVER
                </Button>
              </div>
            </div>
          ) : null}

          <div>
            <Rotulo>📷 Fotos y documentos</Rotulo>
            <FotosDeCarga
              origen="COMBUSTIBLE"
              referencia={referenciaDeFotos(mov)}
              puedeAnadir={puedeEscribir && cuenta(mov)}
              etiqueta="Fotos"
              descripcionAdjunto="del contador, el equipo o el vale."
            />
          </div>
          <p className="text-ink/45 text-xs leading-snug">
            Aquí se agregan fotos, se marca el cuaderno o se anula el movimiento. Los litros, el equipo, la hora y los
            medidores se corrigen desde el módulo de Combustible en la PC; el cambio se ve aquí al instante.
          </p>
        </div>
      )}
    </Modal>
  )
}
