import { Hammer } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { IconTile } from '@/components/ui/IconTile'
import { PageHeader } from '@/components/PageHeader'

interface ModuloPendienteProps {
  title: string
  seccion: string
}

/**
 * Pantalla temporal de los módulos aún no construidos.
 *
 * Existe para que cada entrada del menú lleve a algún sitio: un enlace que no
 * responde se lee como una aplicación rota, no como una pendiente.
 */
export function ModuloPendiente({ title, seccion }: ModuloPendienteProps) {
  return (
    <>
      <PageHeader title={title} description={seccion} />

      <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <IconTile tone="royal" size="lg">
          <Hammer />
        </IconTile>
        <h2 className="text-ink/85 mt-4 text-xl font-medium">Todavía no construido</h2>
        <p className="text-ink/55 mt-1.5 max-w-md text-base leading-relaxed">
          Esta pantalla entra cuando se defina la base de datos. La navegación y el diseño
          ya están en su sitio.
        </p>
      </Card>
    </>
  )
}
