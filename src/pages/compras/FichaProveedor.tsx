import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Paperclip, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Visor } from '@/components/Visor'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { useProveedores } from '@/lib/api/catalogo'
import {
  useArticulosDeProveedor,
  usePapelesDeProveedor,
  useResumenProveedor,
} from '@/lib/api/proveedorFicha'
import { enlaceDelPapel, TIPOS_DE_PAPEL } from '@/lib/api/papelesDeCompra'
import { dolares, enteros, fecha, fechaHora } from '@/lib/formato'

/*
  LA FICHA DE UN PROVEEDOR

  La líder pidió «estadísticas sobre los proveedores: item más solicitado,
  total invertido, invertido este mes». Y Christopher, que los papeles que se
  cargan en una orden «deberá reflejarse o ligarse al dicho proveedor para
  recordar siempre el movimiento».

  Las dos cosas son la misma pantalla: la historia de lo que hemos hecho con
  esta gente. Cuánto se les ha comprado, qué se les compra, y qué papeles
  tenemos de ellos.

  Los papeles ya colgaban de la orden y la orden del proveedor. La relación
  existía; lo que faltaba era el sitio donde mirarla al revés.
*/

const NOMBRE_DEL_PAPEL = Object.fromEntries(
  TIPOS_DE_PAPEL.map((t) => [t.valor, t.etiqueta]),
) as Record<string, string>

function Cifra({
  etiqueta,
  valor,
  pie,
}: {
  etiqueta: string
  valor: string
  pie?: string
}) {
  return (
    <Card>
      <p className="text-ink/45 text-2xs font-mono tracking-[0.16em] uppercase">{etiqueta}</p>
      <p className="text-ink/90 tabular mt-3 text-2xl font-light">{valor}</p>
      {pie ? <p className="text-ink/45 mt-2 text-xs">{pie}</p> : null}
    </Card>
  )
}

