import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { AvisoDeCosto } from '@/components/AvisoDeCosto'
import { DeQuienSale } from '@/components/DeQuienSale'
import type { Articulo } from '@/lib/api/catalogo'
import { useMisRoles } from '@/lib/api/catalogo'
import {
  useAlmacenes,
  useExistenciasDeArticulo,
  useRegistrarAjuste,
  useRegistrarEntradas,
  useTransferir,
} from '@/lib/api/inventario'
import { useSalidaDesdeElTelefono } from '@/lib/api/almacenTelefono'
import type { SalidaDelTelefono } from '@/lib/api/almacenTelefono'
import { palabraDeVenta, useComoAprueboSalidas, usePersonasDeLaEmpresa } from '@/lib/api/salidas'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useMonedasUsables } from '@/lib/api/tasas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { LA_CASA, faltaDecirDeQuien } from '@/lib/deQuien'
import { dolares } from '@/lib/formato'
import { cn } from '@/lib/cn'
import { ParaQuienSale, paraQuienVa } from '@/pages/salidas/ModalSalida'
import type { AmbitoDeSalida } from '@/pages/salidas/ModalSalida'
import { MOTIVOS_SUGERIDOS, almacenUsable, cantidad, filaUsable, numeroTecleado, problemaDeMotivo } from './comun'

/*
  ↕ «MOVIMIENTO · {SKU}» (fase 3 de «Almacén e Inventario como MGG»,
  08/11/2026). Copia de `MovimientoForm.tsx` de MGG con los componentes de La
  Cantera. Cada tipo va por la puerta de siempre de la base:

  - «Entrada (suma stock)» → `registrar_entradas`, con su costo, su moneda, el
    aviso de costo raro y el «no se sabe cuánto costó» (sin valorar).
  - «Salida (resta stock)» → `salida_desde_el_telefono`, la salida MIXTA que
    decidió la dueña el 08/11/2026: se pide siempre y, si quien la registra
    puede aprobar salidas de ese almacén y entregarlas, sale en el acto con su
    nota; si no, queda «Por aprobar» y la pantalla lo dice. Exige para quién
    sale, como toda salida de aquí.
  - «Transferencia a otro almacén» → `transferir_existencia` (directa).
  - «Ajuste manual (cualquier signo)» → `registrar_ajuste`, que guarda lo
    contado: el «después» de la vista previa.

  El motivo es obligatorio en los cuatro, con los chips de MGG, y la «VISTA
  PREVIA · {almacén}» dice «{antes} → {después}» antes de guardar. No hay
  consumo en proceso ni fundición: aquí no existen.
*/

type Tipo = 'entrada' | 'salida' | 'transferencia' | 'ajuste'

const TIPOS: { valor: Tipo; etiqueta: string }[] = [
  { valor: 'entrada', etiqueta: 'Entrada (suma stock)' },
  { valor: 'salida', etiqueta: 'Salida (resta stock)' },
  { valor: 'transferencia', etiqueta: 'Transferencia a otro almacén' },
  { valor: 'ajuste', etiqueta: 'Ajuste manual (cualquier signo)' },
]

/** Cómo se dice cada tipo en los mensajes del motivo («una entrada cargada a mano…»). */
const EN_EL_MOTIVO: Record<Tipo, string> = {
  entrada: 'una entrada',
  salida: 'una salida',
  transferencia: 'una transferencia',
  ajuste: 'una corrección de stock',
}

