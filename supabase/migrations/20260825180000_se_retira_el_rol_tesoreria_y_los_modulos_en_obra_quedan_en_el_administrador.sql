-- ---------------------------------------------------------------------------
-- Se retira el rol TESORERIA, y los módulos en obra quedan en el administrador
--
-- Segunda mitad de la absorción. La anterior movió las rejas; esta mueve las
-- casillas que las nombran, retira el rol y deja los cinco módulos que todavía
-- no se ofrecen con el nivel que les corresponde: ninguno, salvo administración.
--
-- POR QUÉ LOS CINCO MÓDULOS. Christopher: «hay módulos que están ocultos, por
-- lo tanto no deberían mostrarse visualmente en la matriz para mantener la
-- coherencia; solo admin/sistema deberá tener acceso total, el resto vacío
-- mientras esté en desarrollo». Son los que el menú esconde con `fueraDelMvp`:
--
--   Explotación · Asignaciones · Despachos · Ventas · Tesorería
--
-- La matriz enseñaba los niveles de cinco módulos que nadie puede abrir. Peor:
-- los enseñaba REPARTIDOS, así que quien la leyera creería que Almacén trabaja
-- en Despachos y que Ventas factura. La pantalla decía una cosa y el menú otra.
--
-- Lo que se vacía no se pierde: `rol_permisos` lleva `trg_auditar`, así que la
-- fila vieja de cada uno queda en el registro y el día que un módulo salga a
-- producción se puede leer con qué niveles estaba y devolverlos tal cual.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Las dos casillas de tesorería que viven en pantallas activas se mudan
--
-- «Pagos» y «Por pagar» cuelgan de /app/tesoreria pero el menú las ofrece desde
-- Compras, y `navigation.ts` ya las mapea al módulo COMPRAS. Eran las únicas
-- dos casillas de TESORERIA que gobernaban algo que se usa. Se mudan de módulo
-- de verdad, con código nuevo: el código lleva el módulo delante y dejarlo
-- diciendo TESORERIA sería mentir en la pantalla que las enseña.
--
-- No se renombra la fila con un UPDATE porque `rol_acciones.accion` apunta al
-- código sin `on update cascade`: se insertan las nuevas, se siembran, y las
-- viejas se borran arrastrando sus casillas por el `on delete cascade`.
-- ---------------------------------------------------------------------------
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente) values
  ('COMPRAS.PAGAR_INSTRUCCION', 'COMPRAS', 'Sacar el dinero para pagar una compra',
   'El dinero sale de la cuenta que se elija, y si la instrucción lleva IGTF sale también ese impuesto. La orden solo pasa a pagada cuando no le queda nada por deber. Se pueden marcar varias a la vez si salen todas de la misma cuenta y están en su misma moneda.',
   125, 'TOTAL'),
  ('COMPRAS.DEVOLVER_INSTRUCCION', 'COMPRAS', 'Devolver un pago mal armado a quien lo indicó',
   'El pago no se hace y la orden vuelve al paso de indicar cómo se paga. Hay que escribir qué estaba mal, porque es lo único que va a leer quien lo corrija.',
   126, 'TOTAL')
on conflict (codigo) do update
  set modulo = excluded.modulo, nombre = excluded.nombre, dice = excluded.dice,
      orden = excluded.orden, nivel_equivalente = excluded.nivel_equivalente;

insert into public.rol_acciones (rol, accion) values
  ('COMPRAS', 'COMPRAS.PAGAR_INSTRUCCION'),
  ('COMPRAS', 'COMPRAS.DEVOLVER_INSTRUCCION')
on conflict (rol, accion) do nothing;

delete from public.acciones
 where codigo in ('TESORERIA.PAGAR_INSTRUCCION', 'TESORERIA.DEVOLVER_INSTRUCCION');

