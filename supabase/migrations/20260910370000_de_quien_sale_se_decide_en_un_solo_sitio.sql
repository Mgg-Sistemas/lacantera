/*
  DE QUIÉN SALE SE DECIDE EN UN SOLO SITIO.

  Al cerrar el modelo del dueño dejé un borde abierto y lo dije en el reporte:
  entregar a un trabajador, registrar una salida, dar de baja, anotar un conteo y
  despachar combustible pasan todos por `registrar_movimiento`, así que en un
  almacén con material de dos dueños fallan pidiendo que se diga de cuál — y no
  tienen dónde decirlo.

  Christopher: «mejor solucionamos los detalles mencionados antes de entregar
  este mensaje». Esto es eso.

  ═══════════════════════════════════════════════════════════════════════════
  UN AYUDANTE Y NO CINCO COPIAS
  ═══════════════════════════════════════════════════════════════════════════

  La regla —«si lo dicen, ése; si hay uno solo, ése; si hay varios, se para»— iba
  a hacer falta en cinco puertas. Copiada cinco veces, en seis meses habría cinco
  versiones y una de ellas resolvería distinto.

  Va en `private`, que es donde esta casa pone lo compartido, y
  `registrar_movimiento` pasa a usarlo también: así la regla tiene UNA definición
  y el respaldo de abajo no puede contradecir al aviso de arriba.

  ═══════════════════════════════════════════════════════════════════════════
  EL CERO NO ES UN ERROR AQUÍ
  ═══════════════════════════════════════════════════════════════════════════

  Cuando no hay saldo de nadie devuelve el dueño del almacén en vez de quejarse.
  El «no alcanza» lo da quien llama, que sabe cuánto se pedía y de qué artículo;
  desde aquí solo saldría un mensaje peor.
*/
create or replace function private.dueno_del_saldo(
  p_almacen bigint, p_articulo bigint, p_pedido text
) returns text
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_pedido text := nullif(btrim(coalesce(p_pedido, '')), '');
  v_duenos text[];
begin
  if v_pedido is not null then
    v_pedido := upper(v_pedido);
    if not exists (select 1 from public.propietarios where codigo = v_pedido) then
      raise exception 'Ese dueno no existe: %.', v_pedido using errcode = '22023';
    end if;
    return v_pedido;
  end if;

  select array_agg(distinct t.propietario) into v_duenos
    from (select m.propietario, sum(m.cantidad * m.signo) as saldo
            from public.inventario_movimientos m
           where m.almacen_id = p_almacen and m.articulo_id = p_articulo
           group by m.propietario
          having sum(m.cantidad * m.signo) > 0) t;

  if coalesce(array_length(v_duenos, 1), 0) = 1 then
    return v_duenos[1];
  end if;

  if coalesce(array_length(v_duenos, 1), 0) > 1 then
    raise exception 'Aqui hay material de varios dueños (%): hay que decir de cual sale.',
      array_to_string(v_duenos, ', ')
      using errcode = '22023',
            hint = 'Un mismo sitio puede guardar cosas de la casa y de otro; sacarlas sin decir de quien eran seria inventarlo.';
  end if;

  /* Sin saldo de nadie: el «no alcanza» lo da quien llama, con mejor contexto. */
  return coalesce((select a.propietario from public.almacenes a where a.id = p_almacen),
                  'LACANTERA');
end
$function$;

comment on function private.dueno_del_saldo(bigint, bigint, text) is
  'De quien sale el material de ese sitio: si lo dicen ese, si hay uno solo ese, y si hay varios se para porque adivinar seria inventar de quien era lo que se llevaron. Existe para que la regla tenga UNA definicion: hacia falta en cinco puertas y copiada cinco veces acabaria resolviendo distinto en alguna. Con saldo cero devuelve el dueño del almacen en vez de quejarse: el «no alcanza» lo da quien llama, que sabe cuanto se pedia.';

-- ---------------------------------------------------------------------------
-- Y el escritor del libro usa el mismo ayudante
-- ---------------------------------------------------------------------------
do $escritor$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'registrar_movimiento';

  if position('dueno_del_saldo' in v_def) > 0 then
    raise notice 'el escritor ya usaba el ayudante.';
    return;
  end if;

  v_def := replace(v_def,
'    else
      select array_agg(distinct t.propietario) into v_duenos
        from (select m.propietario, sum(m.cantidad * m.signo) as saldo
                from public.inventario_movimientos m
               where m.almacen_id = p_almacen and m.articulo_id = p_articulo
               group by m.propietario
              having sum(m.cantidad * m.signo) > 0) t;

      if coalesce(array_length(v_duenos, 1), 0) = 1 then
        v_dueno := v_duenos[1];
      elsif coalesce(array_length(v_duenos, 1), 0) > 1 then
        raise exception ''Aqui hay material de varios dueños (%): hay que decir de cual sale.'',
          array_to_string(v_duenos, '', '')
          using errcode = ''22023'',
                hint = ''Un mismo sitio puede guardar cosas de la casa y de otro; sacarlas sin decir de quien eran seria inventarlo.'';
      else
        -- No hay saldo de nadie. El aviso de «no alcanza» lo da quien llama, con
        -- mejor contexto; aqui solo hace falta un dueño valido para el asiento.
        select a.propietario into v_dueno from public.almacenes a where a.id = p_almacen;
        v_dueno := coalesce(v_dueno, ''LACANTERA'');
      end if;
    end if;',
'    else
      -- La regla vive en un solo sitio: ver `private.dueno_del_saldo`.
      v_dueno := private.dueno_del_saldo(p_almacen, p_articulo, null);
    end if;');

  if position('dueno_del_saldo' in v_def) = 0 then
    raise exception 'El anclaje no encajo: no se toca nada.';
  end if;

  execute v_def;  -- misma firma
  raise notice 'el escritor usa el ayudante.';
end $escritor$;

/*
  COMPROBADO EN CALIENTE, con la transacción rodada hacia atrás:

    1 con un solo dueño ..: LACANTERA
    2 con mezcla .........: «Aqui hay material de varios dueños (GOBERNACION,
                             LACANTERA): hay que decir de cual sale.»
    3 diciéndolo .........: GOBERNACION (admite minúsculas)
    4 dueño inventado ....: «Ese dueno no existe: RAPIDO.»
    5 el escritor con mezcla: el mismo rechazo, que es lo que heredan las
                             catorce puertas
*/
