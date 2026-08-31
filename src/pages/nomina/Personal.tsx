import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ClipboardList,
  IdCard,
  Pencil,
  Plus,
  Search,
  Upload,
  UserMinus,
  UserRound,
  Users,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Pestanas } from '@/components/Pestanas'
import { PESTANAS_PERSONAL } from '@/components/pestanasDeModulos'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import {
  BASES_SALARIO,
  FRECUENCIAS,
  fichaDelInforme,
  useEgresarEmpleado,
  useEmpleados,
} from '@/lib/api/nomina'
import type { Empleado } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { Visor } from '@/components/Visor'
import { armarInformeDePersonal } from '@/lib/ficha/informePersonalPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import { dinero, fecha } from '@/lib/formato'

/** Años y meses de servicio. Es lo que decide el bono vacacional y lo que se le debe si sale. */
function antiguedad(desde: string): string {
  const inicio = new Date(`${desde}T12:00:00`)
  const meses =
    (new Date().getFullYear() - inicio.getFullYear()) * 12 +
    (new Date().getMonth() - inicio.getMonth())
  const anios = Math.floor(meses / 12)
  const resto = meses % 12

  if (anios === 0) return `${resto} ${resto === 1 ? 'mes' : 'meses'}`
  if (resto === 0) return `${anios} ${anios === 1 ? 'año' : 'años'}`
  return `${anios} a ${resto} m`
}

