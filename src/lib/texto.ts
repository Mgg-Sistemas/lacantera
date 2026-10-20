/**
 * Mayúsculas sin tildes, igual que la base.
 *
 * Los datos del sistema se guardan así para que "Minería", "MINERIA" y
 * "mineria" dejen de ser tres cosas distintas al buscar o al cargar. La regla
 * de verdad vive en Postgres —un disparador por tabla, sin puerta trasera—, y
 * esto es su reflejo en la pantalla: sirve para que el campo se vea desde la
 * primera letra como va a quedar guardado. Ver que el dato cambia después de
 * enviarlo se lee como que el sistema lo tocó por su cuenta.
 *
 * La eñe se conserva. No es una tilde, es una letra: PEÑA y PENA son dos
 * apellidos distintos, y ese apellido acaba impreso en un recibo de pago.
 */
export const enMayuscula = (texto: string) =>
  texto
    .replace(/[áàäâã]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöôõ]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .toUpperCase()

/**
 * «el tanque, la cantidad y el origen»: una lista dicha como se habla, con
 * «y» antes del último en vez de una coma más.
 *
 * Nace de los botones que no se encendían y no decían por qué (20/10/2026).
 * Vive aquí y no en la pantalla que lo estrenó porque el problema no era de
 * una pantalla: cualquier formulario con más de un campo obligatorio tiene
 * que poder decir qué le falta, y dos copias de esto acabarían separando la
 * coma del «y».
 */
export const enumerar = (partes: string[]): string =>
  partes.length <= 1
    ? (partes[0] ?? '')
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
