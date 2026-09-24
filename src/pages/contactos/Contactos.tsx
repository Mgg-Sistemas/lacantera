import { useMemo, useState } from 'react'
import {
  BookUser,
  Building2,
  Copy,
  Download,
  FileSpreadsheet,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Upload,
  User,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useMisPermisos, useUsuarios } from '@/lib/api/usuarios'
import { bajarArchivo, escribirXlsx } from '@/lib/xlsx'
import {
  ESTADOS_DE_CONTACTO,
  datosDe,
  datosVacios,
  enlaceLlamada,
  enlaceWhatsApp,
  useContactos,
  useDuplicadosDeContactos,
  useEtiquetasDeContacto,
  type Contacto,
  type DatosContacto,
} from '@/lib/api/contactos'
import { hojaDeContactos, vCardDe } from './hojas'
import { FormularioContacto } from './FormularioContacto'
import { CargaContactos } from './CargaContactos'
import { documento } from '@/lib/formato'
import { cn } from '@/lib/cn'

/*
  EL DIRECTORIO

  Una lista, un buscador que filtra mientras se escribe, y filtros que se
  combinan: «los proveedores de Puerto Ordaz que estén activos» es escribir
  «puerto ordaz» y marcar dos selectores.

  SE BUSCA SOBRE LO QUE MANTIENE LA BASE. `busqueda` ya junta nombre, empresa,
  cargo, correos, teléfonos —con y sin formato—, ciudad y etiquetas, sin
  acentos. Cada palabra que se escribe tiene que estar: «perez 0414» es Pérez
  por su celular. Se filtra en la pantalla porque el directorio entero cabe de
  sobra en memoria y así responde a cada tecla.

  LO QUE SE EXPORTA ES LO QUE SE VE, o lo marcado. A Excel para trabajarlo, a
  vCard para pasarlo al teléfono.
*/

const llano = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

function Canal({ href, icono, texto, nuevo }: { href: string | null; icono: React.ReactNode; texto: string; nuevo?: boolean }) {
  if (!href) return null
  return (
    <a
      href={href}
      target={nuevo ? '_blank' : undefined}
      rel={nuevo ? 'noreferrer' : undefined}
      className="text-ink/60 hover:text-royal-700 dark:hover:text-royal-300 inline-flex items-center gap-1 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      {icono}
      {texto}
    </a>
  )
}

