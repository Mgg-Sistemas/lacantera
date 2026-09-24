import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ErrorDeCarga } from '@/components/ui/Estado'
import { bajarArchivo, escribirXlsx, leerHoja } from '@/lib/xlsx'
import { useCargarContactos, type EtiquetaDeContacto } from '@/lib/api/contactos'
import { interpretarContactos, plantillaDeContactos, type CargaDeContactos } from './hojas'

/*
  CARGAR CONTACTOS DESDE EXCEL

  Los mismos tres pasos que la carga del control de despacho: bajar la
  plantilla, llenarla, subirla y revisar antes de guardar. La diferencia es
  que aquí no hay CLAVE: cargar es crear contactos nuevos, nunca pisar los que
  ya están. Y la base aplica fila por fila las mismas reglas que el
  formulario, incluido el repetido: si la fila 12 tiene el celular de alguien
  que ya está, no se guarda ninguna y el error dice qué fila y con quién.
*/

export function CargaContactos({ etiquetas, onCerrar }: { etiquetas: EtiquetaDeContacto[]; onCerrar: () => void }) {
  const cargar = useCargarContactos()
  const selector = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState('')
  const [leida, setLeida] = useState<CargaDeContactos | null>(null)
  const [fallo, setFallo] = useState<unknown>(null)
  const [guardadas, setGuardadas] = useState<number | null>(null)

  const leer = async (f: File | undefined) => {
    if (!f) return
    setArchivo(f.name)
    setLeida(null)
    setFallo(null)
    setGuardadas(null)
    cargar.reset()
    try {
      setLeida(interpretarContactos(await leerHoja(f), etiquetas))
    } catch (e) {
      setFallo(e)
    }
  }

  const sePuede = leida !== null && leida.errores.length === 0 && leida.filas.length > 0

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo="Cargar contactos desde Excel"
      descripcion="Para meter muchos de una vez. Crea contactos nuevos: los que ya están no se tocan desde aquí."
      acciones={
        guardadas !== null ? (
          <Button onClick={onCerrar}>Listo</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              disabled={!sePuede || cargar.isPending}
              onClick={() => cargar.mutate(leida?.filas ?? [], { onSuccess: (n) => setGuardadas(n) })}
            >
              {cargar.isPending
                ? 'Guardando…'
                : sePuede
                  ? `Guardar ${leida.filas.length} contacto${leida.filas.length === 1 ? '' : 's'}`
                  : 'Guardar'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5 text-sm">
        <div>
          <p className="text-ink/90 font-medium">1. Baja la plantilla</p>
          <p className="text-ink/60 mt-1">
            Trae dos filas de ejemplo, que se borran. Las columnas de cabecera en realce son las que hacen falta: TIPO y,
            según sea, NOMBRES o RAZON SOCIAL. Las etiquetas van separadas por coma, con el nombre que tienen aquí.
          </p>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            icon={<Download />}
            onClick={() => bajarArchivo(escribirXlsx(plantillaDeContactos()), 'plantilla-contactos.xlsx')}
          >
            Descargar plantilla
          </Button>
        </div>

        <div>
          <p className="text-ink/90 font-medium">2. Llénala en Excel y súbela</p>
          <p className="text-ink/60 mt-1">
            El orden de las columnas da igual: se casan por su título. Una que falte se deja vacía. Si un correo o un
            teléfono ya está en el directorio, no se guarda nada y el aviso dice en qué fila.
          </p>
          <input
            ref={selector}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(e) => {
              void leer(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" variant="outline" icon={<Upload />} onClick={() => selector.current?.click()}>
              Elegir archivo
            </Button>
            {archivo ? <span className="text-ink/50 truncate">{archivo}</span> : null}
          </div>
        </div>

        {fallo ? <ErrorDeCarga error={fallo} /> : null}

        {leida && guardadas === null ? (
          <div>
            <p className="text-ink/90 font-medium">3. Revisa antes de guardar</p>
            <p className="text-ink/60 mt-1">
              {leida.filas.length} contacto{leida.filas.length === 1 ? '' : 's'} por crear
              {leida.saltadas > 0 ? ` · ${leida.saltadas} fila${leida.saltadas === 1 ? '' : 's'} vacía${leida.saltadas === 1 ? '' : 's'} o de ejemplo, saltada${leida.saltadas === 1 ? '' : 's'}` : ''}
              .
            </p>
            {leida.errores.length > 0 ? (
              <ul className="text-danger mt-2 list-disc space-y-1 pl-5 text-xs">
                {leida.errores.slice(0, 12).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {leida.errores.length > 12 ? <li>… y {leida.errores.length - 12} más.</li> : null}
              </ul>
            ) : (
              <ul className="text-ink/60 mt-2 space-y-0.5 text-xs">
                {leida.filas.slice(0, 8).map((f, i) => (
                  <li key={i}>
                    {f.tipo === 'EMPRESA' ? f.razon_social : `${f.nombres} ${f.apellidos}`.trim()}
                    {f.celular || f.correo ? ` · ${[f.celular, f.correo].filter(Boolean).join(' · ')}` : ''}
                  </li>
                ))}
                {leida.filas.length > 8 ? <li>… y {leida.filas.length - 8} más.</li> : null}
              </ul>
            )}
          </div>
        ) : null}

        {cargar.error ? <ErrorDeCarga error={cargar.error} /> : null}

        {guardadas !== null ? (
          <p className="text-success font-medium">
            Se crearon {guardadas} contacto{guardadas === 1 ? '' : 's'}.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
