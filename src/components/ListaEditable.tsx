import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Interruptor } from '@/components/ui/Interruptor'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { cn } from '@/lib/cn'

/*
  UNA LISTA QUE LLEVA LA EMPRESA

  La líder: «debe ser editable, no quiero nos llamen a cada rato por cosas así».
  Y lo dijo justo después de que hiciera falta un despliegue para meter una
  palabra en un desplegable.

  Esto es el trozo de pantalla que hace verdad esa frase, y sirve para las dos
  listas que ella toca —las categorías de gasto y los motivos del vale— porque
  se manejan igual: renombrar, apagar, borrar si nunca se usó, y añadir.

  Va en un componente y no copiado dos veces porque los errores de estas
  operaciones son sutiles —«no se puede borrar, hay 4 gastos ahí»— y un fallo en
  ese camino habría que arreglarlo dos veces.

  APAGAR ESTÁ ANTES QUE BORRAR, Y SE VE ASÍ

  Borrar casi nunca es lo que se quiere: una categoría con gastos detrás tiene
  que seguir existiendo para que los informes viejos sigan cuadrando. Por eso el
  interruptor está a la vista y la papelera es pequeña y gris — y cuando la base
  se niega a borrar, dice exactamente cuántos documentos lo impiden.

  EL NOMBRE SE EDITA EN SU SITIO

  Sin abrir otra ventana encima. Cambiar un rótulo es la operación más frecuente
  con diferencia, y un modal dentro de otro modal para escribir cuatro letras es
  lo que hace que la gente prefiera llamar por teléfono.
*/

export interface ElementoEditable {
  codigo: string
  nombre: string
  /** Lo que se lee debajo del nombre. Opcional. */
  pista?: string | null
  activo: boolean
  /** Cierto si es un encabezado de grupo: se pinta distinto y no se sangra. */
  esGrupo?: boolean
}

export function ListaEditable({
  elementos,
  onGuardar,
  onBorrar,
  onAnadir,
  error,
  guardando,
  etiquetaAnadir = 'Añadir',
  placeholderNuevo = 'Nombre',
  /** Lo que se dice cuando no se puede borrar y hay que apagar. */
  nota,
}: {
  elementos: ElementoEditable[]
  onGuardar: (e: { codigo: string; nombre: string; activo: boolean }) => Promise<unknown>
  onBorrar: (codigo: string) => Promise<unknown>
  onAnadir: (nombre: string) => Promise<unknown>
  error?: unknown
  guardando?: boolean
  etiquetaAnadir?: string
  placeholderNuevo?: string
  nota?: string
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState('')
  const [anadiendo, setAnadiendo] = useState(false)
  const [nuevo, setNuevo] = useState('')

  const empezar = (e: ElementoEditable) => {
    setEditando(e.codigo)
    setBorrador(e.nombre)
  }

  const guardarNombre = async (e: ElementoEditable) => {
    const nombre = borrador.trim()
    // Sin cambio no se llama a la base: un guardado que no guarda nada gasta un
    // viaje y ensucia la auditoría.
    if (nombre.length >= 3 && nombre !== e.nombre) {
      await onGuardar({ codigo: e.codigo, nombre, activo: e.activo })
    }
    setEditando(null)
  }

  return (
    <div>
      <ul className="divide-hairline divide-y">
        {elementos.map((e) => (
          <li
            key={e.codigo}
            className={cn(
              'flex items-center gap-3 py-2.5',
              e.esGrupo ? 'mt-1' : 'pl-4',
              !e.activo && 'opacity-45',
            )}
          >
            {editando === e.codigo ? (
              <>
                <div className="min-w-0 grow">
                  <Input
                    label="Nombre"
                    ocultarEtiqueta
                    value={borrador}
                    onChange={(ev) => setBorrador(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') void guardarNombre(e)
                      if (ev.key === 'Escape') setEditando(null)
                    }}
                    autoFocus
                  />
                </div>
                <Button variant="ghost" onClick={() => void guardarNombre(e)} title="Guardar">
                  <Check className="size-4" />
                </Button>
                <Button variant="ghost" onClick={() => setEditando(null)} title="Dejarlo como estaba">
                  <X className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0 grow">
                  <p
                    className={cn(
                      'truncate text-sm',
                      e.esGrupo ? 'text-ink/90 font-semibold' : 'text-ink/75',
                    )}
                  >
                    {e.nombre}
                  </p>
                  {e.pista ? <p className="text-ink/40 truncate text-xs">{e.pista}</p> : null}
                </div>

                <Interruptor
                  encendido={e.activo}
                  onCambio={(v) => void onGuardar({ codigo: e.codigo, nombre: e.nombre, activo: v })}
                  etiqueta={e.activo ? `Dejar de usar ${e.nombre}` : `Volver a usar ${e.nombre}`}
                />

                <Button variant="ghost" onClick={() => empezar(e)} title="Cambiar el nombre">
                  <Pencil className="size-4" />
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => void onBorrar(e.codigo)}
                  title="Borrar, si nunca se ha usado"
                >
                  <Trash2 className="text-ink/35 size-4" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      {anadiendo ? (
        <div className="mt-4 flex items-end gap-2">
          <div className="grow">
            <Input
              label="Nombre"
              placeholder={placeholderNuevo}
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setAnadiendo(false)
              }}
              autoFocus
            />
          </div>
          <Button
            disabled={nuevo.trim().length < 3 || guardando}
            onClick={async () => {
              await onAnadir(nuevo.trim())
              setNuevo('')
              setAnadiendo(false)
            }}
          >
            Añadir
          </Button>
          <Button variant="ghost" onClick={() => setAnadiendo(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="mt-4" onClick={() => setAnadiendo(true)}>
          <Plus className="size-4" />
          {etiquetaAnadir}
        </Button>
      )}

      {nota ? <p className="text-ink/40 mt-3 text-xs">{nota}</p> : null}

      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
    </div>
  )
}
