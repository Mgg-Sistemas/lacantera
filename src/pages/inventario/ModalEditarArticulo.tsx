import { useMemo, useState } from 'react'
import { ParecidosAEste } from '@/components/ParecidosAEste'
import { ConversionDeCantidad } from '@/components/ConversionDeCantidad'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { OtrasPresentaciones } from '@/components/OtrasPresentaciones'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  MODOS_ENTREGA,
  opcionesDeCategoria,
  useArticulos,
  useArticulosParecidos,
  useCategoriasDeInventario,
  useRenumerarArticulo,
  useEditarArticulo,
  usePresentacionesDeArticulo,
  usePresentaciones,
  useUnidades,
} from '@/lib/api/catalogo'
import type { Articulo } from '@/lib/api/catalogo'
import { useMovimientos } from '@/lib/api/inventario'
import { fecha } from '@/lib/formato'
import { densidadEnPalabras, densidadLegible } from '@/lib/medidas'

/**
 * Corregir un artículo que ya existe, en cualquier pantalla desde la que haga
 * falta — nace en Catálogo, y desde el 28/10/2026 también se abre, solo para
 * ADMIN, desde Existencias: Christopher, con SAL cargada como INSUMO en vez
 * de VÍVERES: «tengo varios artículos que fueron cargados con mala categoría
 * o mal el nombre».
 *
 * Es el mismo formulario y la misma RPC que ya usaba Catálogo —`editar_articulo`
 * no distingue quién lo llama—: un segundo formulario reimplementando las mismas
 * reglas (el homónimo, la densidad, el código que ya no cuadra con la
 * categoría…) se habría desincronizado de la primera la próxima vez que
 * cualquiera de las dos cambiara. Crear un artículo nuevo sigue siendo solo de
 * Catálogo: esta ventana no nace nunca vacía.
 */
