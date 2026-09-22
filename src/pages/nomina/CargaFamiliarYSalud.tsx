import { useState } from 'react'
import { HeartPulse, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import {
  edadEnAnios,
  useEliminarCondicionDeSalud,
  useEliminarFamiliar,
  useFamiliaresDeEmpleado,
  useGuardarCondicionDeSalud,
  useGuardarFamiliar,
  useParentescos,
  useSaludDeEmpleado,
  useTiposCondicionSalud,
  type CondicionDeSalud,
  type FamiliarDeEmpleado,
} from '@/lib/api/nomina'
import { fecha as fmtFecha } from '@/lib/formato'

/*
  LA CARGA FAMILIAR Y LA SALUD DEL TRABAJADOR

  Encargo del 22/09/2026, para poder filtrar el personal por carga familiar,
  por quién tiene personas a su cargo y por quién declara alguna condición.

  DOS TARJETAS Y NO UNA. Son dos preguntas distintas —a quién mantiene, y qué
  padece— y mezclarlas en una lista obligaría a leer una columna de tipo para
  saber qué se está mirando. Van juntas en este archivo porque comparten la
  misma maquinaria de alta y baja, no porque sean lo mismo.

  LA EDAD SE CALCULA, NO SE GUARDA. La tabla tiene `fecha_nacimiento`. Una edad
  almacenada es falsa a los doce meses y nadie vuelve a entrar a corregirla.

  QUIÉN DEPENDE SE MARCA UNO A UNO. Lo pidió así el encargo: «individualmente
  se deberá indicar quién sí depende, sobreentendiendo que quien no sea
  indicado, no depende». De ahí que la casilla nazca apagada.
*/

const vacioFamiliar = {
  id: undefined as number | undefined,
  nombres: '',
  apellidos: '',
  parentesco: 'HIJO',
  fecha_nacimiento: '',
  cedula: '',
  depende: false,
  nota: '',
}

const vacioSalud = {
  id: undefined as number | undefined,
  tipo: 'ALERGIA',
  descripcion: '',
  detalle: '',
  desde: '',
}

export function CargaFamiliarYSalud({
  empleadoId,
  puedeEditar,
}: {
  empleadoId: number
  puedeEditar: boolean
}) {
  return (
    <>
      <LaCargaFamiliar empleadoId={empleadoId} puedeEditar={puedeEditar} />
      <LaSalud empleadoId={empleadoId} puedeEditar={puedeEditar} />
    </>
  )
}

// ─── Carga familiar ─────────────────────────────────────────────────────────

function LaCargaFamiliar({
  empleadoId,
  puedeEditar,
}: {
  empleadoId: number
  puedeEditar: boolean
}) {
  const familiares = useFamiliaresDeEmpleado(empleadoId)
  const parentescos = useParentescos()
  const guardar = useGuardarFamiliar()
  const quitar = useEliminarFamiliar()

  const [editando, setEditando] = useState<typeof vacioFamiliar | null>(null)
  const [quitando, setQuitando] = useState<FamiliarDeEmpleado | null>(null)

  const lista = familiares.data ?? []
  const dependen = lista.filter((f) => f.depende).length
  const nombreParentesco = (codigo: string) =>
    (parentescos.data ?? []).find((p) => p.codigo === codigo)?.nombre ?? codigo

  const abrirNuevo = () => setEditando({ ...vacioFamiliar })
  const abrirEdicion = (f: FamiliarDeEmpleado) =>
    setEditando({
      id: f.id,
      nombres: f.nombres,
      apellidos: f.apellidos,
      parentesco: f.parentesco,
      fecha_nacimiento: f.fecha_nacimiento ?? '',
      cedula: f.cedula ?? '',
      depende: f.depende,
      nota: f.nota ?? '',
    })

  return (
    <>
      <Card className="mt-4">
        <CardHeader
          title="Carga familiar"
          subtitle="Quién es de su familia y a quién mantiene. Solo quien esté marcado cuenta como dependiente."
          action={
            puedeEditar ? (
              <Button size="sm" variant="outline" icon={<Plus />} onClick={abrirNuevo}>
                Agregar familiar
              </Button>
            ) : null
          }
        />

        {familiares.isPending ? (
          <Cargando />
        ) : familiares.error ? (
          <ErrorDeCarga error={familiares.error} />
        ) : lista.length === 0 ? (
          <p className="text-ink/45 mt-4 text-sm">No tiene carga familiar cargada.</p>
        ) : (
          <>
            {/* El resumen arriba porque es lo que se pregunta: no «quiénes
                son» sino «cuántos mantiene». */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip icon={<Users />}>
                {lista.length} {lista.length === 1 ? 'familiar' : 'familiares'}
              </Chip>
              <Chip tone={dependen > 0 ? 'info' : 'neutral'}>
                {dependen === 0
                  ? 'Ninguno depende de él'
                  : `${dependen} ${dependen === 1 ? 'depende' : 'dependen'} de él`}
              </Chip>
            </div>

            <ul className="divide-hairline mt-4 divide-y">
              {lista.map((f) => {
                const anios = edadEnAnios(f.fecha_nacimiento)
                return (
                  <li key={f.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {f.apellidos}, {f.nombres}
                        <span className="text-ink/50 font-normal">
                          {' '}
                          · {nombreParentesco(f.parentesco)}
                        </span>
                      </p>
                      <p className="text-ink/45 text-xs">
                        {[
                          anios !== null ? `${anios} años` : null,
                          f.fecha_nacimiento ? `n. ${fmtFecha(f.fecha_nacimiento)}` : null,
                          f.cedula,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Sin más datos'}
                        {f.nota ? <span className="block">{f.nota}</span> : null}
                      </p>
                    </div>

                    {f.depende ? <Chip tone="info">Depende</Chip> : null}

                    {puedeEditar ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil />}
                          onClick={() => abrirEdicion(f)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 />}
                          disabled={quitar.isPending}
                          onClick={() => setQuitando(f)}
                        >
                          Quitar
                        </Button>
                      </>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {quitar.error ? <ErrorDeCarga error={quitar.error} /> : null}
      </Card>

      <Modal
        abierto={quitando !== null}
        onCerrar={() => setQuitando(null)}
        titulo="Quitar de la carga familiar"
        descripcion={
          quitando
            ? `${quitando.nombres} ${quitando.apellidos} deja de figurar en la ficha. Queda el rastro en auditoría.`
            : undefined
        }
        acciones={
          <>
            <Button variant="ghost" onClick={() => setQuitando(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={quitar.isPending}
              onClick={() => {
                if (!quitando) return
                quitar.mutate(quitando.id, { onSuccess: () => setQuitando(null) })
              }}
            >
              {quitar.isPending ? 'Quitando…' : 'Quitar'}
            </Button>
          </>
        }
      >
        <p className="text-ink/70 text-sm">
          Si además dependía de él, deja de contar como dependiente. Se puede volver a agregar.
        </p>
      </Modal>

      {editando ? (
        <Modal
          abierto
          onCerrar={() => setEditando(null)}
          titulo={editando.id ? 'Editar familiar' : 'Agregar familiar'}
          descripcion="La cédula es opcional: los menores no la tienen. La edad se calcula sola de la fecha de nacimiento."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  guardar.isPending ||
                  !editando.nombres.trim() ||
                  !editando.apellidos.trim() ||
                  !editando.parentesco
                }
                onClick={() =>
                  guardar.mutate(
                    {
                      id: editando.id,
                      empleado_id: empleadoId,
                      nombres: editando.nombres,
                      apellidos: editando.apellidos,
                      parentesco: editando.parentesco,
                      fecha_nacimiento: editando.fecha_nacimiento || null,
                      cedula: editando.cedula || null,
                      depende: editando.depende,
                      nota: editando.nota || null,
                    },
                    { onSuccess: () => setEditando(null) },
                  )
                }
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nombres"
              value={editando.nombres}
              onChange={(e) => setEditando({ ...editando, nombres: e.target.value })}
            />
            <Input
              label="Apellidos"
              value={editando.apellidos}
              onChange={(e) => setEditando({ ...editando, apellidos: e.target.value })}
            />
            <Select
              label="Parentesco"
              value={editando.parentesco}
              onChange={(e) => setEditando({ ...editando, parentesco: e.target.value })}
              opciones={(parentescos.data ?? []).map((p) => ({
                valor: p.codigo,
                etiqueta: p.nombre,
              }))}
            />
            <Input
              label="Fecha de nacimiento"
              type="date"
              hint="De aquí sale la edad. No se guarda la edad."
              value={editando.fecha_nacimiento}
              onChange={(e) => setEditando({ ...editando, fecha_nacimiento: e.target.value })}
            />
            <Input
              label="Cédula"
              placeholder="V-12345678"
              hint="Opcional"
              value={editando.cedula}
              onChange={(e) => setEditando({ ...editando, cedula: e.target.value.toUpperCase() })}
            />
            <label className="text-ink/70 flex cursor-pointer items-center gap-2 pb-2 text-sm select-none sm:pt-7">
              <input
                type="checkbox"
                className="accent-royal-600 size-4"
                checked={editando.depende}
                onChange={(e) => setEditando({ ...editando, depende: e.target.checked })}
              />
              Depende económicamente del trabajador
            </label>
            <div className="sm:col-span-2">
              <Textarea
                label="Nota"
                rows={2}
                value={editando.nota}
                onChange={(e) => setEditando({ ...editando, nota: e.target.value })}
              />
            </div>
          </div>

          {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
        </Modal>
      ) : null}
    </>
  )
}

// ─── Salud ──────────────────────────────────────────────────────────────────

function LaSalud({ empleadoId, puedeEditar }: { empleadoId: number; puedeEditar: boolean }) {
  const salud = useSaludDeEmpleado(empleadoId)
  const tipos = useTiposCondicionSalud()
  const guardar = useGuardarCondicionDeSalud()
  const quitar = useEliminarCondicionDeSalud()

  const [editando, setEditando] = useState<typeof vacioSalud | null>(null)
  const [quitando, setQuitando] = useState<CondicionDeSalud | null>(null)

  const lista = salud.data ?? []
  const nombreTipo = (codigo: string) =>
    (tipos.data ?? []).find((t) => t.codigo === codigo)?.nombre ?? codigo

  return (
    <>
      <Card className="mt-4">
        <CardHeader
          title="Salud"
          subtitle="Alergias, patologías y discapacidades declaradas. Solo lo ve quien pueda ver el personal."
          action={
            puedeEditar ? (
              <Button
                size="sm"
                variant="outline"
                icon={<Plus />}
                onClick={() => setEditando({ ...vacioSalud })}
              >
                Agregar condición
              </Button>
            ) : null
          }
        />

        {salud.isPending ? (
          <Cargando />
        ) : salud.error ? (
          <ErrorDeCarga error={salud.error} />
        ) : lista.length === 0 ? (
          <p className="text-ink/45 mt-4 text-sm">No tiene ninguna condición declarada.</p>
        ) : (
          <ul className="divide-hairline mt-4 divide-y">
            {lista.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <HeartPulse className="text-ink/30 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {c.descripcion}
                    <span className="text-ink/50 font-normal"> · {nombreTipo(c.tipo)}</span>
                  </p>
                  <p className="text-ink/45 text-xs">
                    {[c.desde ? `Desde ${fmtFecha(c.desde)}` : null, c.detalle]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                {puedeEditar ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil />}
                      onClick={() =>
                        setEditando({
                          id: c.id,
                          tipo: c.tipo,
                          descripcion: c.descripcion,
                          detalle: c.detalle ?? '',
                          desde: c.desde ?? '',
                        })
                      }
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 />}
                      disabled={quitar.isPending}
                      onClick={() => setQuitando(c)}
                    >
                      Quitar
                    </Button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {quitar.error ? <ErrorDeCarga error={quitar.error} /> : null}
      </Card>

      <Modal
        abierto={quitando !== null}
        onCerrar={() => setQuitando(null)}
        titulo="Quitar la condición"
        descripcion={
          quitando
            ? `«${quitando.descripcion}» deja de figurar en la ficha. Queda el rastro en auditoría.`
            : undefined
        }
        acciones={
          <>
            <Button variant="ghost" onClick={() => setQuitando(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={quitar.isPending}
              onClick={() => {
                if (!quitando) return
                quitar.mutate(quitando.id, { onSuccess: () => setQuitando(null) })
              }}
            >
              {quitar.isPending ? 'Quitando…' : 'Quitar'}
            </Button>
          </>
        }
      >
        <p className="text-ink/70 text-sm">
          Deja de contar para el filtro de salud. Se puede volver a agregar.
        </p>
      </Modal>

      {editando ? (
        <Modal
          abierto
          onCerrar={() => setEditando(null)}
          titulo={editando.id ? 'Editar condición' : 'Agregar condición'}
          descripcion="Escribe cuál es: «tiene una alergia» no sirve ni para avisar a un médico."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={guardar.isPending || !editando.descripcion.trim()}
                onClick={() =>
                  guardar.mutate(
                    {
                      id: editando.id,
                      empleado_id: empleadoId,
                      tipo: editando.tipo,
                      descripcion: editando.descripcion,
                      detalle: editando.detalle || null,
                      desde: editando.desde || null,
                    },
                    { onSuccess: () => setEditando(null) },
                  )
                }
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Clase"
              value={editando.tipo}
              onChange={(e) => setEditando({ ...editando, tipo: e.target.value })}
              opciones={(tipos.data ?? []).map((t) => ({ valor: t.codigo, etiqueta: t.nombre }))}
            />
            <Input
              label="Desde"
              type="date"
              hint="Opcional"
              value={editando.desde}
              onChange={(e) => setEditando({ ...editando, desde: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Cuál es"
                placeholder="Penicilina · Asma · Hipoacusia del oído derecho"
                value={editando.descripcion}
                onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Textarea
                label="Detalle"
                rows={2}
                hint="Lo que haga falta saber en una emergencia"
                value={editando.detalle}
                onChange={(e) => setEditando({ ...editando, detalle: e.target.value })}
              />
            </div>
          </div>

          {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
        </Modal>
      ) : null}
    </>
  )
}
