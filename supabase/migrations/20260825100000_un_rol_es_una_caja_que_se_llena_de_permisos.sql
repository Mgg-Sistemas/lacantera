-- ---------------------------------------------------------------------------
-- Un rol es una caja que se llena de permisos
--
-- Christopher, por la líder:
--
--   «Deseamos que un módulo se pueda visualizar, pero no modificar (sin
--    botones), o que se pueda gestionar de forma limitada. Al crear un rol
--    estamos creando un título o caja que se llenará de permisos, donde quizás
--    pueda ver la configuración —datos de la empresa, documentos— pero quizás
--    no pueda crear o editar, o quizás pueda ver esos dos y no pueda descargar
--    un respaldo de la base»
--
-- Lo que hay hoy ya está segmentado por módulo, y por eso el pedido despista al
-- principio. Lo que falta no es segmentación: es FINURA. La escalera tiene
-- cuatro escalones —ninguno, lectura, escritura, total— y son los mismos para
-- los quince módulos. «Ver la empresa pero no editarla, y tampoco el respaldo»
-- no cabe ahí: son tres decisiones distintas y la escalera solo ofrece una.
--
-- =========================================================================
-- CADA COSA QUE SE PUEDE HACER TIENE NOMBRE
-- =========================================================================
--
-- En vez de un nivel por módulo, una lista de ACCIONES por módulo. Cada acción
-- es una casilla, y un rol es el conjunto de casillas marcadas. Eso es
-- literalmente lo que pidió: una caja que se llena.
--
-- Las acciones no se inventan: salen de lo que las funciones YA exigen. Cada
-- `exigir_permiso` y cada `exigir_rol` del sistema es una puerta que existe, y
-- ponerle nombre es reconocerla, no crearla.
--
-- =========================================================================
-- POR QUÉ NO SE ROMPE NADA EL PRIMER DÍA
-- =========================================================================
--
-- Hay 125 funciones con su reja puesta. Cambiarlas todas de golpe es cambiar de
-- golpe quién puede hacer qué en un sistema que doce personas empiezan a usar
-- de verdad esta semana. No se hace así.
--
-- Un rol es de una de dos clases:
--
--   DE ESCALÓN (los de hoy)  Sigue rigiéndose por `rol_permisos` exactamente
--                            igual que hasta ahora. No cambia nada para nadie.
--
--   A LA MEDIDA (los nuevos) Se rige SOLO por sus casillas. La escalera no le
--                            aplica, ni para abrir ni para cerrar.
--
-- Y `private.exigir_accion` consulta las dos: si alguno de tus roles marca la
-- casilla, pasas; si no, se mira si alguno de tus roles DE ESCALÓN te da el
-- nivel que esa acción declara como equivalente.
--
-- La distinción importa y es la parte pensada: sin ella, un rol a la medida al
-- que le quitas «editar la empresa» seguiría pudiendo editarla porque su
-- escalón se lo daba por detrás. Se podría marcar, y no se podría DESmarcar,
-- que es justo lo que se pidió poder hacer.
--
-- COMPROBADO en transacción revertida, con un rol a la medida de dos casillas:
--
--   ver la empresa ......... sí          editar la empresa ...... no
--   ver los documentos ..... sí          cargar un documento .... no
--                                        descargar el respaldo .. no
--
--   y dándole además CONFIGURACION=TOTAL en la escalera:
--   editar la empresa ...... sigue que NO   <- ese es el punto
--
-- =========================================================================
-- LO QUE ESTA MIGRACIÓN TRAE, Y LO QUE NO
-- =========================================================================
--
-- Trae la maquinaria y el catálogo de UN módulo: Configuración, que es el que
-- puso de ejemplo. Los otros catorce se llenan después, uno a uno, y hasta
-- entonces siguen funcionando por escalón sin enterarse.
--
-- Es a propósito: el catálogo de acciones es la decisión cara de deshacer, y
-- conviene mirarla en pantalla con un módulo antes de escribirla quince veces.
-- ---------------------------------------------------------------------------

