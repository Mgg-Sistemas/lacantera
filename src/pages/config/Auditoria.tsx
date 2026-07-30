import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, History, Search, ShieldCheck, X } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  POR_PAGINA,
  TONO,
  VERBOS,
  cambiosDeFondo,
  esDeRegistro,
  nombreDeCampo,
  nombreDeTabla,
  useAuditoria,
  useTablasAuditadas,
  valorLegible,
} from '@/lib/api/auditoria'
import type { FiltrosAuditoria, Movimiento, Operacion } from '@/lib/api/auditoria'
import { usePerfiles } from '@/lib/api/catalogo'
import { fechaHora } from '@/lib/formato'

const OPERACIONES: { valor: Operacion; etiqueta: string }[] = [
  { valor: 'INSERT', etiqueta: 'Creaciones' },
  { valor: 'UPDATE', etiqueta: 'Modificaciones' },
  { valor: 'DELETE', etiqueta: 'Borrados' },
  { valor: 'ACCESO', etiqueta: 'Entradas al sistema' },
  { valor: 'CLAVE', etiqueta: 'Cambios de clave' },
]

const sinFiltros: FiltrosAuditoria = {
  desde: '',
  hasta: '',
  usuario_id: '',
  tabla: '',
  operacion: '',
  texto: '',
}

/** La frase de una línea: qué hizo y sobre qué. */
function frase(m: Movimiento): string {
  if (m.operacion === 'ACCESO') return 'Entró al sistema'
  if (m.operacion === 'CLAVE') return 'Cambió una clave'
  return `${VERBOS[m.operacion]} ${nombreDeTabla(m.tabla).toLowerCase()}`
}