export function FichaProveedor() {
  const { id } = useParams()
  const proveedorId = Number(id)

  const { data: proveedores } = useProveedores(false)
  const { data: r, isPending, error } = useResumenProveedor(proveedorId)
  const { data: articulos } = useArticulosDeProveedor(proveedorId)
  const { data: papeles } = usePapelesDeProveedor(proveedorId)

  const [viendo, setViendo] = useState<{ href: string; nombre: string } | null>(null)
  const [abriendo, setAbriendo] = useState<number | null>(null)

  const p = proveedores?.find((x) => x.id === proveedorId)

  if (isPending) return <Cargando />
  if (error) return <ErrorDeCarga error={error} />

  // Un proveedor que no existe se dice, no se deja en blanco.
  if (!r)
    return (
      <Card>
        <Vacio
          icono={<Receipt />}
          titulo="No hay ningún proveedor con ese número"
          descripcion="Puede que se haya dado de baja o que el enlace venga con un número que ya no existe."
          accion={
            <Link to="/app/compras/proveedores">
              <Button variant="outline">Ver los proveedores</Button>
            </Link>
          }
        />
      </Card>
    )

  const nunca = r.ordenes === 0

  return (
    <>
      <PageHeader
        title={r.nombre}
        description={[r.rif, p?.nombre_comercial].filter(Boolean).join(' · ')}
        actions={
          <Link to="/app/compras/proveedores">
            <Button variant="ghost" icon={<ArrowLeft />}>
              Proveedores
            </Button>
          </Link>
        }
      />

      {nunca ? (
        <Card>
          <Vacio
            icono={<Receipt />}
            titulo="Todavía no se le ha comprado nada"
            descripcion="Cuando se le apruebe la primera orden, aquí aparecerá cuánto se le lleva comprado, qué se le compra más y los papeles que haya entregado."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Cifra
              etiqueta="Total invertido"
              valor={dolares(r.invertido_usd)}
              pie={`En ${enteros(r.ordenes)} ${r.ordenes === 1 ? 'orden aprobada' : 'órdenes aprobadas'}`}
            />
            <Cifra
              etiqueta="Invertido este mes"
              valor={dolares(r.invertido_mes_usd)}
              pie={
                r.ordenes_mes === 0
                  ? 'Sin compras este mes'
                  : `${enteros(r.ordenes_mes)} ${r.ordenes_mes === 1 ? 'orden' : 'órdenes'} desde el día 1`
              }
            />
            <Cifra
              etiqueta="Lo que más se le compra"
              valor={r.articulo_frecuente ?? '—'}
              pie={`De ${enteros(r.renglones)} ${r.renglones === 1 ? 'renglón' : 'renglones'} en total`}
            />
            <Cifra
              etiqueta="Última compra"
              valor={r.ultima_compra ? fecha(r.ultima_compra.slice(0, 10)) : '—'}
              pie="Fecha de la orden más reciente"
            />
          </div>

          {/*
            Todo en dólares, y dicho.

            Un proveedor puede haber cotizado en bolívares en enero y en
            dólares en marzo. Las cifras salen a la tasa que congeló cada
            orden, y sin esta nota alguien las compararía contra un total en
            bolívares y no cuadrarían.
          */}
          <p className="text-ink/40 mt-3 text-xs">
            Las cifras cuentan órdenes aprobadas —dinero comprometido, no desembolsado— y van en
            dólares a la tasa que congeló cada una.
          </p>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <Card flush>
              <CardHeader
                title="Qué se le compra"
                subtitle="De lo que más dinero se lleva a lo que menos."
                className="p-5 pb-0"
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-ink/45 border-hairline border-y text-left text-xs">
                      <th className="px-5 py-2 font-medium">Artículo</th>
                      <th className="px-3 py-2 text-right font-medium">Veces</th>
                      <th className="px-5 py-2 text-right font-medium">Invertido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(articulos ?? []).map((a) => (
                      <tr key={a.articulo} className="border-hairline border-b last:border-0">
                        <td className="px-5 py-2.5">
                          <p className="text-ink/85">{a.articulo}</p>
                          {a.articulo_codigo ? (
                            <p className="text-ink/40 font-mono text-xs">{a.articulo_codigo}</p>
                          ) : null}
                        </td>
                        <td className="text-ink/70 tabular px-3 py-2.5 text-right">{a.veces}</td>
                        <td className="text-ink/85 tabular px-5 py-2.5 text-right font-medium">
                          {dolares(a.invertido_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/*
              LOS PAPELES QUE NOS HA DADO

              Christopher: «para recordar siempre el movimiento». Aquí están
              todos los de este proveedor, de cualquier orden, con el número de
              la orden al lado: un papel suelto no dice nada, «comprobante de
              pago de la OC-2026-0004» sí.
            */}
            <Card>
              <CardHeader
                title="Papeles que ha entregado"
                subtitle="Comprobantes, notas de entrega y facturas de todas sus órdenes."
              />

              {(papeles ?? []).length === 0 ? (
                <p className="text-ink/50 mt-4 text-sm">
                  Todavía no se ha guardado ningún papel suyo. Se cargan desde la compra, y desde
                  ahí aparecen aquí.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {(papeles ?? []).map((papel) => (
                    <li
                      key={papel.id}
                      className="border-hairline flex flex-wrap items-center gap-2 rounded-[6px] border px-3 py-2"
                    >
                      <Chip tone="neutral">{NOMBRE_DEL_PAPEL[papel.tipo] ?? papel.tipo}</Chip>

                      <span className="min-w-0 flex-1">
                        <Link
                          to={`/app/compras/${papel.orden_id}`}
                          className="text-ink/75 hover:text-royal-700 dark:hover:text-royal-300 block truncate text-sm transition-colors"
                        >
                          {papel.orden?.numero ?? `Orden ${papel.orden_id}`}
                        </Link>
                        <span className="text-ink/40 block truncate text-xs">
                          {papel.archivo_nombre} · {fechaHora(papel.subido_en)}
                        </span>
                      </span>

                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Paperclip />}
                        disabled={abriendo === papel.id}
                        onClick={async () => {
                          setAbriendo(papel.id)
                          try {
                            const href = await enlaceDelPapel(papel.archivo_path)
                            setViendo({ href, nombre: papel.archivo_nombre })
                          } finally {
                            setAbriendo(null)
                          }
                        }}
                      >
                        {abriendo === papel.id ? 'Abriendo…' : 'Ver'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <Visor
        abierto={viendo !== null}
        onCerrar={() => setViendo(null)}
        href={viendo?.href}
        nombreArchivo={viendo?.nombre ?? 'papel'}
        titulo="Papel del proveedor"
      />
    </>
  )
}
