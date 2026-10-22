import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Cargando } from '@/components/ui/Estado'
import { ListaEditable } from '@/components/ListaEditable'
import { useMisPermisos } from '@/lib/api/usuarios'
import {
  useCategoriasDeGasto,
  useEliminarCategoriaDeGasto,
  useGuardarCategoriaDeGasto,
} from '@/lib/api/gastos'

/*
  LAS CATEGORÍAS DE GASTO, A LA MEDIDA DE CADA EMPRESA.

  Christopher dio el ejemplo: «Planta» para los repuestos de la mandíbula o el
  cono, «Víveres» para la comida. No es una lista cerrada — se crean las que
  hagan falta, sin pedirle nada a nadie que escriba código.

  Propia de este módulo, y no la `categorias_gasto` de Centro de Costo: ese
  módulo está en evaluación de cambiar o eliminarse, y esta no puede depender
  de su suerte.
*/
export function Categorias() {
  const { puede } = useMisPermisos()
  const puedeAdministrar = puede('GASTOS', 'TOTAL')
  const { data, isPending } = useCategoriasDeGasto()
  const guardar = useGuardarCategoriaDeGasto()
  const borrar = useEliminarCategoriaDeGasto()

  if (!puedeAdministrar) {
    return (
      <p className="text-ink/60 mx-auto mt-10 max-w-sm text-center text-sm">
        Su usuario no tiene permiso para administrar las categorías de gasto.
      </p>
    )
  }

  return (
    <>
      <PageHeader
        title="Categorías de gasto"
        description="Cómo se agrupan las facturas en el informe: Planta, Víveres, o las que hagan falta."
      />

      {isPending ? <Cargando /> : null}

      {data ? (
        <Card>
          <ListaEditable
            elementos={data.map((c) => ({ codigo: c.codigo, nombre: c.nombre, activo: c.activa }))}
            onGuardar={(e) => guardar.mutateAsync({ codigo: e.codigo, nombre: e.nombre, activa: e.activo })}
            onBorrar={(codigo) => borrar.mutateAsync(codigo)}
            onAnadir={(nombre) => guardar.mutateAsync({ codigo: nombre, nombre, activa: true })}
            error={guardar.error ?? borrar.error}
            guardando={guardar.isPending || borrar.isPending}
            etiquetaAnadir="Añadir una categoría"
            placeholderNuevo="Ej.: Repuestos de taller"
            nota="Apagada deja de ofrecerse al registrar; una con facturas detrás no se puede borrar, solo apagar."
          />
        </Card>
      ) : null}
    </>
  )
}
