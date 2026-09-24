import { useState, type ReactNode } from 'react'
import { ExternalLink, MapPin, MessageCircle, Phone, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useUsuarios } from '@/lib/api/usuarios'
import {
  ESTADOS_DE_CONTACTO,
  ESTADOS_DE_VENEZUELA,
  ORIGENES_SUGERIDOS,
  TRATAMIENTOS,
  enlaceLlamada,
  enlaceMapa,
  enlaceWhatsApp,
  esErrorDeRepetido,
  useContactos as useContactosParaEnlazar,
  useEliminarContacto,
  useEnlazables,
  useEtiquetasDeContacto,
  useGuardarContacto,
  type Contacto,
  type DatosContacto,
  type EstadoContacto,
} from '@/lib/api/contactos'

/*
  LA FICHA DE UN CONTACTO

  Una sola ventana para crear y editar, en bloques: quién es, cómo se le
  habla, dónde está, cómo se clasifica, y a qué del sistema se enlaza.

  EL REPETIDO SE MUESTRA, NO SE ESCONDE. Si la base dice «ya existe Fulano
  con ese teléfono», el error se queda a la vista y aparece la casilla «es
  otra persona, guardar igual». Quien marca la casilla está diciendo que lo
  miró: eso es lo que evita la base sucia sin prohibir el caso real.
*/

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-ink/80 mb-2 text-sm font-semibold">{titulo}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export function FormularioContacto({
  contacto,
  inicial,
  puedeBorrar,
  onCerrar,
}: {
  /** El que se edita, o nulo si es nuevo. */
  contacto: Contacto | null
  inicial: DatosContacto
  puedeBorrar: boolean
  onCerrar: () => void
}) {
  const guardar = useGuardarContacto()
  const eliminar = useEliminarContacto()
  const { data: etiquetas } = useEtiquetasDeContacto()
  const { data: usuarios } = useUsuarios()
  const enlazables = useEnlazables()

  const [d, setD] = useState<DatosContacto>(inicial)
  const [otraPersona, setOtraPersona] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const cambiar = (c: Partial<DatosContacto>) => setD((x) => ({ ...x, ...c }))

  const esEmpresa = d.tipo === 'EMPRESA'
  const listo = esEmpresa ? d.razon_social.trim().length > 0 : d.nombres.trim().length > 0
  const repetido = esErrorDeRepetido(guardar.error)

  const alternar = (cod: string) =>
    cambiar({ etiquetas: d.etiquetas.includes(cod) ? d.etiquetas.filter((x) => x !== cod) : [...d.etiquetas, cod] })

  const mapa = enlaceMapa(d)

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={contacto ? contacto.nombre : 'Nuevo contacto'}
      descripcion={
        contacto
          ? `${contacto.tipo === 'EMPRESA' ? 'Empresa' : 'Persona'} en el directorio desde ${new Date(contacto.creado_en).toLocaleDateString('es-VE')}`
          : 'Una persona o una empresa, con sus canales y dónde encontrarla.'
      }
      ancho="lg"
      acciones={
        <>
          {contacto && puedeBorrar ? (
            <Button variant="ghost" className="text-danger mr-auto" icon={<Trash2 />} onClick={() => setBorrando(true)}>
              Eliminar
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!listo || guardar.isPending}
            onClick={() =>
              guardar.mutate(
                { id: contacto?.id ?? null, datos: d, aunqueParezcaRepetido: otraPersona },
                { onSuccess: onCerrar },
              )
            }
          >
            {guardar.isPending ? 'Guardando…' : contacto ? 'Guardar cambios' : 'Crear el contacto'}
          </Button>
        </>
      }
    >
      {/* ── Quién es ─────────────────────────────────────────────────── */}
      <Bloque titulo="Quién es">
        <Select
          label="Es"
          value={d.tipo}
          onChange={(e) => cambiar({ tipo: e.target.value as DatosContacto['tipo'] })}
          opciones={[
            { valor: 'PERSONA', etiqueta: 'Una persona' },
            { valor: 'EMPRESA', etiqueta: 'Una empresa' },
          ]}
        />
        <Input
          label={esEmpresa ? 'RIF' : 'Cédula o RIF'}
          value={d.documento}
          onChange={(e) => cambiar({ documento: e.target.value.toUpperCase() })}
          placeholder={esEmpresa ? 'J-12345678-9' : 'V-12345678'}
          hint="Opcional. Con la letra y los guiones, como en clientes."
        />
        {esEmpresa ? (
          <Input
            className="sm:col-span-2"
            label="Razón social"
            value={d.razon_social}
            onChange={(e) => cambiar({ razon_social: e.target.value })}
            required
          />
        ) : (
          <>
            <Select
              label="Tratamiento"
              vacio="Ninguno"
              value={d.tratamiento}
              onChange={(e) => cambiar({ tratamiento: e.target.value })}
              opciones={TRATAMIENTOS.map((t) => ({ valor: t, etiqueta: t }))}
            />
            <span className="hidden sm:block" />
            <Input label="Nombres" value={d.nombres} onChange={(e) => cambiar({ nombres: e.target.value })} required />
            <Input label="Apellidos" value={d.apellidos} onChange={(e) => cambiar({ apellidos: e.target.value })} />
            <EmpresaDeLaPersona d={d} cambiar={cambiar} />
            <Input label="Cargo" value={d.cargo} onChange={(e) => cambiar({ cargo: e.target.value })} placeholder="Gerente de compras" />
          </>
        )}
      </Bloque>

      {/* ── Cómo se le habla ─────────────────────────────────────────── */}
      <Bloque titulo="Cómo se le habla">
        <Input
          label="Celular"
          value={d.celular}
          onChange={(e) => cambiar({ celular: e.target.value })}
          placeholder="0414-1234567"
        />
        <Input
          label="WhatsApp"
          value={d.whatsapp}
          onChange={(e) => cambiar({ whatsapp: e.target.value })}
          placeholder="Si es el mismo celular, repítelo"
        />
        {enlaceLlamada(d.celular) || enlaceWhatsApp(d.whatsapp) ? (
          <p className="flex flex-wrap gap-4 text-xs sm:col-span-2">
            {enlaceLlamada(d.celular) ? (
              <a className="text-royal-600 inline-flex items-center gap-1 hover:underline" href={enlaceLlamada(d.celular)!}>
                <Phone className="size-3" /> Llamar al celular
              </a>
            ) : null}
            {enlaceWhatsApp(d.whatsapp) ? (
              <a className="text-royal-600 inline-flex items-center gap-1 hover:underline" href={enlaceWhatsApp(d.whatsapp)!} target="_blank" rel="noreferrer">
                <MessageCircle className="size-3" /> Abrir el chat de WhatsApp
              </a>
            ) : null}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Input className="flex-1" label="Teléfono de oficina" value={d.telefono_oficina} onChange={(e) => cambiar({ telefono_oficina: e.target.value })} />
          <Input className="w-24" label="Ext." value={d.extension} onChange={(e) => cambiar({ extension: e.target.value })} />
        </div>
        <span className="hidden sm:block" />
        <Input label="Correo" type="email" value={d.correo} onChange={(e) => cambiar({ correo: e.target.value })} />
        <Input label="Correo secundario" type="email" value={d.correo_secundario} onChange={(e) => cambiar({ correo_secundario: e.target.value })} />
      </Bloque>

      {/* ── Dónde está ───────────────────────────────────────────────── */}
      <Bloque titulo="Dónde está">
        <Input className="sm:col-span-2" label="Dirección" value={d.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} />
        <Input label="Ciudad" value={d.ciudad} onChange={(e) => cambiar({ ciudad: e.target.value })} />
        <Input
          label="Estado"
          value={d.estado_region}
          onChange={(e) => cambiar({ estado_region: e.target.value })}
          list="estados-de-venezuela"
        />
        <datalist id="estados-de-venezuela">
          {ESTADOS_DE_VENEZUELA.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        <Input label="Código postal" value={d.codigo_postal} onChange={(e) => cambiar({ codigo_postal: e.target.value })} />
        <Input label="País" value={d.pais} onChange={(e) => cambiar({ pais: e.target.value })} />
        {mapa ? (
          <p className="text-xs sm:col-span-2">
            <a className="text-royal-600 inline-flex items-center gap-1 hover:underline" href={mapa} target="_blank" rel="noreferrer">
              <MapPin className="size-3" /> Ver en el mapa
            </a>
          </p>
        ) : null}
      </Bloque>

      {/* ── En la web ────────────────────────────────────────────────── */}
      <Bloque titulo="En la web">
        <Input label="Sitio web" value={d.sitio_web} onChange={(e) => cambiar({ sitio_web: e.target.value })} placeholder="www.ejemplo.com" />
        <Input label="LinkedIn" value={d.linkedin} onChange={(e) => cambiar({ linkedin: e.target.value })} />
        <Input label="Instagram" value={d.instagram} onChange={(e) => cambiar({ instagram: e.target.value })} placeholder="@usuario" />
        <Input label="Facebook" value={d.facebook} onChange={(e) => cambiar({ facebook: e.target.value })} />
      </Bloque>

      {/* ── Cómo se clasifica ────────────────────────────────────────── */}
      <Bloque titulo="Cómo se clasifica">
        <div className="sm:col-span-2">
          <p className="text-ink/70 mb-1 text-xs font-medium">Etiquetas</p>
          <div className="flex flex-wrap gap-2">
            {(etiquetas ?? [])
              .filter((e) => e.activa || d.etiquetas.includes(e.codigo))
              .map((e) => {
                const puesta = d.etiquetas.includes(e.codigo)
                return (
                  <button
                    key={e.codigo}
                    type="button"
                    onClick={() => alternar(e.codigo)}
                    className={
                      puesta
                        ? 'bg-royal-600 rounded-full px-3 py-1 text-xs font-medium text-white'
                        : 'border-hairline text-ink/70 hover:bg-ink/5 rounded-full border px-3 py-1 text-xs'
                    }
                  >
                    {e.nombre}
                  </button>
                )
              })}
          </div>
        </div>
        <Input
          label="De dónde vino"
          value={d.origen}
          onChange={(e) => cambiar({ origen: e.target.value })}
          list="origenes-de-contacto"
          placeholder="Recomendado, feria, visita…"
        />
        <datalist id="origenes-de-contacto">
          {ORIGENES_SUGERIDOS.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <Select
          label="Quién lo atiende"
          vacio="Nadie en particular"
          value={d.asignado_a}
          onChange={(e) => cambiar({ asignado_a: e.target.value })}
          opciones={(usuarios ?? []).filter((u) => u.activo).map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
        />
        <Select
          label="Estado"
          value={d.estado}
          onChange={(e) => cambiar({ estado: e.target.value as EstadoContacto })}
          opciones={(Object.keys(ESTADOS_DE_CONTACTO) as EstadoContacto[]).map((k) => ({ valor: k, etiqueta: ESTADOS_DE_CONTACTO[k].etiqueta }))}
          hint="Bloquear, o desbloquear, pide control total sobre Contactos."
        />
        {d.estado !== 'ACTIVO' ? (
          <Input label="Por qué" value={d.estado_motivo} onChange={(e) => cambiar({ estado_motivo: e.target.value })} />
        ) : null}
      </Bloque>

      {/* ── Lo que ya existe en el sistema ───────────────────────────── */}
      <Bloque titulo="Es el contacto de…">
        <SelectBuscable
          label="Un cliente"
          vacio="Ninguno"
          valor={d.cliente_id}
          onCambio={(v) => cambiar({ cliente_id: v })}
          opciones={(enlazables.data?.clientes ?? []).map((c) => ({ valor: String(c.id), etiqueta: c.nombre, detalle: c.rif }))}
        />
        <SelectBuscable
          label="Un proveedor"
          vacio="Ninguno"
          valor={d.proveedor_id}
          onCambio={(v) => cambiar({ proveedor_id: v })}
          opciones={(enlazables.data?.proveedores ?? []).map((p) => ({ valor: String(p.id), etiqueta: p.nombre, detalle: p.rif }))}
        />
        <SelectBuscable
          label="Un trabajador"
          vacio="Ninguno"
          valor={d.empleado_id}
          onCambio={(v) => cambiar({ empleado_id: v })}
          opciones={(enlazables.data?.empleados ?? []).map((e) => ({
            valor: String(e.id),
            etiqueta: `${e.apellidos}, ${e.nombres}`,
            detalle: e.cedula,
          }))}
        />
        <Textarea className="sm:col-span-2" label="Nota" rows={2} value={d.nota} onChange={(e) => cambiar({ nota: e.target.value })} />
      </Bloque>

      {guardar.error ? (
        <div className="mt-4">
          <ErrorDeCarga error={guardar.error} />
          {repetido ? (
            <label className="text-ink/75 mt-2 flex cursor-pointer items-start gap-2 text-sm select-none">
              <input type="checkbox" className="accent-royal-600 mt-0.5 size-4" checked={otraPersona} onChange={(e) => setOtraPersona(e.target.checked)} />
              <span>
                Es otra persona: guardar igual.
                <span className="text-ink/45 block text-xs">Dos personas pueden compartir el teléfono de una oficina. Si es la misma, mejor edita la que ya está.</span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      {contacto?.sitio_web ? (
        <p className="text-ink/45 mt-4 text-xs">
          <a className="text-royal-600 inline-flex items-center gap-1 hover:underline" href={/^https?:/i.test(contacto.sitio_web) ? contacto.sitio_web : `https://${contacto.sitio_web}`} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3" /> {contacto.sitio_web}
          </a>
        </p>
      ) : null}

      {borrando && contacto ? (
        <Modal
          abierto
          onCerrar={() => setBorrando(false)}
          titulo={`Eliminar a ${contacto.nombre}`}
          descripcion="Un contacto no mueve dinero ni inventario, así que se puede borrar. Queda registrado quién lo hizo. Si solo dejó de ser útil, márcalo inactivo en vez de borrarlo."
          ancho="sm"
          acciones={
            <>
              <Button variant="ghost" onClick={() => setBorrando(false)}>
                Cancelar
              </Button>
              <Button variant="danger" disabled={eliminar.isPending} onClick={() => eliminar.mutate(contacto.id, { onSuccess: onCerrar })}>
                {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
              </Button>
            </>
          }
        >
          {eliminar.error ? <ErrorDeCarga error={eliminar.error} /> : null}
        </Modal>
      ) : null}
    </Modal>
  )
}

/** La empresa de una persona: una del directorio, o escrita a mano si no está. */
function EmpresaDeLaPersona({ d, cambiar }: { d: DatosContacto; cambiar: (c: Partial<DatosContacto>) => void }) {
  const { data: contactos } = useContactosParaEnlazar()
  const empresas = (contactos ?? []).filter((c) => c.tipo === 'EMPRESA')
  return (
    <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
      <SelectBuscable
        label="Empresa (del directorio)"
        vacio="Ninguna del directorio"
        valor={d.empresa_id}
        onCambio={(v) => cambiar({ empresa_id: v, empresa_nombre: v ? '' : d.empresa_nombre })}
        opciones={empresas.map((e) => ({ valor: String(e.id), etiqueta: e.nombre, detalle: e.documento ?? undefined }))}
        hint="Si su empresa está en el directorio, enlázala aquí y no la escribas."
      />
      <Input
        label="Empresa (a mano)"
        value={d.empresa_nombre}
        onChange={(e) => cambiar({ empresa_nombre: e.target.value })}
        disabled={!!d.empresa_id}
        hint={d.empresa_id ? 'Enlazada arriba.' : 'Solo si no está en el directorio.'}
      />
    </div>
  )
}