-- ---------------------------------------------------------------------------
-- 2. Las tres casillas cuya reja cambió de rol
--
-- Los niveles NO se escriben a ojo: salen de medir la reja nueva contando la
-- equivalencia, igual que en el catálogo.
--
--   resolver_desistimiento  exigir_rol(GERENTE_GENERAL, COMPRAS)
--                           COMPRAS equivale a COMPRAS:TOTAL, y la casilla es
--                           de COMPRAS -> nivel TOTAL + semilla del gerente
--
--   pagar_nomina            exigir_rol(RRHH, GERENTE_GENERAL)
--                           RRHH equivale a NOMINA:ESCRITURA, y la casilla es
--                           de NOMINA -> nivel ESCRITURA + semilla del gerente
--
--   adjuntar/quitar papel   tiene_rol(ADMIN, COMPRAS, ALMACEN), que es literal
--                           y no consulta equivalencias -> nivel nulo, semillas
-- ---------------------------------------------------------------------------
update public.acciones
   set nivel_equivalente = 'TOTAL',
       dice = 'Decide qué pasó con la plata: la devolvieron, queda a favor para otra compra, o se da por perdida. Es lo que cierra el caso y lo que van a decir las cuentas para siempre.'
 where codigo = 'COMPRAS.RESOLVER_DESISTIMIENTO';

update public.acciones
   set nivel_equivalente = 'ESCRITURA',
       dice = 'Saca el neto de una cuenta de verdad y cierra el período. Una nómina pagada ya no se puede anular ni reversar: lo que salga mal se corrige en el período siguiente. La paga quien lleva la nómina.'
 where codigo = 'NOMINA.PAGAR_NOMINA';

insert into public.rol_acciones (rol, accion) values
  ('COMPRAS',          'COMPRAS.RESOLVER_DESISTIMIENTO'),
  ('GERENTE_GENERAL',  'NOMINA.PAGAR_NOMINA'),
  ('RRHH',             'NOMINA.PAGAR_NOMINA')
on conflict (rol, accion) do nothing;

-- El ejemplo del texto era, precisamente, el rol que se va.
update public.acciones
   set dice = 'Solo si ya no lo tiene nadie. Los roles que el sistema nombra por dentro no se dejan borrar: sin COMPRAS, por ejemplo, nadie podría volver a pagarle a un proveedor.'
 where codigo = 'USUARIOS.ELIMINAR_ROL';

-- ---------------------------------------------------------------------------
-- 3. Los cinco módulos en obra: solo el administrador
-- ---------------------------------------------------------------------------
update public.rol_permisos
   set nivel = 'NINGUNO'
 where modulo in ('EXPLOTACION', 'ASIGNACIONES', 'DESPACHOS', 'VENTAS', 'TESORERIA')
   and rol <> 'ADMIN'
   and nivel <> 'NINGUNO';

delete from public.rol_acciones ra
 using public.acciones a
 where a.codigo = ra.accion
   and a.modulo in ('EXPLOTACION', 'ASIGNACIONES', 'DESPACHOS', 'VENTAS', 'TESORERIA');

-- ---------------------------------------------------------------------------
-- 4. Y ahora sí, el rol
--
-- Se va de las tres cuentas que lo llevaban. Las dos que no son la del
-- administrador —Leniska y Susej— tienen además ALMACEN, COMPRAS, OPERACIONES
-- y RRHH, y con esos cuatro conservan todo lo que este les abría: pagar una
-- orden (por COMPRAS), devolver una instrucción (por COMPRAS), cerrar un
-- desistimiento (por COMPRAS) y pagar la nómina (por RRHH). Comprobado cuenta
-- por cuenta antes de borrar, no después.
--
-- Lo demás que abría —cuentas, aperturas, ajustes, traslados, reversos— es del
-- módulo en obra y queda parado para todos menos administración, que es lo
-- pedido.
--
-- El borrado va directo y no por public.eliminar_rol a propósito: esa función
-- se niega con los roles del sistema, y con razón, porque está pensada para que
-- nadie borre TESORERIA por accidente desde la pantalla. Aquí es a propósito.
-- ---------------------------------------------------------------------------
delete from public.usuarios_roles where rol = 'TESORERIA';
delete from public.rol_permisos   where rol = 'TESORERIA';
delete from public.roles          where codigo = 'TESORERIA';
