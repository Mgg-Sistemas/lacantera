import { useMemo, useState } from 'react'
import { Download, LogOut, Pencil, TriangleAlert, UserPlus } from 'lucide-react'
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
  deFechaHoraLocal,
  duracion,
  horaDe,
  useAnularVisita,
  useCerrarVisita,
  useCorregirVisita,
  useRegistrarVisita,
  useVisitas,
  useVisitasAdentro,
  visitaVacia,
  type DatosVisita,
  type Visita,
} from '@/lib/api/asistencia'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import { fecha as fmtFecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  LOS VISITANTES

  Christopher, 24/09/2026: «gestionar a los que no forman parte de nómina, pero
  vienen de visita». Una tarjeta dentro del control de asistencia, con la misma
  lógica que la jornada del personal: una fila por visita, entrada y salida
  juntas, y la hora la pone la base.

  Arriba, quién está ADENTRO ahora mismo, con el botón de salida al lado: eso
  es lo que la garita mira todo el día. Debajo, las visitas del día elegido en
  el calendario, para corregir o anular. No hay carnet que escanear: se
  registra a mano, o se toma del directorio de contactos si está ahí.
*/

export function Visitantes({ hoy, dia, mes }: { hoy: string; dia: string | null; mes: string }) {
  const { puede } = useMisPermisos()
  const puedeRegistrar = puede('ASISTENCIA', 'ESCRITURA')
  const puedeAnular = puede('ASISTENCIA', 'TOTAL')

  const [registrando, setRegistrando] = useState(false)
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
            {puedeRegistrar ? (
              <Button size="sm" icon={<UserPlus />} onClick={() => setRegistrando(true)}>
                Registrar visitante
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
                    {v.visitado ? `Visita a ${v.visitado}` : ''}
                    {v.visitado && v.motivo ? ' · ' : ''}
                    {v.motivo ?? ''}
                    {v.placa ? ` · placa ${v.placa}` : ''}
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

      {registrando ? <FormularioVisita onCerrar={() => setRegistrando(false)} /> : null}
      {corrigiendo ? <FormularioVisita visita={corrigiendo} onCerrar={() => setCorrigiendo(null)} /> : null}
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

/* ─────────────────────────────────────────────────────────── ventanas */

/**
 * Registrar o corregir. Al registrar, la entrada vacía es «ahora» y la pone la
 * base; se llena solo para cargar una visita de antes. El directorio de
 * contactos rellena nombre, documento, empresa y teléfono; quien no lee
 * Contactos no ve ese selector, y escribe todo a mano.
 */
function FormularioVisita({ visita, onCerrar }: { visita?: Visita; onCerrar: () => void }) {
  const { puede } = useMisPermisos()
  const registrar = useRegistrarVisita()
  const corregir = useCorregirVisita()
  const { data: empleados } = useEmpleados(true)
  const leeContactos = puede('CONTACTOS', 'LECTURA')
  const { data: contactos } = useContactos()

  const [d, setD] = useState<DatosVisita>(() => (visita ? datosDeVisita(visita) : visitaVacia()))
  const [entrada, setEntrada] = useState(visita ? aFechaHoraLocal(visita.entrada) : '')
  const [salida, setSalida] = useState(visita ? aFechaHoraLocal(visita.salida) : '')
  const pon = (k: keyof DatosVisita) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }))

  const alReves = Boolean(entrada && salida && salida <= entrada)
  const guardando = registrar.isPending || corregir.isPending
  const error = registrar.error ?? corregir.error
  const contacto = (contactos ?? []).find((c) => String(c.id) === d.contacto_id)
  const nombreFalta = !d.nombre.trim() && !contacto

  const tomarDelDirectorio = (id: string) => {
    const c = (contactos ?? []).find((x) => String(x.id) === id)
    setD((x) => ({
      ...x,
      contacto_id: id,
      nombre: c ? c.nombre : x.nombre,
      documento: c ? (c.documento ?? '') : x.documento,
      empresa: c ? (c.empresa ?? c.empresa_nombre ?? '') : x.empresa,
      telefono: c ? (c.celular ?? c.whatsapp ?? c.telefono_oficina ?? '') : x.telefono,
    }))
  }

  const guardar = () => {
    const datos: DatosVisita = { ...d, entrada: deFechaHoraLocal(entrada) ?? '', salida: deFechaHoraLocal(salida) ?? '' }
    if (visita) corregir.mutate({ id: visita.id, datos }, { onSuccess: onCerrar })
    else registrar.mutate(datos, { onSuccess: onCerrar })
  }

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      ancho="lg"
      titulo={visita ? `Corregir la visita de ${visita.nombre}` : 'Registrar un visitante'}
      descripcion={
        visita
          ? `Del ${fmtFecha(visita.fecha)}. Queda anotado quién la corrigió y cuándo.`
          : 'Alguien de afuera que entra a la cantera. Con la entrada vacía, la hora la pone el sistema ahora mismo.'
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={nombreFalta || alReves || (Boolean(visita) && !entrada) || guardando} onClick={guardar}>
            {guardando ? 'Guardando…' : visita ? 'Guardar' : 'Registrar entrada'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
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
          <Input label="Cédula o pasaporte" value={d.documento} onChange={pon('documento')} placeholder="V-12345678" hint="Con ella el sistema no deja registrarlo adentro dos veces." />
          <Input label="Empresa" value={d.empresa} onChange={pon('empresa')} placeholder="De dónde viene" />
          <Input label="Teléfono" value={d.telefono} onChange={pon('telefono')} placeholder="0414-1234567" />
        </div>
        <SelectBuscable
          label="A quién visita"
          vacio="Alguien del personal (opcional)"
          valor={d.visita_a}
          onCambio={(v) => setD((x) => ({ ...x, visita_a: v }))}
          opciones={(empleados ?? []).map((e) => ({ valor: String(e.id), etiqueta: `${e.nombres} ${e.apellidos}`, detalle: e.cargo }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Motivo" value={d.motivo} onChange={pon('motivo')} placeholder="Entrega, inspección, reunión…" />
          <Input label="Placa del vehículo" value={d.placa} onChange={pon('placa')} placeholder="Si entró con vehículo" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Entrada"
            type="datetime-local"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            hint={visita ? undefined : 'Vacía: ahora mismo, con la hora del sistema.'}
          />
          <Input
            label="Salida"
            type="datetime-local"
            value={salida}
            onChange={(e) => setSalida(e.target.value)}
            error={alReves ? 'Tiene que ser después de la entrada.' : undefined}
            hint={visita?.estado === 'ADENTRO' ? 'Está adentro: ponle la salida para cerrarla.' : 'Vacía: sigue adentro.'}
          />
        </div>
        <Textarea label="Nota" rows={2} value={d.nota} onChange={pon('nota')} />
        {error ? <ErrorDeCarga error={error} /> : null}
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
