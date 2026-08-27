import { useState } from 'react'
import { BadgeCheck, Copy, IdCard, ShieldAlert } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  emitiendoDesdeOtroSitio,
  useAnularCarnet,
  useCarnetVigente,
  useEmitirCarnet,
  useHistorialDeCarnets,
  urlDeVerificacion,
  URL_PUBLICA,
} from '@/lib/api/carnets'
import { fechaHora } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  EL CARNET EMITIDO DE ESTA PERSONA

  Aquí se emite, se anula y se ve el código que lleva impreso el QR. Va en la
  ficha y no en una pantalla aparte porque la pregunta —«¿este trabajador tiene
  carnet, y sirve?»— se hace mirando a la persona, no recorriendo una lista.

  POR QUÉ SE VE LA DIRECCIÓN COMPLETA, Y NO SOLO EL CÓDIGO

  El QR lleva grabada la dirección de DONDE SE EMITIÓ. Un carnet emitido desde
  un despliegue de prueba apunta a ese despliegue en el plástico para siempre, y
  eso no se arregla después: hay que reimprimir. Enseñar la dirección entera
  antes de emitir es lo único que evita ese error, así que se enseña aunque
  ocupe y aunque casi nadie la lea.
*/

/** El código se lee de tres golpes en grupos de seis, como va impreso. */
const enGrupos = (codigo: string) => (codigo.match(/.{1,6}/g) ?? [codigo]).join(' ')

