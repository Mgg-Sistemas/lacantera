import { useState } from 'react'
import { Coins, Scale, SendHorizontal, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useCostoPorPresentacion, usePresentacionesDeArticulo } from '@/lib/api/catalogo'
import { useMonedasUsables, hoyEnCaracas } from '@/lib/api/tasas'
import {
  useCorregirCosto,
  useEnvasesAqui,
  useExistenciasDeArticulo,
  useImpactoDeCorregirCosto,
} from '@/lib/api/inventario'
import type { Existencia, ExistenciaTotal } from '@/lib/api/inventario'
import { dolares, enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  LOS MODALES QUE VIVÍAN DENTRO DE LA PANTALLA VIEJA DE EXISTENCIAS (09/11/2026).

  La pantalla «Existencias» se retiró: `/app/inventario/existencias` redirige a
  la de inventario de MGG o al detalle del almacén. «Ver dónde está» y
  «Corregir el costo» los siguen abriendo esas pantallas, así que se mudaron
  aquí tal cual, sin cambiar nada de lo que hacen.
*/

function cantidad(valor: string | number): string {
  const n = Number(valor)
  return Number.isInteger(n) ? enteros(n) : n.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

/*
  EL PLURAL, QUE EN CASTELLANO NO ES SIEMPRE UNA ESE.

  «2 tambors» delata que lo escribió una máquina. Terminadas en vocal llevan -s y
  en consonante -es, y al añadir -es la tilde de la última sílaba se cae: bidón da
  bidones, no bidónes. La eñe se queda donde está.

  Volvió a hacer falta al enseñar los envases que de verdad hay, que ya no son
  una división sino un conteo: ahí las palabras se leen enteras.
*/
const SIN_TILDE: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u' }

function plural(palabra: string): string {
  if (/[aeiouáéíóú]$/i.test(palabra)) return `${palabra}s`
  return `${palabra.replace(/[áéíóú]/gi, (c) => SIN_TILDE[c.toLowerCase()] ?? c)}es`
}

/*
  QUÉ ENVASES HAY AQUÍ DE VERDAD — O POR QUÉ NO SE SABE.

  Christopher: «está bien que se pueda denotar en L (base) pero lo que hay
  realmente es un tambor (sobre la base), ¿cómo se puede expresar así con el
  valor acorde?».

  Y esto NO es la equivalencia que quitamos: no divide la existencia entre el
  factor. Es un saldo que arranca del último conteo —donde alguien estuvo delante
  del estante— y aplica lo que pasó después: entradas, salidas y traslados que
  dijeron su envase, y trasvases.

  LO QUE LO HACE HONESTO ES QUE SE CALLA. Basta un movimiento sin envase para que
  la base devuelva «no se sabe» con el motivo escrito, y entonces aquí se enseña
  el motivo en vez de un número. Una cifra que a veces miente es peor que
  ninguna: con la primera nadie puede trabajar, con la segunda sí.
*/
function QueHayAqui({ articuloId, almacenId }: { articuloId: number; almacenId: number }) {
  const { data } = useEnvasesAqui(articuloId, almacenId)
  if (!data) return null

  if (!data.confiable) {
    /*
      Se dice por qué no se sabe, pero en gris y pequeño: es una advertencia
      sobre el detalle, no sobre la existencia. Los litros de arriba son exactos
      y siguen siendo la verdad del libro.
    */
    return data.por_que ? (
      <p className="text-ink/40 text-2xs mt-1 leading-relaxed">{data.por_que}</p>
    ) : null
  }

  const envases = data.envases ?? []
  const sueltos = Number(data.sueltos ?? 0)
  if (envases.length === 0 && sueltos <= 0) return null

  return (
    <div className="mt-1 space-y-0.5">
      {envases.map((e) => (
        <p key={e.presentacion} className="text-ink/60 text-xs">
          <span className="text-ink/85 tabular font-medium">{cantidad(e.cuantos)}</span>{' '}
          {e.cuantos === 1 ? e.presentacion.toLowerCase() : plural(e.presentacion.toLowerCase())}
          {e.valor_usd !== null ? ` · ${dolares(e.valor_usd)}` : ''}
        </p>
      ))}
      {sueltos > 0 ? (
        <p className="text-ink/50 text-xs">
          y {cantidad(sueltos)} {data.unidad} sueltos
          {data.valor_sueltos != null ? ` · ${dolares(data.valor_sueltos)}` : ''}
        </p>
      ) : null}
      {/* De dónde sale el dato, que es lo que lo separa de una división. */}
      <p className="text-ink/35 text-2xs">
        {data.nunca_contado
          ? 'Según lo que entró y salió con su envase anotado'
          : /* La fecha viene de la base en su formato; aquí se lee en el de
               aquí, que es el único que alguien reconoce de un vistazo. */
            `Contado el ${
              data.desde ? new Date(`${data.desde}T12:00:00`).toLocaleDateString('es-VE') : ''
            }, más lo que se movió después`}
      </p>
    </div>
  )
}

/*
  CÓMO ENTRÓ ESTE ARTÍCULO A ESTE ALMACÉN.

  Una línea por envase con el que se compró aquí, con lo que costó ese envase y
  cuándo fue la última vez. Se calla entera si no hay compras con envase
  anotado: una tabla vacía es peor que ninguna, porque parece que falta un dato
  en vez de que no lo hay.

  Hoy se calla en todas partes, y es esperable: las ocho entradas que existen son
  del 5 de septiembre y ninguna capturó el envase, porque ese día el sistema no
  sabía capturarlo. Empieza a hablar con la próxima compra que se teclee en
  tambores.
*/
function ComoEntroAqui({ articuloId, almacenId }: { articuloId: number; almacenId: number }) {
  const { data } = useCostoPorPresentacion(articuloId, almacenId)

  // Solo las compras que dijeron en qué envase venían. La fila sin envase es la
  // compra suelta, y de esa el costo por unidad ya está arriba.
  const conEnvase = (data ?? []).flatMap((c) =>
    c.presentacion ? [{ ...c, presentacion: c.presentacion }] : [],
  )
  if (conEnvase.length === 0) return null

  return (
    <div className="mt-1 space-y-0.5">
      {conEnvase.map((c) => (
        <p key={c.presentacion} className="text-ink/50 text-xs">
          Entró en <span className="text-ink/70">{c.presentacion}</span>
          {c.costo_envase ? (
            <>
              {' · '}
              <span className={c.corregido_despues ? 'line-through' : undefined}>
                {dolares(c.costo_envase)}
              </span>{' '}
              el {c.presentacion.toLowerCase()}
            </>
          ) : null}
          {c.corregido_despues ? (
            <span className="text-ink/40"> · su valoración se corrigió después</span>
          ) : null}
        </p>
      ))}
    </div>
  )
}

/**
 * En qué sitios está repartido un artículo, y qué se puede hacer en cada uno.
 *
 * Es el puente entre el total y el almacén. Las filas con existencia en cero se
 * muestran igual, apagadas: saber que un taller tuvo el repuesto y se le acabó
 * es distinto de no verlo listado, que se lee como que nunca lo manejó.
 */
export function ModalDesglose({
  articulo,
  onCerrar,
  puedeMover,
  puedeCorregirCosto,
  onSolicitarSalida,
  onContar,
  onCorregirCosto,
  onTrasvasar,
}: {
  articulo: ExistenciaTotal | null
  onCerrar: () => void
  puedeMover: boolean
  puedeCorregirCosto: boolean
  onSolicitarSalida: (fila: Existencia) => void
  onContar: (fila: Existencia) => void
  onCorregirCosto: (fila: Existencia) => void
  onTrasvasar: (fila: Existencia) => void
}) {
  const { data, isPending, error } = useExistenciasDeArticulo(articulo?.articulo_id ?? null)
  /* Un artículo, una consulta: las formas son suyas y no del sitio. */
  const { data: formasDelArticulo } = usePresentacionesDeArticulo(articulo?.articulo_id ?? null)
  const tieneEnvases = (formasDelArticulo ?? []).some((x) => x.activa)

  return (
    <Modal
      abierto={articulo !== null}
      onCerrar={onCerrar}
      titulo={articulo?.articulo ?? ''}
      descripcion={
        articulo
          ? `Hay ${cantidad(articulo.existencia)} ${articulo.unidad} en total. Aquí es donde están.`
          : undefined
      }
      acciones={
        <Button variant="ghost" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data ? (
        <ul className="divide-hairline divide-y">
          {data.map((f) => {
            const vacio = Number(f.existencia) <= 0
            return (
              <li key={f.almacen_id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 grow">
                  <p className={cn('text-sm font-medium', vacio ? 'text-ink/40' : 'text-ink/85')}>
                    {f.almacen}
                  </p>
                  <p className="text-ink/45 text-xs">
                    <span className="tabular">{cantidad(f.existencia)}</span> {f.unidad}
                    {f.costo_promedio_usd ? ` · ${dolares(f.costo_promedio_usd)} c/u` : ''}
                  </p>

                  {/*
                    EN QUÉ ENVASE ENTRÓ AQUÍ, Y A CÓMO.

                    Christopher: «si se compra un tambor para un almacén, ¿cómo
                    puedo ver expresamente esa forma de medir o presentación del
                    item en ese almacén y con el valor acorde?».

                    Esto NO es la equivalencia que quitamos hace un rato. Aquella
                    dividía 604 entre 208 y decía «2 tambores», que nadie contó y
                    resultó ser falso. Esto es lo que alguien tecleó al recibir:
                    el envase, el precio y el día. Un hecho cabe en una pantalla
                    de existencias; una suposición no.
                  */}
                  <QueHayAqui articuloId={f.articulo_id} almacenId={f.almacen_id} />
                  <ComoEntroAqui articuloId={f.articulo_id} almacenId={f.almacen_id} />

                </div>

                <div className="flex gap-1">
                  {puedeMover ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<SendHorizontal />}
                        disabled={vacio}
                        onClick={() => onSolicitarSalida(f)}
                      >
                        Solicitar salida
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Scale />}
                        onClick={() => onContar(f)}
                      >
                        Contar
                      </Button>

                      {/*
                        CAMBIAR DE ENVASE, JUNTO A CONTAR Y NO ENTRE LAS SALIDAS.

                        Christopher: «más fácil mover pailas que un tambor al
                        final». Va aquí porque es hermano del conteo: los dos
                        hablan de la forma y ninguno cambia la cantidad. Entre
                        las salidas habría que explicar en cada renglón que ésta
                        no resta.

                        Solo con envases declarados: sin ellos no hay dos orillas
                        entre las que trasvasar, y el botón sería una promesa que
                        el modal no puede cumplir.
                      */}
                      {tieneEnvases ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Shuffle />}
                          disabled={vacio}
                          onClick={() => onTrasvasar(f)}
                        >
                          Cambiar de envase
                        </Button>
                      ) : null}
                    </>
                  ) : null}

                  {/*
                    CORREGIR EL COSTO TAMBIEN AQUI, y esta es la puerta que de
                    verdad se usa.

                    El boton existia solo en la fila de un almacen concreto,
                    porque el costo promedio se lleva por pareja (almacen,
                    articulo) y desde el total no significa nada. Cierto, y por
                    eso INDESCUBRIBLE: la vista de serie es el total, donde la
                    fila solo ofrece «Ver donde esta», y nadie adivina que hay
                    que cambiar de vista antes.

                    Este modal ES el sitio: aqui cada renglon ya ES una pareja
                    (almacen, articulo). Lo pidio Christopher no encontrandolo,
                    que es la unica forma fiable de saber que algo no se
                    encuentra.
                  */}
                  {puedeCorregirCosto ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Coins />}
                      disabled={vacio}
                      onClick={() => onCorregirCosto(f)}
                    >
                      Corregir el costo
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </Modal>
  )
}

/**
 * Corregir el costo de lo que hay, con el parte delante.
 *
 * Hasta hoy esto solo existía en la base: `corregir_costo` estaba escrita,
 * probada y sin ninguna puerta. Era la única salida real del aceite cargado a
 * 1.209.012,48 y del gasoil del tanque sin costo, y no la podía usar nadie.
 *
 * EL RECORRIDO ES EL DE UN RUNBOOK, que es como lo pidió Christopher: se
 * escribe el costo correcto, se ve el parte entero —incluida la parte incómoda,
 * lo que ya salió cargado al costo falso y no se recupera—, se dice por qué, y
 * se confirma. El parte va antes y no después: quien va a mover medio millón de
 * dólares de valoración tiene que ver el número primero.
 *
 * NO EDITA NADA. La base escribe un par de movimientos —sale todo al costo
 * equivocado, entra todo al correcto—, así que la existencia no se mueve y los
 * dos renglones quedan a la vista en el historial. Una corrección de esta
 * magnitud tiene que verse.
 */
export function ModalCorregirCosto({ fila, onCerrar }: { fila: Existencia; onCerrar: () => void }) {
  const corregir = useCorregirCosto()
  const [nuevo, setNuevo] = useState('')
  const [porque, setPorque] = useState('')
  /*
    LA MONEDA DE LA FACTURA, NO LA DEL SISTEMA.

    Christopher, con la cafetera delante: «aunque quiera corregir el costo, no me
    deja cambiar la moneda». La ventana pedía dólares y la factura estaba en
    bolívares, así que corregir obligaba a dividir entre la tasa de cabeza —el
    mismo error que se estaba corrigiendo—. Ahora se escribe lo que dice el
    papel, en su moneda, y la base lo convierte con la tasa del día de la
    factura: no con la de hoy, que para una factura vieja daría otro número.
  */
  const monedas = useMonedasUsables()
  const [moneda, setMoneda] = useState('USD')
  const [fechaFactura, setFechaFactura] = useState(hoyEnCaracas())
  const enDolares = moneda === 'USD'

  const valor = Number(nuevo.replace(',', '.'))
  const valido = nuevo.trim() !== '' && Number.isFinite(valor) && valor >= 0
  const impacto = useImpactoDeCorregirCosto(
    fila.almacen_id,
    fila.articulo_id,
    valido ? valor : NaN,
    moneda,
    enDolares ? null : fechaFactura || null,
  )

  const p = impacto.data
  /*
    Las tres exigencias de la base, repetidas en el botón para que nadie tenga
    que chocar contra ellas: motivo de diez, costo válido, y distinto del que
    hay. Lo distinto se mide en dólares, con la cifra que ya convirtió la base.
  */
  /*
    X USD A X USD NO ES UNA CORRECCIÓN.

    Christopher: la regla es para «el error humano de ajustar x usd a x usd». La
    base ya lo para —«ya viene costando…: no hay nada que corregir»— y aquí el
    botón se apagaba sin decir por qué, que es como alguien acaba creyendo que la
    pantalla está rota. Se compara en dólares, con la cifra que ya convirtió la
    base: 39.332,15 Bs no son 39.332,15 USD, y eso sí es corregir.
  */
  const mismoCosto =
    valido && p != null && Math.abs(Number(p.costo_correcto) - Number(p.costo_actual)) <= 1e-6

  const listo =
    valido &&
    (enDolares || Boolean(fechaFactura)) &&
    porque.trim().length >= 10 &&
    p != null &&
    !mismoCosto

  const linea = (que: string, cuanto: string, fuerte?: boolean) => (
    <div className="flex justify-between gap-4">
      <dt className="text-ink/55">{que}</dt>
      <dd className={cn('tabular', fuerte ? 'text-ink/90 font-semibold' : 'text-ink/80')}>
        {cuanto}
      </dd>
    </div>
  )

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Corregir el costo"
      descripcion={`${fila.articulo} · ${fila.almacen}`}
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || corregir.isPending}
            onClick={async () => {
              await corregir.mutateAsync({
                almacen_id: fila.almacen_id,
                articulo_id: fila.articulo_id,
                costo_correcto: valor,
                motivo: porque.trim(),
                moneda,
                fecha_tasa: enDolares ? null : fechaFactura,
              })
              onCerrar()
            }}
          >
            {corregir.isPending ? 'Corrigiendo…' : 'Corregir el costo'}
          </Button>
        </>
      }
    >
      <p className="text-ink/70 text-sm">
        Hay <span className="tabular">{cantidad(fila.existencia)}</span> {fila.unidad} a{' '}
        <span className="tabular text-ink/90 font-semibold">
          {fila.costo_promedio_usd == null ? '—' : dolares(fila.costo_promedio_usd)}
        </span>{' '}
        cada una. No se cambia ninguna cantidad: sale todo al costo de ahora y vuelve a entrar al
        correcto, y los dos renglones quedan en el historial.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <Input
          // Seis decimales, los que guarda la base y pedía ya el paso (08/11/2026).
          limite={{ maxDecimales: 6, sinNegativos: true }}
          label="Costo correcto por unidad"
          type="number"
          min="0"
          step="0.000001"
          inputMode="decimal"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
        />
        <Select
          label="Moneda de la factura"
          value={moneda}
          onChange={(e) => setMoneda(e.target.value)}
          opciones={(monedas.data ?? []).map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
        />
      </div>

      {/* Solo fuera del dólar: en dólares no hay nada que convertir. */}
      {!enDolares ? (
        <Input
          label="Fecha de la factura"
          className="mt-3"
          type="date"
          max={hoyEnCaracas()}
          value={fechaFactura}
          onChange={(e) => setFechaFactura(e.target.value)}
        />
      ) : null}

      {mismoCosto && p ? (
        <p className="border-warning/40 bg-warning-soft text-ink/80 rounded-card mt-3 border p-2.5 text-xs leading-relaxed">
          <strong>Es el mismo costo que ya tiene</strong> —{dolares(p.costo_actual)} por{' '}
          {fila.unidad || 'unidad'}—: no hay nada que corregir.
        </p>
      ) : null}

      {p ? (
        <dl className="border-hairline rounded-card mt-4 space-y-1 border p-3 text-sm">
          {/*
            LO QUE SE VA A GUARDAR, EN DÓLARES Y ANTES DE GUARDARLO.

            Con la tasa que usó la base a la vista: quien corrige desde una
            factura en bolívares tiene que ver aquí en cuántos dólares se queda,
            y no descubrirlo después en el historial.
          */}
          {!enDolares
            ? linea(
                'Costo correcto en dólares',
                `${dolares(p.costo_correcto)} por ${fila.unidad || 'unidad'}`,
                true,
              )
            : null}
          {linea('Valor de ahora', dolares(p.valor_actual))}
          {linea('Valor corregido', dolares(p.valor_corregido))}
          {linea(
            'Ajuste en libros',
            `${Number(p.ajuste) < 0 ? '−' : '+'}${dolares(Math.abs(Number(p.ajuste)))}`,
            true,
          )}
          {!enDolares ? (
            <div className="text-ink/50 pt-1 text-xs">
              Tasa del {fecha(p.fecha_tasa)}: 1 USD ={' '}
              {Number(p.tasa_usd).toLocaleString('es-VE', { maximumFractionDigits: 4 })} Bs
              {p.moneda !== 'VES'
                ? ` · 1 ${p.moneda} = ${Number(p.tasa).toLocaleString('es-VE', { maximumFractionDigits: 4 })} Bs`
                : ''}
            </div>
          ) : null}

          {/*
            LA PARTE INCÓMODA, y se enseña a propósito.

            Corregir hoy no reprecia lo que salió ayer: eso ya se le cargó a una
            máquina o a un centro de costo y ahí se queda. La base devuelve este
            número justamente para que no se esconda.
          */}
          {Number(p.no_se_recupera) !== 0 ? (
            <div className="border-hairline mt-2 border-t pt-2">
              <p className="text-ink/70 text-xs leading-relaxed">
                Ya salieron <span className="tabular">{cantidad(p.ya_salio)}</span> {p.unidad}{' '}
                cargados al costo de ahora.{' '}
                <strong>{dolares(Math.abs(Number(p.no_se_recupera)))} no se recupera</strong>: ya se
                cargó a una máquina o a un centro de costo.
              </p>
            </div>
          ) : null}
        </dl>
      ) : null}

      {impacto.error ? <ErrorDeCarga error={impacto.error} className="mt-3" /> : null}

      {/*
          EL EJEMPLO DICE QUE ESCRIBIR, NO QUE RESPONDER.

          Aqui habia un caso real entero —«Se cargo el precio del tambor donde
          iba el del litro. Factura NASELF 000617»— y Christopher lo paro: «es
          demasiado especifico a un caso puntual en vez de ser generico o de
          guia».

          Y el problema es peor que la especificidad: un ejemplo que parece una
          respuesta invita a copiarlo. Con veinte correcciones diciendo todas lo
          mismo, el campo del porque deja de explicar nada — que es justo lo
          contrario de por que existe. Ademas metia un numero de factura real en
          un texto de pantalla.

          Asi que se dice que tiene que llevar: el error y el respaldo.
        */}
      <Textarea
        maxLength={500}
        label="Motivo"
        className="mt-4"
        rows={2}
        placeholder="Qué se cargó mal y con qué papel se comprueba el costo correcto"
        value={porque}
        onChange={(e) => setPorque(e.target.value)}
        hint="Queda en el movimiento y se avisa a administración y gerencia. Mínimo diez caracteres."
      />

      {corregir.error ? <ErrorDeCarga error={corregir.error} className="mt-3" /> : null}
    </Modal>
  )
}
