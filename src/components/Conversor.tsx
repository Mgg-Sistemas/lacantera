import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { useMonedas, useTasasVigentes } from '@/lib/api/tasas'
import type { Moneda } from '@/lib/api/tasas'

/*
  CONVERTIR SIN SALIR DE LO QUE ESTABAS HACIENDO

  La casa mueve bolívares, dólares, euros y USDT a la vez, y la pregunta que
  aparece en mitad de una llamada no es «cuál es la tasa» sino «cuánto es esto
  en aquello»: 300 $ en USDT, o 120 € más 80 $ menos 15,50 $ en bolívares.

  Por eso acepta una cuenta y no un solo monto. Quien tiene tres cifras delante
  las escribe seguidas en vez de convertirlas una a una y sumarlas a mano, que
  es donde se cometen los errores.

  Todo pasa por bolívares porque es lo único contra lo que hay tasas: cada
  moneda tiene la suya contra el bolívar, y no hay una tabla de pares. Así que
  euros → bolívares → USDT, con una sola conversión intermedia y sin inventar
  cruces que nadie registró.
*/

interface Termino {
  signo: number
  monto: number
  codigo: string
}

/**
 * Lee «120 eur + 80 usd - 15,50 $» como una lista de términos con signo.
 *
 * El separador decimal es un problema real aquí: en Venezuela se escribe
 * `15,50` y el teclado numérico pone `15.50`. Se aceptan los dos, y cuando
 * aparecen ambos manda el último, que es el decimal en las dos convenciones.
 *
 * Un término sin moneda hereda la del anterior: «100 + 50 usd» son 150 dólares,
 * que es como lo diría cualquiera en voz alta.
 */
function leer(texto: string, alias: Map<string, string>, pordefecto: string): Termino[] {
  const terminos: Termino[] = []
  const patron = /([+-])?\s*([\d.,]+)\s*([\p{L}$€]*)/gu

  let ultima = ''
  for (const trozo of texto.matchAll(patron)) {
    const crudo = trozo[2]
    if (!crudo || !/\d/.test(crudo)) continue

    const corte = Math.max(crudo.lastIndexOf(','), crudo.lastIndexOf('.'))
    const monto =
      corte === -1
        ? Number(crudo.replace(/[.,]/g, ''))
        : Number(
            crudo.slice(0, corte).replace(/[.,]/g, '') + '.' + crudo.slice(corte + 1),
          )

    if (!Number.isFinite(monto)) continue

    const escrita = alias.get((trozo[3] ?? '').toUpperCase())
    const codigo = escrita ?? ultima ?? pordefecto
    ultima = codigo

    terminos.push({ signo: trozo[1] === '-' ? -1 : 1, monto, codigo: codigo || pordefecto })
  }

  // La moneda escrita puede aparecer después del primer número —«100 + 50 usd»—
  // así que los términos que quedaron sin ninguna toman la primera que salga.
  const primera = terminos.find((t) => t.codigo)?.codigo ?? pordefecto
  return terminos.map((t) => ({ ...t, codigo: t.codigo || primera }))
}

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

  type Cuenta =
    | { estado: 'falta'; sinTasa: string[] }
    | { estado: 'listo'; terminos: Termino[]; bolivares: number; total: number }

  const cuenta = useMemo<Cuenta | null>(() => {
    const terminos = leer(texto, alias, 'USD')
    if (terminos.length === 0) return null

    // Una moneda sin tasa registrada no se puede convertir, y decir cuál falta
    // es más útil que un resultado a medias.
    const sinTasa = [...new Set(terminos.map((t) => t.codigo))].filter(
      (c) => !enBolivares.has(c),
    )
    if (sinTasa.length > 0) return { estado: 'falta', sinTasa }

    const bolivares = terminos.reduce(
      (suma, t) => suma + t.signo * t.monto * (enBolivares.get(t.codigo) ?? 0),
      0,
    )

    const tasaDestino = enBolivares.get(destino)
    if (!tasaDestino) return { estado: 'falta', sinTasa: [destino] }

    return { estado: 'listo', terminos, bolivares, total: bolivares / tasaDestino }
  }, [texto, alias, enBolivares, destino])

  const simbolo = (c: string) =>
    monedas.data?.find((m) => m.codigo === c)?.simbolo ?? c

  const formatear = (valor: number, codigo: string) =>
    `${codigo === 'VES' ? 'Bs' : simbolo(codigo)} ${new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(valor)}`

  // Solo se ofrecen como destino las que tienen tasa: convertir a algo sin tasa
  // no da un número, da un error, y ofrecerlo enseña a chocarse.
  const destinos = (monedas.data ?? []).filter((m: Moneda) => enBolivares.has(m.codigo))

  return (
    <div>
      <p
        className={cn(
          'text-ink/45 font-medium tracking-wide uppercase',
          compacto ? 'text-2xs mb-2' : 'text-xs mb-3',
        )}
      >
        Convertir
      </p>

      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="120 eur + 80 usd - 15,50 $"
        aria-label="Cuenta a convertir"
        className={cn(
          'rounded-control bg-surface text-ink/90 w-full border px-3 text-base',
          'border-ink/20 hover:border-ink/32 focus:border-royal-600 focus:ring-royal-600/20',
          'focus:ring-2 focus:outline-none',
          compacto ? 'h-9 text-sm' : 'h-10',
        )}
      />

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

      {cuenta?.estado === 'falta' ? (
        <p className="text-warning mt-2.5 text-xs">
          Falta registrar la tasa de {cuenta.sinTasa.map(simbolo).join(', ')}.
        </p>
      ) : null}

      {cuenta?.estado === 'listo' ? (
        <div className="border-hairline mt-2.5 border-t pt-2.5">
          <p
            className={cn(
              'tabular text-ink/90 font-semibold',
              compacto ? 'text-lg' : 'text-2xl',
            )}
          >
            {formatear(cuenta.total, destino)}
          </p>

          {/* Con más de un término se enseña la cuenta: quien la escribió
              deprisa tiene que poder comprobar que se leyó lo que quiso decir. */}
          {cuenta.terminos.length > 1 ? (
            <p className="text-ink/45 mt-1 text-xs">
              {cuenta.terminos
                .map(
                  (t, i) =>
                    `${i === 0 ? (t.signo < 0 ? '−' : '') : t.signo < 0 ? ' − ' : ' + '}${new Intl.NumberFormat('es-VE', { maximumFractionDigits: 2 }).format(t.monto)} ${simbolo(t.codigo)}`,
                )
                .join('')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
