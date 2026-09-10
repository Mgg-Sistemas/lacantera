import { useState } from 'react'
import { Plus, Wrench } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SelectBuscable } from '@/components/ui/SelectBuscable'
import { Cargando, ErrorDeCarga } from '@/components/ui/Estado'
import { useArticulos } from '@/lib/api/catalogo'
import { useAlmacenes, useExistencias } from '@/lib/api/inventario'
import {
  useAgregadosDeMaquina,
  useMontarAgregado,
  useRetirarAgregado,
  type Agregado,
} from '@/lib/api/maquinaria'
import { dolares, fecha as enFecha } from '@/lib/formato'
import { hoyEnCaracas } from '@/lib/api/tasas'

/*
  QUÉ LLEVA ENCIMA ESTA MÁQUINA.

  Christopher: «debemos permitir que las máquinas puedan modificarse (añadir
  elementos o incluir características adicionales, ej. antenas Starlink, cauchos
  especiales, etc), eso estará incluido en el historial de la máquina».

  ═══════════════════════════════════════════════════════════════════════════
  DOS SITIOS PARA LO MISMO, Y LOS DOS HACEN FALTA
  ═══════════════════════════════════════════════════════════════════════════

  Lo montado sale en el historial —lo pidió él— pero el historial contesta «qué
  fue pasando», en orden y mezclado con el combustible y las horas. La pregunta
  que se hace de verdad al mandar la máquina a una faena o al devolvérsela a su
  dueño es otra: «¿qué lleva encima AHORA?». Esa no se contesta leyendo doscientas
  líneas hacia atrás y restando lo que se quitó.

  Por eso esta tarjeta: la lista corta de lo que está puesto. Lo retirado queda
  debajo, apagado, porque la pregunta de «¿y la antena que tenía?» también se
  hace, y borrarlo la dejaría sin respuesta.

  ═══════════════════════════════════════════════════════════════════════════
  EL NOMBRE SE ESCRIBE A MANO Y EL CATÁLOGO ES OPCIONAL
  ═══════════════════════════════════════════════════════════════════════════

  Una antena Starlink no está en el catálogo de la cantera y no tiene por qué
  estarlo: no se compra por almacén ni se lleva existencia de ella. Obligar a
  crear una ficha de artículo para poder anotarla convertiría un apunte de dos
  campos en un alta de catálogo, y entonces no se anota.

  El artículo se ofrece igual, para lo que sí está —unos cauchos, una batería—:
  sirve para que el mismo caucho no se escriba de seis maneras distintas, y al
  elegirlo el nombre se rellena solo. No descuenta nada del almacén: si salió de
  ahí, esa salida ya se registró por su puerta.
*/
export function QueLlevaEncima({
  maquinaId,
  editable,
}: {
  maquinaId: number
  editable: boolean
}) {
  const { data, isPending, error } = useAgregadosDeMaquina(maquinaId)
  const { data: articulos } = useArticulos()
  /*
    DE DÓNDE PUEDE SALIR. Se piden las existencias enteras para saber en qué
    almacenes hay cada artículo: ofrecer un sitio donde no hay ninguno es
    ofrecer un error, igual que ya se corrigió en Transferencias.
  */
  const { data: existencias } = useExistencias()
  const { data: almacenes } = useAlmacenes()
  const montar = useMontarAgregado()
  const retirar = useRetirarAgregado()

  const [montando, setMontando] = useState(false)
  const [quitando, setQuitando] = useState<Agregado | null>(null)

  const vacio = {
    nombre: '',
    motivo: '',
    hecho_por: '',
    articulo_id: '',
    almacen_id: '',
    serial: '',
    cantidad: '',
    fecha: hoyEnCaracas(),
    costo_usd: '',
    nota: '',
  }
  const [f, setF] = useState(vacio)
  const [motivo, setMotivo] = useState('')
  const [destino, setDestino] = useState('')

  /* Los sitios que tienen el artículo elegido, con cuánto hay en cada uno. */
  const dondeHay = (existencias ?? []).filter(
    (e) => String(e.articulo_id) === f.articulo_id && Number(e.disponibles) > 0,
  )
  const hayAqui = dondeHay.find((e) => String(e.almacen_id) === f.almacen_id)

  const puestos = (data ?? []).filter((a) => !a.retirado_el)
  const quitados = (data ?? []).filter((a) => a.retirado_el)

  return (
    <>
      <Card>
        <CardHeader
          title="Qué lleva encima"
          subtitle="Lo que se le añadió y no venía con ella: una antena, unos cauchos especiales, un blindaje. Todo esto sale también en su historia."
          action={
            editable ? (
              <Button size="sm" variant="soft" icon={<Plus />} onClick={() => setMontando(true)}>
                Montarle algo
              </Button>
            ) : null
          }
        />

        {isPending ? <Cargando /> : null}
        {error ? <ErrorDeCarga error={error} /> : null}

        {!isPending && !error && puestos.length === 0 && quitados.length === 0 ? (
          <p className="text-ink/45 mt-4 text-sm leading-relaxed">
            Está tal como llegó: no se le ha montado nada.
          </p>
        ) : null}

        {puestos.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {puestos.map((a) => (
              <li
                key={a.id}
                className="border-hairline flex flex-wrap items-baseline justify-between gap-2 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-ink/85 text-sm font-medium">{a.nombre}</p>
                  <p className="text-ink/45 mt-0.5 text-xs">
                    {[
                      `puesto el ${enFecha(a.fecha)}`,
                      /* Quién lo hizo va pronto, junto a la fecha: es la
                         segunda cosa que se pregunta al ver algo montado. */
                      a.hecho_por ? `lo hizo ${a.hecho_por}` : null,
                      a.serial ? `serial ${a.serial}` : null,
                      a.costo_usd ? dolares(Number(a.costo_usd)) : null,
                      a.nota,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {/* El porqué en su propio renglón y no en la retahíla de
                      arriba: es una frase, no un dato, y mezclarla con el
                      serial la convierte en ruido. */}
                  <p className="text-ink/55 mt-1 text-xs leading-relaxed">{a.motivo}</p>
                </div>
                {editable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setMotivo('')
                      setDestino('')
                      setQuitando(a)
                    }}
                  >
                    Quitar
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Lo que ya no lleva. Se enseña apagado y no se esconde: «¿y la antena
            que tenía?» es una pregunta que se hace, y borrarla la dejaría sin
            respuesta. */}
        {quitados.length > 0 ? (
          <div className="mt-4">
            <p className="text-ink/40 text-2xs font-mono tracking-[0.16em] uppercase">
              Ya no lo lleva
            </p>
            <ul className="mt-2 space-y-1.5">
              {quitados.map((a) => (
                <li key={a.id} className="text-ink/45 text-xs leading-relaxed">
                  <span className="text-ink/60 line-through">{a.nombre}</span>{' '}
                  <Chip tone="neutral" className="ml-1">
                    {enFecha(a.retirado_el!)}
                  </Chip>{' '}
                  {a.motivo_retiro}
                  {a.destino_id ? ' · volvió al almacén' : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {/* ------------------------------ Montarle algo ------------------------------ */}
      {montando ? (
        <Modal
          abierto
          onCerrar={() => setMontando(false)}
          titulo="Montarle algo a la máquina"
          descripcion="Queda en su ficha y en su historia, con la fecha."
          acciones={
            <>
              <Button variant="outline" onClick={() => setMontando(false)}>
                Cancelar
              </Button>
              <Button
                icon={<Wrench />}
                disabled={
                  montar.isPending ||
                  f.nombre.trim().length < 3 ||
                  // Lo mismo que exige la base, dicho antes de pulsar.
                  f.motivo.trim().length < 4 ||
                  // Para descontar de un estante hace falta cuántos, y que
                  // alcance. La base también lo para, pero enterarse al pulsar
                  // con el formulario lleno llega tarde.
                  Boolean(f.almacen_id && !(Number(f.cantidad.replace(',', '.')) > 0)) ||
                  Boolean(
                    f.almacen_id &&
                      hayAqui &&
                      Number(f.cantidad.replace(',', '.')) > Number(hayAqui.disponibles),
                  )
                }
                onClick={async () => {
                  await montar.mutateAsync({
                    maquina_id: maquinaId,
                    nombre: f.nombre.trim(),
                    motivo: f.motivo.trim(),
                    hecho_por: f.hecho_por.trim() || null,
                    articulo_id: f.articulo_id ? Number(f.articulo_id) : null,
                    almacen_id: f.almacen_id ? Number(f.almacen_id) : null,
                    serial: f.serial.trim() || null,
                    cantidad: f.cantidad ? Number(f.cantidad.replace(',', '.')) : null,
                    fecha: f.fecha || null,
                    costo_usd: f.costo_usd ? Number(f.costo_usd.replace(',', '.')) : null,
                    nota: f.nota.trim() || null,
                  })
                  setF(vacio)
                  setMontando(false)
                }}
              >
                {montar.isPending ? 'Guardando…' : 'Montar'}
              </Button>
            </>
          }
        >
          <div className="grid gap-4">
            {/*
              EL ARTÍCULO PRIMERO, PERO SIN OBLIGAR.

              Va arriba porque cuando la cosa SÍ está en el catálogo, elegirla
              rellena el nombre y evita que el mismo caucho se escriba de seis
              maneras. Va sin obligar porque una antena Starlink no está en el
              catálogo de una cantera y no tiene por qué estarlo.
            */}
            <SelectBuscable
              label="¿Está en el catálogo?"
              vacio="No está, lo escribo abajo"
              valor={f.articulo_id}
              onCambio={(v) => {
                const art = (articulos ?? []).find((a) => String(a.id) === v)
                setF((x) => ({
                  ...x,
                  articulo_id: v,
                  // El nombre se rellena solo, y se puede corregir: «cauchos
                  // 29.5» puede querer decirse «cauchos 29.5 delanteros».
                  nombre: art ? art.nombre : x.nombre,
                  // Cambiar de artículo invalida el almacén elegido: el sitio
                  // que tenía el anterior puede no tener este.
                  almacen_id: '',
                }))
              }}
              hint="Elegirlo rellena el nombre, y es lo único que permite después descontarlo de un almacén."
              opciones={(articulos ?? []).map((a) => ({
                valor: String(a.id),
                codigo: a.codigo,
                nombre: a.nombre,
                detalle: a.unidad,
              }))}
            />

            {/*
              DE DÓNDE SALIÓ, QUE ES LA PREGUNTA QUE FALTABA.

              Christopher: «la antena puede no ser descontada, pero tampoco podrá
              estar disponible». Yo había dejado esta puerta sin tocar el
              inventario, y para lo comprado afuera está bien — pero si los
              cauchos salen de un estante, el saldo no puede seguir diciendo que
              están ahí.

              Solo aparece con un artículo elegido: sin saber QUÉ es y CUÁNTOS,
              el libro no tiene nada que descontar. Y solo se ofrecen los sitios
              que de verdad lo tienen, con cuánto hay en cada uno — ofrecer un
              almacén vacío es ofrecer un error.
            */}
            {f.articulo_id && dondeHay.length > 0 ? (
              <SelectBuscable
                label="¿De qué almacén salió?"
                vacio="De ninguno: vino de fuera"
                valor={f.almacen_id}
                onCambio={(v) => setF((x) => ({ ...x, almacen_id: v }))}
                hint={
                  f.almacen_id
                    ? 'Se descuenta de ese almacén al guardar: deja de estar disponible.'
                    : 'Sin almacén no se descuenta nada. Es el caso de lo que se compró afuera y se instaló.'
                }
                opciones={dondeHay.map((e) => ({
                  valor: String(e.almacen_id),
                  codigo: e.almacen_codigo,
                  nombre: e.almacen,
                  detalle: `hay ${e.disponibles} ${e.unidad}`,
                }))}
              />
            ) : null}

            {/* Sin sitios donde haya, se dice por qué no se pregunta, en vez de
                dejar un desplegable mudo. */}
            {f.articulo_id && dondeHay.length === 0 ? (
              <p className="text-ink/45 text-xs leading-relaxed">
                De ese artículo no hay existencia disponible en ningún almacén, así que no puede
                salir de uno. Se anota igual: queda dicho qué lleva la máquina.
              </p>
            ) : null}

            <Input
              label="Qué se le montó"
              placeholder="Antena Starlink"
              value={f.nombre}
              onChange={(e) => setF({ ...f, nombre: e.target.value })}
            />

            {/*
              EL PORQUÉ Y EL QUIÉN, QUE ES LO QUE PIDIÓ ÉL.

              Christopher: «cuando se realiza la modificación de la máquina, es
              importante indicar quién lo hizo o la razón de por qué se
              modificó».

              El porqué es obligatorio y el quién no. No es descuido: dentro de
              un año «tiene una antena» no explica nada, mientras que quién la
              montó a veces de verdad no se sabe —una máquina que llega con ella
              puesta— y un nombre inventado es peor que el hueco.

              «Quién lo hizo» no es «quién lo anota»: eso el sistema ya lo sabe y
              queda en la auditoría. Aquí se escribe el taller, el proveedor o el
              mecánico, y por eso es texto libre: de los tres, dos no tienen
              ficha de nómina.
            */}
            <Input
              label="Por qué se modificó"
              placeholder="Para tener señal en el frente norte"
              value={f.motivo}
              onChange={(e) => setF({ ...f, motivo: e.target.value })}
              hint="Dentro de un año esto es lo que explicará si sigue haciendo falta."
            />

            <Input
              label="Quién lo hizo"
              placeholder="Starlink Venezuela, el taller de Upata, un mecánico de la casa"
              value={f.hecho_por}
              onChange={(e) => setF({ ...f, hecho_por: e.target.value })}
              hint="Quién montó el equipo, que no es quien lo está anotando. Si no se sabe, se deja vacío."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Serial del equipo"
                placeholder="Opcional"
                value={f.serial}
                onChange={(e) => setF({ ...f, serial: e.target.value })}
                hint="El de la antena, no el de la máquina: es lo que la identifica si mañana se pasa a otro equipo."
              />
              <Input
                label="Cuántos"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder={f.almacen_id ? 'Hace falta' : 'Opcional'}
                value={f.cantidad}
                onChange={(e) => setF({ ...f, cantidad: e.target.value })}
                hint={
                  hayAqui ? `Ahí hay ${hayAqui.disponibles} ${hayAqui.unidad}` : undefined
                }
                error={
                  f.almacen_id &&
                  hayAqui &&
                  Number(f.cantidad.replace(',', '.')) > Number(hayAqui.disponibles)
                    ? 'Ahí no hay tantos.'
                    : undefined
                }
              />
              <Input
                label="Cuándo se le montó"
                type="date"
                max={hoyEnCaracas()}
                value={f.fecha}
                onChange={(e) => setF({ ...f, fecha: e.target.value })}
              />
              {/*
                EL COSTO SOLO SE PREGUNTA CUANDO NO SALE DE UN ALMACÉN.

                Si sale de uno, el costo lo pone el libro —el promedio de ese
                almacén— y preguntarlo sería invitar a escribir un número que
                compite con el asiento. Cuando viene de fuera no hay asiento
                contra el que comprobarlo, y entonces es lo único que hay: se
                pregunta, y se dice claramente que es referencia.
              */}
              {f.almacen_id ? null : (
                <Input
                  label="Lo que costó (USD)"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Opcional"
                  value={f.costo_usd}
                  onChange={(e) => setF({ ...f, costo_usd: e.target.value })}
                  hint="Solo como referencia: no entra en el valor del inventario."
                />
              )}
            </div>

            <Input
              label="Nota"
              placeholder="Va en la cabina, la instaló el proveedor"
              value={f.nota}
              onChange={(e) => setF({ ...f, nota: e.target.value })}
            />

            {/* Lo que va a pasar con el inventario, dicho antes de pulsar y no
                después: descontar es lo que no se puede deshacer con un clic. */}
            {f.almacen_id && hayAqui ? (
              <p className="border-warning/40 bg-warning/10 text-warning rounded-lg border px-3 py-2 text-xs leading-relaxed">
                Al guardar sale de {hayAqui.almacen}: quedarán{' '}
                {Number(hayAqui.disponibles) - Number(f.cantidad.replace(',', '.') || 0)}{' '}
                {hayAqui.unidad} y dejará de estar disponible. El costo lo pone el libro, al
                promedio de ese almacén.
              </p>
            ) : null}

            {montar.error ? <ErrorDeCarga error={montar.error} /> : null}
          </div>
        </Modal>
      ) : null}

      {/* -------------------------------- Quitarlo -------------------------------- */}
      {quitando ? (
        <Modal
          abierto
          onCerrar={() => setQuitando(null)}
          titulo={`Quitar ${quitando.nombre}`}
          descripcion="No se borra: queda en la historia con la fecha en que se quitó."
          acciones={
            <>
              <Button variant="outline" onClick={() => setQuitando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={retirar.isPending || motivo.trim().length < 4}
                onClick={async () => {
                  await retirar.mutateAsync({
                    id: quitando.id,
                    motivo: motivo.trim(),
                    destino_id: destino ? Number(destino) : null,
                  })
                  setQuitando(null)
                }}
              >
                {retirar.isPending ? 'Guardando…' : 'Quitar'}
              </Button>
            </>
          }
        >
          {/*
            EL PORQUÉ ES OBLIGATORIO, y no por trámite: «se quitó» a secas no
            dice si se pasó a otra máquina, si se gastó o si se lo llevaron, y
            esas tres tienen consecuencias distintas — una se busca en otra
            ficha, otra se repone y la tercera se reclama.
          */}
          <Input
            label="Por qué se quita"
            placeholder="Se pasó a la 0453"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Se pasó a otra máquina, se gastó, se lo llevó el dueño. Dentro de un año esto es lo único que quedará."
          />
          {/*
            ¿VUELVE AL ESTANTE?

            Unos cauchos que se desmontan buenos vuelven al almacén y tienen que
            volver a contarse; si no, se quedarían fuera del libro para siempre.
            Lo gastado, lo que se pasó a otra máquina y lo que se llevó su dueño
            no vuelven a ningún sitio, y ahí el silencio es la respuesta correcta.

            Solo se pregunta si el libro sabe contarlo: sin artículo y sin
            cantidad no hay nada que devolver, y ofrecerlo sería ofrecer un
            error. Entra al mismo costo con el que salió.
          */}
          {quitando.articulo_id && Number(quitando.cantidad ?? 0) > 0 ? (
            <div className="mt-4">
              <SelectBuscable
                label="¿Vuelve a algún almacén?"
                vacio="No vuelve: se gastó o se fue"
                valor={destino}
                onCambio={setDestino}
                hint={
                  destino
                    ? 'Vuelve a contarse ahí, al mismo costo con el que salió.'
                    : 'Lo gastado, lo que se pasó a otra máquina y lo que se llevó su dueño no vuelven a ningún estante.'
                }
                opciones={(almacenes ?? []).map((a) => ({
                  valor: String(a.id),
                  codigo: a.codigo,
                  nombre: a.nombre,
                  detalle: a.tipo,
                }))}
              />
            </div>
          ) : null}

          {retirar.error ? <ErrorDeCarga error={retirar.error} className="mt-4" /> : null}
        </Modal>
      ) : null}
    </>
  )
}
