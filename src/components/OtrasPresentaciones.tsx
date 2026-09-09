import { useState } from 'react'
import { Plus, Power, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorDeCarga } from '@/components/ui/Estado'
import {
  useBorrarPresentacionDeArticulo,
  useCambiarEstadoPresentacion,
  useGuardarPresentacion,
  useGuardarPresentacionDeArticulo,
  usePresentaciones,
  usePresentacionesDeArticulo,
  usePresentacionesParecidas,
} from '@/lib/api/catalogo'
import { cn } from '@/lib/cn'

/*
  DE CUÁNTAS FORMAS SE PUEDE CONTAR ESTE ARTÍCULO.

  Christopher, el 7 de septiembre: «puede existir la posibilidad de que la
  presentación de un producto varíe a pesar de su unidad de operación». Aceite
  en tambor y en galón; tuercas en pack de 6, de 12, par y unidad.

  LA REGLA QUE LO SOSTIENE TODO: un artículo tiene UNA unidad de operación y UNA
  existencia. Estas son maneras de contar, no maneras de almacenar. El aceite en
  tambor y en bidón es el mismo aceite y el mismo número de litros — y por eso
  se puede preguntar «cuánto aceite SAE 50 hay» y que haya una respuesta.

  Se descartó la alternativa de crear «ACEITE (TAMBOR)» y «ACEITE (GALÓN)» como
  dos artículos precisamente por eso: parte la existencia, parte el costo
  promedio, parte el mínimo de stock, y los informes cuentan dos cosas donde hay
  una.

  POR QUÉ APARECE SOLO AL CORREGIR Y NO AL CREAR

  Una presentación cuelga de un artículo, y mientras el artículo no existe no
  hay de dónde colgarla. Al crear se declara la primera con los dos campos de
  arriba —cómo llega y cuántas trae— y desde aquí se añaden las demás.
*/

interface Props {
  articuloId: number
  unidad: string
  className?: string
}

