import { useEffect, useMemo, useState } from 'react'
import { FileSignature, FileText, Search, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { RangoDeFechas } from '@/components/RangoDeFechas'
import { SIN_RANGO } from '@/components/rango'
import type { Rango } from '@/components/rango'
import { Visor } from '@/components/Visor'
import { useEmpresa } from '@/lib/api/empresa'
import { useMiPerfil } from '@/lib/api/usuarios'
import {
  ETIQUETA_CLASE,
  ETIQUETA_ESTADO,
  repuestosDeOrdenes,
  TIPOS_INTERVENCION,
  useMaquinaria,
  useReporteMantenimientos,
  type EstadoOrden,
} from '@/lib/api/maquinaria'
import { armarInformeMantenimiento, type OrdenDelInforme } from '@/lib/ficha/maquinariaPdf'
import {
  antecedentesPropuestos,
  armarInformeTecnico,
  totalesDelInforme,
  type EquipoDelInforme,
  type IntervencionDelInforme,
} from '@/lib/ficha/informeTecnicoPdf'
import type { PdfArmado } from '@/lib/ficha/reciboPdf'
import { dolares, enteros, fecha } from '@/lib/formato'
import { cn } from '@/lib/cn'

const ETIQUETA_TIPO: Record<string, string> = {
  MANTENIMIENTO: 'Mantenimiento',
  SERVICIO: 'Servicio',
  REPARACION: 'Reparación',
}

const ETIQUETA_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  ABIERTO: 'Abierta',
  CERRADO: 'Terminada',
  ANULADO: 'Anulada',
}

/**
 * El reporte de taller.
 *
 * QUÉ RESPONDE QUE NO RESPONDÍA NADA
 *
 * Cada máquina ya enseñaba su última fecha de mantenimiento. Lo que faltaba era
 * mirarlo al revés: qué ha pasado por el taller este mes, cuánto tardó cada
 * cosa, qué costó entre mano de obra y repuestos, y qué hay dentro ahora
 * mismo. Es la pregunta que se hace quien decide si conviene reparar una
 * máquina otra vez o cambiarla.
 *
 * LO ABIERTO VA PRIMERO Y SIN QUE HAYA QUE PEDIRLO
 *
 * Una orden abierta es una máquina parada. Ordenar por fecha las mezclaría con
 * el historial, que es justo lo contrario de lo que hace falta: lo de hoy
 * importa más que lo del mes pasado.
 */
