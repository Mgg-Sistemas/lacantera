import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { Interruptor } from '@/components/ui/Interruptor'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import {
  useDespachosCombustible,
  useLecturaVigente,
  useLibroTanque,
  useMotivosDespacho,
  useRegistrarEntradaCombustible,
  useRegistrarMerma,
  useRegistrarRetorno,
  useRegistrarUso,
  useTrasladarCombustible,
  useUltimoContador,
} from '@/lib/api/combustible'
import type { Maquina } from '@/lib/api/maquinaria'
import { contadorFinalPropuesto, errorHorometro, faltaHorometroFinal, horasTrabajadas, pasaPorSurtidor } from '@/lib/combustible/medidores'
import { calcularMermaImplicita, MARGEN_MERMA_DEFECTO, mermaDeRecepcion, observacionMermaImplicita } from '@/lib/combustible/merma'
import { leerOpcionEquipo } from '@/lib/combustible/opcionesEquipos'
import { hoyIsoVE } from '@/lib/combustible/reporteExistenciasCorte'
import { errorSaldoInsuficiente, etiquetaTanque, etiquetaTanqueDestino, saleDelTanque, tanqueSinLitros } from '@/lib/combustible/saldo'
import { n, type CatalogoCombustible, type TanqueGt, type TipoMovTanque } from '@/lib/combustible/tipos'
import { enumerar } from '@/lib/texto'
import { cn } from '@/lib/cn'
import { CamposVale } from './CamposVale'
import {
  faltaDelVale,
  horaAhoraVE,
  leerNumero,
  lt,
  opcionesDeEquipo,
  TIPO_MOV_LABEL,
  usePermisosCombustible,
  VALE_VACIO,
  valeParaLaBase,
  type EstadoVale,
} from './comun'
import { Calculado } from './piezas'

/*
  NUEVO MOVIMIENTO DE TANQUE (Golden Touch, MovimientoModal de TanquesView).

  Los cinco tipos de Golden Touch en un solo formulario: entrada, uso,
  traslado, retorno y merma. Con la fecha y la hora (selector, no texto
  libre), los litros con el aviso de saldo, el costo en la entrada, el tanque
  destino en el traslado, lo recibido y la merma de recepción con el margen
  del tanque, el equipo agrupado, quién autorizó y el destino, los medidores
  (HI que se trae solo, HF, horas; contador inicial que se trae solo y final
  propuesto) y el 📖 Cuaderno. En la merma, la merma implícita sugerida con
  la lista de los movimientos que la originan.

  Lo de La Cantera que se queda (decisión de la dueña): al surtir, «Para qué»
  y «¿Quién recibió?» (precargado con el operador de la máquina), el horómetro
  obligatorio que no retrocede (un vehículo puede dar el kilometraje) y el tope
  de tres vales al día por máquina. La base lo vuelve a exigir todo; aquí se
  dice mientras se llena.

  Diferencias con Golden Touch: sin «Registro Drive» (solo cuaderno); sin el
  destino «MGG» (no se copian los envíos a MGG); la merma fuera de margen la
  guarda quien tenga COMBUSTIBLE.MERMA_FUERA_DE_MARGEN; un «uso» a un bidón se
  registra como el traslado al bidón, que es como lo lleva la base.
*/

const TOPE_AL_DIA = 3

