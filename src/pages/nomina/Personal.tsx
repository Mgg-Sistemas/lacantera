import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ClipboardList,
  IdCard,
  Pencil,
  FileText,
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
import { Select } from '@/components/ui/Select'
import {
  BASES_SALARIO,
  ESTADOS_CIVILES,
  FRECUENCIAS,
  GENEROS,
  fichaDelInforme,
  useCargasDeEmpleados,
  useEgresarEmpleado,
  useACargoDe,
  useEmpleados,
} from '@/lib/api/nomina'
import type { ACargoDe, CargasDeEmpleado, Empleado } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { empresaDelPapel, useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { Visor } from '@/components/Visor'
import { armarInformeDePersonal } from '@/lib/ficha/informePersonalPdf'
import { armarPlanillaDeIngreso } from '@/lib/ficha/planillaIngresoPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import { dinero, documento, fecha } from '@/lib/formato'

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

/*
  Cómo se dice en dos palabras de qué responde alguien.

  «2 almacenes · 1 máquina» y no «3 cosas a cargo»: un almacén y una máquina se
  entregan de maneras distintas y a personas distintas, y juntarlos en un número
  obliga a abrir la ficha para saber qué son.
*/
function resumenACargo(c: ACargoDe) {
  return [
    c.almacenes > 0 ? `${c.almacenes} almacén${c.almacenes === 1 ? '' : 'es'}` : null,
    c.maquinas > 0 ? `${c.maquinas} máquina${c.maquinas === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function Personal() {
  const [verInactivos, setVerInactivos] = useState(false)
  const { data, isPending, error } = useEmpleados(!verInactivos)
  const { data: empresa } = useEmpresa()
  const { data: cargos } = useACargoDe()

  /*
    De qué responde una persona: los almacenes que lleva y las máquinas que
    tiene asignadas. Devuelve nada cuando no lleva ninguna de las dos, para que
    quien lo use no tenga que comprobar los dos ceros.
  */
  const aCargoDe = (id: number) => {
    const c = (cargos ?? []).find((x) => x.empleado_id === id)
    return c && (c.almacenes > 0 || c.maquinas > 0) ? c : null
  }
  const { nombre } = useSesion()
  const { puede } = useMisRoles()
  const egresar = useEgresarEmpleado()
  const [armando, setArmando] = useState(false)
  const [preguntandoHuella, setPreguntandoHuella] = useState(false)
  /*
    El visor sirve para dos papeles distintos desde el 24/09/2026 —el informe y
    la planilla en blanco— así que el título y la explicación viajan con el PDF
    en vez de estar escritos en el visor. Escribirlos allí obligaba a adivinar
    cuál de los dos se está enseñando.
  */
  const [vista, setVista] = useState<
    (PdfArmado & { titulo: string; descripcion: string }) | null
  >(null)

  const [busca, setBusca] = useState('')
  const [saliendo, setSaliendo] = useState<Empleado | null>(null)
  const [egreso, setEgreso] = useState({ fecha: '', motivo: '' })

  const puedeRRHH = puede('RRHH')

  /*
    LOS FILTROS DE RRHH

    Se pidió poder organizar al personal por carga familiar, estado civil,
    dependientes, género y condiciones de salud, y sacar el informe de lo
    filtrado. Los cinco viven aquí y se aplican en un solo sitio — ver
    `pasaElFiltro`.

    `''` es «todos» en los cinco. No se usa `null` para que el `<select>` no
    tenga que distinguir entre no elegido y elegido vacío.
  */
  const [genero, setGenero] = useState('')
  const [estadoCivil, setEstadoCivil] = useState('')
  const [carga, setCarga] = useState('')
  const [dependientes, setDependientes] = useState('')
  const [salud, setSalud] = useState('')
  const [condicion, setCondicion] = useState('')

  // Las cuentas de familiares y salud, por persona, en una sola consulta.
  const { data: cargas } = useCargasDeEmpleados()
  const cargaDe = useMemo(() => {
    const m = new Map<number, CargasDeEmpleado>()
    for (const c of cargas ?? []) m.set(c.empleado_id, c)
    return m
  }, [cargas])

  /*
    EL CRITERIO, ESCRITO UNA SOLA VEZ.

    Antes la búsqueda se repetía en dos `useMemo` —uno para la tabla y otro
    para el informe— y eran dos copias del mismo `filter`. Con cinco filtros
    más, dos copias es la forma segura de que un día la tabla enseñe una cosa y
    el papel diga otra. Ahora las dos listas llaman aquí.

    Se busca contra las DOS escrituras de la cédula: la lista enseña
    «V-12.345.678» desde que los documentos se visten, y quien teclea lo que ve
    —o lo pega de la propia pantalla— buscaba contra «V-12345678» y no
    encontraba nada.
  */
  const pasaElFiltro = useMemo(() => {
    const t = busca.trim().toLowerCase()

    return (e: Empleado) => {
      if (
        t &&
        !`${e.nombres} ${e.apellidos} ${e.cedula} ${documento(e.cedula)} ${e.cargo} ${e.ficha}`
          .toLowerCase()
          .includes(t)
      ) {
        return false
      }

      // `SIN` es una opción de verdad y no un descuido: hay fichas a medias, y
      // «¿a quién le falta el género?» es justo una pregunta que RRHH hace.
      if (genero === 'SIN' ? e.genero !== null : genero && e.genero !== genero) return false
      if (
        estadoCivil === 'SIN'
          ? e.estado_civil !== null
          : estadoCivil && e.estado_civil !== estadoCivil
      ) {
        return false
      }

      // Sin fila en la vista, la persona no tiene nada cargado. Eso es «no
      // tiene», no «no se sabe»: la vista cuenta a todos los empleados.
      const c = cargaDe.get(e.id)
      if (carga && (c?.tiene_carga_familiar ?? false) !== (carga === 'SI')) return false
      if (dependientes && (c?.tiene_dependientes ?? false) !== (dependientes === 'SI')) return false
      if (salud && (c?.tiene_condicion_salud ?? false) !== (salud === 'SI')) return false

      // Ser eventual decide si cobra en el ciclo, así que se filtra como los
      // demás: es la pregunta «¿a quién no le toca esta quincena?».
      if (condicion && e.eventual !== (condicion === 'SI')) return false

      return true
    }
  }, [busca, genero, estadoCivil, carga, dependientes, salud, condicion, cargaDe])

  const filtrados = useMemo(() => (data ?? []).filter(pasaElFiltro), [data, pasaElFiltro])

  /*
    EL CRITERIO, DICHO EN PALABRAS PARA EL PAPEL.

    Un informe titulado «Personal» que trae 6 de 32 personas es engañoso si no
    dice por qué. El PDF ya reserva el renglón «Filtro aplicado»; lo que
    faltaba era contarle qué se filtró.

    No es cosmético: ese papel se le enseña a un inspector, y un papel que
    omite su propio recorte miente por omisión.
  */
  const criterio = useMemo(() => {
    const partes: string[] = []
    if (busca.trim()) partes.push(`coincidencias con «${busca.trim()}»`)
    if (genero) {
      partes.push(
        genero === 'SIN'
          ? 'sin género cargado'
          : `género ${GENEROS.find((g) => g.valor === genero)?.etiqueta.toLowerCase() ?? genero}`,
      )
    }
    if (estadoCivil) {
      partes.push(
        estadoCivil === 'SIN'
          ? 'sin estado civil cargado'
          : `estado civil ${
              ESTADOS_CIVILES.find((x) => x.valor === estadoCivil)?.etiqueta.toLowerCase() ??
              estadoCivil
            }`,
      )
    }
    if (carga) partes.push(carga === 'SI' ? 'con carga familiar' : 'sin carga familiar')
    if (dependientes) {
      partes.push(dependientes === 'SI' ? 'con dependientes' : 'sin dependientes')
    }
    if (salud) {
      partes.push(
        salud === 'SI' ? 'con alguna condición de salud' : 'sin condiciones de salud declaradas',
      )
    }
    if (condicion) {
      partes.push(condicion === 'SI' ? 'eventuales' : 'de nómina ordinaria')
    }
    return partes.length > 0 ? partes.join(' · ') : null
  }, [busca, genero, estadoCivil, carga, dependientes, salud, condicion])

  const hayFiltro = criterio !== null

  /*
    LA CASILLA MANDA TAMBIÉN EN EL PAPEL.

    Antes no. El informe se armaba con la lista entera para que el apartado de
    desincorporados —que pidió Jesmary— saliera siempre, esté marcada la casilla
    o no. Suena razonable hasta que se mira: la pantalla dice «se ven 2 de 24» y
    el PDF trae una tercera persona que ahí no aparecía y que nadie pidió.

    El apartado no se pierde: sale cuando se marca «incluir a los
    desincorporados», que es exactamente cuando se está preguntando por ellos.
    Lo que se imprime es lo que se está mirando, y eso es lo único que no admite
    sorpresa: ese papel se firma y se entrega.

    Y el recorte va escrito en el renglón del filtro. Sin él, un informe sin
    desincorporados se lee como «no hay ninguno», que es distinto de «no se
    pidieron».
  */
  const alcance = verInactivos ? 'incluye a los desincorporados' : 'solo personal activo'
  const filtroDelPapel = criterio ? `${criterio} · ${alcance}` : alcance

  /*
    LA PLANILLA EN BLANCO, PARA LA ENTREVISTA.

    No lleva datos: es el papel que se imprime y se llena a mano delante del
    aspirante, y después alguien lo transcribe. Por eso no depende de lo que
    esté filtrado en la tabla ni de que haya alguien seleccionado.

    Va aquí y no en el menú porque quien entrevista sale de esta pantalla: mira
    quién hay, ve que falta gente, y de ahí va a buscar. El papel está donde se
    decide que hace falta.
  */
  const sacarPlanilla = async (conHuella: boolean) => {
    setPreguntandoHuella(false)
    setArmando(true)
    try {
      const pdf = await armarPlanillaDeIngreso({ empresa: empresaDelPapel(empresa), conHuella })
      setVista({
        ...pdf,
        titulo: 'Planilla de ingreso',
        descripcion: conHuella
          ? 'En blanco, para llenar a mano en la entrevista · dos hojas · con recuadro para la huella'
          : 'En blanco, para llenar a mano en la entrevista · dos hojas',
      })
    } finally {
      setArmando(false)
    }
  }

  const sacarInforme = async (gente: Empleado[]) => {
    if (gente.length === 0) return
    setArmando(true)
    try {
      const pdf = await armarInformeDePersonal({
        conMontos: false,
        personas: gente.map(fichaDelInforme),
        filtro: filtroDelPapel,
        empresa: empresaDelPapel(empresa),
        emitidoPor: nombre,
        momento: new Date(),
      })
      setVista({
        ...pdf,
        titulo: 'Informe de personal',
        descripcion: `${gente.length} ${gente.length === 1 ? 'persona' : 'personas'} · sin montos, para enseñar fuera de administración`,
      })
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
              disabled={armando || filtrados.length === 0}
              onClick={() => void sacarInforme(filtrados)}
            >
              {armando ? 'Preparando…' : 'Informe'}
            </Button>

            {/*
              LA PLANILLA NO PIDE EL ROL DE RRHH, por lo mismo que el informe: es
              un papel EN BLANCO. No enseña ni un dato de nadie, así que pedir
              permiso para imprimirlo sería pedir permiso para gastar papel.
            */}
            <Button
              variant="outline"
              icon={<FileText />}
              disabled={armando}
              onClick={() => setPreguntandoHuella(true)}
            >
              Planilla de ingreso
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
          {/*
            ANCHO PROPIO Y NO «LO QUE SOBRE».

            Llevaba `flex-1`, que es basis 0: en el reparto de la fila no pedía
            nada y se quedaba con el hueco que dejaran los seis desplegables. Con
            dos filtros eso sobraba; con seis no sobra nada, y el campo se
            encogió hasta el ancho del icono de la lupa. Se podía escribir en él
            —y no se veía ni una letra de lo escrito—, que es la peor forma de
            fallar: la lista se recorta y nadie ve por qué.

            Ahora mide como sus vecinos. En el teléfono ocupa la fila entera,
            que es donde de verdad se busca por nombre.
          */}
          <div className="w-full sm:w-72">
            <Input
              label="Buscar"
              placeholder="Nombre, cédula, cargo o ficha"
              icon={<Search />}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {/*
            LOS CINCO FILTROS DE RRHH.

            Van en la misma tarjeta que la búsqueda y no escondidos tras un
            «filtros avanzados»: son la forma de trabajar que se pidió, no una
            rareza. `w-40` los mantiene en una fila en pantalla ancha y los
            apila solos en el teléfono.
          */}
          <Select
            label="Género"
            className="w-40"
            vacio="Todos"
            value={genero}
            onChange={(e) => setGenero(e.target.value)}
            opciones={[...GENEROS, { valor: 'SIN', etiqueta: 'Sin cargar' }]}
          />
          <Select
            label="Estado civil"
            className="w-44"
            vacio="Todos"
            value={estadoCivil}
            onChange={(e) => setEstadoCivil(e.target.value)}
            opciones={[...ESTADOS_CIVILES, { valor: 'SIN', etiqueta: 'Sin cargar' }]}
          />
          <Select
            label="Carga familiar"
            className="w-40"
            vacio="Todos"
            value={carga}
            onChange={(e) => setCarga(e.target.value)}
            opciones={[
              { valor: 'SI', etiqueta: 'Tiene' },
              { valor: 'NO', etiqueta: 'No tiene' },
            ]}
          />
          <Select
            label="Dependientes"
            className="w-40"
            vacio="Todos"
            value={dependientes}
            onChange={(e) => setDependientes(e.target.value)}
            opciones={[
              { valor: 'SI', etiqueta: 'Tiene' },
              { valor: 'NO', etiqueta: 'No tiene' },
            ]}
          />
          <Select
            label="Salud"
            className="w-48"
            vacio="Todos"
            value={salud}
            onChange={(e) => setSalud(e.target.value)}
            opciones={[
              { valor: 'SI', etiqueta: 'Con alguna condición' },
              { valor: 'NO', etiqueta: 'Sin condiciones' },
            ]}
          />
          <Select
            label="Contratación"
            className="w-48"
            vacio="Todos"
            value={condicion}
            onChange={(e) => setCondicion(e.target.value)}
            opciones={[
              { valor: 'NO', etiqueta: 'Nómina ordinaria' },
              { valor: 'SI', etiqueta: 'Eventual' },
            ]}
          />

          <label className="text-ink/70 flex cursor-pointer items-center gap-2 pb-2 text-sm select-none">
            <input
              type="checkbox"
              className="accent-royal-600 size-4"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
            />
            Incluir a los desincorporados
          </label>

          {/* Con cinco filtros, volver a «todos» a mano son cinco gestos. Y un
              filtro olvidado es la causa más común de «faltan personas en la
              lista». Solo aparece si hay algo que limpiar. */}
          {hayFiltro ? (
            <button
              type="button"
              className="text-royal-600 hover:text-royal-700 pb-2 text-sm underline-offset-4 hover:underline"
              onClick={() => {
                setBusca('')
                setGenero('')
                setEstadoCivil('')
                setCarga('')
                setDependientes('')
                setSalud('')
                setCondicion('')
              }}
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {/* Que el recorte se vea en pantalla y no solo en el papel: quien mira
            una lista corta tiene que saber que la acortó él. */}
        {hayFiltro ? (
          <p className="text-ink/45 mt-3 text-xs">
            Filtrando por {criterio}. Se ven {filtrados.length} de {(data ?? []).length}.
          </p>
        ) : null}
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
                        <span className="tabular">{documento(e.cedula)} · ficha {e.ficha}</span>
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

                      {/*
                        DE QUÉ RESPONDE, DEBAJO DEL CARGO.

                        Christopher: «se debe indicar si la persona tiene o no
                        algún almacén, área o proceso a su cargo». Va aquí y no
                        en columna propia porque es lo mismo que el cargo visto
                        de cerca: el cargo dice qué hace, esto dice de qué
                        responde.

                        Solo se marca a quien lleva algo. Escribir «no lleva
                        nada» en veinticuatro filas para que destaquen dos es
                        llenar la tabla de ruido; el silencio ya significa eso,
                        y la ficha lo dice con palabras para quien lo dude.
                      */}
                      {aCargoDe(e.id) ? (
                        <Chip
                          tone="royal"
                          className="mt-1 flex w-fit"
                          title={aCargoDe(e.id)!.detalle ?? undefined}
                        >
                          {resumenACargo(aCargoDe(e.id)!)}
                        </Chip>
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

      {/*
        SE PREGUNTA ANTES DE IMPRIMIR, Y NO SE DEJA PUESTO.

        La huella no siempre hace falta: se pide cuando la firma de alguien no
        es constante, que es una decisión de quien entrevista y cambia de
        persona a persona. Dejar el recuadro en todas las planillas lo
        convertiría en un hueco que casi siempre se queda vacío, y un papel con
        huecos vacíos enseña que no hace falta llenarlo entero.

        Es una pregunta de dos botones y no una casilla con un «Generar»
        detrás: son dos caminos y los dos llevan al mismo sitio, así que
        obligar a marcar y luego confirmar sería un clic de más para nada.
      */}
      <Modal
        abierto={preguntandoHuella}
        onCerrar={() => setPreguntandoHuella(false)}
        titulo="Planilla de ingreso"
        descripcion="Sale en blanco, para llenarla a mano durante la entrevista."
        ancho="sm"
        acciones={
          <>
            <Button variant="ghost" onClick={() => setPreguntandoHuella(false)}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={() => void sacarPlanilla(false)}>
              Sin huella
            </Button>
            <Button onClick={() => void sacarPlanilla(true)}>Con huella</Button>
          </>
        }
      >
        <p className="text-ink/70 text-sm leading-relaxed">
          ¿Le pones un recuadro para la <strong>huella del pulgar</strong> al lado de las firmas?
        </p>
        <p className="text-ink/55 mt-2 text-sm leading-relaxed">
          Sirve cuando la firma de alguien no sale igual dos veces. Si no hace falta, el pie queda
          con las dos rayas de firma y nada más.
        </p>
      </Modal>

      <Visor
        abierto={vista !== null}
        onCerrar={() => setVista(null)}
        blob={vista?.blob ?? null}
        nombreArchivo={vista?.nombre ?? 'papel.pdf'}
        titulo={vista?.titulo ?? ''}
        descripcion={vista?.descripcion}
      />
    </>
  )
}
