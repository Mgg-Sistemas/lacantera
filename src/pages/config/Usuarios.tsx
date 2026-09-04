import { Fragment, useMemo, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  KeyRound,
  Search,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Users as UsersIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { fecha } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { useMisRoles } from '@/lib/api/catalogo'
import { esModuloEnObra } from '@/config/navigation'
import {
  alcanza,
  nivelAlMarcar,
  useActivarUsuario,
  useArchivarUsuario,
  useDesarchivarUsuario,
  useMisAcciones,
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
  useAcciones,
  useAutorizaciones,
  useAutorizarVarias,
  useRetirarAutorizacion,
  useAccionesDeLosRoles,
  useMarcarAccion,
  useUsuarios,
  useFichasDeLasCuentas,
  type FichaDeCuenta,
} from '@/lib/api/usuarios'
import type {
  AccionDelSistema,
  AutorizacionDelSistema,
  Nivel,
  RolSistema,
  UsuarioSistema,
} from '@/lib/api/usuarios'

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
  marcadas,
  accionesPorModulo,
  sinCatalogo,
  editable,
  onNivel,
  onAccion,
  onEditar,
  onBorrar,
}: {
  rol: RolSistema
  usuarios: number
  niveles: Map<string, Nivel>
  /** Las acciones que este rol tiene marcadas. */
  marcadas: Set<string>
  /** El catálogo, agrupado por módulo. Vacío en los que aún no se han desglosado. */
  accionesPorModulo: Map<string, AccionDelSistema[]>
  /** Cuántos módulos siguen sin catálogo, para decirlo abajo. */
  sinCatalogo: number
  editable: boolean
  onNivel: (modulo: string, nivel: Nivel) => void
  onAccion: (accion: string, marcada: boolean) => void
  onEditar: () => void
  onBorrar: () => void
}) {
  const { data: todosLosModulos } = useModulos()

  /*
    Los módulos en obra no salen en la matriz.

    Enseñar el nivel de un módulo que el menú esconde es prometer un reparto
    que nadie va a poder usar, y peor: se enseñaba repartido, así que la
    pantalla decía que Almacén trabaja en Despachos mientras el menú no le
    ofrecía Despachos a nadie. Mientras un módulo esté en obra lo abre solo
    administración, y eso no se reparte.

    La lista sale de `navigation.ts`, del mismo sitio del que sale que el menú
    los esconda. Una lista aparte aquí sería la que nadie actualiza el día que
    un módulo vuelva al riel.
  */
  const modulos = (todosLosModulos ?? []).filter((m) => !esModuloEnObra(m.codigo))

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
              {rol.a_la_medida ? <Chip tone="royal">Detallado</Chip> : null}
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
            {modulos.map((m) => {
              const nivel = niveles.get(m.codigo) ?? 'NINGUNO'
              const suyas = accionesPorModulo.get(m.codigo) ?? []

              /*
                Detallado y con catálogo: mandan las casillas, y la escalera
                de ese módulo se apaga. Enseñarla encendida sería mentir — la
                base la ignora para estos roles, y alguien la marcaría creyendo
                que hace algo.
              */
              const porCasillas = rol.a_la_medida && suyas.length > 0

              return (
                <Fragment key={m.codigo}>
                  <tr className="border-hairline border-b last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="text-ink/85 font-medium">{m.nombre}</span>
                      {porCasillas ? (
                        <span className="text-ink/40 ml-2 text-2xs">detallado</span>
                      ) : null}
                    </td>
                    {COLUMNAS.map((c) => (
                      <td key={c.nivel} className="px-2 py-2.5 text-center">
                        {porCasillas ? (
                          <span className="text-ink/20 text-xs">·</span>
                        ) : (
                          <Casilla
                            marcada={alcanza(nivel, c.nivel)}
                            bloqueada={!editable || intocable}
                            etiqueta={`${c.etiqueta} en ${m.nombre} para ${rol.nombre}`}
                            onPulsar={() => onNivel(m.codigo, nivelAlMarcar(nivel, c.nivel))}
                          />
                        )}
                      </td>
                    ))}
                  </tr>

                  {porCasillas
                    ? suyas.map((a) => (
                        <tr key={a.codigo} className="border-hairline border-b last:border-0">
                          <td colSpan={1 + COLUMNAS.length} className="py-2 pr-5 pl-10">
                            <label className="flex cursor-pointer items-start gap-2.5">
                              <input
                                type="checkbox"
                                checked={marcadas.has(a.codigo)}
                                disabled={!editable || intocable}
                                onChange={(e) => onAccion(a.codigo, e.target.checked)}
                                className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                              />
                              <span className="min-w-0">
                                <span className="text-ink/85 block text-sm">{a.nombre}</span>
                                {/* La explicación no es adorno: quien arma un rol
                                    no conoce el sistema por dentro, y «fijar
                                    tributos» no le dice que eso enciende el IVA
                                    de todas las facturas. */}
                                {a.dice ? (
                                  <span className="text-ink/50 block text-xs">{a.dice}</span>
                                ) : null}
                              </span>
                            </label>
                          </td>
                        </tr>
                      ))
                    : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Los módulos que todavía no tienen catálogo se rigen por su escalón
          aunque el rol esté detallado. Hay que decirlo o el rol parece roto:
          alguien buscaría las casillas de Compras y no las encontraría. */}
      {rol.a_la_medida && sinCatalogo > 0 ? (
        <p className="text-ink/45 border-hairline border-t px-5 py-3 text-xs leading-relaxed">
          {sinCatalogo === 1
            ? 'Queda un módulo sin desglosar en acciones: ese sigue rigiéndose por su escalón.'
            : `Quedan ${sinCatalogo} módulos sin desglosar en acciones: esos siguen rigiéndose por su escalón.`}{' '}
          Se van afinando de uno en uno, y mientras tanto el rol funciona.
        </p>
      ) : null}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Pestaña de roles
// ---------------------------------------------------------------------------

const rolVacio = {
  codigo: '',
  nombre: '',
  descripcion: '',
  a_la_medida: false,
}

function PestanaRoles({ editable }: { editable: boolean }) {
  const roles = useRoles()
  const permisos = usePermisos()
  const usuarios = useUsuarios()
  const guardarPermiso = useGuardarPermiso()
  const { data: modulosTodos } = useModulos()
  const acciones = useAcciones()
  const accionesDeRoles = useAccionesDeLosRoles()
  const marcarAccion = useMarcarAccion()
  const crearRol = useCrearRol()
  const guardarRol = useGuardarRol()
  const eliminarRol = useEliminarRol()

  const [edicion, setEdicion] = useState<(typeof rolVacio & { nuevo: boolean }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [verMatices, setVerMatices] = useState(false)

  // Con la forma de actualización, no con el objeto de este render: dos
  // pulsaciones seguidas antes de repintar leerían las dos el mismo valor
  // viejo y la segunda borraría a la primera.
  const cambiarRol = (c: Partial<typeof rolVacio>) =>
    setEdicion((v) => (v ? { ...v, ...c } : v))

  // Con qué clase se abrió el formulario, para avisar solo si de verdad cambia.
  const yaEra = edicion
    ? ((roles.data ?? []).find((r) => r.codigo === edicion.codigo)?.a_la_medida ?? false)
    : false

  if (roles.isPending || permisos.isPending) return <Cargando />
  if (roles.error) return <ErrorDeCarga error={roles.error} />
  if (permisos.error) return <ErrorDeCarga error={permisos.error} />

  const nivelesPorRol = new Map<string, Map<string, Nivel>>()
  for (const p of permisos.data ?? []) {
    const mapa = nivelesPorRol.get(p.rol) ?? new Map<string, Nivel>()
    mapa.set(p.modulo, p.nivel)
    nivelesPorRol.set(p.rol, mapa)
  }

  /*
    El catálogo, agrupado por módulo, y las casillas de cada rol.

    Se arma una vez aquí y no dentro de cada tarjeta: con quince roles serían
    quince recorridos del mismo catálogo en cada pintado.
  */
  const accionesPorModulo = new Map<string, AccionDelSistema[]>()
  for (const a of acciones.data ?? []) {
    const lista = accionesPorModulo.get(a.modulo) ?? []
    lista.push(a)
    accionesPorModulo.set(a.modulo, lista)
  }

  const marcadasPorRol = new Map<string, Set<string>>()
  for (const ra of accionesDeRoles.data ?? []) {
    const set = marcadasPorRol.get(ra.rol) ?? new Set<string>()
    set.add(ra.accion)
    marcadasPorRol.set(ra.rol, set)
  }

  // De los que se ofrecen: los de obra no salen en la matriz, así que contarlos
  // aquí haría que la pista prometiera un resto que nadie ve.
  const sinCatalogo = (modulosTodos ?? []).filter(
    (m) => !esModuloEnObra(m.codigo) && (accionesPorModulo.get(m.codigo) ?? []).length === 0,
  ).length

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
        {/* Era un parrafo de seis lineas y Christopher lo señalo: «esto puede
            ser un hint, no es necesario expandir toda la informacion». Lo que
            hace falta saber de un vistazo cabe en una linea; el matiz de las
            firmas solo importa a quien se pregunta por que no las ve, y ese lo
            abre. */}
        <div className="max-w-2xl">
          <p className="text-ink/55 text-sm">
            Cada rol decide <strong className="text-ink/75 font-medium">a qué llega</strong> y{' '}
            <strong className="text-ink/75 font-medium">qué puede hacer</strong> ahí.
          </p>
          <button
            type="button"
            onClick={() => setVerMatices((v) => !v)}
            className="text-ink/45 hover:text-ink/75 mt-1 text-xs underline underline-offset-2"
          >
            {verMatices ? 'Vale' : '¿Qué no reparte?'}
          </button>
          {verMatices ? (
            <p className="text-ink/55 mt-2 text-xs leading-relaxed">
              Las firmas —aprobar una compra, aprobar una nomina— y la administracion del propio
              sistema. Eso cuelga de Gerente general y Administrador, para que quien arma un
              documento no sea quien lo aprueba.
            </p>
          ) : null}
        </div>
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
            marcadas={marcadasPorRol.get(r.codigo) ?? new Set()}
            accionesPorModulo={accionesPorModulo}
            sinCatalogo={sinCatalogo}
            editable={editable}
            onNivel={(modulo, nivel) =>
              guardarPermiso.mutate(
                { rol: r.codigo, modulo, nivel },
                { onError: (e: Error) => setError(e.message) },
              )
            }
            onAccion={(accion, marcada) =>
              marcarAccion.mutate(
                { rol: r.codigo, accion, marcada },
                { onError: (e: Error) => setError(e.message) },
              )
            }
            onEditar={() =>
              setEdicion({
                codigo: r.codigo,
                nombre: r.nombre,
                descripcion: r.descripcion,
                a_la_medida: r.a_la_medida,
                nuevo: false,
              })
            }
            onBorrar={() =>
              eliminarRol.mutate(r.codigo, {
                onError: (e: Error) => setError(e.message),
              })
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
                cambiarRol({
                  codigo: e.target.value.toUpperCase().replace(/\s/g, '_'),
                })
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

            {/* La decisión que de verdad importa, y por eso va con su
                explicación entera y no como un interruptor suelto. */}
            <div className="border-hairline rounded-card border p-3.5">
              <span className="text-ink/70 mb-2 block text-sm font-medium">
                Cómo se le dan los permisos
              </span>

              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="clase-de-rol"
                  checked={!edicion.a_la_medida}
                  onChange={() => cambiarRol({ a_la_medida: false })}
                  className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer"
                />
                <span className="min-w-0">
                  <span className="text-ink/85 block text-sm">Por módulo entero</span>
                  <span className="text-ink/50 block text-xs leading-relaxed">
                    Se le da un nivel en cada módulo: ninguno, lectura, escritura o total. Es
                    como funcionan los roles de siempre.
                  </span>
                </span>
              </label>

              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="radio"
                  name="clase-de-rol"
                  checked={edicion.a_la_medida}
                  onChange={() => cambiarRol({ a_la_medida: true })}
                  className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer"
                />
                <span className="min-w-0">
                  <span className="text-ink/85 block text-sm">Permiso por permiso</span>
                  <span className="text-ink/50 block text-xs leading-relaxed">
                    Se marca una por una cada cosa que puede hacer. Es lo que permite dejarle
                    ver un módulo sin poder modificarlo, o darle los papeles de la empresa sin
                    darle el respaldo de la base.
                  </span>
                </span>
              </label>

              {/* Cambiar de clase a un rol que ya lleva gente es lo que puede
                  dejar a alguien sin su pantalla el lunes por la mañana. */}
              {!edicion.nuevo && edicion.a_la_medida !== yaEra ? (
                <p className="text-warning mt-3 text-xs leading-relaxed">
                  {edicion.a_la_medida
                    ? 'Al detallarlo, en los módulos ya desglosados dejará de valer su nivel y solo valdrán las casillas que le marques. Empieza sin ninguna.'
                    : 'Al devolverlo a módulo entero, sus casillas dejan de decidir y vuelve a mandar el nivel de cada módulo.'}
                </p>
              ) : null}
            </div>
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

  /*
    De qué trabajador es cada cuenta.

    Va por su propia función de la base y no cruzando `empleados` desde aquí:
    esa tabla exige NOMINA:LECTURA y esta pantalla la ve quien tiene USUARIOS.
    Hoy coinciden; el día que no, el cruce se apagaría en silencio y la columna
    entera diría que ninguna cuenta tiene ficha.
  */
  const fichas = useFichasDeLasCuentas()
  const fichaPorPerfil = new Map((fichas.data ?? []).map((f) => [f.perfil_id, f]))
  const roles = useRoles()
  const crear = useCrearUsuario()
  const guardarPerfil = useGuardarPerfil()
  const asignarRoles = useAsignarRoles()
  const activar = useActivarUsuario()
  const archivar = useArchivarUsuario()
  const desarchivar = useDesarchivarUsuario()
  const cambiarClave = useCambiarClave()
  const { usuario: yo } = useSesion()

  /*
    Archivar no es solo del administrador: es una casilla —
    USUARIOS.ARCHIVAR_USUARIO— que se marca en un rol o se presta por permiso
    extendido. Por eso no cuelga de `editable`, que es ADMIN literal: quien
    tenga la casilla ve el botón aunque el resto de la pantalla le salga en solo
    lectura. El administrador la tiene siempre, porque pasa por encima de todas.
  */
  const acciones = useMisAcciones()
  const archiva = acciones.puede('USUARIOS.ARCHIVAR_USUARIO')

  const [edicion, setEdicion] = useState<
    (typeof usuarioVacio & { id?: string; nuevo: boolean }) | null
  >(null)
  const [clave, setClave] = useState<{
    id: string
    nombre: string
    valor: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cambiandoEstado, setCambiandoEstado] = useState<UsuarioSistema | null>(null)

  // En uso y archivados son dos listas, no un filtro: lo archivado no se mezcla
  // con lo que trabaja, que es justo lo que se pidió.
  const [apartado, setApartado] = useState<'en_uso' | 'archivados'>('en_uso')
  const [archivando, setArchivando] = useState<{
    cuenta: UsuarioSistema
    motivo: string
  } | null>(null)
  const [desarchivando, setDesarchivando] = useState<UsuarioSistema | null>(null)

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
            {
              onSuccess: () => setEdicion(null),
              onError: (e: Error) => setError(e.message),
            },
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

  const enUso = (usuarios.data ?? []).filter((u) => u.archivado_en === null)
  const archivados = (usuarios.data ?? []).filter((u) => u.archivado_en !== null)
  const lista = apartado === 'en_uso' ? enUso : archivados

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

      <div className="mb-3 flex gap-1" role="tablist" aria-label="Qué cuentas se listan">
        {(
          [
            { id: 'en_uso', etiqueta: 'En uso', n: enUso.length },
            { id: 'archivados', etiqueta: 'Archivados', n: archivados.length },
          ] as const
        ).map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={apartado === a.id}
            onClick={() => setApartado(a.id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              apartado === a.id
                ? 'bg-royal-600/12 text-royal-700 dark:text-royal-300'
                : 'text-ink/55 hover:text-ink/80',
            )}
          >
            {a.etiqueta} · {a.n}
          </button>
        ))}
      </div>

      {usuarios.data && usuarios.data.length === 0 ? (
        <Card>
          <Vacio
            icono={<UsersIcon />}
            titulo="No hay usuarios"
            descripcion="Ni siquiera el administrador. Algo falta por correr en la base."
          />
        </Card>
      ) : apartado === 'archivados' && archivados.length === 0 ? (
        <Card>
          <Vacio
            icono={<Archive />}
            titulo="Nada en el archivo"
            descripcion="Las cuentas que se archiven aparecen aquí, con su motivo y quién las archivó. Solo se archiva lo que ya está inactivo."
          />
        </Card>
      ) : (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-3 py-3 font-medium">Nombre</th>
                  <th className="px-3 py-3 font-medium">Cargo</th>
                  {apartado === 'en_uso' ? (
                    <>
                      <th className="px-3 py-3 font-medium">Ficha de personal</th>
                      <th className="px-3 py-3 font-medium">Roles</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3 font-medium">Archivado el</th>
                      <th className="px-3 py-3 font-medium">Motivo</th>
                    </>
                  )}
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => (
                  <tr
                    key={u.id}
                    className={cn(
                      'border-hairline border-b transition-colors last:border-0',
                      editable && apartado === 'en_uso' && 'hover:bg-ink/3 cursor-pointer',
                      !u.activo && 'opacity-55',
                    )}
                    onClick={() => (editable && apartado === 'en_uso' ? abrir(u) : undefined)}
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
                    {apartado === 'archivados' ? (
                      <>
                        <td className="text-ink/60 px-3 py-3">
                          {fecha(u.archivado_en!)}
                          <span className="text-ink/40 block text-xs">
                            por {u.archivado_por_nombre ?? '—'}
                          </span>
                        </td>
                        <td className="text-ink/60 px-3 py-3">{u.archivado_motivo}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Chip tone="neutral">Archivado</Chip>
                            {archiva ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<ArchiveRestore />}
                                aria-label={`Sacar del archivo a ${u.nombre}`}
                                title="Sacar del archivo"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setError(null)
                                  setDesarchivando(u)
                                }}
                              />
                            ) : null}
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3">
                          <FichaDeLaCuenta ficha={fichaPorPerfil.get(u.id)} />
                        </td>
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
                                title="Cambiar la clave"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setClave({
                                    id: u.id,
                                    nombre: u.nombre,
                                    valor: '',
                                  })
                                }}
                              />
                            ) : null}

                            {/* Un usuario no se borra: firmó cosas. Inactivar es
                            el equivalente — se queda sin permiso para nada y
                            su nombre sigue estando en lo que hizo. El botón va
                            aquí y no escondido dentro del formulario, que es
                            donde nadie lo encuentra el día que hay que cortarle
                            el acceso a alguien deprisa. */}
                            {editable && u.usuario !== yo ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={u.activo ? <UserX /> : <UserCheck />}
                                aria-label={`${u.activo ? 'Inactivar' : 'Reactivar'} a ${u.nombre}`}
                                title={u.activo ? 'Inactivar' : 'Reactivar'}
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setError(null)
                                  setCambiandoEstado(u)
                                }}
                              />
                            ) : null}

                            {/* Al archivo solo va lo que ya está apagado: el botón
                            aparece cuando la cuenta está inactiva, y solo para
                            quien tiene la casilla. Así la regla se ve antes de
                            chocar con ella. */}
                            {archiva && !u.activo && u.usuario !== yo ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={<Archive />}
                                aria-label={`Archivar a ${u.nombre}`}
                                title="Archivar"
                                onClick={(ev) => {
                                  ev.stopPropagation()
                                  setError(null)
                                  setArchivando({ cuenta: u, motivo: '' })
                                }}
                              />
                            ) : null}
                          </div>
                        </td>
                      </>
                    )}
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
                // Sin esto, el segundo clic manda la orden contraria: desactiva
                // y vuelve a activar, o al revés. Es el único botón del sistema
                // que hacía una escritura sin apagarse mientras corría.
                disabled={activar.isPending}
                onClick={() => {
                  const actual = usuarios.data?.find((u) => u.id === edicion.id)
                  activar.mutate(
                    { id: edicion.id!, activo: !actual?.activo },
                    { onSuccess: () => setEdicion(null), onError: (e: Error) => setError(e.message) },
                  )
                }}
              >
                {activar.isPending
                  ? 'Guardando…'
                  : usuarios.data?.find((u) => u.id === edicion.id)?.activo
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
                sinNormalizar
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

      {/* ---------- Inactivar y reactivar ---------- */}
      {cambiandoEstado ? (
        <Modal
          abierto
          onCerrar={() => setCambiandoEstado(null)}
          titulo={`${cambiandoEstado.activo ? 'Inactivar' : 'Reactivar'} a ${cambiandoEstado.nombre}`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setCambiandoEstado(null)}>
                Cancelar
              </Button>
              <Button
                variant={cambiandoEstado.activo ? 'danger' : 'primary'}
                disabled={activar.isPending}
                onClick={() =>
                  activar.mutate(
                    { id: cambiandoEstado.id, activo: !cambiandoEstado.activo },
                    {
                      onSuccess: () => {
                        setAviso(
                          `${cambiandoEstado.nombre} ${cambiandoEstado.activo ? 'quedó inactivo: sin permiso para nada' : 'vuelve a estar activo'}.`,
                        )
                        setCambiandoEstado(null)
                      },
                      onError: (e: Error) => setError(e.message),
                    },
                  )
                }
              >
                {cambiandoEstado.activo ? 'Inactivar' : 'Reactivar'}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {error ? (
              <div
                role="alert"
                className="border-danger/25 bg-danger-soft text-danger rounded-[6px] border p-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            {/* Un usuario nunca se borra. Su nombre está en las compras que
                pidió y en los pagos que hizo, y borrarlo dejaría documentos
                firmados por nadie. Inactivar le apaga los permisos y conserva
                todo lo demás.

                Y se dice lo que pasa de verdad: la clave sigue sirviendo para
                entrar y ver el sistema vacío. Lo que cierra la sesión es
                reponerle la clave. Antes aquí decía «deja de poder entrar», y
                era mentira: el catálogo de acciones lo explica al revés. */}
            <p className="text-ink/70 text-sm leading-relaxed">
              {cambiandoEstado.activo ? (
                <>
                  Se queda sin permiso para nada desde ya: si entra con su clave, ve el sistema
                  vacío. Lo que hizo hasta hoy se conserva entero: su nombre sigue en lo que pidió,
                  aprobó o pagó. Si se fue de malas, repónle además la clave desde la llave, que es
                  lo que le cierra la sesión. Una vez inactivo, se puede archivar.
                </>
              ) : (
                <>
                  Recupera sus roles y sus permisos con la misma clave que tenía. Si no la recuerda,
                  cámbiasela desde la llave.
                </>
              )}
            </p>
            <p className="text-ink/50 text-xs leading-relaxed">
              Los usuarios no se borran: un documento firmado por alguien que ya no existe no
              serviría de nada.
            </p>
          </div>
        </Modal>
      ) : null}

      {/* ---------- Archivar ---------- */}
      {archivando ? (
        <Modal
          abierto
          onCerrar={() => setArchivando(null)}
          titulo={`Archivar a ${archivando.cuenta.nombre}`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setArchivando(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={archivar.isPending || archivando.motivo.trim().length < 4}
                onClick={() =>
                  archivar.mutate(
                    {
                      id: archivando.cuenta.id,
                      motivo: archivando.motivo.trim(),
                    },
                    {
                      onSuccess: () => {
                        setAviso(`${archivando.cuenta.nombre} quedó en el archivo.`)
                        setArchivando(null)
                      },
                      onError: (e: Error) => setError(e.message),
                    },
                  )
                }
              >
                {archivar.isPending ? 'Archivando…' : 'Archivar'}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {error ? (
              <div
                role="alert"
                className="border-danger/25 bg-danger-soft text-danger rounded-[6px] border p-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            <p className="text-ink/70 text-sm leading-relaxed">
              Sale de la lista de en uso y queda en el archivo con la fecha, el motivo y tu nombre.
              Sigue sin poder hacer nada, igual que inactivo, y su nombre sigue en todo lo que
              firmó. Para volver a encenderlo habrá que sacarlo del archivo primero.
            </p>

            <Textarea
              label="Motivo"
              value={archivando.motivo}
              rows={2}
              onChange={(e) => setArchivando((v) => (v ? { ...v, motivo: e.target.value } : v))}
              hint="Es lo que va a leer quien lo busque dentro de un año."
            />
          </div>
        </Modal>
      ) : null}

      {/* ---------- Sacar del archivo ---------- */}
      {desarchivando ? (
        <Modal
          abierto
          onCerrar={() => setDesarchivando(null)}
          titulo={`Sacar del archivo a ${desarchivando.nombre}`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setDesarchivando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={desarchivar.isPending}
                onClick={() =>
                  desarchivar.mutate(
                    { id: desarchivando.id },
                    {
                      onSuccess: () => {
                        setAviso(`${desarchivando.nombre} volvió a la lista de en uso, inactivo.`)
                        setDesarchivando(null)
                        setApartado('en_uso')
                      },
                      onError: (e: Error) => setError(e.message),
                    },
                  )
                }
              >
                {desarchivar.isPending ? 'Sacando…' : 'Sacar del archivo'}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {error ? (
              <div
                role="alert"
                className="border-danger/25 bg-danger-soft text-danger rounded-[6px] border p-3 text-sm"
              >
                {error}
              </div>
            ) : null}

            {/* Sacar del archivo no es decidir que la persona vuelve a entrar.
                Vuelve inactiva, y encenderla es el botón del muñeco. */}
            <p className="text-ink/70 text-sm leading-relaxed">
              Vuelve a la lista de en uso, pero inactivo. Si tiene que volver a entrar, reactívalo
              aparte desde su fila.
            </p>
            {desarchivando.archivado_motivo ? (
              <p className="text-ink/50 text-xs leading-relaxed">
                Se archivó el {fecha(desarchivando.archivado_en!)} por{' '}
                {desarchivando.archivado_por_nombre ?? '—'}: «{desarchivando.archivado_motivo}».
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Autorizaciones: lo que se le extiende a una persona por encima de su rol
//
// La líder: «Coloca que Jesmary pueda aprobar las órdenes marcando un check que
// diga: Autorizada bajo autorización del gerente general».
//
// Christopher lo que hay detrás: «en usuarios, se pueda extender permisos que
// no competen a un rol, bajo una justificación». Por PERSONA y no por rol — el
// rol dice lo que compete al puesto; esto es lo que se le presta a alguien
// concreto mientras el gerente está de viaje, o para siempre si así se decide.
//
// La pestaña la manejan administración y la gerencia. Es la única de esta
// pantalla que el gerente general puede usar de verdad: las otras dos exigen el
// rol de administrador en la base, y a él le contestan que no.
// ---------------------------------------------------------------------------

function PestanaAutorizaciones({ gestionable }: { gestionable: boolean }) {
  const autorizaciones = useAutorizaciones()
  const usuarios = useUsuarios()
  const acciones = useAcciones()
  const conceder = useAutorizarVarias()
  const retirar = useRetirarAutorizacion()

  const [abierto, setAbierto] = useState(false)
  const [retirando, setRetirando] = useState<AutorizacionDelSistema | null>(null)
  const [motivoRetiro, setMotivoRetiro] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [forma, setForma] = useState({
    usuario_id: '',
    // Varias, y no una. Lo pidió Christopher: «en vez de agregar uno por uno,
    // la opción de marcar varios».
    acciones: [] as string[],
    motivo: '',
    desde: '',
    hasta: '',
  })
  const [busca, setBusca] = useState('')
  /** Lo que la base dejó fuera y por qué, para decirlo al cerrar. */
  const [omitidas, setOmitidas] = useState<{ accion: string; motivo: string }[]>([])

  const limpiar = () => {
    setForma({
      usuario_id: '',
      acciones: [],
      motivo: '',
      desde: '',
      hasta: '',
    })
    setBusca('')
    setError(null)
  }

  const marcar = (codigo: string) =>
    setForma((f) => ({
      ...f,
      acciones: f.acciones.includes(codigo)
        ? f.acciones.filter((x) => x !== codigo)
        : [...f.acciones, codigo],
    }))

  /*
    Solo las casillas que se pueden prestar.

    Las dos de repartir permisos las rechaza la base, así que ofrecerlas sería
    enseñar una puerta para que reviente al pulsarla. Y el respaldo tampoco
    entra: su casilla está apagada.
  */
  const NO_SE_PRESTAN = ['USUARIOS.DAR_PERMISOS', 'USUARIOS.ASIGNAR_ROLES']
  const prestables = (acciones.data ?? []).filter((a) => !NO_SE_PRESTAN.includes(a.codigo))

  /*
    Ciento cincuenta casillas en catorce módulos no caben en una lista pelada.

    Se filtran por lo que se escriba —nombre, módulo o lo que la casilla dice—
    y se agrupan por módulo, que es como la gente las busca: «lo de compras».
    El orden de los módulos es el que traiga el catálogo; reordenarlo aquí haría
    que esta pantalla y la matriz de permisos no se parecieran.
  */
  const porModulo = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const cabe = (a: (typeof prestables)[number]) =>
      !q ||
      a.nombre.toLowerCase().includes(q) ||
      (a.modulo_nombre ?? '').toLowerCase().includes(q) ||
      (a.dice ?? '').toLowerCase().includes(q)

    const mapa = new Map<string, typeof prestables>()
    for (const a of prestables) {
      if (!cabe(a)) continue
      const clave = a.modulo_nombre ?? a.modulo
      mapa.set(clave, [...(mapa.get(clave) ?? []), a])
    }
    return [...mapa.entries()]
  }, [prestables, busca])

  const opcionesPersona = (usuarios.data ?? [])
    .filter((u) => u.activo)
    .map((u) => ({
      valor: u.id,
      etiqueta: u.nombre,
      detalle: u.cargo ?? u.usuario,
    }))

  const guardar = () => {
    setError(null)
    setOmitidas([])
    conceder.mutate(
      {
        usuario_id: forma.usuario_id,
        acciones: forma.acciones,
        motivo: forma.motivo,
        desde: forma.desde || null,
        hasta: forma.hasta || null,
      },
      {
        onSuccess: (r) => {
          /*
            Si alguna se quedo fuera, el modal NO se cierra: se enseña cuales y
            por que. Cerrar diciendo «listo» habiendo extendido tres de cinco es
            como no decirlo — y las dos que faltan se descubren el dia que
            alguien no puede hacer lo que creia que podia.
          */
          if (r?.omitidas?.length) {
            setOmitidas(r.omitidas)
            setForma((f) => ({ ...f, acciones: [] }))
            return
          }
          setAbierto(false)
          setOmitidas([])
          limpiar()
        },
        onError: (e: Error) => setError(e.message),
      },
    )
  }

  if (autorizaciones.isPending) return <Cargando />
  if (autorizaciones.error) return <ErrorDeCarga error={autorizaciones.error} />

  const filas = autorizaciones.data ?? []
  const vivas = filas.filter((a) => a.vigente)
  const pasadas = filas.filter((a) => !a.vigente)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="text-ink/60 max-w-[62ch] text-sm">
          Un permiso que no le compete a alguien por su puesto, prestado por un tiempo o de forma
          indefinida. Lo que se firme usándolo queda diciendo de quién era la autoridad.
        </p>
        {gestionable ? (
          <Button icon={<Plus />} onClick={() => setAbierto(true)}>
            Extender un permiso
          </Button>
        ) : null}
      </div>

      {filas.length === 0 ? (
        <Vacio
          titulo="No hay permisos extendidos"
          descripcion="Cuando alguien tenga que hacer algo que no le compete —el gerente de viaje y una orden que no puede esperar— se le extiende desde aquí, con la razón escrita."
        />
      ) : (
        <div className="space-y-2.5">
          {[...vivas, ...pasadas].map((a) => (
            <Card key={a.id} flush className={cn('overflow-hidden', !a.vigente && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink/85 font-medium">{a.a_nombre}</span>
                    <Chip tone={a.vigente ? 'success' : 'neutral'}>
                      {a.vigente ? 'Vigente' : a.revocada_en ? 'Retirada' : 'Fuera de fecha'}
                    </Chip>
                  </div>

                  <p className="text-ink/70 mt-1 text-sm">
                    {a.accion_nombre}
                    <span className="text-ink/40"> · {a.modulo_nombre}</span>
                  </p>

                  <p className="text-ink/50 mt-1.5 text-xs">
                    Bajo autorización de <span className="text-ink/70">{a.por_nombre}</span>
                    {' · desde '}
                    {fecha(a.desde)}
                    {a.hasta ? ` hasta ${fecha(a.hasta)}` : ' · sin fecha de fin'}
                  </p>

                  <p className="text-ink/60 mt-1.5 text-sm italic">«{a.motivo}»</p>

                  {a.revocada_en ? (
                    <p className="text-ink/45 mt-1.5 text-xs">
                      Retirada por {a.revocada_nombre ?? '—'} el {fecha(a.revocada_en)}
                      {a.revocada_motivo ? ` · ${a.revocada_motivo}` : ''}
                    </p>
                  ) : null}
                </div>

                {gestionable && a.vigente ? (
                  <Button
                    variant="outline"
                    className="text-danger border-danger/30"
                    onClick={() => {
                      setRetirando(a)
                      setMotivoRetiro('')
                    }}
                  >
                    Retirar
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---------------- Extender ---------------- */}
      <Modal
        abierto={abierto}
        onCerrar={() => {
          setAbierto(false)
          limpiar()
        }}
        titulo="Extender un permiso"
        descripcion="Se le presta a una persona concreta una cosa concreta. Todo lo que firme con ella va a decir que fue bajo tu autorización."
        acciones={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setAbierto(false)
                limpiar()
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={
                conceder.isPending ||
                !forma.usuario_id ||
                forma.acciones.length === 0 ||
                forma.motivo.trim().length < 5
              }
              onClick={guardar}
            >
              {forma.acciones.length > 1
                ? `Extender las ${forma.acciones.length}`
                : 'Extender'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectBuscable
            label="A quién"
            opciones={opcionesPersona}
            valor={forma.usuario_id}
            onCambio={(v: string) => setForma((f) => ({ ...f, usuario_id: v }))}
            vacio="Elige a la persona"
          />

          {/*
            DE UNA EN UNA A MARCAR VARIAS.

            Antes era un buscador de una sola casilla, y prestarle cuatro cosas
            a la misma persona eran cuatro pasadas por el mismo formulario,
            escribiendo la misma justificación cada vez.

            Se conserva el buscador —con ciento cincuenta casillas hace falta—
            pero ahora filtra una lista de marcar, agrupada por módulo.
          */}
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-ink/80 text-sm font-medium">Qué se le extiende</span>
              {forma.acciones.length > 0 ? (
                <button
                  type="button"
                  className="text-royal-600 dark:text-royal-300 text-xs underline"
                  onClick={() => setForma((f) => ({ ...f, acciones: [] }))}
                >
                  {forma.acciones.length} marcada{forma.acciones.length === 1 ? '' : 's'} · quitar
                  todas
                </button>
              ) : null}
            </div>

            <Input
              label="Buscar"
              ocultarEtiqueta
              icon={<Search />}
              placeholder="Filtra por casilla o por módulo"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />

            <div className="border-hairline rounded-card mt-2 max-h-64 overflow-y-auto border">
              {porModulo.length === 0 ? (
                <p className="text-ink/45 p-3 text-sm">Ninguna casilla coincide.</p>
              ) : (
                porModulo.map(([modulo, lista]) => (
                  <div key={modulo}>
                    <p className="bg-canvas text-ink/50 text-2xs sticky top-0 px-3 py-1.5 tracking-wide uppercase">
                      {modulo}
                    </p>
                    {lista.map((a) => (
                      <label
                        key={a.codigo}
                        className="hover:bg-ink/4 flex cursor-pointer items-start gap-2.5 px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          className="accent-royal-600 mt-0.5 size-4 shrink-0"
                          checked={forma.acciones.includes(a.codigo)}
                          onChange={() => marcar(a.codigo)}
                        />
                        <span className="min-w-0">
                          <span className="text-ink/85 block text-sm">{a.nombre}</span>
                          {a.dice ? (
                            <span className="text-ink/45 block text-xs">{a.dice}</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>
            <p className="text-ink/45 mt-1.5 text-xs">
              Solo puedes extender lo que tú mismo puedes hacer. La misma justificación vale para
              todas las que marques.
            </p>
          </div>

          {/*
            Lo que la base dejó fuera. No es un error —las demás sí entraron—
            pero tampoco se puede callar: son casillas que alguien creyó haber
            extendido.
          */}
          {omitidas.length > 0 ? (
            <div className="border-warning/30 bg-warning-soft rounded-card border p-3">
              <p className="text-ink/80 text-sm font-medium">
                {omitidas.length === 1
                  ? 'Una no entró:'
                  : `${omitidas.length} no entraron:`}
              </p>
              <ul className="text-ink/70 mt-1.5 space-y-1 text-xs">
                {omitidas.map((o) => (
                  <li key={o.accion}>
                    <strong>{o.accion}</strong> — {o.motivo}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Desde"
              type="date"
              value={forma.desde}
              onChange={(e) => setForma((f) => ({ ...f, desde: e.target.value }))}
              hint="Vacío, desde hoy."
            />
            <Input
              label="Hasta"
              type="date"
              value={forma.hasta}
              onChange={(e) => setForma((f) => ({ ...f, hasta: e.target.value }))}
              hint="Vacío, indefinida."
            />
          </div>

          <Textarea
            label="Justificación"
            value={forma.motivo}
            onChange={(e) => setForma((f) => ({ ...f, motivo: e.target.value }))}
            rows={3}
            hint="Por qué hace falta. Dentro de un mes es lo único que va a explicar por qué esta persona pudo hacer esto."
          />

          {error ? <ErrorDeCarga error={new Error(error)} /> : null}
        </div>
      </Modal>

      {/* ---------------- Retirar ---------------- */}
      <Modal
        abierto={!!retirando}
        onCerrar={() => setRetirando(null)}
        titulo="Retirar el permiso"
        descripcion={
          retirando
            ? `${retirando.a_nombre} deja de poder «${retirando.accion_nombre}» en el acto. Lo que ya firmó con este permiso no se toca: sigue diciendo que fue bajo tu autorización.`
            : ''
        }
        acciones={
          <>
            <Button variant="ghost" onClick={() => setRetirando(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-danger hover:bg-danger/90"
              disabled={retirar.isPending}
              onClick={() =>
                retirando &&
                retirar.mutate(
                  { id: retirando.id, motivo: motivoRetiro },
                  {
                    onSuccess: () => setRetirando(null),
                    onError: (e: Error) => setError(e.message),
                  },
                )
              }
            >
              Retirar
            </Button>
          </>
        }
      >
        <Textarea
          label="Por qué se retira"
          value={motivoRetiro}
          onChange={(e) => setMotivoRetiro(e.target.value)}
          rows={2}
          hint="Opcional, pero ayuda a quien lea esto después."
        />
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export function Usuarios() {
  const [pestana, setPestana] = useState<'usuarios' | 'roles' | 'autorizaciones'>('usuarios')
  const { puede, isPending } = useMisRoles()

  // Administrar usuarios exige ADMIN en la base. Sin él la pantalla se lee,
  // porque saber quién puede qué no es secreto entre quienes ya entraron, pero
  // no se toca nada.
  const editable = puede('ADMIN')

  /*
    Las autorizaciones las manejan administración Y la gerencia.

    Es lo único de esta pantalla que el gerente general puede usar de verdad: la
    matriz le da el módulo entero, pero las funciones de las otras dos pestañas
    exigen el rol de administrador y le contestan que no. Aquí no, porque
    `autorizar_accion` admite a los dos — y tiene sentido, ya que la autoridad
    que se invoca en el papel es suya.
  */
  const gestionaAutorizaciones = puede('ADMIN', 'GERENTE_GENERAL')

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
            { id: 'autorizaciones', etiqueta: 'Permisos extendidos' },
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
      ) : pestana === 'roles' ? (
        <PestanaRoles editable={editable} />
      ) : (
        <PestanaAutorizaciones gestionable={gestionaAutorizaciones} />
      )}
    </>
  )
}

/*
  DE QUIÉN ES ESTA CUENTA.

  Tres estados y no dos, porque el tercero es el que sirve para algo:

  ATADA — la cuenta ya está unida a una ficha. Se dice y ya.

  SUGERIDA — no está atada, pero hay una ficha con SU MISMA CÉDULA. Es un
  vínculo pendiente que el sistema puede señalar, y por eso va teñido: es lo
  único de esta columna sobre lo que hay algo que hacer. Se ata desde la ficha
  del trabajador, que es donde vive el botón.

  NINGUNA — ni atada ni parecida. No se tiñe ni se marca: hay cuentas que no son
  de nadie del personal —administración, sistemas, un externo— y pintarlas como
  una carencia sería inventar trabajo que no existe. Es la misma razón por la
  que la ficha del trabajador calla cuando no tiene cuenta.
*/
function FichaDeLaCuenta({ ficha }: { ficha: FichaDeCuenta | undefined }) {
  if (!ficha) return <span className="text-ink/30">—</span>

  if (ficha.sugerida) {
    return (
      <span className="inline-flex flex-col">
        <span className="text-warning text-xs font-medium">Hay una ficha con su cédula</span>
        <span className="text-ink/60 tabular text-xs">
          {ficha.ficha} · {ficha.nombre}
        </span>
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col">
      <span className="text-ink/85 tabular text-xs font-medium">Ficha {ficha.ficha}</span>
      <span className="text-ink/50 text-xs">{ficha.nombre}</span>
    </span>
  )
}