create table if not exists public.acciones (
  codigo    text primary key,
  modulo    text not null references public.modulos(codigo),
  nombre    text not null,
  -- Lo que se lee debajo del nombre al marcar la casilla. No es adorno: quien
  -- arma un rol no conoce el sistema por dentro y «fijar tributos» no le dice
  -- si eso enciende el IVA de las facturas.
  dice      text,
  orden     smallint not null default 100,

  -- El escalón que la cubría hasta ahora. Es lo que deja que los roles de
  -- siempre sigan funcionando sin tocarlos, y lo que permite migrar función a
  -- función en vez de todas a la vez.
  nivel_equivalente text
    check (nivel_equivalente in ('LECTURA', 'ESCRITURA', 'TOTAL')),

  activa    boolean not null default true,
  creada_en timestamptz not null default now()
);

alter table public.acciones enable row level security;

drop policy if exists acciones_lectura on public.acciones;
create policy acciones_lectura on public.acciones
  for select using (auth.uid() is not null);

comment on table public.acciones is
  'Cada cosa concreta que se puede hacer en un módulo, con nombre propio. Un rol a la medida es el conjunto de estas que tenga marcadas.';

create table if not exists public.rol_acciones (
  rol      text not null references public.roles(codigo) on delete cascade,
  accion   text not null references public.acciones(codigo) on delete cascade,
  puesta_en timestamptz not null default now(),
  puesta_por uuid references public.perfiles(id),
  primary key (rol, accion)
);

alter table public.rol_acciones enable row level security;

drop policy if exists rol_acciones_lectura on public.rol_acciones;
create policy rol_acciones_lectura on public.rol_acciones
  for select using (auth.uid() is not null);

comment on table public.rol_acciones is
  'Las casillas marcadas de cada rol. Solo mandan en los roles a la medida; en los de escalón se guardan pero no deciden.';

alter table public.roles
  add column if not exists a_la_medida boolean not null default false;

comment on column public.roles.a_la_medida is
  'Cierto si este rol se rige SOLO por sus casillas. Falso —los de siempre— si se rige por la escalera de rol_permisos. Sin esta distinción, a un rol a la medida se le podrían marcar casillas pero no desmarcarlas: su escalón se lo daría por detrás.';

