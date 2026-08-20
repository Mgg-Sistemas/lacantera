import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { useMonedas, useTasasVigentes } from '@/lib/api/tasas'
import type { Moneda } from '@/lib/api/tasas'
import { ErrorDeCuenta, calcular } from '@/lib/calculo'
import type { Resultado } from '@/lib/calculo'

/*
  CONVERTIR SIN SALIR DE LO QUE ESTABAS HACIENDO

  La casa mueve bolívares, dólares, euros y USDT a la vez, y la pregunta que
  aparece a mitad de una llamada no es «cuál es la tasa» sino «cuánto es esto en
  aquello»: 300 $ en USDT, o 120 € más 80 $ menos 15,50 $ en bolívares, o lo que
  cuesta una compra con su IVA repartida entre tres.

  Por eso es una calculadora y no un campo de conversión. Quien tiene tres
  cifras delante las escribe seguidas en vez de convertirlas una a una y
  operarlas a mano, que es donde se cometen los errores.

  Las reglas de qué se puede operar con qué están en `lib/calculo.ts`, con el
  motivo de cada una.
*/

const EJEMPLOS = ['(300 $ + 120 €) / 3', '850 usdt * 1,16', '1200 $ - 340,50 €']

export function Conversor({ compacto = false }: { compacto?: boolean }) {
  const monedas = useMonedas()
  const otras = useTasasVigentes(
    monedas.data?.filter((m) => m.codigo !== 'VES'),
    true,
  )

  const [texto, setTexto] = useState('')
  const [destino, setDestino] = useState('VES')

  /** Bolívares por unidad de cada moneda. El bolívar contra sí mismo es 1. */
  const enBolivares = useMemo(() => {
    const m = new Map<string, number>([['VES', 1]])
    for (const { moneda, tasa } of otras.datos) {
      if (tasa) m.set(moneda.codigo, Number(tasa.tasa))
    }
    return m
  }, [otras.datos])

  const alias = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of monedas.data ?? []) {
      m.set(x.codigo.toUpperCase(), x.codigo)
      m.set(x.simbolo.toUpperCase(), x.codigo)
      m.set(x.nombre.toUpperCase(), x.codigo)
    }
    // Como lo escribe la gente, que no es como está en el catálogo.
    m.set('BS', 'VES')
    m.set('BSS', 'VES')
    m.set('$', 'USD')
    m.set('DOLAR', 'USD')
    m.set('DOLARES', 'USD')
    m.set('€', 'EUR')
    m.set('EURO', 'EUR')
    m.set('EUROS', 'EUR')
    return m
  }, [monedas.data])

  const simbolo = (c: string) => monedas.data?.find((m) => m.codigo === c)?.simbolo ?? c
  const nombre = (c: string) => monedas.data?.find((m) => m.codigo === c)?.nombre ?? c

  const { salida, fallo } = useMemo((): { salida: Resultado | null; fallo: string | null } => {
    try {
      return { salida: calcular(texto, alias, enBolivares, nombre, simbolo), fallo: null }
    } catch (e) {
      // Lo que no entiende la calculadora se explica; cualquier otra cosa sería
      // un fallo del programa y no se disfraza de mensaje al usuario.
      if (e instanceof ErrorDeCuenta) return { salida: null, fallo: e.message }
      throw e
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, alias, enBolivares, monedas.data])

  const formatear = (valor: number, codigo: string) =>
    `${codigo === 'VES' ? 'Bs' : simbolo(codigo)} ${new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)}`

  // Solo se ofrecen como destino las que tienen tasa: convertir a algo sin tasa
  // no da un número, da un error, y ofrecerlo enseña a chocarse.
  const destinos = (monedas.data ?? []).filter((m: Moneda) => enBolivares.has(m.codigo))

  const tasaDestino = enBolivares.get(destino)
  const esDinero = salida?.valor.dim === 1

  return (
    <div>
      <p
        className={cn(
          'text-ink/45 font-medium tracking-wide uppercase',
          compacto ? 'text-2xs mb-2' : 'text-xs mb-3',
        )}
      >
        Calcular
      </p>

      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="(300 $ + 120 €) / 3"
        aria-label="Cuenta a calcular"
        spellCheck={false}
        autoComplete="off"
        className={cn(
          'rounded-control bg-surface text-ink/90 w-full border px-3 font-mono',
          'hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20',
          'focus:ring-2 focus:outline-none',
          fallo ? 'border-danger/50' : 'border-ink/20',
          compacto ? 'h-9 text-sm' : 'h-10 text-base',
        )}
      />

      {/* Solo mientras está vacío: enseñan lo que se puede escribir sin
          obligar a leer una explicación. */}
      {!texto && !compacto ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EJEMPLOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setTexto(e)}
              className="border-hairline text-ink/45 hover:text-ink/80 rounded-full border px-2.5 py-1 font-mono text-xs transition-colors"
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}

      {esDinero ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-ink/45 text-xs">en</span>
          {destinos.map((m) => (
            <button
              key={m.codigo}
              type="button"
              onClick={() => setDestino(m.codigo)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                m.codigo === destino
                  ? 'border-royal-600 bg-royal-600/12 text-ink/90 font-medium'
                  : 'border-hairline text-ink/55 hover:text-ink/85',
              )}
            >
              {m.codigo === 'VES' ? 'Bs' : m.simbolo}
            </button>
          ))}
        </div>
      ) : null}

      {fallo ? <p className="text-danger mt-2.5 text-xs leading-relaxed">{fallo}</p> : null}

      {salida ? (
        <div className="border-hairline mt-2.5 border-t pt-2.5">
          <p className={cn('tabular text-ink/90 font-semibold', compacto ? 'text-lg' : 'text-2xl')}>
            {esDinero && tasaDestino
              ? formatear(salida.valor.bs / tasaDestino, destino)
              : new Intl.NumberFormat('es-VE', { maximumFractionDigits: 4 }).format(salida.valor.bs)}
          </p>

          {/* Cómo se leyó la cuenta.

              Esta línea existe porque la versión anterior de esto leyó
              `(1+98.09usdt*2eur)/2usd` como cuatro sumas y devolvió un número
              con toda confianza. Ver la cuenta reescrita es la única forma de
              enterarse de que se entendió otra cosa. */}
          <p className="text-ink/45 mt-1 font-mono text-xs wrap-break-word">
            {salida.comoSeLeyo}
            {!esDinero ? '  · sin moneda' : ''}
          </p>
        </div>
      ) : null}
    </div>
  )
}
