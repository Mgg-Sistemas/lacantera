import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  FileText,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  ScanLine,
  Settings2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { Visor } from '@/components/Visor'
import { useEmpresa } from '@/lib/api/empresa'
import { useEmpleados } from '@/lib/api/nomina'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { useMiPerfil, useMisPermisos } from '@/lib/api/usuarios'
import {
  aFechaHoraLocal,
  deFechaHoraLocal,
  duracion,
  hayCamaraQueLeaQr,
  horaDe,
  useAjustesDeAsistencia,
  useAnularAsistencia,
  useCargarAsistencia,
  useCorregirAsistencia,
  useGuardarAjustesDeAsistencia,
  useJornadas,
  useJornadasDeHoy,
  useMarcarAsistencia,
  type Jornada,
  type Marcada,
} from '@/lib/api/asistencia'
import { armarReporteDeAsistencia } from '@/lib/ficha/asistenciaPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { EscanerDeCarnet } from './EscanerDeCarnet'
import { Visitantes } from './Visitantes'

/*
  CONTROL DE ASISTENCIA

  Tres cosas en una pantalla, en el orden en que se usan:

  1. MARCAR. El escáner de carnet —un lector USB que teclea, o la cámara del
     teléfono— o la persona elegida a mano. La base decide si es entrada o
     salida y pone la hora; aquí solo se enseña grande lo que pasó.
  2. HOY. Quién está adentro ahora mismo y quién ya salió. También lo que quedó
     abierto de otros días, porque eso es lo que hay que revisar.
  3. LOS VISITANTES. Gente de afuera que entró: quién sigue adentro, con su
     botón de salida, y las visitas del día elegido. No tocan la nómina.
  4. EL CALENDARIO. Un mes de un vistazo, y al tocar un día, su gente. Desde
     ahí se corrige una hora o se anula una jornada, con permiso.

  LA HORA ES DE CARACAS SIEMPRE, se mire desde donde se mire. Un teléfono con
  el reloj mal puesto no puede cambiar a qué hora entró alguien.
*/

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const primerDia = (ym: string) => `${ym}-01`
const ultimoDia = (ym: string) => {
  const [a, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
}
const mesAnterior = (ym: string) => {
  const [a, m] = ym.split('-').map(Number)
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`
}
const mesSiguiente = (ym: string) => {
  const [a, m] = ym.split('-').map(Number)
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`
}

export function ControlDeAsistencia() {
  const hoy = hoyEnCaracas()
  const { puede } = useMisPermisos()
  const puedeMarcar = puede('ASISTENCIA', 'ESCRITURA')
  const puedeAnular = puede('ASISTENCIA', 'TOTAL')
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()

  const [mes, setMes] = useState(hoy.slice(0, 7))
  const [dia, setDia] = useState<string | null>(hoy)
  const [personaId, setPersonaId] = useState('')
  const [cargando, setCargando] = useState(false)
  const [corrigiendo, setCorrigiendo] = useState<Jornada | null>(null)
  const [anulando, setAnulando] = useState<Jornada | null>(null)
  const [ajustes, setAjustes] = useState(false)
  const [reporte, setReporte] = useState(false)
  const [papel, setPapel] = useState<ArchivoArmado | null>(null)

  const jornadas = useJornadas(primerDia(mes), ultimoDia(mes))
  const { data: empleados } = useEmpleados(true)

  const delMes = useMemo(
    () => (jornadas.data ?? []).filter((j) => !personaId || String(j.empleado_id) === personaId),
    [jornadas.data, personaId],
  )
  const porDia = useMemo(() => {
    const m = new Map<string, Jornada[]>()
    for (const j of delMes) m.set(j.fecha, [...(m.get(j.fecha) ?? []), j])
    return m
  }, [delMes])
  const delDia = dia ? (porDia.get(dia) ?? []) : []

  return (
    <>
      <PageHeader
        title="Control de asistencia"
        actions={
          <>
            {puedeAnular ? (
              <Button variant="ghost" icon={<Settings2 />} onClick={() => setAjustes(true)}>
                Ajustes
              </Button>
            ) : null}
            <Button variant="outline" icon={<FileText />} onClick={() => setReporte(true)}>
              Reporte
            </Button>
            {puedeMarcar ? (
              <Button icon={<Plus />} onClick={() => setCargando(true)}>
                Cargar a mano
              </Button>
            ) : null}
          </>
        }
      />

      {puedeMarcar ? <Marcador hoy={hoy} /> : null}

      <Hoy hoy={hoy} />

      {/* VISITANTES, 24/09/2026: gente de afuera, con la misma lógica de la jornada. */}
      <Visitantes hoy={hoy} dia={dia} mes={mes} />

      {/* ------------------------------------------------------ calendario */}
      <Card className="mt-4">
        <CardHeader
          title="Calendario"
          subtitle="Un mes de un vistazo. Toca un día para ver su gente y corregir una hora."
        />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={<ChevronLeft />} onClick={() => setMes(mesAnterior(mes))} aria-label="Mes anterior" />
            <span className="text-ink/85 min-w-40 text-center text-sm font-medium capitalize">
              {MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
            </span>
            <Button size="sm" variant="ghost" icon={<ChevronRight />} onClick={() => setMes(mesSiguiente(mes))} aria-label="Mes siguiente" />
          </div>
          <div className="min-w-64 flex-1">
            <SelectBuscable
              label="Solo una persona"
              vacio="Todo el personal"
              valor={personaId}
              onCambio={setPersonaId}
              opciones={(empleados ?? []).map((e) => ({ valor: String(e.id), etiqueta: `${e.nombres} ${e.apellidos}`, detalle: e.ficha }))}
            />
          </div>
        </div>

        {jornadas.isPending ? (
          <Cargando />
        ) : jornadas.error ? (
          <ErrorDeCarga error={jornadas.error} />
        ) : (
          <Calendario mes={mes} hoy={hoy} porDia={porDia} dia={dia} onDia={setDia} />
        )}
      </Card>

      {dia ? (
        <Card className="mt-4">
          <CardHeader
            title={`${fmtFecha(dia)}${dia === hoy ? ' · hoy' : ''}`}
            subtitle={
              delDia.length === 0
                ? 'Nadie marcó ese día.'
                : `${new Set(delDia.filter((j) => j.estado !== 'ANULADA').map((j) => j.empleado_id)).size} persona${delDia.length === 1 ? '' : 's'}`
            }
          />
          <ListaDeJornadas
            jornadas={delDia}
            puedeCorregir={puedeMarcar}
            puedeAnular={puedeAnular}
            onCorregir={setCorrigiendo}
            onAnular={setAnulando}
          />
        </Card>
      ) : null}

      {cargando ? <CargarAMano onCerrar={() => setCargando(false)} /> : null}
      {corrigiendo ? <Corregir jornada={corrigiendo} onCerrar={() => setCorrigiendo(null)} /> : null}
      {anulando ? <Anular jornada={anulando} onCerrar={() => setAnulando(null)} /> : null}
      {ajustes ? <Ajustes onCerrar={() => setAjustes(false)} /> : null}
      {reporte ? (
        <Reporte
          hoy={hoy}
          onCerrar={() => setReporte(false)}
          onArmado={(a) => {
            setReporte(false)
            setPapel(a)
          }}
          empresa={{ razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' }}
          emitidoPor={yo?.nombre ?? ''}
        />
      ) : null}
      <Visor
        abierto={papel !== null}
        onCerrar={() => setPapel(null)}
        blob={papel?.blob ?? null}
        nombreArchivo={papel?.nombre ?? 'asistencia.pdf'}
        titulo="Reporte de asistencia"
        descripcion="Revísalo antes de descargarlo o imprimirlo."
      />
    </>
  )
}

/* ─────────────────────────────────────────────────────────────── marcar */

function Marcador({ hoy }: { hoy: string }) {
  const marcar = useMarcarAsistencia()
  const { data: empleados } = useEmpleados(true)
  const [codigo, setCodigo] = useState('')
  const [personaId, setPersonaId] = useState('')
  const [camara, setCamara] = useState(false)
  const [ultima, setUltima] = useState<Marcada | null>(null)
  const [fallo, setFallo] = useState<Error | null>(null)
  const caja = useRef<HTMLDivElement>(null)

  // El lector USB teclea la dirección del QR y pulsa Enter. El campo tiene que
  // tener el foco para recibirla, así que se lo lleva al cargar y después de
  // cada marca.
  useEffect(() => {
    caja.current?.querySelector('input')?.focus()
  }, [ultima, fallo])

  const marcarCon = (v: { codigo?: string; empleado_id?: number }) => {
    setFallo(null)
    marcar.mutate(v, {
      onSuccess: (m) => {
        setUltima(m)
        setCodigo('')
        setPersonaId('')
      },
      onError: (e) => {
        setUltima(null)
        setFallo(e as Error)
        setCodigo('')
      },
    })
  }

  void hoy
  return (
    <Card className="mb-4">
      <CardHeader
        title="Marcar"
        subtitle="Escanea el carnet, o elige a la persona. El sistema decide si es entrada o salida y pone la hora."
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <div className="flex items-end gap-2">
            <div ref={caja} className="flex-1">
              <Input
                label="Carnet"
                icon={<ScanLine />}
                placeholder="Escanea aquí…"
                autoComplete="off"
                sinNormalizar
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && codigo.trim()) {
                    e.preventDefault()
                    marcarCon({ codigo: codigo.trim() })
                  }
                }}
                hint="Con un lector USB basta con escanear. También se puede teclear el código impreso bajo el QR."
              />
            </div>
            {hayCamaraQueLeaQr() ? (
              <Button variant="outline" icon={<Camera />} onClick={() => setCamara(true)}>
                Cámara
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <SelectBuscable
              label="O elige a la persona"
              vacio="Busca por nombre o ficha…"
              valor={personaId}
              onCambio={setPersonaId}
              opciones={(empleados ?? []).map((e) => ({ valor: String(e.id), etiqueta: `${e.nombres} ${e.apellidos}`, detalle: `${e.ficha} · ${e.cedula}` }))}
            />
          </div>
          <Button disabled={!personaId || marcar.isPending} onClick={() => marcarCon({ empleado_id: Number(personaId) })}>
            {marcar.isPending ? 'Marcando…' : 'Marcar'}
          </Button>
        </div>
      </div>

      {ultima ? (
        <div
          className={cn(
            'rounded-card mt-4 flex flex-wrap items-center gap-4 border p-4',
            ultima.accion === 'ENTRADA' ? 'border-success/40 bg-success-soft' : 'border-royal-600/30 bg-royal-600/8',
          )}
        >
          {ultima.accion === 'ENTRADA' ? <LogIn className="text-success size-8" /> : <LogOut className="text-royal-700 size-8" />}
          <div className="min-w-0 flex-1">
            <p className="text-ink/90 text-lg font-bold">
              {ultima.accion === 'ENTRADA' ? 'Entrada' : 'Salida'} · {horaDe(ultima.momento)}
            </p>
            <p className="text-ink/70 truncate text-sm">
              {ultima.nombre} <span className="text-ink/45">· ficha {ultima.ficha}</span>
            </p>
            {ultima.quedo_abierta_otra ? (
              <p className="text-warning mt-1 flex items-center gap-1 text-xs">
                <TriangleAlert className="size-3.5" />
                Tenía una jornada abierta desde el {fmtFecha(ultima.abierta_desde?.slice(0, 10) ?? '')} a las{' '}
                {horaDe(ultima.abierta_desde)} sin salida. Se abrió una nueva; la vieja hay que corregirla.
              </p>
            ) : null}
          </div>
          <Button size="sm" variant="ghost" icon={<X />} onClick={() => setUltima(null)} aria-label="Cerrar" />
        </div>
      ) : null}
      {fallo ? (
        <div className="border-danger/40 bg-danger/5 rounded-card mt-4 flex items-center gap-3 border p-4">
          <TriangleAlert className="text-danger size-6 shrink-0" />
          <p className="text-ink/85 text-sm">{fallo.message}</p>
        </div>
      ) : null}

      {camara ? (
        <EscanerDeCarnet
          onLeido={(texto) => {
            setCamara(false)
            marcarCon({ codigo: texto })
          }}
          onCerrar={() => setCamara(false)}
        />
      ) : null}
    </Card>
  )
}

/* ─────────────────────────────────────────────────────────────────── hoy */

function Hoy({ hoy }: { hoy: string }) {
  const { data, isPending, error } = useJornadasDeHoy(hoy)
  const vivas = (data ?? []).filter((j) => j.estado !== 'ANULADA')
  const adentro = vivas.filter((j) => j.estado === 'ABIERTA' && j.fecha === hoy)
  const salieron = vivas.filter((j) => j.estado === 'CERRADA' && j.fecha === hoy)
  const olvidadas = vivas.filter((j) => j.estado === 'ABIERTA' && j.fecha !== hoy)

  return (
    <Card>
      <CardHeader
        title="Hoy"
        subtitle={
          isPending
            ? ''
            : `${adentro.length} adentro · ${salieron.length} ya salieron${olvidadas.length ? ` · ${olvidadas.length} de otros días sin salida` : ''}`
        }
      />
      {isPending ? (
        <Cargando />
      ) : error ? (
        <ErrorDeCarga error={error} />
      ) : vivas.length === 0 ? (
        <p className="text-ink/45 mt-4 text-sm">Nadie ha marcado todavía.</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-ink/55 mb-2 text-xs font-medium tracking-wide uppercase">Adentro</p>
            {adentro.length === 0 ? (
              <p className="text-ink/40 text-sm">Nadie.</p>
            ) : (
              <ul className="space-y-1">
                {adentro.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink/85 truncate">{j.nombre}</span>
                    <span className="text-ink/50 tabular shrink-0 text-xs">desde las {horaDe(j.entrada)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-ink/55 mb-2 text-xs font-medium tracking-wide uppercase">Ya salieron</p>
            {salieron.length === 0 ? (
              <p className="text-ink/40 text-sm">Nadie todavía.</p>
            ) : (
              <ul className="space-y-1">
                {salieron.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-ink/85 truncate">{j.nombre}</span>
                    <span className="text-ink/50 tabular shrink-0 text-xs">
                      {horaDe(j.entrada)} → {horaDe(j.salida)} · {duracion(j.minutos)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {olvidadas.length > 0 ? (
            <div className="border-warning/30 bg-warning-soft rounded-card border p-3 lg:col-span-2">
              <p className="text-ink/80 flex items-center gap-1.5 text-sm font-medium">
                <TriangleAlert className="text-warning size-4" />
                Jornadas de otros días sin salida
              </p>
              <ul className="mt-1 space-y-0.5">
                {olvidadas.map((j) => (
                  <li key={j.id} className="text-ink/65 text-xs">
                    {j.nombre} · entró el {fmtFecha(j.fecha)} a las {horaDe(j.entrada)}. Se corrige desde el calendario.
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  )
}

/* ──────────────────────────────────────────────────────────── calendario */

function Calendario({
  mes,
  hoy,
  porDia,
  dia,
  onDia,
}: {
  mes: string
  hoy: string
  porDia: Map<string, Jornada[]>
  dia: string | null
  onDia: (d: string) => void
}) {
  const [a, m] = mes.split('-').map(Number)
  const cuantos = new Date(a, m, 0).getDate()
  // Lunes primero: el domingo de JavaScript (0) pasa al final.
  const hueco = (new Date(a, m - 1, 1).getDay() + 6) % 7
  const celdas: (string | null)[] = [...Array<null>(hueco).fill(null), ...Array.from({ length: cuantos }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)]

  return (
    <div className="mt-4">
      <div className="text-ink/45 grid grid-cols-7 gap-1 text-center text-xs">
        {DIAS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((f, i) => {
          if (!f) return <div key={`h${i}`} />
          const js = (porDia.get(f) ?? []).filter((j) => j.estado !== 'ANULADA')
          const personas = new Set(js.map((j) => j.empleado_id)).size
          const abiertas = js.filter((j) => j.estado === 'ABIERTA' && f !== hoy).length
          return (
            <button
              key={f}
              type="button"
              onClick={() => onDia(f)}
              className={cn(
                'rounded-card border-hairline flex min-h-16 flex-col items-start border p-1.5 text-left transition-colors',
                dia === f ? 'border-royal-600 bg-royal-600/8' : 'hover:bg-ink/3',
                f > hoy && 'opacity-40',
              )}
            >
              <span className={cn('tabular text-xs', f === hoy ? 'text-royal-700 font-bold' : 'text-ink/60')}>{Number(f.slice(8))}</span>
              {personas > 0 ? (
                <span className="text-ink/85 mt-auto text-sm font-medium">
                  {personas} <span className="text-ink/40 text-xs font-normal">{personas === 1 ? 'persona' : 'personas'}</span>
                </span>
              ) : null}
              {abiertas > 0 ? <span className="text-warning text-[10px] leading-tight">{abiertas} sin salida</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────── lista del día */

function ListaDeJornadas({
  jornadas,
  puedeCorregir,
  puedeAnular,
  onCorregir,
  onAnular,
}: {
  jornadas: Jornada[]
  puedeCorregir: boolean
  puedeAnular: boolean
  onCorregir: (j: Jornada) => void
  onAnular: (j: Jornada) => void
}) {
  if (jornadas.length === 0) return null
  return (
    <ul className="divide-hairline mt-3 divide-y">
      {jornadas.map((j) => (
        <li key={j.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5', j.estado === 'ANULADA' && 'opacity-50')}>
          <div className="min-w-48 flex-1">
            <p className="text-ink/85 text-sm font-medium">
              {j.nombre} <span className="text-ink/45 font-normal">· {j.ficha}</span>
            </p>
            <p className="text-ink/50 text-xs">
              {j.cargo}
              {j.nota ? ` · ${j.nota}` : ''}
              {j.estado === 'ANULADA' ? ` · anulada: ${j.motivo_anulacion}` : ''}
              {j.corregido_en ? ' · corregida' : ''}
            </p>
          </div>
          <span className="tabular text-ink/85 text-sm">
            {horaDe(j.entrada)} → {j.salida ? horaDe(j.salida) : '—'}
          </span>
          <span className="tabular text-ink/60 w-20 text-right text-sm">{j.estado === 'ABIERTA' ? 'sin salida' : duracion(j.minutos)}</span>
          <Chip tone={j.turno === 'DIA' ? 'neutral' : 'info'}>{j.turno === 'DIA' ? 'Día' : 'Noche'}</Chip>
          <Chip tone="neutral">{j.origen === 'CARNET' ? 'Carnet' : 'A mano'}</Chip>
          {j.estado === 'ABIERTA' ? (
            <Chip tone="warning" icon={<TriangleAlert />}>
              Abierta
            </Chip>
          ) : null}
          {j.estado !== 'ANULADA' && puedeCorregir ? (
            <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => onCorregir(j)}>
              Corregir
            </Button>
          ) : null}
          {j.estado !== 'ANULADA' && puedeAnular ? (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => onAnular(j)}>
              Anular
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/* ─────────────────────────────────────────────────────────── ventanas */

function CargarAMano({ onCerrar }: { onCerrar: () => void }) {
  const { data: empleados } = useEmpleados(true)
  const cargar = useCargarAsistencia()
  const [personaId, setPersonaId] = useState('')
  const [entrada, setEntrada] = useState('')
  const [salida, setSalida] = useState('')
  const [nota, setNota] = useState('')
  const alReves = Boolean(entrada && salida && salida <= entrada)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Cargar una jornada a mano"
      descripcion="Para quien no pudo marcar. Queda registrada como cargada a mano y con tu nombre."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!personaId || !entrada || alReves || cargar.isPending}
            onClick={() =>
              cargar.mutate(
                {
                  empleado_id: Number(personaId),
                  entrada: deFechaHoraLocal(entrada)!,
                  salida: deFechaHoraLocal(salida),
                  nota: nota.trim() || null,
                },
                { onSuccess: onCerrar },
              )
            }
          >
            {cargar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectBuscable
          label="Persona"
          vacio="Busca por nombre o ficha…"
          valor={personaId}
          onCambio={setPersonaId}
          opciones={(empleados ?? []).map((e) => ({ valor: String(e.id), etiqueta: `${e.nombres} ${e.apellidos}`, detalle: `${e.ficha} · ${e.cedula}` }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Entrada" type="datetime-local" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
          <Input
            label="Salida"
            type="datetime-local"
            value={salida}
            onChange={(e) => setSalida(e.target.value)}
            error={alReves ? 'Tiene que ser después de la entrada.' : undefined}
            hint="Vacía, la jornada queda abierta."
          />
        </div>
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por qué se carga a mano" />
        {cargar.error ? <ErrorDeCarga error={cargar.error} /> : null}
      </div>
    </Modal>
  )
}

function Corregir({ jornada, onCerrar }: { jornada: Jornada; onCerrar: () => void }) {
  const corregir = useCorregirAsistencia()
  const [entrada, setEntrada] = useState(aFechaHoraLocal(jornada.entrada))
  const [salida, setSalida] = useState(aFechaHoraLocal(jornada.salida))
  const [nota, setNota] = useState(jornada.nota ?? '')
  const alReves = Boolean(entrada && salida && salida <= entrada)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Corregir a ${jornada.nombre}`}
      descripcion={`Jornada del ${fmtFecha(jornada.fecha)}. Queda anotado quién la corrigió y cuándo.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!entrada || alReves || corregir.isPending}
            onClick={() =>
              corregir.mutate(
                { id: jornada.id, entrada: deFechaHoraLocal(entrada)!, salida: deFechaHoraLocal(salida), nota: nota.trim() || null },
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Entrada" type="datetime-local" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
          <Input
            label="Salida"
            type="datetime-local"
            value={salida}
            onChange={(e) => setSalida(e.target.value)}
            error={alReves ? 'Tiene que ser después de la entrada.' : undefined}
            hint={jornada.estado === 'ABIERTA' ? 'Está abierta: ponle la salida para cerrarla.' : 'Vacía, vuelve a quedar abierta.'}
          />
        </div>
        <Textarea label="Nota" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por qué se corrige" />
        {corregir.error ? <ErrorDeCarga error={corregir.error} /> : null}
      </div>
    </Modal>
  )
}

function Anular({ jornada, onCerrar }: { jornada: Jornada; onCerrar: () => void }) {
  const anular = useAnularAsistencia()
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Anular la jornada de ${jornada.nombre}`}
      descripcion={`Del ${fmtFecha(jornada.fecha)}, ${horaDe(jornada.entrada)} → ${jornada.salida ? horaDe(jornada.salida) : 'sin salida'}. No se borra: queda anulada y a la vista.`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={motivo.trim().length < 3 || anular.isPending}
            onClick={() => anular.mutate({ id: jornada.id, motivo: motivo.trim() }, { onSuccess: onCerrar })}
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

function Ajustes({ onCerrar }: { onCerrar: () => void }) {
  const { data } = useAjustesDeAsistencia()
  const guardar = useGuardarAjustesDeAsistencia()
  const [horas, setHoras] = useState(String(data?.horas_maximas_jornada ?? 16))
  const [minutos, setMinutos] = useState(String(data?.minutos_doble_marca ?? 2))
  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Ajustes de asistencia"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={guardar.isPending}
            onClick={() =>
              guardar.mutate({ horas_maximas_jornada: Number(horas), minutos_doble_marca: Number(minutos) }, { onSuccess: onCerrar })
            }
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Horas máximas de una jornada"
          type="number"
          min="4"
          max="24"
          value={horas}
          onChange={(e) => setHoras(e.target.value)}
          hint="Al escanear, si la jornada abierta tiene menos de estas horas, el toque es la salida. Si tiene más, se abre una nueva y la vieja queda para revisar."
        />
        <Input
          label="Minutos para considerar un doble escaneo"
          type="number"
          min="0"
          max="30"
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
          hint="Dos toques del mismo carnet dentro de estos minutos: el segundo se rechaza."
        />
        {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
      </div>
    </Modal>
  )
}

function Reporte({
  hoy,
  empresa,
  emitidoPor,
  onCerrar,
  onArmado,
}: {
  hoy: string
  empresa: { razonSocial: string; rif: string }
  emitidoPor: string
  onCerrar: () => void
  onArmado: (a: ArchivoArmado) => void
}) {
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const [personaId, setPersonaId] = useState('')
  const { data: empleados } = useEmpleados(true)
  const jornadas = useJornadas(desde, hasta)
  const [armando, setArmando] = useState(false)
  const [fallo, setFallo] = useState<unknown>(null)

  const armar = async () => {
    setArmando(true)
    setFallo(null)
    try {
      const filas = (jornadas.data ?? []).filter((j) => !personaId || String(j.empleado_id) === personaId)
      onArmado(await armarReporteDeAsistencia({ empresa, emitidoPor, momento: new Date(), desde, hasta, jornadas: filas }))
    } catch (e) {
      setFallo(e)
    } finally {
      setArmando(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Reporte de asistencia"
      descripcion="Por persona y jornada por jornada, con el membrete de la empresa."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={armando || jornadas.isPending || desde > hasta} onClick={() => void armar()}>
            {armando ? 'Armando…' : 'Ver el reporte'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
          <Input label="Hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <SelectBuscable
          label="Solo una persona"
          vacio="Todo el personal"
          valor={personaId}
          onCambio={setPersonaId}
          opciones={(empleados ?? []).map((e) => ({ valor: String(e.id), etiqueta: `${e.nombres} ${e.apellidos}`, detalle: e.ficha }))}
        />
        {fallo ? <ErrorDeCarga error={fallo} /> : null}
      </div>
    </Modal>
  )
}
