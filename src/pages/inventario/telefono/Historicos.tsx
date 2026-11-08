import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { mensajeDe } from '@/lib/avisosFlotantes'
import { usePerfiles } from '@/lib/api/catalogo'
import { ESTADO_DE_SOLICITUD, nombreDeEmpleado, usePersonasDeLaEmpresa, type SolicitudDeSalida } from '@/lib/api/salidas'
import {
  useHistoricoSalidas,
  useHistoricoTraslados,
  type PrestamoDelHistorico,
  type TrasladoDelHistorico,
} from '@/lib/api/almacenTelefono'
import type { Almacen as Sitio } from '@/lib/api/inventario'
import { fechaHoraVE } from '@/lib/pedidos'
import { fecha } from '@/lib/formato'
import { mensajeSalida, mensajeTraslado, num } from '@/lib/ficha/inventarioWhatsapp'
import { useNotaDeSalida } from '@/pages/salidas/NotaDeSalida'
import { useNotaDeTraslado } from '@/pages/salidas/NotaDeTraslado'
import { POR_TANDA, fechasMal, rangoDe, sinAcentos, type Atajo } from './comun'
import { CabeceraDePaso, FilaDeLista, Listo, RangoDeFechas } from './piezas'

/*
  🧾 HISTÓRICO DE SALIDAS Y 🔁 HISTÓRICO DE TRASLADOS, EN EL TELÉFONO
  (MGG `HistoricoSalidas` / `HistoricoTraslados`, fase 1b, 08/11/2026).

  Abren con los últimos 60 días, se pintan de 40 en 40 y cada fila tiene
  «💬 WhatsApp» y, cuando hay un papel de aquí que reutilizar, «📄 Ver PDF»: la
  orden de salida de la solicitud (`useNotaDeSalida`) o la nota del traslado
  (`useNotaDeTraslado`). Un préstamo no tiene papel propio: solo WhatsApp.

  Salidas: las solicitudes de salida de este almacén (pedidas desde el
  teléfono o desde Salidas, en cualquier estado) y los préstamos con retorno.
  Traslados: las dos patas del libro, lo que salió de aquí y lo que entró aquí.
*/

const ATAJOS: Atajo[] = ['hoy', 'mes', 'mesPasado', 'd60', 'd90']

/** El WhatsApp de una fila: se enseña aquí mismo para no perder fechas ni búsqueda. */
interface MensajeAbierto {
  titulo: string
  texto: string
}

function Tandas({ total, vistas, onMas }: { total: number; vistas: number; onMas: () => void }) {
  if (vistas >= total) return null
  return (
    <Button block variant="outline" onClick={onMas}>
      Ver más ({total - vistas} restantes)
    </Button>
  )
}

/* ──────────────────────────────────────── 🧾 salidas */

type FilaSalida =
  | { clase: 'solicitud'; cuando: string; s: SolicitudDeSalida }
  | { clase: 'prestamo'; cuando: string; p: PrestamoDelHistorico }