export function Auditoria() {
  const [filtros, setFiltros] = useState<FiltrosAuditoria>(sinFiltros)
  const [pagina, setPagina] = useState(0)
  const [detalle, setDetalle] = useState<Movimiento | null>(null)

  const { data, isPending, error } = useAuditoria(filtros, pagina)
  const tablas = useTablasAuditadas()
  const perfiles = usePerfiles()

  const cambiar = (c: Partial<FiltrosAuditoria>) => {
    setFiltros((f) => ({ ...f, ...c }))
    // Cambiar un filtro estando en la página 4 devolvería una lista vacía con
    // resultados detrás. Se vuelve al principio.
    setPagina(0)
  }

  const hayFiltro = useMemo(
    () => Object.values(filtros).some((v) => v !== '' && v !== undefined),
    [filtros],
  )

  const total = data?.total ?? 0
  const ultima = Math.max(0, Math.ceil(total / POR_PAGINA) - 1)

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Todo lo que se escribe en el sistema queda aquí, con la fecha, la hora y quién lo hizo. Esta pantalla la abre solo la administración."
      />

      {/* ------------------------------ Filtros ------------------------------ */}
      <Card className="mb-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Buscar"
            placeholder="Nombre, usuario, número de documento"
            icon={<Search />}
            sinNormalizar
            value={filtros.texto ?? ''}
            onChange={(e) => cambiar({ texto: e.target.value })}
          />
          <Select
            label="Quién"
            vacio="Cualquiera"
            value={filtros.usuario_id ?? ''}
            onChange={(e) => cambiar({ usuario_id: e.target.value })}
            opciones={(perfiles.data ?? []).map((p) => ({
              valor: p.id,
              etiqueta: `${p.nombre} (${p.usuario})`,
            }))}
          />
          <Select
            label="Qué hizo"
            vacio="Todo"
            value={filtros.operacion ?? ''}
            onChange={(e) => cambiar({ operacion: e.target.value })}
            opciones={OPERACIONES.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
          />
          <Select
            label="Sobre qué"
            vacio="Todo el sistema"
            value={filtros.tabla ?? ''}
            onChange={(e) => cambiar({ tabla: e.target.value })}
            opciones={(tablas.data ?? []).map((t) => ({ valor: t, etiqueta: nombreDeTabla(t) }))}
          />
          <Input
            label="Desde"
            type="date"
            value={filtros.desde ?? ''}
            onChange={(e) => cambiar({ desde: e.target.value })}
          />
          <Input
            label="Hasta"
            type="date"
            value={filtros.hasta ?? ''}
            onChange={(e) => cambiar({ hasta: e.target.value })}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-ink/50 text-sm">
            {isPending
              ? 'Contando…'
              : total === 0
                ? 'Ningún movimiento con estos filtros'
                : `${total.toLocaleString('es-VE')} ${total === 1 ? 'movimiento' : 'movimientos'}`}
          </p>
          {hayFiltro ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<X />}
              onClick={() => {
                setFiltros(sinFiltros)
                setPagina(0)
              }}
            >
              Quitar filtros
            </Button>
          ) : null}
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.filas.length === 0 ? (
        <Card>
          <Vacio
            icono={<History />}
            titulo={hayFiltro ? 'Nada con esos filtros' : 'Todavía no hay movimientos anotados'}
            descripcion={
              hayFiltro
                ? 'Prueba con un rango de fechas más amplio o quita algún filtro.'
                : 'El registro empieza a llenarse desde que se activó. Lo que pasó antes de eso no está aquí, y no se puede inventar.'
            }
          />
        </Card>
      ) : null}

      {data && data.filas.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Cuándo</th>
                  <th className="px-3 py-3 font-medium">Quién</th>
                  <th className="px-3 py-3 font-medium">Qué hizo</th>
                  <th className="px-3 py-3 font-medium">Sobre qué</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((m) => (
                  <tr key={m.id} className="border-hairline border-b last:border-0">
                    <td className="text-ink/70 tabular px-5 py-3 text-xs whitespace-nowrap">
                      {fechaHora(m.ocurrido_en)}
                    </td>
                    <td className="px-3 py-3">
                      {/* El nombre se guardó en el momento. Si esa persona se
                          cambió el nombre después, aquí sigue el de entonces —
                          que es lo correcto en un registro de auditoría. */}
                      <span className="text-ink/85 font-medium">{m.nombre ?? m.usuario}</span>
                      <span className="text-ink/45 block text-xs">{m.usuario}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Chip tone={TONO[m.operacion]}>{frase(m)}</Chip>
                    </td>
                    <td className="text-ink/70 max-w-[260px] px-3 py-3">
                      {m.etiqueta ? (
                        <span className="line-clamp-2">{m.etiqueta}</span>
                      ) : (
                        /* Sin etiqueta queda la clave. Se recorta porque hay
                           tablas cuya clave es un uuid, y treinta y seis
                           caracteres de identificador rompen la fila para no
                           decir nada: el detalle la trae entera. */
                        <span className="text-ink/40 tabular text-xs">
                          {m.fila_id
                            ? `n.º ${m.fila_id.length > 18 ? `${m.fila_id.slice(0, 8)}…${m.fila_id.slice(-6)}` : m.fila_id}`
                            : 'sin referencia'}
                        </span>
                      )}
                      {/* El mismo recuento que el detalle: si aquí dijera "3
                          campos" y al abrirlo se vieran dos, el registro
                          parecería estar escondiendo uno. */}
                      {cambiosDeFondo(m.cambios).length > 0 ? (
                        <span className="text-ink/45 block text-xs">
                          {cambiosDeFondo(m.cambios).length === 1
                            ? nombreDeCampo(cambiosDeFondo(m.cambios)[0])
                            : `${cambiosDeFondo(m.cambios).length} campos`}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setDetalle(m)}>
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {ultima > 0 ? (
            <div className="border-hairline flex items-center justify-between gap-4 border-t px-5 py-3">
              <Button
                size="sm"
                variant="outline"
                icon={<ChevronLeft />}
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-ink/50 tabular text-xs">
                Página {pagina + 1} de {ultima + 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={pagina >= ultima}
                onClick={() => setPagina((p) => Math.min(ultima, p + 1))}
              >
                Siguiente
                <ChevronRight className="size-[18px]" />
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------ Detalle ------------------------------ */}
      {detalle ? (
        <Modal
          abierto
          onCerrar={() => setDetalle(null)}
          titulo={frase(detalle)}
          descripcion={`${detalle.nombre ?? detalle.usuario} · ${fechaHora(detalle.ocurrido_en)}`}
          ancho="lg"
          acciones={<Button onClick={() => setDetalle(null)}>Cerrar</Button>}
        >
          <dl className="border-hairline mb-5 grid gap-x-6 gap-y-2 rounded-[6px] border p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink/45 text-xs">Usuario</dt>
              <dd className="text-ink/80">{detalle.usuario}</dd>
            </div>
            <div>
              <dt className="text-ink/45 text-xs">Sobre</dt>
              <dd className="text-ink/80">
                {nombreDeTabla(detalle.tabla)}
                {detalle.fila_id ? (
                  <span className="text-ink/45 tabular"> · {detalle.fila_id}</span>
                ) : null}
              </dd>
            </div>
            {detalle.etiqueta ? (
              <div className="sm:col-span-2">
                <dt className="text-ink/45 text-xs">Referencia</dt>
                <dd className="text-ink/80">{detalle.etiqueta}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-ink/45 text-xs">Desde</dt>
              <dd className="text-ink/80 tabular">{detalle.ip ?? 'no registrada'}</dd>
            </div>
          </dl>

          {detalle.operacion === 'ACCESO' ? (
            <p className="text-ink/55 flex items-start gap-2 text-sm leading-relaxed">
              <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" />
              Se anota la entrada, no la salida. Supabase borra la sesión al cerrarla, pero también
              al caducar y al cambiar la clave, y desde la base no hay forma de distinguirlas:
              escribir «salió» cuando en realidad se le venció la sesión sería falso, y esto no
              puede contener nada falso.
            </p>
          ) : null}

          {detalle.operacion === 'CLAVE' ? (
            <p className="text-ink/55 flex items-start gap-2 text-sm leading-relaxed">
              <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" />
              Queda anotado que la clave cambió y quién lo hizo. La clave —ni la vieja ni la
              nueva— no se guarda aquí ni en ninguna otra parte legible.
            </p>
          ) : null}

          {/* Una modificación se lee por lo que cambió, no por la fila entera:
              con cuarenta columnas, mostrarlas todas esconde las dos que
              importan. Un alta o un borrado sí van completos, porque ahí la
              fila entera ES la noticia. */}
          {detalle.operacion === 'UPDATE' && detalle.cambios?.length ? (
            <Diferencias movimiento={detalle} />
          ) : null}

          {detalle.operacion === 'INSERT' && detalle.despues ? (
            <FilaCompleta titulo="Como quedó" fila={detalle.despues} />
          ) : null}

          {detalle.operacion === 'DELETE' && detalle.antes ? (
            <FilaCompleta titulo="Lo que había antes de borrarlo" fila={detalle.antes} />
          ) : null}
        </Modal>
      ) : null}
    </>
  )
}

function Diferencias({ movimiento }: { movimiento: Movimiento }) {
  const campos = cambiosDeFondo(movimiento.cambios)
  const ocultos = (movimiento.cambios?.length ?? 0) - campos.length

  // Guardar sin cambiar nada de fondo pasa: se abre una ficha, se pulsa
  // guardar y lo único que se movió fue la marca de quién guardó. Decirlo es
  // mejor que enseñar una tabla vacía, que se lee como un fallo.
  if (campos.length === 0) {
    return (
      <p className="text-ink/55 text-sm leading-relaxed">
        Se volvió a guardar sin cambiar ningún dato: solo se movió la marca de quién guardó y
        cuándo, que es justo lo que dice la cabecera de arriba.
      </p>
    )
  }

  return (
    <>
      <h3 className="text-ink/80 mb-3 text-sm font-semibold">Lo que cambió ({campos.length})</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-ink/45 border-hairline border-b text-left text-xs">
              <th className="py-2 pr-3 font-medium">Campo</th>
              <th className="px-3 py-2 font-medium">Antes</th>
              <th className="py-2 pl-3 font-medium">Después</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((campo) => (
              <tr key={campo} className="border-hairline border-b last:border-0 align-top">
                <td className="text-ink/70 py-2.5 pr-3">{nombreDeCampo(campo)}</td>
                <td className="text-ink/45 px-3 py-2.5 line-through">
                  {valorLegible(movimiento.antes?.[campo])}
                </td>
                <td className="text-ink/85 py-2.5 pl-3 font-medium">
                  {valorLegible(movimiento.despues?.[campo])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ocultos > 0 ? (
        <p className="text-ink/40 mt-2 text-xs">
          No se listan {ocultos} {ocultos === 1 ? 'campo' : 'campos'} de control —quién guardó y
          cuándo—, porque es lo mismo que ya dice la cabecera.
        </p>
      ) : null}
    </>
  )
}

function FilaCompleta({ titulo, fila }: { titulo: string; fila: Record<string, unknown> }) {
  // Fuera lo vacío —no dice nada— y fuera quién guardó y cuándo, que está en la
  // cabecera del movimiento y aquí saldría como un identificador ilegible.
  const campos = Object.entries(fila).filter(
    ([k, v]) => v !== null && v !== '' && !esDeRegistro(k),
  )

  return (
    <>
      <h3 className="text-ink/80 mb-3 text-sm font-semibold">{titulo}</h3>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {campos.map(([campo, valor]) => (
          <div key={campo} className="border-hairline border-b py-1.5">
            <dt className="text-ink/45 text-xs">{nombreDeCampo(campo)}</dt>
            <dd className="text-ink/80 break-words">{valorLegible(valor)}</dd>
          </div>
        ))}
      </dl>
      {campos.length === 0 ? <p className="text-ink/50 text-sm">La fila estaba vacía.</p> : null}
    </>
  )
}
