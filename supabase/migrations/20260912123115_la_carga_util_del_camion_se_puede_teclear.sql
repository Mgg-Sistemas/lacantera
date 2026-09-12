/*
  La carga util del camion se puede teclear.

  ═══════════════════════════════════════════════════════════════════════════
  EL PROBLEMA QUE CIERRA
  ═══════════════════════════════════════════════════════════════════════════

  Los viajes se cargan y el total de metros cubicos sale en cero. La pantalla
  lo dice —«esos camiones no tienen carga util cargada»— pero no habia donde
  ponersela: la columna existe en la tabla desde la migracion de los viajes,
  la funcion `fijar_carga_util` existe y esta concedida, y ninguna pantalla
  podia leer el valor porque `v_vehiculos` no lo devolvia. Quedo a medio
  camino.

  ═══════════════════════════════════════════════════════════════════════════
  POR QUE NO SE USA LA CAPACIDAD Y YA
  ═══════════════════════════════════════════════════════════════════════════

  Porque son dos numeros distintos y confundirlos infla la produccion. La
  capacidad es lo que le cabe al camion; la carga util es lo que de verdad
  trae, y los supervisores la miden por paladas del jumbo. Siempre va por
  debajo de la capacidad —de ahi la restriccion que ya tiene la columna—, y
  dar por sentado que un camion de 14 m3 baja 14 m3 en cada viaje es contar
  material que nunca salio de la mina.

  ═══════════════════════════════════════════════════════════════════════════
  LA COLUMNA VA AL FINAL Y NO DONDE TOCARIA
  ═══════════════════════════════════════════════════════════════════════════

  Su sitio natural es al lado de `capacidad_ton`. Pero `create or replace
  view` solo deja anadir columnas al final: cambiarlas de orden obliga a
  soltar la vista, y de esta cuelgan otras. La vista se lee por nombre, asi
  que el orden no le importa a nadie salvo a quien lea este archivo.
*/

create or replace view public.v_vehiculos as
  select v.id,
         v.placa,
         v.tipo,
         v.descripcion,
         v.capacidad_m3,
         v.capacidad_ton,
         v.propio,
         v.transportista,
         v.maquina_id,
         v.activo,
         v.nota,
         m.codigo   as maquina_codigo,
         m.nombre   as maquina,
         m.semaforo as semaforo_mantenimiento,
         m.horas_desde_mant,
         m.tope_horas,
         ch.chofer  as chofer_actual,
         ch.cedula  as cedula_chofer_actual,
         ch.desde   as chofer_desde,
         ch.id      as asignacion_chofer_id,
         -- Lo que de verdad trae, no lo que le cabe. Ver la cabecera.
         v.carga_util_m3
    from public.vehiculos v
    left join public.v_maquinaria m
      on m.id = v.maquina_id
    left join public.v_vehiculo_choferes ch
      on ch.vehiculo_id = v.id
     and ch.vigente;

-- `create or replace` conserva las opciones, pero esto no se deduce leyendo:
-- se deja escrito para que la vista diga en voz alta que respeta la reja de
-- quien pregunta y no la de quien la creo.
alter view public.v_vehiculos set (security_invoker = on);

comment on view public.v_vehiculos is
  'Los vehiculos con su ficha de maquinaria, su chofer vigente y su carga util.';
