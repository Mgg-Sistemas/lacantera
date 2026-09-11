import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { AvisoBloqueantes } from '@/components/SemaforoMantenimiento'
import { Segmento } from '@/components/ui/Segmento'
import { comparar } from '@/lib/maquina'
import { PulsoDeLaFlota } from './PulsoDeLaFlota'
import { FichaDeMaquina, ListaDeFlota, PatioDeFlota } from './VistasDeLaFlota'
import { VISTAS, type VistaDeFlota } from '@/lib/vistasDeFlota'
import { LA_CASA } from '@/lib/deQuien'
import { usePropietarios } from '@/lib/api/inventario'
import { ModalHorometro } from './ModalHorometro'
import { ModalTaller } from './ModalTaller'
import { ModalEstado } from './ModalEstado'
import {
  CLASES_DE_MAQUINA,
  ETIQUETA_CLASE,
  useMaquinaria,
  type ClaseDeMaquina,
  type Maquina,
} from '@/lib/api/maquinaria'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useNavigate } from 'react-router'
import { cn } from '@/lib/cn'

/**
 * Las máquinas y cómo van de mantenimiento.
 *
 * ES A LA VEZ EL TABLERO Y EL LISTADO, Y ESO ES DELIBERADO
 *
 * En los otros módulos el tablero es una pantalla aparte porque hay muchas
 * pantallas debajo. Aquí hay una sola cosa que mirar —las máquinas— y una sola
 * pregunta que se hace todo el mundo al entrar: cuál toca atender. Partirlo en
 * dos obligaría a un clic para llegar a lo único que hay.
 *
 * EL TALLER ES UN SITIO, NO UNA ANOTACIÓN
 *
 * El botón dice «meter al taller» o «sacar del taller» según dónde esté la
 * máquina, porque eso es lo que ocurre de verdad: entra, está dentro unos días
 * sin trabajar, y sale. Antes se anotaba el mantenimiento de un golpe cuando
 * ya estaba hecho, y en el medio no había forma de saber qué máquinas estaban
 * paradas.
 *
 * LO QUE ESTÁ PEOR VA PRIMERO
 *
 * No se ordena por código ni por nombre: por gravedad. Con veinte máquinas en
 * pantalla, la que pasó su tope no puede estar la decimoséptima porque su
 * código empiece por T.
 *
 * Y POR ESO MISMO HAY QUE PODER BUSCAR
 *
 * Lo pidió la líder «para prever N máquinas en un futuro», y tiene razón: el
 * orden por gravedad es el correcto para la pregunta «cuál toca atender», y es
 * el peor posible para la otra pregunta que trae aquí a alguien —«dónde está la
 * 450»—, porque coloca cada máquina en un sitio distinto cada día.
 *
 * Con cuatro tarjetas se resuelve mirando. Con cuarenta, sin buscador, la única
 * manera es leerlas todas.
 */
