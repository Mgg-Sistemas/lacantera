import { Input } from '@/components/ui/Input'
import { umbralValido, type FormFichaMgg } from './fichaMgg'

/*
  LA FICHA DEL PRODUCTO DE MGG (la dueña, 11/11/2026: «trae la estructura de
  MGG para inventario y almacenes»).

  Lo que MGG pide al dar de alta o corregir un producto y aquí no había: dónde
  está en el almacén, otro nombre con el que se le busca, modelo, fabricante,
  color y el umbral de reabastecimiento propio. Se guarda con
  `guardar_ficha_de_articulo`, aparte de crear/editar el artículo.
*/

export function CamposFichaMgg({
  valor,
  onCambio,
  className,
}: {
  valor: FormFichaMgg
  onCambio: (f: FormFichaMgg) => void
  className?: string
}) {
  const poner = (k: keyof FormFichaMgg) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onCambio({ ...valor, [k]: e.target.value })
  return (
    <div className={className}>
      <div className="text-ink/55 mb-2 text-xs font-semibold tracking-wide uppercase">Ubicación e identificación</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          maxLength={80}
          label="Ubicación física"
          placeholder="Estante, pasillo o pila"
          hint="Dónde se encuentra dentro del almacén."
          value={valor.ubicacion_fisica}
          onChange={poner('ubicacion_fisica')}
        />
        <Input
          maxLength={200}
          label="Alias o nombre de búsqueda"
          placeholder="Otros nombres con que lo piden"
          hint="El buscador también mira aquí."
          value={valor.alias}
          onChange={poner('alias')}
        />
        <Input maxLength={80} label="Modelo" value={valor.modelo} onChange={poner('modelo')} />
        <Input maxLength={80} label="Fabricante" value={valor.fabricante} onChange={poner('fabricante')} />
        <Input maxLength={40} label="Color" value={valor.color} onChange={poner('color')} />
        <Input
          inputMode="decimal"
          label="Umbral de reabastecimiento (%)"
          placeholder="Según su clase ABC"
          hint="En % del mínimo. Vacío: A 120 %, B 100 %, C 80 %."
          error={umbralValido(valor) ? undefined : 'Entre 1 y 1000.'}
          value={valor.restock_pct}
          onChange={poner('restock_pct')}
        />
      </div>
    </div>
  )
}
