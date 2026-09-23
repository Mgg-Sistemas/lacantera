import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Visor } from '@/components/Visor'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useEmpresa } from '@/lib/api/empresa'
import {
  leerCabeceraDeNota,
  leerNotaDeSalida,
  motivoParaLaNota,
  paraQuienSalio,
  useGruposDeSalida,
  type Movimiento,
} from '@/lib/api/inventario'
import { densidadesDeArticulos, leerPerfiles } from '@/lib/api/catalogo'
import { leerFirmasEncendidas } from '@/lib/api/firmas'
import {
  GENERAR_NOTA_ENTREGA,
  leerAsientosDeLaSalida,
  leerNotaDeEntregaDeLaSalida,
  leerOrdenDeLaNota,
  ordenEnPapel,
  useGenerarNotaDeEntrega,
  type AsientoDeLaSalida,
  type SolicitudDeSalida,
} from '@/lib/api/salidas'
import { useVehiculos } from '@/lib/api/vehiculos'
import { useMiPerfil, useMisAcciones } from '@/lib/api/usuarios'
import { supabase } from '@/lib/supabase'
import { desenvolver } from '@/lib/api/rpc'
import type { Cliente, NotaEntrega, RenglonGuardado } from '@/lib/api/ventas'
import { armarNotaDeEntrega } from '@/lib/ficha/notaDeEntregaPapel'
import { Chip } from '@/components/ui/Chip'
import { ModalNotaDeEntrega } from './ModalNotaDeEntrega'
import { ModalCamiones } from '@/pages/facturacion/CamionesDeLaNota'
import { useGuardarCamionesDeNota } from '@/lib/api/salidas'
import { armarNotaDeSalida } from '@/lib/ficha/notaDeSalidaPdf'
import type { DatosNotaDeSalida } from '@/lib/ficha/notaDeSalidaPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { fecha } from '@/lib/formato'

/*
  EL PAPEL DE UNA SALIDA, EN UN SOLO SITIO

  Lo piden tres pantallas —la consulta del módulo, las solicitudes al entregar y
  el libro de movimientos al reimprimir— y es el mismo papel. Vive aquí como
  gancho, igual que la nota del traslado, para que no haya tres versiones que se
  separen: el día que la nota cambie, cambia una vez.

  Se arma DESPUÉS de guardar y con el número que devuelve la base, no con lo que
  hay en el formulario: ese número es lo único que ata el papel al libro.
*/

const numeroLegible = (v: string | number): string =>
  Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 })

/**
 * «7 TAMBOR y 10 L», o nada cuando se contó en la unidad de operación.
 *
 * Se arma aquí y no en el PDF porque el PDF no tiene por qué saber cómo se
 * llama cada columna de la base: recibe una frase y la imprime.
 */
function contadoLegible(l: {
  cantidad_capturada: string | null
  unidad_capturada: string | null
  suelto_capturado: string | null
  unidad: string
}): string | null {
  if (!l.cantidad_capturada || !l.unidad_capturada) return null
  const bultos = `${numeroLegible(l.cantidad_capturada)} ${l.unidad_capturada}`
  return Number(l.suelto_capturado)
    ? `${bultos} y ${numeroLegible(l.suelto_capturado ?? 0)} ${l.unidad}`
    : bultos
}

/*
  LO QUE EL PAPEL DICE DE QUIÉN SE LO LLEVA.

  Sale de la solicitud, y el vehículo puede venir de dos sitios: de la lista
  —`vehiculo_id`, y entonces se enseña la placa con su descripción— o escrito a
  mano cuando no estaba cargado. Se prefiere la lista: es el dato bueno.

  Devuelve los campos ya en la forma que espera el PDF, para que las tres ramas
  que arman una nota no repitan la misma traducción de tres maneras.
*/
function comoSeLoLlevan(
  s: { vehiculo_id: number | null; vehiculo: string | null; recibio_nombre: string | null; recibio_cedula: string | null; lleva_recibido_conforme: boolean } | null | undefined,
  vehiculos: Array<{ id: number; placa: string; descripcion: string | null }> | undefined,
) {
  if (!s) return {}
  const dela = s.vehiculo_id ? vehiculos?.find((v) => v.id === s.vehiculo_id) : null
  return {
    vehiculo: dela
      ? `${dela.placa}${dela.descripcion ? ` · ${dela.descripcion}` : ''}`
      : (s.vehiculo ?? null),
    recibio: s.recibio_nombre,
    recibioCedula: s.recibio_cedula,
    llevaRecibidoConforme: s.lleva_recibido_conforme,
  }
}

