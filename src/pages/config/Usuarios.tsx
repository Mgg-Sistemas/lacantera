import { useState } from 'react'
import {
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { useSesion } from '@/lib/sesion'
import { useMisRoles } from '@/lib/api/catalogo'
import {
  alcanza,
  nivelAlMarcar,
  useActivarUsuario,
  useAsignarRoles,
  useCambiarClave,
  useCrearRol,
  useCrearUsuario,
  useEliminarRol,
  useGuardarPerfil,
  useGuardarPermiso,
  useGuardarRol,
  useModulos,
  usePermisos,
  useRoles,
  useUsuarios,
} from '@/lib/api/usuarios'
import type { Nivel, RolSistema, UsuarioSistema } from '@/lib/api/usuarios'

// ---------------------------------------------------------------------------
// Matriz de un rol
// ---------------------------------------------------------------------------

const COLUMNAS: { nivel: Nivel; etiqueta: string }[] = [
  { nivel: 'LECTURA', etiqueta: 'Lectura' },
  { nivel: 'ESCRITURA', etiqueta: 'Escritura' },
  { nivel: 'TOTAL', etiqueta: 'Control total' },
]

function Casilla({
  marcada,
  bloqueada,
  etiqueta,
  onPulsar,
}: {
  marcada: boolean
  bloqueada: boolean
  etiqueta: string
  onPulsar: () => void
}) {
  return (
    <input
      type="checkbox"
      checked={marcada}
      disabled={bloqueada}
      onChange={onPulsar}
      aria-label={etiqueta}
      className="accent-royal-600 size-4 cursor-pointer rounded disabled:cursor-not-allowed disabled:opacity-45"
    />
  )
}

function TarjetaRol({
  rol,
  usuarios,
  niveles,
  editable,
  onNivel,
  onEditar,
  onBorrar,
}: {
  rol: RolSistema
  usuarios: number
  niveles: Map<string, Nivel>
  editable: boolean
  onNivel: (modulo: string, nivel: Nivel) => void
  onEditar: () => void
  onBorrar: () => void
}) {
  const { data: modulos } = useModulos()

  // ADMIN no se recorta: es la salida de emergencia. Si se le pudiera cerrar
  // esta misma pantalla, no habría desde dónde volver a abrirla.
  const intocable = rol.codigo === 'ADMIN'

  return (
    <Card flush className="overflow-hidden">
      <div
        className={cn('h-1', intocable ? 'bg-safety' : rol.sistema ? 'bg-royal-600' : 'bg-success')}
      />

      <div className="border-hairline border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-ink/90 text-sm font-semibold tracking-wide uppercase">
                {rol.nombre}
              </h3>
              {rol.sistema ? <Chip tone="neutral">Sistema</Chip> : <Chip tone="success">Propio</Chip>}
            </div>
            <p className="text-ink/55 mt-1.5 text-xs">{rol.descripcion}</p>
            <p className="text-ink/45 mt-1 text-xs">
              {usuarios === 0
                ? 'Sin usuarios asignados'
                : `${usuarios} usuario${usuarios === 1 ? '' : 's'} asignado${usuarios === 1 ? '' : 's'}`}
            </p>
          </div>

          {editable && !intocable ? (
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={onEditar}>
                Editar
              </Button>
              {!rol.sistema ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBorrar}
                  icon={<Trash2 />}
                  aria-label={`Borrar el rol ${rol.nombre}`}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        {intocable ? (
          <p className="text-safety mt-2.5 text-xs">
            El administrador llega a todo por definición. No se recorta.
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline bg-ink/2 border-b text-left text-2xs">
              <th className="px-5 py-2.5 font-medium tracking-wider uppercase">Módulo</th>
              {COLUMNAS.map((c) => (
                <th
                  key={c.nivel}
                  className="px-2 py-2.5 text-center font-medium tracking-wider uppercase"
                >
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(modulos ?? []).map((m) => {
              const nivel = niveles.get(m.codigo) ?? 'NINGUNO'
              return (
                <tr key={m.codigo} className="border-hairline border-b last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="text-ink/85 font-medium">{m.nombre}</span>
                  </td>
                  {COLUMNAS.map((c) => (
                    <td key={c.nivel} className="px-2 py-2.5 text-center">
                      <Casilla
                        marcada={alcanza(nivel, c.nivel)}
                        bloqueada={!editable || intocable}
                        etiqueta={`${c.etiqueta} en ${m.nombre} para ${rol.nombre}`}
                        onPulsar={() => onNivel(m.codigo, nivelAlMarcar(nivel, c.nivel))}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Pestaña de roles
// ---------------------------------------------------------------------------

const rolVacio = { codigo: '', nombre: '', descripcion: '' }

function PestanaRoles({ editable }: { editable: boolean }) {
  const roles = useRoles()
  const permisos = usePermisos()
  const usuarios = useUsuarios()
  const guardarPermiso = useGuardarPermiso()
  const crearRol = useCrearRol()
  const guardarRol = useGuardarRol()
  const eliminarRol = useEliminarRol()

  const [edicion, setEdicion] = useState<(typeof rolVacio & { nuevo: boolean }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Con la forma de actualización, no con el objeto de este render: dos
  // pulsaciones seguidas antes de repintar leerían las dos el mismo valor
  // viejo y la segunda borraría a la primera.
  const cambiarRol = (c: Partial<typeof rolVacio>) =>
    setEdicion((v) => (v ? { ...v, ...c } : v))

  if (roles.isPending || permisos.isPending) return <Cargando />
  if (roles.error) return <ErrorDeCarga error={roles.error} />
  if (permisos.error) return <ErrorDeCarga error={permisos.error} />

  const nivelesPorRol = new Map<string, Map<string, Nivel>>()
  for (const p of permisos.data ?? []) {
    const mapa = nivelesPorRol.get(p.rol) ?? new Map<string, Nivel>()
    mapa.set(p.modulo, p.nivel)
    nivelesPorRol.set(p.rol, mapa)
  }

  const cuentaPorRol = new Map<string, number>()
  for (const u of usuarios.data ?? []) {
    if (!u.activo) continue
    for (const r of u.roles) cuentaPorRol.set(r, (cuentaPorRol.get(r) ?? 0) + 1)
  }

  const guardar = () => {
    if (!edicion) return
    setError(null)
    const accion = edicion.nuevo ? crearRol : guardarRol
    accion.mutate(edicion, {
      onSuccess: () => setEdicion(null),
      onError: (e: Error) => setError(e.message),
    })
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="text-ink/55 max-w-2xl text-sm">
          La matriz decide <strong className="text-ink/75 font-medium">a qué llega</strong> cada
          rol. Solo puede cerrar puertas: darle control total en Tesorería a Almacén no lo convierte
          en tesorero, porque quién aprueba y quién paga es una regla de la base de datos que esta
          pantalla no toca.
        </p>
        {editable ? (
          <Button icon={<Plus />} onClick={() => setEdicion({ ...rolVacio, nuevo: true })}>
            Nuevo rol
          </Button>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {(roles.data ?? []).map((r) => (
          <TarjetaRol
            key={r.codigo}
            rol={r}
            usuarios={cuentaPorRol.get(r.codigo) ?? 0}
            niveles={nivelesPorRol.get(r.codigo) ?? new Map()}
            editable={editable}
            onNivel={(modulo, nivel) =>
              guardarPermiso.mutate(
                { rol: r.codigo, modulo, nivel },
                { onError: (e: Error) => setError(e.message) },
              )
            }
            onEditar={() =>
              setEdicion({
                codigo: r.codigo,
                nombre: r.nombre,
                descripcion: r.descripcion,
                nuevo: false,
              })
            }
            onBorrar={() =>
              eliminarRol.mutate(r.codigo, { onError: (e: Error) => setError(e.message) })
            }
          />
        ))}
      </div>

      {error ? (
        <div
          role="alert"
          className="border-danger/25 bg-danger-soft text-danger fixed inset-x-4 bottom-4 z-40 mx-auto max-w-lg rounded-[6px] border p-3 text-sm shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 font-medium">
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      <Modal
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
        titulo={edicion?.nuevo ? 'Nuevo rol' : 'Editar rol'}
        descripcion={
          edicion?.nuevo
            ? 'Nace sin acceso a nada. Se le abre después, módulo por módulo.'
            : 'El código no cambia: hay funciones de la base que lo nombran.'
        }
        acciones={
          <>
            <Button variant="ghost" onClick={() => setEdicion(null)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={crearRol.isPending || guardarRol.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        {edicion ? (
          <div className="space-y-4">
            <Input
              label="Código"
              value={edicion.codigo}
              disabled={!edicion.nuevo}
              onChange={(e) =>
                cambiarRol({ codigo: e.target.value.toUpperCase().replace(/\s/g, '_') })
              }
              hint="Mayúsculas y guion bajo. Es el nombre interno y no se puede cambiar después."
              placeholder="SUPERVISOR_PATIO"
            />
            <Input
              label="Nombre"
              value={edicion.nombre}
              onChange={(e) => cambiarRol({ nombre: e.target.value })}
              placeholder="Supervisor de patio"
            />
            <Textarea
              label="Descripción"
              value={edicion.descripcion}
              onChange={(e) => cambiarRol({ descripcion: e.target.value })}
              hint="Qué hace quien tiene este rol. Se lee en la tarjeta."
              rows={2}
            />
          </div>
        ) : null}
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pestaña de usuarios
// ---------------------------------------------------------------------------

const usuarioVacio = {
  usuario: '',
  clave: '',
  nombre: '',
  cargo: '',
  cedula: '',
  telefono: '',
  roles: ['SOLICITANTE'] as string[],
}

function PestanaUsuarios({ editable }: { editable: boolean }) {
  const usuarios = useUsuarios()
  const roles = useRoles()
  const crear = useCrearUsuario()
  const guardarPerfil = useGuardarPerfil()
  const asignarRoles = useAsignarRoles()
  const activar = useActivarUsuario()
  const cambiarClave = useCambiarClave()
  const { usuario: yo } = useSesion()

  const [edicion, setEdicion] = useState<
    (typeof usuarioVacio & { id?: string; nuevo: boolean }) | null
  >(null)
  const [clave, setClave] = useState<{ id: string; nombre: string; valor: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Igual que en la pestaña de roles: se actualiza a partir del valor vigente,
  // no del que tenía este render. Al teclear rápido, o al rellenar el
  // formulario de golpe, la forma con objeto pierde caracteres por el camino.
  const cambiar = (c: Partial<typeof usuarioVacio>) =>
    setEdicion((v) => (v ? { ...v, ...c } : v))

  if (usuarios.isPending || roles.isPending) return <Cargando />
  if (usuarios.error) return <ErrorDeCarga error={usuarios.error} />

  const abrir = (u?: UsuarioSistema) =>
    setEdicion(
      u
        ? {
            id: u.id,
            usuario: u.usuario,
            clave: '',
            nombre: u.nombre,
            cargo: u.cargo ?? '',
            cedula: u.cedula ?? '',
            telefono: u.telefono ?? '',
            roles: u.roles,
            nuevo: false,
          }
        : { ...usuarioVacio, nuevo: true },
    )

  const guardar = () => {
    if (!edicion) return
    setError(null)

    if (edicion.roles.length === 0) {
      setError('Asigna al menos un rol. Un usuario sin roles no puede hacer nada.')
      return
    }

    if (edicion.nuevo) {
      crear.mutate(edicion, {
        onSuccess: () => {
          setEdicion(null)
          setAviso(`Usuario ${edicion.usuario} creado. Dile la clave en persona, no por escrito.`)
        },
        onError: (e: Error) => setError(e.message),
      })
      return
    }

    // Dos escrituras porque son dos funciones distintas en la base: los datos
    // de la persona y sus permisos no se tocan con la misma llave.
    guardarPerfil.mutate(
      { id: edicion.id!, nombre: edicion.nombre, cargo: edicion.cargo, cedula: edicion.cedula, telefono: edicion.telefono },
      {
        onSuccess: () =>
          asignarRoles.mutate(
            { id: edicion.id!, roles: edicion.roles },
            { onSuccess: () => setEdicion(null), onError: (e: Error) => setError(e.message) },
          ),
        onError: (e: Error) => setError(e.message),
      },
    )
  }

  const alternarRol = (codigo: string) =>
    setEdicion((e) =>
      e
        ? {
            ...e,
            roles: e.roles.includes(codigo)
              ? e.roles.filter((r) => r !== codigo)
              : [...e.roles, codigo],
          }
        : e,
    )

  const nombreDeRol = (codigo: string) =>
    roles.data?.find((r) => r.codigo === codigo)?.nombre ?? codigo

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="text-ink/55 max-w-2xl text-sm">
          Las cuentas las crea la administración: no hay registro abierto. Quien entra lo hace con
          nombre de usuario, no con correo, porque buena parte de la plantilla no tiene uno.
        </p>
        {editable ? (
          <Button icon={<UserPlus />} onClick={() => abrir()}>
            Nuevo usuario
          </Button>
        ) : null}
      </div>

      {usuarios.data && usuarios.data.length === 0 ? (
        <Card>
          <Vacio
            icono={<UsersIcon />}
            titulo="No hay usuarios"
            descripcion="Ni siquiera el administrador. Algo falta por correr en la base."
          />
        </Card>
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-3 py-3 font-medium">Nombre</th>
                  <th className="px-3 py-3 font-medium">Cargo</th>
                  <th className="px-3 py-3 font-medium">Roles</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {(usuarios.data ?? []).map((u) => (
                  <tr
                    key={u.id}
                    className={cn(
                      'border-hairline border-b transition-colors last:border-0',
                      editable && 'hover:bg-ink/3 cursor-pointer',
                      !u.activo && 'opacity-55',
                    )}
                    onClick={() => (editable ? abrir(u) : undefined)}
                  >
                    <td className="text-ink/70 px-5 py-3 font-mono text-xs">
                      {u.usuario}
                      {u.usuario === yo ? (
                        <Chip tone="royal" className="ml-2">
                          Tú
                        </Chip>
                      ) : null}
                    </td>
                    <td className="text-ink/85 px-3 py-3 font-medium">{u.nombre}</td>
                    <td className="text-ink/60 px-3 py-3">{u.cargo ?? '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="text-ink/40">Sin roles</span>
                        ) : (
                          u.roles.map((r) => (
                            <Chip key={r} tone={r === 'ADMIN' ? 'safety' : 'neutral'}>
                              {nombreDeRol(r)}
                            </Chip>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Chip tone={u.activo ? 'success' : 'neutral'}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </Chip>
                        {editable ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<KeyRound />}
                            aria-label={`Cambiar la clave de ${u.nombre}`}
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setClave({ id: u.id, nombre: u.nombre, valor: '' })
                            }}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {aviso ? (
        <div
          role="status"
          className="border-success/25 bg-success-soft text-success mt-4 rounded-[6px] border p-3 text-sm"
        >
          {aviso}
        </div>
      ) : null}

      {/* ---------- Alta y edición ---------- */}
      <Modal
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
        titulo={edicion?.nuevo ? 'Nuevo usuario' : 'Editar usuario'}
        descripcion={
          edicion?.nuevo
            ? 'Los roles deciden a qué llega. Se pueden cambiar después.'
            : 'El nombre de usuario no cambia: es con lo que entra y con lo que quedó firmado lo que ya hizo.'
        }
        ancho="lg"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setEdicion(null)}>
              Cancelar
            </Button>
            {!edicion?.nuevo && edicion?.id && edicion.usuario !== yo ? (
              <Button
                variant={
                  usuarios.data?.find((u) => u.id === edicion.id)?.activo ? 'danger' : 'outline'
                }
                onClick={() => {
                  const actual = usuarios.data?.find((u) => u.id === edicion.id)
                  activar.mutate(
                    { id: edicion.id!, activo: !actual?.activo },
                    { onSuccess: () => setEdicion(null), onError: (e: Error) => setError(e.message) },
                  )
                }}
              >
                {usuarios.data?.find((u) => u.id === edicion.id)?.activo
                  ? 'Desactivar'
                  : 'Reactivar'}
              </Button>
            ) : null}
            <Button onClick={guardar} disabled={crear.isPending || guardarPerfil.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        {edicion ? (
          <div className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="border-danger/25 bg-danger-soft text-danger rounded-[6px] border p-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nombre de usuario"
                value={edicion.usuario}
                disabled={!edicion.nuevo}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) =>
                  cambiar({ usuario: e.target.value.toLowerCase().trim() })
                }
                hint={edicion.nuevo ? 'De 3 a 32 caracteres: letras, números, punto y guion.' : undefined}
                placeholder="p.ramirez"
              />
              <Input
                label="Nombre y apellido"
                value={edicion.nombre}
                onChange={(e) => cambiar({ nombre: e.target.value })}
                placeholder="Pedro Ramírez"
              />
            </div>

            {edicion.nuevo ? (
              <Input
                label="Clave inicial"
                value={edicion.clave}
                revealable
                onChange={(e) => cambiar({ clave: e.target.value })}
                hint="Mínimo 8 caracteres. Dásela en persona y que la cambie."
              />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Cargo"
                value={edicion.cargo}
                onChange={(e) => cambiar({ cargo: e.target.value })}
                placeholder="Jefe de taller"
              />
              <Input
                label="Cédula"
                value={edicion.cedula}
                onChange={(e) => cambiar({ cedula: e.target.value })}
                placeholder="V-12345678"
              />
              <Input
                label="Teléfono"
                value={edicion.telefono}
                onChange={(e) => cambiar({ telefono: e.target.value })}
                placeholder="0414-0000000"
              />
            </div>

            <fieldset>
              <legend className="text-ink/70 mb-2 text-sm font-medium">Roles</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {(roles.data ?? []).map((r) => (
                  <label
                    key={r.codigo}
                    className="hover:bg-ink/4 flex cursor-pointer items-start gap-2.5 rounded-[6px] p-2 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={edicion.roles.includes(r.codigo)}
                      onChange={() => alternarRol(r.codigo)}
                      className="accent-royal-600 mt-0.5 size-4 shrink-0 rounded"
                    />
                    <span className="min-w-0">
                      <span className="text-ink/85 block text-sm font-medium">{r.nombre}</span>
                      <span className="text-ink/50 block text-xs">{r.descripcion}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
      </Modal>

      {/* ---------- Clave ---------- */}
      <Modal
        abierto={clave !== null}
        onCerrar={() => setClave(null)}
        titulo="Cambiar la clave"
        descripcion={clave ? `La clave de ${clave.nombre}. Dásela en persona.` : undefined}
        ancho="sm"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setClave(null)}>
              Cancelar
            </Button>
            <Button
              disabled={cambiarClave.isPending}
              onClick={() => {
                if (!clave) return
                setError(null)
                cambiarClave.mutate(
                  { id: clave.id, clave: clave.valor },
                  {
                    onSuccess: () => {
                      setClave(null)
                      setAviso(`Clave de ${clave.nombre} cambiada.`)
                    },
                    onError: (e: Error) => setError(e.message),
                  },
                )
              }}
            >
              Cambiar
            </Button>
          </>
        }
      >
        {clave ? (
          <div className="space-y-3">
            {error ? (
              <div
                role="alert"
                className="border-danger/25 bg-danger-soft text-danger rounded-[6px] border p-3 text-sm"
              >
                {error}
              </div>
            ) : null}
            <Input
              label="Clave nueva"
              value={clave.valor}
              revealable
              onChange={(e) => setClave((v) => (v ? { ...v, valor: e.target.value } : v))}
              hint="Mínimo 8 caracteres."
            />
          </div>
        ) : null}
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export function Usuarios() {
  const [pestana, setPestana] = useState<'usuarios' | 'roles'>('usuarios')
  const { puede, isPending } = useMisRoles()

  // Administrar usuarios exige ADMIN en la base. Sin él la pantalla se lee,
  // porque saber quién puede qué no es secreto entre quienes ya entraron, pero
  // no se toca nada.
  const editable = puede('ADMIN')

  return (
    <>
      <PageHeader
        title="Usuarios y roles"
        description="Quién entra al sistema y a qué llega cada quien."
      />

      {!isPending && !editable ? (
        <div className="border-warning/30 bg-warning-soft text-warning mb-5 flex items-start gap-2.5 rounded-[6px] border p-3 text-sm">
          <ShieldCheck className="mt-px size-[18px] shrink-0" />
          <span>
            Estás viendo esta pantalla en solo lectura. Crear usuarios y cambiar permisos lo hace
            quien tiene el rol de administrador del sistema.
          </span>
        </div>
      ) : null}

      <div className="border-hairline mb-5 flex gap-1 border-b">
        {(
          [
            { id: 'usuarios', etiqueta: 'Usuarios' },
            { id: 'roles', etiqueta: 'Roles y permisos' },
          ] as const
        ).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPestana(p.id)}
            aria-current={pestana === p.id}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              pestana === p.id
                ? 'border-royal-600 text-royal-700 dark:text-royal-300'
                : 'text-ink/55 hover:text-ink/80 border-transparent',
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'usuarios' ? (
        <PestanaUsuarios editable={editable} />
      ) : (
        <PestanaRoles editable={editable} />
      )}
    </>
  )
}
