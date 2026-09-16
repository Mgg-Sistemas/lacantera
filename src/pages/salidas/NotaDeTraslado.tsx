import { useState } from 'react'
import type { ReactNode } from 'react'
import { Visor } from '@/components/Visor'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { useEmpresa } from '@/lib/api/empresa'
import { ESTADO_TRASLADO, leerTraslado, leerTrasladoPorId } from '@/lib/api/inventario'
import type { TrasladoParaNota } from '@/lib/api/inventario'
import { densidadesDeArticulos } from '@/lib/api/catalogo'
import { equivalenciaEnPapel } from '@/lib/medidas'
import { armarNotaDeTraslado } from '@/lib/ficha/notaDeTrasladoPdf'
import type { DatosNotaDeTraslado } from '@/lib/ficha/notaDeTrasladoPdf'
import type { ArchivoArmado } from '@/lib/ficha/armado'
import { fecha } from '@/lib/formato'

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
      const [articulo] = await densidadesDeArticulos({ codigos: [t.articuloCodigo] })
      const d: DatosNotaDeTraslado = {
        conCostos,
        numero: t.numero,
        fecha: fecha(t.fecha),
        origen: t.origen,
        destino: t.destino,
        motivo: t.motivo,
        estado: t.estado ? ESTADO_TRASLADO[t.estado].texto : null,
        renglones: [
          {
            articuloCodigo: t.articuloCodigo,
            articulo: t.articulo,
            cantidad: t.cantidad,
            unidad: t.unidad,
            costoUnitarioUsd: t.costoUsd,
            valorUsd: t.valorUsd,
            contado: t.contado,
            equivalencia: equivalenciaEnPapel(t.cantidad, t.unidad, articulo?.densidad_ton_m3),
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
