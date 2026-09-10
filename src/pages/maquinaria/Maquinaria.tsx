import { useMemo, useState } from 'react'
import { ClipboardList, Gauge, Plus, Search, ToggleLeft, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Cargando, ErrorDeCarga, Vacio } from '@/components/ui/Estado'
import { AvisoBloqueantes, SemaforoMantenimiento } from '@/components/SemaforoMantenimiento'
import { DeQuienEs } from '@/components/DeQuienEs'
import { LA_CASA } from '@/lib/deQuien'
import { usePropietarios } from '@/lib/api/inventario'
import { ModalHorometro } from './ModalHorometro'
import { ModalTaller } from './ModalTaller'
import { ModalEstado } from './ModalEstado'
import {
  CLASES_DE_MAQUINA,
  ETIQUETA_CLASE,
  ETIQUETA_ESTADO,
  useMaquinaria,
  type ClaseDeMaquina,
  type EstadoMaquina,
  type Maquina,
} from '@/lib/api/maquinaria'
import { useMisPermisos } from '@/lib/api/usuarios'
import { useNavigate } from 'react-router'
import { Chip } from '@/components/ui/Chip'
import { enteros, fecha } from '@/lib/formato'
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
          Number(b.horas_desde_mant) - Number(a.horas_desde_mant),
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
    () => [...new Set(todas.map((m) => m.tipo))].sort((a, b) => a.localeCompare(b, 'es')),
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

  const bloqueantes = todas.filter((m) => m.semaforo === 'BLOQUEANTE' && m.en_la_flota).length
  const pendientes = todas.filter((m) => m.semaforo !== 'OK' && m.en_la_flota).length
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
            CUÁNTAS HAY EN CADA ESTADO, Y DE QUIÉN SON.

            Christopher: «necesitamos que podamos diferenciar mucho más o
            segmentar o filtrar lo que sea de la cantera y de la gobernación.
            Necesitamos tarjetas que cuantifiquen: activo, inactivo, en espera».

            Las dos peticiones son una: la segmentación por dueño manda sobre
            todo lo demás, así que va ARRIBA y las cifras se recalculan debajo.
            Elegir «Gobernación» cambia lo que dicen las tarjetas, no solo lo
            que muestra la lista.

            SON BOTONES Y NO RÓTULOS. Una tarjeta que dice «3 en espera» y no se
            puede pulsar obliga a bajar al desplegable y volver a elegir lo que
            se acaba de leer. Pulsar la que ya está activa la suelta.

            Solo se dibuja el estado que tiene alguna: cinco tarjetas con cuatro
            ceros son cuatro cosas que leer para no enterarse de nada.
          */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {duenos.length > 1 ? (
              <div className="border-hairline mr-1 flex overflow-hidden rounded-lg border">
                {[{ codigo: '', nombre: 'Todas' }, ...(propietarios ?? [])].map((d) => (
                  <button
                    key={d.codigo || 'todas'}
                    type="button"
                    onClick={() => setDueno(d.codigo)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition-colors',
                      dueno === d.codigo
                        ? 'bg-royal-600/12 text-royal-700 dark:text-royal-300'
                        : 'text-ink/55 hover:bg-ink/3',
                    )}
                  >
                    {d.nombre}
                  </button>
                ))}
              </div>
            ) : null}

            {/* El mismo mando para la clase. Solo con más de una: segmentar
                entre una cosa no segmenta nada. */}
            {clases.length > 1 ? (
              <div className="border-hairline mr-1 flex overflow-hidden rounded-lg border">
                {[{ valor: '', etiqueta: 'Todo' }, ...CLASES_DE_MAQUINA.filter((c) =>
                  clases.includes(c.valor),
                )].map((c) => (
                  <button
                    key={c.valor || 'todo'}
                    type="button"
                    onClick={() => setClase(c.valor)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium transition-colors',
                      clase === c.valor
                        ? 'bg-royal-600/12 text-royal-700 dark:text-royal-300'
                        : 'text-ink/55 hover:bg-ink/3',
                    )}
                  >
                    {c.etiqueta}
                  </button>
                ))}
              </div>
            ) : null}

            {/*
              LOS CINCO ESTADOS, TENGAN O NO. Christopher: «incluye las
              averiadas, mantenimiento, retiradas, y eso da un total».

              La primera versión solo dibujaba los que tenían alguna, con el
              argumento de que cuatro ceros son cuatro cosas que leer para no
              enterarse de nada. Estaba mal para lo que se pide: un cero en
              «Averiadas» ES la noticia, y una tarjeta que aparece y desaparece
              obliga a fijarse en cuáles faltan para saber qué no hay.

              Y con las cinco delante, el total cuadra a la vista. Ésa es la
              razón por la que él las quiere todas.
            */}
            {(Object.keys(ETIQUETA_ESTADO) as EstadoMaquina[])
              .map((e) => {
                const activa = filtroEstado === e
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setFiltroEstado(activa ? '' : e)}
                    className={cn(
                      'border-hairline rounded-lg border px-3 py-2 text-left transition-colors',
                      activa ? 'border-royal-600/40 bg-royal-600/8' : 'hover:bg-ink/3',
                    )}
                  >
                    <span
                      className={cn(
                        'tabular block text-xl font-light',
                        e === 'ACTIVA'
                          ? 'text-success'
                          : e === 'FUERA_DE_SERVICIO' || e === 'DESINCORPORADA'
                            ? 'text-danger'
                            : e === 'EN_MANTENIMIENTO'
                              ? 'text-warning'
                              : 'text-ink/80',
                      )}
                    >
                      {porEstado[e]}
                    </span>
                    <span className="text-ink/50 text-2xs">{ETIQUETA_ESTADO[e]}</span>
                  </button>
                )
              })}

            {/*
              EL TOTAL, SEPARADO POR UNA RAYA.

              Es la suma de las cinco de la izquierda, incluidas las retiradas —
              que no están en la flota pero sí están registradas—. Por eso lo
              dice debajo: «registradas» y no «en la flota», que son dos números
              distintos y confundirlos infla el parque.

              No filtra: pulsar «total» es quitar el filtro de estado, y para eso
              está el enlace de quitar filtros.
            */}
            <div className="border-hairline ml-1 rounded-lg border border-dashed px-3 py-2">
              <span className="text-ink/90 tabular block text-xl font-light">
                {delDueno.length}
              </span>
              <span className="text-ink/50 text-2xs">Registradas</span>
            </div>

            {/* Cuando el dueño elegido no tiene ninguna, se dice. Una fila de
                tarjetas que desaparece no explica por qué. */}
            {delDueno.length === 0 ? (
              <p className="text-ink/45 text-sm">
                {dueno ? nombreDeDueno(dueno) : 'La flota'} no tiene
                {clase
                  ? ` ${(ETIQUETA_CLASE[clase as ClaseDeMaquina] ?? clase).toLowerCase()}`
                  : ' máquinas'}{' '}
                registrada{clase === 'MAQUINA' || !clase ? 's' : ''}.
              </p>
            ) : null}
          </div>

          {/* La barra no se pinta si no hay nada que filtrar: con el sistema
              recién arrancado, tres campos vacíos encima de un cartel que dice
              «no hay máquinas» son tres campos que estorban. */}
          {todas.length > 0 ? (
            <Card className="mb-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_190px_190px] lg:grid-cols-[1fr_190px_190px_190px]">
                <Input
                  label="Buscar"
                  icon={<Search />}
                  placeholder="Código, nombre, marca, modelo o serial"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />

                <Select
                  label="Estado"
                  vacio="Las de la flota"
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  opciones={Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => ({
                    valor,
                    etiqueta,
                  }))}
                />

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

                {/* Y el dueño, con el mismo criterio: solo si hay más de uno.
                    Mientras toda la flota sea nuestra, este filtro no tiene nada
                    que separar. */}
                {duenos.length > 1 ? (
                  <Select
                    label="De quién es"
                    vacio="De cualquiera"
                    value={dueno}
                    onChange={(e) => setDueno(e.target.value)}
                    opciones={duenos.map((d) => ({
                      valor: d,
                      etiqueta:
                        (propietarios ?? []).find((x) => x.codigo === d)?.nombre ?? d,
                    }))}
                  />
                ) : null}
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {maquinas.map((m) => {
                const horas = Number(m.horas_desde_mant)
                const tope = Number(m.tope_horas)
                const bloquea = m.semaforo === 'BLOQUEANTE'
                const enTaller = m.mantenimiento_abierto_id !== null

                // Cuánto del intervalo lleva consumido. Se corta en 100 para
                // que la barra no se salga cuando ya se pasó del tope.
                const avance = Math.min((horas / tope) * 100, 100)

                return (
                  <Card
                    key={m.id}
                    className={cn(
                      'flex h-full flex-col border',
                      bloquea ? 'border-danger' : 'border-hairline',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink/45 text-2xs font-mono tracking-[0.14em]">
                          {m.codigo}
                        </p>
                        <h2 className="text-ink/90 mt-1 truncate text-lg font-medium">
                          {m.nombre}
                        </h2>
                        <p className="text-ink/50 mt-0.5 truncate text-xs">
                          {[m.marca, m.modelo].filter(Boolean).join(' ') || 'Sin marca ni modelo'}
                          {m.almacen ? ` · ${m.almacen}` : ''}
                        </p>

                        {/*
                          QUIÉN LA LLEVA.

                          Christopher: «una máquina necesita de un conductor,
                          operador o responsable para funcionar o trasladarse».
                          Con muchas máquinas de viaje, el sitio contesta poco y
                          la persona contesta todo: es a quien se llama.

                          Cuando no hay nadie se dice, y no se calla: una máquina
                          sin conductor asignado es justo la que hay que mirar.
                        */}
                        <p className="text-ink/50 mt-0.5 truncate text-xs">
                          {m.operador ? (
                            <>Lleva la máquina: {m.operador}</>
                          ) : (
                            <span className="text-ink/35">Sin conductor asignado</span>
                          )}
                        </p>

                        {/* Dónde está la máquina ahora. Va debajo del nombre y
                            no junto al semáforo porque son dos cosas
                            distintas: una dice si le toca mantenimiento y la
                            otra si está trabajando. */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Chip
                            tone={
                              m.estado === 'ACTIVA'
                                ? 'success'
                                : m.estado === 'EN_MANTENIMIENTO'
                                  ? 'warning'
                                  : m.estado === 'FUERA_DE_SERVICIO' ||
                                      m.estado === 'DESINCORPORADA'
                                    ? 'danger'
                                    : 'neutral'
                            }
                          >
                            {ETIQUETA_ESTADO[m.estado]}
                          </Chip>

                          {/* Lo de la gobernación se distingue de lo nuestro sin
                              abrir la ficha, con la misma marca que en los
                              almacenes. */}
                          <DeQuienEs propietario={m.propietario} />
                          {m.dias_en_taller !== null ? (
                            <span
                              className={cn(
                                'text-2xs',
                                m.se_paso_en_el_taller ? 'text-warning font-medium' : 'text-ink/45',
                              )}
                            >
                              {m.dias_en_taller === 0
                                ? 'entró hoy'
                                : `${m.dias_en_taller} día${m.dias_en_taller === 1 ? '' : 's'} dentro`}
                              {m.se_paso_en_el_taller ? ' · más de lo previsto' : ''}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <SemaforoMantenimiento estado={m.semaforo} />
                    </div>

                    {/* La barra dice de un vistazo cuánto queda, que es más
                        rápido de leer que restar dos números. */}
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-ink/55 text-xs">Desde el último mantenimiento</span>
                        <span
                          className={cn(
                            'tabular text-sm font-semibold',
                            bloquea ? 'text-danger' : 'text-ink/85',
                          )}
                        >
                          {enteros(horas)} / {enteros(tope)} h
                        </span>
                      </div>
                      <div className="bg-ink/8 mt-2 h-1.5 overflow-hidden rounded-full">
                        <div
                          className={cn(
                            'h-1.5 rounded-full transition-[width] duration-500',
                            m.semaforo === 'BLOQUEANTE'
                              ? 'bg-danger'
                              : m.semaforo === 'ALARMA'
                                ? 'bg-safety'
                                : m.semaforo === 'AVISO'
                                  ? 'bg-warning'
                                  : 'bg-royal-600',
                          )}
                          style={{ width: `${avance}%` }}
                        />
                      </div>
                      <p className="text-ink/45 mt-2 text-xs">
                        {m.ultima_lectura
                          ? `Última lectura: ${fecha(m.ultima_lectura)}`
                          : 'Sin lecturas de horómetro'}
                        {m.ultimo_mantenimiento
                          ? ` · Mantenimiento: ${fecha(m.ultimo_mantenimiento)}`
                          : ' · Sin mantenimientos'}
                      </p>

                      {/* La reparación va aparte del mantenimiento porque
                          responde otra pregunta: no si va al día, sino cada
                          cuánto se está rompiendo. */}
                      {m.reparaciones > 0 ? (
                        <p className="text-ink/45 mt-1 text-xs">
                          {m.reparaciones} reparación{m.reparaciones === 1 ? '' : 'es'}
                          {m.ultima_reparacion
                            ? ` · la última el ${fecha(m.ultima_reparacion)}`
                            : ''}
                        </p>
                      ) : null}
                    </div>

                    <div className="grow" />

                    {puedeEscribir ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="soft"
                          icon={<Gauge />}
                          disabled={enTaller}
                          onClick={() => setHorometro(m)}
                        >
                          Horómetro
                        </Button>
                        <Button
                          size="sm"
                          variant={bloquea || enTaller ? 'primary' : 'outline'}
                          icon={<Wrench />}
                          onClick={() => setTaller(m)}
                        >
                          {enTaller ? 'Sacar del taller' : 'Meter al taller'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<ToggleLeft />}
                          onClick={() => setEstado(m)}
                        >
                          {/* Decia «Estado» a secas, y Christopher tuvo que
                              preguntar «¿que pasa si una maquina ya no funciona
                              o no pertenece a la empresa? ¿como puede sacarse de
                              circulacion?». La respuesta estaba detras de este
                              boton desde el primer dia. Un sustantivo no dice
                              que se puede hacer; un verbo si. */}
                          Cambiar estado
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void navegar(`/app/maquinaria/${m.id}`)}
                        >
                          Editar
                        </Button>
                      </div>
                    ) : null}
                  </Card>
                )
              })}
            </div>
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
