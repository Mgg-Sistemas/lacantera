import { useState } from 'react'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { Link, useParams } from 'react-router'
import { ArrowLeft, FileText, IdCard, Pencil, ScrollText, TriangleAlert, UserX } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { EncuadreFoto } from '@/components/EncuadreFoto'
import { useEntregadoATrabajador } from '@/lib/api/asignaciones'
import { Visor } from '@/components/Visor'
import {
  BASES_SALARIO,
  ESTADOS_CIVILES,
  FRECUENCIAS,
  GENEROS,
  JORNADAS,
  useEmpleado,
  useFirmaRrhh,
  useFoto,
  useGuardarEncuadre,
  useEmpleados,
  useIncidencias,
  useRegistrarIncidencia,
  TIPOS_INCIDENCIA,
  MOMENTOS_INCIDENCIA,
  useQuitarFoto,
  useSubirFoto,
  useVincularCuenta,
  useCuentasSinFicha,
} from '@/lib/api/nomina'
import type { Empleado } from '@/lib/api/nomina'
import { TarjetaFirma } from '@/components/TarjetaFirma'
import { useMisRoles } from '@/lib/api/catalogo'
import { useMisAcciones, useRoles } from '@/lib/api/usuarios'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { armarCarnet } from '@/lib/ficha/carnet'
import { armarFicha, type Seccion } from '@/lib/ficha/fichaPdf'
import { armarConstancia } from '@/lib/ficha/constanciaPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { ENCUADRE_CENTRADO, type Encuadre } from '@/lib/ficha/encuadre'
import { dinero, fecha } from '@/lib/formato'
import { useMetodosPago, nombreDe } from '@/lib/api/metodosPago'
import type { MetodoPago } from '@/lib/api/metodosPago'

/** Años y meses de servicio: es lo que decide bono vacacional y prestaciones. */
function antiguedad(desde: string, hasta: string | null): string {
  const inicio = new Date(`${desde}T12:00:00`)
  const fin = hasta ? new Date(`${hasta}T12:00:00`) : new Date()

  const meses =
    (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth())
  const anios = Math.floor(meses / 12)
  const resto = meses % 12

  if (anios === 0) return `${resto} ${resto === 1 ? 'mes' : 'meses'}`
  if (resto === 0) return `${anios} ${anios === 1 ? 'año' : 'años'}`
  return `${anios} años y ${resto} ${resto === 1 ? 'mes' : 'meses'}`
}

function edad(nacimiento: string | null): string {
  if (!nacimiento) return '—'
  const n = new Date(`${nacimiento}T12:00:00`)
  const hoy = new Date()
  let a = hoy.getFullYear() - n.getFullYear()
  const m = hoy.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) a -= 1
  return `${a} años`
}

/** Lo que sabe sacar el botón de exportar. Cada uno acaba en el visor. */
type Exportable = 'pdf' | 'frente' | 'reverso'

const etiqueta = (lista: Array<{ valor: string; etiqueta: string }>, v: string | null) =>
  lista.find((o) => o.valor === v)?.etiqueta ?? '—'

/** Las secciones de la ficha. Las mismas en pantalla y en el PDF: si se
 *  escribieran dos veces, tarde o temprano dirían cosas distintas. */
/*
  Recibe el catalogo en vez de pedirlo.

  No es un componente: es una funcion que arma la ficha, y las funciones
  normales no pueden usar hooks. Pasarlo por parametro tambien la deja
  probable sin montar nada.
*/
function seccionesDe(e: Empleado, metodos: MetodoPago[] | undefined): Seccion[] {
  const secciones: Seccion[] = [
    {
      titulo: 'Identificación',
      campos: [
        { clave: 'Cédula', valor: e.cedula },
        { clave: 'Fecha de nacimiento', valor: e.fecha_nacimiento ? fecha(e.fecha_nacimiento) : '—' },
        { clave: 'Edad', valor: edad(e.fecha_nacimiento) },
        { clave: 'Grupo sanguíneo', valor: e.grupo_sanguineo ?? '—' },
        { clave: 'Género', valor: etiqueta(GENEROS, e.genero) },
        { clave: 'Nacionalidad', valor: e.nacionalidad ?? '—' },
        { clave: 'Estado civil', valor: etiqueta(ESTADOS_CIVILES, e.estado_civil) },
      ],
    },
    {
      titulo: 'Contacto',
      campos: [
        { clave: 'Teléfono', valor: e.telefono ?? '—' },
        // A ancho completo: un nombre con parentesco y un número no caben al
        // lado de su etiqueta en media columna, y recortarlo con puntos
        // suspensivos deja justo el dato que hace falta en una emergencia.
        {
          clave: 'En una emergencia, llamar a',
          valor: [e.contacto_emergencia, e.telefono_emergencia].filter(Boolean).join(' · ') || '—',
          ancho: true,
        },
        { clave: 'Dirección', valor: e.direccion ?? '—', ancho: true },
      ],
    },
    {
      titulo: 'Datos laborales',
      campos: [
        { clave: 'Cargo', valor: e.cargo },
        { clave: 'Departamento', valor: e.departamento ?? '—' },
        { clave: 'Fecha de ingreso', valor: fecha(e.fecha_ingreso) },
        { clave: 'Antigüedad', valor: antiguedad(e.fecha_ingreso, e.fecha_egreso) },
        { clave: 'Jornada', valor: etiqueta(JORNADAS, e.tipo_jornada) },
        {
          clave: 'Utilidades',
          valor: e.dias_utilidades ? `${Number(e.dias_utilidades)} días al año` : '30 días (mínimo legal)',
        },
      ],
    },
    {
      titulo: 'Cómo se le paga',
      campos: [
        {
          clave: 'Salario',
          valor: `${dinero(e.moneda_salario, e.salario_base)} ${etiqueta(BASES_SALARIO, e.base_estipulacion).toLowerCase()}`,
        },
        { clave: 'Frecuencia', valor: etiqueta(FRECUENCIAS, e.frecuencia) },
        { clave: 'Forma de pago', valor: nombreDe(metodos, e.forma_pago) },
        {
          clave: 'Cuenta',
          valor:
            [e.banco, e.numero_cuenta ?? e.telefono_pago].filter(Boolean).join(' · ') ||
            'No aplica',
        },
      ],
    },
  ]

  if (e.fecha_egreso) {
    secciones.push({
      titulo: 'Egreso',
      campos: [
        { clave: 'Último día trabajado', valor: fecha(e.fecha_egreso) },
        { clave: 'Motivo', valor: e.motivo_egreso ?? '—', ancho: true },
      ],
    })
  }

  if (e.nota) {
    secciones.push({ titulo: 'Observaciones', campos: [{ clave: '', valor: e.nota, ancho: true }] })
  }

  return secciones
}

