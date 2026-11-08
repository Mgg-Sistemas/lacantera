import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useCargarArticulos, useRevisarArticulos } from '@/lib/api/cargaLote'
import type { FilaRevisada, InformeDeCarga } from '@/lib/api/cargaLote'
import { leerHoja, ErrorDePlanilla } from '@/lib/hojas/leerHoja'
import type { FilaDeHoja } from '@/lib/hojas/leerHoja'
import { descargarPlantilla } from '@/lib/hojas/plantilla'
import { toast } from '@/lib/avisosFlotantes'
import { enteros } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { useColumnasDeArticulos } from '../columnasDeArticulos'

/*
  «IMPORTAR INVENTARIO DESDE EXCEL» (fase 4 de «Almacén e Inventario como
  MGG», 08/11/2026). La forma de `ImportarExcelModal.tsx` de MGG —la tarjeta de
  estado, Total / Válidas / Ya existen / Con error, el detalle de filas y los
  botones de abajo— sobre la carga de siempre, `cargar_articulos_por_lote`, que
  primero mira (sin escribir) y después escribe. Lo que se enseña antes de
  importar lo dice la misma función de la base que va a escribir.

  La plantilla es la de «Cargar artículos por planilla» (`plantilla-articulos
  .xlsx`): con almacén, cantidad, costo y moneda carga también la existencia.
  Las filas con error se corrigen en el Excel o, una por una, en la pantalla
  de carga completa.

  «Ya existen» son las filas que traen el código de un artículo del catálogo:
  la base las ACTUALIZA. Con la casilla desmarcada no se suben.
*/

type FiltroDeFilas = '' | 'NUEVO' | 'ACTUALIZA' | 'ERROR'

const ESTADO: Record<string, { texto: string; tono: 'success' | 'info' | 'danger' }> = {
  NUEVO: { texto: 'Válida', tono: 'success' },
  ACTUALIZA: { texto: 'Duplicado', tono: 'info' },
  ERROR: { texto: 'Error', tono: 'danger' },
}

