-- ---------------------------------------------------------------------------
-- El organigrama tal como lo mandó dibujado la líder de sistemas
--
-- Se siembra el dibujo y no la nómina, por decisión de Christopher: la nómina
-- se terminará de cargar después y se acomodará a esto.
--
-- Las cuentas del dibujo cuadran en 21 y aquí también: Presidencia y
-- Coordinación General son los «2 de alto nivel»; Administración el
-- administrador; las dos jefas —Recursos Humanos y Finanzas— los «2
-- supervisores»; Servicios Generales el «1 de servicio general»; y luego 5 de
-- cocina, 2 de almacén, 2 de mantenimiento, 2 choferes, 2 motorizados y 2
-- lavaplatos.
--
-- Los `departamento` que se enganchan son los cuatro que hoy coinciden por
-- nombre con lo que la nómina tiene escrito: Cocina, Mantenimiento, Planta y
-- Maquinarias. El resto queda suelto a propósito — que la pantalla diga «sin
-- enlazar» es más útil que enlazarlo a ojo.
--
-- Lo que se ve al abrirlo, y que es el motivo de enseñar las dos cifras: Cocina
-- prevé 7 personas y la nómina tiene 1; Planta y Maquinarias tienen 4 y 3
-- personas que el dibujo no contempla; y SEGURIDAD, con cuatro personas en
-- nómina, no aparece en el organigrama. Eso se corrige editando la pantalla.
-- ---------------------------------------------------------------------------
with pres as (
  insert into public.organigrama_nodos (padre_id, nombre, titular, tipo, cuantos, orden)
  values (null, 'Presidencia', 'Jesús Lozada', 'UNIDAD', 1, 0)
  returning id
), coord as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden)
  select id, 'Coordinación General', 'UNIDAD', 1, 0 from pres
  returning id
), administracion as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden, nota)
  select id, 'Administración', 'UNIDAD', 1, 0, 'Un administrador' from coord
  returning id
), oper as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden)
  select id, 'Operaciones', 'UNIDAD', 0, 1 from coord
  returning id
), rrhh as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden, nota)
  select id, 'Recursos Humanos', 'UNIDAD', 1, 0, 'Una jefa de recursos humanos'
    from administracion
  returning id
), finanzas as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden, nota)
  select id, 'Finanzas', 'UNIDAD', 1, 1, 'Una jefa de administración'
    from administracion
  returning id
), servicios as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden, nota)
  select id, 'Servicios Generales', 'UNIDAD', 1, 0, 'Un jefe' from finanzas
  returning id
), cocina as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden, departamento)
  select id, 'Cocina', 'UNIDAD', 0, 0, 'COCINA' from servicios
  returning id
), almacen as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden)
  select id, 'Almacén', 'UNIDAD', 0, 1 from servicios
  returning id
), personal as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden)
  select id, 'Personal', 'UNIDAD', 0, 2 from servicios
  returning id
), planta as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden, departamento)
  select id, 'Planta', 'UNIDAD', 0, 0, 'OPERACIONES' from oper
  returning id
), maquinarias as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden, departamento)
  select id, 'Maquinarias', 'UNIDAD', 0, 1, 'OPERACION MAQUINARIA' from oper
  returning id
), de_cocina as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden)
  select c.id, x.nombre, 'CARGO', x.cuantos, x.orden
    from cocina c,
         (values ('Cocineros', 2, 0),
                 ('Ayudantes de cocina', 2, 1),
                 ('Coordinador de cocina', 1, 2),
                 ('Lavaplatos', 2, 3)) as x(nombre, cuantos, orden)
  returning id
), de_almacen as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden, departamento)
  select a.id, x.nombre, 'CARGO', x.cuantos, x.orden, x.departamento
    from almacen a,
         (values ('Jefe de almacén', 1, 0, null::text),
                 ('Ayudante de almacén', 1, 1, null),
                 ('Mantenimiento', 2, 2, 'MANTENIMIENTO')) as x(nombre, cuantos, orden, departamento)
  returning id
), de_personal as (
  insert into public.organigrama_nodos (padre_id, nombre, tipo, cuantos, orden)
  select p.id, x.nombre, 'CARGO', x.cuantos, x.orden
    from personal p,
         (values ('Choferes', 2, 0),
                 ('Motorizados', 2, 1)) as x(nombre, cuantos, orden)
  returning id
), pl as (select count(*) as n from planta),
   mq as (select count(*) as n from maquinarias)
select (select count(*) from de_cocina) + (select count(*) from de_almacen)
     + (select count(*) from de_personal) + (select n from pl) + (select n from mq)
       as filas_de_hoja;
