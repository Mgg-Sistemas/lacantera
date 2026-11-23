/*
  LA EMISIÓN EN EL PORTAL SENIAT (Providencia SNAT/2026/00093, 23/11/2026).

  La empresa emite sus documentos fiscales en el Portal / aplicativo del SENIAT.
  El sistema arma la factura (la pre-factura); quien la emite en el portal copia
  aquí el número de factura y el número de control que le asignó el SENIAT y
  sube el PDF que descargó. Desde ese momento el libro de ventas y el papel
  usan esos números.

  Contingencia (Art. 6): si no hay luz, internet o el portal está caído, se
  factura en el talonario de imprenta; aquí se registra con el número de control
  preimpreso y se sube el escaneo. Al día siguiente se remite (Art. 7) y se marca
  como enviada.
*/
import { useState } from 'react'
import { FileCheck2, FileUp, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { fechaHora } from '@/lib/formato'
import {
  MEDIOS_EMISION,
  esNumeroDeControl,
  type MedioEmision,
} from '@/lib/fiscal/providencia'
import {
  useMarcarContingenciaEnviada,
  useRegistrarEmisionSeniat,
  urlArchivoSeniat,
  type DocumentoFiscal,
  type EmisionSeniat,
} from '@/lib/api/seniat'

const NOMBRE: Record<DocumentoFiscal, string> = {
  FACTURA: 'factura',
  NOTA_CREDITO: 'nota de crédito',
  NOTA_DEBITO: 'nota de débito',
}

/** `datetime-local` en hora de Caracas a partir de un ISO. */
function aLocal(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '00'
  const hora = v('hour') === '24' ? '00' : v('hour')
  return `${v('year')}-${v('month')}-${v('day')}T${hora}:${v('minute')}:${v('second')}`
}

/** El `datetime-local` se escribió en hora de Caracas (UTC-4, sin horario de verano). */
const desdeLocal = (v: string) => `${v.length === 16 ? `${v}:00` : v}-04:00`

export function ModalEmisionSeniat({
  documento,
  documentoId,
  numeroSistema,
  existente,
  onCerrar,
}: {
  documento: DocumentoFiscal
  documentoId: number
  numeroSistema: string
  existente?: EmisionSeniat | null
  onCerrar: () => void
}) {
  const registrar = useRegistrarEmisionSeniat()
  const [medio, setMedio] = useState<MedioEmision>(existente?.medio ?? 'PORTAL_SENIAT')
  const [numero, setNumero] = useState(existente?.numero ?? '')
  const [control, setControl] = useState(existente?.numero_control ?? '')
  const [momento, setMomento] = useState(aLocal(existente?.emitida_en))
  const [archivo, setArchivo] = useState<File | null>(null)

  const controlMalo = control.trim() !== '' && !esNumeroDeControl(control)
  const contingencia = medio === 'CONTINGENCIA'
  const listo = numero.trim() !== '' && control.trim() !== '' && !controlMalo && momento !== ''

  return (
    <Modal
      abierto
      ancho="md"
      onCerrar={onCerrar}
      titulo={`Registrar emisión SENIAT · ${NOMBRE[documento]} ${numeroSistema}`}
      descripcion={
        contingencia
          ? 'Factura hecha en el talonario de contingencia (Art. 6). Escriba el número y el control preimpreso y suba el escaneo: al día siguiente se remite al SENIAT (Art. 7).'
          : 'Copie el número de documento y el número de control que asignó el Portal SENIAT y suba el PDF que descargó del portal.'
      }
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            icon={<FileCheck2 />}
            disabled={!listo || registrar.isPending}
            onClick={async () => {
              await registrar.mutateAsync({
                documento,
                documento_id: documentoId,
                medio,
                numero,
                numero_control: control,
                emitida_en: desdeLocal(momento),
                archivo,
              })
              onCerrar()
            }}
          >
            {registrar.isPending ? 'Guardando…' : 'Guardar emisión'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Medio de emisión"
          value={medio}
          onChange={(e) => setMedio(e.target.value as MedioEmision)}
          opciones={MEDIOS_EMISION}
          className="sm:col-span-2"
        />
        <Input
          label={contingencia ? 'N° de factura del talonario' : 'N° de documento SENIAT'}
          value={numero}
          sinNormalizar
          onChange={(e) => setNumero(e.target.value)}
        />
        <Input
          label={contingencia ? 'N° de control preimpreso' : 'N° de control SENIAT'}
          value={control}
          sinNormalizar
          placeholder="00-00000001"
          onChange={(e) => setControl(e.target.value)}
          error={controlMalo ? 'Dos dígitos y hasta ocho: 00-00000001 (Art. 9).' : undefined}
        />
        <Input
          label="Fecha y hora de emisión"
          type="datetime-local"
          step={1}
          value={momento}
          onChange={(e) => setMomento(e.target.value)}
          className="sm:col-span-2"
          hint="Hora de Caracas. Es la que aparece en el documento del SENIAT."
        />
        <label className="sm:col-span-2">
          <span className="text-ink/75 mb-1.5 block text-sm font-medium">
            {contingencia ? 'Escaneo de la factura del talonario' : 'PDF descargado del portal'} (máx. 10 MB)
          </span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-ink/70 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink/8 file:px-3 file:py-1.5 file:text-sm"
          />
          {existente?.archivo_nombre && !archivo ? (
            <span className="text-ink/50 mt-1 block text-xs">
              Ya cargado: {existente.archivo_nombre}. Si sube otro, reemplaza la referencia.
            </span>
          ) : null}
        </label>
      </div>
      {registrar.error ? <ErrorDeCarga error={registrar.error} className="mt-4" /> : null}
    </Modal>
  )
}

/** Lo que se enseña de la emisión dentro del detalle del documento. */
export function BloqueEmisionSeniat({
  emision,
  vigente,
  migracionPendiente,
  onRegistrar,
}: {
  emision: EmisionSeniat | null | undefined
  vigente: boolean
  migracionPendiente?: boolean
  onRegistrar: () => void
}) {
  const marcar = useMarcarContingenciaEnviada()
  const [abriendo, setAbriendo] = useState(false)

  if (migracionPendiente) {
    return (
      <p className="text-ink/50 mt-3 text-xs">
        Emisión SENIAT: falta aplicar en la base la migración de la Providencia SNAT/2026/00093.
      </p>
    )
  }

  if (!emision) {
    return (
      <div className="border-hairline rounded-card mt-3 flex flex-wrap items-center justify-between gap-3 border border-dashed p-3">
        <div className="text-sm">
          <p className="text-ink/80 font-medium">Sin emisión SENIAT registrada</p>
          <p className="text-ink/50 text-xs">
            {vigente
              ? 'La Providencia SNAT/2026/00093 ya rige: este papel es una pre-factura hasta registrar la emisión del portal.'
              : 'Desde el 19/04/2027 la factura válida es la que emite el Portal SENIAT. Ya puede registrarla.'}
          </p>
        </div>
        <Button size="sm" variant="outline" icon={<FileUp />} onClick={onRegistrar}>
          Registrar emisión SENIAT
        </Button>
      </div>
    )
  }

  const contingencia = emision.medio === 'CONTINGENCIA'
  return (
    <div className="border-hairline rounded-card bg-ink/2 mt-3 space-y-2 border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={contingencia ? 'warning' : 'success'}>
          {contingencia ? 'Contingencia (talonario)' : 'Emitida en el Portal SENIAT'}
        </Chip>
        <span className="text-ink/80 tabular font-medium">N° {emision.numero}</span>
        <span className="text-ink/60 tabular">Control {emision.numero_control}</span>
        <span className="text-ink/45 text-xs">{fechaHora(emision.emitida_en)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {emision.archivo_path ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={abriendo}
            onClick={async () => {
              setAbriendo(true)
              try {
                window.open(await urlArchivoSeniat(emision.archivo_path!), '_blank', 'noopener')
              } finally {
                setAbriendo(false)
              }
            }}
          >
            📎 {emision.archivo_nombre ?? 'Documento SENIAT'}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onRegistrar}>
          Corregir datos
        </Button>
        {contingencia && !emision.contingencia_enviada_en ? (
          <Button
            size="sm"
            variant="outline"
            icon={<Send />}
            disabled={marcar.isPending}
            onClick={() => void marcar.mutateAsync(emision.id)}
          >
            Marcar remitida al SENIAT
          </Button>
        ) : null}
        {contingencia && emision.contingencia_enviada_en ? (
          <span className="text-success self-center text-xs">
            Remitida el {fechaHora(emision.contingencia_enviada_en)}
          </span>
        ) : null}
      </div>
      {marcar.error ? <ErrorDeCarga error={marcar.error} /> : null}
    </div>
  )
}
