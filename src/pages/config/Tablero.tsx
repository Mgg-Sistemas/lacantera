import { Building2, ClipboardList, DatabaseBackup, FileText, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { QueHacer } from '@/components/QueHacer'
import type { GrupoDeAcciones } from '@/components/QueHacer'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { enteros } from '@/lib/formato'
import { useEmpresa } from '@/lib/api/empresa'
import { useUsuarios, useModulos } from '@/lib/api/usuarios'
import { useMisRoles } from '@/lib/api/catalogo'

/*
  EL TABLERO DE CONFIGURACIÓN

  Christopher: «Configuración también necesita un tablero». Era el único módulo
  del MVP que abría directamente en una lista, y una lista no dice si lo que
  hay debajo está bien puesto o a medio poner.

  Lo que reporta arriba no son cifras de operación —aquí no hay dinero ni
  material— sino el estado de lo que hace funcionar al resto: si la empresa
  tiene sus datos fiscales, cuánta gente entra al sistema, y cuántos módulos
  hay que repartir entre ellos.

  Debajo, lo de siempre: por dónde se empieza. Configuración se toca dos veces
  al año, así que quien entra casi nunca recuerda dónde estaba cada cosa.
*/

const QUE_HACER: GrupoDeAcciones[] = [
  {
    titulo: 'Lo que se pone una vez',
    detalle: 'Sin esto, los papeles salen sin membrete y nadie puede entrar.',
    acciones: [
      {
        paso: 1,
        titulo: 'Datos de la empresa',
        detalle:
          'Razón social, RIF y domicilio fiscal. Es lo que encabeza cada factura, orden de compra y recibo que sale del sistema.',
        icono: Building2,
        a: '/app/config/empresa',
        exige: 'ESCRITURA',
      },
      {
        paso: 2,
        titulo: 'Usuarios y roles',
        detalle:
          'Quién entra y qué puede tocar. El rol decide el menú que ve cada quien, no solo lo que puede guardar.',
        icono: Users,
        a: '/app/config/usuarios',
        exige: 'ESCRITURA',
      },
      {
        paso: 3,
        titulo: 'Documentos legales',
        detalle:
          'Los papeles de la empresa —RIF, permisos, solvencias— con su fecha de vencimiento, para que avise antes de que caduquen.',
        icono: FileText,
        a: '/app/config/documentos',
        exige: 'ESCRITURA',
      },
    ],
  },
  {
    titulo: 'Revisar de vez en cuando',
    acciones: [
      {
        titulo: 'Auditoría',
        detalle:
          'Todo lo que ha hecho cada persona en el sistema. No se reparte por módulos: se tiene o no se tiene.',
        icono: ClipboardList,
        a: '/app/config/auditoria',
      },
      {
        titulo: 'Respaldo de la base',
        detalle:
          'La copia completa de los datos. Conviene bajarla antes de cualquier carga grande.',
        icono: DatabaseBackup,
        a: '/app/config/respaldo',
      },
    ],
  },
]

export function TableroConfiguracion() {
  const { data: empresa, isPending, error } = useEmpresa()
  const { data: usuarios } = useUsuarios()
  const { data: modulos } = useModulos()
  const { puede: tieneRol } = useMisRoles()

  const activos = (usuarios ?? []).filter((u) => u.activo).length
  const sinRol = (usuarios ?? []).filter((u) => u.activo && (u.roles?.length ?? 0) === 0).length

  /*
    La ficha de la empresa está completa cuando tiene lo que un papel necesita.

    No se comprueban las quince columnas: se comprueban las tres que, si
    faltan, hacen que una factura salga inservible. Un aviso que se enciende
    por un campo opcional enseña a ignorar los avisos.
  */
  const faltaEmpresa = [
    !empresa?.razon_social && 'razón social',
    !empresa?.rif && 'RIF',
    !empresa?.domicilio_fiscal && 'domicilio fiscal',
  ].filter(Boolean) as string[]

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Lo que hace funcionar al resto: quién entra, con qué datos sale cada papel, y qué queda registrado."
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
            Ficha de la empresa
          </p>
          <p className="text-ink/90 mt-3 text-lg font-medium">
            {faltaEmpresa.length === 0 ? 'Completa' : 'Incompleta'}
          </p>
          <p className="text-ink/45 mt-2 text-xs">
            {faltaEmpresa.length === 0
              ? (empresa?.razon_social ?? '')
              : `Falta ${faltaEmpresa.join(', ')}. Los papeles salen sin eso.`}
          </p>
        </Card>

        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
            Usuarios activos
          </p>
          <p className="text-ink/90 tabular mt-3 text-3xl font-light">{enteros(activos)}</p>
          <p className="text-ink/45 mt-2 text-xs">
            {sinRol > 0
              ? `${sinRol} sin ningún rol: entran y no ven nada`
              : 'Todos con rol asignado'}
          </p>
        </Card>

        <Card>
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
            Módulos del sistema
          </p>
          <p className="text-ink/90 tabular mt-3 text-3xl font-light">
            {enteros((modulos ?? []).length)}
          </p>
          <p className="text-ink/45 mt-2 text-xs">
            Se reparten por rol, con cuatro niveles de permiso
          </p>
        </Card>
      </div>

      <QueHacer grupos={QUE_HACER} />

      {/* La auditoría no se reparte por módulos: o se tiene el rol o no. Quien
          no lo tiene ve el tablero sin esa tarjeta y sin explicación, y eso se
          lee como que falta algo. Mejor decirlo. */}
      {!tieneRol('ADMIN') ? (
        <p className="text-ink/40 mt-6 text-xs">
          El registro de auditoría lo abre solo quien tiene el rol de administrador. Por eso no
          aparece aquí.
        </p>
      ) : null}
    </>
  )
}
