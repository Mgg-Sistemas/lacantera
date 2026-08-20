/*
  LA TASA DEL USDT, QUE NO LA PUBLICA NADIE

  El BCV publica el dólar y el euro. El Tether no lo publica ningún organismo:
  su precio en bolívares sale del libro de anuncios P2P de Binance, que es donde
  la gente lo compra y lo vende de verdad.

  POR QUÉ ESTO VIVE EN EL SERVIDOR Y NO EN EL NAVEGADOR

  Por una razón medida, no por gusto: `p2p.binance.com` **no manda cabecera
  `Access-Control-Allow-Origin`**. Un `fetch` desde la pantalla lo bloquea el
  navegador y no hay forma de convencerlo. La del BCV sí se puede pedir desde el
  cliente —dolarapi manda `*`— y por eso esa se quedó donde estaba.

  ESTO NO ESCRIBE NADA, Y ES A PROPÓSITO

  Devuelve un número y ya. Quien lo registra es una persona con permiso de
  escritura en tasas, desde la pantalla, con el mismo botón que registra la del
  BCV.

  Dos motivos. El primero es la regla de la casa: lo que escribe pasa por una
  función `SECURITY DEFINER` con su permiso comprobado, no por un servicio con
  llave de servicio. El segundo es que una tasa registrada **no se puede
  corregir** —así está construido a propósito—, y una cifra irreversible que sale
  de la mediana de un libro de anuncios merece que alguien la mire antes de
  comprometerla.

  MGG sí hace el `upsert` desde su función equivalente. Aquí no se copia eso.
*/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BUSQUEDA = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search'

interface Anuncio {
  adv?: { price?: string }
}

/**
 * La mediana, no el promedio.
 *
 * En un libro P2P siempre hay anuncios en los extremos: alguien vendiendo al
 * doble porque no tiene prisa, o pidiendo una cantidad mínima absurda. El
 * promedio se los lleva puestos y mueve la tasa; la mediana los ignora sola.
 */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const orden = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(orden.length / 2)
  return orden.length % 2 === 1 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2
}

async function lado(tradeType: 'SELL' | 'BUY', filas: number): Promise<number | null> {
  const respuesta = await fetch(BUSQUEDA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asset: 'USDT',
      fiat: 'VES',
      tradeType,
      page: 1,
      rows: filas,
      payTypes: [],
      countries: [],
      proMerchantAds: false,
      publisherType: null,
    }),
  })

  if (!respuesta.ok) throw new Error(`Binance respondió ${respuesta.status}`)

  const cuerpo = (await respuesta.json()) as { data?: Anuncio[] }
  const precios = (cuerpo.data ?? [])
    .map((a) => Number(a.adv?.price))
    .filter((n) => Number.isFinite(n) && n > 0)

  return mediana(precios)
}

Deno.serve(async (peticion: Request) => {
  if (peticion.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const cuerpo = await peticion.json().catch(() => ({}))
    // Entre 3 y 20 anuncios por lado. Menos de tres no da una mediana que
    // signifique nada; más de veinte empieza a arrastrar el fondo del libro.
    const filas = Math.min(20, Math.max(3, Number(cuerpo?.filas) || 10))

    // Los dos lados a la vez y cada uno con su red: si un lado falla, la tasa
    // sale del otro en vez de no salir.
    const [venta, compra] = await Promise.all([
      lado('SELL', filas).catch(() => null),
      lado('BUY', filas).catch(() => null),
    ])

    if (venta === null && compra === null) {
      return new Response(
        JSON.stringify({ error: 'Binance no devolvió ningún anuncio utilizable.' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    // El punto medio entre lo que piden los que venden y lo que ofrecen los que
    // compran. Con un solo lado, ese lado.
    const valor =
      venta !== null && compra !== null ? (venta + compra) / 2 : (venta ?? compra)!

    return new Response(
      JSON.stringify({
        valor: Math.round(valor * 10000) / 10000,
        venta,
        compra,
        anuncios_por_lado: filas,
        fuente: 'BINANCE_P2P',
        consultado_en: new Date().toISOString(),
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})
