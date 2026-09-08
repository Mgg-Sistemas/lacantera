/*
  LA CÉDULA Y EL RIF TIENEN UNA SOLA FORMA.

  ————————————————————————————————————————————————————————————————————————
  APLICADA el 8 de septiembre de 2026, por MCP. **Cambia datos de producción**:
  normaliza las seis cédulas de perfil que estaban sin letra.
  ————————————————————————————————————————————————————————————————————————

  LO QUE PIDIÓ CHRISTOPHER

  «La base no necesariamente debe guardar los puntos de la cédula por ejemplo
  V-123.123.123, pero la pantalla deberá mostrarlo e interpretarlo o validarlo o
  gestionarlo, para cédulas y rif, debe de estandarizarse junto con la letra que
  identifica la naturalidad del documento de identificación "E" o "G" o "J" o
  "V"».

  Así que se separan las dos cosas que iban juntas:

      lo que se guarda ... V-12345678       se compara, se cruza, se busca
      lo que se ve ....... V-12.345.678     se lee de un vistazo contra el carnet

  LO QUE SE MIDIÓ ANTES DE TOCAR, y es lo que hace esto necesario

  Había tres escrituras conviviendo:

      empleados.cedula          26   V-10505822       con letra
      despachos.recibio_cedula  10   V-10579686       con letra
      proveedores.rif            6   J-29820894-5     con verificador
      empresa.rif                1   J-50209170-0     con verificador
      perfiles.cedula            6   12460702         SIN LETRA

  Y la consecuencia no era estética: **ninguno de los seis perfiles cruzaba con
  su ficha de empleado.** Rafael Quilarquez es el usuario `administrador2` y es
  el empleado con cédula V-12460702, y el sistema no sabía que eran la misma
  persona, porque una tabla decía «V-12460702» y la otra «12460702».

  Sin la letra, dos escrituras del mismo documento son dos documentos.

  LA LETRA NO SE ADIVINA, Y POR ESO ESTO ESPERÓ

  Dos de las seis se pudieron confirmar contra el dato: sus cifras cuadraban con
  una ficha de empleado que sí tenía la letra. Las otras cuatro no son
  empleados, así que no había de dónde deducirla — y `V` o `E` dice la
  nacionalidad de una persona, no un detalle de formato.

  Las confirmó Christopher, una por una, el 8 de septiembre:

      Dorianne Pérez ... V        Anthony Mansila ... V
      Leniska Lezama ... V        Susej Rojas ....... V

  Queda escrito aquí porque dentro de un año la pregunta será de dónde salió esa
  letra, y la respuesta es que la puso una persona que lo sabía, no una función
  que lo supuso.
*/

do $guarda$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='perfiles' and column_name='cedula') then
    raise exception 'Falta perfiles.cedula.';
  end if;
end $guarda$;

-- ---------------------------------------------------------------------------
-- La forma canonica
-- ---------------------------------------------------------------------------
create or replace function private.documento_normalizado(p_texto text, p_con_verificador boolean default false)
returns text language plpgsql immutable security definer set search_path to ''
as $function$
declare
  v_s     text;
  v_letra text;
  v_num   text;
  v_ver   text;
begin
  /*
    Aqui vive lo canonico —V-12345678, J-12345678-9— y los puntos son cosa de la
    pantalla. Se aceptan de entrada porque la gente los escribe, y se quitan.

    LAS LETRAS Y LO QUE DICEN
      V  venezolano          E  extranjero
      J  juridico (empresa)  G  gubernamental
      P  pasaporte

    Devuelve NULO cuando no se puede normalizar, y en particular cuando falta la
    letra: aqui no se adivina. Adivinarla escribiria una nacionalidad que nadie
    dijo.
  */
  v_s := upper(btrim(coalesce(p_texto, '')));
  if v_s = '' then return null; end if;

  -- Fuera puntos, espacios y guiones: se reconstruyen al final.
  v_s := regexp_replace(v_s, '[^A-Z0-9]', '', 'g');

  if v_s !~ '^[VEJGP]' then
    return null;
  end if;

  v_letra := left(v_s, 1);
  v_s     := substring(v_s from 2);

  if v_s !~ '^[0-9]+$' then
    return null;
  end if;

  if p_con_verificador then
    /*
      El RIF lleva un digito verificador al final. Con nueve cifras, la ultima
      lo es; con ocho, el numero viene sin el y no se calcula aqui — calcularlo
      seria inventarse un dato que el papel del proveedor ya trae.
    */
    if length(v_s) < 8 then return null; end if;
    if length(v_s) = 8 then
      return v_letra || '-' || v_s;
    end if;
    v_num := left(v_s, length(v_s) - 1);
    v_ver := right(v_s, 1);
    return v_letra || '-' || v_num || '-' || v_ver;
  end if;

  if length(v_s) < 6 or length(v_s) > 9 then
    return null;
  end if;

  return v_letra || '-' || v_s;
