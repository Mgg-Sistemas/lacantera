import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectBuscable, type OpcionBuscable } from '@/components/ui/SelectBuscable'
import { ElegirArchivosDeCarga } from '@/components/FotosDeCarga'
import { useSubirFotosDeCarga } from '@/lib/api/fotosDeCarga'
import { useMaquinaria } from '@/lib/api/maquinaria'
import {
  useCatalogosCombustible,
  useDespachosCombustible,
  useLecturaVigente,
  useMotivosDespacho,
  usePersonasParaVale,
  useRegistrarEntradaCombustible,
  useRegistrarUso,
  useTrasladarCombustible,
  useUltimoContador,
} from '@/lib/api/combustible'
import { referenciaDelMovimiento } from '@/lib/api/combustibleTelefono'
import { hoyEnCaracas } from '@/lib/api/tasas'
import { mensajeDe, toast } from '@/lib/avisosFlotantes'
import { contadorFinalPropuesto, errorHorometro, horasTrabajadas } from '@/lib/combustible/medidores'
import { leerOpcionEquipo, opcionesEquipos } from '@/lib/combustible/opcionesEquipos'
import { errorSaldoInsuficiente, etiquetaTanqueDestino } from '@/lib/combustible/saldo'
import { n, type TanqueGt, type TipoCatalogoCombustible } from '@/lib/combustible/tipos'
import { cn } from '@/lib/cn'
import { useTardaPorLaSeñal } from '@/pages/inventario/telefono/comun'
import { ICONO, TITULO, horaEnCaracas, leerNumero, litros as fmt, type TipoSurtidor } from './comun'
import { Aviso, CampoGrande, Rotulo, TarjetaCuaderno } from './piezas'

/*
  FORMULARIO: SURTIDO, TRASLADO O ENTRADA (Golden Touch, `FormularioSurtido`
  de SurtidorMovilView.tsx).

  El orden, los textos y los emojis son los de allá: litros grandes, costo en
  la entrada, «¿A qué tanque pasa?», 🚜 el equipo, HI 🔒 / HF / horas, 👤
  Autorizado por, 🔢 el contador al terminar, 📖 Cuaderno, 📷 fotos, «▸ Más
  datos», el aviso de mala señal y «✔ Registrar…».

  LO QUE ES DE LA CANTERA (las cuatro reglas que la dueña mantiene):
  · «👤 ¿Quién recibió?», obligatorio y precargado con el operador de la
    máquina (`maquinaria.operador_id`, vía `combustible_lectura_vigente`).
  · «Para qué», en botones (`motivos_despacho`); el que lo exige pide detalle.
  · El horómetro final es obligatorio y no retrocede; un vehículo puede ir
    solo con el kilometraje.
  · Tres vales al día por máquina como máximo.
  La base las impone igual (`combustible_registrar_uso` →
  `despachar_combustible_nucleo`); aquí se adelantan para no hacer esperar a
  quien está con la manguera en la mano.

  LO DE GOLDEN TOUCH QUE AQUÍ NO VA, porque la función de la base no lo
  guarda: el equipo que trae una entrada o lleva un traslado, y el horómetro
  y el kilometraje de un traslado.
*/

const hoy = () => hoyEnCaracas()

/** Un catálogo (autorizado, destino) que puede no tener aún lo que se busca: entonces se escribe. */
function CatalogoOTexto({
  label,
  tipo,
  valor,
  onCambio,
  placeholder,
}: {
  label: string
  tipo: TipoCatalogoCombustible
  valor: string
  onCambio: (v: string) => void
  placeholder: string
}) {
  const { data } = useCatalogosCombustible()
  const opciones = useMemo(
    () =>
      (data ?? [])
        .filter((c) => c.tipo === tipo && c.activo)
        .map((c) => ({ valor: c.valor, etiqueta: c.valor })),
    [data, tipo],
  )
  const enLista = opciones.some((o) => o.valor === valor)
  const [escribiendo, setEscribiendo] = useState(valor !== '' && !enLista)

  if (opciones.length === 0) {
    return (
      <CampoGrande>
        <Input label={label} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} />
      </CampoGrande>
    )
  }
  return (
    <CampoGrande className="space-y-2">
      <SelectBuscable
        label={label}
        vacio={escribiendo ? 'Otro: lo escribo abajo' : 'Nadie elegido · o escribirlo'}
        valor={enLista ? valor : ''}
        onCambio={(v) => {
          setEscribiendo(v === '')
          onCambio(v)
        }}
        opciones={opciones}
      />
      {!enLista ? (
        <Input
          label={`${label} (escrito)`}
          ocultarEtiqueta
          value={valor}
          onChange={(e) => {
            setEscribiendo(true)
            onCambio(e.target.value)
          }}
          placeholder={placeholder}
        />
      ) : null}
    </CampoGrande>
  )
}

