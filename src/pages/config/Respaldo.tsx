import { useState } from 'react'
import { Database, Download, Lock, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useDescargarRespaldo, useResumenRespaldo } from '@/lib/api/respaldo'
import { fechaHora } from '@/lib/formato'

const peso = (bytes: number) =>
  bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`

/**
 * La copia de todos los datos, para llevársela.
 *
 * Hay dos cosas que esta pantalla tiene que conseguir, y la segunda es más
 * difícil que la primera. Una es que el respaldo se pueda sacar sin entrar al
 * panel de Supabase. La otra es que quien lo saque entienda qué tiene en la
 * mano: un archivo con las cédulas, los sueldos y las cuentas bancarias de todo
 * el personal, sin ninguna de las protecciones que tiene dentro del sistema.
 *
 * Por eso el aviso va antes del botón y no debajo, y por eso hay una
 * confirmación que lo repite. No es ceremonia: el archivo se descarga una vez y
 * después vive en una carpeta durante años.
 */
export function Respaldo() {
  const { data: resumen, isPending, error } = useResumenRespaldo()
  const descargar = useDescargarRespaldo()
  const [confirmando, setConfirmando] = useState(false)

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />

  const autorizado = resumen?.autorizado ?? false

  return (
    <>
      <PageHeader
        title="Respaldo de la base"
        description="Una copia de todos los datos del sistema, para guardarla fuera de aquí."
      />

      {/* ------------------------- Quien no puede ------------------------- */}
      {!autorizado ? (
        <Card className="mx-auto mt-6 max-w-lg text-center">
          <div className="bg-ink/6 text-ink/45 mx-auto flex size-12 items-center justify-center rounded-full">
            <Lock className="size-6" />
          </div>
          <h2 className="text-ink/90 mt-4 text-lg font-semibold">
            Esto no se reparte
          </h2>
          <p className="text-ink/55 mt-2 text-sm leading-relaxed">
            El respaldo lleva juntas las cédulas, los sueldos y las cuentas bancarias de todo el
            personal, junto con los precios, los clientes y la bitácora completa. Descargarlo pide
            un rol propio que tienen solo dos personas, y no lo abre ni quien administra el sistema
            por el hecho de administrarlo.
          </p>
        </Card>
      ) : (
        <>
          {/* -------------------------- El aviso -------------------------- */}
          <div className="border-danger/30 bg-danger/6 mb-4 flex items-start gap-3 rounded-[8px] border p-4">
            <ShieldAlert className="text-danger mt-0.5 size-5 shrink-0" />
            <div className="text-sm">
              <p className="text-ink/85 font-medium">
                Este es el archivo más delicado que produce el sistema
              </p>
              <p className="text-ink/65 mt-1 leading-relaxed">
                Dentro van las cédulas, los sueldos y las cuentas bancarias de todo el personal, los
                precios, los clientes y la bitácora entera. Todo lo que aquí dentro está repartido
                por permisos, ahí queda junto y sin ninguna protección. Guárdalo donde guardarías el
                libro de nómina en papel, y no lo dejes en la carpeta de descargas de una
                computadora que usa más gente.
              </p>
            </div>
          </div>

          <Card>
            <div className="flex flex-wrap items-center gap-6">
              <div className="bg-royal-600/10 text-royal-600 dark:text-royal-300 flex size-12 shrink-0 items-center justify-center rounded-[10px]">
                <Database className="size-6" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-ink/85 font-medium">
                  {resumen?.tablas} tablas · alrededor de {resumen?.filas.toLocaleString('es-VE')}{' '}
                  filas
                </p>
                <p className="text-ink/50 mt-0.5 text-xs">
                  {resumen?.ultimo
                    ? `Último respaldo: ${fechaHora(resumen.ultimo)}${
                        resumen.ultimo_por ? ` · ${resumen.ultimo_por}` : ''
                      }`
                    : 'Todavía no se ha descargado ninguno.'}
                </p>
              </div>

              <Button
                icon={<Download className="size-[18px]" />}
                disabled={descargar.isPending}
                onClick={() => setConfirmando(true)}
              >
                {descargar.isPending ? 'Armando el respaldo…' : 'Descargar respaldo'}
              </Button>
            </div>

            {descargar.error ? <ErrorDeCarga error={descargar.error} className="mt-4" /> : null}

            {descargar.isSuccess && descargar.data ? (
              <p className="border-hairline text-success mt-4 border-t pt-4 text-sm">
                Descargado: <span className="font-mono">{descargar.data.nombre}</span> ·{' '}
                {peso(descargar.data.bytes)}. Quedó anotado en la auditoría quién lo hizo y cuándo.
              </p>
            ) : null}
          </Card>

          {/* -------------------- Qué lleva y qué no -------------------- */}
          <Card className="mt-4">
            <h2 className="text-royal-600 dark:text-royal-300 border-royal-600 dark:border-royal-300 mb-3 border-b pb-1.5 text-xs font-bold tracking-wider uppercase">
              Qué es y cómo se usa
            </h2>

            <dl className="text-sm">
              <div className="border-hairline flex flex-wrap justify-between gap-x-6 gap-y-1 border-b py-2.5">
                <dt className="text-ink/45">Qué lleva</dt>
                <dd className="text-ink/75 max-w-md text-right">
                  Todos los datos: personal, inventario, compras, ventas, tesorería, nómina y la
                  bitácora de auditoría completa.
                </dd>
              </div>
              <div className="border-hairline flex flex-wrap justify-between gap-x-6 gap-y-1 border-b py-2.5">
                <dt className="text-ink/45">Qué no lleva</dt>
                <dd className="text-ink/75 max-w-md text-right">
                  Las contraseñas, que están cifradas aparte y no se tocan. Al restaurar hay que
                  volver a crear los usuarios.
                </dd>
              </div>
              <div className="border-hairline flex flex-wrap justify-between gap-x-6 gap-y-1 border-b py-2.5">
                <dt className="text-ink/45">Para reconstruir la base</dt>
                <dd className="text-ink/75 max-w-md text-right">
                  Hacen falta dos cosas: las migraciones del repositorio, que son la estructura, y
                  este archivo, que son los datos. En ese orden.
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
                <dt className="text-ink/45">Cada descarga queda escrita</dt>
                <dd className="text-ink/75 max-w-md text-right">
                  En la auditoría, con el nombre de quien la pidió, la fecha y la hora.
                </dd>
              </div>
            </dl>
          </Card>
        </>
      )}

      {/* ------------------------ La confirmación ------------------------ */}
      <Modal
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        titulo="Descargar el respaldo completo"
        ancho="sm"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button
              disabled={descargar.isPending}
              onClick={async () => {
                await descargar.mutateAsync()
                setConfirmando(false)
              }}
            >
              {descargar.isPending ? 'Armando…' : 'Descargar'}
            </Button>
          </>
        }
      >
        <p className="text-ink/70 text-sm leading-relaxed">
          El archivo que va a bajar a esta computadora lleva{' '}
          <strong className="text-ink/90 font-medium">
            las cédulas, los sueldos y las cuentas bancarias de todo el personal
          </strong>
          , además de los precios, los clientes y la bitácora completa. Sin clave y sin permisos:
          quien lo abra lo ve todo.
        </p>
        <p className="text-ink/55 mt-3 text-xs leading-relaxed">
          Va a quedar anotado en la auditoría que lo descargaste tú, con la fecha y la hora. Si esta
          computadora la usa alguien más, guarda el archivo en otro sitio y bórralo de la carpeta de
          descargas.
        </p>
      </Modal>
    </>
  )
}