export function useNotaDeSalida(): {
  /** Arma y enseña la nota de ese número. El motivo es el relato de la salida. */
  abrir: (numero: string, motivo: string) => Promise<void>
  /** Arma y enseña la orden de salida de esa solicitud, en el estado en que esté. */
  abrirOrden: (s: SolicitudDeSalida) => Promise<void>
  /**
   * Desde un asiento del libro: la nota entera si tiene número, o ese renglón
   * solo si es de antes de que las notas se numeraran.
   */
  abrirMovimiento: (m: Movimiento) => Promise<void>
  /** El asiento cuyo papel se está armando, para decir «Armando…» en su fila. */
  armando: number | null
  visor: ReactNode
} {
  const { data: empresa } = useEmpresa()
  const grupos = useGruposDeSalida()
  const qc = useQueryClient()

  /*
    LOS NOMBRES Y LAS FIRMAS, TRAÍDOS AL ARMAR.

    Se piden aquí y no se toman de lo que la pantalla tenga cargado: la nota se
    abre justo después de entregar, y si la lista de firmas todavía viene en
    camino el papel saldría sin la de quien autorizó, que es la que debe ir.
    React-query la comparte con el resto de pantallas por la clave.
  */
  const nombresYFirmas = async () => {
    const [perfiles, firmas] = await Promise.all([
      qc.fetchQuery({ queryKey: ['perfiles'], queryFn: leerPerfiles, staleTime: 5 * 60_000 }),
      qc.fetchQuery({ queryKey: ['firmas'], queryFn: leerFirmasEncendidas, staleTime: 5 * 60_000 }),
    ])
    const nombreDe = (uid: string | null) =>
      (uid && perfiles.find((p) => p.id === uid)?.nombre) || null
    return { nombreDe, firmas: firmas.porPerfil }
  }

  const [nota, setNota] = useState<ArchivoArmado | null>(null)
  const [datos, setDatos] = useState<DatosNotaDeSalida | null>(null)
  // Por defecto sin cifras: la nota es lo que firma quien recibe el material.
  const [conCostos, setConCostos] = useState(false)
  const [rehaciendo, setRehaciendo] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [armando, setArmando] = useState<number | null>(null)

  /*
    LA NOTA DE ENTREGA QUE PUEDE DEJAR ESTA SALIDA.

    Christopher, 21/09/2026: «esto debe aparecer al momento de imprimir la nota
    de salida, debe colocarse en negrita. Esto es porque no todas las notas de
    salida generarán una nota de entrega». Por eso vive aquí, en el visor, y no
    en el formulario de la salida: se decide con el papel delante.

    Solo para lo que salió hacia FUERA —a un área de la empresa no hay a quién
    entregarle nada— y solo para quien tenga la casilla, que se presta desde
    Permisos extendidos. Si la salida ya dejó su nota, en vez de preguntar otra
    vez se ofrece verla: las dos se imprimen en cualquier momento.
  */
  const { data: yo } = useMiPerfil()
  const { puede: casillaDe } = useMisAcciones()
  const generar = useGenerarNotaDeEntrega()
  const guardarCamiones = useGuardarCamionesDeNota()
  const [camionesDe, setCamionesDe] = useState<NotaEntrega | null>(null)
  const [haciaFuera, setHaciaFuera] = useState<{ numero: string; destino: string } | null>(null)
  // Para traducir el id del vehículo a su placa en el papel.
  const { data: vehiculos } = useVehiculos(false)
  const [deEntrega, setDeEntrega] = useState<NotaEntrega | null>(null)
  const [asientos, setAsientos] = useState<AsientoDeLaSalida[] | null>(null)
  const [papelDeEntrega, setPapelDeEntrega] = useState<ArchivoArmado | null>(null)
  const [armandoEntrega, setArmandoEntrega] = useState(false)
  /*
    Leer los asientos tarda, y la casilla se puede desmarcar antes de que
    lleguen. Sin este turno, la respuesta vieja volvería a marcarla sola y
    abriría el cuadro que la persona acababa de descartar.
  */
  const turnoDeAsientos = useRef(0)

  const verLaDeEntrega = async (n: NotaEntrega) => {
    setArmandoEntrega(true)
    try {
      const [renglones, clientes] = await Promise.all([
        supabase.from('nota_entrega_renglones').select('*').eq('nota_id', n.id).order('linea'),
        supabase.from('v_clientes').select('*').eq('id', n.cliente_id ?? -1).limit(1),
      ])
      setPapelDeEntrega(
        await armarNotaDeEntrega({
          nota: n,
          renglones: desenvolver<RenglonGuardado[]>(renglones),
          cliente: desenvolver<Cliente[]>(clientes)[0] ?? null,
          empresa,
          emitidoPor: yo?.nombre ?? '',
        }),
      )
    } catch (e) {
      setFallo(
        `La nota ${n.numero} existe, pero no se pudo armar su papel. Búscala en Facturación › Notas de entrega.`,
      )
      console.error(e)
    } finally {
      setArmandoEntrega(false)
    }
  }

  const abrir = async (numero: string, motivo: string) => {
    try {
      /*
        La nota entera, releída de la base por su número: el costo promedio y el
        valor de cada renglón los calcula la base al mover, y son justo las
        cifras que quedan en el papel que alguien firma.
      */
      const [lineas, cabecera, laOrden, { nombreDe, firmas }] = await Promise.all([
        leerNotaDeSalida(numero),
        leerCabeceraDeNota(numero),
        // Quien reimprime sin permiso de Salidas no la ve: la nota sale sin orden.
        leerOrdenDeLaNota(numero).catch(() => null),
        nombresYFirmas(),
      ])
      if (lineas.length === 0) return

      // Si salió hacia fuera, se mira si ya dejó su nota de entrega. Que esto
      // falle no debe impedir imprimir la de salida.
      const destino = cabecera.para.destino_externo
      setHaciaFuera(destino ? { numero, destino } : null)
      setDeEntrega(destino ? await leerNotaDeEntregaDeLaSalida(numero).catch(() => null) : null)

      // La otra medida, solo en lo que tiene densidad: ver `lib/medidas.ts`.
      const densidades = await densidadesDeArticulos({
        codigos: lineas.map((l) => l.articulo_codigo),
      })
      const densidadDe = (codigo: string) =>
        densidades.find((a) => a.codigo === codigo)?.densidad_ton_m3 ?? null

      const armados: DatosNotaDeSalida = {
        tipo: 'NOTA',
        orden: laOrden ? ordenEnPapel(laOrden, nombreDe, firmas) : null,
        conCostos,
        numero,
        fecha: fecha(lineas[0].fecha),
        almacen: lineas[0].almacen,
        clase: cabecera.motivo,
        paraQuien: paraQuienSalio(cabecera.para, grupos.data),
        ...comoSeLoLlevan(laOrden, vehiculos),
        motivo,
        renglones: lineas.map((l) => ({
          articuloCodigo: l.articulo_codigo,
          articulo: l.articulo,
          cantidad: l.cantidad,
          unidad: l.unidad,
          contado: contadoLegible(l),
          densidad: densidadDe(l.articulo_codigo),
          costoUnitarioUsd: l.costo_usd,
          valorUsd: l.valor_usd,
          almacen: l.almacen,
        })),
        empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        momento: new Date(),
      }
      setDatos(armados)
      setNota(await armarNotaDeSalida(armados))
    } catch (e) {
      /*
        Si el papel no se puede armar, la salida sigue estando bien hecha: se
        reimprime desde el libro. Tragarse el error aquí es peor que decirlo —
        el operador creería que no se guardó y volvería a sacar el material.
      */
      setFallo(
        `La salida ${numero} quedó registrada, pero no se pudo armar el papel. Búscala en Movimientos y pulsa «Nota».`,
      )
      console.error(e)
    }
  }

  /*
    LA ORDEN, EN CUALQUIER ESTADO.

    Christopher eligió que la solicitud se pueda imprimir como «Orden de salida»
    antes de entregarse —por aprobar, aprobada, no aprobada o cancelada—, con su
    estado a la vista. Lleva lo que se pidió, no lo que salió: eso lo dice la
    nota. Sin costos, porque todavía no ha salido nada que costar.
  */
  const abrirOrden = async (s: SolicitudDeSalida) => {
    try {
      const renglones = s.renglones ?? []
      const [densidades, { nombreDe, firmas }] = await Promise.all([
        densidadesDeArticulos({ ids: renglones.map((r) => r.articulo_id) }),
        nombresYFirmas(),
      ])

      const armados: DatosNotaDeSalida = {
        tipo: 'ORDEN',
        orden: ordenEnPapel(s, nombreDe, firmas),
        conCostos: false,
        numero: s.numero,
        fecha: fecha(s.pedida_en),
        almacen: s.almacen?.nombre ?? '',
        clase: '',
        paraQuien: paraQuienSalio(s, grupos.data),
        ...comoSeLoLlevan(s, vehiculos),
        motivo: s.motivo,
        renglones: renglones.map((r) => ({
          articuloCodigo: r.articulo?.codigo ?? '',
          articulo: r.propietario ? `${r.articulo?.nombre ?? '—'} · de ${r.propietario}` : (r.articulo?.nombre ?? '—'),
          cantidad: r.cantidad,
          unidad: r.articulo?.unidad ?? '',
          contado: r.presentaciones
            ? `${numeroLegible(r.presentaciones)} ${r.presentacion ?? ''}${Number(r.suelto) ? ` y ${numeroLegible(r.suelto ?? 0)} ${r.articulo?.unidad ?? ''}` : ''}`.trim()
            : null,
          densidad: densidades.find((a) => a.id === r.articulo_id)?.densidad_ton_m3 ?? null,
        })),
        empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        momento: new Date(),
      }
      setDatos(armados)
      setNota(await armarNotaDeSalida(armados))
    } catch (e) {
      setFallo(`No se pudo armar la orden ${s.numero}. Vuelve a intentarlo; la solicitud no cambió.`)
      console.error(e)
    }
  }

  /*
    DESDE EL LIBRO, Y DESDE EL HISTORIAL.

    Vivía en el libro de movimientos, copiado, y el historial de Salidas no tenía
    papel: Christopher, 16/09/2026, «aquí no hay pdf tampoco, y se necesita». Se
    trajo aquí para que las tres pantallas armen la misma nota.

    LOS MOVIMIENTOS VIEJOS NO TIENEN NÚMERO DE NOTA. En vez de negarles el papel,
    se les arma una nota de un renglón con el número del propio movimiento: la
    forma es la misma, y lo único que cambia es que no agrupa.
  */
  const abrirMovimiento = async (m: Movimiento) => {
    setArmando(m.id)
    try {
      if (m.nota_salida) {
        await abrir(m.nota_salida, m.nota ?? '')
        return
      }
      const densidades = await densidadesDeArticulos({ codigos: [m.articulo?.codigo ?? ''] })
      const armados: DatosNotaDeSalida = {
        tipo: 'NOTA',
        orden: null,
        conCostos,
        numero: m.numero,
        fecha: fecha(m.fecha),
        almacen: m.almacen?.nombre ?? '',
        clase: motivoParaLaNota(m),
        paraQuien: paraQuienSalio(m, grupos.data),
        motivo: m.nota,
        renglones: [
          {
            articuloCodigo: m.articulo?.codigo ?? '',
            articulo: m.articulo?.nombre ?? '',
            cantidad: m.cantidad,
            unidad: m.unidad,
            costoUnitarioUsd: m.costo_usd,
            valorUsd: m.valor_usd,
            densidad: densidades[0]?.densidad_ton_m3 ?? null,
          },
        ],
        empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        momento: new Date(),
      }
      setDatos(armados)
      setNota(await armarNotaDeSalida(armados))
    } catch (e) {
      setFallo(`No se pudo armar la nota de ${m.numero}. Vuelve a intentarlo; el movimiento no cambió.`)
      console.error(e)
    } finally {
      setArmando(null)
    }
  }

  const visor = (
    <>
      <Visor
        abierto={nota !== null}
        onCerrar={() => {
          /*
            Escape lo oyen todas las ventanas abiertas a la vez. Con el cuadro de
            la nota de entrega —o su papel— encima, esa tecla es para lo de
            encima: esta se queda como estaba.
          */
          if (asientos !== null || papelDeEntrega !== null) return
          turnoDeAsientos.current++
          setNota(null)
          setDatos(null)
          setHaciaFuera(null)
          setDeEntrega(null)
        }}
        blob={nota?.blob ?? null}
        nombreArchivo={nota?.nombre ?? 'nota-salida.pdf'}
        titulo={datos?.tipo === 'ORDEN' ? 'Orden de salida' : 'Nota de salida'}
        descripcion={
          datos?.tipo === 'ORDEN'
            ? 'Lo que se solicitó y en qué estado está. Lo que de verdad sale lo dice la nota, al entregar.'
            : 'Compruébala antes de imprimirla: es lo que va a firmar quien recibe el material.'
        }
        /*
          La casilla rehace el papel sin cerrarlo, igual que el selector de
          moneda de los otros documentos. Se decide con la nota delante, que es
          como se decide de verdad si esas cifras deben ir o no. La orden no la
          lleva: todavía no ha salido nada que costar.
        */
        casilla={
          datos && datos.tipo !== 'ORDEN'
            ? {
                etiqueta: 'Incluir costos',
                marcada: conCostos,
                rehaciendo,
                onCambiar: async (marcada: boolean) => {
                  setConCostos(marcada)
                  setRehaciendo(true)
                  try {
                    setNota(await armarNotaDeSalida({ ...datos, conCostos: marcada }))
                  } finally {
                    setRehaciendo(false)
                  }
                },
              }
            : undefined
        }
        extra={
          datos?.tipo === 'NOTA' && haciaFuera ? (
            deEntrega ? (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink/85 font-bold">
                  Dejó la nota de entrega {deEntrega.numero}
                </span>
                {deEntrega.estado === 'PENDIENTE' ? <Chip tone="warning">Pendiente</Chip> : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={armandoEntrega}
                  onClick={() => void verLaDeEntrega(deEntrega)}
                >
                  {armandoEntrega ? 'Armando…' : 'Verla'}
                </Button>
                {deEntrega.estado !== 'ANULADA' && casillaDe(GENERAR_NOTA_ENTREGA) ? (
                  <Button size="sm" variant="outline" onClick={() => setCamionesDe(deEntrega)}>
                    Camiones{deEntrega.camiones?.length ? ` (${deEntrega.camiones.length})` : ''}
                  </Button>
                ) : null}
              </span>
            ) : casillaDe(GENERAR_NOTA_ENTREGA) ? (
              <label className="text-ink/90 flex cursor-pointer items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  className="accent-royal-600 size-4 shrink-0"
                  checked={asientos !== null}
                  onChange={(e) => {
                    const turno = ++turnoDeAsientos.current
                    if (!e.target.checked) return setAsientos(null)
                    generar.reset()
                    void leerAsientosDeLaSalida(haciaFuera.numero)
                      .then((leidos) => {
                        if (turnoDeAsientos.current === turno) setAsientos(leidos)
                      })
                      .catch(() => {
                        if (turnoDeAsientos.current === turno)
                          setFallo('No se pudo leer lo que sacó esa salida. Vuelve a intentarlo.')
                      })
                  }}
                />
                Generar nota de entrega
              </label>
            ) : null
          ) : null
        }
      />

      {asientos !== null && haciaFuera ? (
        <ModalNotaDeEntrega
          modo="generar"
          titulo={`Nota de entrega de ${haciaFuera.numero}`}
          destino={haciaFuera.destino}
          lineas={asientos}
          guardando={generar.isPending || guardarCamiones.isPending}
          error={generar.error ?? guardarCamiones.error}
          onCerrar={() => {
            turnoDeAsientos.current++
            setAsientos(null)
          }}
          onGuardar={(resp) =>
            void generar
              .mutateAsync({
                nota_salida: haciaFuera.numero,
                cliente_id: resp.cliente_id,
                precios: resp.precios.map((x) => ({ movimiento_id: x.id, precio: x.precio })),
                facturable: resp.facturable,
              })
              // La nota ya existe; los camiones se le ponen con su número. Si
              // esto falla, la nota queda y el error se ve en el mismo cuadro.
              .then((id) =>
                resp.camiones.length > 0
                  ? guardarCamiones.mutateAsync({ nota_id: id, camiones: resp.camiones })
                  : undefined,
              )
              .then(async () => {
                setAsientos(null)
                const hecha = await leerNotaDeEntregaDeLaSalida(haciaFuera.numero)
                setDeEntrega(hecha)
                if (hecha) await verLaDeEntrega(hecha)
              })
              .catch(() => {})
          }
        />
      ) : null}

      {camionesDe ? (
        <ModalCamiones
          notaId={camionesDe.id}
          numero={camionesDe.numero}
          camiones={camionesDe.camiones ?? []}
          onCerrar={async () => {
            setCamionesDe(null)
            // Se relee: el papel debe salir con los camiones recién puestos.
            if (haciaFuera) {
              setDeEntrega(await leerNotaDeEntregaDeLaSalida(haciaFuera.numero).catch(() => null))
            }
          }}
        />
      ) : null}

      <Visor
        abierto={papelDeEntrega !== null}
        onCerrar={() => setPapelDeEntrega(null)}
        blob={papelDeEntrega?.blob ?? null}
        nombreArchivo={papelDeEntrega?.nombre ?? 'nota-entrega.pdf'}
        titulo="Nota de entrega"
        descripcion="Es el respaldo para el archivo. Al cliente se le entrega la nota de salida."
      />

      {fallo ? (
        <Modal
          abierto
          onCerrar={() => setFallo(null)}
          titulo="No se pudo armar el papel"
          ancho="sm"
          acciones={<Button onClick={() => setFallo(null)}>Entendido</Button>}
        >
          <p className="text-ink/70 text-sm leading-relaxed">{fallo}</p>
        </Modal>
      ) : null}
    </>
  )

  return { abrir, abrirOrden, abrirMovimiento, armando, visor }
}
