/*
  Las cuentas.

  Una cuenta se archiva, pero primero se apaga. Aquí se recorre el ciclo
  entero con gente de prueba: quien no tiene la casilla rebota; una cuenta
  encendida no se archiva; sin motivo tampoco; archivada queda inactiva, con
  quién y por qué; un archivado no tiene ningún rol vivo; no se enciende sin
  sacarlo del archivo; al sacarlo vuelve inactivo y solo entonces se enciende.

  Se prueba con un archivador que NO es administrador. El administrador pasa
  por encima de todo y probar con él demostraría que la función existe, no que
  la casilla abre y cierra.
*/
import {
  grupo,
  comprobar,
  como,
  comoDueno,
  debeFallar,
  usuarioDePrueba,
  rolDePrueba,
} from './ayuda.mjs'

export default async function pruebaUsuarios(tx) {
  grupo('Usuarios · una cuenta se archiva, pero primero se apaga')

  // Un administrador de prueba para encender y apagar, un rol de la casa con
  // solo la casilla de archivar, alguien sin ella, y la cuenta que va al archivo.
  const admin = await usuarioDePrueba(tx, {
    usuario: 'prueba_admin_archivo',
    nombre: 'Administrador de prueba',
    roles: ['ADMIN'],
  })

  await rolDePrueba(tx, 'PRUEBA_ARCHIVA', {
    PANEL: 'LECTURA',
    USUARIOS: 'LECTURA',
  })
  await tx`insert into public.rol_acciones (rol, accion) values ('PRUEBA_ARCHIVA', 'USUARIOS.ARCHIVAR_USUARIO')`

  const archivador = await usuarioDePrueba(tx, {
    usuario: 'prueba_archivador',
    nombre: 'Quien archiva',
    roles: ['PRUEBA_ARCHIVA'],
  })
  const curioso = await usuarioDePrueba(tx, {
    usuario: 'prueba_curioso',
    nombre: 'Sin la casilla',
    roles: ['CONSULTA'],
  })
  const cuenta = await usuarioDePrueba(tx, {
    usuario: 'prueba_se_fue',
    nombre: 'La que se archiva',
    roles: ['CONSULTA'],
  })

  // --- Sin la casilla, rebota ---------------------------------------------
  await como(tx, curioso)
  const sinCasilla = await debeFallar(
    tx,
    (sp) => sp`select public.archivar_usuario(${cuenta}, 'SE FUE DE LA EMPRESA')`,
  )
  comprobar(
    /no tienes permiso/i.test(sinCasilla ?? ''),
    `sin la casilla no se archiva (${(sinCasilla ?? 'no rebotó').slice(0, 50)}…)`,
  )

  // --- Con la casilla, pero encendida: primero hay que apagarla ------------
  await como(tx, archivador)
  const encendida = await debeFallar(
    tx,
    (sp) => sp`select public.archivar_usuario(${cuenta}, 'SE FUE DE LA EMPRESA')`,
  )
  comprobar(
    /primero hay que desactivarlo/i.test(encendida ?? ''),
    'una cuenta encendida no se archiva',
  )

  // --- Nadie se archiva a sí mismo ----------------------------------------
  const aSiMismo = await debeFallar(
    tx,
    (sp) => sp`select public.archivar_usuario(${archivador}, 'ME VOY')`,
  )
  comprobar(/tu propio usuario/i.test(aSiMismo ?? ''), 'nadie se archiva a sí mismo')

  // --- El administrador la apaga ------------------------------------------
  await como(tx, admin)
  await tx`select public.activar_usuario(${cuenta}, false)`

  // --- Sin motivo no hay archivo ------------------------------------------
  await como(tx, archivador)
  const sinMotivo = await debeFallar(tx, (sp) => sp`select public.archivar_usuario(${cuenta}, 'X')`)
  comprobar(/por qué se archiva/i.test(sinMotivo ?? ''), 'sin motivo no se archiva')

  // --- Y ahora sí ----------------------------------------------------------
  await tx`select public.archivar_usuario(${cuenta}, 'SE FUE DE LA EMPRESA')`
  const [archivada] = await tx`
    select activo, archivado_en, archivado_por, archivado_motivo
      from public.perfiles where id = ${cuenta}`
  comprobar(
    archivada.archivado_en !== null &&
      archivada.archivado_por === archivador &&
      archivada.archivado_motivo === 'SE FUE DE LA EMPRESA' &&
      archivada.activo === false,
    'queda archivada, inactiva, con quién y con motivo',
  )

  const dosVeces = await debeFallar(
    tx,
    (sp) => sp`select public.archivar_usuario(${cuenta}, 'OTRA VEZ')`,
  )
  comprobar(/ya está archivado/i.test(dosVeces ?? ''), 'no se archiva dos veces')

  // --- Un archivado no tiene ningún rol vivo ------------------------------
  await como(tx, cuenta)
  const [{ roles }] = await tx`select public.mis_roles() as roles`
  comprobar((roles ?? []).length === 0, 'el archivado no tiene ningún rol vivo')

  // --- No se enciende sin sacarlo del archivo -----------------------------
  await como(tx, admin)
  const encender = await debeFallar(tx, (sp) => sp`select public.activar_usuario(${cuenta}, true)`)
  comprobar(/sácalo del archivo/i.test(encender ?? ''), 'no se enciende sin sacarlo del archivo')

  // --- La base lo garantiza aunque se salte la función --------------------
  await comoDueno(tx)
  const aLaFuerza = await debeFallar(
    tx,
    (sp) => sp`update public.perfiles set activo = true where id = ${cuenta}`,
  )
  comprobar(
    /perfiles_archivado_apagado/i.test(aLaFuerza ?? ''),
    'ni el dueño de la base deja un archivado encendido',
  )

  // --- La auditoría lo recogió --------------------------------------------
  const [{ n }] = await tx`
    select count(*)::int as n from public.auditoria
     where tabla = 'perfiles' and fila_id = ${cuenta}::text
       and 'archivado_en' = any(cambios)`
  comprobar(n === 1, 'la auditoría anotó el archivo con quién y cuándo')

  // --- Del archivo vuelve inactiva, y solo entonces se enciende -----------
  await como(tx, archivador)
  await tx`select public.desarchivar_usuario(${cuenta})`
  const [fuera] = await tx`select activo, archivado_en from public.perfiles where id = ${cuenta}`
  comprobar(
    fuera.archivado_en === null && fuera.activo === false,
    'al sacarla del archivo vuelve inactiva, no encendida',
  )

  const dosVecesFuera = await debeFallar(
    tx,
    (sp) => sp`select public.desarchivar_usuario(${cuenta})`,
  )
  comprobar(/no está archivado/i.test(dosVecesFuera ?? ''), 'no se saca del archivo lo que no está')

  await como(tx, admin)
  await tx`select public.activar_usuario(${cuenta}, true)`
  const [viva] = await tx`select activo from public.perfiles where id = ${cuenta}`
  comprobar(viva.activo === true, 'y ya se puede volver a encender')
}