export function TarjetaCarnet({
  empleadoId,
  nombre,
  puedeEmitir,
  trabajaAqui,
  /** Emite y, si hay foto cargada, la guarda con la emisión. */
  fotoParaEmitir,
}: {
  empleadoId: number
  nombre: string
  puedeEmitir: boolean
  trabajaAqui: boolean
  fotoParaEmitir: () => Promise<string | null>
}) {
  const { data: carnet, isPending } = useCarnetVigente(empleadoId)
  const { data: historial } = useHistorialDeCarnets(empleadoId)
  const emitir = useEmitirCarnet()
  const anular = useAnularCarnet()

  const [pidiendo, setPidiendo] = useState<'emitir' | 'anular' | null>(null)
  const [motivo, setMotivo] = useState('')
  const [copiado, setCopiado] = useState(false)

  const anulados = (historial ?? []).filter((c) => c.estado === 'ANULADO')

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1800)
    } catch {
      // Sin portapapeles —pasa en navegadores viejos y sin HTTPS— el código
      // está a la vista para copiarlo a mano. No hay nada que avisar.
    }
  }

  const confirmar = async () => {
    if (pidiendo === 'emitir') {
      await emitir.mutateAsync({
        empleado_id: empleadoId,
        motivo: motivo.trim() || null,
        foto: await fotoParaEmitir(),
      })
    } else if (pidiendo === 'anular') {
      await anular.mutateAsync({ empleado_id: empleadoId, motivo: motivo.trim() })
    }
    setMotivo('')
    setPidiendo(null)
  }

  return (
    <Card>
      <CardHeader
        title="Carnet"
        subtitle="El QR impreso lleva a una página que dice si este carnet sigue valiendo."
        action={
          carnet ? (
            <Chip tone="success">Vigente</Chip>
          ) : (
            <Chip tone="neutral">Sin emitir</Chip>
          )
        }
      />

      {isPending ? <p className="text-ink/45 mt-4 text-sm">Buscando…</p> : null}

      {!isPending && carnet ? (
        <div className="mt-4 space-y-3">
          <div className="border-hairline rounded-card border p-3">
            <p className="text-ink/45 text-xs">Código impreso bajo el QR</p>
            <p className="tabular text-ink/90 mt-0.5 text-lg font-semibold tracking-wider">
              {enGrupos(carnet.codigo)}
            </p>

            <p className="text-ink/45 mt-2.5 text-xs">Adónde lleva el QR</p>
            <p className="text-ink/70 mt-0.5 text-xs break-all">{urlDeVerificacion(carnet.codigo)}</p>

            <Button
              size="sm"
              variant="ghost"
              icon={<Copy />}
              className="mt-2"
              onClick={() => void copiar(urlDeVerificacion(carnet.codigo))}
            >
              {copiado ? 'Copiada' : 'Copiar la dirección'}
            </Button>
          </div>

          <p className="text-ink/50 text-xs">Emitido el {fechaHora(carnet.emitido_en)}</p>

          {puedeEmitir ? (
            <div className="flex flex-wrap gap-2">
              {/*
                «Se perdió» va primero y con el icono de alarma: es la razón por
                la que existe todo esto. Reemitir por un cambio de cargo es el
                caso raro; un carnet perdido, el que urge.
              */}
              <Button
                size="sm"
                variant="outline"
                icon={<ShieldAlert />}
                onClick={() => {
                  setMotivo('')
                  setPidiendo('emitir')
                }}
              >
                Se perdió: anular y emitir otro
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => {
                  setMotivo('')
                  setPidiendo('anular')
                }}
              >
                Anular sin reemitir
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isPending && !carnet ? (
        <div className="mt-4">
          <p className="text-ink/60 text-sm leading-relaxed">
            {trabajaAqui
              ? 'Todavía no se le ha emitido carnet. Sin emitirlo, el que se imprima sale sin QR: se puede usar, pero nadie podrá comprobarlo escaneándolo.'
              : 'Esta persona ya no trabaja en la empresa, así que no se le emite carnet. Si tenía uno, escanea como no válido.'}
          </p>

          {puedeEmitir && trabajaAqui ? (
            <Button
              className="mt-3"
              icon={<BadgeCheck />}
              disabled={emitir.isPending}
              onClick={() => {
                setMotivo('')
                setPidiendo('emitir')
              }}
            >
              {emitir.isPending ? 'Emitiendo…' : 'Emitir el carnet'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/*
        LOS ANULADOS SE VEN, Y NO ES ARCHIVO MUERTO

        Cuando alguien aparece con un carnet que escanea como no válido, la
        pregunta es «¿y este de dónde salió?». Aquí está la respuesta con su
        fecha y su razón. Sin esta lista habría que ir a la auditoría.
      */}
      {anulados.length > 0 ? (
        <div className="border-hairline mt-4 border-t pt-3">
          <p className="text-ink/45 mb-2 text-xs">
            {anulados.length} carnet{anulados.length === 1 ? '' : 's'} anulado
            {anulados.length === 1 ? '' : 's'}
          </p>
          <ul className="space-y-1.5">
            {anulados.slice(0, 4).map((c) => (
              <li key={c.id} className="text-ink/55 text-xs">
                <span className="tabular">{enGrupos(c.codigo)}</span>
                {c.anulado_en ? ` · ${fechaHora(c.anulado_en)}` : ''}
                {c.anulado_motivo ? ` · «${c.anulado_motivo}»` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {emitir.error ? <ErrorDeCarga error={emitir.error} className="mt-3" /> : null}
      {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}

      <Modal
        abierto={pidiendo !== null}
        onCerrar={() => setPidiendo(null)}
        titulo={pidiendo === 'anular' ? 'Anular el carnet' : carnet ? 'Emitir un carnet nuevo' : 'Emitir el carnet'}
        descripcion={
          pidiendo === 'anular'
            ? `El carnet de ${nombre} dejará de valer al escanearlo. No se emite otro.`
            : carnet
              ? `El carnet que ${nombre} tiene ahora quedará anulado y escaneará como no válido. Se emite uno nuevo con otro código.`
              : `Se le emite a ${nombre} su primer carnet. Después hay que imprimirlo: el código nuevo va dentro del QR.`
        }
        acciones={
          <>
            <Button variant="ghost" onClick={() => setPidiendo(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmar()}
              disabled={
                emitir.isPending ||
                anular.isPending ||
                (pidiendo === 'anular' && motivo.trim().length < 4)
              }
            >
              {emitir.isPending || anular.isPending
                ? 'Guardando…'
                : pidiendo === 'anular'
                  ? 'Anular'
                  : 'Emitir'}
            </Button>
          </>
        }
      >
        <Textarea
          label={pidiendo === 'anular' ? 'Por qué se anula' : 'Por qué se emite otro (opcional)'}
          rows={3}
          value={motivo}
          onChange={(ev) => setMotivo(ev.target.value)}
          placeholder={
            pidiendo === 'anular'
              ? 'Se lo dejó en la puerta y no aparece.'
              : 'Se lo robaron en el terminal.'
          }
          hint={
            pidiendo === 'anular'
              ? 'Queda escrito y se puede consultar el día que alguien aparezca con ese carnet.'
              : 'Queda escrito en el carnet que se anula. Sin motivo se guarda «Se emitió un carnet nuevo».'
          }
        />

        {/*
          Si se está emitiendo desde otro sitio, se dice.

          El QR va a apuntar bien igual —la dirección sale de una constante, no
          de la barra del navegador— pero quien emite tiene que enterarse de que
          lo que va impreso no es donde él está. Es media línea y evita una
          reimpresión de toda la plantilla.
        */}
        {pidiendo === 'emitir' && emitiendoDesdeOtroSitio() ? (
          <p className="border-warning/30 bg-warning-soft text-ink/75 mt-4 rounded-[6px] border p-3 text-sm leading-relaxed">
            Estás emitiendo desde <strong>{window.location.host}</strong>, pero el QR va a apuntar a{' '}
            <strong>{URL_PUBLICA.replace(/^https?:\/\//, '')}</strong>, que es la dirección de
            producción. Es lo correcto; se avisa para que no sorprenda.
          </p>
        ) : null}

        {pidiendo === 'emitir' ? (
          <p
            className={cn(
              'border-hairline text-ink/60 mt-4 rounded-[6px] border border-dashed p-3',
              'text-sm leading-relaxed',
            )}
          >
            <IdCard className="mr-1.5 -mt-0.5 inline size-4" />
            Después de emitir hay que <strong className="text-ink/85">imprimir el carnet
            otra vez</strong>: el código nuevo va dentro del QR, y el plástico viejo no lo tiene.
          </p>
        ) : null}
      </Modal>
    </Card>
  )
}