export function Movimiento({
  articulo,
  almacenInicial,
  tipoInicial = 'entrada',
  onCerrar,
}: {
  articulo: Articulo
  /** El almacén elegido en la pantalla principal, si había uno. */
  almacenInicial?: number | null
  tipoInicial?: Tipo
  onCerrar: () => void
}) {
  const existenciasQ = useExistenciasDeArticulo(articulo.id)
  const { data: almacenesTodos } = useAlmacenes()
  const { puede: tieneRol } = useMisRoles()
  const { puede } = useMisPermisos()
  const comoApruebo = useComoAprueboSalidas()
  const { data: personas } = usePersonasDeLaEmpresa()
  const monedas = useMonedasUsables()

  const entrada = useRegistrarEntradas()
  const salida = useSalidaDesdeElTelefono()
  const transferir = useTransferir()
  const ajuste = useRegistrarAjuste()

  const almacenes = useMemo(() => (almacenesTodos ?? []).filter(almacenUsable), [almacenesTodos])
  const filas = useMemo(() => (existenciasQ.data ?? []).filter(filaUsable), [existenciasQ.data])

  /*
    EL ALMACÉN DE PARTIDA, como MGG: el elegido en la pantalla; si no, el de
    más stock del producto; si no, el general; si no, el primero.
  */
  const inicial = useMemo(() => {
    if (almacenInicial && almacenes.some((a) => a.id === almacenInicial)) return String(almacenInicial)
    const mas = [...filas].sort((a, b) => Number(b.existencia) - Number(a.existencia))[0]
    if (mas && Number(mas.existencia) > 0 && almacenes.some((a) => a.id === mas.almacen_id)) return String(mas.almacen_id)
    const general = almacenes.find((a) => a.codigo === 'ALM-GEN')
    return general ? String(general.id) : almacenes[0] ? String(almacenes[0].id) : ''
  }, [almacenInicial, almacenes, filas])

  const [tipo, setTipo] = useState<Tipo>(tipoInicial)
  const [almacenElegido, setAlmacenElegido] = useState('')
  const [destino, setDestino] = useState('')
  const [cantidadTxt, setCantidadTxt] = useState('')
  const [costoTxt, setCostoTxt] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [sinValor, setSinValor] = useState(false)
  const [costoConfirmado, setCostoConfirmado] = useState(false)
  const [signo, setSigno] = useState<'+' | '-'>('+')
  const [motivo, setMotivo] = useState('')
  const [dueno, setDueno] = useState('')
  const [ambito, setAmbito] = useState<AmbitoDeSalida>('')
  const [empleado, setEmpleado] = useState('')
  const [externo, setExterno] = useState('')
  const [responsable, setResponsable] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [hecha, setHecha] = useState<SalidaDelTelefono | null>(null)

  const almacenId = almacenElegido || inicial
  const sitio = almacenes.find((a) => String(a.id) === almacenId)
  const fila = filas.find((f) => String(f.almacen_id) === almacenId)
  const destinoSitio = almacenes.find((a) => String(a.id) === destino)
  const u = articulo.unidad

  // ------------------------------------------------------------ permisos
  const almacenista = tieneRol('ALMACEN')
  const puedePedir = puede('SALIDAS', 'LECTURA')
  const aprueba =
    !!sitio &&
    puede('SALIDAS', 'ESCRITURA') &&
    (comoApruebo.data?.respaldo === true || (comoApruebo.data?.sitios ?? []).includes(sitio.id))
  const tipoPermitido = tipo === 'salida' ? puedePedir : almacenista

  // ------------------------------------------------------------ cuentas
  const duenosAqui = fila?.duenos ?? []
  const mixto = duenosAqui.length > 1 && tipo !== 'entrada'
  const existencia = Number(fila?.existencia ?? 0)
  /*
    DE QUIÉN, cuando aquí hay de varios: lo propio o lo ajeno de la fila. Es
    exacto mientras haya un solo dueño de fuera en el sitio (hoy, la
    gobernación), igual que la pantalla principal.
  */
  const antes = mixto && dueno
    ? dueno === LA_CASA
      ? Number(fila?.existencia_propia ?? 0)
      : Number(fila?.existencia_ajena ?? 0)
    : existencia
  // Lo prestado no se puede sacar ni trasladar: está en manos de alguien.
  const disponible = mixto ? antes : Math.min(antes, Number(fila?.disponibles ?? existencia))
  const cant = numeroTecleado(cantidadTxt)
  const cantOk = Number.isFinite(cant) && cant > 0
  const delta = !cantOk ? 0 : tipo === 'entrada' || (tipo === 'ajuste' && signo === '+') ? cant : -cant
  const despues = antes + delta
  const costo = numeroTecleado(costoTxt)

  // El costo promedio que quedaría, solo si se ve el valor y la entrada es en dólares.
  const costoAntes = fila?.costo_promedio_usd == null ? null : Number(fila.costo_promedio_usd)
  const valorado = Math.max(0, existencia - Math.min(existencia, Number(fila?.existencia_sin_valorar ?? 0)))
  const pmpNuevo =
    tipo === 'entrada' && cantOk && !sinValor && moneda === 'USD' && costo > 0 && (costoAntes !== null || existencia === 0)
      ? (valorado * (costoAntes ?? 0) + cant * costo) / (valorado + cant)
      : null

  const venta = tipo === 'salida' ? palabraDeVenta(motivo) : null

  /** Lo que falta, con los mensajes de MGG. Null si se puede guardar. */
  const problema = (): string | null => {
    if (!tipoPermitido) {
      return tipo === 'salida'
        ? 'Su usuario no puede pedir salidas.'
        : 'Este movimiento lo registra el rol de Almacén.'
    }
    if (!sitio) return 'Elegí el almacén.'
    if (!cantOk) return 'La cantidad debe ser mayor que 0.'
    if (tipo === 'transferencia') {
      if (!destinoSitio) return 'Indica el almacén destino para la transferencia.'
      if (destinoSitio.id === sitio.id) return 'El almacén destino debe ser distinto del de origen.'
    }
    if (mixto && faltaDecirDeQuien(duenosAqui, dueno)) return 'Elegí de qué dueño es lo que se mueve.'
    if ((tipo === 'salida' || tipo === 'transferencia') && cant > disponible) {
      return `No hay stock suficiente en ${sitio.nombre}. Disponible: ${cantidad(disponible)} ${u}.`
    }
    if (tipo === 'ajuste' && despues < 0) {
      return `No hay stock suficiente en ${sitio.nombre}. Disponible: ${cantidad(antes)} ${u}.`
    }
    if (tipo === 'entrada' && !sinValor && !(costo > 0)) {
      return 'Una entrada necesita el costo unitario. Sin costo el producto entra valorado en $0 y descuadra el valor del almacén. Si no se sabe cuánto costó, marcá «No se sabe cuánto costó».'
    }
    if (tipo === 'salida') {
      // `pedir_salida` pide diez letras: es lo que lee quien la aprueba.
      if (motivo.trim().length < 10) return 'Escribí para qué sale (al menos 10 letras): es lo que lee quien la aprueba.'
      if (venta) return `Dice «${venta}»: una venta no sale por aquí, se registra en Facturación › Notas de entrega.`
      if (!ambito) return 'Decí quién lo recibe.'
      if (ambito === 'EMPRESA' && !empleado) return 'Elegí la persona que lo recibe.'
      if (ambito === 'FUERA' && (externo.trim().length < 3 || responsable.trim().length < 3)) {
        return 'Escribí el destino y quién responde por lo que sale.'
      }
      return null
    }
    return problemaDeMotivo(motivo, EN_EL_MOTIVO[tipo])
  }
  const falta = problema()

  const guardar = async () => {
    if (falta || !sitio) return
    setGuardando(true)
    setError(null)
    try {
      const propietario = mixto ? dueno : null
      if (tipo === 'entrada') {
        await entrada.mutateAsync({
          almacen_id: sitio.id,
          renglones: [
            {
              almacen_id: sitio.id,
              articulo_id: articulo.id,
              cantidad: cant,
              costo: sinValor ? 0 : costo,
              moneda,
              confirmado: costoConfirmado,
              sin_valor: sinValor,
            },
          ],
          motivo: motivo.trim(),
        })
        toast('Movimiento de inventario registrado (entrada)', 'success')
        onCerrar()
      } else if (tipo === 'salida') {
        const r = await salida.mutateAsync({
          almacen_id: sitio.id,
          renglones: [{ articulo_id: articulo.id, cantidad: cant, propietario }],
          motivo: motivo.trim(),
          ...paraQuienVa('pedir', ambito, empleado, externo, responsable),
        })
        toast(
          r.estado === 'ENTREGADA'
            ? `Salida ${r.nota_salida ?? r.numero}: −${cantidad(cant)} ${u} de ${articulo.nombre}`
            : `Salida ${r.numero} enviada: queda «Por aprobar»`,
          'success',
        )
        setHecha(r)
      } else if (tipo === 'transferencia' && destinoSitio) {
        await transferir.mutateAsync({
          origen_id: sitio.id,
          destino_id: destinoSitio.id,
          articulo_id: articulo.id,
          cantidad: cant,
          motivo: motivo.trim(),
          propietario,
        })
        toast(`Transferencia: ${sitio.nombre} → ${destinoSitio.nombre}`, 'success')
        onCerrar()
      } else if (tipo === 'ajuste') {
        // `registrar_ajuste` guarda lo CONTADO: el «después» de la vista previa.
        await ajuste.mutateAsync({
          almacen_id: sitio.id,
          articulo_id: articulo.id,
          contado: despues,
          motivo: motivo.trim(),
          propietario,
        })
        toast('Movimiento de inventario registrado (ajuste)', 'success')
        onCerrar()
      }
    } catch (e) {
      setError(e)
      toast(mensajeDe(e, 'No se pudo registrar el movimiento'), 'error')
    } finally {
      setGuardando(false)
    }
  }

  // --------------------------------------------------- salida registrada
  if (hecha) {
    const entregada = hecha.estado === 'ENTREGADA'
    return (
      <Modal
        abierto
        ancho="md"
        onCerrar={onCerrar}
        titulo={`Movimiento · ${articulo.codigo}`}
        acciones={
          <>
            <Link to="/app/salidas/solicitudes">
              <Button variant="ghost">Ver en Salidas</Button>
            </Link>
            <Button onClick={onCerrar}>Cerrar</Button>
          </>
        }
      >
        <div className="text-center">
          <p className="text-4xl" aria-hidden="true">
            {entregada ? '✅' : '⏳'}
          </p>
          <p className="text-ink/90 mt-2 text-lg font-semibold">
            {entregada ? `Salida ${hecha.nota_salida ?? hecha.numero} registrada` : `Salida ${hecha.numero} por aprobar`}
          </p>
          <p className="text-ink/60 mt-2 text-sm">
            {entregada
              ? `Salieron ${cantidad(cant)} ${u} de ${articulo.nombre} de ${sitio?.nombre ?? ''}, con su nota.`
              : `Queda «Por aprobar»: la aprueba quien responde por ${sitio?.nombre ?? 'el almacén'} o un autorizado para aprobar salidas. No descuenta nada hasta que se entregue.`}
          </p>
        </div>
      </Modal>
    )
  }

  const textoBoton = guardando
    ? 'Registrando…'
    : tipo === 'transferencia'
      ? 'Transferir'
      : tipo === 'salida'
        ? aprueba
          ? 'Registrar salida'
          : 'Pedir salida'
        : 'Registrar movimiento'

  const destinos = almacenes.filter((a) => String(a.id) !== almacenId)

  return (
    <Modal
      abierto
      ancho="md"
      onCerrar={onCerrar}
      titulo={`Movimiento · ${articulo.codigo}`}
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={guardando || falta !== null} onClick={() => void guardar()}>
            {textoBoton}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* --------------------------------------------- PRODUCTO */}
        <Card className="bg-ink/[0.02]">
          <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">Producto</p>
          <p className="text-ink/90 mt-1 font-medium">{articulo.nombre}</p>
          {sitio ? (
            <p className="text-ink/65 mt-1 text-sm">
              Stock en <strong>{sitio.nombre}</strong>:{' '}
              <strong>
                {cantidad(existencia)} {u}
              </strong>
              {costoAntes !== null ? ` · costo ${dolares(costoAntes)}` : ''}
            </p>
          ) : null}
          {filas.filter((f) => Number(f.existencia) > 0).length > 1 ? (
            <p className="text-ink/50 mt-1 text-xs">
              Total del producto:{' '}
              <strong>
                {cantidad(filas.reduce((s, f) => s + Number(f.existencia), 0))} {u}
              </strong>{' '}
              ·{' '}
              {filas
                .filter((f) => Number(f.existencia) > 0)
                .map((f) => `${f.almacen} ${cantidad(Number(f.existencia))}`)
                .join(' · ')}
            </p>
          ) : null}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Almacén"
            vacio="— elegí el almacén —"
            value={almacenId}
            onChange={(e) => {
              setAlmacenElegido(e.target.value)
              setDueno('')
            }}
            opciones={almacenes.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
          />
          <Select
            label="Tipo de movimiento"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as Tipo)
              setError(null)
            }}
            opciones={TIPOS.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta }))}
          />
        </div>

        {!tipoPermitido ? (
          <p className="text-warning text-sm">
            {tipo === 'salida'
              ? 'Su usuario no puede pedir salidas: lo da el permiso de Salidas.'
              : 'Este movimiento lo registra el rol de Almacén.'}
          </p>
        ) : null}

        {/* ------------------------------------------------ cantidad */}
        <div className="grid gap-3 sm:grid-cols-2">
          {tipo === 'ajuste' ? (
            <Select
              label="Signo del ajuste"
              value={signo}
              onChange={(e) => setSigno(e.target.value as '+' | '-')}
              opciones={[
                { valor: '+', etiqueta: '+ aumenta stock' },
                { valor: '-', etiqueta: '− disminuye stock' },
              ]}
            />
          ) : null}
          <Input
            label={`Cantidad (${u})`}
            inputMode="decimal"
            value={cantidadTxt}
            onChange={(e) => setCantidadTxt(e.target.value)}
            placeholder="0"
          />
          {tipo === 'entrada' && !sinValor ? (
            <>
              <Input
                label="Costo unitario del proveedor"
                inputMode="decimal"
                value={costoTxt}
                onChange={(e) => {
                  setCostoTxt(e.target.value)
                  setCostoConfirmado(false)
                }}
                placeholder="0,00"
                hint="Precio pagado en esta compra. Se promedia con el costo del almacén."
              />
              <Select
                label="Moneda"
                value={moneda}
                onChange={(e) => {
                  setMoneda(e.target.value)
                  setCostoConfirmado(false)
                }}
                opciones={(monedas.data ?? [{ valor: 'USD', etiqueta: 'USD' }]).map((m) => ({
                  valor: m.valor,
                  etiqueta: m.etiqueta,
                }))}
              />
            </>
          ) : null}
        </div>

        {tipo === 'entrada' ? (
          <label className="text-ink/75 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-royal-600 mt-0.5 size-4 shrink-0"
              checked={sinValor}
              onChange={(e) => setSinValor(e.target.checked)}
            />
            <span>
              No se sabe cuánto costó
              <span className="text-ink/50 block text-xs">
                Una donación, o material sin factura: entra «sin valorar», que no es lo mismo que costo cero.
              </span>
            </span>
          </label>
        ) : null}

        {tipo === 'entrada' && !sinValor && sitio ? (
          <AvisoDeCosto
            almacenId={sitio.id}
            articuloId={articulo.id}
            costo={costo > 0 ? costo : 0}
            moneda={moneda}
            cantidad={cantOk ? cant : 0}
            unidad={u}
            nombre={articulo.nombre}
            confirmado={costoConfirmado}
            onConfirmar={setCostoConfirmado}
          />
        ) : null}

        {tipo === 'transferencia' ? (
          <div>
            <Select
              label="Almacén destino"
              vacio="— elegí el almacén —"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              opciones={destinos.map((a) => ({ valor: String(a.id), etiqueta: a.nombre }))}
            />
            <p className="text-ink/50 mt-1.5 text-xs">
              Se descuenta de {sitio?.nombre ?? 'el origen'} y se suma al destino llevando su costo promedio.
            </p>
          </div>
        ) : null}

        {mixto ? <DeQuienSale duenos={duenosAqui} valor={dueno} onCambio={setDueno} /> : null}

        {tipo === 'salida' ? (
          <>
            <ParaQuienSale
              modo="pedir"
              pregunta="¿Para quién sale?"
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
            {aprueba ? (
              <p className="text-ink/60 text-sm">
                ✅ Podés aprobar salidas de {sitio?.nombre}: sale en este momento, con su nota.
              </p>
            ) : (
              <p className="border-warning/40 bg-warning-soft text-ink/80 rounded-control border px-3 py-2 text-sm">
                ⏳ Queda «Por aprobar»: la aprueba quien responde por {sitio?.nombre ?? 'el almacén'} o un autorizado
                para aprobar salidas. No descuenta nada hasta que se entregue.
              </p>
            )}
          </>
        ) : null}

        {/* -------------------------------------------------- motivo */}
        <div>
          <Textarea
            label="Motivo del movimiento *"
            rows={2}
            placeholder={`${MOTIVOS_SUGERIDOS[tipo][0]}…`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            error={venta ? `Dice «${venta}»: una venta no sale por aquí, se registra en Facturación › Notas de entrega.` : undefined}
            hint="Obligatorio: este movimiento cambia el stock sin un documento detrás. Queda en el kardex con tu nombre."
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MOTIVOS_SUGERIDOS[tipo].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  motivo === m
                    ? 'border-royal-600 bg-royal-600/10 text-royal-700 dark:text-royal-300'
                    : 'border-ink/15 text-ink/65 hover:border-ink/30',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* --------------------------------------------- vista previa */}
        {sitio && cantOk ? (
          <div className="border-royal-600 bg-royal-600/5 rounded-r-control border-l-4 px-4 py-3">
            <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">
              Vista previa · {tipo === 'transferencia' && destinoSitio ? `${sitio.nombre} → ${destinoSitio.nombre}` : sitio.nombre}
            </p>
            <p className="text-ink/80 mt-1 text-sm">
              {cantidad(antes)} → <strong>{cantidad(despues)}</strong> ({delta > 0 ? '+' : '−'}
              {cantidad(Math.abs(delta))}) {u}
              {tipo === 'salida' && !aprueba ? ' cuando se apruebe y se entregue' : ''}
            </p>
            {pmpNuevo !== null ? (
              <p className="text-ink/60 mt-1 text-xs">
                Costo base (promedio): {costoAntes !== null ? dolares(costoAntes) : '—'} → <strong>{dolares(pmpNuevo)}</strong> ·{' '}
                {cantidad(valorado)}×{dolares(costoAntes ?? 0)} + {cantidad(cant)}×{dolares(costo)}
              </p>
            ) : null}
          </div>
        ) : null}

        {falta && !guardando ? <p className="text-ink/55 text-xs">{falta}</p> : null}
        {error ? <ErrorDeCarga error={error} /> : null}
      </div>
    </Modal>
  )
}
