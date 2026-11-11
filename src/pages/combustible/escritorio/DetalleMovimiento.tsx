import { useEffect, useMemo, useState } from 'react'
import { FotosDeCarga } from '@/components/FotosDeCarga'
import { Visor } from '@/components/Visor'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { Input } from '@/components/ui/Input'
import { Interruptor } from '@/components/ui/Interruptor'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Textarea } from '@/components/ui/Textarea'
import {
  useAnularMovimientoCombustible,
  useCorregirMovimientoCombustible,
  useMarcarCuaderno,
  useMotivosDespacho,
  usePersonasParaVale,
  type CorreccionMovimiento,
} from '@/lib/api/combustible'
import { useEmpresa } from '@/lib/api/empresa'
import { useFirmas } from '@/lib/api/firmas'
import type { Maquina } from '@/lib/api/maquinaria'
import { armarValeDeCombustible } from '@/lib/ficha/valeCombustiblePdf'
import { horaAInput, horaParaLeer } from '@/lib/combustible/horaMovimiento'
import { errorHorometro, horasTrabajadas } from '@/lib/combustible/medidores'
import { leerOpcionEquipo, valorMaquina } from '@/lib/combustible/opcionesEquipos'
import { hoyIsoVE } from '@/lib/combustible/reporteExistenciasCorte'
import { errorSaldoInsuficiente, litrosExtraQueSalen } from '@/lib/combustible/saldo'
import { n, nulo, type CatalogoCombustible, type MovimientoLibro, type TanqueGt } from '@/lib/combustible/tipos'
import { fecha as fechaLegible, fechaHora } from '@/lib/formato'
import { enumerar } from '@/lib/texto'
import { CamposVale } from './CamposVale'
import {
  equipoDe,
  faltaDelVale,
  leerNumero,
  lt,
  opcionesDeEquipo,
  referenciaFotos,
  TIPO_CORTO,
  useDespachoDelLibro,
  usePermisosCombustible,
  usd,
  VALE_VACIO,
  valeParaLaBase,
  type EstadoVale,
} from './comun'
import { Calculado, Fila } from './piezas'

/*
  DETALLE DEL MOVIMIENTO (Golden Touch, DetalleMovimientoModal).

  Ver, corregir y anular un renglón del libro, con sus fotos y —si es un
  surtido— su vale en PDF.

  CORREGIR NO ES EDITAR. Golden Touch reescribía el renglón y recalculaba el
  saldo. Aquí el libro no se reescribe: si cambian los litros, la fecha, el
  costo o el tanque destino, la base anula el movimiento con un reverso y
  registra uno nuevo (por eso pide el motivo); si solo cambian los datos
  (equipo, autorizado, destino, medidores, observación), se corrigen en su
  sitio. Un surtido se corrige como vale (`corregir_despacho_combustible`):
  mismo número, marcado corregido. El tipo no se cambia: eso es anular y
  registrar otro.

  ANULAR ES «🗑 ELIMINAR» DE GOLDEN TOUCH, con motivo y reverso. El renglón se
  queda tachado.
*/

const s = (v: unknown) => (nulo(v as string) == null ? '' : String(nulo(v as string)))