export function Contactos() {
  const { data, isPending, error } = useContactos()
  const { data: etiquetas } = useEtiquetasDeContacto()
  const { data: usuarios } = useUsuarios()
  const duplicados = useDuplicadosDeContactos()
  const { puede } = useMisPermisos()
  const puedeEscribir = puede('CONTACTOS', 'ESCRITURA')
  const puedeTodo = puede('CONTACTOS', 'TOTAL')

  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [estado, setEstado] = useState('ACTIVO')
  const [region, setRegion] = useState('')
  const [asignado, setAsignado] = useState('')
  const [marcados, setMarcados] = useState<Set<number>>(new Set())
  const [editando, setEditando] = useState<{ contacto: Contacto | null; inicial: DatosContacto } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [soloRepetidos, setSoloRepetidos] = useState(false)

  const regiones = useMemo(
    () => [...new Set((data ?? []).map((c) => c.estado_region).filter((x): x is string => !!x))].sort(),
    [data],
  )
  const enDuplicado = useMemo(() => {
    const s = new Set<number>()
    for (const d of duplicados.data ?? []) {
      s.add(d.id_a)
      s.add(d.id_b)
    }
    return s
  }, [duplicados.data])

  const visibles = useMemo(() => {
    const palabras = llano(texto).split(/\s+/).filter(Boolean)
    return (data ?? []).filter((c) => {
      if (tipo && c.tipo !== tipo) return false
      if (etiqueta && !c.etiquetas.includes(etiqueta)) return false
      if (estado && c.estado !== estado) return false
      if (region && c.estado_region !== region) return false
      if (asignado && c.asignado_a !== asignado) return false
      if (soloRepetidos && !enDuplicado.has(c.id)) return false
      return palabras.every((p) => c.busqueda.includes(p))
    })
  }, [data, texto, tipo, etiqueta, estado, region, asignado, soloRepetidos, enDuplicado])

  const paraSacar = marcados.size > 0 ? visibles.filter((c) => marcados.has(c.id)) : visibles
  const cuantos = paraSacar.length
  const hoy = new Date().toISOString().slice(0, 10)

  const alternar = (id: number) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const todosMarcados = visibles.length > 0 && visibles.every((c) => marcados.has(c.id))

  const nombreEtiqueta = (cod: string) => etiquetas?.find((e) => e.codigo === cod)?.nombre ?? cod

  return (
    <>
      <PageHeader
        title="Contactos"
        description="Personas y empresas con las que trata la empresa: cómo se les habla, dónde están y quién los atiende."
        actions={
          <>
            <Button
              variant="outline"
              icon={<FileSpreadsheet />}
              disabled={cuantos === 0}
              onClick={() => bajarArchivo(escribirXlsx(hojaDeContactos(paraSacar)), `contactos-${hoy}.xlsx`)}
            >
              Excel{marcados.size > 0 ? ` (${cuantos})` : ''}
            </Button>
            <Button
              variant="outline"
              icon={<Download />}
              disabled={cuantos === 0}
              onClick={() =>
                bajarArchivo(new Blob([vCardDe(paraSacar)], { type: 'text/vcard;charset=utf-8' }), `contactos-${hoy}.vcf`)
              }
              title="Para pasarlos al teléfono"
            >
              vCard{marcados.size > 0 ? ` (${cuantos})` : ''}
            </Button>
            {puedeEscribir ? (
              <>
                <Button variant="outline" icon={<Upload />} onClick={() => setCargando(true)}>
                  Importar
                </Button>
                <Button icon={<Plus />} onClick={() => setEditando({ contacto: null, inicial: datosVacios() })}>
                  Nuevo contacto
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {(duplicados.data?.length ?? 0) > 0 ? (
        <Card className="border-warning/30 bg-warning-soft mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink/80 text-sm">
            <Copy className="mr-1 inline size-4" />
            Hay {duplicados.data!.length} pareja{duplicados.data!.length === 1 ? '' : 's'} de contactos que comparten correo o
            teléfono. Puede ser la misma persona dos veces.
          </p>
          <Button size="sm" variant={soloRepetidos ? 'primary' : 'outline'} onClick={() => setSoloRepetidos((v) => !v)}>
            {soloRepetidos ? 'Ver todos' : 'Ver solo esos'}
          </Button>
        </Card>
      ) : null}

      {data && data.length > 0 ? (
        <Card className="mb-4">
          <div className="grid gap-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Input
                label="Buscar"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Nombre, empresa, correo, teléfono, ciudad…"
                icon={<Search />}
              />
            </div>
            <Select
              label="Tipo"
              vacio="Personas y empresas"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              opciones={[
                { valor: 'PERSONA', etiqueta: 'Personas' },
                { valor: 'EMPRESA', etiqueta: 'Empresas' },
              ]}
            />
            <Select
              label="Etiqueta"
              vacio="Todas"
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              opciones={(etiquetas ?? []).map((e) => ({ valor: e.codigo, etiqueta: e.nombre }))}
            />
            <Select
              label="Estado"
              vacio="Cualquiera"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              opciones={Object.entries(ESTADOS_DE_CONTACTO).map(([k, v]) => ({ valor: k, etiqueta: v.etiqueta }))}
            />
            <Select
              label="Región"
              vacio="Todas"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              opciones={regiones.map((r) => ({ valor: r, etiqueta: r }))}
            />
            <Select
              className="lg:col-span-2"
              label="Quién lo atiende"
              vacio="Cualquiera"
              value={asignado}
              onChange={(e) => setAsignado(e.target.value)}
              opciones={(usuarios ?? []).map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
            />
            <p className="text-ink/45 self-end text-xs lg:col-span-4">
              {visibles.length === data.length
                ? `${data.length} contacto${data.length === 1 ? '' : 's'}`
                : `${visibles.length} de ${data.length}`}
              {marcados.size > 0 ? ` · ${marcados.size} marcado${marcados.size === 1 ? '' : 's'}` : ''}
              {texto || tipo || etiqueta || estado !== 'ACTIVO' || region || asignado || soloRepetidos ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="text-royal-600 hover:underline"
                    onClick={() => {
                      setTexto('')
                      setTipo('')
                      setEtiqueta('')
                      setEstado('ACTIVO')
                      setRegion('')
                      setAsignado('')
                      setSoloRepetidos(false)
                    }}
                  >
                    limpiar filtros
                  </button>
                </>
              ) : null}
            </p>
          </div>
        </Card>
      ) : null}

      {data && data.length === 0 ? (
        <Card>
          <Vacio
            icono={<BookUser />}
            titulo="El directorio está vacío"
            descripcion="Crea el primer contacto, o carga muchos de una vez desde Excel."
            accion={
              puedeEscribir ? (
                <Button icon={<Plus />} onClick={() => setEditando({ contacto: null, inicial: datosVacios() })}>
                  Nuevo contacto
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : null}

      {data && data.length > 0 && visibles.length === 0 ? (
        <Card>
          <Vacio icono={<Search />} titulo="Nada con esos filtros" descripcion="Prueba con menos palabras o quita un filtro." />
        </Card>
      ) : null}

      {visibles.length > 0 ? (
        <Card flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-ink/45 border-hairline border-b text-left text-xs">
                  <th className="w-8 px-4 py-2">
                    <input
                      type="checkbox"
                      className="accent-royal-600 size-4"
                      checked={todosMarcados}
                      onChange={() =>
                        setMarcados(todosMarcados ? new Set() : new Set(visibles.map((c) => c.id)))
                      }
                    />
                  </th>
                  <th className="py-2 pr-4 font-medium">Contacto</th>
                  <th className="py-2 pr-4 font-medium">Empresa · cargo</th>
                  <th className="py-2 pr-4 font-medium">Canales</th>
                  <th className="py-2 pr-4 font-medium">Dónde</th>
                  <th className="py-2 pr-4 font-medium">Etiquetas</th>
                  <th className="py-2 pr-4 font-medium">Atiende</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      'border-hairline hover:bg-ink/5 cursor-pointer border-b last:border-0',
                      c.estado !== 'ACTIVO' && 'opacity-70',
                    )}
                    onClick={() => setEditando({ contacto: c, inicial: datosDe(c) })}
                  >
                    <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="accent-royal-600 size-4" checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-start gap-2">
                        <span className="text-ink/40 mt-0.5">
                          {c.tipo === 'EMPRESA' ? <Building2 className="size-4" /> : <User className="size-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="text-ink/90 font-medium">
                            {c.tratamiento ? `${c.tratamiento} ` : ''}
                            {c.nombre}
                            {enDuplicado.has(c.id) ? (
                              <span className="text-warning ml-1 text-xs" title="Comparte correo o teléfono con otro">
                                · repetido
                              </span>
                            ) : null}
                          </p>
                          <p className="text-ink/45 text-xs">
                            {c.documento ? documento(c.documento) : ''}
                            {c.tipo === 'EMPRESA' && c.personas > 0 ? ` · ${c.personas} persona${c.personas === 1 ? '' : 's'}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-ink/70 py-2 pr-4 text-xs">
                      {c.empresa ?? c.empresa_nombre ?? ''}
                      {c.cargo ? <span className="text-ink/45 block">{c.cargo}</span> : null}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-col gap-0.5">
                        <Canal href={enlaceWhatsApp(c.whatsapp ?? c.celular)} icono={<MessageCircle className="size-3" />} texto={c.whatsapp ?? c.celular ?? ''} nuevo />
                        {c.celular && c.whatsapp && c.celular !== c.whatsapp ? (
                          <Canal href={enlaceLlamada(c.celular)} icono={<Phone className="size-3" />} texto={c.celular} />
                        ) : null}
                        {c.telefono_oficina ? (
                          <Canal
                            href={enlaceLlamada(c.telefono_oficina)}
                            icono={<Phone className="size-3" />}
                            texto={`${c.telefono_oficina}${c.extension ? ` ext. ${c.extension}` : ''}`}
                          />
                        ) : null}
                        <Canal href={c.correo ? `mailto:${c.correo}` : null} icono={<Mail className="size-3" />} texto={c.correo ?? ''} />
                      </div>
                    </td>
                    <td className="text-ink/60 py-2 pr-4 text-xs">
                      {[c.ciudad, c.estado_region].filter(Boolean).join(', ')}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {c.etiquetas.map((e) => (
                          <Chip key={e} tone="neutral">
                            {nombreEtiqueta(e)}
                          </Chip>
                        ))}
                      </div>
                    </td>
                    <td className="text-ink/60 py-2 pr-4 text-xs">{c.asignado ?? ''}</td>
                    <td className="py-2 pr-4">
                      <Chip tone={ESTADOS_DE_CONTACTO[c.estado].tono}>{ESTADOS_DE_CONTACTO[c.estado].etiqueta}</Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {editando ? (
        <FormularioContacto
          contacto={editando.contacto}
          inicial={editando.inicial}
          puedeBorrar={puedeTodo}
          onCerrar={() => setEditando(null)}
        />
      ) : null}

      {cargando ? <CargaContactos etiquetas={etiquetas ?? []} onCerrar={() => setCargando(false)} /> : null}
    </>
  )
}