export function OtrasPresentaciones({ articuloId, unidad, className }: Props) {
  const { data: catalogo } = usePresentaciones()
  const { data: suyas, isPending, error: errorAlLeer } = usePresentacionesDeArticulo(articuloId)
  const guardar = useGuardarPresentacionDeArticulo()
  const cambiarEstado = useCambiarEstadoPresentacion()
  const borrar = useBorrarPresentacionDeArticulo()

  const [nombre, setNombre] = useState('')
  const [cuantas, setCuantas] = useState('')

  const lista = suyas ?? []
  /*
    SIN LA LISTA NO SE AFIRMA NADA, Y SOBRE TODO NO SE REGALA EL «POR DEFECTO».

    Con la consulta fallada o a medio llegar, `lista` es un array vacio — y eso
    se leia como «este articulo no tiene ninguna forma declarada». Dos danos, y
    el segundo es el que duele: la pantalla afirmaba en firme algo que no habia
    podido comprobar, y `anadir` calculaba `por_defecto: true` sobre esa lista
    vacia, marcando por defecto una forma nueva en un articulo que quiza ya
    tenia otra. Eso cambia con que factor cuenta la base cuando nadie nombra la
    presentacion.
  */
  const sePudoLeer = !isPending && !errorAlLeer
  const yaEstan = new Set(lista.map((p) => p.presentacion))
  const cuantasNum = Number(cuantas)
  const listo = sePudoLeer && Boolean(nombre) && Number.isFinite(cuantasNum) && cuantasNum > 0

  const anadir = async () => {
    await guardar.mutateAsync({
      articulo_id: articuloId,
      presentacion: nombre,
      unidades: cuantasNum,
      // La primera manda; las siguientes se añaden sin quitarle el sitio a la
      // que ya se estaba usando. Solo se decide con la lista en la mano: ver
      // arriba por qué.
      /*
        Corregir una que ya está no le cambia el sitio: se respeta lo que era.
        Y una nueva solo se propone si no hay ninguna activa.
      */
      por_defecto:
        lista.find((p) => p.presentacion === nombre)?.por_defecto ??
        (sePudoLeer && lista.filter((p) => p.activa).length === 0),
    })
    setNombre('')
    setCuantas('')
  }

  return (
    <div className={cn('border-hairline rounded-card border border-dashed p-3', className)}>
      <p className="text-ink/75 text-sm font-medium">Otras formas de contarlo</p>
      <p className="text-ink/50 mt-0.5 text-xs">
        El mismo material puede llegar de varias maneras. Sigue habiendo una sola existencia, en{' '}
        {unidad || 'su unidad'}.
      </p>
      {/*
        SE GUARDA AL MOMENTO, Y HAY QUE DECIRLO.

        Lo levantó Christopher: «lo guarda sin que se le haya dado al botón
        Guardar». Tiene razón en la queja aunque no en el remedio: una
        presentación cuelga del artículo y se escribe por su propia puerta, así
        que no puede esperar al «Guardar» de arriba — pero un panel que escribe
        dentro de un formulario con «Cancelar» al pie promete algo que no
        cumple. Se dice, que es lo honesto y lo barato.
      */}
      <p className="text-ink/45 mt-1 text-2xs">
        Lo de aquí se guarda al momento: «Cancelar» no lo deshace.
      </p>

      {errorAlLeer ? (
        <ErrorDeCarga error={errorAlLeer} className="mt-3" />
      ) : isPending ? (
        <p className="text-ink/45 mt-3 text-xs">Buscando las formas declaradas…</p>
      ) : lista.length === 0 ? (
        <p className="text-ink/45 mt-3 text-xs">
          Solo se cuenta en {unidad || 'su unidad'}. Añade una forma si llega en bultos.
        </p>
      ) : (
        <ul className="divide-hairline mt-3 divide-y">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <span
                className={cn(
                  'text-sm font-medium',
                  p.activa ? 'text-ink/85' : 'text-ink/40 line-through',
                )}
              >
                {p.presentacion}
              </span>
              <span className="text-ink/50 tabular text-xs">
                = {Number(p.unidades).toLocaleString('es-VE', { maximumFractionDigits: 4 })}{' '}
                {unidad}
              </span>

              {p.por_defecto ? (
                <span className="text-royal-600 dark:text-royal-300 text-2xs inline-flex items-center gap-1">
                  <Star className="size-3" /> la que se propone
                </span>
              ) : p.activa ? (
                <button
                  type="button"
                  className="text-ink/45 hover:text-ink/80 text-2xs underline underline-offset-2"
                  onClick={() =>
                    void guardar.mutateAsync({
                      articulo_id: articuloId,
                      presentacion: p.presentacion,
                      unidades: Number(p.unidades),
                      por_defecto: true,
                    })
                  }
                >
                  proponer esta
                </button>
              ) : null}

              {/*
                SE APAGAN, NO SE BORRAN. Un proveedor deja de vender en galones y
                la presentación se apaga; los movimientos viejos siguen legibles
                porque el asiento guarda el nombre que se usó, no un puntero a
                esta fila.
              */}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                icon={<Power />}
                onClick={() =>
                  void cambiarEstado.mutateAsync({ id: p.id, activa: !p.activa })
                }
              >
                {p.activa ? 'Apagar' : 'Encender'}
              </Button>

              {/*
                APAGAR NO ALCANZA CUANDO LA FILA SE PUSO PARA PROBAR.

                Christopher: «necesitamos que elimines de este item el Barril,
                pues fue puesto por prueba, pero unas botas no llegan en
                barril». Apagada seguía ahí, tachada, sin significar nada y
                pidiendo una explicación a quien la viera dentro de un año.

                Quién manda es la base: si la forma sostiene un movimiento, una
                orden o una cotización, rebota diciendo dónde y manda a apagar.
                Aquí no se decide nada, se pide.
              */}
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 />}
                disabled={borrar.isPending}
                onClick={() => void borrar.mutateAsync(p.id)}
              >
                Borrar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Select
          label="Cómo llega"
          vacio="Elige"
          // Sin la lista leida no se ofrece: el desplegable filtraba «las que ya
          // estan» contra una lista vacia, asi que ofrecia una ya declarada y al
          // guardarla le cambiaba el factor sin decirlo.
          disabled={!sePudoLeer}
          value={nombre}
          onChange={(e) => {
            const v = e.target.value
            setNombre(v)
            // Traer el factor que ya tiene: corregirlo empieza por verlo.
            const ya = lista.find((x) => x.presentacion === v)
            setCuantas(ya ? String(Number(ya.unidades)) : '')
          }}
          /*
            LAS YA DECLARADAS SÍ SE OFRECEN, Y ES UN ARREGLO.

            Antes se filtraban «para cambiarle el factor se corrige la de
            arriba» — y ese mismo día los dos campos de arriba se apagaron
            cuando hay presentaciones declaradas. Entre las dos cosas quedó un
            callejón sin salida: no había forma de corregir un factor mal
            puesto. Lo encontró Christopher a la primera.

            Elegir una ya declarada trae su factor y el botón pasa a
            «Corregir». Si esa presentación ya se usó en un movimiento, una
            orden o una cotización, la base lo rechaza y explica por qué: el
            papel viejo dice esa cantidad.
          */
          opciones={(catalogo ?? [])
            // La que se llama igual que la unidad no: «un PAR trae un PAR» no
            // es una forma de contar, y la base lo rechaza.
            .filter((c) => c.codigo !== unidad.toUpperCase())
            .map((c) => ({
              valor: c.codigo,
              etiqueta: yaEstan.has(c.codigo) ? `${c.nombre} — ya declarada` : c.nombre,
            }))}
        />
        <Input
          label={`Cuántas ${unidad} trae`}
          type="number"
          min="0"
          step="0.0001"
          inputMode="decimal"
          disabled={!sePudoLeer || !nombre}
          value={cuantas}
          onChange={(e) => setCuantas(e.target.value)}
        />
        <Button
          variant="ghost"
          icon={<Plus />}
          disabled={!listo || guardar.isPending}
          onClick={() => void anadir()}
        >
          {nombre && yaEstan.has(nombre) ? 'Corregir' : 'Añadir'}
        </Button>
      </div>

      {guardar.error ? <ErrorDeCarga error={guardar.error} className="mt-2" /> : null}
      {cambiarEstado.error ? <ErrorDeCarga error={cambiarEstado.error} className="mt-2" /> : null}
      {borrar.error ? <ErrorDeCarga error={borrar.error} className="mt-2" /> : null}

      {/*
        LA PUERTA VA DONDE APARECE LA PARED.

        Christopher: hay aceites que vienen en pailas y PAILA no estaba en la
        lista. El sitio para arreglarlo es éste y no una pantalla de ajustes:
        aquí es donde la persona se topa con que la palabra que necesita no
        existe, y mandarla a otro lado con el aceite descargándose en el patio
        es como se acaba escribiendo cualquier cosa para salir del paso.
      */}
      {sePudoLeer ? <NuevaFormaDeLlegada unidad={unidad} onCreada={(c) => {
        setNombre(c)
        setCuantas('')
      }} /> : null}
    </div>
  )
}

/*
  DAR DE ALTA UNA FORMA DE LLEGADA EN EL CATÁLOGO COMPARTIDO.

  Va plegada: la lista tiene dieciocho entradas y casi siempre la que hace falta
  ya está. Abrirla de par en par invitaría a crear antes de mirar, que es como se
  llenan los catálogos de duplicados.

  EL AVISO ES LO QUE HACE «CELOSO» ESTO. La base rechaza el homónimo —«Pailas»
  no entra al lado de «Paila»— pero no puede distinguir una falta de ortografía
  de un envase parecido: eso lo decide quien está mirando. Así que lo parecido se
  enseña ANTES de guardar, que es cuando todavía sirve de algo.
*/
function NuevaFormaDeLlegada({
  unidad,
  onCreada,
}: {
  unidad: string
  onCreada: (codigo: string) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const crear = useGuardarPresentacion()
  const { data: parecidas } = usePresentacionesParecidas(nombre)

  const lista = parecidas ?? []
  const homonima = lista.find((p) => p.es_la_misma)
  const limpio = nombre.trim()

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-ink/55 hover:text-ink/85 mt-3 text-xs underline underline-offset-2"
      >
        ¿No está en la lista? Añadir una forma de llegada
      </button>
    )
  }

  return (
    <div className="border-hairline rounded-card bg-canvas mt-3 border border-dashed p-3">
      <p className="text-ink/60 mb-2 text-xs">
        Se añade a la lista que ven todos los módulos, así que mira primero si ya está con otro
        nombre. Aquí va solo la palabra del envase: cuántas {unidad} trae se dice arriba, porque
        eso cambia de un artículo a otro.
      </p>

      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <Input
          label="Cómo llega"
          placeholder="Paila"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Button
          variant="outline"
          disabled={limpio.length < 3 || !!homonima || crear.isPending}
          onClick={async () => {
            const codigo = await crear.mutateAsync({ nombre: limpio })
            onCreada(codigo)
            setNombre('')
            setAbierto(false)
          }}
        >
          {crear.isPending ? 'Creando…' : 'Crear y usar'}
        </Button>
        <Button variant="ghost" onClick={() => { setAbierto(false); setNombre('') }}>
          Cancelar
        </Button>
      </div>

      {lista.length > 0 ? (
        <div
          className={cn(
            'rounded-card mt-2 border p-2.5',
            homonima ? 'border-warning/40 bg-warning-soft' : 'border-hairline bg-ink/4',
          )}
        >
          <p className="text-ink/70 text-xs">
            {homonima
              ? 'Eso ya está en la lista, con este nombre:'
              : 'Ya hay formas de llegada que se llaman parecido:'}
          </p>
          <ul className="mt-1.5 space-y-1">
            {lista.map((p) => (
              <li key={p.codigo} className="text-ink/85 flex items-baseline gap-2 text-xs">
                <span className="text-ink/50 text-2xs shrink-0 font-mono">{p.codigo}</span>
                <span className={p.es_la_misma ? 'font-semibold' : undefined}>{p.nombre}</span>
                {p.activa ? null : <span className="text-ink/40 shrink-0">retirada</span>}
              </li>
            ))}
          </ul>
          {homonima ? (
            /*
              AQUÍ NO HAY CASILLA DE «es otra cosa distinta», al revés que en
              artículos. Allí DISCO DE CORTE 7 y DISCO DE CORTE 9 son dos cosas
              de verdad; aquí PAILA y PAILAS no son dos envases, ni lo serán. La
              base también lo rechaza, así que una casilla solo serviría para
              tropezar con el error un clic más tarde.
            */
            <p className="text-ink/60 mt-2 text-xs">
              Usa <span className="font-semibold">{homonima.nombre}</span> en la lista de arriba.
            </p>
          ) : null}
        </div>
      ) : null}

      {crear.error ? <ErrorDeCarga error={crear.error} className="mt-2" /> : null}
    </div>
  )
}
