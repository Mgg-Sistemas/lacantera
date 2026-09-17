import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ChipTasa } from '@/components/ChipTasa'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { SoltarArchivo } from '@/components/SoltarArchivo'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { CantidadDeArticulo, type CantidadCapturada } from '@/components/CantidadDeArticulo'
import { ParecidosAEste } from '@/components/ParecidosAEste'
import {
  CATEGORIAS_ARTICULO,
  CONDICIONES_PAGO,
  conSusFormas,
  useArticulos,
  useCrearArticulo,
  useTodasLasPresentaciones,
  useProveedores,
  useUnidades,
} from '@/lib/api/catalogo'
import { useAlmacenes } from '@/lib/api/inventario'
import { useComprarDirecto } from '@/lib/api/compras'
import { useMiFirma } from '@/lib/api/firmas'
import { useRecibirOrdenCompleta } from '@/lib/api/inventario'
import { useAdjuntarPapel } from '@/lib/api/papelesDeCompra'
import { useMonedasUsables, useTasaVigente, hoyEnCaracas } from '@/lib/api/tasas'
import { useAlicuotaIva } from '@/lib/api/empresa'
import { bolivares, dolares, tasa as fmtTasa } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  LA COMPRA QUE YA SE HIZO.

  «Colocan los materiales con los precios y cargan la factura, al darle
  aceptar, pueden editarla, y además darle recepción al inventario de una vez.»
  Así lo explicó la líder, y describe algo que no es un pedido: un pedido
  pregunta, y esto declara.

  POR QUÉ ES UNA PANTALLA Y NO UN BOTÓN EN EL PEDIDO

  El formulario del pedido no tiene precios, y no es un olvido: quien pide no
  sabe lo que cuesta. Aquí el precio es el dato central —viene impreso en la
  factura que la persona trae en la mano— y la pantalla se ordena alrededor de
  eso: proveedor, renglones con su precio, y el papel.

  UNA SOLA PASADA

  Todo lo que hace falta cabe en una pantalla porque la compra ya ocurrió: no
  hay que esperar cotizaciones ni que nadie apruebe. Se guarda, entra al
  almacén si se marca, y se le cuelga la factura. Los tres pasos que el camino
  normal separa por días aquí caben en un botón, que es exactamente lo que
  vuelve útil a esta pantalla.
*/

interface Fila {
  clave: number
  articulo_id: string
  descripcion: string
  cantidad: string
  unidad: string
  precio: string
  exento: boolean
  presentacion: string
  marca: string
  /**
   * Lo que se tecleó en la cantidad: los bultos y en qué presentación. Con
   * bultos, el precio que se escribe es el del bulto.
   */
  capturada: CantidadCapturada | null
  /** Para crearlo en el catálogo desde el renglón, si no está. */
  nueva_categoria: string
  nuevo_confirmado: boolean
}

let contador = 0
const filaVacia = (): Fila => ({
  clave: contador++,
  articulo_id: '',
  descripcion: '',
  cantidad: '',
  unidad: 'UND',
  precio: '',
  exento: false,
  presentacion: '',
  marca: '',
  capturada: null,
  nueva_categoria: '',
  nuevo_confirmado: false,
})

