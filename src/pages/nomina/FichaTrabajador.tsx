import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, FileText, IdCard, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { EncuadreFoto } from '@/components/EncuadreFoto'
import {
  BASES_SALARIO,
  ESTADOS_CIVILES,
  FORMAS_PAGO,
  FRECUENCIAS,
  GENEROS,
  JORNADAS,
  useEmpleado,
  useFoto,
  useGuardarEncuadre,
  useQuitarFoto,
  useSubirFoto,
} from '@/lib/api/nomina'
import type { Empleado } from '@/lib/api/nomina'
import { useMisRoles } from '@/lib/api/catalogo'
import { useSesion } from '@/lib/sesion'
import { descargarCarnet } from '@/lib/ficha/carnet'
import { descargarFicha, type Seccion } from '@/lib/ficha/fichaPdf'
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
  const [exportando, setExportando] = useState<'pdf' | 'png' | null>(null)
  const [falloExportar, setFalloExportar] = useState<Error | null>(null)

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

  async function exportar(tipo: 'pdf' | 'png') {
    if (!e) return
    setExportando(tipo)
    setFalloExportar(null)

    try {
      const img = await imagenLista()

      if (tipo === 'png') {
        await descargarCarnet({
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
        })
      } else {
        await descargarFicha({
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
        })
      }
    } catch (err) {
      setFalloExportar(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setExportando(null)
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
              <Button
                block
                icon={<FileText />}
                disabled={exportando !== null}
                onClick={() => void exportar('pdf')}
              >
                {exportando === 'pdf' ? 'Armando el PDF…' : 'Ficha completa (PDF)'}
              </Button>
              <Button
                block
                variant="soft"
                icon={<IdCard />}
                disabled={exportando !== null}
                onClick={() => void exportar('png')}
              >
                {exportando === 'png' ? 'Armando la imagen…' : 'Carnet (imagen)'}
              </Button>
            </div>

            <p className="text-ink/40 mt-3 text-center text-xs">
              El PDF trae todos los datos en A4. La imagen es el carnet de 54 × 86 mm a 300 dpi
              —638 × 1016 píxeles—, que es lo que pide una imprenta para que no salga pixelado.
            </p>

            {falloExportar ? <ErrorDeCarga error={falloExportar} className="mt-3" /> : null}
          </Card>
        </div>
      </div>
    </>
  )
}
