import { useState } from 'react'
import { Link } from 'react-router'
import { Share2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Button } from '@/components/ui/Button'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useArticulos, usePerfiles } from '@/lib/api/catalogo'
import { nombreDeMovimiento, paraQuienSalio, useGruposDeSalida, useMovimientos } from '@/lib/api/inventario'
import type { Movimiento } from '@/lib/api/inventario'
import { ModalReporteMovimiento } from './ModalReporteMovimiento'
import { cn } from '@/lib/cn'

/*
  HISTORIAL DE MOVIMIENTOS, EN EL TELÉFONO.

  Christopher, 30/10/2026: poder encontrar un movimiento pasado desde el
  teléfono y reportarlo por WhatsApp con la misma foto que ya trae el papel
  que lo originó —ver `ModalReporteMovimiento`—. Solo consulta: ninguna acción
  de almacén cuelga de aquí, así que basta con lectura en Inventario, igual
  que «Ver inventario».
*/

const TOPE = 30

export function AlmacenMovimientos() {
  const { puede } = useMisPermisos()
  const puedeVer = puede('INVENTARIO', 'LECTURA')

  const { data: articulos } = useArticulos()
  const { data: perfiles } = usePerfiles()
  const grupos = useGruposDeSalida()

  const [articuloId, setArticuloId] = useState('')
  const [buscado, setBuscado] = useState('')
  const [reportando, setReportando] = useState<Movimiento | null>(null)

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const { data, isPending, error } = useMovimientos({
    ...(articuloId ? { articuloId: Number(articuloId) } : {}),
    ...(buscado.trim() ? { nota: buscado.trim() } : {}),
    tope: TOPE,
  })

  if (!puedeVer) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario no tiene permiso para ver el historial de movimientos.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-md pb-10">
      <Link
        to="/app/inventario/almacen"
        className="text-ink/45 active:text-ink/80 mb-3 inline-block text-sm underline decoration-dotted underline-offset-4"
      >
        ← Atrás
      </Link>
      <h1 className="text-ink/85 font-titular text-xl">Historial de movimientos</h1>
      <p className="text-ink/55 mt-1 text-sm">
        Busque un movimiento y compártalo por WhatsApp con «Reportar».
      </p>

      <div className="mt-4 space-y-3">
        <SelectBuscable
          label="Artículo"
          vacio="Todos los artículos"
          valor={articuloId}
          onCambio={setArticuloId}
          opciones={(articulos ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
        />
        <Input
          label="Buscar"
          ocultarEtiqueta
          value={buscado}
          onChange={(e) => setBuscado(e.target.value)}
          placeholder="Buscar por número (MOV, NS, SD)…"
        />
      </div>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error && (data ?? []).length === 0 ? (
        <Vacio className="mt-8" titulo="Sin movimientos" descripcion="No hay nada que coincida con lo buscado." />
      ) : null}

      {data && data.length > 0 ? (
        <ul className="divide-hairline border-hairline mt-4 divide-y rounded-card border">
          {data.map((m) => (
            <li key={m.id} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-ink/45 font-mono text-2xs">{m.numero}</p>
                  <p className="text-ink/85 text-sm font-medium">{nombreDeMovimiento(m)}</p>
                  <p className="text-ink/55 text-xs">
                    {m.articulo?.nombre ?? '—'} · {m.almacen?.nombre ?? '—'}
                  </p>
                  <p className="text-ink/40 text-2xs">
                    {nombreDe(m.registrado_por)}
                    {paraQuienSalio(m, grupos.data) ? ` · para ${paraQuienSalio(m, grupos.data)}` : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'tabular shrink-0 text-sm font-semibold',
                    m.signo > 0 ? 'text-success' : 'text-danger',
                  )}
                >
                  {m.signo > 0 ? '+' : '−'}
                  {m.cantidad} {m.unidad}
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                icon={<Share2 />}
                className="mt-2"
                onClick={() => setReportando(m)}
              >
                Reportar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {data && data.length === TOPE ? (
        <p className="text-ink/40 mt-3 text-center text-xs">
          Se enseñan los {TOPE} más recientes que coinciden. Afine la búsqueda para encontrar uno más viejo.
        </p>
      ) : null}

      {reportando ? (
        <ModalReporteMovimiento
          m={reportando}
          quien={nombreDe(reportando.registrado_por)}
          onCerrar={() => setReportando(null)}
        />
      ) : null}
    </div>
  )
}