-- ---------------------------------------------------------------------------
-- La puerta
--
-- Ojo con la rama del escalón: pide `nivel_equivalente is not null`. Sin esa
-- línea, `rango_nivel(null)` devuelve cero y la comparación queda «tu nivel >=
-- 0», cierta para cualquiera que tenga una fila de ese módulo aunque diga
-- NINGUNO. Está contado en la migración que lo corrigió, y aquí ya va bien.
-- ---------------------------------------------------------------------------
create or replace function private.puede_accion(p_accion text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $func$
  select private.tiene_rol('ADMIN')

     or exists (
          select 1
            from public.usuarios_roles ur
            join public.perfiles p on p.id = ur.usuario_id
            join public.rol_acciones ra on ra.rol = ur.rol
           where ur.usuario_id = (select auth.uid())
             and p.activo
             and ra.accion = p_accion
        )

     or exists (
          select 1
            from public.usuarios_roles ur
            join public.perfiles     p  on p.id = ur.usuario_id
            join public.roles        r  on r.codigo = ur.rol
            join public.acciones     a  on a.codigo = p_accion
            join public.rol_permisos rp on rp.rol = ur.rol and rp.modulo = a.modulo
           where ur.usuario_id = (select auth.uid())
             and p.activo
             and not r.a_la_medida
             and a.nivel_equivalente is not null
             and private.rango_nivel(rp.nivel) >= private.rango_nivel(a.nivel_equivalente)
        );
$func$;

comment on function private.puede_accion(text) is
  'Si quien llama puede hacer esa acción. Mira la casilla en cualquiera de sus roles, y para los roles de escalón mira además el nivel equivalente —cuando la acción declara uno; si no lo declara, ningún nivel la abre.';

create or replace function private.exigir_accion(p_accion text)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $func$
declare
  v_nombre text;
  v_modulo text;
begin
  if private.puede_accion(p_accion) then
    return;
  end if;

  select a.nombre, m.nombre into v_nombre, v_modulo
    from public.acciones a
    join public.modulos  m on m.codigo = a.modulo
   where a.codigo = p_accion;

  -- El mensaje nombra la acción, no el código: quien lo lee es quien la
  -- intentó, no quien la programó.
  raise exception 'No tienes permiso para %s.',
    coalesce(lower(v_nombre) || case when v_modulo is not null
                                     then ' en ' || v_modulo else '' end,
             'hacer eso')
    using errcode = '42501';
end;
$func$;

-- ---------------------------------------------------------------------------
-- El catálogo de Configuración, que es el módulo del ejemplo
--
-- Cada línea sale de una función que ya existe, no de una idea:
--
--   ver_empresa        La ficha se lee hoy con RLS abierta a todo el que entra.
--   editar_empresa     guardar_empresa, hoy rol ADMIN o GERENTE_GENERAL.
--   fijar_tributos     fijar_tributos, hoy CONFIGURACION:ESCRITURA.
--   ver_documentos     Hoy RLS: ADMIN, GERENTE_GENERAL, TESORERIA, RRHH.
--   cargar_documento   registrar_documento_legal.
--   editar_documento   actualizar_documento_legal.
--   quitar_documento   eliminar_documento_legal.
--
-- El respaldo NO está aquí: es su propio módulo, y por eso se puede dar
-- Configuración entera sin dar el respaldo — que es exactamente el caso que
-- puso la líder.
--
-- Los `nivel_equivalente` que van nulos los pone la migración siguiente, que es
-- donde se cuenta por qué: ponerles un escalón regalaría el poder a tres
-- personas que hoy no lo tienen.
-- ---------------------------------------------------------------------------
insert into public.acciones (codigo, modulo, nombre, dice, orden, nivel_equivalente) values
  ('CONFIGURACION.VER_EMPRESA', 'CONFIGURACION', 'Ver los datos de la empresa',
   'RIF, razón social, domicilio fiscal y condición ante el SENIAT. Es lo que sale impreso en cada factura y cada orden.',
   10, 'LECTURA'),

  ('CONFIGURACION.EDITAR_EMPRESA', 'CONFIGURACION', 'Corregir los datos de la empresa',
   'Cambiar el RIF o la razón social cambia lo que dirán los papeles que se emitan desde ese momento.',
   20, 'TOTAL'),

  ('CONFIGURACION.FIJAR_TRIBUTOS', 'CONFIGURACION', 'Decidir si se cobra IVA e IGTF',
   'Enciende o apaga los dos impuestos para todo el sistema. Afecta al total de cada factura.',
   30, 'ESCRITURA'),

  ('CONFIGURACION.VER_DOCUMENTOS', 'CONFIGURACION', 'Ver los documentos legales',
   'El RIF, el acta constitutiva, las cédulas. Llevan datos personales y números de registro.',
   40, 'LECTURA'),

  ('CONFIGURACION.CARGAR_DOCUMENTO', 'CONFIGURACION', 'Cargar un documento',
   'Subir una versión nueva de un papel: el RIF renovado, un acta actualizada.',
   50, 'ESCRITURA'),

  ('CONFIGURACION.EDITAR_DOCUMENTO', 'CONFIGURACION', 'Corregir la ficha de un documento',
   'El nombre, las fechas de emisión y vencimiento, la nota. No el archivo.',
   60, 'ESCRITURA'),

  ('CONFIGURACION.QUITAR_DOCUMENTO', 'CONFIGURACION', 'Quitar un documento',
   'Sale de la lista y su archivo deja de poder consultarse.',
   70, 'TOTAL'),

  ('RESPALDO.DESCARGAR', 'RESPALDO', 'Descargar el respaldo de la base',
   'Se lleva TODO en un archivo: los sueldos de los 22 trabajadores, sus cédulas y las cuentas bancarias. Es la casilla más delicada del sistema.',
   10, 'TOTAL')
on conflict (codigo) do update
  set nombre = excluded.nombre,
      dice   = excluded.dice,
      orden  = excluded.orden,
      nivel_equivalente = excluded.nivel_equivalente;

-- El navegador no escribe: solo lee.
revoke all on public.acciones     from anon, authenticated;
revoke all on public.rol_acciones from anon, authenticated;
grant select on public.acciones     to authenticated;
grant select on public.rol_acciones to authenticated;
