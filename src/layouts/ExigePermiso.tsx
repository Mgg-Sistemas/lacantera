import { Link, Outlet, useLocation } from 'react-router'
import { Lock } from 'lucide-react'
import { esRutaPropia, moduloDeRuta } from '@/config/navigation'
import { Card } from '@/components/ui/Card'
import { Cargando } from '@/components/ui/Estado'
import { useMisPermisos, useModulos } from '@/lib/api/usuarios'

/**
 * La reja, en la pantalla.
 *
 * Esconder el enlace del menú no basta: la dirección se escribe a mano, llega
 * en un mensaje o queda en el historial del navegador. Sin esto, quien entrara
 * a /app/nomina/personal sin permiso no vería un "no", vería una tabla vacía —
 * y una tabla vacía se lee como "no hay nadie contratado", que es peor que un
 * "no".
 *
 * Esto tampoco es la seguridad. La seguridad está en la base, que no devuelve
 * las filas. Esto es decirlo con palabras.
 */
export function ExigePermiso() {
  const { pathname } = useLocation()
  const { puede, resuelto, isPending } = useMisPermisos()
  const { data: modulos } = useModulos()

  if (esRutaPropia(pathname)) return <Outlet />

  const codigo = moduloDeRuta(pathname)

  if (isPending) return <Cargando />
  if (!resuelto || puede(codigo)) return <Outlet />

  const nombre = modulos?.find((m) => m.codigo === codigo)?.nombre ?? codigo

  return (
    <Card className="mx-auto mt-10 max-w-lg text-center">
      <div className="bg-ink/6 text-ink/45 mx-auto flex size-12 items-center justify-center rounded-full">
        <Lock className="size-6" />
      </div>
      <h2 className="text-ink/90 mt-4 text-lg font-semibold">{nombre} no está a tu alcance</h2>
      <p className="text-ink/55 mt-2 text-sm">
        Tu rol no tiene acceso a este módulo. Si lo necesitas para tu trabajo, pídeselo a quien
        administra el sistema.
      </p>
      <Link
        to="/app"
        className="text-royal-600 hover:text-royal-700 dark:text-royal-300 mt-5 inline-block text-sm font-medium"
      >
        Volver al panel
      </Link>
    </Card>
  )
}
