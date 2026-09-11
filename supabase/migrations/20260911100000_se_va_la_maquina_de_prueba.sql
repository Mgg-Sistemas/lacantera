/*
  SE VA LA MÁQUINA DE PRUEBA.

  Christopher: «debemos eliminar de forma muy puntual la máquina RETRO (fue de
  prueba, nos solicitan eliminar pues distorsiona)».

  Era de prueba sin lugar a dudas: código «123», ya desincorporada, con una orden
  de taller cuyo motivo dice «ESTO Y LO OTRO» y 345 USD de costo inventado. Ese
  número salía en el historial de la máquina y en cualquier cuenta de gasto de
  mantenimiento, que es exactamente lo que distorsiona.

  ═══════════════════════════════════════════════════════════════════════════
  QUÉ SE LLEVA POR DELANTE, COMPROBADO ANTES DE BORRAR
  ═══════════════════════════════════════════════════════════════════════════

  Se recorrieron las seis tablas que apuntan a `maquinaria`:

    despachos_combustible ... 0   (y habría BLOQUEADO el borrado, no cascada)
    horometro_lecturas ...... 1   se va: la lectura de prueba, 200 → 300
    mantenimientos .......... 1   se va: MTO-2026-0001, la de «ESTO Y LO OTRO»
    mantenimiento_repuestos . 0   → NINGÚN movimiento de inventario se toca
    maquina_agregados ....... 0
    maquina_fotos ........... 0
    vehiculos ............... 0

  Lo importante es la cuarta línea. Si esa orden hubiera consumido repuestos,
  borrarla habría dejado colgando asientos del libro de inventario — y el libro es
  inmutable, así que ni siquiera se habría podido. No era el caso.

  LA AUDITORÍA NO SE TOCA. Las filas que cuentan lo que se le hizo a esta máquina
  se quedan: son el registro de que existió y de que se borró, y eso es
  precisamente lo que no debe desaparecer.

  ═══════════════════════════════════════════════════════════════════════════
  Y EL CONTADOR VUELVE A CERO
  ═══════════════════════════════════════════════════════════════════════════

  MTO-2026-0001 era la ÚNICA orden de taller que ha existido. Sin devolver el
  contador, la primera orden de verdad sería la 0002 y el historial arrancaría con
  un hueco que nadie podría explicar dentro de un año. Se devuelve solo si no
  queda ninguna orden: con una sola que hubiera, mover el contador crearía un
  número repetido.

  ═══════════════════════════════════════════════════════════════════════════
  EL GUARDIÁN
  ═══════════════════════════════════════════════════════════════════════════

  Se exige que coincidan id, código, nombre Y serial. Un borrado por código a
  secas podría llevarse una máquina de verdad el día que alguien reutilice el
  «123», y este archivo va a correr otra vez cada vez que se reconstruya la base.
  Si algo no cuadra, no toca nada y lo dice.

  Importa más de lo que parece: mientras se escribía esto, el equipo estaba
  cargando la flota real de la gobernación —seis máquinas entre las 10:01 y las
  10:31—. Un borrado laxo las habría encontrado por delante.
*/
do $borrado$
declare
  v_m       public.maquinaria;
  v_vales   int;
  v_repues  int;
  v_ordenes int;
begin
  select * into v_m from public.maquinaria where id = 18;

  if v_m.id is null then
    raise notice 'La maquina de prueba ya no esta. Nada que hacer.';
    return;
  end if;

  if v_m.codigo <> '123' or v_m.nombre <> 'RETRO' or coalesce(v_m.serial, '') <> '23442' then
    raise exception 'La maquina 18 ya no es la de prueba (% · % · %): no se toca nada.',
      v_m.codigo, v_m.nombre, coalesce(v_m.serial, '(sin serial)');
  end if;

  select count(*) into v_vales from public.despachos_combustible where maquina_id = v_m.id;
  if v_vales > 0 then
    raise exception 'Tiene % vales de combustible: eso ya no es de prueba.', v_vales;
  end if;

  select count(*) into v_repues
    from public.mantenimiento_repuestos r
    join public.mantenimientos o on o.id = r.mantenimiento_id
   where o.maquina_id = v_m.id;
  if v_repues > 0 then
    raise exception 'Sus ordenes consumieron % repuestos: borrarla dejaria asientos colgando.', v_repues;
  end if;

  delete from public.maquinaria where id = v_m.id;

  /*
    El contador vuelve solo si no queda ninguna orden. Con una sola que quedara,
    devolverlo crearia un numero repetido la proxima vez.
  */
  select count(*) into v_ordenes from public.mantenimientos;
  if v_ordenes = 0 then
    update public.correlativos set ultimo = 0 where prefijo = 'MTO';
    raise notice 'Borrada, y el contador de ordenes vuelve a cero.';
  else
    raise notice 'Borrada. El contador se queda: todavia hay % ordenes.', v_ordenes;
  end if;
end $borrado$;

/*
  COMPROBADO DESPUÉS, contra la base:

    máquinas que quedan ........... 6   las reales de la gobernación, intactas
    lecturas de horómetro ......... 0
    órdenes de taller ............. 0
    contador MTO .................. 0   la próxima será MTO-2026-0001
    movimientos de inventario ..... 51  los mismos que antes, ni uno menos
    auditoría de la máquina 18 .... 7   se queda, que para eso está
*/
