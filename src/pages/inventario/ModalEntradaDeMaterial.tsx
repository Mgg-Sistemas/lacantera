import { useState } from 'react'
import { Landmark, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { AvisoDeCosto } from '@/components/AvisoDeCosto'
import { CantidadDeArticulo } from '@/components/CantidadDeArticulo'
import { CostoDeArticulo } from '@/components/CostoDeArticulo'
import { conDueno, detalleDeDueno, esAjeno } from '@/lib/deQuien'
import { conSusFormas, useArticulos, useTodasLasPresentaciones } from '@/lib/api/catalogo'
import { useAlmacenes, usePropietarios, useRegistrarEntradas } from '@/lib/api/inventario'
import { enSimbolos, useMonedasUsables } from '@/lib/api/tasas'
import { cn } from '@/lib/cn'

/*
  «ENTRADA DE MATERIAL», DE VARIOS RENGLONES.

  Vivía dentro de la pantalla vieja de Existencias («Registrar entrada»). Desde
  el 09/11/2026 esa pantalla se retiró y la entrada es su propio modal: lo abren
  la cabecera de la pantalla de inventario de MGG y la del detalle de un
  almacén (con ese almacén puesto). Es el mismo formulario de siempre y la misma
  RPC (`registrar_entradas`): para lo que entra sin una compra de por medio —el
  saldo con el que arranca un almacén, algo comprado por fuera, material que
  trae alguien—, con su costo y su moneda, o marcado «sin valorar».

  El «↕ Movimiento» de cada producto sigue siendo la entrada rápida de uno solo;
  esta es la de muchos renglones, que es como se carga un saldo inicial.
*/

/** Un monto con dos decimales y sin símbolo: la moneda la elige el renglón. */
function monto(valor: number): string {
  return valor.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Un renglón mientras se escribe: todo texto, que es lo que da un input. */
interface RenglonEnCurso {
  clave: string
  articulo: string
  /** El TOTAL: es lo que lee el botón, el filtro, la suma y el aviso del costo. */
  cantidad: string
  costo: string
  moneda: string
  /** Alguien vio el aviso de costo raro y decidió guardarlo igual (por renglón). */
  confirmado?: boolean
  /** No se sabe cuánto costó: entra sin cifra y queda pendiente de valorar. */
  sinValor?: boolean
  /** Bultos enteros, cuando se contó en bultos. La suma la hace la base. */
  presentaciones?: number | null
  /** Lo suelto que acompaña a los bultos, aparte de `cantidad` a propósito. */
  sueltas?: string
  /** En cuál de las presentaciones se contó. */
  presentacion?: string | null
  /** A qué almacén entra ESTE renglón. Vacío es «el de arriba». */
  almacen: string
}

let siguienteClave = 0
const renglonVacio = (articulo: string, almacen = ''): RenglonEnCurso => ({
  clave: String(++siguienteClave),
  articulo,
  cantidad: '',
  costo: '',
  // Sin moneda: se elige. Nacer en dólares es como entró mal la cafetera.
  moneda: '',
  almacen,
})

export function ModalEntradaDeMaterial({
  almacenInicial = '',
  articuloInicial = '',
  onCerrar,
}: {
  /** El almacén que la pantalla tiene elegido, como valor por defecto. */
  almacenInicial?: string
  /** El artículo del primer renglón, cuando se abre desde uno. */
  articuloInicial?: string
  onCerrar: () => void
}) {
  const { data: almacenes } = useAlmacenes()
  const { data: propietarios } = usePropietarios()
  const { data: articulos } = useArticulos()
  const { data: formasDeContar } = useTodasLasPresentaciones()
  const monedas = useMonedasUsables()
  const entrada = useRegistrarEntradas()

  const [aDonde, setADonde] = useState(almacenInicial)
  const [renglones, setRenglones] = useState<RenglonEnCurso[]>(() => [renglonVacio(articuloInicial)])
  const [referencia, setReferencia] = useState('')
  const [motivo, setMotivo] = useState('')

  /* El rótulo del dueño, para las listas donde no cabe una pastilla. */
  const nombreDeDueno = (codigo?: string | null) =>
    (propietarios ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo ?? undefined

  const guardar = async () => {
    await entrada.mutateAsync({
      // El valor por defecto: se usa en los renglones que no eligieron el suyo.
      almacen_id: aDonde ? Number(aDonde) : null,
      renglones: renglones
        // Un renglón sin valorar no trae costo a propósito.
        .filter((r) => r.articulo && r.cantidad && (r.costo || r.sinValor))
        .map((r) => ({
          almacen_id: Number(r.almacen || aDonde),
          articulo_id: Number(r.articulo),
          // A la base van las DOS cifras tecleadas y no el total.
          cantidad: r.presentaciones ? Number(r.sueltas || 0) : Number(r.cantidad || 0),
          presentaciones: r.presentaciones ?? null,
          presentacion: r.presentacion ?? null,
          costo: Number(r.costo || 0),
          moneda: r.moneda,
          confirmado: r.confirmado === true,
          sin_valor: r.sinValor === true,
        })),
      motivo,
      referencia: referencia || null,
    })
    onCerrar()
  }

  const listos = renglones.filter((r) => r.articulo && r.cantidad && (r.costo || r.sinValor))
  const bloqueado =
    motivo.trim().length < 4 ||
    listos.length === 0 ||
    // Cada renglón tiene que resolver un almacén, el suyo o el de la cabecera.
    listos.some((r) => !(r.almacen || aDonde)) ||
    // Un costo sin moneda no se manda: la base lo rechaza.
    listos.some((r) => r.costo && !r.sinValor && !r.moneda) ||
    entrada.isPending

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Entrada de material"
      descripcion="Para lo que entra sin una compra de por medio: el saldo con el que arranca el almacén, algo comprado por fuera, material que trae alguien."
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={bloqueado}>
            {entrada.isPending ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
            <>
              <SelectBuscable
                label="Almacén"
                vacio="Seleccione el sitio"
                valor={aDonde}
                /*
                  CAMBIAR DE ALMACEN OLVIDA LAS CONFIRMACIONES QUE DEPENDEN DE ÉL.

                  El costo promedio se lleva por pareja (almacen, articulo), asi
                  que mover el valor por defecto cambia el numero contra el que
                  se comparan los renglones QUE NO ELIGIERON EL SUYO PROPIO — los
                  que sí lo eligieron siguen comparando contra el suyo, y mover
                  la cabecera no les cambia nada.
                */
                onCambio={(v) => {
                  setADonde(v)
                  setRenglones((lista) =>
                    lista.map((x) => (x.almacen ? x : { ...x, confirmado: false })),
                  )
                }}
                /*
                  EL TANQUE SIN COSTO NO ES DESTINO DE UNA ENTRADA CON PRECIO.

                  Un almacen marcado con `admite_sin_costo` lleva su promedio
                  aparte, y ese es el motivo de que exista: meterle material con
                  precio lo contamina igual que sacarlo de ahi contamina al
                  destino. La base lo rechaza; aqui simplemente no se ofrece.

                  Para meter en ese tanque esta «Cargar combustible al tanque»
                  con la casilla de «no costó nada para esta empresa».
                */
                opciones={(almacenes ?? [])
                  .filter((a) => !a.admite_sin_costo)
                  .map((a) => ({
                    valor: String(a.id),
                    codigo: a.codigo,
                    nombre: a.nombre,
                    /*
                      Y DE QUIÉN VA A SER LO QUE ENTRE.

                      Christopher: «así mismo en la opción de darle entrada o
                      formulario para crear el item». Aquí es donde de verdad se
                      decide: el dueño vive en el almacén, así que elegir el
                      destino ES elegir de quién será la silla que entra.
                      Enterarse después de guardar llega tarde — mover material
                      entre dueños no es un traslado y la base no lo permite.
                    */
                    detalle: conDueno(
                      a.tipo,
                      detalleDeDueno(a.propietario, nombreDeDueno(a.propietario)),
                    ),
                  }))}
              />
              <p className="text-ink/45 mt-1.5 text-xs">
                El valor por defecto. Si un renglón entra a otro almacén, se elige en el renglón.
              </p>

              <div className="mt-4 space-y-3">
                {renglones.map((r, i) => {
                  const art = conSusFormas(
                    (articulos ?? []).find((a) => String(a.id) === r.articulo),
                    formasDeContar,
                  )

                  /*
                    CUÁNTO SUMA ESTE RENGLÓN, MIENTRAS SE ESCRIBE.

                    El 5 de septiembre de 2026 entraron cinco aceites con el
                    costo mal transcrito y el inventario pasó a valer 868
                    millones de dólares. El sistema hizo la aritmética sin un
                    fallo: guardó lo que recibió. Lo que no hizo fue enseñarlo.

                    El formulario pedía CANTIDAD y COSTO POR UNIDAD y nunca
                    mostraba el tercer número, que es el único que delata el
                    error. «208 × 1.318.073,76» no dice nada a nadie;
                    «274.159.342,08» lo dice todo, y lo dice cuando todavía se
                    puede borrar y volver a escribir.

                    Va en la moneda que se eligió y sin convertir: convertir aquí
                    sería calcular una tasa en el navegador, que es justo lo que
                    la regla 4 de la casa prohíbe. La conversión la hace la base
                    al guardar.
                  */
                  const cant = Number(r.cantidad)
                  const costo = Number(r.costo)
                  const suma =
                    r.cantidad.trim() !== '' &&
                    r.costo.trim() !== '' &&
                    Number.isFinite(cant) &&
                    Number.isFinite(costo) &&
                    cant > 0 &&
                    costo > 0
                      ? cant * costo
                      : null

                  return (
                    <div
                      key={r.clave}
                      className="border-hairline rounded-card border border-dashed p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
                          Renglón {i + 1}
                        </span>
                        {renglones.length > 1 ? (
                          <button
                            type="button"
                            className="text-ink/40 hover:text-danger text-xs underline underline-offset-2"
                            onClick={() =>
                              setRenglones((v) => v.filter((x) => x.clave !== r.clave))
                            }
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>

                      <SelectBuscable
                        label="Artículo"
                        vacio="Seleccione el artículo"
                        valor={r.articulo}
                        onCambio={(v) =>
                          setRenglones((lista) =>
                            /*
                              CAMBIAR DE ARTICULO LIMPIA LA CANTIDAD.

                              La unidad cambia con el articulo: «3» de tambores
                              no es «3» de sacos, y los bultos del anterior no
                              significan nada en el nuevo. Peor si el nuevo no
                              viene en bultos: el selector desaparece de la
                              pantalla y `presentaciones` se queda en el renglon
                              y viaja igual, y la base rechaza con un mensaje
                              sobre un campo que ya no se ve.
                            */
                            lista.map((x) =>
                              x.clave === r.clave
                                ? {
                                    ...x,
                                    articulo: v,
                                    cantidad: '',
                                    // El costo tambien: 6,50 por litro de un
                                    // aceite no dice nada del articulo nuevo, y
                                    // dejarlo puesto es ofrecerlo como suyo.
                                    costo: '',
                                    presentaciones: null,
                                    presentacion: null,
                                    sueltas: '',
                                    confirmado: false,
                                  }
                                : x,
                            ),
                          )
                        }
                        opciones={(articulos ?? [])
                          .filter((a) => a.inventariable)
                          .map((a) => ({
                            valor: String(a.id),
                            codigo: a.codigo,
                            nombre: a.nombre,
                            detalle: `${a.categoria} · ${a.unidad}`,
                          }))}
                      />

                      {/*
                        A DÓNDE ENTRA ESTE RENGLÓN (03/11/2026).

                        Vacío significa «el de arriba»: la mayoría de una
                        entrada va al mismo sitio, y obligar a elegir en cada
                        renglón repetiría veinte veces lo que ya se dijo una.
                        Quien sí reparte entre almacenes lo cambia renglón por
                        renglón, igual que ya hace Salidas.
                      */}
                      <SelectBuscable
                        label="Almacén"
                        vacio="Igual que arriba"
                        valor={r.almacen}
                        onCambio={(v) =>
                          setRenglones((lista) =>
                            lista.map((x) =>
                              x.clave === r.clave ? { ...x, almacen: v, confirmado: false } : x,
                            ),
                          )
                        }
                        opciones={(almacenes ?? [])
                          .filter((a) => !a.admite_sin_costo)
                          .map((a) => ({
                            valor: String(a.id),
                            codigo: a.codigo,
                            nombre: a.nombre,
                            detalle: conDueno(
                              a.tipo,
                              detalleDeDueno(a.propietario, nombreDeDueno(a.propietario)),
                            ),
                          }))}
                      />

                      {/* Y dicho en grande una vez resuelto, porque la línea de
                          la lista desaparece en cuanto se cierra el
                          desplegable. Por el almacén de ESTE renglón —el suyo
                          si lo eligió, si no el de arriba—, no por el de la
                          cabecera: con renglones repartidos entre dueños
                          distintos, el aviso de uno no vale para el otro. */}
                      {(() => {
                        const almacenDelRenglon = (almacenes ?? []).find(
                          (a) => String(a.id) === (r.almacen || aDonde),
                        )
                        return esAjeno(almacenDelRenglon?.propietario) ? (
                          <p className="border-warning/40 bg-warning/10 text-warning mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed">
                            <Landmark className="mr-1 inline size-3.5 align-[-2px]" />
                            Esto será de {nombreDeDueno(almacenDelRenglon?.propietario)}, no de La
                            Cantera. No se puede trasladar a un almacén propio.
                          </p>
                        ) : null
                      })()}

                      {/*
                        DOS COLUMNAS Y LA MONEDA DEBAJO, NO TRES EN FILA.

                        Christopher, con la captura: «detalle visual». El renglón
                        iba en tres columnas y cada una lleva dentro su propio
                        par campo-selector, así que en la práctica eran seis
                        cajas en una línea. La del costo quedaba tan estrecha que
                        «Costo por L» se partía en tres renglones, una palabra
                        por línea.

                        Cantidad y costo son gemelos y se leen en pareja: van
                        uno al lado del otro y en columnas iguales. La moneda es
                        una sola palabra y no necesita compartir fila con nadie:
                        baja, y de paso deja de comerle sitio al costo.

                        `minmax(0,1fr)` y no `1fr`: una columna de rejilla no
                        baja de su contenido mínimo salvo que se le diga, y es lo
                        que deja que un rótulo largo empuje a la de al lado en vez
                        de encogerse.
                      */}
                        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        {/*
                          Aqui es donde mas falta hacia: quien registra la
                          entrada esta contando bultos bajados de un camion y
                          tiene que dejar litros en la existencia.
                        */}
                        {/*
                          CAMBIAR DE ARTICULO REMONTA EL CAMPO.

                          El componente guarda por dentro en que presentacion
                          se esta tecleando, y esa eleccion no significa nada
                          en el articulo siguiente: el selector se quedaba en
                          «CAJA» y la linea de equivalencia afirmaba una cuenta
                          con el factor del anterior. Con la clave, React lo
                          monta de nuevo y el estado nace limpio — que es lo
                          mismo que ya hacia el renglon con sus cifras.
                        */}
                        {/*
                          LA CLAVE LLEVA EL NOMBRE DEL CAMPO, Y NO ES ADORNO.

                          Christopher: «este modal esta acumulando medidas de otros items... se
                          puede cambiar el item del renglon varias veces pero sus campos de
                          unidad no alternan con ello, en cambio se adicionan a otro item que no
                          tiene relacion, ej. tizas de herreria y aceite». El diagnostico era
                          exacto y la causa estaba a la vista.

                          Este campo y el del costo son HERMANOS en la misma rejilla, y los dos
                          llevaban `key={r.articulo}`: la misma clave para dos hijos del mismo
                          padre. React empareja los hijos por clave, y con claves repetidas la
                          reconciliacion deja de tener una respuesta unica — en vez de reemplazar
                          el campo viejo por el nuevo, iba apilando uno por cada articulo que se
                          probaba. De ahi las seis casillas «Cantidad» con las medidas de la tiza
                          y del aceite a la vez.

                          La clave sigue cambiando con el articulo a proposito: es lo que remonta
                          el campo y le limpia el estado interno. Lo que se arregla es que ahora
                          es unica entre hermanos.
                        */}
                        <CantidadDeArticulo
                          key={`cantidad-${r.articulo}`}
                          valor={r.cantidad}
                          /*
                            Se guardan las DOS cifras tecleadas, no la suma. La
                            suma la vuelve a hacer la base, que además anota al
                            lado del asiento lo que la persona contó: «7 TAMBOR
                            + 10 L» junto a «1.466 L». Mandando solo el total,
                            el movimiento le diría 1.466 a quien contó tambores.
                          */
                          onCambiar={(v, cap) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                x.clave === r.clave
                                  ? {
                                      ...x,
                                      // El TOTAL: es lo que lee el botón, el
                                      // filtro, la suma y el aviso del costo.
                                      cantidad: v,
                                      presentaciones: cap.presentaciones,
                                      presentacion: cap.unidad,
                                      sueltas: String(cap.sueltas ?? ''),
                                      // Cambiar la cantidad no debe arrastrar
                                      // una confirmación dada sobre otra.
                                      confirmado: false,
                                    }
                                  : x,
                              ),
                            )
                          }
                          articulo={art}
                        />

                        {/*
                          EL COSTO SE TECLEA COMO VIENE EN LA FACTURA.

                          El gemelo del campo de cantidad. Quien acaba de teclear
                          «3 tambores» y ver «= 624 L» sigue pensando en tambores
                          cuando llega aqui, y antes esta casilla pedia el precio
                          por litro sin decirlo. Ahora se puede teclear el precio
                          del tambor y el componente lo divide, ensenando la
                          cuenta con los dos lados escritos.
                        */}
                        <CostoDeArticulo
                          key={`costo-${r.articulo}`}
                          valor={r.costo}
                          onCambiar={(v) =>
                            setRenglones((lista) =>
                              /*
                              LA CASILLA PERTENECE A UN NUMERO, NO AL RENGLON.

                              Sin esto, marcar «es correcto» con 5 y teclear
                              luego 5.000 mandaba `confirmado: true` con el
                              numero nuevo: la base lo aceptaba sin avisar de
                              nada. Es justo el defecto que este formulario
                              existe para evitar.
                            */
                            lista.map((x) =>
                              x.clave === r.clave ? { ...x, costo: v, confirmado: false } : x,
                            ),
                            )
                          }
                          articulo={art}
                          moneda={r.moneda}
                          // Marcado «no se sabe», el campo se apaga en vez de
                          // esconderse: quien lo mire tiene que ver que ahí
                          // había una cifra que se decidió no poner.
                          disabled={r.sinValor === true}
                        />

                        {/* La moneda no se asume. El sistema maneja cuatro, y
                            convertir de cabeza es como se cargan los costos
                            equivocados. La conversión a dólares la hace la
                            base con la tasa del día.

                            Y ahora de verdad no se asume: el renglón nacía en
                            dólares, y así entró a 39.332,15 dólares una
                            cafetera con factura en bolívares. Nace vacío y hay
                            que elegirla. */}
                        <Select
                          label="Moneda"
                          vacio="Seleccione"
                          className="sm:col-span-2 sm:max-w-40"
                          value={r.moneda}
                          error={
                            !r.sinValor && r.costo.trim() !== '' && !r.moneda
                              ? 'Falta la moneda'
                              : undefined
                          }
                          onChange={(e) =>
                            setRenglones((lista) =>
                              lista.map((x) =>
                                // La moneda tambien: el promedio esta en dolares y la
                                // conversion la hace la base con la tasa del dia.
                                x.clave === r.clave
                                  ? { ...x, moneda: e.target.value, confirmado: false }
                                  : x,
                              ),
                            )
                          }
                          opciones={enSimbolos(monedas.data)}
                        />

                        {/*
                          NO SE SABE NO ES CERO, Y ESA ES TODA LA RAZÓN DE ESTA
                          CASILLA.

                          Quien carga el inventario: «esa laptop fue una
                          donación desde la base, no tenemos factura ni un precio
                          aproximado de cuánto costó, y como eso no salió del
                          presupuesto de la cantera tampoco puedo ponerle un
                          costo». Antes la pantalla solo ofrecía escribir una
                          cifra, y la base mandaba a hacer un ajuste de conteo —
                          que valora heredando el promedio del almacén, o sea
                          que le pone un precio inventado.

                          Escribir cero sería peor: ese cero se promedia con lo
                          que el artículo ya tenía y abarata cada salida futura,
                          en silencio y para siempre.

                          Marcada, el renglón entra con el costo en NULO. El
                          hueco se guarda como hueco y se cuenta aparte, así que
                          la existencia dice cuánto de ella está sin valorar en
                          vez de dar una cifra completa que no lo es.
                        */}
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 text-sm sm:col-span-2',
                            r.sinValor ? 'border-warning/30 bg-warning-soft' : 'border-hairline',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="accent-royal-600 mt-0.5 size-4 shrink-0"
                            checked={r.sinValor === true}
                            onChange={(e) =>
                              setRenglones((lista) =>
                                lista.map((x) =>
                                  x.clave === r.clave
                                    ? {
                                        ...x,
                                        sinValor: e.target.checked,
                                        // El costo se borra al marcar: dejarlo
                                        // escrito y apagado haría creer que
                                        // viajó, y la base rechaza las dos cosas
                                        // juntas.
                                        costo: e.target.checked ? '' : x.costo,
                                        confirmado: false,
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                          {/*
                            El rótulo nombra el caso y la consecuencia.

                            Christopher: «así como no se sabe cuánto costó, puede
                            ser donación, se desea solo ajustar el texto para
                            incluir Donación». Decía únicamente lo segundo, y
                            quien recibe algo donado no se pregunta si conoce el
                            precio: se pregunta dónde se marca que fue donado.
                            Van las dos, porque no siempre coinciden — una
                            donación puede venir con su factura, y algo comprado
                            hace años puede haber perdido la suya.
                          */}
                          <span className="text-ink/80">
                            Donación, o no se sabe cuánto costó
                            <span className="text-ink/50 mt-0.5 block text-xs">
                              {r.sinValor
                                ? 'Entra sin costo y queda pendiente de valorar. Indique abajo de dónde vino.'
                                : 'Para material donado o sin factura. No equivale a costo cero.'}
                            </span>
                          </span>
                        </label>
                      </div>

                      {/*
                        EL AVISO DEL COSTO RARO.

                        La regla la impone la base —`registrar_entradas` rechaza
                        el renglón si no viene confirmado— y esto es la cortesía
                        de decirlo mientras se escribe, con la casilla al lado
                        para no tener que guardar, leer el error y volver.

                        QUIEN DECIDE ES LA BASE, no esta pantalla. Antes se
                        deducía de `v_existencias`, y eso salió mal de dos
                        maneras que se tapaban entre sí: la vista esconde el
                        promedio a quien no ve valoraciones, así que al
                        almacenista le decía «primera entrada» siempre; y la
                        comparación solo se hacía en dólares, que no es la
                        moneda de las facturas de aquí.
                      */}
                      <AvisoDeCosto
                        almacenId={Number(r.almacen || aDonde) || null}
                        articuloId={Number(r.articulo) || null}
                        costo={costo}
                        moneda={r.moneda}
                        cantidad={cant}
                        unidad={art?.unidad ?? ''}
                        nombre={art?.nombre ?? 'Este artículo'}
                        confirmado={r.confirmado === true}
                        onConfirmar={(v) =>
                          setRenglones((lista) =>
                            lista.map((x) => (x.clave === r.clave ? { ...x, confirmado: v } : x)),
                          )
                        }
                      />

                      {/* La cuenta hecha, en grande. No es decoración: es la
                          única señal de que el número tecleado es el que se
                          quería teclear. */}
                      {suma !== null ? (
                        <p className="border-hairline mt-3 border-t pt-2.5 text-sm">
                          <span className="text-ink/45">
                            {new Intl.NumberFormat('es-VE', { maximumFractionDigits: 4 }).format(
                              cant,
                            )}{' '}
                            {art?.unidad ?? ''} × {monto(costo)} ={' '}
                          </span>
                          <span className="tabular text-ink/90 font-semibold">
                            {monto(suma)} {r.moneda}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/*
                EL TOTAL DE LA ENTRADA, y solo cuando todos los renglones van en
                la misma moneda.

                Con monedas mezcladas habría que convertir para sumar, y aquí no
                se calcula ninguna tasa —regla 4—. Sumar peras con manzanas y
                enseñarlo como un total sería peor que no enseñar nada: parecería
                un dato y no lo sería. Con una sola moneda, que es el caso de una
                factura, la suma es exacta y no hace falta convertir nada.
              */}
              {(() => {
                const listos = renglones.filter(
                  (r) =>
                    r.articulo &&
                    r.cantidad.trim() !== '' &&
                    r.costo.trim() !== '' &&
                    Number(r.cantidad) > 0 &&
                    Number(r.costo) > 0 &&
                    r.moneda !== '',
                )
                if (listos.length < 2) return null
                const monedasUsadas = new Set(listos.map((r) => r.moneda))
                if (monedasUsadas.size > 1) return null
                const total = listos.reduce((a, r) => a + Number(r.cantidad) * Number(r.costo), 0)
                return (
                  <div className="border-hairline mt-3 flex items-baseline justify-between border-t pt-3">
                    <span className="text-ink/55 text-sm">
                      Total de la entrada · {listos.length} renglones
                    </span>
                    <span className="tabular text-ink/90 text-lg font-semibold">
                      {monto(total)} {listos[0].moneda}
                    </span>
                  </div>
                )
              })()}

              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                icon={<Plus />}
                onClick={() => setRenglones((v) => [...v, renglonVacio('')])}
              >
                Añadir otro artículo
              </Button>
            </>

      <Input
        maxLength={60}
        className="mt-4"
        label="Referencia"
        hint="Quién lo trajo, o el número de una factura de fuera."
        value={referencia}
        onChange={(e) => setReferencia(e.target.value)}
      />

      <Textarea
        maxLength={500}
        label="Procedencia"
        className="mt-4"
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        hint="Queda en el libro y no se puede editar después."
      />

      {entrada.error ? <ErrorDeCarga error={entrada.error} className="mt-3" /> : null}
    </Modal>
  )
}