export function DetalleMovimiento({
  mov,
  tanques,
  catalogos,
  maquinas,
  anularAlAbrir,
  onCerrar,
}: {
  mov: MovimientoLibro
  tanques: TanqueGt[]
  catalogos: CatalogoCombustible[]
  maquinas: Maquina[]
  /** Abrir directo en «Anular» (el botón de la fila). */
  anularAlAbrir?: boolean
  onCerrar: () => void
}) {
  const p = usePermisosCombustible()
  const tanque = tanques.find((t) => t.almacen_id === mov.tanque_id)
  const motivos = useMotivosDespacho()
  const despacho = useDespachoDelLibro(mov.despacho_id)
  const empresa = useEmpresa()
  const firmas = useFirmas()
  const corregir = useCorregirMovimientoCombustible()
  const anular = useAnularMovimientoCombustible()
  const marcar = useMarcarCuaderno()

  const esVale = mov.despacho_id != null
  // El costo solo se corrige en una entrada directa: la de un traslado trae el del origen.
  const esEntradaDirecta = mov.tipo_inventario === 'ENTRADA_DIRECTA'
  const corregible = p.escribe && !mov.anulado && mov.tipo !== 'reverso' && mov.tipo !== 'ajuste'
  const equipoInicial = mov.maquina_id != null ? valorMaquina(mov.maquina_id) : (mov.equipo ?? '')

  const [litros, setLitros] = useState(s(mov.litros))
  const [fecha, setFecha] = useState(mov.fecha)
  const [hora, setHora] = useState(horaAInput(mov.hora))
  const [costo, setCosto] = useState(s(mov.tasa_usd_litro))
  const [destinoId, setDestinoId] = useState(mov.tanque_destino_id != null ? String(mov.tanque_destino_id) : '')
  const [equipo, setEquipo] = useState(equipoInicial)
  const [autorizado, setAutorizado] = useState(mov.autorizado_por ?? '')
  const [ubicacion, setUbicacion] = useState(mov.ubicacion ?? '')
  const [observacion, setObservacion] = useState(mov.observacion ?? '')
  const [hi, setHi] = useState(s(mov.horometro_ini))
  const [hf, setHf] = useState(s(mov.horometro_fin))
  const [km, setKm] = useState(s(mov.kilometraje))
  const [ci, setCi] = useState(s(mov.contador_global_ini))
  const [cf, setCf] = useState(s(mov.contador_global_fin))
  const [cuaderno, setCuaderno] = useState(mov.registrado_en_cuaderno)
  const [cuadernoLitros, setCuadernoLitros] = useState(
    mov.cuaderno_litros != null ? s(mov.cuaderno_litros) : mov.registrado_en_cuaderno ? s(mov.litros) : '',
  )
  const [porQue, setPorQue] = useState('')
  const [vale, setVale] = useState<EstadoVale>({ ...VALE_VACIO, motivo: mov.motivo ?? '', detalle: mov.motivo_detalle ?? '' })
  const [valeInicial, setValeInicial] = useState<EstadoVale | null>(null)
  const [anulando, setAnulando] = useState(!!anularAlAbrir)
  const [motivoAnular, setMotivoAnular] = useState('')
  const [pdfVale, setPdfVale] = useState<{ blob: Blob; nombre: string } | null>(null)

  // Quién recibió sale del vale (el libro solo trae el nombre).
  useEffect(() => {
    const d = despacho.data
    if (!d) return
    const inicial: EstadoVale = {
      motivo: d.motivo,
      detalle: d.motivo_detalle ?? '',
      empleado: d.empleado_id != null ? String(d.empleado_id) : '',
      nombre: d.empleado_id == null ? d.recibio : '',
      cedula: d.empleado_id == null ? (d.recibio_cedula ?? '') : '',
    }
    setVale(inicial)
    setValeInicial(inicial)
  }, [despacho.data])

  const opcionesEquipo = useMemo(
    () =>
      opcionesDeEquipo({
        catalogo: catalogos,
        maquinas,
        tanques: [],
        modo: 'pc',
        tanqueActual: mov.tanque_id,
        incluirValor: equipo,
      }),
    [catalogos, maquinas, mov.tanque_id, equipo],
  )

  // ─── Lo que cambió ────────────────────────────────────────────────────────
  const datos: CorreccionMovimiento = {}
  const litrosNum = leerNumero(litros)
  if (litrosNum != null && litrosNum !== n(mov.litros)) datos.litros = litrosNum
  if (fecha !== mov.fecha) datos.fecha = fecha
  if (hora !== horaAInput(mov.hora)) datos.hora = hora || null
  if (esEntradaDirecta && !mov.sin_costo && p.veValor && leerNumero(costo) !== nulo(mov.tasa_usd_litro))
    datos.costo_litro = leerNumero(costo)
  if (mov.tipo === 'traslado' && destinoId && Number(destinoId) !== mov.tanque_destino_id) datos.destino_id = Number(destinoId)
  if ((mov.tipo === 'uso' || mov.tipo === 'retorno') && equipo !== equipoInicial) {
    const e = leerOpcionEquipo(equipo)
    datos.maquina_id = e?.maquina_id ?? null
    datos.equipo = e?.equipo ?? null
  }
  if (autorizado !== (mov.autorizado_por ?? '')) datos.autorizado = autorizado || null
  if (ubicacion !== (mov.ubicacion ?? '')) datos.ubicacion = ubicacion || null
  if (observacion !== (mov.observacion ?? '')) datos.observacion = observacion.trim() || null
  if (hi !== s(mov.horometro_ini)) datos.horometro_ini = leerNumero(hi)
  if (hf !== s(mov.horometro_fin)) datos.horometro_fin = leerNumero(hf)
  if (km !== s(mov.kilometraje)) datos.km = leerNumero(km)
  if (ci !== s(mov.contador_global_ini)) datos.contador_ini = leerNumero(ci)
  if (cf !== s(mov.contador_global_fin)) datos.contador_fin = leerNumero(cf)
  if (esVale && valeInicial && JSON.stringify(vale) !== JSON.stringify(valeInicial)) {
    Object.assign(datos, valeParaLaBase(vale, motivos.data))
  }
  const cambiaLoQueMide = 'litros' in datos || 'fecha' in datos || 'costo_litro' in datos || 'destino_id' in datos
  const hayCambios = Object.keys(datos).length > 0
  const cuadernoLitrosNum = cuaderno ? (leerNumero(cuadernoLitros) ?? n(mov.litros)) : null
  const cambiaCuaderno =
    cuaderno !== mov.registrado_en_cuaderno || (cuaderno && cuadernoLitrosNum !== nulo(mov.cuaderno_litros))

  const extra = litrosExtraQueSalen({ tipo: mov.tipo, litros: mov.litros }, { tipo: mov.tipo, litros: litrosNum ?? 0 })
  const errSaldo =
    tanque && extra > 0
      ? errorSaldoInsuficiente({ nombre: tanque.nombre, saldo: tanque.saldo_litros, litros: extra, edicion: true })
      : null
  const errHor = errorHorometro(leerNumero(hi), leerNumero(hf))
  const hrs = horasTrabajadas(leerNumero(hi), leerNumero(hf))
  const litrosContador = ci !== '' && cf !== '' ? (leerNumero(cf) ?? 0) - (leerNumero(ci) ?? 0) : null
  const deOtroDia = mov.fecha !== hoyIsoVE() || fecha !== hoyIsoVE()

  const falta: string[] = []
  if (!(n(litrosNum) > 0)) falta.push('los litros')
  if (errSaldo) falta.push('litros que alcancen')
  if (errHor) falta.push('un horómetro que no retroceda')
  if (esVale) falta.push(...faltaDelVale(vale, motivos.data))
  if ((cambiaLoQueMide || esVale) && hayCambios && porQue.trim().length < 3) falta.push('por qué se corrige')
  if (deOtroDia && (hayCambios || cambiaCuaderno) && !p.total) falta.push('control total (no es de hoy)')

  const guardando = corregir.isPending || marcar.isPending

  const guardar = async () => {
    if (hayCambios) {
      await corregir.mutateAsync({
        movimiento_id: mov.id,
        datos: { ...datos, ...(porQue.trim() ? { motivo_correccion: porQue.trim() } : {}) },
      })
    }
    if (cambiaCuaderno) {
      await marcar.mutateAsync({ movimiento_id: mov.id, cuaderno, litros: cuadernoLitrosNum })
    }
    onCerrar()
  }

  const verVale = async () => {
    const d = despacho.data
    if (!d) return
    setPdfVale(
      await armarValeDeCombustible({
        numero: d.numero,
        fecha: fechaLegible(d.fecha),
        hora: d.hora,
        combustible: d.combustible,
        unidad: d.unidad,
        cantidad: d.cantidad,
        tanque: d.tanque,
        motivo:
          (motivos.data?.find((m) => m.codigo === d.motivo)?.nombre ?? d.motivo) +
          (d.motivo_detalle ? ` · ${d.motivo_detalle.toLowerCase()}` : ''),
        destino: d.destino,
        maquinaCodigo: d.maquina_codigo,
        sinFicha: d.maquina_id === null,
        horometro: d.horometro,
        recibio: d.recibio,
        recibioCedula: d.recibio_cedula,
        recibioFirma: d.empleado_id ? (firmas.data?.porEmpleado[d.empleado_id] ?? null) : null,
        surtio: d.surtio,
        surtioFirma: d.registrado_por ? (firmas.data?.porPerfil[d.registrado_por] ?? null) : null,
        costoUsd: p.veValor ? d.costo_usd : null,
        nota: d.nota,
        anuladoEn: d.anulado_en,
        motivoAnulacion: d.motivo_anulacion,
        empresa: { razonSocial: empresa.data?.razon_social ?? '', rif: empresa.data?.rif ?? '' },
        momento: new Date(),
      }),
    )
  }

  const cat = (t: CatalogoCombustible['tipo']) => catalogos.filter((c) => c.tipo === t && (c.activo || c.valor === autorizado || c.valor === ubicacion))
  const personas = usePersonasParaVale()
  const conOriginal = (lista: { valor: string; etiqueta: string }[], actual: string) =>
    actual && !lista.some((o) => o.valor === actual) ? [{ valor: actual, etiqueta: actual }, ...lista] : lista

  const deshabilitado = !corregible

  return (
    <>
      <Modal
        abierto
        onCerrar={onCerrar}
        titulo="Detalle del movimiento"
        descripcion={`${TIPO_CORTO[mov.tipo]} · ${mov.vale_numero ?? mov.numero}`}
        ancho="lg"
        acciones={
          anulando ? (
            <>
              <Button variant="ghost" onClick={() => setAnulando(false)} disabled={anular.isPending}>
                Volver
              </Button>
              <Button
                variant="danger"
                disabled={motivoAnular.trim().length < 3 || anular.isPending}
                onClick={() =>
                  anular.mutate({ movimiento_id: mov.id, motivo: motivoAnular.trim() }, { onSuccess: onCerrar })
                }
              >
                {anular.isPending ? 'Anulando…' : 'Anular'}
              </Button>
            </>
          ) : (
            <>
              {esVale ? (
                <Button variant="ghost" onClick={() => void verVale()} disabled={!despacho.data}>
                  🧾 Vale PDF
                </Button>
              ) : null}
              {corregible ? (
                <Button variant="ghost" className="text-danger" onClick={() => setAnulando(true)}>
                  Anular
                </Button>
              ) : null}
              <Button variant="ghost" onClick={onCerrar} disabled={guardando}>
                Cerrar
              </Button>
              {corregible ? (
                <Button
                  onClick={() => void guardar()}
                  disabled={guardando || (!hayCambios && !cambiaCuaderno) || falta.length > 0}
                >
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              ) : null}
            </>
          )
        }
      >
        <Fila k="Tanque" v={mov.tanque} />
        <Fila
          k="Saldo del tanque (L · $)"
          v={`${lt(mov.saldo_litros)} L${p.veValor && mov.saldo_usd != null ? ` · ${usd(mov.saldo_usd)}` : ''}`}
        />
        <Fila k="Fecha y hora" v={`${fechaLegible(mov.fecha)}${mov.hora ? ` · ${horaParaLeer(mov.hora)}` : ''}`} />
        <Fila k="Litros" v={`${lt(mov.litros)} L`} />
        {p.veValor && mov.monto_usd != null ? (
          <Fila k="Monto $ (litros × tasa)" v={mov.sin_costo ? 'sin costo' : `${usd(mov.monto_usd)} · ${usd(mov.tasa_usd_litro)}/L`} />
        ) : null}
        {equipoDe(mov) ? <Fila k="Equipo" v={equipoDe(mov)} /> : null}
        {mov.recibio ? <Fila k="Recibió" v={mov.recibio} /> : null}
        {mov.motivo ? (
          <Fila
            k="Para qué"
            v={`${motivos.data?.find((m) => m.codigo === mov.motivo)?.nombre ?? mov.motivo}${mov.motivo_detalle ? ` · ${mov.motivo_detalle}` : ''}`}
          />
        ) : null}
        {mov.merma_motivo || mov.merma_de_id ? (
          <Fila k="Merma de recepción" v={mov.merma_motivo ?? 'dentro del margen'} realce={mov.merma_fuera_de_margen} />
        ) : null}
        <Fila k="Registrado por" v={`${mov.actor_name ?? '—'} · ${fechaHora(mov.registrado_en)}`} />
        {mov.anulado ? (
          <div className="border-danger/30 bg-danger-soft mt-3 rounded-lg border p-3 text-sm">
            <Chip tone="danger">Anulado</Chip> <span className="text-ink/80 ml-1">{mov.anulado_motivo}</span>
            <p className="text-ink/55 mt-1 text-xs">El saldo volvió con un reverso. El renglón queda en el libro, tachado.</p>
          </div>
        ) : null}
        {mov.tipo === 'reverso' ? (
          <p className="text-ink/55 mt-3 text-sm">Este renglón es el reverso de una anulación o una corrección: no se corrige ni se anula.</p>
        ) : null}

        <div className="mt-4">
          <FotosDeCarga
            origen="COMBUSTIBLE"
            referencia={referenciaFotos(mov)}
            puedeAnadir={p.escribe && !mov.anulado}
            etiqueta="Fotos del movimiento"
          />
        </div>

        {anulando ? (
          <div className="border-danger/30 mt-4 rounded-lg border p-3">
            <p className="text-ink/80 mb-2 text-sm">
              {mov.tipo === 'traslado'
                ? 'Es un traslado entre tanques: al anularlo vuelve el saldo de AMBOS tanques (sale del destino y vuelve al origen).'
                : 'El saldo del tanque vuelve con un reverso a la vista. El renglón queda tachado.'}
              {deOtroDia ? ' No es de hoy: requiere control total.' : ''}
            </p>
            <Textarea label="Motivo" rows={2} value={motivoAnular} onChange={(e) => setMotivoAnular(e.target.value)} />
            {anular.error ? <ErrorDeCarga error={anular.error} className="mt-3" /> : null}
          </div>
        ) : corregible ? (
          <>
            <p className="text-ink/80 mt-5 mb-3 text-sm font-semibold">✎ Datos editables</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Litros"
                type="number"
                inputMode="decimal"
                value={litros}
                onChange={(e) => setLitros(e.target.value)}
                disabled={!!mov.merma_de_id}
                error={errSaldo ?? undefined}
                hint={mov.merma_de_id ? 'Esta merma sale de una recepción: se corrige desde la entrada o el traslado.' : undefined}
              />
              {esEntradaDirecta && p.veValor ? (
                mov.sin_costo ? (
                  <Input label="Tasa $/L" value="sin costo" disabled />
                ) : (
                  <Input label="Tasa $/L" type="number" inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
                )
              ) : null}
              {mov.tipo === 'traslado' && mov.signo < 0 ? (
                <Select
                  label="Tanque destino"
                  value={destinoId}
                  onChange={(e) => setDestinoId(e.target.value)}
                  opciones={tanques
                    .filter((t) => t.almacen_id !== mov.tanque_id)
                    .map((t) => ({ valor: String(t.almacen_id), etiqueta: t.nombre }))}
                />
              ) : null}
              <Input label="Fecha" type="date" value={fecha} max={hoyIsoVE()} onChange={(e) => setFecha(e.target.value)} />
              <Input label="Hora" type="time" step={1} value={hora} onChange={(e) => setHora(e.target.value)} />
              {mov.tipo === 'uso' || mov.tipo === 'retorno' ? (
                <SelectBuscable label="Equipo" vacio="Sin equipo" valor={equipo} onCambio={setEquipo} opciones={opcionesEquipo} />
              ) : null}
              <SelectBuscable
                label="Autorizado por"
                vacio="Sin autorizado"
                valor={autorizado}
                onCambio={setAutorizado}
                opciones={conOriginal(
                  // Los empleados activos de Nómina, más los cargados a mano en el catálogo (11/11/2026).
                  [
                    ...(personas.data ?? []).map((p) => ({ valor: p.nombre, etiqueta: p.nombre })),
                    ...cat('autorizado')
                      .filter((c) => !(personas.data ?? []).some((p) => p.nombre.toUpperCase() === c.valor.toUpperCase()))
                      .map((c) => ({ valor: c.valor, etiqueta: c.valor })),
                  ],
                  autorizado,
                )}
              />
              <SelectBuscable
                label="Destino"
                vacio="Sin destino"
                valor={ubicacion}
                onCambio={setUbicacion}
                opciones={conOriginal(
                  cat('ubicacion').map((c) => ({ valor: c.valor, etiqueta: c.valor })),
                  ubicacion,
                )}
              />
              <Input label="Observación" value={observacion} onChange={(e) => setObservacion(e.target.value)} />
            </div>

            {esVale ? (
              <div className="border-hairline mt-4 rounded-lg border p-3">
                <p className="text-ink/80 mb-3 text-sm font-semibold">🧾 El vale</p>
                <CamposVale vale={vale} onCambio={(parcial) => setVale((v) => ({ ...v, ...parcial }))} disabled={deshabilitado} />
              </div>
            ) : null}

            {mov.tipo === 'uso' || mov.tipo === 'traslado' ? (
              <>
                <p className="text-ink/80 mt-5 mb-3 text-sm font-semibold">🕒 Medidores</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  {mov.tipo === 'uso' ? (
                    <>
                      <Input label="Horómetro inicial (HI)" type="number" inputMode="decimal" value={hi} onChange={(e) => setHi(e.target.value)} />
                      <Input
                        label="Horómetro final (HF)"
                        type="number"
                        inputMode="decimal"
                        value={hf}
                        onChange={(e) => setHf(e.target.value)}
                        error={errHor ?? undefined}
                      />
                      <Input label="Kilometraje (km)" type="number" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
                      <Calculado label="Horas utilizadas (HRS = HF − HI)" valor={hrs == null ? '' : lt(hrs)} />
                    </>
                  ) : null}
                  <Input label="Contador global inicial" type="number" inputMode="decimal" value={ci} onChange={(e) => setCi(e.target.value)} />
                  <Input label="Contador global final" type="number" inputMode="decimal" value={cf} onChange={(e) => setCf(e.target.value)} />
                  <Calculado label="Litros usados (según contador)" valor={litrosContador == null ? '' : lt(litrosContador)} />
                </div>
              </>
            ) : null}

            <div className="mt-5">
              <Interruptor
                encendido={cuaderno}
                onCambio={(v) => {
                  setCuaderno(v)
                  if (v && cuadernoLitros === '') setCuadernoLitros(litros)
                }}
                etiqueta="📖 Registro Cuaderno"
                detalle={cuaderno ? 'Registrado' : 'No registrado'}
              />
              {cuaderno ? (
                <div className="mt-2 max-w-xs">
                  <Input
                    label="Litros en cuaderno"
                    type="number"
                    inputMode="decimal"
                    value={cuadernoLitros}
                    onChange={(e) => setCuadernoLitros(e.target.value)}
                  />
                </div>
              ) : null}
            </div>

            {hayCambios && (cambiaLoQueMide || esVale) ? (
              <div className="mt-4">
                <Input
                  label="Por qué se corrige"
                  placeholder="Se tecleó 40 y eran 14"
                  value={porQue}
                  onChange={(e) => setPorQue(e.target.value)}
                  hint={
                    esVale
                      ? 'El vale conserva su número y queda marcado corregido con su nombre y la hora.'
                      : 'El movimiento viejo se anula con un reverso y se registra uno nuevo con lo corregido.'
                  }
                />
              </div>
            ) : null}

            {(hayCambios || cambiaCuaderno) && falta.length > 0 ? (
              <p className="text-ink/50 mt-3 text-xs">Para guardar falta {enumerar(falta)}.</p>
            ) : null}
            {corregir.error ? <ErrorDeCarga error={corregir.error} className="mt-3" /> : null}
            {marcar.error ? <ErrorDeCarga error={marcar.error} className="mt-3" /> : null}
          </>
        ) : null}
      </Modal>

      <Visor
        abierto={pdfVale !== null}
        onCerrar={() => setPdfVale(null)}
        blob={pdfVale?.blob ?? null}
        nombreArchivo={pdfVale?.nombre ?? 'vale-combustible.pdf'}
        titulo="Vale de combustible"
        descripcion="Este papel es el que se firma."
      />
    </>
  )
}
