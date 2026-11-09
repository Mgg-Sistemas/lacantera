import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { Interruptor } from '@/components/ui/Interruptor'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { useDesactivarTanque, useGuardarTanque } from '@/lib/api/combustible'
import { capacidadCalculada } from '@/lib/combustible/cubicacion'
import { MARGEN_MERMA_DEFECTO, MERMA_IMPLICITA_DEFECTO } from '@/lib/combustible/merma'
import { n, nulo, type CatalogoCombustible, type TanqueGt, type TipoGeometria } from '@/lib/combustible/tipos'
import { leerNumero, lt } from './comun'
import { Calculado } from './piezas'

/*
  NUEVO TANQUE / EDITAR TANQUE (Golden Touch, TanqueModal).

  La geometría (cilíndrico horizontal o rectangular) con sus medidas, la
  capacidad rotulada —el tope que cuida el libro— y la calculada por fórmula,
  la ubicación y los dos márgenes de merma.

  Diferencias con Golden Touch, a propósito:
  · «🗑 Eliminar tanque» es «Desactivar»: un tanque con historia no se borra, y
    con litros no se desactiva (la base lo dice).
  · Sin «Saldo inicial» ni «Tasa»: aquí el saldo y la tasa salen del libro. Un
    tanque nuevo arranca en cero y se carga con una entrada, con su costo; la
    tasa no se escribe a mano.
  · Lo de La Cantera: bidón (salida directa, sin saldo), si recibe las compras y
    si es del combustible sin costo (CMB-INI). Este último no cambia con
    historia: mezclaría combustible pagado con el que no costó nada.
*/
export function TanqueModal({
  tanque,
  catalogos,
  onCerrar,
}: {
  tanque: TanqueGt | null
  catalogos: CatalogoCombustible[]
  onCerrar: () => void
}) {
  const editando = !!tanque
  const guardar = useGuardarTanque()
  const desactivar = useDesactivarTanque()
  const [nombre, setNombre] = useState(tanque?.nombre ?? '')
  const [codigo, setCodigo] = useState(tanque?.codigo ?? '')
  const [tipo, setTipo] = useState<TipoGeometria>(tanque?.tipo_geometria ?? 'rectangular')
  const [esMovil, setEsMovil] = useState(!!tanque?.es_movil)
  const [esBidon, setEsBidon] = useState(!!tanque?.es_bidon)
  const s = (v: unknown) => (nulo(v as string) == null ? '' : String(nulo(v as string)))
  const [radio, setRadio] = useState(s(tanque?.radio_m))
  const [largo, setLargo] = useState(s(tanque?.largo_m))
  const [ancho, setAncho] = useState(s(tanque?.ancho_m))
  const [alto, setAlto] = useState(s(tanque?.alto_m))
  const [capacidad, setCapacidad] = useState(s(tanque?.capacidad_litros))
  const [ubicacion, setUbicacion] = useState(tanque?.ubicacion ?? '')
  const [margen, setMargen] = useState(String(tanque ? n(tanque.margen_merma_pct) : MARGEN_MERMA_DEFECTO))
  const [implicita, setImplicita] = useState(String(tanque ? n(tanque.merma_implicita_pct) : MERMA_IMPLICITA_DEFECTO))
  const [orden, setOrden] = useState(tanque ? String(tanque.orden) : '')
  const [recibeCompras, setRecibeCompras] = useState(!!tanque?.recibe_compras)
  const [sinCosto, setSinCosto] = useState(!!tanque?.sin_costo)

  const capCalc = capacidadCalculada({
    tipo_geometria: tipo,
    radio_m: leerNumero(radio),
    largo_m: leerNumero(largo),
    ancho_m: leerNumero(ancho),
    alto_m: leerNumero(alto),
  })

  const m = leerNumero(margen)
  const mi = leerNumero(implicita)
  const errMargen = m != null && !(m >= 0 && m <= 100) ? 'El margen de merma va de 0 a 100 %.' : undefined
  const errImplicita = mi != null && !(mi >= 0 && mi <= 100) ? 'La merma implícita va de 0 a 100 %.' : undefined
  const valido = nombre.trim().length >= 2 && !errMargen && !errImplicita

  const enviar = () =>
    guardar.mutate(
      {
        almacen_id: tanque?.almacen_id ?? null,
        nombre: nombre.trim(),
        codigo: codigo.trim() || null,
        ubicacion: ubicacion.trim() || null,
        capacidad: leerNumero(capacidad),
        tipo_geometria: tipo,
        es_movil: esMovil,
        es_bidon: esBidon,
        radio_m: tipo === 'cilindrico_horizontal' ? leerNumero(radio) : null,
        largo_m: leerNumero(largo),
        ancho_m: tipo === 'rectangular' ? leerNumero(ancho) : null,
        alto_m: tipo === 'rectangular' ? leerNumero(alto) : null,
        margen_merma_pct: m ?? MARGEN_MERMA_DEFECTO,
        merma_implicita_pct: mi ?? MERMA_IMPLICITA_DEFECTO,
        orden: leerNumero(orden),
        recibe_compras: recibeCompras,
        sin_costo: sinCosto,
      },
      { onSuccess: onCerrar },
    )

  const ubicaciones = catalogos.filter((c) => c.tipo === 'ubicacion' && c.activo)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={editando ? `Editar ${tanque?.nombre}` : 'Nuevo tanque'}
      ancho="md"
      acciones={
        <>
          {editando && tanque ? (
            <Button
              variant={tanque.activo ? 'ghost' : 'outline'}
              className={tanque.activo ? 'text-danger sm:mr-auto' : 'sm:mr-auto'}
              disabled={desactivar.isPending || guardar.isPending}
              title={tanque.activo ? 'Un tanque con historia no se borra: se desactiva. Con litros no se puede.' : undefined}
              onClick={() =>
                desactivar.mutate({ almacen_id: tanque.almacen_id, activo: !tanque.activo }, { onSuccess: onCerrar })
              }
            >
              {desactivar.isPending ? 'Guardando…' : tanque.activo ? 'Desactivar' : 'Volver a activar'}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onCerrar} disabled={guardar.isPending}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={!valido || guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear tanque'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="TANQUE #4" />
        <Input
          label="Código"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="CMB-T04"
          hint={editando ? undefined : 'Si lo dejás vacío, el sistema le pone uno.'}
        />
        <Select
          label="Tipo (para la cubicación)"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoGeometria)}
          opciones={[
            { valor: 'cilindrico_horizontal', etiqueta: 'Cilíndrico horizontal (acostado)' },
            { valor: 'rectangular', etiqueta: 'Rectangular / prismático' },
          ]}
        />
        <Input
          label="Orden en la grilla"
          type="number"
          inputMode="numeric"
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Interruptor encendido={esMovil} onCambio={setEsMovil} etiqueta="🚚 Tanque móvil" detalle="Camión de lubricación o cisterna." />
        <Interruptor
          encendido={esBidon}
          onCambio={setEsBidon}
          etiqueta="🪣 Bidón"
          detalle="Salida directa: lo que se le pasa se da por usado, no guarda saldo."
        />
        <Interruptor encendido={recibeCompras} onCambio={setRecibeCompras} etiqueta="Recibe las compras" detalle="Las compras de combustible entran aquí." />
        <Interruptor
          encendido={sinCosto}
          onCambio={setSinCosto}
          etiqueta="Combustible sin costo"
          detalle="Solo entra lo que no costó nada. No cambia si el tanque ya tiene historia."
        />
      </div>

      {tipo === 'cilindrico_horizontal' ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="Radio R (m)" type="number" inputMode="decimal" value={radio} onChange={(e) => setRadio(e.target.value)} placeholder="1.1875" />
          <Input label="Largo L (m)" type="number" inputMode="decimal" value={largo} onChange={(e) => setLargo(e.target.value)} placeholder="8.17" />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Input label="Largo (m)" type="number" inputMode="decimal" value={largo} onChange={(e) => setLargo(e.target.value)} placeholder="1.99" />
          <Input label="Ancho (m)" type="number" inputMode="decimal" value={ancho} onChange={(e) => setAncho(e.target.value)} placeholder="0.99" />
          <Input
            label="Alto / altura total (m)"
            type="number"
            inputMode="decimal"
            value={alto}
            onChange={(e) => setAlto(e.target.value)}
            placeholder="0.99"
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Capacidad rotulada (L)"
          type="number"
          inputMode="decimal"
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          placeholder="35000"
          hint="Tope operativo (el del rótulo físico)."
        />
        <Calculado label="Capacidad calculada (L)" valor={capCalc > 0 ? lt(capCalc) : ''} pista="Por fórmula, a la altura total." />
        <div className="sm:col-span-2">
          <Input
            label="Ubicación"
            list="combustible-ubicaciones"
            value={ubicacion}
            onChange={(e) => setUbicacion(e.target.value)}
            placeholder="PATIO PRINCIPAL"
          />
          <datalist id="combustible-ubicaciones">
            {ubicaciones.map((c) => (
              <option key={c.id} value={c.valor} />
            ))}
          </datalist>
        </div>
        <Input
          label="Margen de merma al recibir (%)"
          type="number"
          inputMode="decimal"
          value={margen}
          onChange={(e) => setMargen(e.target.value)}
          error={errMargen}
          hint="En una entrada o un traslado a este tanque, si llega menos de lo enviado la diferencia es merma. Hasta este % se guarda normal; más, pide motivo y permiso."
        />
        <Input
          label="Merma implícita sugerida por movimiento (%)"
          type="number"
          inputMode="decimal"
          value={implicita}
          onChange={(e) => setImplicita(e.target.value)}
          error={errImplicita}
          hint="Porcentaje técnico sugerido al registrar una merma en este tanque (por defecto 0,5 %)."
        />
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-4" /> : null}
      {desactivar.error ? <ErrorDeCarga error={desactivar.error} className="mt-4" /> : null}
    </Modal>
  )
}