export function Personal() {
  const [verInactivos, setVerInactivos] = useState(false)
  const { data, isPending, error } = useEmpleados(!verInactivos)
  /*
    El informe se arma con TODOS, mire lo que mire la pantalla.

    Jesmary lo pidió así: «un PDF o informe del personal activo en nómina […]
    que en ese reporte incluya un apartado de los desincorporados». O sea que
    el apartado forma parte del papel, no es una opción. Si el informe saliera
    de lo que hay en pantalla, con la casilla apagada saldría sin ese apartado
    —vacío y sin decir por qué— y con ella encendida saldría igual que con ella
    apagada, que es peor: dos botones que hacen lo mismo salvo cuando no.

    La casilla sigue mandando en la TABLA, que es lo que se está mirando. Son
    dos cosas distintas y ahora se comportan como tales.
  */
  const { data: todos } = useEmpleados(false)
  const { data: empresa } = useEmpresa()
  const { nombre } = useSesion()
  const { puede } = useMisRoles()
  const egresar = useEgresarEmpleado()
  const [armando, setArmando] = useState(false)
  const [vista, setVista] = useState<(PdfArmado & { cuantos: number }) | null>(null)

  const [busca, setBusca] = useState('')
  const [saliendo, setSaliendo] = useState<Empleado | null>(null)
  const [egreso, setEgreso] = useState({ fecha: '', motivo: '' })

  const puedeRRHH = puede('RRHH')

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return data ?? []
    return (data ?? []).filter((e) =>
      `${e.nombres} ${e.apellidos} ${e.cedula} ${e.cargo} ${e.ficha}`.toLowerCase().includes(t),
    )
  }, [data, busca])

  /*
    El mismo buscador que la tabla, aplicado a la lista entera. Buscar
    «mantenimiento» y sacar el informe tiene que dar el informe de
    mantenimiento, con sus desincorporados incluidos.
  */
  const paraElInforme = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return todos ?? []
    return (todos ?? []).filter((e) =>
      `${e.nombres} ${e.apellidos} ${e.cedula} ${e.cargo} ${e.ficha}`.toLowerCase().includes(t),
    )
  }, [todos, busca])

  const sacarInforme = async (gente: Empleado[]) => {
    if (gente.length === 0) return
    setArmando(true)
    try {
      const pdf = await armarInformeDePersonal({
        conMontos: false,
        personas: gente.map(fichaDelInforme),
        filtro: busca.trim() ? `Coincidencias con «${busca.trim()}»` : null,
        empresa: empresaDelPapel(empresa),
        emitidoPor: nombre,
        momento: new Date(),
      })
      setVista({ ...pdf, cuantos: gente.length })
    } finally {
      setArmando(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Personal"
        description="Quién trabaja aquí, desde cuándo y cuánto gana. De la fecha de ingreso salen la antigüedad, el bono vacacional y las prestaciones. La ficha de cada quien lleva su foto, su carnet y su constancia de trabajo."
        actions={
          <>
            {/*
              EL INFORME NO VA DETRAS DEL ROL DE RRHH, y los otros dos sí.

              `puede('RRHH')` mira el ROL, no el nivel de permiso: es la puerta
              de dar de alta a alguien y de cargar treinta fichas de golpe, que
              son escrituras. Sacar un papel con lo que ya está en la tabla que
              se está mirando no lo es.

              Quien llega a esta pantalla tiene al menos NOMINA:LECTURA y está
              viendo ficha, nombre, cédula, cargo y fecha de ingreso de todo el
              mundo. El informe no enseña ni un dato más — menos, de hecho: no
              lleva el salario, que la tabla sí. Esconderlo obligaba a quien
              solo consulta a copiar la lista a mano.
            */}
            <Button
              variant="outline"
              icon={<ClipboardList />}
              disabled={armando || paraElInforme.length === 0}
              onClick={() => void sacarInforme(paraElInforme)}
            >
              {armando ? 'Preparando…' : 'Informe'}
            </Button>

            {puedeRRHH ? (
              <>
                {/* La carga por planilla vive donde se necesita, no en el menú:
                    quien va a dar de alta a treinta personas está mirando esta
                    lista, no buscándola en el riel. */}
                <Link to="/app/nomina/personal/carga">
                  <Button variant="outline" icon={<Upload />}>
                    Cargar por planilla
                  </Button>
                </Link>
                <Link to="/app/nomina/personal/nuevo">
                  <Button icon={<Plus />}>Nuevo trabajador</Button>
                </Link>
              </>
            ) : null}
          </>
        }
      />

      <Pestanas pestanas={PESTANAS_PERSONAL} />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Input
              label="Buscar"
              placeholder="Nombre, cédula, cargo"
              icon={<Search />}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <label className="text-ink/70 flex cursor-pointer items-center gap-2 pb-2 text-sm select-none">
            <input
              type="checkbox"
              className="accent-royal-600 size-4"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
            />
            Incluir a los desincorporados
          </label>
        </div>
      </Card>

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<Users />}
            titulo="Todavía no hay personal cargado"
            descripcion="Sin trabajadores no se puede calcular una nómina."
            accion={
              puedeRRHH ? (
                <Link to="/app/nomina/personal/nuevo">
                  <Button icon={<Plus />}>Cargar el primero</Button>
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {filtrados.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="px-5 py-3 font-medium">Trabajador</th>
                  <th className="px-3 py-3 font-medium">Cargo</th>
                  <th className="px-3 py-3 font-medium">Ingreso</th>
                  <th className="px-3 py-3 text-right font-medium">Salario</th>
                  <th className="px-5 py-3 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e) => (
                  <tr key={e.id} className="border-hairline border-b last:border-0">
                    <td className="px-5 py-3">
                      {/* El nombre lleva a la ficha, no al formulario: mirar a
                          alguien es mucho más frecuente que corregirle un dato.
                          Va subrayado al pasar por encima porque un nombre en
                          una tabla no se lee como algo que se pueda pulsar, y
                          quien no lo descubra no encuentra el carnet ni el PDF
                          —que están ahí dentro. Por lo mismo hay además un
                          botón con nombre al final de la fila. */}
                      {/* La etiqueta va pegada al nombre y no en la columna de
                          los botones. Ahí la ve todo el mundo —tenga el rol que
                          tenga— y se lee en el mismo golpe de vista que la
                          persona, que es lo que hace falta cuando la lista trae
                          activos y desincorporados mezclados. Antes lo decía un
                          " · egresado" en gris claro debajo de la cédula, del
                          mismo tamaño y del mismo color que el resto: estaba
                          escrito, pero no se veía. */}
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/app/nomina/personal/${e.id}`}
                          className="text-ink/85 hover:text-royal-600 dark:hover:text-royal-300 font-medium hover:underline"
                        >
                          {e.apellidos}, {e.nombres}
                        </Link>
                        {e.activo ? null : <Chip tone="danger">Desincorporado</Chip>}
                        {/* El indicador de que esta persona entra al sistema.
                            Sutil a propósito, y sobre todo SILENCIOSO cuando no
                            la hay: lo pidió así la líder —«sin mostrar ningún
                            indicador ni mención al respecto»— y tiene razón, que
                            de veintidós trabajadores solo unos pocos tienen
                            cuenta. Un «sin usuario» en las otras veinte filas
                            leería como una carencia, y no lo es.

                            Va aquí y no en la columna de botones por lo mismo
                            que la etiqueta de desincorporado: se lee en el mismo
                            golpe de vista que la persona. El nombre de usuario
                            entero está en la ficha; aquí solo la marca. */}
                        {e.cuenta ? (
                          <span
                            title={`Entra al sistema como ${e.cuenta.usuario}`}
                            aria-label={`Entra al sistema como ${e.cuenta.usuario}`}
                            className="inline-flex"
                          >
                            <UserRound className="text-ink/30 size-3.5 shrink-0" aria-hidden />
                          </span>
                        ) : null}
                      </span>
                      <p className="text-ink/45 text-xs">
                        <span className="tabular">{e.cedula} · ficha {e.ficha}</span>
                      </p>
                      {/* El motivo, en pequeño y solo cuando lo hay. Es la
                          diferencia entre "esta persona ya no está" y saber si
                          renunció, si la liquidaron o si la ficha se cargó por
                          error. */}
                      {!e.activo && e.motivo_egreso ? (
                        <p className="text-ink/40 mt-0.5 text-xs italic">{e.motivo_egreso}</p>
                      ) : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3">
                      {e.cargo}
                      {e.departamento ? (
                        <span className="text-ink/45 block text-xs">{e.departamento}</span>
                      ) : null}
                    </td>
                    <td className="text-ink/70 px-3 py-3 whitespace-nowrap">
                      {fecha(e.fecha_ingreso)}
                      {/* De esta fecha salen la antigüedad, el bono vacacional
                          y la liquidación. Mientras nadie la haya mirado, lo
                          que se lee debajo no es un dato: es una suposición. */}
                      {e.fecha_ingreso_confirmada ? (
                        <span className="text-ink/45 block text-xs">
                          {e.activo ? antiguedad(e.fecha_ingreso) : `hasta ${fecha(e.fecha_egreso)}`}
                        </span>
                      ) : (
                        <Chip tone="warning" className="mt-1 flex w-fit">
                          Por confirmar
                        </Chip>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-ink/85 tabular font-medium whitespace-nowrap">
                        {dinero(e.moneda_salario, e.salario_base)}
                      </span>
                      <span className="text-ink/45 block text-xs">
                        {BASES_SALARIO.find((b) => b.valor === e.base_estipulacion)?.etiqueta} ·{' '}
                        {FRECUENCIAS.find((f) => f.valor === e.frecuencia)?.etiqueta.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {/* Primero, y con su nombre escrito: es la puerta al
                            carnet, al PDF con todos los datos y a la constancia
                            de trabajo. No pide RRHH porque mirar no es escribir:
                            quien tenga Nómina en lectura entra igual, y adentro
                            los botones de escribir ya se esconden solos. */}
                        <Link to={`/app/nomina/personal/${e.id}`}>
                          <Button size="sm" variant="ghost" icon={<IdCard />}>
                            Ficha
                          </Button>
                        </Link>
                        {puedeRRHH ? (
                          <Link to={`/app/nomina/personal/${e.id}/editar`}>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Pencil />}
                              aria-label={`Editar a ${e.nombres} ${e.apellidos}`}
                            />
                          </Link>
                        ) : null}
                        {/* Para quien no está, aquí no va nada: la etiqueta ya
                            está junto a su nombre, y repetirla al final de la
                            fila solo enseñaría lo mismo dos veces. */}
                        {puedeRRHH && e.activo ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<UserMinus />}
                            onClick={() => {
                              setSaliendo(e)
                              setEgreso({ fecha: '', motivo: '' })
                            }}
                          >
                            Desincorporar
                          </Button>
                        ) : e.activo ? (
                          <Chip tone="success">Activo</Chip>
                        ) : null}
                        {/* Aquí había una papelera. Se quitó: una ficha de
                            personal no se borra, se desincorpora con "Egresar"
                            y su motivo escrito —"cargada por error" también es
                            un motivo—. Deja de salir entre los activos, que es
                            lo único que se quería, y se puede leer lo que pasó.
                            El borrado era la única acción del sistema que no se
                            podía deshacer desde la pantalla. */}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* ---------------------------- Ficha ---------------------------- */}
      {/* ---------------------------- Egreso ---------------------------- */}
      {saliendo ? (
        <Modal
          abierto
          onCerrar={() => setSaliendo(null)}
          titulo={`Desincorporar a ${saliendo.nombres} ${saliendo.apellidos}`}
          descripcion="Deja de entrar en las nóminas siguientes y queda marcado en la lista. Su historial se conserva entero: no se borra nada."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setSaliendo(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={egresar.isPending || !egreso.fecha || egreso.motivo.trim().length < 4}
                onClick={async () => {
                  await egresar.mutateAsync({ id: saliendo.id, ...egreso })
                  setSaliendo(null)
                }}
              >
                {egresar.isPending ? 'Guardando…' : 'Desincorporar'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input
              label="Último día trabajado"
              type="date"
              value={egreso.fecha}
              onChange={(e) => setEgreso((g) => ({ ...g, fecha: e.target.value }))}
            />
            <Textarea
              label="Motivo"
              rows={3}
              placeholder="Renuncia, despido justificado, fin de contrato, cargada por error…"
              hint="De él dependen las prestaciones que le tocan. Si la ficha se cargó por error o está duplicada, escríbelo tal cual: es la forma de sacarla de la lista sin borrar nada."
              value={egreso.motivo}
              onChange={(e) => setEgreso((g) => ({ ...g, motivo: e.target.value }))}
            />
            {egresar.error ? <ErrorDeCarga error={egresar.error} /> : null}
          </div>
        </Modal>
      ) : null}

      <Visor
        abierto={vista !== null}
        onCerrar={() => setVista(null)}
        blob={vista?.blob ?? null}
        nombreArchivo={vista?.nombre ?? 'informe-de-personal.pdf'}
        titulo="Informe de personal"
        descripcion={
          vista
            ? `${vista.cuantos} ${vista.cuantos === 1 ? 'persona' : 'personas'} · sin montos, para enseñar fuera de administración`
            : undefined
        }
      />
    </>
  )
}