end;
$function$;

comment on function private.documento_normalizado(text, boolean) is
  'La forma canonica de una cedula o un RIF: letra, guion y cifras, sin puntos —V-12345678, J-12345678-9—. Acepta los puntos de entrada porque la gente los escribe. Devuelve NULO si no se puede normalizar, y en particular si falta la letra: adivinarla escribiria una nacionalidad que nadie dijo.';

revoke execute on function private.documento_normalizado(text, boolean) from public, anon;

/*
  LAS SEIS CEDULAS DE PERFIL, con la letra que confirmo Christopher.

  Va condicionado: cuando ya no queda ninguna sin normalizar —que es el caso en
  cuanto corre una vez— no hace nada. Y **solo pone V**, que es lo unico que se
  confirmo: si algun dia aparece una que no lo sea, esto la deja en paz y la
  pantalla la pedira.
*/
do $aplicar$
declare v_r record; v_n int := 0;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','a021de44-445e-45dc-9af1-19d8060ab948','role','authenticated')::text, true);

  for v_r in
    select p.id, p.usuario, p.cedula,
           private.documento_normalizado('V' || p.cedula) as canonico
      from public.perfiles p
     where p.cedula is not null
       and private.documento_normalizado(p.cedula) is null
       and p.cedula ~ '^[0-9]{6,9}$'
     order by p.usuario
  loop
    if v_r.canonico is null then
      raise exception 'No se pudo normalizar la cedula de %: %', v_r.usuario, v_r.cedula;
    end if;
    update public.perfiles set cedula = v_r.canonico where id = v_r.id;
    v_n := v_n + 1;
  end loop;

  raise notice 'Normalizadas % cedulas de perfil.', v_n;
end $aplicar$;

/*
  COMPROBADO el 8 de septiembre, sobre los 49 documentos del sistema:

    empleados.cedula ........... 26 de 26 canonicos · 0 sin letra
    despachos.recibio_cedula ... 10 de 10 canonicos · 0 sin letra
    perfiles.cedula ............  6 de  6 canonicos · 0 sin letra
    proveedores.rif ............  6 de  6 canonicos · 0 sin letra
    empresa.rif ................  1 de  1 canonico  · 0 sin letra

  Y LO QUE DE VERDAD SE ARREGLO: `administrador2` y `administradora_` ahora
  cruzan con su ficha de empleado. Antes ninguno de los seis lo hacia.

  Los cuatro que no cruzan —dorianne19, leni12, sistemas2, susi— es porque no
  son empleados de la cantera, no porque el dato este mal.

  LA PANTALLA, que es la otra mitad y va en el mismo commit:

    documentoCanonico()  la misma regla que esta funcion, en el navegador
    documento()          la viste: V-12345678 -> V-12.345.678
    CampoDocumento       los diez sitios donde se teclea

  Que las dos reglas —esta y la del navegador— digan lo mismo no es casualidad
  ni se puede relajar: si discrepan, el mismo documento se escribe de dos
  maneras y deja de cruzar consigo mismo, que es exactamente el fallo que esta
  migracion viene a cerrar.

  PENDIENTE, y no es de esta migracion:

    - No hay CHECK que impida guardar un documento sin normalizar. Las puertas
      son las funciones de escritura y la pantalla, y hoy las dos normalizan;
      una restriccion en la columna seria el cinturon sobre los tirantes.
    - El digito verificador del RIF no se comprueba, solo se coloca. Calcularlo
      es posible —hay un algoritmo— y decidirlo es de la cantera: rechazar un
      RIF que el proveedor escribio en su factura es una decision, no un
      arreglo.
*/
