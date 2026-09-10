import { useState } from 'react'
import { Landmark, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_SITIOS } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Interruptor } from '@/components/ui/Interruptor'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useAlmacenes, useGuardarPropietario, usePropietarios } from '@/lib/api/inventario'
import { useMaquinaria } from '@/lib/api/maquinaria'
import { useMisPermisos } from '@/lib/api/usuarios'
import type { Propietario } from '@/lib/api/inventario'

/**
 * De quién es el material que la cantera tiene a mano.
 *
 * POR QUÉ EXISTE ESTA PANTALLA
 *
 * Christopher, después de que se entregara lo del dueño: «no se apreció dónde
 * ubicar lo de la gobernación o registrarlo». Y tenía razón: la tabla nació con
 * sus dos filas metidas a mano en una migración, el desplegable del almacén las
 * ofrecía, y no había ninguna puerta para añadir la tercera. Ya se sabe que va a
 * haberla — en la conversación de facturación aparecieron Rápido y la comunidad.
 *
 * DÓNDE VIVE, Y POR QUÉ AQUÍ
 *
 * Junto a Almacenes y Talleres, y no en Configuración. El dueño no es un ajuste
 * del sistema: es una propiedad del sitio donde se guarda el material, y se
 * elige desde el mismo formulario que está dos pestañas más allá. Quien viene a
 * crear un almacén de la gobernación y descubre que no existe el dueño lo tiene
 * a un clic, no a tres menús.
 *
 * LO QUE ESTA PANTALLA NO HACE
 *
 * No deja cambiar quién somos nosotros. `es_la_casa` no viaja en la RPC: de esa
 * marca cuelga «cuánto vale lo nuestro», y moverla desde un formulario de
 * catálogo cambiaría esa respuesta sin que nadie relacionara las dos cosas.
 *
 * No borra. Se desactiva, y solo si no le cuelga ningún almacén ni máquina: lo
 * que ya apuntaba a un dueño sigue apuntando, porque esas sillas siguieron
 * siendo de quien eran.
 */
