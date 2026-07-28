/**
 * Quién es la empresa, para los papeles que salen de aquí.
 *
 * El carnet y la ficha son documentos de la persona jurídica: en un accidente,
 * ante una inspección del ministerio del trabajo o en el portón de un cliente,
 * lo que vale es la razón social y el RIF, no el nombre con el que se llama al
 * sistema por dentro. Por eso viven en un solo sitio: cuando cambie el registro
 * —una mudanza, una reforma de estatutos— se toca aquí y sale corregido en
 * todo lo que se imprime.
 *
 * La razón social va tal como está registrada, en mayúsculas y sin tildes. No
 * es un descuido de ortografía: es como aparece en el RIF, y un documento
 * laboral que escribe el nombre distinto al del registro se discute.
 */
export const EMPRESA = {
  razonSocial: 'MINERIA INTERNACIONAL TS, C.A.',
  /** Sin la forma societaria, para donde el espacio manda. */
  nombre: 'MINERIA INTERNACIONAL TS',
  forma: 'C.A.',
  /**
   * Como se escribe en pantalla.
   *
   * Aquí sí lleva tilde y caja mixta: no es una cita del registro sino un
   * rótulo que alguien lee cincuenta veces al día, y en versalitas cansa.
   */
  marca: 'Minería Internacional',
  rif: 'J-50209170-0',
  actividad: 'Explotación de piedra',
  estado: 'Estado Bolívar',
} as const
