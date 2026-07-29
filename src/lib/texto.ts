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