export function ModalEditarArticulo({
  articulo,
  onCerrar,
}: {
  articulo: Articulo
  onCerrar: () => void
}) {
  const { data: todos } = useArticulos(false)
  const { data: unidades } = useUnidades()
  const { data: presentaciones } = usePresentaciones()
  const marcasUsadas = useMemo(
    () =>
      [...new Set((todos ?? []).map((a) => a.marca).filter((m): m is string => !!m))].sort(
        (x, y) => x.localeCompare(y, 'es'),
      ),
    [todos],
  )
  const editar = useEditarArticulo()
  const categorias = useCategoriasDeInventario()
  const opcionesCategoria = opcionesDeCategoria(categorias.data)
  const prefijoDeCategoria = (codigo: string) =>
    (categorias.data ?? []).find((c) => c.codigo === codigo)?.prefijo
  const renumerar = useRenumerarArticulo()

  const [form, setForm] = useState({
    id: articulo.id,
    confirmado: false,
    codigo: articulo.codigo,
    nombre: articulo.nombre,
    categoria: articulo.categoria,
    unidad: articulo.unidad,
    descripcion: articulo.descripcion ?? '',
    inventariable: articulo.inventariable,
    reparable: articulo.reparable,
    stock_minimo: String(articulo.stock_minimo),
    modo_entrega: articulo.modo_entrega,
    presentacion: articulo.presentacion ?? '',
    unidades_por_presentacion:
      articulo.unidades_por_presentacion == null ? '' : String(Number(articulo.unidades_por_presentacion)),
    marca: articulo.marca ?? '',
    numero_parte: articulo.numero_parte ?? '',
    densidad_ton_m3: articulo.densidad_ton_m3 == null ? '' : String(Number(articulo.densidad_ton_m3)),
    motivo_densidad: '',
  })

  // La unidad y la densidad con las que estaba guardado ANTES de abrir este
  // formulario: `articulo` no cambia mientras la ventana está abierta, así que
  // sirven de referencia fija para los avisos de abajo.
  const unidadDeAntes = articulo.unidad
  const densidadDeAntes = articulo.densidad_ton_m3 ?? null
  const pideDensidad = form.unidad === 'M3' || form.unidad === 'TON'
  const densidadEscrita = Number(form.densidad_ton_m3)
  const cambiaDensidad =
    densidadDeAntes !== null && densidadEscrita > 0 && densidadEscrita !== Number(densidadDeAntes)
  const movimientosDelArticulo = useMovimientos({ articuloId: articulo.id }, true)
  const seHaMovido = (movimientosDelArticulo.data?.length ?? 0) > 0

  const { data: yaDeclaradas } = usePresentacionesDeArticulo(form.id)
  const laDeDefecto = (yaDeclaradas ?? []).find((x) => x.activa && x.por_defecto)

  const parecidos = useArticulosParecidos(form.nombre, form.id, form.categoria)
  const hayHomonimo = (parecidos.data ?? []).some((p) => p.es_el_mismo)

  const desencaja =
    !!form.codigo &&
    !!prefijoDeCategoria(form.categoria) &&
    form.codigo.split('-')[0] !== prefijoDeCategoria(form.categoria)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={`Corregir ${form.codigo}`}
      descripcion="El código no se cambia."
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={
              editar.isPending ||
              !form.nombre ||
              (hayHomonimo && !form.confirmado) ||
              (pideDensidad && !(densidadEscrita > 0)) ||
              (cambiaDensidad && form.motivo_densidad.trim().length < 10)
            }
            onClick={async () => {
              await editar.mutateAsync({
                ...form,
                stock_minimo: Number(form.stock_minimo) || 0,
                presentacion: laDeDefecto ? laDeDefecto.presentacion : form.presentacion || null,
                marca: form.marca.trim() || null,
                numero_parte: form.numero_parte.trim() || null,
                unidades_por_presentacion: laDeDefecto
                  ? Number(laDeDefecto.unidades)
                  : form.presentacion && Number(form.unidades_por_presentacion) > 0
                    ? Number(form.unidades_por_presentacion)
                    : null,
                densidad_ton_m3: Number(form.densidad_ton_m3) > 0 ? Number(form.densidad_ton_m3) : null,
                motivo_densidad: cambiaDensidad ? form.motivo_densidad.trim() : null,
              })
              onCerrar()
            }}
          >
            {editar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Código" disabled hint="No se cambia." value={form.codigo} />
        <div>
          <Input
            label="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value, confirmado: false })}
          />
          <ParecidosAEste
            nombre={form.nombre}
            excluir={form.id}
            categoria={form.categoria}
            confirmado={form.confirmado}
            onConfirmar={(v) => setForm((f) => ({ ...f, confirmado: v }))}
          />
        </div>
        <Select
          label="Categoría"
          value={form.categoria}
          onChange={(e) =>
            setForm({
              ...form,
              categoria: e.target.value,
              inventariable: e.target.value !== 'SERVICIO',
              reparable: ['HERRAMIENTA', 'REPUESTO'].includes(e.target.value),
            })
          }
          opciones={opcionesCategoria}
        />
        {desencaja ? (
          <div className="border-hairline rounded-card bg-canvas border border-dashed p-3 sm:col-span-2">
            <p className="text-ink/60 text-xs leading-relaxed">
              El código empieza por <span className="text-ink/85">{form.codigo.split('-')[0]}</span> y
              la categoría ya es otra. Se puede corregir mientras no figure en ningún papel.
            </p>
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              disabled={renumerar.isPending}
              onClick={async () => {
                const nuevo = await renumerar.mutateAsync(form.id)
                setForm({ ...form, codigo: nuevo })
              }}
            >
              {renumerar.isPending ? 'Renumerando…' : 'Ponerle el código que le toca'}
            </Button>
            {renumerar.error ? <ErrorDeCarga error={renumerar.error} className="mt-2" /> : null}
          </div>
        ) : null}
        <Select
          label="Unidad"
          value={form.unidad}
          onChange={(e) => setForm({ ...form, unidad: e.target.value })}
          opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: u.nombre }))}
        />

        {pideDensidad ? (
          <div>
            <Input
              label="Densidad, en toneladas por metro cúbico"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              hint={
                densidadEnPalabras(form.densidad_ton_m3) ??
                `Obligatoria: sin ella no se puede expresar en ${form.unidad === 'M3' ? 'toneladas' : 'metros cúbicos'}.`
              }
              value={form.densidad_ton_m3}
              onChange={(e) => setForm({ ...form, densidad_ton_m3: e.target.value })}
            />
            {articulo.densidad_cambiada_en ? (
              <p className="text-ink/45 mt-1 text-xs">
                Se puso o cambió el {fecha(articulo.densidad_cambiada_en)}
                {articulo.densidad_motivo ? `: «${articulo.densidad_motivo}»` : ''}.
              </p>
            ) : null}
          </div>
        ) : null}

        {cambiaDensidad ? (
          <div className="sm:col-span-2">
            <Textarea
              label="Motivo"
              rows={2}
              value={form.motivo_densidad}
              onChange={(e) => setForm({ ...form, motivo_densidad: e.target.value })}
              hint={`Era ${densidadLegible(densidadDeAntes ?? 0)} t/m³. Cambiarla cambia la conversión de todo lo que se imprima desde ahora, también de papeles viejos. Queda con su nombre y la fecha; al menos diez letras.`}
            />
          </div>
        ) : null}

        {form.unidad !== unidadDeAntes && seHaMovido ? (
          <p className="text-warning -mt-2 text-xs leading-relaxed sm:col-span-2">
            Atención: ya tiene movimientos anotados en {unidadDeAntes}. Esas cantidades seguirán
            diciendo el número que se escribió, así que la existencia quedará sumando {unidadDeAntes}{' '}
            con {form.unidad}.
          </p>
        ) : null}
        <div>
          <Input
            label="Existencia mínima"
            type="number"
            min="0"
            step="0.01"
            hint="Cero significa que no se controla."
            value={form.stock_minimo}
            onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
          />
          <ConversionDeCantidad
            cantidad={form.stock_minimo}
            unidad={form.unidad}
            densidad={form.densidad_ton_m3}
          />
        </div>

        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <Select
            label="Presentación"
            vacio="Suelto, sin empaque"
            disabled={Boolean(laDeDefecto)}
            hint={laDeDefecto ? 'Las formas de contarlo se llevan abajo, en «Otras formas de contarlo».' : undefined}
            value={laDeDefecto ? laDeDefecto.presentacion : form.presentacion}
            onChange={(e) =>
              setForm({
                ...form,
                presentacion: e.target.value,
                unidades_por_presentacion: e.target.value ? form.unidades_por_presentacion : '',
              })
            }
            opciones={(presentaciones ?? []).map((p) => ({ valor: p.codigo, etiqueta: p.nombre }))}
          />
          <Input
            label="Unidades por presentación"
            type="number"
            min="0"
            step="0.0001"
            inputMode="decimal"
            disabled={Boolean(laDeDefecto) || !form.presentacion}
            hint={laDeDefecto ? 'Se corrige abajo, en «Otras formas de contarlo».' : undefined}
            value={laDeDefecto ? String(Number(laDeDefecto.unidades)) : form.unidades_por_presentacion}
            onChange={(e) => setForm({ ...form, unidades_por_presentacion: e.target.value })}
          />
        </div>

        <div className="sm:col-span-2">
          <OtrasPresentaciones articuloId={form.id} unidad={articulo.unidad} />
        </div>

        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <Input
            label="Marca"
            list="marcas-usadas-editar"
            placeholder="Motul, Komatsu…"
            hint="Se ofrecen las que ya se han usado."
            value={form.marca}
            onChange={(e) => setForm({ ...form, marca: e.target.value })}
          />
          <datalist id="marcas-usadas-editar">
            {marcasUsadas.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Input
            label="N° de parte o serial"
            placeholder="La referencia del fabricante"
            value={form.numero_parte}
            onChange={(e) => setForm({ ...form, numero_parte: e.target.value })}
          />
        </div>

        <Select
          label="Modo de entrega"
          className="sm:col-span-2"
          hint={MODOS_ENTREGA.find((m) => m.valor === form.modo_entrega)?.ayuda}
          value={form.modo_entrega}
          onChange={(e) => setForm({ ...form, modo_entrega: e.target.value })}
          opciones={MODOS_ENTREGA.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
        />
      </div>

      <Textarea
        label="Descripción"
        className="mt-4"
        rows={2}
        value={form.descripcion}
        onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
      />

      <div className="mt-4">
        <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            className="accent-royal-600 size-4"
            disabled={form.categoria === 'SERVICIO'}
            checked={form.inventariable}
            onChange={(e) => setForm({ ...form, inventariable: e.target.checked })}
          />
          Lleva existencias
        </label>
        <p className="text-ink/50 mt-1 pl-6 text-xs">
          {form.categoria === 'SERVICIO'
            ? 'Un servicio no lleva existencias.'
            : 'Marcada, el sistema cuenta cuánto hay en cada almacén. Sin marcar, se compra y se vende igual, pero no recibe entradas, no se traslada y no se descuenta al despachar.'}
        </p>
      </div>

      <div className="mt-3">
        <label className="text-ink/75 flex cursor-pointer items-center gap-2 text-sm select-none">
          <input
            type="checkbox"
            className="accent-royal-600 size-4"
            disabled={!form.inventariable}
            checked={form.reparable}
            onChange={(e) => setForm({ ...form, reparable: e.target.checked })}
          />
          Se puede mandar al taller
        </label>
        <p className="text-ink/50 mt-1 pl-6 text-xs">
          Marcada, va al taller y vuelve arreglado. Sin marcar, se gasta y no se repara.
        </p>
      </div>

      {editar.error ? <ErrorDeCarga error={editar.error} className="mt-4" /> : null}
    </Modal>
  )
}
