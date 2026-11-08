import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { usePrestamosPorRetornar, useRetornarPrestamo, type PrestamoPorRetornar } from '@/lib/api/almacenTelefono'
import type { Almacen as Sitio } from '@/lib/api/inventario'
import { fecha } from '@/lib/formato'
import { mensajeRetorno, num } from '@/lib/ficha/inventarioWhatsapp'
import { sinAcentos, useTardaPorLaSeñal } from './comun'
import { AvisoDeSeñal, CabeceraDePaso, FilaDeLista, TituloDePaso } from './piezas'

/*
  🔄 POR RETORNAR, EN EL TELÉFONO (MGG `PorRetornar`, fase 1b, 08/11/2026).

  Los préstamos sin devolver de ESTE almacén (antes `AlmacenRetorno`, de todos
  los almacenes y solo con «Devolver» completo). El retorno puede ser PARCIAL
  (decisión 0.3): `devolver_parte_de_prestamo` separa lo que vuelve y deja el
  préstamo abierto con lo que falta, y la lista dice «Ya retornó {x} de
  {total}».
*/

export interface RetornoHechoEnPantalla {
  titulo: string
  texto: string
}

export function PorRetornar({
  almacen,
  puedeRetornar,
  quien,
  empresa,
  onVolver,
  onHecho,
}: {
  almacen: Sitio
  puedeRetornar: boolean
  quien: string
  empresa: string
  onVolver: () => void
  onHecho: (h: RetornoHechoEnPantalla) => void
}) {
  const lista = usePrestamosPorRetornar(almacen.id)
  const [busca, setBusca] = useState('')
  const [elegido, setElegido] = useState<PrestamoPorRetornar | null>(null)

  if (elegido) {
    return (
      <FormRetorno
        key={elegido.id}
        almacen={almacen}
        prestamo={elegido}
        quien={quien}
        empresa={empresa}
        onCancel={() => setElegido(null)}
        onHecho={onHecho}
      />
    )
  }

  const filas = lista.data ?? []
  const q = sinAcentos(busca.trim())
  const vistas = q
    ? filas.filter((p) =>
        sinAcentos(
          `${p.articulo} ${p.articulo_codigo} ${p.numero ?? ''} ${p.nota ?? ''} ${p.empleado} ${fecha(p.fecha_entrega)}`,
        ).includes(q),
      )
    : filas

  return (
    <section className="mt-4 space-y-3">
      <CabeceraDePaso icono="🔄" titulo={`Por retornar · ${almacen.nombre} (${filas.length})`} onVolver={onVolver} />

      {filas.length > 0 ? (
        <Input
          maxLength={100}
          label="Buscar salida pendiente"
          ocultarEtiqueta
          sinNormalizar
          type="search"
          autoComplete="off"
          placeholder="🔍 Buscar salida pendiente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      ) : null}

      {lista.isPending ? <p className="text-ink/50 text-sm">Cargando…</p> : null}
      {lista.error ? <p className="text-danger text-sm">{mensajeDe(lista.error, 'No se pudo leer')}</p> : null}
      {lista.isSuccess && filas.length === 0 ? (
        <p className="text-ink/55 text-sm">No hay nada pendiente por retornar en este almacén.</p>
      ) : null}
      {q ? (
        <p className="text-ink/60 text-sm">
          {vistas.length > 0 ? `${vistas.length} encontrada(s)` : 'Ninguna salida pendiente coincide'}
        </p>
      ) : null}

      <div className="space-y-2">
        {vistas.map((p) => {
          const retornado = Number(p.retornado) || 0
          return (
            <FilaDeLista
              key={p.id}
              titulo={p.articulo}
              disabled={!puedeRetornar}
              onClick={() => setElegido(p)}
              lineas={[
                `${p.numero ?? '—'} · ${fecha(p.fecha_entrega)} · ${p.empleado}`,
                p.nota ? p.nota : null,
                retornado > 0 ? `Ya retornó ${num(retornado)} de ${num(Number(p.total))}` : null,
              ]}
              derecha={
                <>
                  {num(Number(p.falta))} <small>{p.unidad}</small>
                </>
              }
            />
          )
        })}
      </div>

      <p className="text-center text-sm">
        <Link
          to="/app/inventario/almacen/prestamo"
          className="text-ink/55 underline decoration-dotted underline-offset-4"
        >
          Entregar a un trabajador (dotación, o de otro almacén)
        </Link>
      </p>
    </section>
  )
}

function FormRetorno({
  almacen,
  prestamo: p,
  quien,
  empresa,
  onCancel,
  onHecho,
}: {
  almacen: Sitio
  prestamo: PrestamoPorRetornar
  quien: string
  empresa: string
  onCancel: () => void
  onHecho: (h: RetornoHechoEnPantalla) => void
}) {
  const retornar = useRetornarPrestamo()
  const falta = Number(p.falta) || 0
  const total = Number(p.total) || 0
  const yaRetorno = Number(p.retornado) || 0
  const u = p.unidad
  const [cantidad, setCantidad] = useState(String(falta))
  const [nota, setNota] = useState('')
  const tarda = useTardaPorLaSeñal(retornar.isPending)

  const cant = Number(cantidad) || 0
  const problema = !(cant > 0) ? 'Escribe cuánto retorna.' : cant > falta ? `Solo faltan ${num(falta)} por retornar.` : null

  const guardar = async () => {
    if (problema) return toast(problema, 'error')
    try {
      const r = await retornar.mutateAsync({ id: p.id, cantidad: cant, nota })
      toast(`Retorno: +${num(cant)} ${u} de ${p.articulo}`, 'success')
      onHecho({
        titulo: `Retorno de ${p.numero ?? p.articulo} registrado`,
        texto: mensajeRetorno({
          almacen: almacen.nombre,
          empresa,
          numero: p.numero,
          nombre: p.articulo,
          unidad: u,
          cantidad: cant,
          total: Number(r.total) || total,
          falta: Number(r.falta) || 0,
          prestadoA: p.empleado,
          nota,
          quien,
        }),
      })
    } catch (err) {
      toast(mensajeDe(err, 'No se pudo guardar'), 'error')
    }
  }

  const filas: Array<[string, string]> = [
    ['Salida', p.numero ?? '—'],
    ['Salió', `${num(total)} ${u} · ${fecha(p.fecha_entrega)}`],
    ['Lo tiene', p.empleado],
    ['Motivo', p.nota ?? '—'],
    ['Ya retornó', `${num(yaRetorno)} ${u}`],
    ['Falta', `${num(falta)} ${u}`],
  ]

  return (
    <form
      className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <TituloDePaso icono="📥">Retorno · {p.articulo}</TituloDePaso>
      <table className="w-full text-sm">
        <tbody className="divide-hairline divide-y">
          {filas.map(([k, v]) => (
            <tr key={k}>
              <th className="text-ink/60 py-1.5 pr-3 text-left align-top font-normal">{k}</th>
              <td className="py-1.5 text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Input
        limite={{ maxDecimales: 4, sinNegativos: true }}
        label={`¿Cuánto retorna? (${u})`}
        type="number"
        inputMode="decimal"
        className="text-lg"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        error={cant > falta ? `Solo faltan ${num(falta)} ${u}.` : undefined}
        hint={
          cant > 0 && cant < falta ? `Retorno parcial: quedarán ${num(falta - cant)} ${u} por retornar.` : undefined
        }
      />
      <Input
        maxLength={200}
        label="Nota"
        autoComplete="off"
        placeholder="En qué estado volvió, quién lo trajo…"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      {tarda ? <AvisoDeSeñal que="El retorno" /> : null}

      <Button type="submit" block size="lg" disabled={retornar.isPending || problema !== null}>
        {retornar.isPending ? 'Guardando…' : '✓ Dar retorno al inventario'}
      </Button>
      <Button block variant="ghost" size="lg" disabled={retornar.isPending} onClick={onCancel}>
        ← Otra salida
      </Button>
    </form>
  )
}