export function FichaTrabajador() {
  const { data: metodos } = useMetodosPago()
  const { id } = useParams()
  const { data: e, isPending, error } = useEmpleado(id ? Number(id) : undefined)
  const { puede } = useMisRoles()
  const { puede: alcanza } = useMisAcciones()
  const puedeVincular = alcanza('NOMINA.VINCULAR_CUENTA')

  const [atandoCuenta, setAtandoCuenta] = useState(false)
  const [cuentaElegida, setCuentaElegida] = useState('')
  const vincular = useVincularCuenta()
  const cuentasLibres = useCuentasSinFicha(atandoCuenta ? e?.id : undefined)
  const rolesDelSistema = useRoles()
  const etiquetaDeRol = (codigo: string) =>
    rolesDelSistema.data?.find((r) => r.codigo === codigo)?.nombre ?? codigo
  const { nombre } = useSesion()

  const foto = useFoto(e?.foto_path)
  const subir = useSubirFoto()
  const guardarEncuadre = useGuardarEncuadre()
  const quitar = useQuitarFoto()

  const [encuadre, setEncuadre] = useState<Encuadre>(ENCUADRE_CENTRADO)
  const [encuadreGuardado, setEncuadreGuardado] = useState('')
  const [exportando, setExportando] = useState<Exportable | null>(null)
  const [falloExportar, setFalloExportar] = useState<Error | null>(null)

  // La constancia
  const empresa = useEmpresa()
  const { firma } = useFirmaRrhh()
  const [pidiendo, setPidiendo] = useState(false)
  const [conSueldo, setConSueldo] = useState(true)
  const [armando, setArmando] = useState(false)

  // La dotación

  // Lo suyo: lo que tiene prestado y lo que se dio por perdido o dañado. Sin
  // filtrar por estado, porque una incidencia importa tanto como un préstamo
  // abierto — sobre todo al liquidar.
  const entregado = useEntregadoATrabajador(e?.id)
  const incidencias = useIncidencias(e?.id)
  const [anotando, setAnotando] = useState(false)
  const registrarIncidencia = useRegistrarIncidencia()
  const { data: companeros } = useEmpleados(true)

  const incidenciaVacia = {
    fecha: hoyEnCaracas(),
    tipo: 'AUSENCIA_JUSTIFICADA',
    lugar: '',
    momento: 'TODO_EL_DIA',
    dias_reposo: '',
    motivo: '',
    participantes: [] as number[],
  }
  const [inc, setInc] = useState(incidenciaVacia)

  /*
    Lo que se le entrega a una persona lo dice el catálogo, no la categoría.

    Antes era una lista de tres categorías —EPP, HERRAMIENTA, INSUMO— y eso
    dejaba fuera cosas que sí se entregan y metía cosas que no. Ahora entra lo
    que tenga un modo de entrega: `modo_entrega` distinto de `NO`. Media
    tonelada de granzón sigue sin aparecer, pero porque el catálogo lo dice, no
    porque alguien acertara la lista.
  */


  /*
    Los tres papeles salen por la misma puerta.

    La ficha, el carnet y la constancia se arman distinto y se guardan distinto
    —dos PDF y una imagen—, pero lo que se hace con ellos es lo mismo: mirarlos
    y decidir. Un solo estado con su título evita tres visores casi iguales que
    con el tiempo dejarían de parecerse.
  */
  const [vista, setVista] = useState<
    { archivo: ArchivoArmado; titulo: string; descripcion: string } | null
  >(null)

  /*
    El encuadre en pantalla arranca del guardado, pero solo se rehace cuando el
    guardado de verdad cambia.

    Cualquier acción de nómina invalida estas consultas y esta pantalla vuelve a
    pedir el empleado. Si el encuadre se reiniciara con cada respuesta, a quien
    esté centrando una cara se le movería sola a mitad del arrastre. Comparar
    los valores —y no la identidad del objeto— es lo que lo evita.
  */
  const clave = e ? `${e.id}|${e.foto_path ?? ''}|${e.foto_zoom}|${e.foto_x}|${e.foto_y}` : ''

  if (e && clave !== encuadreGuardado) {
    setEncuadreGuardado(clave)
    setEncuadre({ zoom: Number(e.foto_zoom), x: Number(e.foto_x), y: Number(e.foto_y) })
  }

  const puedeRRHH = puede('RRHH')

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />
  // Una ficha que no existe se dice, no se deja en blanco: quien llega por un
  // enlace viejo tiene que saber si se equivocó de número o si el sistema falló.
  if (!e)
    return (
      <Card>
        <Vacio
          icono={<UserX />}
          titulo="No hay ninguna ficha con ese número"
          descripcion="Puede que el trabajador se haya dado de baja o que el enlace venga con un número que ya no existe."
          accion={
            <Link to="/app/nomina/personal">
              <Button variant="outline">Ver el personal</Button>
            </Link>
          }
        />
      </Card>
    )

  const secciones = seccionesDe(e, metodos)

  /** La foto ya cargada como elemento, que es lo que saben pintar el lienzo y el PDF. */
  async function imagenLista(): Promise<HTMLImageElement | null> {
    if (!foto) return null
    const img = new Image()
    img.src = foto
    await img.decode()
    return img
  }

  async function exportar(tipo: Exportable) {
    if (!e) return
    setExportando(tipo)
    setFalloExportar(null)

    try {
      // El reverso es solo la marca: no lleva foto y no hace falta esperarla.
      const img = tipo === 'reverso' ? null : await imagenLista()

      if (tipo === 'frente' || tipo === 'reverso') {
        setVista({
          archivo: await armarCarnet(
            {
              ficha: e.ficha,
              nombres: e.nombres,
              apellidos: e.apellidos,
              cedula: e.cedula,
              cargo: e.cargo,
              departamento: e.departamento,
              fecha_ingreso: e.fecha_ingreso,
              grupo_sanguineo: e.grupo_sanguineo,
              foto: img,
              encuadre,
            },
            tipo,
          ),
          titulo:
            tipo === 'frente'
              ? `Carnet de ${e.nombres} ${e.apellidos} — frente`
              : 'Carnet — reverso',
          descripcion:
            tipo === 'frente'
              ? '54 × 86 mm a 300 dpi. Revisa que la cara esté centrada antes de mandarlo a imprimir.'
              : 'La marca, la razón social y el RIF. Es igual para todos: se imprime una vez y sirve para todos los carnets.',
        })
      } else {
        setVista({
          archivo: await armarFicha({
            ficha: e.ficha,
            nombreCompleto: `${e.nombres} ${e.apellidos}`,
            cargo: e.cargo,
            departamento: e.departamento,
            estado: e.activo
              ? `Activo desde el ${fecha(e.fecha_ingreso)}`
              : `Egresado el ${fecha(e.fecha_egreso)}`,
            activo: e.activo,
            secciones,
            foto: img,
            encuadre,
            emitidaPor: nombre,
          }),
          titulo: `Ficha ${e.ficha} — ${e.nombres} ${e.apellidos}`,
          descripcion: 'Todos los datos del trabajador en una hoja A4.',
        })
      }
    } catch (err) {
      setFalloExportar(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setExportando(null)
    }
  }

  async function emitirConstancia() {
    if (!e) return
    setArmando(true)
    setFalloExportar(null)

    try {
      const pdf = await armarConstancia({
        nombreCompleto: `${e.nombres} ${e.apellidos}`,
        cedula: e.cedula,
        ficha: e.ficha,
        cargo: e.cargo,
        departamento: e.departamento,
        fechaIngreso: e.fecha_ingreso,
        fechaEgreso: e.fecha_egreso,
        activo: e.activo,
        genero: e.genero,
        // `base_estipulacion` y no `frecuencia`: aquí se estipula mensual y se
        // paga quincenal. Poner la frecuencia diría «salario quincenal de 310»
        // cuando la quincena son 155.
        sueldo: conSueldo
          ? { monto: e.salario_base, moneda: e.moneda_salario, base: e.base_estipulacion }
          : null,
        // Dónde se expide sale de los datos de la empresa, no de una constante
        // escrita aquí: si la empresa se muda, la carta lo dice sola.
        ciudad: empresa.data?.ciudad || empresa.data?.estado || 'Ciudad Bolívar',
        domicilio: empresa.data?.domicilio_fiscal ?? null,
        firma,
        emitidaPor: nombre,
      })
      setVista({
        archivo: pdf,
        titulo: 'Constancia de trabajo',
        descripcion: 'Revísala antes de entregarla. La firma va a mano.',
      })
      setPidiendo(false)
    } catch (err) {
      setFalloExportar(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setArmando(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 py-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/app/nomina/personal"
            className="text-ink/50 hover:text-ink/80 rounded-control hover:bg-ink/6 -ml-1 grid size-8 place-items-center transition-colors"
            aria-label="Volver a Personal"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-ink/90 truncate text-2xl font-semibold tracking-tight">
              {e.nombres} {e.apellidos}
            </h1>
            <p className="text-ink/55 text-base">
              Ficha {e.ficha} · {e.cargo}
              {e.departamento ? ` · ${e.departamento}` : ''}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {/* La misma etiqueta y el mismo color que en la lista: si aquí
              dijera "Egresado" en gris y allá "Desincorporado" en rojo,
              parecerían dos estados distintos de la misma persona. */}
          <Chip tone={e.activo ? 'success' : 'danger'}>
            {e.activo ? 'Activo' : 'Desincorporado'}
          </Chip>
          {puedeRRHH ? (
            <Link to={`/app/nomina/personal/${e.id}/editar`}>
              <Button size="sm" variant="outline" icon={<Pencil />}>
                Editar datos
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* ------------------------------- Foto ------------------------------- */}
        <Card>
          <EncuadreFoto
            url={foto}
            encuadre={encuadre}
            editable={puedeRRHH}
            guardando={subir.isPending || quitar.isPending}
            onEncuadre={setEncuadre}
            onArchivo={(archivo) => subir.mutate({ empleado_id: e.id, archivo })}
            onQuitar={() => quitar.mutate({ empleado_id: e.id })}
          />

          {puedeRRHH && foto ? (
            <div className="mt-4 flex justify-center">
              <Button
                size="sm"
                variant="soft"
                disabled={guardarEncuadre.isPending}
                onClick={() =>
                  guardarEncuadre.mutate({
                    empleado_id: e.id,
                    zoom: encuadre.zoom,
                    x: encuadre.x,
                    y: encuadre.y,
                  })
                }
              >
                {guardarEncuadre.isPending ? 'Guardando…' : 'Guardar el encuadre'}
              </Button>
            </div>
          ) : null}

          {subir.error ? <ErrorDeCarga error={subir.error} className="mt-3" /> : null}
          {quitar.error ? <ErrorDeCarga error={quitar.error} className="mt-3" /> : null}
          {guardarEncuadre.error ? (
            <ErrorDeCarga error={guardarEncuadre.error} className="mt-3" />
          ) : null}
        </Card>

        {/* ------------------------------ Datos ------------------------------ */}
        <div className="grid min-w-0 gap-4">
          {secciones.map((s) => (
            <Card key={s.titulo}>
              <h2 className="text-royal-600 dark:text-royal-300 border-royal-600 dark:border-royal-300 mb-3 border-b pb-1.5 text-xs font-bold tracking-wider uppercase">
                {s.titulo}
              </h2>
              <dl className="grid gap-x-8 sm:grid-cols-2">
                {s.campos.map((c) => (
                  <div
                    key={c.clave || c.valor}
                    className={
                      c.ancho
                        ? 'border-hairline flex flex-wrap justify-between gap-x-6 gap-y-1 border-b py-2 last:border-0 sm:col-span-2'
                        : 'border-hairline flex flex-wrap justify-between gap-x-6 gap-y-1 border-b py-2'
                    }
                  >
                    {c.clave ? <dt className="text-ink/45 text-sm">{c.clave}</dt> : null}
                    <dd
                      className={
                        c.clave
                          ? 'text-ink/85 ml-auto text-sm font-medium'
                          : 'text-ink/75 text-sm'
                      }
                    >
                      {c.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}

          {/*
            LA FIRMA DEL TRABAJADOR

            Christopher: «tanto usuarios como empleados deben tener la
            posibilidad de registrar su firma digital». Un obrero de la cantera
            no entra al sistema —no tiene usuario ni clave— así que la carga
            quien lleva el personal, con él delante o con el papel que firmó.

            Va aquí, entre sus datos y sus descargas, porque es un dato suyo
            más: sale impresa en el recibo de pago que se le entrega.
          */}
          <TarjetaFirma
            nombre={`${e.nombres} ${e.apellidos}`}
            de={{ tipo: 'empleado', id: e.id, puedeEditar: puedeRRHH }}
          />

          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Button
                  block
                  icon={<FileText />}
                  disabled={exportando !== null}
                  onClick={() => void exportar('pdf')}
                >
                  {exportando === 'pdf' ? 'Armando el PDF…' : 'Ficha completa (PDF)'}
                </Button>
              </div>
              <Button
                block
                variant="soft"
                icon={<IdCard />}
                disabled={exportando !== null}
                onClick={() => void exportar('frente')}
              >
                {exportando === 'frente' ? 'Armando…' : 'Carnet · frente'}
              </Button>
              <Button
                block
                variant="soft"
                icon={<IdCard />}
                disabled={exportando !== null}
                onClick={() => void exportar('reverso')}
              >
                {exportando === 'reverso' ? 'Armando…' : 'Carnet · reverso'}
              </Button>
              <div className="sm:col-span-2">
                <Button
                  block
                  variant="outline"
                  icon={<ScrollText />}
                  disabled={armando}
                  onClick={() => setPidiendo(true)}
                >
                  Constancia de trabajo
                </Button>
              </div>
            </div>

            <p className="text-ink/40 mt-3 text-center text-xs">
              Todo se abre en pantalla antes de guardarse. El PDF trae todos los datos en A4. El
              carnet sale en dos imágenes, cada una de 54 × 86 mm a 300 dpi —638 × 1016 píxeles—,
              que es lo que pide una imprenta para que no salga pixelado: el frente es de esta
              persona, y el reverso lleva la marca y el RIF y es igual para todos. La constancia es
              la carta que se entrega a un banco o a quien la pida.
            </p>

            {falloExportar ? <ErrorDeCarga error={falloExportar} className="mt-3" /> : null}
          </Card>

        </div>
      </div>

      {/*
        LA CUENTA DEL SISTEMA, Y EL SILENCIO CUANDO NO LA HAY

        La líder lo pidió con estas palabras: «Si tiene usuario asignado: mostrar
        de forma explícita la fecha de creación, el nombre de usuario y el rol
        asignado. Si NO tiene usuario asignado: el sistema debe actuar de manera
        silenciosa, sin mostrar ningún indicador o mención al respecto».

        El silencio importa y no es un capricho de diseño: de veintidós
        trabajadores solo unos pocos entran al sistema. Un «sin cuenta» en las
        otras dieciocho fichas se leería como una carencia, como algo que falta
        por hacer, y no lo es — la mayoría de la gente de una cantera no necesita
        entrar a un sistema.

        La única grieta al silencio es para quien puede atarla: sin un sitio
        desde donde hacerlo, la función no existiría. Es un botón discreto y solo
        lo ve quien tiene la casilla, no todo el que abra la ficha.
      */}
      {e.cuenta || puedeVincular ? (
        <Card className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardHeader
              title="Cuenta del sistema"
              subtitle={
                e.cuenta
                  ? 'Con qué usuario entra esta persona y qué puede hacer dentro.'
                  : 'Esta persona todavía no tiene cuenta atada a su ficha.'
              }
            />
            {puedeVincular ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCuentaElegida(e.perfil_id ?? '')
                  setAtandoCuenta(true)
                }}
              >
                {e.cuenta ? 'Cambiar' : 'Atar una cuenta'}
              </Button>
            ) : null}
          </div>

          {e.cuenta ? (
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink/50 shrink-0">Usuario</dt>
                <dd className="text-ink/85 tabular truncate text-right font-medium">
                  {e.cuenta.usuario}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink/50 shrink-0">Cuenta creada</dt>
                <dd className="text-ink/80 truncate text-right">{fecha(e.cuenta.creado_en)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink/50 shrink-0">Rol</dt>
                <dd className="flex flex-wrap justify-end gap-1.5 text-right">
                  {e.cuenta.roles.length === 0 ? (
                    <span className="text-ink/45">Sin roles: entra pero no alcanza nada</span>
                  ) : (
                    e.cuenta.roles.map((r) => (
                      <Chip key={r.rol} tone="royal">
                        {etiquetaDeRol(r.rol)}
                      </Chip>
                    ))
                  )}
                </dd>
              </div>

              {/* Una cuenta desactivada sigue atada, y hay que decirlo: si no,
                  la ficha promete un acceso que ya no existe. */}
              {!e.cuenta.activo ? (
                <p className="text-warning border-warning/30 bg-warning-soft mt-3 rounded-[6px] border p-2.5 text-xs">
                  Esta cuenta está desactivada. La persona no alcanza nada del sistema, aunque la
                  ficha siga atada a ella.
                </p>
              ) : null}
            </dl>
          ) : null}
        </Card>
      ) : null}

      {/* ---------------- Atar la cuenta ---------------- */}
      <Modal
        abierto={atandoCuenta}
        onCerrar={() => setAtandoCuenta(false)}
        titulo="Atar una cuenta a esta ficha"
        descripcion="Dejas dicho que el trabajador de esta ficha y ese usuario del sistema son la misma persona. No le da ni le quita ningún permiso."
        acciones={
          <>
            <Button variant="ghost" onClick={() => setAtandoCuenta(false)}>
              Cancelar
            </Button>
            {e.perfil_id ? (
              <Button
                variant="outline"
                className="text-danger border-danger/30"
                disabled={vincular.isPending}
                onClick={() =>
                  vincular.mutate(
                    { empleado_id: e.id, perfil_id: null },
                    { onSuccess: () => setAtandoCuenta(false) },
                  )
                }
              >
                Desatar
              </Button>
            ) : null}
            <Button
              disabled={vincular.isPending || !cuentaElegida || cuentaElegida === e.perfil_id}
              onClick={() =>
                vincular.mutate(
                  { empleado_id: e.id, perfil_id: cuentaElegida },
                  { onSuccess: () => setAtandoCuenta(false) },
                )
              }
            >
              Atar
            </Button>
          </>
        }
      >
        <SelectBuscable
          label="Qué cuenta es suya"
          opciones={(cuentasLibres.data ?? []).map((c: { id: string; usuario: string; nombre: string; cargo: string | null }) => ({
            valor: c.id,
            nombre: c.nombre,
            codigo: c.usuario,
            detalle: c.cargo ?? undefined,
          }))}
          valor={cuentaElegida}
          onCambio={(v: string) => setCuentaElegida(v)}
          vacio="Busca por nombre o por usuario"
          hint="Solo salen las cuentas que no son de nadie todavía. Una cuenta es de una sola persona."
        />

        {vincular.error ? <ErrorDeCarga error={vincular.error} className="mt-3" /> : null}
      </Modal>

      {/*
        QUÉ TIENE EN LA MANO, EN SU PROPIA FICHA

        La entrega se hacía desde aquí y lo entregado no se veía desde aquí: había
        que ir a Asignaciones y buscar por persona. Quien firma una entrega o
        cierra un egreso necesita saber en la misma pantalla qué queda pendiente
        de devolver y qué se dio por perdido.
      */}
      {/*
        TRES COSAS DISTINTAS, TRES SECCIONES

        Se parecen en que se le dieron a la misma persona, y en nada más.

        DOTACIÓN es lo que necesita por su rol, mientras trabaje. ASIGNACIÓN es
        lo que se le dio para una faena concreta y hay que recuperar cuando
        acabe. La diferencia no es si vuelve —una laptop es dotación y vuelve—
        sino para qué se le dio.

        INCIDENCIA no es una cosa, es un hecho: se enfermó, se lesionó, faltó,
        tuvo un altercado. Antes no tenía dónde vivir.
      */}

      {[
        {
          clase: 'DOTACION' as const,
          titulo: 'Dotación',
          subtitulo: 'Lo que necesita por su rol: casco, botas, uniforme, equipo.',
          vacio: 'Todavía no se le ha dado dotación.',
        },
        {
          clase: 'ASIGNACION' as const,
          titulo: 'Asignado para una actividad',
          subtitulo: 'Lo que se le dio para una faena concreta y hay que recuperar.',
          vacio: 'No tiene nada asignado.',
        },
      ].map((seccion) => {
        const filas = (entregado.data ?? []).filter((x) => x.clase === seccion.clase)

        return (
          <Card flush key={seccion.clase} className="mt-4">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
              <CardHeader title={seccion.titulo} subtitle={seccion.subtitulo} />
              {puede('ALMACEN') || puede('RRHH') ? (
                <Link to={`/app/asignaciones/entregar?empleado=${e.id}`}>
                  <Button size="sm" variant="outline">
                    Entregar
                  </Button>
                </Link>
              ) : null}
            </div>

            {entregado.isPending ? <Cargando /> : null}

            {!entregado.isPending && filas.length === 0 ? (
              <p className="text-ink/45 px-5 pt-3 pb-5 text-sm">{seccion.vacio}</p>
            ) : null}

            {filas.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                      <th className="px-5 py-3 font-medium">Qué</th>
                      <th className="px-3 py-3 text-right font-medium">Cuánto</th>
                      <th className="px-3 py-3 font-medium">Desde</th>
                      <th className="px-5 py-3 text-right font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((x) => (
                      <tr key={`${x.origen}-${x.id}`} className="border-hairline border-b last:border-0">
                        <td className="px-5 py-2.5">
                          <p className="text-ink/85 font-medium">{x.articulo}</p>
                          <p className="text-ink/40 text-2xs font-mono">
                            {x.articulo_codigo} · {x.numero}
                          </p>
                        </td>
                        <td className="tabular text-ink/70 px-3 py-2.5 text-right">
                          {x.cantidad} {x.unidad}
                        </td>
                        <td className="text-ink/60 px-3 py-2.5 text-xs">{fecha(x.fecha)}</td>
                        <td className="px-5 py-2.5 text-right">
                          {/* Lo que se gasta no tiene estado que seguir: salió
                              del almacén y se acabó. Decir «entregado» es más
                              honesto que dejar la celda vacía. */}
                          {!x.vuelve ? (
                            <Chip tone="neutral">Entregado</Chip>
                          ) : (
                            <Chip
                              tone={
                                x.estado === 'ASIGNADA'
                                  ? 'royal'
                                  : x.estado === 'PERDIDA'
                                    ? 'danger'
                                    : x.estado === 'DANADA'
                                      ? 'warning'
                                      : 'neutral'
                              }
                            >
                              {x.estado === 'ASIGNADA'
                                ? 'En su poder'
                                : x.estado === 'DEVUELTA'
                                  ? 'Devuelta'
                                  : x.estado === 'PERDIDA'
                                    ? 'Perdida'
                                    : x.estado === 'DANADA'
                                      ? 'Dañada'
                                      : x.estado === 'REPUESTA'
                                        ? 'Repuesta'
                                        : (x.estado ?? '—')}
                            </Chip>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        )
      })}

      {/* ---------------------------- Incidencias ---------------------------- */}
      <Card flush className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <CardHeader
            title="Incidencias"
            subtitle="Lo que le pasó: enfermedad, lesión en labores, ausencia, conflicto."
          />
          {puede('RRHH') ? (
            <Button size="sm" variant="outline" onClick={() => setAnotando(true)}>
              Anotar una
            </Button>
          ) : null}
        </div>

        {incidencias.isPending ? <Cargando /> : null}

        {!incidencias.isPending && (incidencias.data ?? []).length === 0 ? (
          <p className="text-ink/45 px-5 pt-3 pb-5 text-sm">Ninguna anotada.</p>
        ) : null}

        {(incidencias.data ?? []).length > 0 ? (
          <ul className="mt-4">
            {(incidencias.data ?? []).map((i) => (
              <li key={i.id} className="border-hairline border-t px-5 py-3">
                {/* La línea sigue el orden en que se cuenta en voz alta: cuándo,
                    qué, dónde, cuánto duró, con quién. */}
                <p className="text-ink/85 text-sm">
                  <span className="tabular">{fecha(i.fecha)}</span>
                  {' · '}
                  <span className="font-medium">
                    {TIPOS_INCIDENCIA.find((t) => t.valor === i.tipo)?.etiqueta ?? i.tipo}
                  </span>
                  {i.lugar ? ` · ${i.lugar}` : ''}
                  {' · '}
                  {MOMENTOS_INCIDENCIA.find((m) => m.valor === i.momento)?.etiqueta ?? i.momento}
                  {i.dias_reposo ? ` (${i.dias_reposo} d de reposo)` : ''}
                  {' · '}
                  {i.participantes.length > 0 ? i.participantes.join(', ') : 'Individual'}
                </p>

                <p className="text-ink/55 mt-0.5 text-xs">Motivo: {i.motivo}</p>

                {/* En la ficha de quien solo participó, «se enfermó» sería
                    falso: se dice de quién es. */}
                {i.empleado_id !== e.id ? (
                  <p className="text-ink/40 text-2xs mt-0.5">
                    Anotada en la ficha de {i.empleado}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* --------------------- Constancia de trabajo --------------------- */}
      {pidiendo ? (
        <Modal
          abierto
          onCerrar={() => setPidiendo(false)}
          titulo="Constancia de trabajo"
          descripcion={`Para ${e.nombres} ${e.apellidos}`}
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setPidiendo(false)}>
                Cancelar
              </Button>
              <Button
                disabled={armando || !e.fecha_ingreso_confirmada}
                onClick={() => void emitirConstancia()}
              >
                {armando ? 'Armando…' : 'Emitir'}
              </Button>
            </>
          }
        >
          {/*
            La fecha de ingreso sin confirmar detiene la emisión, no la avisa.

            La constancia dice desde cuándo trabaja aquí esta persona, y sale
            firmada por la empresa. Las fichas que se cargaron del libro de
            nómina traen una fecha puesta por el sistema porque el archivo no la
            tenía; firmar esa fecha es afirmar como cierto algo que nadie ha
            comprobado. Un aviso que se puede saltar con un clic se salta.
          */}
          {!e.fecha_ingreso_confirmada ? (
            <div className="border-warning/30 bg-warning/8 flex items-start gap-2.5 rounded-[6px] border p-3">
              <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" />
              <div className="text-sm">
                <p className="text-ink/80 leading-relaxed">
                  Falta confirmar la fecha de ingreso. La constancia declara desde cuándo trabaja
                  aquí y sale firmada por la empresa: no se puede emitir con una fecha que nadie ha
                  revisado.
                </p>
                <Link
                  to={`/app/nomina/personal?editar=${e.id}`}
                  className="text-royal-600 hover:text-royal-700 dark:text-royal-300 mt-2 inline-block font-medium"
                >
                  Corregir la fecha de ingreso
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-ink/70 text-sm leading-relaxed">
                Va en papel de la empresa, con el logo, y declara que{' '}
                <strong className="text-ink/90 font-medium">
                  {e.activo ? 'presta sus servicios' : 'prestó sus servicios'}
                </strong>{' '}
                desde el {fecha(e.fecha_ingreso)}
                {e.activo ? '' : ` hasta el ${fecha(e.fecha_egreso)}`} como {e.cargo}.
              </p>

              <label className="text-ink/75 flex cursor-pointer items-start gap-2.5 text-sm select-none">
                <input
                  type="checkbox"
                  className="accent-royal-600 mt-0.5 size-4"
                  checked={conSueldo}
                  onChange={(ev) => setConSueldo(ev.target.checked)}
                />
                <span>
                  Incluir el sueldo
                  <span className="text-ink/45 block text-xs">
                    {conSueldo
                      ? `Dirá ${dinero(e.moneda_salario, e.salario_base)} ${
                          BASES_SALARIO.find(
                            (b) => b.valor === e.base_estipulacion,
                          )?.etiqueta.toLowerCase() ?? 'mensual'
                        }. El banco lo exige; un arrendador no tiene por qué verlo.`
                      : 'La carta no dirá cuánto gana.'}
                  </span>
                </span>
              </label>

              {!firma.nombre ? (
                <p className="text-ink/45 text-xs leading-relaxed">
                  Nadie ha cargado quién firma por Recursos humanos, así que el renglón de la firma
                  sale con el cargo y sin nombre, para llenarlo a mano. Se configura en Parámetros
                  de nómina.
                </p>
              ) : null}
            </div>
          )}

          {falloExportar ? <ErrorDeCarga error={falloExportar} className="mt-4" /> : null}
        </Modal>
      ) : null}

      <Visor
        abierto={vista !== null}
        onCerrar={() => setVista(null)}
        blob={vista?.archivo.blob ?? null}
        nombreArchivo={vista?.archivo.nombre ?? 'documento.pdf'}
        titulo={vista?.titulo ?? ''}
        descripcion={vista?.descripcion}
      />

      {/* ------------------------ Anotar una incidencia ----------------------- */}
      {anotando ? (
        <Modal
          abierto
          ancho="lg"
          onCerrar={() => setAnotando(false)}
          titulo={`Anotar una incidencia de ${e.nombres}`}
          descripcion="Lo que pasó, cuándo y por qué. Queda en su ficha y en la de quien haya participado."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setAnotando(false)}>
                Cancelar
              </Button>
              <Button
                disabled={inc.motivo.trim().length < 5 || registrarIncidencia.isPending}
                onClick={async () => {
                  await registrarIncidencia.mutateAsync({
                    empleado_id: e.id,
                    fecha: inc.fecha,
                    tipo: inc.tipo,
                    motivo: inc.motivo,
                    lugar: inc.lugar || null,
                    momento: inc.momento,
                    dias_reposo: inc.dias_reposo ? Number(inc.dias_reposo) : null,
                    participantes: inc.participantes,
                  })
                  setInc(incidenciaVacia)
                  setAnotando(false)
                }}
              >
                {registrarIncidencia.isPending ? 'Guardando…' : 'Anotar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Cuándo"
              type="date"
              max={hoyEnCaracas()}
              value={inc.fecha}
              onChange={(ev) => setInc({ ...inc, fecha: ev.target.value })}
            />

            <Select
              label="Qué pasó"
              value={inc.tipo}
              onChange={(ev) => setInc({ ...inc, tipo: ev.target.value })}
              opciones={TIPOS_INCIDENCIA.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta }))}
            />

            <Input
              label="Dónde"
              placeholder="Planta 01"
              value={inc.lugar}
              onChange={(ev) => setInc({ ...inc, lugar: ev.target.value.toUpperCase() })}
            />

            <Select
              label="Cuánto duró"
              value={inc.momento}
              onChange={(ev) => setInc({ ...inc, momento: ev.target.value })}
              opciones={MOMENTOS_INCIDENCIA}
            />

            {/* El reposo solo aparece donde tiene sentido: nadie reposa de una
                discusión, y un campo vacío que no aplica se llena por inercia. */}
            {TIPOS_INCIDENCIA.find((t) => t.valor === inc.tipo)?.reposo ? (
              <Input
                label="Días de reposo"
                type="number"
                min="0"
                step="0.5"
                hint={
                  inc.momento === 'VARIOS_DIAS'
                    ? 'Obligatorio si duró varios días.'
                    : 'Vacío si no hubo reposo.'
                }
                value={inc.dias_reposo}
                onChange={(ev) => setInc({ ...inc, dias_reposo: ev.target.value })}
              />
            ) : null}
          </div>

          {/* Quién más estuvo. Sin nadie, la incidencia es individual — que es
              exactamente lo que quiere decir esa palabra en el papel. */}
          <div className="mt-4">
            <p className="text-ink/75 mb-1.5 text-sm font-medium">Quién más estuvo</p>

            <div className="border-hairline max-h-40 overflow-y-auto rounded-[8px] border p-2">
              {(companeros ?? [])
                .filter((c) => c.id !== e.id)
                .map((c) => {
                  const puesto = inc.participantes.includes(c.id)
                  return (
                    <label
                      key={c.id}
                      className="hover:bg-ink/4 flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={puesto}
                        onChange={() =>
                          setInc({
                            ...inc,
                            participantes: puesto
                              ? inc.participantes.filter((x) => x !== c.id)
                              : [...inc.participantes, c.id],
                          })
                        }
                      />
                      <span className="text-ink/80">
                        {c.nombres} {c.apellidos}
                      </span>
                      <span className="text-ink/40 text-xs">ficha {c.ficha}</span>
                    </label>
                  )
                })}
            </div>

            <p className="text-ink/45 mt-1.5 text-xs">
              {inc.participantes.length === 0
                ? 'Sin nadie marcado queda como individual.'
                : `Saldrá también en la ficha de ${inc.participantes.length} persona${inc.participantes.length === 1 ? '' : 's'}.`}
            </p>
          </div>

          <div className="mt-4">
            <Textarea
              label="Motivo"
              rows={3}
              placeholder="Desacuerdo por uso de maquinaria"
              hint="Lo que se escriba aquí es lo que se va a leer dentro de un año."
              value={inc.motivo}
              onChange={(ev) => setInc({ ...inc, motivo: ev.target.value })}
            />
          </div>

          {registrarIncidencia.error ? (
            <ErrorDeCarga error={registrarIncidencia.error} className="mt-4" />
          ) : null}
        </Modal>
      ) : null}
    </>
  )
}
