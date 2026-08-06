import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, FileText, IdCard, Pencil, ScrollText, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Modal } from '@/components/ui/Modal'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { EncuadreFoto } from '@/components/EncuadreFoto'
import { Visor } from '@/components/Visor'
import {
  BASES_SALARIO,
  ESTADOS_CIVILES,
  FORMAS_PAGO,
  FRECUENCIAS,
  GENEROS,
  JORNADAS,
  useEmpleado,
  useFirmaRrhh,
  useFoto,
  useGuardarEncuadre,
  useQuitarFoto,
  useSubirFoto,
} from '@/lib/api/nomina'
import type { Empleado } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { useEmpresa } from '@/lib/api/empresa'
import { useSesion } from '@/lib/sesion'
import { armarCarnet } from '@/lib/ficha/carnet'
import { armarFicha, type Seccion } from '@/lib/ficha/fichaPdf'
import { armarConstancia } from '@/lib/ficha/constanciaPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { ENCUADRE_CENTRADO, type Encuadre } from '@/lib/ficha/encuadre'
import { dinero, fecha } from '@/lib/formato'

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
function seccionesDe(e: Empleado): Seccion[] {
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
        { clave: 'Forma de pago', valor: etiqueta(FORMAS_PAGO, e.forma_pago) },
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
  const { id } = useParams()
  const { data: e, isPending, error } = useEmpleado(id ? Number(id) : undefined)
  const { puede } = useMisRoles()
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
  if (!e) return null

  const secciones = seccionesDe(e)

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
          <Chip tone={e.activo ? 'success' : 'neutral'}>{e.activo ? 'Activo' : 'Egresado'}</Chip>
          {puedeRRHH ? (
            <Link to={`/app/nomina/personal?editar=${e.id}`}>
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
    </>
  )
}
