import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Visor } from '@/components/Visor'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useEmpresa } from '@/lib/api/empresa'
import {
  ESTADO_TRASLADO,
  formaDelTraslado,
  leerTraslado,
  leerTrasladoPorId,
} from '@/lib/api/inventario'
import type { Traslado, TrasladoParaNota } from '@/lib/api/inventario'
import { densidadesDeArticulos } from '@/lib/api/catalogo'
import { leerFirmasEncendidas } from '@/lib/api/firmas'
import { armarNotaDeTraslado } from '@/lib/ficha/notaDeTrasladoPdf'
import type { DatosNotaDeTraslado, TrasladoEnPapel } from '@/lib/ficha/notaDeTrasladoPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { fecha, fechaHora } from '@/lib/formato'

/*
  LA NOTA DE UN TRASLADO, DESDE CUALQUIER SITIO DONDE SE VEA UNO.

  Se pide desde tres pantallas: al terminar un traslado —en Transferencias o en
  Existencias—, en la lista de Transferencias y en la línea de salida de
  Movimientos. Es un gancho y no un componente porque las tres necesitan lo
  mismo: pedir el papel, saber que se está armando para apagar su botón, y
  enseñarlo con la casilla de costos. Escrito tres veces, la casilla acabaría
  marcada por defecto en una de ellas.

  DOS PUERTAS, UN PAPEL. Transferencias conoce el traslado y lo pide por su id;
  Movimientos solo conoce el asiento y lo pide por él. Las dos acaban en la
  misma nota: `leerTraslado` reconoce si el asiento es de un traslado con número.

  POR DEFECTO SIN COSTOS, como la nota de salida: el papel lo firma quien recibe
  el material, y el costo es cuenta interna. Se marca al imprimir, con el papel
  delante.
*/
export function useNotaDeTraslado(): {
  /** Desde un asiento del libro: la salida del traslado. */
  abrir: (idSalida: number) => Promise<void>
  /** Desde el traslado mismo, por su id. */
  abrirTraslado: (id: number) => Promise<void>
  armando: number | null
  visor: ReactNode
} {
  const { data: empresa } = useEmpresa()
  const qc = useQueryClient()
  const [armando, setArmando] = useState<number | null>(null)
  const [datos, setDatos] = useState<DatosNotaDeTraslado | null>(null)
  const [pdf, setPdf] = useState<ArchivoArmado | null>(null)
  const [conCostos, setConCostos] = useState(false)
  const [rehaciendo, setRehaciendo] = useState(false)
  const [fallo, setFallo] = useState<Error | null>(null)

  const armar = async (clave: number, leer: () => Promise<TrasladoParaNota>) => {
    setArmando(clave)
    setFallo(null)
    try {
      const t = await leer()
      // Las firmas se leen al armar y no se esperan de la pantalla: la nota que
      // sale justo al enviar no puede salir sin la firma que se acaba de elegir.
      const [[articulo], firmas] = await Promise.all([
        densidadesDeArticulos({ codigos: [t.articuloCodigo] }),
        t.traslado
          ? qc.fetchQuery({ queryKey: ['firmas'], queryFn: leerFirmasEncendidas, staleTime: 5 * 60_000 })
          : null,
      ])
      const d: DatosNotaDeTraslado = {
        conCostos,
        numero: t.numero,
        fecha: fecha(t.fecha),
        origen: t.origen,
        destino: t.destino,
        motivo: t.motivo,
        estado: t.estado ? ESTADO_TRASLADO[t.estado].texto : null,
        pasos: t.traslado ? trasladoEnPapel(t.traslado, firmas?.porPerfil ?? {}) : null,
        renglones: [
          {
            articuloCodigo: t.articuloCodigo,
            articulo: t.articulo,
            cantidad: t.cantidad,
            unidad: t.unidad,
            costoUnitarioUsd: t.costoUsd,
            valorUsd: t.valorUsd,
            contado: t.contado,
            densidad: articulo?.densidad_ton_m3 ?? null,
          },
        ],
        empresa: { razonSocial: empresa?.razon_social ?? '', rif: empresa?.rif ?? '' },
        momento: new Date(),
      }
      setDatos(d)
      setPdf(await armarNotaDeTraslado(d))
    } catch (e) {
      setFallo(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setArmando(null)
    }
  }

  const abrir = (idSalida: number) => armar(idSalida, () => leerTraslado(idSalida))
  const abrirTraslado = (id: number) => armar(id, () => leerTrasladoPorId(id))

  const visor = (
    <>
      <Visor
        abierto={pdf !== null}
        onCerrar={() => {
          setPdf(null)
          setDatos(null)
        }}
        blob={pdf?.blob ?? null}
        nombreArchivo={pdf?.nombre ?? ''}
        titulo={datos ? `Nota de traslado ${datos.numero}` : 'Nota de traslado'}
        casilla={
          datos
            ? {
                etiqueta: 'Incluir costos',
                marcada: conCostos,
                rehaciendo,
                onCambiar: async (marcada) => {
                  setConCostos(marcada)
                  setRehaciendo(true)
                  try {
                    setPdf(await armarNotaDeTraslado({ ...datos, conCostos: marcada }))
                  } finally {
                    setRehaciendo(false)
                  }
                },
              }
            : null
        }
      />

      {fallo ? (
        <Modal
          abierto
          onCerrar={() => setFallo(null)}
          titulo="No se pudo armar la nota de traslado"
          ancho="sm"
          acciones={
            <Button variant="ghost" onClick={() => setFallo(null)}>
              Cerrar
            </Button>
          }
        >
          <ErrorDeCarga error={fallo} />
        </Modal>
      ) : null}
    </>
  )

  return { abrir, abrirTraslado, armando, visor }
}

/**
 * Quién hizo cada paso, para el papel.
 *
 * La imagen de cada firma solo pasa si su dueño eligió ponerla al actuar. Un
 * traslado cancelado conserva los nombres —el cuadro cuenta lo que pasó—, pero
 * ninguna firma: el papel no autoriza nada.
 */
function trasladoEnPapel(t: Traslado, firmas: Record<string, string>): TrasladoEnPapel {
  const forma = formaDelTraslado(t)
  const cancelado = t.estado === 'CANCELADA'
  const firmaDe = (elegida: boolean | null, uid: string | null) =>
    !cancelado && elegida === true && uid ? (firmas[uid] ?? null) : null

  return {
    forma:
      forma === 'PEDIR'
        ? 'Pedido: lo aprueba y envía quien responde por el origen'
        : forma === 'ENVIAR'
          ? 'Enviado sin pedido, por quien responde por el origen'
          : 'Directo: salió y llegó en el mismo momento',
    directo: forma === 'DIRECTO',
    pidio:
      forma === 'PEDIR'
        ? { nombre: t.solicitado_por_nombre, fecha: fechaHora(t.solicitado_en) }
        : null,
    envio: {
      nombre: t.aceptado_por_nombre,
      fecha: t.aceptado_en ? fechaHora(t.aceptado_en) : null,
      deRespaldo: t.aceptado_de_respaldo === true,
      firma: firmaDe(t.firma_de_quien_envia, t.aceptado_por),
    },
    recibio: {
      nombre: t.recibido_por_nombre,
      fecha: t.recibido_en ? fechaHora(t.recibido_en) : null,
      deRespaldo: t.recibido_de_respaldo === true,
      firma: firmaDe(t.firma_de_quien_recibe, t.recibido_por),
    },
    cancelo: cancelado
      ? {
          nombre: t.cancelado_por_nombre,
          fecha: t.cancelado_en ? fechaHora(t.cancelado_en) : null,
          motivo: t.motivo_cancelacion,
        }
      : null,
  }
}
