import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import {
  useCrearRol,
  useEliminarRol,
  useGuardarRol,
  useRoles,
  useUsuarios,
  type RolSistema,
} from '@/lib/api/usuarios'

/*
  LOS DOS MODALES DE ROLES DE MGG: «NUEVO ROL» Y «GESTIÓN DE ROLES».

  Se abren desde la pestaña «Roles y permisos» y también desde la ficha del
  usuario, al lado del rol («+ Nuevo» y «⚙»), igual que en MGG: quien está
  dando de alta a alguien y no encuentra el rol que le toca lo crea ahí mismo,
  y el rol recién creado queda elegido.
*/

/**
 * La clave del rol sale de su nombre, como en MGG: «Supervisor de planta» →
 * SUPERVISOR_DE_PLANTA. Es lo que admite la base: ^[A-Z][A-Z0-9_]{2,}$.
 */
function codigoDesdeNombre(nombre: string): string {
  return nombre
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '')
}

const CODIGO_VALIDO = /^[A-Z][A-Z0-9_]{2,}$/

function Alerta({ texto }: { texto: string | null }) {
  if (!texto) return null
  return (
    <div
      role="alert"
      className="border-danger/25 bg-danger-soft text-danger rounded-[6px] border p-3 text-sm"
    >
      {texto}
    </div>
  )
}

