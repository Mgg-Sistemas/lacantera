-- ---------------------------------------------------------------------------
-- Cada quien guarda su firma
--
-- Christopher: «cada usuario debería poder guardar su propia firma digital (ya
-- sea a mano estilo drawing en un canvas, o tecleado y estilizado con algún
-- tipo de letra o cargando una imagen de su firma)».
--
-- Hoy los papeles del sistema —orden de compra, comprobante de pago, acta de
-- conteo, recibo— salen con una raya y debajo «Firma autorizada». Se imprimen
-- para firmarlos a mano y se vuelven a escanear. Con la firma guardada, el
-- papel sale ya firmado por quien lo emitió.
--
-- POR QUÉ LA IMAGEN VA EN LA TABLA Y NO EN EL BUCKET
--
-- Los papeles se arman en el navegador. Una firma en el bucket obligaría a
-- pedir una URL firmada a mitad de armar cada PDF: una espera más, un fallo
-- más que atender, y un papel que a veces sale con firma y a veces sin ella
-- según cómo venga la red. En la tabla viaja con el resto de los datos.
--
-- Cabe de sobra: una firma en PNG recortada ronda los 10 KB. El tope de 200 KB
-- deja margen para una foto de firma sin permitir que alguien meta aquí un
-- documento escaneado a página completa.
--
-- QUIÉN VE LAS FIRMAS
--
-- Todos los que entran al sistema. Es deliberado, y tiene su contrapartida:
-- una firma guardada es copiable por cualquiera que la vea, así que esto NO
-- prueba que alguien firmó — prueba que alguien con su usuario emitió el
-- papel. Lo que da fe es el registro de auditoría, no el dibujo.
--
-- Hace falta que sea legible para todos porque el que imprime una orden no es
-- siempre el que la aprobó: compras imprime lo que firmó el gerente. Si cada
-- quien solo viera la suya, el papel saldría firmado solo cuando lo imprime su
-- propio autor, que es casi nunca.
--
-- QUIÉN LA ESCRIBE
--
-- Solo su dueño, y por eso la función no recibe a quién: la saca de la sesión.
-- Recibirla como parámetro es la puerta para que alguien guarde una firma en
-- nombre de otro, que es exactamente lo que no puede pasar aquí.
-- ---------------------------------------------------------------------------

create table if not exists public.firmas (
  perfil_id     uuid primary key references public.perfiles(id) on delete cascade,

  -- El PNG completo como data URL, listo para meterlo en el papel sin más
  -- vueltas. Se guarda con fondo transparente: así se estampa sobre la raya
  -- del documento en vez de taparla con un rectángulo blanco.
  imagen        text not null,

  -- Cómo la hizo. No cambia nada de lo que se imprime; sirve para saber qué
  -- ofrecerle la próxima vez que la abra, y para entender qué eligió la gente
  -- cuando toque decidir si los tres modos valen la pena.
  origen        text not null check (origen = any (array['DIBUJADA', 'TECLEADA', 'IMAGEN'])),

  actualizada_en timestamptz not null default now(),

  constraint firmas_imagen_es_png check (imagen like 'data:image/png;base64,%'),
  constraint firmas_imagen_cabe   check (length(imagen) between 200 and 200000)
);

comment on table public.firmas is
  'La firma de cada quien, para que los papeles salgan firmados. No prueba que '
  'la persona firmó: prueba que su usuario emitió el papel. Lo que da fe es la '
  'auditoría.';

alter table public.firmas enable row level security;

-- Se lee toda porque el que imprime no suele ser el que firmó.
drop policy if exists firmas_lectura on public.firmas;
create policy firmas_lectura on public.firmas
  for select to authenticated
  using (true);

revoke insert, update, delete on public.firmas from authenticated;

-- La auditoría, como toda tabla nueva. Y con el nombre de la clave: `auditar()`
-- recorre `TG_ARGV` para saber cómo se identifica cada fila, y sin argumento
-- ese recorrido revienta con «FOREACH expression must not be null» — que no se
-- lee como un disparador mal declarado, se lee como que guardar la firma
-- devuelve 400. Costó un intento averiguarlo.
--
-- No lleva `trg_normalizar`: la normalización pone el texto en mayúscula, y
-- aquí el único texto es un PNG en base64. Pasarlo por mayúsculas lo
-- destruiría, porque base64 distingue mayúsculas de minúsculas.
drop trigger if exists trg_auditar on public.firmas;
create trigger trg_auditar
  after insert or update or delete on public.firmas
  for each row execute function private.auditar('perfil_id');

-- ---------------------------------------------------------------------------
-- Guardarla
-- ---------------------------------------------------------------------------
create or replace function public.guardar_mi_firma(
  p_imagen text,
  p_origen text
) returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_yo uuid := auth.uid();
begin
  if v_yo is null then
    raise exception 'No hay sesión.' using errcode = '28000';
  end if;

  if p_imagen is null or p_imagen not like 'data:image/png;base64,%' then
    raise exception 'La firma tiene que llegar como imagen PNG.' using errcode = '22023';
  end if;

  -- El tope se comprueba aquí además de en el CHECK para poder decir por qué,
  -- con el tamaño en kilobytes. Un mensaje de restricción violada nombra la
  -- columna y no ayuda a nadie a arreglarlo.
  if length(p_imagen) > 200000 then
    raise exception 'La imagen de la firma pesa % KB y el tope son 195 KB. Recórtala para que quede solo el trazo, sin el resto de la hoja.',
      round(length(p_imagen) / 1024.0)
      using errcode = '22023';
  end if;

  if length(p_imagen) < 200 then
    raise exception 'La firma llegó vacía. Dibújala, escríbela o carga una imagen antes de guardar.'
      using errcode = '22023';
  end if;

  if p_origen is null or p_origen not in ('DIBUJADA', 'TECLEADA', 'IMAGEN') then
    raise exception 'Origen de firma desconocido: %.', coalesce(p_origen, 'nulo')
      using errcode = '22023';
  end if;

  insert into public.firmas (perfil_id, imagen, origen)
  values (v_yo, p_imagen, p_origen)
  on conflict (perfil_id) do update
    set imagen = excluded.imagen,
        origen = excluded.origen,
        actualizada_en = now();
end;
$func$;

comment on function public.guardar_mi_firma(text, text) is
  'Guarda la firma de quien está en sesión. No recibe a quién a propósito: la '
  'saca del token, para que nadie pueda guardar una firma en nombre de otro.';

revoke execute on function public.guardar_mi_firma(text, text) from public, anon;
grant  execute on function public.guardar_mi_firma(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quitarla
-- ---------------------------------------------------------------------------
create or replace function public.quitar_mi_firma()
returns void
language plpgsql
security definer
set search_path to ''
as $func$
declare
  v_yo uuid := auth.uid();
begin
  if v_yo is null then
    raise exception 'No hay sesión.' using errcode = '28000';
  end if;

  delete from public.firmas where perfil_id = v_yo;
end;
$func$;

comment on function public.quitar_mi_firma() is
  'Borra la firma propia. Los papeles ya emitidos no cambian: llevan la imagen '
  'que tenían cuando se armaron.';

revoke execute on function public.quitar_mi_firma() from public, anon;
grant  execute on function public.quitar_mi_firma() to authenticated;