export function HistoricoSalidas({
  almacen,
  empresa,
  onVolver,
}: {
  almacen: Sitio
  empresa: string
  onVolver: () => void
}) {
  const [rango, setRango] = useState(() => rangoDe('d60'))
  const [busca, setBusca] = useState('')
  const [vistas, setVistas] = useState(POR_TANDA)
  const [mensaje, setMensaje] = useState<MensajeAbierto | null>(null)
  const mal = fechasMal(rango.desde, rango.hasta)
  const datos = useHistoricoSalidas(almacen.id, rango.desde, rango.hasta, !mal)
  const { data: perfiles } = usePerfiles()
  const { data: personas } = usePersonasDeLaEmpresa()
  const nota = useNotaDeSalida()

  const nombreDe = (uid: string | null) => (uid && perfiles?.find((p) => p.id === uid)?.nombre) || null
  const paraQuien = (s: SolicitudDeSalida) =>
    nombreDeEmpleado(personas, s.empleado_id) ??
    (s.destino_externo
      ? `${s.destino_externo}${s.responsable_externo ? ` (responde ${s.responsable_externo})` : ''}`
      : null)

  const filas = useMemo<FilaSalida[]>(() => {
    const d = datos.data
    if (!d) return []
    return [
      ...d.solicitudes.map<FilaSalida>((s) => ({ clase: 'solicitud', cuando: s.pedida_en, s })),
      ...d.prestamos.map<FilaSalida>((p) => ({ clase: 'prestamo', cuando: `${p.fecha_entrega}T12:00:00`, p })),
    ].sort((a, b) => b.cuando.localeCompare(a.cuando))
  }, [datos.data])

  const q = sinAcentos(busca.trim())
  const encontradas = q
    ? filas.filter((f) =>
        sinAcentos(
          f.clase === 'solicitud'
            ? `${f.s.numero} ${f.s.nota_salida ?? ''} ${f.s.motivo} ${(f.s.renglones ?? []).map((r) => r.articulo?.nombre ?? '').join(' ')}`
            : `${f.p.numero ?? ''} ${f.p.articulo} ${f.p.empleado} ${f.p.nota ?? ''}`,
        ).includes(q),
      )
    : filas

  if (mensaje) {
    return (
      <Listo
        icono="💬"
        titulo={mensaje.titulo}
        texto={mensaje.texto}
        volver="← Volver al histórico"
        onVolver={() => setMensaje(null)}
      />
    )
  }

  const whatsappSolicitud = (s: SolicitudDeSalida) => {
    const entregada = s.estado === 'ENTREGADA'
    setMensaje({
      titulo: `Salida ${s.nota_salida ?? s.numero}`,
      texto: mensajeSalida({
        almacen: almacen.nombre,
        empresa,
        numero: s.numero,
        nota: s.nota_salida,
        materiales: (s.renglones ?? []).map((r) => ({
          nombre: r.articulo?.nombre ?? 'Artículo',
          unidad: r.articulo?.unidad,
          cantidad: Number(r.cantidad),
        })),
        motivo: s.motivo,
        recibe: paraQuien(s),
        autorizo: nombreDe(s.aprobada_por),
        porAprobar: s.estado === 'PEDIDA',
        retorna: false,
        quien: nombreDe(entregada ? s.entregada_por : s.pedida_por),
        cuando: entregada ? s.entregada_en : s.pedida_en,
      }),
    })
  }

  const whatsappPrestamo = (p: PrestamoDelHistorico) =>
    setMensaje({
      titulo: `Préstamo ${p.numero ?? p.articulo}`,
      texto: mensajeSalida({
        almacen: almacen.nombre,
        empresa,
        numero: p.numero,
        materiales: [{ nombre: p.articulo, unidad: p.unidad, cantidad: Number(p.cantidad) }],
        motivo: p.nota ?? '',
        retorna: true,
        prestadoA: p.empleado,
        cuando: `${p.fecha_entrega}T12:00:00-04:00`,
      }),
    })

  return (
    <section className="mt-4 space-y-3">
      <CabeceraDePaso icono="🧾" titulo={`Histórico de salidas · ${almacen.nombre}`} onVolver={onVolver} />
      <RangoDeFechas
        atajos={ATAJOS}
        desde={rango.desde}
        hasta={rango.hasta}
        onCambiar={(desde, hasta) => {
          setRango({ desde, hasta })
          setVistas(POR_TANDA)
        }}
      />
      <Input
        maxLength={100}
        label="Buscar salida"
        ocultarEtiqueta
        sinNormalizar
        type="search"
        autoComplete="off"
        placeholder="🔍 Material, N° SS / NS o motivo…"
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value)
          setVistas(POR_TANDA)
        }}
      />

      {!mal && datos.isPending ? <p className="text-ink/50 text-sm">Cargando salidas…</p> : null}
      {datos.error ? <p className="text-danger text-sm">{mensajeDe(datos.error, 'No se pudo leer')}</p> : null}
      {!mal && datos.isSuccess ? (
        <h2 className="text-ink/80 font-semibold">
          {filas.length === 0
            ? `No hay salidas de ${almacen.nombre} en esas fechas.`
            : q
              ? encontradas.length > 0
                ? `${encontradas.length} encontrada(s) de ${filas.length}`
                : 'Ninguna salida coincide'
              : `${filas.length} salida(s) en esas fechas`}
        </h2>
      ) : null}

      <div className="space-y-2">
        {encontradas.slice(0, vistas).map((f) => {
          if (f.clase === 'solicitud') {
            const s = f.s
            const r = s.renglones ?? []
            const primero = r[0]
            return (
              <FilaDeLista
                key={`s${s.id}`}
                titulo={
                  r.length > 1
                    ? `${primero?.articulo?.nombre ?? 'Material'} y ${r.length - 1} más`
                    : (primero?.articulo?.nombre ?? 'Material')
                }
                derecha={
                  r.length === 1 && primero ? (
                    <>
                      −{num(Number(primero.cantidad))} <small>{primero.articulo?.unidad}</small>
                    </>
                  ) : (
                    `${r.length} materiales`
                  )
                }
                lineas={[
                  `${[s.numero, s.nota_salida].filter(Boolean).join(' · ')} · ${fechaHoraVE(s.pedida_en)}`,
                  `Motivo: ${s.motivo}`,
                  [
                    nombreDe(s.pedida_por) ? `Pidió ${nombreDe(s.pedida_por)}` : '',
                    nombreDe(s.aprobada_por) ? `Aprobó ${nombreDe(s.aprobada_por)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || null,
                ]}
                pie={
                  <>
                    <strong>{ESTADO_DE_SOLICITUD[s.estado].texto}</strong> · 🗂 Solicitud de salida
                  </>
                }
              >
                <Button size="sm" variant="outline" onClick={() => void nota.abrirOrden(s)}>
                  📄 Ver PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => whatsappSolicitud(s)}>
                  💬 WhatsApp
                </Button>
              </FilaDeLista>
            )
          }
          const p = f.p
          return (
            <FilaDeLista
              key={`p${p.id}`}
              titulo={p.articulo}
              derecha={
                <>
                  −{num(Number(p.cantidad))} <small>{p.unidad}</small>
                </>
              }
              lineas={[
                `${p.numero ?? '—'} · ${fecha(p.fecha_entrega)}`,
                `Prestado a: ${p.empleado}`,
                p.nota ? `Motivo: ${p.nota}` : null,
              ]}
              pie={
                <>
                  <strong>
                    {p.estado === 'ASIGNADA' ? 'Por retornar' : p.estado === 'DEVUELTA' ? 'Retornó' : p.estado.toLowerCase()}
                  </strong>{' '}
                  · 🔄 Préstamo
                </>
              }
            >
              <Button size="sm" variant="outline" onClick={() => whatsappPrestamo(p)}>
                💬 WhatsApp
              </Button>
            </FilaDeLista>
          )
        })}
      </div>
      <Tandas total={encontradas.length} vistas={vistas} onMas={() => setVistas((v) => v + POR_TANDA)} />
      {nota.visor}
    </section>
  )
}

/* ──────────────────────────────────────── 🔁 traslados */

export function HistoricoTraslados({
  almacen,
  empresa,
  onVolver,
}: {
  almacen: Sitio
  empresa: string
  onVolver: () => void
}) {
  const [rango, setRango] = useState(() => rangoDe('d60'))
  const [busca, setBusca] = useState('')
  const [vistas, setVistas] = useState(POR_TANDA)
  const [mensaje, setMensaje] = useState<MensajeAbierto | null>(null)
  const mal = fechasMal(rango.desde, rango.hasta)
  const datos = useHistoricoTraslados(almacen.id, rango.desde, rango.hasta, !mal)
  const { data: perfiles } = usePerfiles()
  const nota = useNotaDeTraslado()

  const nombreDe = (uid: string | null) => (uid && perfiles?.find((p) => p.id === uid)?.nombre) || null
  const filas = datos.data ?? []
  const q = sinAcentos(busca.trim())
  const encontradas = q
    ? filas.filter((t) =>
        sinAcentos(`${t.numero} ${t.articulo?.nombre ?? ''} ${t.articulo?.codigo ?? ''} ${t.nota ?? ''} ${t.otro ?? ''}`).includes(
          q,
        ),
      )
    : filas

  if (mensaje) {
    return (
      <Listo
        icono="💬"
        titulo={mensaje.titulo}
        texto={mensaje.texto}
        volver="← Volver al histórico"
        onVolver={() => setMensaje(null)}
      />
    )
  }

  const sale = (t: TrasladoDelHistorico) => t.signo < 0
  const whatsapp = (t: TrasladoDelHistorico) =>
    setMensaje({
      titulo: `Traslado ${t.numero}`,
      texto: mensajeTraslado({
        empresa,
        origen: sale(t) ? almacen.nombre : (t.otro ?? '—'),
        destino: sale(t) ? (t.otro ?? '—') : almacen.nombre,
        numeros: [t.numero],
        materiales: [
          {
            nombre: t.articulo?.nombre ?? 'Artículo',
            codigo: t.articulo?.codigo,
            unidad: t.unidad,
            cantidad: Number(t.cantidad),
          },
        ],
        motivo: t.nota ?? '',
        quien: nombreDe(t.registrado_por),
        cuando: t.registrado_en,
      }),
    })

  return (
    <section className="mt-4 space-y-3">
      <CabeceraDePaso icono="🔁" titulo={`Histórico de traslados · ${almacen.nombre}`} onVolver={onVolver} />
      <RangoDeFechas
        atajos={ATAJOS}
        desde={rango.desde}
        hasta={rango.hasta}
        onCambiar={(desde, hasta) => {
          setRango({ desde, hasta })
          setVistas(POR_TANDA)
        }}
      />
      <Input
        maxLength={100}
        label="Buscar traslado"
        ocultarEtiqueta
        sinNormalizar
        type="search"
        autoComplete="off"
        placeholder="🔍 Material, N°, motivo o almacén…"
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value)
          setVistas(POR_TANDA)
        }}
      />

      {!mal && datos.isPending ? <p className="text-ink/50 text-sm">Cargando traslados…</p> : null}
      {datos.error ? <p className="text-danger text-sm">{mensajeDe(datos.error, 'No se pudo leer')}</p> : null}
      {!mal && datos.isSuccess ? (
        <h2 className="text-ink/80 font-semibold">
          {filas.length === 0
            ? `No hay traslados de ${almacen.nombre} en esas fechas.`
            : q
              ? encontradas.length > 0
                ? `${encontradas.length} encontrado(s) de ${filas.length}`
                : 'Ningún traslado coincide'
              : `${filas.length} traslado(s) en esas fechas`}
        </h2>
      ) : null}

      <div className="space-y-2">
        {encontradas.slice(0, vistas).map((t) => {
          const idPapel = sale(t) ? t.id : t.movimiento_origen
          return (
            <FilaDeLista
              key={t.id}
              titulo={t.articulo?.nombre ?? 'Artículo'}
              derecha={
                <>
                  {sale(t) ? '−' : '+'}
                  {num(Number(t.cantidad))} <small>{t.unidad}</small>
                </>
              }
              lineas={[
                `${t.numero} · ${fechaHoraVE(t.registrado_en)}`,
                sale(t) ? `A: ${t.otro ?? '—'}` : `De: ${t.otro ?? '—'}`,
                t.nota ? `Motivo: ${t.nota}` : null,
                nombreDe(t.registrado_por) ? `Registró ${nombreDe(t.registrado_por)}` : null,
              ]}
              pie={
                <>
                  <strong>Trasladado</strong> · {sale(t) ? 'Salió de aquí' : 'Entró aquí'}
                </>
              }
            >
              {idPapel ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={nota.armando === idPapel}
                  onClick={() => void nota.abrir(idPapel)}
                >
                  {nota.armando === idPapel ? 'Armando el PDF…' : '📄 Ver PDF'}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => whatsapp(t)}>
                💬 WhatsApp
              </Button>
            </FilaDeLista>
          )
        })}
      </div>
      <Tandas total={encontradas.length} vistas={vistas} onMas={() => setVistas((v) => v + POR_TANDA)} />
      {nota.visor}
    </section>
  )
}