function CasillaSoloTelefono({
  marcada,
  onCambio,
  disabled,
}: {
  marcada: boolean
  onCambio: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={marcada}
        disabled={disabled}
        onChange={(e) => onCambio(e.target.checked)}
        className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
      />
      <span>
        <span className="text-ink/85 block text-sm font-medium">📱 Solo teléfono</span>
        <span className="text-ink/50 block text-xs">
          Trabaja desde las pantallas de teléfono que se le marquen; no ve las de escritorio.
        </span>
      </span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Nuevo rol
// ---------------------------------------------------------------------------

export function NuevoRolModal({
  abierto,
  onCerrar,
  onCreado,
}: {
  abierto: boolean
  onCerrar: () => void
  /** Devuelve la clave del rol creado, para elegirlo donde se pidió. */
  onCreado?: (codigo: string) => void
}) {
  const crear = useCrearRol()
  const roles = useRoles()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [color, setColor] = useState('#7c3aed')
  const [soloTelefono, setSoloTelefono] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const codigo = codigoDesdeNombre(nombre)
  const repetido = (roles.data ?? []).some((r) => r.codigo === codigo)
  const codigoMalo = nombre.trim() !== '' && !CODIGO_VALIDO.test(codigo)

  const cerrar = () => {
    setNombre('')
    setDescripcion('')
    setColor('#7c3aed')
    setSoloTelefono(false)
    setError(null)
    onCerrar()
  }

  const enviar = () => {
    setError(null)
    if (nombre.trim().length < 3) {
      setError('El nombre del rol es obligatorio.')
      return
    }
    if (!CODIGO_VALIDO.test(codigo)) {
      setError('No se pudo sacar la clave del nombre: empiécelo con una letra y use letras y números.')
      return
    }
    if (repetido) {
      setError(`Ya hay un rol con la clave ${codigo}. Cambie el nombre.`)
      return
    }
    crear.mutate(
      {
        codigo,
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        color,
        solo_telefono: soloTelefono,
      },
      {
        onSuccess: () => {
          onCreado?.(codigo)
          cerrar()
        },
        onError: (e: Error) => setError(e.message),
      },
    )
  }

  return (
    <Modal
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Nuevo rol"
      acciones={
        <>
          <Button variant="ghost" onClick={cerrar} disabled={crear.isPending}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={crear.isPending || !nombre.trim()}>
            {crear.isPending ? 'Creando…' : 'Crear rol'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alerta texto={error} />
        <div>
          <Input
            label="Nombre del rol"
            maxLength={60}
            value={nombre}
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Supervisor de patio"
          />
          {codigo ? (
            <span
              className={
                repetido || codigoMalo
                  ? 'text-danger mt-1 block font-mono text-2xs'
                  : 'text-ink/45 mt-1 block font-mono text-2xs'
              }
            >
              clave: {codigo}
              {repetido ? ' · ya existe' : codigoMalo ? ' · empiece con una letra' : ''}
            </span>
          ) : null}
        </div>
        <Textarea
          label="Descripción"
          value={descripcion}
          rows={2}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Para qué sirve este rol"
        />
        <label className="text-ink/70 flex items-center gap-2 text-sm">
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="border-ink/20 h-8 w-12 cursor-pointer rounded border bg-transparent"
          />
        </label>
        <CasillaSoloTelefono marcada={soloTelefono} onCambio={setSoloTelefono} />
        <p className="border-hairline text-ink/55 rounded-card border border-dashed p-3 text-xs leading-relaxed">
          Nace viendo solo el panel. Después, en «Roles y permisos», se le da un nivel en cada
          módulo —lectura, escritura o control total— y lo que su nivel no abre se marca en sus{' '}
          <span className="text-ink/75">⭐ Acciones especiales</span>. Podrá eliminarlo mientras no
          tenga usuarios asignados.
        </p>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Gestión de roles
// ---------------------------------------------------------------------------

export function GestionarRolesModal({
  abierto,
  onCerrar,
}: {
  abierto: boolean
  onCerrar: () => void
}) {
  const roles = useRoles()
  const usuarios = useUsuarios()
  const guardar = useGuardarRol()
  const eliminar = useEliminarRol()

  const [filtro, setFiltro] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [color, setColor] = useState('#7c3aed')
  const [soloTelefono, setSoloTelefono] = useState(false)
  const [aEliminar, setAEliminar] = useState<RolSistema | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Para borrar cuenta todo el que lo tenga, activo o no: es lo que mira la base.
  const asignados = new Map<string, number>()
  for (const u of usuarios.data ?? []) {
    for (const r of u.roles) asignados.set(r, (asignados.get(r) ?? 0) + 1)
  }

  const q = filtro.trim().toLowerCase()
  const ordenados = [...(roles.data ?? [])]
    .filter((r) => !q || `${r.nombre} ${r.codigo}`.toLowerCase().includes(q))
    .sort((a, b) =>
      a.sistema === b.sistema ? a.nombre.localeCompare(b.nombre, 'es') : a.sistema ? -1 : 1,
    )

  const empezar = (r: RolSistema) => {
    setError(null)
    setEditando(r.codigo)
    setNombre(r.nombre)
    setDescripcion(r.descripcion)
    setColor(r.color)
    setSoloTelefono(r.solo_telefono)
  }

  const aplicar = (r: RolSistema) => {
    if (!nombre.trim()) {
      setError('El nombre no puede quedar vacío.')
      return
    }
    setError(null)
    guardar.mutate(
      {
        codigo: r.codigo,
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        color,
        solo_telefono: soloTelefono,
      },
      { onSuccess: () => setEditando(null), onError: (e: Error) => setError(e.message) },
    )
  }

  return (
    <>
      <Modal
        abierto={abierto}
        onCerrar={() => {
          setEditando(null)
          setError(null)
          onCerrar()
        }}
        titulo="Gestión de roles"
        descripcion="Corrija el nombre, la descripción o el color. Los roles del sistema no se eliminan, pero sí se renombran."
        ancho="lg"
        acciones={
          <Button
            onClick={() => {
              setEditando(null)
              setError(null)
              onCerrar()
            }}
          >
            Cerrar
          </Button>
        }
      >
        <div className="space-y-3">
          <Alerta texto={error} />
          <Input
            label="Filtrar roles"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Por nombre o clave…"
          />
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-2xs">
                  <th className="w-4 py-2" />
                  <th className="py-2 pr-2 font-medium tracking-wider uppercase">Rol</th>
                  <th className="px-2 py-2 text-right font-medium tracking-wider uppercase">
                    Usuarios
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ordenados.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-ink/45 py-4 text-center">
                      Sin roles.
                    </td>
                  </tr>
                ) : null}
                {ordenados.map((r) => {
                  const usos = asignados.get(r.codigo) ?? 0
                  const enEdicion = editando === r.codigo
                  return (
                    <tr key={r.codigo} className="border-hairline border-b align-top last:border-0">
                      <td className="py-3">
                        <span
                          className="mt-1 block size-2.5 rounded-full"
                          style={{ backgroundColor: enEdicion ? color : r.color }}
                          title={r.color}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {enEdicion ? (
                          <div
                            className="space-y-2"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement))
                                aplicar(r)
                              if (e.key === 'Escape') setEditando(null)
                            }}
                          >
                            <Input
                              label="Nombre visible"
                              maxLength={60}
                              value={nombre}
                              autoFocus
                              onChange={(e) => setNombre(e.target.value)}
                            />
                            <Input
                              label="Descripción"
                              value={descripcion}
                              onChange={(e) => setDescripcion(e.target.value)}
                            />
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="text-ink/60 flex items-center gap-2 text-xs">
                                Color
                                <input
                                  type="color"
                                  value={color}
                                  onChange={(e) => setColor(e.target.value)}
                                  className="border-ink/20 h-7 w-10 cursor-pointer rounded border bg-transparent"
                                />
                              </label>
                              <span className="text-ink/40 font-mono text-2xs">clave: {r.codigo}</span>
                            </div>
                            <CasillaSoloTelefono marcada={soloTelefono} onCambio={setSoloTelefono} />
                          </div>
                        ) : (
                          <>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-ink/85 font-medium">{r.nombre}</span>
                              {r.sistema ? <Chip tone="neutral">Sistema</Chip> : null}
                              {r.solo_telefono ? <Chip tone="warning">📱 Solo teléfono</Chip> : null}
                            </span>
                            {r.descripcion ? (
                              <span className="text-ink/50 block text-xs">{r.descripcion}</span>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="text-ink/60 px-2 py-2.5 text-right text-xs whitespace-nowrap">
                        {usos > 0 ? `${usos} usuario${usos === 1 ? '' : 's'}` : '—'}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {enEdicion ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" disabled={guardar.isPending} onClick={() => aplicar(r)}>
                              {guardar.isPending ? 'Guardando…' : 'Guardar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={guardar.isPending}
                              onClick={() => setEditando(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            {/* ADMIN no se toca: es la salida de emergencia. */}
                            {r.codigo !== 'ADMIN' ? (
                              <Button size="sm" variant="ghost" onClick={() => empezar(r)}>
                                ✎ Editar
                              </Button>
                            ) : null}
                            {!r.sistema && usos === 0 ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger"
                                aria-label={`Eliminar el rol ${r.nombre}`}
                                onClick={() => setAEliminar(r)}
                              >
                                🗑
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <ConfirmarEliminarRol
        rol={aEliminar}
        onCerrar={() => setAEliminar(null)}
        pendiente={eliminar.isPending}
        onConfirmar={(r) =>
          eliminar.mutate(r.codigo, {
            onSuccess: () => setAEliminar(null),
            onError: (e: Error) => {
              setAEliminar(null)
              setError(e.message)
            },
          })
        }
      />
    </>
  )
}

/** La confirmación de MGG antes de borrar un rol. */
export function ConfirmarEliminarRol({
  rol,
  onCerrar,
  onConfirmar,
  pendiente,
}: {
  rol: RolSistema | null
  onCerrar: () => void
  onConfirmar: (rol: RolSistema) => void
  pendiente: boolean
}) {
  return (
    <Modal
      abierto={rol !== null}
      onCerrar={onCerrar}
      titulo="Eliminar rol"
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={pendiente} onClick={() => rol && onConfirmar(rol)}>
            Eliminar
          </Button>
        </>
      }
    >
      <p className="text-ink/70 text-sm">
        Se eliminará el rol «{rol?.nombre}». Esto borra también su matriz de permisos. ¿Continuar?
      </p>
    </Modal>
  )
}
