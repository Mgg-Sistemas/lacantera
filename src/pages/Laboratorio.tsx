import { Boxes, HandCoins, Landmark, Truck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'

/**
 * Banco de pruebas del interior.
 *
 * POR QUÉ EXISTE
 *
 * El interior del sistema vive detrás del acceso, y rediseñar cincuenta
 * pantallas sin verlas es exactamente como se rompen los diseños. Esta ruta
 * monta las piezas compartidas —cabecera, tarjeta, indicador, botón, campo— con
 * contenido fijo, para poder mirarlas y corregirlas sin una sesión abierta.
 *
 * Se toca aquí y el cambio sale en las cincuenta pantallas, porque son las
 * mismas piezas: no es una maqueta aparte, son los componentes de verdad.
 *
 * SÓLO EN DESARROLLO
 *
 * `App.tsx` la cuelga bajo `import.meta.env.DEV`, así que no existe en lo que
 * se publica: el compilador la elimina entera junto con este archivo.
 *
 * LAS CIFRAS DE AQUÍ NO SON DE NADIE
 *
 * El sistema promete que ningún número en pantalla es de ejemplo, y esta
 * pantalla lo incumpliría si llegara a producción. Por eso no llega. Aun así
 * los valores se dejan en guiones y en texto donde se puede, para que a nadie
 * que pase por detrás le parezca que está viendo la operación.
 */
export function Laboratorio() {
  return (
    <div className="bg-canvas min-h-svh px-4 pb-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="border-warning/40 bg-warning-soft text-warning mt-6 rounded-[6px] border border-dashed px-4 py-2 text-xs">
          Banco de pruebas del diseño. No es una pantalla del sistema y no sale publicada.
        </div>

        <PageHeader
          eyebrow="Minería Internacional TS"
          title="Panel"
          description="Así se ve hoy el interior, con las piezas compartidas"
        />

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="En cuentas, en divisas"
            value="—"
            icon={<Landmark />}
            tone="royal"
            deltaLabel="sin dato en el banco de pruebas"
          />
          <StatCard
            label="Por pagar a proveedores"
            value="—"
            icon={<HandCoins />}
            tone="warning"
            deltaLabel="sin dato en el banco de pruebas"
          />
          <StatCard
            label="Pagado sin recibir"
            value="—"
            icon={<Truck />}
            tone="warning"
            deltaLabel="3 ordenes llevan mas de 7 dias"
          />
          <StatCard
            label="Valor del inventario"
            value="—"
            icon={<Boxes />}
            tone="info"
            deltaLabel="sin dato en el banco de pruebas"
          />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Requiere atención"
              subtitle="Cómo se ve la lista de avisos"
            />
            <ul className="mt-4 space-y-3">
              {[
                ['La tasa de hoy no está cargada', 'Todo lo que se registre hoy quedará sin convertir.'],
                ['Un pago lleva días autorizado sin salir', 'Tesorería lo aprobó y todavía no se ejecuta.'],
                ['Artículos bajo el mínimo', 'El inventario cayó por debajo del punto de pedido.'],
              ].map(([titulo, detalle]) => (
                <li
                  key={titulo}
                  className="border-hairline hover:border-royal-300 rounded-[6px] border p-3 transition-colors"
                >
                  <p className="text-ink/85 text-sm font-medium">{titulo}</p>
                  <p className="text-ink/55 mt-0.5 text-xs leading-relaxed">{detalle}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Compras en curso" subtitle="Dónde está detenida cada una" />
            <ul className="mt-4 space-y-2.5">
              {[
                'Pedidos por confirmar',
                'Buscando precios',
                'Esperando al gerente',
                'Por indicar el pago',
                'Pagadas, por recibir',
              ].map((etiqueta) => (
                <li key={etiqueta} className="flex items-baseline justify-between gap-3">
                  <span className="text-ink/70 text-sm">{etiqueta}</span>
                  <span className="tabular text-ink/30 text-sm font-semibold">—</span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button variant="soft" size="sm" block>
                Ver el tablero
              </Button>
            </div>
          </Card>
        </div>

        {/* Piezas sueltas, para juzgarlas sin el ruido del tablero. */}
        <Card className="mt-5">
          <CardHeader title="Piezas sueltas" subtitle="Botones, chips y campos" />
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button>Guardar</Button>
            <Button variant="soft">Ver el tablero</Button>
            <Button variant="outline">Cancelar</Button>
            <Button variant="ghost">Descartar</Button>
            <Button disabled>Sin permiso</Button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Chip tone="royal">Pedido</Chip>
            <Chip tone="warning">Esperando</Chip>
            <Chip tone="success">Recibida</Chip>
            <Chip tone="danger">Urgente</Chip>
          </div>
          <div className="mt-5 grid max-w-lg gap-4 sm:grid-cols-2">
            <Input label="Proveedor" placeholder="Nombre o RIF" />
            <Input label="Clave" placeholder="••••••••" revealable />
          </div>
        </Card>
      </div>
    </div>
  )
}