export function ImportarExcel({ onCerrar }: { onCerrar: () => void }) {
  const columnas = useColumnasDeArticulos()
  const revisar = useRevisarArticulos()
  const cargar = useCargarArticulos()
  const entrada = useRef<HTMLInputElement>(null)

  const [archivo, setArchivo] = useState<string | null>(null)
  const [filas, setFilas] = useState<FilaDeHoja[] | null>(null)
  const [informe, setInforme] = useState<InformeDeCarga | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [avisoColumnas, setAvisoColumnas] = useState<string | null>(null)
  const [actualizar, setActualizar] = useState(true)
  const [avisado, setAvisado] = useState(false)
  const [costosVistos, setCostosVistos] = useState(false)
  const [parecidosVistos, setParecidosVistos] = useState(false)
  const [soloCatalogoVisto, setSoloCatalogoVisto] = useState(false)
  const [filtro, setFiltro] = useState<FiltroDeFilas>('')
  const [cargado, setCargado] = useState<InformeDeCarga | null>(null)

  const campos = columnas.map((c) => c.columna)
  const ocupado = revisar.isPending || cargar.isPending

  const elegir = async (f: File) => {
    setErrorLectura(null)
    setAvisoColumnas(null)
    setInforme(null)
    setCargado(null)
    setAvisado(false)
    setCostosVistos(false)
    setParecidosVistos(false)
    setSoloCatalogoVisto(false)
    setArchivo(f.name)
    try {
      const hoja = await leerHoja(f, { claveEsperada: 'codigo', columnasEsperadas: campos })
      // Solo las columnas que la base conoce, sin espacios, y sin las filas
      // en blanco que Excel arrastra al final.
      const limpias = hoja.filas
        .map((fila) => {
          const l: FilaDeHoja = {}
          for (const c of campos) l[c] = (fila[c] ?? '').trim()
          return l
        })
        .filter((l) => Object.values(l).some((v) => v !== ''))
      if (limpias.length === 0) {
        setErrorLectura('La planilla trae la fila de columnas pero ninguna fila con datos debajo.')
        setFilas(null)
        return
      }
      const faltanObligatorias = hoja.faltan.filter((c) => columnas.find((x) => x.columna === c)?.obligatoria)
      if (faltanObligatorias.length > 0) {
        setErrorLectura(
          `A la planilla le faltan columnas que hacen falta: ${faltanObligatorias.join(', ')}. Bajá la plantilla otra vez y llená esa, sin cambiarle los nombres a las columnas.`,
        )
        setFilas(null)
        return
      }
      setAvisoColumnas(
        hoja.faltan.length > 0
          ? `El archivo no trae ${hoja.faltan.join(', ')}. En las filas nuevas quedan con su valor por defecto; en las que ya existen, se respeta lo que tengan.`
          : null,
      )
      setFilas(limpias)
      setInforme(await revisar.mutateAsync(limpias))
    } catch (e) {
      setFilas(null)
      setErrorLectura(
        e instanceof ErrorDePlanilla ? e.message : 'No se pudo leer el archivo. Comprobá que sea la plantilla en CSV o en Excel.',
      )
    }
  }

  const duplicadas = informe?.actualizados ?? 0
  const errores = informe?.errores ?? 0
  const soloCatalogo = informe != null && errores === 0 && informe.con_existencia === 0
  const faltaMirar =
    informe != null &&
    (((informe.avisos_de_costo ?? 0) > 0 && !costosVistos) ||
      ((informe.avisos_de_parecido ?? 0) > 0 && !parecidosVistos) ||
      (soloCatalogo && !soloCatalogoVisto))

  // Las que ya existen no se suben si la casilla está desmarcada.
  const fueraPorDuplicadas = new Set(
    actualizar ? [] : (informe?.filas ?? []).filter((f) => f.estado === 'ACTUALIZA').map((f) => f.fila),
  )
  const aSubir = (filas ?? []).filter((_, i) => !fueraPorDuplicadas.has(i + 1))

  const importar = async () => {
    if (!filas || !informe || errores > 0 || faltaMirar) return
    if (duplicadas > 0 && !avisado) {
      setAvisado(true)
      return
    }
    if (aSubir.length === 0) {
      toast('No queda ninguna fila para importar.', 'warning')
      return
    }
    try {
      const r = await cargar.mutateAsync(aSubir)
      setCargado(r)
      setInforme(null)
      setFilas(null)
      setArchivo(null)
      if (entrada.current) entrada.current.value = ''
      toast(`Importado: ${r.nuevos} nuevos y ${r.actualizados} actualizados`, 'success')
    } catch {
      // El error se enseña en el modal.
    }
  }

  // «Errores por columna», como MGG.
  const porColumna = new Map<string, number>()
  for (const f of informe?.filas ?? []) {
    if (f.estado !== 'ERROR') continue
    const c = f.campo || 'otras'
    porColumna.set(c, (porColumna.get(c) ?? 0) + 1)
  }
  const visibles: FilaRevisada[] = (informe?.filas ?? []).filter((f) => !filtro || f.estado === filtro)

  const estadoGrande = cargado
    ? { tono: 'border-success/40 bg-success/6', texto: `Listo: ${cargado.nuevos} nuevos y ${cargado.actualizados} actualizados.` }
    : !informe
      ? { tono: 'border-hairline', texto: archivo ? 'Leyendo el archivo…' : 'Elegí el Excel lleno con la plantilla.' }
      : errores > 0
        ? { tono: 'border-danger/40 bg-danger/5', texto: `Hay ${errores} fila(s) con error: no se puede importar todavía.` }
        : { tono: 'border-success/40 bg-success/6', texto: `${informe.total} fila(s) listas para importar.` }

  return (
    <Modal
      abierto
      ancho="xl"
      onCerrar={onCerrar}
      titulo="Importar inventario desde Excel"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            {cargado ? 'Cerrar' : 'Cancelar'}
          </Button>
          {informe && errores > 0 ? (
            <Button disabled title="Corregí los errores en el Excel antes de subir">
              ✖ No se puede importar
            </Button>
          ) : informe ? (
            <Button disabled={ocupado || faltaMirar} onClick={() => void importar()}>
              {cargar.isPending ? 'Importando…' : avisado ? 'Sí, importar de todas formas' : '↑ Subir archivo'}
            </Button>
          ) : null}
        </>
      }
    >
      <input
        ref={entrada}
        type="file"
        accept=".csv,.xlsx,text/csv"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void elegir(f)
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => descargarPlantilla('plantilla-articulos.xlsx', 'artículos', columnas)}>
          ↓ Plantilla
        </Button>
        <Button disabled={ocupado} onClick={() => entrada.current?.click()}>
          {archivo ? 'Elegir otro archivo' : 'Elegir archivo'}
        </Button>
        {archivo ? <span className="text-ink/60 text-sm">{archivo}</span> : null}
        <Link to="/app/inventario/articulos/carga" className="text-royal-600 dark:text-royal-300 text-sm underline sm:ml-auto">
          Corregir fila por fila en la carga completa
        </Link>
      </div>

      {/* ------------------------------------------ tarjeta de estado */}
      <div className={cn('rounded-card mt-4 border px-4 py-3', estadoGrande.tono)}>
        <p className="text-ink/85 font-medium">{revisar.isPending ? 'Revisando cada fila con la base…' : estadoGrande.texto}</p>
        {informe ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cifra label="Total filas" valor={informe.total} />
            <Cifra label="Válidas" valor={informe.nuevos} tono="text-success" />
            <Cifra label="Ya existen / duplicadas" valor={duplicadas} tono="text-info" />
            <Cifra label="Con error" valor={errores} tono={errores > 0 ? 'text-danger' : undefined} />
          </div>
        ) : null}
      </div>

      {errorLectura ? <p className="text-danger mt-3 text-sm">{errorLectura}</p> : null}
      {avisoColumnas ? <p className="text-warning mt-3 text-sm">{avisoColumnas}</p> : null}
      {revisar.error ? <ErrorDeCarga error={revisar.error} className="mt-3" /> : null}
      {cargar.error ? <ErrorDeCarga error={cargar.error} className="mt-3" /> : null}

      {informe && duplicadas > 0 ? (
        <div className="mt-3 space-y-2">
          <label className="text-ink/80 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
              checked={actualizar}
              onChange={(e) => {
                setActualizar(e.target.checked)
                setAvisado(false)
              }}
            />
            <span>
              <strong>Actualizar precio y stock de los que ya existen</strong>
              <span className="text-ink/50 block text-xs">
                Se cotejan por código. Las columnas en blanco no se tocan. Desmarcada, esas filas no se suben.
              </span>
            </span>
          </label>
          {avisado ? (
            <p className="border-warning/40 bg-warning-soft text-ink/80 rounded-control border px-3 py-2 text-sm">
              ⚠ Hay materiales que ya existen en el catálogo ({duplicadas}).{' '}
              {actualizar
                ? 'Se van a actualizar con lo que dice el Excel.'
                : 'No se van a subir: solo entran las filas nuevas.'}{' '}
              Si está bien, tocá «Sí, importar de todas formas».
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Lo que hay que decir que se miró, igual que en la carga completa. */}
      {informe && errores === 0 && (informe.avisos_de_costo ?? 0) > 0 ? (
        <Casilla marcada={costosVistos} onCambio={setCostosVistos}>
          Revisé los costos marcados abajo ({informe.avisos_de_costo}): el primer costo de un artículo es la referencia de
          los siguientes.
        </Casilla>
      ) : null}
      {informe && errores === 0 && (informe.avisos_de_parecido ?? 0) > 0 ? (
        <Casilla marcada={parecidosVistos} onCambio={setParecidosVistos}>
          Revisé los artículos nuevos que se parecen a uno del catálogo ({informe.avisos_de_parecido}).
        </Casilla>
      ) : null}
      {soloCatalogo ? (
        <Casilla marcada={soloCatalogoVisto} onCambio={setSoloCatalogoVisto}>
          Entendido: esta planilla solo carga el catálogo, sin existencia. Para cargar existencias, llená almacén,
          cantidad, costo y moneda.
        </Casilla>
      ) : null}

      {porColumna.size > 0 ? (
        <div className="mt-4">
          <p className="text-ink/80 text-sm font-medium">Errores por columna</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[...porColumna.entries()].map(([c, n]) => (
              <Chip key={c} tone="danger">
                {c}: {n}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------ detalle de filas */}
      {informe ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ink/80 mr-2 text-sm font-medium">Detalle de filas</p>
            {(
              [
                ['', 'Todas'],
                ['NUEVO', 'Válidas'],
                ['ACTUALIZA', 'Duplicadas'],
                ['ERROR', 'Con error'],
              ] as [FiltroDeFilas, string][]
            ).map(([v, t]) => (
              <button
                key={v || 'todas'}
                type="button"
                onClick={() => setFiltro(v)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  filtro === v ? 'border-royal-600 bg-royal-600/10 text-royal-700 dark:text-royal-300' : 'border-ink/15 text-ink/65',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="py-2 pr-3 font-medium">Fila</th>
                  <th className="py-2 pr-3 font-medium">SKU</th>
                  <th className="py-2 pr-3 font-medium">Nombre</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-ink/55 py-3 text-center">
                      Sin filas para este filtro.
                    </td>
                  </tr>
                ) : (
                  visibles.map((f) => {
                    const e = ESTADO[f.estado] ?? ESTADO.ERROR
                    return (
                      <tr key={f.fila} className={cn('border-hairline border-b last:border-0', f.estado === 'ERROR' && 'bg-danger/4')}>
                        <td className="tabular text-ink/50 py-2 pr-3">{f.fila}</td>
                        <td className="text-ink/70 py-2 pr-3 font-mono text-xs">
                          {f.codigo || (f.estado === 'NUEVO' ? '(se le pone uno)' : '—')}
                        </td>
                        <td className="py-2 pr-3">{f.nombre}</td>
                        <td className="py-2 pr-3">
                          <Chip tone={e.tono}>{e.texto}</Chip>
                        </td>
                        <td className={cn('py-2 text-xs', f.motivo ? 'text-danger' : 'text-ink/60')}>
                          {f.motivo ?? f.aviso ?? (f.estado === 'ACTUALIZA' && !actualizar ? 'No se sube' : '')}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {cargado ? (
        <p className="text-ink/60 mt-4 text-sm">
          {enteros(cargado.nuevos)} nuevo(s) y {enteros(cargado.actualizados)} actualizado(s). Ya se ven en el inventario.
        </p>
      ) : null}
    </Modal>
  )
}

function Cifra({ label, valor, tono }: { label: string; valor: number; tono?: string }) {
  return (
    <div className="bg-surface border-hairline rounded-control border px-3 py-2">
      <p className="text-ink/50 text-xs">{label}</p>
      <p className={cn('tabular text-xl font-semibold', tono ?? 'text-ink/90')}>{enteros(valor)}</p>
    </div>
  )
}

function Casilla({
  marcada,
  onCambio,
  children,
}: {
  marcada: boolean
  onCambio: (v: boolean) => void
  children: ReactNode
}) {
  return (
    <label
      className={cn(
        'mt-3 flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm',
        marcada ? 'border-hairline' : 'border-warning/30 bg-warning-soft',
      )}
    >
      <input
        type="checkbox"
        className="accent-royal-600 mt-0.5 size-4 shrink-0"
        checked={marcada}
        onChange={(e) => onCambio(e.target.checked)}
      />
      <span className="text-ink/80">{children}</span>
    </label>
  )
}
