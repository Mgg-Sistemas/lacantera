import { useState } from 'react'
import { PenLine, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { EditorDeFirma } from '@/components/EditorDeFirma'
import type { OrigenDeFirma } from '@/lib/api/firmas'
import {
  useGuardarAutorizado,
  useGuardarFirmaDeUsuario,
  useQuitarAutorizado,
  useQuitarFirmaDeUsuario,
  useUsuarios,
  useUsuariosAutorizados,
  type UsuarioAutorizado,
} from '@/lib/api/usuarios'

/*
  USUARIOS AUTORIZADOS PARA APROBAR (como en MGG)

  Angélica, 07/11/2026: «en los roles y permisos se escoge el usuario que
  tendrá permisos de aprobar órdenes de compras y de salida; los
  administradores por defecto tendrán los accesos».

  Es una lista por persona, aparte de los roles: aprobar es firmar, y la firma
  es de alguien, no de un cargo. El administrador aprueba siempre, sin estar
  aquí. Quitar a alguien no toca lo que ya aprobó.
*/

type Permiso = 'aprobar_oc' | 'aprobar_salidas' | 'aprobar_despachos'

const PERMISOS: { clave: Permiso; etiqueta: string; dice: string }[] = [
  { clave: 'aprobar_oc', etiqueta: 'Aprobar órdenes de compra', dice: 'Firma y aprueba las órdenes de compra.' },
  { clave: 'aprobar_salidas', etiqueta: 'Aprobar salidas', dice: 'Aprueba las solicitudes de salida del almacén.' },
  // 10/11/2026: la venta lleva una sola aprobación, al despachar.
  { clave: 'aprobar_despachos', etiqueta: 'Aprobar despachos', dice: 'Aprueba los despachos de ventas («¿Se despacha?»).' },
]

const resumen = (a: Pick<UsuarioAutorizado, Permiso>) => {
  const que = [a.aprobar_oc && 'compras', a.aprobar_salidas && 'salidas', a.aprobar_despachos && 'despachos'].filter(Boolean)
  return que.length ? `Aprueba ${que.join(', ').replace(/, ([^,]*)$/, ' y $1')}` : 'Sin permisos'
}

export function UsuariosAutorizados({ editable }: { editable: boolean }) {
  const lista = useUsuariosAutorizados()
  const usuarios = useUsuarios()
  const guardar = useGuardarAutorizado()
  const quitar = useQuitarAutorizado()
  const guardarFirma = useGuardarFirmaDeUsuario()
  const quitarFirma = useQuitarFirmaDeUsuario()

  const [agregando, setAgregando] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const [podra, setPodra] = useState<Record<Permiso, boolean>>({ aprobar_oc: true, aprobar_salidas: true, aprobar_despachos: false })
  const [quitando, setQuitando] = useState<UsuarioAutorizado | null>(null)
  const [firmando, setFirmando] = useState<UsuarioAutorizado | null>(null)
  const [firma, setFirma] = useState<{ imagen: string; origen: OrigenDeFirma } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const ya = new Set((lista.data ?? []).map((a) => a.usuario_id))
  const candidatos = (usuarios.data ?? []).filter((u) => u.activo && !u.archivado_en && !ya.has(u.id))

  const cambiar = (a: UsuarioAutorizado, clave: Permiso, valor: boolean) => {
    setAviso(null)
    const v = { aprobar_oc: a.aprobar_oc, aprobar_salidas: a.aprobar_salidas, aprobar_despachos: a.aprobar_despachos, [clave]: valor }
    if (!v.aprobar_oc && !v.aprobar_salidas && !v.aprobar_despachos) {
      setAviso('Debe quedar al menos una opción. Para quitarle todo, use «Quitar».')
      return
    }
    guardar.mutate({ usuario_id: a.usuario_id, ...v }, { onError: (e: Error) => setAviso(e.message) })
  }

  const autorizar = () => {
    if (!nuevo) return
    if (!podra.aprobar_oc && !podra.aprobar_salidas && !podra.aprobar_despachos) {
      setAviso('Marque al menos una opción.')
      return
    }
    guardar.mutate(
      { usuario_id: nuevo, ...podra },
      {
        onSuccess: () => {
          setAgregando(false)
          setNuevo('')
          setPodra({ aprobar_oc: true, aprobar_salidas: true, aprobar_despachos: false })
        },
        onError: (e: Error) => setAviso(e.message),
      },
    )
  }

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-ink/90 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="text-success size-4" />
            Usuarios autorizados para aprobar
          </h3>
          <p className="text-ink/55 mt-1 text-xs leading-relaxed">
            Solo estos usuarios —y los administradores— pueden{' '}
            <strong className="text-ink/75 font-medium">aprobar órdenes de compra</strong>,{' '}
            <strong className="text-ink/75 font-medium">aprobar salidas</strong> y{' '}
            <strong className="text-ink/75 font-medium">aprobar despachos</strong>. Su firma se
            estampa en lo que aprueben. Lo ya aprobado no cambia.
          </p>
        </div>
        {editable ? (
          <Button size="sm" icon={<UserPlus />} onClick={() => setAgregando(true)}>
            Agregar usuario autorizado
          </Button>
        ) : null}
      </div>

      {lista.isPending ? <Cargando /> : null}
      {lista.error ? <ErrorDeCarga error={lista.error} className="mt-3" /> : null}

      {lista.data && lista.data.length === 0 ? (
        <p className="text-ink/50 mt-4 text-sm">
          Aún no hay usuarios autorizados: solo los administradores pueden aprobar.
        </p>
      ) : null}

      {lista.data && lista.data.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-ink/45 border-hairline border-b text-left text-2xs">
                <th className="py-2 pr-3 font-medium tracking-wider uppercase">Usuario</th>
                <th className="px-2 py-2 text-center font-medium tracking-wider uppercase">
                  Aprobar órdenes de compra
                </th>
                <th className="px-2 py-2 text-center font-medium tracking-wider uppercase">
                  Aprobar salidas
                </th>
                <th className="px-2 py-2 text-center font-medium tracking-wider uppercase">
                  Aprobar despachos
                </th>
                <th className="px-2 py-2 font-medium tracking-wider uppercase">Firma</th>
                {editable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {lista.data.map((a) => (
                <tr key={a.usuario_id} className="border-hairline border-b last:border-0">
                  <td className="py-2.5 pr-3">
                    <span className="text-ink/85 block font-medium uppercase">{a.nombre}</span>
                    <span className="text-ink/45 block text-xs">
                      {a.usuario} · {resumen(a)}
                      {!a.activo ? ' · inactivo' : ''}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={a.aprobar_oc}
                      disabled={!editable || guardar.isPending}
                      onChange={(e) => cambiar(a, 'aprobar_oc', e.target.checked)}
                      aria-label={`${a.nombre} aprueba órdenes de compra`}
                      className="accent-royal-600 size-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                    />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={a.aprobar_salidas}
                      disabled={!editable || guardar.isPending}
                      onChange={(e) => cambiar(a, 'aprobar_salidas', e.target.checked)}
                      aria-label={`${a.nombre} aprueba salidas`}
                      className="accent-royal-600 size-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                    />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={a.aprobar_despachos}
                      disabled={!editable || guardar.isPending}
                      onChange={(e) => cambiar(a, 'aprobar_despachos', e.target.checked)}
                      aria-label={`${a.nombre} aprueba despachos`}
                      className="accent-royal-600 size-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
                    />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      {a.firma ? (
                        <img
                          src={a.firma}
                          alt={`Firma de ${a.nombre}`}
                          className="h-8 max-w-[110px] rounded bg-white object-contain px-1"
                        />
                      ) : (
                        <span className="text-ink/45 text-xs">Sin firma</span>
                      )}
                      {editable ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<PenLine />}
                            onClick={() => {
                              setFirma(null)
                              setFirmando(a)
                            }}
                          >
                            {a.firma ? 'Cambiar' : 'Cargar firma'}
                          </Button>
                          {a.firma ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<X />}
                              aria-label={`Quitar la firma de ${a.nombre}`}
                              disabled={quitarFirma.isPending}
                              onClick={() =>
                                quitarFirma.mutate(a.usuario_id, {
                                  onError: (e: Error) => setAviso(e.message),
                                })
                              }
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </td>
                  {editable ? (
                    <td className="py-2.5 pl-2 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        icon={<Trash2 />}
                        onClick={() => setQuitando(a)}
                      >
                        Quitar
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-ink/45 mt-3 text-xs">
        <Chip tone="royal">Administrador</Chip>{' '}
        aprueba siempre órdenes de compra, salidas y despachos, sin estar en la lista.
      </p>

      {aviso ? (
        <p role="alert" className="text-danger mt-3 text-sm">
          {aviso}
        </p>
      ) : null}

      {/* Agregar */}
      <Modal
        abierto={agregando}
        onCerrar={() => setAgregando(false)}
        titulo="Agregar usuario autorizado"
        descripcion="Quién va a aprobar, y qué."
        acciones={
          <>
            <Button variant="ghost" onClick={() => setAgregando(false)}>
              Cancelar
            </Button>
            <Button onClick={autorizar} disabled={!nuevo || guardar.isPending}>
              {guardar.isPending ? 'Autorizando…' : 'Autorizar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectBuscable
            label="Usuario"
            vacio={candidatos.length ? 'Buscar usuario por nombre…' : 'No hay usuarios activos sin autorizar'}
            valor={nuevo}
            onCambio={setNuevo}
            opciones={candidatos.map((u) => ({ valor: u.id, etiqueta: `${u.nombre} · ${u.usuario}` }))}
          />
          <fieldset>
            <legend className="text-ink/70 mb-2 text-sm font-medium">Podrá:</legend>
            <div className="space-y-2.5">
              {PERMISOS.map((o) => (
                <label key={o.clave} className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={podra[o.clave]}
                    onChange={(e) => setPodra({ ...podra, [o.clave]: e.target.checked })}
                    className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer"
                  />
                  <span>
                    <span className="text-ink/85 block text-sm">{o.etiqueta}</span>
                    <span className="text-ink/50 block text-xs">{o.dice}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-ink/45 text-xs">La firma se puede cargar después, desde la lista.</p>
        </div>
      </Modal>

      {/* Quitar */}
      <Modal
        abierto={quitando !== null}
        onCerrar={() => setQuitando(null)}
        titulo="Quitar usuario autorizado"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setQuitando(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={quitar.isPending}
              onClick={() =>
                quitando &&
                quitar.mutate(quitando.usuario_id, {
                  onSuccess: () => setQuitando(null),
                  onError: (e: Error) => setAviso(e.message),
                })
              }
            >
              Quitar
            </Button>
          </>
        }
      >
        <p className="text-ink/70 text-sm">
          <strong className="uppercase">{quitando?.nombre}</strong> ya no podrá aprobar órdenes de
          compra, salidas ni despachos. Lo que ya aprobó se conserva con su firma. ¿Continuar?
        </p>
      </Modal>

      {/* Firma */}
      <Modal
        abierto={firmando !== null}
        onCerrar={() => setFirmando(null)}
        titulo={`Firma de ${firmando?.nombre ?? ''}`}
        descripcion="Trácela, escríbala o cargue una foto: el fondo blanco se vuelve transparente."
        ancho="lg"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setFirmando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!firma || guardarFirma.isPending}
              onClick={() =>
                firmando &&
                firma &&
                guardarFirma.mutate(
                  { usuario_id: firmando.usuario_id, imagen: firma.imagen, origen: firma.origen },
                  {
                    onSuccess: () => setFirmando(null),
                    onError: (e: Error) => setAviso(e.message),
                  },
                )
              }
            >
              {guardarFirma.isPending ? 'Guardando…' : 'Guardar firma'}
            </Button>
          </>
        }
      >
        {firmando ? <EditorDeFirma nombre={firmando.nombre} onListo={setFirma} /> : null}
      </Modal>
    </Card>
  )
}