export function MovimientoModal({
  tanques,
  tanqueInicial,
  catalogos,
  maquinas,
  onCerrar,
}: {
  /** Los tanques activos. */
  tanques: TanqueGt[]
  tanqueInicial: number | null
  catalogos: CatalogoCombustible[]
  maquinas: Maquina[]
  onCerrar: () => void
}) {
  const p = usePermisosCombustible()
  const motivos = useMotivosDespacho()
  const vales = useDespachosCombustible()

  const tiposPermitidos = (['entrada', 'uso', 'traslado', 'retorno', 'merma'] as TipoMovTanque[]).filter((t) =>
    t === 'uso' ? p.escribe : t === 'entrada' || t === 'retorno' ? p.entrada : t === 'traslado' ? p.traslado : p.merma,
  )

  const primero = tanques.find((t) => t.almacen_id === tanqueInicial) ?? tanques.find((t) => !t.es_bidon) ?? tanques[0]
  const [tanqueId, setTanqueId] = useState(primero ? String(primero.almacen_id) : '')
  const [tipo, setTipo] = useState<TipoMovTanque>(tiposPermitidos.includes('uso') ? 'uso' : (tiposPermitidos[0] ?? 'uso'))
  const [fecha, setFecha] = useState(hoyIsoVE())
  const [hora, setHora] = useState(horaAhoraVE())
  const [litros, setLitros] = useState('')
  const [costo, setCosto] = useState('')
  const [referencia, setReferencia] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [equipo, setEquipo] = useState('')
  const [autorizado, setAutorizado] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [observacion, setObservacion] = useState('')
  const [hi, setHi] = useState('')
  const [hiAuto, setHiAuto] = useState(false)
  const [hf, setHf] = useState('')
  const [km, setKm] = useState('')
  const [ci, setCi] = useState('')
  const [ciAuto, setCiAuto] = useState(false)
  const [cf, setCf] = useState('')
  const [recibidos, setRecibidos] = useState('')
  const [motivoMerma, setMotivoMerma] = useState('')
  const [cuaderno, setCuaderno] = useState(false)
  const [cuadernoLitros, setCuadernoLitros] = useState('')
  const [vale, setVale] = useState<EstadoVale>(VALE_VACIO)
  const [pctImplicita, setPctImplicita] = useState('')
  const [verRespaldo, setVerRespaldo] = useState(false)
  const [costoRaro, setCostoRaro] = useState<string | null>(null)

  const usar = useRegistrarUso()
  const entrar = useRegistrarEntradaCombustible()
  const trasladar = useTrasladarCombustible()
  const retornar = useRegistrarRetorno()
  const mermar = useRegistrarMerma()
  const guardando = usar.isPending || entrar.isPending || trasladar.isPending || retornar.isPending || mermar.isPending
  const error = usar.error ?? entrar.error ?? trasladar.error ?? retornar.error ?? mermar.error

  const tanque = tanques.find((t) => String(t.almacen_id) === tanqueId)
  const elegido = leerOpcionEquipo(equipo)
  const maquinaId = elegido?.maquina_id ?? null
  const maquina = maquinas.find((m) => m.id === maquinaId)
  const esVehiculo = maquina?.clase === 'VEHICULO'
  const aBidon = tipo === 'uso' && elegido?.bidon_id != null
  const destino = tipo === 'traslado' ? tanques.find((t) => String(t.almacen_id) === destinoId) : aBidon ? tanques.find((t) => t.almacen_id === elegido?.bidon_id) : undefined
  const destinoEsBidon = !!destino?.es_bidon
  const llevaVale = (tipo === 'uso' && !!elegido) || (tipo === 'traslado' && destinoEsBidon)
  const llevaMedidorEquipo = tipo === 'uso' && maquinaId != null
  const llevaContador = pasaPorSurtidor(tipo)

  // El HI y el kilometraje vigentes de la máquina; su operador es quien recibe por defecto.
  const lectura = useLecturaVigente(tipo === 'uso' ? maquinaId : null)
  useEffect(() => {
    if (!lectura.data) {
      setHiAuto(false)
      return
    }
    if (lectura.data.horometro != null) {
      setHi(String(lectura.data.horometro))
      setHiAuto(true)
    } else {
      setHiAuto(false)
    }
    setKm(lectura.data.kilometraje != null ? String(lectura.data.kilometraje) : '')
    if (lectura.data.operador_id != null) {
      setVale((v) => (v.empleado === '' && v.nombre === '' ? { ...v, empleado: String(lectura.data?.operador_id) } : v))
    }
  }, [lectura.data, maquinaId])

  // El contador del surtidor es del tanque de donde sale.
  const contador = useUltimoContador(llevaContador && tanque ? tanque.almacen_id : null)
  useEffect(() => {
    if (contador.data != null) {
      setCi(String(contador.data))
      setCiAuto(true)
    } else {
      setCi('')
      setCiAuto(false)
    }
  }, [contador.data, tanqueId])

  const pctDelTanque = tanque ? n(tanque.merma_implicita_pct) || 0.5 : 0.5
  useEffect(() => {
    setPctImplicita(String(pctDelTanque))
  }, [tanqueId, pctDelTanque])

  const litrosNum = leerNumero(litros) ?? 0
  const hrs = horasTrabajadas(leerNumero(hi), leerNumero(hf))
  const litrosContador = ci !== '' && cf !== '' ? (leerNumero(cf) ?? 0) - (leerNumero(ci) ?? 0) : null
  const cfPropuesto = llevaContador ? contadorFinalPropuesto(leerNumero(ci), litrosNum) : null

  // Merma de recepción: en una entrada mide el tanque elegido; en un traslado, el que recibe (un bidón no).
  const tanqueRecibe = tipo === 'entrada' ? tanque : tipo === 'traslado' && destino && !destinoEsBidon ? destino : undefined
  const margen = tanqueRecibe ? n(tanqueRecibe.margen_merma_pct) || MARGEN_MERMA_DEFECTO : MARGEN_MERMA_DEFECTO
  const recepcion = tanqueRecibe ? mermaDeRecepcion(litrosNum, leerNumero(recibidos), margen) : { ok: null, error: null }

  const sale = saleDelTanque(tipo)
  const origenVacio = !!tanque && !tanque.es_bidon && sale && tanqueSinLitros(tanque.saldo_litros)
  const errSaldo = tanque && sale ? errorSaldoInsuficiente({ nombre: tanque.nombre, saldo: tanque.saldo_litros, litros: litrosNum }) : null
  const errHor = llevaMedidorEquipo ? errorHorometro(leerNumero(hi), leerNumero(hf)) : null

  // El tope del día, con los vales que ya hay (la base lo vuelve a contar).
  const yaSurtidoHoy =
    tipo === 'uso' && maquinaId != null
      ? (vales.data ?? []).filter((v) => v.maquina_id === maquinaId && v.fecha === fecha && !v.anulado_en).length
      : 0
  const topeAlcanzado = yaSurtidoHoy >= TOPE_AL_DIA

  // La merma implícita sale del libro entero del tanque.
  const libro = useLibroTanque({ tanqueId: tanque?.almacen_id ?? null, porPagina: 5000 }, tipo === 'merma' && !!tanque)
  const resumenMerma = useMemo(
    () =>
      tipo === 'merma' && libro.data
        ? calcularMermaImplicita({ movimientos: libro.data.filas, porcentaje: leerNumero(pctImplicita) })
        : null,
    [tipo, libro.data, pctImplicita],
  )

  const cat = (t: CatalogoCombustible['tipo']) => catalogos.filter((c) => c.tipo === t && c.activo)
  const opcionesEquipo = useMemo(
    () =>
      opcionesDeEquipo({
        catalogo: catalogos,
        maquinas,
        tanques: tipo === 'uso' ? tanques : [],
        modo: 'pc',
        tanqueActual: tanque?.almacen_id ?? null,
        incluirValor: equipo,
      }),
    [catalogos, maquinas, tanques, tipo, tanque?.almacen_id, equipo],
  )

  // ─── Qué falta ────────────────────────────────────────────────────────────
  const falta: string[] = []
  if (!tanque) falta.push('el tanque')
  if (!(litrosNum > 0)) falta.push('los litros')
  if (errSaldo) falta.push('litros que alcancen')
  if (tipo === 'traslado' && !destino) falta.push('el tanque destino')
  if (tipo === 'uso' && !elegido) falta.push('el equipo')
  if (llevaVale) falta.push(...faltaDelVale(vale, motivos.data))
  if (llevaMedidorEquipo) {
    if (hf.trim() === '' && !(esVehiculo && km.trim() !== '')) falta.push(esVehiculo ? 'el horómetro final o el kilometraje' : 'el horómetro final')
    if (errHor) falta.push('un horómetro que no retroceda')
    if (topeAlcanzado) falta.push('un surtido libre del día')
  }
  if (tipo === 'entrada') {
    if (observacion.trim().length < 3) falta.push('de dónde vino')
    if (!tanque?.sin_costo && !(n(leerNumero(costo)) > 0)) falta.push('el costo por litro')
  }
  if (tipo === 'retorno' && observacion.trim().length < 3) falta.push('de dónde vuelve')
  if (tipo === 'merma' && observacion.trim().length < 3) falta.push('por qué se perdió')
  if (recepcion.error) falta.push('lo recibido bien medido')
  if (recepcion.ok?.excede) {
    if (motivoMerma.trim().length < 3) falta.push('el motivo de la merma')
    if (!p.mermaFueraDeMargen) falta.push('quien pueda guardar una merma fuera del margen')
  }
  const valido = falta.length === 0

  const comunes = {
    fecha,
    hora: hora || null,
    autorizado: autorizado || null,
    ubicacion: ubicacion || null,
    articulo_id: tanque?.articulo_id ?? null,
  }
  const cuadernoDatos = {
    cuaderno,
    cuaderno_litros: cuaderno ? (leerNumero(cuadernoLitros) ?? litrosNum) : null,
  }

  const enviar = async (confirmado = false) => {
    if (!tanque || !valido) return
    setCostoRaro(null)
    try {
      if (tipo === 'entrada') {
        await entrar.mutateAsync({
          ...comunes,
          ...cuadernoDatos,
          almacen_id: tanque.almacen_id,
          litros: litrosNum,
          costo_litro: tanque.sin_costo ? 0 : leerNumero(costo),
          sin_costo: tanque.sin_costo,
          motivo: observacion.trim(),
          referencia: referencia.trim() || null,
          recibidos: leerNumero(recibidos),
          merma_motivo: motivoMerma.trim() || null,
          confirmado,
        })
      } else if (tipo === 'uso' && !aBidon) {
        await usar.mutateAsync({
          ...comunes,
          ...cuadernoDatos,
          ...valeParaLaBase(vale, motivos.data),
          almacen_id: tanque.almacen_id,
          litros: litrosNum,
          maquina_id: maquinaId,
          equipo: elegido?.equipo ?? null,
          horometro_ini: maquinaId != null ? leerNumero(hi) : null,
          horometro_fin: maquinaId != null ? leerNumero(hf) : null,
          km: maquinaId != null ? leerNumero(km) : null,
          observacion: observacion.trim() || null,
          contador_ini: leerNumero(ci),
          contador_fin: leerNumero(cf),
        })
      } else if (tipo === 'traslado' || aBidon) {
        const v = valeParaLaBase(vale, motivos.data)
        await trasladar.mutateAsync({
          ...comunes,
          ...cuadernoDatos,
          origen_id: tanque.almacen_id,
          destino_id: destino!.almacen_id,
          litros: litrosNum,
          observacion: observacion.trim() || null,
          contador_ini: leerNumero(ci),
          contador_fin: leerNumero(cf),
          recibidos: destinoEsBidon ? null : leerNumero(recibidos),
          merma_motivo: motivoMerma.trim() || null,
          ...(destinoEsBidon
            ? {
                motivo_vale: v.motivo,
                motivo_detalle: v.motivo_detalle,
                empleado_id: v.empleado_id,
                recibio_nombre: v.recibio_nombre,
                recibio_cedula: v.recibio_cedula,
              }
            : {}),
        })
      } else if (tipo === 'retorno') {
        await retornar.mutateAsync({
          ...comunes,
          almacen_id: tanque.almacen_id,
          litros: litrosNum,
          motivo: observacion.trim(),
          maquina_id: maquinaId,
          equipo: elegido?.equipo ?? null,
        })
      } else {
        await mermar.mutateAsync({ ...comunes, almacen_id: tanque.almacen_id, litros: litrosNum, motivo: observacion.trim() })
      }
      onCerrar()
    } catch (e) {
      // Un costo que se sale mucho de lo que viene costando: se acepta a propósito.
      if (tipo === 'entrada' && e instanceof Error && /aceptalo/i.test(e.message)) {
        entrar.reset()
        setCostoRaro(e.message)
      }
    }
  }

  const etiquetaObservacion =
    tipo === 'entrada'
      ? 'De dónde vino'
      : tipo === 'retorno'
        ? 'De dónde vuelve'
        : tipo === 'merma'
          ? 'Por qué se perdió'
          : 'Observación'

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Nuevo movimiento de tanque"
      ancho="lg"
      acciones={
        <>
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!valido || guardando}>
            {guardando ? 'Guardando…' : 'Registrar movimiento'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Select
            label="Tanque"
            value={tanqueId}
            onChange={(e) => {
              setTanqueId(e.target.value)
              setDestinoId('')
            }}
            opciones={tanques.map((t) => ({
              valor: String(t.almacen_id),
              etiqueta: t.es_bidon ? `🪣 ${t.nombre}` : etiquetaTanque(t.nombre, t.saldo_litros),
            }))}
          />
          {origenVacio ? (
            <p className="text-danger mt-1.5 text-xs">{tanque?.nombre} está sin litros: solo admite entradas y retornos.</p>
          ) : null}
          {tanque?.sin_costo ? (
            <p className="text-info mt-1.5 text-xs">Combustible inicial sin costo: lo que entra aquí no costó nada.</p>
          ) : null}
        </div>
        <Select
          label="Tipo de movimiento"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoMovTanque)}
          opciones={tiposPermitidos.map((t) => ({ valor: t, etiqueta: TIPO_MOV_LABEL[t] }))}
        />
        <Input label="Fecha" type="date" value={fecha} max={hoyIsoVE()} onChange={(e) => setFecha(e.target.value)} />
        <Input
          label="Hora"
          type="time"
          step={1}
          value={hora}
          onChange={(e) => setHora(e.target.value)}
          hint={hora ? undefined : 'Sin hora, el movimiento va primero en el día.'}
        />
        <Input
          label="Litros"
          type="number"
          inputMode="decimal"
          value={litros}
          onChange={(e) => setLitros(e.target.value)}
          error={errSaldo ?? undefined}
          hint={tanque && sale ? `Disponible en ${tanque.nombre}: ${lt(Math.max(0, n(tanque.saldo_litros)))} L.` : undefined}
        />
        {tipo === 'entrada' ? (
          tanque?.sin_costo ? (
            <Input label="Costo por litro (USD)" value="sin costo" disabled hint="Este tanque es del combustible que no costó nada." />
          ) : (
            <Input
              label="Costo por litro (USD)"
              type="number"
              inputMode="decimal"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              hint="Recalcula la tasa promedio del tanque."
            />
          )
        ) : null}
        {tipo === 'traslado' ? (
          <div>
            <Select
              label="Tanque destino"
              vacio="Elegí el tanque destino"
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              opciones={tanques
                // Lo sin costo no se mezcla con lo pagado (regla de `transferir_existencia`); a un bidón sí se pasa.
                .filter((t) => String(t.almacen_id) !== tanqueId && (t.es_bidon || t.sin_costo === !!tanque?.sin_costo))
                .map((t) => ({ valor: String(t.almacen_id), etiqueta: etiquetaTanqueDestino(t) }))}
            />
            <p className={cn('mt-1.5 text-xs', destinoEsBidon ? 'text-royal-700 dark:text-royal-300 font-medium' : 'text-ink/50')}>
              {destinoEsBidon
                ? `🪣 Al trasladar hacia ${destino?.nombre} se registra como salida directa: el combustible se retira para consumo en campo y no queda con saldo en el bidón. Deja vale.`
                : 'Se acredita en el destino al costo del origen.'}
            </p>
          </div>
        ) : null}
        {tipo === 'entrada' ? (
          <Input label="Referencia (factura o guía)" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
        ) : null}
      </div>

      {tanqueRecibe ? (
        <div className={cn('border-hairline mt-4 rounded-lg border p-3', recepcion.ok?.excede && 'border-danger')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Litros recibidos (medido)"
              type="number"
              inputMode="decimal"
              value={recibidos}
              onChange={(e) => setRecibidos(e.target.value)}
              placeholder={tipo === 'entrada' ? 'lo que llegó al tanque' : `lo que llegó a ${tanqueRecibe.nombre}`}
              hint={`${tipo === 'entrada' ? 'Los litros de arriba son los de la guía.' : 'Los litros de arriba son los que salieron del origen.'} Si llegó menos, la diferencia queda como merma de este movimiento. Vacío = llegó todo.`}
              error={recepcion.error ?? undefined}
            />
            <Calculado
              label="Merma"
              valor={recepcion.ok ? `${lt(recepcion.ok.merma)} L · ${lt(recepcion.ok.pct)}% de ${lt(margen)}% permitido` : ''}
              pista={`Margen de ${tanqueRecibe.nombre}: ${lt(margen)}% (se cambia al editar el tanque).`}
            />
          </div>
          {recepcion.ok?.excede ? (
            <div className="mt-3">
              <Input
                label="Motivo de la merma"
                value={motivoMerma}
                onChange={(e) => setMotivoMerma(e.target.value)}
                placeholder="Por qué se perdió más de lo permitido"
                error={
                  p.mermaFueraDeMargen
                    ? undefined
                    : 'Pasa el margen del tanque: la guarda solo quien tiene permiso para mermas fuera de margen.'
                }
                hint="Pasa el margen del tanque. Se avisa a administración al guardar."
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {tipo === 'uso' || tipo === 'retorno' ? (
          <SelectBuscable
            label="Equipo"
            vacio="Elegí el equipo"
            valor={equipo}
            onCambio={(v) => {
              setEquipo(v)
              setHi('')
              setHf('')
              setKm('')
              setHiAuto(false)
            }}
            opciones={opcionesEquipo}
            hint={
              tipo === 'uso' && opcionesEquipo.length === 0
                ? 'Ningún equipo puede surtir de este tanque. Revisalo en 🗂 Catálogos.'
                : undefined
            }
          />
        ) : null}
        <SelectBuscable
          label="Autorizado por"
          vacio="Elegí quién autorizó"
          valor={autorizado}
          onCambio={setAutorizado}
          opciones={cat('autorizado').map((c) => ({ valor: c.valor, etiqueta: c.valor }))}
        />
        <SelectBuscable
          label="Destino"
          vacio="Elegí el destino"
          valor={ubicacion}
          onCambio={setUbicacion}
          opciones={cat('ubicacion').map((c) => ({ valor: c.valor, etiqueta: c.valor }))}
          hint="¿Falta un destino? Agregalo en 🗂 Catálogos → Ubicaciones."
        />
        <Input
          label={etiquetaObservacion}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          placeholder={tipo === 'entrada' ? 'COMPRA A PROVEEDOR…' : tipo === 'merma' ? 'EVAPORACIÓN, FUGA, DESCUADRE…' : 'SUMINISTRO COMBUSTIBLE…'}
        />
      </div>

      {tipo === 'uso' && maquinaId != null && yaSurtidoHoy > 0 ? (
        <p className={cn('mt-3 text-sm', topeAlcanzado ? 'text-danger font-medium' : 'text-warning')}>
          {topeAlcanzado
            ? `Ya se surtió ${yaSurtidoHoy} veces ese día. Son ${TOPE_AL_DIA} al día como máximo.`
            : `Es el surtido ${yaSurtidoHoy + 1} de ${TOPE_AL_DIA} de ese día para esta máquina.`}
        </p>
      ) : null}

      {llevaVale ? (
        <div className="border-hairline mt-4 rounded-lg border p-3">
          <p className="text-ink/80 mb-3 text-sm font-semibold">🧾 El vale</p>
          <CamposVale vale={vale} onCambio={(parcial) => setVale((v) => ({ ...v, ...parcial }))} />
        </div>
      ) : null}

      {llevaMedidorEquipo || llevaContador ? (
        <div className="border-hairline mt-4 rounded-lg border p-3">
          <p className="text-ink/80 mb-3 text-sm font-semibold">🕒 Medidores del equipo</p>
          {llevaMedidorEquipo ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Horómetro inicial (HI)"
                type="number"
                inputMode="decimal"
                value={hi}
                readOnly={hiAuto}
                onChange={(e) => setHi(e.target.value)}
                placeholder="auto: último del equipo"
                hint={hiAuto ? '🔒 Traído del último final del equipo (no se modifica).' : 'Trae el último horómetro final del equipo; si no hay, ingresalo.'}
              />
              <Input
                label="Horómetro final (HF)"
                type="number"
                inputMode="decimal"
                value={hf}
                onChange={(e) => setHf(e.target.value)}
                error={errHor ?? undefined}
                hint={faltaHorometroFinal(leerNumero(hi), leerNumero(hf)) ?? undefined}
              />
              <Calculado label="Horas utilizadas (HRS = HF − HI)" valor={hrs == null ? '' : lt(hrs)} />
              <Input
                label="Kilometraje (odómetro, km)"
                type="number"
                inputMode="decimal"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                placeholder="lectura del odómetro del vehículo"
                hint={esVehiculo ? 'Un vehículo puede dar el kilometraje en lugar del horómetro.' : 'Para vehículos: la lectura del odómetro.'}
              />
            </div>
          ) : null}
          {llevaContador ? (
            <div className={cn('grid gap-4 sm:grid-cols-2', llevaMedidorEquipo && 'mt-4')}>
              <Input
                label="Contador global inicial"
                type="number"
                inputMode="decimal"
                value={ci}
                readOnly={ciAuto}
                onChange={(e) => setCi(e.target.value)}
                placeholder="auto: último del tanque"
                hint={
                  ciAuto
                    ? `🔒 Traído del último contador final de ${tipo === 'traslado' ? 'el tanque ORIGEN' : 'este tanque'} (no se modifica).`
                    : 'No hay contador previo en este tanque; ingresalo.'
                }
              />
              <Input
                label="Contador global final"
                type="number"
                inputMode="decimal"
                value={cf}
                onChange={(e) => setCf(e.target.value)}
                placeholder={cfPropuesto != null ? `${cfPropuesto} (se pone solo)` : undefined}
                hint={`${cf === '' && cfPropuesto != null ? `Si lo dejás vacío se guarda ${lt(cfPropuesto)} (inicial + litros). ` : ''}Es donde arranca el siguiente movimiento del tanque.`}
              />
              <Calculado
                label="Litros usados (según contador = final − inicial)"
                valor={litrosContador == null ? '' : lt(litrosContador)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {tipo === 'merma' && resumenMerma ? (
        <div className="border-warning/50 bg-warning-soft mt-4 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-warning text-xs font-bold tracking-wide uppercase">💡 Merma implícita sugerida</p>
              <p className="mt-0.5 flex items-baseline gap-2">
                <span className="tabular text-ink/90 text-2xl font-extrabold">{lt(resumenMerma.totalSugerido)} L</span>
                <span className="text-ink/55 text-sm">
                  sobre {lt(resumenMerma.totalLitrosBase)} L en {resumenMerma.cantidadMovimientos} movimientos
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-28">
                <Input
                  label="Margen (%)"
                  type="number"
                  inputMode="decimal"
                  value={pctImplicita}
                  onChange={(e) => setPctImplicita(e.target.value)}
                />
              </div>
              <Button
                variant="soft"
                onClick={() => {
                  setLitros(String(resumenMerma.totalSugerido))
                  setObservacion(observacionMermaImplicita(resumenMerma))
                }}
                title="Aplica este volumen sugerido y redacta la justificación en la observación"
              >
                ⚡ Usar sugerida ({lt(resumenMerma.totalSugerido)} L)
              </Button>
            </div>
          </div>
          <button
            type="button"
            className="text-info mt-3 text-sm font-medium"
            onClick={() => setVerRespaldo((v) => !v)}
          >
            {verRespaldo
              ? '▾ Ocultar respaldo de movimientos'
              : `▸ Ver respaldo: ${resumenMerma.cantidadMovimientos} movimientos causantes`}
            {resumenMerma.fechaUltimaMermaPrevia ? (
              <span className="text-ink/50 font-normal"> (desde último corte: {resumenMerma.fechaUltimaMermaPrevia})</span>
            ) : null}
          </button>
          {verRespaldo ? (
            <div className="border-hairline bg-surface mt-2 max-h-56 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink/50 border-hairline border-b text-left">
                    <th className="px-2 py-1.5 font-medium">Fecha / Hora</th>
                    <th className="px-2 py-1.5 font-medium">Tipo / Equipo</th>
                    <th className="px-2 py-1.5 text-right font-medium">Litros</th>
                    <th className="px-2 py-1.5 text-right font-medium">% Implícito</th>
                    <th className="px-2 py-1.5 text-right font-medium">Merma</th>
                    <th className="px-2 py-1.5 text-right font-medium">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {!resumenMerma.items.length ? (
                    <tr>
                      <td colSpan={6} className="text-ink/45 px-2 py-3 text-center">
                        No hay movimientos registrados desde la última merma.
                      </td>
                    </tr>
                  ) : null}
                  {resumenMerma.items.map((it) => (
                    <tr key={it.id} className="border-hairline border-b last:border-0">
                      <td className="px-2 py-1">
                        {it.fecha} {it.hora ? `· ${it.hora.slice(0, 5)}` : ''}
                      </td>
                      <td className="px-2 py-1">
                        <strong>{it.tipo === 'traslado' ? '🔁 Traslado' : '⛽ Surtido'}</strong>
                        {it.equipo ? ` → ${it.equipo}` : ''}
                      </td>
                      <td className="tabular px-2 py-1 text-right">{lt(it.litros)} L</td>
                      <td className="tabular text-ink/50 px-2 py-1 text-right">{it.pctAplicado}%</td>
                      <td className="tabular text-warning px-2 py-1 text-right font-semibold">+{lt(it.mermaLitros)} L</td>
                      <td className="tabular px-2 py-1 text-right">{lt(it.acumulado)} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {tipo === 'uso' || tipo === 'traslado' || tipo === 'entrada' ? (
        <div className="mt-4">
          <Interruptor
            encendido={cuaderno}
            onCambio={(v) => {
              setCuaderno(v)
              if (v && cuadernoLitros === '') setCuadernoLitros(litros)
            }}
            etiqueta="📖 Registro Cuaderno"
            detalle={cuaderno ? 'Registrado en el cuaderno de campo' : 'No registrado'}
          />
          {cuaderno ? (
            <div className="mt-2 max-w-xs">
              <Input
                label="Litros en cuaderno"
                type="number"
                inputMode="decimal"
                value={cuadernoLitros}
                placeholder={litros || '0'}
                onChange={(e) => setCuadernoLitros(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {costoRaro ? (
        <div className="border-warning/40 bg-warning-soft mt-4 rounded-lg border p-3">
          <p className="text-ink/85 text-sm">{costoRaro}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => void enviar(true)} disabled={guardando}>
            Es correcto: aceptar el costo
          </Button>
        </div>
      ) : null}

      {!valido ? <p className="text-ink/50 mt-4 text-xs">Para registrar falta {enumerar(falta)}.</p> : null}
      {error ? <ErrorDeCarga error={error} className="mt-3" /> : null}
    </Modal>
  )
}
