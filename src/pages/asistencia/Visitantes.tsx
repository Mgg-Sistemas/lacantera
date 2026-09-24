import { useMemo, useState } from 'react'
import { Download, LogIn, LogOut, Pencil, TriangleAlert, Users } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useContactos } from '@/lib/api/contactos'
import { useEmpleados } from '@/lib/api/nomina'
import { useMisPermisos } from '@/lib/api/usuarios'
import {
  aFechaHoraLocal,
  datosDeVisita,
  datosDeVisitante,
  deFechaHoraLocal,
  duracion,
  esVisitanteRepetido,
  horaDe,
  useAnularVisita,
  useCerrarVisita,
  useCorregirVisita,
  useGuardarVisitante,
  useRegistrarVisita,
  useVisitantes,
  useVisitas,
  useVisitasAdentro,
  visitaVacia,
  visitanteVacio,
  type DatosVisita,
  type DatosVisitante,
  type Visita,
  type Visitante,
} from '@/lib/api/asistencia'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  LOS VISITANTES

  Christopher, 24/09/2026: «gestionar a los que no forman parte de nómina, pero
  vienen de visita», y después: «¿y si ya un visitante está registrado? No lo
  quiero registrar, sino marcar su entrada».

  EL VISITANTE ES UNA PERSONA CONOCIDA. Marcar entrada es buscarlo y pulsar;
  registrarlo es solo la primera vez, y ahí la base niega el repetido por
  cédula o teléfono, con la casilla «es otra persona» para pasar si de verdad
  lo es. Cada visita apunta a la persona, con la misma lógica que la jornada
  del personal: entrada y salida juntas, y la hora la pone la base.

  Arriba, quién está ADENTRO ahora mismo, con el botón de salida al lado: eso
  es lo que la garita mira todo el día. Debajo, las visitas del día elegido en
  el calendario, para corregir o anular.
*/