export function Maquinaria() {
  /*
    Se piden TODAS, incluidas las desincorporadas, y se filtran aquí.

    Antes se pedían solo las de la flota y las dadas de baja no existían para
    esta pantalla. Con cuatro máquinas da igual; con cuarenta, la que se
    desincorporó hace un año sigue teniendo historial, horas y facturas colgando,
    y no poder ni buscarla es esconderla. Ahora está, pero hay que pedirla: el
    filtro arranca en «las de la flota», que es lo que se mira a diario.
  */
  const { data, isPending, error } = useMaquinaria(false)
  const { puede } = useMisPermisos()
  const { data: propietarios } = usePropietarios()

  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [tipo, setTipo] = useState('')
  /*
    DE QUIÉN ES.

    Christopher: «este filtro deberá también filtrar por propietario (La Cantera,
    Gobernación)». La pastilla ya decía de quién era cada máquina, pero decirlo
    máquina por máquina no contesta «enséñame lo de la gobernación», que es la
    pregunta que se hace al preparar una devolución o al cuadrar con el ente.
  */
  const [dueno, setDueno] = useState('')
  /*
    MAQUINARIA, VEHÍCULO O EQUIPO.

    Christopher: «segmentar si es una maquinaria (ej. volvo, chuto,
    retroexcavadora, etc) o vehículo (ej. camioneta)». Es el corte más grueso de
    los tres —más que el estado y más que el tipo— y por eso comparte fila con el
    dueño arriba, no con los desplegables.
  */
  const [clase, setClase] = useState('')

  /*
    CÓMO SE MIRA LA FLOTA, y se recuerda.

    Christopher: «las tarjetas de las máquinas deben tener por lo menos 3 tipos
    de vistas». Son tres preguntas distintas —ver UNA máquina, ver la flota
    entera, pasar revista— y quien lleva el patio va a querer siempre la misma.
    Obligarle a elegirla en cada visita convierte una comodidad en un trámite.

    Se guarda en el navegador y no en la base: es una preferencia de quien mira,
    no un dato de la empresa, y no tiene por qué viajar entre equipos. Va envuelto
    porque en una ventana privada o con el almacenamiento bloqueado esto lanza, y
    una pantalla no puede dejar de abrir por no poder recordar una preferencia.
  */
  const [vista, setVista] = useState<VistaDeFlota>(() => {
    try {
      const v = localStorage.getItem('maquinaria.vista')
      return v === 'lista' || v === 'patio' ? v : 'ficha'
    } catch {
      return 'ficha'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('maquinaria.vista', vista)
    } catch {
      // Sin memoria: la vista dura lo que dure la visita, y ya está.
    }
  }, [vista])
  const [soloPendientes, setSoloPendientes] = useState(false)

  const [horometro, setHorometro] = useState<Maquina | null>(null)
  const [taller, setTaller] = useState<Maquina | null>(null)
  const [estado, setEstado] = useState<Maquina | null>(null)
  const navegar = useNavigate()

  const puedeEscribir = puede('MAQUINARIA', 'ESCRITURA')

  const orden = { BLOQUEANTE: 0, ALARMA: 1, AVISO: 2, OK: 3 } as const
  const todas = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) =>
          orden[a.semaforo] - orden[b.semaforo] ||
          Number(b.horas_desde_mant) - Number(a.horas_desde_mant) ||
          /*
            Y a igualdad de urgencia, por código y de forma natural: «PAYLOADER 2»
            antes que «PAYLOADER 10». Antes no había tercer criterio y el orden
            dentro de cada grupo lo decidía la base, que es como decir nadie.
          */
          comparar(a.codigo, b.codigo),
      ),
    // `orden` es un literal y se recrea en cada pintado; lo que decide es `data`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  )

  /*
    Los tipos salen de lo que hay cargado, no de una lista escrita aquí.

    `maquinaria.tipo` es un CHECK sobre texto y NO es el mismo catálogo que
    `vehiculos.tipo` —excavadora y cargador frente a volteo y chuto—, así que
    copiar cualquiera de las dos listas al front es garantizar que un día
    diverjan. Derivándolos, el desplegable no puede ofrecer un tipo que no exista
    ni esconder uno que se añada.
  */
  const tipos = useMemo(
    () => [...new Set(todas.map((m) => m.tipo))].sort(comparar),
    [todas],
  )

  /*
    LOS DUEÑOS SALEN DEL CATÁLOGO, NO DE LAS MÁQUINAS QUE YA HAY.

    La primera versión los derivaba de la flota cargada, con el mismo criterio
    que los tipos: no ofrecer lo que no existe. Estaba mal, y se vio en cuanto
    hubo una sola máquina y era de la gobernación — el desplegable desapareció
    justo cuando hacía falta para separar.

    La diferencia con los tipos es que el dueño es una pregunta que se hace
    ANTES de mirar: «enséñame lo de la gobernación» tiene que poder contestarse
    «no tiene ninguna», y eso es una respuesta, no una lista vacía.
  */
  const duenos = useMemo(
    () => (propietarios ?? []).map((d) => d.codigo),
    [propietarios],
  )

  const nombreDeDueno = (codigo: string) =>
    (propietarios ?? []).find((d) => d.codigo === codigo)?.nombre ?? codigo

  const maquinas = useMemo(() => {
    // Sin tildes y por trozos sueltos: «450 john» encuentra la EXCAVADORA 450
    // JOHN DEERE, y «maquina» encuentra «MÁQUINA». Es el mismo criterio del
    // buscador de la barra, y lo contrario —exigir la frase entera y la tilde—
    // es lo que hace que un buscador parezca roto.
    const trozos = busqueda
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    return todas.filter((m) => {
      // Por defecto, solo la flota. Las desincorporadas hay que pedirlas.
      if (!filtroEstado && !m.en_la_flota) return false
      if (filtroEstado && m.estado !== filtroEstado) return false
      if (tipo && m.tipo !== tipo) return false
      // Nulo cuenta como nuestro: las filas anteriores a que existiera la
      // pregunta eran de la casa, y la columna nació con ese valor por defecto.
      if (dueno && (m.propietario ?? LA_CASA) !== dueno) return false
      if (clase && (m.clase ?? 'MAQUINA') !== clase) return false
      if (soloPendientes && m.semaforo === 'OK') return false
      if (trozos.length === 0) return true

      const heno = `${m.codigo} ${m.nombre} ${m.tipo} ${m.marca ?? ''} ${m.modelo ?? ''} ${m.serial ?? ''} ${m.almacen ?? ''} ${m.operador ?? ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

      return trozos.every((t) => heno.includes(t))
    })
  }, [todas, busqueda, filtroEstado, tipo, dueno, clase, soloPendientes])

  /*
    Los avisos se cuentan sobre TODAS y no sobre las filtradas.

    Es lo contrario de lo que hace Existencias con su franja, y a propósito: allí
    la franja resume lo que estás mirando; aquí el aviso de bloqueantes es una
    alarma, y una alarma que se calla porque escribiste en un buscador es una
    alarma rota.
  */
  /*
    CUÁNTAS HAY EN CADA ESTADO, Y DEL DUEÑO QUE SE ESTÉ MIRANDO.

    Christopher: «necesitamos tarjetas que cuantifiquen: activo, inactivo, en
    espera». La lista contesta «cuáles»; esto contesta «cuántas», que es la
    pregunta que se hace antes de abrirla — y la que se lleva a una reunión.

    Se cuenta sobre el DUEÑO elegido pero no sobre el estado, porque si no, la
    tarjeta de «Activa» diría siempre lo mismo que la lista y las otras dirían
    cero. Tampoco sobre la búsqueda ni el tipo: escribir en un buscador no puede
    cambiar cuántas máquinas hay paradas.
  */
  const delDueno = useMemo(
    () =>
      todas.filter(
        (m) =>
          (!dueno || (m.propietario ?? LA_CASA) === dueno) &&
          (!clase || (m.clase ?? 'MAQUINA') === clase),
      ),
    [todas, dueno, clase],
  )

  /* Las clases que de verdad hay, para no ofrecer un segmento vacío. */
  const clases = useMemo(
    () => [...new Set(todas.map((m) => m.clase ?? 'MAQUINA'))],
    [todas],
  )

  const porEstado = useMemo(() => {
    const cuenta = {} as Record<string, number>
    for (const m of delDueno) cuenta[m.estado] = (cuenta[m.estado] ?? 0) + 1
    return cuenta
  }, [delDueno])

  /*
    LO QUE DICE LA LÍNEA DE ABAJO DE «ACTIVA».

    Se cuenta sobre las que están EN LA FLOTA y dentro del dueño elegido, no
    sobre todas: si alguien está mirando lo de la gobernación, «2 por atender»
    tiene que ser de las suyas.
  */
  const porAtender = delDueno.filter((m) => m.semaforo !== 'OK' && m.en_la_flota).length
  const pasadasDeTope = delDueno.filter(
    (m) => m.semaforo === 'BLOQUEANTE' && m.en_la_flota,
  ).length

  const bloqueantes = todas.filter((m) => m.semaforo === 'BLOQUEANTE' && m.en_la_flota).length
  const pendientes = todas.filter((m) => m.semaforo !== 'OK' && m.en_la_flota).length
  /*
    Lo que las tres vistas pueden hacer. Va en un solo objeto para que añadir una
    cuarta vista no obligue a enhebrar cinco props una por una.
  */
  const acciones = useMemo(
    () => ({
      puedeEscribir,
      onHorometro: setHorometro,
      onTaller: setTaller,
      onEstado: setEstado,
      onAbrir: (m: Maquina) => void navegar(`/app/maquinaria/${m.id}`),
    }),
    [puedeEscribir, navegar],
  )

  const hayFiltro = Boolean(
    busqueda.trim() || filtroEstado || tipo || dueno || clase || soloPendientes,
  )

  return (
    <>
      <PageHeader
        title="Maquinaria"
        description="Cada equipo, lo que lleva trabajado y cuánto le falta para su mantenimiento."
        actions={
          <>
            <Button
              variant="outline"
              icon={<ClipboardList />}
              onClick={() => navegar('/app/maquinaria/mantenimientos')}
            >
              Historial de taller
            </Button>
            {puedeEscribir ? (
              <Button icon={<Plus />} onClick={() => void navegar('/app/maquinaria/nueva')}>
                Nueva máquina
              </Button>
            ) : null}
          </>
        }
      />

      {isPending ? <Cargando /> : null}
      {error ? <ErrorDeCarga error={error} /> : null}

      {!isPending && !error ? (
        <>
          {/* Lo primero de la pantalla cuando hay algo pasado de tope. No
              comparte fila con nada: es lo único aquí que puede costar un
              motor. */}
          <AvisoBloqueantes cuantas={bloqueantes} />

          {/*
            EL PULSO DE LA FLOTA, Y QUIÉN LA TIENE.

            Christopher: «necesitamos que podamos diferenciar mucho más o
            segmentar o filtrar lo que sea de la cantera y de la gobernación.
            Necesitamos tarjetas que cuantifiquen». Y sobre la primera versión:
            «definitivamente este diseño no lo quieren, tampoco lo apruebo,
            otórgales más protagonismo».

            El orden de la pantalla lo dice todo: primero de quién y de qué
            clase, después cuántas hay de cada cosa, y solo entonces los filtros
            de búsqueda. Los mandos de arriba cambian lo que dicen las cifras, no
            solo lo que muestra la lista.
          */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {duenos.length > 1 ? (
              <Segmento
                opciones={[
                  { valor: '', etiqueta: 'Todas' },
                  ...(propietarios ?? []).map((d) => ({ valor: d.codigo, etiqueta: d.nombre })),
                ]}
                valor={dueno}
                onCambio={setDueno}
              />
            ) : null}

            {/* El mismo mando para la clase. Solo con más de una: segmentar
                entre una cosa no segmenta nada. */}
            {clases.length > 1 ? (
              <Segmento
                opciones={[
                  { valor: '', etiqueta: 'Todo' },
                  ...CLASES_DE_MAQUINA.filter((c) => clases.includes(c.valor)).map((c) => ({
                    valor: c.valor,
                    etiqueta: c.etiqueta,
                  })),
                ]}
                valor={clase}
                onCambio={setClase}
              />
            ) : null}

            {/* Y el de la vista, al otro extremo: no filtra nada, cambia cómo se
                mira lo mismo. Por eso no comparte grupo con los dos de arriba. */}
            <div className="ml-auto">
              <Segmento
                opciones={VISTAS.map((v) => ({
                  valor: v.valor,
                  etiqueta: v.etiqueta,
                  pista: v.pista,
                }))}
                valor={vista}
                onCambio={(v) => setVista(v as VistaDeFlota)}
              />
            </div>
          </div>

          <PulsoDeLaFlota
            porEstado={porEstado}
            total={delDueno.length}
            elegido={filtroEstado}
            onElegir={setFiltroEstado}
            porAtender={porAtender}
            pasadas={pasadasDeTope}
          />

          {/* Cuando el dueño elegido no tiene ninguna, se dice. Una fila de
              tarjetas en cero no explica por qué está en cero. */}
          {delDueno.length === 0 ? (
            <p className="text-ink/45 mb-4 text-sm">
              {dueno ? nombreDeDueno(dueno) : 'La flota'} no tiene
              {clase
                ? ` ${(ETIQUETA_CLASE[clase as ClaseDeMaquina] ?? clase).toLowerCase()}`
                : ' máquinas'}{' '}
              registrada{clase === 'MAQUINA' || !clase ? 's' : ''}.
            </p>
          ) : null}

          {/* La barra no se pinta si no hay nada que filtrar: con el sistema
              recién arrancado, tres campos vacíos encima de un cartel que dice
              «no hay máquinas» son tres campos que estorban. */}
          {todas.length > 0 ? (
            <Card className="mb-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_190px]">
                <Input
                  label="Buscar"
                  icon={<Search />}
                  placeholder="Código, nombre, marca, modelo o serial"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />

                {/*
                  EL DESPLEGABLE DE ESTADO SE FUE, y esa es media redención del
                  diseño anterior.

                  Estaba aquí abajo diciendo lo mismo que las tarjetas de arriba.
                  Con dos mandos para la misma pregunta, las tarjetas se leían
                  como un filtro más —pequeñas, apretadas, compitiendo— en vez de
                  como el estado de la flota. Quitarlo es lo que les deja el sitio
                  que Christopher pedía.
                */}
                {/* El tipo solo aparece cuando hay más de uno. Un desplegable
                    con una sola opción no es un filtro, es un adorno. */}
                {tipos.length > 1 ? (
                  <Select
                    label="Tipo"
                    vacio="Todos"
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value)}
                    opciones={tipos.map((t) => ({ valor: t, etiqueta: t }))}
                  />
                ) : null}

                {/* El dueño tampoco está aquí: manda desde arriba, junto a la
                    clase, y desde ahí recalcula las cifras. Repetirlo en la
                    barra sería el mismo error que tenía el estado. */}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {/* El atajo a la pregunta que trae aquí a casi todo el mundo.
                    Se calcula sobre la flota entera, no sobre lo filtrado: es un
                    contador de trabajo pendiente, no un resumen de la vista. */}
                {pendientes > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSoloPendientes((v) => !v)}
                    className={cn(
                      'text-xs underline underline-offset-2',
                      soloPendientes ? 'text-royal-700 dark:text-royal-300' : 'text-ink/55 hover:text-ink/80',
                    )}
                  >
                    {soloPendientes
                      ? 'Ver todas'
                      : `Ver solo las ${pendientes} que hay que atender`}
                  </button>
                ) : null}

                {hayFiltro ? (
                  <button
                    type="button"
                    onClick={() => {
                      setBusqueda('')
                      setFiltroEstado('')
                      setTipo('')
                      setDueno('')
                      setClase('')
                      setSoloPendientes(false)
                    }}
                    className="text-ink/45 hover:text-ink/75 text-xs underline underline-offset-2"
                  >
                    Quitar los filtros
                  </button>
                ) : null}

                <span className="text-ink/45 ml-auto text-xs">
                  {maquinas.length} de {todas.length} máquina{todas.length === 1 ? '' : 's'}
                </span>
              </div>
            </Card>
          ) : null}

          {maquinas.length === 0 ? (
            <Card>
              {/* Dos ceros que parecen el mismo y no lo son: uno dice que falta
                  cargar máquinas y el otro que la búsqueda no encontró. Darles
                  el mismo cartel es lo que hace que alguien crea que se le
                  borraron los datos. */}
              {todas.length === 0 ? (
                <Vacio
                  titulo="No hay máquinas cargadas"
                  descripcion="Sin ellas no se puede llevar el horómetro ni programar mantenimientos. Se cargan una vez, con su código y su tope de horas."
                  accion={
                    puedeEscribir ? (
                      <Button icon={<Plus />} onClick={() => void navegar('/app/maquinaria/nueva')}>
                        Cargar la primera
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <Vacio
                  titulo="Ninguna coincide"
                  descripcion={
                    filtroEstado
                      ? 'Prueba con otro estado, o quita los filtros para ver la flota entera.'
                      : 'Las desincorporadas no salen a menos que las pidas por estado.'
                  }
                  accion={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setBusqueda('')
                        setFiltroEstado('')
                        setTipo('')
                        setDueno('')
                        setClase('')
                        setSoloPendientes(false)
                      }}
                    >
                      Quitar los filtros
                    </Button>
                  }
                />
              )}
            </Card>
          ) : (
            <>
              {vista === 'ficha' ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {maquinas.map((m) => (
                    <FichaDeMaquina key={m.id} m={m} acc={acciones} />
                  ))}
                </div>
              ) : vista === 'lista' ? (
                <ListaDeFlota maquinas={maquinas} acc={acciones} />
              ) : (
                <PatioDeFlota maquinas={maquinas} acc={acciones} nombreDeDueno={nombreDeDueno} />
              )}
            </>
          )}
        </>
      ) : null}

      <ModalHorometro
        abierto={horometro !== null}
        maquina={horometro}
        onCerrar={() => setHorometro(null)}
      />
      <ModalTaller
        abierto={taller !== null}
        maquina={taller}
        onCerrar={() => setTaller(null)}
      />
      <ModalEstado
        abierto={estado !== null}
        maquina={estado}
        onCerrar={() => setEstado(null)}
      />
    </>
  )
}
