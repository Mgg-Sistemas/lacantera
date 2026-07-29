/**
 * Los bancos del sistema financiero venezolano, con su código.
 *
 * Es una lista cerrada a propósito: escrito a mano, el mismo banco aparece
 * como "Banesco", "banesco" y "BANESCO S.A.", y a la hora de conciliar tres
 * cuentas del mismo sitio parecen tres bancos distintos.
 *
 * En mayúscula y sin tildes porque así es como la base los guarda desde que
 * todo el sistema se normaliza al escribir. Si esta lista los escribiera "en
 * bonito", el desplegable de banco de una ficha ya guardada aparecería vacío:
 * el valor almacenado —"0105 · MERCANTIL"— no coincidiría con ninguna de sus
 * opciones, y quien la abriera para corregir un teléfono le borraría el banco
 * sin enterarse.
 */
export const BANCOS = [
  '0102 · BANCO DE VENEZUELA',
  '0104 · VENEZOLANO DE CREDITO',
  '0105 · MERCANTIL',
  '0108 · PROVINCIAL',
  '0114 · BANCARIBE',
  '0115 · EXTERIOR',
  '0128 · BANCO CARONI',
  '0134 · BANESCO',
  '0137 · SOFITASA',
  '0138 · BANCO PLAZA',
  '0151 · BFC BANCO FONDO COMUN',
  '0156 · 100% BANCO',
  '0157 · DELSUR',
  '0163 · BANCO DEL TESORO',
  '0166 · BANCO AGRICOLA DE VENEZUELA',
  '0168 · BANCRECER',
  '0169 · MI BANCO',
  '0171 · BANCO ACTIVO',
  '0172 · BANCAMIGA',
  '0174 · BANPLUS',
  '0175 · BANCO BICENTENARIO',
  '0177 · BANFANB',
  '0191 · BNC BANCO NACIONAL DE CREDITO',
]
