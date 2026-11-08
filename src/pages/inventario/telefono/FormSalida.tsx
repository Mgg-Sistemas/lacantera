import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import { ElegirArchivosDeCarga } from '@/components/FotosDeCarga'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { subirFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { palabraDeVenta, usePersonasDeLaEmpresa } from '@/lib/api/salidas'
import { useEntregarATrabajador } from '@/lib/api/asignaciones'
import { useSalidaDesdeElTelefono } from '@/lib/api/almacenTelefono'
import type { Articulo } from '@/lib/api/catalogo'
import type { Almacen as Sitio } from '@/lib/api/inventario'
import { mensajeSalida, num } from '@/lib/ficha/inventarioWhatsapp'
import { ParaQuienSale, paraQuienVa, type AmbitoDeSalida } from '@/pages/salidas/ModalSalida'
import { cn } from '@/lib/cn'
import { errorLineas, lineaDe, useTardaPorLaSeñal, type LineaDeMaterial, type ProductoEnAlmacen } from './comun'
import { Alerta, AvisoDeSeñal, LineasMateriales, TituloDePaso } from './piezas'

/*
  ⬆ SALIDA, EN EL TELÉFONO (MGG `FormSalida`, fase 1b, 08/11/2026).

  La pantalla es la de MGG: varios materiales, «Motivo», «¿Retorna? 🔄 SÍ /
  ❌ NO» y fotos. Lo que hace es lo de aquí (decisiones 0.1 «C» y 0.3 de la
  dueña, 08/11/2026):

  · «❌ NO»: la salida MIXTA. Se pide siempre (`salida_desde_el_telefono`, que
    llama a `pedir_salida`); si quien la registra puede aprobar salidas en este
    almacén y entregarlas, la base la aprueba y la entrega en el mismo paso y
    sale la nota NS. Si no, queda «Por aprobar» y la pantalla final lo dice.
    En vez de «¿Quién autorizó?» de MGG se pregunta lo que la base exige a toda
    salida: quién lo recibe.
  · «🔄 SÍ»: un préstamo (`entregar_a_trabajador`), que pide el trabajador y
    queda en «🔄 Por retornar». Solo para lo que en el catálogo es retornable:
    lo demás la base lo daría por consumido sin que nadie lo dijera.

  Las fotos van a la solicitud (las mismas «fotos de carga» de Salidas, 4
  como máximo). Un préstamo no tiene solicitud donde colgarlas.
*/

const MODO_ENTREGA: Record<string, string> = {
  RETORNABLE: 'retornable',
  CONSUMIBLE: 'consumible',
  NO: 'no entregable',
}

export interface SalidaHecha {
  titulo: string
  icono: string
  texto: string
  aviso?: string
  /** El número de la solicitud, para su orden en PDF. */
  numero?: string
}

export function FormSalida({
  almacen,
  productos,
  inicial,
  articulos,
  puedePedir,
  puedePrestar,
  aprueba,
  quien,
  empresa,
  onCancel,
  onHecho,
}: {
  almacen: Sitio
  productos: ProductoEnAlmacen[]
  inicial: ProductoEnAlmacen
  articulos: Articulo[] | undefined
  /** Salidas en lectura: puede pedir la salida. */
  puedePedir: boolean
  /** La reja de `entregar_a_trabajador`: puede prestar. */
  puedePrestar: boolean
  /** Puede aprobar salidas de este almacén y entregarlas: sale en el acto. */
  aprueba: boolean
  quien: string
  empresa: string
  onCancel: () => void
  onHecho: (h: SalidaHecha) => void
}) {
  const salida = useSalidaDesdeElTelefono()
  const prestar = useEntregarATrabajador()
  const qc = useQueryClient()
  const { data: personas } = usePersonasDeLaEmpresa()

  const [lineas, setLineas] = useState<LineaDeMaterial[]>([lineaDe(inicial)])
  const [motivo, setMotivo] = useState('')
  const [retorna, setRetorna] = useState<boolean | null>(puedePedir ? null : puedePrestar ? true : null)
  const [ambito, setAmbito] = useState<AmbitoDeSalida>('')
  const [empleado, setEmpleado] = useState('')
  const [externo, setExterno] = useState('')
  const [responsable, setResponsable] = useState('')
  const [trabajador, setTrabajador] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [guardando, setGuardando] = useState(false)
  const tarda = useTardaPorLaSeñal(guardando)

  const modoDe = (id: number) => (articulos ?? []).find((a) => a.id === id)?.modo_entrega ?? ''
  const venta = palabraDeVenta(motivo)
  const nombreDe = (id: string) => (personas ?? []).find((p) => String(p.id) === id)?.nombre ?? ''

  /** Lo que falta, en el orden de MGG y con las reglas de la base. Null si se puede guardar. */
  const problema = (): string | null => {
    const e = errorLineas(lineas)
    if (e) return e
    const m = motivo.trim()
    if (retorna === null) return '¿Retorna? Marca SÍ o NO.'
    if (retorna) {
      if (m.length < 3) return 'Escribe el motivo de la salida.'
      const noVuelve = lineas.find((l) => modoDe(l.producto.id) !== 'RETORNABLE')
      if (noVuelve) {
        const modo = MODO_ENTREGA[modoDe(noVuelve.producto.id)] ?? 'no retornable'
        return `«${noVuelve.producto.nombre}» no vuelve al almacén (en el catálogo es ${modo}): sale con «❌ NO».`
      }
      if (!trabajador) return 'Elige a quién se le presta.'
      return null
    }
    // `pedir_salida` pide diez letras: es lo que lee quien la aprueba.
    if (m.length < 10) return 'Escribe para qué sale (al menos 10 letras): es lo que lee quien la aprueba.'
    if (venta) return `Dice «${venta}»: una venta no sale por aquí, se registra en Facturación › Notas de entrega.`
    if (!ambito) return 'Di quién lo recibe.'
    if (ambito === 'EMPRESA' && !empleado) return 'Elige la persona que lo recibe.'
    if (ambito === 'FUERA' && (externo.trim().length < 3 || responsable.trim().length < 3)) {
      return 'Escribe el destino y quién responde por lo que sale.'
    }
    return null
  }
  const falta = problema()

  const materialesDelMensaje = () =>
    lineas.map((l) => ({ nombre: l.producto.nombre, unidad: l.producto.unidad, cantidad: Number(l.cantidad) }))

  const guardar = async () => {
    if (falta) return toast(falta, 'error')
    setGuardando(true)
    try {
      const renglones = lineas.map((l) => ({
        articulo_id: l.producto.id,
        cantidad: Number(l.cantidad),
        propietario: l.propietario || null,
      }))
      const uno = lineas.length === 1 ? lineas[0] : null

      if (retorna) {
        const nombre = nombreDe(trabajador)
        await prestar.mutateAsync({
          empleado_id: Number(trabajador),
          almacen_id: almacen.id,
          renglones,
          clase: 'ASIGNACION',
          nota: motivo.trim(),
        })
        // La cola de «🔄 Por retornar» de este almacén cambia con el préstamo.
        void qc.invalidateQueries({ queryKey: ['telefono-por-retornar'] })
        void qc.invalidateQueries({ queryKey: ['telefono-historico-salidas'] })
        toast(
          uno
            ? `Préstamo: −${num(Number(uno.cantidad))} ${uno.producto.unidad} de ${uno.producto.nombre} a ${nombre}`
            : `Préstamo a ${nombre}: ${lineas.length} materiales`,
          'success',
        )
        onHecho({
          icono: '✅',
          titulo: `Salida prestada a ${nombre}${uno ? '' : ` · ${lineas.length} materiales`}`,
          aviso: 'Queda en «🔄 Por retornar»: desde ahí se le da retorno al inventario, todo o una parte.',
          texto: mensajeSalida({
            almacen: almacen.nombre,
            empresa,
            materiales: materialesDelMensaje(),
            motivo,
            retorna: true,
            prestadoA: nombre,
            quien,
          }),
        })
        return
      }

      const r = await salida.mutateAsync({
        almacen_id: almacen.id,
        renglones,
        motivo: motivo.trim(),
        ...paraQuienVa('pedir', ambito, empleado, externo, responsable),
      })

      let fotos = 0
      if (archivos.length > 0) {
        try {
          await subirFotosDeCarga('SALIDA', [r.numero], archivos)
          fotos = archivos.length
        } catch (err) {
          toast(
            `La salida quedó registrada, pero las fotos no subieron: ${mensajeDe(err, 'error')}. Puedes volver a agregarlas desde Salidas.`,
            'warning',
          )
        }
      }

      const entregada = r.estado === 'ENTREGADA'
      const recibe = ambito === 'EMPRESA' ? nombreDe(empleado) : `${externo.trim()} (responde ${responsable.trim()})`
      const muchos = uno ? '' : ` · ${lineas.length} materiales`
      toast(
        entregada
          ? uno
            ? `Salida ${r.nota_salida}: −${num(Number(uno.cantidad))} ${uno.producto.unidad} de ${uno.producto.nombre}`
            : `Salida ${r.nota_salida}: ${lineas.length} materiales`
          : `Salida ${r.numero} enviada: falta que la aprueben`,
        'success',
      )
      onHecho({
        icono: entregada ? '✅' : '⏳',
        titulo: entregada ? `Salida ${r.nota_salida} registrada${muchos}` : `Salida ${r.numero} por aprobar${muchos}`,
        aviso: entregada
          ? undefined
          : `Queda «Por aprobar»: la aprueba quien responde por ${almacen.nombre} o un autorizado para aprobar salidas. No descuenta nada hasta que se entregue.`,
        numero: r.numero,
        texto: mensajeSalida({
          almacen: almacen.nombre,
          empresa,
          numero: r.numero,
          nota: r.nota_salida,
          materiales: materialesDelMensaje(),
          motivo,
          recibe,
          autorizo: entregada ? quien : null,
          porAprobar: !entregada,
          retorna: false,
          fotos,
          quien,
        }),
      })
    } catch (err) {
      toast(mensajeDe(err, 'No se pudo guardar'), 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form
      className="bg-surface shadow-card mt-4 space-y-4 rounded-[10px] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <TituloDePaso icono="⬆">Salida · {almacen.nombre}</TituloDePaso>

      <LineasMateriales lineas={lineas} productos={productos} onCambiar={setLineas} />

      <Textarea
        label="Motivo"
        rows={2}
        placeholder="Para qué sale, a quién, a qué equipo…"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        error={
          venta && retorna !== true
            ? `Dice «${venta}»: una venta no sale por aquí, se registra en Facturación › Notas de entrega.`
            : undefined
        }
      />

      <fieldset>
        <legend className="text-ink/75 mb-1.5 text-sm font-medium">¿Retorna?</legend>
        <div className="grid grid-cols-2 gap-2">
          <BotonSiNo
            marcado={retorna === true}
            disabled={!puedePrestar}
            titulo="🔄 SÍ"
            sub="Vuelve al almacén"
            onClick={() => setRetorna(true)}
          />
          <BotonSiNo
            marcado={retorna === false}
            disabled={!puedePedir}
            titulo="❌ NO"
            sub="Se consume / se queda"
            onClick={() => setRetorna(false)}
          />
        </div>
        {retorna === true ? (
          <p className="text-ink/55 mt-1.5 text-xs">
            Queda en «Por retornar» y desde ahí se le da retorno al inventario (todo o una parte).
          </p>
        ) : null}
        {!puedePrestar ? (
          <p className="text-ink/55 mt-1.5 text-xs">Prestar a un trabajador lo hace almacén, recursos humanos o administración.</p>
        ) : null}
      </fieldset>

      {retorna === true ? (
        <SelectBuscable
          label="¿A quién se le presta?"
          vacio="Busque al trabajador"
          hint="Solo personal activo. Si no sale, no está activo en Nómina."
          valor={trabajador}
          onCambio={setTrabajador}
          opciones={(personas ?? [])
            .filter((p) => p.activo)
            .map((p) => ({ valor: String(p.id), nombre: p.nombre, detalle: p.cargo ?? undefined }))}
        />
      ) : null}

      {retorna === false ? (
        <>
          <ParaQuienSale
            modo="pedir"
            pregunta="¿Quién lo recibe?"
            ambito={ambito}
            onAmbito={setAmbito}
            empleados={personas}
            empleado={empleado}
            onEmpleado={setEmpleado}
            externo={externo}
            onExterno={setExterno}
            responsable={responsable}
            onResponsable={setResponsable}
          />

          <div>
            <p className="text-ink/75 mb-1.5 text-sm font-medium">📷 Fotos ({archivos.length}/4)</p>
            <ElegirArchivosDeCarga
              archivos={archivos}
              onCambiar={setArchivos}
              descripcion="del material o de quien se lo lleva."
            />
          </div>

          {aprueba ? (
            <p className="text-ink/60 text-sm">
              ✅ Puedes aprobar salidas de {almacen.nombre}: sale en este momento, con su nota.
            </p>
          ) : (
            <Alerta>
              ⏳ Queda «Por aprobar»: la aprueba quien responde por {almacen.nombre} o un autorizado. No descuenta nada
              hasta que se entregue.
            </Alerta>
          )}
        </>
      ) : null}

      {tarda ? <AvisoDeSeñal que="La salida" /> : null}

      <Button type="submit" block size="lg" disabled={guardando || falta !== null}>
        {guardando
          ? 'Guardando…'
          : lineas.length > 1
            ? `✓ Guardar salida (${lineas.length} materiales)`
            : '✓ Guardar salida'}
      </Button>
      {falta && !guardando ? <p className="text-ink/55 -mt-2 text-center text-xs">{falta}</p> : null}
      <Button block variant="ghost" size="lg" disabled={guardando} onClick={onCancel}>
        ← Otro material
      </Button>
      {retorna === false ? (
        <p className="text-center text-sm">
          <Link
            to="/app/inventario/almacen/salida/pedir"
            className="text-ink/55 underline decoration-dotted underline-offset-4"
          >
            Con vehículo, firma o de varios almacenes
          </Link>
        </p>
      ) : null}
    </form>
  )
}

function BotonSiNo({
  marcado,
  disabled,
  titulo,
  sub,
  onClick,
}: {
  marcado: boolean
  disabled?: boolean
  titulo: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={marcado}
      className={cn(
        'rounded-card flex min-h-[72px] flex-col items-center justify-center gap-0.5 border p-3 text-center disabled:opacity-45',
        marcado ? 'border-royal-600 bg-royal-600/10' : 'border-hairline bg-surface',
      )}
    >
      <span className="text-base font-semibold">{titulo}</span>
      <small className="text-ink/55 text-xs">{sub}</small>
    </button>
  )
}
