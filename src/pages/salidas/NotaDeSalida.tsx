import { useState } from 'react'
import type { ReactNode } from 'react'
import { Visor } from '@/components/Visor'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useEmpresa } from '@/lib/api/empresa'
import {
  leerCabeceraDeNota,
  leerNotaDeSalida,
  paraQuienSalio,
  useGruposDeSalida,
} from '@/lib/api/inventario'
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

export function useNotaDeSalida(): {
  /** Arma y enseña la nota de ese número. El motivo es el relato de la salida. */
  abrir: (numero: string, motivo: string) => Promise<void>
  visor: ReactNode
} {
  const { data: empresa } = useEmpresa()
  const grupos = useGruposDeSalida()

  const [nota, setNota] = useState<ArchivoArmado | null>(null)
  const [datos, setDatos] = useState<DatosNotaDeSalida | null>(null)
  // Por defecto sin cifras: la nota es lo que firma quien recibe el material.
  const [conCostos, setConCostos] = useState(false)
  const [rehaciendo, setRehaciendo] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const abrir = async (numero: string, motivo: string) => {
    try {
      /*
        La nota entera, releída de la base por su número: el costo promedio y el
        valor de cada renglón los calcula la base al mover, y son justo las
        cifras que quedan en el papel que alguien firma.
      */
      const [lineas, cabecera] = await Promise.all([
        leerNotaDeSalida(numero),
        leerCabeceraDeNota(numero),
      ])
      if (lineas.length === 0) return

      const armados: DatosNotaDeSalida = {
        conCostos,
        numero,
        fecha: fecha(lineas[0].fecha),
        almacen: lineas[0].almacen,
        clase: cabecera.motivo,
        paraQuien: paraQuienSalio(cabecera.para, grupos.data),
        motivo,
        renglones: lineas.map((l) => ({
          articuloCodigo: l.articulo_codigo,
          articulo: l.articulo,
          cantidad: l.cantidad,
          unidad: l.unidad,
          contado: contadoLegible(l),
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

  const visor = (
    <>
      <Visor
        abierto={nota !== null}
        onCerrar={() => {
          setNota(null)
          setDatos(null)
        }}
        blob={nota?.blob ?? null}
        nombreArchivo={nota?.nombre ?? 'nota-salida.pdf'}
        titulo="Nota de salida"
        descripcion="Compruébala antes de imprimirla: es lo que va a firmar quien recibe el material."
        /*
          La casilla rehace el papel sin cerrarlo, igual que el selector de
          moneda de los otros documentos. Se decide con la nota delante, que es
          como se decide de verdad si esas cifras deben ir o no.
        */
        casilla={
          datos
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
      />

      {fallo ? (
        <Modal
          abierto
          onCerrar={() => setFallo(null)}
          titulo="La salida quedó hecha, el papel no"
          ancho="sm"
          acciones={<Button onClick={() => setFallo(null)}>Entendido</Button>}
        >
          <p className="text-ink/70 text-sm leading-relaxed">{fallo}</p>
        </Modal>
      ) : null}
    </>
  )

  return { abrir, visor }
}
