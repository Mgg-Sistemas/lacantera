import { useState } from 'react'
import { Link } from 'react-router'
import { PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useMisPermisos } from '@/lib/api/usuarios'
import { usePerfiles } from '@/lib/api/catalogo'
import { nombreDeGrupo, useGruposDeSalida } from '@/lib/api/inventario'
import { useEntregarSolicitud, useSolicitudesDeSalida } from '@/lib/api/salidas'
import type { SolicitudDeSalida } from '@/lib/api/salidas'
import { useEmpresa } from '@/lib/api/empresa'
import { enCastellano } from '@/lib/castellano'
import { ModalReporteSalida } from '@/pages/salidas/ModalReporteSalida'

/*
  ENTREGAR MATERIAL, EN EL TELÉFONO.

  No pide nada: lo que hace falta —destino, responsable, renglones,
  vehículo— ya se decidió al pedirla y al aprobarla. Aquí solo se busca la
  solicitud, se confirma, y sale el mismo reporte compartible por WhatsApp
  que ya existe hoy en Salidas y traslados — se reutiliza tal cual, no se
  inventa un segundo formato.
*/

export function AlmacenSalida() {
  const { puede } = useMisPermisos()
  const puedeEntregar = puede('SALIDAS', 'ESCRITURA')
  const { data: solicitudes, isPending, error } = useSolicitudesDeSalida()
  const { data: perfiles } = usePerfiles()
  const grupos = useGruposDeSalida()
  const { data: empresa } = useEmpresa()
  const entregar = useEntregarSolicitud()

  const [buscado, setBuscado] = useState('')
  const [eligiendo, setEligiendo] = useState<SolicitudDeSalida | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [reporte, setReporte] = useState<{ s: SolicitudDeSalida; notaSalida: string } | null>(null)

  const nombreDe = (uid: string | null) =>
    (uid && perfiles?.find((p) => p.id === uid)?.nombre) || '—'

  const paraQuien = (s: SolicitudDeSalida) =>
    nombreDeGrupo(grupos.data, s.grupo_id) ??
    (s.destino_externo
      ? `${s.destino_externo}, de fuera de la empresa${s.responsable_externo ? ` · responde ${s.responsable_externo}` : ''}`
      : '—')

  const porEntregar = (solicitudes ?? [])
    .filter((s) => s.estado === 'APROBADA')
    .filter(
      (s) =>
        !buscado.trim() ||
        `${s.numero} ${paraQuien(s)}`.toLowerCase().includes(buscado.trim().toLowerCase()),
    )

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />

  if (!puedeEntregar) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario puede ver las salidas, pero no entregar material. Hace falta el permiso de
        escritura en Salidas.
      </p>
    )
  }

  const confirmar = (s: SolicitudDeSalida) => {
    setFallo(null)
    entregar.mutate(s.id, {
      onSuccess: (numero) => {
        setEligiendo(null)
        setReporte({ s, notaSalida: numero as string })
      },
      onError: (e) => setFallo(enCastellano(e)),
    })
  }

  if (eligiendo) {
    return (
      <div className="mx-auto max-w-md pb-10">
        <button
          type="button"
          className="text-ink/45 mb-3 text-sm underline decoration-dotted underline-offset-4"
          onClick={() => setEligiendo(null)}
        >
          ← Volver a la lista
        </button>
        <h1 className="text-ink/85 font-titular text-xl">{eligiendo.numero}</h1>

        <div className="border-hairline bg-canvas rounded-card mt-3 space-y-1.5 border p-4 text-sm">
          <p>
            <span className="text-ink/45">Para:</span> {paraQuien(eligiendo)}
          </p>
          <p>
            <span className="text-ink/45">Pidió:</span> {nombreDe(eligiendo.pedida_por)}
          </p>
          <p>
            <span className="text-ink/45">Aprobó:</span> {nombreDe(eligiendo.aprobada_por)}
          </p>
          {eligiendo.vehiculo ? (
            <p>
              <span className="text-ink/45">Vehículo:</span> {eligiendo.vehiculo}
            </p>
          ) : null}

          <div className="border-hairline mt-2 border-t pt-2">
            <p className="text-ink/45 mb-1 text-xs tracking-wide uppercase">Material</p>
            <ul className="space-y-1">
              {(eligiendo.renglones ?? []).map((r) => (
                <li key={r.id}>
                  {Number(r.cantidad).toLocaleString('es-VE')} {r.articulo?.unidad} de{' '}
                  {r.articulo?.nombre}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {fallo ? <p className="text-danger mt-3 text-sm">{fallo}</p> : null}

        <Button
          className="mt-5 w-full py-4 text-base"
          icon={<PackageCheck />}
          disabled={entregar.isPending}
          onClick={() => confirmar(eligiendo)}
        >
          {entregar.isPending ? 'Entregando…' : 'Confirmar entrega'}
        </Button>
      </div>
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
      <h1 className="text-ink/85 font-titular text-xl">Entregar material</h1>
      <p className="text-ink/55 mt-1 text-sm">Solicitudes ya aprobadas, por entregar.</p>

      {porEntregar.length > 3 ? (
        <Input
          className="mt-3"
          label="Buscar"
          ocultarEtiqueta
          value={buscado}
          onChange={(e) => setBuscado(e.target.value)}
          placeholder="Número o destino…"
        />
      ) : null}

      {porEntregar.length === 0 ? (
        <p className="text-ink/45 mt-8 text-center text-sm">No hay nada por entregar.</p>
      ) : (
        <ul className="divide-hairline border-hairline mt-3 divide-y rounded-card border">
          {porEntregar.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="active:bg-ink/5 flex w-full flex-col items-start gap-0.5 px-3 py-3 text-left"
                onClick={() => setEligiendo(s)}
              >
                <span className="text-ink/85 text-sm font-medium">{s.numero}</span>
                <span className="text-ink/55 text-xs">{paraQuien(s)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {reporte ? (
        <ModalReporteSalida
          s={reporte.s}
          numeroNota={reporte.notaSalida}
          razonSocial={empresa?.razon_social ?? ''}
          destino={paraQuien(reporte.s)}
          camiones={reporte.s.vehiculo ? [{ vehiculo: reporte.s.vehiculo, chofer: null }] : []}
          pedidoPor={nombreDe(reporte.s.pedida_por)}
          aprobadoPor={nombreDe(reporte.s.aprobada_por)}
          entregadoPor={nombreDe(reporte.s.entregada_por)}
          onCerrar={() => setReporte(null)}
        />
      ) : null}
    </div>
  )
}
