import { useMemo, useState } from 'react'
import { ArrowLeft, ListChecks, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisAcciones } from '@/lib/api/usuarios'
import {
  type GrupoDeRequisitos,
  loQueSeImprime,
  useBorrarRequisito,
  useBorrarTitulo,
  useGuardarRequisito,
  useGuardarTitulo,
  useRequisitosDeIngreso,
} from '@/lib/api/requisitos'

/*
  DOS CARAS DEL MISMO MODAL, Y NO UN MODAL ENCIMA DE OTRO.

  El usuario pidió que la edición saliera «de un botón que permita aperturar
  otro modal o segmento», y de las dos formas se eligió la segunda por una razón
  que se puede comprobar: `Modal` se dibuja en un portal a `z-50`, así que dos
  abiertos a la vez quedan al mismo nivel y quién tapa a quién depende del orden
  del DOM. Funciona hoy y se rompe el día que alguien cambie el orden.

  Con dos caras eso no puede pasar, y de paso se cumple lo que el modal era:
  al abrirlo sigue siendo la pregunta corta de siempre. La lista solo aparece
  cuando se pide, y se vuelve con una flecha.

  LO QUE NO SE HIZO, Y SE DICE PARA QUE NO SE REPROPONGA: meter el catálogo
  editable en el cuerpo del primero. Un modal que se contesta en tres segundos y
  un administrador de listas son dos cosas distintas, y juntarlas convierte la
  pregunta de la huella en algo que hay que buscar entre renglones.
*/

interface Props {
  abierto: boolean
  onCerrar: () => void
  /** Emite el papel. Los grupos van ya filtrados y sin los vacíos. */
  onEmitir: (
    conHuella: boolean,
    requisitos: Array<{ nombre: string; requisitos: string[] }>,
  ) => void
}

