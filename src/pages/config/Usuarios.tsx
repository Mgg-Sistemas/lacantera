import { Fragment, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  KeyRound,
  Plus,
  ShieldCheck,
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
import { CampoDocumento } from '@/components/CampoDocumento'
import { CampoTelefono } from '@/components/CampoTelefono'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'
import { fecha } from '@/lib/formato'
import { useSesion } from '@/lib/sesion'
import { useMisRoles } from '@/lib/api/catalogo'
import { esModuloEnObra, PANTALLAS_DE_TELEFONO } from '@/config/navigation'
import { UsuariosAutorizados } from '@/pages/config/UsuariosAutorizados'
import {
  ConfirmarEliminarRol,
  GestionarRolesModal,
  NuevoRolModal,
} from '@/pages/config/RolesModales'
import {
  alcanza,
  nivelAlMarcar,
  useActivarUsuario,
  useArchivarUsuario,
  useDesarchivarUsuario,
  useMisAcciones,
  useAsignarRol,
  useCambiarClave,
  useCrearUsuario,
  useEliminarRol,
  useGuardarPerfil,
  useGuardarPermiso,
  useGuardarRol,
  useRestablecerRol,
  useModulos,
  usePermisos,
  useRoles,
  useAcciones,
  useAccionesDeLosRoles,
  useRolIncluye,
  useMarcarAccion,
  useUsuarios,
  useFichasDeLasCuentas,
  type FichaDeCuenta,
} from '@/lib/api/usuarios'
import type {
  AccionDelSistema,
  Nivel,
  RolSistema,
  UsuarioSistema,
} from '@/lib/api/usuarios'

// ---------------------------------------------------------------------------
// Matriz de un rol
// ---------------------------------------------------------------------------

const COLUMNAS: { nivel: Nivel; etiqueta: string; dice?: string }[] = [
  { nivel: 'LECTURA', etiqueta: 'Lectura' },
  { nivel: 'ESCRITURA', etiqueta: 'Escritura' },
  { nivel: 'TOTAL', etiqueta: 'Control total', dice: 'Implica lectura y escritura' },
]

/** El emoji de cada pantalla de teléfono, como se leen en MGG. */
const EMOJI_DE_PANTALLA: Record<string, string> = {
  'COMBUSTIBLE.SURTIDOR_TELEFONO': '⛽',
  'ALIMENTACION.COCINA_TELEFONO': '🍳',
  'INVENTARIO.ALMACEN_TELEFONO': '📦',
  'COMPRAS.TELEFONO': '🛒',
  'INVENTARIO.SOLICITUDES_TELEFONO': '📋',
}

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
  borrable,
  incluye,
  niveles,
  marcadas,
  accionesPorModulo,
  sinCatalogo,
  editable,
  onNivel,
  onAccion,
  onEditar,
  onBorrar,
  onRestablecer,
  onSoloTelefono,
}: {
  rol: RolSistema
  usuarios: number
  /** Como en MGG: se elimina solo un rol propio que nadie tiene asignado. */
  borrable: boolean
  /** Los nombres de los roles a los que equivale (un rol que junta varios). */
  incluye: string[]
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
  /** «↺ Por defecto»: la matriz guardada de fábrica. */
  onRestablecer: () => void
  onSoloTelefono: (solo: boolean) => void
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
  /*
    El respaldo no va en la tabla: es una sola casilla abajo, como en MGG.
    Lectura o escritura de una base entera no significan nada distinto.
  */
  const modulos = (todosLosModulos ?? []).filter(
    (m) => !esModuloEnObra(m.codigo) && m.codigo !== 'RESPALDO',
  )
  const nombreDeModulo = (codigo: string) =>
    (todosLosModulos ?? []).find((m) => m.codigo === codigo)?.nombre ?? codigo
  const conRespaldo = alcanza(niveles.get('RESPALDO') ?? 'NINGUNO', 'TOTAL')
  const pantallasMarcadas = PANTALLAS_DE_TELEFONO.filter((p) => marcadas.has(p.accion))

  // ADMIN no se recorta: es la salida de emergencia. Si se le pudiera cerrar
  // esta misma pantalla, no habría desde dónde volver a abrirla.
  const intocable = rol.codigo === 'ADMIN'

  /*
    LA TARJETA ENSEÑA SOLO LOS MÓDULOS A LOS QUE EL ROL LLEGA.

    Christopher, 05/10/2026: «cuando yo creo un nuevo rol, me da la lista
    completa de permisos; la idea es que se vea como los que ya están
    creados». Con veintitantos módulos, cada tarjeta era la matriz entera y
    un rol recién nacido salía como una sábana de casillas vacías.

    Ahora la fila de un módulo aparece cuando el rol tiene algo en él —su
    escalón, o alguna casilla si es detallado— y desaparece al quitárselo
    todo. Para abrirle un módulo nuevo está el selector de abajo: elegirlo lo
    pone en la tarjeta con las casillas en blanco, y ahí se marca lo que le
    toca. Si no se marca nada, al volver a entrar la fila ya no está, que es
    exactamente lo que significa no tener nada marcado.
  */
  const [abiertos, setAbiertos] = useState<string[]>([])

  /*
    Y LAS CASILLAS DE UN MÓDULO DETALLADO, PLEGADAS.

    Christopher, 05/10/2026: «que no sea una lista enorme, no con una fila
    infinita de permisos». En un rol detallado, cada módulo con catálogo
    desplegaba TODAS sus casillas —Compras son siete, Nómina once— y la
    tarjeta se volvía un rollo de cien renglones donde no se distinguía un
    módulo de otro. Ahora el módulo dice de un golpe cuántas tiene marcadas
    de cuántas, y las casillas se abren cuando se van a tocar.
  */
  const [desplegados, setDesplegados] = useState<string[]>([])

  const tieneAlgo = (codigo: string) => {
    const nivel = niveles.get(codigo) ?? 'NINGUNO'
    const suyas = accionesPorModulo.get(codigo) ?? []
    if (rol.a_la_medida && suyas.length > 0) return suyas.some((a) => marcadas.has(a.codigo))
    return nivel !== 'NINGUNO'
  }

  /*
    ACCIONES ESPECIALES (la dueña, 09/11/2026: «todo se manejará por la matriz»).

    Lo que antes se extendía o se restringía a una persona ahora es una casilla
    del rol. En un rol por módulo entero, el nivel ya abre buena parte de las
    acciones; aquí van las que su nivel NO abre en los módulos a los que llega:
    aprobar, firmar, las que ningún nivel concede. Marcarlas se la da a todos
    los que tienen este rol.
  */
  const deTelefono = new Set<string>(PANTALLAS_DE_TELEFONO.map((p) => p.accion))
  const especialesPorModulo = rol.a_la_medida
    ? []
    : modulos
        .map((m) => {
          const nivel = niveles.get(m.codigo) ?? 'NINGUNO'
          const lista = (accionesPorModulo.get(m.codigo) ?? []).filter(
            (a) =>
              !deTelefono.has(a.codigo) &&
              !(a.nivel_equivalente && alcanza(nivel, a.nivel_equivalente)),
          )
          return { modulo: m, nivel, lista }
        })
        .filter(
          (g) =>
            g.lista.length > 0 &&
            (g.nivel !== 'NINGUNO' || g.lista.some((a) => marcadas.has(a.codigo))),
        )
  const especialesMarcadas = especialesPorModulo.reduce(
    (n, g) => n + g.lista.filter((a) => marcadas.has(a.codigo)).length,
    0,
  )
  const [verEspeciales, setVerEspeciales] = useState(false)

  const visibles = modulos.filter((m) => tieneAlgo(m.codigo) || abiertos.includes(m.codigo))
  const cerrados = modulos.filter((m) => !tieneAlgo(m.codigo) && !abiertos.includes(m.codigo))

  return (
    <Card flush className="overflow-hidden">
      {/* El color del rol, como en MGG: se reconoce de un vistazo. */}
      <div className="h-1" style={{ backgroundColor: rol.color }} />

      <div className="border-hairline border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-ink/90 text-sm font-semibold tracking-wide uppercase">
                {rol.nombre}
              </h3>
              {rol.sistema ? <Chip tone="neutral">Sistema</Chip> : <Chip tone="success">Propio</Chip>}
              {rol.a_la_medida ? <Chip tone="royal">Detallado</Chip> : null}
              {rol.solo_telefono ? <Chip tone="warning">Solo teléfono</Chip> : null}
            </div>
            <p className="text-ink/55 mt-1.5 text-xs">{rol.descripcion}</p>
            {incluye.length > 0 ? (
              <p className="text-ink/45 mt-1 text-xs">
                Cuenta como: <span className="text-ink/65">{incluye.join(' · ')}</span>
              </p>
            ) : null}
            <p className="text-ink/45 mt-1 text-xs">
              {usuarios === 0
                ? 'Sin usuarios asignados'
                : `${usuarios} usuario${usuarios === 1 ? '' : 's'} asignado${usuarios === 1 ? '' : 's'}`}
            </p>
          </div>

          {editable && !intocable ? (
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onRestablecer}
                title="Volver este rol a sus permisos por defecto"
              >
                ↺ Por defecto
              </Button>
              <Button variant="ghost" size="sm" onClick={onEditar}>
                Editar
              </Button>
              {!rol.sistema && borrable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={onBorrar}
                  title="Eliminar este rol"
                  aria-label={`Eliminar el rol ${rol.nombre}`}
                >
                  🗑 Eliminar
                </Button>
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
                  title={c.dice}
                  className="px-2 py-2.5 text-center font-medium tracking-wider uppercase"
                >
                  {c.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => {
              const nivel = niveles.get(m.codigo) ?? 'NINGUNO'
              const suyas = accionesPorModulo.get(m.codigo) ?? []

              /*
                Detallado y con catálogo: mandan las casillas, y la escalera
                de ese módulo se apaga. Enseñarla encendida sería mentir — la
                base la ignora para estos roles, y alguien la marcaría creyendo
                que hace algo.
              */
              const porCasillas = rol.a_la_medida && suyas.length > 0
              const cuantasMarcadas = suyas.filter((a) => marcadas.has(a.codigo)).length
              const desplegado = desplegados.includes(m.codigo)

              return (
                <Fragment key={m.codigo}>
                  <tr className="border-hairline border-b last:border-0">
                    <td className="px-5 py-2.5">
                      <span className="text-ink/85 font-medium">{m.nombre}</span>
                      {porCasillas ? (
                        <span className="text-ink/40 ml-2 text-2xs">detallado</span>
                      ) : null}
                    </td>
                    {porCasillas ? (
                      /* En vez de tres puntos muertos y las casillas debajo: el
                         recuento, que es lo que se quiere saber de un vistazo, y
                         la puerta para abrirlas. */
                      <td colSpan={COLUMNAS.length} className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setDesplegados((xs) =>
                              xs.includes(m.codigo)
                                ? xs.filter((x) => x !== m.codigo)
                                : [...xs, m.codigo],
                            )
                          }
                          className="text-ink/55 hover:text-ink/85 mx-auto flex items-center gap-1.5 text-xs"
                          aria-expanded={desplegado}
                        >
                          <ChevronRight
                            className={cn('size-3.5 transition-transform', desplegado && 'rotate-90')}
                          />
                          <span className="tabular">
                            {cuantasMarcadas} de {suyas.length}
                          </span>
                          <span className="hidden sm:inline">
                            {desplegado ? 'casillas' : cuantasMarcadas === 1 ? 'casilla' : 'casillas'}
                          </span>
                        </button>
                      </td>
                    ) : (
                      COLUMNAS.map((c) => (
                        <td key={c.nivel} className="px-2 py-2.5 text-center">
                          <Casilla
                            marcada={alcanza(nivel, c.nivel)}
                            bloqueada={!editable || intocable}
                            etiqueta={`${c.etiqueta} en ${m.nombre} para ${rol.nombre}`}
                            onPulsar={() => onNivel(m.codigo, nivelAlMarcar(nivel, c.nivel))}
                          />
                        </td>
                      ))
                    )}
                  </tr>

                  {porCasillas && desplegado
                    ? suyas.map((a) => (
                        <tr key={a.codigo} className="border-hairline bg-ink/2 border-b last:border-0">
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

        {visibles.length === 0 ? (
          <p className="text-ink/45 px-5 py-6 text-center text-sm">
            {intocable
              ? 'Llega a todo sin necesitar filas aquí.'
              : 'Este rol no llega a ningún módulo todavía. Ábrale el primero con el selector de abajo.'}
          </p>
        ) : null}
      </div>

      {/* La puerta para abrirle un módulo que hoy no tiene: lo pone en la
          tarjeta con las casillas en blanco, y ahí se marca lo que le toca. */}
      {editable && !intocable && cerrados.length > 0 ? (
        <div className="border-hairline border-t px-5 py-3">
          <SelectBuscable
            label="Darle acceso a otro módulo"
            vacio="Elija el módulo…"
            valor=""
            onCambio={(codigo) => {
              if (codigo) setAbiertos((xs) => (xs.includes(codigo) ? xs : [...xs, codigo]))
            }}
            opciones={cerrados.map((m) => ({ valor: m.codigo, etiqueta: m.nombre }))}
          />
        </div>
      ) : null}

      {especialesPorModulo.length > 0 ? (
        <div className="border-hairline border-t px-5 py-3">
          <button
            type="button"
            onClick={() => setVerEspeciales((v) => !v)}
            aria-expanded={verEspeciales}
            className="text-ink/70 hover:text-ink/90 flex w-full items-center gap-1.5 text-left text-xs font-medium tracking-wider uppercase"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform', verEspeciales && 'rotate-90')}
            />
            ⭐ Acciones especiales
            <span className="text-ink/45 tabular ml-auto font-normal normal-case">
              {especialesMarcadas} marcada{especialesMarcadas === 1 ? '' : 's'}
            </span>
          </button>
          {verEspeciales ? (
            <div className="mt-2 space-y-3">
              <p className="text-ink/50 text-xs">
                Lo que su nivel en el módulo no abre. Marcada, la tienen todos los usuarios con este
                rol.
              </p>
              {especialesPorModulo.map((g) => (
                <div key={g.modulo.codigo}>
                  <span className="text-ink/60 block text-2xs font-medium tracking-wider uppercase">
                    {g.modulo.nombre}
                  </span>
                  <div className="mt-1 space-y-1.5">
                    {g.lista.map((a) => (
                      <label key={a.codigo} className="flex cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={marcadas.has(a.codigo)}
                          disabled={!editable || intocable}
                          onChange={(e) => onAccion(a.codigo, e.target.checked)}
                          className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <span className="min-w-0">
                          <span className="text-ink/85 block text-sm">{a.nombre}</span>
                          {a.dice ? (
                            <span className="text-ink/50 block text-xs">{a.dice}</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/*
        PANTALLAS DE TELÉFONO Y RESPALDO, COMO EN MGG.

        Una pantalla de teléfono no da acceso a los datos: hace falta además
        la lectura de su módulo. Por eso se avisa cuando falta.
      */}
      {intocable ? (
        <p className="text-ink/55 border-hairline border-t px-5 py-3 text-xs">
          📱 Todas las pantallas de teléfono y 💾 el respaldo de la base de datos: incluidos siempre
          para el administrador.
        </p>
      ) : (
        <div className="border-hairline space-y-3 border-t px-5 py-3">
          <div>
            <span className="text-ink/70 block text-xs font-medium tracking-wider uppercase">
              📱 Pantallas de teléfono
            </span>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PANTALLAS_DE_TELEFONO.map((p) => {
                const modulo = p.accion.split('.')[0]
                const marcada = marcadas.has(p.accion)
                const sinModulo = marcada && (niveles.get(modulo) ?? 'NINGUNO') === 'NINGUNO'
                return (
                  <label key={p.accion} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      checked={marcada}
                      disabled={!editable}
                      onChange={(e) => onAccion(p.accion, e.target.checked)}
                      className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <span className="min-w-0">
                      <span className="text-ink/85 flex items-center gap-1.5 text-sm">
                        {EMOJI_DE_PANTALLA[p.accion] ? (
                          <span aria-hidden="true">{EMOJI_DE_PANTALLA[p.accion]}</span>
                        ) : (
                          <p.icon className="size-3.5" />
                        )}
                        {p.label}
                      </span>
                      {sinModulo ? (
                        <span className="text-warning block text-xs">
                          No se abre: falta lectura en {nombreDeModulo(modulo)}.
                        </span>
                      ) : null}
                    </span>
                  </label>
                )
              })}
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={rol.solo_telefono}
                disabled={!editable}
                onChange={(e) => onSoloTelefono(e.target.checked)}
                className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <span>
                <span className="text-ink/85 block text-sm font-medium">Solo teléfono</span>
                <span className="text-ink/50 block text-xs">
                  Entra directo a sus pantallas de teléfono y no ve las de escritorio.
                </span>
                {rol.solo_telefono && pantallasMarcadas.length === 0 ? (
                  <span className="text-danger block text-xs">
                    Sin pantallas marcadas, este rol no tiene nada que abrir.
                  </span>
                ) : null}
              </span>
            </label>
          </div>

          <label className="border-hairline flex cursor-pointer items-start gap-2 border-t pt-3">
            <input
              type="checkbox"
              checked={conRespaldo}
              disabled={!editable}
              onChange={(e) => onNivel('RESPALDO', e.target.checked ? 'TOTAL' : 'NINGUNO')}
              className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <span>
              <span className="text-ink/85 block text-sm">💾 Respaldo de la base de datos</span>
              <span className="text-ink/50 block text-xs">
                Permite generar, descargar y enviar por correo el respaldo de la base de datos.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* Los módulos que todavía no tienen catálogo se rigen por su escalón
          aunque el rol esté detallado. Hay que decirlo o el rol parece roto:
          alguien buscaría las casillas de Compras y no las encontraría.

          Y cómo se vuelve: un rol detallado se creó así casi siempre sin
          querer, y desde la tarjeta no se adivina que «Editar» lo devuelve a
          la escalera de niveles. */}
      {rol.a_la_medida ? (
        <p className="text-ink/45 border-hairline border-t px-5 py-3 text-xs leading-relaxed">
          {sinCatalogo > 0 ? (
            <>
              {sinCatalogo === 1
                ? 'Queda un módulo sin desglosar en acciones: ese sigue rigiéndose por su escalón.'
                : `Quedan ${sinCatalogo} módulos sin desglosar en acciones: esos siguen rigiéndose por su escalón.`}{' '}
            </>
          ) : null}
          {editable && !intocable ? (
            <>
              Este rol se reparte permiso por permiso. Para manejarlo con los niveles de siempre
              —lectura, escritura, control total—, entre en <strong>Editar</strong> y elija{' '}
              <strong>Por módulo entero</strong>.
            </>
          ) : null}
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
  color: '#64748b',
  solo_telefono: false,
}

function PestanaRoles({ editable }: { editable: boolean }) {
  const roles = useRoles()
  const permisos = usePermisos()
  const usuarios = useUsuarios()
  const guardarPermiso = useGuardarPermiso()
  const { data: modulosTodos } = useModulos()
  const acciones = useAcciones()
  const accionesDeRoles = useAccionesDeLosRoles()
  const rolIncluye = useRolIncluye()
  const marcarAccion = useMarcarAccion()
  const guardarRol = useGuardarRol()
  const eliminarRol = useEliminarRol()
  const restablecer = useRestablecerRol()

  const [buscar, setBuscar] = useState('')
  const [borrando, setBorrando] = useState<RolSistema | null>(null)
  const [gestionando, setGestionando] = useState(false)
  const [creando, setCreando] = useState(false)

  const [edicion, setEdicion] = useState<typeof rolVacio | null>(null)
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

  const nombreDeRol = (codigo: string) =>
    (roles.data ?? []).find((r) => r.codigo === codigo)?.nombre ?? codigo
  const incluyePorRol = new Map<string, string[]>()
  for (const ri of rolIncluye.data ?? []) {
    const lista = incluyePorRol.get(ri.rol) ?? []
    lista.push(nombreDeRol(ri.incluye))
    incluyePorRol.set(ri.rol, lista)
  }

  // Los activos, para decirlo en la tarjeta; todos, para saber si se puede
  // borrar (la base no deja borrar un rol que alguien tiene, activo o no).
  const cuentaPorRol = new Map<string, number>()
  const asignadosPorRol = new Map<string, number>()
  for (const u of usuarios.data ?? []) {
    for (const r of u.roles) {
      asignadosPorRol.set(r, (asignadosPorRol.get(r) ?? 0) + 1)
      if (u.activo) cuentaPorRol.set(r, (cuentaPorRol.get(r) ?? 0) + 1)
    }
  }

  /*
    El guardado es automático, casilla por casilla, como en MGG: se dice en
    qué va para que nadie busque un botón de Guardar.
  */
  const enCurso = [guardarPermiso, marcarAccion, guardarRol, restablecer]
  const estadoGuardado = enCurso.some((m) => m.isPending)
    ? '⏳ Guardando…'
    : enCurso.some((m) => m.isError)
      ? '⚠ Error al guardar'
      : enCurso.some((m) => m.isSuccess)
        ? '✓ Guardado automáticamente'
        : '💾 Los cambios se guardan automáticamente'

  const q = buscar.trim().toLowerCase()
  const todos = roles.data ?? []
  const filtrados = q
    ? todos.filter((r) => `${r.nombre} ${r.codigo} ${r.descripcion}`.toLowerCase().includes(q))
    : todos

  const editar = (r: RolSistema) =>
    setEdicion({
      codigo: r.codigo,
      nombre: r.nombre,
      descripcion: r.descripcion,
      a_la_medida: r.a_la_medida,
      color: r.color,
      solo_telefono: r.solo_telefono,
    })

  const guardar = () => {
    if (!edicion) return
    setError(null)
    guardarRol.mutate(edicion, {
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
          <h2 className="text-ink/90 text-base font-semibold">🛡 Roles y permisos</h2>
          <p className="text-ink/55 mt-1 text-sm">
            Defina qué puede hacer cada rol en cada módulo. Puede crear roles nuevos y eliminar los
            que no tengan usuarios asignados.
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
              Las firmas —aprobar una compra, aprobar una nómina— y la administración del propio
              sistema. Eso cuelga de Gerente general y Administrador, para que quien arma un
              documento no sea quien lo aprueba.
            </p>
          ) : null}
        </div>
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink/50 text-xs" aria-live="polite">
              {estadoGuardado}
            </span>
            <Button variant="outline" onClick={() => setGestionando(true)}>
              ⚙ Gestionar
            </Button>
            <Button icon={<Plus />} onClick={() => setCreando(true)}>
              Nuevo rol
            </Button>
          </div>
        ) : null}
      </div>

      {/* Quién aprueba compras y salidas: una lista por persona (MGG). */}
      <UsuariosAutorizados editable={editable} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-[220px] flex-1 sm:max-w-sm">
          <Input
            label="Buscar rol"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="🔍 Por nombre o descripción…"
          />
        </div>
        <span className="text-ink/50 mt-5 text-xs">
          {filtrados.length} de {todos.length} rol{todos.length === 1 ? '' : 'es'}
        </span>
        {buscar ? (
          <Button variant="ghost" size="sm" className="mt-5" onClick={() => setBuscar('')}>
            ✕ Limpiar
          </Button>
        ) : null}
      </div>

      {q && filtrados.length === 0 ? (
        <p className="text-ink/50 mb-4 text-sm">Ningún rol coincide con «{buscar.trim()}».</p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {filtrados.map((r) => (
          <TarjetaRol
            key={r.codigo}
            rol={r}
            usuarios={cuentaPorRol.get(r.codigo) ?? 0}
            borrable={(asignadosPorRol.get(r.codigo) ?? 0) === 0}
            incluye={incluyePorRol.get(r.codigo) ?? []}
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
            onEditar={() => editar(r)}
            onBorrar={() => setBorrando(r)}
            onRestablecer={() =>
              restablecer.mutate(r.codigo, { onError: (e: Error) => setError(e.message) })
            }
            onSoloTelefono={(solo) =>
              guardarRol.mutate(
                {
                  codigo: r.codigo,
                  nombre: r.nombre,
                  descripcion: r.descripcion,
                  solo_telefono: solo,
                },
                { onError: (e: Error) => setError(e.message) },
              )
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

      <ConfirmarEliminarRol
        rol={borrando}
        onCerrar={() => setBorrando(null)}
        pendiente={eliminarRol.isPending}
        onConfirmar={(r) =>
          eliminarRol.mutate(r.codigo, {
            onSuccess: () => setBorrando(null),
            onError: (e: Error) => {
              setBorrando(null)
              setError(e.message)
            },
          })
        }
      />

      <GestionarRolesModal abierto={gestionando} onCerrar={() => setGestionando(false)} />

      <NuevoRolModal abierto={creando} onCerrar={() => setCreando(false)} />

      <Modal
        abierto={edicion !== null}
        onCerrar={() => setEdicion(null)}
        titulo="Editar rol"
        descripcion="La clave no cambia."
        acciones={
          <>
            <Button variant="ghost" onClick={() => setEdicion(null)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardarRol.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        {edicion ? (
          <div className="space-y-4">
            <Input label="Clave" value={edicion.codigo} disabled />
            <Input
              label="Nombre"
              maxLength={60}
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

            <div className="flex flex-wrap items-center gap-5">
              <label className="text-ink/70 flex items-center gap-2 text-sm">
                Color
                <input
                  type="color"
                  value={edicion.color}
                  onChange={(e) => cambiarRol({ color: e.target.value })}
                  className="border-ink/20 h-8 w-12 cursor-pointer rounded border bg-transparent"
                />
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={edicion.solo_telefono}
                  onChange={(e) => cambiarRol({ solo_telefono: e.target.checked })}
                  className="accent-royal-600 mt-0.5 size-4 shrink-0 cursor-pointer"
                />
                <span>
                  <span className="text-ink/85 block text-sm">📱 Solo teléfono</span>
                  <span className="text-ink/50 block text-xs">
                    Trabaja desde las pantallas de teléfono de sus módulos; no ve las de escritorio.
                  </span>
                </span>
              </label>
            </div>

            {/*
              La clase del rol (por módulo entero o permiso por permiso) se
              elige solo al EDITAR, a sabiendas: el alta («Nuevo rol», como en
              MGG) nace siempre por niveles (Christopher, 05/10/2026).
            */}
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
                  <span className="text-ink/85 block text-sm">
                    Por módulo entero
                    <span className="text-ink/45 ml-1.5 text-xs">— lo normal</span>
                  </span>
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
                  <span className="text-ink/85 block text-sm">
                    Permiso por permiso
                    <span className="text-ink/45 ml-1.5 text-xs">— para el caso raro</span>
                  </span>
                  <span className="text-ink/50 block text-xs leading-relaxed">
                    Se marca una por una cada cosa que puede hacer, y la escalera del módulo
                    deja de valer: lo que no esté marcado no lo hace por ningún camino. Para
                    darle algo que su nivel no abre no hace falta esto: basta con sus acciones
                    especiales.
                  </span>
                </span>
              </label>

              {/* Cambiar de clase a un rol que ya lleva gente es lo que puede
                  dejar a alguien sin su pantalla el lunes por la mañana. */}
              {edicion.a_la_medida !== yaEra ? (
                <p className="text-warning mt-3 text-xs leading-relaxed">
                  {edicion.a_la_medida
                    ? 'Al detallarlo, en los módulos ya desglosados dejará de valer su nivel y solo valdrán las casillas que le marque. Empieza sin ninguna.'
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
  /** Un usuario, un rol (la dueña, 09/11/2026). */
  rol: 'BASICO',
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
  const asignarRol = useAsignarRol()
  const activar = useActivarUsuario()
  const archivar = useArchivarUsuario()
  const desarchivar = useDesarchivarUsuario()
  const cambiarClave = useCambiarClave()
  const { usuario: yo } = useSesion()

  /*
    Archivar no es solo del administrador: es una casilla —
    USUARIOS.ARCHIVAR_USUARIO— que se marca en la matriz del rol. Por eso no cuelga de `editable`, que es ADMIN literal: quien
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

  // Buscar y filtrar por rol y estado, como en MGG.
  const [buscar, setBuscar] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  // «+ Nuevo» y «⚙» al lado del rol, como en MGG: el rol se crea sin salir
  // de la ficha y queda elegido.
  const [creandoRol, setCreandoRol] = useState(false)
  const [gestionandoRoles, setGestionandoRoles] = useState(false)

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
            rol: u.roles[0] ?? '',
            nuevo: false,
          }
        : { ...usuarioVacio, nuevo: true },
    )

  const guardar = () => {
    if (!edicion) return
    setError(null)

    if (!edicion.rol) {
      setError('Elija su rol. Un usuario sin rol no puede hacer nada.')
      return
    }

    if (edicion.nuevo) {
      crear.mutate(edicion, {
        onSuccess: () => {
          setEdicion(null)
          setAviso(`Usuario ${edicion.usuario} creado. Dígale la clave en persona, no por escrito.`)
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
          asignarRol.mutate(
            { id: edicion.id!, rol: edicion.rol },
            {
              onSuccess: () => setEdicion(null),
              onError: (e: Error) => setError(e.message),
            },
          ),
        onError: (e: Error) => setError(e.message),
      },
    )
  }

  const nombreDeRol = (codigo: string) =>
    roles.data?.find((r) => r.codigo === codigo)?.nombre ?? codigo

  const enUso = (usuarios.data ?? []).filter((u) => u.archivado_en === null)
  const archivados = (usuarios.data ?? []).filter((u) => u.archivado_en !== null)
  const q = buscar.trim().toLowerCase()
  const lista = (apartado === 'en_uso' ? enUso : archivados)
    .filter((u) => !filtroRol || u.roles.includes(filtroRol))
    .filter(
      (u) =>
        apartado !== 'en_uso' ||
        !filtroEstado ||
        (filtroEstado === 'activo' ? u.activo : !u.activo),
    )
    .filter(
      (u) =>
        !q ||
        `${u.usuario} ${u.nombre} ${u.cedula ?? ''} ${u.roles.map(nombreDeRol).join(' ')}`
          .toLowerCase()
          .includes(q),
    )
  const colorDeRol = (codigo: string) =>
    roles.data?.find((r) => r.codigo === codigo)?.color ?? '#64748b'
  const rolElegido = edicion ? roles.data?.find((r) => r.codigo === edicion.rol) : undefined

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <p className="text-ink/55 max-w-2xl text-sm">
          Las cuentas las crea la administración: no hay registro abierto. Quien entra lo hace con
          nombre de usuario, no con correo.
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

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px_180px] sm:items-end">
        <Input
          label="Buscar"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="🔍 Por usuario, nombre, cédula o rol…"
        />
        <SelectBuscable
          label="Rol"
          vacio="Todos los roles"
          valor={filtroRol}
          onCambio={setFiltroRol}
          opciones={(roles.data ?? []).map((r) => ({ valor: r.codigo, etiqueta: r.nombre }))}
        />
        {apartado === 'en_uso' ? (
          <SelectBuscable
            label="Estado"
            vacio="Todos los estados"
            valor={filtroEstado}
            onCambio={setFiltroEstado}
            opciones={[
              { valor: 'activo', etiqueta: 'Activos' },
              { valor: 'inactivo', etiqueta: 'Inactivos' },
            ]}
          />
        ) : null}
      </div>

      {usuarios.data && usuarios.data.length === 0 ? (
        <Card>
          <Vacio
            icono={<UsersIcon />}
            titulo="Sin usuarios"
          />
        </Card>
      ) : (apartado === 'archivados' ? archivados : enUso).length > 0 && lista.length === 0 ? (
        <Card>
          <Vacio icono={<UsersIcon />} titulo="Ningún usuario coincide con el filtro" />
        </Card>
      ) : apartado === 'archivados' && archivados.length === 0 ? (
        <Card>
          <Vacio
            icono={<Archive />}
            titulo="Archivo vacío"
            descripcion="Las cuentas archivadas aparecen aquí con su motivo y el usuario que las archivó. Solo se archivan cuentas inactivas."
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
                  {apartado === 'en_uso' ? (
                    <>
                      <th className="px-3 py-3 font-medium">Ficha de personal</th>
                      <th className="px-3 py-3 font-medium">Rol</th>
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
                          Usted
                        </Chip>
                      ) : null}
                    </td>
                    <td className="text-ink/85 px-3 py-3 font-medium">{u.nombre}</td>
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
                          {u.roles.length === 0 ? (
                            <span className="text-ink/40">Sin rol</span>
                          ) : (
                            <Chip tone={u.roles[0] === 'ADMIN' ? 'safety' : 'neutral'}>
                              <span
                                className="mr-1.5 inline-block size-2 rounded-full align-middle"
                                style={{ backgroundColor: colorDeRol(u.roles[0]) }}
                                aria-hidden="true"
                              />
                              {nombreDeRol(u.roles[0])}
                            </Chip>
                          )}
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
            ? 'Su rol decide a qué llega. Se puede cambiar después.'
            : 'El nombre de usuario no cambia.'
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
                maxLength={32}
                onChange={(e) =>
                  // Solo lo que acepta la base: ^[a-z0-9._-]{3,32}$ (08/11/2026).
                  cambiar({ usuario: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })
                }
                hint={edicion.nuevo ? 'De 3 a 32 caracteres: letras, números, punto y guion.' : undefined}
                placeholder="p.ramirez"
              />
              <Input
                label="Nombre y apellido"
                solo="letras"
                maxLength={120}
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
                maxLength={72}
                onChange={(e) => cambiar({ clave: e.target.value })}
                hint="Mínimo 8 caracteres. Désela en persona y que la cambie."
              />
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Cargo"
                maxLength={80}
                value={edicion.cargo}
                onChange={(e) => cambiar({ cargo: e.target.value })}
                placeholder="Jefe de taller"
              />
              {/* Aqui vivia el problema medido: seis perfiles guardaban la
                  cedula SIN la letra —«12460702»— mientras `empleados` la
                  guardaba con ella, asi que ninguno cruzaba con su propia ficha
                  de trabajador. */}
              <CampoDocumento
                label="Cédula"
                valor={edicion.cedula}
                onCambiar={(v) => cambiar({ cedula: v })}
              />
              <CampoTelefono
                valor={edicion.telefono}
                onCambiar={(v) => cambiar({ telefono: v })}
              />
            </div>

            {/* Un solo rol por usuario (la dueña, 09/11/2026): sus permisos son
                la matriz de ese rol, en «Roles y permisos». Como en MGG: el
                rol se elige de la lista y al lado están «+ Nuevo» y «⚙». */}
            <div>
              <div className="flex items-end gap-1.5">
                <SelectBuscable
                  label="Tipo de rol"
                  className="flex-1"
                  valor={edicion.rol}
                  onCambio={(v) => cambiar({ rol: v })}
                  opciones={(roles.data ?? []).map((r) => ({
                    valor: r.codigo,
                    etiqueta: r.nombre,
                    detalle: r.descripcion || undefined,
                  }))}
                />
                <Button
                  variant="outline"
                  onClick={() => setCreandoRol(true)}
                  title="Crear un rol nuevo"
                >
                  + Nuevo
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setGestionandoRoles(true)}
                  title="Editar nombre, descripción o color de los roles"
                  aria-label="Gestionar roles"
                >
                  ⚙
                </Button>
              </div>
              {rolElegido ? (
                <p className="text-ink/50 mt-1.5 flex items-start gap-1.5 text-xs">
                  <span
                    className="mt-1 inline-block size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: rolElegido.color }}
                    aria-hidden="true"
                  />
                  <span>
                    {rolElegido.descripcion || 'Sin descripción.'}
                    {rolElegido.solo_telefono ? ' · 📱 Solo teléfono' : ''}
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Se montan después de la ficha para quedar por encima de ella. */}
      <NuevoRolModal
        abierto={creandoRol}
        onCerrar={() => setCreandoRol(false)}
        onCreado={(codigo) => cambiar({ rol: codigo })}
      />
      <GestionarRolesModal abierto={gestionandoRoles} onCerrar={() => setGestionandoRoles(false)} />

      {/* ---------- Clave ---------- */}
      <Modal
        abierto={clave !== null}
        onCerrar={() => setClave(null)}
        titulo="Cambiar la clave"
        descripcion={clave ? `La clave de ${clave.nombre}. Désela en persona.` : undefined}
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
              maxLength={72}
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
                  aprobó o pagó. Si se fue de malas, repóngale además la clave desde la llave, que es
                  lo que le cierra la sesión. Una vez inactivo, se puede archivar.
                </>
              ) : (
                <>
                  Recupera sus roles y sus permisos con la misma clave que tenía. Si no la recuerda,
                  cámbiesela desde la llave.
                </>
              )}
            </p>
            <p className="text-ink/50 text-xs leading-relaxed">
              Los usuarios no se borran.
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
              Sale de la lista de en uso y queda en el archivo con la fecha, el motivo y su nombre.
              Sigue sin poder hacer nada, igual que inactivo, y su nombre sigue en todo lo que
              firmó. Para volver a encenderlo habrá que sacarlo del archivo primero.
            </p>

            <Textarea
              label="Motivo"
              value={archivando.motivo}
              rows={2}
              onChange={(e) => setArchivando((v) => (v ? { ...v, motivo: e.target.value } : v))}
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
              Vuelve a la lista de en uso, pero inactivo. Si tiene que volver a entrar, reactívelo
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
// Pantalla
// ---------------------------------------------------------------------------

export function Usuarios() {
  const [pestana, setPestana] = useState<'usuarios' | 'roles'>('usuarios')
  const { puede, isPending } = useMisRoles()

  // Administrar usuarios exige ADMIN en la base. Sin él la pantalla se lee,
  // porque saber quién puede qué no es secreto entre quienes ya entraron, pero
  // no se toca nada.
  const editable = puede('ADMIN')

  /*
    Ya no hay «Permisos extendidos» ni «Permisos restringidos» (la dueña,
    09/11/2026): «todo se manejará por la matriz». Lo que una persona puede
    hacer es la matriz de su único rol.
  */
  return (
    <>
      <PageHeader
        title="Usuarios y roles"
        description={
          pestana === 'usuarios'
            ? 'Cree cuentas, corrija sus datos, cambie claves y habilite o inhabilite accesos.'
            : 'La matriz de permisos de cada rol, módulo por módulo.'
        }
      />

      {!isPending && !editable ? (
        <div className="border-warning/30 bg-warning-soft text-warning mb-5 flex items-start gap-2.5 rounded-[6px] border p-3 text-sm">
          <ShieldCheck className="mt-px size-[18px] shrink-0" />
          <span>
            Está viendo esta pantalla en solo lectura. Crear usuarios y cambiar permisos lo hace
            quien tiene el rol de administrador del sistema.
          </span>
        </div>
      ) : null}

      <div className="border-hairline mb-5 flex gap-1 border-b">
        {(
          [
            { id: 'usuarios', etiqueta: '👤 Usuarios' },
            { id: 'roles', etiqueta: '🛡 Roles y permisos' },
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
