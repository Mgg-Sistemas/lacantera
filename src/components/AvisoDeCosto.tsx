import { useRevisarCostoDeEntrada } from '@/lib/api/inventario'
import { enteros } from '@/lib/formato'

/*
  EL AVISO DEL COSTO RARO.

  Vivía dentro de `Existencias.tsx`, de donde se sacó para que la vista de
  teléfono del almacén pudiera usarlo sin duplicar la lógica: es un control
  de seguridad sobre el dinero, no un adorno, y tiene que comportarse
  exactamente igual en los dos sitios.

  La regla la impone la base —`registrar_entradas` rechaza el renglón si no
  viene confirmado— y esto es la cortesía de decirlo mientras se escribe, con
  la casilla al lado para no tener que guardar, leer el error y volver.

  QUIEN DECIDE ES LA BASE, no esta pantalla. Antes se deducía de
  `v_existencias`, y eso salió mal de dos maneras que se tapaban entre sí: la
  vista esconde el promedio a quien no ve valoraciones, así que al
  almacenista le decía «primera entrada» siempre; y la comparación solo se
  hacía en dólares, que no es la moneda de las facturas de aquí.
*/

function cantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? enteros(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

function monto(valor: number): string {
  return valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function AvisoDeCosto({
  almacenId,
  articuloId,
  costo,
  moneda,
  cantidad: cant,
  unidad,
  nombre,
  confirmado,
  onConfirmar,
}: {
  almacenId: number | null
  articuloId: number | null
  costo: number
  moneda: string
  cantidad: number
  unidad: string
  nombre: string
  confirmado: boolean
  onConfirmar: (valor: boolean) => void
}) {
  const revision = useRevisarCostoDeEntrada(almacenId, articuloId, costo, moneda)

  if (!articuloId || costo <= 0 || cant <= 0) return null

  const r = revision.data
  /*
    Mientras la base contesta no se pinta nada. Enseñar un hueco reservado que
    luego casi siempre queda vacío entrena a no mirarlo, que es lo contrario de
    lo que hace falta aquí.
  */
  if (!r || r.estado === 'NORMAL' || r.estado === 'SIN_ARTICULO') return null

  if (r.estado === 'SIN_TASA') {
    return (
      <p className="text-ink/50 mt-3 text-xs">
        No hay tasa del {moneda} para hoy: el costo no se compara con el anterior. Se avisa al
        guardar.
      </p>
    )
  }

  const casilla = (texto: string) => (
    <label className="text-ink/70 mt-2 flex cursor-pointer items-center gap-2 text-xs">
      <input type="checkbox" checked={confirmado} onChange={(e) => onConfirmar(e.target.checked)} />
      {texto}
    </label>
  )

  /*
    LA PRIMERA VEZ NO HAY CONTRA QUE COMPARAR, Y ES CUANDO MAS DUELE.

    Los cinco aceites del 5 de septiembre entraban por primera vez, así que la
    reja de las diez veces no tenía con qué medirlos y calló. No hay número
    contra el que avisar; lo que sí se puede es decir que NADIE lo está
    comprobando, y que ese costo se convierte en la referencia de todo lo que
    venga después.

    La base lo exige igual, así que esto no es un adorno: sin la casilla, el
    guardado fallaría con un error que la pantalla no ofrece cómo resolver.
  */
  if (r.estado === 'PRIMERA') {
    /*
      CON LA MONEDA Y SU EQUIVALENTE EN LA OTRA.

      Decía «a 39.332,15 cada una», y con una factura en bolívares esa cifra
      coincidía con el papel: la casilla se marcó de buena fe y la cafetera entró
      en dólares. Ahora dice la moneda y cuánto es en la otra —la cuenta la hace
      la base con la tasa del día—, que es donde un error así se ve: treinta y
      tres millones de bolívares por una cafetera no pasan desapercibidos.
    */
    const rotulo = (m: string) => (m === 'VES' ? 'Bs' : m)
    return (
      <div className="border-hairline bg-ink/4 rounded-card mt-3 border p-2.5">
        <p className="text-ink/80 text-xs leading-relaxed">
          <strong>Es la primera vez que entra a este almacén</strong>, así que no hay con qué
          comparar el costo. Serán <span className="tabular">{cantidad(cant)}</span> {unidad} a{' '}
          <span className="tabular font-semibold">
            {monto(costo)} {rotulo(moneda)}
          </span>{' '}
          cada una
          {r.equivale != null && r.equivale_en ? (
            <>
              , que son{' '}
              <span className="tabular font-semibold">
                {monto(r.equivale)} {rotulo(r.equivale_en)}
              </span>
            </>
          ) : null}
          . Este costo se convierte en la referencia de todo lo que entre después.
        </p>
        {casilla('Lo comprobé con la factura, también la moneda')}
      </div>
    )
  }

  const veLasCifras = r.veces != null && r.viene_costando != null && r.entra_a != null

  return (
    <div className="border-warning/40 bg-warning-soft rounded-card mt-3 border p-2.5">
      <p className="text-ink/80 text-xs leading-relaxed">
        {veLasCifras ? (
          <>
            <strong>
              {nombre} viene costando {monto(r.viene_costando!)}
            </strong>{' '}
            por {unidad || 'unidad'} y lo está metiendo a {monto(r.entra_a!)}: son{' '}
            <strong>
              {monto(r.veces!)} veces {r.hacia === 'ARRIBA' ? 'más' : 'menos'}
            </strong>
            .
          </>
        ) : (
          <>
            <strong>
              Este costo se sale mucho de lo que {nombre} viene costando en este almacén
            </strong>{' '}
            — es más de diez veces {r.hacia === 'ARRIBA' ? 'más caro' : 'más barato'}.
          </>
        )}{' '}
        Compruebe la factura y la moneda.
      </p>
      {casilla('Es correcto, guárdelo así — quedará anotado en el movimiento')}
    </div>
  )
}
