import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { BANCOS } from '@/lib/bancos'
import type { DatosPago } from '@/lib/api/compras'
import type { MetodoPago } from '@/lib/api/metodosPago'

/**
 * Los datos que hace falta llenar para poder pagar.
 *
 * POR QUÉ SALEN DE UNA TABLA Y NO DE UN `IF` POR MÉTODO
 *
 * Antes el formulario tenía un bloque escrito a mano por cada método: uno para
 * transferencia con sus cuatro campos, otro para pago móvil con los suyos, y
 * así. Funcionaba, pero cada método nuevo obligaba a añadir un bloque más, y el
 * día que se añadieran tres a la vez —Zelle, cheque y otro— alguien tendría que
 * acordarse de escribir los tres, en esta pantalla y en las otras que piden lo
 * mismo.
 *
 * Ahora el catálogo dice qué campos exige cada método y aquí solo hay un
 * diccionario que sabe dibujar cada campo. Añadir un método es insertar una
 * fila en la base; añadir un campo que ningún método pedía todavía es una
 * entrada más aquí abajo. Los dos casos dejan de tocar las pantallas.
 *
 * Y es el mismo diccionario que usa el disparador de la base para validar, solo
 * que del otro lado: allí comprueba que no vengan vacíos, aquí los dibuja. Una
 * sola lista de campos, dos usos.
 */

interface Campo {
  etiqueta: string
  /** Sin esto, un `<Input>` de texto. */
  opciones?: string[]
  marcador?: string
  modo?: 'tel' | 'numeric' | 'email'
}

const CAMPOS: Record<string, Campo> = {
  banco: { etiqueta: 'Banco', opciones: BANCOS },
  numero_cuenta: {
    etiqueta: 'Número de cuenta',
    marcador: '0102 0000 00 0000000000',
    modo: 'numeric',
  },
  titular: { etiqueta: 'Titular de la cuenta' },
  documento: { etiqueta: 'Cédula o RIF del titular', marcador: 'J-12345678-9' },
  telefono: { etiqueta: 'Teléfono', marcador: '0414 1234567', modo: 'tel' },
  correo_binance: {
    etiqueta: 'Correo o usuario',
    marcador: 'correo@ejemplo.com',
    modo: 'email',
  },
  red_cripto: { etiqueta: 'Red', marcador: 'TRON (TRC20)' },
  receptor: { etiqueta: 'Quién recibe el efectivo' },
}

export function CamposDePago({
  metodo,
  datos,
  onCambiar,
}: {
  metodo: MetodoPago | undefined
  datos: DatosPago
  onCambiar: (cambios: DatosPago) => void
}) {
  const exigidos = metodo?.campos_exigidos ?? []

  /*
    "Otro" no pide nada, y decirlo es mejor que dejar un hueco.

    Sin este aviso la pantalla se queda con el título "Datos de la transacción"
    y nada debajo, que se lee como que algo no cargó.
  */
  if (exigidos.length === 0) {
    return (
      <p className="text-ink/50 border-hairline rounded-[6px] border border-dashed p-4 text-sm">
        {metodo
          ? `${metodo.nombre} no pide datos adicionales.`
          : 'Elige primero cómo se paga.'}
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {exigidos.map((clave) => {
        const campo = CAMPOS[clave]

        // Un campo que el catálogo pide y aquí no se sabe dibujar: se ofrece
        // como texto en vez de desaparecer. Perder un dato obligatorio en
        // silencio es peor que enseñarlo con una etiqueta fea.
        if (!campo) {
          return (
            <Input
              key={clave}
              label={clave}
              value={(datos as Record<string, string | undefined>)[clave] ?? ''}
              onChange={(e) => onCambiar({ [clave]: e.target.value } as DatosPago)}
            />
          )
        }

        const valor = (datos as Record<string, string | undefined>)[clave] ?? ''

        return campo.opciones ? (
          <Select
            key={clave}
            label={campo.etiqueta}
            vacio={`Elige ${campo.etiqueta.toLowerCase()}`}
            value={valor}
            onChange={(e) => onCambiar({ [clave]: e.target.value } as DatosPago)}
            opciones={campo.opciones.map((o) => ({ valor: o, etiqueta: o }))}
          />
        ) : (
          <Input
            key={clave}
            label={campo.etiqueta}
            placeholder={campo.marcador}
            inputMode={campo.modo === 'email' ? undefined : campo.modo}
            type={campo.modo === 'email' ? 'email' : 'text'}
            value={valor}
            onChange={(e) => onCambiar({ [clave]: e.target.value } as DatosPago)}
          />
        )
      })}
    </div>
  )
}