export function FormularioSurtido({
  tipo,
  tanque,
  tanques,
  onCancelar,
  onGuardado,
}: {
  tipo: TipoSurtidor
  tanque: TanqueGt
  tanques: TanqueGt[]
  onCancelar: () => void
  /** El movimiento recién guardado (para abrir su detalle con el WhatsApp) y, si lo hubo, el aviso de las fotos. */
  onGuardado: (movimientoId: number, avisoFotos: string | null) => void
}) {
  const sale = tipo !== 'entrada'
  const catalogos = useCatalogosCombustible()
  const maquinas = useMaquinaria(true)
  const personas = usePersonasParaVale()
  const motivos = useMotivosDespacho()
  const vales = useDespachosCombustible()
  const ultimoContador = useUltimoContador(sale ? tanque.almacen_id : null)
  const registrarUso = useRegistrarUso()
  const registrarEntrada = useRegistrarEntradaCombustible()
  const trasladar = useTrasladarCombustible()
  const subirFotos = useSubirFotosDeCarga()

  const [litros, setLitros] = useState('')
  const [costo, setCosto] = useState(tanque.tasa_usd_litro != null && !tanque.sin_costo ? String(n(tanque.tasa_usd_litro)) : '')
  const [deDonde, setDeDonde] = useState('')
  const [referencia, setReferencia] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [equipo, setEquipo] = useState('')
  const [equipoTexto, setEquipoTexto] = useState('')
  const [hiManual, setHiManual] = useState('')
  const [hf, setHf] = useState('')
  const [km, setKm] = useState('')
  const [autorizado, setAutorizado] = useState('')
  const [recibioId, setRecibioId] = useState('')
  const [recibioNombre, setRecibioNombre] = useState('')
  const [motivo, setMotivo] = useState('')
  const [detalle, setDetalle] = useState('')
  const [ciManual, setCiManual] = useState('')
  const [cf, setCf] = useState('')
  const [cuaderno, setCuaderno] = useState(false)
  const [cuadernoLitros, setCuadernoLitros] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [masDatos, setMasDatos] = useState(false)
  const [fecha, setFecha] = useState(hoy)
  const [hora, setHora] = useState(horaEnCaracas)
  const [ubicacion, setUbicacion] = useState('')
  const [observacion, setObservacion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [etapa, setEtapa] = useState<'movimiento' | 'fotos'>('movimiento')
  const [error, setError] = useState<string | null>(null)
  /** La base dijo que el costo se sale mucho de lo normal: se pide que lo acepte. */
  const [pedirConfirmar, setPedirConfirmar] = useState(false)
  const tarda = useTardaPorLaSeñal(guardando)
  const cajaError = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error) cajaError.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [error])

  // ─── El equipo y sus lecturas ───────────────────────────────────────────
  const elegido = tipo === 'uso' ? leerOpcionEquipo(equipo) : null
  const maquinaId = elegido?.maquina_id ?? null
  const maquina = maquinaId != null ? (maquinas.data ?? []).find((m) => m.id === maquinaId) : undefined
  const esVehiculo = maquina?.clase === 'VEHICULO'
  const lectura = useLecturaVigente(maquinaId)
  const hiAuto = lectura.data?.horometro ?? null
  const hi = hiAuto ?? leerNumero(hiManual)
  const kmVigente = lectura.data?.kilometraje ?? null

  /*
    «¿QUIÉN RECIBIÓ?» VIENE PUESTO CON EL OPERADOR DE LA MÁQUINA, una vez por
    máquina elegida: si quien surte lo cambia, no se le vuelve a pisar.
  */
  const precargadoPara = useRef<number | null>(null)
  const operador = lectura.data?.operador_id ?? null
  useEffect(() => {
    if (maquinaId == null || lectura.isPending || personas.isPending || precargadoPara.current === maquinaId) return
    precargadoPara.current = maquinaId
    if (operador != null && (personas.data ?? []).some((p) => p.id === operador)) {
      setRecibioId(String(operador))
      setRecibioNombre('')
    }
  }, [maquinaId, lectura.isPending, personas.isPending, operador, personas.data])

  const equiposOpts = useMemo<OpcionBuscable[]>(
    () =>
      opcionesEquipos({
        catalogo: catalogos.data ?? [],
        maquinas: (maquinas.data ?? []).map((m) => ({
          id: m.id,
          codigo: m.codigo,
          nombre: m.nombre,
          tipo: m.tipo,
          clase: m.clase ?? null,
          estado: m.estado,
        })),
        // Un bidón no se surte desde aquí: se le pasa con «🔁 Pasar a otro tanque».
        tanques: [],
        modo: 'telefono',
        tanqueActual: tanque.almacen_id,
        incluirValor: equipo,
      }).map((o) => ({
        valor: o.valor,
        codigo: o.codigo,
        // Con código, el SelectBuscable pinta código + nombre: la etiqueta de
        // «teléfono» (código · nombre) lo repetiría.
        ...(o.codigo ? { nombre: o.nombre } : { etiqueta: o.etiqueta }),
        detalle: [`${o.icono} ${o.grupo}`, o.detalle].filter(Boolean).join(' · '),
      })),
    [catalogos.data, maquinas.data, tanque.almacen_id, equipo],
  )

  // ─── Lo que se calcula mientras se escribe ──────────────────────────────
  const litrosNum = leerNumero(litros) ?? 0
  const costoNum = leerNumero(costo)
  const hfNum = leerNumero(hf)
  const kmNum = leerNumero(km)
  const ciAuto = ultimoContador.data ?? null
  const ci = leerNumero(ciManual) ?? ciAuto
  const cfNum = leerNumero(cf)
  const cfPropuesto = contadorFinalPropuesto(ci, litrosNum)
  const litrosContador = ci != null && cfNum != null ? cfNum - ci : null
  const hrs = horasTrabajadas(hi, hfNum)
  const errHor = errorHorometro(hi, hfNum)
  const kmRetrocede = kmNum != null && kmVigente != null && kmNum < kmVigente
  const errSaldo = sale ? errorSaldoInsuficiente({ nombre: tanque.nombre, saldo: tanque.saldo_litros, litros: litrosNum }) : null

  const destinos = tanques.filter((t) => t.almacen_id !== tanque.almacen_id && t.activo)
  const destino = destinos.find((t) => String(t.almacen_id) === destinoId)
  const aBidon = tipo === 'traslado' && !!destino?.es_bidon
  /** Lleva vale: un surtido, o un traslado a un bidón (es salida directa). */
  const llevaVale = tipo === 'uso' || aBidon

  const elMotivo = (motivos.data ?? []).find((m) => m.codigo === motivo)
  const valesHoy = useMemo(
    () =>
      maquinaId == null
        ? 0
        : (vales.data ?? []).filter((v) => v.maquina_id === maquinaId && v.fecha === fecha && !v.anulado_en).length,
    [vales.data, maquinaId, fecha],
  )
  const topeAlcanzado = tipo === 'uso' && valesHoy >= 3

  // ─── Guardar ─────────────────────────────────────────────────────────────
  function faltaAlgo(): string | null {
    if (!(litrosNum > 0)) return tipo === 'entrada' ? 'Indicá los litros que entraron.' : 'Indicá los litros surtidos.'
    if (errSaldo) return errSaldo
    if (tipo === 'uso') {
      if (maquinaId == null && equipoTexto.trim().length < 3) return 'Indicá a qué equipo o camión va el combustible.'
      if (topeAlcanzado) return `A ${maquina?.nombre ?? 'este equipo'} ya se le surtió 3 veces el ${fecha}. El máximo son 3 al día.`
      if (maquinaId != null && hfNum == null && !(esVehiculo && kmNum != null)) {
        return esVehiculo
          ? 'Escribí el horómetro final o el kilometraje del tablero.'
          : 'Escribí el horómetro final: sin él no se surte una máquina.'
      }
      if (errHor) return errHor
      if (kmRetrocede) return `El kilometraje no retrocede: lo último anotado marcaba ${fmt(kmVigente)}.`
    }
    if (tipo === 'traslado' && !destino) return 'Indicá a qué tanque pasa el combustible.'
    if (llevaVale) {
      if (!motivo) return 'Tocá para qué se surte.'
      if (elMotivo?.exige_detalle && detalle.trim().length < 3) return `Contá en pocas palabras el «${elMotivo.nombre}».`
      if (recibioId === '' && recibioNombre.trim().length < 3) return 'Indicá quién recibió el combustible.'
    }
    if (tipo === 'entrada') {
      const minimo = tanque.sin_costo ? 15 : 4
      if (deDonde.trim().length < minimo) {
        return tanque.sin_costo
          ? 'Una entrada sin costo hay que explicarla entera: de dónde vino y quién asumió el gasto.'
          : 'Escribí de dónde vino el combustible (compra, guía, proveedor).'
      }
      if (!tanque.sin_costo && !(costoNum != null && costoNum > 0)) return 'Indicá el costo por litro.'
    }
    return null
  }

  async function guardar(e?: FormEvent, confirmado = false) {
    e?.preventDefault()
    setError(null)
    const falta = faltaAlgo()
    if (falta) {
      setError(falta)
      return
    }
    setGuardando(true)
    setEtapa('movimiento')
    try {
      const comunes = {
        fecha,
        hora: hora || null,
        autorizado: autorizado.trim() || null,
        ubicacion: ubicacion.trim() || null,
        cuaderno,
        cuaderno_litros: cuaderno ? (leerNumero(cuadernoLitros) ?? litrosNum) : null,
      }
      const vale = {
        motivo_detalle: elMotivo?.exige_detalle ? detalle.trim() : null,
        empleado_id: recibioId ? Number(recibioId) : null,
        recibio_nombre: recibioId ? null : recibioNombre.trim(),
      }

      let movimientoId: number
      let ref: string | null
      if (tipo === 'uso') {
        const r = await registrarUso.mutateAsync({
          ...comunes,
          ...vale,
          almacen_id: tanque.almacen_id,
          litros: litrosNum,
          motivo,
          maquina_id: maquinaId,
          equipo: maquinaId == null ? equipoTexto.trim() : null,
          horometro_ini: hiAuto == null ? leerNumero(hiManual) : null,
          horometro_fin: hfNum,
          km: kmNum,
          observacion: observacion.trim() || null,
          contador_ini: leerNumero(ciManual),
          contador_fin: cfNum,
        })
        movimientoId = r.movimiento_id
        ref = r.numero
      } else if (tipo === 'traslado') {
        const r = await trasladar.mutateAsync({
          ...comunes,
          origen_id: tanque.almacen_id,
          destino_id: Number(destinoId),
          litros: litrosNum,
          observacion: observacion.trim() || null,
          contador_ini: leerNumero(ciManual),
          contador_fin: cfNum,
          ...(aBidon ? { ...vale, motivo_vale: motivo } : {}),
        })
        movimientoId = r.salida_id
        ref = r.numero ?? (await referenciaDelMovimiento(r.salida_id).catch(() => null))
      } else {
        const r = await registrarEntrada.mutateAsync({
          ...comunes,
          almacen_id: tanque.almacen_id,
          litros: litrosNum,
          costo_litro: tanque.sin_costo ? 0 : costoNum,
          sin_costo: tanque.sin_costo,
          motivo: deDonde.trim(),
          referencia: referencia.trim() || null,
          confirmado,
        })
        movimientoId = r.movimiento_id
        ref = await referenciaDelMovimiento(r.movimiento_id).catch(() => null)
      }

      /*
        LAS FOTOS VAN DESPUÉS DEL MOVIMIENTO, A PROPÓSITO: el movimiento es lo
        que no se puede perder. Si la señal se come la subida, el movimiento ya
        quedó y su detalle dice que faltan y deja añadirlas ahí mismo.
      */
      let avisoFotos: string | null = null
      if (archivos.length > 0) {
        setEtapa('fotos')
        if (ref) {
          try {
            await subirFotos.mutateAsync({ origen: 'COMBUSTIBLE', referencias: [ref], archivos })
          } catch (err) {
            avisoFotos = `El movimiento quedó guardado, pero las fotos no subieron: ${mensajeDe(err, 'por la señal')}. Añadilas aquí cuando mejore.`
          }
        } else {
          avisoFotos = 'El movimiento quedó guardado, pero no se pudo confirmar su número para colgarle las fotos. Añadilas aquí.'
        }
      }

      toast(aBidon ? 'Salida directa a bidón: registrada' : `${TITULO[tipo]}: registrado`, 'success')
      onGuardado(movimientoId, avisoFotos)
    } catch (err) {
      const msg = mensajeDe(err, 'No se pudo registrar.')
      setPedirConfirmar(tipo === 'entrada' && /aceptalo/i.test(msg))
      setError(msg)
    } finally {
      setGuardando(false)
    }
  }

  const textoMasDatos =
    tipo === 'uso'
      ? `▸ Más datos (${esVehiculo ? '' : 'kilometraje, '}contador inicial, destino, hora, observación)`
      : tipo === 'traslado'
        ? '▸ Más datos (contador inicial, destino, hora, observación)'
        : '▸ Más datos (guía o factura, destino, hora)'

  return (
    <form
      onSubmit={(e) => void guardar(e)}
      className="bg-surface shadow-card border-ink/15 rounded-card my-3 flex flex-col gap-[1.1rem] border-[1.5px] px-4 py-5"
    >
      {/* surt-form-titulo */}
      <div className="border-hairline flex items-center gap-3.5 border-b pb-3.5">
        <span
          className="border-royal-600/35 bg-royal-600/14 flex size-[46px] shrink-0 items-center justify-center rounded-[12px] border text-[1.6rem]"
          aria-hidden
        >
          {ICONO[tipo]}
        </span>
        <div className="min-w-0">
          <strong className="text-ink/90 block text-xl leading-tight">{TITULO[tipo]}</strong>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="border-royal-600/30 bg-royal-600/15 text-royal-700 dark:text-royal-300 rounded-[6px] border px-2 py-px text-xs font-bold">
              ⛽ {tanque.nombre}
            </span>
            <span className="text-ink/50 text-[0.8rem]">
              {tipo === 'entrada' ? `hoy ${fmt(tanque.saldo_litros)} L` : `${fmt(tanque.saldo_litros)} L disponibles`}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div ref={cajaError}>
          <Aviso tono={pedirConfirmar ? 'alerta' : 'peligro'} icono={pedirConfirmar ? '⚠' : '⛔'}>
            {error}
            {pedirConfirmar ? (
              <Button
                className="mt-2 h-14 w-full text-base"
                variant="outline"
                disabled={guardando}
                onClick={() => void guardar(undefined, true)}
              >
                ✔ El costo es correcto: registrar
              </Button>
            ) : null}
          </Aviso>
        </div>
      ) : null}

      {/* ⛽ Litros, grandes */}
      <div>
        <div className="relative [&_input]:text-royal-700 dark:[&_input]:text-royal-300 [&_input]:h-[62px] [&_input]:pr-16 [&_input]:text-center [&_input]:font-mono [&_input]:text-[1.9rem] [&_input]:font-extrabold [&_input]:border-royal-600/45 [&_input]:border-2 [&_label]:text-ink/60 [&_label]:text-xs [&_label]:font-bold [&_label]:tracking-[0.05em] [&_label]:uppercase">
          <Input
            label={`⛽ Litros ${tipo === 'entrada' ? 'que entraron' : 'a despachar'}`}
            type="number"
            inputMode="decimal"
            limite={{ maxDecimales: 2, sinNegativos: true }}
            autoFocus
            value={litros}
            onChange={(e) => setLitros(e.target.value)}
            placeholder="0"
          />
          <span
            aria-hidden
            className="text-royal-600 pointer-events-none absolute top-[38px] right-4 text-lg font-extrabold opacity-85 select-none"
          >
            Ltrs
          </span>
        </div>
        {errSaldo ? <p className="text-danger mt-1.5 text-sm font-bold">{errSaldo}</p> : null}
      </div>

      {tipo === 'entrada' ? (
        tanque.sin_costo ? (
          <Aviso tono="info" icono="🎁">
            <strong>{tanque.nombre}</strong> guarda el combustible <strong>sin costo</strong>: la entrada va a $0 y
            hay que contar de dónde vino y quién asumió el gasto.
          </Aviso>
        ) : (
          <CampoGrande>
            <Input
              label="Costo por litro (USD)"
              type="number"
              inputMode="decimal"
              limite={{ maxDecimales: 4, sinNegativos: true }}
              value={costo}
              onChange={(e) => {
                setCosto(e.target.value)
                setPedirConfirmar(false)
              }}
              placeholder="0,00"
              hint="Recalcula la tasa promedio del tanque. Viene precargado con la tasa de hoy."
            />
          </CampoGrande>
        )
      ) : null}

      {tipo === 'entrada' ? (
        <CampoGrande>
          <Input
            label="¿De dónde vino?"
            value={deDonde}
            onChange={(e) => setDeDonde(e.target.value)}
            placeholder={tanque.sin_costo ? 'Lo trajo… y el gasto lo asumió…' : 'Compra PDVSA, proveedor…'}
          />
        </CampoGrande>
      ) : null}

      {tipo === 'traslado' ? (
        <div>
          <CampoGrande>
            <SelectBuscable
              label="¿A qué tanque pasa?"
              vacio="🔍 Busca el tanque…"
              valor={destinoId}
              onCambio={setDestinoId}
              opciones={destinos.map((t) => ({ valor: String(t.almacen_id), etiqueta: etiquetaTanqueDestino(t) }))}
            />
          </CampoGrande>
          {aBidon ? (
            <p className="text-royal-700 dark:text-royal-300 mt-1.5 text-sm font-semibold">
              🪣 Al pasar a <strong>{destino?.nombre}</strong> se registra como <strong>salida directa</strong> (el
              combustible se retira para consumo en campo y no queda con saldo en el bidón).
            </p>
          ) : null}
        </div>
      ) : null}

      {tipo === 'uso' ? (
        <div className="space-y-2">
          <CampoGrande>
            <SelectBuscable
              label="🚜 ¿A qué equipo o camión va?"
              vacio="🔍 No está en la lista: lo escribo"
              valor={equipo}
              onCambio={(v) => {
                setEquipo(v)
                setHiManual('')
                setHf('')
                setKm('')
              }}
              opciones={equiposOpts}
            />
          </CampoGrande>
          {equipo === '' ? (
            <CampoGrande>
              <Input
                label="Equipo o camión (escrito)"
                ocultarEtiqueta
                value={equipoTexto}
                onChange={(e) => setEquipoTexto(e.target.value)}
                placeholder="La planta, una bomba, un camión de fuera…"
              />
            </CampoGrande>
          ) : null}
          {topeAlcanzado ? (
            <Aviso tono="alerta" icono="⛔">
              {maquina?.nombre ?? 'Este equipo'} ya tiene 3 vales el {fecha}. El máximo son 3 al día.
            </Aviso>
          ) : null}
        </div>
      ) : null}

      {/* HF − HI = horas trabajadas, y el HF es el HI del próximo surtido del equipo. */}
      {tipo === 'uso' && maquinaId != null ? (
        <>
          <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
            <CampoGrande>
              <Input
                label="Horómetro inicial"
                type="number"
                inputMode="decimal"
                readOnly={hiAuto != null}
                value={hiAuto != null ? String(hiAuto) : hiManual}
                onChange={(e) => setHiManual(e.target.value)}
                placeholder={lectura.isPending ? 'buscando…' : 'primera lectura'}
                hint={hiAuto != null ? '🔒 Último final del equipo' : undefined}
              />
            </CampoGrande>
            <CampoGrande>
              <Input
                label="Horómetro final"
                type="number"
                inputMode="decimal"
                value={hf}
                onChange={(e) => setHf(e.target.value)}
                placeholder="lo que marca hoy"
                error={errHor ? 'No puede ser menor que el inicial.' : undefined}
              />
            </CampoGrande>
          </div>
          <div>
            <CampoGrande className="[&_input]:bg-warning-soft [&_input]:border-warning [&_input]:font-bold">
              <Input
                label="Horas trabajadas (HF − HI)"
                value={hrs == null ? '' : fmt(hrs)}
                readOnly
                placeholder="se calcula sola"
              />
            </CampoGrande>
            <p className="text-ink/50 mt-1.5 text-sm leading-snug">
              {hiAuto != null
                ? 'El inicial es el último final de este equipo. '
                : 'Este equipo no tiene horómetro cargado: si lo tiene, escribí las dos lecturas. '}
              {esVehiculo ? 'Es un vehículo: con el kilometraje del tablero basta. ' : ''}
              Las horas van al mantenimiento y el final es donde arranca el próximo surtido.
            </p>
          </div>
          {esVehiculo ? (
            <CampoGrande>
              <Input
                label="Kilometraje"
                type="number"
                inputMode="decimal"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder={kmVigente != null ? `último: ${fmt(kmVigente)}` : 'odómetro'}
                error={kmRetrocede ? `No retrocede: lo último marcaba ${fmt(kmVigente)}.` : undefined}
              />
            </CampoGrande>
          ) : null}
        </>
      ) : null}

      {/* «Para qué» y «¿Quién recibió?»: las reglas de La Cantera. */}
      {llevaVale ? (
        <>
          <div>
            <Rotulo className="mt-0">🎯 Para qué</Rotulo>
            <div className="flex flex-wrap gap-2">
              {(motivos.data ?? []).map((m) => (
                <button
                  key={m.codigo}
                  type="button"
                  aria-pressed={motivo === m.codigo}
                  onClick={() => setMotivo(m.codigo)}
                  className={cn(
                    'min-h-14 rounded-full border-2 px-5 text-base font-semibold transition-colors',
                    motivo === m.codigo
                      ? 'border-royal-600 bg-royal-600/12 text-royal-700 dark:text-royal-300'
                      : 'border-ink/20 text-ink/75 active:bg-ink/6',
                  )}
                >
                  {m.nombre}
                </button>
              ))}
            </div>
          </div>
          {elMotivo?.exige_detalle ? (
            <CampoGrande>
              <Input
                label={`Detalle de «${elMotivo.nombre}»`}
                value={detalle}
                onChange={(e) => setDetalle(e.target.value)}
                placeholder={elMotivo.pista ?? 'En pocas palabras, para qué'}
              />
            </CampoGrande>
          ) : null}

          <CampoGrande className="space-y-2">
            <SelectBuscable
              label="👤 ¿Quién recibió?"
              vacio="No está en la nómina: lo escribo"
              valor={recibioId}
              onCambio={setRecibioId}
              opciones={(personas.data ?? []).map((p) => ({
                valor: String(p.id),
                etiqueta: p.nombre,
                detalle: [p.cargo, p.id === operador ? 'operador de la máquina' : null].filter(Boolean).join(' · ') || undefined,
              }))}
            />
            {recibioId === '' ? (
              <Input
                label="Nombre de quien recibió"
                ocultarEtiqueta
                value={recibioNombre}
                onChange={(e) => setRecibioNombre(e.target.value)}
                placeholder="Nombre de quien recibe"
              />
            ) : null}
          </CampoGrande>
        </>
      ) : null}

      <CatalogoOTexto
        label="👤 Autorizado por"
        tipo="autorizado"
        valor={autorizado}
        onCambio={setAutorizado}
        placeholder="Quién autorizó"
      />

      {sale ? (
        <div>
          <CampoGrande>
            <Input
              label="🔢 Contador del surtidor al terminar"
              type="number"
              inputMode="decimal"
              value={cf}
              onChange={(e) => setCf(e.target.value)}
              placeholder={
                cfPropuesto != null
                  ? `${fmt(cfPropuesto)} (se pone solo)`
                  : ci != null
                    ? `arrancó en ${fmt(ci)}`
                    : 'lectura final del contador'
              }
            />
          </CampoGrande>
          {cf === '' && ci != null ? (
            <p className="text-ink/50 mt-1.5 text-sm leading-snug">
              Arrancó en {fmt(ci)}.{' '}
              {cfPropuesto != null ? (
                <>
                  Si lo dejás vacío se guarda <strong>{fmt(cfPropuesto)}</strong> (el arranque más los {fmt(litrosNum)}{' '}
                  L). Si el contador marca otra cosa, escribilo.
                </>
              ) : (
                'Lo que marque al terminar es donde arranca el próximo surtido.'
              )}
            </p>
          ) : null}
          {litrosContador != null ? (
            <p
              className={cn(
                'mt-1.5 text-sm',
                Math.abs(litrosContador - litrosNum) > 1 ? 'text-warning font-semibold' : 'text-ink/50',
              )}
            >
              Según el contador salieron {fmt(litrosContador)} L
              {Math.abs(litrosContador - litrosNum) > 1 && litrosNum > 0 ? ' · no coincide con los litros' : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      <TarjetaCuaderno
        encendido={cuaderno}
        onCambio={(v) => {
          setCuaderno(v)
          if (v && cuadernoLitros === '') setCuadernoLitros(litros)
        }}
      >
        <CampoGrande className="[&_label]:text-success">
          <Input
            label="¿Cuánto está registrado en cuaderno? (Ltrs)"
            type="number"
            inputMode="decimal"
            value={cuadernoLitros}
            onChange={(e) => setCuadernoLitros(e.target.value)}
            placeholder={litros || '0'}
          />
        </CampoGrande>
      </TarjetaCuaderno>

      <div className="[&_button.h-8]:h-14 [&_button.h-8]:px-4 [&_button.h-8]:text-base">
        <Rotulo className="mt-0">
          {tipo === 'entrada' ? '📷 Fotos (guía, cisterna, medida)' : '📷 Fotos (contador, equipo, vale)'}
        </Rotulo>
        <ElegirArchivosDeCarga
          archivos={archivos}
          onCambiar={setArchivos}
          descripcion="se suben apenas quede guardado."
        />
      </div>

      <button
        type="button"
        className="text-royal-700 dark:text-royal-300 min-h-12 self-start py-1.5 text-left font-semibold"
        onClick={() => setMasDatos((v) => !v)}
      >
        {masDatos ? '▾ Menos datos' : textoMasDatos}
      </button>
      {masDatos ? (
        <>
          {tipo === 'entrada' ? (
            <CampoGrande>
              <Input
                label="Guía o factura"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Guía N°…"
              />
            </CampoGrande>
          ) : null}
          {sale ? (
            <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
              {tipo === 'uso' && !esVehiculo ? (
                <CampoGrande>
                  <Input
                    label="Kilometraje"
                    type="number"
                    inputMode="decimal"
                    value={km}
                    onChange={(e) => setKm(e.target.value)}
                    placeholder={kmVigente != null ? `último: ${fmt(kmVigente)}` : 'odómetro'}
                    error={kmRetrocede ? `No retrocede: lo último marcaba ${fmt(kmVigente)}.` : undefined}
                  />
                </CampoGrande>
              ) : null}
              <CampoGrande>
                <Input
                  label="Contador inicial"
                  type="number"
                  inputMode="decimal"
                  readOnly={ciAuto != null}
                  value={ciAuto != null ? String(ciAuto) : ciManual}
                  onChange={(e) => setCiManual(e.target.value)}
                  hint={ciAuto != null ? '🔒 Donde terminó el último' : undefined}
                />
              </CampoGrande>
            </div>
          ) : null}
          <CatalogoOTexto
            label="Destino / mina"
            tipo="ubicacion"
            valor={ubicacion}
            onCambio={setUbicacion}
            placeholder="A qué frente o mina"
          />
          <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
            <CampoGrande>
              <Input label="Fecha" type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </CampoGrande>
            <CampoGrande>
              {/* El reloj del sistema: escrita a mano entraban horas sin AM/PM que desordenaban el libro. */}
              <Input label="Hora" type="time" step={1} value={hora} onChange={(e) => setHora(e.target.value)} />
            </CampoGrande>
          </div>
          {sale ? (
            <CampoGrande>
              <Input
                label="Observación"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="SUMINISTRO COMBUSTIBLE…"
              />
            </CampoGrande>
          ) : null}
        </>
      ) : null}

      {guardando && tarda ? (
        <Aviso tono="alerta" icono="⏳">
          {etapa === 'fotos' ? (
            <>
              <strong>El movimiento ya quedó guardado</strong>; se están subiendo las fotos con poca señal. No lo vuelvas
              a cargar.
            </>
          ) : (
            <>Está tardando más de lo normal por la señal. No lo vuelvas a cargar hasta revisar la lista.</>
          )}
        </Aviso>
      ) : null}

      <Button type="submit" size="lg" className="h-14 w-full text-[1.15rem] font-extrabold" disabled={guardando || !!errSaldo}>
        {guardando
          ? etapa === 'fotos'
            ? `Subiendo ${archivos.length === 1 ? 'la foto' : `${archivos.length} fotos`}…`
            : 'Guardando…'
          : `✔ Registrar ${tipo === 'uso' ? 'surtido' : tipo === 'traslado' ? 'traslado' : 'entrada'}`}
      </Button>
      <Button variant="ghost" size="lg" className="h-14 w-full text-base" onClick={onCancelar} disabled={guardando}>
        Cancelar
      </Button>
    </form>
  )
}
