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
  /*
    Aquí había un campo `estado` con la ubicación. Se quitó por instrucción de
    la dirección de Sistemas, por dos motivos a la vez: el dato no era correcto
    y la ubicación de la explotación no es algo que deba publicarse. No se
    repite aquí ni siquiera como comentario — este repositorio es público.

    Se retira el campo entero y no solo sus usos. Mientras exista aquí, la
    primera pantalla que necesite un pie de página vuelve a ponerlo sin que
    nadie se pregunte si debe — y esta constante alimenta la portada, que es
    pública, y los papeles que salen de la empresa.

    Si algún día hace falta una dirección para un documento legal, va en los
    datos de empresa de la base (Configuración → Datos de la empresa), que se
    editan sin tocar código y no viajan al repositorio.
  */
} as const