export function ModalPlanillaDeIngreso({ abierto, onCerrar, onEmitir }: Props) {
  const { data: grupos, isPending, error } = useRequisitosDeIngreso()
  const { puede } = useMisAcciones()
  const puedeEditar = puede('NOMINA.EDITAR_PARAMETROS')

  const [editando, setEditando] = useState(false)

  /*
    Lo desmarcado, y no lo marcado.

    Se guarda al revés a propósito: con el conjunto de marcados, un requisito
    nuevo creado desde la cara de al lado nacería fuera de la hoja hasta que
    alguien lo marcara. Guardando lo que se quitó, lo que aparece después entra
    solo si está activo — que es lo que significa `activo`.
  */
  const [quitados, setQuitados] = useState<ReadonlySet<number>>(new Set())

  const marcados = useMemo(() => {
    const puesto = new Set<number>()
    for (const g of grupos ?? []) {
      for (const r of g.requisitos) if (r.activo && !quitados.has(r.id)) puesto.add(r.id)
    }
    return puesto
  }, [grupos, quitados])

  const paraElPapel = useMemo(
    () => loQueSeImprime(grupos ?? [], marcados),
    [grupos, marcados],
  )
  const cuantos = paraElPapel.reduce((s, g) => s + g.requisitos.length, 0)

  const alternar = (id: number) =>
    setQuitados((antes) => {
      const ahora = new Set(antes)
      if (ahora.has(id)) ahora.delete(id)
      else ahora.add(id)
      return ahora
    })

  const cerrar = () => {
    setEditando(false)
    setQuitados(new Set())
    onCerrar()
  }

  const emitir = (conHuella: boolean) => {
    onEmitir(conHuella, paraElPapel)
    setEditando(false)
    setQuitados(new Set())
  }

  // ───────────────────────────────────────────────────── la cara de editar
  if (abierto && editando) {
    return (
      <Modal
        abierto
        onCerrar={cerrar}
        titulo="Qué documentos se piden"
        descripcion="Lo que se imprime en la hoja que se lleva el aspirante. Cambia con el tiempo, así que se edita aquí mismo."
        ancho="lg"
        acciones={
          <Button variant="outline" icon={<ArrowLeft />} onClick={() => setEditando(false)}>
            Volver a la planilla
          </Button>
        }
      >
          <EditorDeRequisitos
          grupos={grupos ?? []}
          marcados={marcados}
          onAlternar={alternar}
        />
      </Modal>
    )
  }

  // ─────────────────────────────────────────────────── la cara de siempre
  return (
    <Modal
      abierto={abierto}
      onCerrar={cerrar}
      titulo="Planilla de ingreso"
      descripcion="Sale en blanco, para llenarla a mano durante la entrevista."
      ancho="sm"
      acciones={
        <>
          <Button variant="ghost" onClick={cerrar}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={() => emitir(false)}>
            Sin huella
          </Button>
          <Button onClick={() => emitir(true)}>Con huella</Button>
        </>
      }
    >
      <p className="text-ink/70 text-sm leading-relaxed">
        ¿Le pones un recuadro para la <strong>huella del pulgar</strong> al lado de las firmas?
      </p>
      <p className="text-ink/55 mt-2 text-sm leading-relaxed">
        Sirve cuando la firma de alguien no sale igual dos veces. Si no hace falta, el pie queda
        con las dos rayas de firma y nada más.
      </p>

      {/*
        LA HOJA DE DOCUMENTOS, RESUMIDA EN UN RENGLÓN.

        Aquí no va la lista: va cuántos salen y de qué grupos. Quien imprime
        veinte veces al mes no quiere leer once nombres cada vez; quiere ver que
        el número es el de siempre y seguir. El día que no lo sea, entra.
      */}
      <div className="border-hairline mt-4 border-t pt-3">
        {isPending ? <Cargando /> : null}
        {error ? <ErrorDeCarga error={error} /> : null}

        {grupos ? (
          <>
            <p className="text-ink/70 text-sm leading-relaxed">
              {cuantos === 0 ? (
                <>
                  No lleva <strong>hoja de documentos</strong>: la planilla sale con sus dos hojas
                  de siempre.
                </>
              ) : (
                <>
                  Lleva detrás una hoja con{' '}
                  <strong>
                    {cuantos} {cuantos === 1 ? 'documento' : 'documentos'}
                  </strong>{' '}
                  en {paraElPapel.length}{' '}
                  {paraElPapel.length === 1 ? 'apartado' : 'apartados'}, con sus casillas vacías
                  para marcar a mano.
                </>
              )}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<ListChecks />}
                onClick={() => setEditando(true)}
              >
                {puedeEditar ? 'Ver y cambiar qué se pide' : 'Ver qué se pide'}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}

/*
  EL EDITOR, QUE ES LO QUE SE ABRE DETRÁS DEL BOTÓN.

  Se escribe encima del renglón, no en un formulario aparte: «editar
  rápidamente» fueron las palabras, y bajar a un formulario con su Guardar y su
  Cancelar por cambiar una palabra es justo lo que no se pidió.

  La casilla de cada renglón NO es «activo»: es si entra en ESTA impresión. El
  `activo` decide con qué viene marcado, y se cambia con el interruptor de su
  fila. Son dos cosas y por eso están separadas.
*/
function EditorDeRequisitos({
  grupos,
  marcados,
  onAlternar,
}: {
  grupos: GrupoDeRequisitos[]
  /** Lo que va en ESTA impresión. Arranca de `activo` y se puede afinar aquí. */
  marcados: ReadonlySet<number>
  onAlternar: (id: number) => void
}) {
  const { puede } = useMisAcciones()
  const puedeEditar = puede('NOMINA.EDITAR_PARAMETROS')

  const guardarTitulo = useGuardarTitulo()
  const borrarTitulo = useBorrarTitulo()
  const guardarRequisito = useGuardarRequisito()
  const borrarRequisito = useBorrarRequisito()

  const [nuevoTitulo, setNuevoTitulo] = useState('')
  const [nuevoEn, setNuevoEn] = useState<number | null>(null)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [renombrando, setRenombrando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const fallo =
    guardarTitulo.error ?? borrarTitulo.error ?? guardarRequisito.error ?? borrarRequisito.error

  const trabajando =
    guardarTitulo.isPending ||
    borrarTitulo.isPending ||
    guardarRequisito.isPending ||
    borrarRequisito.isPending

  const renombrar = async (clave: string, guardar: () => Promise<unknown>) => {
    if (texto.trim().length < 2) return
    await guardar()
    if (renombrando === clave) setRenombrando(null)
  }

  if (!puedeEditar && grupos.length === 0) {
    return (
      <Vacio
        icono={<ListChecks />}
        titulo="Todavía no hay documentos que pedir"
        descripcion="Quien lleve los parámetros de nómina puede cargarlos desde aquí."
      />
    )
  }

  return (
    <div className="space-y-4">
      {fallo ? <ErrorDeCarga error={fallo} /> : null}

      {grupos.length === 0 ? (
        <p className="text-ink/55 text-sm leading-relaxed">
          No hay ningún apartado todavía. Crea el primero abajo — por ejemplo «Documentos
          personales».
        </p>
      ) : null}

      {grupos.map((g) => (
        <div key={g.titulo.id} className="border-hairline rounded-card border p-3">
          <div className="flex items-start justify-between gap-2">
            {renombrando === `t${g.titulo.id}` ? (
              <div className="flex flex-1 items-end gap-2">
                <Input
                  label="Nombre del apartado"
                  className="flex-1"
                  value={texto}
                  autoFocus
                  onChange={(e) => setTexto(e.target.value)}
                  onBlur={() =>
                    void renombrar(`t${g.titulo.id}`, () =>
                      guardarTitulo.mutateAsync({ id: g.titulo.id, nombre: texto.trim() }),
                    )
                  }
                />
                <Button variant="ghost" size="sm" onClick={() => setRenombrando(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                <p className="text-ink/85 text-sm font-semibold">{g.titulo.nombre}</p>
                {puedeEditar ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={trabajando}
                      onClick={() => {
                        setRenombrando(`t${g.titulo.id}`)
                        setTexto(g.titulo.nombre)
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    {/*
                      Borrar un apartado con renglones dentro lo para la base, y
                      dice cuántos hay. No se esconde el botón: esconderlo
                      obligaría a adivinar por qué no está.
                    */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      disabled={trabajando}
                      onClick={() => void borrarTitulo.mutateAsync(g.titulo.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <ul className="mt-2 space-y-1">
            {g.requisitos.length === 0 ? (
              <li className="text-ink/40 text-xs">Sin documentos todavía.</li>
            ) : null}

            {g.requisitos.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                {renombrando === `r${r.id}` ? (
                  <Input
                    label="Nombre del documento"
                    className="flex-1"
                    value={texto}
                    autoFocus
                    onChange={(e) => setTexto(e.target.value)}
                    onBlur={() =>
                      void renombrar(`r${r.id}`, () =>
                        guardarRequisito.mutateAsync({ id: r.id, nombre: texto.trim() }),
                      )
                    }
                  />
                ) : (
                  <>
                    {/*
                      LA CASILLA ES PARA ESTA IMPRESIÓN; «No pedir» es para
                      siempre. Son dos decisiones distintas y por eso hay dos
                      controles: quitar un documento hoy porque este aspirante
                      ya lo trajo no es dejar de pedirlo nunca más.
                    */}
                    <label className="flex flex-1 cursor-pointer items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        className="accent-tierra-600 size-3.5 shrink-0"
                        checked={marcados.has(r.id)}
                        onChange={() => onAlternar(r.id)}
                      />
                      <span className={marcados.has(r.id) ? 'text-ink/80' : 'text-ink/40'}>
                        {r.nombre}
                        {r.activo ? null : (
                          <span className="text-ink/35 text-xs"> · no se pide por omisión</span>
                        )}
                      </span>
                    </label>
                    {puedeEditar ? (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={trabajando}
                          onClick={() =>
                            void guardarRequisito.mutateAsync({
                              id: r.id,
                              nombre: r.nombre,
                              activo: !r.activo,
                            })
                          }
                        >
                          <span className="text-xs">{r.activo ? 'No pedir' : 'Pedir'}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={trabajando}
                          onClick={() => {
                            setRenombrando(`r${r.id}`)
                            setTexto(r.nombre)
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          disabled={trabajando}
                          onClick={() => void borrarRequisito.mutateAsync(r.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>

          {puedeEditar ? (
            <div className="mt-2 flex items-end gap-2">
              <Input
                label="Documento nuevo"
                className="flex-1"
                placeholder="Partida de nacimiento"
                value={nuevoEn === g.titulo.id ? nuevoNombre : ''}
                onChange={(e) => {
                  setNuevoEn(g.titulo.id)
                  setNuevoNombre(e.target.value)
                }}
              />
              <Button
                variant="outline"
                size="sm"
                icon={<Plus />}
                disabled={
                  trabajando || nuevoEn !== g.titulo.id || nuevoNombre.trim().length < 2
                }
                onClick={async () => {
                  await guardarRequisito.mutateAsync({
                    titulo_id: g.titulo.id,
                    nombre: nuevoNombre.trim(),
                  })
                  setNuevoNombre('')
                }}
              >
                Añadir
              </Button>
            </div>
          ) : null}
        </div>
      ))}

      {puedeEditar ? (
        <div className="border-hairline flex items-end gap-2 border-t pt-3">
          <Input
            label="Apartado nuevo"
            className="flex-1"
            placeholder="Documentos del vehículo"
            value={nuevoTitulo}
            onChange={(e) => setNuevoTitulo(e.target.value)}
          />
          <Button
            variant="outline"
            icon={<Plus />}
            disabled={trabajando || nuevoTitulo.trim().length < 2}
            onClick={async () => {
              await guardarTitulo.mutateAsync({ nombre: nuevoTitulo.trim() })
              setNuevoTitulo('')
            }}
          >
            Crear
          </Button>
        </div>
      ) : null}
    </div>
  )
}