export function Mantenimientos() {
  const { data, isPending, error } = useReporteMantenimientos()
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<'' | EstadoOrden>('')

  /*
    EL INFORME: POR MÁQUINA O POR RANGO DE FECHAS.

    Christopher, 14/10/2026: el historial de taller solo se veía en pantalla,
    sin poder sacarlo en papel. Las 300 órdenes más recientes ya están
    cargadas; el informe arma el PDF con las que caigan dentro del alcance
    elegido, sin pedir nada de nuevo al servidor.
  */
  const { data: empresa } = useEmpresa()
  const { data: yo } = useMiPerfil()
  const { data: maquinas } = useMaquinaria(false)
  const [pidiendoInforme, setPidiendoInforme] = useState(false)
  const [alcanceInforme, setAlcanceInforme] = useState<'MAQUINA' | 'FECHAS'>('FECHAS')
  const [maquinaInforme, setMaquinaInforme] = useState('')
  const [rangoInforme, setRangoInforme] = useState<Rango>(SIN_RANGO)
  const [armandoInforme, setArmandoInforme] = useState(false)
  const [informe, setInforme] = useState<PdfArmado | null>(null)

  /*
    EL INFORME TÉCNICO Y DE COSTOS DE UN EQUIPO.

    Christopher, 14/10/2026: «tráelo de SOS». Es otro papel y no una variante
    del anterior —ver la cabecera de `informeTecnicoPdf.ts`—: aquél responde
    qué órdenes hubo, éste cuánto lleva costado UNA máquina y en qué estado
    está. Por eso pide máquina obligatoria, y por eso pide escribir.

    LOS TRES TEXTOS SE PROPONEN, NO SE IMPONEN. Los antecedentes se redactan
    solos con los datos del período; las conclusiones y las recomendaciones
    nacen en blanco. Un informe técnico sin una línea escrita por alguien que
    conoce el equipo es una consulta impresa, no un informe.
  */
  const [pidiendoTecnico, setPidiendoTecnico] = useState(false)
  const [maquinaTecnico, setMaquinaTecnico] = useState('')
  const [rangoTecnico, setRangoTecnico] = useState<Rango>(SIN_RANGO)
  const [antecedentes, setAntecedentes] = useState('')
  const [antecedentesTocados, setAntecedentesTocados] = useState(false)
  const [conclusiones, setConclusiones] = useState('')
  const [recomendaciones, setRecomendaciones] = useState('')
  const [valida, setValida] = useState('Wilmer')
  const [cargoValida, setCargoValida] = useState('Supervisor de maquinaria')
  const [recibe, setRecibe] = useState('')
  const [cargoRecibe, setCargoRecibe] = useState('Responsable del equipo')
  const [armandoTecnico, setArmandoTecnico] = useState(false)

  const armarInforme = async () => {
    setArmandoInforme(true)
    try {
      const maquina = (maquinas ?? []).find((m) => String(m.id) === maquinaInforme) ?? null
      const dentroDelAlcance = (data ?? []).filter((m) => {
        if (alcanceInforme === 'MAQUINA') return String(m.maquina_id) === maquinaInforme
        if (rangoInforme.desde && m.fecha < rangoInforme.desde) return false
        if (rangoInforme.hasta && m.fecha > rangoInforme.hasta) return false
        return true
      })

      const alcance =
        alcanceInforme === 'MAQUINA'
          ? `Máquina ${maquina ? `${maquina.codigo} · ${maquina.nombre}` : maquinaInforme}`
          : rangoInforme.desde || rangoInforme.hasta
            ? `Del ${rangoInforme.desde ? fecha(rangoInforme.desde) : 'inicio'} al ${rangoInforme.hasta ? fecha(rangoInforme.hasta) : 'hoy'}`
            : `Las ${dentroDelAlcance.length} órdenes más recientes`

      // Los repuestos de verdad —con artículo y costo—, de un solo viaje para
      // todas las órdenes del alcance: una consulta, no una por orden.
      const repuestos = await repuestosDeOrdenes(dentroDelAlcance.map((m) => m.id))
      const repuestosPorOrden = new Map<number, typeof repuestos>()
      for (const r of repuestos) {
        const lista = repuestosPorOrden.get(r.mantenimiento_id) ?? []
        lista.push(r)
        repuestosPorOrden.set(r.mantenimiento_id, lista)
      }

      const ordenes: OrdenDelInforme[] = dentroDelAlcance.map((m) => {
        const maquinaDeLaOrden = (maquinas ?? []).find((x) => x.id === m.maquina_id) ?? null
        return {
          numero: m.numero,
          maquinaCodigo: m.maquina_codigo,
          maquina: m.maquina,
          marca: maquinaDeLaOrden?.marca ?? null,
          modelo: maquinaDeLaOrden?.modelo ?? null,
          serial: maquinaDeLaOrden?.serial ?? null,
          tipo: ETIQUETA_TIPO[m.tipo] ?? m.tipo,
          estado: ETIQUETA_ESTADO_ORDEN[m.estado] ?? m.estado,
          fecha: m.fecha,
          fechaSalida: m.fecha_salida,
          dias: m.dias,
          taller: m.taller,
          tecnico: m.tecnico,
          origenTecnico: m.origen_tecnico,
          motivo: m.motivo,
          detalle: m.detalle,
          costoManoObra: m.costo_usd !== null ? Number(m.costo_usd) : null,
          costoRepuestos: Number(m.costo_repuestos_usd),
          costoTotal: Number(m.costo_total_usd),
          repuestosDetalle: (repuestosPorOrden.get(m.id) ?? []).map((r) => ({
            cantidad: Number(r.cantidad),
            articulo: r.articulo,
            unidad: r.unidad,
            costo: Number(r.costo_usd),
          })),
          horometro: m.horometro !== null ? Number(m.horometro) : null,
          intervaloHoras: m.intervalo_horas !== null ? Number(m.intervalo_horas) : null,
          intervenciones: m.intervenciones ?? [],
          averiaNumero: m.averia_numero,
        }
      })

      setInforme(
        await armarInformeMantenimiento({
          ordenes,
          alcance,
          emitidoPor: yo?.nombre ?? '',
          momento: new Date(),
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        }),
      )
      setPidiendoInforme(false)
    } finally {
      setArmandoInforme(false)
    }
  }

  /** La maquina elegida para el informe tecnico, con su ficha completa. */
  const equipoTecnico = (maquinas ?? []).find((m) => String(m.id) === maquinaTecnico) ?? null

  const periodoTecnico =
    rangoTecnico.desde || rangoTecnico.hasta
      ? `del ${rangoTecnico.desde ? fecha(rangoTecnico.desde) : 'inicio'} al ${
          rangoTecnico.hasta ? fecha(rangoTecnico.hasta) : 'hoy'
        }`
      : 'todo su historial'

  /*
    LO QUE ENTRA AL INFORME.

    Las ANULADAS quedan fuera, y no es un filtro de comodidad: una orden
    anulada es una que no ocurrio, y sus costos ya se revirtieron. Dejarla
    sumaria al total un dinero que nadie gasto, en el papel que justamente se
    saca para decir cuanto se gasto.
  */
  const ordenesDelTecnico = useMemo(
    () =>
      !equipoTecnico
        ? []
        : (data ?? [])
            .filter((m) => m.maquina_id === equipoTecnico.id && m.estado !== 'ANULADO')
            .filter((m) => {
              if (rangoTecnico.desde && m.fecha < rangoTecnico.desde) return false
              if (rangoTecnico.hasta && m.fecha > rangoTecnico.hasta) return false
              return true
            }),
    [data, equipoTecnico, rangoTecnico.desde, rangoTecnico.hasta],
  )

  const intervencionesTecnico: IntervencionDelInforme[] = useMemo(
    () =>
      ordenesDelTecnico.map((m) => ({
        numero: m.numero,
        fecha: m.fecha,
        fechaSalida: m.fecha_salida,
        tipo: ETIQUETA_TIPO[m.tipo] ?? m.tipo,
        estado: ETIQUETA_ESTADO_ORDEN[m.estado] ?? m.estado,
        taller: m.taller,
        tecnico: m.tecnico,
        origenTecnico: m.origen_tecnico,
        motivo: m.motivo,
        detalle: m.detalle,
        horometro: m.horometro !== null ? Number(m.horometro) : null,
        costoManoObra: m.costo_usd !== null ? Number(m.costo_usd) : null,
        costoRepuestos: Number(m.costo_repuestos_usd),
        repuestos: [],
      })),
    [ordenesDelTecnico],
  )

  const equipoDelInforme: EquipoDelInforme | null = equipoTecnico
    ? {
        codigo: equipoTecnico.codigo,
        nombre: equipoTecnico.nombre,
        clase: equipoTecnico.clase ? (ETIQUETA_CLASE[equipoTecnico.clase] ?? null) : null,
        tipo: equipoTecnico.tipo,
        marca: equipoTecnico.marca,
        modelo: equipoTecnico.modelo,
        serial: equipoTecnico.serial,
        anio: equipoTecnico.anio,
        propietario: equipoTecnico.propietario ?? null,
        estado: ETIQUETA_ESTADO[equipoTecnico.estado] ?? equipoTecnico.estado,
        operador: equipoTecnico.operador ?? null,
        ubicacion: equipoTecnico.almacen,
        horometro:
          equipoTecnico.horometro_actual !== null ? Number(equipoTecnico.horometro_actual) : null,
        horasDesdeMantenimiento: Number(equipoTecnico.horas_desde_mant),
        topeHoras: Number(equipoTecnico.tope_horas_efectivo),
        ultimoMantenimiento: equipoTecnico.ultimo_mantenimiento,
      }
    : null

  const totalTecnico = totalesDelInforme(intervencionesTecnico)

  /*
    LOS ANTECEDENTES SE REESCRIBEN MIENTRAS NADIE LOS HAYA TOCADO.

    Cambiar la maquina o el periodo cambia lo que el parrafo cuenta, asi que
    dejar el anterior seria dejar un texto que habla de otro equipo. Pero en
    cuanto alguien escribe en el campo, el sistema deja de pisarlo: lo escrito
    a mano vale mas que lo que propone el sistema, siempre.
  */
  useEffect(() => {
    if (!pidiendoTecnico || antecedentesTocados || !equipoDelInforme) return
    setAntecedentes(antecedentesPropuestos(equipoDelInforme, intervencionesTecnico, periodoTecnico))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pidiendoTecnico, antecedentesTocados, maquinaTecnico, rangoTecnico.desde, rangoTecnico.hasta])

  const armarTecnico = async () => {
    if (!equipoDelInforme) return
    setArmandoTecnico(true)
    try {
      // Los repuestos de verdad --con articulo y costo--, de un solo viaje para
      // todas las ordenes del informe.
      const repuestos = await repuestosDeOrdenes(ordenesDelTecnico.map((m) => m.id))
      const porOrden = new Map<number, IntervencionDelInforme['repuestos']>()
      for (const r of repuestos) {
        const lista = porOrden.get(r.mantenimiento_id) ?? []
        lista.push({
          cantidad: Number(r.cantidad),
          articulo: r.articulo,
          unidad: r.unidad,
          costo: Number(r.costo_usd),
        })
        porOrden.set(r.mantenimiento_id, lista)
      }

      setInforme(
        await armarInformeTecnico({
          equipo: equipoDelInforme,
          intervenciones: intervencionesTecnico.map((i, indice) => ({
            ...i,
            repuestos: porOrden.get(ordenesDelTecnico[indice].id) ?? [],
          })),
          periodo: periodoTecnico,
          antecedentes: antecedentes.trim(),
          conclusiones: conclusiones.trim(),
          recomendaciones: recomendaciones
            .split('\n')
            .map((r) => r.trim())
            .filter((r) => r !== ''),
          valida: { nombre: valida.trim(), cargo: cargoValida.trim() },
          recibe: { nombre: recibe.trim(), cargo: cargoRecibe.trim() },
          emitidoPor: yo?.nombre ?? '',
          momento: new Date(),
          empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        }),
      )
      setPidiendoTecnico(false)
    } finally {
      setArmandoTecnico(false)
    }
  }

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    const orden: Record<EstadoOrden, number> = { ABIERTO: 0, CERRADO: 1, ANULADO: 2 }

    return (data ?? [])
      .filter((m) => {
        if (estado && m.estado !== estado) return false
        if (!texto) return true
        return (
          m.maquina.toLowerCase().includes(texto) ||
          m.maquina_codigo.toLowerCase().includes(texto) ||
          (m.numero ?? '').toLowerCase().includes(texto) ||
          (m.detalle ?? '').toLowerCase().includes(texto) ||
          (m.motivo ?? '').toLowerCase().includes(texto)
        )
      })
      .sort((a, b) => orden[a.estado] - orden[b.estado] || b.fecha.localeCompare(a.fecha))
  }, [data, busqueda, estado])

  const abiertas = (data ?? []).filter((m) => m.estado === 'ABIERTO')
  const gasto = filtradas
    .filter((m) => m.estado === 'CERRADO')
    .reduce((s, m) => s + Number(m.costo_total_usd), 0)

  return (
    <>
      <PageHeader
        title="Historial de taller"
        description="Órdenes de mantenimiento: ingreso, duración, trabajo realizado y costo. Las órdenes abiertas corresponden a máquinas paradas."
        actions={
          <>
            <Button
              variant="outline"
              icon={<FileSignature />}
              disabled={!data || data.length === 0}
              onClick={() => setPidiendoTecnico(true)}
            >
              Informe técnico
            </Button>
            <Button
              variant="outline"
              icon={<FileText />}
              disabled={!data || data.length === 0}
              onClick={() => setPidiendoInforme(true)}
            >
              Informe
            </Button>
          </>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {abiertas.length > 0 ? (
        <div className="border-warning/30 bg-warning-soft mb-4 flex items-start gap-2.5 rounded-[6px] border p-3.5">
          <Wrench className="text-warning mt-px size-[18px] shrink-0" />
          <p className="text-ink/80 text-sm">
            <strong className="font-semibold">
              {abiertas.length} máquina{abiertas.length === 1 ? '' : 's'} en el taller
            </strong>
            {abiertas.some((m) => m.dias !== null && m.dias_estimados !== null && m.dias > m.dias_estimados)
              ? ', alguna lleva más días de los previstos.'
              : '.'}
          </p>
        </div>
      ) : null}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
          <Input
            label="Buscar"
            icon={<Search />}
            placeholder="Máquina, número de orden o qué se le hizo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <Select
            label="Estado"
            vacio="Todas"
            value={estado}
            onChange={(e) => setEstado(e.target.value as '' | EstadoOrden)}
            opciones={[
              { valor: 'ABIERTO', etiqueta: 'Abiertas' },
              { valor: 'CERRADO', etiqueta: 'Terminadas' },
              { valor: 'ANULADO', etiqueta: 'Anuladas' },
            ]}
          />
        </div>
      </Card>

      {!isPending && !error && filtradas.length === 0 ? (
        <Card>
          <Vacio
            icono={<Wrench />}
            titulo={
              (data ?? []).length === 0 ? 'Sin órdenes de mantenimiento' : 'Sin resultados'
            }
            descripcion={
              (data ?? []).length === 0
                ? 'Las órdenes abiertas desde la ficha de cada máquina aparecen aquí con su trabajo realizado y su costo.'
                : undefined
            }
          />
        </Card>
      ) : null}

      {filtradas.length > 0 ? (
        <Card flush>
          <div className="border-hairline flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
            <p className="text-ink/60 text-sm">
              {filtradas.length} orden{filtradas.length === 1 ? '' : 'es'}
            </p>
            {gasto > 0 ? (
              <p className="text-ink/80 text-sm">
                Costo de lo terminado:{' '}
                <span className="tabular font-semibold">{dolares(gasto)}</span>
              </p>
            ) : null}
          </div>

          <ul className="divide-hairline divide-y">
            {filtradas.map((m) => {
              const tarde =
                m.estado === 'ABIERTO' &&
                m.dias !== null &&
                m.dias_estimados !== null &&
                m.dias > m.dias_estimados

              return (
                <li key={m.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-ink/85 font-mono text-sm">{m.maquina_codigo}</span>
                    <span className="text-ink/70 text-sm">{m.maquina}</span>

                    <Chip
                      tone={
                        m.estado === 'ABIERTO'
                          ? 'warning'
                          : m.estado === 'ANULADO'
                            ? 'neutral'
                            : 'success'
                      }
                    >
                      {m.estado === 'ABIERTO'
                        ? 'Abierta'
                        : m.estado === 'ANULADO'
                          ? 'Anulada'
                          : 'Terminada'}
                    </Chip>
                    <Chip
                      tone={
                        m.tipo === 'MANTENIMIENTO'
                          ? 'warning'
                          : m.tipo === 'REPARACION'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {m.tipo === 'MANTENIMIENTO'
                        ? 'Mantenimiento'
                        : m.tipo === 'REPARACION'
                          ? 'Reparación'
                          : 'Servicio'}
                    </Chip>

                    {m.numero ? (
                      <span className="text-ink/40 text-2xs font-mono">{m.numero}</span>
                    ) : null}

                    {Number(m.costo_total_usd) > 0 ? (
                      <span className="tabular text-ink/80 ml-auto text-sm font-semibold">
                        {dolares(m.costo_total_usd)}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-ink/45 mt-1 text-xs">
                    Entró el {fecha(m.fecha)}
                    {m.fecha_salida ? ` · salió el ${fecha(m.fecha_salida)}` : ''}
                    {m.dias !== null ? (
                      <span className={cn(tarde && 'text-warning font-medium')}>
                        {' '}
                        · {m.dias} día{m.dias === 1 ? '' : 's'}
                        {tarde ? ` (se estimaron ${m.dias_estimados})` : ''}
                      </span>
                    ) : null}
                    {m.taller ? ` · ${m.taller}` : ''}
                    {m.horometro ? ` · ${enteros(Number(m.horometro))} h` : ''}
                    {m.repuestos > 0
                      ? ` · ${m.repuestos} repuesto${m.repuestos === 1 ? '' : 's'} por ${dolares(m.costo_repuestos_usd)}`
                      : ''}
                    {m.tecnico
                      ? ` · hecho por ${m.tecnico}${m.origen_tecnico === 'EXTERNO' ? ' (externo)' : ''}`
                      : ''}
                    {m.intervenciones.length > 0
                      ? ` · ${m.intervenciones
                          .map((i) => TIPOS_INTERVENCION.find((t) => t.valor === i)?.etiqueta ?? i)
                          .join(', ')}`
                      : ''}
                    {m.intervalo_horas
                      ? ` · próximo a las ${enteros(Number(m.intervalo_horas))} h`
                      : ''}
                    {m.averia_numero ? ` · atiende ${m.averia_numero}` : ''}
                  </p>

                  {/* Al abrir se dice por qué entra; al cerrar, qué se le hizo.
                      Se enseñan los dos porque no dicen lo mismo: uno es el
                      síntoma y el otro la reparación. */}
                  {m.motivo ? (
                    <p className="text-ink/60 mt-2 text-sm leading-relaxed">
                      <span className="text-ink/40">Motivo:</span> {m.motivo}
                    </p>
                  ) : null}
                  {m.detalle ? (
                    <p className="text-ink/75 mt-1 text-sm leading-relaxed">{m.detalle}</p>
                  ) : null}
                  {m.motivo_anulacion ? (
                    <p className="text-ink/50 mt-1 text-sm italic">
                      Anulada: {m.motivo_anulacion}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {pidiendoInforme ? (
        <Modal
          abierto
          onCerrar={() => setPidiendoInforme(false)}
          titulo="Informe de mantenimiento"
          descripcion="Por una máquina —todo su historial— o por un rango de fechas, para todas las máquinas."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setPidiendoInforme(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  armandoInforme || (alcanceInforme === 'MAQUINA' && !maquinaInforme)
                }
                onClick={() => void armarInforme()}
              >
                {armandoInforme ? 'Armando…' : 'Generar'}
              </Button>
            </>
          }
        >
          <Select
            label="Alcance"
            value={alcanceInforme}
            onChange={(e) => setAlcanceInforme(e.target.value as 'MAQUINA' | 'FECHAS')}
            opciones={[
              { valor: 'FECHAS', etiqueta: 'Por rango de fechas' },
              { valor: 'MAQUINA', etiqueta: 'Por una máquina' },
            ]}
          />
          {alcanceInforme === 'MAQUINA' ? (
            <div className="mt-3">
              <SelectBuscable
                label="Máquina"
                vacio="Seleccione la máquina"
                valor={maquinaInforme}
                onCambio={setMaquinaInforme}
                opciones={(maquinas ?? []).map((m) => ({
                  valor: String(m.id),
                  etiqueta: `${m.codigo} · ${m.nombre}`,
                }))}
              />
            </div>
          ) : (
            <div className="mt-3">
              <RangoDeFechas valor={rangoInforme} onCambio={setRangoInforme} />
              <p className="text-ink/50 mt-2 text-xs">
                Sin fechas, trae las {(data ?? []).length} órdenes más recientes cargadas en
                pantalla.
              </p>
            </div>
          )}
        </Modal>
      ) : null}

      {pidiendoTecnico ? (
        <Modal
          abierto
          onCerrar={() => setPidiendoTecnico(false)}
          titulo="Informe técnico y de costos"
          descripcion="De un equipo: su ficha, el historial de intervenciones con lo que costó cada una, los totales y las firmas."
          acciones={
            <>
              <Button variant="ghost" onClick={() => setPidiendoTecnico(false)}>
                Cancelar
              </Button>
              <Button
                disabled={armandoTecnico || !equipoDelInforme}
                onClick={() => void armarTecnico()}
              >
                {armandoTecnico ? 'Armando…' : 'Generar'}
              </Button>
            </>
          }
        >
          <SelectBuscable
            label="Equipo"
            vacio="Seleccione la máquina"
            valor={maquinaTecnico}
            onCambio={setMaquinaTecnico}
            opciones={(maquinas ?? []).map((m) => ({
              valor: String(m.id),
              etiqueta: `${m.codigo} · ${m.nombre}`,
            }))}
          />

          <div className="mt-3">
            <RangoDeFechas valor={rangoTecnico} onCambio={setRangoTecnico} />
          </div>

          {equipoDelInforme ? (
            <div className="border-line bg-paper-2 mt-3 rounded-[6px] border p-3">
              <p className="text-ink/70 text-xs">
                {totalTecnico.intervenciones === 0
                  ? 'Sin órdenes de taller en ese período. El informe sale igual, con la ficha del equipo y lo que usted escriba.'
                  : `${totalTecnico.intervenciones} ${
                      totalTecnico.intervenciones === 1 ? 'intervención' : 'intervenciones'
                    } · mano de obra ${dolares(totalTecnico.manoObra)} · repuestos ${dolares(
                      totalTecnico.repuestos,
                    )} · total ${dolares(totalTecnico.total)}`}
              </p>
            </div>
          ) : null}

          <div className="mt-3">
            <Textarea
              label="Antecedentes y estado operativo"
              rows={4}
              value={antecedentes}
              onChange={(e) => {
                setAntecedentes(e.target.value)
                setAntecedentesTocados(true)
              }}
            />
            <p className="text-ink/50 mt-1 text-xs">
              Lo redacta el sistema con los datos del período. Corríjalo antes de emitir: deja de
              reescribirse en cuanto usted escribe.
            </p>
          </div>

          <div className="mt-3">
            <Textarea
              label="Conclusiones técnicas"
              rows={3}
              value={conclusiones}
              onChange={(e) => setConclusiones(e.target.value)}
            />
          </div>

          <div className="mt-3">
            <Textarea
              label="Recomendaciones"
              rows={3}
              value={recomendaciones}
              onChange={(e) => setRecomendaciones(e.target.value)}
            />
            <p className="text-ink/50 mt-1 text-xs">
              Una por renglón. Salen numeradas en el informe; si lo deja vacío, esa parte no se
              imprime.
            </p>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input label="Valida" value={valida} onChange={(e) => setValida(e.target.value)} />
            <Input
              label="Cargo de quien valida"
              value={cargoValida}
              onChange={(e) => setCargoValida(e.target.value)}
            />
            <Input
              label="Recibe conforme"
              value={recibe}
              onChange={(e) => setRecibe(e.target.value)}
            />
            <Input
              label="Cargo de quien recibe"
              value={cargoRecibe}
              onChange={(e) => setCargoRecibe(e.target.value)}
            />
          </div>
        </Modal>
      ) : null}

      <Visor
        abierto={informe !== null}
        onCerrar={() => setInforme(null)}
        blob={informe?.blob ?? null}
        nombreArchivo={informe?.nombre ?? ''}
        /* Los dos papeles salen por el mismo visor; el nombre del archivo es lo
           que dice cuál de los dos se acaba de armar. */
        titulo={
          (informe?.nombre ?? '').startsWith('informe-tecnico')
            ? 'Informe técnico y de costos'
            : 'Informe de mantenimiento'
        }
      />
    </>
  )
}
