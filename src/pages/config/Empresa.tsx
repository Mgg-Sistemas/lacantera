import { useEffect, useState } from 'react'
import { Building2, Save, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useMisAcciones } from '@/lib/api/usuarios'
import {
  diasParaVencer,
  useEmpresa,
  useFijarTributos,
  useGuardarEmpresa,
  type Empresa as Datos,
} from '@/lib/api/empresa'
import { fecha } from '@/lib/formato'

/**
 * Quién es la empresa, según el registro.
 *
 * Estos datos salen impresos en todo lo que emite el sistema —recibos de pago,
 * carnets, guías—, así que un error aquí sale multiplicado en papel. Por eso
 * vienen del comprobante del SENIAT y no de la memoria de nadie, y por eso el
 * RIF se valida antes de guardarlo.
 *
 * El vencimiento del RIF tiene aviso propio: es la clase de fecha de la que uno
 * se entera el día que una factura se detiene.
 */
export function Empresa() {
  const { data, isPending, error } = useEmpresa()
  const guardar = useGuardarEmpresa()
  const fijar = useFijarTributos()
  const { puede: alcanza } = useMisAcciones()

  /*
    Dos permisos distintos que estaban gobernados por la misma reja.

    Corregir el RIF de la empresa y decidir si se cobra IVA son decisiones que no
    tienen por que ir juntas — es justo el «gestionar de forma limitada» que se
    pidio. Ahora cada boton pregunta por lo suyo, y quien tenga uno y no el otro
    ve exactamente lo que puede tocar.
  */
  const puedeEditarFicha = alcanza('CONFIGURACION.EDITAR_EMPRESA')
  const puedeFijarTributos = alcanza('CONFIGURACION.FIJAR_TRIBUTOS')

  const tributos = {
    aplica_iva: data?.aplica_iva ?? true,
    aplica_igtf: data?.aplica_igtf ?? true,
  }

  const [form, setForm] = useState<Partial<Datos>>({})
  const [fallo, setFallo] = useState('')
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const cambiar = (parte: Partial<Datos>) => {
    setForm((v) => ({ ...v, ...parte }))
    setGuardado(false)
  }

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />

  const dias = diasParaVencer(form.rif_vence_el ?? null)
  const rifValido = /^[JGVEP]-?\d{8}-?\d$/.test((form.rif ?? '').trim())

  const enviar = async () => {
    setFallo('')
    try {
      await guardar.mutateAsync({
        ...form,
        rif: form.rif ?? '',
        razon_social: form.razon_social ?? '',
      })
      setGuardado(true)
    } catch (e) {
      setFallo(e instanceof Error ? e.message : String(e))
    }
  }

  const campo = (
    etiqueta: string,
    clave: keyof Datos,
    extra: { tipo?: string; hint?: string; error?: string } = {},
  ) => (
    <Input
      label={etiqueta}
      type={extra.tipo}
      value={(form[clave] as string | null) ?? ''}
      onChange={(e) => cambiar({ [clave]: e.target.value } as Partial<Datos>)}
      disabled={!puedeEditarFicha}
      hint={extra.hint}
      error={extra.error}
    />
  )

  return (
    <>
      <PageHeader
        title="Datos de la empresa"
        description="Lo que dice el registro. Sale impreso en cada papel que emite el sistema."
      />

      {/* El aviso va arriba porque es lo único de esta pantalla que puede
          detener una operación mañana por la mañana. */}
      {dias !== null && dias <= 90 ? (
        <div
          role="alert"
          className={`mb-4 flex items-start gap-3 rounded-[8px] border p-3 text-sm ${
            dias < 0
              ? 'border-danger/40 bg-danger-soft text-danger'
              : 'border-warning/40 bg-warning-soft text-warning'
          }`}
        >
          <TriangleAlert className="mt-0.5 size-[18px] shrink-0" />
          <p>
            {dias < 0
              ? `El RIF venció el ${fecha(form.rif_vence_el ?? null)}. Con el RIF vencido no se puede facturar.`
              : `El RIF vence el ${fecha(form.rif_vence_el ?? null)}, dentro de ${dias} día${dias === 1 ? '' : 's'}. Conviene renovarlo antes.`}
          </p>
        </div>
      ) : null}

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="bg-royal-600/10 text-royal-600 dark:text-royal-300 flex size-10 items-center justify-center rounded-[8px]">
            <Building2 className="size-5" />
          </div>
          <div>
            <h2 className="text-ink/90 text-base font-semibold">Identificación</h2>
            <p className="text-ink/50 text-xs">
              La razón social va tal como está registrada, en mayúsculas y sin tildes.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {campo('RIF', 'rif', {
            error: form.rif && !rifValido ? 'Debe ser como J-50209170-0.' : undefined,
          })}
          {campo('Razón social', 'razon_social')}
        </div>

        <div className="mt-4 grid gap-4">
          {campo('Domicilio fiscal', 'domicilio_fiscal')}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {campo('Ciudad', 'ciudad')}
          {campo('Estado', 'estado')}
          {campo('Zona postal', 'zona_postal')}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {campo('Teléfono', 'telefono')}
          {campo('Correo', 'correo', { tipo: 'email' })}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-ink/90 mb-1 text-base font-semibold">Registro fiscal</h2>
        <p className="text-ink/50 mb-5 text-xs">
          Del comprobante del SENIAT. Se actualiza cada vez que se renueva el RIF.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {campo('Inscripción', 'inscrito_el', { tipo: 'date' })}
          {campo('Última actualización', 'rif_actualizado_el', { tipo: 'date' })}
          {campo('Vence', 'rif_vence_el', { tipo: 'date' })}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {campo('N° de comprobante', 'comprobante_rif')}
          {campo('Gerencia regional', 'gerencia_seniat')}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {campo('Condición ante el IVA', 'condicion_iva')}
          <Input
            label="Retención de IVA"
            inputMode="decimal"
            value={form.retencion_iva_pct == null ? '' : String(form.retencion_iva_pct)}
            onChange={(e) =>
              cambiar({
                retencion_iva_pct: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            disabled={!puedeEditarFicha}
            hint="Porcentaje del impuesto causado que retienen los agentes de retención."
          />
        </div>

        {/*
          LA ALÍCUOTA, AQUÍ Y EN NINGÚN OTRO SITIO.

          Estaba escrita como un 16 en cinco puntos del código. Es una cifra
          legal: cambia por decreto, y el día que cambie no puede hacer falta
          una versión del sistema para seguirla — se cambia aquí y los
          documentos nuevos salen con la nueva.

          Los ya emitidos no se tocan: cada cotización, nota y factura guarda la
          suya, que es lo que hace que una factura de marzo siga diciendo lo que
          decía en marzo.

          En blanco, el sistema usa el 16 de respaldo.
        */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Alícuota general del IVA"
            inputMode="decimal"
            value={form.alicuota_iva_pct == null ? '' : String(form.alicuota_iva_pct)}
            onChange={(e) =>
              cambiar({
                alicuota_iva_pct: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            disabled={!puedeEditarFicha}
            hint="La que se propone en los documentos nuevos. Los ya emitidos conservan la suya."
          />
        </div>
      </Card>

      {/*
        LA IMPRENTA AUTORIZADA.

        Una factura venezolana lleva impreso quién la imprimió y con qué número
        la autorizó el SENIAT. Es lo único que faltaba para que la factura
        cumpla, y hasta hoy no existía como dato en ninguna parte.

        Solo va en la factura: una cotización o una nota de entrega no la
        necesitan, y ponérsela sería darles un aire fiscal que no tienen.

        Mientras esto esté vacío no se imprime nada. Un renglón que dice
        «Imprenta: —» no cumple el requisito y encima parece que el sistema se
        dejó algo.
      */}
      <Card className="mt-4">
        <h2 className="text-ink/90 mb-1 text-base font-semibold">Imprenta autorizada</h2>
        <p className="text-ink/50 mb-5 text-xs leading-relaxed">
          Va impresa al pie de la factura, y solo de la factura. Es lo que el SENIAT exige que diga
          quién imprimió el formato. Vacío, no se imprime nada.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {campo('Nombre de la imprenta', 'imprenta_nombre')}
          {campo('RIF de la imprenta', 'imprenta_rif')}
          {campo('N° de autorización', 'imprenta_autorizacion')}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-ink/90 mb-1 text-base font-semibold">Impuestos</h2>
        <p className="text-ink/50 mb-5 text-xs leading-relaxed">
          Cómo llegan marcadas las casillas al emitir. Cada operación puede decir otra cosa: esto
          solo decide lo habitual, para que nadie tenga que acordarse en cada venta.
        </p>

        <div className="grid gap-3">
          <Interruptor
            titulo="Cobra IVA"
            detalle="Se aplica el 16 % a las cotizaciones, notas de entrega y facturas nuevas."
            marcado={tributos.aplica_iva}
            editable={puedeFijarTributos}
            onCambiar={(v) => void fijar.mutateAsync({ ...tributos, aplica_iva: v })}
          />
          <Interruptor
            titulo="Cobra IGTF"
            detalle="El 3 % sobre los cobros en divisas. Sin esto la casilla no se marca ni cobrando en dólares."
            marcado={tributos.aplica_igtf}
            editable={puedeFijarTributos}
            onCambiar={(v) => void fijar.mutateAsync({ ...tributos, aplica_igtf: v })}
          />
        </div>

        {fijar.error ? (
          <p className="text-danger mt-3 text-sm">{(fijar.error as Error).message}</p>
        ) : null}
      </Card>

      {puedeEditarFicha ? (
        <div className="mt-4 flex items-center justify-end gap-3">
          {guardado ? <span className="text-success text-sm">Guardado.</span> : null}
          {fallo ? <span className="text-danger text-sm">{fallo}</span> : null}
          <Button
            icon={<Save className="size-[18px]" />}
            onClick={enviar}
            disabled={guardar.isPending || !rifValido || !(form.razon_social ?? '').trim()}
          >
            {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      ) : (
        <p className="text-ink/45 mt-4 text-xs">
          Solo la gerencia y quien administra el sistema pueden cambiar estos datos.
        </p>
      )}
    </>
  )
}

/**
 * Una casilla que se guarda al momento.
 *
 * No espera al botón de «guardar cambios» como el resto de la ficha: son dos
 * valores sueltos con su propia función, y hacer que dependan del formulario
 * grande obligaría a mandar los quince campos para cambiar uno.
 */
function Interruptor({
  titulo,
  detalle,
  marcado,
  editable,
  onCambiar,
}: {
  titulo: string
  detalle: string
  marcado: boolean
  editable: boolean
  onCambiar: (valor: boolean) => void
}) {
  return (
    <label
      className={
        'border-hairline flex items-start gap-2.5 rounded-[6px] border p-3 ' +
        (editable ? 'cursor-pointer' : 'opacity-60')
      }
    >
      <input
        type="checkbox"
        checked={marcado}
        disabled={!editable}
        onChange={(e) => onCambiar(e.target.checked)}
        className="accent-royal-600 mt-0.5 size-4 shrink-0"
      />
      <span>
        <span className="text-ink/85 text-sm font-medium">{titulo}</span>
        <span className="text-ink/50 mt-0.5 block text-xs leading-relaxed">{detalle}</span>
      </span>
    </label>
  )
}
