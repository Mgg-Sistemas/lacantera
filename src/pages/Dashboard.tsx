import { Link } from 'react-router'
import {
  AlertTriangle,
  Banknote,
  Boxes,
  ClipboardCheck,
  Users,
  HandCoins,
  Info,
  ShoppingCart,
  Calculator,
  Truck,
  Stamp,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { PageHeader } from '@/components/PageHeader'
import { QueHacer } from '@/components/QueHacer'
import type { GrupoDeAcciones } from '@/components/QueHacer'
import { StatCard } from '@/components/StatCard'
import { useResumenPanel } from '@/lib/api/tesoreria'
import { useTablero } from '@/lib/api/compras'
import { useMisPermisos } from '@/lib/api/usuarios'
import { moduloDeRuta } from '@/config/navigation'
import { dolares, dolaresRedondos, enteros, hace } from '@/lib/formato'

interface Aviso {
  tono: 'danger' | 'warning' | 'info'
  titulo: string
  detalle: string
  ruta: string
}

/**
 * Lo que hay que atender hoy.
 *
 * No es una lista escrita a mano: cada aviso nace de una condición del sistema
 * y desaparece cuando esa condición deja de cumplirse. Un tablero de avisos
 * que hay que apagar a mano se llena de cosas resueltas y deja de leerse.
 */
function avisosDe(r: ReturnType<typeof useResumenPanel>['data']): Aviso[] {
  if (!r) return []
  const avisos: Aviso[] = []

  // Dice "sin cargar" y no "no hay": la barra de arriba consulta al BCV y el
  // panel mira lo registrado aquí. Cuando el BCV ya publicó y nadie la cargó
  // todavía, un aviso que dijera "no hay tasa" contradiría a la barra en la
  // misma pantalla, y quien lo lea deja de creerle a las dos.
  if (!r.tasa_de_hoy) {
    avisos.push({
      tono: 'danger',
      titulo: 'La tasa de hoy no está cargada',
      detalle:
        'Sin ella no se puede cotizar, aprobar ni pagar: todo documento valorado congela la tasa del día.',
      ruta: '/app/tasas',
    })
  }

  if (r.compras_atrasadas > 0) {
    avisos.push({
      tono: 'danger',
      titulo: `${r.compras_atrasadas} compra${r.compras_atrasadas === 1 ? '' : 's'} pagada${r.compras_atrasadas === 1 ? '' : 's'} sin recibir`,
      detalle: `Más de una semana esperando material. Son ${dolares(r.pagado_sin_recibir_usd)} que ya salieron de la empresa.`,
      ruta: '/app/compras',
    })
  }

  if (r.pago_mas_viejo_dias > 3) {
    avisos.push({
      tono: 'warning',
      titulo: `Un pago lleva ${r.pago_mas_viejo_dias} días autorizado sin salir`,
      detalle:
        'El proveedor no reserva el material hasta ver el pago, y la cotización tiene fecha de vencimiento.',
      ruta: '/app/tesoreria/pagos',
    })
  }

  if (r.compras_por_aprobar > 0) {
    avisos.push({
      tono: 'warning',
      titulo: `${r.compras_por_aprobar} compra${r.compras_por_aprobar === 1 ? '' : 's'} esperando al gerente`,
      detalle: 'Hasta que se apruebe no hay orden, y sin orden el proveedor no despacha.',
      ruta: '/app/compras',
    })
  }

  if (r.articulos_bajo_minimo > 0) {
    avisos.push({
      tono: 'warning',
      titulo: `${r.articulos_bajo_minimo} artículo${r.articulos_bajo_minimo === 1 ? '' : 's'} bajo el mínimo`,
      detalle: 'Reponer antes de que pare una máquina cuesta menos que pararla.',
      ruta: '/app/inventario/existencias',
    })
  }

  /*
    EL AVISO DE LAS CUENTAS SIN SALDO DE APERTURA SE QUITA

    Pedía abrir un saldo que la empresa decidió no llevar. Tesorería dejó de ser
    un módulo justamente porque «no va a llevar bancos ni cajas, y el sistema no
    manejará saldo disponible — solo refleja los movimientos»; con esa decisión
    tomada, un saldo de apertura no le falta a nadie.

    Y además llevaba a `/app/tesoreria/cuentas`, que está fuera del menú por lo
    mismo: al administrador le abría la pantalla y a todos los demás les daba el
    candado. Un aviso que pide arreglar algo por una puerta cerrada no es un
    aviso, es un recordatorio de que algo no se puede hacer.

    El número se sigue calculando en la base y lo sigue usando el tablero de
    Tesorería, que está entero esperando: el día que la empresa quiera llevar
    sus cuentas, esto vuelve tal cual.
  */

  return avisos
}

const iconos = { danger: AlertTriangle, warning: AlertTriangle, info: Info } as const

/*
  EL PANEL TAMBIÉN GUÍA, NO SOLO INFORMA

  Arriba dice cómo va la operación. Esto de abajo dice por dónde se empieza.

  No repite los tableros de cada módulo: recoge las tres o cuatro cosas que de
  verdad se hacen desde aquí, y las ordena por lo que suele venir antes. Quien
  abre el sistema por primera vez necesita cargar el catálogo y la gente antes
  de poder comprar o pagar nada; quien ya lo tiene montado entra a lo del día.

  `QueHacer` esconde solo lo que quien mira no puede abrir, así que a cada
  quien le queda su lista.
*/
const QUE_HACER: GrupoDeAcciones[] = [
  {
    titulo: 'Poner el sistema en marcha',
    detalle: 'Lo que hay que cargar una vez para que lo demás funcione.',
    acciones: [
      {
        paso: 1,
        titulo: 'Cargar el catálogo de artículos',
        detalle:
          'Desde una planilla de Excel. El sistema comprueba fila por fila y enseña qué va a pasar antes de escribir nada.',
        icono: Boxes,
        a: '/app/inventario/articulos/carga',
        exige: 'ESCRITURA',
      },
      {
        paso: 2,
        titulo: 'Cargar el personal',
        detalle:
          'Desde una planilla, igual que el catálogo. Las fichas de quienes trabajan aquí, con su cargo y su sueldo.',
        icono: Users,
        a: '/app/nomina/personal/carga',
        exige: 'ESCRITURA',
      },
      {
        paso: 3,
        titulo: 'Poner la tasa del día',
        detalle:
          'Sin tasa no se puede cotizar, aprobar ni pagar: todo documento valorado congela la del día.',
        icono: Banknote,
        a: '/app/tasas',
        exige: 'ESCRITURA',
      },
    ],
  },
  {
    titulo: 'Lo del día',
    acciones: [
      {
        titulo: 'Pedir algo que hace falta',
        detalle: 'Un repuesto, combustible, un servicio. Basta con decir qué y para qué.',
        icono: ShoppingCart,
        a: '/app/compras/nuevo',
        exige: 'ESCRITURA',
      },
      {
        titulo: 'Ver cómo está el almacén',
        detalle: 'Cuánto hay de cada cosa, dónde está, y qué se está acabando.',
        icono: Boxes,
        a: '/app/inventario/existencias',
      },
      {
        titulo: 'Procesar la quincena',
        detalle: 'Novedades, cálculo y recibos, en ese orden.',
        icono: Calculator,
        a: '/app/nomina/asistencia',
        exige: 'ESCRITURA',
      },
    ],
  },
]

export function Dashboard() {
  const { data: r, isPending, error } = useResumenPanel()
  const { data: tarjetas } = useTablero()
  const { puede } = useMisPermisos()

  const hoy = new Date().toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  /*
    El panel solo enseña lo que quien mira puede ver.

    No es pudor: la base ya no le devuelve esas filas, así que el indicador de
    tesorería le saldría en cero. Y un cero se lee como "no hay plata en las
    cuentas", que es una afirmación falsa, no un "esto no te toca". Vale más no
    poner la tarjeta.

    Los avisos se filtran por su propio enlace: si el aviso lleva a un módulo
    que esta persona no puede abrir, avisarle de algo que no puede ir a
    resolver solo sirve para inquietarla.
  */
  const avisos = avisosDe(r).filter((a) => puede(moduloDeRuta(a.ruta)))
  const veTesoreria = puede('TESORERIA')
  const veCompras = puede('COMPRAS')
  const veInventario = puede('INVENTARIO')

  /*
    PODER PEDIR ALGO NO ES LLEVAR LAS COMPRAS

    Entrando como un jefe electricista —rol SOLICITANTE, que solo puede pedir
    material— el panel le enseñaba «Por pagar a proveedores: $11.600» y
    «Pagado sin recibir». Cuánto le debe la empresa a sus proveedores no es
    asunto suyo, y sin embargo lo tenía en la primera pantalla.

    La causa: SOLICITANTE usa el módulo COMPRAS con nivel ESCRITURA, igual que
    el rol COMPRAS, porque crear un pedido es escribir en compras. El permiso
    de módulo no distingue «pedir» de «gestionar», así que `veCompras` era
    cierto para los dos.

    La cifra de lo que se debe se ata a TESORERIA, no a COMPRAS: quien lleva
    compras tiene tesorería en lectura y la sigue viendo; quien solo pide, no.
    Es la separación que ya estaba pensada en la matriz de permisos, solo que
    el panel no la usaba.
  */
  const veDinero = veTesoreria

  // Lo que espera decisión del gerente, lo más viejo arriba: quien aprueba
  // necesita saber qué lleva más tiempo detenido, no qué llegó de último.
  /*
    Cuánto lleva esperando la más vieja.

    Es lo que convierte un número en una urgencia: «3 esperando» no dice si es
    de esta mañana o de hace dos semanas, y son dos situaciones distintas.
  */
  const masVieja = (() => {
    const primera = (tarjetas ?? [])
      .filter((t) => t.columna === 'GERENTE')
      .map((t) => t.creada_en)
      .sort()[0]
    if (!primera) return null
    return Math.floor((Date.now() - new Date(primera).getTime()) / 86_400_000)
  })()

  const porAprobar = (tarjetas ?? [])
    .filter((t) => t.columna === 'GERENTE')
    .sort((a, b) => a.creada_en.localeCompare(b.creada_en))

  return (
    <>
      <PageHeader title="Panel" description={`Operación de ${hoy}`} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {r ? (
        <>
          {/* ---------- Indicadores ---------- */}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {/*
              Aquí estaba «En cuentas, en divisas». Se va con los bancos.

              La empresa dejó de llevar saldos, así que ese número no lo
              actualiza nadie, y abrir el panel con un disponible desactualizado
              es peor que no tenerlo: es la primera cifra que se ve al entrar y
              la que se usa para decidir si se puede pagar algo.

              Es el mismo motivo por el que se quitó de la cola de pagos. Se
              quedó aquí por descuido y se vio al enlazar las tarjetas: llevaba
              a una pantalla que ni siquiera estaba en el menú.

              En su sitio va lo que pidió la líder: cuántas compras esperan la
              firma del gerente. Es la cifra que de verdad detiene el trabajo
              —mientras nadie apruebe, no hay orden, no hay pago y no llega el
              material— y estaba solo como un renglón dentro de «compras en
              curso», donde no la ve quien tiene que resolverla.
            */}
            {veCompras ? (
              <StatCard
                a="/app/compras"
                label="Esperan aprobación"
                value={enteros(porAprobar.length)}
                icon={<Stamp />}
                tone={porAprobar.length > 0 ? 'warning' : 'success'}
                deltaLabel={
                  porAprobar.length === 0
                    ? 'Ninguna compra detenida'
                    : masVieja === null || masVieja === 0
                      ? 'Pendientes de la gerencia'
                      : `La más vieja lleva ${masVieja} día${masVieja === 1 ? '' : 's'}`
                }
              />
            ) : null}

            {veDinero ? (
              <StatCard
                a="/app/tesoreria/pagos"
                label="Por pagar a proveedores"
                value={dolaresRedondos(r.por_pagar_usd)}
                icon={<HandCoins />}
                tone={r.pago_mas_viejo_dias > 7 ? 'warning' : 'info'}
                deltaLabel={
                  r.por_pagar_n === 0
                    ? 'Nada pendiente'
                    : `${r.por_pagar_n} pago${r.por_pagar_n === 1 ? '' : 's'} autorizado${r.por_pagar_n === 1 ? '' : 's'}`
                }
              />
            ) : null}
            {veDinero ? (
              <StatCard
                a="/app/compras/recepciones"
                label="Pagado sin recibir"
                value={dolaresRedondos(r.pagado_sin_recibir_usd)}
                icon={<Truck />}
                tone={r.compras_atrasadas > 0 ? 'warning' : 'success'}
                deltaLabel={
                  r.compras_pagadas_sin_recibir === 0
                    ? 'Todo lo pagado llegó'
                    : `${r.compras_pagadas_sin_recibir} orden${r.compras_pagadas_sin_recibir === 1 ? '' : 'es'} en camino`
                }
              />
            ) : null}
            {veInventario ? (
              <StatCard
                a="/app/inventario/existencias"
                label="Valor del inventario"
                value={dolaresRedondos(r.inventario_usd)}
                icon={<Boxes />}
                tone="info"
                deltaLabel={
                  r.articulos_bajo_minimo === 0
                    ? 'Ningún artículo bajo mínimo'
                    : `${r.articulos_bajo_minimo} bajo el mínimo`
                }
              />
            ) : null}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            {/* ---------- Avisos ---------- */}
            {/* Sin la tarjeta de compras al lado, los avisos ocupan el ancho:
                una columna de un tercio con dos tercios en blanco se lee como
                que algo no cargó. */}
            <Card className={veCompras ? 'lg:col-span-2' : 'lg:col-span-3'}>
              <CardHeader
                title="Requiere atención"
                subtitle={
                  avisos.length === 0
                    ? 'Nada detenido ahora mismo'
                    : `${avisos.length} asunto${avisos.length === 1 ? '' : 's'} abierto${avisos.length === 1 ? '' : 's'}`
                }
              />

              {avisos.length === 0 ? (
                <p className="text-ink/50 border-hairline mt-4 rounded-[6px] border border-dashed p-6 text-center text-sm">
                  Ninguna compra atrasada, ningún pago esperando y ningún artículo bajo el
                  mínimo.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {avisos.map((a) => {
                    const Icono = iconos[a.tono]
                    return (
                      <li key={a.titulo}>
                        <Link
                          to={a.ruta}
                          className="border-hairline hover:border-royal-300 flex gap-3 rounded-[6px] border p-3 transition-colors"
                        >
                          <Icono
                            className={`mt-0.5 size-[18px] shrink-0 ${
                              a.tono === 'danger'
                                ? 'text-danger'
                                : a.tono === 'warning'
                                  ? 'text-warning'
                                  : 'text-info'
                            }`}
                          />
                          <div className="min-w-0">
                            <p className="text-ink/85 text-sm font-medium">{a.titulo}</p>
                            <p className="text-ink/55 mt-0.5 text-xs leading-relaxed">
                              {a.detalle}
                            </p>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>

            {/* ---------- Compras, por etapa ---------- */}
            {veCompras ? (
            <Card>
              <CardHeader title="Compras en curso" subtitle="Dónde está detenida cada una" />

              <ul className="mt-4 space-y-2.5">
                {[
                  ['Pedidos por confirmar', r.compras_pedido],
                  ['Buscando precios', r.compras_cotizando],
                  ['Esperando al gerente', r.compras_por_aprobar],
                  ['Por indicar el pago', r.compras_aprobadas],
                  ['Pagadas, por recibir', r.compras_pagadas_sin_recibir],
                ].map(([etiqueta, n]) => (
                  <li key={etiqueta as string} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink/70 text-sm">{etiqueta}</span>
                    <span
                      className={`tabular text-sm font-semibold ${
                        Number(n) > 0 ? 'text-ink/90' : 'text-ink/30'
                      }`}
                    >
                      {enteros(Number(n))}
                    </span>
                  </li>
                ))}
              </ul>

              <Link to="/app/compras" className="mt-4 block">
                <Button variant="soft" size="sm" block>
                  Ver el tablero
                </Button>
              </Link>
            </Card>
            ) : null}
          </div>

          {/* ---------- Aprobaciones ---------- */}
          {porAprobar.length > 0 ? (
            <div className="mt-5">
              <Card>
                <CardHeader
                  title="Esperando aprobación del gerente"
                  subtitle="Lo que lleva más tiempo detenido, primero"
                />

                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {porAprobar.map((t) => (
                    <li key={t.solicitud_id}>
                      <Link
                        to={`/app/compras/${t.solicitud_id}`}
                        className="border-hairline hover:border-royal-300 flex items-start gap-3 rounded-[6px] border p-4 transition-colors"
                      >
                        <ClipboardCheck className="text-ink/35 mt-0.5 size-[18px] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ink/45 font-mono text-xs">{t.numero}</span>
                            {t.prioridad === 'URGENTE' ? <Chip tone="danger">Urgente</Chip> : null}
                          </div>
                          <p className="text-ink/85 mt-1 text-sm font-medium">{t.titulo}</p>
                          <p className="text-ink/45 mt-1 text-xs">
                            {t.solicitante ?? 'Sin solicitante'} · {t.proveedor ?? 'sin proveedor'}{' '}
                            · {hace(t.creada_en)}
                          </p>
                        </div>
                        <span className="text-ink/90 tabular shrink-0 text-sm font-semibold">
                          {t.total_usd ? dolares(t.total_usd) : '—'}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ) : null}

          <p className="text-ink/35 mt-5 flex items-center gap-1.5 text-xs">
            <Banknote className="size-3.5" />
            Todas las cifras salen de lo registrado en el sistema. No hay ningún número de
            ejemplo en esta pantalla.
          </p>
          <QueHacer grupos={QUE_HACER} />
        </>
      ) : null}
    </>
  )
}
