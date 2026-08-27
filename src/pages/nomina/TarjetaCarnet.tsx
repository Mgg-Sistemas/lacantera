import { useState } from 'react'
import { BadgeCheck, Copy, IdCard, Printer, ShieldAlert } from 'lucide-react'
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
  /*
    Las descargas del carnet viven AQUÍ y no en la tarjeta de documentos.

    Estaban allí, y al añadir esta tarjeta el carnet acabó apareciendo en dos
    sitios de la misma pantalla: uno para emitirlo y otro para bajarlo.
    Christopher lo dijo con estas palabras — «hay 2 carnets, el sistema debe
    tener solo 1» — y no pudo terminar de comprobar el QR porque no sabía cuál
    de los dos era el bueno.

    Son un solo objeto y ahora están en un solo sitio, y encima en el orden en
    que se usan: primero se emite, después se imprime. La tarjeta de documentos
    se queda con lo que no es carnet.
  */
  descargar,
  descargando,
}: {
  empleadoId: number
  nombre: string
  puedeEmitir: boolean
  trabajaAqui: boolean
  fotoParaEmitir: () => Promise<string | null>
  /*
    `codigo` es el recien emitido, y NO sobra.

    Al emitir y pedir el PDF en el mismo instante, el dibujo leeria el carnet
    que habia ANTES —ninguno— y el reverso saldria sin QR. La consulta se
    invalida al emitir, pero refrescar es asincrono y esta funcion ya se
    ejecuto: se lleva el codigo en la mano en vez de confiar en que llegue.

    Es el peor momento posible para ese fallo: acabas de emitir, se abre el
    carnet, y es justo el que no sirve.
  */
  descargar: (cara: 'carnet-pdf' | 'frente' | 'reverso', codigo?: string) => void
  descargando: string | null
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

  /*
    EMITIR NO TERMINA EN «EMITIDO». TERMINA CON EL CARNET EN PANTALLA.

    Estaban separados —un botón para emitir y otro para bajar el PDF— y
    Christopher lo dijo dos veces: «el carnet para imprenta y el carnet que se ha
    construido debería ser 1 solo». Tiene razón, y el error era mío: por dentro
    son dos cosas —una fila en la base y un dibujo— pero para quien lo usa el
    carnet es UNA, y pedirle dos pasos es contarle cómo está hecho por dentro.

    Ahora se pulsa una vez y sale el carnet listo para imprimir.
  */
  const confirmar = async () => {
    if (pidiendo === 'emitir') {
      const nuevo = await emitir.mutateAsync({
        empleado_id: empleadoId,
        motivo: motivo.trim() || null,
        foto: await fotoParaEmitir(),
      })
      setMotivo('')
      setPidiendo(null)
      descargar('carnet-pdf', nuevo)
      return
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

          {/*
            Ya emitido, el botón grande es imprimirlo: es lo que se viene a
            hacer aquí el 95% de las veces —el carnet se perdió, se rompió, hace
            falta otra copia— y lo demás son excepciones.
          */}
          <Button
            block
            icon={<Printer />}
            disabled={descargando !== null}
            onClick={() => descargar('carnet-pdf')}
          >
            {descargando === 'carnet-pdf' ? 'Armando el carnet…' : 'Imprimir el carnet'}
          </Button>

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
              ? 'Todavía no tiene carnet. Al emitirlo sale su PDF listo para la imprenta: dos páginas de 54 × 86 mm a 300 dpi, con el QR de verificación en el reverso.'
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
              {emitir.isPending || descargando === 'carnet-pdf'
                ? 'Armando el carnet…'
                : 'Emitir el carnet'}
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

      {/*
        LAS DOS CARAS SUELTAS, EN LETRA PEQUEÑA Y COMO ENLACES.

        Sirven para mirar o retocar una cara, y nada más. Como botones parecían
        dos carnets más, que es justo lo que se estaba corrigiendo. Son un
        apaño de taller, no una forma de sacar el carnet.
      */}
      {carnet ? (
        <p className="text-ink/40 mt-3 text-xs leading-relaxed">
          ¿Hace falta una cara suelta para retocarla?{' '}
          <button
            type="button"
            className="hover:text-ink/70 underline underline-offset-2"
            disabled={descargando !== null}
            onClick={() => descargar('frente')}
          >
            el frente
          </button>{' '}
          ·{' '}
          <button
            type="button"
            className="hover:text-ink/70 underline underline-offset-2"
            disabled={descargando !== null}
            onClick={() => descargar('reverso')}
          >
            el reverso
          </button>
          , en PNG.
        </p>
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
              : `Se le emite a ${nombre} su primer carnet y se abre listo para imprimir.`
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
        {/*
          EL MOTIVO SOLO APARECE SI HAY ALGO QUE ANULAR.

          Lo pidió Christopher: en un primer carnet no hay carnet anterior donde
          escribir nada, así que preguntar «por qué se emite otro» es preguntar
          por algo que no ha pasado. Se entiende solo que es la primera vez.
        */}
        {pidiendo === 'anular' || carnet ? (
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
        ) : null}

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
            {carnet ? (
              <>
                Al emitir se abre el carnet nuevo listo para imprimir.{' '}
                <strong className="text-ink/85">Hay que imprimirlo otra vez</strong>: el código
                nuevo va dentro del QR y el plástico viejo no lo tiene.
              </>
            ) : (
              'Al emitir se abre el carnet listo para imprimir.'
            )}
          </p>
        ) : null}
      </Modal>
    </Card>
  )
}
