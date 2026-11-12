/*
  EL HORÓMETRO Y EL KILOMETRAJE DEJAN DE SER OBLIGATORIOS AL SURTIR (12/11/2026).

  Pedido: «Pon toda esa sección de horómetros y odómetros opcional, ya que aún
  no se está llevando el control por horómetros».

  Se quita SOLO la exigencia de que venga. Lo que se escriba sigue revisado
  igual: el horómetro y el kilometraje no retroceden (esas comparaciones con
  un valor vacío dan nulo y no disparan), y la tabla ya los admitía vacíos.
  El día que se empiece a llevar el control, se vuelve a exigir aquí.

  Dos funciones lo exigían:
    · private.despachar_combustible_nucleo — el surtido nuevo.
    · public.corregir_despacho_combustible — la corrección de uno ya hecho.

  Se reescriben desde su propia definición en la base, cambiando solo ese
  bloque y comprobando que estaba (si alguien la cambió antes, esto falla en
  vez de pisar su versión).
*/

do $migracion$
declare
  v_def text;
  v_nuevo text;
  c_nucleo_viejo constant text := $v$    -- EL HORÓMETRO ES OBLIGATORIO SI HAY MÁQUINA. Desde el 10/11/2026 un
    -- vehículo puede traer el kilometraje en su lugar: lleva odómetro, no
    -- horómetro, y exigírselo lo trababa.
    if p_horometro is null and not (v_maq.clase = 'VEHICULO' and p_km is not null) then
      raise exception 'Hace falta el horómetro de "%" para surtirla.', v_maq.nombre
        using errcode = '23514',
              hint = 'Es la lectura del tablero al echarle. No reinicia nada: queda anotada en el vale.';
    end if;
$v$;
  c_nucleo_nuevo constant text := $v$    -- EL HORÓMETRO YA NO ES OBLIGATORIO (12/11/2026): todavía no se lleva
    -- el control por horómetro. Si viene, se revisa abajo que no retroceda.
$v$;
  c_corregir_viejo constant text := $v$    if p_horometro is null then
      raise exception 'Hace falta el horómetro de "%".', v_maq.nombre using errcode = '23514';
    end if;
$v$;
  c_corregir_nuevo constant text := $v$    -- El horómetro ya no es obligatorio (12/11/2026); si viene, no retrocede.
$v$;
begin
  v_def := pg_get_functiondef('private.despachar_combustible_nucleo(bigint,bigint,numeric,text,text,bigint,text,numeric,bigint,text,text,date,text,text,numeric)'::regprocedure);
  if position(c_nucleo_viejo in v_def) = 0 then
    raise exception 'despachar_combustible_nucleo no tiene el bloque esperado: alguien la cambió. Revisar a mano.';
  end if;
  v_nuevo := replace(v_def, c_nucleo_viejo, c_nucleo_nuevo);
  execute v_nuevo;

  v_def := pg_get_functiondef('public.corregir_despacho_combustible(bigint,numeric,text,text,bigint,text,numeric,bigint,text,text,date,text,text)'::regprocedure);
  if position(c_corregir_viejo in v_def) = 0 then
    raise exception 'corregir_despacho_combustible no tiene el bloque esperado: alguien la cambió. Revisar a mano.';
  end if;
  v_nuevo := replace(v_def, c_corregir_viejo, c_corregir_nuevo);
  execute v_nuevo;
end
$migracion$;
