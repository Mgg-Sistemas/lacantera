import { CampoDocumento } from '@/components/CampoDocumento'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { useMotivosDespacho, usePersonasParaVale } from '@/lib/api/combustible'
import type { EstadoVale } from './comun'

/*
  «¿QUIÉN RECIBIÓ?» Y «PARA QUÉ»: LO DEL VALE QUE GOLDEN TOUCH NO TENÍA.

  Son dos de las cuatro reglas de La Cantera que se quedan (decisión de la
  dueña, 09/11/2026): todo surtido dice quién recibió el combustible —de la
  nómina, o escrito a mano para el chofer de un fletero— y para qué se surtió
  (`motivos_despacho`, que se editan en 🗂 Catálogos → «Para qué»). El motivo
  que lo exige pide además explicarse en pocas palabras.

  Va igual al surtir, al pasar a un bidón (que también deja vale) y al
  corregir un uso.
*/
export function CamposVale({
  vale,
  onCambio,
  disabled,
}: {
  vale: EstadoVale
  onCambio: (parcial: Partial<EstadoVale>) => void
  disabled?: boolean
}) {
  const motivos = useMotivosDespacho()
  const personas = usePersonasParaVale()
  const elMotivo = motivos.data?.find((m) => m.codigo === vale.motivo)

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Select
          label="Para qué"
          vacio="Elegir"
          value={vale.motivo}
          disabled={disabled}
          onChange={(e) => onCambio({ motivo: e.target.value })}
          opciones={(motivos.data ?? []).map((m) => ({ valor: m.codigo, etiqueta: m.nombre }))}
          hint={elMotivo?.pista ?? 'Para qué se surte, no a qué máquina.'}
        />
        {elMotivo?.exige_detalle ? (
          <Input
            className="mt-3"
            label="Detalle del uso"
            placeholder="Prueba de la bomba nueva"
            value={vale.detalle}
            disabled={disabled}
            onChange={(e) => onCambio({ detalle: e.target.value })}
            hint="En pocas palabras."
          />
        ) : null}
      </div>
      <div>
        <SelectBuscable
          label="¿Quién recibió?"
          vacio="No está en la nómina"
          valor={vale.empleado}
          disabled={disabled}
          onCambio={(v) => onCambio({ empleado: v })}
          opciones={(personas.data ?? []).map((e) => ({
            valor: String(e.id),
            etiqueta: e.cargo ? `${e.nombre} · ${e.cargo}` : e.nombre,
          }))}
        />
        {vale.empleado === '' ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Nombre de quien recibió"
              placeholder="José Ramírez"
              value={vale.nombre}
              disabled={disabled}
              onChange={(e) => onCambio({ nombre: e.target.value })}
            />
            <CampoDocumento label="Cédula" valor={vale.cedula} onCambiar={(v) => onCambio({ cedula: v })} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
