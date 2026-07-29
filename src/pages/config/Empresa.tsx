import { useEffect, useState } from 'react'
import { Building2, Save, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useMisRoles } from '@/lib/api/catalogo'
import { diasParaVencer, useEmpresa, useGuardarEmpresa, type Empresa as Datos } from '@/lib/api/empresa'
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
  const { puede } = useMisRoles()
  const editable = puede('ADMIN') || puede('GERENTE_GENERAL')

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
      disabled={!editable}
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
            disabled={!editable}
            hint="Porcentaje del impuesto causado que retienen los agentes de retención."
          />
        </div>
      </Card>

      {editable ? (
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