export function Visitantes({ hoy, dia, mes }: { hoy: string; dia: string | null; mes: string }) {
  const { puede } = useMisPermisos()
  const puedeRegistrar = puede('ASISTENCIA', 'ESCRITURA')
  const puedeAnular = puede('ASISTENCIA', 'TOTAL')

  const [marcando, setMarcando] = useState(false)
  const [conocidos, setConocidos] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<Visita | null>(null)
  const [cerrando, setCerrando] = useState<Visita | null>(null)
  const [anulando, setAnulando] = useState<Visita | null>(null)

  const adentro = useVisitasAdentro()
  const delMes = useVisitas(`${mes}-01`, `${mes}-31`)
  const delDia = useMemo(() => (delMes.data ?? []).filter((v) => v.fecha === dia), [delMes.data, dia])
  const vivas = adentro.data ?? []
  const deHoy = vivas.filter((v) => v.fecha === hoy)
  const olvidadas = vivas.filter((v) => v.fecha !== hoy)

  const exportar = () => {
    const filas = (delMes.data ?? []).filter((v) => v.estado !== 'ANULADA')
    bajarArchivo(
      escribirXlsx({
        nombre: 'Visitantes',
        columnas: [
          { titulo: 'FECHA', ancho: 12 },
          { titulo: 'ENTRADA', ancho: 9 },
          { titulo: 'SALIDA', ancho: 9 },
          { titulo: 'NOMBRE', ancho: 30 },
          { titulo: 'DOCUMENTO', ancho: 14 },
          { titulo: 'EMPRESA', ancho: 26 },
          { titulo: 'TELEFONO', ancho: 15 },
          { titulo: 'VISITA A', ancho: 30 },
          { titulo: 'MOTIVO', ancho: 30 },
          { titulo: 'PLACA', ancho: 10 },
          { titulo: 'NOTA', ancho: 30 },
        ],
        filas: filas.map((v) => [
          v.fecha,
          horaDe(v.entrada),
          v.salida ? horaDe(v.salida) : '',
          v.nombre,
          v.documento,
          v.empresa,
          v.telefono,
          v.visitado,
          v.motivo,
          v.placa,
          v.nota,
        ]),
      }),
      `visitantes-${mes}.xlsx`,
    )
  }

  return (
    <Card className="mt-4">
      <CardHeader
        title="Visitantes"
        subtitle={
          adentro.isPending
            ? 'Gente de afuera que entró a la cantera.'
            : `${deHoy.length} adentro ahora${olvidadas.length ? ` · ${olvidadas.length} de otros días sin salida` : ''}. Gente de afuera: no entra a la nómina.`
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<Download />} onClick={exportar} disabled={!delMes.data?.length}>
              Excel del mes
            </Button>
            <Button size="sm" variant="outline" icon={<Users />} onClick={() => setConocidos(true)}>
              Conocidos
            </Button>
            {puedeRegistrar ? (
              <Button size="sm" icon={<LogIn />} onClick={() => setMarcando(true)}>
                Marcar entrada
              </Button>
            ) : null}
          </div>
        }
      />

      {adentro.isPending ? (
        <Cargando />
      ) : adentro.error ? (
        <ErrorDeCarga error={adentro.error} />
      ) : vivas.length === 0 ? (
        <p className="text-ink/45 mt-4 text-sm">No hay visitantes adentro.</p>
      ) : (
        <div className="mt-4">
          <p className="text-ink/55 mb-2 text-xs font-medium tracking-wide uppercase">Adentro ahora</p>
          <ul className="divide-hairline divide-y">
            {vivas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <div className="min-w-48 flex-1">
                  <p className="text-ink/85 text-sm font-medium">
                    {v.nombre}
                    {v.empresa ? <span className="text-ink/45 font-normal"> · {v.empresa}</span> : null}
                  </p>
                  <p className="text-ink/50 text-xs">
                    {[v.visitado ? `Visita a ${v.visitado}` : null, v.motivo, v.placa ? `placa ${v.placa}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-ink/60 tabular shrink-0 text-xs">
                  {v.fecha === hoy ? `desde las ${horaDe(v.entrada)}` : `entró el ${fmtFecha(v.fecha)} a las ${horaDe(v.entrada)}`}
                </span>
                {v.fecha !== hoy ? (
                  <Chip tone="warning" icon={<TriangleAlert />}>
                    Sin salida
                  </Chip>
                ) : null}
                {puedeRegistrar ? (
                  <Button size="sm" variant="soft" icon={<LogOut />} onClick={() => setCerrando(v)}>
                    Salida
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dia ? (
        <div className="mt-5">
          <p className="text-ink/55 mb-1 text-xs font-medium tracking-wide uppercase">
            Visitas del {fmtFecha(dia)}
            {dia === hoy ? ' · hoy' : ''}
          </p>
          {delMes.isPending ? (
            <Cargando />
          ) : delDia.length === 0 ? (
            <p className="text-ink/40 text-sm">Ninguna.</p>
          ) : (
            <ListaDeVisitas
              visitas={delDia}
              puedeCorregir={puedeRegistrar}
              puedeAnular={puedeAnular}
              onCorregir={setCorrigiendo}
              onAnular={setAnulando}
            />
          )}
        </div>
      ) : null}

      {marcando ? <MarcarEntrada onCerrar={() => setMarcando(false)} /> : null}
      {conocidos ? <VisitantesConocidos puedeEditar={puedeRegistrar} onCerrar={() => setConocidos(false)} /> : null}
      {corrigiendo ? <CorregirVisita visita={corrigiendo} onCerrar={() => setCorrigiendo(null)} /> : null}
      {cerrando ? <CerrarVisita visita={cerrando} onCerrar={() => setCerrando(null)} /> : null}
      {anulando ? <AnularVisita visita={anulando} onCerrar={() => setAnulando(null)} /> : null}
    </Card>
  )
}

function ListaDeVisitas({
  visitas,
  puedeCorregir,
  puedeAnular,
  onCorregir,
  onAnular,
}: {
  visitas: Visita[]
  puedeCorregir: boolean
  puedeAnular: boolean
  onCorregir: (v: Visita) => void
  onAnular: (v: Visita) => void
}) {
  return (
    <ul className="divide-hairline divide-y">
      {visitas.map((v) => (
        <li key={v.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5', v.estado === 'ANULADA' && 'opacity-50')}>
          <div className="min-w-48 flex-1">
            <p className="text-ink/85 text-sm font-medium">
              {v.nombre}
              {v.documento ? <span className="text-ink/45 font-normal"> · {v.documento}</span> : null}
            </p>
            <p className="text-ink/50 text-xs">
              {[v.empresa, v.visitado ? `visita a ${v.visitado}` : null, v.motivo, v.placa ? `placa ${v.placa}` : null, v.nota]
                .filter(Boolean)
                .join(' · ')}
              {v.estado === 'ANULADA' ? ` · anulada: ${v.motivo_anulacion}` : ''}
              {v.corregido_en ? ' · corregida' : ''}
            </p>
          </div>
          <span className="tabular text-ink/85 text-sm">
            {horaDe(v.entrada)} → {v.salida ? horaDe(v.salida) : '—'}
          </span>
          <span className="tabular text-ink/60 w-20 text-right text-sm">{v.estado === 'ADENTRO' ? 'adentro' : duracion(v.minutos)}</span>
          {v.estado === 'ADENTRO' ? (
            <Chip tone="info">Adentro</Chip>
          ) : v.estado === 'SALIO' ? (
            <Chip tone="neutral">Salió</Chip>
          ) : (
            <Chip tone="danger">Anulada</Chip>
          )}
          {v.estado !== 'ANULADA' && puedeCorregir ? (
            <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => onCorregir(v)}>
              Corregir
            </Button>
          ) : null}
          {v.estado !== 'ANULADA' && puedeAnular ? (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => onAnular(v)}>
              Anular
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/* ─────────────────────────────────────────────────────────── la persona */

const etiquetaDe = (p: Visitante) => ({
  valor: String(p.id),
  etiqueta: p.nombre,
  detalle: [p.documento, p.empresa, p.telefono, p.adentro ? 'ADENTRO AHORA' : null].filter(Boolean).join(' · '),
})

/**
 * Los campos de la persona, que se usan al registrar a un visitante nuevo y
 * al editar a uno conocido. El directorio de contactos rellena nombre, cédula,
 * empresa y teléfono; quien no lee Contactos no ve ese selector.
 */
function CamposDeVisitante({ d, onCambio }: { d: DatosVisitante; onCambio: (d: DatosVisitante) => void }) {
  const { puede } = useMisPermisos()
  const leeContactos = puede('CONTACTOS', 'LECTURA')
  const { data: contactos } = useContactos()
  const pon = (k: keyof DatosVisitante) => (e: { target: { value: string } }) => onCambio({ ...d, [k]: e.target.value })

  const tomarDelDirectorio = (id: string) => {
    const c = (contactos ?? []).find((x) => String(x.id) === id)
    onCambio({
      ...d,
      contacto_id: id,
      nombre: c ? c.nombre : d.nombre,
      documento: c ? (c.documento ?? '') : d.documento,
      empresa: c ? (c.empresa ?? c.empresa_nombre ?? '') : d.empresa,
      telefono: c ? (c.celular ?? c.whatsapp ?? c.telefono_oficina ?? '') : d.telefono,
    })
  }

  return (
    <>
      {leeContactos ? (
        <SelectBuscable
          label="Del directorio de contactos"
          vacio="Buscar por nombre, empresa o teléfono… (opcional)"
          valor={d.contacto_id}
          onCambio={tomarDelDirectorio}
          opciones={(contactos ?? []).map((c) => ({
            valor: String(c.id),
            etiqueta: c.nombre,
            detalle: [c.empresa ?? c.empresa_nombre, c.celular ?? c.whatsapp].filter(Boolean).join(' · '),
          }))}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre" value={d.nombre} onChange={pon('nombre')} placeholder="Nombre y apellido" />
        <Input label="Cédula o pasaporte" value={d.documento} onChange={pon('documento')} placeholder="V-12345678" />
        <Input label="Empresa" value={d.empresa} onChange={pon('empresa')} placeholder="De dónde viene" />
        <Input label="Teléfono" value={d.telefono} onChange={pon('telefono')} placeholder="0414-1234567" />
      </div>
    </>
  )
}

function CasillaRepetido({ marcada, onCambio }: { marcada: boolean; onCambio: (v: boolean) => void }) {
  return (
    <label className="text-ink/75 flex items-center gap-2 text-sm">
      <input type="checkbox" checked={marcada} onChange={(e) => onCambio(e.target.checked)} />
      Es otra persona: registrarlo igual
    </label>
  )
}

/* ─────────────────────────────────────────────────────────── ventanas */

/**
 * Marcar la entrada: al que ya vino se le busca; el nuevo se registra ahí
 * mismo, una sola vez. Con la entrada vacía, la hora la pone la base.
 */
function MarcarEntrada({ onCerrar }: { onCerrar: () => void }) {
  const registrar = useRegistrarVisita()
  const { data: visitantes } = useVisitantes()
  const { data: empleados } = useEmpleados(true)

  const [nuevo, setNuevo] = useState(false)
  const [persona, setPersona] = useState<DatosVisitante>(visitanteVacio)
  const [v, setV] = useState<DatosVisita>(visitaVacia)
  const [entrada, setEntrada] = useState('')
  const [salida, setSalida] = useState('')
  const [aunque, setAunque] = useState(false)
  const pon = (k: keyof DatosVisita) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }))

  const elegido = (visitantes ?? []).find((p) => String(p.id) === v.visitante_id)
  const alReves = Boolean(entrada && salida && salida <= entrada)
  const falta = nuevo ? !persona.nombre.trim() && !persona.contacto_id : !v.visitante_id
  const repetido = esVisitanteRepetido(registrar.error)

  const guardar = () =>
    registrar.mutate(
      {
        visita: { ...v, visitante_id: nuevo ? '' : v.visitante_id, entrada: deFechaHoraLocal(entrada) ?? '', salida: deFechaHoraLocal(salida) ?? '' },
        visitante: nuevo ? persona : undefined,
        aunqueParezcaRepetido: aunque,
      },
      { onSuccess: onCerrar },
    )

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Marcar la entrada de un visitante"
      descripcion="Al que ya vino se le busca y se le marca. Al nuevo se le registra aquí mismo, una sola vez."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={falta || alReves || registrar.isPending} onClick={guardar}>
            {registrar.isPending ? 'Guardando…' : nuevo ? 'Registrar y marcar entrada' : 'Marcar entrada'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {nuevo ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-ink/90 text-sm font-medium">Visitante nuevo</p>
              <Button size="sm" variant="ghost" onClick={() => setNuevo(false)}>
                Ya vino antes: buscarlo
              </Button>
            </div>
            <CamposDeVisitante d={persona} onCambio={setPersona} />
          </>
        ) : (
          <div className="space-y-2">
            <SelectBuscable
              label="Visitante"
              vacio="Busca por nombre, cédula, empresa o teléfono…"
              valor={v.visitante_id}
              onCambio={(id) => setV((x) => ({ ...x, visitante_id: id }))}
              opciones={(visitantes ?? []).filter((p) => p.activo).map(etiquetaDe)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink/50 text-xs">
                {elegido
                  ? `${elegido.visitas} visita${elegido.visitas === 1 ? '' : 's'}${elegido.ultima_visita ? `, la última el ${fmtFecha(elegido.ultima_visita.slice(0, 10))}` : ''}${elegido.adentro ? ' · está adentro ahora' : ''}`
                  : 'Si no aparece, es la primera vez que viene.'}
              </p>
              <Button size="sm" variant="ghost" onClick={() => setNuevo(true)}>
                Es nuevo: registrarlo
              </Button>
            </div>
          </div>
        )}

        <SelectBuscable
          label="A quién visita"
          vacio="Alguien del personal (opcional)"
          valor={v.visita_a}
          onCambio={(id) => setV((x) => ({ ...x, visita_a: id }))}
          opciones={(empleados ?? []).map((e) => ({ valor: String(e.id), etiqueta: `${e.nombres} ${e.apellidos}`, detalle: e.cargo }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Motivo" value={v.motivo} onChange={pon('motivo')} placeholder="Entrega, inspección, reunión…" />
          <Input label="Placa del vehículo" value={v.placa} onChange={pon('placa')} placeholder="Si entró con vehículo" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Entrada" type="datetime-local" value={entrada} onChange={(e) => setEntrada(e.target.value)} hint="Vacía: ahora mismo, con la hora del sistema." />
          <Input
            label="Salida"
            type="datetime-local"
            value={salida}
            onChange={(e) => setSalida(e.target.value)}
            error={alReves ? 'Tiene que ser después de la entrada.' : undefined}
            hint="Solo para cargar una visita de antes. Vacía: sigue adentro."
          />
        </div>
        <Textarea label="Nota" rows={2} value={v.nota} onChange={pon('nota')} />
        {registrar.error ? <ErrorDeCarga error={registrar.error} /> : null}
        {repetido && nuevo ? <CasillaRepetido marcada={aunque} onCambio={setAunque} /> : null}
      </div>
    </Modal>
  )
}

function CorregirVisita({ visita, onCerrar }: { visita: Visita; onCerrar: () => void }) {
  const corregir = useCorregirVisita()
  const { data: visitantes } = useVisitantes()
  const { data: empleados } = useEmpleados(true)
  const [v, setV] = useState<DatosVisita>(() => datosDeVisita(visita))
  const [entrada, setEntrada] = useState(aFechaHoraLocal(visita.entrada))
  const [salida, setSalida] = useState(aFechaHoraLocal(visita.salida))
  const pon = (k: keyof DatosVisita) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }))
  const alReves = Boolean(entrada && salida && salida <= entrada)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo={`Corregir la visita de ${visita.nombre}`}
      descripcion={`Del ${fmtFecha(visita.fecha)}. Queda anotado quién la corrigió y cuándo. Los datos de la persona se editan en Conocidos.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!v.visitante_id || !entrada || alReves || corregir.isPending}
            onClick={() =>
              corregir.mutate(
                { id: visita.id, datos: { ...v, entrada: deFechaHoraLocal(entrada) ?? '', salida: deFechaHoraLocal(salida) ?? '' } },
                { onSuccess: onCerrar },
              )
            }
          >
            {corregir.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectBuscable
          label="Visitante"
          vacio="Busca por nombre, cédula, empresa o teléfono…"
          valor={v.visitante_id}
          onCambio={(id) => setV((x) => ({ ...x, visitante_id: id }))}
          opciones={(visitantes ?? []).map(etiquetaDe)}
        />
        <SelectBuscable
          label="A quién visita"
          vacio="Alguien del personal (opcional)"
          valor={v.visita_a}
          onCambio={(id) => setV((x) => ({ ...x, visita_a: id }))}
          opciones={(empleados ?? []).map((e) => ({ valor: String(e.id), etiqueta: `${e.nombres} ${e.apellidos}`, detalle: e.cargo }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Motivo" value={v.motivo} onChange={pon('motivo')} />
          <Input label="Placa del vehículo" value={v.placa} onChange={pon('placa')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Entrada" type="datetime-local" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
          <Input
            label="Salida"
            type="datetime-local"
            value={salida}
            onChange={(e) => setSalida(e.target.value)}
            error={alReves ? 'Tiene que ser después de la entrada.' : undefined}
            hint={visita.estado === 'ADENTRO' ? 'Está adentro: ponle la salida para cerrarla.' : 'Vacía: vuelve a quedar adentro.'}
          />
        </div>
        <Textarea label="Nota" rows={2} value={v.nota} onChange={pon('nota')} />
        {corregir.error ? <ErrorDeCarga error={corregir.error} /> : null}
      </div>
    </Modal>
  )
}

/** La lista de la gente que ha venido, para corregir sus datos o dejarla inactiva. */
function VisitantesConocidos({ puedeEditar, onCerrar }: { puedeEditar: boolean; onCerrar: () => void }) {
  const { data, isPending, error } = useVisitantes()
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState<Visitante | null>(null)
  const [nuevo, setNuevo] = useState(false)

  const normal = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  const trozos = normal(texto).split(/\s+/).filter(Boolean)
  const lista = (data ?? []).filter((p) => {
    const heno = normal([p.nombre, p.documento, p.empresa, p.telefono].filter(Boolean).join(' '))
    return trozos.every((t) => heno.includes(t))
  })

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo="Visitantes conocidos"
      descripcion="La gente de afuera que ha venido. Cada uno está una sola vez; sus visitas se ven en el calendario."
      acciones={
        <>
          {puedeEditar ? (
            <Button variant="outline" onClick={() => setNuevo(true)}>
              Registrar uno sin marcar entrada
            </Button>
          ) : null}
          <Button onClick={onCerrar}>Listo</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Buscar" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, cédula, empresa o teléfono" />
        {isPending ? (
          <Cargando />
        ) : error ? (
          <ErrorDeCarga error={error} />
        ) : lista.length === 0 ? (
          <p className="text-ink/45 text-sm">{data?.length ? 'Ninguno con eso.' : 'Todavía no ha venido nadie.'}</p>
        ) : (
          <ul className="divide-hairline max-h-96 divide-y overflow-y-auto">
            {lista.map((p) => (
              <li key={p.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2', !p.activo && 'opacity-50')}>
                <div className="min-w-48 flex-1">
                  <p className="text-ink/85 text-sm font-medium">
                    {p.nombre}
                    {p.documento ? <span className="text-ink/45 font-normal"> · {p.documento}</span> : null}
                  </p>
                  <p className="text-ink/50 text-xs">
                    {[p.empresa, p.telefono, `${p.visitas} visita${p.visitas === 1 ? '' : 's'}`, p.contacto_id ? 'en Contactos' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {p.adentro ? <Chip tone="info">Adentro</Chip> : null}
                {!p.activo ? <Chip tone="neutral">Inactivo</Chip> : null}
                {puedeEditar ? (
                  <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditando(p)}>
                    Editar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {editando ? <FormularioVisitante visitante={editando} onCerrar={() => setEditando(null)} /> : null}
      {nuevo ? <FormularioVisitante onCerrar={() => setNuevo(false)} /> : null}
    </Modal>
  )
}

function FormularioVisitante({ visitante, onCerrar }: { visitante?: Visitante; onCerrar: () => void }) {
  const guardar = useGuardarVisitante()
  const [d, setD] = useState<DatosVisitante>(() => (visitante ? datosDeVisitante(visitante) : visitanteVacio()))
  const [aunque, setAunque] = useState(false)
  const repetido = esVisitanteRepetido(guardar.error)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo={visitante ? `Editar a ${visitante.nombre}` : 'Registrar un visitante'}
      descripcion={
        visitante
          ? 'Los cambios se ven en todas sus visitas. Inactivo, no se le puede marcar entrada hasta activarlo.'
          : 'Solo la persona, sin marcarle entrada todavía.'
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={(!d.nombre.trim() && !d.contacto_id) || guardar.isPending}
            onClick={() => guardar.mutate({ id: visitante?.id ?? null, datos: d, aunqueParezcaRepetido: aunque }, { onSuccess: onCerrar })}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <CamposDeVisitante d={d} onCambio={setD} />
        <Textarea label="Nota" rows={2} value={d.nota} onChange={(e) => setD((x) => ({ ...x, nota: e.target.value }))} />
        {visitante ? (
          <label className="text-ink/75 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.activo} onChange={(e) => setD((x) => ({ ...x, activo: e.target.checked }))} />
            Activo: se le puede marcar entrada
          </label>
        ) : null}
        {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
        {repetido ? <CasillaRepetido marcada={aunque} onCambio={setAunque} /> : null}
      </div>
    </Modal>
  )
}

function CerrarVisita({ visita, onCerrar }: { visita: Visita; onCerrar: () => void }) {
  const cerrar = useCerrarVisita()
  const [otraHora, setOtraHora] = useState(false)
  const [salida, setSalida] = useState('')
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Salida de ${visita.nombre}`}
      descripcion={`Entró el ${fmtFecha(visita.fecha)} a las ${horaDe(visita.entrada)}. La hora de salida la pone el sistema ahora mismo, salvo que se diga otra.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={cerrar.isPending || (otraHora && !salida)}
            onClick={() => cerrar.mutate({ id: visita.id, salida: otraHora ? deFechaHoraLocal(salida) : null }, { onSuccess: onCerrar })}
          >
            {cerrar.isPending ? 'Guardando…' : 'Registrar salida'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="text-ink/75 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={otraHora} onChange={(e) => setOtraHora(e.target.checked)} />
          Se fue antes y nadie lo anotó: poner la hora real
        </label>
        {otraHora ? (
          <Input label="Salida" type="datetime-local" value={salida} min={aFechaHoraLocal(visita.entrada)} onChange={(e) => setSalida(e.target.value)} />
        ) : null}
        {cerrar.error ? <ErrorDeCarga error={cerrar.error} /> : null}
      </div>
    </Modal>
  )
}

function AnularVisita({ visita, onCerrar }: { visita: Visita; onCerrar: () => void }) {
  const anular = useAnularVisita()
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Anular la visita de ${visita.nombre}`}
      descripcion={`Del ${fmtFecha(visita.fecha)}, ${horaDe(visita.entrada)} → ${visita.salida ? horaDe(visita.salida) : 'sin salida'}. No se borra: queda anulada y a la vista.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={motivo.trim().length < 3 || anular.isPending}
            onClick={() => anular.mutate({ id: visita.id, motivo: motivo.trim() }, { onSuccess: onCerrar })}
          >
            {anular.isPending ? 'Anulando…' : 'Anular'}
          </Button>
        </>
      }
    >
      <Textarea label="Por qué" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
    </Modal>
  )
}
