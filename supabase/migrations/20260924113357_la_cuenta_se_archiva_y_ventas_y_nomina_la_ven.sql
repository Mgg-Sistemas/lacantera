-- LA CUENTA SE ARCHIVA, NO SE BORRA; Y VENTAS Y NÓMINA LA VEN (24/09/2026)
--
-- Christopher: «dentro de tesorería / cajas y bancos, sean editables o que
-- pueda eliminarlos… no eliminarlos, sino archivarlos». Y: «necesito que
-- compra y venta use los bancos de tesorería, o que pueda reflejar o
-- seleccionar un banco».
--
-- Editar ya existía. Archivar también, escondido como la casilla «activa»
-- dentro de Editar: nadie la encontraba. Ahora es una acción propia, con su
-- regla y su confirmación.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUÉ ARCHIVAR Y NO BORRAR
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Una cuenta con movimientos es la contraparte de cada línea del libro, de
-- cada cobro y de cada pago. Borrarla dejaría asientos apuntando a nada.
-- Archivada, deja de salir en los selectores y en el disponible, pero el
-- libro sigue contando su historia.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CON SALDO NO SE ARCHIVA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El disponible suma solo cuentas activas. Archivar una con saldo haría
-- desaparecer ese dinero del total sin que nadie lo moviera: primero se
-- traslada o se ajusta, y después se archiva. Con saldo cero, el archivo no
-- cambia ningún número.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- QUIÉN VE LAS CUENTAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La lectura estaba abierta solo a Tesorería y Compras. Pero el cobro de una
-- factura ya pide la cuenta donde entra el dinero, y el pago de la nómina la
-- cuenta de donde sale: quien solo tiene Facturación o solo Nómina abría el
-- selector y lo encontraba vacío. Se les abre la lectura. Escribir sigue
-- siendo de Tesorería.

create or replace function public.archivar_cuenta(p_id bigint, p_archivar boolean default true)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_c     public.cuentas_tesoreria;
  v_saldo numeric;
begin
  perform private.exigir_permiso('TESORERIA', 'TOTAL');

  select * into v_c from public.cuentas_tesoreria where id = p_id;
  if v_c.id is null then
    raise exception 'No existe esa cuenta.' using errcode = 'P0002';
  end if;

  if p_archivar then
    if not v_c.activa then
      raise exception '«%» ya está archivada.', v_c.nombre using errcode = '55000';
    end if;

    v_saldo := private.saldo_cuenta(p_id);
    if v_saldo <> 0 then
      raise exception '«%» tiene % % y no se archiva con saldo. Trasládalo a otra cuenta o ajústalo a cero primero.',
        v_c.nombre, private.cantidad_es(v_saldo), v_c.moneda
        using errcode = '55000';
    end if;

    update public.cuentas_tesoreria set activa = false where id = p_id;
  else
    if v_c.activa then
      raise exception '«%» no está archivada.', v_c.nombre using errcode = '55000';
    end if;
    update public.cuentas_tesoreria set activa = true where id = p_id;
  end if;
end;
$$;

comment on function public.archivar_cuenta is
  'Archiva (activa = false) o desarchiva una cuenta de tesorería. No se archiva con saldo: primero se traslada o se ajusta. Nada se borra.';

revoke all on function public.archivar_cuenta(bigint, boolean) from public, anon;
grant execute on function public.archivar_cuenta(bigint, boolean) to authenticated;

-- ─────────────────────────────────────────── la lectura se abre

drop policy if exists cuentas_tesoreria_lectura on public.cuentas_tesoreria;
create policy cuentas_tesoreria_lectura on public.cuentas_tesoreria
  for select to authenticated
  using (
    private.tiene_permiso('TESORERIA', 'LECTURA')
    or private.tiene_permiso('COMPRAS', 'LECTURA')
    or private.tiene_permiso('FACTURACION', 'LECTURA')
    or private.tiene_permiso('NOMINA', 'ESCRITURA')
  );
