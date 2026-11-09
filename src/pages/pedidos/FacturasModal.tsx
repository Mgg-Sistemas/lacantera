import { useState, type ChangeEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  borrarArchivosDirecto,
  subirArchivoDirecto,
  useFacturasServicioDirecto,
  type ArchivoSubido,
  type FacturaDirecto,
  type ServicioDirecto,
} from '@/lib/api/pedidos'
import { fechaHoraVE } from '@/lib/pedidos'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { abrirArchivoDirecto } from './ordenDesdeDirecto'

/*
  «🧾 FACTURAS» DE UN SERVICIO DIRECTO (MGG `FacturasModal`)

  Ver las actuales, quitar las anteriores y cargar nuevas (PDF o imagen,
  varias, 10 MB c/u). Las nuevas se suben al depósito y la base guarda la
  lista final; las quitadas se borran del depósito después.
*/

export function FacturasModal({ servicio: s, onClose }: { servicio: ServicioDirecto; onClose: () => void }) {
  const guardar = useFacturasServicioDirecto()
  const [actuales, setActuales] = useState<FacturaDirecto[]>(s.facturas ?? [])
  const [quitadas, setQuitadas] = useState(0)
  const [nuevos, setNuevos] = useState<File[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const ocupado = subiendo || guardar.isPending

  function elegir(e: ChangeEvent<HTMLInputElement>) {
    const validos: File[] = []
    for (const f of Array.from(e.target.files ?? [])) {
      if (f.type && f.type !== 'application/pdf' && !f.type.startsWith('image/')) {
        toast(`"${f.name}": debe ser PDF o imagen`, 'error')
        continue
      }
      if (f.size > 10 * 1024 * 1024) {
        toast(`"${f.name}": no puede superar 10 MB`, 'error')
        continue
      }
      validos.push(f)
    }
    setNuevos((prev) => {
      const clave = (f: File) => `${f.name}-${f.size}`
      const ya = new Set(prev.map(clave))
      return [...prev, ...validos.filter((f) => !ya.has(clave(f)))]
    })
    e.target.value = ''
  }

  async function onGuardar() {
    if (!quitadas && !nuevos.length) return onClose()
    setSubiendo(true)
    const subidas: ArchivoSubido[] = []
    try {
      for (const f of nuevos) subidas.push(await subirArchivoDirecto(s.id, 'factura', f))
      await guardar.mutateAsync({
        id: s.id,
        facturas: [...actuales.map((a) => ({ path: a.path, filename: a.filename })), ...subidas],
      })
      toast('Facturas actualizadas', 'success')
      onClose()
    } catch (e) {
      void borrarArchivosDirecto(subidas.map((a) => a.path))
      toast(mensajeDe(e, 'No se pudieron guardar las facturas'), 'error')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Modal
      abierto
      onCerrar={onClose}
      titulo={`Facturas · ${s.codigo}`}
      ancho="md"
      acciones={
        <>
          <Button variant="ghost" onClick={onClose} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={() => void onGuardar()} disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Guardar facturas'}
          </Button>
        </>
      }
    >
      <div className="text-ink/75 mb-1.5 text-sm font-medium">Facturas actuales</div>
      {actuales.length ? (
        <div className="mb-4 space-y-1">
          {actuales.map((a) => (
            <div key={a.path} className="border-hairline flex items-center justify-between gap-2 rounded-[6px] border px-2 py-1">
              <Button size="sm" variant="ghost" title="Ver factura" onClick={() => void abrirArchivoDirecto(a.path, a.filename)}>
                📎 {a.filename}
              </Button>
              <span className="flex items-center gap-2">
                <span className="text-ink/45 text-xs">{fechaHoraVE(a.at)}</span>
                <button
                  type="button"
                  className="text-danger hover:bg-danger/10 rounded px-1.5 text-sm"
                  title="Quitar esta factura"
                  onClick={() => {
                    setActuales((prev) => prev.filter((x) => x.path !== a.path))
                    setQuitadas((n) => n + 1)
                  }}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-ink/50 mb-4 text-sm">Sin facturas. Cargá una abajo.</p>
      )}

      <div className="text-ink/75 mb-1.5 text-sm font-medium">Cargar nuevas facturas (PDF o imagen · varias)</div>
      <input type="file" accept="application/pdf,image/*" multiple onChange={elegir} />
      {nuevos.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {nuevos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="text-ink/70 flex items-center gap-2">
              ✓ {f.name} ({(f.size / 1024).toFixed(0)} KB)
              <button
                type="button"
                className="text-danger text-xs"
                title="Quitar"
                onClick={() => setNuevos((prev) => prev.filter((_, k) => k !== i))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-ink/50 mt-1.5 text-xs">PDF o imágenes · máximo 10 MB c/u.</p>
    </Modal>
  )
}