export function Duenos() {
  const { data, isPending, error } = usePropietarios(false)
  const { data: almacenes } = useAlmacenes(false)
  const { data: maquinas } = useMaquinaria(false)
  const guardar = useGuardarPropietario()

  const { puede } = useMisPermisos()
  const editable = puede('INVENTARIO', 'ESCRITURA')

  const [edicion, setEdicion] = useState<{
    codigo: string
    nombre: string
    activo: boolean
    esNuevo: boolean
    esLaCasa: boolean
  } | null>(null)

  const abrir = (d?: Propietario) =>
    setEdicion({
      codigo: d?.codigo ?? '',
      nombre: d?.nombre ?? '',
      activo: d?.activo ?? true,
      esNuevo: !d,
      esLaCasa: d?.es_la_casa ?? false,
    })

  /*
    CUÁNTO CUELGA DE CADA DUEÑO.

    Es lo que convierte la lista en algo que se puede mirar: «Gobernación · 2
    almacenes, 1 máquina» contesta de un vistazo cuánto material ajeno hay dentro
    de la operación. Y de paso explica por qué a algunos no los deja apagar.
  */
  const cuelga = (codigo: string) => ({
    almacenes: (almacenes ?? []).filter((a) => (a.propietario ?? 'LACANTERA') === codigo).length,
    maquinas: (maquinas ?? []).filter((m) => (m.propietario ?? 'LACANTERA') === codigo).length,
  })

  return (
    <>
      <PageHeader
        eyebrow="Inventario"
        title="Dueños del material"
        description="No todo lo que la cantera tiene a mano es suyo. Aquí se dice de quién puede ser, y cada almacén y cada máquina elige uno de esta lista."
        actions={
          editable ? (
            <Button icon={<Plus />} onClick={() => abrir()}>
              Nuevo dueño
            </Button>
          ) : null
        }
      />
      <Pestanas pestanas={PESTANAS_SITIOS} />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error && (data ?? []).length === 0 ? (
        <Card>
          <Vacio
            titulo="Todavía no hay dueños"
            descripcion="Debería haber al menos uno: la propia empresa."
          />
        </Card>
      ) : null}

      {!isPending && (data ?? []).length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((d) => {
            const c = cuelga(d.codigo)
            const total = c.almacenes + c.maquinas
            return (
              <Card
                key={d.codigo}
                className={editable ? 'cursor-pointer' : undefined}
                onClick={editable ? () => abrir(d) : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-ink/45 text-2xs font-mono tracking-[0.14em]">{d.codigo}</p>
                    <h2 className="text-ink/90 mt-1 truncate text-lg font-medium">{d.nombre}</h2>
                  </div>

                  {/* La casa lleva su propia marca, y no la de lo ajeno: aquí
                      sí conviene decir cuál somos, porque la pantalla entera va
                      de distinguirlos. En las demás se calla, que es donde
                      repetirlo lo convertiría en ruido. */}
                  {d.es_la_casa ? (
                    <Chip tone="success">Nosotros</Chip>
                  ) : (
                    <Chip tone="warning" icon={<Landmark />}>
                      Ajeno
                    </Chip>
                  )}
                </div>

                <p className="text-ink/55 mt-3 text-xs leading-relaxed">
                  {total === 0
                    ? 'Todavía no tiene nada a su nombre.'
                    : [
                        c.almacenes > 0
                          ? `${c.almacenes} almacén${c.almacenes === 1 ? '' : 'es'}`
                          : null,
                        c.maquinas > 0
                          ? `${c.maquinas} máquina${c.maquinas === 1 ? '' : 's'}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </p>

                {!d.activo ? (
                  <Chip tone="neutral" className="mt-3">
                    No se ofrece
                  </Chip>
                ) : null}
              </Card>
            )
          })}
        </div>
      ) : null}

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.esNuevo ? 'Nuevo dueño' : edicion.nombre}
          acciones={
            <>
              <Button variant="outline" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  guardar.isPending ||
                  edicion.codigo.trim().length < 3 ||
                  edicion.nombre.trim().length < 2
                }
                onClick={async () => {
                  await guardar.mutateAsync({
                    codigo: edicion.codigo.trim(),
                    nombre: edicion.nombre.trim(),
                    activo: edicion.activo,
                  })
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            {/*
              EL CÓDIGO SOLO SE ESCRIBE UNA VEZ.

              Es la clave primaria, y de ella cuelgan los almacenes y las
              máquinas. Cambiarlo sería crear otro dueño y dejar huérfano al
              anterior, así que al corregir se enseña pero no se toca.
            */}
            <Input
              label="Código"
              placeholder="GOBERNACION"
              value={edicion.codigo}
              disabled={!edicion.esNuevo}
              hint={
                edicion.esNuevo
                  ? 'Sin espacios ni tildes. Es lo que queda escrito en cada almacén y no se puede cambiar después.'
                  : 'No se cambia: de él cuelgan los almacenes y las máquinas que ya son suyos.'
              }
              onChange={(e) =>
                setEdicion((x) =>
                  x
                    ? { ...x, codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }
                    : x,
                )
              }
            />
            <Input
              label="Nombre"
              placeholder="Gobernación del estado Bolívar"
              value={edicion.nombre}
              hint="Es lo que se lee en las listas y en la marca de lo ajeno."
              onChange={(e) => setEdicion((x) => (x ? { ...x, nombre: e.target.value } : x))}
            />

            {/*
              A NOSOTROS NO SE NOS APAGA, y por eso el interruptor no aparece.
              La base también lo rechaza; esconderlo evita ofrecer una puerta que
              está cerrada.
            */}
            {!edicion.esLaCasa ? (
              <Interruptor
                etiqueta="Se ofrece al elegir dueño"
                detalle="Apagarlo lo saca de los desplegables. Lo que ya era suyo sigue siéndolo: no se puede apagar si todavía le cuelga algún almacén o alguna máquina."
                encendido={edicion.activo}
                onCambio={(v) => setEdicion((x) => (x ? { ...x, activo: v } : x))}
              />
            ) : (
              <p className="text-ink/45 text-xs leading-relaxed">
                Esta es la propia empresa. No se puede desactivar: de ella cuelga «cuánto vale lo
                nuestro», y sin ella ningún desplegable ofrecería a La Cantera.
              </p>
            )}

            {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