export function CompraDirecta() {
  const navigate = useNavigate()
  const { data: proveedores } = useProveedores()
  const { data: articulos } = useArticulos()
  // Las formas de contar de todo el catalogo, de un tiron: quince renglones no
  // pueden ser quince consultas para leer quince filas.
  const { data: formasDeContar } = useTodasLasPresentaciones()
  const { data: unidades } = useUnidades()
  const { data: almacenes } = useAlmacenes()
  const { data: monedas } = useMonedasUsables()
  const { data: tasaVigente } = useTasaVigente()
  const alicuotaVigente = useAlicuotaIva()

  const comprar = useComprarDirecto()
  const crearArticulo = useCrearArticulo()
  const adjuntar = useAdjuntarPapel()
  const recibir = useRecibirOrdenCompleta()

  const [titulo, setTitulo] = useState('')
  const [proveedorId, setProveedorId] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [fecha, setFecha] = useState(hoyEnCaracas())
  const [moneda, setMoneda] = useState('USD')
  const [condicionPago, setCondicionPago] = useState('CONTADO')
  const [alicuota, setAlicuota] = useState(String(alicuotaVigente))
  const [descuento, setDescuento] = useState('0')
  const [flete, setFlete] = useState('0')
  const [observacion, setObservacion] = useState('')
  const [almacen, setAlmacen] = useState('')
  /*
    En la compra directa pide y autoriza la misma persona, así que su firma va
    en las dos rayas de la orden o en ninguna. Marcada de entrada: la compra ya
    está autorizada por quien la carga.
  */
  const { data: miFirma } = useMiFirma()
  const [conMiFirma, setConMiFirma] = useState(true)
  const [recibirYa, setRecibirYa] = useState(true)
  const [factura, setFactura] = useState<File | null>(null)
  const [filas, setFilas] = useState<Fila[]>([filaVacia()])
  const [avisoPapel, setAvisoPapel] = useState<string | null>(null)

  const cambiar = (clave: number, c: Partial<Fila>) =>
    setFilas((f) => f.map((x) => (x.clave === clave ? { ...x, ...c } : x)))

  // Elegir del catálogo rellena lo que el catálogo ya sabe. Se sigue pudiendo
  // escribir a mano: en una compra de pueblo lo que se trae no siempre está
  // dado de alta, y obligar a crearlo antes pararía la carga.
  const elegirArticulo = (clave: number, id: string) => {
    const a = articulos?.find((x) => String(x.id) === id)
    cambiar(clave, {
      articulo_id: id,
      descripcion: a ? a.nombre : '',
      unidad: a ? a.unidad : 'UND',
      // La presentación la dice la cantidad cuando se cuenta en bultos.
      presentacion: '',
      capturada: null,
      marca: a?.marca ?? '',
    })
  }

  /*
    LA UNIDAD, LA PRESENTACIÓN Y EL PRECIO SON DEL ARTÍCULO.

    Christopher, 17/09/2026: «si algo tiene presentación, una bolsa de clavos, y
    por unidad compra 5 clavos, ¿cuántos clavos traía la presentación? Si el
    producto ya está en el catálogo, ¿por qué permite comprar otras unidades o
    presentaciones que no están asociadas a ese producto? ¿Qué ocurre si se va a
    comprar por presentación y no por unidad?».

    Ocurría esto: la unidad y la presentación eran dos listas con todo lo que
    existe, sueltas del artículo, y el precio se tomaba siempre por unidad. Tres
    bolsas de clavos a 10 $ la bolsa entraban como 300 clavos a 10 $ cada uno.

    Ahora, con artículo: la unidad es la suya y no se elige; la presentación se
    elige en la cantidad, solo entre las que el catálogo le declara —y es el
    catálogo el que dice cuántos clavos trae la bolsa—; y si se cuenta en bultos
    el precio que se escribe es el del bulto, que es el que trae la factura, y
    se guarda dividido entre lo que trae cada uno. Sin artículo es un servicio y
    no hay bulto ni presentación.
  */
  const articuloDe = (f: Fila) =>
    conSusFormas(
      articulos?.find((a) => String(a.id) === f.articulo_id),
      formasDeContar,
    )

  /** Cuántas unidades trae el bulto en que se contó; nulo si no se contó en bultos. */
  const porBultoDe = (f: Fila): number | null => {
    const nombre = f.capturada?.presentaciones ? f.capturada.unidad : null
    const a = articuloDe(f)
    if (!nombre || !a) return null
    const lista = 'presentaciones' in a ? a.presentaciones : null
    const n =
      lista?.find((p) => p.presentacion === nombre)?.unidades ??
      (a.presentacion === nombre ? a.unidades_por_presentacion : null)
    return Number(n) > 0 ? Number(n) : null
  }

  /** El precio de una unidad del artículo, que es el que se guarda. */
  const precioUnitarioDe = (f: Fila) => {
    const precio = Number(f.precio || 0)
    const porBulto = porBultoDe(f)
    return porBulto ? precio / porBulto : precio
  }

  // Espejo del cálculo de la base. El que vale es el de Postgres; este existe
  // para que quien carga vea el total antes de guardar, que es como se cotejan
  // las cifras contra la factura que tiene delante.
  const totales = useMemo(() => {
    let subtotal = 0
    let gravado = 0
    for (const f of filas) {
      const linea = Number(f.cantidad || 0) * precioUnitarioDe(f)
      if (!Number.isFinite(linea)) continue
      subtotal += linea
      if (!f.exento) gravado += linea
    }
    const desc = Number(descuento || 0)
    const flt = Number(flete || 0)
    const base = (subtotal > 0 ? Math.max(gravado - desc * (gravado / subtotal), 0) : 0) + flt
    const iva = (base * Number(alicuota || 0)) / 100
    return { subtotal, base, iva, total: subtotal - desc + flt + iva }
  }, [filas, descuento, flete, alicuota])

  const listas = filas.filter(
    (f) => f.descripcion.trim() && Number(f.cantidad) > 0 && f.precio !== '',
  )

  /*
    RECIBIR EXIGE LA FACTURA, y no es un capricho de esta pantalla.

    `registrar_recepcion` se niega a dejar entrar material sin factura o nota de
    entrega colgada: «sin el papel del proveedor el material no entra». Es una
    regla del sistema, no de aquí.

    En una compra directa eso no estorba, al contrario: quien la carga tiene la
    factura en la mano — es de donde está copiando los precios—. Pedirla antes
    de recibir es pedirle lo que ya trae.
  */
  const quiereRecibir = recibirYa && !!almacen
  const faltaLaFactura = quiereRecibir && !factura

  const enVuelo = comprar.isPending || adjuntar.isPending || recibir.isPending
  const puedeGuardar =
    !!proveedorId &&
    titulo.trim().length >= 3 &&
    listas.length > 0 &&
    !faltaLaFactura &&
    !enVuelo

  const guardar = async () => {
    setAvisoPapel(null)

    const ordenId = await comprar.mutateAsync({
      proveedor_id: Number(proveedorId),
      moneda,
      titulo,
      numero_factura: numeroFactura || null,
      fecha,
      condicion_pago: condicionPago,
      alicuota_iva: Number(alicuota) || 0,
      descuento: Number(descuento) || 0,
      flete: Number(flete) || 0,
      observacion,
      destino_almacen_id: almacen ? Number(almacen) : null,
      con_firma: miFirma?.usar === true && conMiFirma,
      renglones: listas.map((f) => ({
        articulo_id: f.articulo_id ? Number(f.articulo_id) : null,
        descripcion: f.descripcion.trim(),
        cantidad: Number(f.cantidad),
        // Con artículo, su unidad: es la que el inventario cuenta.
        unidad: articuloDe(f)?.unidad ?? f.unidad,
        precio_unitario: Math.round(precioUnitarioDe(f) * 1e6) / 1e6,
        exento_iva: f.exento,
        marca: f.marca || null,
        // En qué vino, si se contó en bultos. Sin artículo no hay bulto.
        presentacion: f.articulo_id ? (f.capturada?.unidad ?? null) : null,
      })),
    })

    /*
      LOS TRES PASOS, EN ESTE ORDEN Y NO EN OTRO.

      Los papeles cuelgan de la orden y la orden nace al guardar, así que la
      factura no puede ir antes. Y la recepción no puede ir antes de la
      factura, porque `registrar_recepcion` la exige.

      CADA PASO QUE FALLA SE DICE Y NO SE DESHACE. La compra ya está hecha:
      fingir que no lo está sería peor que un aviso. Lo que se hace es decir
      exactamente hasta dónde se llegó y dónde se termina a mano.
    */
    if (factura && ordenId) {
      try {
        await adjuntar.mutateAsync({ orden_id: ordenId, tipo: 'FACTURA', archivo: factura })
      } catch {
        setAvisoPapel(
          'La compra quedó guardada, pero la factura no se pudo subir, así que el material no entró al almacén. Sube la factura desde la compra, en «Papeles», y recíbela desde ahí.',
        )
        return
      }
    }

    if (quiereRecibir && ordenId) {
      try {
        // Entera, y la lista la arma la base: los ids de los renglones acaban
        // de nacer ahí dentro y no hay nada que elegir — el material ya está.
        await recibir.mutateAsync({
          orden_id: ordenId,
          almacen_id: Number(almacen),
          fecha,
          nota: 'Compra directa',
        })
      } catch (e) {
        setAvisoPapel(
          `La compra y su factura quedaron guardadas, pero el material no entró al almacén: ${
            e instanceof Error ? e.message : 'falló la recepción'
          } Recíbela desde la compra.`,
        )
        return
      }
    }

    /*
      Al tablero y no a la orden: `comprar_directo` devuelve el id de la ORDEN,
      y el detalle de compras se abre por el id del PEDIDO. Mandar ahi el de la
      orden abriria otra compra o ninguna, que es peor que volver al tablero.
      Cuando haga falta llegar directo, la funcion tendra que devolver los dos.
    */
    void navigate('/app/compras')
  }

  const enDivisa = moneda !== 'VES'
  const formato = enDivisa ? dolares : bolivares

  return (
    <>
      <PageHeader
        title="Compra directa"
        description="Lo que ya se compró, con su factura. No pasa por cotizaciones ni por el gerente."
        actions={
          <>
            <ChipTasa className="self-center" />
            <Link to="/app/compras">
              <Button variant="outline" icon={<ArrowLeft />}>
                Volver al tablero
              </Button>
            </Link>
          </>
        }
      />

      <div className="max-w-3xl space-y-4">
        {!tasaVigente ? (
          <Card className="border-warning/30 bg-warning-soft">
            <p className="text-ink/80 text-sm">
              No hay tasa del BCV registrada. Sin ella no se puede valorar la compra.{' '}
              <Link to="/app/tasas" className="text-royal-600 dark:text-royal-300 font-medium underline">
                Registrar la tasa de hoy
              </Link>
            </p>
          </Card>
        ) : null}

        <Card className="space-y-4">
          <h3 className="text-ink/85 text-sm font-semibold">De quién y cuándo</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectBuscable
              label="Proveedor"
              opciones={(proveedores ?? []).map((p) => ({
                valor: String(p.id),
                etiqueta: p.nombre,
                detalle: p.rif,
              }))}
              valor={proveedorId}
              onCambio={setProveedorId}
              vacio="Busca el proveedor"
            />
            <Input
              label="N° de la factura"
              placeholder="El que trae el papel"
              hint="Se guarda para el libro de compras."
              value={numeroFactura}
              onChange={(e) => setNumeroFactura(e.target.value)}
            />
          </div>

          <Input
            label="Qué se compró"
            placeholder="Guantes y botas para el frente"
            hint="Es lo que se lee en el tablero."
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Fecha de la compra"
              type="date"
              max={hoyEnCaracas()}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <Select
              label="Moneda"
              value={moneda}
              onChange={(e) => setMoneda(e.target.value)}
              // Ya vienen con la forma del Select: solo las que tienen tasa.
              opciones={monedas ?? []}
              hint="La de la factura."
            />
            <Select
              label="Forma de pago"
              value={condicionPago}
              onChange={(e) => setCondicionPago(e.target.value)}
              opciones={CONDICIONES_PAGO}
            />
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-ink/85 text-sm font-semibold">Qué trae la factura</h3>
            <Button
              size="sm"
              variant="soft"
              icon={<Plus />}
              onClick={() => setFilas((f) => [...f, filaVacia()])}
            >
              Otro renglón
            </Button>
          </div>

          {filas.map((f, i) => (
            <div key={f.clave} className="border-hairline rounded-card border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-ink/40 text-2xs tracking-wide uppercase">
                  Renglón {i + 1}
                </span>
                {filas.length > 1 ? (
                  <button
                    type="button"
                    className="text-ink/40 hover:text-danger"
                    onClick={() => setFilas((x) => x.filter((y) => y.clave !== f.clave))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <SelectBuscable
                  label="Del catálogo"
                  opciones={(articulos ?? []).map((a) => ({
                    valor: String(a.id),
                    etiqueta: a.nombre,
                    detalle: a.codigo,
                  }))}
                  valor={f.articulo_id}
                  onCambio={(v: string) => elegirArticulo(f.clave, v)}
                  vacio="Sin catálogo"
                  hint="Si no está, créalo en el renglón: sin artículo no entra al inventario."
                />
                <Input
                  label="Qué es"
                  value={f.descripcion}
                  onChange={(e) => cambiar(f.clave, { descripcion: e.target.value })}
                  required
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <CantidadDeArticulo
                  key={f.articulo_id}
                  valor={f.cantidad}
                  onCambiar={(v, capturada) => cambiar(f.clave, { cantidad: v, capturada })}
                  articulo={conSusFormas(
                    articulos?.find((a) => String(a.id) === f.articulo_id),
                    formasDeContar,
                  )}
                  hintSinArticulo=""
                />
                {articuloDe(f) ? (
                  <Input
                    label="Unidad"
                    value={articuloDe(f)!.unidad}
                    disabled
                    hint="La del artículo: el inventario lo cuenta así."
                  />
                ) : (
                  <Select
                    label="Unidad"
                    value={f.unidad}
                    onChange={(e) => cambiar(f.clave, { unidad: e.target.value })}
                    opciones={(unidades ?? []).map((u) => ({ valor: u.codigo, etiqueta: u.nombre }))}
                  />
                )}
                <Input
                  label={
                    porBultoDe(f)
                      ? `Precio por ${f.capturada!.unidad!.toLowerCase()}`
                      : `Precio por ${(articuloDe(f)?.unidad ?? f.unidad).toLowerCase()}`
                  }
                  type="number"
                  min="0"
                  step="0.000001"
                  inputMode="decimal"
                  value={f.precio}
                  onChange={(e) => cambiar(f.clave, { precio: e.target.value })}
                  hint={
                    porBultoDe(f) && f.precio !== ''
                      ? `Trae ${porBultoDe(f)} ${articuloDe(f)!.unidad}: sale a ${formato(precioUnitarioDe(f))} cada ${articuloDe(f)!.unidad}.`
                      : undefined
                  }
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Input
                  label="Marca"
                  value={f.marca}
                  onChange={(e) => cambiar(f.clave, { marca: e.target.value })}
                />
                {/*
                  LA PRESENTACIÓN ES DEL MATERIAL. Christopher, 17/09/2026: «si
                  está comprando un servicio, no entiendo cómo permite usar
                  Presentación y guardar saco, rollo». Sin artículo el renglón
                  es un servicio, y un servicio no viene en sacos: el campo sale
                  cuando hay artículo.
                */}
                <p className="text-ink/45 self-end pb-2.5 text-xs">
                  {!articuloDe(f)
                    ? 'Sin presentación: sin artículo es un servicio.'
                    : 'presentaciones' in articuloDe(f)! || articuloDe(f)!.presentacion
                      ? 'Si vino en bultos, elige la presentación junto a la cantidad: el catálogo sabe cuánto trae cada una.'
                      : `El catálogo no le declara presentación: se compra por ${articuloDe(f)!.unidad}. Para comprarlo por bolsa o caja, decláralo en Artículos.`}
                </p>
                <label className="text-ink/70 flex cursor-pointer items-center gap-2 self-end pb-2.5 text-sm select-none">
                  <input
                    type="checkbox"
                    className="accent-royal-600 size-4"
                    checked={f.exento}
                    onChange={(e) => cambiar(f.clave, { exento: e.target.checked })}
                  />
                  Exento de IVA
                </label>
              </div>

              {/*
                SIN ARTÍCULO NO ENTRA AL INVENTARIO, Y AHORA SE DICE.

                Una compradora, 17/09/2026: «lo que voy subiendo por compras
                directas, ¿se va subiendo en el catálogo o en el inventario?
                Porque no lo veo». Cargaba el material escribiendo el nombre,
                sin artículo, y la recepción lo daba por recibido sin anotar
                nada: un renglón sin artículo es un servicio —un flete, una
                reparación— y no hay estante donde ponerlo. La pantalla no lo
                avisaba. Christopher eligió que se cree aquí mismo, como en el
                pedido: el código lo pone la base, y los parecidos se enseñan
                antes de crear.
              */}
              {!f.articulo_id && f.descripcion.trim().length >= 3 ? (
                <div className="border-hairline rounded-card bg-canvas mt-3 grid gap-3 border border-dashed p-3 sm:grid-cols-12">
                  <p className="text-warning text-xs sm:col-span-12">
                    Sin artículo del catálogo este renglón no entra al inventario: queda como un
                    servicio, un flete o una reparación. Si es material, créalo aquí y entra con la
                    compra.
                  </p>

                  {f.unidad === 'M3' || f.unidad === 'TON' ? (
                    <p className="text-ink/60 text-xs sm:col-span-12">
                      Lo que se mide en {f.unidad === 'M3' ? 'metros cúbicos' : 'toneladas'} se crea
                      en{' '}
                      <Link
                        to="/app/inventario/articulos"
                        className="text-royal-700 dark:text-royal-300 underline underline-offset-2"
                      >
                        Artículos
                      </Link>
                      , con su densidad. Después vuelve y elígelo en este renglón.
                    </p>
                  ) : (
                    <>
                      <div className="sm:col-span-8">
                        <Select
                          label="Categoría"
                          vacio="Elige"
                          value={f.nueva_categoria}
                          onChange={(e) => cambiar(f.clave, { nueva_categoria: e.target.value })}
                          opciones={CATEGORIAS_ARTICULO}
                          hint={`Se crea como «${f.descripcion.trim().toUpperCase()}», en ${f.unidad}.`}
                        />
                      </div>
                      <div className="flex items-end sm:col-span-4">
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={!f.nueva_categoria || crearArticulo.isPending}
                          onClick={async () => {
                            const id = await crearArticulo.mutateAsync({
                              // Vacío: el código lo pone la base.
                              codigo: '',
                              nombre: f.descripcion.trim(),
                              categoria: f.nueva_categoria,
                              unidad: f.unidad,
                              marca: f.marca || null,
                              confirmado: f.nuevo_confirmado,
                            })
                            cambiar(f.clave, {
                              articulo_id: String(id),
                              nueva_categoria: '',
                              nuevo_confirmado: false,
                            })
                          }}
                        >
                          {crearArticulo.isPending ? 'Creando…' : 'Crear en el catálogo'}
                        </Button>
                      </div>
                      <div className="sm:col-span-12">
                        <ParecidosAEste
                          nombre={f.descripcion}
                          categoria={f.nueva_categoria}
                          confirmado={f.nuevo_confirmado}
                          onConfirmar={(v) => cambiar(f.clave, { nuevo_confirmado: v })}
                        />
                      </div>
                    </>
                  )}

                  {crearArticulo.error ? (
                    <ErrorDeCarga error={crearArticulo.error} className="sm:col-span-12" />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Descuento"
              type="number"
              min="0"
              step="0.01"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
            />
            <Input
              label="Flete"
              type="number"
              min="0"
              step="0.01"
              value={flete}
              onChange={(e) => setFlete(e.target.value)}
            />
            <Input
              label="IVA %"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={alicuota}
              onChange={(e) => setAlicuota(e.target.value)}
            />
          </div>

          <div className="border-hairline bg-canvas rounded-card border p-3.5">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink/60">Subtotal</dt>
                <dd className="tabular text-ink/80">{formato(totales.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">Base imponible</dt>
                <dd className="tabular text-ink/80">{formato(totales.base)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/60">IVA</dt>
                <dd className="tabular text-ink/80">{formato(totales.iva)}</dd>
              </div>
              <div className="border-hairline flex justify-between border-t pt-1.5">
                <dt className="text-ink/85 font-semibold">Total</dt>
                <dd className="tabular text-ink/90 font-semibold">{formato(totales.total)}</dd>
              </div>
            </dl>
            {tasaVigente ? (
              <p className="text-ink/45 mt-2 text-xs">
                Se congela con la tasa BCV del{' '}
                {new Date(`${tasaVigente.fecha}T12:00`).toLocaleDateString('es-VE')}:{' '}
                <span className="tabular">Bs {fmtTasa(tasaVigente.tasa)}</span> por dólar.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="space-y-4">
          <h3 className="text-ink/85 text-sm font-semibold">El material y el papel</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="A qué almacén entra"
              vacio="No entra al inventario"
              value={almacen}
              onChange={(e) => setAlmacen(e.target.value)}
              opciones={(almacenes ?? []).map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
              hint="Vacío para un servicio o algo que no se almacena."
            />
            {/*
              Marcado por omisión: quien carga una compra directa casi siempre
              tiene el material delante. Se puede desmarcar para cargarla ahora
              y recibirla cuando llegue, que es el caso raro.
            */}
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2.5 self-end rounded-[6px] border p-3 text-sm',
                recibirYa && almacen ? 'border-royal-600/40 bg-royal-600/5' : 'border-hairline',
              )}
            >
              <input
                type="checkbox"
                className="accent-royal-600 mt-0.5 size-4 shrink-0"
                disabled={!almacen}
                checked={recibirYa && !!almacen}
                onChange={(e) => setRecibirYa(e.target.checked)}
              />
              <span className="text-ink/80">
                Entra al almacén ahora
                <span className="text-ink/50 mt-0.5 block text-xs">
                  {!almacen
                  ? 'Elige antes el almacén.'
                  : faltaLaFactura
                    ? 'Hace falta la factura: sin el papel del proveedor el material no entra.'
                    : 'Se recibe completa, con la fecha de la compra.'}
                </span>
              </span>
            </label>
          </div>

          <SoltarArchivo
            valor={factura}
            onCambio={setFactura}
            acepta="application/pdf,image/*"
            tope={10 * 1024 * 1024}
            etiqueta="La factura del proveedor"
            pista="La fiscal: es la única que da derecho al crédito del IVA. PDF o foto, hasta 10 MB. Se puede subir después."
            deshabilitado={comprar.isPending || adjuntar.isPending}
          />

          <Textarea
            label="Observación"
            rows={2}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />

          {miFirma?.usar ? (
            <label className="border-hairline flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm">
              <input
                type="checkbox"
                className="accent-royal-600 mt-0.5 size-4 shrink-0"
                checked={conMiFirma}
                onChange={(e) => setConMiFirma(e.target.checked)}
              />
              <span className="text-ink/80">
                Poner mi firma digital en «Solicitado por» y en «Autorizado por»
                <span className="text-ink/50 mt-0.5 block text-xs">
                  Sin marcar, las dos rayas de la orden de compra salen en blanco con tu nombre debajo.
                </span>
              </span>
            </label>
          ) : null}
        </Card>

        {comprar.error ? <ErrorDeCarga error={comprar.error} /> : null}
        {avisoPapel ? (
          <Card className="border-warning/30 bg-warning-soft">
            <p className="text-ink/80 text-sm">{avisoPapel}</p>
          </Card>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 pb-8">
          <Link to="/app/compras">
            <Button variant="ghost">Cancelar</Button>
          </Link>
          <Button disabled={!puedeGuardar} onClick={() => void guardar()}>
            {enVuelo ? 'Guardando…' : 'Aceptar la compra'}
          </Button>
        </div>
      </div>
    </>
  )
}
