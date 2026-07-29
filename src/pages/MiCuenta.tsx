import { KeyRound, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { TarjetaHuella } from '@/components/TarjetaHuella'
import { FormularioClave } from '@/components/FormularioClave'
import { useMiPerfil, useRoles } from '@/lib/api/usuarios'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="border-hairline flex items-baseline justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="text-ink/50 shrink-0 text-sm">{etiqueta}</span>
      <span className="text-ink/85 text-right text-sm font-medium">{valor}</span>
    </div>
  )
}

/**
 * Mi cuenta.
 *
 * Los datos no se editan aquí: el nombre, el cargo y la cédula de alguien son
 * lo que la empresa afirma de esa persona, y van en los documentos que firma.
 * Cambiarlos es cosa de la administración. Lo que sí es suyo y de nadie más es
 * la clave.
 */
export function MiCuenta() {
  const { data: yo, isPending, error } = useMiPerfil()
  const { data: roles } = useRoles()

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />
  if (!yo) return <ErrorDeCarga error={new Error('No se encontró tu perfil.')} />

  const nombreDeRol = (codigo: string) =>
    roles?.find((r) => r.codigo === codigo)?.nombre ?? codigo

  const desde = new Date(yo.creado_en).toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      <PageHeader title="Mi cuenta" description="Tus datos y tu clave." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={yo.nombre}
            subtitle="Para cambiar estos datos, habla con quien administra el sistema."
          />

          <div className="mt-4">
            <Dato etiqueta="Usuario" valor={yo.usuario} />
            <Dato etiqueta="Cargo" valor={yo.cargo ?? '—'} />
            <Dato etiqueta="Cédula" valor={yo.cedula ?? '—'} />
            <Dato etiqueta="Teléfono" valor={yo.telefono ?? '—'} />
            <Dato etiqueta="En el sistema desde" valor={desde} />
          </div>

          <div className="mt-5">
            <p className="text-ink/50 mb-2 text-sm">Roles</p>
            <div className="flex flex-wrap gap-1.5">
              {yo.roles.length === 0 ? (
                <span className="text-ink/40 text-sm">Sin roles asignados</span>
              ) : (
                yo.roles.map((r) => (
                  <Chip key={r} tone={r === 'ADMIN' ? 'safety' : 'neutral'}>
                    {nombreDeRol(r)}
                  </Chip>
                ))
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Cambiar la clave"
            subtitle="Nadie más debería saberla, ni siquiera quien administra el sistema."
          />

          {yo.debe_cambiar_clave ? (
            <div className="border-warning/30 bg-warning-soft text-warning mt-4 flex items-start gap-2.5 rounded-[6px] border p-3 text-sm">
              <ShieldAlert className="mt-px size-[18px] shrink-0" />
              <span>
                Tu clave todavía es la que te asignó la administración. Cámbiala por una que solo
                tú sepas: mientras tanto, lo que registres con ella no distingue si fuiste tú.
              </span>
            </div>
          ) : null}

          <div className="mt-4">
            <FormularioClave />
          </div>
        </Card>

        <TarjetaHuella />
      </div>
    </>
  )
}

/**
 * El primer día, a pantalla completa.
 *
 * No es la misma pantalla con un aviso: es la única pantalla. Con un aviso
 * descartable, la clave prestada dura meses — y una clave que conocen dos
 * personas convierte cada firma del sistema en la firma de cualquiera de las
 * dos.
 */
export function ExigeClaveNueva({ nombre }: { nombre: string }) {
  return (
    <div className="bg-canvas flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="bg-warning/12 text-warning mx-auto flex size-12 items-center justify-center rounded-full">
          <KeyRound className="size-6" />
        </div>

        <h1 className="text-ink/90 mt-5 text-center text-2xl font-semibold tracking-tight">
          Ponle tu propia clave
        </h1>
        <p className="text-ink/55 mt-2 text-center text-base">
          Hola, {nombre}. La clave con la que acabas de entrar te la dio la administración, así
          que la saben dos personas. Elige una que sepas solo tú para seguir.
        </p>

        <div className="bg-surface shadow-card rounded-card border-hairline mt-7 border p-6">
          <FormularioClave textoBoton="Guardar y entrar" />
        </div>
      </div>
    </div>
  )
}
