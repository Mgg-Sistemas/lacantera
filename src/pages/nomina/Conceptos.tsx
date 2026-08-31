import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_REGLAS } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  useCambiarEstadoConcepto,
  useConceptos,
  useGuardarConceptoNomina,
} from '@/lib/api/nomina'
import type { Concepto } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { cn } from '@/lib/cn'

/*
  LOS BONOS Y LOS DESCUENTOS QUE LA CASA SE INVENTA.

  «Desconocemos el motivo o las razones o títulos de estos bonos, por lo tanto
  lo correcto es permitirle gestionar.» Bono de transporte para quien no tenga
  vehículo, bono por rendimiento para quien cumple: la lista no la puede
  adivinar quien programa, y sembrarla por migración obligaría a una migración
  cada vez que a la gerencia se le ocurre uno.

  QUÉ NO SE TOCA DESDE AQUÍ

  Los conceptos que el sistema calcula solo —el sueldo, el bono de
  alimentación, las horas extra, el paro forzoso—. Esos los busca el cálculo
  por su código, y apagarlos o renombrarlos dejaría el recibo sin una línea que
  la ley exige. Se enseñan, para que se entienda de dónde sale cada renglón del
  recibo, pero sin botones.

  Y NO SE BORRA NINGUNO

  Un concepto usado en un período viejo no se puede borrar sin dejar recibos
  huérfanos, y esos recibos son papeles que ya se entregaron y que alguien
  puede traer de vuelta dentro de dos años. Se apaga: deja de ofrecerse al
  cargar novedades y sigue explicando lo que ya está impreso.
*/

const TIPOS = [
  { valor: 'ASIGNACION', etiqueta: 'Bono — suma al recibo' },
  { valor: 'DEDUCCION', etiqueta: 'Descuento — resta del recibo' },
]

interface Edicion {
  codigo: string
  nombre: string
  tipo: 'ASIGNACION' | 'DEDUCCION'
  incide_normal: boolean
  incide_integral: boolean
  orden: string
  base_legal: string
  /** Existía ya: el código no se toca, porque es con lo que lo busca el cálculo. */
  esNuevo: boolean
}

const EN_BLANCO: Edicion = {
  codigo: '',
  nombre: '',
  tipo: 'ASIGNACION',
  incide_normal: false,
  incide_integral: false,
  orden: '500',
  base_legal: '',
  esNuevo: true,
}

