import { Input } from '@/components/ui/Input'
import { CampoDocumento } from '@/components/CampoDocumento'
import { CampoTelefono } from '@/components/CampoTelefono'
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
  /** Qué teclas entran y cuántas (la dueña, 08/11/2026: «limita los campos»). */
  solo?: 'numeros' | 'letras' | 'alfanumerico'
  largo?: number
}

const CAMPOS: Record<string, Campo> = {
  banco: { etiqueta: 'Banco', opciones: BANCOS },
  numero_cuenta: {
    etiqueta: 'Número de cuenta',
    marcador: '01020000000000000000',
    modo: 'numeric',
    // Una cuenta venezolana son veinte cifras, sin más.
    solo: 'numeros',
    largo: 20,
  },
  titular: { etiqueta: 'Titular de la cuenta', largo: 120 },
  documento: { etiqueta: 'Cédula o RIF del titular', marcador: 'J-12345678-9' },
  telefono: { etiqueta: 'Teléfono', marcador: '0414 1234567', modo: 'tel' },
  correo_binance: {
    etiqueta: 'Correo o usuario',
    marcador: 'correo@ejemplo.com',
    modo: 'email',
    largo: 120,
  },
  red_cripto: { etiqueta: 'Red', marcador: 'TRON (TRC20)', largo: 40 },
  receptor: { etiqueta: 'Receptor', solo: 'letras', largo: 80 },
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
          : 'Seleccione primero cómo se paga.'}
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
              maxLength={120}
              onChange={(e) => onCambiar({ [clave]: e.target.value } as DatosPago)}
            />
          )
        }

        const valor = (datos as Record<string, string | undefined>)[clave] ?? ''

        // La cédula o el RIF y el teléfono tienen su campo, que ya limita las cifras.
        if (clave === 'documento') {
          return (
            <CampoDocumento
              key={clave}
              tipo="identificacion"
              label={campo.etiqueta}
              valor={valor}
              onCambiar={(v) => onCambiar({ [clave]: v } as DatosPago)}
            />
          )
        }
        if (clave === 'telefono') {
          return (
            <CampoTelefono
              key={clave}
              label={campo.etiqueta}
              valor={valor}
              onCambiar={(v) => onCambiar({ [clave]: v } as DatosPago)}
            />
          )
        }

        return campo.opciones ? (
          <Select
            key={clave}
            label={campo.etiqueta}
            vacio={`Seleccione ${campo.etiqueta.toLowerCase()}`}
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
            solo={campo.solo}
            maxLength={campo.largo}
            value={valor}
            onChange={(e) => onCambiar({ [clave]: e.target.value } as DatosPago)}
          />
        )
      })}
    </div>
  )
}
