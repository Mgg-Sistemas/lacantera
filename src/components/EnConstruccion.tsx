import { useState } from 'react'
import { Link } from 'react-router'
import { Construction } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useMisRoles } from '@/lib/api/catalogo'

/*
  LA PANTALLA DE OBRA

  Los módulos que quedaron fuera del MVP no se cerraron: sus direcciones
  siguen respondiendo, y es a propósito — el equipo los sigue desarrollando y
  cerrarlos lo dejaría sin poder verlos.

  Pero una dirección abierta se descubre: llega en un mensaje, queda en el
  historial del navegador, o alguien la escribe por curiosidad. Y encontrarse
  una pantalla a medio hacer sin aviso ninguno es peor que no encontrar nada:
  se prueba, se guarda algo, y luego hay que explicar por qué ese dato no
  cuadra con el resto.

  Así que la dirección responde, pero lo primero que dice es que aquí todavía
  se está trabajando.

  POR QUÉ HAY UNA PUERTA DE SERVICIO

  Si esto bloqueara a todo el mundo sin excepción, cerraría las rutas de
  hecho, que es justo lo que se decidió no hacer. El equipo tiene que poder
  entrar a probar lo que está construyendo.

  La puerta la ve solo quien tiene ADMIN —las tres cuentas del equipo— y se
  recuerda durante la sesión de la pestaña, para no repetir el clic en cada
  navegación. Se guarda en `sessionStorage` y no en `localStorage` a
  propósito: cerrar la pestaña vuelve a poner el cartel, así que nadie se deja
  la puerta abierta sin darse cuenta en el equipo que se usa para enseñar el
  sistema.
*/

const LLAVE = 'lacantera:paso-a-obra'

/** Se lee al montar, no en cada render: dentro de una sesión no cambia sola. */
function yaPaso(): boolean {
  try {
    return sessionStorage.getItem(LLAVE) === '1'
  } catch {
    // Navegador con el almacenamiento capado. Sin memoria del paso, pero la
    // pantalla sigue funcionando: se pulsa cada vez.
    return false
  }
}

export function EnConstruccion({ children }: { children: React.ReactNode }) {
  const [pasar, setPasar] = useState(yaPaso)
  const { puede: tieneRol } = useMisRoles()

  if (pasar) return <>{children}</>

  return (
    <Card className="mx-auto mt-10 max-w-lg text-center">
      <div className="bg-warning/14 text-warning mx-auto flex size-12 items-center justify-center rounded-full">
        <Construction className="size-6" />
      </div>

      <h2 className="text-ink/90 mt-4 text-lg font-semibold">En construcción</h2>

      <p className="text-ink/55 mt-2 text-sm">
        Esta parte del sistema todavía se está trabajando y no forma parte de lo que hoy está
        en uso. Lo que se haga aquí puede perderse o no cuadrar con el resto.
      </p>

      <p className="text-ink/45 mt-3 text-xs">
        Si llegaste por un enlace o escribiendo la dirección, no te equivocaste: la pantalla
        existe, pero aún no está lista.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link to="/app">
          <Button size="sm">Volver al panel</Button>
        </Link>

        {/* Solo para el equipo, y en tono menor: es una puerta de servicio, no
            una invitación. */}
        {tieneRol('ADMIN') ? (
          <button
            type="button"
            className="text-ink/40 hover:text-ink/70 text-xs underline underline-offset-2 transition-colors"
            onClick={() => {
              try {
                sessionStorage.setItem(LLAVE, '1')
              } catch {
                // Sin memoria, pero el paso de esta vez sí vale.
              }
              setPasar(true)
            }}
          >
            Entrar de todos modos
          </button>
        ) : null}
      </div>
    </Card>
  )
}