export function Conceptos() {
  const { data, isPending, error } = useConceptos(false)
  const guardar = useGuardarConceptoNomina()
  const cambiarEstado = useCambiarEstadoConcepto()
  const { puede } = useMisRoles()
  const puedeEditar = puede('RRHH')

  const [edicion, setEdicion] = useState<Edicion | null>(null)

  if (isPending) return <Cargando texto="Cargando los conceptos…" />
  if (error) return <ErrorDeCarga error={error} />

  const conceptos = data ?? []
  const deLaCasa = conceptos.filter((c) => c.origen === 'NOVEDAD')
  const delSistema = conceptos.filter((c) => c.origen === 'AUTOMATICO')

  const abrir = (c: Concepto) =>
    setEdicion({
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: c.tipo === 'DEDUCCION' ? 'DEDUCCION' : 'ASIGNACION',
      incide_normal: c.incide_normal,
      incide_integral: c.incide_integral,
      orden: String(c.orden),
      base_legal: c.base_legal ?? '',
      esNuevo: false,
    })

  return (
    <>
      <PageHeader
        eyebrow="Nómina"
        title="Bonos y descuentos"
        description="Los conceptos que se cargan a mano cada período. Los que el sistema calcula solo se enseñan abajo, sin tocar."
        actions={
          puedeEditar ? (
            <Button icon={<Plus />} onClick={() => setEdicion(EN_BLANCO)}>
              Nuevo concepto
            </Button>
          ) : undefined
        }
      />

      <Pestanas pestanas={PESTANAS_REGLAS} />

      <Card className="mt-4" flush>
        <div className="border-hairline border-b px-5 py-3">
          <h2 className="text-ink/85 text-sm font-semibold">Los que se cargan a mano</h2>
          <p className="text-ink/50 mt-0.5 text-xs">
            Es lo que aparece al agregar un bono o un descuento a alguien en el período.
          </p>
        </div>

        {deLaCasa.length === 0 ? (
          <div className="p-5">
            <Vacio
              titulo="Todavía no hay ninguno"
              descripcion="Crea el primero: un bono de transporte, uno por rendimiento, la cuota de un préstamo."
            />
          </div>
        ) : (
          <ul>
            {deLaCasa.map((c) => (
              <li
                key={c.codigo}
                className={cn(
                  'border-hairline flex flex-wrap items-center gap-3 border-b px-5 py-3 last:border-0',
                  !c.activo && 'opacity-55',
                )}
              >
                <div className="min-w-0 grow">
                  <p className="text-ink/85 text-sm font-medium">{c.nombre}</p>
                  <p className="text-ink/45 text-xs">
                    <span className="font-mono">{c.codigo}</span>
                    {c.base_legal ? ` · ${c.base_legal}` : ''}
                  </p>
                </div>

                <Chip tone={c.tipo === 'ASIGNACION' ? 'success' : 'warning'}>
                  {c.tipo === 'ASIGNACION' ? 'Suma' : 'Resta'}
                </Chip>
                {/*
                  Incidir quiere decir que entra en la base con la que se
                  calculan las prestaciones y las vacaciones. Es la diferencia
                  entre un bono que solo se paga y uno que además arrastra
                  dinero detrás, y por eso se dice en la fila y no escondido.
                */}
                {c.incide_integral ? (
                  <Chip tone="royal" title="Entra en el salario integral: arrastra prestaciones.">
                    Integral
                  </Chip>
                ) : c.incide_normal ? (
                  <Chip tone="info" title="Entra en el salario normal.">
                    Normal
                  </Chip>
                ) : null}
                {!c.activo ? <Chip>Apagado</Chip> : null}

                {puedeEditar ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => abrir(c)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cambiarEstado.isPending}
                      onClick={() =>
                        void cambiarEstado.mutateAsync({ codigo: c.codigo, activo: !c.activo })
                      }
                    >
                      {c.activo ? 'Apagar' : 'Encender'}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {cambiarEstado.error ? <ErrorDeCarga error={cambiarEstado.error} className="mt-3" /> : null}

      <Card className="mt-4" flush>
        <div className="border-hairline border-b px-5 py-3">
          <h2 className="text-ink/85 text-sm font-semibold">Los que calcula el sistema</h2>
          <p className="text-ink/50 mt-0.5 text-xs">
            No se editan ni se apagan: el cálculo los busca por su código, y sin ellos el recibo
            saldría sin una línea que la ley exige. Se enseñan para saber de dónde sale cada
            renglón.
          </p>
        </div>
        <ul className="grid gap-x-6 gap-y-1 px-5 py-3 sm:grid-cols-2">
          {delSistema.map((c) => (
            <li key={c.codigo} className="text-ink/60 flex items-baseline gap-2 text-xs">
              <span className="font-mono text-ink/40 shrink-0">{c.codigo}</span>
              <span className="min-w-0 truncate">{c.nombre}</span>
            </li>
          ))}
        </ul>
      </Card>

      {edicion ? (
        <Modal
          abierto
          onCerrar={() => setEdicion(null)}
          titulo={edicion.esNuevo ? 'Nuevo concepto' : `Corregir ${edicion.codigo}`}
          descripcion="Lo que se pueda cargar a mano en un período: un bono, un descuento, la cuota de un préstamo."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setEdicion(null)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  guardar.isPending ||
                  edicion.nombre.trim().length < 3 ||
                  edicion.codigo.trim().length < 3
                }
                onClick={async () => {
                  await guardar.mutateAsync({
                    codigo: edicion.codigo,
                    nombre: edicion.nombre,
                    tipo: edicion.tipo,
                    incide_normal: edicion.incide_normal,
                    incide_integral: edicion.incide_integral,
                    orden: Number(edicion.orden) || 500,
                    base_legal: edicion.base_legal || null,
                  })
                  setEdicion(null)
                }}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="Cómo se llama"
              placeholder="Bono de transporte"
              hint="Es lo que va impreso en el recibo del trabajador."
              value={edicion.nombre}
              onChange={(e) =>
                setEdicion((x) =>
                  x
                    ? {
                        ...x,
                        nombre: e.target.value,
                        /*
                          El código se propone del nombre mientras es nuevo. Al
                          corregir no se toca: es con lo que están guardados los
                          montos ya cargados, y cambiarlo los dejaría sueltos.
                        */
                        codigo: x.esNuevo
                          ? e.target.value
                              .toUpperCase()
                              .normalize('NFD')
                              .replace(/[̀-ͯ]/g, '')
                              .replace(/[^A-Z0-9]+/g, '_')
                              .slice(0, 30)
                          : x.codigo,
                      }
                    : x,
                )
              }
            />

            <Input
              label="Código"
              hint={
                edicion.esNuevo
                  ? 'Se propone solo. Es con lo que el sistema lo guarda.'
                  : 'No se cambia: los montos ya cargados lo llevan.'
              }
              disabled={!edicion.esNuevo}
              value={edicion.codigo}
              onChange={(e) => setEdicion((x) => (x ? { ...x, codigo: e.target.value } : x))}
            />

            <Select
              label="Qué hace en el recibo"
              value={edicion.tipo}
              onChange={(e) =>
                setEdicion((x) =>
                  x ? { ...x, tipo: e.target.value as 'ASIGNACION' | 'DEDUCCION' } : x,
                )
              }
              opciones={TIPOS}
            />

            {/*
              LO QUE MÁS SE EQUIVOCA, Y POR ESO VA EXPLICADO.

              Incidir no es un detalle contable: decide si ese bono arrastra
              prestaciones, vacaciones y utilidades detrás. Un bono marcado como
              integral por error multiplica su costo real, y uno que debía serlo
              y no lo es le quita dinero al trabajador cuando salga.
            */}
            <div className="border-hairline rounded-card space-y-2.5 border p-3">
              <p className="text-ink/70 text-xs">
                Un bono puede quedarse en lo que se paga, o entrar además en la base con la que se
                calculan prestaciones y vacaciones. Eso último cuesta más y es lo que suele
                equivocarse.
              </p>
              <label className="text-ink/80 flex cursor-pointer items-start gap-2.5 text-sm select-none">
                <input
                  type="checkbox"
                  className="accent-royal-600 mt-0.5 size-4 shrink-0"
                  checked={edicion.incide_normal}
                  onChange={(e) =>
                    setEdicion((x) => (x ? { ...x, incide_normal: e.target.checked } : x))
                  }
                />
                <span>
                  Entra en el salario normal
                  <span className="text-ink/50 mt-0.5 block text-xs">
                    Cuenta para vacaciones y para el día de descanso.
                  </span>
                </span>
              </label>
              <label className="text-ink/80 flex cursor-pointer items-start gap-2.5 text-sm select-none">
                <input
                  type="checkbox"
                  className="accent-royal-600 mt-0.5 size-4 shrink-0"
                  checked={edicion.incide_integral}
                  onChange={(e) =>
                    setEdicion((x) => (x ? { ...x, incide_integral: e.target.checked } : x))
                  }
                />
                <span>
                  Entra en el salario integral
                  <span className="text-ink/50 mt-0.5 block text-xs">
                    Cuenta además para las prestaciones sociales.
                  </span>
                </span>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Orden en el recibo"
                type="number"
                min="1"
                hint="Más bajo, más arriba."
                value={edicion.orden}
                onChange={(e) => setEdicion((x) => (x ? { ...x, orden: e.target.value } : x))}
              />
              <Input
                label="Base legal"
                placeholder="LOTTT art. 104"
                hint="Opcional. Si viene de la ley, decir de dónde."
                value={edicion.base_legal}
                onChange={(e) => setEdicion((x) => (x ? { ...x, base_legal: e.target.value } : x))}
              />
            </div>

            {guardar.error ? <ErrorDeCarga error={guardar.error} /> : null}
          </div>
        </Modal>
      ) : null}
    </>
  )
}
