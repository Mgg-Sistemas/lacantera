# Manual de usuario — La Cantera

**Sistema de control interno · Minería Internacional TS, C.A.**

**Versión 1.6 · 6 de octubre de 2026**

---

## Cómo leer este manual

Está escrito para quien trabaja con el sistema todos los días. No hace falta saber de computación para seguirlo.

Cada capítulo corresponde a un módulo y sigue siempre el mismo orden: para qué sirve, quién puede entrar, qué se ve en cada pantalla, cómo se hace cada tarea paso a paso, y una tabla final con los mensajes que puede mostrar el sistema y qué hacer ante cada uno.

Tres convenciones que se repiten en todo el documento:

- Lo que aparece **en negrita** es texto que va a ver escrito en la pantalla: un botón, el nombre de un campo, el título de una columna.
- Lo que aparece «entre comillas angulares» es un mensaje que muestra el sistema, copiado tal cual.
- Las rutas se escriben como se recorre el menú: **Operación › Inventario › Existencias**.

**Este manual describe el sistema tal como funciona hoy.** El capítulo 15 reúne lo que el sistema no hace, para que nadie planifique su trabajo contando con ello.

**Si algo no coincide con lo que ve en la pantalla, mande la pantalla.**

### El orden de los capítulos

**El orden es el del camino del material:** primero se extrae, luego se almacena, después sale por el portón, y por último se administra lo que eso genera. Describe cómo funciona la cantera, no lo que muestra el menú, y por eso no cambia cuando cambia el menú.

También tienen capítulo, en su sitio, las pantallas que hoy no están en el menú: el módulo **Despachos** entero y tres pantallas de **Explotación** —**Frentes y bancos**, **Voladuras** y **Producción por turno**—, contadas en 1.5. Cada capítulo lo dice al principio, y el índice lleva una columna que se lee de un vistazo.

---

## Índice

| | Capítulo | ¿Está en el menú? |
| --- | --- | --- |
| 1 | Qué es este sistema y qué no es | — |
| 2 | Cómo entrar | Sí |
| 3 | Cómo moverse por el sistema | Sí |
| 4 | El panel | Sí |
| 5 | Tasas de cambio | Sí |
| 6 | Explotación | En parte: **Frentes y bancos**, **Voladuras** y **Producción por turno** están escondidas |
| 7 | Inventario | Sí |
| 8 | Despachos | No: el módulo entero está escondido |
| 9 | Compras | Sí |
| 10 | Ventas | Sí |
| 11 | Nómina | Sí |
| 12 | Tesorería | Sí |
| 13 | Configuración | Sí |
| 14 | Las reglas que el sistema impone | — |
| 15 | Lo que el sistema no hace, y dónde tener cuidado | — |
| 16 | Preguntas frecuentes | — |
| 17 | A quién acudir | — |
| 18 | Asignaciones | Sí |
| 19 | Maquinaria | Sí |
| 20 | Combustible | Sí |
| 21 | Facturación | Sí |
| 22 | Control de despacho | Sí |
| 23 | Control de asistencia | Sí |
| 24 | Contactos | Sí |
| 25 | Alimentación | Sí |
| 26 | Salidas y traslados | Sí |

**Que un módulo esté en el menú no quiere decir que lo vea todo el mundo.** A cada persona le sale solo lo que su permiso alcanza (3.1).

**Los capítulos 18 a 26 van al final**, y no intercalados donde les tocaría: meterlos en medio correría diez números debajo de quien tiene el manual impreso, y rompería las remisiones repartidas por todo el documento. El **Organigrama** tiene apartado propio, el 11.13.

---

## 1. Qué es este sistema y qué no es

Es el sistema de **control interno** de la cantera. Sirve para saber, en cualquier momento y sin depender de la memoria de nadie:

- Cuánta piedra se produjo, en qué turno y de qué frente salió.
- Cuánto material hay en cada patio y en cada almacén.
- Qué cruzó el portón, con qué peso y con qué papeles.
- Qué se compró, quién lo pidió y quién lo aprobó.
- Cuánto se le debe a los proveedores y cuánto deben los clientes.
- Qué se le paga a cada trabajador y por qué concepto.

**No es un sistema de contabilidad.** No sustituye al contador, no emite los libros fiscales y no presenta declaraciones. Lo que hace es que cada cifra tenga un documento detrás, y que ese documento diga quién lo registró, cuándo y con qué explicación.

### 1.1 La idea que hay que entender antes de empezar

El sistema está hecho para que ciertas cosas **no** se puedan hacer.

No se puede borrar un movimiento de inventario. No se puede editar una nómina ya pagada. No se puede sacar material que no está. No se puede despachar mineral sin guía. No se puede cambiar el saldo de una cuenta a mano.

Cuando el sistema lo detiene, en la enorme mayoría de los casos es a propósito. La restricción no está para complicarle el trabajo: está para que dentro de seis meses, cuando alguien pregunte por qué faltaban cuarenta toneladas o por qué se le pagó de más a un trabajador, la respuesta esté escrita y no dependa de que alguien se acuerde.

El capítulo 14 reúne esas reglas y explica el motivo de cada una. Vale la pena leerlo antes que los capítulos de los módulos.

### 1.2 Cómo se organiza el trabajo

El sistema no reparte el trabajo por persona sino por **módulo**, y a cada usuario se le habilitan los módulos que necesita.

Los módulos son quince. La última columna dice cuáles se ofrecen hoy en el menú lateral y cuáles están en obra; el apartado 1.5 explica qué significa eso exactamente.

| Módulo | De qué se ocupa | Hoy |
| --- | --- | --- |
| **Panel** | La pantalla de inicio: qué hay que atender hoy | En el menú |
| **Explotación** | El acarreo de los camiones, las plantas y rutas, y las salidas de planta; también los frentes y bancos, las voladuras y el parte de cada turno | En el menú, salvo frentes, voladuras y el parte de turno, que están en obra |
| **Maquinaria** | Los equipos de la cantera, su horómetro y lo que ha pasado por el taller | En el menú |
| **Combustible** | El gasoil y la gasolina que se despachan a cada máquina | En el menú |
| **Inventario** | Lo que hay en cada patio y almacén, y todo lo que entra y sale | En el menú |
| **Asignaciones** | Lo que se le entrega a una persona y hay que recuperar, y lo que se pierde o se daña | En el menú |
| **Despachos** | El pesaje en la romana y las guías de movilización | En obra |
| **Compras** | Pedir, cotizar, aprobar, recibir, facturar y **pagar** lo que la empresa compra | En el menú |
| **Ventas** | Clientes, precios, cotizaciones, notas de entrega y facturas | En el menú |
| **Nómina** | Personal, novedades, cálculo, recibos, pagos, prestaciones sociales y el organigrama | En el menú |
| **Tesorería** | Bancos y cajas, el libro de tesorería, los reportes y el Libro Mayor | En el menú |
| **Tasas de cambio** | Las tasas del día, que valorizan todo lo que se registre | En el menú |
| **Configuración** | Datos de la empresa, documentos legales y auditoría | En el menú |
| **Usuarios y roles** | Quién entra al sistema y a qué llega cada quien | En el menú |
| **Respaldo de la base** | La copia completa de los datos, para guardarla fuera | En el menú |

**Usuarios y roles** y **Respaldo de la base** cuelgan de Configuración en el menú, pero son módulos aparte a la hora de repartir permisos: quien mantiene el catálogo de artículos no tiene por qué poder crear cuentas ni llevarse la base entera en un archivo. El capítulo 13 lo explica.

El **Organigrama** no es un módulo propio: se reparte con el permiso de Nómina, porque quien lleva el personal es quien sabe de quién depende quién.

El **Manual de usuario** aparece siempre al final del menú y **no es un módulo**: no se reparte por permisos y no figura en la tabla. Quien acaba de entrar y todavía no tiene nada asignado lo ve igual, y es a propósito — es lo único que tiene mientras espera que administración le reparta lo demás. No contiene ningún dato de la empresa: solo explica cómo se usa el sistema.

**Tesorería** tiene cinco pantallas: Tablero, Bancos y cajas, Reportes, Libro Mayor y Libro de tesorería. **Pagos por hacer** cuelga de **Compras**, que es donde se usa. El capítulo 12 las cuenta.

### 1.3 Por dónde entra y por dónde sale el material

Conviene tener este recorrido en la cabeza antes de leer los capítulos, porque explica por qué el sistema pide lo que pide en cada paso:

1. Se registra el **frente** donde se trabaja.
2. Se registra la **voladura**, contra ese frente.
3. Al cierre del turno se carga el **parte de producción**, que escribe la entrada del material al patio.
4. El material se guarda, se traslada entre patios y se cuenta, en **Inventario**.
5. Cuando se vende, el despacho se pide y **otra persona lo aprueba**. En ese momento nace la **nota de entrega** y **el patio se descuenta**.
6. El camión se pesa en la **romana** y sale con esa nota. Si hay **guía de movilización** vigente, se le engancha.
7. Se **factura** y se **cobra**. Facturar es opcional: la nota de entrega vale por sí sola (10).

**El parte de producción no es la única entrada al patio.** **Registrar entrada**, en Inventario › Existencias, admite también los productos de cantera (6.6).

**El frente, la voladura y el parte de turno no están hoy en el menú** (1.5).

### 1.4 Bolívares y dólares

La empresa cobra y paga en las dos monedas, y el sistema está hecho para eso.

Cada documento se emite en la moneda en que se pactó la operación, y **guarda para siempre la tasa de cambio del día en que se emitió**. Si mañana la tasa cambia, ese documento no cambia. La tasa usada forma parte del hecho, igual que la fecha o el monto: no es un dato que se actualice.

Por eso la tasa del día está siempre visible en la parte de arriba de la pantalla, y por eso importa que esté correcta antes de empezar a registrar. El capítulo 5 lo explica.

### 1.5 Lo que hoy se ofrece, y lo que está en obra

Esto es lo primero que hay que saber antes de buscar una pantalla: qué ofrece hoy el menú, y qué cuenta este manual que no está en él.

**Hoy el menú lateral ofrece esto**, en tres secciones y con el **Panel** arriba del todo:

- **Operación:** Explotación · Maquinaria · Inventario · Salidas y traslados · Combustible · Asignaciones
- **Administración:** Centro de costo · Compras · Ventas · Control de despacho · Control de asistencia · Contactos · Alimentación · Facturación · Nómina · Organigrama · Tesorería
- **Sistema:** Tasas de cambio · Configuración · Manual de usuario

Cada persona ve solo los módulos sobre los que tiene permiso (3.1), así que su menú puede ser más corto que esta lista. Si tiene un manual impreso de otra fecha, esta lista es la que manda.

**Hoy quedan fuera del menú un módulo entero y tres pantallas de otro:**

- **Despachos**, entero: **Tablero**, **Tickets de romana** y **Guías de movilización**.
- De **Explotación**: **Frentes y bancos**, **Voladuras** y **Producción por turno**.

Ahora la parte que hay que entender bien, porque no es lo que parece:

**Lo que está fuera del menú no está borrado ni cerrado.** Sus pantallas existen y sus direcciones responden; lo que pasa es que no se ofrecen desde el menú, y la barra buscadora tampoco las ofrece.

Y para que nadie tropiece con una pantalla a medio afinar sin saberlo, **quien llegue a una de esas direcciones —escribiéndola a mano, por un enlace que le pasaron o porque quedó en el historial del navegador— se encuentra primero un cartel de obra**:

> **En construcción.** *Esta parte del sistema todavía se está trabajando y no forma parte de lo que hoy está en uso. Lo que se haga aquí puede perderse o no cuadrar con el resto.* Y debajo, en letra más pequeña: *Esta pantalla está en obra.* El botón es **Volver al panel**.

**El cartel se le pone a todo el mundo, incluida la administración.** Quien tiene el rol de administrador ve además, en letra pequeña y en tono menor, un enlace **Entrar de todos modos**, que deja pasar el cartel. **Vale mientras la pestaña esté abierta y se olvida al cerrarla**, así que nadie se deja esa puerta abierta sin darse cuenta.

**No es un problema de permisos.** Un candado —**Ventas no está a su alcance**— significa que a su rol no le abrieron ese módulo, y se resuelve pidiéndoselo a la administración. El cartel de obra significa otra cosa: que esa parte todavía no está entregada, y pedir el permiso no lo cambia. Si una dirección está a la vez escondida y fuera de su permiso, sale el cartel de obra.

**Este manual cuenta también lo que está fuera del menú**, en el capítulo de su módulo. Cada capítulo afectado lo dice al principio.

**El manual sí está en el menú**, al final, en **Sistema**, con un icono de libro. Y es la única entrada que no comprueba permisos: quien acaba de entrar y todavía no tiene ningún módulo asignado la ve igual. Es lo único que tiene mientras espera que la administración le reparta lo demás.

#### La pantalla que se abre sin entrar

Hay una sola, y conviene conocerla porque no se parece a nada más del sistema: **la página que abre el QR del carnet**.

Su dirección es **/v** seguida del código del carnet, y **no pide usuario ni clave**. Es deliberado: quien la abre es un vigilante en un portón o un fiscal en la carretera, con el plástico en una mano y el teléfono en la otra, y no tiene cuenta en el sistema ni la va a tener. Tampoco da el cartel de obra, y se ve igual con sesión abierta y sin ella.

Enseña si el carnet vale, la foto y los datos de la persona que hacen falta en un portón o en un accidente. **No enseña el sueldo, ni la cuenta bancaria, ni las incidencias.** Está contada entera en 11.4.

Escribiendo **/v** a secas, sin código, se abre la misma página con un campo para teclearlo a mano: es lo que se usa cuando el plástico está rayado y el QR no lee.

---

## 2. Cómo entrar

El sistema no es anónimo. Cada movimiento de inventario, cada compra y cada pago quedan escritos con el nombre de la persona que los registró, y esa persona es la que entró con su usuario y su clave. De ahí sale la única regla que hay que entender antes de nada:

**La clave es de una sola persona.** Si dos personas usan el mismo usuario, lo que se registre con él no identifica a ninguna de las dos, y el rastro que hace útil al sistema deja de valer. Por eso, en cuanto la administración entrega una clave, el sistema obliga a cambiarla antes de dejar trabajar.

### 2.1 La portada

Es la puerta de la calle. Se ve al abrir la dirección del sistema, con sesión y sin ella, y también es donde cae cualquier dirección equivocada que se escriba.

**No muestra ningún dato de la operación.** Es una presentación de la empresa —la actividad, lo que sale del patio, las fotos del frente— que termina en el botón **Entrar al sistema**. Debajo quedan la razón social, el **RIF** y el aviso **El acceso lo asigna la administración de la empresa.**

Dos cosas de esta pantalla que conviene saber. La primera: **con la sesión ya abierta, la portada se sigue viendo**; no devuelve al panel. Es intencional. La segunda: es la única pantalla del sistema que no cambia con el tema claro u oscuro.

El botón **Entrar al sistema** lleva a la pantalla de entrar.

### 2.2 La pantalla de entrar

Es donde el sistema comprueba quién entra y abre la sesión de trabajo. Con la sesión ya abierta, esta pantalla no se ve: lleva directo al panel.

Su título es **Entrar al sistema**. Si algo falla, aparece una caja roja encima del formulario con el motivo.

#### Los datos que se piden

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Usuario** | Sí | Se escribe en minúscula. Es el único campo de texto del sistema que **no** se convierte a mayúsculas, porque subirlo dejaría a todo el mundo fuera. Aparece con el ejemplo **su.usuario** |
| **Clave** | Sí | Se ve por puntos. Tiene un botón de ojo para mostrarla y ocultarla |
| **Mantener sesión abierta** | No | Casilla, viene desmarcada |

#### Entrar con usuario y clave

1. Escriba el **Usuario**.
2. Escriba la **Clave**.
3. Pulse **Entrar**. Mientras comprueba, el botón dice **Entrando…** y no se puede volver a pulsar.
4. Si todo va bien, entra directo al panel.

Al pie queda siempre el aviso **El acceso lo asigna la administración de la empresa. Si no tienes credenciales, escribe a sistemas.**

**El sistema no dice si el error fue el usuario o la clave.** Ante los dos casos responde «Usuario o clave incorrectos.» Es a propósito: si lo dijera, cualquiera podría averiguar qué usuarios existen probando nombres.

Si se deja un campo en blanco y se pulsa **Entrar**, quien avisa es el navegador con su propio texto, no el sistema.

#### Dos cosas de esta pantalla que hoy no funcionan

Conviene decirlas claro, porque están a la vista y parece que hacen algo:

- **La casilla Mantener sesión abierta no cambia nada.** Marcarla o dejarla en blanco da el mismo resultado: la sesión se guarda igual en ese aparato. Está en pantalla, pero nadie la lee.
- **El enlace Olvidé mi contraseña no lleva a ninguna parte.** No hay recuperación por cuenta propia. Quien olvide la clave se la pide a la administración; entrará con la que le den y el sistema le pedirá cambiarla enseguida.

### 2.3 Entrar con la huella

Sirve para entrar poniendo el dedo en lugar de teclear la clave. Se activa **en un equipo concreto**, y hay que activarla otra vez en cada aparato: activarla en la oficina no la activa en el teléfono.

#### Cómo se registra

Se hace desde **Mi cuenta**, en la tarjeta **Entrar con la huella**, cuyo subtítulo lo resume: **Se activa por equipo. En el teléfono hay que activarla aparte.**

1. Entre al sistema con su usuario y su clave.
2. Abra el menú del usuario, arriba a la derecha, y pulse **Mi cuenta**.
3. Baje a la tarjeta **Entrar con la huella** y pulse **Activar la huella**.
4. El botón pasa a **Esperando el dedo…** y se abre el diálogo del propio equipo pidiendo la huella, la cara o el PIN. Hay un minuto para responder.
5. Al reconocer a la persona, la tarjeta avisa en verde de que en ese equipo ya se puede entrar con la huella.

Si el equipo no tiene lector, **la tarjeta no muestra ningún botón** y lo dice: **Este equipo o este navegador no admite la huella.** Mientras el sistema averigua si hay lector, la tarjeta directamente no aparece.

Cuando aún no está activada y el equipo sí tiene lector, la tarjeta explica qué se guarda: **Su huella no sale del aparato**, y lo que queda guardado es el pase de sesión cifrado, que necesita el dedo para abrirse.

Una vez activada, dice **Activada en este equipo.** Si el pase guardado es de otra persona, lo indica con su nombre. Y debajo queda el aviso que más importa: **perdido el equipo, hay que cambiar la clave** — eso la desactiva ahí y en cualquier otro aparato donde se haya puesto.

Para quitarla, se pulsa **Quitar de este equipo**.

#### Cómo se usa

1. Al abrir la pantalla de entrar, si la huella está activada en ese equipo, debajo del botón **Entrar** aparece un separador con la letra **o** y el botón **Entrar con la huella de** seguido del nombre de usuario. Si no se guardó el nombre, dice solo **Entrar con la huella**.
2. Se pulsa. El botón pasa a **Esperando el dedo…**
3. Se pone el dedo cuando el equipo lo pide. Si lo reconoce, entra directo al panel.

Si se cancela el diálogo del dedo, **no aparece ningún error**: cancelar no es equivocarse.

La huella no sustituye a la clave, es un camino aparte. Si falla, el acceso con usuario y clave sigue justo encima, intacto.

#### Lo que conviene entender de la huella

- **La huella nunca sale del aparato.** El sistema no la ve ni la guarda en ningún sitio: no hay nada que robar. Lo que se guarda en el equipo es el pase de sesión, cifrado, y hace falta el dedo para abrirlo.
- **Se mantiene sola.** El pase se renueva en silencio mientras se usa el sistema, así que mañana sigue funcionando sin volver a activarla.
- **Es un cierre serio de la puerta, no un búnker.** Quien tenga el equipo desbloqueado y el dedo entra. Se trata como se trata la llave de la oficina.
- **Cerrar sesión no quita la huella** de ese equipo. Solo la quitan **Quitar de este equipo** o un cambio de clave.
- **Perdido el equipo o el teléfono, se cambia la clave desde cualquier otro sitio.** Eso cierra las demás sesiones y deja sin valor el pase guardado en el aparato perdido. Es la única forma de desactivar la huella a distancia.
- Quitar la huella aquí no borra la llave de acceso que Windows o el teléfono guardaron por su cuenta; eso se hace en los ajustes del propio equipo. Pero sin el pase cifrado ya no sirve para entrar.

### 2.4 El primer ingreso: ponerle su propia clave

La primera vez, el sistema no deja pasar a ninguna pantalla hasta que se cambie la clave. Ocupa la pantalla entera, sin menú y sin barra superior:

- Título **Póngale su propia clave**.
- El texto **Hola,** con el nombre, y después: **La clave con la que acaba de entrar se la dio la administración, así que la saben dos personas. Elija una que sepa solo usted para seguir.**
- El formulario de clave, con el botón rotulado **Guardar y entrar**.

Aparece en tres casos: al crear el usuario, cuando la administración repone la clave, y a todo el mundo la vez que se implantó esta regla.

**No se puede posponer.** No hay botón de «más tarde» ni de cerrar, y como no hay barra superior tampoco hay **Cerrar sesión**: se sale cambiando la clave o cerrando el navegador. La razón es la del principio del capítulo: mientras la clave siga siendo la que dio la administración, la saben dos personas, y lo que se registre con ella no prueba quién fue.

Aunque se llegue obligado, **el sistema sigue pidiendo la clave actual**. Es para que alguien que se encuentre una sesión abierta no pueda quedarse con la cuenta cambiándole la clave.

Los campos y los avisos de este formulario son los mismos de **Mi cuenta**; están en el apartado 3.7.

### 2.5 Desde el teléfono

El sistema se usa igual desde el teléfono, con tres diferencias que conviene conocer para no buscar lo que no está:

- El menú lateral no está fijo: se abre como un cajón por encima de la pantalla, con el botón **☰** de la barra superior, y se cierra con la **X** o pulsando fuera. Mientras está abierto, la página del fondo no se mueve.
- **Contraer el menú solo existe en pantallas grandes.** En el teléfono no hace falta: el menú ya está escondido.
- El indicador de la tasa y el nombre completo no caben y no se muestran; el círculo con las iniciales sí.

La huella suele funcionar mejor en el teléfono que en un equipo de oficina, pero **hay que activarla ahí también**, entrando primero con la clave.

### 2.6 Cuando no se puede entrar

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Usuario o clave incorrectos.» | El usuario no existe o la clave está mal. El sistema no distingue cuál de los dos, para que nadie averigüe qué usuarios existen | Revise el usuario y vuelva a escribir la clave. Si sigue, pida a la administración que la reponga |
| «El usuario solo admite letras, números, punto, guion y guion bajo.» | El nombre escrito lleva espacios, tildes u otros signos | Escríbalo tal como lo entregó la administración |
| «No se pudo entrar.» | Falló el acceso y no vino ninguna explicación | Reintente. Si se repite, avise a sistemas |
| «No se pudo entrar: …» seguido de un detalle | Falló algo fuera de su control | Reintente. Si se repite, pase el detalle a sistemas |
| «Su sesión guardada caducó. Entre con su clave y vuelva a activar la huella.» | El pase guardado en ese equipo dejó de valer | Entre con la clave y active la huella otra vez en **Mi cuenta** |
| «No se reconoció la huella.» | El lector no identificó el dedo | Vuelva a intentarlo o entre con la clave |
| «La huella no está activada en este equipo.» | No hay pase guardado aquí | Entre con la clave y actívela en **Mi cuenta** |
| «Se perdió la llave de este equipo. Entre con su clave.» | El equipo ya no tiene con qué abrir el pase guardado | Entre con la clave y vuelva a activar la huella |
| «No se pudo abrir la sesión.» | El pase se abrió pero la sesión no llegó a crearse | Entre con la clave |
| «Este equipo o este navegador no admite la huella.» | Ese aparato no puede usar la huella | Entre con la clave. En el teléfono suele funcionar |
| «No hay una sesión abierta que guardar. Vuelva a entrar.» | Se intentó activar la huella sin sesión válida | Vuelva a entrar y actívela |
| «No se registró la huella.» | El registro no llegó a completarse | Repita **Activar la huella** |
| «Este navegador no deja guardar la llave de cifrado.» / «No se pudo abrir el almacén de llaves.» | Ese navegador no puede guardar el pase | Entre con la clave, o use el sistema desde otro navegador |
| **El sistema no pudo arrancar** en una pantalla blanca sin diseño | El sistema no llegó a cargar | Recargue. Si se repite, pase a sistemas el detalle que aparece debajo del título |

---

## 3. Cómo moverse por el sistema

Dentro, todas las pantallas comparten el mismo marco: el menú a la izquierda, la barra superior arriba y el contenido en el medio. Al cambiar de pantalla, el menú y la barra se quedan quietos y solo el centro muestra **Cargando…**

### 3.1 El menú lateral

Está organizado en tres secciones —**Operación**, **Administración** y **Sistema**— y, dentro de ellas, en módulos. Los que tienen varias pantallas se despliegan; los que tienen una sola son un enlace directo.

Arriba del todo, sin rótulo de sección, está **Panel**, que lleva a la pantalla de inicio.

Esto es todo lo que ofrece el menú hoy. Cada persona ve solo la parte sobre la que tiene permiso, así que el suyo puede ser más corto.

**Operación**

| Módulo | Pantallas |
| --- | --- |
| **Explotación** | **Tablero**, **Viajes de camiones**, **Plantas y rutas**, **Salidas de planta** |
| **Maquinaria** | **Equipos**, **Historial de taller** |
| **Inventario** | **Tablero**, **Existencias**, **Almacenes y talleres** |
| **Salidas y traslados** | **Historial**, **Salidas**, **Traslados** |
| **Combustible** | Enlace directo |
| **Asignaciones** | **Bienes asignados**, **Dotación por cargo**, **Incidencias** |

**Administración**

| Módulo | Pantallas |
| --- | --- |
| **Centro de costo** | Enlace directo |
| **Compras** | **Tablero**, **Compra directa**, **Historial de directas**, **Proveedores**, **Recepciones**, **Pagos por hacer**, **Gasto por unidad** |
| **Ventas** | **Tablero**, **Clientes**, **Lista de precios**, **Cotizaciones** |
| **Control de despacho** | Enlace directo |
| **Control de asistencia** | Enlace directo |
| **Contactos** | Enlace directo |
| **Alimentación** | Enlace directo |
| **Facturación** | **Notas de entrega**, **Facturas**, **Notas de crédito**, **Cuentas por cobrar** |
| **Nómina** | **Tablero**, **Personal**, **Nómina del período**, **Prestaciones y parámetros** |
| **Organigrama** | Enlace directo |
| **Tesorería** | **Tablero**, **Bancos y cajas**, **Reportes**, **Libro Mayor**, **Libro de tesorería** |

**Sistema**

| Módulo | Pantallas |
| --- | --- |
| **Tasas de cambio** | Enlace directo |
| **Configuración** | **Tablero**, **Usuarios y roles**, **Datos de la empresa**, **Documentos legales**, **Auditoría** —solo la ve el administrador—, **Respaldo de la base** |
| **Manual de usuario** | Enlace directo. **Es la única entrada que se ve sin tener ningún permiso** |

**Muchas pantallas no están en el menú: están en pestañas.** El menú se quedó con la puerta de cada cosa y el resto se agrupó por dentro, arriba de la pantalla. Es lo que hay que saber para no darlas por perdidas:

| Si busca | Está en |
| --- | --- |
| **Catálogo de artículos**, **Movimientos** | Pestañas de **Inventario › Existencias**. La del catálogo dice **Catálogo** |
| **Talleres**, **Dueños del material** | Pestañas de **Inventario › Almacenes y talleres**, cuya primera pestaña se llama **Almacenes y patios** |
| **Facturas de proveedor** | **Compras › Proveedores**, segunda pestaña. Ahí se llama **Facturas recibidas** |
| **Cuentas por pagar** | **Compras › Pagos por hacer**, segunda pestaña. Ahí se llama **Por proveedor** |
| **Tabulador de cargos**, **Carnets** | Pestañas de **Nómina › Personal** |
| **Novedades del período**, **Procesar nómina**, **Recibos de pago** | Las tres pestañas de **Nómina › Nómina del período**, numeradas **1 · Novedades**, **2 · Procesar** y **3 · Recibos**, en el orden en que se hacen |
| **Prestaciones sociales**, **Parámetros de nómina**, **Bonos y descuentos** | Pestañas de **Nómina › Prestaciones y parámetros** |
| El libro de compras y el de ventas | Las pestañas **Compras** y **Ventas** de **Tesorería › Libro Mayor** |
| **Cargar por planilla** —artículos, personal o proveedores— | No es pestaña: es un botón, **Cargar por planilla**, dentro del catálogo de artículos, de **Personal** y de **Proveedores**. El **Panel** tiene además atajos para cargar el catálogo y el personal, y el **Tablero** de Compras uno para cargar los proveedores |
| La vista de teléfono del surtidor de **Combustible** y de la cocina de **Alimentación** | El botón **Vista de teléfono** de cada módulo. Quien tiene la casilla de usar el surtidor o la cocina desde el teléfono, y no es administrador, entra directamente ahí al abrir el sistema |

**La lupa (Ctrl+K) encuentra casi todas por su nombre corriente**, aunque no estén en el menú: escribir *cargar artículo* lleva a la carga de artículos. Las que no encuentra son **Carnets**, **Por proveedor**, **Dueños del material**, **Bonos y descuentos** y el libro de ventas: a esas se llega solo por su pestaña.

**Todas las entradas de este menú están construidas.** Ninguna abre el cartel de obra. Si una pantalla no se abre, es por permisos o por conexión, no porque falte.

#### Lo que no sale en el menú

Hoy hay escondidos un módulo entero y tres pantallas de otro. El apartado 1.5 dice cuáles son y qué se encuentra quien llega a ellas.

| Módulo | Pantallas escondidas | Capítulo |
| --- | --- | --- |
| **Despachos** | El módulo entero: **Tablero**, **Tickets de romana** y **Guías de movilización** | 8 |
| **Explotación** | **Frentes y bancos**, **Voladuras** y **Producción por turno** | 6 |

**Se esconden para todo el mundo, incluido el administrador.** No es un permiso: el sistema se enseña desde una cuenta con todos los permisos, y si al administrador le siguiera saliendo el menú entero, esconderlo no habría servido de nada. La lupa tampoco las ofrece, y quien llega a su dirección se encuentra el cartel de obra.

La primera entrada de casi todos los módulos se llama **Tablero**: es el resumen del módulo y el sitio por donde se empieza.

Cómo se comporta el menú:

- **Solo hay un módulo abierto a la vez.** Abrir uno cierra el anterior. Con más de veinte entradas, varios abiertos convertirían el menú en una lista interminable.
- Al entrar en una pantalla, **se abre solo el módulo al que pertenece**.
- La pantalla en la que está se ve resaltada en naranja: un enlace directo, relleno y con letra blanca; una pantalla dentro de un módulo, con un tinte suave y la letra más marcada.
- Al pie, siempre a la vista, está **quién está dentro**: el círculo con sus iniciales, su nombre completo y su usuario debajo. Está ahí a propósito: es lo que evita que alguien registre algo sin darse cuenta de que quedó abierta la sesión de otra persona.

**Los módulos sobre los que no tiene permiso no aparecen en el menú.** Y si a un módulo se le ocultan todas sus pantallas, desaparece entero; si a una sección se le vacían los módulos, desaparece la sección. No es pudor: sin permiso, esas pantallas se abrirían vacías, y una lista vacía miente.

Durante el primer instante después de entrar, mientras los permisos aún no han llegado, **se ve el menú completo**, incluidas por un momento las entradas escondidas. Un menú vacío durante medio segundo se lee como que el sistema se rompió.

Si escribe a mano la dirección de un módulo que no le toca, o llega por un enlace que alguien le pasó, no ve una pantalla vacía sino una explicación con un candado: el nombre del módulo seguido de **no está a su alcance**, el texto **Su rol no tiene acceso a este módulo. Solicítelo a la administración.** y el botón **Volver al panel**.

**Auditoría** tiene su propio mensaje, porque es solo del administrador: **Esto lo ve la administración**, con el texto **Solo para el rol de administrador.**

Los permisos son una escalera de cuatro peldaños, no cuatro opciones sueltas: ninguno, lectura, escritura y total. El control total incluye escribir, y escribir incluye leer. Para ver una pantalla basta con lectura.

**Mi cuenta** es la excepción: se abre siempre, aunque le hayan quitado todos los permisos, porque nadie debe quedarse sin poder cambiarse la clave.

#### Contraer el menú

En pantallas de escritorio, el botón de la barra superior contrae el menú a una tira de iconos. Su etiqueta alterna entre **Contraer menú** y **Expandir menú**.

Contraído, cada icono muestra su nombre al pasar el ratón por encima, y **los módulos no se despliegan**: no hay ancho para el texto. Pulsar el icono de un módulo lleva a su **Tablero**, o a su primera pantalla si no tiene tablero. Al pie queda solo el círculo con las iniciales, y el nombre sale al pasar el ratón.

**El sistema recuerda cómo lo dejó**, en ese navegador, incluso después de cerrarlo. Quien trabaja con tablas anchas lo deja contraído y ya no lo repite cada mañana.

En el teléfono el menú no está fijo: se abre con **☰** y se cierra con la **✕** de su esquina o pulsando fuera.

### 3.2 La barra superior

De izquierda a derecha:

1. **☰** para abrir el menú, en el teléfono y en las pantallas que no llegan a ser de escritorio. Su etiqueta es **Abrir menú**.
2. El botón de **Contraer menú** / **Expandir menú**, solo en escritorio.
3. **Buscar**, con una lupa y la tecla sugerida **Ctrl K**. En el teléfono queda solo la lupa.
4. El aviso **Sin conexión en vivo**, que solo aparece cuando hace falta.
5. El indicador **Tasa BCV**, que no sale en el teléfono.
6. La campana de notificaciones.
7. Su círculo con las iniciales —en pantallas anchas, también su nombre y una flecha—, que abre el menú del usuario.

**Sin conexión en vivo** aparece únicamente si se pierde el enlace con el sistema o el equipo se queda sin red. Al pasar el ratón por encima explica qué implica: **Se perdió el enlace con el servidor. Recargue la página para actualizar los datos.** En pantallas chicas se reduce al icono de la señal tachada, pero no desaparece: se esconde justo donde la señal se cae, que es el patio.

El indicador **Tasa BCV** tiene estos estados. Al pasar el ratón, cada uno lo explica en un globo:

| Lo que ve | Qué significa | El globo dice |
| --- | --- | --- |
| Punto gris parpadeando | Todavía está consultando | — |
| Punto rojo y **No disponible** | No se pudo consultar | **No se pudo consultar la tasa. Verifique la conexión antes de emitir documentos.** |
| Punto verde, **Tasa BCV · hoy** y la cifra en bolívares | La tasa publicada es de hoy y además está registrada | **Tasa publicada hoy y registrada en el sistema. Abra para ver las demás monedas y convertir.** |
| Punto naranja y **Tasa BCV** seguido de una fecha anterior | La última publicada es de otro día | **La última tasa publicada es del** y la fecha, seguido de **Confirme antes de emitir documentos.** |
| Punto naranja y **Tasa BCV · hoy · sin registrar** | El BCV ya publicó la de hoy, pero el sistema todavía valora con otra | **El BCV ya publicó la tasa de hoy y el sistema todavía valora con otra. Abra para arreglarlo.** |

**El indicador solo enseña el dólar, pero se despliega.** Al pulsarlo se abre un panel con cuatro cosas:

- El aviso **La tasa de hoy no está registrada**, cuando toca. Debajo dice con qué está valorando el sistema —**El sistema valora con la del** y la fecha, seguido de **Regístrela antes de emitir.**—, o **Sin ninguna tasa registrada no se puede emitir nada.** si no hay ninguna. Pulsar el aviso lleva a Tasas de cambio.
- La lista **Con lo que valora el sistema**: el dólar y cada una de las demás monedas que lleva el sistema, con su cifra en bolívares o la palabra **sin registrar**.
- La calculadora.
- Al pie, el enlace **Ver y registrar tasas →**.

Se cierra pulsando fuera o con la tecla Escape.

**La cifra de la barra es la que publicó el BCV; la que usa el sistema para valorar los documentos es la registrada en Tasas de cambio**, que se explica en el capítulo 5. El color del punto dice si las dos coinciden, y el panel enseña las registradas.

#### La barra buscadora

**El buscador es la forma más rápida de llegar a cualquier sitio** sin recorrer el menú, y encuentra dos cosas distintas: **pantallas** y **documentos**.

Se abre de dos formas: pulsando **Buscar** en la barra, o con **Ctrl+K** desde cualquier pantalla —en un Mac, **Cmd+K**—. El mismo atajo la cierra, y también la cierran la tecla Escape y pulsar fuera de la caja. Al abrirse, el campo aparece vacío y con el cursor puesto.

El campo dice **Una pantalla, un número de documento, un nombre…** Se escribe, se sube y se baja con las flechas **↑** y **↓** —o pasando el ratón—, y se abre lo resaltado con **Enter**.

**Qué encuentra:**

- **Pantallas.** Con el campo vacío ofrece las primeras ocho; al escribir, hasta seis. Cada una lleva a su derecha, en gris, su módulo y su sección, para distinguir dos pantallas con nombre parecido.
- **Documentos y fichas**, bajo ese encabezado. Diez clases: **Orden de compra** por su número; **Proveedor** y **Cliente** por nombre o RIF; **Factura**, **Nota de entrega** y **Nota de salida** por su número; **Artículo** por código o nombre; **Trabajador** por nombres, apellidos, cédula o número de ficha; **Máquina** por código o nombre; y **Camión** por su placa. Cada resultado lleva a la izquierda su clase y a la derecha un detalle —el estado, el RIF, el cargo, la fecha…—. Salen hasta cuatro por clase y doce en total.

**Entiende cómo habla la gente, no cómo se rotula el menú.** El menú dice **Tasas de cambio** y quien necesita la calculadora escribe *convertir*. Cada pantalla tiene detrás una lista de palabras equivalentes: *stock* lleva a Existencias, *gasoil* a Combustible, *excel* o *planilla* a la carga por planilla —entre otras pantallas que también reciben planillas—, *liquidación* a Prestaciones sociales. Las palabras se pueden escribir en cualquier orden, a medias y sin tildes: *rep taller* encuentra el historial de taller.

Cuatro cosas de su funcionamiento que evitan malentendidos:

- **Los documentos se buscan a partir de dos letras.** Las pantallas se filtran desde la primera; si con una sola letra no coincide ninguna, dice **Escriba al menos dos letras.**
- Los documentos se buscan en la base, así que tardan un instante después de que deje de teclear. Mientras todavía no hay nada que enseñar, dice **Buscando…**
- **Solo encuentra lo que su permiso alcanza.** Ofrecer un atajo a una pantalla que va a rebotar por falta de permiso es enseñar una puerta cerrada. Si no hay nada, dice **Sin resultados en las pantallas ni en los documentos a su alcance.**
- **Las pantallas escondidas del menú tampoco salen aquí.** La lupa es otra puerta al mismo menú, y un módulo escondido que se encontrara escribiendo su nombre no estaría escondido.

Casi todos los documentos llevan a su ficha: la orden de compra, el proveedor, el artículo, el trabajador, la máquina y el camión —este último, en Maquinaria—. La nota de entrega abre su detalle y la nota de salida su papel en el historial de Salidas. El cliente deja en la lista de clientes, ya filtrada por su nombre, y la factura en la lista de facturas.

#### El menú del usuario

Se abre pulsando el círculo con sus iniciales, y se cierra pulsando fuera o con la tecla Escape. Contiene:

1. Su nombre completo y, debajo en gris, su usuario.
2. El bloque **Apariencia**, con los tres botones del tema.
3. **Mi cuenta**.
4. **Cerrar sesión**.

**Cerrar sesión cierra la sesión al instante, sin preguntar.** No hay confirmación, así que no lo pulse con algo a medio escribir: lo que no se guardó, no quedó.

**Cierra solo este equipo.** Si la misma cuenta está abierta en otro aparato, allí sigue abierta: varias personas comparten algunas cuentas, y salir de una no debe echar a las demás.

Cerrar sesión **no quita la huella** de ese equipo.

### 3.3 Las notificaciones

Sirven para enterarse de lo que pasa en el sistema —pedidos, entradas de inventario, pagos— sin tener que ir a mirar módulo por módulo. Se abren con la campana de la barra superior; no tienen pantalla propia.

Si hay avisos sin leer, la campana lleva una burbuja roja con el número.

#### Un asunto por línea, no un aviso por línea

Una compra no genera un aviso: genera varios. El sistema anota cada paso —el pedido, la confirmación, la aprobación de gerencia, la orden sin método de pago— y cada paso es un aviso. Puestos en fila, varias líneas seguidas hablando de la misma compra parecerían el mismo aviso repetido.

Por eso **los avisos se agrupan por asunto**: una compra, una línea. La línea enseña **en qué estado está la cosa ahora** —su último paso— y, si llegó ahí dando varios, dice cuántos fueron: **· 4 movimientos**.

La cuenta de la campana cuenta **asuntos** sin leer, no avisos. Es la misma cuenta que va a encontrar debajo.

**La campana mira los cuarenta avisos más recientes.** De ahí salen su cuenta y su lista. Para ir más atrás está **Ver todas**.

#### Qué se ve en el panel

- La cabecera **Movimientos** y, debajo, cuántos hay sin leer —**3 sin leer**— o **Todo al día**.
- El botón de silencio a la derecha de la cabecera, con el globo **Silenciar el sonido de aviso** o **Activar el sonido de aviso**. Silenciado, su campana sale tachada.
- Los ocho asuntos más recientes. La campana es un vistazo, no un archivo.
- Al pie, **Ver todas** —con el número de asuntos entre paréntesis si hay más de ocho— y, si queda algo sin leer, el botón de marcarlo todo, un icono con el globo **Marcar todas como leídas**.

Cada línea lleva un círculo con el icono de su módulo, el título del último movimiento —en negrita si no lo ha leído—, un detalle en letra pequeña y una última línea con el tiempo transcurrido, quién lo provocó y cuántos movimientos lleva el asunto. El tiempo se escribe **ahora mismo**, **hace 5 min**, **hace 2 h**, **hace 3 d**, **hace 1 mes** o **hace 2 meses**. Los asuntos con algo sin leer tienen el fondo ligeramente teñido y un punto naranja.

El color del círculo indica la importancia: **naranja** es informativo, **amarillo** pide atención y **rojo** es urgente. **La importancia que manda es la del último movimiento**, no la más alta que haya tenido: una compra que pasó por un momento urgente y después se resolvió ya no apura.

#### El orden

**Lo más reciente, arriba.** Cada asunto se coloca por su último movimiento: una compra de la que se habló ayer y otra vez esta mañana va arriba por lo de esta mañana.

Lo que no se ha leído no sube por estar sin leer: se distingue por su punto y por la cuenta de la campana. La importancia tampoco ordena: se ve en el color.

#### Ver todas

El botón del pie abre una ventana titulada **Movimientos**, con el archivo: **los doscientos avisos más recientes**, agrupados por asunto igual que en la campana. Es donde se averigua qué quedó pendiente de compras o qué pasó con aquella orden.

Trae dos filtros, y solo dos:

- **Todos** y **Sin leer**. El segundo lleva la cuenta entre paréntesis, y se apaga si no queda nada sin leer.
- **Todo** y una pastilla por cada módulo que tenga avisos, con cuántos —**Compras (12)**—, de más a menos. Las pastillas salen de lo que hay, no de la lista de módulos posibles, y solo aparecen si hay avisos de más de un módulo. Pulsar otra vez la elegida la quita.

Los dos filtros se combinan.

*No hay filtro por importancia a propósito*: la importancia ya colorea el icono —al pasar el ratón dice **Urgente**, **Requiere atención** o **Informativo**—, y filtrar por ella esconde justo lo que uno no sabía que tenía que mirar.

Cada asunto trae hasta tres botones:

- **Abrir**, si el asunto lleva a algún sitio. Lo marca leído, lleva al documento y cierra la ventana.
- **N pasos antes** —**1 paso antes** si es uno—, que despliega la historia sin salir de la lista. Cada paso dice qué pasó, cuándo y quién. Desplegado, el botón dice **Ocultar los pasos**.
- **Marcar leída**, si queda algo sin leer. Marca el asunto entero y no lleva a ninguna parte.

Abrir la historia y abrir el documento son dos preguntas distintas —qué pasó con esto, y llévame allí—, y por eso son dos botones: mezclarlas obligaría a salir de la lista para volver a entrar.

La ventana se cierra con **Cerrar**.

#### Qué se puede hacer

1. **Leer un asunto**: púlselo en la campana. Queda leído **entero**, con todos sus pasos, aunque no lleve a ninguna pantalla: haber abierto la compra es haberse enterado de cómo está. El panel se cierra y, si el asunto lleva a algún sitio, lo deja allí.
2. **Ver el archivo**: **Ver todas**.
3. **Marcar todas como leídas**: el botón del pie del panel, o **Marcar todas como leídas** en la ventana. Mientras trabaja queda desactivado.
4. **Silenciar el sonido**: el botón de la cabecera. La decisión se recuerda en ese navegador.

Sobre el sonido, tres cosas que evitan malentendidos:

- Son dos notas cortas, la segunda más aguda, a volumen bajo y generadas por el propio sistema.
- **No suena al abrir el sistema**, aunque tenga avisos acumulados de ayer. Solo suena por los que llegan sin leer con la pantalla ya abierta, esté en la pantalla que esté.
- **Puede no sonar la primera vez**: los navegadores no dejan sonar nada hasta que la persona ha pulsado algo en la página.

Si no hay nada, el panel dice **Sin movimientos todavía** y **Aquí entran los pedidos, las entradas de inventario y los pagos.**, y la ventana, **Sin notificaciones** y **Aquí se notifican los pedidos, las entradas de inventario y los pagos.** Mientras carga, **Cargando…** Y si se filtra en la ventana y no queda nada, **Sin resultados** y **Quite el filtro para ver el resto.**

La lista se refresca sola cada cinco minutos y cada vez que se vuelve a la pestaña, además del enlace en vivo que trae los avisos en el momento.

### 3.4 El tema claro y oscuro

En el menú del usuario, el bloque **Apariencia** tiene tres botones: **Claro**, **Oscuro** y **Sistema**, con un sol, una luna y una pantalla. El activo se ve resaltado.

**Sistema** es lo que viene puesto de fábrica: sigue lo que tenga configurado Windows o el teléfono, y cambia solo si el equipo cambia al anochecer con el sistema abierto.

El cambio es inmediato, sin recargar. Y **es por aparato y por navegador**: no viaja con su cuenta. Ponerlo en oscuro en la oficina no lo cambia en el teléfono.

La portada y la pantalla de entrar llevan un fondo oscuro fijo, en el tono tierra de la casa, que no cambia con el tema.

### 3.5 El aviso de versión nueva

De vez en cuando se publica una versión nueva del sistema. El sistema lo comprueba al abrirlo, cada cinco minutos, cada vez que se vuelve a la pestaña y cuando una pantalla no llega a cargarse. **No se recarga solo**: avisa y usted elige cuándo actualizar, para que pueda terminar y guardar lo que esté haciendo.

El aviso es un recuadro amarillo, abajo a la derecha —abajo y centrado en el teléfono—, por encima de todo lo demás:

- Título **Hay una versión nueva del sistema**
- Detalle **Guarde lo que esté haciendo y pulse Actualizar. La página no se recarga sola.**
- Botones **Actualizar** y **Más tarde**

**Más tarde** no lo quita: lo reduce a una etiqueta pequeña, **Versión nueva**, abajo a la derecha, y pulsándola se vuelve a abrir. Mientras no actualice sigue trabajando con la versión que tenía abierta. Si mientras tanto se publica otra, el aviso se vuelve a abrir solo.

Si entra a una pantalla que cambió con la versión nueva y ya no se puede traer desde la que tiene abierta, en su lugar aparece **Esta pantalla es de la versión nueva del sistema**, con el texto **Hay una versión nueva del sistema. Pulse Actualizar para abrir esta pantalla.** y los botones **Volver** y **Actualizar**. Si lo que falló es la conexión, dice **No se pudo abrir esta pantalla** y **No llegó desde el servidor. Revise la conexión y pulse Recargar.**, con los botones **Volver** y **Recargar**.

Si pulsa **Actualizar** y el navegador sigue trayendo la versión vieja, el aviso cambia:

- Título **Está viendo una versión antigua del sistema**
- Detalle **Hay una más reciente publicada y su navegador sigue trayendo la anterior. Recargue con Ctrl+Shift+R, o abra el sistema en una ventana de incógnito.**
- Botón **Recargar**

**Ese no se puede cerrar ni posponer**: trabajar sobre una versión vieja creyendo que está al día es peor que la molestia del recuadro. Se va cuando una recarga consigue traer la versión nueva.

El aviso aparece en cualquier pantalla, incluidas la portada y la de entrar. Y sin conexión no avisa de nada, porque no saber no es motivo para molestar.

### 3.6 Mi cuenta

**Menú del usuario › Mi cuenta**

Es donde consulta sus datos y hace lo que es suyo y de nadie más: cambiar su clave, activar o quitar la huella en su equipo y guardar su firma. No está en el menú lateral, y se abre siempre, aunque no tenga permiso sobre ningún módulo.

El encabezado dice **Mi cuenta** y **Datos personales y clave de acceso.** Debajo hay cuatro tarjetas.

**Sus datos.** Llevan por título su nombre completo y por subtítulo **Estos datos los cambia la administración.**

| Dato | Qué muestra |
| --- | --- |
| **Usuario** | Su nombre de acceso |
| **Cargo** | Su cargo. Si no está puesto, una raya |
| **Cédula** | Su cédula. Si no está puesta, una raya |
| **Teléfono** | Su teléfono. Si no está puesto, una raya |
| **En el sistema desde** | La fecha en que le dieron de alta, escrita completa |

Debajo, bajo el rótulo **Roles**, están los roles que tiene. El de administrador se pinta en naranja y el resto en gris. Si no tiene ninguno, dice **Sin roles asignados**.

**Ninguno de estos datos se edita aquí.** No hay campos ni botón de guardar para el nombre, el cargo, la cédula ni el teléfono. La razón es que identifican a la persona en todo lo que firma, y quien los cambia es quien administra el sistema, no cada quien sobre sí mismo. Si algo está mal, pídalo a la administración.

**Cambiar la clave.** Con el subtítulo **Nadie más debería saberla, ni siquiera quien administra el sistema.** El formulario se explica en 3.7.

**Entrar con la huella.** Es la tercera tarjeta, explicada en el apartado 2.3. Mientras el sistema comprueba si el equipo tiene lector, no se ve.

**Mi firma.** Con el subtítulo **Los papeles que emita salen firmados con ella: órdenes de compra, actas, recibos.** Si todavía no tiene ninguna, lo dice —**Sin firma guardada. Los papeles salen con la raya en blanco.**— y ofrece **Guardar mi firma**. La ventana para guardarla, **Guardar la firma**, deja trazarla, escribirla o cargar una foto de la que ya usa en papel.

Con la firma guardada, la tarjeta la enseña sobre la raya, como saldrá en el papel, con su estado —**En uso** o **Sin usar**— y los botones **Cambiarla** y **Quitar la firma**. Apagada, la firma sigue guardada pero los papeles salen con la raya en blanco, para firmarlos a mano.

### 3.7 Cambiar la clave

Es el mismo formulario en **Mi cuenta** y en la pantalla obligatoria del primer día; solo cambia el rótulo del botón.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Clave actual** | Sí | Oculta, con botón de ojo para verla |
| **Clave nueva** | Sí | Oculta, con botón de ojo. Debajo, la ayuda **Mínimo 8 caracteres.** |
| **Repita la clave nueva** | Sí | Oculta, con botón de ojo |

1. Escriba su **Clave actual**.
2. Escriba la **Clave nueva**, de ocho caracteres o más.
3. Repítala en **Repita la clave nueva**.
4. Pulse **Cambiar la clave**, o **Guardar y entrar** si es su primer ingreso. Mientras guarda dice **Cambiando…**

**El botón está apagado hasta que las cuatro condiciones se cumplen**: que haya algo escrito en **Clave actual**, que la nueva llegue a ocho caracteres, que la nueva y su repetición sean idénticas, y que la nueva sea distinta de la actual. Mientras escribe, los avisos salen en rojo debajo del campo, en el lugar de la ayuda: **Faltan 3 caracteres.**, **Tiene que ser distinta de la actual.** y **Las dos claves no son iguales.** Este último no aparece hasta que haya escrito algo en la repetición, porque señalar el error mientras se teclea es ruido.

Al terminar sale en verde **Clave cambiada. La próxima vez entre con la nueva.** y los tres campos se vacían.

Si su clave sigue siendo la que le dio la administración, el sistema no le deja trabajar hasta cambiarla: al entrar le lleva a la pantalla del primer día, con este mismo formulario.

#### Qué le pasa a sus otras sesiones

Esto es lo más importante de la pantalla y conviene saberlo de antemano:

**Cambiar su clave cierra todas sus demás sesiones abiertas**, en cualquier otro equipo o teléfono, sin aviso para quien las tuviera delante.

**La sesión desde la que está cambiando la clave se respeta**: usted no sale de su propia pantalla.

**Y desactiva la huella en los demás aparatos.** El pase guardado en cualquier otro equipo deja de servir en cuanto cambia la clave. Es la única forma de desactivarla a distancia, y por eso es lo primero que hay que hacer si se pierde un teléfono o un equipo: cámbiese la clave desde otro sitio y con eso echa a quien esté dentro y anula la huella allí.

Cuando la administración le repone la clave a alguien, a esa persona se le cierran todas sus sesiones, y la clave nueva nace marcada como prestada, así que tendrá que ponerse la suya al entrar.

### 3.8 Cuando algo no sale

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «La clave actual no es correcta.» | La clave que escribió arriba no es la que tiene puesta | Vuelva a escribirla. Si no la recuerda, pida a la administración que se la reponga |
| «Sesión no válida. Vuelva a entrar.» | Su sesión caducó mientras estaba en la pantalla | Vuelva a entrar y repita el cambio |
| «Su sesión venció. Vuelva a entrar y repita lo que estaba haciendo.» | Lo mismo, dicho por la pantalla | Vuelva a entrar y repita el cambio |
| «No se encontró su perfil.» | El sistema no encuentra sus datos | Avise a la administración |
| **Nombre del módulo** seguido de **no está a su alcance** | Abrió una dirección de un módulo que no le toca | Pulse **Volver al panel**. Si lo necesita para su trabajo, pida el permiso a la administración |
| **Esto lo ve la administración** | Intentó abrir Auditoría sin ser administrador | Pulse **Volver al panel** |
| **En construcción** | Abrió una pantalla que hoy está escondida del menú (1.5) | Pulse **Volver al panel**. No es cosa de permisos |
| «Su usuario no tiene permiso para esta acción.» | Falta el permiso para lo que intentó hacer | Pida el permiso a la administración, o que lo haga quien lo tenga |
| «Esa operación todavía no está disponible en la base de datos. Avise a soporte.» | Esa parte del sistema todavía no está instalada | Avise a soporte. No es algo que pueda resolver desde la pantalla |
| «La base cambió hace un momento. Recargue la página e inténtelo otra vez.» | El sistema se actualizó mientras esta pantalla estaba abierta | Recargue la página y repita lo que estaba haciendo |
| «Falta algo en la base de datos para esta pantalla. Avise a soporte.» | A la pantalla le falta algo que el sistema todavía no tiene | Avise a soporte |
| «No hay conexión con el servidor. Revise la red e inténtelo otra vez. Lo que no se guardó, no quedó.» | Se cayó el internet | Reintente cuando vuelva la señal |
| **Sin conexión en vivo** en la barra superior | El enlace en vivo se cortó; lo que ve puede estar viejo | Recargue la página para ponerla al día |
| «Algo salió mal. Vuelva a intentarlo; si se repite, avise a soporte.» | Un fallo que el sistema no reconoce | Vuelva a intentarlo; si se repite, avise a soporte |

---

## 4. El panel

**Panel** es la primera entrada del menú y adonde llega quien entra al sistema. Sirve para ver de un vistazo lo que hay que atender hoy y cómo va la operación.

La idea que hay que entender es esta: **el panel no se administra, se lee.** No hay ningún formulario ni botón de guardar; lo que se puede pulsar lleva a la pantalla donde el asunto se resuelve. Cada aviso nace de una condición del sistema y desaparece solo cuando esa condición deja de cumplirse. No se apagan a mano: el aviso de que falta la tasa se va cuando hay tasa, no cuando alguien lo descarta.

El encabezado dice **Panel** y debajo **Operación de** seguido del día de la semana y la fecha. Las cifras se refrescan solas cada cinco minutos.

### 4.1 De dónde salen las cifras

Todas las cifras del panel salen de lo registrado en el sistema. Ninguna es de ejemplo: lo que aquí dice cero, es cero.

Con dos salvedades que hay que conocer:

- Lo que la cantera produce **entra al inventario valorado en cero**, porque el sistema no calcula lo que cuesta producir una tonelada. El **Valor del inventario** en dólares del material producido no es una cifra en la que apoyarse; las cantidades sí.
- **El panel enseña solo lo que su permiso alcanza.** Eso se explica enseguida.

**El panel no muestra ningún porcentaje de variación.** No hay flechas de subida o bajada, ni comparaciones con ayer o con el mes pasado. Las cifras son la foto de ahora mismo, no una tendencia.

### 4.2 Los indicadores

Son las tarjetas de arriba. Cada una lleva un rótulo, una cifra y una línea de abajo que la explica, y pulsarla lleva a su pantalla.

| Rótulo | Qué mide | La línea de abajo | Se ve con |
| --- | --- | --- | --- |
| **Esperan aprobación** | Cuántas compras esperan la firma de la gerencia | **Sin compras detenidas**, o cuántos días lleva la más vieja | Compras |
| **Por pagar a proveedores** | Lo que se le debe a los proveedores | **Sin pendientes**, o cuántos pagos están autorizados | Tesorería |
| **Pagado sin recibir** | Dinero que ya salió por material que todavía no llegó | **Todo lo pagado llegó**, o cuántas órdenes vienen en camino | Tesorería |
| **Valor del inventario** | Lo que vale el material que hay | **Sin artículos bajo el mínimo**, o cuántos están bajo el mínimo | Inventario |
| **Acarreado en 7 días** | Metros cúbicos acarreados en la última semana | **Sin viajes esta semana**, o cuántos viajes | Explotación |
| **Máquinas activas** | Cuántas máquinas están activas | **Ninguna parada**, o cuántas están fuera de servicio y en el taller | Maquinaria |
| **Trabajadores activos** | Cuántos trabajadores hay activos | **Sin período abierto**, o cuántos períodos de nómina están sin pagar | Nómina |

**Cuando hay material de otros dueños, el valor del inventario se parte.** La tarjeta pasa a decir **Valor del inventario, todo**, con el total en grande —lo que se custodia—, y debajo cuánto es de La Cantera y cuánto de otros.

**Una tarjeta que no ve no es una tarjeta en cero.** Sin permiso, el sistema no devuelve los datos y el indicador saldría en cero, y **un cero se lee como «no hay nada», que es una afirmación falsa**. Es preferible no mostrar nada que mostrar una mentira. Por la misma razón, lo que se le debe a los proveedores cuelga de Tesorería y no de Compras: quien solo pide material escribe en Compras, y lo que debe la empresa no es asunto suyo.

#### Los colores

El color de estas tarjetas no es decoración, avisa de algo:

- **Esperan aprobación** se pone naranja si hay compras esperando, y verde si no.
- **Por pagar a proveedores** se pone naranja cuando el pago más viejo lleva más de siete días esperando.
- **Pagado sin recibir** se pone naranja si hay compras atrasadas, y verde si no hay ninguna.
- **Máquinas activas** se pone naranja si hay máquinas fuera de servicio.

### 4.3 Requiere atención

Es la tarjeta que dice qué está detenido. Su subtítulo es **Sin pendientes detenidos** o cuántos asuntos hay abiertos. Si no hay nada: **Sin compras atrasadas, pagos en espera ni artículos bajo el mínimo.**

Si hay algo, aparece una lista, **lo rojo arriba**, y cada aviso lleva a la pantalla donde se resuelve:

| Color | Lo que ve | Qué dice | Adónde lleva |
| --- | --- | --- | --- |
| Rojo | **La tasa de hoy no está cargada** | **Los documentos de hoy se valoran con la última tasa registrada.** | **Tasas de cambio** (5) |
| Rojo | Cuántas **compras pagadas sin recibir** | **Figuran como pagadas y no constan recibidas del todo desde hace más de una semana.** | **Compras** |
| Naranja | **Un pago lleva** tantos **días autorizado sin salir** | Sale a partir de los tres días | **Pagos por hacer** |
| Naranja | Cuántas **compras esperando al gerente** | | **Compras** |
| Naranja | Cuántos **artículos bajo el mínimo** | | **Existencias** |
| Naranja | Cuántas **salidas esperando aprobación** | | **Salidas y traslados › Salidas** (26.2) |
| Naranja | Cuántos **despachos pedidos sin aprobar** | **Se aprueban desde la nota de entrega.** | **Notas de entrega** (10.6) |
| Naranja | Cuántas **notas de entrega sin facturar** | Solo las que se pueden facturar | **Notas de entrega** |
| Naranja | Cuántas **máquinas fuera de servicio** | **No incluye las que están en el taller.** | **Maquinaria** |

**Los avisos también se filtran por su permiso.** Si el aviso lleva a un módulo que usted no puede abrir, no se le muestra: avisar de algo que no se puede ir a resolver solo sirve para inquietar. Consecuencia práctica: **el panel de cada persona es distinto**, y que usted no vea un asunto no significa que no exista.

### 4.4 Compras en curso

Esta tarjeta solo se ve con permiso de Compras. Su subtítulo es **Dónde está detenida cada una**, y muestra cinco filas con su número al lado, en este orden:

1. **Pedidos por confirmar**
2. **Buscando precios**
3. **Esperando al gerente**
4. **Por indicar el pago**
5. **Pagadas, por recibir**

Los ceros se ven más apagados, para que la vista se vaya sola a lo que tiene número. Al final, **Ver el tablero** lleva al tablero de Compras. Sin permiso de Compras, la tarjeta **Requiere atención** ocupa el ancho completo.

### 4.5 Despachos y ventas

Esta tarjeta solo se ve con permiso de Salidas o de Facturación. Su subtítulo cuenta cuántas notas de entrega no anuladas hay, cuántos movimientos de salida y, si los hay, cuántos traslados.

Debajo van dos cifras: **Total facturado**, en dólares, y **Total en bolívares**. **Las dos suman todas las notas de entrega que no están anuladas, se hayan facturado o no** —incluidas las pendientes por completar, que no suman mientras no tengan precio—. El rótulo dice «facturado», pero lo que cuenta es lo despachado.

Y dos botones, que arman un papel con el mismo desglose: cuánto salió de cada producto —solo lo que en el catálogo es producto, sin combustible, repuestos ni insumos—, a qué destinos fue —contado en movimientos, porque sumar metros cúbicos de arena con otra unidad no diría nada— y quiénes fueron los principales clientes, en dólares.

- **Generar informe** arma el papel formal, con la misma plantilla que los demás papeles del sistema.
- **Presentación** arma el mismo contenido con otro lenguaje visual —portada oscura, cifras en tarjetas de colores—, pensado para enseñar o proyectar y no para archivar.

Ninguno de los dos clasifica a los clientes: solo nombres, cantidades y montos tal como están en el sistema. Mientras se arma cualquiera de los dos, su botón dice **Generando…** y los dos se bloquean; cuando termina, se abre en el visor de documentos, listo para descargar o imprimir.

### 4.6 Esperando aprobación del gerente

Este bloque **solo aparece si hay compras pendientes de aprobar**. Su subtítulo es **Lo que lleva más tiempo detenido, primero**, y ese es exactamente el orden.

Cada tarjeta muestra el número de la compra, la etiqueta roja **Urgente** si lo es, el título, y una línea con quién la solicitó, el proveedor y cuánto tiempo lleva esperando. Si falta el solicitante dice **Sin solicitante**; si falta el proveedor, **sin proveedor**. A la derecha va el total en dólares, o un guion si todavía no lo tiene. Cada tarjeta lleva al detalle de esa compra.

### 4.7 Qué hacer

Al final, dos grupos de atajos a lo que más se hace desde aquí, en el orden en que suele venir:

- **Poner el sistema en marcha** —**Se carga una sola vez.**—: **Cargar el catálogo de artículos**, **Cargar el personal** y **Poner la tasa del día**.
- **Lo del día**: **Pedir algo que hace falta**, **Ver cómo está el almacén** y **Procesar la quincena**.

Cada persona ve solo los atajos que puede abrir: los que escriben piden escritura sobre su módulo.

### 4.8 Cuando algo no sale

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| **Cargando…** | Todavía está trayendo las cifras | Espere unos segundos |
| Una caja roja con un mensaje | No se pudieron traer las cifras | Recargue. Los mensajes más frecuentes están en la tabla del apartado 3.8 |
| Una tarjeta o un aviso que no aparece | No tiene permiso sobre ese módulo, y por eso no se muestra en lugar de mostrar un cero falso | Pida el permiso a la administración si lo necesita para su trabajo |

El panel no se descarga ni se imprime, salvo el informe de despachos y ventas (4.5), que es un papel aparte.

---

## 5. Tasas de cambio

**Sistema › Tasas de cambio**

Esta pantalla lleva las tasas del día, que son con las que el sistema valora todos los documentos que se emiten. La propia pantalla marca la diferencia con el indicador de la barra superior: **Tasa de cambio aplicada a los documentos. No es la del indicador de la barra superior, que solo informa.**

**Las tasas se registran solas.** Una tarea del sistema las toma varias veces al día de su fuente pública: el dólar y el euro, de lo que publica el **BCV**; el USDT, de la **mediana del P2P de Binance**, que se registra con fuente **PARALELO** porque no hay fuente oficial. Lo que queda para las personas es revisarlas, corregir la de hoy si la fuente se leyó mal, y cargar a mano las monedas que no tienen fuente pública. El bolívar no aparece en la lista porque su tasa contra sí mismo es uno por definición.

Antes de tocar nada hay que entender esto: **una tasa de un día cerrado no se corrige ni se borra.** No hay botón de editar ni de eliminar. La tasa es evidencia: con ella se valoró lo que se cotizó, se aprobó y se pagó ese día, y cambiarla después alteraría de golpe documentos ya emitidos. **La única excepción es la de hoy, si la tomó el sistema solo**: esa se puede enmendar el mismo día, una única vez (5.2).

### 5.1 Qué se ve

Lo primero de la pantalla es **la fila de monedas**: una píldora por cada una, con su nombre y su símbolo al lado en gris. **Todo lo que hay debajo —el formulario, los avisos y el historial— es de la moneda que esté elegida.** Abre siempre en el dólar, porque es con lo que se mide todo el sistema. Cambiar de moneda **vacía el campo del valor** a propósito: la cifra escrita para el dólar no vale para el euro.

**Registrar la tasa del día · $** es la tarjeta ancha de arriba, y el símbolo del final cambia con la moneda elegida. Su subtítulo lo resume: **Se registra automáticamente varias veces al día: dólar y euro del BCV, USDT de Binance. Aquí se revisa, se corrige la de hoy y se cargan las monedas sin fuente pública.** Con permiso de consulta, el título dice solo **La tasa del día · $**, el subtítulo dice de dónde sale —**Se registra automáticamente, del BCV.**— y no hay formulario.

Debajo hay un aviso de estado, siempre uno de los dos:

- En verde, si ya hay tasa de hoy: **La tasa de hoy ya está registrada: Bs** seguido de la cifra **por $. Los documentos que se emitan hoy en $ se valoran con esta.** Si la tomó el sistema, añade a qué hora y de dónde, y **Solo se puede corregir hoy.**
- En naranja, si no: **Todavía no se ha registrado la tasa de hoy en $.**, seguido de **Los documentos se están valorando con la del** y la fecha de la última. Si no hay ninguna tasa registrada de esa moneda: **Sin ninguna tasa registrada no se puede emitir nada en $.** Para las monedas con fuente pública, quien puede registrar tiene ahí el botón **Tomarla del BCV ahora** —o **Tomarla de Binance ahora**—, que la pide en el momento sin esperar a la próxima pasada.

**Ahora mismo** es la tarjeta estrecha, y muestra las dos tasas una encima de la otra para que no se confundan:

- Arriba, la de la calle: **Publicada por el BCV** para el dólar y el euro, **Mediana del P2P de Binance** para el USDT, con la etiqueta **De hoy** o **De un día anterior** —o **De ahora mismo**, en el caso de Binance—. Una moneda sin fuente pública dice su fuente y **Sin fuente oficial: se carga a mano.**
- Abajo, **Con la que valora el sistema**: la cifra registrada, o **Sin registros.** Debajo, **Registrada el** y la fecha, con **arrastrada** si viene de un día anterior.

Y debajo de esa tarjeta está la calculadora, que tiene su propio apartado (5.5).

**Historial** es la tercera tarjeta: **Últimas tasas registradas en $.**

| Columna | Qué muestra |
| --- | --- |
| **Fecha** | El día de la semana abreviado, el día, el mes y el año |
| **Bs por $** | El valor, con cuatro decimales |
| **Fuente** | De dónde salió: **BCV**, **PARALELO** u otra |

Los cuatro decimales no son un capricho: a más de doscientos bolívares por dólar, el cuarto decimal ya mueve céntimos en una factura.

La tabla va de la más reciente a la más antigua, es solo de la moneda elegida y muestra hasta sesenta filas, sin buscador ni filtros: una tasa muy antigua deja de aparecer aquí. Si no hay ninguna, **Sin tasas registradas en $**.

### 5.2 Cómo se carga o se corrige una tasa

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Fecha** | Sí | Viene puesta la de hoy en Venezuela. **No admite días futuros** |
| **Bolívares por $** | Sí | El rótulo cambia con la moneda: **Bolívares por €**, **Bolívares por USDT**. Admite decimales |

1. Elija la **moneda** en la fila de píldoras.
2. Revise la **Fecha**. Normalmente es la de hoy y no hay que tocarla.
3. Escriba el valor. Si el sistema pudo consultar la fuente pública, tiene un botón que la copia de un golpe: **Usar la del BCV**, o **Usar la de Binance** para el USDT. Ese botón no aparece si la consulta falló.
4. Pulse **Registrar**. Mientras guarda dice **Guardando…**.

Debajo del campo del valor, la ayuda dice qué se pudo consultar: **Según el BCV: Bs** con la cifra —**(no es de hoy)** si la publicada es de otro día— o, si no se pudo, **No se pudo consultar el BCV; escriba el valor a mano.** Para una moneda sin fuente pública: **Se registra como PARALELO: no hay fuente pública que consultar.**

**Si la de hoy la tomó el sistema y la fuente se leyó mal**, el botón dice **Corregir la de hoy**: se escribe el valor bueno y se guarda. **Solo se puede enmendar la tasa que tomó sola la tarea diaria, el mismo día y una única vez.** Una tasa que registró una persona no se corrige, y la de un día cerrado tampoco, porque ya valoró documentos.

**El botón está apagado mientras el campo del valor esté vacío**, y la fecha no deja elegir mañana ni después: una tasa futura valoraría documentos con un número que todavía no se ha publicado.

**Cargar una tasa pide escritura sobre Tasas de cambio** (13.1). Quien solo la consulta ve la pantalla completa —las monedas, el historial y la calculadora— pero sin el formulario.

### 5.3 De dónde salen las tasas

Hay dos tasas distintas en el sistema y no hay que confundirlas.

**La de la calle** se consulta a una fuente pública en internet. Es solo para mirar: el indicador de la barra superior y la parte de arriba de **Ahora mismo**. Para el USDT es la mediana de las diez primeras ofertas del mercado entre particulares de Binance, consultada desde el servidor.

**La registrada** es la que el sistema usa para valorar los documentos. Normalmente la registra el propio sistema; también puede escribirse a mano. Mientras no esté registrada, para el sistema no existe.

Si las dos no coinciden —arriba dice una cosa y **Con la que valora el sistema** dice otra—, lo más probable es que la de hoy todavía no se haya registrado: la tarea no ha pasado, o no pudo consultar la fuente.

**El USDT no tiene tasa oficial, y eso hay que saberlo.** El dólar y el euro los publica el BCV y se registran con fuente **BCV**; el USDT se registra con fuente **PARALELO**, porque nadie lo publica oficialmente. La cifra de Binance es una referencia de mercado, no una publicación con respaldo.

#### La tasa que se arrastra

El BCV no publica los fines de semana ni los feriados. Un documento emitido en sábado tiene que valorarse con algo, y ese algo es la última tasa registrada. Por eso **Ahora mismo** dice **arrastrada** cuando la que está valorando es de un día anterior: no es un error, es el sistema trabajando con lo último publicado.

**Cada moneda se arrastra por su cuenta.** Si un día no hay euro registrado, lo que se emita en euros se valora con el último euro que haya.

### 5.4 Por qué cada documento congela la tasa del día

Cuando se emite una cotización, se aprueba una compra o se registra un pago, el documento **se queda con la tasa que había ese día**. No se recalcula después, aunque la tasa suba mañana.

La razón es la que sostiene toda la contabilidad de la empresa: una factura de hace tres meses tiene que valer hoy lo mismo que valía cuando se emitió. Si los documentos se revaloraran cada vez que cambia la tasa, ningún total cuadraría dos días seguidos, y una cotización que el cliente aceptó por una cifra pasaría a decir otra.

De ahí salen dos consecuencias prácticas:

- **Conviene mirar la tasa a primera hora.** Mientras no esté la de hoy, el panel avisa, porque todo lo que se emita antes se valorará con la del día anterior. Si hace falta emitir antes de que pase la tarea, **Tomarla del BCV ahora** la trae en el momento.
- **Una tasa mal cargada por una persona no se corrige en esta pantalla.** Los documentos ya emitidos con ella se revisan con la administración. Por eso vale la pena mirar dos veces la cifra antes de pulsar **Registrar**.

### 5.5 La calculadora

Está en dos sitios: en la tarjeta **Ahora mismo** de esta pantalla, y dentro del panel que se despliega al pulsar el indicador de tasa de la barra superior. Sirve para hacer una cuenta con monedas mezcladas sin buscar la tasa a mano.

Su rótulo es **Calcular** y el campo trae de ejemplo **(300 $ + 120 €) / 3**. Se escribe la cuenta como se diría en voz alta y el resultado sale debajo, en grande, mientras se teclea. Con el campo vacío ofrece tres ejemplos que se pueden pulsar: **(300 $ + 120 €) / 3**, **850 usdt \* 1,16** y **1200 $ - 340,50 €**.

Cuando el resultado es dinero aparece una fila **en** con una píldora por cada moneda, y pulsando una se convierte el resultado a esa moneda. Solo salen las monedas que tengan tasa registrada.

Debajo del resultado, la calculadora **repite cómo leyó la cuenta**, con los signos escritos como se escriben a mano. Es para que se vea si entendió lo que se quiso decir antes de apuntar el número.

**Cómo hay que escribirle:**

- La moneda se nombra por su símbolo, su código o su nombre: **$**, **USD**, **dólar**, **dólares**, **€**, **euro**, **Bs**, **USDT**. Da igual mayúscula o minúscula.
- El decimal puede ir con coma o con punto: **15,50** y **15.50** valen lo mismo.
- Se puede sumar, restar, multiplicar, dividir y agrupar con paréntesis.

**Cuatro reglas que explican casi todos sus avisos:**

- **Dinero más dinero da dinero**, aunque sean monedas distintas: todo pasa por bolívares, que es la única moneda contra la que hay tasas.
- **Dinero por un número da dinero.** Es lo que se usa para el IVA: **× 1,16**.
- **Dinero entre un número da dinero.** Es repartir.
- **Dinero entre dinero da un número**, que es una proporción. Y **dinero por dinero no existe**: el resultado no sería una cantidad de nada. Si se intenta, responde: «No se puede multiplicar dinero por dinero. Para un porcentaje use un número suelto, como «× 1,16».»

Si se escribe una moneda que no existe, lo dice y, cuando se parece a una que sí, la propone: ««bsb» no es una moneda. ¿Quiso escribir Bs?» Y si la moneda existe pero no tiene tasa registrada, avisa de lo que falta: «Falta registrar la tasa de Euro.»

**La calculadora no registra nada.** Es una cuenta hecha en pantalla: no queda guardada, no aparece en ningún documento y no valora nada.

### 5.6 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Ya existe una tasa BCV para USD/VES del …» con «Las tasas no se corrigen: si el valor cambió, consulte con administración.» | Ya hay tasa de ese día y esa moneda | Revise el historial: la de ese día ya está. Si la tomó el sistema hoy y está mal, use **Corregir la de hoy**; si no, hable con la administración |
| «Si la registró una persona, no se corrige: las tasas de un día cerrado son inmutables.» | Se quiso enmendar una tasa que no tomó el sistema | Hable con la administración |
| «No hay una tasa automática de hoy para … que corregir» | La de hoy no la tomó el sistema, o no hay tasa de hoy | Registre la tasa con **Registrar** |
| «Solo se puede enmendar la tasa que tomó sola la tarea diaria, el mismo día y una única vez.» | Esa tasa ya se corrigió una vez, o no es de hoy | Hable con la administración |
| «La tasa debe ser mayor que cero (recibido: …)» | Se escribió cero o un valor negativo | Escriba la tasa publicada |
| «No se puede registrar una tasa con fecha futura» | La fecha es de mañana o después | Corrija la fecha |
| «Su usuario no tiene acceso a ….» | Su permiso sobre Tasas de cambio es de consulta | Que la cargue quien tenga escritura |
| «Las tasas de cambio no se modifican ni se borran (operación: …). Inserte una tasa nueva.» | Se intentó cambiar o eliminar una tasa ya registrada | No se cambia: queda como está |
| **No disponible** en el indicador de la barra superior | No se pudo consultar la tasa pública | La registrada sigue valiendo. Si hace falta, escriba el valor a mano |
| «Falta registrar la tasa de Euro.» en la calculadora | Esa moneda no tiene tasa registrada | Regístrela arriba, eligiendo esa moneda |
| «No hay conexión con el servidor. Revise la red e inténtelo otra vez. Lo que no se guardó, no quedó.» | Se cayó el internet | Repita cuando vuelva la señal |

---

## 6. Explotación

**Operación › Explotación**

Explotación es el acarreo y lo que sale de la planta, camión por camión. El menú ofrece cuatro pantallas:

- **Tablero**: el resumen del día.
- **Salidas de planta**: cada camión que sale de la planta con producto, y cuántos metros cúbicos lleva.
- **Viajes de camiones**: el acarreo, qué camión movió qué y de dónde a dónde, y lo que se le paga al transportista.
- **Plantas y rutas**: las minas, plantas, patios y bases, quién las opera, y las rutas entre ellos con su tarifa.

**Frentes y bancos**, **Voladuras** y **Producción por turno** existen pero están escondidas del menú (1.5). Se cuentan al final del capítulo, en 6.7.

Hay una idea que ordena las cuatro pantallas que se ofrecen: **miden y pagan, pero no mueven el inventario.** Una salida de planta no saca nada de Existencias y un viaje no mete nada. Lo que hacen es contar —metros cúbicos que salieron, viajes que se hicieron— y de esa cuenta salen el costo por m³ de **Centro de costo** y lo que se le debe a cada transportista.

### 6.1 Quién entra y quién puede hacer qué

Para entrar a cualquiera de las cuatro pantallas hace falta lectura sobre **Explotación**. Sin ella, el módulo no aparece en el menú, y quien escribe la dirección ve **Explotación no está a su alcance**.

Lo demás depende de casillas de la matriz de permisos (13.1):

| Casilla | Para |
| --- | --- |
| **Anotar lo que sale de la planta** | Anotar salidas de planta |
| **Anular una salida de planta** | Anularlas |
| **Cargar los viajes del dia** | Cargar viajes y corregir los que aún no se aprueban |
| **Anular un viaje** | Anularlos |
| **Aprobar o rechazar viajes** | Aprobar, rechazar y ajustar el precio de los viajes |
| **Ver cuanto se le paga a cada transportista** | Ver tarifas, precios y montos. No la da ningún nivel: se marca a propósito |
| **Crear rutas y cambiar lo que se paga por viaje** | Crear y corregir rutas, y ponerles tarifa |
| **Abrir, cerrar y ceder plantas** | Dar de alta, cerrar, reabrir y ceder los sitios |

Los nombres de las casillas se copian como salen en la pantalla de permisos, algunos sin tilde.

Quien no tiene la casilla de ver el pago ve una raya donde iría cada precio y cada monto, y los papeles lo dicen: **No se muestran: hace falta la casilla de ver el pago**.

**Quién aprueba los viajes de un sitio:** su **Responsable**, que se pone en Plantas y rutas, quien tenga la casilla **Aprobar o rechazar viajes**, o el gerente general.

En Plantas y rutas, lo que se escribe se guarda en mayúsculas.

### 6.2 El tablero

**Operación › Explotación › Tablero**

La pantalla de entrada: **Acarreo y salidas de planta, camión por camión. Los frentes y el parte de turno están en obra.**

Arriba, dos cifras del día: **Salidas de hoy**, con cuántos camiones salieron, y **Metros cúbicos de hoy**, **Estimados por la carga útil del camión**. Solo cuentan las salidas que no se anularon.

Debajo, tres atajos: **Anotar una salida**, **Viajes de camiones** y **Plantas y rutas**, cada uno con lo que se hace ahí. A cada persona le salen los que su permiso alcanza.

### 6.3 Salidas de planta

**Operación › Explotación › Salidas de planta**

**Salidas de producto de la planta, camión por camión. Es la medición de referencia: los metros cúbicos corresponden a la carga útil estimada del camión.**

Se trabaja un día a la vez: arriba dice **Hoy** y la fecha, con el botón **Ver otro día**. Mirando otro día, lo avisa: **Está mirando otro día. Lo que anote se guarda con esa fecha.**

A la izquierda está el formulario y a la derecha la lista, **Lo que va saliendo**, con su total del día: cuántas salidas y cuántos metros cúbicos. Cada fila dice el camión, el producto, el número de la salida y los metros cúbicos, o **Sin medir**. Las anuladas se quedan en la lista, atenuadas, pero no suman.

#### Anotar una salida

1. Elija el **Camión**. Si hay pocos camiones salen como botones, uno por placa; si hay muchos, como una lista con buscador.
2. Elija el **Producto**: **Solo los que se miden en metros cúbicos: es lo que sale a granel de la planta.**
3. Revise los **Metros cúbicos (estimado)**: **Se llena solo al elegir el camión**, con su carga útil. Si trajo otra cosa, cámbielo. Si el camión no tiene carga útil cargada, póngalos a mano o la salida queda **Sin medir**.
4. Pulse **Anotar salida**.

El camión y el producto se quedan puestos para la siguiente, que es lo normal cuando el mismo camión va y viene con lo mismo.

**Las salidas de planta no se corrigen: se anulan.** Quien tiene la casilla de anular ve el botón en cada fila. La ventana pide un **Motivo** y dice lo que pasa: **No se borra: queda anulada con el motivo. Si ya entró al centro de costo, allí aparece para reversarla.**

**Para qué sirve todo esto.** Cada salida es el denominador del **Costo por m³** de **Centro de costo**: lo que costó la caja, dividido entre lo que salió de la planta. Sin salidas de planta anotadas, Centro de costo no puede dar ese número.

### 6.4 Viajes de camiones

**Operación › Explotación › Viajes de camiones**

**Viajes por camión o máquina y por ruta. Cada viaje nuevo queda pendiente de aprobación del responsable de la mina o planta, o de quien tenga ese permiso; hasta entonces no cuenta para el pago.**

Tiene dos pestañas: **Viajes del día** y **Registro de pago**.

#### Viajes del día

Arriba se elige el **Día**, y están los botones **Imprimir el día** y **Reporte de operaciones**. A la derecha, para quien ve el dinero, la **Tarifa por viaje** de cada ruta.

Los viajes se ven en una tabla por empresa transportista —los camiones propios en **Flota propia**—, con una fila por camión y una columna por ruta, más los **m³** y el **Monto a pagar** del día. Debajo de cada tabla está el formulario para cargar viajes, y al pie el total del día. **Ver los**, con el número de viajes, abre el detalle de un camión, viaje por viaje.

#### Cargar viajes

Lo hace quien puede cargar viajes (6.1).

1. Elija el **Camión** —o la **Máquina**, en la sección de máquinas propias— y la **Ruta**.
2. Elija la **Carga**: **Con la carga completa** (los metros cúbicos salen de la carga útil del camión), **Con carga parcial** (hay que decir cuántos traía) o **Vacío**.
3. Escriba la **Cantidad de viajes**. **La cantidad se suma a los que ya tenga** ese camión en esa ruta ese día; no los reemplaza.
4. Si la ruta es de precio libre o su tarifa es un rango, diga el **Precio de cada viaje**.
5. Pulse **Cargar**.

El precio lo pone la ruta. Si tiene tarifa fija, se copia la vigente en la fecha del viaje, y cambiar la tarifa después no toca los viajes ya cargados. Si es un rango, el precio tiene que caer dentro. Si es de precio libre —es lo que se hace con la coraza, que se cuadra con el pedido—, lo dice quien carga. **Las máquinas propias no se pagan por viaje**: el viaje queda contado sin precio.

#### Aprobar, rechazar y ajustar el precio

**Todo viaje nuevo nace «Por aprobar» y no cuenta para el pago hasta que alguien lo aprueba.** Los pendientes del día salen arriba, en el bloque **Por aprobar**, agrupados por camión y ruta, con los botones **Aprobar** y **Rechazar**, y **Ajustar precio** para quien ve el dinero. Quien no puede decidir sobre un grupo lee **Lo decide el responsable**.

- **Ajustar precio** sirve para el viaje que volvió a medias o vacío: se pone el precio nuevo a los viajes marcados, con un motivo, y queda escrito lo que traían de la ruta.
- **Rechazar** pide un motivo, que lee quien los cargó. **Un viaje rechazado no cuenta ni se paga, y no se puede volver a aprobar**: si fue un error de carga, se carga de nuevo.

El bloque solo enseña los pendientes del día elegido; los de otros días se ven cambiando la fecha.

#### Corregir y anular

En el detalle de un camión, cada viaje que aún no se aprueba tiene **Corregir**, para la hora y los metros cúbicos. **Solo se corrige lo que todavía no se ha aprobado.**

**Anular** está en cualquier viaje que siga contando, para quien puede anular (6.1): **El viaje deja de contar y de cobrarse, pero la fila se queda, y su número no se reutiliza.** El hueco queda a la vista para poder explicarlo. En la pantalla, sí. El papel del día, en cambio, por defecto deja fuera anulados y rechazados y vuelve a numerar los que quedan; para verlos en el papel hay que marcar **Incluir anulados y rechazados** en la vista previa.

#### Registro de pago

**No paga nada.** Es la consulta de lo que se le debe a cada empresa, para imprimirla o descargarla:

- **Ver**: **Un día** o **Rango de fechas**, con atajos (**Hoy**, **Ayer**, **Esta semana**, **Este mes**, **Mes pasado**), y la **Empresa**.
- **Imprimir el día** o **Imprimir el período**, en PDF.
- **Descargar el día** o **Descargar el período**, en hoja de cálculo.

Solo cuentan los viajes aprobados y los de antes de que existiera la aprobación. Lo que se paga de verdad pasa por **Centro de costo**, que es donde se aceptan los viajes como costo.

#### El reporte de operaciones

**Reporte de operaciones** arma el mensaje del día que se manda por WhatsApp: **Se copia y se pega tal cual: no se guarda en el sistema.** Se le añaden las **Novedades del día** —lo que el sistema no sabe— y se copia con **Copiar el mensaje** o se baja con **Descargar .txt**.

Conviene saber cómo cuenta, para leerlo bien:

- Cuenta los viajes **a planta fija, a lavado y de coraza**, que son los tres tramos de antes de que existieran las rutas. Los viajes de una ruta creada después no entran en esa cuenta.
- El número de viajes incluye los que esperan aprobación, pero **los metros cúbicos solo suman lo aprobado**. Si todo está por aprobar, el volumen sale como que no se puede calcular.

### 6.5 Plantas y rutas

**Operación › Explotación › Plantas y rutas**

**Minas, plantas, patios y bases de la operación, con su operador y las rutas entre ellos con su tarifa por viaje.**

#### Sitios

Un sitio es una **Mina**, una **Planta**, un **Patio**, una **Base** u **Otro**. Cada uno dice quién lo opera —la empresa, la gobernación o un aliado— y desde cuándo, quién es su **Responsable** y cuál es su **Patio de inventario**, que es el almacén de Inventario donde queda su material.

Bajo el nombre de cada sitio abierto, en otro color, sale lo que le falta para trabajar: sin patio, sin responsable, sin rutas encendidas, o una ruta sin tarifa.

- **Nuevo sitio** abre un formulario en dos pasos, **Identificación** y **Operación e inventario**. El código no se cambia después.
- **Ceder u operador** cambia quién lo opera desde una fecha. El de antes queda en la historia hasta el día anterior. El material del patio y las máquinas solo pasan al nuevo operador si se marcan.
- **Cerrar** pide fecha y motivo, y antes de cerrar enseña lo que lo impide —viajes por aprobar, traslados o salidas pendientes, mantenimientos abiertos— y lo que conviene tener presente. Desde esa fecha no se cargan viajes que salgan del sitio o lleguen a él. Su patio sigue abierto.
- **Reabrir** lo devuelve al instante, sin confirmación. Al reabrirlo, la fecha y el motivo del cierre dejan de verse en la pantalla; quedan solo en la auditoría.

#### Rutas

Una ruta une dos sitios, y es por donde se cargan los viajes. Entre los mismos dos sitios puede haber más de una. Cada ruta tiene **una tarifa fija, un rango** (cada viaje dice cuánto se paga dentro de él) **o precio libre**.

- **Nueva ruta** pide el **Origen**, el **Destino**, un **Nombre** si va a haber dos entre los mismos sitios, y si es de **Precio libre**. Una ruta con viajes no cambia de origen ni de destino: se apaga y se crea otra.
- **Tarifas** abre la historia de la tarifa de la ruta y deja poner una nueva, que **rige desde su fecha**. Los viajes ya cargados llevan copiado su precio y no cambian. **Si se pone una tarifa con la misma fecha que otra que ya había, la sustituye**: la historia guarda una por fecha.

El botón **Tarifas** solo sale a quien ve el dinero. Para ponerle tarifa a una ruta hacen falta las dos casillas, la de crear rutas y la de ver el pago.

### 6.6 Lo que conviene entender

#### Por dónde entra el material al patio

- **Registrar entrada**, en **Inventario › Existencias**, admite cualquier artículo que lleve existencias, también los productos de cantera. Lo registra como una entrada sin compra, con su procedencia y su costo (7.4).
- **Salidas de planta** y **Viajes de camiones** no mueven el inventario.
- **Producción por turno** también escribe entradas, pero no está en el menú (6.7).

#### Lo que se mide, se mide en metros cúbicos

Las salidas de planta se anotan en metros cúbicos, y solo con productos que se miden así. Las toneladas salen solo como equivalencia, con la densidad que tenga el artículo en el catálogo. Lo mismo el reporte de operaciones: su tonelaje es estimado.

#### Los metros cúbicos son estimados

Salvo que se escriban a mano, los metros cúbicos de una salida o de un viaje son **la carga útil del camión**, no una medición del material. Un camión sin carga útil cargada deja sus salidas **Sin medir**, y sus viajes no suman metros cúbicos aunque cuenten y cobren.

### 6.7 Frentes, voladuras y parte de turno

Estas tres pantallas llevan lo que pasa en el cerro: dónde se trabaja, cada disparo y lo que produjo cada turno. No se ofrecen desde el menú, y quien llega a su dirección ve el cartel de obra (1.5).

**Qué hacen, en corto:**

- **Frentes y bancos** anota los sitios del cerro donde se trabaja, y con qué se arranca: voladura, martillo o los dos.
- **Voladuras** registra cada disparo con su fecha, su explosivo, su responsable, su permiso y las toneladas estimadas. Se rechaza contra un frente de martillo.
- **Producción por turno** carga lo que produjo cada turno, un renglón por material, y es lo único del sistema que escribe una **Entrada de producción** en el inventario: al guardar el parte, cada renglón entra al patio elegido, con costo cero. Pide un frente activo, y cada renglón, un artículo de categoría producto. Un turno en un frente admite un solo parte. Anular un parte saca exactamente lo que ese parte metió, salvo que ya se haya despachado.

Las casillas de permiso de estas tres pantallas —ver la producción, abrir frentes, anotar y anular voladuras y partes— están en la matriz, pero no deciden nada: estas pantallas miran el nivel del módulo.

### 6.8 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| **Explotación no está a su alcance** | No tiene lectura sobre Explotación | Pulse **Volver al panel**. Si lo necesita para su trabajo, pídalo a la administración |
| «Su usuario no tiene permiso para esta acción.» | Le falta la casilla de lo que intentó hacer, y el mensaje no dice cuál | Mire en 6.1 qué casilla hace falta y pídala |
| **Su rol no registra salidas** en Salidas de planta | No tiene la casilla de anotar salidas | Pídala, o que las anote quien la tenga |
| **Sin productos medidos en metros cúbicos** | Los productos del catálogo usan otras unidades | Revise la unidad del producto en el catálogo de artículos |
| **Sin rutas abiertas** en Viajes de camiones | No hay rutas encendidas con los dos sitios abiertos | Créelas o enciéndalas en **Plantas y rutas** |
| **Sin camiones registrados** | No hay camiones en la flota | Regístrelos en **Maquinaria › Equipos**, con su placa y su capacidad |
| Una ruta con **Sin tarifa: no se pueden cargar viajes** | La ruta no tiene tarifa vigente | Póngasela con **Tarifas**, en Plantas y rutas |
| **Lo decide el responsable** en un grupo por aprobar | Usted no responde por ninguno de los dos sitios de esa ruta | Que lo apruebe el responsable, quien tenga la casilla o el gerente general |
| **No se puede cerrar todavía** al cerrar un sitio | Hay algo pendiente en el sitio | La ventana dice qué y dónde se resuelve |
| «Ya existe un registro con ese dato, y no puede haber dos.» al crear una ruta | Ya hay una ruta con ese nombre entre esos dos sitios | Póngale un nombre distinto |
| «No hay conexión con el servidor. Revise la red e inténtelo otra vez. Lo que no se guardó, no quedó.» | Se cayó el internet | Reintente cuando vuelva la señal |

---

## 7. Inventario

El inventario es el libro de lo que hay. Todo lo que entra y todo lo que sale del patio, del almacén, del taller y del surtidor queda escrito en una sola lista, en orden, con la fecha, la hora, la cantidad y el nombre de quien lo registró.

Hay una idea que conviene entender antes de tocar nada, porque explica casi todo lo demás:

**La existencia no es un número guardado. Es una suma.** El sistema no tiene apuntado en ningún lado que hay 125 toneladas de granzón. Lo que tiene es la lista de movimientos, y cada vez que se abre la pantalla los suma. Por eso el número nunca puede quedar desactualizado ni desincronizarse: no existe hasta que se calcula.

De ahí se desprende la consecuencia práctica: **para cambiar una existencia hay que escribir un movimiento**. No hay otra forma. No se puede corregir el número directamente, ni siquiera siendo administrador.

En el menú, **Operación › Inventario** tiene tres entradas: **Tablero**, **Existencias** y **Almacenes y talleres**. Existencias lleva las pestañas **Existencias · Catálogo · Movimientos**, y Almacenes y talleres las pestañas **Almacenes y patios · Talleres · Dueños del material**. Lo que sale del almacén —las salidas y los traslados— se pide y se sigue en su propio módulo, **Salidas y traslados** (capítulo 26).

### 7.1 Quién entra y quién puede registrar

Hay dos puertas distintas, y conviene no confundirlas.

La primera es **ver el módulo**. Depende del permiso sobre Inventario que la administración le haya dado a su usuario. Sin él, Inventario no aparece en el menú, y quien escribe la dirección a mano ve una tarjeta con un candado: **Inventario no está a su alcance**.

La segunda es **poder registrar**, y no la decide una sola cosa:

| Qué se ve | Qué hace falta |
| --- | --- |
| En **Existencias**, la cabecera —**Acta de conteo físico**, **Registrar entrada**, **Solicitar salida**, **Trasladar** y **Mandar al taller**— y en cada fila **Solicitar salida**, **Contar** y **Al taller** | El rol **Almacén**, o ser administración |
| **Deshacer**, en **Movimientos**, y **Llegó**, en el tablero | El rol **Almacén**, o ser administración |
| **Cambiar de dueño**, en la fila de un almacén | Las dos cosas a la vez: el rol **Almacén** (o administración) y **control total** sobre Inventario |
| **Categorías**, en el catálogo | **Control total** sobre Inventario |
| **Corregir el costo** | Una casilla propia de la matriz de permisos (13.1), aparte del rol y del nivel |
| **Eliminar duplicado** | Solo administración |

**Los botones de almacén cuelgan del rol, no del nivel de permiso.** Quien tiene **Control total** sobre Inventario pero no el rol Almacén ve las pantallas y no ve ninguno de esos botones, tampoco el del acta. No es un error.

Si ve las pantallas pero no ve ningún botón de acción, su usuario consulta y no registra.

### 7.2 Dos cosas que pasan en todas las pantallas

**Los nombres y las notas se guardan en mayúsculas y sin tildes.** La eñe se conserva. Así, buscar «CAMIÓN» y «camion» encuentra lo mismo.

**Lo que registra otra persona aparece sin recargar la pantalla.** Si almacén registra una entrada mientras usted mira las existencias en la oficina, la cifra cambia sola.

### 7.3 El tablero

**Operación › Inventario › Tablero**

Es la pantalla por la que se empieza. No se registra nada aquí: se lee cómo está el patio y se sale hacia donde toca. Su descripción lo resume: **Estado actual del patio y las entradas y salidas de material.** Arriba a la derecha, **Ver existencias**.

**Material de clientes por recibir.** Cuando un cliente paga una factura con material (21.2), el tablero enseña arriba una tarjeta con lo que está por llegar: cuánto, de qué, de quién, a qué almacén y cuánto vale. Su subtítulo lo dice: **Pagos con material de facturas de venta. La factura no baja hasta que aquí se confirme que el material llegó al patio.** El botón **Llegó** lo ve el rol Almacén; los demás ven **Lo confirma almacén**. Al confirmar, el material entra con el costo acordado y la factura baja lo que el material vale. La ventana lo advierte: **Esto no se deshace: el material queda en el patio y el cobro registrado. Si no llegó completo, no lo confirme; que Facturación anule este cobro y lo registre con la cantidad real.**

Debajo hay cuatro tarjetas:

| Rótulo | Qué mide | La línea de abajo |
| --- | --- | --- |
| **Artículos con existencia** | Cuántos artículos tienen algo, no cuántos hay en el catálogo | **de 28 en el catálogo** |
| **Valor del inventario** | Lo que vale todo lo que hay | **A costo promedio, no a precio de venta**. Si hay material de más de un dueño, el rótulo es **Valor del inventario, todo** y debajo va una línea por dueño |
| **Bajo el mínimo** | Cuántos artículos de los almacenes propios están por debajo de su mínimo | **Sin artículos por reponer**, o **En el mínimo o por debajo** |
| **Movimientos de hoy** | Cuántas líneas se escribieron hoy en el libro | **Entradas, salidas y traslados** |

**Bajo el mínimo es la única tarjeta que se enciende**, con un filo ámbar arriba y el triángulo de aviso, y solo cuando hay algo que atender. Un artículo sin mínimo puesto no cuenta: no está bajo mínimo, está sin configurar.

Debajo, los atajos, agrupados por el orden en que hacen falta:

| Bloque | Atajos |
| --- | --- |
| **Poner el almacén en marcha** | Va numerado, 1 a 3: **Cargar el catálogo**, **Abrir los almacenes**, **Cargar el saldo inicial** |
| **El día a día** | **Llegó una compra**, **Sacar material** y **Trasladar a otro almacén**. Los dos últimos llevan a **Salidas y traslados** |
| **Revisar y cuadrar** | **Contar el almacén**; **Reponer lo que falta (3)** cuando hay artículos en el mínimo, o **Ver lo que está por debajo del mínimo** cuando no; y **Ver qué le pasó a un artículo** |

**Cada atajo sale solo a quien tiene permiso sobre el módulo al que lleva.** El de **Cargar el saldo inicial** lo ve quien tiene escritura sobre Inventario, pero el botón que lo hace, **Registrar entrada**, es del rol Almacén (7.1).

Al pie, en **Primeros pasos**, queda esta orientación: *«La existencia es la suma del libro de movimientos: cada cosa que entra, sale o se traslada deja su renglón. Lo que llega con una orden entra al recibir la compra; lo demás, con «Registrar entrada» en Existencias. Las salidas y los traslados están en Salidas y traslados. Si el conteo no cuadra con el sistema, se corrige con un ajuste, que queda anotado con su motivo y con quién lo hizo.»*

**La existencia no se escribe a mano: se deduce del libro.** Registrar una entrada no es escribir *hay cuarenta*: es anotar que entraron cuarenta y cuánto costaron, y la existencia sube como consecuencia. La diferencia importa el día que alguien pregunta de dónde salieron.

### 7.4 Existencias

**Operación › Inventario › Existencias**

Cuánto hay de cada cosa, dónde está y cuánto vale. Desde aquí se registra lo que entra sin una compra de por medio, se cuenta, se pide una salida, se traslada y se manda al taller.

**Primero todo, después dónde.** La pantalla abre con **el total de la empresa**: una fila por artículo, sumando todos los sitios. Su descripción lo dice: **Existencias totales de la empresa. Seleccione un almacén o taller para consultar y mover su contenido.** Con un almacén elegido, cada fila es lo que hay en ese sitio.

#### Qué se ve

Arriba, si hay artículos en el mínimo o por debajo, aparece una franja ámbar: **3 artículos en el mínimo o por debajo**, seguida del enlace **Ver solo esos**, que se convierte en **Ver todo** al pulsarlo. Solo se controlan los artículos que tengan una existencia mínima distinta de cero.

Los filtros son **Buscar**, que acepta el nombre o el código del artículo, y **Almacén**, que empieza en **Todo el inventario**; los talleres llevan un **· taller** detrás del nombre. Si hay material de más de un dueño aparece además **Dueño**, que empieza en **De todos**. **Lo que está en cero no se ve**, salvo lo que está en el mínimo o por debajo; el enlace **Mostrar lo que está en cero** lo enseña.

Encima de la lista, una franja con el nombre del sitio —o **Toda la empresa**— y cuatro cifras: **Tiene**, cuántos artículos; **Vale**, a costo promedio; **Por reponer**, que al pulsarlo deja solo lo bajo; y **Traslados**. Si el sitio es de otro dueño, la franja lo dice: **Este material está a disposición de la cantera pero no es suyo: lo que valga no suma al patrimonio de la empresa.**

La lista tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Artículo** | Nombre y, debajo, el código |
| **Existencia** | Cantidad y unidad. Con la etiqueta **Mínimo** si está bajo |
| **Almacén** | El sitio. Viendo el total se llama **Repartido en** y dice **3 sitios** |
| **Costo prom.** | Lo que cuesta en promedio cada unidad, en dólares |
| **Valor** | Existencia por costo promedio |

Debajo de la cantidad pueden salir más líneas, y solo cuando hace falta:

- **10 disponibles · 4 en manos de alguien**, si hay unidades entregadas a alguna persona. Es la distinción del apartado 7.12: existir no es estar disponible.
- Cuánto es de la empresa y cuánto de otros dueños, viendo el total.
- **≈ 45 M3**, la otra medida, en los materiales a los que se les cargó la densidad.

**El valor solo lo ve quien tiene permiso para verlo.** Sin él, en lugar de la cifra dice **Sin permiso para ver el valor**.

**Las acciones cuelgan de un sitio, no del total.** Viendo el total, la fila ofrece **Ver dónde está**, que abre el desglose: cada sitio con su cantidad y su costo por unidad, apagado si está en cero, y ahí los botones de cada sitio. Si el artículo está en un solo sitio, **Contar** sale ya en la fila. El material sale de un sitio concreto y de ahí se descuenta.

#### Registrar entrada

El botón **Registrar entrada** abre **Entrada de material**. Es **Para lo que entra sin una compra de por medio: el saldo con el que arranca el almacén, algo comprado por fuera, material que trae alguien.**

**Entran varios artículos de una vez.** El almacén se elige una sola vez y debajo van **Renglón 1**, **Renglón 2**… con el botón **Añadir otro artículo** y un enlace **Quitar** en cada uno.

1. Pulse **Registrar entrada**.
2. Elija el **Almacén**. Si el almacén es de otro dueño, la ventana avisa de que lo que entre será suyo.
3. En cada renglón: el **Artículo** —del catálogo entero, no solo de lo que ya tiene existencia—, la **Cantidad**, el costo por unidad y la **Moneda**.
4. Si viene al caso, llene la **Referencia**: **Quién lo trajo, o el número de una factura de fuera.**
5. Escriba la **Procedencia**, de al menos cuatro letras: **Queda en el libro y no se puede editar después.**
6. Pulse **Registrar**.

**El costo se escribe en la moneda en que se pagó, y el sistema convierte** a dólares con la tasa del día. La moneda nace vacía a propósito: hay que elegirla.

**Si no se sabe cuánto costó**, se marca **Donación, o no se sabe cuánto costó**: **Entra sin costo y queda pendiente de valorar.** No es lo mismo que costo cero.

**El sistema compara el costo con el que ya tiene ese artículo en ese almacén.** Si es la primera vez que entra ahí, o si el costo se sale mucho de lo de siempre, lo dice antes de guardar y pide marcar una casilla para seguir: **Lo comprobé con la factura, también la moneda**, o **Es correcto, guárdelo así — quedará anotado en el movimiento**. Es lo que evita el cero de más.

#### Solicitar salida

**Desde Existencias no se saca material: se pide.** **Solicitar salida**, en la cabecera o en la fila de un sitio, lleva a **Salidas y traslados › Salidas** con la solicitud abierta, y desde la fila ya con el artículo y el almacén puestos. La salida no descuenta nada hasta que la aprueba quien responde por el almacén y alguien de almacén la entrega. Todo el circuito está en 26.2.

#### Contar (conteo físico)

Contar no es corregir el sistema a mano. Es declarar lo que se contó y dejar que el sistema calcule y registre la diferencia.

1. Pulse **Contar** en la fila del artículo, o en su sitio dentro de **Ver dónde está**.
2. En **Cantidad contada** viene puesta la existencia que dice el sistema. **Escriba encima lo que contó de verdad.**
3. Debajo aparece la cuenta hecha: **Diferencia: −15 TON**.
4. Si en ese sitio hay material de varios dueños, elija de cuál es lo contado.
5. Escriba el **Motivo**.
6. Pulse **Registrar**.

Si hay diferencia, el sistema escribe un movimiento de ajuste **por la diferencia**, nunca por el total contado, y lo valora al costo promedio. Un faltante, por lo tanto, también baja el valor del inventario.

**Si lo contado coincide con lo que dice el sistema, el conteo se guarda igual**, y no se escribe ningún movimiento: no hay nada que corregir. Queda constancia de que se contó, que es justo lo que sirve para saber, por ejemplo, en qué envases está lo que hay. Por eso no hace falta tocar el número para registrar un conteo que cuadra; lo que no conviene es registrarlo sin haber contado.

La nota del ajuste queda compuesta sola, con lo contado, lo que decía el sistema y el motivo: «Conteo físico: 110 KG contra 125 KG en sistema. SE MOJÓ EL LOTE DEL FONDO». Si se contó por envases, lo contado va desglosado: «Conteo físico: 2 TAMBOR y 10 L = 410 L contra 425 L en sistema. SE DERRAMÓ AL TRASVASAR».

Se cuenta **un artículo y un sitio a la vez**. Si el artículo se lleva en varios envases, el enlace **¿Contó envases de varios tipos?** deja anotar cuántos de cada uno.

#### Trasladar

**Trasladar** abre **Nuevo traslado**, que es el mismo de **Salidas y traslados › Traslados** (26.3), con sus tres formas: **Pedir material de otro almacén**, **Enviar material a otro almacén** y **Traslado directo**. Si hay un almacén elegido, llega como origen.

#### Mandar al taller

**Mandar algo al taller no es sacarlo, porque vuelve.** Por eso tiene su propia operación.

Hay dos puertas: **Mandar al taller** en la cabecera, y **Al taller** en la fila. **El de la fila solo aparece en los artículos que se pueden mandar al taller**, según su ficha (7.8).

La ventana **Mandar material al taller** pide el **Taller**, la cantidad, el **Motivo** —**Lo que se sabe ahora. El trabajo realizado se anota al cerrarla.**—, la **Urgencia**, la **Especialidad**, la **Fecha de salida** y los **Días estimados**: **Si se pasa, el taller lo marca en su cola.** Desde la cabecera pide además el artículo y de dónde sale.

**El taller puede rechazar el trabajo por su oficio.** La ayuda lo advierte: **Si el taller declaró sus oficios y este no está, no lo acepta.** Los oficios de cada taller se editan en 7.5.

**La vuelta se registra desde Talleres** (7.5). Lo que no vuelva queda como merma del taller.

#### Cambiar de dueño

**El material no se mueve; cambia de dueño.** Sirve cuando lo que está en un almacén pasa a ser de otro, por ejemplo una donación con su acta. Pide el **Dueño anterior**, el **Dueño nuevo**, la cantidad, la **Fecha**, el **Valor acordado (USD)** —**Es el total, no el unitario. Solo se llena si el acta dice otra cifra.**— y un **Motivo** de al menos diez letras: **Con detalle: el acta, la factura o el acuerdo que lo respalda.** Solo aparece si hay más de un dueño registrado.

#### Corregir el costo

Cuando un costo se cargó mal. La ventana lo explica: **No se cambia ninguna cantidad: sale todo al costo de ahora y vuelve a entrar al correcto, y los dos renglones quedan en el historial.** Pide el **Costo correcto por unidad**, la **Moneda de la factura** y, si no es en dólares, la **Fecha de la factura**, y enseña antes de guardar el valor de ahora, el corregido y el ajuste en libros. Si parte del material ya salió al costo malo, lo dice: esa parte no se recupera, porque ya se cargó a una máquina o a un centro de costo. El **Motivo** lleva al menos diez letras: **Queda en el movimiento y se avisa a administración y gerencia.**

#### Cambiar de envase

Solo dentro de **Ver dónde está**, y en los artículos que se llevan en varios envases. **Los litros no cambian: cambia en qué están.** Se dice qué sale —**De aquí sale**— y cómo queda —**Y queda así**—, y las dos orillas tienen que sumar lo mismo; la cuenta lo dice con **Cuadra**. Cierra con **Anotar el cambio**.

#### Eliminar duplicado

Solo para administración, en la vista del total, para el artículo que se cargó dos veces. **Esto no genera una salida. Si el artículo nunca tuvo movimiento se borra entero; si ya tuvo, reversa cada movimiento (una corrección, no un consumo) y lo desactiva, dejando la existencia en cero. Si figura en una factura, una nota u otro documento, no se puede eliminar: se desactiva.** El motivo queda en la auditoría.

#### La producción entra valorada en cero

**El material que produce la cantera entra al inventario sin valor.** Lo que cuesta producir una tonelada sale de la nómina, el gasoil y la voladura, y ese cálculo no pasa al inventario (15.2).

Consecuencia que hay que tener presente al mirar esta pantalla: la producción sube las toneladas del patio pero no sube el **Valor del inventario**, y arrastra el **Costo prom.** hacia abajo. El valor en dólares del material producido no es una cifra en la que apoyarse; las toneladas sí.

### 7.5 Talleres

**Operación › Inventario › Almacenes y talleres › Talleres**

Es la segunda pestaña de **Almacenes y talleres**. Un taller es un almacén más —los de tipo **Taller**—, pero se mira con otra pregunta: **Material asignado a cada taller y su consumo. El detalle por artículo está en Existencias.**

Hay una tarjeta por taller, con su nombre, su código y la etiqueta **Cerrado** si está inactivo.

**Arriba van los oficios**: unas etiquetas con lo que ahí se hace, o **Acepta cualquier trabajo** si no se declaró ninguno. El botón **Oficios** los edita, con escritura sobre Maquinaria. **Al mandar algo al taller el sistema comprueba contra esa lista**, y si el trabajo no está entre sus oficios no lo acepta.

Dentro, tres bloques:

- **En el taller ahora**: las órdenes abiertas, con su urgencia y los días que lleva dentro contra los estimados, en rojo si se pasaron. Una etiqueta dice **Sin sitio** o **Le queda sitio**, según los trabajos que admite a la vez.
- **Material asignado**: cuántos artículos tiene y cuánto valen, con la etiqueta **2 bajo mínimo** si la hay; o **Sin material recibido. Ingresa por traslado desde otro almacén o por compra recibida.**
- **Máquinas asignadas**: las que tienen ese taller como sede, con su semáforo de mantenimiento; o **Sin máquinas con sede en este taller.**

**La vuelta del material se registra aquí.** Una orden sobre material se pulsa en **En el taller ahora**, con escritura sobre Maquinaria, y abre **El material vuelve del taller**: el **Trabajo realizado**, la cantidad que vuelve —viene puesta la que entró—, el **Destino**, que **Puede no ser el mismo del que salió.**, y el **Costo del trabajo (USD)** si lo hizo un taller de fuera. Lo que no vuelve queda como merma del taller.

Al pie, **Ver su inventario**, que lleva a Existencias con ese taller ya elegido, y **Qué ha reparado**, con lo último que pasó por el taller y su costo.

Si no hay ninguno: **Un taller se crea como almacén de tipo Taller. Desde entonces recibe material, lleva sus existencias y se le pueden atribuir reparaciones.**, con el botón **Ir a almacenes**.

### 7.6 Movimientos

**Operación › Inventario › Existencias › Movimientos**

Es la tercera pestaña de **Existencias**, y es el libro: **Libro de movimientos del inventario. Los registros no se editan ni se eliminan: toda corrección se asienta como un movimiento nuevo.**

Cada línea muestra el número del movimiento —**MOV-2026-0001**, que se reinicia cada año—, el tipo, la fecha y hora, quién lo registró, para quién salió si salió para alguien, y la nota. Si la nota es larga se corta, y **ver más** abre el detalle entero. La cantidad va **en verde con un más** si entró material y **en rojo con un menos** si salió.

**Los filtros son cinco**: **Almacén**, **Material**, **Clase** —**Solo entradas**, **Solo salidas** o **Solo traslados**—, **Registrado por** y un rango de fechas. **El rango se aplica sobre la fecha del movimiento** —el día en que pasó— **y no sobre el momento en que alguien lo escribió**, que es lo que manda en el orden de la lista. Los ajustes, los reversos, las correcciones de costo y los cambios de dueño solo salen sin elegir clase.

**La pantalla cuenta los 1000 movimientos más recientes.** Si hay más, lo dice: **Se están contando los 1000 movimientos más recientes, y hay más. Acote el material, la clase o las fechas para que el total sea de todo.**

Encima de la lista, un resumen de lo filtrado con **Agrupar** **Por material**, **Por usuario** o **Por mes**. Pulsar un material o un usuario del resumen filtra el libro por él.

En la cabecera, **Imprimir el libro** saca en PDF exactamente lo que se está viendo, con los filtros puestos.

En las líneas que restan, el botón **Nota** saca su papel: la nota de traslado si es la salida de un traslado, y la nota de salida en las demás.

#### Deshacer un movimiento

**El botón se llama Deshacer.** Lo ve el rol Almacén.

1. Busque la línea equivocada.
2. Pulse **Deshacer**: **Se escribe el movimiento contrario a MOV-2026-0007. El original se queda en el libro.**
3. Escriba el **Motivo**.
4. Confirme con **Deshacer**.

El nuevo lleva la nota «Reverso de MOV-2026-0007.» seguida de la explicación. Después se registra el movimiento correcto.

Tres reglas que conviene saber de antemano:

- **Un movimiento deshecho no se vuelve a deshacer**, ni se deshace dos veces. Si se equivocó al deshacer, registre el movimiento que corresponda.
- **Un traslado con número propio no se deshace desde aquí**: lo pedido o en camino se cancela, y lo recibido se devuelve con un traslado de vuelta (26.3). Un traslado sin número propio sí se deshace, y entonces se escriben dos líneas, una en cada almacén; la segunda dice «Reverso de MOV-2026-0008, la otra mitad del traslado MOV-2026-0007.». Tampoco se deshace una corrección de costo, que se vuelve a corregir, ni el pago de una compra con material.
- **No se puede deshacer si el material ya no está.** Si deshacer una entrada obligaría a sacar material que ya se consumió, el sistema lo impide y lo dice con nombre y cantidad. En ese caso el camino es un conteo físico.

### 7.7 Trasladar

Los traslados entre almacenes se hacen desde **Salidas y traslados › Traslados**, y están contados en 26.3. Desde Existencias se llega a la misma ventana con el botón **Trasladar** (7.4).

Un traslado no siempre es inmediato: se puede pedir, enviar y confirmar que llegó, cada paso por quien responde por su almacén. Y no se deshace desde Movimientos: lo pedido o en camino se cancela, y lo recibido se devuelve con un traslado de vuelta.

### 7.8 Catálogo de artículos

**Operación › Inventario › Existencias › Catálogo**

Es la segunda pestaña de **Existencias**: **Catálogo de artículos que se solicitan, se compran y se cuentan.** Un artículo mal definido se convierte más adelante en existencias que no cuadran, así que vale la pena crearlo con calma.

Se filtra por **Buscar**, que mira también el código anterior de un artículo renumerado, y por **Categoría**, que empieza en **Todas**. Dos botones separan **Activos** y **Desactivados**; se abre en los activos. Las columnas son **Código**, **Artículo**, **Categoría**, **Unidad**, **Al entregarlo** y **Mínimo**.

**Pulsar la fila abre la ficha del artículo**, que es donde está su historia (7.9). Al final de cada renglón van **Desactivar**, el lápiz para corregir y la papelera para borrar.

En la cabecera, **Cargar por planilla** (7.10), **Categorías** con control total sobre Inventario, y **Nuevo artículo**.

#### Crear un artículo

Pulse **Nuevo artículo** y llene la ficha. **Obligatorios: nombre, categoría y unidad.**

| Campo | Detalle |
| --- | --- |
| **Código** | **Vacío, se asigna con el prefijo de su categoría.** Una vez puesto, no se cambia |
| **Nombre** | Si ya hay uno que se llama igual o parecido, lo dice; con uno igual hay que marcar **Es otra cosa distinta — créelo aparte** para seguir |
| **Categoría** | Sale de la lista de categorías. Al elegirla propone si lleva existencias, si va al taller y el modo de entrega, y todo se puede cambiar |
| **Unidad** | Con qué se mide. No conviene cambiarla después (7.12) |
| **Densidad, en toneladas por metro cúbico** | Solo si la unidad es M3 o TON, y ahí es obligatoria: **sin ella no se puede expresar** en la otra medida |
| **Existencia mínima** | **Cero significa que no se controla.** |
| **Presentación** y **Unidades por presentación** | Cómo llega —un tambor, un saco— y cuánto trae |
| **Marca** y **N° de parte o serial** | Opcionales |
| **Modo de entrega** | Qué pasa al entregarlo a una persona. Las tres opciones están abajo |
| **Descripción** | |
| **Lleva existencias** | **Marcada, el sistema cuenta cuánto hay en cada almacén. Sin marcar, se compra y se vende igual, pero no recibe entradas, no se traslada y no se descuenta al despachar.** Un servicio no lleva existencias |
| **Se puede mandar al taller** | **Marcada, va al taller y vuelve arreglado. Sin marcar, se gasta y no se repara.** Decide si el artículo ofrece **Al taller** en Existencias (7.4) |

**De quién es el material no se dice en el artículo.** Se dice al darle entrada, eligiendo el almacén: el dueño vive en el almacén (7.11).

Al corregir un artículo aparece además **Otras formas de contarlo**, para los que llegan en varios envases. **Lo de aquí se guarda al momento: «Cancelar» no lo deshace.**

#### Las categorías

Con **control total** sobre Inventario aparece el botón **Categorías**: **Clasifican los artículos y deciden con qué letras empiezan sus códigos. Las del sistema no se eliminan.** Se escribe el nombre de la nueva y su **Prefijo** —**Con él empiezan sus códigos.**— y se pulsa **Crear**. Las que trae el sistema llevan la marca **Del sistema**; las demás se pueden eliminar mientras ningún artículo las use.

#### Qué pasa al entregarlo

Es el campo que evita entregar gasolina «hasta que la devuelva». Entregar un destornillador y entregar gasolina no son la misma operación.

| Opción | Qué significa |
| --- | --- |
| **Retornable** | **Queda a nombre de quien lo recibe y se le pide de vuelta. Aparece en Asignaciones.** |
| **Consumible** | **Se gasta al usarlo. Sale por su propio camino —combustible, dotación, movimiento de almacén— y no como préstamo.** |
| **No entregable** | **Lo que se vende o se contrata. Nadie se lo lleva.** |

**La categoría propone el modo que acierta más veces** —una herramienta o un equipo de protección vuelven, un producto o un servicio no se le entregan a nadie— y se puede cambiar. Al corregir un artículo, cambiar la categoría no pisa el modo que ya tenía.

En la lista, esta columna se llama **Al entregarlo**.

#### Corregir, desactivar y borrar un artículo

- **Se corrige** con el lápiz. Se abre **Corregir REP-BOMBA** y se puede cambiar todo menos el código: **El código no se cambia.** Si la categoría ya no casa con el prefijo del código, el botón **Ponerle el código que le toca** lo renumera, mientras no figure en ningún papel.
- **Se desactiva** con **Desactivar**, y se pide un **Motivo** de al menos diez letras: **Deja de verse en el catálogo y en los formularios. Su historia no cambia, y se puede volver a activar desde «Desactivados».**
- **Se borra** con la papelera, y **solo mientras nada lo haya tocado**: **Se elimina del todo y no se puede deshacer. Con movimientos, órdenes o documentos no se puede eliminar: se desactiva.**

**Revise el nombre y la unidad antes de guardar.** Un artículo desactivado deja de aparecer en las listas, pero sus movimientos siguen en el libro.

### 7.9 La ficha de un artículo

**No está en el menú.** Se llega pulsando la fila del artículo en el **Catálogo de artículos**.

Es donde un artículo cuenta su historia: qué es, cuánto hay y **todo lo que le ha pasado desde que se creó**, en orden y sin tener que filtrar el libro a ojo.

Arriba van el **código**, el **nombre** y la **descripción**, y a la derecha el botón **Al catálogo** para volver.

#### De un vistazo

Cuatro tarjetas:

| Rótulo | Qué muestra |
| --- | --- |
| **Existencia** | Cuánto hay en total, con su unidad |
| **Categoría** | La categoría, y debajo **Lleva existencias** o **No lleva existencias** |
| **Al entregarlo** | **Vuelve** / **Se gasta** / **No se entrega**, y debajo la explicación: **Queda a nombre de quien lo tiene**, **Sale del almacén y no vuelve** o **No es algo que se le dé a una persona** |
| **Mínimo** | El número, o un guion. Debajo, **Avisa al bajar de aquí** o **No se controla** |

Dentro de **Existencia**, y **solo cuando hay unidades en manos de alguien**, aparece una segunda línea: **6 disponible · 4 en manos de alguien**. Si el disponible llega a cero o menos, se pinta en ámbar. Cuando nadie tiene nada prestado esa línea no se dibuja: repetirla siempre enseñaría a no leerla.

Debajo van las equivalencias y el valor por envase, y cómo se compró y a cómo salió.

#### Su historia

Es la tarjeta grande de abajo, **Historial**, y su subtítulo lo resume: **Desde su creación, del más reciente al más antiguo.** Enseña los 200 hechos más recientes.

No es una tabla, es una lista: un renglón por hecho. Cada uno lleva un icono a la izquierda —**flecha verde hacia abajo** si sumó existencia, **flecha roja hacia arriba** si la restó, **círculo** si no la movió—, el nombre de lo que pasó, la cantidad con su unidad, el almacén, y al pie la fecha y la hora, el documento y **lo registró** seguido del nombre de la persona. Cuando el hecho tiene que ver con alguien —una entrega, una devolución, una pérdida— aparece además el nombre de esa persona en una etiqueta gris.

Cuando un movimiento tiene motivo, el título lo lleva detrás de un punto: **Salió para consumo ·** seguido del motivo de la salida.

Los hechos que puede contar son estos:

| Lo que se lee | Qué fue |
| --- | --- |
| **Se creó en el catálogo** | El primer renglón de todos. Al lado, su categoría y su unidad |
| **Entró por una compra** | Una recepción de compras |
| **Entró sin compra de por medio** | La entrada de 7.4: el saldo inicial, algo comprado por fuera |
| **Entró por producción** | Un parte de turno de Explotación |
| **Volvió al almacén** | Material devuelto |
| **Salió para consumo** | Una salida entregada, con su motivo detrás |
| **Salió en un despacho** | Una nota de entrega de una venta |
| **Salió como pago de una compra** | Material que se dio para pagar una orden de compra |
| **Se perdió en el manejo** | Merma: se rompió, se derramó, se echó a perder moviéndolo |
| **Salió ·** y su causa | Una baja. No se registran nuevas; las que hay siguen en el libro |
| **Ajuste: sobraba** / **Ajuste: faltaba** | Un conteo físico, en cada sentido |
| **Se trasladó a otro almacén** / **Llegó de otro almacén** | Los dos movimientos de un traslado |
| **Se deshizo un movimiento** | Una corrección |
| **Se entregó como dotación** | Se le dio a alguien por su rol |
| **Se asignó para una actividad** | Se le dio a alguien para una faena concreta |
| **La devolvió** | Volvió a manos de la empresa |
| **Se dio por perdida** / **Se reportó dañada** / **Incidencia** | En ámbar: no mueven existencia, pero cambian quién responde |
| **Se saldó con descuento de nómina** / **La repuso** / **Se le exoneró** / **Se saldó** | Cómo se cerró una pérdida (18.5) |
| **Se mandó al taller ·** y el tipo de trabajo | Con el motivo, el oficio y la urgencia detrás |
| **Volvió del taller** | Con lo que se le hizo y, si volvió menos de lo que se mandó, cuántos faltaron: **faltaron 2** |

Si el artículo no ha tenido movimiento, se ve **Sin movimientos todavía**. Si el identificador de la dirección no corresponde a ninguno, **No existe ese artículo.** con el enlace **Volver al catálogo**.

**La ficha de un artículo desactivado se sigue abriendo.** Su historia no desaparece porque se le apague la etiqueta.

### 7.10 Cargar artículos por planilla

**No está en el menú ni en ninguna pestaña.** Se llega por el botón **Cargar por planilla** del **Catálogo de artículos**, y también por el atajo **Cargar el catálogo** del tablero.

**Para cargar muchos artículos de una vez, o corregir los que ya están.** Es la pantalla que hace falta el día que se monta el catálogo, y la que sirve después para cambiarle el mínimo o el precio a cincuenta artículos de un golpe.

La idea que ordena toda la pantalla es esta: **primero se ve lo que va a pasar, y solo después se escribe.** Y es todo o nada: **con una sola fila mal, no entra ninguna.**

Son tres pasos, los tres a la vista en la misma página. A la derecha hay un panel de ayuda, **Qué va en cada columna**, con el detalle de cada una y un aviso **Obligatoria** en las que lo son.

#### 1 · Descargue la plantilla

**Columnas, dos filas de ejemplo y una hoja de instrucciones.**

Pulse **Descargar plantilla**. Baja un archivo llamado `plantilla-articulos.xlsx`: **Excel con dos hojas: datos e instrucciones. Guárdela sin cambiar el formato.** Las columnas que se eligen de una lista —categoría, unidad, moneda, almacén, dueño— traen su desplegable con lo que hay en el sistema al descargarla.

Trae dieciocho columnas, en este orden:

| Columna | ¿Hace falta? | Qué va |
| --- | --- | --- |
| `codigo` | No | **Solo para corregir un artículo que ya está: escriba su código. Para uno nuevo, déjelo vacío y la base le pone uno. Un código que no existe no entra.** |
| `nombre` | **Sí** | **Cómo se llama.** |
| `descripcion` | No | **Detalle. Si se deja vacía en un artículo que ya existe, se respeta la que tenía.** |
| `categoria` | **Sí** | **Elija una de la lista. Son las mismas que ofrece el sistema al crear un artículo, con el mismo nombre.** |
| `unidad` | **Sí** | **Con qué se mide. Elija una de la lista: sale de las unidades que la empresa tiene cargadas.** |
| `inventariable` | No | **SI o NO. En uno nuevo, vacío es SI; en uno que ya existe, vacío respeta lo que tenía. Un SERVICIO tiene que ser NO.** |
| `modo_entrega` | No | **Qué pasa al entregarlo: RETORNABLE vuelve, CONSUMIBLE se gasta, NO es que no se entrega a nadie. En uno nuevo, vacío es CONSUMIBLE; en uno que ya existe, vacío respeta lo que tenía.** |
| `reparable` | No | **SI o NO: si esto se puede mandar al taller y vuelve arreglado. Vacío se deduce de la categoría — un repuesto o una herramienta sí, lo demás no. En un artículo que ya existe, vacío respeta lo que tenía.** |
| `stock_minimo` | No | **A partir de cuánto avisa. En uno nuevo, vacío es cero —que es no avisar—; en uno que ya existe, vacío respeta lo que tenía.** |
| `densidad_ton_m3` | No | **Toneladas por metro cúbico. Obligatoria en lo nuevo que se mide en M3 o en TON: sin ella no se puede expresar en la otra medida. En uno que ya la tiene, vacía la respeta; otra distinta no entra, porque cambiarla pide motivo y se hace en el catálogo.** |
| `precio` | No | **Precio de venta. Poner precio exige permiso de escritura en Ventas.** |
| `precio_minimo` | No | **Lo más bajo que se puede vender. Vacío es cero: sin suelo.** |
| `moneda` | No | **La moneda del precio y del costo. Si la fila trae precio o costo, hace falta: vacía, esa fila no entra y el sistema la marca para corregirla.** |
| `almacen` | No | **Dónde está lo que hay. Se escribe el código o el nombre, como se lee en la pantalla de almacenes. Va con cantidad y costo: las tres o ninguna.** |
| `propietario` | No | **De quién es lo que entra. Vacío significa «del dueño del almacén», que es lo normal. Se llena cuando el material es de otro: cosas de la gobernación guardadas en un almacén propio.** |
| `cantidad` | No | **Cuánto hay de esto en ese almacén. Entra como carga inicial, con su movimiento y su fecha.** |
| `costo` | No | **Cuánto vale la unidad de lo que entra. NO es el precio de venta: de este número salen el valor del inventario y lo que costará cada salida futura. Si nadie sabe cuánto costó, déjelo vacío y escriba SI en la siguiente.** |
| `sin_valorar` | No | **SI cuando llegó sin saber cuánto costó: una donación, algo sin factura. Va con cantidad y con el costo VACÍO. Entra pendiente de valorar, y no se cuenta como si valiera cero. Vacío es NO.** |

**`almacen`, `cantidad` y `costo` convierten la planilla en una forma de arrancar un almacén entero**: cargan el catálogo y su existencia inicial de una vez, cada una con su movimiento y su fecha.

**No confunda `costo` con `precio`.** El precio es a cuánto se vende; el costo es cuánto vale lo que entra.

Las dos filas de ejemplo se borran y se escribe encima. **Los títulos de las columnas se pueden escribir como se quiera**: «Stock mínimo», «stock_minimo» y «STOCK MINIMO» valen lo mismo. Y las columnas de más que traiga la planilla se ignoran.

#### 2 · Súbala llena

**Antes de cargar se muestra qué pasará con cada fila.**

Pulse **Elegir archivo**. Acepta **CSV** y **Excel (.xlsx)**. **No hay botón de revisar**: en cuanto se elige el archivo la revisión arranca sola y aparece el paso 3.

Si el archivo no se puede leer, el aviso sale en rojo debajo del botón. Los más frecuentes:

| Lo que ve | Qué hacer |
| --- | --- |
| «La planilla trae la fila de columnas pero ninguna fila con datos debajo.» | Llénela antes de subirla |
| «A la planilla le faltan columnas que hacen falta: nombre.» | Está subiendo otro archivo. Baje la plantilla y trabaje sobre ella |
| «El formato .xls (Excel 97) no se puede leer. Ábralo y guárdelo como .xlsx.» | Guárdelo otra vez con **Guardar como** |
| «Este navegador no abre archivos .xlsx. Guarde la planilla como CSV y vuelva a subirla.» | Guárdela como CSV |
| «No se pudo leer el archivo. Compruebe que sea la plantilla en CSV o en Excel.» | Cualquier otro problema del archivo |

#### 3 · Esto es lo que va a pasar

Aquí está lo importante de la pantalla. **Nada se ha escrito todavía.**

Arriba, las etiquetas de resumen: **12 se crean**, **3 se actualizan**, **2 con problemas** —solo si las hay—, **17 filas en total** y, si la planilla trae existencias, cuántas filas las traen.

Debajo, la lista fila por fila. **Las filas con problema se ponen arriba del todo.** Cada renglón lleva **Fila 7**, una etiqueta de estado, el código —o **(se le pondrá uno)** si es nuevo—, el nombre y, si algo va mal, el motivo en rojo.

| Etiqueta | Qué significa |
| --- | --- |
| **Nuevo** | Ese artículo no existe todavía en el catálogo |
| **Actualización** | Ese código ya está, y la fila lo corrige |
| **Error** | Esa fila tiene un problema |

**Una fila con error se puede arreglar aquí mismo** con su botón **Corregir**: **Vale solo para esta carga y se vuelve a revisar al instante. No se guarda nada hasta que pulse «Cargar».** Y una fila nueva que se parece a un artículo que ya está lleva **Es el mismo (REP-BOMBA)**, para cargarla sobre ese en vez de crear otro.

Los motivos de rechazo se leen tal cual. Los más frecuentes:

- **Falta el nombre.** · **Falta la categoría.** · **Falta la unidad.**
- **No hay ningún artículo con el código «REP-BOMBA». Si es un artículo nuevo, deja el código vacío: el sistema le pone uno con las letras de su categoría.**
- **«BOMBA DE AGUA» ya viene en la fila 4 de esta planilla. Si es el mismo artículo, deja una sola fila; si es otro, cámbiale el nombre para que se distinga.**
- **«REPUEST» no es una categoría del sistema.**, seguido de las que hay.
- **La unidad «UNI» no existe.**, seguido de las que hay.
- **«X» no dice qué pasa al entregarlo: NO, RETORNABLE o CONSUMIBLE.**
- **Hay un número que no se entiende. Se escriben sin separador de miles y con punto decimal.**
- **Hay cantidad pero falta el costo. Si llegó donado o sin factura y nadie sabe cuánto costó, escribe SI en «sin_valorar» y deja el costo vacío.**
- **Trae precio pero no dice en qué moneda. Elige la moneda: el sistema ya no supone dólares.**
- **La moneda «GBP» no está activa en el sistema.**

Antes del botón pueden aparecer casillas que hay que marcar, según el caso: que se revisaron los costos marcados, que se revisaron los artículos nuevos que se parecen a uno del catálogo, o que se entiende que la planilla solo carga el catálogo, sin existencia.

Al pie, el botón. Si todo está bien dice **Cargar 15 artículos** y escribe. **Si hay una sola fila mal, el botón se apaga y dice No se puede cargar todavía**, y el subtítulo lo explica: **Con una sola fila mal no entra ninguna. Corríjala aquí con «Corregir», o en el archivo y súbalo otra vez.**

Cuando la carga entra, aparece **Cargado.** con el detalle —**12 nuevos y 3 actualizados.**—.

#### Cuatro cosas que conviene saber de antemano

- **Lo que ve en la revisión es exactamente lo que va a pasar.** No lo calcula el navegador por su cuenta: es la misma comprobación que hará el sistema al guardar, hecha sin escribir. Si dice que se actualiza, se actualiza.
- **El código manda, y subir dos veces no duplica.** Si el código ya existe, la fila lo corrige; si viene vacío, crea uno nuevo. La misma planilla sirve para dar de alta y para corregir.
- **Lo que se deja en blanco sobre un artículo que ya existe se respeta.** Una descripción vacía no borra la que tenía. No hace falta volver a escribirlo todo para cambiar un mínimo.
- **Si alguna fila trae precio, hace falta además permiso de escritura sobre Ventas.** Cargar el catálogo es cosa de inventario; ponerle precio a lo que se vende, no. Sin ese permiso la respuesta es «Su usuario no tiene permiso para esta acción.»

### 7.11 Almacenes y patios

**Operación › Inventario › Almacenes y talleres**

En el menú se llama **Almacenes y talleres**; dentro, las pestañas son **Almacenes y patios**, **Talleres** (7.5) y **Dueños del material**.

**Almacenes, patios y talleres. Las existencias se controlan por almacén.** Por eso hace falta al menos uno para poder recibir material.

La lista lleva **Código**, **Nombre** —con la etiqueta **Recibe compras** en el propuesto y el dueño si es ajeno—, **Tipo**, **Ubicación**, **Responsable** y **Estado**. Para **editar** un almacén se pulsa **en cualquier parte de su fila**. **Nuevo almacén** abre la misma ficha vacía.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Código** | Al editar | **Vacío, se asigna solo: tres letras del tipo y el siguiente número.** |
| **Nombre** | Sí | |
| **Tipo** | Sí | Almacén, Patio de material, Taller, Combustible o Patio de máquinas y vehículos |
| **Dueño** | Sí | **Lo que entre aquí será de este dueño.** Solo se cambia con el almacén vacío |
| **Responsable** | No | **Una misma persona puede llevar varios almacenes: se la elige en cada uno.** Es quien aprueba las salidas y los traslados de ese almacén |
| **Ubicación** | No | |
| **Capacidad del tanque** | Según el tipo | Solo si el tipo es **Combustible**. En litros. Con ella el saldo se lee **720 de 5.000** |
| **Trabajos simultáneos** | Según el tipo | Solo si el tipo es **Taller**. **Sin este dato no se indica si el taller tiene sitio.** |
| **Es el almacén propuesto al recibir una compra** | — | |
| **Activo** | — | Viene marcada |

Un almacén **no se borra**: se desmarca **Activo** y deja de aparecer en las listas.

Sobre la casilla del almacén propuesto: el sistema **no impide marcarla en varios almacenes a la vez**, y si eso pasa, cuál se propone al recibir una compra deja de ser previsible. Márquela en uno solo.

#### Dueños del material

**Registro de dueños del material, propio y de terceros. Cada almacén y cada máquina se asocia a uno.** La cantera puede tener a mano material que no es suyo —cosas de la gobernación guardadas en un almacén propio—, y **el dueño vive en el almacén**: lo que entra a un almacén es de su dueño, y viaja con cada movimiento.

Cada tarjeta lleva el código, el nombre, si es **Propio** o **De terceros**, y cuántos almacenes y máquinas tiene. **Nuevo dueño** lo ve quien tiene escritura sobre Inventario, y pide un **Código** —**Sin espacios ni tildes. Es lo que queda escrito en cada almacén y no se puede cambiar después.**— y un **Nombre**. Un dueño se apaga con **Activo**, pero **no se puede apagar si todavía le cuelga algún almacén o alguna máquina**; la propia empresa no se apaga nunca.

Pasar material de un dueño a otro sin moverlo es **Cambiar de dueño**, en Existencias (7.4).

### 7.12 Lo que conviene entender

#### Por qué nada se borra

Un movimiento registrado no se modifica y no se elimina. Nunca, para nadie.

La razón es la que hace útil al inventario: una existencia que no cuadra se corrige con un movimiento nuevo que la explica, no borrando el que estaba mal. Es la única forma de que dentro de seis meses alguien pueda responder por qué el 14 de marzo había cuarenta toneladas menos.

Corregir tiene dos caminos, en este orden:

1. **Deshacer** el movimiento equivocado y registrar el correcto. Sirve mientras el material siga estando.
2. **Contar** y explicar la diferencia, cuando el material ya se consumió y deshacerlo ya no es posible.

#### De dónde entra y por dónde sale el material

| Entra por | Sale por |
| --- | --- |
| Recepción de una compra *(desde Compras)* | Salida a consumo *(la entrega de una salida, 26.2)* |
| Parte de turno *(desde Explotación)* | Despacho de una venta *(con su nota de entrega)* |
| Entrada de un traslado | Salida de un traslado |
| Ajuste por conteo, cuando sobra | Ajuste por conteo, cuando falta |
| Reverso de una salida | Reverso de una entrada, incluida la anulación de un parte de turno |

Lo que nunca ocurre es que una cantidad cambie sin que quede una línea en el libro con su número, su fecha, su hora, su responsable y su motivo.

#### Nunca se queda en negativo

El sistema no deja que una existencia baje de cero: la operación que la dejaría en negativo se frena, y el mensaje dice cuánto queda y cuánto se intentaba mover.

Una existencia negativa no es un dato, es un error que alguien va a tener que deshacer más adelante, cuando ya nadie recuerde de dónde salió.

**Qué hacer cuando salta.** Si en el patio sí está el material pero el sistema dice que no, lo que falta es una entrada. Regístrela, o haga el conteo físico, y después repita la operación.

#### Existir no es estar disponible

Diez cascos en el libro pueden ser diez cascos en diez cabezas.

**Lo que está en manos de una persona sigue contando como existencia** —es de la empresa y vale— **pero no se puede volver a entregar.** Por eso el sistema lleva dos números y los distingue: la **existencia**, que es lo que hay, y lo **disponible**, que es lo que queda sin entregar.

Se ve en tres sitios: en **Existencias**, en la **ficha del artículo** y en la pantalla de Asignaciones. Y **solo cuando difieren**: si nadie tiene nada prestado, la línea no se dibuja.

**El sistema no deja entregar más de lo disponible**, y lo dice con nombre y cantidad: «Solo quedan 2 de "LLAVE STILSON" sin asignar.» Con lo que se gasta —guantes, mascarillas— el aviso es el de la existencia: «De "GUANTES DE CUERO" solo hay 4 en existencia y se intentan entregar 6.»

**Entregar no descuenta del almacén** cuando el artículo es retornable: el bien sigue siendo de la empresa y sigue valorado en el inventario. Lo que baja es cuántos quedan por entregar. Cuando la persona lo devuelve, o se da por perdido, el disponible vuelve a subir solo.

Cuál de los dos comportamientos tiene cada artículo lo dice su **Modo de entrega**, en el catálogo (7.8).

#### Los caminos que el libro conoce

Además de los que van en la tabla de arriba, el libro registra otros movimientos que conviene reconocer al leerlo:

| Camino | Cuándo |
| --- | --- |
| **Entrada sin compra** | El botón **Registrar entrada** de 7.4: el saldo inicial, algo comprado por fuera |
| **Devolución** | Material que vuelve al almacén |
| **Merma** | Se perdió en el manejo, o no volvió del taller |
| **Salida como pago de una compra** | Material que se dio para pagar una orden de compra |
| **Salida ·** y su causa | Una baja. No se registran nuevas; las que hay siguen en el libro |
| **Corrección de costo** | Un **Corregir el costo**: sale todo al costo malo y entra al bueno |
| **Dejó de ser suyo** / **Pasó a ser suyo** | Un cambio de dueño: el material no se mueve, pasa de un dueño a otro |

A eso se suma la salida que escribe **Asignaciones** cuando se reporta perdido o dañado un bien que estaba en manos de alguien (18.5).

#### Toneladas y metros cúbicos

Cada artículo tiene **una sola unidad**, la que se le puso al crearlo. La tonelada es lo único que mide un instrumento auditable, la romana, y el volumen de una pila siempre es una estimación.

**Pero el sistema sí sabe convertir, si se le dice cómo.** Cada artículo tiene un campo de **densidad** —cuántas toneladas pesa un metro cúbico de ese material—, obligatorio en lo que se mide en metros cúbicos o en toneladas. Con ella, Existencias y la ficha del artículo enseñan la misma cantidad en la otra medida, en gris y precedida de **≈**, para que se lea como lo que es: una equivalencia, no una medición. Cambiar una densidad que ya estaba pide un motivo, porque cambia la conversión de todo lo que se imprima desde entonces.

**Y ojo con lo que se decide al crear el artículo**, porque la unidad no conviene cambiarla después. Si se cambia en un artículo con movimientos, la ficha avisa: **Atención: ya tiene movimientos anotados en …**, y lo anotado sigue diciendo el número que se escribió.

### 7.13 Los papeles del inventario

Del módulo salen estos documentos, y **todos llevan la misma cabecera que el resto de los papeles del sistema** (13.2):

| Papel | De dónde sale |
| --- | --- |
| **Acta de existencias** | Desde la cabecera de **Existencias**, con el botón **Acta de conteo físico**, para el rol Almacén. Sale con lo que se está viendo —los filtros puestos— y una columna **Contado** vacía para escribir a mano |
| **Nota de salida** | Desde **Movimientos**, con el botón **Nota** de una salida. La de una salida pedida sale sola al entregarla (26.5) |
| **Nota de traslado** | Desde **Movimientos**, con el botón **Nota** de la salida de un traslado (26.5) |
| **Libro de movimientos** | Desde la cabecera de **Movimientos**, con el botón **Imprimir el libro**: saca en PDF lo que se está viendo, con los filtros puestos |
| **Constancia de entrega** | Desde **Asignaciones**. Es el papel que firma quien recibe (18.2) |

**El acta se imprime antes de contar, no después.** Es su razón de ser: se sale al patio con lo que el sistema cree que hay y se anota al lado lo que se cuenta. El acta no registra nada: el ajuste se hace después con **Contar**.

### 7.14 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| **Atención: ya tiene movimientos anotados en …**, al cambiar la unidad de un artículo | Lo anotado sigue diciendo el número que se escribió, y la existencia sumará las dos unidades | Si la unidad de verdad cambió, cuente el almacén después para dejar el saldo bueno |
| **Es el mismo costo que ya tiene**, al corregir un costo | La cifra nueva es igual a la que ya tenía | Si lo que estaba mal era la moneda, elija la de la factura |
| «Esta acción la realiza: Almacén. Su usuario no tiene ese rol, ni escritura en Inventario.» | Su usuario consulta pero no registra | Pida el rol a la administración, o que lo registre quien lo tenga |
| «Su usuario no tiene permiso para esta acción.» | Falta el permiso sobre el módulo | Pida el permiso a la administración |
| «Un conteo sin explicación no se puede leer después. Escriba qué se contó y por qué.» | El motivo quedó vacío o muy corto | Escriba qué explica la diferencia |
| «Un reverso no se reversa. Registre el movimiento que corresponda.» | Intenta deshacer una corrección | Registre el movimiento que falta |
| «El movimiento MOV-2026-0007 ya fue reversado.» | Ese movimiento ya se corrigió | Revise el libro: la corrección ya está |
| «El movimiento MOV-2026-0012 es de un traslado con número propio: no se reversa suelto.» | Es una de las dos mitades de un traslado | Si no se recibió, cancele el traslado; si ya se recibió, pida un traslado de vuelta (26.3) |
| «No se puede reversar MOV-2026-0007: habría que sacar 40 de "GASOIL" en TANQUE PRINCIPAL y solo quedan 12,5. Ese material ya se usó.» | El material que habría que devolver ya no está | Corrija con un conteo físico |
| «El origen y el destino son el mismo almacén.» | Eligió dos veces el mismo sitio | Cambie el destino |
| «Ya existe un artículo con el código REP-BOMBA.» | El código está ocupado | Busque el artículo. Si existe, úselo; si está desactivado, actívelo. O deje el código vacío y se pone solo |
| «No hay conexión con el servidor. Revise la red e inténtelo otra vez. Lo que no se guardó, no quedó.» | Se cayó el internet | Reintente cuando vuelva la señal |

---

## 8. Despachos

Despachos guarda los dos papeles que acompañan al camión en el portón: el pesaje de la romana y la guía de movilización. Los dos existen aunque no haya venta. Aquí se producen; la nota de entrega, en Facturación, los gasta.

Hay una idea que conviene entender antes de tocar nada:

**La báscula pesa todo lo que cruza el portón, no solo lo que se vende.** Una gandola de gasoil que llega también se pesa, y ese pesaje no termina nunca en una nota de entrega. Por eso el ticket tiene tipo —**Salida** o **Entrada**— y por eso vive en su propio módulo.

De ahí se desprende lo demás: un ticket es la prueba de un viaje, la guía es el permiso de ese viaje, y la nota de entrega es la que los gasta.

### 8.1 Quién entra y quién puede hacer qué

Para ver el módulo hace falta permiso de lectura sobre Despachos. Sin él, quien escribe la dirección a mano ve una tarjeta con un candado: **Despachos no está a su alcance**.

Dentro hay dos alcances:

| Qué se hace | Qué hace falta |
| --- | --- |
| Pesar un camión y cargar una guía | Escritura sobre Despachos |
| Anular un pesaje o una guía | Control total sobre Despachos |

Si ve las pantallas pero no ve los botones **Pesar** ni **Cargar guía**, su usuario consulta y no registra.

**Las placas, los nombres de chofer, el transportista, el destino y las notas se guardan en mayúsculas y sin tildes.** Así, una placa buscada como «a12bc34» encuentra la que se tecleó como «A12BC34».

### 8.2 El tablero

**Operación › Despachos › Tablero**

Es por donde se entra al módulo, y no se registra nada aquí. Su descripción lo resume: **Control de romana: pesaje del camión y emisión de la guía de salida.** Arriba a la derecha, **Pesar en romana**.

Dos tarjetas dan las cifras del día: **Tickets sin usar** —**Pesajes que no están en ninguna nota de entrega**— y **Guías vigentes** —**Emitidas y todavía sin usar**—.

Debajo, **El trámite**, con los dos pasos numerados:

| Paso | Qué es |
| --- | --- |
| **I · Se pesa en la romana** | **El ticket con el peso del camión, lleno y vacío. Es el soporte de lo que salió.** |
| **II · Se emite la guía** | **La guía de movilización, que es con lo que el camión puede circular.** |

Y una advertencia que ahorra viajes: **Aquí no se registra la venta: se registra el peso y el permiso.** Quien busca despachar material a un cliente y dejarlo listo para facturar busca la nota de entrega, que está en Facturación; el botón **Ir a las notas de entrega** lleva allí.

### 8.3 Del pesaje a la salida del camión

Esta es la sección que hay que leer aunque no se lea ninguna otra. El circuito va siempre en el mismo orden.

1. **Se pesa el camión.** **Operación › Despachos › Tickets de romana › Pesar**. Se guarda el bruto, la tara y la placa. El ticket recibe su número —**TCK-2026-0001**— y nace **Sin usar**.
2. **Se carga la guía de movilización, si la hay.** **Operación › Despachos › Guías de movilización › Cargar guía**. El sistema no emite la guía: la emite el ministerio y aquí se copia el papel, con su número, su vigencia, su destino, el material y la cantidad que ampara. Nace **Vigente**.
3. **Sale el camión con su nota de entrega.** En **Administración › Facturación › Notas de entrega** (10.6) se eligen los dos papeles: el **Ticket de romana** y la **Guía de movilización**. La ayuda del ticket lo dice: **Al elegirlo, los pesos y la placa se traen de la báscula.** **La guía es opcional**: si la hay, se engancha a la nota; si no, la nota sale igual.
4. **Los dos papeles quedan gastados.** En cuanto la nota se guarda, el ticket pasa a **Usado** y la guía a **Usada**, con el número de la nota a la vista. Ninguno de los dos vuelve a aparecer para elegir.
5. **Si la nota se anula, los dos vuelven a quedar libres.** El ticket regresa a **Sin usar** y la guía a **Vigente**, listos para la nota que corrige a la anterior.

Dos avisos sobre este circuito, para que nadie los descubra a mitad de camino.

**Un ticket de entrada nunca llega a una nota de entrega.** El pesaje de una gandola que llega se queda aquí, como registro del portón. Al despachar solo se ofrecen los tickets de salida.

**Los dos papeles son opcionales para la nota de entrega.** Se puede despachar sin haber pesado el camión y sin guía.

### 8.4 Tickets de romana

**Operación › Despachos › Tickets de romana**

**Tickets de romana de cada pesaje, de entrada o de salida.**

#### Qué se ve

Arriba, si hay pesajes disponibles, una etiqueta verde: **3 sin usar**. Al lado, el botón **Pesar**.

Debajo, el filtro **Ver**, que empieza en **Todos** y admite **Sin usar**, **Usados** y **Anulados**. No hay buscador: el filtro por estado es lo único que hay para acotar la lista.

Si no hay ninguna pesada, aparece **Sin pesajes registrados**, con el texto **Cada ticket registra el peso bruto y la tara; el neto se calcula automáticamente. La nota de entrega toma los pesos del ticket.**

La lista tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Ticket** | **TCK-2026-0001** y, debajo, la fecha y la hora |
| **Vehículo** | La placa y, debajo, el chofer |
| **Material** | Lo que se pesó, o **—** si no se especificó |
| **Para** | El cliente o el proveedor y, cuando ya se usó, el número de la nota de entrega |
| **Bruto** | El peso del camión cargado, en kilos |
| **Tara** | El peso del camión vacío, en kilos |
| **Neto** | La resta de los dos |
| **Estado** | **Sin usar**, **Usado** o **Anulado** |

Los tickets anulados se ven más pálidos, pero siguen en la lista.

#### Pesar un vehículo

1. Pulse **Pesar**. Se abre **Pesar un vehículo**: **El neto se calcula solo. El bruto tiene que superar a la tara.**
2. Elija el **Tipo**: salida o entrada. Empieza en salida.
3. Elija el **Vehículo**. Sale del catálogo de **Maquinaria › Equipos** y trae la placa y lo que carga; al elegirlo, el transportista se rellena solo. Si el camión no está en el catálogo —el que viene una vez y no vuelve— se elige **Otro — escribo la placa** y aparece el campo **Placa**.
4. Escriba el **Peso bruto (kg)** y la **Tara (kg)**. Debajo, el recuadro **Neto** hace la resta mientras se teclea.
5. Complete lo que sepa: **Transportista**, **Chofer**, **Cédula del chofer**, **Material**, y el **Cliente** si es una salida o el **Proveedor** si es una entrada.
6. Revise la **Fecha**, que viene puesta en hoy, y escriba la **Hora** si la lleva.
7. Pulse **Guardar el pesaje**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Tipo** | Sí | Empieza en salida |
| **Placa** | Sí | El botón queda apagado mientras esté vacía |
| **Transportista** | No | |
| **Chofer** | No | |
| **Cédula del chofer** | No | |
| **Material** | No | Empieza en **Sin especificar** |
| **Cliente** | No | Solo en las salidas. Empieza en **Sin cliente todavía** |
| **Proveedor** | No | Solo en las entradas. Empieza en **Sin proveedor** |
| **Peso bruto (kg)** | Sí | Tiene que ser mayor que la tara |
| **Tara (kg)** | Sí | Si iguala o supera al bruto, aparece en rojo **La tara no puede igualar al bruto** |
| **Fecha** | Sí | Viene puesta en hoy. No admite una fecha futura |
| **Hora** | No | |
| **Romana** | No | Cuál báscula pesó, si hay más de una |
| **Operador** | No | **Quién pesó** |
| **Nota** | No | |

**El cliente se puede dejar en blanco.** Se pesa cuando el camión llega al portón, y a esa hora a veces todavía no se sabe a nombre de quién sale la nota. Un ticket sin cliente se puede usar en el despacho de cualquiera; uno con cliente, solo en el de ese cliente.

**Un pesaje no se puede modificar.** Ni los pesos, ni la placa, ni la fecha. Si está mal, se anula y se registra otro: un peso que se puede retocar después deja de ser una prueba el día que alguien discuta la cantidad.

#### Anular un pesaje

El botón **Anular** aparece en la fila **solo mientras el ticket está Sin usar**, y solo para quien tenga el control total sobre Despachos.

1. Pulse **Anular**. Se abre **Anular el ticket TCK-2026-0004**: **Se queda con su número, marcado como anulado.**
2. Escriba el **Motivo**, de al menos cuatro letras.
3. Pulse **Anular**, o **No anular** para dejarlo como estaba.

**Un ticket que ya está en una nota de entrega no se anula desde aquí.** El sistema lo rechaza con «El ticket TCK-2026-0004 está en la nota de entrega. Anule primero la nota.» El ticket es lo que justifica el peso de esa nota: anularlo por debajo dejaría una nota con un peso que ningún pesaje respalda.

### 8.5 Guías de movilización

**Operación › Despachos › Guías de movilización**

**Guías de movilización: el permiso con el que circula el mineral.**

**El sistema no emite la guía.** La emite el ministerio, y lo que se hace aquí es copiar el papel para saber cuáles hay, cuáles siguen vigentes y cuál amparó cada despacho. La ventana lo advierte: **Se copia del papel que emitió el ministerio, con su número.**

#### Qué se ve

Arriba, dos etiquetas cuando corresponde: **2 por vencer**, en ámbar, para las que vencen dentro de tres días o menos, y **5 vigentes**, en verde. Al lado, el botón **Cargar guía**.

Debajo, el filtro **Ver**, que empieza en **Todas** y admite **Vigentes**, **Usadas** y **Anuladas**.

Si no hay ninguna, aparece **Sin guías registradas**.

| Columna | Qué muestra |
| --- | --- |
| **Guía** | El número del ministerio y, debajo, el número interno —**GMV-2026-0001**— y la fecha de emisión |
| **Destino** | A dónde va el viaje y, debajo, el cliente si se le puso uno |
| **Material** | El producto amparado y, debajo, el frente del que sale |
| **Ampara** | La cantidad que cubre el papel, con su medida: **m³** o **TON** |
| **Vigencia** | Hasta cuándo vale y, cuando ya se usó, el número de la nota de entrega |
| **Estado** | **Vigente**, **Vence en 2 d**, **Vencida**, **Usada** o **Anulada** |

**Vencida no es un estado que alguien marque: se calcula cada vez que se abre la pantalla**, comparando la vigencia con el día de hoy.

#### Cargar una guía

1. Pulse **Cargar guía**. Se abre **Cargar guía de movilización**.
2. Escriba el **Número de guía**, que es el del papel del ministerio.
3. Revise **Emitida el**, que viene en hoy, y escriba **Vence el**.
4. Escriba el **Destino**.
5. Elija el **Material**, escriba la **Cantidad amparada** y elija la **Medida**: **Metros cúbicos** o **Toneladas**. La ayuda dice el criterio: **La que diga el papel.**
6. Complete lo que traiga el papel: **Cliente**, **Frente de origen** u **Origen**, **Transportista**, **Vehículo** —o **Placa** si es otro—, **Chofer**, **Cédula del chofer** y la **Observación**.
7. Pulse **Guardar la guía**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Número de guía** | Sí | El del ministerio. No se puede repetir |
| **Emitida el** | Sí | Viene puesta en hoy |
| **Vence el** | Sí | No puede ser anterior a la emisión |
| **Destino** | Sí | La ciudad o el sitio al que va el viaje |
| **Cliente** | No | Empieza en **Sin cliente concreto** |
| **Material** | Sí | Empieza en **Seleccione el material**. Solo trae productos de cantera |
| **Cantidad amparada** | Sí | Mayor que cero |
| **Medida** | Sí | **Metros cúbicos** o **Toneladas**. Empieza en metros cúbicos |
| **Frente de origen** | No | Empieza en **Sin frente concreto** |
| **Origen** | No | **La mina, si no sale de un frente** |
| **Transportista** | No | |
| **Vehículo** y **Placa** | No | Del catálogo de Maquinaria, o **Otro — escribo la placa** |
| **Chofer** | No | |
| **Cédula del chofer** | No | |
| **Observación** | No | |

**El cliente se puede dejar en blanco**, igual que en el ticket. Una guía sin cliente ampara el despacho de cualquiera; una guía con cliente, solo el de ese cliente.

**Una guía cargada no se puede editar.** Si el número o la vigencia quedaron mal, se anula y se carga otra vez: lo que está guardado tiene que decir lo mismo que el papel que lleva el chofer.

#### Anular una guía

El botón **Anular** aparece en la fila **solo mientras la guía está Vigente**, y solo para quien tenga el control total sobre Despachos. Se abre **Anular la guía GM-2026-0099**: **Deja de estar disponible para amparar despachos.** Escriba el **Motivo** —mínimo cuatro letras— y pulse **Anular**.

Una guía que ya amparó un despacho no se anula desde aquí: el sistema responde «La guía GM-2026-0099 amparó un despacho. Anule primero la nota de entrega.» La nota quedaría diciendo que viajó amparada por un papel que el sistema da por anulado.

### 8.6 Vehículos

Los camiones viven en **Operación › Maquinaria › Equipos**, en el mismo catálogo que las máquinas (capítulo 19). Es de ahí de donde salen los desplegables **Vehículo** del ticket y de la guía: al elegir uno se traen su placa, lo que carga y su transportista.

Si el catálogo está vacío, el desplegable lo dice: **Sin vehículos registrados. Se registran en Maquinaria › Equipos.** El camión que no está en el catálogo se pesa igual con **Otro — escribo la placa**.

### 8.7 Lo que conviene entender

#### La romana pesa todo, no solo lo que se vende

Un ticket puede ser de salida o de entrada. La de salida es el material que se va; la de entrada, la gandola de gasoil que llega o la recepción de una compra.

Solo los tickets de salida llegan a la nota de entrega. Los de entrada se quedan aquí como registro del portón, y si se intenta usar uno en un despacho el sistema lo rechaza con «El ticket TCK-2026-0004 es de una entrada a la cantera, no de una salida.»

Esto tiene una consecuencia práctica: **un ticket de entrada no mete material en el inventario.** Pesar la gandola no es recibirla. La entrada al inventario se registra en Compras o en Inventario. La romana deja constancia de lo que cruzó el portón; el inventario, de lo que se guardó.

#### Un ticket se usa una sola vez

Un pesaje pertenece a un viaje. En cuanto una nota de entrega lo toma, el ticket pasa a **Usado** y desaparece de la lista de los que se pueden elegir. Si se intenta usarlo otra vez, el sistema responde «El ticket TCK-2026-0004 está usado.»

**Si el mismo ticket pudiera colgarse de dos notas de entrega, el mismo camión estaría justificando dos despachos.** Las dos notas dirían que salieron veintiocho toneladas y habría una sola pesada para respaldarlas.

**Al anular la nota, el ticket vuelve a quedar Sin usar.** No es una excepción a la regla anterior, es la misma regla: el camión se pesó igual. Ese pesaje ocurrió, es válido, y lo que se cayó fue la nota. Lo mismo pasa con la guía, que vuelve a **Vigente**.

#### La guía, cuando la hay, ampara un viaje

**La nota de entrega no exige guía**: si se elige una, queda enganchada a ese despacho y deja de estar disponible; si no, el despacho sale igual. Una guía ampara un solo viaje, igual que un ticket es un solo pesaje.

#### Lo que el sistema no comprueba

Conviene decirlo con claridad, porque es fácil suponer lo contrario:

- **No compara el peso neto del ticket con las cantidades de la nota.** Se pueden despachar cien toneladas con un ticket de veintiocho. El peso queda como prueba, no como control.
- **No compara la cantidad de la guía con lo que se despacha**, ni el material de la guía con el de los renglones. Una guía que ampara treinta toneladas de granzón no impide despachar cincuenta.
- **No comprueba que el material del ticket sea el de la nota.**

Lo que sí comprueba es el cliente: **si el ticket o la guía se emitieron a nombre de un cliente, solo sirven para el despacho de ese cliente.** Si no coinciden, sale «El ticket TCK-2026-0004 se pesó para otro cliente.» o «La guía GM-2026-0099 se emitió para otro cliente.»

Y comprueba la vigencia: una guía cuya vigencia terminó antes de la fecha del despacho se rechaza con «La guía GM-2026-0099 venció el 02/08/2026.»

#### Los números de los documentos

Cada pesaje lleva su correlativo, **TCK-2026-0001**, y cada guía lleva dos números: el del ministerio, que es el que se busca y el que va en el papel, y el interno, **GMV-2026-0001**, que sirve para nombrarla dentro del sistema. **Los dos correlativos se reinician cada enero.**

**Nada se borra.** Un pesaje equivocado se anula y se queda con su número, y una guía anulada sigue en la lista. Un correlativo con huecos es lo primero que se pregunta en una revisión, y en la garita un número que falta es un camión del que nadie sabe dar cuenta.

### 8.8 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Su usuario no tiene permiso para esta acción.» | Falta el permiso, y el mensaje no dice cuál | Si fue al anular un pesaje o una guía, hace falta el control total sobre Despachos. Pídalo a la administración, o que lo haga quien lo tenga |
| «Un pesaje sin placa no se puede atribuir a nadie.» | La placa quedó vacía | Escriba la placa del camión |
| «El peso bruto (12.000) tiene que ser mayor que la tara (12.000).» | El bruto no supera a la tara | Revise los dos números: el bruto es el camión cargado |
| «No se registra un pesaje con fecha futura.» | La fecha es de mañana o después | Corrija la fecha |
| «Escriba por qué se anula el pesaje.» | El motivo quedó vacío o con menos de cuatro letras | Escriba qué pasó con ese pesaje |
| «El ticket TCK-2026-0004 ya estaba anulado.» | Alguien se adelantó | Recargue la lista: la anulación ya está hecha |
| «El ticket TCK-2026-0004 está en la nota de entrega. Anule primero la nota.» | Ese pesaje ya se usó en un despacho | Anule la nota desde **Facturación › Notas de entrega**. El ticket vuelve solo a **Sin usar** |
| «La guía necesita su número, que es el que lleva el papel del ministerio.» | El número quedó vacío | Cópielo del papel |
| «La guía necesita el destino: una guía ampara un viaje a un sitio.» | El destino quedó vacío | Escriba a dónde va el camión |
| «La guía no puede vencer antes de emitirse.» | **Vence el** quedó antes de **Emitida el** | Revise las dos fechas del papel |
| «La guía tiene que amparar una cantidad mayor que cero.» | La cantidad quedó vacía o en cero | Escriba la cantidad que dice el papel |
| «Ya existe un registro con ese dato, y no puede haber dos.», al guardar la guía | Ese número de guía ya está cargado | Búsquela en la lista con el filtro **Ver** en **Todas**. Si ya está, no hace falta cargarla otra vez |
| «Escriba por qué se anula la guía.» | El motivo quedó vacío o muy corto | Escriba al menos cuatro letras que expliquen qué pasó |
| «La guía GM-2026-0099 ya estaba anulada.» | Alguien se adelantó | Recargue la lista |
| «La guía GM-2026-0099 amparó un despacho. Anule primero la nota de entrega.» | Esa guía ya se usó | Anule la nota desde **Facturación › Notas de entrega**. La guía vuelve sola a **Vigente** |
| «El ticket TCK-2026-0004 es de una entrada a la cantera, no de una salida.» | Se eligió un pesaje de algo que llegó | Elija un ticket de salida, o registre el pesaje del camión que se va |
| «El ticket TCK-2026-0004 está usado.» | Otra nota lo tomó primero | Cierre, vuelva a abrir la nota y elija uno de los que sigan **Sin usar** |
| «El ticket TCK-2026-0004 se pesó para otro cliente.» | El pesaje se registró a nombre de otro | Elija el ticket correcto, o pese de nuevo el camión |
| «La guía GM-2026-0099 está usada.» | Otra nota la tomó primero | Elija otra guía vigente |
| «La guía GM-2026-0099 venció el 02/08/2026.» | La vigencia terminó antes de la fecha del despacho | Consiga una guía vigente. Una vencida no ampara el viaje |
| «La guía GM-2026-0099 se emitió para otro cliente.» | La guía tiene otro cliente puesto | Elija la guía de ese cliente, o una que no tenga cliente |
| «No hay conexión con el servidor. Revise la red e inténtelo otra vez. Lo que no se guardó, no quedó.» | Se cayó el internet | Reintente cuando vuelva la señal |

---

## 9. Compras

Compras es el camino por el que la empresa consigue lo que no produce: un repuesto, combustible, un flete, un servicio. Todo ese camino cabe en una sola pantalla, y cada compra es una tarjeta que avanza de un panel al siguiente, desde que alguien la pide hasta que el material entra al almacén.

Hay una idea que conviene entender antes de tocar nada:

**Una compra no avanza porque alguien la mueva. Avanza porque alguien hace la acción que toca.** Las tarjetas no se arrastran de un panel a otro. El panel en el que está una compra es la consecuencia de lo último que se hizo con ella. La propia pantalla lo dice en su descripción: **Cada tarjeta es una compra. Avanza de una etapa a la siguiente sin saltarse ninguna.**

La segunda idea es la que explica la mitad de las alarmas del módulo: **casi siempre se paga antes de recibir**. Entre el momento en que sale el dinero y el momento en que llega el camión hay dinero de la empresa en manos de un tercero. Por eso el tablero cuenta los días y avisa. La excepción es la compra **contra entrega**, que se recibe primero y se paga lo que llegó.

### 9.1 Quién entra y quién puede hacer qué

Hay dos puertas distintas, y conviene no confundirlas.

La primera es **entrar al módulo**. Depende del permiso sobre Compras que la administración le haya dado a su usuario. Sin ese permiso no se ve nada: ni el menú, ni las tarjetas, ni las fichas.

La segunda es **poder hacer cada paso**, y no la decide una sola cosa:

| Qué se hace | Qué hace falta |
| --- | --- |
| Crear un pedido | Entrar al módulo |
| Confirmar el pedido, cargar y proponer cotizaciones, indicar el método de pago, registrar el pago, devolver una instrucción de pago, registrar la factura de una orden | El rol **Compras**, o ser administración |
| Aprobar la compra | Una casilla propia de la matriz de permisos (13.1), que va con la gerencia general |
| Devolver la compra a cotización | Otra casilla propia, distinta de la de aprobar |
| Editar una orden aprobada, o corregir el precio de un renglón | Sendas casillas propias |
| Resolver el dinero de un proveedor que desistió | El rol **Gerencia general** o el rol **Compras** |
| Recibir el material | El rol **Almacén** |

**Quien paga las órdenes es el rol Compras**, y el sistema lo exige. Por eso **Pagos por hacer** cuelga del menú de Compras.

Si abre una compra y no ve ningún botón, el paso en el que está esa compra le toca a otro, y la pantalla dice a quién se está esperando.

**Que un botón no se dibuje es solo cortesía.** El permiso se comprueba de verdad en el momento de ejecutar la acción, no al pintar la pantalla. Quien llegue por otro camino recibe un mensaje que empieza por «Esta acción la realiza: Compras. Su usuario no tiene ese rol», y si lo que falta es una casilla, «Su usuario no tiene permiso para…» seguido de la acción.

### 9.2 El circuito de una compra

Esta es la sección que hay que leer si solo se va a leer una. Todo lo demás del capítulo son detalles de estas casillas.

| # | Cómo se llama | Quién lo mueve | Qué hace falta para pasar al siguiente |
| --- | --- | --- | --- |
| 0 | **Borrador** *(opcional)* | Quien lo cargó | Pulsar **Enviar el pedido** |
| 1 | **Pedido** | Compras | Pulsar **Confirmar el pedido** |
| 2 | **Confirmada** *(en la ficha: **Confirmada · indicar proveedores**)* | Compras | Cargar al menos una cotización y pulsar **Proponer al gerente** |
| 3 | **Confirmar por el gerente** *(en la ficha: **Por confirmar el gerente**)* | Gerencia general | Pulsar **Aprobar la compra**. Ahí nace la orden de compra |
| 4 | **Aprobada** *(en la ficha: **Aprobada · indicar método de pago**)* | Compras | Decir **con qué entrega el proveedor**, y después **Indicar método de pago** |
| 5 | **Por pagar** | Compras | **Registrar el pago** de cada instrucción, hasta cubrir el total |
| 6 | **Pagada** *(en la ficha: **Pagada · por recibir**)* | Almacén | **Recibir material** |
| 7 | **Recibida parcialmente** | Almacén | Volver a **Recibir material** hasta completar |
| 8 | **Recibida** | — | Cerrada |

Una compra recibida **se queda a la vista** en su panel. No desaparece: si desapareciera al recibirse, no habría dónde comprobar que llegó.

**Los nombres cambian ligeramente entre el tablero y la ficha.** En el tablero, el panel se llama **Confirmada** y debajo dice la acción que falta, **Indicar proveedores**. En la ficha de la compra, la etiqueta junta las dos cosas: **Confirmada · indicar proveedores**. Es el mismo paso.

**La compra contra entrega va en otro orden.** Si se pactó pagar al recibir, la orden aprobada queda en **Contra entrega · por recibir**: primero entra el material, y después se paga lo que llegó.

#### Las dos salidas que no son un fallo

Además de los pasos, una compra puede terminar de dos maneras que no son errores del sistema sino hechos del negocio:

- **Cancelada.** Solo antes de que salga el dinero.
- **El proveedor desistió.** Después de pagar. Existe porque el sistema tiene que poder decir cuánto dinero está fuera y desde hace cuántos días. Se cierra eligiendo qué pasó con ese dinero: **Reembolso**, **Saldo a favor** o **Pérdida**.

#### Los retrocesos

- **La gerencia devuelve a compras.** La compra vuelve del paso 3 al paso 2, y **la cotización elegida se borra**: si se devuelve, es porque esa opción no sirve.
- **Compras devuelve una instrucción de pago.** Si no queda ninguna instrucción viva, la orden vuelve del paso 5 al paso 4 para que se corrija el método de pago.
- **Una orden aprobada se puede editar.** Con su casilla, **Editar la orden** cambia los renglones, y **Corregir el precio** cambia el de uno solo. **Si la edición sube la orden más de 100 dólares, vuelve a la gerencia**: la orden se cancela y el pedido espera otra aprobación. La compra directa no pasa por ahí.

#### La factura del proveedor

Al circuito le falta un papel que no aparece en la tabla de arriba: **la factura que emite el proveedor**.

**Ninguna orden se paga sin decir con qué entrega el proveedor.** En el paso 4, antes de poder indicar el método de pago, hay que declarar si el proveedor entrega con **nota de entrega** o con **factura**. No es opcional: el botón **Indicar método de pago** está apagado hasta que se responda. Está en 9.10.

**Si entrega con factura, se registra desde la propia orden**, con el botón **Registrar factura** de su ficha, y queda atada a ella. Mientras falte, la ficha lo dice: **Sin registrarla, su IVA no se puede descontar.** Registrarla no mueve la tarjeta: una compra recibida se queda en **Recibida** con factura o sin ella. La pantalla **Facturas de proveedor** reúne las que ya se registraron (9.11).

**Una misma compra se puede pagar por dos caminos distintos, y el sistema no los cruza.** Uno es la instrucción de pago de la orden, en el paso 5. El otro es el pago que se registra sobre la factura, en su propia pantalla. Los dos sacan dinero de una cuenta y ninguno de los dos descuenta del otro. Las dos pantallas lo advierten, pero no lo impiden: la empresa tiene que decidir de antemano cuál de los dos caminos usa, y usar ese.

#### Lo que se corrige y lo que no

- **Un pedido se puede corregir** mientras esté en **Borrador**, **Pedido** o **Confirmada** y no tenga cotizaciones. En la ficha del pedido, el botón **Corregir** abre el mismo formulario del alta ya lleno, y queda anotado en el historial. Lo corrige quien lo creó.
- **Con cotizaciones cargadas, no.** Los renglones de una cotización cuelgan de los del pedido, y corregir el pedido los dejaría vacíos. El botón no aparece en ese caso.
- **Una compra cancelada no se reabre.** Si vuelve a hacer falta, se crea un pedido nuevo.
- **Una recepción no se corrige.** El libro de inventario no se modifica: una corrección se hace con un ajuste, y los dos apuntes quedan visibles.

### 9.3 El tablero

**Administración › Compras › Tablero**

Es la pantalla de cabecera del módulo: una tarjeta por compra, repartidas en paneles según el paso en el que están. No hay una lista de pedidos por un lado y otra de órdenes por otro; es todo lo mismo visto de una vez.

#### Qué se ve

Arriba, el título **Compras** y el botón **Nuevo pedido**.

Si hay compras que figuran como pagadas y llevan más de una semana sin recibirse del todo, aparece un aviso con cuántas son y cuánto suman sus órdenes: **3 compras figuran como pagadas y no constan recibidas del todo desde hace más de una semana. Sus órdenes suman …** Es el aviso más importante de la pantalla.

Debajo, los paneles, en rejilla. Cada uno lleva su título, en letra pequeña la acción que hace falta, y a la derecha cuántas tarjetas tiene:

| Panel | Acción que falta |
| --- | --- |
| **Pedido** | **Confirmar** |
| **Confirmada** | **Indicar proveedores** |
| **Confirmar por el gerente** | **Aprobar** |
| **Aprobada** | **Indicar método de pago** |
| **Pagada** | **Falta que llegue el material** |
| **Recibida** | **Cerrada** |
| **Cancelada** | **No sigue** |
| **El proveedor desistió** | **Resolver el dinero** |

La franja de color de un panel solo se enciende si tiene tarjetas. Un panel vacío muestra **Sin órdenes**.

#### Qué lleva cada tarjeta

De arriba abajo: el número del documento —el de la orden si ya existe, y si no el del pedido—, el título de la compra, cuántos renglones tiene (**3 ítems**), y **· Urgente** o **· Prioridad alta** cuando la prioridad no es normal. Después, quién lo solicita, o **Sin solicitante**, con el destino al lado si lo hay. Luego la fecha de creación, el proveedor cuando ya se sabe, una etiqueta de señal, y al pie el monto en dólares o el texto **Sin cotizar** si todavía no hay precio, con el tiempo transcurrido a la derecha.

Las etiquetas de señal son estas:

| Etiqueta | Cuándo aparece |
| --- | --- |
| **Borrador** | El pedido todavía no se ha enviado |
| **Sin cotizaciones** | Está confirmada y nadie ha cargado precios |
| **3 cotizaciones** | Cuántos proveedores han cotizado |
| **Falta el método de pago** | Está aprobada y no se ha indicado cómo se paga |
| **Por pagar** | La instrucción de pago ya está cargada |
| **Pagada hoy** | Se pagó hoy y aún no llega el material |
| **12 días sin recibir** | Los días desde el pago. Cambia de verde a naranja a la semana, y a rojo pasados quince días |
| **Dinero sin resolver** | El proveedor desistió y nadie ha decidido qué pasó con el dinero |
| **Reembolsado** / **Queda a favor** / **Dado por perdido** | Ya se resolvió el dinero de un desistimiento |

Mientras carga se lee **Cargando el tablero…** Si no hay ninguna compra, aparece **Sin compras registradas** —**Las compras empiezan con un pedido: un repuesto, combustible o un servicio. Cree el primero.**— con el botón **Crear el primer pedido**.

#### Qué se puede hacer

1. Pulse en cualquier parte de una tarjeta para abrir la ficha de esa compra.
2. Pulse **Nuevo pedido** para crear uno.

Debajo de los paneles está el bloque **Acciones**, con tres grupos de atajos. Sale mientras la ayuda esté visible, y cada atajo solo a quien tiene permiso sobre la pantalla a la que lleva:

| Grupo | Atajos |
| --- | --- |
| **La cadena de una compra** | Numerados, en el orden en que ocurren: **Pedir algo**, **Cotizar y proponer**, **Pagar lo aprobado**, **Recibir el material** |
| **Compra directa** | **Registrar una compra directa** e **Historial de directas** |
| **Alrededor de la compra** | **Cargar proveedores por planilla**, **Proveedores**, **Facturas del proveedor** y **Gasto por unidad** |

Al pie, en **Primeros pasos**: *«Una compra pasa por cinco pasos: se pide, se cotiza, se aprueba, se paga y se recibe. La orden de compra se emite al aprobarla el gerente.»*, y *«La compra directa es para lo que se paga en el acto, y no pasa por esos pasos. Tiene su propio historial, donde se ve qué se pagó y qué falta por llegar.»*

**Ninguna acción cambia el estado de una compra desde el tablero**: todo ocurre dentro de la ficha, donde está el contexto completo de lo que se va a decidir.

El tablero se actualiza solo cuando otra persona mueve algo, y además se recarga cada cinco minutos.

**No hay buscador, ni filtros, ni forma de cambiar el orden.** Las tarjetas vienen siempre de la más reciente a la más antigua.

**El tablero no se imprime**: los papeles del módulo —la **orden de compra**, la **cotización** y el **comprobante de pago**— salen de la ficha de cada compra (9.6).

### 9.4 Nuevo pedido

Se llega desde el botón **Nuevo pedido** del tablero. **No está en el menú**, porque un pedido siempre nace mirando el tablero.

Es donde alguien pide lo que necesita: **El pedido entra al tablero en la columna Pedido.** Arriba a la derecha, **Volver al tablero**.

La pantalla es una sola columna: arriba **Datos del pedido** y debajo **Qué se necesita**, con **Un renglón por cosa distinta.**

#### Datos del pedido

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Título** | Sí | **Es lo que se lee en la tarjeta del tablero.** |
| **Justificación** | Sí | Para qué es. Quien aprueba no está en el frente y necesita el porqué |
| **Solicitante** | — | **Si a quien lo necesita le falta algo, se le pregunta a esta persona.** Empieza en su propio nombre, marcado «(yo)». La lista trae a cada persona activa con su cargo, y al final **Otra persona — no tiene usuario** |
| **Nombre del solicitante** | Sí, si eligió **Otra persona** | |
| **Cargo o frente** | No | Solo si eligió **Otra persona** |
| **Prioridad** | No | **Normal**, **Alta** o **Urgente — para la planta**. Empieza en **Normal** |
| **Fecha requerida** | No | |
| **Destino** | No | **A dónde va lo que se pide. Al recibirlo, entra aquí.** Es un almacén de los que reciben compras, u **Otro — no es un almacén**, que deja escribirlo |

**Otra persona** existe porque en la cantera la mayoría de quienes necesitan algo no tienen computadora ni cuenta: el mecánico pide por radio y alguien en la oficina carga el pedido. Sin esa opción el sistema anotaría a quien está en la oficina y no a quien hay que preguntarle si llega otra cosa.

Quien carga su propio pedido y tiene firma guardada puede marcar **Poner mi firma digital en «Solicitado por»**.

#### Qué se necesita — un recuadro por renglón

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Renglón 1 · artículo del catálogo** | No | Si el artículo existe en el catálogo, se elige y se rellenan solos la descripción y la unidad. Si no, queda **No está en el catálogo — lo describo abajo** |
| **Descripción** | Sí | Qué es. Ejemplo: un filtro de aire con su máquina |
| **Cantidad** | Sí | Admite decimales, y en los artículos que se llevan en bultos se puede contar en bultos |
| **Unidad** | No | Con un artículo del catálogo, la suya o sus presentaciones: **El almacén cuenta este artículo en esta unidad.** |
| **Observación** | No | Marca, medida, número de parte |

**Lo que no está en el catálogo se puede crear sin salir del pedido.** Con un renglón sin artículo y la descripción escrita, aparece **No está en el catálogo. Se puede crear aquí sin dejar el pedido.**, con el **Código**, la **Categoría** y el botón **Crear y usar**.

Pulse **Agregar renglón** por cada cosa distinta. **Quitar** borra un renglón, y está apagado cuando solo queda uno.

#### Cómo se envía

1. Llene los datos del pedido y los renglones.
2. Pulse **Enviar el pedido**. Mientras guarda dice **Enviando…**
3. El sistema abre sola la ficha de esa compra.

También está **Guardar borrador**, que deja el pedido con la etiqueta **Borrador**. Un borrador se puede completar después con **Corregir**, desde su ficha (9.2).

**Un renglón sin descripción o con cantidad en cero no se envía, y el sistema no avisa de que lo descartó.** Revise la lista antes de pulsar.

Del pedido sale un número: **SOL-2026-0001**.

### 9.5 La compra directa

**Administración › Compras › Compra directa**

Para **lo que ya se compró**, con su factura en la mano. No pasa por cotizaciones ni por el gerente. La pantalla tiene dos pestañas: **Registrar** e **Historial**.

Un pedido pregunta; esto declara. Cuando alguien vuelve del pueblo con dos cajas de guantes y su factura, no hay nada que cotizar ni a quién proponérselo: la compra ya ocurrió y lo único que falta es que el sistema se entere, valorice el inventario y guarde el papel para el IVA.

#### Quién puede hacerla

**Quien tenga la casilla propia de la compra directa** en la matriz de permisos (13.1). No la abre ningún nivel de permiso por sí solo: comprar sin que nadie lo apruebe es una autoridad aparte.

**No tiene tope de monto.** Quien la tenga la hace por cualquier cantidad, y queda en la auditoría quién la hizo y por cuánto. El control es a quién se le da la casilla.

#### Qué se rellena

Son tres bloques: **De quién y cuándo**, **Qué trae la factura** y **El material y el papel**.

| Campo | Qué va |
| --- | --- |
| **Proveedor** | A quién se le compró |
| **N° de la factura** | El número del papel del proveedor |
| **Concepto** | **Es lo que se lee en el tablero.** Mínimo tres letras |
| **Fecha de la compra** | No puede ser futura |
| **Moneda** | **La de la factura.** |
| **Forma de pago** | **De contado**, **Contra entrega**, o a crédito a 15, 30 o 60 días |
| Los renglones | Cada uno es un **Artículo del catálogo**, un **Artículo nuevo** o un **Servicio**: qué es, cantidad, precio y marca. Con un artículo del catálogo, la unidad es la suya |
| **Descuento**, **Flete**, **IVA %** | Como en una cotización |
| **Almacén** | Empieza en **No entra al inventario**: **Vacío para un servicio o algo que no se almacena.** |
| **Entra al almacén ahora** | Marcada cuando hay almacén |
| **La factura del proveedor** | El PDF o la foto del papel |
| **Observación** | Lo que no cabe en los demás campos |

Un **Artículo nuevo** se agrega primero al catálogo, desde el mismo renglón, con **Agregar al catálogo y seguir**.

Los totales se calculan mientras se escribe, y debajo dice con qué tasa se van a congelar: **Se congela con la tasa BCV del … : Bs … por dólar.** Sin tasa del día, la pantalla avisa y ofrece **Registrar la tasa de hoy**.

Cierra con **Aceptar la compra**. Después la pantalla vuelve al tablero.

#### Por qué hace falta la factura para que entre el material

Si se marca **Entra al almacén ahora** sin haber adjuntado la factura, la casilla lo dice: «Hace falta la factura: sin el papel del proveedor el material no entra.»

**Es la misma regla de todo el sistema**, la que impide recibir material sin el papel que lo respalda (9.9). Una compra directa es justo el caso en que la persona tiene la factura delante, así que cumplirla no cuesta nada, y saltársela abriría una puerta trasera a lo único que garantiza que lo que entra al almacén tiene respaldo.

Por eso la pantalla hace las cosas en este orden: **crea la compra, cuelga la factura, y entonces recibe.** Si una de esas tres cosas falla, lo dice: la compra puede quedar guardada sin su factura, o con su factura y sin el material dentro.

#### Qué crea

Una compra directa **no es un camino aparte**: recorre la misma escalera de siempre en una sola operación. Crea la solicitud —ya aprobada—, la cotización con los precios de la factura y la orden. De ahí en adelante todo lo que ya existe funciona igual: el libro de compras, el crédito fiscal, el costo promedio del almacén.

**Se corrige como cualquier orden**, desde su ficha, con **Editar la orden** (9.6). Una compra directa no vuelve a la gerencia por subir de precio.

#### El historial de directas

**Administración › Compras › Historial de directas**, o la pestaña **Historial**. Las compras directas, con un filtro de **Estatus** y un rango de fechas, cuántas son y cuánto suman en dólares. Las columnas son **Orden**, **Proveedor**, **Estatus**, **Total** y **Material**, y la que falta por llegar ofrece **Recibir**.

### 9.6 El detalle de una compra

Se llega pulsando una tarjeta del tablero. **No está en el menú.**

Es la ficha completa: qué se pidió, qué cotizaron los proveedores, la orden emitida, los pagos y el historial. **Todas** las acciones que hacen avanzar una compra se ejecutan desde aquí.

En la cabecera está el título de la compra y, debajo, la línea que la identifica: **SOL-2026-0001 · Orden OC-2026-0007 · pedido por** el nombre y, entre paréntesis, el cargo. A la derecha, **Corregir** cuando el pedido todavía se puede corregir (9.2), y **Tablero**, que devuelve a la pantalla anterior.

#### Las tarjetas de la ficha

**Qué se pidió.** Lo que se pidió y para qué, con la etiqueta de estado a la derecha. La tabla tiene tres columnas: **Descripción**, **Cantidad** y **Unidad**.

**Cotizaciones.** Cada cotización es una tarjeta con el proveedor, su número —**COT-2026-0001**—, el RIF, la fecha, el total y su equivalente en la otra moneda, y tres datos más: **Entrega**, **IVA** y **Validez**. La elegida lleva **Propuesta al gerente**. Cuando hay más de una, unas etiquetas dicen en qué gana cada una: **Más económica**, la de más plazo o la que se paga al recibir, la de entrega más rápida. Cada cotización tiene su **PDF**.

**Orden OC-…** La orden emitida, con el proveedor y la fecha de aprobación. Sus columnas son **Descripción**, **Cant.**, **Precio** y **Subtotal**, y en cuanto la orden puede recibirse se le añade **Recibido**: en verde si llegó todo, en naranja si llegó parte y en gris si no ha llegado nada. Al pie, **Subtotal**, **Descuento** y **Flete** cuando los hay, **IVA**, **Total** y el **Equivalente** en la otra moneda. Un precio que se corrigió lleva la marca **corregido**.

En la cabecera de esa misma tarjeta está el botón **Imprimir**, que saca **la orden de compra en papel**, y, si el proveedor entrega con factura, **Registrar factura** (9.11).

**Pagos.** Aparece en cuanto hay instrucciones de pago: **Lo que se autorizó pagar y lo que ya se pagó.** Cada instrucción muestra el método, cuándo se cargó, su estado —**Por pagar**, **Pagada**, **Devuelta a compras** o **Anulada**—, el monto, el impuesto cuando corresponde, los datos de la transacción y la nota. Si la misma compra ya tiene pagos registrados por su factura, la tarjeta lo advierte: **Esta compra ya tiene pagos registrados por su factura**.

**Historial.** **Quién movió esta compra y cuándo.** Cada línea trae el paso, el nombre de quien lo hizo, la fecha y hora y la nota que escribió. Si no hay nada todavía: **Sin movimientos todavía.**

**Qué sigue.** Es el panel lateral, y es el que hay que mirar primero: **muestra solo la acción que toca ahora**. En el teléfono sube al principio de la pantalla.

**Datos.** El resto de la ficha: **Pedido**, **Solicita**, **Cargado por** cuando quien teclea no es quien pide, **Creado**, **Prioridad**, **Se necesita**, **Destino**, **Confirmado por**, **Aprobado por** y, si se aprobó con un permiso extendido, **Bajo autorización de**. Lo que falta se muestra como **—**.

#### Imprimir la orden de compra

1. Abra la ficha de la compra. El botón **Imprimir** está en la cabecera de la tarjeta **Orden OC-…**. Solo aparece cuando la compra ya tiene orden.
2. Se abre el visor con el documento entero a la vista. Con **Leer en** se puede ver la orden expresada en la otra moneda, con sus tasas congeladas.
3. Revíselo y pulse **Descargar**, o **Cerrar** si no hace falta. **Nada se guarda hasta que pulse Descargar.**

El archivo se llama `orden-compra-oc-2026-0007.pdf`.

**Sale con la misma cabecera que los demás papeles del sistema** (13.2): el logo, la razón social, la actividad, el RIF y el domicilio fiscal de la empresa, y a la derecha tres datos —**N° orden**, **Ref. pedido** y **Emitida**—. Debajo, entre dos rayas finas y centrado, el rótulo **ORDEN DE COMPRA**.

Lo que viene después, en este orden:

| Bloque | Qué trae |
| --- | --- |
| **Proveedor** | Nombre, **RIF**, **Teléfono** y **Dirección**. La empresa no se repite aquí: ya está arriba |
| **CONDICIONES** | **Departamento**, **Solicitante**, **Solicitada el**, **Finalidad**, **Notas**, **Clasificación**, **Entrega prometida**, **Condición de pago**, **Documentos**, **Aprobada por** y **Aprobada el**, **Confirmada por** y **Confirmada el** |
| **ÍTEMS** | La tabla: **SKU · Descripción · Categoría · Cantidad · Precio unit. · Subtotal**, y el **TOTAL** con su moneda |
| Desglose | **Subtotal**, **Descuento**, **Flete** e **IVA**, y **solo si hay algo que desglosar**. Una orden sin descuento, sin flete y exenta no los enseña en cero |
| **NOTAS / OBSERVACIONES** | Lo que el pedido dice que se necesita |

**La condición de pago va escrita en palabras** —«Crédito 30 días»—, nunca en el código interno.

**Dos rayas de firma: Solicitado por y Autorizado por**, con el nombre debajo y, si la persona la eligió, su firma digital. **Si quien autorizó lo hizo con un permiso concedido por otra persona, el papel lo dice**: debajo de **Autorizado por** va «Bajo autorización de» y el nombre de quien le extendió el permiso.

Al pie de cada página: **Documento generado por el sistema**, el número del pedido del que salió y la fecha y hora, y a la derecha **Página 1 de 2** cuando pasa de una hoja.

**Una orden cancelada o anulada sale con el sello ANULADA cruzado.** Una orden cancelada que se imprimiera sin decirlo es una orden que alguien puede despachar por error.

#### Cuando alguien aprueba con un permiso que no es suyo por el puesto

Aprobar una compra va con la gerencia general. Pero el sistema permite **extenderle esa facultad a una persona concreta y por un plazo** —el gerente se va de viaje, hay que seguir comprando—, y eso cambia tres cosas.

**Al aprobar, hay que decirlo.** El panel pide marcar que se aprueba **bajo autorización del gerente general**, y el botón no se enciende sin esa casilla.

**La orden dice quién autorizó.** Debajo de **Autorizado por**, el papel dice de quién viene la facultad.

**Y hay que dejar el respaldo.** A quien aprueba por su puesto no se le pide nada más. A quien aprueba con un permiso extendido se le pide el papel —el correo, el mensaje, la nota— que lo autorizaba, en el mismo panel al aprobar o después en **Papeles recibidos**, con el tipo **Respaldo de la autorización**. Ese tipo solo lo ve quien puede aprobar, y solo sobre una orden que se aprobó de esa manera.

#### El comprobante de pago

Cada instrucción **ya pagada** en dinero lleva su propio botón, **Comprobante de pago**, que saca un PDF. Es lo que se le manda al proveedor cuando pregunta si ya le pagaron.

Trae la orden y el pedido de los que sale, el proveedor, quién lo solicitó, la condición de pago, el total de la orden, el método con el que se pagó, el monto, la fecha y la referencia.

**Solo aparece cuando la instrucción está pagada**, y no en los pagos con material ni con saldo a favor.

#### Los papeles que manda el proveedor

Debajo de la orden hay una tarjeta, **Papeles recibidos**: *«Lo que entregó el proveedor: el comprobante del pago, la nota de entrega, la factura.»* Con los años el papel se pierde; esta copia no.

Cuelga de la orden, así que **no aparece hasta que la compra tiene orden**. Primero se elige el **Tipo de documento** y después **Elegir el archivo**, en ese orden, para que nadie suba una factura rotulada como nota de entrega por ir rápido. Los suben Compras y Almacén; los quita Compras.

| Tipo | Cuándo |
| --- | --- |
| **Comprobante de pago** | El que manda el banco o el proveedor |
| **Nota de entrega** | El papel con el que llegó el material |
| **Factura del proveedor** | La que da derecho al crédito fiscal |
| **Otro papel** | Cualquier otra cosa que convenga guardar |

**Los archivos van a un sitio privado**, no a una dirección pública: se abren con un enlace que se firma en el momento y caduca a los cinco minutos. Un enlace público sería eterno y reenviable.

#### Qué muestra Qué sigue en cada paso

| Estado de la compra | Si le toca a usted | Si le toca a otro |
| --- | --- | --- |
| **Borrador** | Botón **Enviar el pedido** | Nadie más lo ve |
| **Pedido** | Botón **Confirmar el pedido** (Compras) | **Esperando que compras lo confirme.** |
| **Confirmada · indicar proveedores** | Botón **Cargar cotización** y, en cada una, **Proponer al gerente** (Compras) | **Compras está pidiendo precios a los proveedores.** |
| **Por confirmar el gerente** | Botones **Aprobar la compra** y **Devolver a compras** (con sus casillas) | **Esperando la confirmación del gerente general.** |
| **Aprobada · indicar método de pago** | Decir con qué entrega el proveedor, y **Indicar método de pago**, **Pagar con material** o **Usar saldo a favor** (Compras) | **Compras está cargando el método de pago.** |
| **Por pagar** | Botones **Registrar el pago** y **Devolver a compras** en cada instrucción (Compras) | **El pago lo registra compras.** |
| **Pagada · por recibir**, **Contra entrega · por recibir** y **Recibida parcialmente** | Botón **Recibir material** (Almacén) | **La recepción la registra almacén.** |
| **El proveedor desistió**, con dinero pendiente | Botón **Resolver el dinero** (Gerencia general o Compras) | La tarjeta se queda a la vista hasta que se resuelva |

**Antes de aprobar, el panel dice el monto exacto por el que se emitirá la orden.** Es la última pantalla en la que el precio se decide sin dejar rastro: después, cambiarlo es **Editar la orden** o **Corregir el precio**, con su casilla y su motivo, y si la orden sube más de 100 dólares vuelve a la gerencia (9.2).

**Editar la orden** se ofrece mientras no se haya recibido nada y la orden no esté cancelada. Deja cambiar el proveedor, el título, la moneda, la condición de pago y los renglones, enseña lo de antes y lo que queda, y pide un motivo. **Corregir el precio** se abre pulsando el precio de un renglón que no se ha recibido: **Se corrige también en la cotización de la que salió**, y pide un motivo de al menos diez letras.

#### Cancelar

**Cancelar la compra** está disponible mientras el pedido esté en **Borrador**, **Pedido**, **Confirmada** o **Por confirmar el gerente**. Una vez emitida la orden, lo que se cancela es la orden.

**Cancelar la orden** solo lo ven Compras y Gerencia general, y solo mientras la orden esté en **Aprobada · indicar método de pago** o **Por pagar**. Después ya no: **si ya se pagó y el proveedor no entregó, lo que corresponde es registrar el desistimiento**, porque una cancelación borraría del tablero una compra que todavía tiene dinero de la empresa por resolver. El botón **El proveedor desistió** lo ven Compras y Gerencia general mientras la orden espera el material.

#### Los diálogos de motivo

Cinco acciones piden explicación antes de ejecutarse. Todas tienen el mismo campo **Motivo**, con la ayuda **Queda en el historial de la compra.**, y en todas **el botón de confirmar está apagado hasta que el motivo tenga cinco letras**.

| Acción | Qué avisa el diálogo | Botón |
| --- | --- | --- |
| **Cancelar la compra** | **La tarjeta se va a la columna Cancelada y no se puede reabrir.** | **Cancelar la compra** |
| **Devolver a compras** *(desde la gerencia)* | **Vuelve a la columna de cotizaciones para que consigan otra opción.** | **Devolver** |
| **Cancelar la orden** | **Solo se puede antes de que se registre el pago.** | **Cancelar la orden** |
| **El proveedor desistió** | **La compra ya está pagada. La tarjeta se queda a la vista hasta que se resuelva el dinero.** | **Registrar desistimiento** |
| **Devolver a compras** *(una instrucción de pago)* | **El pago no se ejecuta y compras tendrá que autorizarlo de nuevo.** | **Devolver** |

El diálogo **Resolver el dinero** es distinto: muestra cuánto se pagó y a quién, y tiene un solo campo, **Resolución**, con tres opciones —**Reembolso**, **Saldo a favor** y **Pérdida**—. Empieza en la primera, y cierra con **Guardar**.

### 9.7 Proveedores

**Administración › Compras › Proveedores**

**Registro de proveedores. El RIF y la condición de pago se usan al emitir la orden de compra.** **Sin proveedores no se pueden registrar cotizaciones**, así que es lo primero que hay que llenar al arrancar el módulo. La pantalla tiene dos pestañas: **Proveedores** y **Facturas recibidas** (9.11).

Arriba, **Buscar** —**Nombre, RIF o contacto**—, y los botones **Cargar por planilla** y **Nuevo proveedor**. La tabla tiene siete columnas: **Proveedor**, **RIF**, **Contacto**, **Condición**, **Invertido**, **Este mes** y **Estado**, y muestra activos e inactivos. **Pulsar la fila abre la ficha del proveedor**; el botón **Editar**, al final de la fila, lo ve quien tiene escritura sobre Compras.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **RIF** | Sí | Con la forma J-12345678-9. Se puede escribir sin guiones y el sistema los pone |
| **Razón social** | Sí | Mínimo tres letras |
| **Nombre comercial** | No | |
| **Persona de contacto** | No | |
| **Teléfono** | No | |
| **Correo** | No | |
| **Condición de pago** | No | **De contado**, **Contra entrega**, o crédito a 15, 30 o 60 días. Empieza en **De contado** |
| **Moneda preferida** | No | Una de las monedas con tasa registrada. Empieza en dólares |
| **Método de pago preferido** | No | **Se propone al pagarle. No obliga.** |
| **Dirección** | No | |
| **Notas** | No | |
| **Contribuyente especial — se le retiene IVA al pagar** | No | Viene desmarcada. Marcarla muestra un distintivo **Especial** en la lista |
| **Activo — aparece al cargar cotizaciones** | — | Viene marcada |

**La casilla de contribuyente especial manda.** Al registrar la factura de un proveedor marcado así, **el formulario propone la retención de IVA** con el porcentaje de los datos de la empresa (13.2), y descuenta lo retenido del total a pagar.

**Se propone y se deja tocar, a propósito.** El porcentaje sube al 100 % cuando la factura no cumple los requisitos del reglamento, y eso lo ve quien tiene el papel delante, no el sistema. Si el proveedor no está marcado como contribuyente especial, o la factura no lleva IVA, no se propone nada.

**La retención de ISLR no se calcula**: el campo está y admite el monto, pero hay que echar la cuenta aparte.

No hay que confundir esto con el IVA que retiene un cliente cuando la empresa le vende: eso lo calcula el sistema en Facturación.

**Un proveedor no se borra.** La única forma de retirarlo es desmarcar **Activo**, y entonces deja de aparecer al cargar cotizaciones. Sus cotizaciones y sus órdenes anteriores tienen que seguir explicándose.

#### La ficha del proveedor

Arriba, cuatro cifras: **Total invertido**, **Invertido este mes**, **Artículos más comprados** y **Última compra**. Debajo, **Qué se le compra** —**De lo que más dinero se lleva a lo que menos.**— y **Papeles que ha entregado**. Sin compras todavía, la ficha lo dice: **Sin compras a este proveedor**.

Si se le pagó con material que valía más que la orden, aparecen además los **Saldos a favor de la empresa**: **Lo que este proveedor le debe a la empresa por intercambios en los que el material valió más.** Un saldo pendiente de cobro tiene el botón **Cobrar**, para el rol Compras, y el dinero entra a la cuenta que se elija.

### 9.8 Cargar una cotización

Se llega desde la ficha de una compra confirmada, con el botón **Cargar cotización**. Solo lo ve el rol Compras.

Es donde se carga el precio que mandó cada proveedor, **tal como lo mandó**, para poder compararlos. El diálogo se llama **Cotización del proveedor**, y su descripción lo dice: **Se carga tal como la mandó el proveedor. Del mismo proveedor caben varias: una por cada oferta que mande.** Cada carga es una cotización nueva, con su propio número.

**Si lo que hace falta es cambiarle algo a una que ya está cargada, no se vuelve a cargar: se corrige** —ver más abajo—. Cargar añade otra oferta a la mesa; corregir arregla la que ya estaba.

Antes de nada, el diálogo mira la tasa del BCV. Si la hay, avisa con qué tasa y de qué fecha se va a congelar la cotización. Si no la hay, aparece **No hay tasa del BCV registrada. Sin ella no se puede valorar la cotización.** con el enlace **Registrar la tasa de hoy**. Es el bloqueo más frecuente al empezar el día, y se resuelve en **Sistema › Tasas de cambio**.

#### Los campos

En la cabecera: **Proveedor** —obligatorio, y hasta elegirlo el botón de guardar está apagado—, **Fecha**, que empieza en hoy, y **Moneda**: **Solo las que tienen tasa registrada.** Al elegir el proveedor, el sistema cambia solo la moneda y la condición de pago a las suyas.

Debajo, en **Precios por renglón**, por cada renglón del pedido: **Cantidad**, que empieza en lo pedido, **Precio unitario** y la casilla **Exento de IVA**. Bajo cada renglón se lee lo que se pidió, para poder compararlo.

**Solo se guardan los renglones que tengan precio escrito.** Los que quedan en blanco se omiten sin avisar.

**La cantidad puede diferir de la pedida a propósito**, porque el proveedor vende por caja de doce y se pidieron diez. Se carga lo que él ofrece, no lo que se pidió.

En cada renglón hay además **Marca** y **Presentación**. **Quien pide, pide en litros**, que es como se consume, y **quien compra recibe del proveedor otra cosa**: una marca y una presentación —bidón, barril, saco—. La **Marca** se escribe tal como la puso el proveedor; la **Presentación** se elige de las que el catálogo tiene para ese artículo, y empieza en **Como venga**. Son **lo que distingue dos cotizaciones del mismo proveedor**: en la tarjeta salen resumidas en una línea que empieza por **Ofrece**.

Al pie: **Descuento** y **Flete**, que empiezan en cero; **IVA %**, que empieza en la alícuota de los datos de la empresa; **Entrega en (días)**; **Condición de pago**; **Validez (días)**, que empieza en 15; y **Observación**. Después, **Guardar cotización**.

El recuadro de totales que se ve mientras se escribe —**Subtotal**, **Base imponible**, **IVA**, **Total**— es un adelanto. El total que queda guardado lo calcula el sistema al guardar.

#### Corregir una cotización ya cargada

Pasa todo el rato: la cotización está cargada y hay que ajustarle las condiciones de pago antes de proponerla, o el proveedor corrige un precio.

**En la tarjeta de cada cotización hay un botón Editar**, junto a **Proponer al gerente** y **Eliminar**. Abre **Corregir la COT-2026-0001**, ya lleno con lo que la cotización dice hoy: **Se corrige sobre la misma cotización: conserva su número y su sitio en el historial.** Cierra con **Guardar los cambios**, y en el historial queda anotado que se corrigió y quién lo hizo.

**El proveedor no se puede cambiar.** Sale fijo, porque cambiarlo no sería corregir esta cotización sino cargar la de otro, y para eso está **Cargar cotización**.

**Si se cambia la fecha, cambia la tasa.** La cotización guarda congelada la del día que lleva escrito, así que mover la fecha vuelve a pedir la tasa del BCV de ese día.

> **Una cotización propuesta al gerente no se corrige.** Los botones **Editar** y **Eliminar** desaparecen mientras lo esté, y si se intenta por otro camino el sistema se niega: «Esta cotización está propuesta al gerente. Retire la propuesta antes de corregirla, o él aprobaría unas condiciones distintas de las que se le enseñaron.» Se retira con el botón **Retirar la propuesta**, que está en la misma tarjeta; luego se corrige y se vuelve a proponer, y las tres cosas quedan anotadas.

**Tampoco se corrige una que ya generó su orden de compra**: lo que se cambia entonces es la orden (9.6).

#### Proponer más de una al gerente

**La propuesta es una marca de cada cotización**, así que **Proponer al gerente** suma en vez de sustituir. En cada tarjeta propuesta aparece **Propuesta al gerente** y el botón cambia a **Retirar la propuesta**.

El encabezado de la tarjeta lo resume: **3 cotizaciones · 2 con el gerente**. Con dos o más, unas etiquetas dicen en qué gana cada una: **Más económica**, **Más plazo** o **Se paga al recibir**, **Entrega más rápida**. Si no hay ninguna: **Sin cotizaciones** —**Registre las cotizaciones de los proveedores. Con dos o más, la comparación es automática.**—.

**Retirar la última devuelve el pedido a compras.** Vuelve a **Confirmada** y queda anotado: un pedido esperando en la gerencia sin nada que aprobar no tiene sentido.

**A la gerencia le toca escoger.** Con una sola propuesta, el panel de aprobación dice por cuánto se emite la orden. **Con dos o más aparece una lista para marcar cuál se aprueba** —proveedor, total, días de entrega y número— y el botón no se deja pulsar hasta que se marque una. El sistema no escoge por su cuenta. La elegida queda con la etiqueta **La que aprobó el gerente**, y el historial dice cuál fue.

#### Bajarla en PDF

**En cada tarjeta hay un botón PDF**, el primero de la fila. Saca la cotización en papel para mandarla por correo o llevarla a una reunión sin tener que entrar al sistema.

Sale con **el mismo membrete que la orden de compra** y con la marca y la presentación de cada renglón. Si está propuesta o aprobada, lleva el sello que lo dice: **PROPUESTA AL GERENTE** o **APROBADA**.

**No lleva firma, y el pie dice por qué:** «Transcripción de la oferta recibida · el papel del proveedor es el que vale». No es el documento del proveedor sino lo que el sistema anotó de él: si algún día las cifras no coinciden, manda el original.

#### Cómo se calcula el total

1. El **subtotal** es la suma de cantidad por precio de cada renglón.
2. El **descuento se reparte proporcionalmente sobre lo gravado**, para que un descuento aplicado sobre renglones exentos no rebaje el IVA que sí se debe.
3. El **flete forma parte de la base imponible**.
4. El **IVA** es esa base por el porcentaje.
5. El **total** es subtotal menos descuento, más flete, más IVA.

La tasa del BCV del día **queda congelada** dentro de la cotización, como evidencia de a qué cambio se valoró ese precio.

Una cotización se puede **Eliminar** mientras no esté propuesta al gerente y no haya generado una orden.

### 9.9 Recibir material

Se llega desde la ficha de una compra en **Pagada · por recibir**, **Contra entrega · por recibir** o **Recibida parcialmente**, con el botón **Recibir material**. En la ficha lo ve el rol Almacén; los demás leen **La recepción la registra almacén.**

**Sin el papel del proveedor no se puede recibir.** Si en la tarjeta **Papeles recibidos** no hay ni factura ni nota de entrega, la ficha lo dice en ámbar: «Falta el papel del proveedor. Suba la **factura** o la **nota de entrega** en «Papeles recibidos», aquí abajo, y se podrá recibir.»

**El comprobante de pago no sirve para esto**, y la propia pantalla lo aclara: «El comprobante de pago puede llegar después.» Dice que se pagó, no que llegó, y lo que hay que respaldar al recibir es que el material entró.

La descripción del diálogo avisa de lo que más importa: **Lo que se registre aquí entra al inventario y no se puede editar después: una corrección se hace con un ajuste.**

En **Qué llegó** aparecen **solo los renglones que todavía tienen algo pendiente**, cada uno con lo pedido, lo ya recibido y lo que falta. Si no falta nada, se lee **Ya se recibió todo lo de esta orden.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Almacén que recibe** | Sí | Empieza en el destino que dijo el pedido: **Es el destino que pidió quien lo solicitó.** Si el pedido no dijo un almacén, empieza vacío y la ayuda lo explica |
| **Fecha de recepción** | No | Empieza en hoy. **No admite fechas futuras** |
| **Cantidad recibida** | No | Uno por renglón. Empieza en todo lo que falta, y el sistema no admite más. **Déjelo en cero si este renglón no llegó todavía.** |
| **Nota** | No | Número de guía, quién trajo el material, estado en que llegó |

**Si el precio de un renglón se sale mucho de lo que ese artículo viene costando**, el diálogo lo dice antes de recibir y pide marcar **El precio de la orden es correcto — quedará anotado en el movimiento**.

Después, **Registrar la recepción**. El botón está apagado si todas las cantidades están en cero o falta el almacén.

Al registrar, el material entra al inventario con su propio número de movimiento y su costo en dólares, calculado con las tasas que quedaron congeladas en la orden. **Solo entra al inventario lo que lleva existencias**: un flete o una reparación se compran y se pagan, pero no hay nada que guardar en un estante, así que la orden avanza sin generar movimiento.

El estado de la orden se recalcula solo: **Recibida** si no falta nada, **Recibida parcialmente** si falta algo.

#### La pantalla de Recepciones

El mismo diálogo se alcanza desde **Compras › Recepciones**, sin tener que abrir la compra: **Compras cuyo material aún no ha ingresado al almacén: las pagadas y las contra entrega.** Arriba, cuántas hay por recibir; si no hay ninguna, **Sin recepciones pendientes**.

Quien sigue una compra la busca por su número, pero quien está en el portón ve llegar un camión y sabe **de qué proveedor viene y qué trae**, no de qué orden salió. Cada tarjeta enseña el proveedor, cuándo se pagó, cuánto costó y qué falta renglón por renglón, con **Llegó una parte** cuando ya entró algo. El botón **Registrar recepción** lo ve quien tiene escritura sobre Inventario.

Debajo, **Lo último que entró**: las entradas por compra más recientes, con su número de movimiento, el material, el almacén y la cantidad. Sirve para comprobar de un vistazo que lo que se recibió hace un rato quedó registrado.

### 9.10 Indicar el método de pago

Se llega desde la ficha de una compra en **Aprobada · indicar método de pago**, con el botón **Indicar método de pago**. Solo lo ve el rol Compras.

Sirve para decir **cómo y a quién** se le paga al proveedor. El diálogo se llama **Método de pago**: **Con esto la orden pasa a tesorería para que ejecute el pago.**

#### Antes de nada: con qué entrega el proveedor

Encima del botón, mientras no se responda, hay un recuadro naranja con esta pregunta:

> **¿Con qué entrega el proveedor?** *Solo la factura da derecho al crédito fiscal y entra en el libro de compras. Sin decirlo no se puede pagar.*

Se responde con uno de dos botones: **Nota de entrega** o **Factura**. **No hay tercera opción y no se puede posponer**: hasta que se pulse uno, **Indicar método de pago** está apagado. Se pregunta aquí, y no dentro del formulario de pago, porque el sistema se niega a instruir un pago sin este dato.

Una vez respondido, el recuadro desaparece y queda una línea en gris: **El proveedor entrega con factura.** o **El proveedor entrega con nota de entrega.** Si fue factura, se añade: **Sin registrarla, su IVA no se puede descontar.**

**La respuesta no se puede cambiar desde la pantalla.** Si fue un error, se avisa a quien administra el sistema. Lo único que el sistema impide es pasar de factura a nota de entrega cuando la factura ya está registrada: «Esta orden ya tiene una factura registrada. Anúlela antes de decir que se entregó con nota de entrega.» Una orden que quedó sin declarar no tiene dónde declararse (15.1).

#### Los campos

| Campo | Detalle |
| --- | --- |
| **Cómo se paga** | Sale del catálogo de métodos de pago. Empieza en el método preferido del proveedor, si lo tiene |
| **Moneda** | Empieza en la de la orden. Cada método decide qué monedas admite, así que a veces no hay nada que elegir |
| **Monto** | **Falta por pagar:** y la cifra. Empieza en lo que falta, no en el total |
| **Datos de la transacción** | Los que pida el método: banco, número de cuenta, titular, teléfono, correo… |
| **Nota para tesorería** | Llamar antes de transferir, pagar solo en horario de oficina |

**Los métodos de pago son un catálogo, no una lista fija.** Cada uno trae escrito en qué moneda se puede usar, qué datos exige y si pide la referencia al darse por pagado.

**Cuidado con los datos de la transacción: la pantalla no los marca como obligatorios, pero el sistema los exige al enviar.** Si falta alguno, la respuesta lo dice: «Para pagar por … faltan estos datos: …», con el método y la lista de lo que hace falta. Conviene rellenarlos todos antes.

Si la moneda no es el bolívar, aparece marcada la casilla **Causa IGTF del 3%**, con el monto, **Sale además del monto.** Se puede desmarcar si esa operación no lo causa.

Para terminar, **Enviar a tesorería**.

#### Cambiar el método en una orden ya aprobada

Pasa a menudo: la orden se aprobó para pagarla por transferencia y el proveedor pide pago móvil, o al revés. Sobre una instrucción que siga **Por pagar**, quien tenga su casilla ve **Cambiar el método**.

> **Cambiar el método de pago.** *La orden sigue aprobada y en la cola. Solo cambia por dónde sale el dinero.*

**Lo que no toca:** ni el monto, ni la moneda, ni el estado de la orden. La aprobación del gerente sigue valiendo, porque lo que aprobó —qué se compra, a quién y por cuánto— no ha cambiado.

**Solo se ofrecen los métodos que sirven para la moneda que la instrucción ya tiene.**

**Hay que decir por qué.** El motivo pide un mínimo de cinco letras y **queda anotado**: quién lo cambió, cuándo, de qué método a cuál y con qué razón. Es la diferencia entre un cambio de método y un pago desviado a otra cuenta.

**Los datos de la transacción arrancan con los que ya había**, y se vacían si se elige otro método: los de una transferencia no sirven para un pago móvil.

#### Se puede pagar en partes

Una orden admite **varias instrucciones de pago**: mitad ahora y mitad al entregar. Por eso el **Monto** viene con lo que falta y no con el total.

**Y cada instrucción puede ir en una moneda distinta.** Es lo que permite pagar **la base en divisa y el IVA en bolívares a la tasa oficial del BCV**:

1. **Indicar método de pago** con la moneda de la divisa —USDT, dólares— y el monto de la base.
2. Otra vez **Indicar método de pago**, esta vez en **bolívares**, por el IVA.

**Debajo del monto, Repartir lo que falta ofrece tres botones que hacen la cuenta**: **Todo**, **Solo la base** y **Solo el IVA**, cada uno con su cifra ya calculada. Solo aparecen mientras queden por pagar base e IVA: cuando ya no queda base, el reparto no se ofrece y el monto es el IVA que falta.

**Si la moneda elegida no es la de la orden, la cifra se convierte con la tasa que la orden lleva congelada**, no con la de hoy. Es la que el sistema usa para comprobar cuánto falta, así que es la única con la que la cuenta cuadra. La pantalla dice qué tasa está usando.

**El reparto solo se calcula pagando en la moneda de la orden o en bolívares.** Para otra divisa hace falta su tasa de hoy, que esta pantalla no tiene, y entonces el monto se escribe a mano.

Es una propuesta: el monto que vale es el que quede escrito, y se puede corregir.

> **Cuidado con el IGTF, que es la mitad del motivo de repartir así.** Un pago en divisa causa el **3 %** y uno en bolívares no. Pagar el IVA en bolívares se ahorra ese 3 % sobre esa parte.

**Lo que falta por pagar se calcula en dólares y se vuelve a expresar en la moneda de la orden.** Es lo que permite mezclar monedas sin que la cuenta se descuadre: dos instrucciones, una de $9.140,66 y otra de Bs 1.151.755,29, cubren exactamente una orden de $10.603,17.

**La orden solo pasa a Pagada · por recibir cuando ya no queda nada por pagar.** Con un abono parcial se queda esperando el resto.

#### Pagar con material o con saldo a favor

En el mismo paso, junto a **Indicar método de pago**, están **Pagar con material**, cuando lo que se le da al proveedor es material del almacén, y **Usar saldo a favor**, cuando el proveedor tiene un saldo pendiente con la empresa en esa moneda. Las dos se apagan hasta que se dice con qué entrega el proveedor. Un pago con material se registra después con su propio botón, **Registrar el pago con material**.

#### Registrar el pago

Cuando la instrucción está **Por pagar**, el rol **Compras** ve en ella **Registrar el pago** y **Devolver a compras**, y quien tenga la casilla, también **Cambiar el método**. La cola de todos los pagos pendientes está en **Administración › Compras › Pagos por hacer** (12.4).

**Registrar el pago** abre un diálogo con los datos del destino a la vista y tres campos:

| Campo | Detalle |
| --- | --- |
| **Cuenta** | De dónde sale el dinero. Solo se ofrecen cuentas **en la misma moneda** de la instrucción |
| **Número de referencia** | **El número que devolvió el banco o la plataforma.** En efectivo, si se deja vacío, se numera solo |
| **Fecha del pago** | **Vacío es hoy. Es la fecha que aparece en el estado de cuenta.** |

Para terminar, **Confirmar el pago**. El pago queda escrito en el libro de la cuenta, y **si la cuenta no admite sobregiro, el pago no puede pasar de su saldo** (12.0).

Si no hay ninguna cuenta en esa moneda, se lee **No hay ninguna registrada en VES**, o la moneda que sea. Las cuentas se crean en **Tesorería › Bancos y cajas** (12.3).

### 9.11 Facturas de proveedor

**Administración › Compras › Proveedores › Facturas recibidas**

Es la segunda pestaña de Proveedores. El título de la pantalla es **Facturas recibidas de proveedores**: **Facturas de proveedores contra órdenes de compra aprobadas. Sustentan el crédito fiscal del IVA.**

**Una factura va siempre contra una orden.** Nace en la ficha de la compra, con el botón **Registrar factura** de la tarjeta de la orden, que sale cuando el proveedor declaró que entrega con factura y lo ve el rol Compras. El formulario se abre con el proveedor, la orden y la moneda ya puestos. Es lo que impide que se cargue una factura suelta que no case con ninguna orden.

Cuando no hay ninguna, la pantalla lo dice: **Sin facturas registradas** —**Las facturas se registran desde su orden de compra. Sin registrarla, el IVA pagado no se puede descontar del IVA cobrado.**—, con el botón **Ir a las compras**.

#### Para qué sirve registrar la factura

Cuando la empresa vende, le cobra IVA al cliente y ese dinero no se queda en casa: hay que entregarlo. Cuando la empresa compra, le paga IVA al proveedor. La ley permite descontar el IVA que se pagó del IVA que se cobró y entregar solo la diferencia, y ese descuento solo se puede hacer con la factura del proveedor registrada.

**Una compra sin su factura cargada termina pagando el IVA dos veces: una al proveedor y otra al fisco, porque no hubo con qué descontarlo.** Por eso **la factura del proveedor se carga aunque la compra ya esté recibida y pagada**.

#### Quién puede hacer qué

| Acción | Qué hace falta |
| --- | --- |
| Registrar la factura | El rol **Compras**, desde la ficha de la compra |
| Registrar sus pagos y cargar el documento del proveedor | Escritura sobre Compras |
| Anular una factura o un pago, y quitar el documento | Control total sobre Compras |

Quien no llega al nivel que hace falta no ve el botón, y si llega por otro camino recibe «Su usuario no tiene acceso a …» con el módulo.

#### Qué se ve

Arriba, el título y su frase, y a la derecha una etiqueta roja con las que ya se pasaron de fecha: **2 vencidas**.

Debajo, la lista, con estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Factura** | El número que trae impreso y, debajo, **control** con el número de control cuando se cargó |
| **Proveedor** | El nombre y, debajo, el RIF |
| **Fecha** | La de emisión. Debajo, en rojo, **vencida hace 12 d**; o **vence 04/09/2026** si la factura es a crédito y todavía no se pasó |
| **Total** | El total de la factura, en la moneda en que está |
| **Saldo** | Lo que falta por pagar, **siempre en dólares**. En las que ya no están por pagar se ve un guion |
| **Estado** | **Por pagar**, **Pagada** o **Anulada** |

**El saldo se lleva en dólares aunque la factura esté en bolívares**: a un mismo proveedor se le paga unas veces en una moneda y otras en la otra, y solo hay una forma de saber cuánto falta: llevar la cuenta en una sola.

Pulsando en cualquier parte de una fila se abre la ficha de esa factura.

La lista **no tiene buscador ni filtros**, y muestra **las cuatrocientas facturas más recientes** por fecha de emisión. Lo que registre otra persona aparece sin recargar la pantalla.

#### Registrar una factura

El diálogo se llama **Registrar factura de proveedor** y avisa de la regla principal: **Se copian las cifras del papel. Si la suma no coincide con el total impreso, no se puede guardar.**

1. En la ficha de la compra, pulse **Registrar factura**. El proveedor y la **Orden de compra** ya vienen puestos.
2. Copie el **Número de factura** y, si lo trae, el **Número de control**.
3. Revise la **Fecha de emisión**, que empieza en hoy, y la **Moneda** y la **Condición de pago**.
4. Escriba el **Exento** y la **Base imponible**. Al escribir la base, el sistema propone el **IVA**.
5. Compare el **IVA** propuesto con el del papel y corríjalo si no coincide.
6. Si el proveedor es contribuyente especial, revise la **Retención de IVA** que se propone (9.7), y escriba la **Retención de ISLR** si la hay.
7. Escriba el **Total impreso** y compruebe que el recuadro **Total** dé lo mismo.
8. Si tiene el papel a mano, adjúntelo: **Imagen o PDF de la factura recibida**. **Se puede cargar después desde la ficha de la factura.**
9. Pulse **Registrar**. Mientras guarda dice **Registrando…**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Proveedor** | Sí | El de la orden |
| **Orden de compra** | Sí | Viene puesta y no se cambia |
| **Número de factura** | Sí | El que trae impreso el papel. Es del proveedor |
| **Número de control** | No | El otro número impreso, con la forma 00-12345678 |
| **Fecha de emisión** | Sí | Empieza en hoy. **No admite fechas futuras** |
| **Moneda** | — | Empieza en la de la orden |
| **Condición de pago** | — | **De contado**, **Contra entrega**, **Crédito 15 días**, **Crédito 30 días** o **Crédito 60 días**. De aquí sale la fecha de vencimiento que después se ve en la lista |
| **Exento** | No | **Lo que no lleva IVA** |
| **Base imponible** | No | Lo que sí lleva IVA |
| **Alícuota (%)** | — | Viene con la de los datos de la empresa. Se cambia si el papel trae otra |
| **IVA** | No | **Se propone solo; manda lo que diga el papel**. Si se pisa y no cuadra con la alícuota, debajo se lee **Por la alícuota daría 160.00** |
| **Retención de IVA** y **Retención de ISLR** | No | Lo que se retiene; el recuadro **Neto a pagar al proveedor** dice lo que queda |
| **Total impreso** | No | **Para comprobar la suma.** |
| **Observación** | No | |

El recuadro **Total** de la derecha se va sumando mientras se escribe: es el exento, más la base imponible, más el IVA.

**No se teclean los renglones de la factura.** Una factura de proveedor puede traer cuarenta líneas y nadie las copia: lo que hace falta para descontar el IVA son esas cifras, y el detalle de qué llegó ya está en la recepción de la compra.

**Si el total impreso no cuadra con lo tecleado**, bajo ese campo aparece **Lo tecleado suma 1160.00** y el botón se apaga. Cuando la suma no da, o está mal el papel o está mal el tecleo, y las dos cosas hay que verlas ahora y no en la declaración.

#### La ficha de una factura

Se abre pulsando su fila. Arriba, el número de la factura y, debajo, el proveedor y la fecha.

Luego una fila de etiquetas: el estado, la condición de pago, **Vencida hace 12 días** cuando aplica y **Orden OC-2026-0007**. Si la factura está anulada, debajo se lee en rojo **Anulada:** con el motivo que se escribió.

Después, el desglose: **Exento**, **Base imponible**, el **IVA** con su alícuota y el **Total**, y las retenciones y el neto al proveedor cuando las hay. Si la factura está por pagar, al pie se lee **Pagado** una cifra **· falta** la otra, las dos en dólares.

Debajo van **El documento del proveedor** y, cuando ya hay alguno, **Pagos**. Cada pago muestra su número y cómo se pagó, y en letra pequeña la fecha y hora, la cuenta de donde salió, la referencia si la hay y el **IGTF** si lo causó. Los pagos anulados se quedan a la vista, más apagados y con la palabra **anulado** al lado.

**La ficha advierte del otro camino de pago**: esta compra también tiene su instrucción de pago en la orden, y el sistema no cruza los dos (9.2).

Al pie del diálogo: **Cerrar**, **Anular** y **Registrar pago**, según lo que su permiso alcance.

#### Guardar el papel de la factura

La tarjeta se llama **El documento del proveedor** y su subtítulo dice lo que admite: **PDF o foto del papel, hasta 10 MB.** Una vez cargado, cambia a **Guardado. Solo lo ven compras, tesorería y gerencia.**

1. Abra la factura pulsando su fila.
2. En **El documento del proveedor**, pulse **Cargar el documento**. Mientras sube dice **Subiendo…**
3. Al terminar, el nombre del archivo queda escrito al lado.

Para verlo, **Ver el documento** —mientras abre, **Abriendo…**—. Se muestra en el visor, con el título **Documento del proveedor** y el aviso **Tal como lo entregó. La dirección caduca en cinco minutos.** Abajo, **Cerrar** y **Descargar**.

Para quitarlo, el botón rojo **Quitar**, con control total sobre Compras. No hay reemplazo directo: se quita y se carga otro.

Tres cosas que conviene saber:

- **Quién lo ve y quién lo toca no es lo mismo.** Lo suben quienes tienen escritura sobre Compras; lo quitan quienes tienen control total.
- **Una factura anulada conserva su archivo**, a propósito. Anular es decir que ese documento no cuenta, no que no existió.
- **Se admiten PDF, JPG, PNG, WEBP o HEIC, hasta 10 MB.** El selector deja elegir más cosas, así que el rechazo llega al final: «El archivo pesa más de lo que se admite. Redúzcalo y vuelva a subirlo.» o «Ese tipo de archivo no se admite aquí.»

Si su permiso es de consulta y todavía no hay archivo, la tarjeta dice solo **Todavía no se ha cargado.**

#### Registrar un pago

Desde la ficha, con el botón **Registrar pago**. El diálogo se llama **Pagar la factura N° …** y dice de quién es y cuánto falta.

1. Elija la **Cuenta**. Solo aparecen las cuentas abiertas.
2. Escriba el **Monto**. La etiqueta dice en qué moneda se está escribiendo.
3. Elija el **Método de pago**, de los que sirven para la moneda de la cuenta.
4. Escriba la **Referencia**: el **Número de la transferencia**.
5. Revise la casilla del IGTF.
6. Pulse **Registrar el pago**.

**El pago se registra en la moneda de la cuenta**, y por eso el saldo de la factura se lleva en dólares: se elige la cuenta y esa cuenta manda.

Sobre el IGTF: la casilla dice **Pagar el IGTF del 3%** y explica debajo: **Grava los pagos en divisas. No abona la factura: va en su propio asiento.** Va aparte porque no es del proveedor sino del fisco. **Viene marcada sola cuando la cuenta no es en bolívares**, y se puede desmarcar.

**Una factura admite varios pagos.** Cuando ya no queda saldo, pasa sola a **Pagada**.

#### Anular un pago

En la tarjeta **Pagos**, cada pago vivo lleva su propio botón **Anular**, con control total sobre Compras.

**Este botón no pide confirmación ni motivo: se ejecuta en cuanto se pulsa.** Conviene saberlo antes de acercarse al ratón.

El pago no se borra: se queda en la lista, apagado y marcado como **anulado**, y el dinero vuelve a la cuenta con un movimiento contrario. Si el pago causó IGTF, ese también se devuelve, con su propio movimiento. Y si la factura ya estaba en **Pagada**, vuelve a **Por pagar**.

#### Anular una factura

Desde la ficha, con el botón **Anular**, con control total sobre Compras. El diálogo se llama **Anular la factura** con su número y avisa de lo que se pierde: **Sale del libro de compras y su crédito fiscal deja de contar.**

Escriba el **Motivo** —**Queda en el registro de auditoría con su nombre y la hora.**— y pulse **Anular**, o **No anular**. El botón está apagado hasta que el motivo tenga cuatro letras.

**Una factura anulada no vuelve.** Si estaba mal, se anula y se registra otra.

#### Lo que el sistema no deja hacer aquí

- **No deja registrar dos veces la misma factura del mismo proveedor**, porque registrarla dos veces descuenta dos veces el mismo crédito fiscal.
- **No deja guardar si la suma no cuadra con el total impreso.**
- **No deja registrar una factura con fecha futura**, porque una factura que todavía no se emitió no sustenta nada.
- **No deja registrar una factura que suma cero.**
- **No deja editar una factura registrada.** El camino es anularla, con su motivo, y registrar la correcta.
- **No deja anular una factura que tenga pagos vivos.** Primero se anulan los pagos.
- **No deja pagar más de lo que falta**, ni pagar una factura anulada o ya pagada.
- **No deja registrar nada si no hay tasa del BCV** para la fecha de la factura. Se resuelve en **Sistema › Tasas de cambio**.

**Lo que no hace es cotejar las cifras.** La factura queda atada a su orden, pero nadie compara lo que se pidió, lo que llegó y lo que se facturó: si el proveedor factura más de lo que entregó, el sistema no lo nota. Esa comparación la hace la persona, con los dos documentos delante.

**Aquí no se imprime nada.** Lo que se archiva es el papel del proveedor.

### 9.12 El libro de compras y el gasto por unidad

**El libro de compras está en Administración › Tesorería › Libro Mayor**, pestaña **Compras** (12.12). Es la mitad de la declaración del IVA: el crédito fiscal, que es el impuesto que se pagó a los proveedores y que se descuenta del que se le cobró a los clientes. Pide lectura sobre Tesorería, y sus datos, además, lectura sobre Compras.

**Las facturas anuladas no aparecen en el libro de compras.** El número de control de una factura de compra es del proveedor, así que un salto en su serie no es algo que la empresa tenga que explicar; una factura anulada de este lado es una fila que se cargó mal y no se declara.

#### Gasto por unidad

**Administración › Compras › Gasto por unidad.** **Gasto de compras por unidad de destino. Cada pedido indica su destino y aquí se totaliza.** Una fila por unidad, con **Pedidos**, **Comprado**, **Este mes**, **Consumido** y **Peso**.

### 9.13 Lo que conviene entender

#### Quién pide, quién aprueba, quién recibe

Cada paso del circuito lo hace alguien distinto, y la pantalla lo reparte por rol o por casilla (9.1). Lo importante de ese reparto es lo que no comprueba.

**El sistema comprueba el rol o la casilla, pero no que sean personas distintas.** Al aprobar, mira que quien aprueba tenga la casilla y que la compra esté en el paso correcto. No compara nombres. Si una misma persona tiene el rol de Compras y la casilla de aprobar, **puede recorrer sola todo el circuito hasta la orden de compra**: pedir, confirmar, cargar la cotización, proponerla y aprobarla.

Lo mismo, y más amplio, ocurre con el rol de Administrador: **pasa siempre, en todo**. Si un rol quedara sin asignar a nadie, el sistema se bloquearía y no habría forma de destrabarlo desde dentro.

La consecuencia práctica es una sola, y conviene tenerla presente al repartir los roles: **la separación de funciones aquí es una decisión de administración, no una barrera del sistema**. Lo que el sistema sí garantiza es el rastro: quién hizo cada paso y cuándo queda escrito en el **Historial** de la compra, y la ficha muestra **Cargado por** cuando quien teclea no es quien pide.

#### Una sola aprobación, sea cual sea el monto

Una compra de veinte dólares y una de veinte mil recorren el mismo camino y necesitan la misma aprobación. No hay segundo aprobador según el monto.

**La única cifra que el sistema vigila es la de después:** si una orden ya aprobada se edita y sube más de 100 dólares, vuelve a la gerencia (9.2). **Nadie debe suponer que una compra grande se detendrá sola antes de aprobarse.** Si hace falta un control por monto, es un acuerdo entre personas.

#### Recepciones parciales

Casi ninguna entrega llega completa a la primera, y el sistema está hecho contando con eso.

**Si llega menos de lo pedido**, se escribe en **Cantidad recibida** lo que realmente llegó, y cero en los renglones que no llegaron. La orden queda en **Recibida parcialmente** y **sigue en el panel Pagada** del tablero. El botón **Recibir material** sigue disponible, y la próxima vez el diálogo muestra solo lo que falta. En la tabla de la orden, la columna **Recibido** se ve naranja mientras esté incompleto y verde cuando llegue todo. La orden pasa a **Recibida** sola cuando ya no falta nada.

**El contador de días sin recibir sigue corriendo** durante la recepción parcial, y la compra sigue en el aviso del tablero. Mientras falte material pagado, el dinero sigue fuera.

**Si llega más de lo pedido, no se puede registrar.** Recibir de más no es un descuido: o llegó otra cosa, o el precio pactado ya no cubre lo que entró, y en cualquiera de los dos casos hay que mirarlo antes de meterlo al inventario. Se recibe lo pedido y el excedente se resuelve aparte, con un ajuste de inventario o devolviéndolo al proveedor.

**Si el proveedor no entrega nunca**, se registra **El proveedor desistió** y después se usa **Resolver el dinero**.

#### Cómo se numeran los documentos

Cada documento lleva un número con la forma prefijo, año y cuatro cifras.

| Documento | Ejemplo | Cuándo se asigna |
| --- | --- | --- |
| Pedido | **SOL-2026-0001** | Al crear el pedido |
| Cotización | **COT-2026-0001** | Al guardar la cotización |
| Orden de compra | **OC-2026-0007** | Al aprobar la compra |

Cuatro reglas que evitan discusiones:

- **El contador se reinicia cada año**, y el año se toma con la hora de Caracas, no con la del equipo desde el que se teclea.
- **El número lo asigna el sistema, nunca la pantalla.** Dos personas cargando a la vez obtendrían el mismo número si cada una lo calculara por su cuenta.
- **Cada número es único.** Puede haber huecos en la serie si una operación se cae después de tomar el número.
- **La numeración del pedido y la de la orden son independientes.** El pedido **SOL-2026-0001** puede terminar en la orden **OC-2026-0007**. Y si una orden se cancela y se emite otra para el mismo pedido, la nueva lleva su propio número.

#### Lo que el sistema no hace

- **No coteja lo pedido con lo recibido y lo facturado.** Ese cuadre lo hace la persona.
- **No deja corregir con qué entrega el proveedor** una vez declarado (9.10).
- **No avisa de las compras que prometieron factura y no la registraron.** Lo dice la ficha de cada una mientras está en el paso 4, y en ninguna lista.
- **El tablero no se imprime.**

### 9.14 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: Compras. Su usuario no tiene ese rol…» | Ese paso le toca a otro rol | Pida el rol a la administración, o que lo haga quien lo tenga |
| «Su usuario no tiene permiso para …» | Falta la casilla de esa acción: aprobar, devolver, editar la orden, hacer una compra directa… | Se da en la matriz de permisos (13.1) |
| «Su usuario no tiene acceso a …» | Su permiso sobre el módulo no llega al nivel que pide esa acción | Pida el permiso a la administración, o que lo haga quien lo tenga |
| «Escriba qué se compró: el título es lo que se lee en el tablero.» | El concepto de una compra directa tiene menos de tres letras | Escríbalo |
| «Una compra no puede tener fecha futura.» | La fecha de la compra directa es de mañana o más allá | Corríjala |
| «De esta orden ya se recibió todo.» | Se pulsó recibir sobre una orden completa | No falta nada por entrar |
| «Póngale un título al pedido: es lo que se lee en el tablero.» | El título quedó corto | Escriba un título que se entienda desde el tablero |
| «Explique para qué es. Quien aprueba no está en el frente y necesita el porqué.» | La justificación quedó corta | Escriba para qué se necesita |
| «Indique quién solicita: elija a alguien del sistema o escriba su nombre.» | No se eligió persona ni se escribió un nombre | Elija a alguien de la lista o escriba el nombre |
| «El nombre de quien solicita es demasiado corto para identificar a nadie.» | El nombre tiene menos de tres letras | Escriba el nombre completo |
| «Quien solicita no existe o está inactivo.» | Esa persona no está activa | Elija a otra persona o escriba su nombre |
| «El pedido necesita al menos un renglón.» | Ningún renglón tenía descripción y cantidad | Llene al menos un renglón completo |
| «El renglón 2 no tiene descripción.» | Ese renglón quedó sin describir | Escriba qué es, o quite el renglón |
| «La cantidad del renglón 2 debe ser mayor que cero.» | Falta la cantidad | Escriba cuánto se necesita |
| «Este pedido está en "…" y ya no se corrige aquí. Si está con el gerente, retire lo propuesto; si ya se aprobó, la orden manda.» | El pedido pasó de Confirmada | Lo que dice el propio mensaje |
| «Solo quien creó el pedido puede corregirlo.» | El pedido es de otra persona | Pídale a esa persona que lo corrija |
| «Solo quien creó el borrador puede enviarlo.» | El borrador es de otra persona | Pídale a esa persona que lo envíe |
| «Solo se envía un borrador. Este pedido está en "…".» | Ese pedido ya se envió | Revise el tablero: ya está en circulación |
| «Solo se confirma un pedido recién enviado. Este está en "…".» | Ya alguien lo confirmó | Siga por el paso siguiente |
| «Hay 3 cotizaciones propuestas: hay que decir cuál se aprueba.» | No se marcó ninguna | Marque cuál se aprueba en la lista del panel |
| «No hay tasa BCV registrada para el 04/08/2026 ni para ninguna fecha anterior. Regístrela en Sistema › Tasas de cambio.» | Sin tasa no se valora nada | Regístrela en **Sistema › Tasas de cambio** y repita la operación |
| «Una cotización no puede tener fecha futura.» | La fecha es de mañana o después | Corrija la fecha |
| «La cotización necesita al menos un renglón con precio.» | Ningún renglón llevaba precio | Escriba el precio de al menos un renglón |
| «Las cotizaciones se cargan sobre un pedido confirmado. Este está en "…".» | El pedido todavía no se confirmó | Que compras lo confirme primero |
| «El RIF "J123" no tiene forma válida. Se espera J-12345678-9.» | El RIF está mal escrito | Corríjalo con esa forma |
| «Ya hay un proveedor registrado con el RIF J-12345678-9.» | Ese proveedor ya existe | Búsquelo en la lista. Si está inactivo, actívelo |
| «El nombre o razón social del proveedor es obligatorio.» | La razón social quedó corta | Escriba la razón social completa |
| «Esta cotización está propuesta al gerente. Retire la propuesta antes de eliminarla.» | Es la que está en manos de la gerencia | Retire la propuesta, y después elimínela |
| «Esta cotización ya generó una orden de compra y no se puede eliminar.» | De ahí salió la orden | Si la compra no procede, cancele la orden |
| «El pedido no tiene ninguna cotización propuesta.» | No hay nada que aprobar | Que compras proponga una cotización |
| «Diga qué hay que corregir: sin eso, compras vuelve a mandar lo mismo.» | El motivo de la devolución quedó corto | Escriba qué hay que corregir |
| «Antes de pagar hay que decir con qué entrega el proveedor: nota de entrega o factura. Solo la factura da derecho al crédito fiscal y entra en el libro de compras.» | No se declaró el comprobante | Pulse **Nota de entrega** o **Factura** en la ficha |
| «Esta compra es contra entrega: se paga lo que llegue, y todavia no se ha recibido nada.» | La orden contra entrega no ha recibido material | Reciba primero; después se paga lo que llegó |
| «Esta orden esta en "…" y no admite instrucciones de pago.» | La orden ya no está en el paso de pagar | Revise la tarjeta de pagos de la ficha |
| «El monto a pagar debe ser mayor que cero.» | El monto quedó en cero | Escriba cuánto se paga |
| «Con esta instruccion se pagaria mas que el total de la orden (…). Ya hay … instruido.» | Entre todas las instrucciones se pasa del total | Revise lo ya instruido y ajuste el monto |
| «Para pagar por … faltan estos datos: ….» | Faltan datos de la transacción | Rellene los datos que dice el mensaje |
| «Falta el número de referencia de la transacción.» | Falta la referencia del banco | Escriba el número que devolvió el banco |
| «Indique de qué cuenta sale el dinero.» | No se eligió la cuenta | Elija la cuenta desde la que se pagó |
| «Esta instrucción está en "PAGADA" y no se puede volver a pagar.» | Ese pago ya se registró | Revise la tarjeta de pagos |
| «Solo se devuelve una instrucción pendiente de pago.» | Esa instrucción ya no está por pagar | Revise su estado en la tarjeta de pagos |
| «Hay que decir por qué se cambia el método de pago.» | Falta el motivo del cambio | Escriba por qué |
| «Escriba por qué se edita la orden: queda en la bitácora.» | Falta el motivo de la edición | Escriba por qué |
| «La orden OC-2026-0007 ya recibió material: sus renglones movieron existencias y costo. Anúlela si está mal.» | La orden ya no se edita | Lo recibido se corrige con un ajuste de inventario |
| «Falta el papel del proveedor: sin factura o nota de entrega el material no entra.» | No hay factura ni nota de entrega en **Papeles recibidos** | Súbala y vuelva a recibir |
| «Esta orden está en "Recibida" y no admite recepción.» | Ya se recibió todo, o la orden no está en un paso de recibir | Revise el estado de la orden en su ficha |
| «El almacén indicado no existe o está inactivo.» | Ese almacén no está activo | Elija otro almacén, o pida que lo activen |
| «No se indicó ninguna cantidad recibida.» | Todas las cantidades quedaron en cero | Escriba lo que llegó de verdad |
| «De "FILTRO DE AIRE" se pidieron 10 y ya se recibieron 8. No se pueden recibir 5 más.» | Llegó más de lo pedido | Reciba lo que falta. El excedente se resuelve aparte |
| «Una orden en "Recibida" no se puede marcar como desistida.» | El desistimiento solo vale para órdenes que esperan el material | Revise el estado de la orden |
| «Describa qué pasó con el proveedor.» | El motivo del desistimiento quedó corto | Escriba qué ocurrió |
| «Esta orden no está marcada como desistida.» | No hay dinero pendiente que resolver | Revise el estado de la orden |
| «Un pedido en "…" ya no se cancela desde aquí. Si ya hay orden de compra, cancélela en la orden.» | La compra pasó de la etapa de pedido | Cancele la orden desde su propia tarjeta |
| «Una orden en "…" ya no se cancela. Si ya se pagó y el proveedor no entregó, márquela como desistida.» | Ya se pagó: cancelar borraría del tablero dinero pendiente | Use **El proveedor desistió** y después **Resolver el dinero** |
| «Escriba por qué se cancela. Sin motivo, dentro de un mes nadie sabrá qué pasó.» | El motivo quedó corto | Escriba por qué se cancela |
| «Una factura va contra una orden de compra: es la que dice qué se compró y a qué precio. Si esta compra no tiene orden, créela primero y registre la factura desde ahí.» | Se intentó registrar una factura sin orden | Regístrela desde la ficha de la compra |
| «La factura necesita su número, que es el que trae impreso.» | El número de la factura quedó vacío | Copie el número que trae el papel |
| «No se registra una factura con fecha futura.» | La fecha de emisión es de mañana o después | Corrija la fecha |
| «La factura suma cero. Revise el exento, la base imponible y el IVA.» | Las tres cifras quedaron vacías o en cero | Escriba las cifras del papel |
| «El papel dice 1160.00 y lo tecleado suma 1150.00. Revise el exento (0), la base (1000) y el IVA (150).» | El total impreso no coincide con lo tecleado | Repase las tres cifras contra el papel. Si el papel es el que está mal, resuélvalo con el proveedor |
| «La factura F-00123 de "FERRETERIA EL TORNILLO" ya está registrada. Registrarla dos veces descuenta dos veces el mismo crédito fiscal.» | Esa factura de ese proveedor ya se cargó | Búsquela en la lista. Ya está |
| «Escriba por qué se anula la factura.» | El motivo quedó corto | Escriba qué pasó con esa factura |
| «La factura F-00123 ya estaba anulada.» | Alguien la anuló antes | Revise la lista: ya está fuera del libro |
| «La factura F-00123 tiene 1 pago(s) registrados. Anúlelos primero: el dinero salió y tiene que volver al libro con su propio asiento.» | Se quiere anular una factura que ya se pagó | Anule los pagos desde la ficha y vuelva a intentarlo |
| «La factura F-00123 está … y no admite pagos.» | Esa factura ya está pagada o anulada | Revise su ficha |
| «El monto del pago tiene que ser mayor que cero.» | El monto quedó vacío o en cero | Escriba cuánto se paga |
| «A la factura F-00123 le faltan 500 $ y se están pagando 800 $.» | Se está pagando más de lo que se debe | Ajuste el monto a lo que falta |
| «El pago PGC-2026-0001 ya estaba anulado.» | Otra persona lo anuló primero | Cierre y vuelva a abrir la ficha: ya está anulado |

---

## 10. Ventas

Ventas es el camino del material hacia afuera: a quién se le vende, a cuánto, y qué se le ofrece antes de mandar el camión. El menú **Ventas** tiene cuatro pantallas: **Tablero**, **Clientes**, **Lista de precios** y **Cotizaciones**.

El despacho se hace en **Facturación › Notas de entrega**, y la factura y el cobro en **Facturación › Facturas**. La nota de entrega se cuenta aquí (10.6) porque es el paso de la venta que saca el material del patio; la factura, el cobro y las notas de crédito, en el capítulo 21.

Hay una idea que conviene entender antes de tocar nada, porque es la que ordena todo el módulo:

**El material sale del patio con la nota de entrega, no con la factura.** El despacho se pide, otra persona lo aprueba, y en ese momento nace la nota y el material se descuenta. La factura viene después, si viene, y es otro papel: el fiscal. Puede juntar varias notas de entrega y no mueve inventario, porque el material ya salió. La única que sí lo mueve es la **factura sin nota** cuando se emite con el material saliendo con ella (capítulo 21).

**Facturar es opcional.** Una nota de entrega vale por sí sola: el despacho queda hecho y el material, descontado, se facture o no. Si se factura, la nota queda enlazada a su factura.

### 10.1 Quién entra y quién puede hacer qué

Ventas toca dos módulos y dos casillas, y conviene no confundirlos.

| Qué | Lo decide |
| --- | --- |
| Ver las cuatro pantallas de Ventas | El módulo **Ventas** en la matriz de permisos (13.1) |
| Registrar y editar clientes, cotizar, cerrar una cotización | **Ventas** en escritura |
| Poner o quitar un precio de la lista, y dar crédito a un cliente | **Ventas** en control total |
| Vender por debajo del mínimo, o dar un renglón sin cargo | La casilla de **vender bajo el mínimo** (13.1) |
| Ver **Facturación › Notas de entrega** | El módulo **Facturación** |
| Pedir un despacho, completar una nota, ponerle sus camiones, enlazarla a una factura | **Facturación** en escritura |
| Aprobar o no aprobar un despacho | La casilla **Aprobar los despachos** (13.1) |
| Cancelar un despacho que espera aprobación | Quien lo pidió |
| Anular una nota de entrega, o soltarla de una factura | **Facturación** en control total |
| Corregir una nota entera con **Editar** | El rol **Administrador** |

Dos reglas que no dependen de ningún permiso: **quien pide un despacho no lo aprueba**, aunque tenga la casilla, y **solo quien lo pidió lo cancela**. Las dos las impone el sistema.

**Cuando le falta permiso, el mensaje dice qué falta.** Si es un nivel sobre el módulo, verá «Su usuario no tiene acceso a ….»; si es una casilla, «Su usuario no tiene permiso para ….». Si llega sin detalle, «Su usuario no tiene permiso para esta acción.» En los tres casos se pide a la administración, o lo hace quien lo tenga.

Una cosa más, que vale para todas las pantallas del módulo: **lo que se escribe pasa solo a mayúsculas y sin tildes** mientras se teclea. El **Correo** es la excepción y se guarda en minúscula.

### 10.2 El circuito de una venta

Esta es la sección que hay que leer aunque no se lea ninguna otra. Del cliente al cobro son seis pasos; dos son opcionales.

1. **Se registra el cliente.** **Ventas › Clientes › Nuevo cliente**. Sin cliente no se cotiza, no se despacha y no se factura. Hacen falta la **Identificación** —el RIF de una empresa o la cédula de una persona sin RIF— y la **Razón social**; el **Domicilio fiscal** se imprime en la factura.
2. **Se le pone precio a lo que se vende.** **Ventas › Lista de precios**. Cada producto lleva, por cada unidad en que se vende, un **precio de lista** y un **precio mínimo**, que es el suelo. Un producto sin precio en esa unidad se puede vender igual, a **precio acordado**.
3. **Se cotiza, si hace falta.** **Ventas › Cotizaciones › Nueva cotización**. Nace en **Enviada**, y desde el detalle se cierra con **La aceptó** o con **La rechazó**. Una cotización no compromete existencias.
4. **Se pide el despacho.** **Facturación › Notas de entrega › Pedir despacho**. Hacen falta el cliente, el patio, al menos un renglón completo y los datos del transporte: **el nombre del chofer, su cédula y la placa del vehículo**. El pedido queda **Por aprobar** y **no rebaja nada todavía**.
5. **Otra persona lo aprueba.** Pulsa **Aprobar** en la tarjeta del despacho. En ese momento el sistema comprueba que haya material y tasa del día, **nace la nota de entrega en Despachada y el material sale del patio**. Este es el paso que descuenta el patio.
6. **Se factura y se cobra, si se factura.** En **Facturación › Facturas**, con **Facturar notas**: se marcan una o varias notas despachadas del mismo cliente y la misma moneda, y la factura se envía a autorizar. La nota pasa a **Facturada** cuando la factura se emite, y el cobro se registra en la factura. Todo eso está en el capítulo 21 (21.2).

**Las vueltas atrás.** Todas dejan rastro y piden motivo:

- **No aprobar** un despacho lo cierra sin descontar nada. El motivo lo lee quien lo pidió.
- **Cancelar** un despacho que espera aprobación lo retira. Lo hace quien lo pidió.
- **Anular una nota Despachada** devuelve el material al patio con un reverso, y la nota queda **Anulada**, a la vista.
- **Una nota Facturada no se anula desde la nota**: primero se anula la factura, y sus notas vuelven a quedar despachadas, sin factura (21.2).

**Los dos papeles del camión.** El pesaje de la romana y la guía de movilización se eligen de una lista al pedir el despacho, y los dos son opcionales. Al elegir el pesaje, los pesos y la placa se traen de la báscula; al aprobarse el despacho, el ticket y la guía quedan gastados en ese viaje, y si la nota se anula vuelven a quedar libres. El detalle está en el capítulo 8.

**La cotización aceptada no se convierte en despacho.** No hay botón que la pase a nota de entrega. Aunque el cliente haya aceptado, al pedir el despacho hay que volver a elegir el cliente y volver a cargar los renglones.

**Una cotización no se anula desde la pantalla.** Solo se cierra como **Aceptada** o como **Rechazada**. Una oferta que se cayó se cierra con **La rechazó**.

### 10.3 Clientes

**Ventas › Clientes**

A quién se le vende. La pantalla lo resume: **Registro de clientes. La dirección se imprime en la factura y el límite de crédito se aplica al facturar.**

#### Qué se ve

Arriba, el botón **Nuevo cliente** y el campo **Buscar**, que encuentra por **Nombre, RIF o contacto**. Si no aparece nada, la pantalla sugiere buscar por parte del nombre o por el RIF sin guiones. La lupa de arriba, buscando un cliente por su nombre, aterriza aquí con la búsqueda puesta.

Si todavía no hay ninguno, aparece **Sin clientes registrados**, con el texto **Sin clientes no se puede despachar ni facturar.** y el botón **Registrar el primero**.

| Columna | Qué muestra |
| --- | --- |
| **Cliente** | Razón social y, debajo, el nombre comercial si lo tiene |
| **Identificación** | El RIF o la cédula |
| **Condición** | La condición de pago y, si retiene IVA, el chip **Agente de retención** |
| **Deuda** | Lo que debe, en dólares. Debajo, **de $ X** si tiene límite, en rojo cuando la deuda lo pasó |
| **Última venta** | La fecha, o **—** |
| **Estado** | **Activo** o **Inactivo** |

Las condiciones de pago son cuatro: **De contado**, **Crédito a 15 días**, **Crédito a 30 días** y **Crédito a 60 días**.

#### Registrar y editar

Pulse **Nuevo cliente**. Se abre la ventana **Nuevo cliente**, con el aviso **La identificación y la dirección salen impresas en la factura.** Llene la ficha y pulse **Guardar**.

Para editar, **pulse en cualquier parte de la fila**. Se abre la misma ventana, titulada **Editar cliente**.

**Un cliente no se borra.** Se desmarca **Activo** y deja de aparecer al cotizar y al despachar, pero sus facturas y sus notas siguen donde están, que es lo que permite explicar una venta de hace un año.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Identificación** | Sí | El RIF con su dígito si es una empresa (**J-12.345.678-9**), o la cédula si es una persona sin RIF (**V-12.345.678**). Solo admite las teclas que sirven para eso, y la letra pasa sola a mayúscula. Lo dice la ayuda: **Cédula si es una persona sin RIF; RIF con su dígito si es una empresa.** |
| **Razón social** | Sí | Mínimo tres letras |
| **Nombre comercial** | No | |
| **Persona de contacto** | No | |
| **Teléfono** | No | Con la forma **0412-5551234** |
| **Correo** | No | Se guarda en minúscula |
| **Domicilio fiscal** | No | La ayuda avisa: **Va impreso en la factura. Una factura sin la dirección del comprador está mal emitida.** |
| **Condición de pago** | Sí | Empieza en **De contado** |
| **Moneda preferida** | Sí | Con la que arrancan sus documentos |
| **Límite de crédito, en dólares** | No | Solo aparece si la condición no es **De contado** |
| **Contribuyente especial — retiene IVA al pagar** | No | Viene desmarcada |
| **Retención de IVA** | No | Solo aparece si la casilla anterior está marcada. Empieza en **75** |
| **Exento de IVA — sus documentos salen con alícuota cero** | No | Viene desmarcada |
| **Activo — aparece al cotizar y despachar** | — | Viene marcada |
| **Notas** | No | |

Dos ayudas de esta ficha conviene leerlas enteras, porque explican decisiones que después no se pueden discutir con el sistema. La del límite: **Por encima de este monto no se le factura a crédito. En cero, no se le vende a crédito.** No es un aviso: es un tope. Y la del recuadro: **Solo lo fija quien tenga control total sobre Ventas.** Dar crédito compromete dinero de la empresa.

La de la retención: **Normalmente 75%. Se descuenta de lo que hay que cobrarle, no del total de la factura.**

#### Qué no le deja el sistema

**Poner un límite de crédito, o cualquier condición que no sea De contado, exige el control total sobre Ventas.** Fiar es comprometer dinero de la empresa, y esa no es una decisión de la persona que carga el cliente.

**Dos clientes no pueden compartir identificación.** Si la repite verá «Ya hay un cliente registrado con el RIF J-12345678-9.» La identificación es lo que distingue al comprador en la factura; repetida, la deuda de uno se mezcla con la del otro.

**El botón Guardar no se apaga aunque falten la identificación o la razón social.** El rechazo llega después de pulsar, dentro de la misma ventana. Revíselos antes de guardar y se ahorra el viaje.

### 10.4 Lista de precios

**Ventas › Lista de precios**

A cuánto se vende cada cosa, en cada unidad, y por debajo de cuánto no se vende.

#### Qué se ve

El título **Lista de precios** y, a la derecha, si hay productos activos sin precio, un aviso: **3 productos sin precio**.

**Aquí no se crean artículos.** Solo se les pone precio a los que ya están en el catálogo y son vendibles. Si el catálogo no tiene nada que vender, la pantalla dice **Sin productos de venta en el catálogo** y explica: **Los precios se asignan a artículos de categoría Producto o Servicio, que se crean en Inventario › Catálogo de artículos.**

**Hay una fila por cada producto y unidad.** Lo que tiene densidad en el catálogo se vende en metros cúbicos y en toneladas, cada unidad con su precio y su mínimo; si una de las dos no tiene precio, bajo la unidad sale, por ejemplo, **por TON: sin precio**.

| Columna | Qué muestra |
| --- | --- |
| **Producto** | Nombre y, debajo, el código, con **· servicio** si lo es y **· dado de baja** si el artículo no está activo |
| **Unidad** | En la que se vende ese precio |
| **Precio** | El importe, o el aviso **Sin precio** |
| **Mínimo** | El importe, o **—** si es cero |
| **Actualizado** | Fecha del último cambio, o **—** |

#### Poner un precio

1. Pulse en cualquier parte de la fila. Se abre una ventana titulada con el nombre del producto y el subtítulo **Precio por** su unidad.
2. Elija la **Unidad**. La que todavía no tiene precio dice **· sin precio todavía**.
3. Elija la **Moneda**.
4. Escriba el **Precio de lista por** esa unidad.
5. Escriba el **Precio mínimo por** esa unidad, si va a haber suelo. En cero, no hay tope por abajo.
6. Pulse **Guardar precio**.

Al pie de la ventana está la regla: **Un descuento no baja de ahí. Solo lo salta quien tenga la casilla de vender bajo el mínimo. En cero, no hay tope por abajo.** El mínimo no es una sugerencia.

Si el precio es por la otra unidad, la ventana explica cómo sale el material: **El patio lo lleva en M3. Al vender por TON, lo que sale se calcula con la densidad del catálogo, 1,6 t/m³, salvo que el camión se pese en la romana.** Y si el artículo no tiene densidad: **Sin densidad en el catálogo solo se vende en metros cúbicos.**

Para quitar un precio, el botón **Quitar el precio por** esa unidad, en la misma ventana.

#### Qué no le deja el sistema

**Poner o quitar precios exige el control total sobre Ventas**, porque es decidir a cuánto vende la empresa.

**El botón Guardar precio está apagado si el precio está vacío o en cero.** Un producto con precio cero se despacharía regalado sin que nadie lo note; para regalar está el renglón **Sin cargo** (10.5).

**El mínimo no puede ser mayor que el precio**, y el sistema lo dice con las dos cifras: «El precio mínimo (…) no puede ser mayor que el precio (…).» Un suelo por encima del techo dejaría el producto imposible de vender sin saltar el mínimo.

Solo se le pone precio a productos y servicios. A un insumo el sistema responde «Solo se le pone precio de venta a lo que se vende. «FILTRO DE AIRE» es INSUMO.»

### 10.5 Cotizaciones

**Ventas › Cotizaciones**

Lo que se le ofrece al cliente antes de despachar. La pantalla lo dice: **Ofertas al cliente previas al despacho. No comprometen existencias.**

#### Qué se ve

El botón **Nueva cotización**. Si no hay ninguna, **Sin cotizaciones**, con el texto **La cotización informa el precio al cliente antes del despacho. Es opcional.** y el botón **Cotizar**.

| Columna | Qué muestra |
| --- | --- |
| **Número** | **COTV-2026-0001** |
| **Cliente** | Razón social |
| **Fecha** | La de emisión y, debajo, **vale hasta 19 ago 2026**; en naranja, **venció el 19 ago 2026**, si ya pasó |
| **Total** | Con el símbolo de su moneda |
| **Estado** | **Enviada**, **Aceptada** en verde, **Rechazada** en rojo, **Anulada** en gris |

Se muestran **las 200 más recientes**, las nuevas primero, sin filtros ni buscador.

#### Los renglones: el bloque donde se decide el precio

Este bloque es el mismo en **Nueva cotización** y en **Pedir despacho** (10.6), así que se explica una sola vez.

Cada renglón es un recuadro con estos campos:

| Campo | Detalle |
| --- | --- |
| **Renglón 1** | El producto. Empieza en **Seleccione el producto**, y cada opción es el código y el nombre |
| **Patio** | Solo en el despacho. Empieza en el de la nota; se cambia cuando ese renglón sale de otro patio |
| **Unidad** | **M3** o **TON** si el artículo tiene densidad; si no, la suya. La que no tiene precio de lista dice **· sin precio de lista** |
| **Cantidad** | En la unidad elegida |
| **Precio** | A qué precio sale, como condición: ver abajo |
| **Total del renglón** | Se calcula solo |
| **Exento de IVA** | Solo en la cotización. Deja ese renglón fuera de la base imponible |

Abajo, **Agregar renglón**. El botón **Quitar** está apagado cuando solo queda un renglón, porque un documento sin renglones no dice nada.

**El precio no se teclea: se elige a qué precio sale.** Son cuatro condiciones:

| Condición | Cuándo se ofrece | Qué pide |
| --- | --- | --- |
| **De lista** | Si esa unidad tiene precio de lista. La opción dice la cifra: **De lista · $ 12,00 por TON** | Nada más |
| **Con descuento sobre la lista** | Si esa unidad tiene precio de lista | El **Descuento** y **En** qué va: **Porcentaje de la lista** o un monto menos por unidad. Debajo dice en cuánto queda: **Queda en $ 10,80 por TON, de $ 12,00.** |
| **Sin cargo** | Siempre. A quien no tiene la casilla de vender bajo el mínimo, el campo le avisa en rojo: **Sin cargo lo autoriza quien pueda vender bajo el mínimo, y no tiene esa casilla.** | El **Motivo**, que **queda escrito en el renglón y en el papel** |
| **Precio acordado (no hay lista)** | Si esa unidad no tiene precio de lista | El **Precio acordado por** esa unidad |

Al elegir el producto con precio de lista, la condición arranca en **De lista**. La regla de cada condición está en la ayuda del campo: el precio de lista sale **de Ventas › Lista de precios, en la moneda del documento**, y el sin cargo **lo autoriza quien pueda vender bajo el mínimo**.

**El mínimo se avisa en la pantalla y lo decide el sistema.** Si un descuento deja el precio por debajo del mínimo, sale en amarillo: **Por debajo del mínimo de $ 8,00: lo autoriza quien pueda vender bajo el mínimo.** El botón de guardar sigue encendido; al guardar, el sistema rechaza el renglón si quien guarda no tiene la casilla. Si el documento va en otra moneda que el mínimo, el aviso usa la tasa del día, y **sin tasa del día el aviso no aparece**: un aviso calculado con una tasa inventada engaña más que el silencio.

**Un renglón a medio llenar dice qué le falta**, y mientras falte, el botón de guardar está apagado: **Falta la cantidad.**, **Falta decir a qué precio sale.**, **Falta de cuánto es el descuento.**, **Falta decir por qué sale sin cargo.**, **Falta el precio acordado.** Un renglón sin producto, en cambio, no se envía y no da error.

En el papel y en el detalle, cada renglón que no salió de lista lleva debajo una línea gris que lo explica: **20 % de descuento sobre $ 12,00**, **Sin cargo (de lista, $ 12,00): muestra para el cliente**, **Precio acordado: esa unidad no tenía precio de lista**.

#### Crear una cotización

1. Pulse **Nueva cotización**. La ventana avisa: **Cada renglón dice a qué precio sale: de lista, con descuento, sin cargo o acordado. La tasa queda congelada en el documento.**
2. Elija el **Cliente**. Solo aparecen los activos. Al elegirlo, la **Moneda** cambia sola a la suya.
3. Cargue los renglones.
4. Ajuste **Válida por (días)**, que empieza en **15**.
5. Escriba el **Flete**, si lo hay. La ayuda dice: **Se le suma a la base imponible.**
6. Escriba la **Observación**, si hace falta.
7. Decida los impuestos. **La casilla Esta operación lleva IVA viene desmarcada**; al marcarla aparece la **Alícuota (%)**, que arranca en la de la ficha de la empresa y se puede cambiar para este documento. La casilla **Esta operación lleva IGTF** también viene desmarcada; marcada, arranca en el 3 % de ley y se calcula sobre el total con IVA.
8. Revise el bloque de totales, que se recalcula mientras escribe: **Subtotal**, **Flete** si lo hay, **IVA** con su alícuota si lleva, **IGTF** si lleva y, tras una raya, **Total**.
9. Pulse **Guardar cotización**.

**No hay descuento sobre el total del documento.** El descuento va en cada renglón, dicho sobre la lista, para que se sepa de qué precio salió cada cosa.

Si el cliente está marcado como exento, la casilla del IVA no aparece y la ventana lo dice: **ACME C.A. está registrado como exento: el documento sale sin IVA.**

#### Ver, cerrar e imprimir

Pulse en la fila. Se abre el detalle con el número por título, el chip del estado —y el de **Vencida**, si pasó su validez—, la tabla de renglones con **Descripción**, **Cantidad**, **Precio** y **Total** —los exentos llevan el chip **Exento**— y el bloque de totales. Si el cliente retiene IVA, los totales terminan en **Retención de IVA** y **A cobrar**.

| Botón | Cuándo aparece | Qué hace |
| --- | --- | --- |
| **Cerrar** | Siempre | Cierra la ventana |
| **Imprimir** | Siempre | Genera el PDF y lo abre en el visor **Cotización** |
| **La aceptó** | Solo si está **Enviada** | La pasa a **Aceptada** |
| **La rechazó** | Solo si está **Enviada** | La pasa a **Rechazada** |

**Vencida no es un estado: es un cálculo.** Sale de la fecha más los días de validez. Un estado que solo cambia con el paso del tiempo obliga a que alguien lo cambie, y el día que nadie lo cambie el papel queda mintiendo. **Una cotización vencida se puede aceptar o rechazar igual**; nada lo impide.

#### Qué sale de aquí

El PDF sale con la misma cabecera que los demás papeles del sistema (13.2): la razón social, la actividad, el RIF, el domicilio fiscal y, si están cargados, el teléfono y el correo; a la derecha, **N° COTIZACIÓN**, **FECHA** y **VÁLIDA HASTA**. Debajo, centrado entre dos rayas, el rótulo **COTIZACIÓN**. Después, el recuadro del cliente con **CLIENTE**, **RIF** —o **CÉDULA** si el cliente se registró con cédula—, **DIRECCIÓN** y **TELÉFONO**, y la tabla **DESCRIPCIÓN · CANTIDAD · UNIDAD · PRECIO · TOTAL**, con una columna **CONVERSIÓN** cuando algún renglón se puede expresar en la otra unidad. La tabla se parte en hojas numeradas **Página 2 de 3**.

Bajo los totales sale siempre el equivalente en la otra moneda —**Equivale a Bs 45.320,00**— y, en el pie, la tasa usada: **Tasa del día: 235,45 Bs/$**. Firman **Por la empresa** y **Aceptado por el cliente**, ambas con **Nombre, cédula y fecha**.

El pie dice, literal: **Los precios están expresados con la tasa del día indicada arriba y se ajustan al momento de facturar. Esta cotización no compromete existencias.**

### 10.6 Notas de entrega

**Facturación › Notas de entrega**

El papel con el que sale el camión. La pantalla lo resume: **Notas de entrega: el documento con el que sale el camión. El despacho se solicita con chofer, cédula y placa; al aprobarse se emite la nota y el material se descuenta del patio.**

#### Qué se ve

Arriba, tres botones: **Choferes / Vehículos**, que abre el catálogo de los que se llevan el material; **Reporte Bs/$**, que saca en PDF las notas que se ven, con sus totales en las dos monedas y, debajo, un **Desglose por material** con cuánto se despachó de cada artículo, también en las dos monedas; y **Pedir despacho**, que solo ve quien escribe en Facturación.

Debajo, si hay despachos pedidos, la sección **Despachos por aprobar**, con una tarjeta por pedido (se explica más abajo). Y después la lista de notas.

| Columna | Qué muestra |
| --- | --- |
| **Nota** | **NE-2026-0001** y, debajo, el número de la factura si ya está facturada |
| **Cliente** | Razón social, o **Cliente por concretar**. Si la nota respalda una salida, debajo: **Respalda la salida NS-2026-0012**, y **· solo respaldo** si no se va a facturar (10.10) |
| **Vehículo** | La placa, o **—**, y debajo el chofer |
| **Fecha** | La del despacho |
| **Total** | Con el símbolo de su moneda |
| **Total Bs** y **Total $** | El mismo total en las dos monedas |
| **Estado** | Ver abajo |

| Estado | Qué quiere decir |
| --- | --- |
| **Pendiente por completar** | Nació de una nota de salida y le falta el cliente o algún precio (10.10) |
| **Despachada** | El material salió. No le falta nada: facturarla es opcional |
| **Facturada** | Está enlazada a una factura |
| **Anulada** | Se anuló y se queda a la vista, con su motivo |

Las 200 más recientes. Si no hay ninguna, **Sin notas de entrega**.

#### Buscar una nota

**El campo Buscar una nota busca en todas, no solo en las que se ven.** La ayuda lo dice: **Busca en todas las notas, no solo en las que se ven.** Se compara contra todo lo que se suele tener a mano: el **número** de la nota, el **cliente**, su **RIF**, la **placa**, el **chofer**, el **ticket** de romana, el **NS** que respalda y la **factura** en la que terminó. Un solo campo, porque quien busca no siempre sabe cuál de esos datos es el que tiene escrito.

Al lado, el **Estado** —**Cualquiera** o uno de los cuatro— y la **Moneda** —**Cualquiera**, o una de las que tienen tasa registrada—, para ver solo los despachos en dólares o solo los que se emitieron en bolívares; es la moneda en la que se emitió la nota, no su equivalente, que siempre sale en las dos columnas. Debajo, el **rango de fechas**. Los tres se combinan entre sí y con el buscador.

Si no aparece nada, sale **Sin resultados** y la pantalla recuerda que el número va completo, **NE-2026-0042**, con el año y los cuatro dígitos.

**La nota de salida se busca en su propia pantalla**, **Salidas › Historial**, con el mismo campo **Buscar una nota**, donde vale el **NS-2026-0012** o el número del movimiento. Y las dos, la de entrega y la de salida, se encuentran también desde **la lupa de arriba**, escribiendo el número desde cualquier pantalla.

#### Pedir un despacho

1. Pulse **Pedir despacho**. La ventana avisa: **No rebaja nada todavía. Al aprobarlo quien tiene el permiso, nace la nota de entrega y el material sale del patio.**
2. Elija el **Cliente**. La **Moneda** se ajusta sola a la suya.
3. Elija el **Patio**. La ayuda dice: **Si un renglón sale de otro patio, se elige en el renglón.**
4. Cargue los renglones, como en la cotización (10.5). **Con el patio elegido, bajo el producto sale cuánto hay**: **Hay 1.250 TON en PATIO PRINCIPAL.** Si pide más, la **Cantidad** se pone en rojo con **No hay tanto en el patio**.
5. Baje al recuadro del camión. El recuadro lo explica: **Datos del camión y de la romana. Si se vende en metros cúbicos, el peso no cambia lo que se factura. Si se vende un solo material en toneladas, las toneladas son las del ticket.** En ese caso la cantidad de ese renglón no se teclea: la ayuda dice **Las toneladas del ticket de romana.**
6. Elija el **Ticket de romana** de la lista, si el camión se pesó. **Al elegirlo, los pesos y la placa se traen de la báscula**, y también el chofer.
7. Elija la **Guía de movilización**, si el despacho lleva una.
8. Complete los **Datos del despacho**: el chofer y el vehículo.
9. Escriba el **Flete** y la **Observación**, si los hay, y adjunte las fotos de la carga si las hay.
10. Pulse **Enviar a aprobación**.

El botón está apagado mientras falte el cliente, el patio, un renglón completo, un dato del transporte o —con el pago combinado marcado— alguno de sus dos montos, y debajo se lee qué falta: **Para enviarlo falta el nombre del chofer, su cédula, la placa del vehículo.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Cliente** | Sí | Solo los activos. Empieza en **Seleccione el cliente** |
| **Moneda** | Sí | Se pone sola la del cliente |
| **Patio** | Sí | Empieza en **Seleccione el patio o almacén** |
| **Ticket de romana** *(la lista)* | No | Empieza en **Sin pesaje registrado**. Trae los pesajes sin usar, cada uno con su placa y su neto. Si no hay ninguno: **No hay pesajes sin usar.** |
| **Guía de movilización** | No | Empieza en **Sin guía**. Trae las guías vigentes, cada una con su material y su cantidad. La ayuda dice: **Si este despacho lleva guía de movilización, elíjala.** |
| **Chofer / responsable** | Sí | Se busca en el catálogo. Si no está, se escriben debajo el **Nombre del chofer** y la **Cédula** |
| **Vehículo** | Sí | Se busca en el catálogo. Si no está, se escriben debajo **Vehículo (marca/modelo)** y la **Placa** |
| **Ticket de romana** *(la casilla de texto)* | No | Se llena sola con el número del ticket elegido |
| **Peso bruto (kg)** | No | Se llena solo al elegir el ticket |
| **Tara (kg)** | No | Se llena sola al elegir el ticket. Con el bruto mayor, debajo aparece **Neto: 28.500 kg** |
| **Flete** | No | |
| **Observación** | No | |
| **Adjuntar fotos o PDF** | No | Las fotos de la carga, del vehículo que se lo lleva. No salen en el papel impreso |

**El chofer y el vehículo, del catálogo o nuevos.** Cuando no están en la lista, al lado de los datos escritos hay un botón **+ Añadir** que los guarda en el catálogo en el acto. Si no se pulsa, el despacho se envía igual y el chofer o el vehículo se añaden solos. Un chofer necesita al menos tres letras de nombre y cinco dígitos de cédula; una placa, al menos cuatro caracteres.

**Elegir un ticket pisa lo que hubiera.** El chofer, la cédula, el vehículo y los pesos se toman del pesaje: si estaban en el catálogo se eligen, y si no, quedan escritos para añadirlos. Si después hay que cambiar algo, se cambia a mano.

**Hay dos campos con el mismo nombre y no es un error.** Arriba está la lista **Ticket de romana**, donde se elige el pesaje; abajo, la casilla de texto **Ticket de romana**, que se llena sola con el número al elegirlo. La casilla se escribe a mano cuando el pesaje no está registrado en el sistema.

**Dos avisos al pie de la ventana**, que no impiden enviar: si la carga pasa la capacidad del vehículo, **Se están cargando 18 m³ en un vehículo de 15 m³. Se puede seguir.**; y si el vehículo pasó su tope de mantenimiento, en rojo, **A12BC3D pasó su tope de mantenimiento. No debería estar trabajando.**

**En el despacho no hay IVA ni descuento sobre el total.** Los totales son **Subtotal**, **Flete** y **Total**: el IVA lo decide la factura, si se factura, y el descuento va en cada renglón.

**Pago combinado: parte en $ y parte en Bs.** Debajo del total, solo con la nota en dólares, está la casilla **Pago combinado: parte en $ y parte en Bs**. Al marcarla aparecen **Monto en $** y **Monto en Bs**, y debajo se lee si cuadra con el total de la nota —**Cuadra con el total de la nota ($50,00)**— o cuánto falta o sobra —**Faltan $12,50 por cubrir del total.**, **Sobran $3,00 respecto al total.**—. No es un cobro: no rebaja nada y no mueve ninguna cuenta, solo queda anotado para quien aprueba el despacho y para quien factura después; el cobro de verdad se registra en Facturación, al facturar. Al cambiar la nota a otra moneda, la casilla se apaga sola y los dos montos se borran.

#### Aprobar, no aprobar o cancelar

Cada despacho pedido tiene su tarjeta en **Despachos por aprobar**: **Despacho SD-2026-0001** con el chip **Por aprobar**, el cliente y el patio de donde sale, el vehículo con el chofer y su cédula, los renglones con su precio y su importe, y el **Total del despacho**. Si se pidió con pago combinado, debajo del total se lee **Pago combinado: $30,00 + Bs 500,00**. Si el ticket o la nota ya tienen número, salen juntos para cotejar los papeles. Debajo, quién lo pidió y cuándo, y las fotos de la carga.

| Botón | Quién lo ve | Qué hace |
| --- | --- | --- |
| **Aprobar** | Quien tiene la casilla **Aprobar los despachos** | Corre el despacho: nace la nota en **Despachada** y el material sale del patio |
| **No aprobar** | El mismo | Lo cierra sin mover nada. Pide **Motivo**, que **lo lee quien lo pidió** |
| **Cancelar** | Quien lo pidió | Lo retira. Pide **Motivo**, que **queda escrito y no se puede editar después** |

**Quien pidió el despacho no lo aprueba**, aunque tenga la casilla: el sistema responde «El despacho SD-2026-0001 lo pidió usted: lo aprueba otro usuario con permiso.» Es el reparto de siempre: quien carga no se autoriza a sí mismo.

**Al aprobar, se comprueba todo de verdad.** Que haya material en el patio, que el cliente siga activo, que el patio no esté cerrado, que el ticket y la guía sigan libres, y que haya tasa. Si algo falla, no se aprueba nada y el mensaje dice qué (10.11).

A quien no tiene la casilla, la sección le explica: **Los aprueba quien tenga el permiso «Aprobar los despachos» (la gerencia general, o a quien se le preste).** Los no aprobados y los cancelados se esconden, y el botón **Ver los no aprobados** los trae de vuelta.

#### Ver una nota

Pulse en la fila. El título es el número, y el subtítulo dice el cliente, la fecha y de qué patio salió, y si respalda una nota de salida. Dentro están los chips del estado, la placa, **Neto 28.500 kg** si hay pesos y **En la factura FAC-2026-0012** si ya se facturó. Si está anulada, en rojo: **Anulada:** y el motivo. Debajo, los camiones, de qué despacho salió —quién lo pidió y quién lo aprobó—, sus fotos, los renglones y los totales.

| Botón | Cuándo aparece | Qué hace |
| --- | --- | --- |
| **Cerrar** | Siempre | Cierra la ventana |
| **Imprimir** | Siempre | Abre el PDF en el visor **Nota de entrega** |
| **Editar** | Al rol Administrador | Corrige la nota entera (ver abajo) |
| **Completar** | Si está **Pendiente por completar**, a quien escribe en Facturación | Le pone el cliente y los precios que le faltan (10.10) |
| **Camiones** | Si no está anulada, a quien escribe en Facturación | Pone o cambia los camiones que se llevaron el material (10.10) |
| **Anular** | Si está **Despachada** o **Pendiente por completar**, a quien tiene control total sobre Facturación | Ver abajo |
| **Enlazar a una factura** | Si está **Despachada** y se puede facturar, a quien escribe en Facturación | La enlaza a una factura emitida sin nota |
| **Soltar de la factura** | Si está **Facturada** en una factura sin nota, a quien tiene control total sobre Facturación | La desenlaza: vuelve a quedar despachada |

**Enlazar a una factura** sirve para la factura que se emitió sin nota y sin sacar el material: el material sale después con la nota, y la nota se engancha a ella. La ventana lo explica: **La nota pasa a facturada con el número de esa factura. La factura no cambia: sus montos siguen siendo los suyos.** En la lista **Factura** solo aparecen las de ese cliente que cumplen eso. Una factura que ya sacó el material no admite notas: se contaría dos veces.

**Editar** abre **Editar NE-2026-0007**, con el aviso **Solo un administrador ve este botón. Cada cambio queda en la bitácora con el motivo.** Se corrigen el cliente, la moneda, el patio, la fecha, el vehículo, el chofer, los pesos, el flete, el descuento, la observación y los renglones, y hace falta el **Motivo**. Una nota que respalda una salida no deja editar sus renglones: son los que esa salida descontó del patio.

#### Anular

1. Pulse **Anular**. Se abre **Anular la nota NE-2026-0007**, con el aviso **El material vuelve al patio con un reverso. La nota se queda a la vista, anulada.** Es así para la nota que salió de un despacho; la que respalda una nota de salida no devuelve nada (10.10).
2. Escriba el **Motivo**. La ayuda avisa: **Queda escrito en el registro de auditoría con su nombre.**
3. Pulse **Anular la nota**. **No anular** cierra sin hacer nada.

**El botón está apagado hasta que el motivo tenga al menos cuatro letras.** Anular un despacho devuelve al patio material que nadie contó: es una corrección, no una operación del día.

**Una nota ya facturada no se anula desde aquí**: primero se anula la factura, porque el número fiscal ya se emitió y tiene que quedar explicado. La excepción es la factura sin nota, de la que la nota se suelta con **Soltar de la factura**.

#### Qué sale de aquí

El PDF sale con la cabecera de la casa, como los demás, **pero el rótulo NOTA DE ENTREGA va en naranja**. Es a propósito: la nota es un papel de patio, y en un fajo de hojas mezcladas el color es lo que la separa de una factura sin tener que leer ninguna. A la derecha van **N° NOTA** y **FECHA**. El recuadro del cliente lleva **CLIENTE**, **RIF** o **CÉDULA**, **DIRECCIÓN** y **TELÉFONO**, o **CLIENTE POR CONCRETAR** si todavía no lo tiene; debajo, una fila con **VEHÍCULO**, **CHOFER**, **CÉDULA** y **TICKET · PESO NETO**, un renglón por camión.

**La nota lleva solo el TOTAL.** Sin subtotal, sin impuestos, sin tasa al pie y sin leyenda: es el papel del material, y lo fiscal va en la factura. Firman **Entregado por** y **Recibido conforme**, distintas de las de la cotización y la factura. Si la nota está anulada sale el sello **ANULADA**, y si está pendiente, **PENDIENTE**.

### 10.7 Facturación

La factura se hace en **Facturación › Facturas**: sobre las notas de entrega despachadas, con **Facturar notas**, o sin nota, con **Factura sin nota**. Toda factura se envía a autorizar y la emite otro usuario. Está en el capítulo 21 (21.2).

### 10.8 Notas de crédito

Están en **Facturación › Notas de crédito**, en el capítulo 21 (21.3).

### 10.9 El libro de ventas

Está en **Tesorería › Libro Mayor**, en la pestaña **Ventas** (12.12).

### 10.10 Lo que conviene entender

#### La nota de entrega que deja una nota de salida

No toda nota de entrega nace de un despacho. Hay material que sale del almacén con una **nota de salida** hacia alguien de fuera —una ferretería, un contratista, un particular— y que conviene dejar respaldado también del lado de facturación. Para eso, en el visor donde se imprime la nota de salida aparece la casilla **Generar nota de entrega**.

**No todas las salidas la llevan**, y por eso es una casilla y no algo automático: se marca solo cuando hace falta.

Al marcarla se abre **Nota de entrega de NS-2026-0012**, que avisa: **Respalda lo mismo que ya salió: no vuelve a descontar material. Al cliente se le entrega solo la nota de salida; esta queda para el archivo.** Tiene cuatro cosas, y ninguna es obligatoria:

| Campo | Detalle |
| --- | --- |
| **Cliente** | Empieza en **Sin cliente todavía**. La ayuda recuerda a quién dice la salida que se entregó: **La salida dice que se entregó a «FERRETERIA EL TORNILLO».** Si ese nombre coincide con un cliente del sistema, ya viene puesto; si no, se elige otro, se crea en **Ventas › Clientes**, o se deja sin cliente |
| **Precios** | Uno por renglón, en la moneda de la nota. Vienen vacíos, porque la nota de salida no tiene precios. Se teclean ahí mismo o se dejan para después |
| **Camiones** | Con qué se llevó el material: chofer, vehículo y, si los hay, ticket de romana y peso neto. **Uno o varios**, con **Otro camión** |
| **Se podrá facturar** | Viene marcada. **Desmarcada, queda solo de respaldo: nunca aparece en Facturación para cobrarla.** |

El botón es **Generar la nota**.

**Si le falta el cliente o algún precio, la nota nace pendiente.** La ventana lo avisa antes de guardar —**Va a quedar pendiente por completar**, y dice qué le falta—. La nota se ve en **Facturación › Notas de entrega** como **Pendiente por completar**, se puede imprimir —sale con el sello **PENDIENTE**— y no se puede facturar hasta que alguien que escribe en Facturación la abra y pulse **Completar**.

<p class="regla"><strong>El material no se descuenta dos veces.</strong> La salida ya lo rebajó del almacén; esta nota de entrega solo documenta ese mismo movimiento. Por eso <strong>anularla no devuelve nada al almacén</strong>: si hay que devolver el material, lo que se deshace es la salida.</p>

**Al cliente se le entrega solo la nota de salida.** La de entrega es para el archivo, y las dos se imprimen cuando haga falta: la de salida desde **Salidas** o **Movimientos**, y desde el mismo visor de la salida, que dice **Dejó la nota de entrega NE-2026-0016** con un botón **Verla** —y el chip **Pendiente** si lo está—. También está en **Facturación › Notas de entrega**, donde dice de qué salida viene.

**Una salida deja una sola nota de entrega.** Si se anula, se puede generar otra.

**Quién puede marcar la casilla.** Nadie por su rol ni por su nivel: es la casilla **Generar la nota de entrega de una salida**, del módulo Salidas, y solo se tiene si el administrador la presta desde **Configuración › Usuarios › Permisos extendidos** (13.1). Quien no la tiene imprime su nota de salida como siempre y no ve la casilla.

**No vale** para las salidas hacia un área de la empresa —ahí no hay cliente a quien entregarle nada— ni para las que pagaron una compra con material, que son una compra y no una entrega.

#### Los camiones de una nota de entrega

**Una nota de entrega puede llevar varios camiones.** Se ponen en tres sitios, y en los tres es la misma lista:

| Dónde | Cuándo |
| --- | --- |
| En el cuadro **Generar nota de entrega**, desde la nota de salida | Al nacer |
| En **Completar**, en Facturación › Notas de entrega | Al ponerle lo que le falta |
| Con el botón **Camiones** del detalle de la nota, o del visor de la nota de salida que la dejó | En cualquier momento, mientras no esté anulada |

La ventana **Camiones de NE-2026-0016** lo explica: **Con qué se llevó el material. Salen en el papel de la nota de entrega, uno debajo del otro.** De cada camión se dice el **chofer** y el **vehículo** —del catálogo, y si no están se añaden ahí mismo— y, si los hay, el **ticket de romana** y el **peso neto**. Un camión necesita al menos chofer o vehículo: un ticket solo no es un camión.

<p class="regla"><strong>Lo que se imprime es la foto del momento.</strong> Placa, chofer y cédula se copian a la nota al guardar, además de apuntar al catálogo. Si mañana se corrige el nombre de un chofer en el catálogo, la nota que ya se imprimió sigue diciendo lo que decía.</p>

**Quién puede ponerlos.** Quien escribe en Facturación, sobre cualquier nota. Y quien generó la nota desde la salida, sobre esa nota: es la misma persona, poniéndole lo que la salida no tenía.

#### La nota de entrega y la factura no son el mismo papel

Es la confusión más común, y sale cara: quien la tiene, o le entrega al cliente una nota creyendo que ya facturó, o factura dos veces lo mismo.

| | Nota de entrega | Factura |
| --- | --- | --- |
| Qué es | El papel con el que sale el camión | El documento fiscal |
| Numeración | **NE-2026-0001** | **FAC-2026-0012** más el número de control **00-00000034** |
| ¿Mueve el patio? | Sí, al aprobarse el despacho | No, salvo la factura sin nota que saca el material |
| ¿Es obligatoria? | Es la venta: sin ella no sale material | No: facturar una nota es opcional |
| Cuántas | Una por despacho, con uno o varios camiones | Una puede juntar varias notas del mismo cliente y la misma moneda, o ir sin nota |
| Datos propios | Vehículo, chofer, cédula, ticket de romana, peso, guía de movilización | Número de control, condición de pago, vencimiento, IVA, IGTF, retención |
| Totales en el papel | Solo el total | Base, impuestos y total |
| Color del rótulo | Naranja | El de la casa |
| Firmas | **Entregado por** / **Recibido conforme** | **Por la empresa** / **Aceptado por el cliente** |
| Estado al nacer | **Despachada** | **Por cobrar**, cuando se autoriza |

**Anular no es lo mismo que corregir.** Anular sirve mientras la factura no ha salido de la empresa: se rompe el papel y se hace otro. En cuanto está en manos del cliente, él tiene un documento fiscal con un número de control que existe —y el SENIAT también—, y entonces lo que corresponde es la **nota de crédito** (21.3).

#### Cómo se descuenta el inventario al aprobar

Cuando alguien pulsa **Aprobar**, el sistema hace todo esto de una vez:

1. Comprueba el pesaje, si se eligió uno: que sea de salida, que no esté usado ni anulado y que no se haya pesado para otro cliente.
2. Comprueba la guía, si se eligió una: que no esté usada ni anulada, que no haya vencido y que no se haya emitido para otro cliente.
3. Comprueba que el cliente siga activo y que el patio no esté cerrado.
4. Crea la nota con su número y **congela la tasa del día** en el documento.
5. Carga los renglones y comprueba su precio contra el mínimo.
6. Mira la existencia real de cada patio, renglón por renglón. **Los servicios se saltan**: un flete se cobra, pero no sale de ningún almacén.
7. Escribe la salida en el libro de inventario, valorada al costo promedio, y **guarda en cada renglón el movimiento exacto que escribió**.
8. Marca el ticket y la guía como gastados en este viaje.

Guardar el movimiento exacto es lo que hace que anular funcione bien: al anular, el sistema devuelve exactamente lo que sacó ese camión, no una salida parecida. Buscar «una salida parecida» devolvería la del camión de al lado el día que dos despachos coincidan en artículo y cantidad.

**O sale el material del patio y queda la nota, o no pasa ninguna de las dos cosas.** Nunca se queda a medias: no existe la nota sin material descontado, ni el material descontado sin nota.

**Qué pasa si no hay material.** El despacho no se aprueba y el sistema dice con nombre y cifras qué falta: «En "PATIO PRINCIPAL" hay … de "GRANZÓN" y se están despachando ….» No deja el patio en negativo, porque una existencia negativa no es un dato: es un error que alguien va a tener que deshacer más adelante, cuando ya nadie recuerde de dónde salió. Si el material sí está en el patio pero el sistema dice que no, lo que falta es la entrada: se carga la producción o se hace el conteo desde **Inventario › Existencias**, y después se vuelve a aprobar.

**Al anular**, el sistema escribe en el libro el movimiento contrario, con el motivo. El inventario nunca se edita: se le escribe el contrario, y los dos movimientos quedan visibles. **Y el pesaje y la guía vuelven a quedar libres**, listos para la nota que corrija a la anterior: el camión se pesó igual y la guía se emitió igual. Lo que se cayó fue la nota, no el pesaje.

#### El mínimo, y quién vende por debajo

Cada producto lleva, por unidad, un **precio de lista** y un **precio mínimo**, que es el suelo (10.4).

- **Con el mínimo en cero no hay tope por abajo.**
- **Con un mínimo puesto, un descuento no puede bajar de ahí.** El sistema lo rechaza: «De "GRANZÓN" no se vende por debajo de … por TON. Con el descuento queda en ….»
- **Quien tiene la casilla de vender bajo el mínimo sí puede**, y es la misma casilla que deja dar un renglón **Sin cargo**. El sistema no le pide explicación aparte: si un descuento excepcional tiene que quedar justificado, se escribe en la **Observación** del documento.

La comparación se hace **pasando los dos importes a dólares con la tasa del día del documento**, para que un mínimo fijado en dólares siga siendo comparable con un precio en bolívares.

Y una consecuencia del reparto de permisos: **poner precios exige el control total sobre Ventas**, así que quien despacha no puede mover el suelo para poder bajarlo.

#### El límite de crédito, y cuándo se aplica

El límite se fija en la ficha del cliente, en dólares, y **solo aparece si su condición de pago no es De contado**.

**El límite no se comprueba al cotizar ni al pedir el despacho. Se comprueba al emitir la factura**, y solo si esa factura va a crédito. Conviene tenerlo presente: se puede despachar material a un cliente que después no va a poder facturarse a crédito, y a esas alturas el camión ya salió. Si un cliente anda al tope, revise su columna **Deuda** antes de despachar.

Al emitir hay dos rechazos distintos:

- **Sin límite fijado, no hay crédito.** El sistema dice «A "ACME C.A." no se le tiene autorizado crédito. Fije su límite o factúrele de contado.» Un límite en cero no significa crédito ilimitado: significa que no se le vende a crédito.
- **Con la factura por encima del límite**, el sistema dice cuánto quedaría debiendo y cuál es su tope: «Con esta factura "ACME C.A." quedaría debiendo … $ y su límite es … $.» Solo lo puede pasar quien tenga el control total sobre Facturación, porque pasarse del límite es ampliar el crédito.

La deuda del cliente y su límite **se llevan siempre en dólares**, igual que el saldo de las facturas, porque una factura en dólares se abona con transferencias en bolívares más de lo que se cree, y restar bolívares de dólares no se puede.

#### Dos personas trabajando a la vez

Un día de mucho movimiento hay varias personas en el sistema, y dos pueden tocar lo mismo en el mismo instante. **El sistema cierra la puerta antes de mirar**: en cuanto alguien empieza una de estas operaciones, aparta ese documento —ese despacho, esa nota, esa casilla de patio y artículo— y **el resto espera su turno**. Cuando le llega el turno al segundo, lo que ve ya no es el estado viejo: es el que dejó el primero. La espera dura un instante; no se nota.

**Quien pierde la carrera** no ve un error raro ni una pantalla en blanco. Ve un mensaje que le dice qué pasó mientras tanto:

| Lo que pasó al mismo tiempo | Lo que ve el segundo |
| --- | --- |
| Otra persona aprobó, no aprobó o canceló ese despacho | «El despacho SD-2026-0001 ya no está esperando aprobación.» |
| Otro camión se llevó ese material | «En "PATIO PRINCIPAL" hay … de "GRANZÓN" y se están despachando ….» |
| Otra nota tomó ese mismo pesaje | «El ticket … está ….» |
| Otra nota tomó esa misma guía | «La guía … está ….» |
| Otra persona ya anuló esa nota | «La nota NE-2026-0007 ya estaba anulada.» |

Lo mismo vale para facturar y cobrar (capítulo 21). En todos los casos la regla es la misma: **lo que se ve rechazado no se hizo a medias, no se hizo.** Vuelva a mirar la lista, que se actualiza sola, y decida con lo que hay.

**Las pantallas de Ventas y de Facturación se refrescan solas.** Lo que registra otra persona aparece sin recargar nada: clientes, precios, cotizaciones, despachos, notas, facturas, cobros y existencias.

#### Los números de los documentos

Cada documento lleva su correlativo con el año: **COTV-2026-0001** las cotizaciones, **SD-2026-0001** los despachos pedidos, **NE-2026-0001** las notas de entrega, **FAC-2026-0012** las facturas y **COB-2026-0001** los cobros. **Se reinician cada enero.**

La factura lleva además un **número de control**, **00-00000034**, que es una serie aparte y **no se reinicia con el año**: sigue corriendo.

**Ningún documento se borra.** Uno equivocado se anula y **se queda con su número**, marcado como anulado y con el sello en el PDF. Un correlativo con huecos es lo primero que se pregunta en una revisión, y «se borró por error» no es una respuesta.

#### El IVA y la moneda

**El IVA se decide en cada documento**, con la casilla **Esta operación lleva IVA** y su **Alícuota (%)**, que arranca en la de la ficha de la empresa (13.2) y se puede cambiar para ese documento. En la cotización la casilla viene desmarcada; en la factura, lo que diga la ficha de la empresa (21.2). **La nota de entrega no lleva IVA**: lo decide la factura, si se factura.

Lo que más mueve el IVA:

- **Cliente exento**: la casilla **Exento de IVA** de su ficha hace que todos sus documentos salgan sin IVA.
- **Renglón exento**: la casilla **Exento de IVA** de cada renglón, en la cotización, lo deja fuera de la base imponible.
- **El flete suma a la base imponible.**
- **El IGTF** es otra casilla, **Esta operación lleva IGTF**, que arranca en el 3 % de ley y se calcula sobre el total con IVA. Una factura tiene que llevar IVA, IGTF o los dos.

Sobre la retención: cuando el cliente es agente de retención, el documento calcula la retención sobre el IVA y la muestra como dos líneas más: **Retención de IVA** y lo que queda por cobrar. **El sistema no emite un comprobante de retención aparte**: la retención sale como una línea dentro de la factura.

Sobre la moneda: cada documento **congela su tasa** al crearse. Sin la tasa del día, se valora con la última registrada; **sin ninguna tasa registrada no se emite nada**, ni cotización, ni nota, ni factura. El cobro se registra **en la moneda de la cuenta donde cayó el dinero**, no en la de la factura, y el sistema lo pasa a dólares para descontarlo del saldo. Por eso el saldo, la deuda y el límite de crédito van siempre en dólares.

### 10.11 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Su usuario no tiene acceso a ….» | Su permiso sobre Ventas o Facturación no llega al nivel que pide esa acción | Poner precios y dar crédito piden control total sobre Ventas; anular una nota, control total sobre Facturación (10.1). Pídalo a la administración, o que lo haga quien lo tenga |
| «Su usuario no tiene permiso para ….» | Falta la casilla de esa acción: aprobar despachos, vender bajo el mínimo… | Se da en la matriz de permisos (13.1) |
| «La razón social del cliente es obligatoria.» | Quedó vacía o con menos de tres letras | Escriba la razón social completa |
| «El documento "J-123" no es ni un RIF (J-12345678-9) ni una cédula (V-12345678). …» | La identificación está incompleta o mal escrita | Corríjala: una empresa con su RIF y el dígito del final; una persona sin RIF, con su cédula |
| «Ya hay un cliente registrado con el RIF J-12345678-9.» | Ese cliente ya está cargado | Búsquelo en la lista. Si está inactivo, ábralo y márquelo **Activo** |
| «El cliente "ACME C.A." está inactivo.» | Al cliente se le dio de baja | Actívelo desde su ficha, o elija otro cliente |
| «El precio tiene que ser mayor que cero.» | El precio quedó vacío o en cero | Escriba el precio de lista |
| «El precio mínimo (…) no puede ser mayor que el precio (…).» | El suelo quedó por encima del precio | Baje el mínimo o suba el precio |
| «Solo se le pone precio de venta a lo que se vende. «FILTRO DE AIRE» es INSUMO.» | Ese artículo no es producto ni servicio | Revise su categoría en el catálogo de artículos |
| «Solo lo que se lleva en metros cúbicos o en toneladas se vende también en la otra unidad.» | Se quiso poner precio en una unidad que ese artículo no admite | Póngale precio en su propia unidad |
| ««GRANZÓN» no tiene densidad: sin ella no se sabe cuánto sale del patio por cada TON.» | Para vender en la otra unidad hace falta la densidad | Póngasela en **Inventario › Catálogo de artículos** |
| «Un documento sin renglones no dice nada. Agregue al menos uno.» | No viajó ningún renglón | Revise que cada renglón tenga producto, cantidad y precio |
| «El artículo "GRANZÓN" está dado de baja y no se puede vender.» | El producto se desactivó en el catálogo | Actívelo en el catálogo, o venda otro |
| «La cantidad de "GRANZÓN" tiene que ser mayor que cero.» | Un renglón quedó en cero | Escriba la cantidad |
| «De "GRANZÓN" no se vende por debajo de … por TON. Con el descuento queda en ….» | El descuento deja el precio bajo el mínimo | Baje el descuento, o que lo guarde quien tenga la casilla de vender bajo el mínimo |
| «Dar «GRANZÓN» sin cargo lo autoriza quien pueda vender por debajo del mínimo.» | Se eligió **Sin cargo** sin tener la casilla | Elija otra condición, o que lo guarde quien la tenga |
| «Un renglón sin cargo dice por qué: «GRANZÓN» sale sin cobrarse.» | Falta el motivo del sin cargo | Escriba por qué sale sin cobrarse |
| «Escriba a cuánto se acordó «GRANZÓN». Si no se cobra, es sin cargo.» | El precio acordado quedó vacío | Escriba el precio, o elija **Sin cargo** |
| ««GRANZÓN» tiene precio de lista por TON: sale de lista o con descuento.» | Se eligió precio acordado en una unidad que sí tiene lista | Elija **De lista** o **Con descuento sobre la lista** |
| «No se cotiza con fecha futura.» | La fecha es de mañana o después | Corrija la fecha |
| «No hay tasa BCV registrada para el 04/08/2026 ni para ninguna fecha anterior. Regístrela en Sistema › Tasas de cambio.» | Falta la tasa | Regístrela en **Sistema › Tasas de cambio** y repita la operación |
| «La cotización COTV-2026-0007 ya está ….» | Otra persona ya la cerró | Vuelva a abrirla y mire el estado que tiene |
| «Falta el nombre del chofer.» / «Falta la cédula del chofer.» / «Falta la placa del vehículo.» | Al pedir el despacho faltó un dato del transporte | Complete los **Datos del despacho** |
| «Ese patio no existe o está cerrado.» | El patio elegido no está activo | Elija otro patio, o pida que lo activen |
| «El chofer … está deshabilitado en el catálogo.» / «El vehículo … está deshabilitado en el catálogo.» | Ese chofer o vehículo se desactivó | Elija otro, o actívelo en **Choferes / Vehículos** |
| «El despacho SD-2026-0001 lo pidió usted: lo aprueba otro usuario con permiso.» | Quien pide no aprueba | Que lo apruebe otra persona con la casilla |
| «El despacho SD-2026-0001 ya no está esperando aprobación.» | Otra persona lo aprobó, no lo aprobó o lo canceló | Mire la tarjeta: ya está resuelto |
| «Solo quien lo pidió puede cancelarlo.» | El despacho es de otra persona | Pídale a esa persona que lo cancele, o que quien tenga la casilla no lo apruebe |
| «Escriba por qué no se aprueba.» / «Escriba por qué se cancela.» | Falta el motivo | Escríbalo: lo lee quien lo pidió |
| «El almacén "PATIO SUR" está cerrado.» | Al aprobar, ese patio ya no estaba activo | Pida que lo activen, o que se pida otra vez desde otro patio |
| «En "PATIO PRINCIPAL" hay … de "GRANZÓN" y se están despachando ….» | Al aprobar, no había tanto material | Si en el patio sí está, falta registrar su entrada: cargue la producción o haga el conteo en **Inventario › Existencias** |
| «El ticket TCK-2026-0004 es de una entrada a la cantera, no de una salida.» | El pesaje elegido es de algo que llegó, no de algo que sale | Elija un pesaje de salida |
| «El ticket TCK-2026-0004 está ….» | Ese pesaje ya no está disponible: usado o anulado | Pida otra vez el despacho con un pesaje que siga sin usar |
| «El ticket TCK-2026-0004 se pesó para otro cliente.» | El pesaje se registró a nombre de otro cliente | Elija el pesaje correcto |
| «La guía GM-2026-0099 está ….» | Esa guía ya no ampara nada: usada o anulada | Elija otra guía, o despache sin ella |
| «La guía GM-2026-0099 venció el 02/08/2026.» | La vigencia terminó antes de la fecha del despacho | Elija una guía vigente, o despache sin ella |
| «La guía GM-2026-0099 se emitió para otro cliente.» | La guía tiene otro cliente puesto | Elija la guía de ese cliente, o una que no tenga cliente |
| «Escriba por qué se anula. Un despacho anulado sin motivo no se puede auditar.» | El motivo quedó vacío o muy corto | Escriba al menos cuatro letras que expliquen qué pasó |
| «La nota NE-2026-0007 ya estaba anulada.» | Alguien se le adelantó | La anulación ya está hecha |
| «La nota NE-2026-0007 ya está en la factura. Anule primero la factura.» | Esa nota ya se facturó | Anule la factura. La nota vuelve sola a **Despachada** |
| «Escriba por qué se edita la nota: queda en la bitácora.» | Falta el motivo de la edición | Escríbalo |
| «La nota NE-2026-0007 está anulada: no se edita, se rehace.» | Se quiso editar una nota anulada | Pida otro despacho |
| «La factura FAC-2026-0012 ya sacó el material del patio al emitirse: enlazarle esta nota lo contaría dos veces.» | Esa factura no admite notas | Deje la nota sin enlazar, o elija otra factura |
| «La nota NE-2026-0007 y la factura FAC-2026-0012 son de clientes distintos.» | La nota y la factura no son del mismo cliente | Elija una factura de ese cliente |
| «La factura FAC-2026-0012 se emitió a partir de la nota NE-2026-0007: para soltarla hay que anular la factura.» | Solo se suelta una nota de una factura sin nota | Anule la factura (21.2) |
| «Los camiones de la nota los pone quien escribe en Facturación, o quien generó la nota desde la salida.» | No tiene permiso para poner camiones en esa nota | Que los ponga quien escribe en Facturación |
| «La nota de salida NS-2026-0012 ya dejó su nota de entrega: NE-2026-0016.» | Esa salida ya tiene su nota | Use la que ya existe. Si está mal, anúlela y genere otra |

---

## 11. Nómina

La nómina es el registro de quién trabaja en la empresa, cuánto gana cada quien y cuánto se le pagó en cada período. De aquí salen los recibos de pago, la ficha del trabajador, su carnet y las constancias que pide un banco. Y de aquí sale también la cuenta de las prestaciones sociales de cada trabajador: cuánto lleva acumulado, cuánto se le ha adelantado y cuánto habría que pagarle si se fuera mañana.

Hay una idea que conviene entender antes de tocar nada, porque explica casi todo lo demás:

**Una nómina no se teclea: se arma sola con dos cosas.** La primera es la ficha del trabajador, que dice desde cuándo trabaja, cuánto gana y cómo se le paga. La segunda son las novedades del período: lo único que cambia de una quincena a otra —horas extra, faltas, un bono, la cuota de un préstamo—. El resto lo pone el sistema. La pantalla de novedades lo dice así: **Novedades del período: horas extra, faltas, bonos y descuentos. El resto lo calcula el sistema a partir del contrato.**

La segunda idea es la que evita que este módulo cueste dinero: **un período se abre, se calcula, se aprueba y se paga, en ese orden, y quien lo calcula no lo aprueba.** Hasta el momento de pagar, todo se puede rehacer. Después de pagar, nada. Esa frontera está explicada en 11.2 y en 11.12, y es lo primero que hay que aprenderse de este capítulo.

> **Qué calcula la nómina lo deciden los interruptores de los conceptos de ley**, en Parámetros de nómina (11.9). Lo pactado se calcula siempre: el sueldo de la ficha, los bonos y descuentos que se cargan a mano y las faltas injustificadas. Encima, cada concepto de ley se calcula solo si está encendido: el beneficio de alimentación aparte; el seguro social, el paro forzoso y el FAOV, cada uno con su retención y el aporte del patrono; los recargos de horas extra, nocturnas, feriados y descansos; el bono vacacional, y las prestaciones sociales, que apagadas quedan deshabilitadas. Con todos encendidos, la nómina calcula todo lo que cuenta este capítulo. Apagar uno no borra nada: al encenderlo vuelve su cálculo.

El menú **Nómina** abre con un **Tablero**: el estado del período en curso, cuánta gente hay activa y, en orden, lo que toca hacer —anotar las novedades, calcular la nómina, sacar los recibos—. Cada atajo lleva a su pantalla.

### 11.1 Quién entra y quién puede hacer qué

Hay dos puertas distintas, y en este módulo conviene no confundirlas.

La primera es **ver el módulo**. Depende del permiso sobre Nómina en la matriz de permisos (13.1). Sin él, el grupo Nómina no aparece en el menú; y si se llega por un enlace, sale una tarjeta con un candado: **Nómina no está a su alcance**, con **Su rol no tiene acceso a este módulo. Solicítelo a la administración.** y el enlace **Volver al panel**.

**Nómina es el módulo menos repartido del sistema, y es a propósito**: ver Nómina, aunque sea en lectura, es ver el sueldo de todo el mundo. Quién lo tiene se mira en la matriz.

La segunda puerta es **poder ejecutar cada paso**. Aquí no hay un nivel que registre y otro que consulte, como en inventario: cada paso lo hace un rol concreto.

#### Quién ejecuta cada acción

| Acción | Quién la hace |
| --- | --- |
| Crear y editar fichas de personal, y desincorporar | Recursos humanos |
| Cargar la foto, la firma y los papeles de la ficha | Recursos humanos |
| Crear y editar los cargos del tabulador, y **Sincronizar** | Recursos humanos |
| Cargar novedades del período | Recursos humanos |
| **Abrir período**, **Calcular** y **Anular** | Recursos humanos |
| Cargar o corregir una vigencia de un parámetro | Recursos humanos |
| Mover los interruptores de los conceptos de ley | Gerencia general |
| **Aprobar la nómina** | **Gerencia general, y nadie más** |
| **Devolver a calculada** una nómina aprobada | Gerencia general |
| **Poner la tasa y recalcular** | Recursos humanos o gerencia general |
| **Pagar** | **Recursos humanos o gerencia general** |
| Ver e imprimir recibos | Cualquiera que vea el módulo |
| Emitir y anular carnets | Quien tenga escritura sobre Nómina |
| Editar el organigrama | Quien tenga escritura sobre Nómina |
| **Cerrar trimestre** e **Intereses del mes**, en prestaciones sociales | Recursos humanos |
| **Cargar el corte**, **Anticipo**, **Liquidar** y **Pagar y dar de baja** | Quien tenga control total sobre Nómina |

El rol de administrador pasa por encima de todo lo anterior. Y donde dice «Recursos humanos», el sistema acepta también a quien tenga escritura sobre Nómina, aunque no tenga ese rol; la pantalla, en cambio, enseña los botones solo al rol, así que esa persona no los ve.

Las dos filas en negrita son el corazón del módulo. **Quien calcula la nómina no la aprueba**: recursos humanos calcula y la gerencia general aprueba, y ninguno de los dos puede hacer el paso del otro. Es lo que impide que una sola persona abra un período, se lo apruebe y saque el dinero.

Si se intenta un paso que no le toca, el sistema responde con el rol que sí puede hacerlo: «Esta acción la realiza: Gerente general. Su usuario no tiene ese rol.» No es una falla: es la respuesta correcta.

### 11.2 El ciclo de una nómina

Esta sección es el módulo entero. Si solo lee una parte del capítulo, que sea esta.

Los tres primeros pasos están en **Nómina › Nómina del período**, que tiene tres pestañas numeradas en el orden en que se hacen: **1 · Novedades**, **2 · Procesar** y **3 · Recibos**.

1. **Abrir período** — recursos humanos, en **2 · Procesar**. Se elige el tipo (**Semanal — 7 días**, **Quincenal — 15 días**, **Mensual — 30 días** o **Especial — días del calendario**), las fechas **Desde** y **Hasta** y, si se quiere, una **Descripción**. El período nace en borrador. *Se deshace:* sí, anulándolo.
2. **Cargar novedades** — recursos humanos, en **1 · Novedades**. Faltas, horas extra, bonos y descuentos. *Se deshace:* sí, se corrigen y se vuelven a guardar mientras el período esté en borrador o calculado.
3. **Calcular** — recursos humanos, desde la tarjeta del período. Genera los recibos y el período pasa a calculado. *Se deshace:* sí. Recalcular borra los recibos anteriores y los rehace enteros; no acumula ni deja nada a medias.
4. **Ver recibos** — cualquiera que vea el módulo, en **3 · Recibos**. Es el paso de revisión. No cambia nada.
5. **Aprobar la nómina** — **solo gerencia general**. El período pasa a aprobado y a recursos humanos le llega el aviso. *Se deshace:* sí. La gerencia puede **Devolver a calculada**, con un motivo, o recursos humanos puede anular el período.
6. **Pagar** — **recursos humanos o gerencia general**. Se elige de qué cuenta sale el dinero y se pulsa **Confirmar el pago**: queda una línea en el libro de tesorería. *Se deshace:* **no. Nunca. Por nadie.**

Los estados que se ven en la etiqueta de cada período, y la frase que el sistema pone debajo para decir qué toca ahora:

| Etiqueta | Qué toca hacer, según la propia pantalla |
| --- | --- |
| **Borrador · cargar novedades** | **Cargue las novedades del período —horas extra, faltas, bonos— y calcule.** |
| **Calculada · por aprobar** | **Revise los recibos. Al aprobar, la nómina queda lista para que tesorería pague.** |
| **Aprobada · por pagar** | **Se paga desde una cuenta y el saldo baja. Si la cuenta no tiene saldo registrado, sale igual y tesorería recibe el aviso.** |
| **Pagada** | **Cerrada. Los recibos quedan como comprobante.** |
| **Anulada** | El motivo que se escribió al anularla |

Aunque dos de esas frases nombran a tesorería, el pago lo registra recursos humanos o la gerencia general.

**Anular** es la marcha atrás del módulo, y solo funciona antes de pagar: se puede anular un período en borrador, calculado o aprobado, siempre escribiendo por qué, con al menos diez letras. El período no desaparece: queda a la vista con su motivo, porque una nómina que se deshace sin explicación es una nómina que nadie puede defender después.

Una nómina **pagada** no se anula, no se recalcula y su salida de dinero no se reversa. La única corrección posible es la que el propio sistema indica: **corregir la diferencia en el período siguiente**, como bono o como descuento.

### 11.3 Personal

**Nómina › Personal**

El registro de quién trabaja en la empresa: desde cuándo y cuánto gana. De la fecha de ingreso salen la antigüedad, el bono vacacional y las prestaciones, y la ficha de cada quien lleva su foto, su carnet y su constancia de trabajo.

Tiene tres pestañas: **Personal**, **Tabulador de cargos** (11.5) y **Carnets** (al final de este apartado).

#### Qué se ve

Arriba hay cinco botones. Para todos: **Informe**, el listado del personal en PDF, y **Planilla de ingreso**, la hoja en blanco para la entrevista. Solo para recursos humanos: **Pago bancario**, **Cargar por planilla** y **Nuevo trabajador**.

Debajo, el campo **Buscar** —por **Nombre, cédula, cargo o ficha**— y seis desplegables para filtrar: **Género**, **Estado civil**, **Carga familiar**, **Dependientes**, **Salud** y **Contratación** (nómina ordinaria o eventual). Con algún filtro puesto aparece **Limpiar filtros**, y debajo se lee por qué se está filtrando y cuántos se ven de cuántos. La casilla **Incluir a los desincorporados** viene **desmarcada**: la lista trae solo a quien está activo.

Si todavía no hay nadie cargado: **Sin personal registrado**, con **Sin trabajadores no se puede calcular una nómina.** y, para recursos humanos, **Cargar el primero**.

| Columna | Qué muestra |
| --- | --- |
| **Trabajador** | Apellidos y nombres, como enlace a su ficha. Si la persona ya no está, va la etiqueta **Desincorporado** y debajo, en pequeño, el motivo. Luego la cédula y el número de ficha y, si tiene almacenes o máquinas a su cargo, cuántos |
| **Cargo** | El cargo y, debajo, el departamento |
| **Ingreso** | La fecha de ingreso y, debajo, la antigüedad, o **hasta** la fecha de egreso. Si la fecha de ingreso no está confirmada, en su lugar sale **Por confirmar** |
| **Salario** | El monto con su símbolo y, debajo, la base y la frecuencia |

En cada fila hay un botón **Ficha** para todos, y para recursos humanos además el lápiz para editar y **Desincorporar** (solo si la persona está activa). Quien no tiene ese rol ve en su lugar la etiqueta **Activo**.

#### Cargar un trabajador

**Nuevo trabajador** abre un formulario en tres pasos. Bajo el título se advierte: **El número de ficha lo asigna el sistema al guardar: cuatro dígitos, correlativo.** Se avanza con **Seguir** y se vuelve con **Atrás**; el último paso cierra con **Crear ficha** —o **Guardar cambios**, al editar—.

Paso 1, **Datos personales** — **Lo que va en el carnet y a quién avisar si pasa algo.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Cédula** | Sí | Empieza en **V-**, con el ejemplo **V-12.345.678** |
| **RIF** | No | **Con su dígito verificador: V-12.345.678-9.** |
| **Nombres** y **Apellidos** | Sí | Sin ellos no se puede **Seguir**: **Faltan los nombres y los apellidos.** |
| **Fecha de nacimiento** | No | |
| **Género** y **Estado civil** | No | Empiezan en **Sin indicar** |
| **Nacionalidad** | No | Empieza en **VENEZOLANA** |
| **Grupo sanguíneo** | No | **Va en el carnet. En una emergencia es lo primero que se busca.** |
| **Teléfono** | No | Con el ejemplo **0412-5551234** |
| **Contacto de emergencia** y **Teléfono de emergencia** | No | |
| **Dirección** | No | |

Paso 2, **Datos laborales** — **De la fecha de ingreso salen la antigüedad, el bono vacacional y la liquidación.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Cargo del tabulador** | No | Empieza en **Fuera del tabulador**. Al elegir un nivel, la ficha toma su sueldo al guardar. Sin nivel, el sueldo se escribe a mano y no sube cuando suba el tabulador |
| **Cargo** | Sí | Con nivel del tabulador se bloquea: **Lo pone el tabulador.** Si el cargo no coincide con el del nivel, la pantalla lo dice y ofrece **Ponerlo como el tabulador** |
| **Departamento o frente** | No | |
| **Fecha de ingreso** | Sí | **De aquí salen la antigüedad y las prestaciones.** Sin ella y sin cargo no se puede **Seguir**: **Faltan el cargo y la fecha de ingreso.** |
| **Jornada** | — | **Diurna — 8 h**, **Nocturna — 7 h** o **Mixta — 7,5 h**. **Decide el valor de la hora y el tope de horas extra.** |
| **Días de utilidades al año** | No | Vacío, la nómina usa el mínimo cargado en **Parámetros de nómina** |
| **Formación y experiencia** | No | **Grado de instrucción**, **Última empresa donde trabajó**, **Cargo desempeñado**, **Tiempo en el cargo** y **Motivo de retiro** |

Paso 3, **Remuneración** — **Lo último. Al guardar, la ficha queda creada.**

| Campo | Detalle |
| --- | --- |
| **Salario estipulado** | **Por mes**, **Por día** o **Por hora** |
| **Monto** | **Es lo que recibe, todo incluido: de aquí salen el beneficio de alimentación y las retenciones de ley. Los bonos y las penalizaciones se cargan aparte, en cada período.** Con nivel del tabulador, la ayuda añade que cambiarlo deja la ficha desfasada hasta que alguien sincronice o corrija el nivel |
| **Moneda** | |
| **Frecuencia de pago** | **Semanal**, **Quincenal** o **Mensual** |
| **Forma de pago** | De los métodos de pago del sistema |
| **Banco**, **Número de cuenta** y **Tipo de cuenta** | Con transferencia. El banco es una lista cerrada, con el código delante: **0102 · BANCO DE VENEZUELA** |
| **Banco** y **Teléfono del pago móvil** | Con pago móvil |
| **Nota** | |

Cuando una ficha viene de la carga del libro de nómina y su fecha de ingreso nadie la ha revisado, el campo lo dice: **Esta fecha vino de la carga del libro de nómina y nadie la ha revisado. Corríjala: de aquí salen la antigüedad, el bono vacacional y la liquidación.** Mientras eso siga así, en la lista sale **Por confirmar** y no se le puede emitir una constancia de trabajo.

**Cargar por planilla** da de alta a toda la gente de una vez, o corrige las fichas que ya están. Es el mismo mecanismo que el del catálogo de artículos (7.10), con su plantilla de Excel y su vista previa antes de escribir nada; la columna que identifica a cada persona es la cédula.

#### Quién tiene cuenta en el sistema

En la columna del trabajador, junto al nombre, **a quien tiene cuenta le sale un iconito gris de persona**. Al pasar el ratón dice **Entra al sistema como** seguido de su usuario.

**A quien no tiene cuenta no le sale nada**, y es a propósito: de la plantilla, solo unos pocos entran al sistema. Marcar a la mayoría con un «no tiene» llenaría la lista de ruido. Es el espejo de lo que hace la lista de usuarios en Configuración (13.1).

#### Desincorporar a un trabajador

1. Pulse **Desincorporar** en su fila.
2. Escriba el **Último día trabajado**.
3. Escriba el **Motivo**. La ayuda dice: **De él dependen las prestaciones que le tocan. Si la ficha se cargó por error o está duplicada, escríbalo tal cual: es la forma de sacarla de la lista sin borrar nada.**
4. Pulse **Desincorporar**. El botón se enciende con la fecha y al menos cuatro letras de motivo.

La ventana lo resume: **Deja de entrar en las nóminas siguientes y queda marcado en la lista. Su historial se conserva entero: no se borra nada.** Y algo que la ventana no dice: **desincorporar no le cierra la entrada al sistema.** Si la persona tenía usuario, se inactiva aparte, en **Configuración › Usuarios y roles** (13.1); la tarjeta **Cuenta del sistema** de su ficha dice cuál era (11.4).

**Desincorporar aquí no le calcula la liquidación, y además cierra la puerta para calcularla.** La liquidación se hace en **Nómina › Prestaciones y parámetros › Prestaciones sociales** (11.10), y esa pantalla solo deja liquidar a quien está activo. Si se desincorpora primero, la persona queda con su saldo de prestaciones a la vista y sin forma de cerrarle la cuenta. El sistema no avisa de esto.

Por eso, **cuando alguien se va, el orden es liquidarlo primero en Prestaciones sociales**: el botón que paga la liquidación desincorpora a la persona por su cuenta, con la fecha y el motivo. **Desincorporar** aquí queda para cuando no hay nada que liquidar.

#### Reincorporar a un trabajador

En la ficha de quien está desincorporado, junto a **Editar datos**, aparece **Reincorporar**.

1. Pulse **Reincorporar**.
2. Escriba el **Motivo** —«vuelve a trabajar», «egreso cargado por error»—. La ayuda dice: **Queda en la auditoría.**
3. Pulse **Reincorporar**. El botón se enciende con al menos cuatro letras de motivo.

La ventana lo resume: **Vuelve a entrar en las nóminas siguientes. La antigüedad sigue contando desde su ingreso de siempre.** Deshace exactamente lo que escribió **Desincorporar** —el estado, el último día trabajado y el motivo del egreso vuelven a quedar en blanco— y nada más: no inventa un ingreso nuevo, no toca ningún recibo ya emitido —cada uno ya dice si esa persona estaba de baja el mes en que se calculó, y eso no cambia— y, si tenía usuario, tampoco se lo reactiva: eso sigue haciéndose aparte, en **Configuración › Usuarios y roles** (13.1).

#### Las fichas no se borran

**No existe forma de borrar una ficha de personal.** «Nunca cobró por el sistema» no significa «nunca trabajó aquí»: puede que su nómina no se haya procesado todavía, que se le pagara por fuera, o que la ficha se cargara ayer.

**Una ficha cargada por error también se desincorpora.** Se escribe el motivo tal cual —«cargada por error», «duplicada de la ficha 0012»— y desaparece de la lista de activos, que es todo lo que se quería. La diferencia con un borrado es que dentro de un año se puede leer qué pasó. Si algo intenta borrar una ficha, el sistema responde: «Las fichas de personal ya no se borran: se desincorporan. Use "Desincorporar" con la fecha y el motivo —"cargada por error" también es un motivo—, y … deja de salir entre los activos sin que se pierda lo que decía su ficha.»

#### El informe de personal

**Informe** saca un PDF con quién trabaja aquí: ficha, nombre, cédula, cargo, departamento y desde cuándo. Sin montos ni datos personales.

Que no lleve sueldos no es un olvido. Un listado de quién trabaja aquí se enseña, se pega en una pared, se le manda a un inspector; los sueldos no. Por eso hay dos papeles: este y el del cierre de nómina (11.8), que sí los lleva.

**Directorio con fotos**, solo para el administrador, saca el mismo tipo de lista pero con la foto de cada quien al lado de lo básico —ficha, cédula, cargo, departamento y desde cuándo—. Las fotos se bajan del almacén una por una mientras se arma el PDF, y el botón lo dice: **Cargando fotos… 8/22**. A quien no tiene foto cargada le sale el recuadro vacío con **Sin foto**: no se inventa una cara. Los dos papeles toman la misma gente que esté filtrada en pantalla en ese momento.

**El papel sigue a la pantalla.** Lleva lo que la lista enseña: si **Buscar** dice «mantenimiento», sale el informe de mantenimiento; y los desincorporados salen, en su propio apartado con su fecha de salida y su motivo, solo si **Incluir a los desincorporados** está marcada. Arriba, en **Alcance**, el papel dice qué filtro se aplicó, cuántos hay en nómina y cuántos desincorporados.

Se abre en el visor antes de guardarse, como todos los papeles del sistema. **Para una sola persona**, el botón está en su ficha (11.4).

#### La planilla de ingreso y el pago bancario

**Planilla de ingreso** saca la hoja que se llena a mano durante la entrevista: **Sale en blanco, para llenarla a mano durante la entrevista.** Antes pregunta si lleva un recuadro para la **huella del pulgar** al lado de las firmas —**Sin huella** o **Con huella**—, y junto a ella sale la hoja de documentos que se le piden al aspirante. Esa lista se cambia ahí mismo, en **Documentos requeridos**, con la casilla de editar los parámetros de nómina.

**Pago bancario**, para recursos humanos, saca un PDF con los datos bancarios y el monto de cada trabajador del período que esté calculado o aprobado: es lo que se lleva al banco.

#### La pestaña Carnets

**Nómina › Personal › Carnets**

Responde a una sola pregunta: **quién tiene carnet emitido y quién no**. Emitir el carnet de veintidós trabajadores desde la ficha de cada uno son veintidós visitas a veintidós pantallas; aquí se hace de una vez.

| Tarjeta | Qué trae |
| --- | --- |
| **N sin carnet** | Los que faltan, con su ficha y su cargo, y **· sin foto cargada** si no la tienen. Arriba, el botón **Emitir los N**. Si no falta nadie: **Sin carnets pendientes** |
| **N no se pudieron emitir** | Solo si alguno falló, con el mensaje de cada uno. Se reintentan pulsando otra vez, o desde su ficha |
| **N con carnet** | Los que ya lo tienen, con su código y la fecha en que se emitió |

**Emitir los N va de uno en uno, aunque el botón sea uno solo, y se ve avanzar.** Cada carnet lleva la foto de esa persona, recortada con su propio encuadre, y eso ocurre en el navegador. **No cierre la pestaña a media faena**; si se corta, los que ya salieron quedan emitidos y los demás siguen en la lista. A quien no tiene foto se le emite igual, sin ella.

**Aquí solo se emiten los que faltan.** El pie lo dice: **Aquí solo se emiten los que faltan. Reemitir a alguien que ya tiene anula su carnet actual, y eso se hace en su ficha, diciendo por qué.** Un botón de «reemitir a todos» convertiría en un clic el anular veintidós plásticos que están en veintidós bolsillos.

**Quién puede emitir:** quien tenga escritura sobre Nómina. La pantalla enseña el botón a recursos humanos, a la administración y a la gerencia general; si la gerencia no tiene escritura sobre Nómina, cada carnet le falla.

**La pestaña solo cuenta al personal activo.** A quien se desincorporó no se le emite carnet y no aparece en ninguna de las listas.

### 11.4 La ficha del trabajador

**No está en el menú.** Se llega pulsando el nombre de la persona en la lista de **Personal**, o desde la tabla de fichas desfasadas del tabulador.

Es la pantalla donde se ve de un vistazo todo lo de una persona y **desde donde salen sus documentos**.

#### Qué se ve

Arriba, el nombre completo y, debajo, el número de ficha, el cargo y el departamento. A la derecha, la etiqueta **Activo** o **Desincorporado** —la misma que en la lista—, **Eventual** si lo es y, solo para recursos humanos, el botón **Editar datos**, que abre el formulario de Personal con esa persona cargada.

A la izquierda, **la foto**. El recuadro tiene la proporción del carnet y, si no hay foto, dice **Sin foto**. Recursos humanos la carga así:

1. Pulse **Cargar foto** —o **Cambiar foto**, si ya hay una—.
2. Mueva la barra de acercamiento y arrastre la foto. La ayuda lo explica: **Arrastre para centrar la cara sobre la línea.** Hay una guía punteada que marca dónde debe quedar.
3. Pulse **Guardar el encuadre**.

Para quitarla, **Quitar**. La foto tiene que ser JPG, PNG o WEBP; si pesa demasiado, el sistema responde **El archivo supera el tamaño admitido. Redúzcalo.**

A la derecha están los datos, agrupados y **de solo lectura**. Son los mismos que salen impresos en la ficha, escritos una sola vez a propósito, para que la pantalla y el papel no puedan decir cosas distintas.

| Bloque | Qué trae |
| --- | --- |
| **Identificación** | **Cédula**, **RIF**, **Fecha de nacimiento**, **Edad**, **Grupo sanguíneo**, **Género**, **Nacionalidad**, **Estado civil** |
| **Contacto** | **Teléfono**, **Contacto de emergencia**, **Dirección** |
| **Datos laborales** | **Cargo**, **Departamento**, **Fecha de ingreso**, **Antigüedad**, **Jornada**, **Utilidades** |
| **Remuneración** | **Salario**, **Frecuencia**, **Forma de pago**, **Cuenta** |
| **Egreso** | Solo si se desincorporó: **Último día trabajado** y **Motivo** |
| **Formación y experiencia** | Solo si consta algo: grado de instrucción, última empresa, cargo, tiempo y motivo de retiro |
| **Observaciones** | Solo si la ficha tiene una nota |

Lo que no tiene dato sale con un guion. Para cambiar cualquiera de estos datos hay que ir a **Editar datos**: aquí no se escribe.

Debajo de los datos van, en este orden, la firma, el carnet, los documentos, la cuenta del sistema, los papeles y el resto de tarjetas de la persona. Casi todas las escribe recursos humanos; los demás las leen.

#### Su firma

**Su firma** la guarda recursos humanos, no el trabajador: el obrero no entra al sistema, así que se carga con él delante. **Sale impresa en sus recibos de pago y en lo que se le entregue firmado.**

Se traza en pantalla, se escribe o se carga una foto de la que firmó en papel. Recursos humanos tiene además un interruptor, **En uso** o **Sin usar**: apagada, la firma sigue guardada pero los papeles salen con la raya en blanco. Es lo que permite tenerla apagada mientras se aclara algo, sin borrarla.

**Sirve para el recibo de pago.** Cuando el trabajador tiene firma guardada y en uso, **el recibo sale con ella estampada** sobre la raya de la izquierda (11.8).

#### El carnet

**El carnet es un documento que se emite, no una imagen que se baja.** El motivo es el QR: cada carnet lleva impreso en el reverso un código propio, distinto para cada persona, y ese código es el que abre la página que dice si el carnet sigue valiendo. Un código que no se ha emitido no verifica nada, y un reverso repetido haría que todos los carnets apuntaran a la misma persona al escanearlos.

**Solo hay un carnet vigente por persona.** Emitir uno nuevo anula el anterior, y por eso hace falta decir por qué.

**Quién puede emitir desde aquí:** recursos humanos y la administración. El resto ve la tarjeta y puede imprimir, pero no emitir. El sistema, por su parte, deja emitir a quien tenga escritura sobre Nómina.

##### Cuando todavía no tiene carnet

La tarjeta lo dice —**Sin emitir**— y explica lo que va a pasar: **Todavía no tiene carnet. Al emitirlo sale su PDF listo para la imprenta: dos páginas de 54 × 86 mm a 300 dpi, con el QR de verificación en el reverso.**

Se pulsa **Emitir el carnet**, se confirma, y el PDF se abre solo.

**Sin foto también se emite**, y conviene saberlo porque el botón no avisa: el carnet sale sin cara y **la página del QR no puede comparar a nadie**, que es para lo único que la foto está ahí. Cargue la foto antes.

**A quien ya no trabaja aquí no se le emite carnet.** La tarjeta lo dice: **Esta persona ya no trabaja en la empresa, así que no se le emite carnet. Si tenía uno, escanea como no válido.**

##### Cuando ya lo tiene

| Qué | Para qué sirve |
| --- | --- |
| **Código impreso bajo el QR** | El mismo que sale escrito en el plástico, en grupos de seis. Sirve para teclearlo a mano cuando el QR está rayado y no lee |
| **Adónde lleva el QR** | La dirección completa. **Copiar la dirección** la deja en el portapapeles |
| **Emitido el** | Fecha y hora |
| **Imprimir el carnet** | Vuelve a sacar el mismo PDF. **Esto no emite nada ni anula nada** |

**Imprimir es lo que se viene a hacer aquí casi siempre.** No hay ningún límite ni ningún registro por imprimir de nuevo; el código sigue siendo el mismo y el carnet que ya está en el bolsillo sigue valiendo.

##### Volver a emitir, y anular

Debajo hay dos botones, y solo los ve quien puede emitir:

- **Se perdió: anular y emitir otro** — emite uno nuevo con otro código. **El anterior queda anulado**, y si alguien lo encuentra y lo escanea, la página dirá que no vale. Hay que imprimir el nuevo: el código va dentro del QR y el plástico viejo no lo tiene.
- **Anular sin reemitir** — deja a la persona sin carnet vigente. Para cuando se desincorpora.

Las dos piden un **Motivo**. El de anular es obligatorio; el de reemitir, opcional. **Lo que se escriba ahí no sale publicado**: queda escrito para el día que alguien aparezca con ese carnet, y la página del QR no lo enseña.

Si hay carnets anulados, la tarjeta lista los últimos con su código, su fecha y su motivo. Sirve para cuando alguien aparece con un carnet que escanea como no válido y hay que responder de dónde salió.

Al pie de la tarjeta: **¿Hace falta una cara suelta para retocarla? el frente · el reverso, en PNG.** Son un apaño de taller, y nada más. **El carnet que se manda a la imprenta es el PDF**, que ya trae las dos páginas al tamaño y a la resolución que pide.

##### La página que abre el QR

Conviene saber qué enseña, porque quien la abre no es alguien de la empresa: es **un vigilante en un portón o un fiscal en la carretera**, con un teléfono en la mano y sin cuenta en el sistema. Está hecha para leerse en un teléfono, a pleno sol, en menos de tres segundos.

Lo primero y más grande es un sello con una sola palabra:

| Sello | Qué significa |
| --- | --- |
| **Vigente** | El carnet vale. La persona trabaja aquí |
| **Rechazado** | No vale. Debajo dice por qué: **Ya no trabaja aquí**, **Carnet anulado** o **Código desconocido** |
| **Sin señal** | No se pudo comprobar. Hay que volver a intentarlo |

**La foto va dentro del sello**, del mismo color, para que no se pueda leer «Vigente» y mirar una cara que no corresponde sin darse cuenta de que son dos cosas distintas. Si el carnet se emitió sin foto, lo dice: **Este carnet se emitió sin foto. Pida la cédula.**

Debajo, los datos: el nombre, el número de ficha, el cargo, la cédula, el departamento, **Trabaja aquí desde** y la edad; y el bloque **En caso de emergencia**, con el grupo sanguíneo, **Llamar a**, **Su propio teléfono** y la dirección. Al final, el código, que **debe coincidir con el impreso debajo del QR.** **Los teléfonos son enlaces**: se pulsan y el teléfono llama. Si alguien se accidenta en la carretera, quien encuentre el carnet no tiene que copiar un número a mano.

**A quien ya no trabaja aquí, la página no le publica más que lo justo**: ni departamento, ni antigüedad, ni edad, ni el bloque de emergencia. Lo dice: **No se publican más datos de quien ya no trabaja aquí.**

**Lo que nunca enseña:** el sueldo, la cuenta bancaria, las incidencias, y el motivo por el que se anuló un carnet anterior.

Si el QR está rayado y no lee, la dirección **/v** sin código abre la misma página con un campo para teclearlo. Acepta el código con espacios o sin ellos, y corrige las confusiones de siempre —una **O** por un **cero**, una **I** o una **L** por un **uno**—.

#### Los documentos

En la tarjeta de los documentos hay tres botones: **Ficha completa (PDF)**, **Constancia de trabajo** e **Informe de personal**.

**Los tres se abren primero en el visor**, con **Cerrar** y **Descargar** abajo, y nada se guarda hasta que se pulse **Descargar**. La ficha trae todos los datos en A4. La constancia es la carta que se entrega a un banco o a quien la pida, y el visor avisa: **La firma va a mano.** El informe es el resumen sin datos personales ni montos: la misma hoja que sale de la lista de personal (11.3), con una fila.

##### Emitir una constancia de trabajo

1. Pulse **Constancia de trabajo**.
2. Lea el párrafo que anticipa lo que dirá la carta: desde cuándo trabaja aquí y con qué cargo.
3. Decida si deja marcada la casilla **Incluir el sueldo**. Viene marcada, y debajo el sistema explica el criterio: **El banco lo exige; un arrendador no tiene por qué verlo.**
4. Pulse **Emitir**, revísela en el visor y pulse **Descargar**.

**No se puede emitir una constancia si la fecha de ingreso está sin confirmar.** El botón **Emitir** queda apagado y en su lugar aparece: **Falta confirmar la fecha de ingreso. La constancia declara desde cuándo trabaja aquí y sale firmada por la empresa: no se puede emitir con una fecha que nadie ha revisado.** Un aviso que se puede saltar con un clic se salta, y una constancia con una fecha inventada la firma la empresa. La fecha se corrige con **Editar datos**.

Si nadie ha cargado quién firma por recursos humanos, la ventana lo dice y la carta sale con el cargo y el renglón en blanco para firmar a mano. Eso se arregla en **Parámetros de nómina** (11.9).

##### Dos constancias, no una

**A quien ya no trabaja aquí, el botón pregunta primero qué papel se quiere.** Aparece el desplegable **Tipo** con dos opciones:

- **Constancia de trabajo** — **Acredita que trabajó aquí. Para un empleo nuevo, un banco.**
- **Constancia de cese de actividades laborales** — **Acredita que la relación laboral terminó. Para trámites.**

No son el mismo papel con otro título: se piden para cosas distintas, y de una misma persona se pueden querer las dos. A quien sigue activo no se le pregunta: no se le puede certificar un cese. La de cese añade una frase —«La relación laboral culminó en la fecha antes señalada»— y cierra diciendo para qué sirve: «para los fines legales que estime convenientes».

##### El motivo de la salida no se imprime salvo que se pida

Si la ficha tiene motivo de salida, aparece la casilla **Decir el motivo de la salida**, **y viene apagada**.

Está apagada a propósito. Este papel se lo lleva la persona, y «despido justificado» escrito en algo que va a enseñar en su próxima entrevista le hace un daño que la empresa no necesita hacerle. **La fecha de salida ya acredita el cese**, que es lo que se pide.

La casilla dice lo que va a pasar antes de que pase. Marcada: **Dirá «por despido justificado». Piénselo: el papel se lo lleva la persona.** Sin marcar: **La carta dirá cuándo terminó, no por qué.** Queda disponible para cuando de verdad haga falta —un trámite que lo exija—, y entonces es una decisión de quien firma, tomada a sabiendas.

Las constancias salen con la misma cabecera que la orden de compra, el recibo y la factura: la razón social, el RIF y **el domicilio fiscal completo**, tal como estén cargados en **Configuración › Datos de la empresa** (13.2). Lo que falte ahí, falta en el papel.

#### Cuenta del sistema

La tarjeta **Cuenta del sistema** dice **con qué usuario entra esta persona y qué puede hacer dentro**: el **Usuario**, cuándo se creó la cuenta y sus roles. Si la cuenta está desactivada, lo avisa.

**A quien no tiene cuenta no le sale la tarjeta.** Solo la ve, con **Atar una cuenta**, quien tiene la casilla de vincular cuentas, que es también quien la cambia o la desata. Atar no da ni quita permisos: **deja dicho que el trabajador de esta ficha y ese usuario del sistema son la misma persona**, y una cuenta es de una sola persona.

Es lo que hay que mirar **cuando alguien se va**: saber qué cuenta era suya es lo que evita que se quede abierta.

#### Los papeles que se adjuntan

La ficha guarda los papeles de la persona —la cédula, el RIF, el currículum y los que hagan falta— en la tarjeta **Papeles**, que se los agrega con **Agregar papel**. De cada uno se dice el **Tipo de documento**, un **Nombre**, el **Archivo** —PDF o foto, hasta 50 MB—, y si hace falta, **Emitido el**, **Vence el** y una **Nota**. Cada papel se abre con **Ver**.

**Falta la cédula** y **Falta el RIF** se avisan arriba de la lista. Son los dos que se piden para todo; que falte el currículum no detiene ningún trámite, así que no se convierte en un aviso que se aprende a ignorar.

**Lo que caduca se ve venir.** Cualquier papel con fecha de vencimiento lo dice cuando le quedan sesenta días o menos, y también si ya venció.

<p class="regla"><strong>Los archivos no tienen dirección pública.</strong> Se guardan en el mismo depósito privado que las fotos del personal, y el enlace para mirarlos <strong>caduca a los diez minutos</strong>. La cédula de un trabajador no puede quedar colgada de una dirección que se reenvía por WhatsApp.</p>

**Quitar un papel borra el archivo y no se recupera.** La fila se puede volver a subir; el escaneo, no. Por eso se pregunta antes.

**Quién puede.** Verlos, quien pueda ver el personal. Agregarlos y quitarlos, recursos humanos.

#### El RIF

**Es un campo aparte de la cédula, y opcional.** Se escribe en el formulario del trabajador, con su dígito verificador: **V-12.345.678-9**.

**El sistema no lo deduce de la cédula**, aunque en la mayoría de los casos sea la misma cifra con un dígito detrás. Ese dígito se calcula con una fórmula, quien tiene firma personal lleva **J** en vez de **V**, y un RIF que el sistema se invente termina impreso en una constancia que lee un banco. Se pide; no se adivina.

#### Las demás tarjetas

| Tarjeta | Qué guarda |
| --- | --- |
| **Condición de contratación** | El interruptor **Eventual**. **Quien es eventual no entra en las nóminas que corren solas. Se le paga abriendo un período especial.** |
| **Carga familiar** | **Quién es de su familia y a quién mantiene. Solo quien esté marcado cuenta como dependiente.** De cada familiar, nombres, parentesco, fecha de nacimiento —de ahí sale la edad—, cédula y si **depende económicamente del trabajador** |
| **Salud** | **Alergias, patologías y discapacidades declaradas. Solo lo ve quien pueda ver el personal.** Cada condición con su clase, desde cuándo y su descripción |
| **Préstamos** | **Lo que se le prestó y lo que le queda por pagar. Se cobra por nómina, o lo paga él.** Ver abajo |
| **A su cargo** | **Los sitios y las máquinas que tiene a su cargo. Al irse, esto es lo que hay que entregar.** |
| **Dotación** | **Lo que necesita por su rol: casco, botas, uniforme, equipo.** |
| **Asignación** | **Lo que se le dio para una faena concreta y hay que recuperar.** |
| **Incidencias** | **Lo que le pasó: enfermedad, lesión en labores, ausencia, conflicto.** |

##### Los préstamos

**Prestar** abre la ventana del préstamo: el **Monto**, la **Moneda**, las **Cuotas** y el **Motivo**. **Las cuotas que se pacten son una intención, no un calendario: lo que manda es el saldo.** La tarjeta dice cuánto debe, o **No debe nada**, y cada préstamo está **Vigente**, **Saldado** o **Anulado**.

Se cobra de dos maneras, y las dos bajan el mismo saldo: **Cobrar por nómina** —**Se carga al período de nómina abierto y baja el saldo, en el mismo acto.**— o **Registró un pago**, cuando él trae el dinero por fuera. El **Recibo** del préstamo **se imprime y se firma: quien recibe el dinero reconoce la deuda y autoriza el descuento.** **Solo se anula lo que no se ha empezado a cobrar.**

##### Dotación y asignación

**La diferencia entre dotación y asignación no es si vuelve, es para qué se le dio.** Una laptop es dotación y vuelve; unas mascarillas son dotación y se gastan; un kit de llaves para montar una banda es asignación. Si el bien vuelve o no lo dice cada artículo en el catálogo, en su **Modo de entrega** (7.8), y eso es un eje aparte.

Las dos tarjetas tienen las mismas columnas —**Artículo**, **Cantidad**, **Fecha** y **Estado**— y el mismo botón **Entregar**, que ven almacén y recursos humanos. Lleva a la pantalla de entrega de Asignaciones (18.3) con la persona ya puesta. Desde la ficha no se entrega nada.

| Estado | Qué significa |
| --- | --- |
| **Entregado** | Se gastó al usarlo. No hay nada que devolver |
| **Asignada** | Lo tiene, y se le va a pedir de vuelta |
| **Devuelta** | Ya volvió |
| **Perdida** | No apareció |
| **Dañada** | Volvió rota o dejó de servir |
| **Repuesta** | Trajo otra en su lugar |

Cuando no hay nada, cada tarjeta lo dice: **Sin dotación entregada.** y **No tiene nada asignado.**

##### Anotar una incidencia

Esta sí se registra desde la ficha, con **Anotar una**, que ve recursos humanos. La ventana dice: **Lo que pasó, cuándo y por qué. Queda en su ficha y en la de quien haya participado.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Fecha** | Sí | Viene la de hoy. No admite días futuros |
| **Tipo** | Sí | Empieza en **Ausencia justificada** |
| **Lugar** | No | Se pasa solo a mayúsculas |
| **Momento** | Sí | Empieza en **Todo el día** |
| **Días de reposo** | Según el caso | Solo aparece en **Enfermedad**, **Lesión en labores**, **Accidente común** y las dos ausencias. **Obligatorio si duró varios días.** |
| **Quién más estuvo** | No | Casillas con el resto del personal activo. **Sin nadie marcado queda como individual.** |
| **Motivo** | Sí | Mínimo cinco letras. Lo que se escriba aquí es lo que se va a leer dentro de un año |

Los ocho tipos son **Conflicto**, **Enfermedad**, **Lesión en labores**, **Accidente común**, **Ausencia justificada**, **Ausencia injustificada**, **Llegada tarde** y **Otra**. Los cinco momentos: **En la mañana**, **En la tarde**, **En la noche**, **Todo el día** y **Varios días**.

**Ojo con «Varios días».** Si se elige con un tipo que no pide días de reposo —**Conflicto**, **Llegada tarde** u **Otra**—, la ventana deja pulsar **Anotar** y el sistema lo rechaza con el aviso genérico **La base no admite ese valor. Revise los datos de la operación; si no escribió nada, avise a soporte.** Un hecho de varios días se anota con un tipo que admita días de reposo.

**Una incidencia con más de un implicado se anota una sola vez y sale en todas las fichas.** Al marcar a alguien en **Quién más estuvo**, la incidencia aparece también en su ficha, con **Anotada en la ficha de** y el nombre de la persona sobre la que se registró. Es lo que evita que un altercado entre dos se cuente como dos hechos distintos.

En la lista, cada incidencia se lee en una línea: la fecha, el tipo, el lugar, el momento, los días de reposo entre paréntesis si los hay, y quiénes estuvieron o **Individual**. Debajo, **Motivo:** con lo que se escribió. Si no hay ninguna, **Sin registros.**

**Ojo con la palabra «incidencia», que el sistema usa para dos cosas.** Aquí es *algo que le pasó a una persona*. En **Asignaciones › Incidencias** es *un bien perdido o dañado que sigue sin resolverse*. No se mezclan.

### 11.5 Tabulador de cargos

**Nómina › Personal › Tabulador de cargos**

La escala de sueldos de la empresa: cuánto gana cada cargo al mes. La pantalla lo resume: **Salario mensual de cada cargo. El quincenal se deriva de esa cifra y no se registra aparte.** Así las dos cifras no pueden desfasarse.

#### Qué se ve

Arriba, solo para recursos humanos, dos botones: **Sincronizar** y **Nuevo cargo**.

**Sincronizar está siempre visible**, tenga o no algo que hacer: un botón que solo aparece cuando hace falta no se puede encontrar cuando hace falta. Si hay fichas desfasadas, lleva pegada una etiqueta con cuántas son.

Debajo, también solo para recursos humanos, una de estas dos franjas:

- **Si hay fichas desfasadas**, la franja las lista una por una con las columnas **Trabajador**, **Cargo**, **Sueldo actual** y **Sueldo del tabulador**, y explica qué va a pasar: **Esto es lo que hará el botón Sincronizar de arriba: bajarles el sueldo y el nombre del cargo tal como están en la escala. Los recibos ya emitidos no cambian; una nómina en borrador sí tomará el sueldo nuevo cuando se vuelva a calcular.**
- **Si no hay ninguna**: **Todas las fichas coinciden con el tabulador. Al cambiar un sueldo, aquí se indica a quién afecta y de cuánto a cuánto.**

La escala tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Cargo** | El nombre y, debajo, cuántas personas activas hay en ese nivel, e **inactivo** si no está vigente |
| **Mensual** | Lo único que se guarda |
| **Quincenal** | Su mitad, calculada cada vez |

El pie lo vuelve a decir, porque es el punto de todo: **Solo se guarda el mensual. El quincenal es su mitad y se calcula cada vez.** Si la escala está vacía: **El tabulador está vacío**, con **Cargar el primer cargo**.

**El tabulador no lleva el beneficio de alimentación.** Es el mismo para toda la empresa, se carga una sola vez en **Parámetros de nómina** —con su fecha de vigencia y el decreto del que sale— y es de ahí de donde la nómina lo paga. Escrito también aquí, el día que cambiara el anuncio el tabulador seguiría enseñando el monto viejo.

#### Crear o editar un cargo

1. Pulse **Nuevo cargo**, o el lápiz de la fila que quiere cambiar.
2. Llene la ficha del nivel.
3. Pulse **Guardar**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Cargo** | Sí, mínimo tres letras | **Es el nombre con el que las fichas se enganchan a este nivel.** |
| **Sueldo mensual** | Sí | |
| **Moneda** | — | Empieza en dólares |
| **Quincena** | — | **Está bloqueada.** Se calcula sola mientras se escribe el mensual: **La mitad del mensual. Se calcula sola.** |
| **Orden en la lista** | No | **Menor sale primero. El tabulador se lee como una escala, no en alfabético.** |
| **Vigente** | — | Viene marcada |
| **Nota** | No | |

Debajo, una banda gris recuerda dónde está lo que no se escribe aquí: **Aquí solo va el sueldo. El beneficio de alimentación es el mismo para todos y se carga una sola vez en Parámetros de nómina.**, con enlace a esa pantalla.

El nombre del cargo **se guarda en mayúsculas y sin tildes**, y no se puede repetir: «Vigilante» y «VIGILANTE» acabarían siendo dos niveles distintos y nadie sabría cuál es el bueno. Si se repite, la pantalla dice **Ya existe un registro con ese dato, y no puede haber dos.**

#### Bajar los sueldos a las fichas

1. Cambie el sueldo del cargo y guarde.
2. Vuelva a la franja de desfase y **lea la lista**: dice a quién le toca, cuánto tiene y a cuánto pasa. Verde si sube, rojo si baja.
3. Pulse **Sincronizar**.
4. Lea el resumen. Si cambió algo, sale cuántas fichas se actualizaron, con **Estas personas cobran distinto a partir de la próxima nómina que se calcule.** y el detalle de cada una. Si no, **No había nada que sincronizar** y **Las fichas ya coincidían con el tabulador.**
5. Pulse **Entendido**.

**Sincronizar solo toca a las personas activas de los niveles vigentes**, y les deja la base de su salario en «por mes».

#### Quitar un cargo

**Un cargo con fichas enganchadas no se puede quitar**, y eso incluye a las personas desincorporadas que estuvieron en él. La ventana avisa si hay gente activa: **Hay 2 personas en este nivel. No se puede quitar con personas dentro. Muévalas antes, o desmarque «Vigente» para que deje de ofrecerse sin perder a quien está dentro.** Pero el botón **Quitar** no se apaga, y la pantalla cuenta solo a los activos: un nivel donde solo quedan desincorporados dice que no hay nadie, y al quitarlo responde **Eso está en uso en otra parte del sistema: no se puede borrar ni cambiar mientras algo dependa de ello.**

La salida buena es **desmarcar Vigente**. El nivel deja de ofrecerse al crear fichas nuevas, y quien está dentro sigue enganchado. **Pero deja de subir**: un nivel que no está vigente no sale en la franja de desfase y **Sincronizar** no lo toca. Si a esas personas hay que subirles el sueldo, se pasan a un nivel vigente.

### 11.6 Novedades del período

**Nómina › Nómina del período › 1 · Novedades**

Es la única pantalla donde se teclea algo cada quincena: **Novedades del período: horas extra, faltas, bonos y descuentos. El resto lo calcula el sistema a partir del contrato.** También se llega desde **Cargar novedades**, en la tarjeta de un período, y entonces llega con el período ya elegido.

#### Qué se ve

Arriba, el selector **Período**, que empieza en **Seleccione el período** y no lista los anulados. Al lado, la etiqueta de estado. Sin período elegido: **Seleccione un período** y **Las novedades se cargan sobre el período que se va a pagar.**

Si el período ya no admite cambios, lo dice: **Este período está en «aprobada · por pagar» y ya no admite cambios. Lo que se ve es lo que se usó para calcular.** —con su estado—. No es una falla: los recibos ya están emitidos con esos números, y cambiarlos ahora dejaría el papel diciendo una cosa y el sistema otra.

La pantalla trae a **la gente del período**, por fechas: quien entró o salió a mitad de período también está, porque se le paga lo que trabajó.

#### Las faltas, día por día

La tarjeta **Días de la quincena** es un calendario: **Señale los días que no trabajó. Un clic: no vino y se le descuenta. Dos: justificada, no descuenta. Tres: se limpia.**

1. Elija a la persona en la lista de la izquierda. Al lado de cada nombre, si las tiene, sus faltas sin justificar y justificadas.
2. Pulse cada día que faltó: una vez para **No vino · se le descuenta**, dos para **Justificada · no se descuenta**, tres para dejarlo limpio.
3. Si hace falta, escriba **Por qué faltó** en el día marcado. Queda dicho quién lo marcó.

Arriba se ven tres cifras: **Facturados**, **Laborados** y **A pagar**, que tienen en cuenta a quien entró o salió a mitad de período. Los días en que la persona no trabajaba aquí no se pueden marcar.

#### Las horas y los recargos

La tabla **Horas y recargos** —**Horas extra, nocturnas y días trabajados de descanso o feriado. Se guarda por trabajador; lo que no se toca queda en cero.**— tiene estas columnas:

| Columna | Qué se carga |
| --- | --- |
| **Trabajador** | Apellidos, nombres y cargo; debajo, los bonos y descuentos ya cargados y el enlace **Bono o descuento** |
| **HE diurnas** | Horas extra diurnas |
| **HE nocturnas** | Horas extra nocturnas |
| **H. nocturnas** | Horas trabajadas en horario nocturno |
| **Feriados trab.** | Días feriados trabajados |
| **Descansos trab.** | Días de descanso trabajados |

Se escribe en la fila de quien tuvo algo y se pulsa **Guardar** al final de esa fila. **Se guarda fila por fila**: lo que no se toca queda en cero, así que no hace falta pasar por todo el mundo. Las casillas admiten decimales y no admiten números negativos.

**Con los recargos apagados en los conceptos de ley** (11.9), la tabla se titula **Bonos y descuentos** y no trae las columnas de horas: **Esta quincena no calcula recargos: las horas extra, nocturnas, feriados y descansos no se cargan, y lo que haya que pagar de más va como bono. Las faltas se marcan en el calendario.**

#### Las vacaciones del período

Con el bono vacacional encendido en los conceptos de ley, aparece la tarjeta **Vacaciones del período**: **Quién estuvo fuera. Los días ya los paga el salario; la casilla decide si además lleva el bono.** Se elige al **Trabajador**, se escriben los **Días** y se pulsa **Anotar**. La casilla **Pagar el bono vacacional** de cada fila añade el bono; después **hay que recalcular** para que el recibo lo recoja.

#### Cargar un bono o un descuento

1. Pulse **Bono o descuento** bajo el nombre de la persona. La ventana explica qué va aquí: **Lo que no sale del contrato ni de las horas: una prima, un bono en divisas, la cuota de un préstamo.**
2. Elija el **Concepto**. La lista la lleva la empresa y se edita en **Bonos y descuentos** (11.11). Cada opción dice si suma o resta.
3. Escriba el **Monto**. Sin monto, **Agregar** queda apagado.
4. Elija la **Moneda**.
5. **Método de pago**. Empieza en **Como el resto de la nómina**, que es lo normal. Si ese bono se paga por otra vía —en efectivo cuando la nómina va por transferencia, por ejemplo—, se elige aquí.
6. **Fecha del pago**. Vacía: **Vacío: se paga con la nómina.** Con fecha: **Diferido: se paga ese día, no con la nómina.**
7. Escriba la **Nota**: **Aparece en el recibo**.
8. Pulse **Agregar**.

**Un bono diferido no sale marcado en el recibo.** Al poner fecha, el recuadro lo avisa: **El bono sale en el recibo como cualquier otra asignación, sin marca de pendiente. El día queda aquí: es lo que se consulta para saber qué falta por sacar de caja.** Un papel impreso que dice «pendiente» lo sigue diciendo el año que viene, cuando ya se pagó.

La fecha diferida **no puede caer antes de que cierre el período**: «La fecha de pago del bono (…) es anterior al cierre del período (…).» Un bono que se paga antes que el sueldo no es diferido, es un error de tecleo.

**Los bonos se cargan mientras la nómina está en borrador o calculada, y no después.** El cálculo solo rehace períodos en borrador o calculados, así que un bono cargado más tarde no lo recogería ningún recibo. **Ojo: con la nómina aprobada, la pantalla sigue ofreciendo Bono o descuento y la papelera**, y hasta avisa de que lo que cambie ahí cambia lo que se paga. **No es así**: el sistema rechaza el bono —«El período está en "APROBADA" y ya no admite cambios.»— y la papelera no hace nada. Para tocar una nómina aprobada hay que devolverla primero a calculada (11.7).

**Cuidado con el concepto de anticipo de prestaciones, si la lista lo tiene.** Un anticipo de prestaciones se registra en **Prestaciones sociales** (11.10), y allí es donde baja el saldo de la persona y sale el dinero de la cuenta. Si además se carga aquí como descuento, se le descuenta dos veces. El sistema no avisa de esa duplicación, así que conviene decidir por cuál de las dos vías se hace y no mezclarlas.

Para quitar un bono, la papelera que tiene al lado. **Se borra al instante, sin pedir confirmación.**

Un monto en dólares se pasa a bolívares con la tasa del período, no con la del día en que se teclea.

### 11.7 Procesar nómina

**Nómina › Nómina del período › 2 · Procesar**

Es la pantalla donde vive el ciclo completo: **Períodos de nómina: apertura, cálculo, aprobación y pago, en ese orden. Cada paso registra quién lo ejecutó.**

Se ve una tarjeta por período, con su número —**NOM-2026-0001**, que se reinicia cada año—, sus fechas, su etiqueta de estado, la frase de qué toca hacer ahora y, cuando ya hay recibos, cuatro cifras: **Recibos**, **Asignaciones**, **Deducciones** y **Neto a pagar**. Si todavía no hay ninguno: **Sin períodos registrados**, **La nómina comienza con la apertura del período a pagar.** y **Abrir el primero**.

Los botones de cada tarjeta cambian según el estado y según el rol:

| Botón | Cuándo aparece | Quién lo ve |
| --- | --- | --- |
| **Cargar novedades** | Borrador o calculada | Recursos humanos |
| **Calcular** | Borrador o calculada | Recursos humanos |
| **Ver recibos** | Cuando ya hay recibos | Cualquiera |
| **Aprobar la nómina** | Calculada | Gerencia general |
| **Pagar** | Aprobada | Recursos humanos o gerencia general |
| **Devolver a calculada** | Aprobada | Gerencia general |
| **Anular** | Borrador, calculada o aprobada | Recursos humanos |

En un período anulado no sale ningún botón.

#### Abrir un período

1. Pulse **Abrir período**. Se abre **Abrir un período**.
2. Elija el **Tipo**: **Semanal — 7 días**, **Quincenal — 15 días**, **Mensual — 30 días** o **Especial — días del calendario**.
3. Escriba **Desde** y **Hasta**.
4. Escriba la **Descripción**, si quiere. Es el nombre con el que se lo va a reconocer después.
5. Pulse **Abrir**.

Lo que hay que saber antes de pulsar:

**El período trae los conceptos de ley que rijan el día que cierra.** No se eligen en esta ventana: los deciden los interruptores de **Parámetros de nómina** (11.9). Con las fechas puestas, la ventana lo dice —**Además de lo pactado, este período calculará: …**, o **Este período calculará solo lo pactado: el sueldo de la ficha, los bonos y descuentos, y las faltas.**— y añade: **Son los conceptos de ley que rigen el día que cierra; se cambian en Parámetros de nómina y se guardan al calcularlo.**

**Los días que se pagan no son los del calendario.** La ayuda del tipo lo explica: **Los días que se pagan no son los del calendario: el mes son 30, tenga 28 o 31.** Si las fechas abarcan otro número de días, la ventana avisa de que pagará igual: las fechas sirven para prorratear a quien entra o sale a mitad de período, y para que dos nóminas no se pisen.

**Dos períodos no pueden solaparse si son del mismo tipo, y un Especial no puede solaparse con ninguno**, porque dos nóminas sobre los mismos días pagarían dos veces.

**Cada período paga a quien cobra con su frecuencia.** Un período quincenal hace recibos a quien cobra quincenal; uno especial, a todos. Quien está marcado **Eventual** no entra en las nóminas ordinarias: se le paga abriendo un especial.

#### Calcular

Pulse **Calcular**. El sistema genera los recibos y el período pasa a calculado.

**Recalcular no acumula: borra los recibos del período y los vuelve a hacer enteros.** Se puede recalcular cuantas veces haga falta mientras el período esté en borrador o calculado: quien corrige una hora extra mal cargada no tiene que adivinar qué quedó a medias.

Si a alguien las faltas sin justificar le dejan cero días pagados o menos, **esa persona no genera recibo**, y la pantalla de recibos lo avisa.

Si falta algún parámetro, el sistema no calcula a medias: se detiene y dice cuál falta.

**Si los conceptos de ley cambiaron después de calcular**, la tarjeta lo dice —qué se encendió o se apagó— y pide **Vuelva a calcularla antes de aprobarla.** No se deja aprobar hasta recalcularla.

#### La tasa del período

La ventana de abrir dice **La tasa del BCV se congela al abrirlo.**: el período toma la tasa del día en que cierra, o la última publicada si ese día no ha llegado. Todo lo que se calcula usa esa tasa: los montos en dólares de las novedades y el equivalente en dólares de los recibos.

**Pero el pago se hace con la tasa del día en que sale el dinero.** Si la tasa del período ya no es la de hoy, la tarjeta avisa con las dos cifras y cuánto le descontaría o le sumaría a cada trabajador pagarla así, y ofrece **Poner la tasa y recalcular**: **Los recibos se rehacen con la tasa del día que elija. Si la nómina estaba aprobada, sigue aprobada.** Se elige la **Tasa del día** —**El día en que salió el dinero.**— y se pulsa **Recalcular**. Sin tasa registrada para ese día no se puede: hay que cargarla antes en **Sistema › Tasas de cambio** (5).

**El sistema no deja pagar con una tasa vieja.** Si se intenta, responde con las dos tasas y cuánto se le descuenta a cada trabajador, y pide actualizar la tasa del período, volver a calcular y a aprobar.

#### Aprobar la nómina

Lo hace **gerencia general** —y la administración, que pasa por encima de todo—. **Es de las pocas acciones que no tienen otra puerta**: aprobar una nómina no se delega por nivel de permiso. Solo se aprueba una nómina calculada, y solo si tiene recibos.

Al aprobar, a recursos humanos le llega el aviso **Nómina NOM-2026-0001 aprobada**, con cuántos recibos son, por cuánto, y que está lista para pagar.

**Devolver a calculada** es la marcha atrás de la aprobación, y también es de la gerencia: **Vuelve a admitir cambios y habrá que aprobarla otra vez. Los recibos y sus montos no se tocan.** Pide un **Motivo** de al menos diez letras, que **queda en la notificación y en la auditoría**, y quién la aprobó y cuándo dejan de constar. Para actualizar solo la tasa no hace falta devolverla: el refresco la deja aprobada.

#### Pagar

Lo hacen **recursos humanos y la gerencia general**.

1. Pulse **Pagar**. Se abre **Pagar la nómina** con su número, cuántos trabajadores y el neto.
2. Elija la **Cuenta** de la que sale el dinero. La lista muestra el saldo de cada una.
3. Escriba la **Referencia**, si la tiene.
4. Escriba la **Fecha del pago**. La ayuda dice **Vacío es hoy.** No se acepta una fecha futura ni una anterior al cierre del período: adelantar dinero es un anticipo, y lleva su propio registro.
5. Pulse **Confirmar el pago**.

La ayuda de la cuenta explica qué pasa si se paga desde una cuenta en divisas: **Los recibos están en bolívares. Desde una cuenta en divisas sale el equivalente a la tasa del período, la misma con la que se calculó.**

Al confirmar, queda una línea de egreso en el libro de tesorería con el concepto **Nómina NOM-2026-0001 — 12 trabajadores**, y les llega un aviso a la gerencia general, a recursos humanos y a compras.

**La nómina no espera al saldo.** Si la cuenta elegida no tiene fondos registrados —porque falta el saldo de apertura o un ingreso—, el pago sale igual: la cuenta queda en negativo y llega un segundo aviso que nombra la cuenta que quedó en negativo y la nómina que la dejó así, con las dos cifras y el camino para arreglarlo desde Bancos y cajas. El dinero a la gente —nómina, liquidación y anticipo de prestaciones— no se detiene por un saldo sin registrar.

**Antes de pulsar Confirmar el pago, lea 11.12.** Este botón es el punto de no retorno del módulo.

#### Anular

1. Pulse **Anular**. Se abre la ventana con el número del período: **El período queda a la vista con su motivo. Una nómina pagada no se puede anular.**
2. Escriba el **Motivo**: **La nómina es un documento con consecuencias legales.** El botón se enciende con diez letras.
3. Pulse **Anular**.

### 11.8 Recibos de pago

**Nómina › Nómina del período › 3 · Recibos**

Aquí no se registra nada: **esta pantalla solo se lee y se imprime.** La pantalla explica por qué el recibo importa tanto: **Recibos de pago de nómina. Son la prueba legal del pago: sin recibo, en un juicio se presume cierto lo que alegue el trabajador.**

#### Qué se ve

Arriba, el selector **Período**, que empieza en **Seleccione el período** y **solo lista los períodos que ya tienen recibos**. Sin período elegido: **Seleccione un período** y **Los recibos aparecen cuando la nómina está calculada.**

Si nadie ha cargado quién firma por la empresa, aparece un aviso: **Falta decir quién firma por la empresa. Los recibos saldrían con ese renglón en blanco.**, con **Ponerlo ahora**, que lleva a donde se arregla.

Sobre la lista, cuántos recibos hay —**cada uno con su copia, para firmar a mano**—, el interruptor **Equivalencia en dólares** y dos botones: **Informe del período** e **Imprimir todos**. El informe va primero porque es lo que se mira al cuadrar; los recibos se imprimen cuando ya se cuadró. Si alguien del período no tiene recibo porque no le quedaron días que pagar, la pantalla lo nombra y recuerda que se revisa en Novedades.

| Columna | Qué muestra |
| --- | --- |
| **Trabajador** | Apellidos y nombres; debajo, la cédula y el cargo |
| **Días** | Los días pagados |
| **Asignaciones** | El total en bolívares |
| **Deducciones** | El total en bolívares |
| **Neto** | En bolívares y, debajo, el equivalente en dólares |

**Pulse en cualquier parte de la fila** para abrir el detalle. El icono de la impresora, en cambio, saca el papel directamente.

#### El detalle de un recibo

Arriba, los salarios diarios: **Salario básico diario**, **Salario normal diario** y **Salario integral diario**. Debajo, cuatro bloques, cada línea con su equivalente en dólares:

| Bloque | Qué trae |
| --- | --- |
| **Lo que se gana** | Lo que suma |
| **Lo que se descuenta** | Lo que resta |
| **Aportes del patrono** | **No se le descuentan al trabajador: son costo de la empresa.** |
| **Se aparta para prestaciones** | **Se acumula a su favor. No sale de su pago.** |

Al final, el **Neto a cobrar**, con su equivalente en dólares, y cómo se le paga.

Los dos últimos bloques son los que más confusión generan cuando alguien lee su recibo por primera vez. **Ni los aportes del patrono ni lo que se aparta para prestaciones salen de su pago**, y por eso en el papel van con el título completo —**APORTES DEL PATRONO — NO SE LE DESCUENTAN** y **SE APARTA A SU FAVOR — NO SALE DE SU PAGO**— y sin subtotal, para que nadie los sume al descuento.

**Se aparta para prestaciones** dice lo que se apartó **en ese período**. Lo que la persona lleva acumulado en total, con sus intereses y sus adelantos, está en **Prestaciones sociales** (11.10).

**El detalle enseña solo lo que la quincena calculó.** Los bloques sin líneas no aparecen: sin seguro social, paro forzoso ni FAOV no hay **Aportes del patrono**, y sin prestaciones no hay **Se aparta para prestaciones**. El **Salario normal diario** sale si se calculó el seguro social, el paro forzoso, el FAOV o las prestaciones; el **Salario integral diario**, si se calculó el FAOV o las prestaciones. Si no se calculó ninguno de ellos ni el beneficio de alimentación aparte, queda una sola cifra: **Salario diario**. El papel sigue la misma regla.

#### A quien se va se le paga, y el recibo lo dice

Quien se va a mitad de quincena **cobra los días que trabajó**. El sistema los prorratea solo: si el período va del 16 al 31 y la persona salió el 26, le pagan los días que estuvo, no la quincena entera ni cero.

**Su recibo lo dice.** Bajo el nombre, el papel lleva el distintivo **Desincorporado el 26/08/2026**, y los días son los prorrateados. La fecha del recibo **se congela el día que se calcula**: un recibo es un documento y dice lo que era cierto cuando se emitió.

#### El informe del período

**Informe del período** saca el papel que se archiva y se enseña: quién cobró, cuántos días, asignaciones, deducciones y neto, con el total al pie. Es el mismo papel que el informe de personal (11.3), con las cifras —y por eso mismo no se enseña fuera de administración—.

**Este papel no lleva cargo ni departamento, y es a propósito.** Los importes en bolívares necesitan sitio. Se conservó la cédula, porque quien lo revise lo va a cotejar contra los recibos.

Los que salieron dentro del período van en **su propio apartado**, con su fecha de salida y su motivo, y con su propio total.

**Para una sola persona**, el botón **Informe** está dentro del detalle del recibo. Sirve sobre todo para quien se fue. En **Alcance** dice, por ejemplo, **Solo 1 de 21 recibos del período**, para que nadie lo lea como si en esa quincena hubiera cobrado una sola persona.

#### Imprimir

**Imprimir recibo** en el detalle, el icono de impresora en la fila, o **Imprimir todos** para el período completo. El recibo se abre primero en el visor, y solo se descarga con **Descargar**.

**Cada recibo sale siempre por duplicado**: **Original — para la empresa** y **Copia — para el trabajador**, normalmente uno en cada hoja. Si caben en la misma, van separados por la línea **corte aquí**.

Cada copia trae el número del recibo, el nombre, la cédula, la ficha, el cargo, las fechas y los días —facturados, laborados y a pagar—; los salarios diarios que correspondan; los bloques que tengan líneas; la franja **NETO A COBRAR**; la declaración **Recibí conforme la cantidad indicada y estoy de acuerdo con los conceptos detallados.**; el renglón **Fecha de recibido:**; y dos firmas, la del trabajador y la de la empresa —estampadas, si están guardadas y en uso—. Al pie, la tasa BCV con la que se calculó.

Bajo el neto, con **Equivalencia en dólares** encendido, sale el equivalente en dólares con la palabra **referencia** delante. Es intencional: **no es lo que se paga, es lo que valía ese día.** Apagado, el recibo y el informe salen sin las cifras en dólares.

### 11.9 Parámetros de nómina

**Nómina › Prestaciones y parámetros › Parámetros de nómina**

Es la pantalla donde viven los porcentajes, los topes y los días con los que se calcula todo lo demás: **Parámetros legales de nómina, cada uno con su fecha de vigencia. Cambian por decreto.**

**Este manual no publica ningún valor.** Los que rigen hoy son los que estén cargados en esta pantalla.

#### Los interruptores de los conceptos de ley

Arriba está la tarjeta **Conceptos de ley**, con un interruptor por concepto. **La nómina siempre calcula lo pactado: el sueldo de la ficha, los bonos y descuentos, y las faltas. Encima calcula los conceptos encendidos, con los parámetros de abajo.**

| Interruptor | Qué calcula encendido |
| --- | --- |
| **Cestaticket aparte** | **El beneficio de alimentación va en su propia línea del recibo.** |
| **Seguro social (IVSS)** | **Retención al trabajador y aporte del patrono.** |
| **Paro forzoso (RPE)** | **Retención al trabajador y aporte del patrono.** |
| **Vivienda (FAOV)** | **Retención al trabajador y aporte del patrono, sobre el salario integral.** |
| **Recargos** | **Horas extra, bono nocturno, feriados y descansos trabajados, que se cargan en las novedades.** |
| **Prestaciones sociales** | **Lo que se aparta en cada recibo, y la pantalla de prestaciones.** Apagadas, esa pantalla queda deshabilitada |
| **Bono vacacional** | **Permite añadir el bono al recibo de quien sale de vacaciones. Los días no se pagan aparte: las faltas justificadas no bajan el salario, así que ya los cobra.** |

**El sueldo de la ficha sigue siendo lo que la persona recibe**: el cestaticket y las retenciones que estén encendidos salen de él, no se suman encima. Los recargos sí se suman, porque pagan horas de más.

**Solo los mueve la gerencia general**, y la administración; a los demás la tarjeta les dice **Estos interruptores los mueve gerencia general.** Moverlos no guarda nada: debajo aparece qué cambia —**Desde ese día se enciende…**, **…y se apaga…**— y el campo **Desde**, que propone el día siguiente al cierre de la última quincena calculada. **Guardar** lo deja escrito; **Descartar** los devuelve a como estaban. Si se enciende algo, la tarjeta recuerda: **Revise antes los parámetros de abajo: el salario mínimo o el cestaticket pueden haber cambiado.**

Lo que conviene saber:

- **Cada quincena se calcula con lo que rija el día en que cierra, y guarda con qué se calculó.** Mover un interruptor no cambia las quincenas ya calculadas.
- **No se puede poner una fecha dentro de una quincena ya aprobada o pagada**, ni por delante de un cambio ya programado. Si hay uno programado, la tarjeta lo dice.
- **Si una quincena calculada y sin aprobar queda del otro lado del cambio**, Procesar nómina lo avisa y no deja aprobarla hasta recalcularla (11.7).
- Los conceptos de ley **no aparecen en la lista de parámetros**, y desde ella no se pueden corregir, cerrar ni eliminar.

Debajo de la tarjeta, un aviso fijo: **El cestaticket y la base de la contribución de pensiones se anuncian sin publicarse en gaceta y cambian con frecuencia. Conviene revisarlos cada mes: una nómina calculada con el monto viejo se paga corta.**

#### La lista de parámetros

La lista trae **Parámetro**, **Valor**, **Rige desde** y **Fuente**, y **solo la vigencia más reciente de cada uno**. Si hay anteriores guardadas, el pie lo dice: **No se borran: son las que permiten recalcular una nómina vieja con las cifras que regían entonces.**

Cada valor se muestra según su unidad: con el símbolo de porcentaje, con **Bs** o **$** delante, o con **días**, **h** o **× salario mínimo** detrás.

#### Cargar o corregir un valor

Lo hace recursos humanos. **Nueva vigencia** abre la ventana en blanco; tocar una fila la abre con sus valores: **Toque cualquier parámetro para corregir su valor o abrirle una vigencia nueva.**

1. Elija el **Parámetro**. La lista **solo ofrece los que ya existen**: desde aquí no se inventan parámetros nuevos.
2. Escriba el **Valor nuevo**.
3. Revise la **Unidad** y la **Descripción**, que vienen rellenas con las del valor anterior.
4. Escriba **Rige desde**: **La fecha del decreto, no la de hoy: los períodos anteriores conservan el valor viejo.**
5. Escriba la **Fuente**: la gaceta o el decreto.
6. Pulse **Guardar**.

**La fecha decide qué se hace.** Con una fecha nueva, **no sustituye el valor anterior: lo cierra el día antes y empieza uno nuevo.** Con la misma fecha, corrige el que hay: **Misma fecha de vigencia: se corrige lo que hay, no se abre una vigencia nueva. Cambie la fecha si lo que quiere es que rija desde otro día.**

Al corregir hay dos botones más:

- **Dejó de regir hoy** cierra esa vigencia con la fecha de hoy.
- **Eliminar** la quita, para la vigencia que nunca debió existir. Solo se puede si ninguna nómina se calculó mientras esa cifra regía; si alguna lo hizo, el sistema lo dice con el número de la nómina.

#### Quién firma los recibos y las constancias

El nombre, el cargo y la cédula de quien firma por recursos humanos también se cargan aquí, como parámetros de texto. El día que cambie la persona, eso lo corrige recursos humanos desde su pantalla.

**El sistema trata el texto «Por definir» como si estuviera vacío.** Si el nombre del firmante dice eso, los recibos salen con el renglón de la firma en blanco, no firmados por alguien llamado «Por definir».

### 11.10 Prestaciones sociales

**Nómina › Prestaciones y parámetros › Prestaciones sociales**

Es la primera pestaña de **Prestaciones y parámetros**; las otras dos son **Parámetros de nómina** (11.9) y **Bonos y descuentos** (11.11). La cabecera la presenta así: **Prestaciones sociales acumuladas de cada trabajador por el tiempo de servicio.**

Es la cuenta de lo que la empresa le debe a cada trabajador por el tiempo que lleva trabajando aquí. Se lleva aparte de la nómina de la quincena porque no es dinero que se pague ahora: se acumula a favor del trabajador y solo sale de la empresa en dos momentos, cuando se le adelanta una parte y cuando se le liquida.

> **Con las prestaciones apagadas en los conceptos de ley (11.9), esta pantalla está deshabilitada.** En lugar de la lista dice **Las prestaciones sociales están deshabilitadas**, y debajo: **Están desactivadas en los conceptos de ley: no se liquidan, no se cierran trimestres, no se calculan intereses ni se otorgan anticipos. Lo registrado se conserva. Se habilitan activando Prestaciones sociales en Parámetros de nómina.**

**La fecha que cuenta es la de la operación**, no la de hoy: el último día del trimestre, del mes, el último día trabajado o el día del anticipo. Así que la pantalla puede estar encendida y, aun así, cerrar un trimestre o un mes en que las prestaciones estaban apagadas no se deja, y el sistema lo explica: «Las prestaciones sociales están deshabilitadas: el 30/06/2026 están apagadas en los conceptos de ley. Se vuelven a habilitar encendiendo Prestaciones sociales en los conceptos de ley, en Nómina › Parámetros de nómina.»

#### Lo que conviene entender antes de abrirla

Esta es la parte que hay que saber explicar cuando alguien se acerca a preguntar cuánto tiene acumulado.

**Lo que se le va acumulando se llama garantía.** Cada trimestre —cada tres meses del calendario— la empresa le abona a cada trabajador una cantidad de días de su salario integral. No se le pagan en la quincena: se le apuntan a su favor. Ese abono es el **depósito trimestral**, y se hace en esta pantalla con **Cerrar trimestre**.

**No es la misma cifra que la del recibo.** El recibo de cada quincena trae el renglón **Se aparta para prestaciones** (11.8): es lo que corresponde a ese período, calculado en cada recibo. El depósito del trimestre se calcula aparte, desde el último recibo del trimestre, y es el que suma a la cuenta de esta pantalla. Las dos cifras no tienen por qué coincidir.

**El día que cumple años de trabajo se le suman días adicionales**, que van creciendo año tras año hasta un tope. Se le abonan en el trimestre donde cae su aniversario.

**Cuántos días son, y de dónde sale cada número.** La pantalla enseña varios: la ventana de cerrar el trimestre habla de **quince días** y de **más de tres meses**; el anticipo, del **75%** de lo acumulado; la liquidación, de **30 días por año**. Solo uno de ellos se corrige desde una pantalla: los días del trimestre, que están en **Parámetros de nómina**, en el renglón **Días de garantía de prestaciones por trimestre**. Y aun ese tiene una trampa: **la ventana dice «quince» porque lo lleva escrito, no porque lo lea del parámetro.** Si el parámetro cambia, el cálculo usa el valor nuevo y la ventana sigue diciendo quince. Los demás —los días adicionales del aniversario y su tope, el tiempo mínimo de servicio, la parte que se puede adelantar y los días por año de la liquidación— van escritos por dentro del sistema: si la ley los cambia, hay que pedir que los cambien. En todos los casos, el valor bueno lo fija quien lleva la nómina junto con su asesor laboral o contable, con la gaceta delante.

**Los intereses son lo que produce ese dinero mientras está apartado.** Mes a mes, lo acumulado gana intereses a favor del trabajador. La ventana lo resume: **Corren sobre la garantía acumulada, a la tasa que publica el BCV.** Dos precisiones que ahorran discusiones: los intereses corren sobre la garantía menos lo que ya se le adelantó, medida al cierre de ese mes, y no sobre los intereses que ya se abonaron; y la tasa se escribe a mano cada mes, porque el sistema no la puede adivinar.

**Un anticipo es un adelanto de lo que ya tiene acumulado.** Es dinero que se le entrega hoy a cuenta de lo que se le debe. No es un préstamo y no se descuenta de la quincena: baja directamente el saldo de su cuenta de prestaciones. No se le puede adelantar todo, y de lo que se puede se resta lo que ya se le adelantó antes. Tampoco se adelanta para cualquier cosa; la ayuda del campo lo recuerda: **La ley permite adelantar para vivienda, salud, educación y pensión alimentaria.**

Los préstamos son otra cosa y viven en la ficha del trabajador, en su tarjeta **Préstamos** (11.4).

**La liquidación es la cuenta final**, la que se hace cuando la persona se va, y suma todo lo anterior más lo que le quede pendiente del último año trabajado.

#### Quién puede hacer qué aquí

| Acción | Qué permiso pide |
| --- | --- |
| Ver la lista y la cuenta de cada quien | El permiso sobre Nómina, el mismo del resto del módulo |
| **Cerrar trimestre** e **Intereses del mes** | Escritura sobre Nómina |
| **Cargar el corte**, **Anticipo**, **Liquidar** y **Pagar y dar de baja** | Control total sobre Nómina |

Los cuatro de la última fila piden el nivel más alto porque los cuatro mueven dinero o mueven la base con la que se calcula: el corte decide cuánto traía acumulado alguien de antes, y los otros tres sacan dinero de la cuenta de la empresa. Quien no tiene el nivel no ve el botón.

#### Qué se ve

Arriba a la derecha, dos botones: **Cerrar trimestre** e **Intereses del mes**.

Debajo, tres cifras:

| Tarjeta | Qué muestra |
| --- | --- |
| **Se les debe hoy** | La suma de lo que se le debe a todo el personal activo |
| **Anticipos** | La suma de lo que se les ha adelantado y está restando de sus saldos |
| **Sin corte cargado** | Cuántos trabajadores no tienen todavía su punto de partida. En rojo si hay alguno, en verde si no queda ninguno |

**Las dos primeras cifras salen partidas por moneda** cuando en la empresa hay sueldos en bolívares y sueldos en dólares: se muestran una al lado de la otra y no se suman. Sumarlas daría un número que no es ni bolívares ni dólares, y a qué tasa se convierten no lo puede decidir una pantalla.

**Las tres cifras cuentan solo a quien está activo.** La lista de abajo trae también a quien ya salió, más tenue.

Si falta algún punto de partida, aparece una franja de aviso: **Hay 3 trabajador(es) sin corte cargado. Mientras no lo tengan, su cuenta arranca en cero, sin lo que traían de antes. El corte se carga aquí: se pulsa la fila de cada uno y luego «Cargar el corte».** La ficha del trabajador no muestra nada de prestaciones.

Si no hay nadie cargado en Personal, la pantalla dice **Sin trabajadores** y **Las prestaciones se calculan sobre el personal cargado en Nómina.**

| Columna | Qué muestra |
| --- | --- |
| **Trabajador** | Apellidos y nombres y, debajo, el número de ficha y el cargo, más **egresado** si ya salió y **liquidado** si tiene una liquidación calculada o pagada |
| **Ingreso** | Su fecha de ingreso |
| **Garantía** | Lo acumulado: lo que traía del corte más lo abonado trimestre a trimestre |
| **Intereses** | Los intereses abonados a su favor |
| **Anticipos** | Lo que ya se le adelantó, en ámbar y con un menos delante. Una raya si nunca se le adelantó nada |
| **Saldo** | La garantía más los intereses, menos los anticipos. Es la cifra que se responde cuando preguntan |
| **Corte** | La fecha de su punto de partida, o la etiqueta **Sin corte** |

**Liquidado** sale en cuanto la liquidación se calcula, antes de pagarla. Y el **Saldo** de quien ya cobró su liquidación no baja: la lista lo sigue enseñando entero. Las tarjetas de arriba no lo suman, porque solo cuentan a los activos.

**Pulse en cualquier parte de la fila** para abrir la cuenta de esa persona.

#### La cuenta de una persona

Se abre pulsando su fila. Arriba, el nombre; debajo, la ficha, el cargo y desde cuándo trabaja.

Lo primero es el resumen de su cuenta: **Garantía acumulada**, **Intereses**, **Anticipos** y, separada por una línea, **Saldo**. Al pie, la pantalla dice hasta cuánto se le puede adelantar hoy: **Se le puede adelantar hasta 1.200,00 $ — el 75% de lo acumulado, menos lo ya adelantado.**

Más abajo, y solo si los tiene, aparecen dos listas:

- **Depósitos trimestrales**, uno por trimestre cerrado, con el año, el trimestre, los días que se le abonaron —y los adicionales, si le tocaron—, el salario integral diario con el que se calculó y el monto. Los marcados **estimado** son los que se calcularon desde la ficha por no haber recibos.
- **Anticipos**, cada uno con su número —**ANT-2026-0001**, que se reinicia cada año—, el motivo, la fecha, de qué cuenta salió y el monto.

Los depósitos y los anticipos anulados siguen apareciendo, marcados **anulado**: una cuenta de la que se borran renglones deja de poder explicarse. La liquidación anulada, en cambio, deja de verse.

Los botones de la cuenta son **Cargar el corte** —o **Corregir el corte**—, **Anticipo** y **Liquidar**. **Anticipo** y **Liquidar** salen solo mientras la persona está activa y sin liquidar; el corte sale siempre.

#### Cargar el corte

El corte es el punto de partida: lo que esa persona ya tenía acumulado el día en que el sistema empezó a llevarle la cuenta. Sin él, su cuenta arranca en cero y la lista lo dice.

La ventana se titula **Corte de** y el nombre del trabajador, y avisa: **El sistema no tiene los salarios de años anteriores: el corte se carga a mano, y se ve que es a mano.** Calcular hacia atrás daría un número con cara de exacto y falso.

1. Pulse la fila de la persona.
2. Pulse **Cargar el corte** —o **Corregir el corte**, si ya tiene uno—.
3. Llene los campos.
4. Pulse **Guardar el corte**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Acumulado hasta** | Sí | La fecha del corte. Sin ella no se enciende **Guardar el corte** |
| **Días acumulados** | No | Cuántos días llevaba acumulados a esa fecha |
| **Garantía en Bs** | No | El monto acumulado, en la moneda de su sueldo |
| **Intereses acumulados** | No | Los intereses que ya había ganado |
| **Anticipos** | No | Lo que se le había adelantado antes de esa fecha |
| **De dónde sale esta cifra** | No | **Queda guardado con su nombre y la hora.** |

Ese último campo es el que hace defendible al corte, con dos límites que conviene saber. **La nota no se enseña en ninguna parte de la pantalla**: queda guardada, pero para leerla hay que pedírsela a quien administra el sistema. Y **al pulsar Corregir el corte el campo arranca vacío**: si no se vuelve a escribir, la nota anterior se pierde. Al corregir un corte, escriba otra vez de dónde sale la cifra.

Lo que el sistema no deja al guardar un corte, y por qué:

- **Una fecha futura**, porque nadie tiene acumulado todavía lo de un día que no ha llegado.
- **Una fecha anterior al ingreso** de esa persona, porque no se acumula nada antes de empezar a trabajar.
- **Más anticipos que lo acumulado** —garantía más intereses—, porque no se puede haber adelantado dinero que nunca se acumuló. Las cifras de ese aviso salen sin separador de miles: «Los anticipos (1500.5) no pueden superar lo acumulado (1200).»

Y una cuarta, la que más incomoda: **si ya hay trimestres cerrados anteriores a esa fecha, el corte no se guarda.** El sistema responde «Ya hay trimestres calculados antes de esa fecha de corte. Anúlelos primero: si no, ese tiempo quedaría contado dos veces.» **Esta pantalla no tiene ningún botón para anular un trimestre cerrado**: con ese mensaje no hay salida desde la pantalla, y hay que pedírselo a quien administra el sistema.

Por eso el orden importa: **primero se carga el corte de todo el mundo, y después se cierran trimestres.** Al revés se llega a un callejón.

#### Cerrar el trimestre

Es la operación que abona a cada quien lo que le tocó de ese trimestre. Se hace una vez, cuando el trimestre ya terminó.

1. Pulse **Cerrar trimestre**, arriba a la derecha.
2. Escriba el **Año**.
3. Elija el **Trimestre**: **1 — enero a marzo**, **2 — abril a junio**, **3 — julio a septiembre** o **4 — octubre a diciembre**.
4. Pulse **Cerrar el trimestre**.

La ventana propone el trimestre anterior al que corre, **del año en curso**. Entre enero y marzo eso no sirve: propone el trimestre 1 de este año, que todavía no ha terminado, y el sistema lo rechaza. En esos meses, cambie el año al anterior y elija el 4.

Al terminar, encima de las cifras sale una franja con el resultado —**Trimestre cerrado para 12 trabajador(es).**, o **No había nada que abonar: ese trimestre ya estaba cerrado o nadie cumplía los tres meses.**— y se cierra con **Entendido**.

Cuatro cosas que conviene saber antes de pulsar:

**De dónde sale el salario con el que se calcula.** La ventana lo explica: **El salario sale del último recibo del trimestre, con las horas extras y los recargos que de verdad se pagaron. Si no hay recibos, se calcula desde la ficha y el depósito queda marcado como estimado. Volver a correrlo no duplica nada.** Un depósito **estimado** no está mal calculado: está calculado sobre el sueldo de la ficha y no sobre lo que de verdad se pagó, y se marca para que se sepa.

**No se puede cerrar un trimestre que no ha terminado.** El sistema responde con la fecha en que se podrá: «El trimestre 4 de 2026 todavía no ha terminado: cierra el 31/12/2026.» Cerrar un trimestre a mitad de camino abonaría menos de lo que corresponde, y nadie se acordaría después de volver.

**A quien no lleva todavía el tiempo mínimo de servicio no se le abona nada** ese trimestre. La ventana habla de **tres meses**; la cuenta es de noventa días desde la fecha de ingreso.

**Volver a cerrar el mismo trimestre no duplica nada.** A quien ya tiene su depósito se le salta. Por eso se puede correr sin miedo después de cargar el corte de alguien que faltaba.

#### Abonar los intereses del mes

Se hace una vez al mes, cuando el mes ya cerró y el Banco Central publicó su tasa.

1. Pulse **Intereses del mes**, arriba a la derecha.
2. Escriba el **Año** y el **Mes**.
3. Escriba la **Tasa anual (%)** que publicó el Banco Central para ese mes.
4. Pulse **Abonar intereses**.

Sale la franja **Intereses abonados a 12 trabajador(es).**, también con cero.

La ventana propone el mes anterior, **del año en curso**: en enero propone enero, que no ha terminado. En enero, cambie el año y elija el 12.

**Sin tasa no se abona nada, y es a propósito.** La ventana lo dice: **La tasa se guarda con el mes al que pertenece: sin ella no se calculan los intereses.** Unos intereses con una tasa inventada también son inventados. Por eso **Abonar intereses** no se enciende con la tasa vacía o en cero.

**La tasa queda guardada con el mes al que pertenece**, no con el día en que se tecleó. Es lo que permite que abonar marzo en agosto dé el mismo resultado que habría dado en marzo. Dos detalles de la ventana: **el campo de la tasa arranca vacío cada vez**, aunque ese mes ya tenga una cargada, y **la tasa se guarda antes de calcular**. Si el cálculo se niega —por ejemplo, porque el mes no ha terminado: «El mes 10/2026 todavía no ha terminado.»—, la tasa que se escribió ya quedó guardada para ese mes.

**Volver a correr un mes ya abonado no suma dos veces**: rehace el abono de ese mes con la tasa que se escriba. Si se tecleó mal la tasa, esa es la forma de corregirlo.

#### Registrar un anticipo

1. Abra la cuenta de la persona y pulse **Anticipo**. La ventana dice arriba hasta cuánto se le puede adelantar.
2. Escriba el **Monto en Bs**. Si pasa del tope, el campo se marca con **Pasa del 75% permitido**, pero el botón sigue encendido: el que se niega después es el sistema.
3. Elija el **Motivo**: **Vivienda**, **Salud**, **Educación**, **Pensión alimentaria** u **Otro**.
4. Elija la **Cuenta** de la que sale el dinero, o déjela en **Sin mover tesorería**.
5. Escriba la **Referencia**, si la tiene, y el **Detalle**.
6. Pulse **Registrar el anticipo**.

**Si elige una cuenta, el dinero sale de verdad**: el saldo de esa cuenta baja y queda una línea de egreso en el libro de tesorería a nombre de esa persona. Sale **aunque la cuenta no tenga saldo registrado**: queda en negativo y tesorería recibe el aviso, como con la nómina (11.7). Con **Sin mover tesorería**, el anticipo queda apuntado en su cuenta de prestaciones y no baja ningún saldo. Son dos cosas distintas con el mismo botón; conviene tenerlo claro antes de pulsar.

**El anticipo sale con la fecha de hoy.** La ventana no tiene campo de fecha.

Si el monto pasa del tope, el sistema responde: «A … se le pueden adelantar hasta 1.200,00 y se están pidiendo 1.500,00. La ley permite adelantar hasta el 75% de lo acumulado.» Un anticipo por encima del tope no es un anticipo: es dinero entregado contra algo que todavía no existe.

**No se puede anular un anticipo desde esta pantalla.** Si se registró mal, hay que pedírselo a quien administra el sistema.

#### Liquidar a un trabajador

Liquidar es la cuenta final de alguien que se va. Son dos pasos separados a propósito: primero se calcula y se revisa, y después se paga.

**Paso uno: calcular.**

1. Abra la cuenta de la persona y pulse **Liquidar**.
2. Escriba el **Último día trabajado**. Viene propuesto hoy.
3. Elija el **Motivo**: **Renuncia**, **Despido injustificado**, **Despido justificado**, **Contrato vencido**, **Jubilación** o **Fallecimiento**. La ayuda advierte de lo que cambia según se elija: **El despido injustificado paga, además, otro tanto igual.**
4. Escriba **Otras asignaciones** y **Otras deducciones**, si las hay, y la **Observación**.
5. Pulse **Calcular la liquidación**.

La ventana se presenta con **Se calculan las dos cuentas que manda comparar la ley y se paga la mayor.**, y deja claro qué hace y qué no: **Calcular no paga ni da de baja a nadie: deja el cálculo a la vista para revisarlo. El pago se confirma después, desde la ficha.** Esa «ficha» es la cuenta de la persona en esta misma pantalla, no su ficha de Personal. Entre calcular y pagar hay una pausa, y esa pausa es la única oportunidad de revisar el cálculo.

El cálculo aparece dentro de la cuenta de esa persona, en una tarjeta con su número —**Liquidación LIQ-2026-0001**, que se reinicia cada año—, el motivo, la fecha y su etiqueta, **calculada** o **pagada**:

| Renglón | Qué es |
| --- | --- |
| **Garantía acumulada** | Lo que se le fue abonando trimestre a trimestre, más lo que traía del corte |
| **30 días por año** | La otra forma de calcular lo mismo: días por año de servicio, al último salario integral |
| **Base (la mayor)** | De las dos anteriores, la que dé más. Esa es la que se paga |
| **Intereses** | Los intereses acumulados a su favor |
| **Vacaciones fraccionadas** | La parte que le corresponde del último año trabajado |
| **Bono vacacional** | Lo mismo, del bono |
| **Utilidades fraccionadas** | Lo mismo, de las utilidades |
| **Indemnización** | Solo trae cifra si sale por despido injustificado |
| **Anticipos** | Todos sus anticipos, más lo que venía como anticipado en su corte, con un menos delante |
| **Total a pagar** | El resultado |

Se enseñan las dos cuentas, y no solo el resultado, porque quien firma una liquidación tiene que poder explicar de dónde salió el número. **Con una excepción: Otras asignaciones y Otras deducciones entran en el Total a pagar, pero no tienen renglón en la tarjeta.** Si se escribió alguna, los renglones a la vista no suman el total, y la diferencia es exactamente eso.

**Paso dos: pagar.**

1. En esa misma tarjeta, elija la **Cuenta** de la que sale el dinero (**Seleccione la cuenta**).
2. Pulse **Pagar y dar de baja**.

El nombre del botón dice lo que hace: sale el dinero de la cuenta —aunque no tenga saldo registrado, con el mismo aviso a tesorería—, queda la línea en el libro de tesorería con la fecha de hoy, y **la persona queda desincorporada en su ficha** con el último día trabajado de la liquidación. No hay que ir a **Personal** a desincorporarla después: un trabajador liquidado que siguiera activo volvería a salir en la próxima nómina.

Dos detalles del motivo de salida. Si la ficha ya tenía uno escrito, se queda el que tenía. Si no, se escribe el de la liquidación tal como lo guarda el sistema —**DESPIDO_INJUSTIFICADO**, **CONTRATO_VENCIDO**—, y así sale en la lista de Personal, en la ficha en PDF y en los informes que lo llevan; la ficha en pantalla y la constancia lo traducen.

Y uno de la entrada: **pagar la liquidación no le cierra la entrada al sistema.** Si la persona tenía usuario, se inactiva aparte, en **Configuración › Usuarios y roles** (13.1).

Al revés hay una trampa, y es la más cara de este capítulo: **si primero se desincorpora desde Personal, ya no se la puede liquidar aquí.** **Anticipo** y **Liquidar** solo salen para quien está activo, así que la persona queda en la lista con su saldo a la vista y sin forma de cerrarle la cuenta desde la pantalla. El sistema no avisa en ninguno de los dos sitios.

De ahí sale la regla de la casa: **cuando alguien se va, primero se le liquida aquí y se le paga.** La desincorporación la pone el propio botón **Pagar y dar de baja**. **Desincorporar** en Personal (11.3) queda para cuando no hay nada que liquidar.

Lo que el sistema no deja, y por qué:

- **Liquidar dos veces.** Si ya hay un cálculo, el sistema responde «A … ya se le calculó la liquidación. Anúlela primero si hay que rehacerla.» Y **esta pantalla no tiene botón para anular una liquidación.** Antes de pulsar **Calcular la liquidación**, revise la fecha y el motivo.
- **Fechar la salida antes del ingreso, o hacia adelante**, porque ninguna de las dos cosas puede haber pasado.
- **Pagar una liquidación que no arroja monto**, ni pagar dos veces la misma.

#### Lo que esta pantalla no hace

Límites reales, dichos sin rodeos porque se descubren el primer día:

- **No imprime nada.** No sale un comprobante de liquidación, ni un recibo de anticipo, ni un estado de cuenta para entregarle al trabajador. Lo que se le enseñe hay que copiarlo de la pantalla.
- **No anula nada**: ni un trimestre cerrado, ni un anticipo, ni una liquidación. Los tres se pueden anular en el sistema, pero no hay botón que lo haga, así que pasa por quien lo administra.
- **El pago de un anticipo o de una liquidación sí se puede deshacer, pero desde el libro de tesorería** (12), con su reverso. Ojo con lo que eso deja: el dinero vuelve a la cuenta, y aquí el anticipo sigue registrado y la liquidación sigue **pagada**, con la persona desincorporada.
- **No cierra el trimestre sola, ni abona los intereses sola.** Las dos cosas hay que acordarse de hacerlas: el trimestre cuando termina, los intereses cuando el Banco Central publica la tasa del mes. Nadie avisa.
- **La ficha del trabajador no muestra nada de esto.** Para saber cuánto tiene acumulado alguien hay que venir a esta pantalla.

### 11.11 Bonos y descuentos

**Nómina › Prestaciones y parámetros › Bonos y descuentos**

Es la tercera pestaña de **Prestaciones y parámetros**.

Aquí está **la lista** de bonos y descuentos, no los montos. Aquí se decide qué bonos y qué descuentos existen; cuánto se le carga a cada quien, y en qué período, se hace en **Novedades del período** (11.6). Por eso vive con lo que no cambia cada quincena, junto a las prestaciones y los parámetros.

La cabecera lo dice: **Conceptos de carga manual por período. Los que calcula el sistema se muestran abajo en solo lectura.** El botón **Nuevo concepto** sale a recursos humanos.

#### Qué se ve

Dos listas.

Arriba, **Los que se cargan a mano**: **Es lo que aparece al agregar un bono o un descuento a alguien en el período.** Son los de la empresa, y se pueden crear, corregir, apagar y encender. Si no hay ninguno: **Sin conceptos registrados**, con **Por ejemplo: bono de transporte, bono por rendimiento o cuota de préstamo.**

Cada concepto lleva su nombre, su código —y su base legal, si la tiene— y unas etiquetas:

- **Suma** o **Resta**, según sea bono o descuento.
- **Integral**, si entra en el salario integral; al pasar el ratón dice **Entra en el salario integral: arrastra prestaciones.** Si no entra en el integral pero sí en el normal, la etiqueta es **Normal**. Un concepto que entra en los dos enseña solo **Integral**.
- **Inactivo**, si está apagado.

Y dos botones: **Editar** y **Apagar** —o **Encender**, si está apagado—.

Abajo, **Los que calcula el sistema**: **No se editan ni se apagan: sin ellos el recibo saldría sin una línea que la ley exige. Se enseñan para saber de dónde sale cada renglón.** Son el sueldo, el beneficio de alimentación, los recargos, las retenciones y aportes de ley y lo que se aparta para prestaciones. No tienen botones.

#### Crear o corregir uno

1. Pulse **Nuevo concepto**, o **Editar** sobre uno existente. La ventana se titula **Nuevo concepto**, o **Corregir** y el código del que se edita, y se presenta así: **Lo que se pueda cargar a mano en un período: un bono, un descuento, la cuota de un préstamo.**
2. **Nombre.** **Es lo que va impreso en el recibo del trabajador.** Se escribe como se quiere leer.
3. **Código.** **Se propone solo** a partir del nombre, en mayúsculas y sin tildes, cambiando espacios y signos —también el guion— por una raya baja. Se puede reescribir, pero si después se toca el nombre, la propuesta vuelve a pisarlo. **Al corregir ya no se cambia**: **No se cambia: los montos ya cargados lo llevan.**
4. **Tipo**: **Bono — suma al recibo** o **Descuento — resta del recibo**. Desde aquí solo se crean esas dos clases; los aportes y las provisiones los calcula el sistema.
5. Las dos casillas. La ventana explica lo que se decide: **Un bono puede quedarse en lo que se paga, o entrar además en la base con la que se calculan prestaciones y vacaciones. Eso último cuesta más.**
   - **Entra en el salario normal** — **Cuenta para vacaciones y para el día de descanso.**
   - **Entra en el salario integral** — **Cuenta además para las prestaciones sociales.**
6. **Orden en el recibo** — **Más bajo, más arriba.** Viene en 500.
7. **Base legal** — **Si viene de la ley, de dónde.**
8. Pulse **Guardar**. Se enciende cuando el nombre y el código tienen al menos tres letras.

Las casillas no son cosméticas: **lo que entra en el integral arrastra prestaciones**, y eso se paga.

#### Apagar en vez de borrar

Un concepto **no se borra**: se apaga. Uno usado en un período viejo no se puede borrar sin dejar recibos huérfanos, y esos recibos son documentos que ya se entregaron. Apagado deja de ofrecerse al cargar novedades y sigue explicando lo que ya está impreso.

**Guardar un concepto apagado lo vuelve a encender.** Si se corrige uno inactivo para dejarlo bien escrito, queda activo otra vez; si no debe ofrecerse, hay que pulsar **Apagar** de nuevo.

#### Los del sistema no se tocan

En pantalla no tienen botones, así que no se puede intentar. Si algo intenta corregir uno, el sistema se niega: «El concepto "SAL-BAS" lo calcula el sistema y no se edita aquí.» Y si intenta apagarlo: «El concepto "SAL-BAS" lo calcula el sistema: apagarlo dejaría el recibo sin una línea que la ley exige.»

Cambiarle el nombre sería inofensivo, pero esa misma puerta permitiría cambiarle el tipo o apagarlo, y entonces el cálculo seguiría corriendo y el recibo saldría sin una línea obligatoria. Si hace falta uno parecido, se crea uno propio con otro código.

### 11.12 Lo que conviene entender

#### Dos nóminas a la vez: la frecuencia y el tipo

Son dos datos distintos y conviene tenerlos separados:

- **La frecuencia de pago está en la ficha de cada trabajador**: **Semanal**, **Quincenal** o **Mensual**. Es un dato de esa persona.
- **El tipo está en el período**: **Semanal — 7 días**, **Quincenal — 15 días**, **Mensual — 30 días** o **Especial — días del calendario**. Es un dato de esa nómina.

**El período no se elige: se abre.** Recursos humanos pulsa **Abrir período** (11.7), elige el tipo y las fechas, y a partir de ahí ese período aparece en el desplegable **Período** de Novedades y de Recibos. Dos períodos del mismo tipo no pueden pisarse, pero uno semanal y uno quincenal sí pueden convivir sobre las mismas fechas. Eso es lo que permite llevar las dos nóminas a la vez.

**Al calcular, cada período hace recibos solo a quien cobra con su frecuencia.** Un período semanal recoge a los de frecuencia semanal; uno quincenal, a los de quincenal. El **Especial** alcanza a todos, y es el que se usa para pagar a quien está marcado **Eventual** en su ficha (11.4), que no entra en las nóminas ordinarias. Si nadie cobra con la frecuencia del período, el sistema lo dice: «Ningún trabajador activo cobra de forma semanal. Los que hay cobran: quincenal. Abra el período que corresponda, o corrija la frecuencia en la ficha del trabajador.»

**Novedades no filtra por frecuencia.** La lista de **Novedades del período** trae a todos los que estuvieron en la empresa entre esas fechas, cobren como cobren. Cargarle una novedad en un período semanal a alguien que cobra quincenal no sirve de nada: ese período no le hará recibo.

#### El pago no se puede deshacer

Este es el punto más importante del capítulo.

Hasta que se pulsa **Confirmar el pago**, todo tiene vuelta atrás:

- Una nómina en borrador o calculada **se recalcula** cuantas veces haga falta. Recalcular rehace los recibos enteros.
- **Las novedades se corrigen**: una hora extra mal cargada, una falta que no era, un bono que sobra.
- Una nómina **aprobada** ya no se recalcula ni admite novedades, pero la gerencia general la puede **Devolver a calculada** (11.7), y entonces vuelve a admitir todo.
- **El período entero se anula**, incluso aprobado, escribiendo por qué.

Después de **Confirmar el pago**, no hay ninguna de las cuatro:

- **La nómina no se anula.** El sistema responde «Esta nómina ya se pagó y no se puede anular. Corrija la diferencia en el período siguiente.»
- **La nómina no se recalcula.** **Calcular** ya no aparece en su tarjeta.
- **La salida de dinero no se reversa.** En el libro de tesorería, un movimiento equivocado normalmente se corrige con un reverso, que es otra línea en sentido contrario. El pago de una nómina no admite ni eso: el libro no ofrece deshacer esa línea, y si algo lo intenta, el sistema responde «Este movimiento es el pago de una nómina. Reversarlo dejaría los recibos diciendo que se cobró y el banco que no salió nada.»

La razón es esa misma frase. Si se devolviera el dinero a la cuenta, el período seguiría diciendo **pagada** y los recibos seguirían diciendo que la gente cobró. El sistema quedaría contando dos historias distintas, y esa contradicción no se descubre hasta el cierre, cuando ya nadie recuerda qué pasó.

**La única corrección posible es en el período siguiente.** Está escrita en el propio mensaje: se carga la diferencia en **Novedades del período** como un bono, si se pagó de menos, o como un descuento, si se pagó de más. Así quedan las dos cosas a la vista: lo que se pagó mal y la corrección.

**Qué revisar antes de llegar ahí.** El paso de revisión existe y está entre calcular y aprobar:

1. **Recalcule** después del último cambio en novedades. Un cambio guardado no entra en los recibos hasta que se vuelve a calcular.
2. Abra **Ver recibos** y mire las cuatro cifras del período: **Recibos**, **Asignaciones**, **Deducciones** y **Neto a pagar**. Si el número de recibos no es el que espera, sobra o falta gente.
3. **Entre a los recibos, uno por uno.** Revise los días pagados y los renglones de **Lo que se gana** y **Lo que se descuenta**.
4. Compruebe que el tabulador no tenga fichas desfasadas sin sincronizar (11.5): si las hay, el sueldo del recibo no es el de la escala.
5. Compruebe en **Parámetros de nómina** que los valores que cambian con frecuencia estén al día. Una nómina calculada con un monto viejo se paga corta.
6. Solo entonces, **Aprobar la nómina**. Y solo entonces, **Confirmar el pago**.

**Aprobar y pagar no tienen por qué ser dos personas.** Aprobar es de la gerencia general; pagar, de recursos humanos o de la gerencia general. La misma gerencia puede hacer las dos cosas seguidas. La pausa entre aprobar y pagar no la pone el sistema: la pone quien decide no pagar sin mirar.

#### Por qué los porcentajes y los topes se cargan en pantalla

Las cifras con las que se calcula la nómina —los porcentajes de las retenciones, los topes y los días de referencia— no están escritas por dentro del sistema. Viven en **Parámetros de nómina** (11.9), cada una con su fecha de vigencia y su fuente.

La razón: en Venezuela estas cifras cambian por decreto, y a veces con efecto hacia atrás. Un número escrito por dentro obligaría a que un técnico tocara el sistema cada vez que sale una gaceta. Cargado en pantalla, lo actualiza recursos humanos el mismo día, sin esperar a nadie.

**Con las prestaciones sociales esto se cumple solo a medias.** Los días de garantía de cada trimestre sí están en **Parámetros de nómina**. Las demás cifras de esa cuenta —los días adicionales del aniversario y su tope, el tiempo mínimo de servicio, la parte que se puede adelantar, los días por año de la liquidación y los días de base de las vacaciones fraccionadas— van escritas por dentro, y la pantalla de prestaciones las enseña (11.10). Ninguna se corrige desde una pantalla. Si la ley cambia alguna, hay que pedir que la cambien, y mientras tanto lo que salga en pantalla se contrasta con el asesor antes de pagar nada.

De ahí sale la segunda regla, la que hace que los recibos sean defendibles: **los valores se aplican por la fecha del período, no por la de hoy.** Recalcular en agosto una nómina de marzo tiene que dar lo mismo que dio en marzo. Por eso las vigencias anteriores no se borran.

**Quién los mantiene.** Los carga recursos humanos, y **su valor lo fija quien lleva la nómina junto con su asesor laboral o contable**, con la gaceta o el decreto delante. Este manual no dice cuánto vale ninguno: se toman de la fuente y se escriben en la pantalla, dejando anotada esa fuente.

Si al calcular falta alguno, el sistema no calcula a medias: se detiene y dice cuál falta y dónde cargarlo.

#### Los papeles que salen del módulo

Todos, menos el organigrama, se abren primero en el visor, y nada se guarda hasta que se pulsa **Descargar**. El organigrama se descarga directamente.

| Papel | De dónde sale | Dónde se explica |
| --- | --- | --- |
| **Informe** de personal | La lista de **Personal**, y para una sola persona su ficha | 11.3 |
| **Planilla de ingreso** | La lista de **Personal** | 11.3 |
| **Pago bancario** | La lista de **Personal** | 11.3 |
| **Ficha completa (PDF)** | La ficha del trabajador | 11.4 |
| **Constancia de trabajo** y de cese | La ficha del trabajador | 11.4 |
| Carnet | La ficha del trabajador, y la pestaña **Carnets** | 11.4 y 11.3 |
| **Recibo de préstamo** | La tarjeta **Préstamos** de la ficha | 11.4 |
| Recibo de pago | **Recibos de pago**: **Imprimir recibo** o **Imprimir todos** | 11.8 |
| **Informe del período** | **Recibos de pago** | 11.8 |
| Organigrama | **Organigrama**, con **Descargar** | 11.13 |

**Prestaciones sociales no imprime nada**: ni la liquidación, ni el anticipo, ni el estado de cuenta (11.10).

Los papeles que llevan firma de la empresa la toman de **Parámetros de nómina** (11.9). Si el nombre del firmante no está cargado, el renglón de la firma sale en blanco, para firmar a mano.

### 11.13 Organigrama

**Organigrama**

Es una entrada propia del menú, al lado de **Nómina**. La cabecera dice: **Estructura jerárquica y plazas previstas por puesto. Pulse un puesto para ver su línea de mando.**

Responde una pregunta que ninguna otra pantalla contesta: quién depende de quién, y cuánta gente hay prevista en cada puesto.

#### Quién lo ve y quién lo cambia

**Mirarlo y descargarlo, cualquiera que haya entrado al sistema.** Saber de quién depende quién no le hace daño a nadie y le ahorra a media empresa preguntarlo. El menú, en cambio, solo lo ofrece a quien ve Nómina; los demás llegan por la dirección de la pantalla o por un enlace.

**Cambiarlo pide escritura sobre Nómina**: quien lleva el personal es quien sabe de quién depende quién. Sin ella no aparece ningún botón para cambiarlo; solo **Descargar**.

**Quien lo abre sin permiso sobre Nómina ve la estructura bien, pero no las cifras de gente.** Esas cifras salen de la lista de personal, que no puede ver: **Registrada en nómina** le sale en cero, **Departamentos sin sitio** le dice **todos colocados**, y las marcas de desajuste de cada puesto tampoco son de fiar. Las cifras buenas son las que ve quien tiene Nómina.

#### Qué se ve

Arriba a la derecha, **Descargar**, que baja el organigrama en PDF. Debajo, tres tarjetas:

| Rótulo | Qué mide |
| --- | --- |
| **Prevista en el organigrama** | Cuántas personas suman todos los puestos dibujados |
| **Registrada en nómina** | Cuántas hay activas de verdad. Debajo, **cuadra** o, por ejemplo, **3 de diferencia**, y **· 2 sin departamento escrito** si las hay |
| **Departamentos sin sitio** | Departamentos que existen en nómina y que nadie colgó de la estructura. Debajo, **todos colocados** o la lista, con cuánta gente tiene cada uno |

Debajo va la estructura, **dibujada por bancos**: una banda horizontal por cada escalón de dependencia, como se corta un frente de cantera. Arriba el primero —la gerencia— y debajo cada nivel que cuelga.

En el canto izquierdo de cada banda va el rótulo **Nivel** con su número en grande y, debajo, cuántos puestos y cuánta gente hay en él. De un vistazo se ve cuántos escalones tiene la empresa y dónde está el grueso del personal.

**No hay ni una línea dibujada.** Dentro de cada banda los puestos van reunidos bajo un rótulo pequeño —**de Administración**— que dice de quién cuelgan. Se lee igual que con líneas, y así la hoja crece hacia abajo y nunca hacia los lados: es lo que hace que el mismo dibujo sirva en un proyector y en un teléfono.

Cada puesto lleva el **nombre** —más marcado si es una unidad, más suave si es un cargo—, quién lo ocupa si tiene titular, y cuántas plazas hay previstas.

Y solo cuando hay desajuste, en ámbar, **cuántos hay en nómina de verdad**. **El acuerdo se calla y el desajuste se dice**: marcar también los que cuadran llena la pantalla de etiquetas y esconde justo lo que hay que mirar. Un puesto sin esa marca es un puesto que cuadra, o uno que no está enlazado a ningún departamento, y entonces no se sabe: pintar un cero sería mentir.

Si todavía no hay nada dibujado: **Sin organigrama definido**, con **Empiece por lo de arriba —la gerencia general— y vaya colgando de ahí. Cada puesto que añada abre el banco siguiente.** y, para quien puede cambiarlo, **Empezar por arriba**.

#### Seguir una línea de mando

**Al pulsar un puesto se enciende su línea de mando entera** —lo que tiene encima hasta la gerencia y todo lo que le cuelga— y el resto se apaga. Es señalar con el dedo en una reunión, y de paso es cómo uno se sitúa antes de tocar nada.

Pulsando el mismo puesto otra vez se suelta y vuelve a verse todo. Lo apagado no está escondido: se sigue pulsando, y con el tabulador del teclado se recorre igual.

#### Cómo se cambia

Al pulsar un puesto aparece debajo una barra con su nombre y lo que se puede hacer con él:

1. **Colgar un puesto**. Abre el formulario debajo, sin ventana emergente, con el rótulo **Nuevo puesto colgando de** y el nombre del puesto del que colgará.
2. **Editar**, con el rótulo **Editando** y el nombre del puesto.
3. **Mover**. No se arrastra —en un teléfono, arrastrar es un ejercicio de puntería—: sale la franja que nombra el puesto que se mueve y dice **Pulse el puesto del que debe colgar.**, **los destinos válidos se encienden con el borde punteado** y se elige uno pulsándolo. No se ofrecen ni lo que cuelga del puesto que se mueve —sería colgarlo de sí mismo— ni el puesto del que ya cuelga. Para dejarlo como estaba, **Dejarlo donde está**.
4. **Quitar**, que solo aparece si de ese puesto no cuelga nada. Si cuelga algo, en su sitio se lee **No se quita: tiene 3 puestos colgando**, para que se sepa por qué no está el botón.

De la cabeza del organigrama no se ofrece ni **Mover** ni **Quitar**: un organigrama sin cabeza no es un organigrama.

| Campo | Detalle |
| --- | --- |
| **Nombre** | El único obligatorio. Sin él no se enciende **Guardar** |
| **Titular** | **Se deja vacío si el puesto no tiene nombre y apellido.** |
| **Tipo** | **Unidad** o **Cargo**. Empieza en **Unidad** |
| **Cuántos** | Las plazas previstas. Empieza en 1 |
| **Departamento de nómina** | **Para contar la gente en nómina de este puesto.** Cada opción dice cuánta gente tiene; se puede dejar **Sin enlazar** |
| **Nota** | |

Se cierra con **Guardar** o con **Cancelar**.

Una **Unidad** es una dependencia —Administración, Cocina, Operaciones—; un **Cargo** es un puesto con su gente, como «Cocineros», con dos plazas.

La pantalla no deja llegar a los errores de la estructura: no ofrece crear una segunda cabeza, ni quitar un puesto con algo colgando, ni mover uno debajo de sí mismo, ni guardar sin nombre. Si alguno saliera, es porque otra persona cambió el organigrama a la vez; vuelva a cargar la pantalla y mire cómo quedó.

### 11.14 Cuando el sistema no le deja

**Algunos mensajes son generales y no dicen qué falló:** **Su usuario no tiene permiso para esta acción.**, **Ya existe un registro con ese dato, y no puede haber dos.**, **La base no admite ese valor. Revise los datos de la operación; si no escribió nada, avise a soporte.** y **Eso está en uso en otra parte del sistema: no se puede borrar ni cambiar mientras algo dependa de ello.** La tabla dice qué quieren decir en cada pantalla de este módulo.

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: Gerente general. Su usuario no tiene ese rol.» | Ese paso lo ejecuta otro rol | Pida que lo haga quien tenga el rol que nombra el mensaje |
| «Su usuario no tiene permiso para esta acción.» | Su usuario no tiene el permiso sobre Nómina, o no al nivel que pide esa acción | Pida el permiso a la administración, o que lo haga quien lo tenga |
| «Sesión no válida. Vuelva a entrar.» | Se cerró su sesión | Vuelva a entrar al sistema |
| «El período NOM-2026-0012 (quincenal) ya cubre esas fechas. Dos nóminas sobre los mismos días pagarían dos veces. Anule el período que sobra, o abra este sobre fechas que no se pisen con él.» | Ya hay un período del mismo tipo sobre esos días | Lo que dice el mensaje. **Un período especial choca con cualquier otro**, porque se lleva a todo el personal |
| «El período termina antes de empezar.» | **Hasta** es anterior a **Desde** | Corrija las fechas |
| «Ningún trabajador activo cobra de forma semanal. Los que hay cobran: quincenal. Abra el período que corresponda, o corrija la frecuencia en la ficha del trabajador.» | Nadie tiene la frecuencia de ese período | Abra el período del tipo correcto, o corrija la **Frecuencia de pago** en la ficha de quien corresponda |
| «Falta el parámetro de nómina "…" para el …. Cárguelo en Nómina › Parámetros antes de calcular.» | Falta un valor para esas fechas | Cárguelo en **Parámetros de nómina** con su fecha de vigencia y vuelva a calcular |
| «A … no se le puede descontar tanto en este periodo: entre todos los descuentos suman …, y el tope es … (un tercio de lo que gana, LOTTT 154). El que se pasa es "…". Reparte lo que falte en los periodos siguientes, o baja el monto de este.» | Los descuentos cargados a esa persona pasan del tope del período | Baje el monto y reparta la cuota en varios períodos |
| «La fecha de pago del bono (…) es anterior al cierre del período (…).» | Se difirió un bono a un día anterior al cierre | Corrija la fecha. Un bono que se paga antes que el sueldo no es diferido: es un error de tecleo |
| «El período está en "APROBADA" y ya no admite cambios.» | Se intentó cargar o corregir una novedad en una nómina ya aprobada | Pida a la gerencia general que la devuelva a calculada. Cargado ahí, no lo recogería ningún recibo |
| «El período está en "…" y ya no admite cambios.» | Ese período ya se pagó o se anuló | Lo que haya que corregir va en el período siguiente |
| «Solo se aprueba una nómina calculada. Esta está en "…".» | El período no está calculado | Pulse **Calcular** primero |
| «Este período no tiene ningún recibo. Calcúlelo antes de aprobarlo.» | No se generó ningún recibo | Revise que haya personal activo con esa frecuencia y vuelva a calcular |
| «Solo se paga una nómina aprobada. Esta está en "…".» | Falta que la gerencia general la apruebe | Pida a la gerencia general que la apruebe |
| «Esta nómina ya se pagó y no se puede anular. Corrija la diferencia en el período siguiente.» | El pago ya salió | Cargue un bono o un descuento en el período siguiente |
| «Este período ya estaba anulado.» | Alguien lo anuló antes | Revise la tarjeta: el motivo está a la vista |
| «No existe el período ….» | Ese período ya no está | Vuelva a cargar la pantalla |
| «Ya existe un registro con ese dato, y no puede haber dos.» | En una ficha: ya hay un trabajador con esa cédula. En el tabulador: ya hay un cargo con ese nombre | Busque el que ya está —en Personal, marcando **Incluir a los desincorporados**— y trabaje sobre él |
| «La base no admite ese valor. Revise los datos de la operación; si no escribió nada, avise a soporte.» | En una ficha: la cédula, el RIF o el grupo sanguíneo no tienen la forma esperada —la cédula se escribe V-12345678 y el RIF V-12345678-9—. En la foto: el recuadro quedó fuera de la imagen | Corrija el dato, o arrastre la foto hasta que la cara quede dentro del recuadro |
| «La fecha de nacimiento da menos de 14 años. Es la edad mínima para trabajar (LOPNNA art. 96); revísela.» | La fecha de nacimiento está mal tecleada | Corríjala |
| «Ese cargo del tabulador ya no existe.» | El nivel se quitó mientras la ficha estaba abierta | Cierre, vuelva a abrir y elija otro cargo |
| «No existe ese trabajador.» | La ficha ya no está | Vuelva a cargar la lista |
| «La foto tiene que ser JPG, PNG o WEBP.» | El archivo no es una imagen de esas | Elija otra foto |
| «El archivo supera el tamaño admitido. Redúzcalo.» | La foto pasa de 5 MB | Sáquela con menos resolución |
| «El cargo no puede quedar vacío: es el nombre con el que las fichas se enganchan al tabulador.» | El nivel quedó sin nombre | Escríbalo |
| «El sueldo mensual tiene que ser un número de cero para arriba.» | El sueldo está vacío o en negativo | Escriba la cifra |
| «No existe ese cargo en el tabulador.» | El nivel se quitó mientras trabajaba | Vuelva a cargar la pantalla |
| «Eso está en uso en otra parte del sistema: no se puede borrar ni cambiar mientras algo dependa de ello.» | Se quiso quitar un nivel del tabulador que tiene fichas, aunque sean de gente desincorporada | Desmarque **Vigente**, o cámbieles el cargo primero (11.5) |
| «Un parámetro de texto necesita un valor escrito.» | Ese parámetro lleva palabras, no un número | Escriba el texto |
| «Un parámetro de unidad … necesita un número.» | Ese parámetro lleva una cifra, no palabras | Escriba el número |
| «Las prestaciones sociales están deshabilitadas: el 30/06/2026 están apagadas en los conceptos de ley. Se vuelven a habilitar encendiendo Prestaciones sociales en los conceptos de ley, en Nómina › Parámetros de nómina.» | Ese trimestre, mes, anticipo o liquidación cae en una fecha en que las prestaciones estaban apagadas | Si estaban bien apagadas, no hay nada que abonar. Si no, se cargan las vigencias en **Parámetros de nómina** (11.9) |
| «El corte no puede ser de una fecha futura.» | La fecha del corte es de mañana o después | Corrija la fecha |
| «El corte (…) es anterior al ingreso de … (…).» | El corte es de antes de que esa persona empezara a trabajar | Revise las dos fechas: una de las dos está mal |
| «Los anticipos (…) no pueden superar lo acumulado (…).» | En el corte hay más anticipos que garantía e intereses juntos | Revise las cifras del corte contra el papel de donde salen |
| «Ya hay trimestres calculados antes de esa fecha de corte. Anúlelos primero: si no, ese tiempo quedaría contado dos veces.» | Ese tiempo ya está abonado por trimestre y el corte lo contaría otra vez | La pantalla no anula trimestres. Pídaselo a quien administra el sistema |
| «El trimestre 4 de 2026 todavía no ha terminado: cierra el 31/12/2026.» | Se está cerrando un trimestre en curso. Entre enero y marzo pasa solo, porque la ventana propone el trimestre 1 del año en curso | Espere a la fecha que dice el mensaje, o elija el año y el trimestre que ya cerraron |
| «El mes 10/2026 todavía no ha terminado.» | Se están abonando intereses de un mes en curso | Espere a que el mes cierre. La tasa que escribió ya quedó guardada |
| «La tasa no puede ser negativa.» | La tasa se escribió con un menos | Escríbala sin signo |
| «El mes va del 1 al 12.» | El mes está mal escrito | Corríjalo |
| «El anticipo tiene que ser mayor que cero.» | El monto se escribió con un menos | Escriba el monto sin signo |
| «A … se le pueden adelantar hasta … y se están pidiendo …. La ley permite adelantar hasta el 75% de lo acumulado.» | El anticipo pasa del tope | Baje el monto al que dice el mensaje |
| «No existe la cuenta ….» | La cuenta del anticipo ya no está | Vuelva a cargar la pantalla y elija otra |
| «A … ya se le calculó la liquidación. Anúlela primero si hay que rehacerla.» | Esa persona ya tiene una liquidación calculada | Ábrala en su cuenta y revísela. Para rehacerla hay que anularla, y eso no se hace desde la pantalla |
| «La fecha de egreso es anterior a la de ingreso.» | El último día trabajado es de antes del ingreso | Corrija la fecha |
| «No se liquida con fecha futura.» | El último día trabajado todavía no ha llegado | Corrija la fecha |
| «La liquidación LIQ-2026-0001 está pagada.» | Otra persona la pagó antes | Revise la etiqueta de la liquidación en la cuenta de esa persona |
| «La liquidación … no arroja monto a pagar.» | La cuenta dio cero o menos, casi siempre por anticipos que se comieron lo acumulado | Revise los renglones del cálculo antes de seguir |
| «No existe esa cuenta.» | La cuenta de la que iba a salir la liquidación ya no está | Vuelva a cargar la pantalla y elija otra |

---

## 12. Tesorería

Tesorería es el libro del dinero. Cada banco, cada caja de efectivo y cada billetera digital de la empresa tiene aquí su cuenta, y todo lo que entra y sale de ellas queda escrito en una sola lista, en orden, con la fecha, el concepto, la referencia y el nombre de quien lo registró.

En el menú, **Administración › Tesorería** tiene cinco pantallas: **Tablero**, **Bancos y cajas**, **Reportes**, **Libro Mayor** y **Libro de tesorería**. Dos cosas del dinero se ofrecen desde otros módulos, que es donde la gente las busca:

| Pantalla | Dónde está |
| --- | --- |
| **Pagos por hacer**, con su pestaña **Por proveedor** | **Administración › Compras › Pagos por hacer** |
| **Cuentas por cobrar** | **Administración › Facturación › Cuentas por cobrar** (21.4) |

Lo que decide quién las abre es el permiso de cada uno (12.1).

Hay una idea que conviene entender antes de tocar nada, y es la misma que ordena el inventario:

**El saldo no es un número guardado. Es una suma.** El sistema no tiene apuntado en ningún lado cuántos bolívares hay en un banco. Lo que tiene es la lista de movimientos de esa cuenta, y cada vez que se abre la pantalla los suma. La propia pantalla lo dice: **Cuentas bancarias, cajas y billeteras. El saldo se calcula a partir de los movimientos registrados, no se guarda aparte.**

De ahí sale la consecuencia práctica: **para cambiar un saldo hay que escribir un movimiento**. No hay otra forma. No se corrige el número directamente, ni siquiera siendo administrador.

Y hay una segunda regla que conviene tener presente desde la primera pantalla: **una cuenta, una moneda**. Una cuenta en bolívares no guarda dólares y una cuenta en dólares no guarda bolívares. La razón está en 12.8.

### 12.0 Lo esencial, en una hoja

Esto es lo mínimo para trabajar con el módulo. Todo lo que sigue en el capítulo lo explica despacio; esta hoja es la que conviene tener al lado las primeras semanas.

**Una idea, y de ella sale todo lo demás.** El saldo no está guardado en ningún sitio: se suma del libro cada vez que se abre la pantalla. Por eso **para cambiar un saldo hay que escribir un movimiento**.

**Tesorería no decide qué se paga.** Las órdenes llegan ya aprobadas desde Compras, con su método, su moneda y su monto. Al pagar solo se dice **de qué cuenta sale** y se confirma que salió.

#### Lo primero, y una sola vez por cuenta

Registre el **Saldo de apertura** de cada banco, caja y billetera con lo que de verdad tiene hoy. Todas nacen en cero, y el Tablero cuenta cuántas siguen sin abrir. Si el disponible parece bajo, esto es lo primero que hay que mirar.

#### Dónde está cada cosa

| Para | Vaya a |
| --- | --- |
| Pagar una orden aprobada | Compras › **Pagos por hacer** |
| Ver a quién se le debe | La misma pantalla, pestaña **Por proveedor** |
| Ver todo lo que entró y salió | Tesorería › **Libro de tesorería** |
| Crear cuentas y ver cuánto hay | Tesorería › **Bancos y cajas** |
| Los libros de compras y de ventas | Tesorería › **Libro Mayor** |
| Informes de un período | Tesorería › **Reportes** |
| Ver a quién se le cobra | Facturación › **Cuentas por cobrar** |

#### El día a día

1. Abra **Pagos por hacer**. Lo que está ahí ya fue autorizado.
2. Pulse **Pagar** en la orden y elija la **Cuenta** de donde sale. Tiene que ser una cuenta **de la misma moneda** que el pago.
3. Escriba el **Número de referencia** del banco o de la plataforma. En efectivo es opcional.
4. Confirme. La línea queda escrita en el libro con su nombre y la hora, y la orden pasa a pagada.

Lo que no viene de una orden —un ingreso suelto, un gasto de caja chica, pasar dinero de una cuenta a otra— se registra desde **Bancos y cajas** con **Ingreso**, **Egreso** o **Trasladar**.

#### Cuatro reglas que conviene conocer

- **Una cuenta, una moneda.** Si la cuenta ya tiene movimientos, su moneda no se cambia: se crea otra y se archiva la vieja.
- **El sobregiro se decide cuenta por cuenta.** Las cuentas nacen con **Admite sobregiro** marcada, y entonces el libro deja sacar más de lo que dice que hay. Si se desmarca, el sistema frena la salida que deje la cuenta bajo cero.
- **La fecha la pone quien registra.** El sistema no frena una fecha futura en Tesorería: si se escribe la de mañana, queda la de mañana. Conviene mirarla antes de confirmar.
- **El libro no se edita ni se borra.** Una línea equivocada se corrige **deshaciéndola**: quedan las dos, la mala y la que la anula, y se entiende qué pasó. Un traslado se deshace con otro en sentido contrario. **El pago de una compra no se deshace desde ninguna pantalla** (12.8).

**El IGTF lo propone el sistema.** Al indicar el pago en Compras viene marcado cuando la moneda no es el bolívar, y quien lo indica puede desmarcarlo si esa operación no lo causa.

**Dos cosas que este módulo no hace:** no calcula diferencial cambiario y no concilia contra el estado de cuenta del banco. Conciliar se puede, pero a mano: cada línea lleva su fecha, su referencia y su concepto.

### 12.1 Quién entra y quién puede hacer qué

El acceso lo da el **módulo** Tesorería en la matriz de permisos (13.1), con sus niveles de siempre.

Hay **tres** puertas distintas, y conviene no confundirlas.

**La primera es ver las pantallas del módulo** —Tablero, Bancos y cajas, Reportes, Libro Mayor y Libro de tesorería—. Pide lectura sobre Tesorería. Quien no la tiene y escribe la dirección ve **Tesorería no está a su alcance**, con el texto **Su rol no tiene acceso a este módulo. Solicítelo a la administración.** y el botón **Volver al panel**.

**La segunda es mover dinero en esas pantallas.** Pide escritura sobre Tesorería para **Nueva cuenta**, **Editar**, **Saldo de apertura**, **Ingreso**, **Egreso**, **Ajustar**, **Trasladar** y **Deshacer**; y control total para **Archivar**, **Desarchivar** y **Eliminar** una cuenta.

**La tercera es registrar un pago de la cola de Compras**, y esta no es de Tesorería. El botón **Pagar** de **Pagos por hacer** solo sale a quien tiene el rol Compras o es administrador. Por eso quien paga las órdenes es compras, y por eso esa pantalla vive en el menú de Compras.

**Dar permiso sobre Tesorería no deja pagar las órdenes**, y tener el rol Compras no deja mover dinero en Bancos y cajas. Son dos llaves.

Las casillas de acción de Tesorería que se ven en la matriz no cambian nada por sí solas: lo que cuenta es el nivel del módulo.

### 12.2 El circuito del dinero

Antes de entrar en las pantallas conviene saber por dónde nace y por dónde muere cada deuda. En este módulo casi nada se teclea desde cero: la mayor parte llega sola desde Compras y desde Facturación.

#### Lo que se debe a un proveedor

1. **Alguien pide material.** Nace un pedido en Compras.
2. **Compras cotiza y prepara la orden**, y la aprueba el **Gerente general**, o quien tenga esa facultad prestada (13.1).
3. **Compras indica cómo se paga**: el método, la moneda, el monto y los datos de a dónde va el dinero. En ese momento nace la instrucción de pago, con el IGTF propuesto si la moneda no es el bolívar.
4. **La instrucción aparece sola en Compras**, en dos vistas de la misma pantalla: **Pagos por hacer**, para pagar, y su pestaña **Por proveedor**, agrupada. Nadie la carga a mano.
5. **Quien tiene el rol Compras pulsa Pagar** y dice de qué cuenta salió el dinero, con qué referencia y en qué fecha.
6. **Al pulsar Confirmar el pago**, el sistema hace todo de una vez: escribe la línea **Pago a proveedor** en el libro; si hay IGTF, escribe una segunda línea **IGTF** aparte; marca la instrucción como pagada; lo anota en la bitácora de la compra; y si con eso la orden queda saldada, la compra pasa a esperar que llegue el material.
7. **La instrucción desaparece de la cola** y la línea se queda para siempre en el libro.

Una deuda con un proveedor, por lo tanto, **se cierra pagándola, no borrándola**. Y **un pago ya confirmado no se deshace desde ninguna pantalla**: ni el libro lo deshace, porque dejaría la compra marcada como pagada y el dinero de vuelta, ni la compra deja devolver una instrucción que ya se pagó. Si un pago salió mal, avise a la administración.

#### Lo que debe un cliente

1. **Facturación emite una factura.** Si queda con saldo, la deuda aparece sola en **Facturación › Cuentas por cobrar**.
2. **El cobro se registra en Facturación › Facturas**, abriendo la factura. Ahí se elige la cuenta donde cayó el dinero, el monto, el método, la fecha, la referencia y si se le cobra el IGTF.
3. **El cobro escribe su línea en el libro de tesorería**, de tipo **Ingreso**, y sube el saldo de la cuenta. Si hay IGTF, va en una línea aparte.
4. **Cuando el saldo de la factura llega a cero**, la factura queda cobrada y desaparece de la lista.

**El cobro entra en la moneda de la cuenta donde cae el dinero, no en la de la factura.** Por eso los saldos de **Cuentas por cobrar** se muestran todos en dólares: se cobra en las dos monedas y hay que poder sumarlos.

Registrar un cobro pide escritura sobre **Facturación**.

### 12.3 Bancos y cajas

**Administración › Tesorería › Bancos y cajas**

Es la pantalla de cabecera del módulo: dónde está el dinero de la empresa y cuánto hay en cada sitio. Desde aquí se crean las cuentas, se registran los ingresos y egresos que no vienen de una compra ni de una venta, y se traslada dinero de un sitio a otro.

#### Qué se ve

Arriba, una tarjeta con el rótulo **Disponible en cuentas activas**. Junto al rótulo hay una fila de píldoras, una por cada moneda con tasa registrada, y el total se expresa en la que se elija.

Al lado, la advertencia de cómo está hecha esa suma: **Convertido con las tasas de hoy**, con la tasa entre paréntesis, **no con la del día en que entró cada saldo.**

Si falta alguna tasa del día, el total no se da y lo dice: **Falta la tasa del día para convertir. Regístrela en Sistema › Tasas de cambio; mientras tanto, el saldo de cada cuenta sí es exacto.** El sistema prefiere no dar el total antes que darlo mal.

Debajo, una tarjeta por cuenta: el nombre, el número de cuenta o el titular, la moneda arriba a la derecha, el **Saldo** en la moneda de esa cuenta —en rojo si es negativo— y una línea final, **Sin movimientos todavía** o cuántos movimientos tiene y la fecha del último. Las cuentas archivadas van en un bloque aparte al final, **Archivadas**, con la etiqueta **Archivada**.

El enlace **Ver movimientos** de cada tarjeta abre el libro de tesorería, pero **entero, no solo el de esa cuenta**: el libro no filtra por cuenta (12.7). El libro de una sola cuenta está en **Reportes › Libro de una caja** (12.10).

**Quién ve las cuentas.** Además de quien tiene Tesorería, las ven quien tiene lectura en Compras o en Facturación y quien tiene escritura en Nómina: el pago de una compra, el cobro de una factura y el pago de la nómina piden de qué cuenta sale o en cuál entra el dinero. Crear, editar, mover dinero y archivar sigue siendo de Tesorería.

#### Editar, archivar y eliminar una cuenta

**Editar** abre los mismos campos con los que se creó. Se puede cambiar cualquiera, la moneda incluida mientras la cuenta no tenga movimientos. Sin permiso de escritura, el botón es **Ver datos**.

**Una cuenta con movimientos no se borra: se archiva.** Es la contraparte de cada línea del libro, de cada cobro y de cada pago; borrarla dejaría asientos apuntando a nada. Pulse **Archivar** en la tarjeta y confirme: **Deja de salir en los selectores y en el disponible. El libro conserva sus movimientos y se puede desarchivar cuando haga falta.** **Desarchivar**, en la misma tarjeta, la devuelve.

**Con saldo no se archiva.** El disponible suma solo cuentas activas, y archivar una con saldo haría desaparecer ese dinero del total sin que nadie lo moviera. El botón sale apagado, y al pasar el ratón dice **Con saldo no se archiva: trasládelo o ajústelo a cero primero.**

**Eliminar** solo existe para una cuenta archivada que nunca movió dinero: **Solo se elimina una cuenta archivada que nunca movió dinero. Desaparece de la lista y no hay vuelta atrás; la base guarda quién la eliminó.**

No hay buscador ni filtros en esta pantalla. Si todavía no hay ninguna cuenta, aparece **Sin cuentas registradas**, con el texto **Se necesita al menos una cuenta para registrar el origen de los pagos.** y el botón **Crear la primera**.

#### Crear una cuenta

Pulse **Nueva cuenta**. La ventana tiene dos pasos, **Identificación** y **Titular y condiciones**, y lleva escrita la regla principal: **Una cuenta, una moneda.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Tipo** | Sí | **Cuenta bancaria**, **Caja / efectivo** o **Billetera digital (Binance)** |
| **Moneda** | Sí | Las monedas que lleva el sistema. Al editar avisa: **No cambia si ya tiene movimientos.** |
| **Nombre** | Sí | Sin él no se pasa al segundo paso: **Falta ponerle nombre a la cuenta.** |
| **Banco** | En cuenta bancaria | Empieza en **Seleccione el banco**. Lista de los bancos del país, con su código |
| **Número de cuenta** | En cuenta bancaria | En billetera, el mismo campo se llama **Dirección de la billetera** |
| **Correo de la plataforma** | En billetera | Hace falta este o la dirección de la billetera |
| **Red** | No | Solo en billetera |
| **Titular** | En cuenta bancaria y en caja | En caja se llama **Responsable** |
| **Cédula o RIF** | No | |
| **Nota** | No | |
| **Admite sobregiro** | — | **Viene marcada.** **Solo si el banco dio línea de crédito.** Una caja chica no entrega billetes que no tiene |
| **Activa** | — | Viene marcada |

Cierra con **Guardar**.

**La moneda no se cambia después del primer movimiento.** Si se equivocó, el camino es crear otra cuenta: cambiarla obligaría a reinterpretar como dólares todo lo que ya se registró en bolívares, y ningún saldo volvería a coincidir con el del banco.

#### Registrar dinero que entra o que sale

En la tarjeta de cada cuenta hay botones que escriben en el libro. No son intercambiables: cada uno responde a una situación distinta y así queda escrito en la línea.

| Botón | Cuándo se usa | Lo que dice la ventana |
| --- | --- | --- |
| **Saldo de apertura** | Solo aparece si la cuenta no tiene ningún movimiento | **Lo que había en la cuenta el día que empieza a llevarse aquí. Se registra una sola vez.** |
| **Ingreso** | Dinero que entró y no viene de una venta ya registrada | **Dinero que entró y no viene de una venta ya registrada.** |
| **Egreso** | Dinero que salió y no es el pago de una compra | **Dinero que salió y no es el pago de una compra: eso se registra desde la compra.** |
| **Ajustar** | Solo aparece si la cuenta ya tiene movimientos | **Solo cuando el banco dice otra cosa y ya se buscó el porqué. La diferencia queda escrita.** |

Los pasos son los mismos en los cuatro casos:

1. Pulse el botón en la tarjeta de la cuenta.
2. Escriba el **Monto**, en la moneda de la cuenta. En **Ajustar** el monto va **positivo si sobra dinero en la cuenta, negativo si falta**.
3. Escriba el **Concepto**. No aparece en el saldo de apertura.
4. En el egreso, elija la **Categoría**: sin ella, el gasto sale como «sin clasificar» en el centro de costos.
5. Rellene **De quién / a quién** y **Referencia** si es un ingreso o un egreso. Los dos son opcionales.
6. **Fecha**: si la deja en blanco, queda hoy.
7. Pulse **Registrar**.

El botón **Registrar** está apagado mientras el monto no sea mayor que cero —en el ajuste basta con que sea distinto de cero— y mientras el concepto sea demasiado corto. En el ajuste se exige una explicación más larga, porque un ajuste sin explicación es la única línea del libro que puede tapar un descuadre en vez de contarlo.

**Un pago a un proveedor no se registra aquí.** Se registra desde Pagos por hacer, para que el dinero y la orden queden atados: un egreso suelto bajaría el saldo pero dejaría la compra esperando pago para siempre.

#### Trasladar entre cuentas

Sirve para mover dinero de un sitio a otro sin que cuente como gasto ni como ingreso: **El mismo dinero cambiando de sitio. No cuenta como ingreso ni como gasto del mes.**

1. Pulse **Trasladar**.
2. Elija la **Cuenta de origen**. Cada opción se lee con el nombre de la cuenta y su saldo.
3. Escriba el **Monto**.
4. Elija la **Cuenta de destino**. La de origen ya no aparece en esta lista.
5. Si las dos cuentas son de monedas distintas, aparece **Monto en** la moneda del destino, y hay que llenarlo: **Se copia del comprobante: la casa de cambio no usa la tasa oficial.** El sistema no calcula un número que el banco pueda desmentir.
6. Rellene **Referencia** y **Fecha** si hace falta.
7. Pulse **Trasladar**.

Entre dos cuentas de la misma moneda **tiene que llegar exactamente lo que sale**. Si el banco cobró comisión, se registra aparte como un egreso: meterla dentro del traslado haría que el mismo dinero pareciera haber cambiado de valor al cambiar de sitio.

De aquí no sale ningún papel imprimible. Lo que produce esta pantalla son líneas en el libro de tesorería.

### 12.4 Pagos por hacer

**Administración › Compras › Pagos por hacer**

Es la cola de trabajo de quien paga: **Compras autorizadas pendientes de pago. Al pagarse, la compra queda a la espera de la recepción del material.**

**Por pagar a clientes.** Encima de la cola, cuando hay algo, sale una tarjeta con lo que la empresa **les debe a sus clientes**: **Pagaron una factura con material que valía más de lo que debían, y la diferencia se les devuelve en dinero.** Su botón **Pagar** pide de qué cuenta sale —solo cuentas en la misma moneda de la deuda—, cuánto, referencia y fecha, y escribe un egreso en el libro. Pide escritura sobre Tesorería.

**Pagos con material.** Si hay órdenes que se pagan con material, salen en un aviso aparte y no en la cola: no salen de una cuenta, se registran en su orden de compra.

#### Qué se ve

Arriba, dos tarjetas de resumen:

| Tarjeta | Qué muestra |
| --- | --- |
| **Por pagar** | Cuántas instrucciones esperan, y debajo cuántas llevan más de tres días |
| **Suma, con IGTF** | El total, **Al cambio de cada pago** |

Si alguna instrucción lleva más de una semana esperando, aparece un aviso: **Hay instrucciones esperando más de una semana.** El proveedor no reserva el material hasta que ve el pago, y la cotización tiene fecha de vencimiento.

Debajo está la **Cola de pagos**, con cuántos hay por pagar. Cada fila muestra el número de la orden, que es un enlace a la compra; el método; los días que lleva esperando, en naranja pasados tres días y en rojo pasados siete; el proveedor y el título de la compra; a dónde va el dinero, según el método —banco y número de cuenta, teléfono del pago móvil, correo o cuenta de Binance, o **Entregar a** y el nombre en efectivo—; el titular y su documento; y a la derecha el importe en su moneda, con el IGTF sumado cuando aplica.

Sobre la cola hay tres controles para armar las tandas:

| Control | Qué hace |
| --- | --- |
| **Prioridad** | Vacío es **Todas las prioridades** |
| **Unidad** | Vacío es **Todas las unidades**. Solo salen las que hoy tienen pagos pendientes |
| **Por dónde empezar** | El orden de la lista: **Antigüedad** —el de partida—, **Prioridad** o **Monto** |

**La lista se refresca sola**: lo que instruya Compras aparece aquí sin recargar la pantalla.

Si no hay nada pendiente: **Sin pagos pendientes**, con el texto **Aquí aparecen las órdenes autorizadas por Compras con método de pago indicado.**

#### Pagar

1. Busque la fila y pulse **Pagar**.
2. Se abre **Registrar el pago**. Arriba, el método y el importe, y un recuadro con el destino del dinero y el titular. Si hay IGTF, se dice cuánto sale en total y cuánto es de impuesto.
3. Elija la **Cuenta**: **Queda anotado en el pago. El sistema no lleva el saldo de las cuentas.** Solo salen las cuentas en la misma moneda de la instrucción; si no hay ninguna, la lista lo dice, y hay que crearla en **Bancos y cajas**. No es un olvido: pagar una instrucción en dólares desde una cuenta en bolívares obligaría al sistema a inventar la tasa a la que se hizo el cambio.
4. Escriba el **Número de referencia**: **El número que devolvió el banco o la plataforma.** En efectivo es opcional.
5. Rellene la **Fecha del pago** si no es hoy.
6. Pulse **Confirmar el pago**.

Si la cuenta no admite sobregiro y el pago la dejaría bajo cero, el libro lo frena al confirmar.

#### Pagar varias de una vez

Es lo que se usa cuando se va al banco a hacer la tanda del día.

Cada fila lleva **una casilla** a la izquierda, y solo la ve quien puede pagar. También está **Marcar los de una moneda**.

**Al marcar la primera, la moneda del lote queda fijada.** Las filas de otra moneda pierden su casilla y su botón **Pagar** mientras dure el lote: **el lote entero sale de una sola cuenta y con una sola referencia**, y una cuenta tiene una sola moneda.

Al pie aparece una barra con los pagos marcados y su suma, y a la derecha **Desmarcar** y **Registrar los N**. La ventana del lote pide la cuenta, la fecha y la referencia: **La misma para todos: es la tanda que devolvió el banco.**

**Si el banco devolvió una referencia por cada pago, no use el lote.** El lote escribe la misma en todos, y entonces el número del estado de cuenta deja de casar con el del sistema, que es justo lo que se mira cuando algo no cuadra.

### 12.5 Cuentas por pagar

**Administración › Compras › Pagos por hacer › Por proveedor**

Es la segunda pestaña de **Pagos por hacer**, y su título es **Cuentas por pagar**: **Deuda con cada proveedor por autorizaciones de compra pendientes de pago.** La cola sirve para pagar en orden; esta pantalla sirve para decidir a quién se le paga.

Arriba, la **Deuda total con proveedores** en dólares, y debajo cuántos proveedores y cuántos pagos autorizados la componen.

Luego, una tarjeta por proveedor, de mayor a menor deuda. En la cabecera van el nombre, el RIF, el total en dólares y, si la deuda más vieja pasa de siete días, una etiqueta roja con los días de la más antigua; entre cuatro y siete días, la etiqueta es naranja.

Dentro de cada tarjeta hay una tabla:

| Columna | Qué muestra |
| --- | --- |
| **Orden** | El número, que es un enlace al detalle de la compra |
| **Compra** | El título de la compra |
| **Autorizada** | La fecha en que se autorizó |
| **Monto** | El importe en la moneda de la instrucción y, debajo, el IGTF si aplica |

Si no se debe nada: **Sin deudas con proveedores**, con el texto **Todas las compras autorizadas están pagadas. Las compras aprobadas por el gerente aparecen aquí pendientes de pago.**

**Desde aquí no se paga.** Es una pantalla de solo consulta: no tiene filtros, ni acciones, ni botón de imprimir ni de exportar.

### 12.6 Cuentas por cobrar

Está en **Administración › Facturación › Cuentas por cobrar**, y la cuenta el capítulo 21 (21.4).

### 12.7 Libro de tesorería

**Administración › Tesorería › Libro de tesorería**

Es el libro contable del dinero: **Libro de ingresos y egresos. Los registros no se editan ni se eliminan: una corrección se asienta con el movimiento contrario, y ambos quedan visibles.** Aquí no se registra nada nuevo: se consulta, y si algo se registró mal, se escribe la línea contraria.

#### Qué se ve

Arriba hay **tres filtros**:

| Filtro | Qué hace |
| --- | --- |
| **Método de pago** | Empieza en **De cualquier forma** |
| **Moneda** | Empieza en **Todas** |
| **Rango de fechas** | Con atajos para los períodos de siempre |

No se filtra por cuenta: el libro de una sola cuenta está en **Reportes › Libro de una caja**.

La tabla tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Movimiento** | El número del asiento y, debajo, una etiqueta con el tipo |
| **Fecha** | La fecha del movimiento |
| **Método de pago** | Cómo se movió el dinero, y la moneda |
| **Concepto** | El texto y, debajo, la contraparte, la referencia y quién lo registró |
| **Monto** | Con signo más o menos, en la moneda del movimiento, y debajo en gris el equivalente en la otra moneda |

Los tipos que puede llevar la etiqueta son: **Saldo de apertura**, **Ingreso**, **Egreso**, **Pago a proveedor**, **IGTF**, **Comisión bancaria**, **Traslado entre cuentas**, **Ajuste** y **Reverso**. **El tipo se llama «Reverso» aunque el botón diga «Deshacer»**: es el nombre del asiento, no el del botón.

El equivalente en gris se calcula **con la tasa congelada del día del movimiento**, no con la de hoy. Así un pago de enero se puede comparar con uno de julio.

**La pantalla muestra las 200 líneas más recientes** de lo que piden los filtros, de la más nueva a la más vieja. No hay paginación: para llegar más atrás hay que acotar las fechas.

Si todavía no hay nada: **Sin movimientos registrados**, con el texto **Cada pago, ingreso o traslado se registra automáticamente en el libro.** Si los filtros no dejan nada: **Sin resultados**.

#### Deshacer una línea

1. Busque la línea equivocada.
2. Pulse **Deshacer**. Se abre la ventana con el número del movimiento y el texto **Se escribe el movimiento contrario. El equivocado se queda a la vista.** Así se entiende qué pasó.
3. Arriba verá un recuadro fijo con el concepto y el importe de lo que va a anular.
4. Escriba el **Motivo**. Mínimo diez letras. Ayuda: **Queda escrito en el movimiento nuevo.**
5. Confirme con **Deshacer**.

La línea original **se queda en el libro**. Lo que se escribe es una nueva, del mismo tamaño y en sentido contrario. Después, si hace falta, se registra la correcta.

**El botón Deshacer no aparece en cuatro casos**, y cada uno tiene su motivo:

- **La línea ya deshace otra.** Lo que ya se deshizo no se vuelve a deshacer: si la corrección estuvo mal, se registra el movimiento que corresponda.
- **La línea es el pago de una compra.** Deshacerla a solas dejaría la compra marcada como pagada y el dinero de vuelta en la cuenta (12.8).
- **La línea es una de las dos mitades de un traslado.** Deshacer solo esa devolvería el dinero al origen dejándolo también en el destino. Se deshace con un traslado en sentido contrario.
- **La línea es el pago de una nómina.** Deshacerla dejaría los recibos diciendo que se cobró y el banco diciendo que no salió nada.

Y a esos se suma el de siempre: **sin permiso de escritura sobre Tesorería, el botón tampoco se dibuja.**

### 12.8 Lo que conviene entender

#### Las cuentas van separadas por moneda, y no se mezclan

Es la primera decisión del módulo y la que más consecuencias tiene: **una cuenta en bolívares no guarda dólares.**

La razón es que el saldo de una cuenta existe para compararse con una sola cosa: lo que dice el banco. Mezclar las dos monedas en una cuenta obliga a inventar un saldo «equivalente» que ya no coincide con ningún estado de cuenta, y a partir de ahí no hay forma de saber si un descuadre es un error de registro o una diferencia de cambio.

De esa regla salen todas estas otras:

- La cuenta **no puede cambiar de moneda** una vez que tiene movimientos.
- Un pago **solo puede salir de una cuenta en la misma moneda de la instrucción**.
- Un traslado entre dos cuentas de la misma moneda **tiene que llegar completo**.
- Un traslado entre monedas distintas **exige escribir cuánto llegó**, porque ese número lo pone la casa de cambio y no el sistema.
- El saldo de cada cuenta se muestra **en su propia moneda**; solo el total de la cabecera se convierte, y con la tasa de hoy.

Hay tres tipos de cuenta y cada uno pide datos distintos: la **Cuenta bancaria** pide banco, número y titular, porque es lo que se necesita para conciliar; la **Caja / efectivo** pide un responsable, porque una caja chica no tiene estado de cuenta y lo único que responde por ella es una persona; y la **Billetera digital (Binance)** pide el correo de la plataforma o la dirección de la billetera, que es a donde llega el dinero.

**El sobregiro.** Las cuentas nacen con **Admite sobregiro** marcada. Solo tiene sentido dejarla así donde el banco haya dado línea de crédito: una caja chica no entrega billetes que no tiene, así que en una caja conviene desmarcarla. Desmarcada, el libro frena cualquier salida que deje la cuenta bajo cero.

#### El IGTF

Es el impuesto que grava los pagos hechos en divisas.

**Quién decide si se aplica.** El sistema lo propone en el momento en que Compras dice cómo se va a pagar: viene marcado cuando la moneda del pago no es el bolívar. Quien indica el pago puede desmarcar la casilla si esa operación no lo causa.

**Cuánto es.** Las pantallas muestran la alícuota escrita en sus propios textos: al indicar el pago se lee **Causa IGTF del 3%**, el cobro de una factura ofrece **Cobrarle el IGTF del 3% en esta línea**, y el concepto que queda en el libro es del estilo **IGTF 3% de la orden OC-2026-0002**. Este manual no fija ese porcentaje ni interpreta la ley: cuál es la alícuota vigente y cuándo cambia lo determina quien lleva la administración con su asesor.

**Cómo evita el sistema cobrarlo dos veces:**

1. **El monto del impuesto no se teclea: se calcula solo** a partir del monto del pago.
2. **Va en una línea aparte, no dentro del pago.** Al confirmar un pago se escriben dos líneas: **Pago a proveedor**, por el monto limpio, e **IGTF**, por el impuesto. Escrito aparte, se puede responder cuánto se pagó de impuesto en el mes sin desarmar cada pago.
3. **La segunda línea solo se escribe si hay impuesto que escribir.**
4. **Una instrucción no se puede pagar dos veces.** Al pagarla queda marcada como pagada, y un segundo intento choca con **Esta instrucción está en "PAGADA" y no se puede volver a pagar.**

En las ventas funciona al revés y también va aparte: el impuesto cobrado a un cliente entra como una línea propia, porque no es dinero de la empresa sino un impuesto que se recauda y se entrega. Y por lo mismo, **el IGTF cobrado no abona la factura**: el saldo del cliente baja solo por lo que abonó.

#### El diferencial cambiario

Cada línea del libro guarda **la tasa del día en que se registró**, congelada, y de ahí sale el equivalente que se ve en gris. Eso hace cada línea comparable con la del mes pasado, pero no es el diferencial cambiario: el sistema no reconoce ni contabiliza ganancia ni pérdida por ese motivo. Si hace falta reconocer una diferencia, se hace a mano con **Ajustar**, escribiendo qué se está reconociendo y por qué.

#### La conciliación bancaria

**Se concilia a mano**, con lo que lleva cada línea: su referencia, su fecha y su concepto. El saldo de cada cuenta se muestra en la moneda del banco, para comparar cifra contra cifra. Ninguna pantalla cruza el libro con el estado de cuenta del banco.

#### Por qué el libro no se edita ni se borra

Una línea registrada no se modifica y no se elimina. Nunca, para nadie, ni siquiera para la administración. La razón es la que hace útil al libro: un saldo que no cuadra se corrige con una línea nueva que lo explica, no borrando la que estaba mal. Es la única forma de que dentro de seis meses alguien pueda responder por qué un día salieron mil dólares de la caja.

Corregir tiene estos caminos, según qué se haya registrado mal:

1. **Deshacer** la línea, si es un ingreso, un egreso, un ajuste o un saldo de apertura.
2. **Trasladar en sentido contrario**, si lo que estuvo mal fue un traslado.
3. **El pago de una compra no tiene camino desde las pantallas.** El libro no lo deshace y la compra no deja devolver una instrucción ya pagada. Si un pago salió con la cuenta, el monto o la fecha equivocados, avise a la administración.

### 12.9 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Su usuario no tiene permiso para esta acción.» | Falta el permiso sobre el módulo | Pídalo a la administración |
| **Tesorería no está a su alcance** | No tiene lectura sobre Tesorería | Pídala a la administración |
| «Esta instrucción está en "PAGADA" y no se puede volver a pagar.» | Ese pago ya se hizo | Revise el libro: la línea ya está |
| «Falta el número de referencia de la transacción.» | Todo pago que no sea en efectivo necesita referencia | Copie el número que devolvió el banco o la plataforma |
| «La cuenta ya tiene movimientos en VES y no puede cambiar de moneda. Cree otra cuenta.» | Quiere cambiarle la moneda a una cuenta con historia | Cree otra cuenta en la moneda correcta y archive esta |
| «Esta cuenta ya tiene su saldo de apertura. Si estaba mal, corríjalo con un ajuste.» | El saldo de apertura se registra una sola vez | Pulse **Ajustar** y explique la diferencia |
| «Un ajuste de cero no ajusta nada.» | El monto del ajuste quedó en cero | Ponga la diferencia: positiva si sobra, negativa si falta |
| El nombre de la cuenta, seguido de cuánto tiene y de **No alcanza.** | La salida dejaría bajo cero una cuenta que no admite sobregiro | Si el dinero está, falta registrar su entrada: el saldo de apertura o el ingreso |
| «El origen y el destino son la misma cuenta.» | Eligió dos veces la misma cuenta | Cambie el destino |
| «Entre dos cuentas en VES debe llegar lo mismo que sale. Si el banco cobró comisión, regístrela aparte.» | Puso importes distintos entre dos cuentas de la misma moneda | Iguale los importes y registre la comisión como un egreso |
| «No hay tasa BCV registrada para el 04/08/2026 ni para ninguna fecha anterior. Regístrela en Sistema › Tasas de cambio.» | No hay ninguna tasa registrada en esa fecha ni antes | Regístrela en **Sistema › Tasas de cambio** y repita la operación |
| «El movimiento TES-000123 ya fue reversado.» | Esa línea ya se corrigió | Revise el libro: la corrección ya está |
| «La base no admite ese valor. Revise los datos de la operación; si no escribió nada, avise a soporte.» al guardar una cuenta | Falta un dato que ese tipo de cuenta exige: banco, número y titular; un responsable; o el correo o la dirección de la billetera | Complete los datos del tipo de cuenta |
| «No hay conexión con el servidor. Revise la red e inténtelo otra vez. Lo que no se guardó, no quedó.» | Se cayó el internet | Reintente cuando vuelva la señal |

### 12.10 Reportes

Están en **Administración › Tesorería › Reportes**. Son cuatro, y los cuatro obedecen la misma regla: **nada se suma entre monedas**. Un bolívar y un dólar no son la misma cosa, así que no existe un total general: cada moneda va en su fila o en su sección.

Arriba se elige el **período** —por defecto, el mes en curso—, que manda sobre el resumen, los libros y los gastos. Cada reporte se abre en la vista previa, y desde ahí se descarga; la hoja de cálculo del cierre baja directamente.

| Reporte | Qué trae |
| --- | --- |
| **Resumen por moneda** | Una fila por moneda con **Debe**, **Haber**, **Saldo en cajas**, **Por pagar** y **Por cobrar**, y debajo el saldo de cada caja, banco y billetera. **Al tocar una moneda se abre su libro** |
| **Libro de una caja** | El libro clásico de siete columnas —fecha, caja, concepto, beneficiario, Debe, Haber y saldo— de la cuenta elegida, con su **saldo anterior** y su saldo al final |
| **Gastos por categoría** | En qué se fue el dinero: categoría, subcategoría, movimientos, monto y porcentaje, por moneda. **No cuenta los traslados** entre cuentas propias |
| **Cierre de mes** | El resultado del mes por moneda (ingresos, gastos, resultado) y cómo **empezó y terminó cada caja**, más los gastos del mes. En PDF y en **hoja de cálculo**, que además trae todos los movimientos del mes |

<p class="regla"><strong>En el resumen conviven dos clases de número, y el propio papel lo dice al pie.</strong> Debe y Haber suman lo movido <em>en el período</em>. Saldo en cajas, Por pagar y Por cobrar son <em>a hoy</em>, no al final del período.</p>

**Un mes cerrado vuelve a salir igual en sus totales.** El cierre no guarda una foto porque no le hace falta: el libro no se edita ni se borra, así que sumar septiembre dentro de un año da lo mismo que dio en septiembre. Lo único que puede cambiar es el reparto de **Gastos por categoría**, si después se clasifica un gasto que estaba sin clasificar. El **saldo inicial** de cada caja tampoco se guarda: es el final menos lo que se movió en el mes.

**Ni los traslados ni los saldos de apertura son ingresos o gastos.** Aparecen en el Debe y el Haber de cada caja —ahí sí se movió el dinero— pero no en el resultado del mes.

**Por cobrar** se lleva en bolívares y en dólares: lo facturado en otra divisa va en la fila del dólar por su equivalente. Quien no tiene permiso para ver lo que se debe o lo que deben ve esas columnas en cero.

### 12.11 El tablero

**Administración › Tesorería › Tablero**

La pantalla de entrada del módulo: **Saldos disponibles, su ubicación y pagos pendientes.** Arriba lleva un botón a **Bancos y cajas**.

Cuatro cifras:

| Cifra | Qué muestra |
| --- | --- |
| **En cuentas, en divisas** | Lo que hay en las cuentas activas en dólares, y debajo lo que hay en bolívares. Las cuentas en otras divisas no suman aquí |
| **Por pagar a proveedores** | Lo autorizado y sin pagar, sin el IGTF. Cuenta también los pagos con material, que la cola de Pagos por hacer aparta, así que las dos cifras pueden no coincidir |
| **Cuentas activas** | **Bancos y cajas en uso** |
| **Sin saldo de apertura** | Las cuentas activas que todavía no tienen ningún movimiento: **No suman al disponible hasta abrirlas**. Si no queda ninguna, **Todas abiertas** |

Debajo, los atajos del módulo agrupados en **Egresos**, **Ingresos** y **Movimientos**: **Pagos autorizados**, **Cuentas por pagar**, **Cuentas por cobrar**, **Mover entre cuentas**, **Libro de tesorería**, **Libro Mayor** y **Reportes**. A cada persona le salen solo los que su permiso alcanza.

El atajo **Mover entre cuentas** abre el libro de tesorería; el traslado en sí se hace con **Trasladar**, en **Bancos y cajas**.

### 12.12 El Libro Mayor

**Administración › Tesorería › Libro Mayor**

Son los dos libros fiscales que pide el SENIAT, en dos pestañas: **Compras** y **Ventas**. Arriba hay un solo filtro, **Mes**, que empieza en el mes pasado, y el botón **Descargar**, que baja el mes en hoja de cálculo.

**Compras.** **IVA pagado a los proveedores, deducible del IVA cobrado. Es uno de los dos libros que exige el SENIAT.** Trae el resumen del mes —compras exentas, base imponible, crédito fiscal y total, todo en bolívares a la tasa que congeló cada factura— y una fila por factura de proveedor, por fecha de emisión. Las facturas anuladas no entran. Si no hubo ninguna: **Si hubo compras, falta registrar la factura del proveedor. Sin ella su IVA no se puede descontar.**

**Ventas.** **IVA cobrado a declarar. Las facturas suman y las notas de crédito restan.** Trae el resumen —ventas exentas, base imponible, débito fiscal y total, en bolívares— y una fila por documento. Las facturas anuladas salen en cero con la etiqueta **Anulada**, porque la numeración de control tiene que correr sin huecos. Si el mes no tuvo ventas: **Un mes sin ventas se declara igualmente, en cero.**

Los dos archivos se llaman **libro-compras-AAAA-MM.csv** y **libro-ventas-AAAA-MM.csv**.

La pantalla pide lectura sobre Tesorería, pero los datos de cada libro piden además lectura sobre Compras o sobre Facturación. Quien abre la pestaña de Ventas sin permiso sobre Facturación la ve vacía.

## 13. Configuración

Configuración es donde se decide quién entra al sistema, a qué llega cada quien, qué datos de la empresa salen impresos en los papeles que emite y dónde quedan guardados los documentos legales. Es también donde vive el registro de auditoría, que anota todo lo que se escribe en el sistema.

La idea que conviene entender antes de tocar nada es que **aquí hay dos capas distintas de autorización**, y confundirlas es el error más caro del módulo:

- **La matriz de permisos por módulo** decide a qué llega cada rol y qué puede hacer ahí. Los tres niveles son una escalera, no tres casillas sueltas: control total incluye escritura, y escritura incluye lectura. Darle **escritura en Nómina** a un rol lo habilita para escribir en Nómina de verdad, no solo para ver la pantalla.
- **Los roles con nombre propio** guardan lo que no es acceso sino responsabilidad. **Gerente general** aprueba compras y nóminas; **Administrador del sistema** crea usuarios y reparte permisos. Eso no cuelga de ningún nivel de la escalera, y por eso no se puede repartir desde la matriz.

La razón de la segunda capa es la separación de tareas: si «control total en Compras» bastara para aprobar, el mismo comprador que arma la orden la firmaría. Y si la administración de usuarios colgara de un nivel, quien administra un módulo podría darse a sí mismo todos los demás.

Un efecto secundario que conviene saber: **cargar la tasa del BCV pasó a pedir escritura en Tasas de cambio.** Antes lo podía hacer cualquiera que entrara al sistema, y la tasa es con lo que se valora cada cotización, factura y recibo. Hoy la tienen administración, la gerencia general y recursos humanos; quien solo la consulta ve la pantalla completa pero sin el formulario.

### 13.1 Usuarios y permisos

**Sistema › Configuración › Usuarios y roles**

**Quién entra al sistema y a qué llega cada quien.**

Esta pantalla la maneja el rol de Administrador del sistema. Quien tenga permiso para verla pero no ese rol lee arriba un aviso naranja: **Estás viendo esta pantalla en solo lectura. Crear usuarios y cambiar permisos lo hace quien tiene el rol de administrador del sistema.** No aparecen **Nuevo usuario** ni **Nuevo rol**, no hay botones en las filas y las casillas de la matriz salen apagadas.

La pantalla tiene tres pestañas: **Usuarios**, **Roles y permisos** y **Permisos extendidos**.

**El aviso de solo lectura vale para las dos primeras, no para la tercera.** El gerente general lo lee arriba y, sin embargo, **sí puede extender y retirar permisos**: esa pestaña la manejan el administrador del sistema y la gerencia general. Es lo único de esta pantalla que la gerencia puede usar de verdad.

#### La pestaña Usuarios

Arriba queda dicho cómo funciona el alta: **Las cuentas las crea la administración: no hay registro abierto. Quien entra lo hace con nombre de usuario, no con correo.** Buena parte de la plantilla no tiene correo.

La tabla tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Usuario** | El nombre de usuario. En su propia fila lleva la etiqueta **Tú** |
| **Nombre** | Nombre y apellido |
| **Cargo** | El cargo, si se llenó |
| **Ficha de personal** | Si la cuenta está relacionada con un trabajador. Ver abajo |
| **Roles** | Una etiqueta por rol. Si no tiene ninguno: **Sin roles** |
| **Estado** | **Activo** o **Inactivo**, más el botón de la llave para cambiar la clave, el del muñeco para inactivar o reactivar y, cuando la cuenta ya está inactiva, el de la caja para archivarla |

Pulsar cualquier parte de la fila abre la ficha del usuario. **No hay buscador** en esta pestaña; lo único que la parte en dos es el selector de arriba, **En uso** y **Archivados**, con el número de cuentas de cada lado.

#### La columna «Ficha de personal»

Es el espejo de lo que ya hace la ficha del trabajador, que dice si esa persona tiene cuenta. Aquí se lee al revés: si esa cuenta es de alguien de la plantilla.

| Lo que dice | Qué significa |
| --- | --- |
| **Ficha 0018 · Jesmary Barco** | La cuenta está atada a ese trabajador |
| En naranja: **Hay una ficha con su cédula** | No está atada, pero existe un trabajador con la misma cédula. **Es lo único de esta columna sobre lo que hay que hacer algo** |
| En gris | Ni atada ni hay ficha con esa cédula. Es lo normal en una cuenta de sistemas o de un tercero |

**Sirve para dos cosas distintas.** La primera es no darle dos identidades a la misma persona. La segunda es más útil de lo que parece: cuando alguien egresa, saber qué cuenta era suya es lo que evita que se quede abierta.

#### Crear un usuario

1. Entre en la pestaña **Usuarios**.
2. Pulse **Nuevo usuario**. La ventana avisa: **Los roles deciden a qué llega. Se pueden cambiar después.**
3. Escriba el **Nombre de usuario**. **De 3 a 32 caracteres: letras, números, punto y guion.** Se pasa solo a minúsculas y se le quitan los espacios.
4. Escriba el **Nombre y apellido**. Se escribe solo en mayúsculas y sin tildes.
5. Escriba la **Clave inicial**. **Mínimo 8 caracteres. Désela en persona y que la cambie.**
6. Rellene el **Cargo**, la **Cédula** y el **Teléfono** si los tiene. Los tres son opcionales, y los tres se guardan.
7. Marque al menos un rol en el bloque **Roles**. Viene marcado **Solicitante**.
8. Pulse **Guardar**. Aparece el aviso **Usuario p.ramirez creado. Dígale la clave en persona, no por escrito.**

La primera vez que esa persona entre, el sistema le obliga a ponerse una clave propia antes de dejarle ver nada. El motivo es que la clave que pone administración la saben dos personas, y mientras eso sea así la sesión existe pero no identifica a nadie.

Los roles que trae el sistema son **diez**, con la descripción que se lee al lado de cada casilla. 

| Rol | Qué dice el sistema de él |
| --- | --- |
| **Administrador del sistema** | **Puede todo. Se reserva a quien administra el sistema, no a la gerencia.** |
| **Gerente general** | **Única figura que aprueba una compra antes de que se pague.** |
| **Compras** | **Aprueba requisiciones, carga cotizaciones y prepara la orden.** |
| **Almacén** | **Recibe material, cuenta existencias y despacha.** |
| **Ventas** | **Cotiza, despacha material, factura y registra cobros.** |
| **Operaciones** | **Registra producción, voladuras y consumo en el frente.** |
| **Recursos humanos** | **Personal, asistencia y nómina.** |
| **Solicitante** | **Puede pedir material. Es el rol mínimo de cualquier supervisor.** |
| **Consulta** | **Solo lectura.** |
| **Respaldo de la base** | **Puede descargar la copia completa de los datos. Es el archivo más sensible del sistema: no se reparte.** |

Una advertencia sobre el reparto de roles, y no es menor: el sistema se instala con el administrador teniendo todos los roles a la vez, para poder probar el circuito completo. **En operación real, el rol de Gerente general debe estar en manos de la gerencia y no del administrador del sistema.** Si quien carga la cotización es el mismo que la aprueba, el control no existe.

#### Editar un usuario, cambiarle la clave, inactivarlo

**Editar.** Pulse la fila. Se abre **Editar usuario**: **El nombre de usuario no cambia.** Es con lo que entra y con lo que quedó firmado lo que ya hizo. Cambia lo que haga falta y pulsa **Guardar**.

**Cambiar la clave.** Pulse el botón de la llave en la fila. Se abre **Cambiar la clave**, con un solo campo, **Clave nueva**, y la ayuda **Mínimo 8 caracteres.** Cambiarle la clave a alguien **cierra todas sus sesiones abiertas** y le obliga a ponerse una propia la próxima vez que entre. Es lo mismo que pasa con un usuario nuevo, y por el mismo motivo.

**Inactivar.** Pulse el botón del muñeco. La ventana explica qué pasa: **Se queda sin permiso para nada desde ya: si entra con su clave, ve el sistema vacío. Lo que hizo hasta hoy se conserva entero: su nombre sigue en lo que pidió, aprobó o pagó. Si se fue de malas, repónle además la clave desde la llave, que es lo que le cierra la sesión. Una vez inactivo, se puede archivar.** Y debajo: **Los usuarios no se borran.** Un documento firmado por alguien que ya no existe no serviría de nada. Al reactivar, el texto es **Recupera sus roles y sus permisos con la misma clave que tenía. Si no la recuerda, cámbiasela desde la llave.**

**Hasta el 4 de septiembre de 2026 esa ventana decía «Deja de poder entrar al sistema desde ya», y no era verdad.** Inactivar nunca ha cerrado la puerta: apaga los permisos. La persona puede seguir entrando con su clave y encontrarse el sistema vacío. Lo que de verdad le cierra la sesión es cambiarle la clave.

#### Archivar una cuenta

Una cuenta no se borra, pero tampoco tiene por qué quedarse para siempre en la lista de las que trabajan. **Archivar** la saca de **En uso** y la guarda en **Archivados** con la fecha, el motivo y quién la archivó.

**La regla: primero se inactiva, después se archiva.** El botón de la caja solo aparece en las filas que ya están inactivas. Y no es solo el botón: el sistema no deja archivar una cuenta encendida, ni encender una cuenta archivada.

1. Inactiva la cuenta con el botón del muñeco.
2. Pulse el botón de la caja. Se abre **Archivar a …** con el texto **Sale de la lista de en uso y queda en el archivo con la fecha, el motivo y su nombre. Sigue sin poder hacer nada, igual que inactivo, y su nombre sigue en todo lo que firmó. Para volver a encenderlo habrá que sacarlo del archivo primero.**
3. Escriba el **Motivo**. Es obligatorio, mínimo cuatro letras. Es lo que va a leer quien lo busque dentro de un año.
4. Pulse **Archivar**.

En **Archivados** cada fila muestra cuándo se archivó, quién lo hizo y el motivo, con el botón de la caja abierta para **Sacar del archivo**. Al sacarla, la cuenta vuelve a **En uso** pero **inactiva**: sacar algo del archivo no es decidir que la persona vuelve a entrar. Si tiene que entrar, se reactiva aparte con el muñeco.

**Quién puede archivar.** El administrador siempre. Y cualquier persona a la que se le dé la casilla **Archivar o sacar del archivo una cuenta** del módulo Usuarios, ya sea marcada en su rol o por un permiso extendido. Esa casilla no la concede ningún nivel del módulo: hay que darla a mano.

**Un usuario no se borra nunca.** No existe forma de hacerlo. Un usuario firmó cosas: pidió material, aprobó órdenes, pagó facturas. Borrarlo dejaría todos esos documentos firmados por nadie, que es exactamente lo mismo que no estar firmados.

#### La pestaña Roles y permisos

Hay una tarjeta por rol. En la cabecera van el nombre en mayúsculas, la etiqueta **Sistema** o **Propio**, la descripción y cuántos usuarios lo tienen — **3 usuarios asignados** o **Sin usuarios asignados** —, que está ahí para que se vea a cuánta gente afecta lo que vas a cambiar. Los roles propios llevan además los botones **Editar** y una papelera.

La tarjeta de **Administrador del sistema** no tiene botones y muestra: **El administrador llega a todo por definición. No se recorta.** Sus casillas están bloqueadas incluso para otro administrador, porque ese rol es la salida de emergencia: si alguien pudiera bajarle el nivel, un clic dejaría el sistema sin nadie capaz de volver a subirlo.

Dentro de cada tarjeta está la matriz, con estas columnas:

| Columna | Qué es |
| --- | --- |
| **Módulo** | El módulo del sistema |
| **Lectura** | Casilla |
| **Escritura** | Casilla |
| **Control total** | Casilla |

**Los módulos que aparecen en la matriz son once, en este orden:**

**Panel · Maquinaria · Combustible · Inventario · Asignaciones · Compras · Nómina · Tasas de cambio · Configuración · Usuarios y roles · Respaldo de la base**

Falta uno de los quince, y no es un olvido: **la matriz esconde los módulos que no se ofrecen** —hoy solo **Tesorería**—. Repartir permisos sobre lo que nadie puede abrir solo sirve para que alguien crea que tiene acceso a algo.

Explotación, Despachos y Ventas faltaban aquí hasta el 28 de agosto y ya aparecen, con lo que tuvieran repartido.

**Había un hueco al repartir Ventas y se cerró el 31 de agosto.** Quien tuviera **Ventas en Escritura** podía cambiar precios de venta subiendo una planilla de artículos, aunque poner precios desde su propia pantalla exigiera Total. Las dos puertas piden ya lo mismo: **Total**. Se corrigió antes de que nadie tuviera ese nivel, que era la condición — una vez repartido, subir el listón le habría quitado a alguien algo que ya usaba.

Los quince del sistema, para referencia, son:

| # | Módulo | |
| --- | --- | --- |
| 1 | **Panel** | |
| 2 | **Explotación** | |
| 3 | **Maquinaria** | |
| 4 | **Combustible** | |
| 5 | **Inventario** | |
| 6 | **Asignaciones** | |
| 7 | **Despachos** | |
| 8 | **Compras** | |
| 9 | **Ventas** | |
| 10 | **Nómina** | |
| 11 | **Tesorería** | *(retirada: no sale en la matriz)* |
| 12 | **Tasas de cambio** | |
| 13 | **Configuración** | |
| 14 | **Usuarios y roles** | |
| 15 | **Respaldo de la base** | |

**Lo que un módulo en obra tuviera repartido no se pierde**: sigue guardado aunque su columna no se vea, y vuelve a la matriz el día que el módulo vuelva al menú. Lo que no se puede es repartirlo mientras tanto.

**El Organigrama no tiene fila propia**: se gobierna con el permiso de Nómina.

**Qué significa cada nivel en la práctica:**

| Nivel | Qué le da al rol |
| --- | --- |
| Ninguna casilla marcada | El módulo no aparece en el menú. Si alguien escribe la dirección a mano, ve la tarjeta **Compras no está a su alcance** |
| **Lectura** | Entra al módulo y consulta lo que hay. No escribe nada |
| **Escritura** | Además de consultar, registra en ese módulo |
| **Control total** | El escalón más alto de la matriz: abre el módulo entero |

**Los tres niveles son una escalera, no tres opciones sueltas.** Marcar **Control total** marca también **Escritura** y **Lectura**; desmarcar **Lectura** apaga las tres. Es así porque escribir sin poder leer no significa nada, y una matriz que lo permitiera solo serviría para dejar gente con permisos que no se pueden usar.

Y la advertencia que conviene repetir: **ningún nivel de esta matriz convierte a nadie en gerente ni en administrador.** Marcarle **Control total** en Tesorería al rol de Almacén no le da el botón de pagar: seguirá chocando con la regla que exige el rol **Compras**, y esa no sale de esta matriz. Para prestarle a alguien una facultad concreta está la tercera pestaña, **Permisos extendidos**.

**La tarjeta de cada rol enseña solo los módulos a los que llega.** Desde el 5 de octubre de 2026 la matriz ya no lista los veintitantos módulos del sistema en cada tarjeta: la fila de un módulo aparece cuando el rol tiene algo en él, y desaparece al quitárselo todo. Un rol recién creado sale como una tarjeta corta que dice que no llega a ningún módulo todavía, igual de organizada que las demás.

**Y en un rol detallado, las casillas de cada módulo vienen plegadas.** En vez de desplegar las siete casillas de Compras y las once de Nómina una debajo de otra, la fila del módulo dice **cuántas tiene marcadas de cuántas hay** —*3 de 7 casillas*— y se abre con el triangulito cuando se van a tocar. Así la tarjeta de un rol detallado se lee de un vistazo en lugar de ser un rollo de cien renglones.

#### Cambiar un permiso

1. Entre en la pestaña **Roles y permisos**.
2. Busque la tarjeta del rol.
3. En la fila del módulo, marca o desmarca la casilla.
4. Para un módulo que la tarjeta no enseña, úsese el selector **Darle acceso a otro módulo**, al pie de la tarjeta: el módulo elegido aparece con sus casillas en blanco y ahí se marca lo que le toca. Si no se marca nada, la fila se va sola la próxima vez.

**Se guarda al instante.** No hay botón de guardar y no se pide confirmación. Y recuerda lo principal: **no le está dando permiso a una persona, se lo está dando a un rol.** Todos los que tengan ese rol quedan afectados por el mismo clic.

**El reparto se ajusta desde esta misma pantalla, así que la referencia buena es la matriz que tenga delante**, no una tabla impresa. Esta de aquí es orientativa y sirve para ver la forma que tiene el reparto:


Nómina, Tesorería y Ventas quedan fuera del rol de Consulta a propósito: «solo lectura» de lo que gana cada quien sigue siendo ver el sueldo de todo el mundo.

**El Respaldo de la base es la única excepción a que el administrador llegue a todo.** Ese módulo no se le da a nadie por el hecho de administrar el sistema: hace falta el rol **Respaldo de la base**. «Puede administrar el sistema» y «puede llevarse todos los datos de la empresa en un archivo» no son la misma autorización. Está explicado en 13.5.

#### Crear y editar roles

**Nuevo rol** abre una ventana que avisa de dónde empieza: **Nace sin acceso a nada. Se le abre después, módulo por módulo.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Código** | Sí | **Mayúsculas y guion bajo. Es el nombre interno y no se puede cambiar después.** Se pasa solo a mayúsculas y los espacios se vuelven guion bajo |
| **Nombre** | Sí | Es lo que se lee en la tarjeta |
| **Descripción** | No | **Qué hace quien tiene este rol. Se lee en la tarjeta.** |

**Un rol nuevo nace siempre con niveles por módulo**, como los diez roles de la casa: ninguno, lectura, escritura o control total. El alta ya no pregunta cómo repartirlo, y es a propósito — lo que una persona concreta necesite de más o de menos **no se arregla inventando un rol a su medida**, sino en las pestañas de **Permisos extendidos** y **Permisos restringidos**.

**Los roles «permiso por permiso» son la excepción, y se eligen al editar.** Esa clase apaga la escalera de niveles del módulo y obliga a marcar una por una cada cosa que la persona puede hacer; su tarjeta lo dice con la etiqueta **Detallado**. Si un rol quedó así sin querer, en su propia tarjeta se explica el camino de vuelta: **Editar** y elegir **Por módulo entero**, y entonces vuelve a mandar el nivel de cada módulo.

Al editar, el **Código** queda bloqueado y la ventana lo dice: **El código no cambia.** Hay otras partes del sistema que lo nombran.

**Los roles que trae el sistema no se pueden borrar.** Solo se borran los que creó la empresa, y solo si no los tiene nadie. Si un rol del sistema sobra en alguien, el camino no es borrarlo sino quitárselo a quien no deba tenerlo: borrarlo dejaría sin dueño todas las reglas que lo nombran.

#### Cinco atajos entre el nivel y el rol

Hay una regla del sistema que no se ve en ninguna pantalla y explica muchas sorpresas: **para cinco casos, tener el nivel equivale a tener el rol.**

Cuando una acción pide un rol y no lo tiene, el sistema mira además si tiene el nivel equivalente. Si lo tiene, pasa.

| Tener este rol… | …es lo mismo que tener |
| --- | --- |
| **Recursos humanos** | Nómina en **escritura** |
| **Almacén** | Inventario en **escritura** |
| **Compras** | Compras en **control total** |
| **Solicitante** | Compras en **escritura** |
| **Operaciones** | Explotación en **escritura** |

**Compras va a control total y no a escritura, y no es un descuido.** «Compras en escritura» lo tienen también Solicitante, Operaciones y Recursos humanos, que son quienes **piden** material. Si el comprador y el que pide compartieran nivel, cualquiera podría confirmar un pedido o dar de alta un proveedor. **Pedir es escritura; comprar es total.**

**Esto solo vale para las acciones que piden un rol.** Las que piden un permiso de módulo no tienen atajo: ahí el nivel es el nivel y nada más.

**Y el administrador del sistema pasa siempre**, tenga o no el rol y tenga o no el nivel.

Es la razón por la que en este manual casi nunca se dice «este rol, y nadie más»: casi siempre hay una segunda puerta.

#### La pestaña «Permisos extendidos»

Es la tercera capa de autorización del sistema, y la más reciente. Las otras dos reparten por **rol**; esta presta una facultad **a una persona concreta y por un plazo**.

Nació de un caso real: el gerente general es el único que aprueba compras, y cuando no está, la empresa deja de comprar. Extenderle esa facultad a alguien de confianza por dos semanas resuelve el viaje sin repartirle el rol de gerente a nadie.

**Lo que se presta es una acción, no un módulo.** El sistema tiene un catálogo de unas **180 acciones** repartidas en dieciocho módulos —aprobar una compra, anular un carnet, autorizar un despacho sin guía—, y se extienden acciones sueltas, no el módulo como tal.

Con el botón **Extender un permiso** se pide:

| Campo | Detalle |
| --- | --- |
| **A quién** | Una persona activa del sistema |
| **Qué se le extiende** | Una o varias acciones del catálogo, agrupadas por módulo y con buscador. La misma justificación vale para todas. La ayuda dice el límite: *"Solo puede extender lo que usted mismo puede hacer."* |
| **Desde** | En blanco, desde hoy |
| **Hasta** | En blanco, **indefinida**. Conviene poner fecha |
| **Justificación** | Obligatoria: *"Por qué hace falta."* Dentro de un mes es lo único que va a explicar por qué esta persona pudo hacer esto |

**Para marcar muchas de una vez** está **Marcar todas**, encima de la lista: sin buscar nada marca el catálogo entero, y buscando algo —«compras»— marca solo las que se ven. Cada módulo tiene además su **todo el módulo**. Las que la persona ya tiene por su rol se saltan solas, y al terminar se dice en una línea cuántas fueron; las que no entraron por otra razón se listan con el porqué, y la ventana no se cierra hasta que se leen.

**Nadie puede extender lo que él mismo no puede hacer.** Es lo que impide que esta pantalla se use para escalar permisos: el administrador puede prestar cualquier cosa porque lo puede todo, pero el gerente general solo presta lo suyo.

**Lo que se hace con un permiso extendido queda marcado como tal.** No es lo mismo aprobar una compra porque es su puesto que aprobarla porque alguien le prestó la facultad: la orden impresa dice *bajo autorización de* seguido del nombre, y a quien la usa se le exige subir el papel que la respalda. Está contado en 9.5.

**Un permiso extendido se retira**, no se borra, y al retirarlo se pide **Por qué se retira**: queda el rastro de que existió, de quién lo dio, por qué y hasta cuándo.

**La lista va agrupada por persona, y recogida.** Desde el 5 de octubre de 2026 cada persona sale una sola vez, como una **ficha plegada** que dice su nombre, cuántos permisos vigentes tiene y en qué módulos: *«2 permisos · Compras · Tesorería»*. Se abre con el triangulito la que se quiera mirar, y sus permisos salen **agrupados por módulo**, cada uno con su motivo, quién lo autorizó y sus fechas. Primero van las personas con algo vigente.

**Buscar abre lo que encuentra**: al escribir en el buscador las fichas se despliegan solas, porque quien busca «aprobar compras» quiere ver el permiso y no la ficha cerrada de quien lo tiene. Con una sola persona en pantalla tampoco se recoge nada.

La pestaña **Permisos restringidos** —la cara contraria: quitarle a una persona concreta algo que su rol le daría— se lee exactamente igual, y tiene su mismo buscador: por persona, casilla, módulo, quién la puso o el motivo escrito.

**En las ventanas de extender y de restringir, el catálogo también viene plegado.** Son dieciocho módulos y unas 180 casillas: cada módulo dice cuántas lleva marcadas de cuántas tiene —*3/7*— y se abre el que se va a repartir. El enlace **todo el módulo** sigue a mano sin necesidad de abrirlo, y al escribir en el filtro los módulos que coinciden se despliegan solos.

#### Lo que ni siquiera el administrador puede hacer

Conviene saberlo antes de intentarlo, porque cada límite tiene su razón:

- **Recortarle permisos al propio rol de administrador.** Es la salida de emergencia del sistema: si se pudiera bajar, nadie podría volver a subirlo.
- **Desactivarse a sí mismo.**
- **Quedarse como último administrador activo y quitarse el rol o desactivarse.** Hay que nombrar a otro antes.
- **Borrar un rol del sistema.**
- **Borrar un usuario.**
- **Editar o borrar una línea del libro de tesorería o del registro de auditoría.**
- **Ver la clave de alguien.** Ninguna clave se guarda en un sitio donde se pueda leer, ni la vieja ni la nueva.

### 13.2 Datos de la empresa

**Sistema › Configuración › Datos de la empresa**

Guarda la identidad fiscal de la empresa: **Lo que dice el registro. Sale impreso en cada papel que emite el sistema.** De aquí salen los datos de los recibos, los carnets y las guías que emiten los demás módulos, así que un dato mal escrito aquí sale mal escrito en todas partes.

**Los trece papeles del sistema llevan la misma cabecera, y sale entera de esta pantalla.** Todos abren con la razón social, la actividad, el RIF y el domicilio fiscal, tal como estén aquí:

| Módulo | Papeles |
| --- | --- |
| Inventario | Nota de salida, acta de existencias, libro de movimientos, constancia de entrega |
| Combustible | Vale de combustible |
| Compras | Orden de compra, comprobante de pago |
| Ventas | Factura, cotización, nota de entrega |
| Nómina | Recibo de pago, ficha del trabajador, constancia de trabajo |

**El carnet es el único que no.** Mide 54 × 86 mm y tiene su propio diseño; no le cabe una cabecera de hoja A4.

**Cuatro campos forman el domicilio fiscal, y salen impresos juntos.** El sistema arma una sola dirección con **Domicilio fiscal**, **Ciudad**, **Estado** y **Zona postal**, en ese orden. Los cuatro figuran como opcionales porque el sistema funciona sin ellos, pero **una factura con el domicilio fiscal incompleto es una factura mal emitida**, y eso lo mira un fiscal. Llénalos los cuatro.

**El teléfono y el correo también salen impresos**, en el mismo renglón del RIF, si están cargados. Si los dos están vacíos, el renglón lleva solo el RIF y no queda ningún hueco.

**Solo pueden cambiarla el Administrador del sistema y el Gerente general.** Para el resto los campos salen apagados y en lugar del botón aparece: **Solo la gerencia y quien administra el sistema pueden cambiar estos datos.**

Si al RIF le quedan noventa días o menos para vencer, arriba del todo sale un aviso. En naranja si está por vencer — **El RIF vence el 04 jul 2028, dentro de 45 días.** — y en rojo si ya venció: **El RIF venció el 04 jul 2028. Con el RIF vencido no se puede facturar.** Va arriba del todo porque es lo único de esta pantalla que puede detener la operación de un día para otro.

La pantalla es un formulario largo, repartido en dos tarjetas.

**Identificación** — **La razón social va tal como está registrada, en mayúsculas y sin tildes.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **RIF** | Sí | Tiene que tener la forma **J-50209170-0**. Si no, sale debajo en rojo: **Debe ser como J-50209170-0.** |
| **Razón social** | Sí | Se escribe sola en mayúsculas y sin tildes |
| **Domicilio fiscal** | Conviene | La calle. Es la primera parte de la dirección impresa |
| **Ciudad** | Conviene | Segunda parte |
| **Estado** | Conviene | Tercera parte |
| **Zona postal** | Conviene | Va pegada al estado: **BOLIVAR 8001** |
| **Teléfono** | No | Sale junto al RIF en la cabecera de los papeles |
| **Correo** | No | Sale junto al RIF, detrás del teléfono |

**Registro fiscal** — **Del comprobante del SENIAT. Se actualiza cada vez que se renueva el RIF.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Inscripción** | No | Fecha |
| **Última actualización** | No | Fecha |
| **Vence** | No | Fecha. Es la que dispara el aviso de arriba |
| **N° de comprobante** | No | |
| **Gerencia regional** | No | |
| **Condición ante el IVA** | No | |
| **Retención de IVA** | No | **Porcentaje del impuesto causado que retienen los agentes de retención.** Solo se admite un valor entre 0 y 100 |

Se cierra con **Guardar cambios**, abajo a la derecha. Al terminar aparece **Guardado.** en verde. El botón está apagado mientras el RIF no tenga forma válida o la razón social esté vacía.

Estos datos salen del comprobante del SENIAT, no de la memoria de nadie. Cópielos del papel.

**No se puede tener más de una empresa.** El sistema lleva los datos de una sola.

### 13.3 Documentos legales

**Sistema › Configuración › Documentos legales**

Aquí se guardan los papeles de la empresa: el acta de alianza con la Gobernación, el comprobante del RIF, el registro mercantil, las concesiones y los permisos. **Los papeles de la empresa, guardados dentro del sistema y no en una carpeta pública.** La idea es poder consultarlos sin buscarlos en el correo de nadie.

Arriba hay un aviso fijo que conviene leer una vez: **Estos archivos no se publican en internet. Al abrir uno, el sistema firma una dirección contra la sesión de quien lo pide y esa dirección deja de servir a los diez minutos.**

#### Qué se ve

Una tarjeta por documento. Cada una muestra el nombre, una etiqueta con el tipo y, si caduca pronto, la etiqueta **Vencido** en rojo o los días que le quedan en naranja, a partir de los noventa días antes. Debajo, la línea de detalle: **Emitido el 04 jul 2025** — o **Sin fecha de emisión** —, la fecha de vencimiento si la tiene, y el peso del archivo. Luego la nota, si la lleva.

A la derecha van los botones: **Ver** para todos los que ven la lista, y para quien puede gestionarlos, un lápiz para corregir y una papelera para quitar.

**No hay buscador ni filtros.** Si todavía no hay nada: **Todavía no hay documentos cargados**, con el texto **El acta de alianza con la Gobernación, el comprobante del RIF, el registro mercantil y lo que haga falta van aquí.** y el botón **Cargar el primero**.

#### Quién ve y quién carga

Son dos grupos distintos:


Está repartido así a propósito: cargar y quitar papeles de la empresa es de la gerencia. Quien consulta estos papeles para hacer su trabajo hoy es compras, que paga contra ellos.

#### Cargar un documento

1. Pulse **Cargar documento**. La ventana dice lo que admite: **PDF o imagen, hasta 50 MB. Queda guardado dentro del sistema.**
2. Elija el **Tipo de documento**. Empieza en **Elige el tipo**.
3. Escriba el **Nombre**, mínimo tres letras, como lo buscará quien lo necesite dentro de un año. Se escribe solo en mayúsculas y sin tildes.
4. Elija el **Archivo**.
5. Rellene **Emitido el** y **Vence el** si las sabe. Las dos son opcionales; la ayuda de la segunda avisa cuando ese tipo de papel suele caducar.
6. Escriba una **Nota** si hace falta.
7. Pulse **Cargar**.

Los tipos disponibles son once, en este orden: **Alianza de la cantera – Gobernación**, **Registro Único de Información Fiscal (RIF)**, **Acta constitutiva**, **Acta de asamblea**, **Registro mercantil**, **Concesión minera**, **Permiso ambiental**, **Contrato**, **Solvencia**, **Poder o autorización** y **Otro documento**.

**Qué formatos admite: PDF, JPG, PNG y WEBP.** Cualquier otro no se puede elegir.

**Qué tamaño admite: hasta 50 MB.** Si el archivo se pasa, debajo aparece en rojo el nombre, su peso y el aviso de que pasa del tope, y el botón se apaga. El límite está puesto en 50 MB porque un acta escaneada con firmas y sellos pesa de verdad — la alianza con la Gobernación son 17 MB —; el tope existe para que nadie suba un vídeo, no para pelear con un escáner.

#### Corregir un documento sin volver a subirlo

**Sí se puede, y es lo normal.** Pulse el lápiz: **Cambia lo que haga falta. El archivo solo se toca si se sube uno nuevo.**

Se pueden cambiar el tipo, el nombre, las fechas y la nota sin que el archivo se mueva. El campo del archivo cambia de etiqueta a **Reemplazar el archivo** y queda opcional: **Déjalo vacío y se queda el que ya está. Solo elige uno si llegó una versión nueva del papel.** Con papeles de diecisiete megas, esa diferencia es la que hay entre corregir una fecha y no corregirla nunca.

Si sí eliges un archivo nuevo, el viejo se borra solo.

Ten cuidado con una cosa: **la fecha de vencimiento no puede ser anterior a la de emisión**, y el sistema lo rechaza. El aviso que aparece en ese caso todavía no está escrito en lenguaje llano, así que si al guardar sale un mensaje que no se entiende, revisa primero esas dos fechas.

#### Quitar un documento

Pulse la papelera. La ventana nombra el documento y lo dice sin rodeos: **… y también el archivo. Esto no se puede deshacer: si es el único ejemplar que queda, tendrá que volver a escanearlo.** Confirme con **Quitar**.

#### Ver y descargar

Pulsa **Ver** y el papel se abre a pantalla completa, en una ventana negra con el título arriba y el documento en el centro. Si es un PDF, desde ahí se puede pasar página, acercar e imprimir con los controles del navegador; si es una imagen —un acta fotografiada, por ejemplo— se ve entera y encajada en la ventana. Abajo hay dos botones, **Cerrar** y **Descargar**; la tecla **Escape** también cierra la vista.

En la lista, el icono de cada renglón dice cuál de las dos cosas es antes de pulsar.

Al descargar, el archivo se guarda con el nombre del documento y con la extensión que le corresponde —`.pdf` o la de la imagen—, y no con el nombre revuelto con el que estaba guardado, para que se pueda encontrar después en la carpeta de descargas.

**La dirección desde la que se abre deja de servir a los diez minutos.** No sirve para pasársela a nadie por mensaje: quien la reciba encontrará un enlace muerto. Si alguien necesita el papel, lo correcto es que lo abra desde el sistema con su propio usuario, y si no llega es porque su rol no debe verlo.

### 13.4 Auditoría

**Sistema › Configuración › Auditoría**

**Todo lo que se escribe en el sistema queda aquí, con la fecha, la hora y quién lo hizo. Esta pantalla la abre solo la administración.**

#### Qué registra

Todo lo que **se escribe**, en cinco clases de movimiento: **Creaciones**, **Modificaciones**, **Borrados**, **Entradas al sistema** y **Cambios de clave**. Se anota por debajo de las pantallas, así que da igual desde dónde venga el cambio: se escriba desde una pantalla, desde una operación automática o desde fuera del sistema, la línea queda anotada igual.

De cada movimiento guarda **cuándo**, **quién** — con el nombre que esa persona tenía ese día, no el de hoy —, **sobre qué**, una **referencia** que se pueda leer, **cómo estaba antes**, **cómo quedó después**, **qué cambió exactamente** y **desde qué dirección se hizo**.

Y hay cosas que **no** registra, cada una por su motivo. Conviene conocerlas, porque un hueco documentado no es un hueco: es una decisión que alguien puede discutir.

| Qué no registra | Por qué |
| --- | --- |
| Las consultas | Anota lo que cambia, no lo que se mira |
| El contador de los números de documento | |
| Las notificaciones | Leer un aviso no es un movimiento |
| Los renglones de los recibos de nómina | Serían cientos de líneas por una sola acción. El recibo y el período sí quedan anotados |
| Las claves | Que alguien cambió una clave sí se anota; cuál era, jamás |
| Las salidas del sistema | Se anota la entrada, no la salida: desde dentro no hay forma de distinguir «cerró sesión» de «se le venció la sesión», y escribir una por otra sería falso |

Y no hay nada anterior a su activación: **El registro empieza a llenarse desde que se activó. Lo que pasó antes de eso no está aquí, y no se puede inventar.**

#### Qué se ve

Arriba hay seis filtros:

| Filtro | Qué hace |
| --- | --- |
| **Buscar** | Texto libre. **Nombre, usuario, número de documento** |
| **Quién** | Empieza en **Cualquiera** |
| **Qué hizo** | Empieza en **Todo**. Opciones: **Creaciones**, **Modificaciones**, **Borrados**, **Entradas al sistema**, **Cambios de clave** |
| **Sobre qué** | Empieza en **Todo el sistema**. La lista se arma con lo que hay anotado |
| **Desde** | Fecha |
| **Hasta** | Fecha. Incluye el día entero elegido |

Debajo va el recuento — **Contando…**, **Ningún movimiento con estos filtros**, o el número de movimientos — y, si hay algún filtro puesto, el botón **Quitar filtros**.

La tabla tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Cuándo** | Fecha y hora |
| **Quién** | El nombre y, debajo, el nombre de usuario, tal como eran ese día |
| **Qué hizo** | **Entró al sistema**, **Cambió una clave**, o creó, modificó o borró algo |
| **Sobre qué** | La referencia legible, o el número de la fila, o **sin referencia**. Debajo, qué campo cambió o cuántos |

Se ven sesenta movimientos por página, con los botones **Anterior** y **Siguiente** y el número de página en medio.

El botón **Ver** de cada fila abre el detalle: **Usuario**, **Sobre**, **Referencia** y **Desde**, que es la dirección desde la que se hizo, o **no registrada**. Si fue una modificación, aparece la tabla **Lo que cambió** con las columnas **Campo**, **Antes** y **Después**. Si fue un alta, **Como quedó**, con todo el contenido. Si fue un borrado, **Lo que había antes de borrarlo**, también entero.

Aquí **solo se mira y se filtra**. No hay botones de crear, editar ni borrar, y tampoco hay exportación a Excel ni a PDF.

#### Quién puede verla

**Solo el rol de Administrador del sistema.** Es la única pantalla del sistema que exige un rol por encima de la matriz de permisos: no se puede dar «Auditoría en lectura» a nadie, porque no aparece en la matriz de módulos como un permiso repartible.

Quien llegue escribiendo la dirección a mano ve una tarjeta: **Esto lo ve la administración**, con el texto **Solo para el rol de administrador.**

El motivo es el contenido, no la desconfianza. Los demás módulos se reparten sin problema: a alguien de tesorería se le puede dar Nómina en lectura. La auditoría no se reparte, porque es el registro de lo que ha hecho todo el mundo — incluida la propia administración — y quien la lee ve de una sentada los sueldos, las cédulas y las cuentas bancarias que pasaron por el sistema. Eso no es un permiso más: es una llave aparte.

El candado está puesto dos veces, y la segunda no sobra. Aunque alguien lograra abrir la pantalla, no recibiría ninguna línea; pero una pantalla vacía se lee como «no ha pasado nada», que en un registro de auditoría es exactamente la mentira que no puede contar. Por eso la pantalla ni siquiera se abre.

#### Por qué no se puede modificar ni borrar

Ninguna línea de la auditoría se cambia y ninguna se borra. No hay un botón para hacerlo, no hay una pantalla para hacerlo, y quien lo intente desde fuera choca con el mismo aviso: **El registro de auditoría no se modifica ni se borra. Es lo único que lo hace valer.**

La frase resume la razón entera, y conviene leerla despacio. Un registro que se puede editar o borrar no sirve para lo único que existe. Quien quisiera tapar algo tendría que empezar por tapar la prueba de que lo hizo, y eso es justamente lo que aquí no se puede.

Conviene decir también lo que no es. **La auditoría no está para vigilar a las personas.** Está para que las cifras se puedan sostener. Cuando el saldo de una cuenta no cuadra, cuando una existencia no aparece, cuando alguien pregunta por qué una orden se aprobó por ese monto, la respuesta no puede ser el recuerdo de nadie: tiene que ser una línea con fecha, hora y nombre. Sin ese registro, cualquier número del sistema es una afirmación que hay que creer. Con él, es un dato que se puede revisar.

De ahí sale otra decisión que a primera vista parece un descuido: **el registro no está atado a la ficha de los usuarios.** Es a propósito. Si lo estuviera, inactivar o modificar a una persona podría arrastrar su rastro, y el rastro de quien ya no está es justo el que hace falta el día que se investiga algo.

### 13.5 Respaldo de la base

**Configuración › Respaldo de la base**

Una copia de todos los datos del sistema, para guardarla fuera de aquí. Conviene bajarla antes de cualquier carga grande.

#### Quién puede

**Solo quien tenga el rol Respaldo de la base.** No lo abre nadie más, y **tampoco lo abre quien administra el sistema por el hecho de administrarlo**: en todo lo demás el administrador pasa por encima de la matriz de permisos, y aquí a propósito no. «Puede administrar el sistema» y «puede llevarse todos los datos de la empresa en un archivo» no son la misma autorización.

Un administrador sí puede otorgarse ese rol desde Usuarios y roles —esa llave no se le puede quitar sin dejar el sistema sin salida de emergencia—, pero tiene que hacerlo, y ese movimiento queda escrito en la auditoría con su nombre.

Quien entre sin el rol ve la pantalla, no el botón, y una explicación de por qué.

#### Qué lleva y qué no

**Lleva todos los datos**: personal, inventario, compras, ventas, tesorería, nómina y la bitácora de auditoría completa.

**No lleva las contraseñas.** Viven cifradas en otro sitio que el respaldo no toca. Al restaurar hay que volver a crear los usuarios.

**No lleva la estructura de la base**, que son las migraciones del repositorio. La pantalla lo dice en **Para reconstruir la base**: hacen falta las dos cosas y en ese orden —primero la estructura, después este archivo, que son los datos—.

#### Cómo se descarga

Pulsa **Descargar respaldo**. Una ventana repite qué es lo que va a bajar y hay que confirmarlo. El archivo se llama `respaldo-lacantera-AAAA-MM-DD-HHMM.sql`, con la fecha delante para que se ordenen solos en la carpeta cuando ya haya varios.

La pantalla dice cuántas tablas tiene la base, cuántas filas tiene aproximadamente, y cuándo fue el último respaldo y quién lo bajó.

#### Cuidado con este archivo

**Es el archivo más delicado que produce el sistema.** Lleva juntas las cédulas, los sueldos y las cuentas bancarias de todo el personal, los precios, los clientes y la bitácora entera. Todo lo que aquí dentro está repartido por permisos, ahí queda junto y **sin ninguna protección**: quien lo abra lo ve todo.

Guárdalo donde guardarías el libro de nómina en papel. No lo mandes por correo ni lo dejes en la carpeta de descargas de una computadora que usa más gente.

**Cada descarga queda anotada en la auditoría**, con el nombre de quien la pidió, la fecha y la hora.


### 13.6 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: Administrador del sistema. Su usuario no tiene ese rol.» | Estás en la pantalla pero sin el rol que la maneja | Pide a administración que lo haga, o que te dé el rol |
| «Está viendo esta pantalla en solo lectura. Crear usuarios y cambiar permisos lo hace quien tiene el rol de administrador del sistema.» | Aviso, no error: se puede consultar pero no cambiar | Si necesita un cambio, pídalo a administración |
| «Asigne al menos un rol. Un usuario sin roles no puede hacer nada.» | Se intentó guardar un usuario sin marcar ningún rol | Marque al menos uno. **Solicitante** es el mínimo de cualquier supervisor |
| «El usuario "p.ramirez" no es válido: de 3 a 32 caracteres, solo letras, números, punto, guion y guion bajo.» | El nombre de usuario tiene caracteres que no se admiten | Escríbalo con letras, números, punto y guion, sin espacios ni tildes |
| «El usuario "p.ramirez" ya existe.» | Ese nombre de usuario está ocupado | Elija otro. Si la persona ya tiene cuenta, búsquela en la lista y reactívela |
| «El usuario necesita un nombre.» | Falta el nombre y apellido | Escríbalo |
| «La clave debe tener al menos 8 caracteres.» | La clave inicial es demasiado corta | Pon una de ocho caracteres o más y dásela en persona |
| «Un usuario sin roles no puede hacer nada. Desactívelo en vez de dejarlo sin roles.» | Le quitó todos los roles a alguien que sigue activo | Si ya no trabaja aquí, inactívelo desde el botón del muñeco |
| «No puede desactivar su propio usuario.» | Estás intentando cerrarte la puerta a ti mismo | Que lo haga otro administrador |
| «Es el único administrador activo. Nombre otro antes de desactivarlo.» | Quedaría el sistema sin nadie que lo administre | Déle el rol de administrador a otra persona y repita |
| «Es el único administrador activo. Nombre otro antes de quitarle el rol.» | Lo mismo, quitando el rol en vez de desactivar | Nombre a otro administrador primero |
| «El administrador tiene acceso completo por definición y no se puede recortar.» | Se intentó mover las casillas del rol de administrador | No se pueden mover: es la salida de emergencia del sistema |
| «El código de un rol va en mayúsculas, sin espacios y con al menos tres letras. Por ejemplo: SUPERVISOR_PATIO.» | El código del rol nuevo no tiene la forma admitida | Escríbalo en mayúsculas, con guion bajo en vez de espacios |
| «El rol necesita un nombre.» | Falta el nombre del rol | Escríbalo: es lo que se lee en la tarjeta |
| «El rol "TESORERIA" es del sistema y no se puede borrar. Quíteselo a quien no deba tenerlo.» | Los roles del sistema no se borran | Quíteselo a quien no deba tenerlo, desde su ficha |
| «El rol todavía lo tienen 3 usuario(s). Quíteselo antes de borrarlo.» | El rol está en uso | Quíteselo a esas personas y vuelva a intentarlo |
| «Esta acción la realiza: Administrador del sistema o Gerente general. Su usuario no tiene ese rol.» | Los datos de la empresa y los documentos legales los cambian esos dos roles | Pídalo a la gerencia o a administración |
| «Solo la gerencia y quien administra el sistema pueden cambiar estos datos.» | Ve los datos de la empresa pero no los puede tocar | Pide el cambio a quien corresponda |
| «La razón social no puede quedar vacía.» | Falta la razón social | Cópiela del registro, tal como está inscrita |
| «El RIF "J-5020917" no tiene forma de RIF. Debe ser como J-50209170-0.» | El RIF está incompleto o mal escrito | Cópielo del comprobante, con la letra, el guion y el dígito final |
| «Póngale nombre al documento. Una lista de archivos sin nombre no se consulta.» | Falta el nombre del papel | Póngale el nombre con el que lo buscarían dentro de un año |
| «Falta el archivo.» | Se está cargando un documento nuevo sin elegir archivo | Elija el archivo. Al corregir uno ya cargado sí se puede dejar vacío |
| «acta.pdf · 62,3 MB — pasa del tope de 50 MB.» | El archivo pesa más de lo admitido | Escanéalo con menos resolución, o divídelo, y vuelve a intentarlo |
| «No se pudo subir el archivo: …» | La carga se cortó | Revise la conexión y repítala. Lo que no subió, no quedó |
| «No se pudo abrir el documento: …» | La dirección del papel no se pudo preparar | Recargue la pantalla y pulse **Ver** otra vez |
| «No se pudo preparar el documento.» | El visor no logró mostrar el papel | Cierra la vista y vuelve a abrirla. Si sigue, avisa a quien administra el sistema |
| «Esto lo ve la administración» | Llegaste a la Auditoría sin el rol de administrador | La auditoría no se reparte. Pide lo que necesites saber a quien administra el sistema |
| «El registro de auditoría no se modifica ni se borra. Es lo único que lo hace valer.» | Se intentó cambiar o quitar una línea del registro | No hay forma de hacerlo, ni la habrá. Es lo que sostiene las cifras |
| «Su usuario no tiene permiso para esta acción.» | Falta el permiso sobre el módulo | Pida el permiso a administración |
| «No hay conexión con el servidor. Revise la red e inténtelo otra vez.» | Se cayó el internet | Reintente cuando vuelva la señal. Lo que no se guardó, no quedó |

---

## 14. Las reglas que el sistema impone

Estas son las reglas que explican la mayoría de los casos en que el sistema no le deja avanzar. **No son fallas.** Cada una está puesta a propósito, y aquí se explica por qué.

### 14.1 Lo que se registra, se queda

Un movimiento de inventario no se modifica ni se elimina. Una nómina pagada no se anula. Una factura anulada se queda con su número. Un cobro anulado no desaparece: queda anulado y a la vista.

La razón es la misma en todos los casos. Si un dato se puede borrar, ningún número del sistema significa nada, porque siempre cabe la sospecha de que alguien arregló lo que no cuadraba. Corregir consiste en **escribir un movimiento nuevo que explique la corrección** —un reverso, un ajuste, una nota de crédito—, de modo que el error y su arreglo queden los dos visibles. Hasta un vale de combustible que se corrige conserva su número y queda marcado **Corregido**, con quién y cuándo.

Es más incómodo. También es lo único que hace que las cifras se puedan defender frente a un auditor, un socio o el SENIAT.

### 14.2 Una sola puerta para cada cosa

Un pesaje de la romana se usa en un solo despacho. Una guía de movilización ampara un solo viaje. Una salida deja una sola nota de entrega. Una nota de entrega que espera en una factura por autorizar no entra en otra.

Todas estas reglas dicen lo mismo de formas distintas: **dos puertas al mismo sitio es como se cuenta dos veces lo mismo**. Un ticket usado dos veces es un camión que pesó una vez y salió dos.

Cuando algo queda libre otra vez —al anular una nota, el ticket y la guía vuelven a quedar disponibles— es porque el hecho físico sigue siendo cierto: el camión se pesó igual.

### 14.3 Cada documento guarda su tasa

Un documento emitido hoy conserva para siempre la tasa de hoy. Si mañana el BCV publica otra, ese documento no cambia. Una nota de crédito toma la tasa de la factura que corrige, no la del día.

Esto elimina de raíz un problema clásico: que el informe en bolívares y el informe en dólares dejen de cuadrar entre sí. No pueden desincronizarse, porque cada línea lleva su propia tasa congelada.

### 14.4 No se saca lo que no hay

Ninguna operación puede dejar una existencia por debajo de cero: ni una salida, ni un traslado, ni un despacho, ni deshacer una entrada o una devolución.

Una existencia negativa no es un dato: es un error que alguien va a tener que deshacer más adelante, cuando ya nadie recuerde de dónde salió. Es preferible detenerse en el momento y registrar la entrada que falta.

### 14.5 Los documentos se numeran solos

Los números de los documentos los pone el sistema, en orden y sin repetir: el prefijo, el año y cuatro dígitos, como **NE-2026-0001**. Se reinician cada enero. Nadie los escribe a mano. El número de control de las facturas y las notas de crédito es la excepción: es una sola serie que no se reinicia (10.10).

Dos personas registrando al mismo tiempo nunca obtienen el mismo número. Y un documento que se anula se queda con su número.

### 14.6 Dos personas pueden trabajar a la vez

Cuando dos personas intentan actuar sobre el mismo documento, el mismo material o el mismo pesaje en el mismo instante, el sistema atiende a una y detiene a la otra con un aviso. Nunca deja que las dos avancen.

Es lo que impide que dos personas aprueben el mismo despacho, que dos despachos se lleven el mismo material del patio, o que un ticket de romana se gaste dos veces. Si le toca recibir el aviso, no perdió nada: vuelva a abrir el documento, compruebe cómo quedó y siga desde ahí.

### 14.7 Todo queda registrado

Cada operación guarda quién la hizo y cuándo. El registro de auditoría no se puede modificar ni borrar, y solo lo abre la administración (13.4).

No es vigilancia sobre las personas. Es lo que permite responder una pregunta concreta —quién autorizó este pago, quién anuló esta nota, quién cambió este precio— sin que la respuesta dependa de la memoria o la buena voluntad de nadie. Un sistema donde no se puede responder eso no sirve para controlar nada.

### 14.8 Las excepciones se conceden, pero se anotan

Hay **dos maneras** de salirse de una regla, y conviene no confundirlas.

**La primera es por control total sobre el módulo.** Algunas reglas admiten excepción para quien tenga el escalón más alto: facturar a crédito por encima del límite del cliente, o corregir un vale de combustible de otro día. La facultad viene del nivel de permiso.

**La segunda es por una casilla**, que no viene del nivel sino de que alguien le dio a una persona una facultad concreta: vender por debajo del precio mínimo o dar un renglón sin cargo, aprobar despachos, autorizar facturas. Y entre las casillas, **los permisos extendidos**, que se prestan a una persona y por un plazo: aprobar una compra sin ser el gerente general es el caso típico. Está contado en 13.1.

**Todas quedan registradas en la auditoría**, con el nombre de quien actuó. Nunca pasan en silencio.

**Y el permiso extendido deja además rastro en el papel.** Quien aprueba una compra con un permiso prestado no firma como si fuera suyo: la orden impresa dice **Bajo autorización de** seguido del nombre de quien se lo extendió, y el sistema le pide subir el papel que lo respalda. **El respaldo se pide solo ahí**: a quien actúa por su puesto no se le pide nada, porque no hay nada que justificar.

### 14.9 Sobre la separación de funciones

La regla es que quien pide algo no sea quien lo aprueba. **En tres sitios la impone el sistema**, comparando quién es quién:

- **Un despacho** no lo aprueba quien lo pidió (10.6).
- **Una solicitud de salida** no la aprueba quien la pidió (26.2).
- **Una factura** no la autoriza quien la preparó (21.2).

En los tres, el sistema responde aunque la persona tenga la casilla: «Una factura no la autoriza quien la preparó.»

**En compras, no.** Al aprobar una compra el sistema no compara identidades, así que una persona con los dos permisos —pedir y aprobar— puede recorrer sola el circuito. Tampoco compara a quien aprueba con quien recibe el material.

Se dice aquí con claridad porque es la diferencia entre un control real y uno supuesto. Donde el sistema no lo impone, la protección consiste en **no darle a la misma persona el permiso de pedir y el de aprobar**, y en revisar la auditoría con regularidad. El capítulo 13 explica cómo se reparten los permisos.

---

## 15. Lo que el sistema no hace, y dónde tener cuidado

Este capítulo reúne lo que el sistema **no hace** y los puntos donde conviene tener cuidado, para que nadie organice su trabajo contando con algo que no puede hacer.

Lo que hoy está escondido del menú —Despachos entero y tres pantallas de Explotación— está explicado en 1.5 y no se repite aquí: **este capítulo habla de lo que falta, no de lo que está escondido.**

### 15.1 Puntos donde hay que tener cuidado

Estos no son cosas que falten, sino cosas que hoy pueden salir mal si nadie las sabe. Son las más importantes del capítulo.

**Una compra se puede pagar dos veces por caminos distintos.** El dinero puede salir por la instrucción de pago de la orden, en **Pagos por hacer**, y también por el pago registrado sobre la factura del proveedor. Los dos descuentan de una cuenta real y **el sistema no los cruza**: si la orden ya se pagó por su instrucción, su factura nace debiendo el total igual. Las dos pantallas lo avisan, pero no lo impiden. Hasta que eso se cruce, conviene acordar en la empresa un solo camino y usar siempre ese. La compra directa no tiene el problema: su factura nace ya descontada.

**El sistema pregunta con qué entrega el proveedor, pero no comprueba que se cumpla.** Antes de pagar hay que declarar si entrega **Nota de entrega** o **Factura**, y sin eso no se puede pagar. Lo que no hay es una pantalla que enseñe cuáles prometieron factura y no la registraron. El cotejo sigue siendo trabajo de la oficina.

**Con qué entrega el proveedor no se corrige desde la pantalla.** Se declara una vez, en la ficha de la compra, y después solo se lee. Si una orden quedó sin declarar, la pantalla no ofrece dónde hacerlo, y esa orden no se puede pagar.

**Una factura de proveedor cubre una sola orden.** Si el proveedor factura dos órdenes en un mismo papel, el sistema no lo puede registrar.

**Liquidar va antes que dar de baja.** Los botones **Liquidar** y **Anticipo** de prestaciones solo aparecen mientras la persona está activa. El camino es liquidar y después **Pagar y dar de baja**, que la saca de la nómina en el mismo paso. Si se le da de baja por otro lado antes de liquidar, la liquidación ya no se puede calcular desde la pantalla. Y **dar de baja no le cierra la entrada al sistema**: si la persona tenía usuario, se desactiva aparte, en **Configuración › Usuarios y roles**.

**El anticipo de prestaciones se puede descontar dos veces.** Existe como concepto en las novedades del período y también como operación propia en la pantalla de prestaciones, y la liquidación solo ve el segundo. Si se carga por los dos lados, se descuenta dos veces. Use uno solo.

**Las tasas se registran solas, y solo se enmiendan el mismo día.** El sistema toma varias veces al día el dólar y el euro que publica el BCV, y el USDT del mercado entre particulares de Binance. El USDT es una referencia de mercado, no una publicación con respaldo: conviene mirarlo en **Tasas de cambio** el mismo día, porque pasado ese día una tasa ya no se enmienda. Si la toma del USDT se frena —porque falta el dólar del día o la cifra se sale de lo razonable—, los documentos se valoran con la última registrada, y la pantalla lo dice.

### 15.2 Lo que falta dentro de módulos que sí funcionan

**Costo de producción.** Lo que entra al inventario por producción entra valorado en cero. **Centro de costo** ya calcula un **Costo por m³** y un **Precio sugerido por m³**, pero solo con lo que hoy tiene de dónde salir —la propia tarjeta dice qué incluye—: la nómina y el combustible no entran. Y ese costo no pasa al inventario. Consecuencia práctica: **el valor en dólares del material producido no es una cifra en la que apoyarse.**

**En Compras.**

- No hay matriz de aprobación por monto: toda compra del tablero necesita una sola aprobación, valga lo que valga, y la **Compra directa** —que registra una compra ya hecha— no pasa por aprobación.
- La factura del proveedor nace desde la ficha de su compra y lleva su orden dentro, pero **el sistema no cruza las cifras**: no compara lo pedido con lo recibido y lo facturado. Ese cotejo lo sigue haciendo la persona.
- La **Retención de IVA** se propone sola al elegir el proveedor, si está marcado como contribuyente especial. La de ISLR se escribe a mano. **No se imprime comprobante de retención.**
- Lo que se debe por facturas no llega a **Compras › Pagos por hacer › Por proveedor**, que lee solo las instrucciones de pago de las órdenes.
- Se imprimen la orden de compra, las cotizaciones recibidas y el comprobante de pago. **El tablero, no.**

**En Inventario.** Un artículo se puede corregir y borrar, pero **su código no se escribe a mano**: es con lo que se pide en el almacén y ya está impreso en lo emitido. Si el artículo cambió de categoría y el prefijo ya no le cuadra, el botón **Ponerle el código que le toca** lo renumera, mientras no haya salido en ningún papel. **Borrar solo funciona mientras nada lo haya tocado**; en cuanto aparece en una orden o en un movimiento, el camino es desactivarlo. El administrador tiene además **Eliminar duplicado**, para el artículo repetido que solo tiene movimientos: los reversa y lo desactiva, sin generar ninguna salida.

**En Despachos**, hoy escondido (1.5). El sistema comprueba el cliente, el tipo, el estado y la vigencia de los papeles, pero **no compara cifras**: ni las toneladas de la guía contra los renglones, ni el peso neto del ticket contra la nota —salvo cuando la nota lleva un solo renglón en toneladas, que toma el neto de la romana—. Cuadrar eso sigue siendo trabajo de la persona. Además, la nota despachada sin guía **no se marca en ninguna pantalla**.

**En Facturación.** **No hay nota de débito**, que es el papel contrario a la de crédito: para cobrarle de más a un cliente al que se le facturó de menos, hoy hay que emitir otra factura. La factura directa admite descuento en cada renglón, pero no un descuento sobre el total. **La nota de crédito no se imprime**: se registra, entra en el libro de ventas y lleva su número de control propio, pero el papel que se le entrega al cliente se hace por fuera.

**La factura impresa no está completa ante el SENIAT.** Tiene el número, el número de control, el RIF de las dos partes, la dirección del cliente, la fecha, el vencimiento, la condición de pago, la retención, la tasa del día, la **base imponible** y el **total exento** (21.2), y el IGTF cuando corresponde. **Le falta el desglose por alícuota**: cada factura lleva una sola alícuota, así que una factura mixta no se puede expresar.

**Los datos de la imprenta y la alícuota general del IVA se escriben** en **Configuración › Datos de la empresa**, y la factura los imprime (21.2).

**En Nómina.** Aunque la mayoría de los parámetros se cargan en pantalla, **algunas cifras de ley de las prestaciones están escritas por dentro** y no se pueden corregir desde ninguna pantalla: si la ley cambia, hay que pedir que las cambien. **Desde la ficha del trabajador no se registra dotación ni asignación**: sus tarjetas **Dotación** y **Asignación** son de solo lectura, y el botón **Entregar** manda a otra pantalla, que abre en asignación aunque se pulse desde la dotación. Lo que sí funciona es que **la persona ya llega puesta** cuando se entra desde la dotación (18.4). Y una ausencia anotada como incidencia **no descuenta sola de la nómina**.

**En las incidencias del personal.** Si se elige un tipo que no pide reposo —**Conflicto**, **Llegada tarde** u **Otra**— y a la vez se marca **Varios días**, el campo de los días de reposo no se dibuja y el guardado falla con un mensaje que no dice por qué: «La base no admite ese valor. Revise los datos de la operación; si no escribió nada, avise a soporte.» **Para varios días, use un tipo que pida reposo.** Anotar la duración en el motivo solo sirve si no se marca **Varios días**.

**El combustible que entra sin costo abarata lo que sale de su tanque.** Lo trasladado desde otra empresa del grupo se carga con la casilla **Sin costo** y entra en cero, en un tanque aparte que no admite lo que tiene precio. Mientras esté en cero, **el costo por máquina de lo que salga de ese tanque queda por debajo de lo que de verdad cuesta**. El tanque aparte impide que contamine al resto (20.6), pero no inventa la cifra que falta. Si algún día se sabe lo que se pagó, se puede poner con **Corregir el costo** en **Inventario › Existencias**, que pide un permiso propio; lo que ya salió a cero no cambia.

**El 3 % de obra social de la alianza se guarda y no se calcula.** El convenio con la Gobernación tiene tres porcentajes: 14 % para la Gobernación, 86 % para la empresa y un 3 % sobre los ingresos netos destinado a obra social. Los dos primeros los calcula la base, pero **ninguna pantalla los enseña todavía**; el tercero está guardado y no lo aplica nadie. Como 14 y 86 ya suman cien, ese 3 % no sale del mismo bruto: o sale de la parte de la empresa, o es una obligación aparte, y eso en el sistema no está resuelto.

**En Tesorería.** No hay conciliación bancaria: ninguna pantalla cruza el libro con el estado de cuenta del banco. Lo más cercano es **Ajustar el saldo**, en **Bancos y cajas**, que deja escrita la diferencia a mano. Tampoco se calcula el diferencial cambiario; lo que sí existe es la tasa congelada en cada línea.

### 15.3 Detalles de la pantalla que conviene conocer

- **Mantener sesión abierta**, en la pantalla de entrar, no cambia nada: la sesión se guarda siempre, se marque o no.
- **Olvidé mi contraseña** no lleva a ninguna parte. La clave la repone la administración, desde **Configuración › Usuarios y roles**.
- **Las cifras del panel son reales**: salen de lo registrado en el sistema, y ninguna es de ejemplo.
- **Las listas largas se cortan en los registros más recientes.** No tienen páginas —la única que las tiene es Auditoría—, pero muchas tienen filtro de fechas, y acotando las fechas se llega a lo antiguo. Los topes que más se notan:

| Lista | Cuántos enseña |
| --- | --- |
| **Inventario › Existencias › Movimientos** | Los 1000 más recientes, y avisa si hay más |
| **Salidas y traslados › Historial** | Los 200 más recientes, y avisa si hay más |
| **Compras › Recepciones** y **Tesorería › Libro de tesorería** | 200 |
| **Facturación** (facturas, notas de crédito y notas de entrega), **Ventas › Cotizaciones**, **Salidas y traslados › Salidas** y los vales de **Combustible** | 200 |
| **Salidas y traslados › Traslados**, **Compras › Historial de directas** y **Maquinaria › Historial de taller** | 300 |
| **Compras › Proveedores › Facturas recibidas** | 400 |
| El historial de **Tasas de cambio** | 60 por moneda |

- **Qué se descarga hoy.** Casi todo papel del sistema baja en PDF: la orden y las cotizaciones de compra, el comprobante de pago, la cotización de venta, la factura, la nota de entrega, la nota de salida y la de traslado, el vale de combustible, la constancia de entrega, el acta de existencias y el libro de movimientos, los recibos de pago, la ficha y la constancia del trabajador, el carnet —también en imagen—, el organigrama, el cierre de caja, los reportes de tesorería y el registro de viajes. En hoja de cálculo bajan los libros de compras y de ventas, el cierre de tesorería, el pago de viajes y el registro de auditoría; en Excel, la planilla de control de despacho, los visitantes, los contactos y las plantillas de carga. Los contactos bajan además como tarjetas para el teléfono. **El respaldo de la base baja comprimido en .zip**, y también se puede mandar por correo. **La nota de crédito no tiene papel.**


---

## 16. Preguntas frecuentes

**¿Puedo usar el sistema desde mi teléfono?**
Sí. Solo hace falta un navegador e internet, con el mismo usuario y la misma clave. No hay aplicación que instalar. El teléfono está pensado para el trabajo de patio —el surtidor de combustible tiene su propia vista de teléfono (20.4)—; las tareas de oficina, como procesar la nómina o aprobar compras, son más cómodas en la computadora.

**Se me fue el internet mientras registraba algo. ¿Se perdió?**
Si no llegó a guardarse, sí. El sistema necesita conexión para guardar y no trabaja sin señal. Vuelva a registrarlo cuando vuelva el internet.

**Busco un módulo en el menú y no está. ¿Se borró?**
No. Cada persona ve solo los módulos sobre los que tiene permiso (3.1), y además hay unas pocas pantallas que no están en el menú para nadie. El apartado 1.5 trae la lista entera del menú y dice cuáles son esas.

**Escribí la dirección de una pantalla y me salió «En construcción».**
Es lo previsto: esa pantalla existe, pero no está en el menú, y lo que se haga ahí puede perderse o no cuadrar con el resto. No es un problema de permisos: pedir el permiso no lo cambia.

**¿Por qué no veo el mismo menú que mi compañero?**
Porque tienen permisos distintos. Cada quien ve los módulos que necesita para su trabajo. No es una falla.

**¿Cómo llego rápido a una pantalla sin recorrer el menú?**
Con **Ctrl+K**, en cualquier momento. Encuentra pantallas y también documentos: el número de una orden de compra, el RIF de un proveedor, la cédula de un trabajador, la placa de un camión. Y entiende cómo habla la gente: «convertir» lleva a la calculadora de tasas, «stock» a Existencias, «gasoil» a Combustible.

**Entré y no veo ningún módulo.**
Su usuario existe, pero todavía no tiene permisos asignados. Pídaselos a la administración.

**Veo la pantalla, pero no me aparece ningún botón para registrar.**
Su permiso sobre ese módulo es de consulta. Ver y registrar son dos permisos distintos.

**Me aparece un botón, lo pulso y el sistema me dice que no tengo permiso.**
Pasa: algunos botones se ven aunque la acción pida algo más. El mensaje dice qué falta —un rol, una casilla o un nivel— y eso es lo que se pide a la administración.

**¿Los precios se escriben con punto o con coma?**
Con lo que tenga a mano: **el sistema entiende las dos**. Escriba «3,20» o «3.20», guarda tres con veinte. En Venezuela el decimal es la coma, y el teclado del teléfono la ofrece.

**Pegué «1.500,25» copiado de una factura y salió bien. ¿Y «1.500» a secas?**
Cuando hay dos separadores, el decimal es el último y el otro es de millar: «1.500,25» son mil quinientos con veinticinco. Pero **«1.500» a secas el sistema lo lee como uno y medio**, porque con un solo separador manda el decimal, y no hay forma de acertar siempre. **Para mil quinientos, escríbalo sin punto: 1500.**

**En un campo de número no me deja escribir letras.**
Es a propósito. Esos campos aceptan cifras, un solo separador decimal y el signo menos delante, y nada más.

**Se perdió el carnet de un trabajador. ¿Qué hago?**
Entre en su ficha, tarjeta del carnet, y pulse **Se perdió: anular y emitir otro**. Sale uno nuevo con un código nuevo, y **el anterior queda anulado**: si alguien lo encuentra y lo escanea, la página dirá que no vale. Si el carnet no se perdió y solo hace falta otra copia impresa, use **Imprimir el carnet**, que no anula nada.

**¿Puedo mandar a la imprenta un solo reverso para todos los carnets?**
**No.** El reverso lleva el código QR que identifica a esa persona, así que cada uno es distinto. Un reverso repetido haría que todos los carnets apuntaran al mismo trabajador.

**Un dato está mal. ¿Lo corrijo?**
Depende de qué sea. Los catálogos —clientes, proveedores, almacenes— se corrigen normalmente. Los movimientos y los documentos ya emitidos no se editan: se corrigen con un documento nuevo que explica la corrección (14.1). Si no tiene claro cuál es el caso, pregunte antes de tocar nada.

**Me equivoqué al crear un artículo. ¿Lo borro?**
Se corrige con el lápiz del catálogo. Y se puede borrar **solo mientras nada lo haya tocado**: en cuanto aparece en un documento o en un movimiento, el sistema responde «Este artículo ya se usó en documentos o movimientos, así que borrarlo dejaría esa historia sin sentido. Desactívelo: deja de ofrecerse en los formularios y lo ya emitido sigue cuadrando.» Aun así, conviene revisar el nombre y la unidad antes de guardar.

**Tengo que cargar cien artículos. ¿Uno por uno?**
No. Con el botón **Cargar por planilla** del **Catálogo de artículos**: se baja la plantilla, se llena en Excel, se sube y el sistema enseña qué va a pasar con cada fila antes de escribir nada. Sirve también para corregir los que ya están. Está en 7.10.

**Tengo diez cascos, pero no me deja entregar ninguno.**
Porque están todos en manos de alguien. Existir y estar disponible no es lo mismo: lo prestado sigue contando como existencia —es de la empresa— pero no se puede volver a entregar. En Existencias se lee **0 disponibles · 10 en manos de alguien**.

**¿Dónde veo todo lo que le ha pasado a un artículo?**
En su ficha. Se llega pulsando su fila en el **Catálogo de artículos**, y la tarjeta **Historial** lista todo desde que se creó —entradas, salidas, ajustes, traslados, entregas, devoluciones—, con la fecha y el nombre de quien lo registró (7.9).

**El sistema me dice que no hay material, pero yo lo estoy viendo en el patio.**
Falta registrar su entrada. Regístrela, o haga un conteo físico, desde **Inventario › Existencias** (7.4), y después repita la operación.

**¿Hace falta la guía de movilización para despachar?**
No en el sistema: es opcional. Si el despacho lleva guía, se elige al pedirlo (10.6).

**¿Quién puede ver lo que yo hago?**
Todo queda registrado: quién, cuándo y qué cambió. Ese registro lo consulta la administración (13.4). No es vigilancia sobre las personas: es el requisito que hace confiables las cifras de todos.

**¿Por qué el sistema no dice si me equivoqué en el usuario o en la clave?**
A propósito. Si lo dijera, cualquiera podría averiguar qué usuarios existen probando nombres.

**Nadie me tiene que pedir la clave.**
Ni la administración, ni sistemas, ni la gerencia. Nadie necesita su clave para hacer su trabajo. Si alguien se la pide, no la dé y avise.

---

## 17. A quién acudir

| Situación | A quién |
| --- | --- |
| No puedo entrar, olvidé la clave, no tengo permisos | Administración |
| La tasa del día está mal o no se ha cargado | Administración |
| Un dato de un documento está equivocado | A su supervisor, antes de tocar nada |
| Una cifra no cuadra y no sé por qué | A su supervisor |
| El camión espera y falta un papel | A su supervisor |
| El sistema muestra un error o se comporta raro | Sistemas |

Al reportar un problema a sistemas, la información que sirve es siempre la misma:

1. **En qué pantalla estaba.**
2. **Qué botón pulsó.**
3. **Qué decía exactamente el mensaje.**

Una fotografía de la pantalla ahorra media hora de ida y vuelta. Si el mensaje trae un número de documento, cópielo tal cual.

---

## 18. Asignaciones

**Va al final del documento y no entre el 7 y el 8, que es donde le tocaría por el menú.** El motivo es el mismo por el que los capítulos no se reordenan cuando un módulo entra o sale: meterlo en medio correría diez números debajo de quien tiene el manual impreso, y rompería las remisiones —«ver 11.9», «está en 13.2»— que hay repartidas por todo el documento.

Es lo que se le entrega a una persona: el casco, las botas, el uniforme, el juego de llaves para montar una banda. Y lo que pasa después: que vuelva, que se pierda, que se rompa, o que haya que descontarlo.

**Existir no es estar disponible.** Un casco prestado sigue contando como existencia —es de la empresa, nadie lo compró de nuevo— pero no se puede volver a entregar. Es la misma idea de 7.12 y aquí es donde se ve: la ficha de un artículo dice **0 disponible · 10 en manos de alguien**.

**Dotación y asignación no se distinguen por si vuelve, sino por para qué se dio.**

| | Qué es |
| --- | --- |
| **Dotación** | Lo que le toca por su cargo: casco, botas, uniforme, equipo |
| **Asignación** | Lo que se le dio para una faena concreta y hay que recuperar |

Una laptop es dotación y vuelve; unas mascarillas son dotación y se gastan; un kit de llaves para montar una banda es asignación. **Si un bien vuelve o no lo dice cada artículo en el catálogo**, en su campo **Al entregarlo a una persona** (7.8), y eso es un eje aparte.

### 18.1 Quién entra y quién puede entregar

Hay dos puertas y hoy dan el mismo resultado, pero salen de sitios distintos y conviene saberlo porque el día que alguien toque los permisos dejarán de coincidir.

**La primera es el permiso sobre Asignaciones**, el de la matriz que se reparte en Configuración (13.1).

**La segunda es el rol.** Los botones que entregan y que cierran casos solo se dibujan para **Almacén**, **Recursos humanos** y **Administrador**. No sale de la matriz: está escrito en la pantalla.

Hoy los dos conjuntos son el mismo, así que nadie ve un botón que luego le falle. **Si algún día administración le da escritura a otro rol y ese rol no ve los botones, no es una falla del permiso: es que la pantalla mira el rol.**

### 18.2 Quién tiene qué

**Operación › Asignaciones › Quién tiene qué**

La pantalla lo dice: *"Quién tiene qué, desde cuándo, y qué queda por entregar. Lo que vuelve no descuenta del almacén: el bien sigue siendo de la empresa."*

Dos filtros: **Buscar** —acepta el trabajador, la ficha, la cédula o el artículo— y **Almacén**. Si no hay nada que enseñar, la pantalla lo dice: **Sin bienes disponibles para asignar**.

La columna del estado dice en qué quedó cada cosa:

| Etiqueta | Qué significa |
| --- | --- |
| **Entregado** | Se gastó al usarlo. No hay nada que devolver |
| **En su poder** | Lo tiene, y se le va a pedir de vuelta |
| **Devuelta** | Ya volvió |
| **Perdida** | No apareció |
| **Dañada** | Volvió rota o dejó de servir |
| **Repuesta** | El caso se cerró: se le descontó, la repuso o se le exoneró |

Desde aquí se saca la **Constancia de entrega**, que es el papel que firma quien recibe.

### 18.3 Entregar a un trabajador

**No está en el menú.** Se llega por el botón de la cabecera de **Quién tiene qué**.

La pantalla lo resume: *"Varias cosas de una vez. Lo que vuelve queda a su nombre; lo que se gasta sale del almacén."*

1. En **A quién y de dónde**: el **Trabajador**, el **Almacén** del que sale y la **Fecha**. Si lo entregado hay que recuperarlo, se pone una **Fecha límite**.
2. En **Qué se lleva**, se escriben las cantidades. La ayuda lo dice: *"Deja en blanco lo que no se entrega."*
3. La **Nota** es opcional, y su ejemplo dice para qué sirve: *"Para qué frente, quién autorizó."*

Si el almacén elegido no tiene nada entregable, la pantalla lo dice en vez de enseñar una lista vacía: **Sin bienes disponibles en este almacén**.

**Se entrega de varias cosas a la vez a propósito.** Un trabajador que empieza se lleva casco, botas y uniforme en el mismo acto, y hacerlo en tres pantallas es tres veces la misma ficha.

### 18.4 Dotación por cargo

**Operación › Asignaciones › Dotación por cargo**

*"Qué le corresponde a cada puesto y cada cuánto se repone. De aquí sale la lista de a quién le toca hoy."*

Se define una vez por cargo y sirve para todos los que lo tengan. La ventana **Dotación del cargo** pide: **Cargo**, **Artículo**, **Cantidad**, **Frecuencia de reposición (meses)** y una **Nota**. Si todavía no hay ninguna, la pantalla dice **Sin dotación definida**.

Arriba está la tarjeta **A quién le toca ahora**, que es lo que se mira todos los días: quién debería tener algo y no lo tiene, o lo tiene vencido.

**Ojo con esta trampa, que hace perder tiempo:** esa lista **solo ve a quien tenga un cargo del tabulador en su ficha**. Un trabajador con el cargo escrito a mano, sin cargo del tabulador asignado, **no aparece nunca**, por mucha dotación que le corresponda. Si falta alguien en esa lista, lo primero que hay que revisar es su ficha en **Nómina › Personal**, no la dotación.

#### Entregar desde aquí

Hay dos caminos, y responden a dos formas de trabajar.

**Por la lista**, cuando se va bajando por los pendientes: cada persona lleva un botón **Entregar** en su primer renglón. Se lleva a la pantalla de entrega **con ella puesta y con todo lo que se le debe**, no solo el renglón que se pulsó — quien llega al almacén se lleva de una vez lo suyo, y tres botones iguales en tres renglones seguidos harían pensar que entregan cosas distintas.

**Por la persona**, cuando llega alguien concreto: el botón **Entregar a alguien**, arriba, que abre **Entregarle la dotación a alguien**. Se elige el **Cargo** —que es solo un filtro para acortar la lista, y se puede dejar en blanco— y después **A quién**. La ventana enseña lo que se le va a entregar antes de continuar.

| Si la persona… | Se propone |
| --- | --- |
| Debe algo | **Lo que se le debe ahora mismo** |
| Está al día | **Esto es lo que corresponde a su cargo**, por si hay que reponerle unas botas rotas antes de tiempo |
| No tiene cargo del tabulador | Nada: el sistema no sabe qué le toca. Se entrega a mano desde **Quién tiene qué** |

**Lo que le toca se rellena al elegir el almacén, no antes.** Lo que le corresponde por su cargo no tiene por qué estar en el almacén desde el que se entrega hoy, y **lo que no esté se dice**: sale un aviso con el nombre de lo que falta. Se le entrega lo que sí hay y el resto después.

**Las cantidades se pueden corregir.** Vienen propuestas, no impuestas: el sistema sabe qué le toca, no cuántas botas quedan en la caja.

### 18.5 Incidencias

**Operación › Asignaciones › Incidencias**

*"Bienes perdidos o dañados que siguen sin resolverse. Falta decidir qué pasa con quien los tenía."*

**No es lo mismo que las incidencias de la ficha del trabajador.** Aquí una incidencia es *un bien perdido o dañado*; allí (11.4) es *algo que le pasó a una persona* —una enfermedad, una ausencia, un conflicto—. Comparten palabra y nada más.

Al abrir un caso, la ventana lleva el artículo y el nombre, y arriba dice lo que costaba: **Costaba $ 45,50 el día que se perdió.** Hay que elegir una de tres:

| Opción | Qué hace |
| --- | --- |
| **Se le descuenta** | *"Va como deducción en la nómina del período."* |
| **La repuso** | *"Trajo otra. Entra al almacén por su recepción, no desde aquí."* |
| **No se le cobra** | *"Se rompió trabajando o se decidió no cobrársela."* |

La **Nota** *"queda en el registro de la asignación"*. Se cierra con **Cerrar el caso**.

#### Qué pasa de verdad al elegir «Se le descuenta»

Esto conviene entenderlo antes de pulsarlo, porque **sale del sueldo de una persona**.

El sistema **mete una deducción de verdad en la nómina**: por el costo del bien **en dólares**, en el último período que todavía admita cambios, y con una nota que deja rastro —el número de la asignación, el artículo, la cantidad y el motivo—, que es lo que se lee en el recibo.

Tres cosas que hay que saber:

**No se puede descontar lo que no tiene costo.** Si la herramienta no tiene costo calculado, el sistema no deja y lo dice: *«Esa herramienta no tiene costo calculado, así que no hay cuánto descontar. Sáldela con reposición o exoneración.»*

**Si no hay ningún período abierto, tampoco.** El mensaje es: *«No hay ningún período de nómina que admita cambios donde cargar el descuento. Abra el período, o sáldela con reposición o exoneración.»*

**Si el período ya está calculado, hay que volver a calcularlo.** La deducción entra igual, pero el recibo no la recoge hasta que se recalcule. El sistema no lo avisa: es cosa de quien lleva la nómina acordarse.

### 18.6 El módulo avisa solo

Asignaciones es de los pocos sitios del sistema que trabajan sin que nadie abra la pantalla. Hay dos avisos automáticos:

| Cuándo | Qué avisa | A quién |
| --- | --- | --- |
| **Todos los días** | Cada asignación cuya fecha de vuelta ya pasó y sigue sin devolver, con el número, la persona y los días de retraso | Almacén y administración |
| **Los lunes** | A quién le toca dotación y no la tiene | Almacén y administración |

**El aviso de retraso sale una sola vez por asignación**, no todos los días hasta que vuelva. Es deliberado: un aviso que se repite se deja de leer.

### 18.7 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esa herramienta no tiene costo calculado, así que no hay cuánto descontar. Sáldela con reposición o exoneración.» | El artículo no tiene costo | Ciérrelo como reposición o exoneración |
| «No hay ningún período de nómina que admita cambios donde cargar el descuento. Abra el período, o sáldela con reposición o exoneración.» | Ningún período en borrador ni calculado | Abra el período en Nómina, o cierre el caso de otra forma |
| «Esa asignación está … : solo se cierra lo que tuvo una incidencia.» —el estado va en el hueco— | El bien ya volvió, o nunca tuvo incidencia | No hay nada que cerrar |
| **Sin bienes disponibles en este almacén** | El almacén elegido está sin existencias entregables | Elija otro almacén, o cargue la entrada primero |
| No aparece el botón de entregar | Su rol no es Almacén, Recursos humanos ni Administrador | Pídalo a administración |

---

## 19. Maquinaria

Es la flota: cada excavadora, cada cargador, cada planta y cada camión, con lo que lleva trabajado y **cuánto le falta para su próximo mantenimiento**. La pantalla lo resume: **Equipos y camiones: uso acumulado, margen hasta el próximo mantenimiento y capacidad de carga.**

**La idea que hay que entender antes de nada es el horómetro.** Una máquina no se mantiene por calendario sino por horas de trabajo, y el sistema no las adivina: **alguien las anota**. De ahí sale todo lo demás: cuándo toca el taller, cuántos litros por hora consume, si vale lo que cuesta.

El menú **Maquinaria** tiene dos pantallas: **Equipos** e **Historial de taller**.

### 19.1 Quién entra y quién puede registrar

| Qué | Lo decide |
| --- | --- |
| Ver la flota, las fichas y el historial de taller | El módulo **Maquinaria** en la matriz de permisos (13.1) |
| Registrar y editar máquinas, anotar el horómetro, meterlas y sacarlas del taller, cambiar su estado | **Maquinaria** en escritura |
| Dar de alta y corregir un camión | **Maquinaria** o **Despachos** en escritura, o la casilla **Dar de alta y corregir un vehículo** |
| Asignar o traspasar el chofer de un camión | **Maquinaria** o **Despachos** en escritura, o su casilla |
| Poner la carga útil de un camión | La casilla **Poner la carga útil de un camión** |

A quien solo tiene lectura, cada máquina le ofrece **Ver** en vez de **Editar**, y no le aparecen los botones que escriben.

### 19.2 Equipos

**Operación › Maquinaria › Equipos**

Arriba, los botones **Historial de taller**, **Nueva máquina** —para excavadoras, cargadores, plantas, generadores y vehículos livianos, lo que lleva horómetro y taller— y **Nuevo camión** (19.7).

Si alguna máquina pasó su tope de horas, lo primero de la pantalla es el aviso de cuántas son.

#### Cómo se mira la flota

Debajo, tres mandos:

- **De quién**, si hay más de un dueño: **Todas** o cada empresa propietaria. Cambia lo que dicen las cifras, no solo la lista.
- **De qué clase**, si hay más de una: **Todo**, **Maquinaria** —lo que trabaja en la mina—, **Vehículo liviano** —lo que lleva gente y encargos; los camiones de carga van aparte— y **Equipo** —una planta, un generador—.
- **Cómo verla**: **Fichas** (cada equipo con su detalle y sus botones), **Lista** (una línea por máquina) o **Patio** (solo el código y cómo está, todo en una pantalla). No filtra nada: cambia cómo se mira lo mismo.

Después, una tarjeta por estado con cuántas máquinas hay en cada uno; pulsar una filtra la lista por ese estado. La de las activas avisa, si las hay, de cuántas pasaron su tope o cuántas hay que atender.

Y la barra de búsqueda: **Buscar** —por código, nombre, marca, serial, placa o transportista— y **Tipo**, si hay más de uno. Si hay máquinas que atender, el atajo **Ver solo las N que hay que atender** las deja solas; **Quitar los filtros** vuelve a todo. Al lado, la cuenta: cuántas máquinas se ven de cuántas, y cuántos camiones.

Sin máquinas registradas: **Sin máquinas registradas**, con **Cargar la primera**. Si la búsqueda no encuentra nada: **Sin resultados**. **Las máquinas desincorporadas solo se muestran al filtrar por ese estado.**

#### El semáforo de mantenimiento

Es lo primero que se mira, y ordena la lista: lo peor arriba.

| Semáforo | Qué significa |
| --- | --- |
| **Dentro del intervalo** | Casi no se ve: lo normal no debe llamar la atención |
| **Aviso**, en ámbar | Pasó el primer umbral. Hay que ir pensando en programarlo |
| **Alarma**, en naranja | Quedan pocas horas para el tope |
| **Tope superado**, en rojo y titilando | **No debería estar trabajando** |

**El rojo titila a propósito.** Una máquina que se pasó del tope sigue arrancando —el sistema no apaga motores— pero cada hora que trabaja así se paga después, y más cara.

#### El estado

Es otra cosa distinta del semáforo: el semáforo dice **si le toca taller**; el estado dice **dónde está**.

| Estado | Qué significa |
| --- | --- |
| **Activa** | Trabajando o asignada a un frente |
| **En espera** | Sana y disponible, sin asignar |
| **En el taller** | Dentro, con una orden abierta. Lo pone solo el taller (19.5) |
| **Fuera de servicio** | Averiada o parada sin fecha. No se puede mandar a trabajar |
| **Desincorporada** | Ya no es de la flota. Se conserva por su historial |

**Una máquina no se borra: se desincorpora.** Su historial —lo que consumió, lo que costó tenerla— es justamente lo que sirve para decidir sobre la siguiente.

**Cambiar estado** abre **Estado de** y la máquina: **Estado actual: … «Fuera de servicio» si se dañó; «desincorporada» si ya no es de la empresa.** Para fuera de servicio o desincorporada hay que escribir el **Motivo**, que **queda en la ficha de la máquina y se avisa a operaciones.** Una máquina en el taller no cambia de estado a mano: sale cerrando su mantenimiento.

#### Los botones de cada máquina

En la vista de fichas, cada máquina lleva su semáforo, su estado, el operador, cuántas horas lleva desde el último mantenimiento y la fecha de la última lectura, y los botones **Horómetro**, **Meter al taller** —o **Sacar del taller**, si está dentro—, **Cambiar estado** y **Editar**.

### 19.3 Anotar el horómetro

**Es la tarea diaria del módulo, y de ella depende todo lo demás.**

**Horómetro** abre la ventana de esa máquina: **Copie las dos lecturas del horómetro.** Se piden la **Fecha**, la lectura **Inicial** y la **Final**, y debajo se lee cuánto trabajó: **Trabajó 8 horas ese día.** Si ese día ya tiene lectura, el botón dice **Corregir la lectura**.

**No se anota la diferencia, se anotan las dos lecturas.** Quien copia dos números del tablero se equivoca menos que quien hace una resta de cabeza en el patio, y si algo no cuadra, las dos lecturas dejan ver dónde.

**Un horómetro no retrocede.** La lectura de un día no puede arrancar por debajo de donde terminó la del día anterior, y el sistema lo dice con los dos números. Si a la máquina le cambiaron el reloj, eso no se anota aquí: se corrige la ficha. Con la máquina en el taller, el botón está apagado.

### 19.4 La ficha de una máquina

Se llega con **Editar** —o **Ver**—, y **Nueva máquina** abre la misma ficha en blanco: **El código la identifica en todo el sistema.**

| Bloque | Qué guarda |
| --- | --- |
| **Fotos del equipo** | **Estado en que se recibió.** Para registrar una máquina hacen falta **al menos dos fotos**: el día que se discuta un golpe, vale lo que se fotografió al recibirla |
| **Identificación** | **El código es con el que se la nombra en el patio y en todos los papeles.** Código, nombre, clase, tipo, dueño, estado, marca, modelo, serial, año, el **Operador** —quien responde por ella— y el **Almacén** donde se guarda, si tiene sitio fijo |
| **Combustible** | **El vale de combustible comprueba el tipo y la capacidad.** Qué combustible quema y la capacidad del tanque |
| **Umbrales de mantenimiento** | **Aviso**, **Alarma** y **Tope**, en horas desde el último mantenimiento, y la **Duración estimada del mantenimiento (días)** |
| **Observaciones** | Datos de la máquina que no tienen campo propio |
| **Modificaciones** | **Lo que se le añadió después de recibirla.** Ver abajo |
| **Historial** | Combustible, horas trabajadas, pasos por el taller, repuestos, modificaciones y cambios de estado, de lo más reciente a lo más viejo |

Los tipos de máquina son **Excavadora**, **Cargador**, **Camión**, **Planta**, **Perforadora**, **Vehículo**, **Generador** y **Otro**. El estado de una máquina nueva se elige al registrarla, y después **se cambia desde la ficha, explicando por qué**.

**Los tres umbrales van en orden: primero el aviso, después la alarma, y el tope al final.** Son los que encienden el semáforo, y **si no se llenan, la máquina nunca avisa de nada**: se queda en blanco para siempre, que parece estar bien y no lo está.

**El bloque del combustible no es informativo, es un candado.** Con él puesto, el vale de combustible (20.3) no ofrece la máquina para otro combustible y no deja pasar de lo que le cabe el tanque. Sin él, no se comprueba nada.

**Dos fichas no pueden tener el mismo serial**: serían dos fichas de la misma máquina, y las horas y el combustible se repartirían entre las dos.

#### Las modificaciones

Lo que se le monta a una máquina después de recibirla —un equipo, una pieza— se registra con **Nueva modificación**: **Queda en su ficha y en su historia, con la fecha.** Se dice el **Artículo** del catálogo —o se escribe, si no está—, el **Origen** —si sale de un almacén, **Se descuenta de ese almacén al guardar: deja de estar disponible.**—, **Qué se le montó**, el **Motivo**, **Quién lo hizo**, el **Serial del equipo** montado, la **Cantidad**, la **Fecha** y, como referencia, el **Costo (USD)**, que **no entra en el valor del inventario**.

Quitarla abre **Quitar** y su nombre: **No se borra: queda en la historia con la fecha en que se quitó.** Se dice el motivo y su **Destino**: si vuelve a un almacén, **vuelve a contarse ahí, al mismo costo con el que salió**; si se gastó o se fue, no vuelve a ningún estante.

### 19.5 Mandarla al taller

**Meter al taller** abre la ventana con el nombre de la máquina y su situación: **Lleva 412 horas desde el último mantenimiento, sobre un tope de 500.** Primero se elige qué clase de trabajo es, porque cambia lo que pasa al salir:

| Trabajo | Ejemplo | Al salir |
| --- | --- | --- |
| **Mantenimiento** | Le tocaba: motor, correas, filtros, cambio de aceite | **Al salir, el contador de horas vuelve a cero** |
| **Reparación** | Se dañó algo y hay que arreglarlo | No toca el contador: sigue debiendo su mantenimiento |
| **Servicio** | Engrase, combustible, revisión rápida | No toca el contador |

| Campo | Detalle |
| --- | --- |
| **Motivo** | **Lo que se sabe ahora. El trabajo realizado se anota al sacarla.** |
| **Fecha** | |
| **Taller** | **Los repuestos salen de aquí.** Es un almacén de tipo Taller (7.11). O **Sin taller / externo** |
| **Días estimados** | Contra los que se mide el retraso |
| **Urgencia** | **Normal** (entra en la cola cuando toque), **Alta** (antes que lo normal, sin parar lo demás) o **Urgente** (la máquina no trabaja hasta que salga) |
| **Especialidad** | El oficio. **Si el taller declaró sus oficios y este no está, no lo acepta** (7.5) |

Se guarda con **Meterla al taller**. Mientras esté dentro, queda **En el taller** y su estado no se cambia a mano.

**Sacar del taller** abre la salida: el **Trabajo realizado**, la **Fecha de salida**, la **Mano de obra (USD)** —los repuestos se suman aparte, a su costo promedio—, los **Repuestos** que se usaron, cada uno con su cantidad, y el **Estado de salida**: **En espera** (lista, sin asignar todavía), **Activa** (vuelve al frente hoy mismo) o **Fuera de servicio** (salió sin quedar operativa). Se guarda con **Sacarla del taller**. Si la orden se abrió por error, **Anular la orden** la cierra sin trabajo.

**El taller que se elige es de dónde salen los repuestos**, así que la orden descuenta del inventario de ese taller y no de otro. Sin taller no se descuentan repuestos.

### 19.6 Historial de taller

**Operación › Maquinaria › Historial de taller**

**Órdenes de mantenimiento: ingreso, duración, trabajo realizado y costo. Las órdenes abiertas corresponden a máquinas paradas.**

Esa última frase es la razón de que esta pantalla exista aparte: **una orden abierta no es un registro, es una máquina que no está trabajando.** Filtra por **Buscar** y por **Estado**. Cada orden dice la máquina, la clase de trabajo, cuándo entró y salió —y si tardó más de lo estimado—, el horómetro, los repuestos con su costo y el motivo. Sin órdenes: **Sin órdenes de mantenimiento**.

### 19.7 Los camiones

Los camiones de carga van en su propio bloque, **Camiones**, debajo de la flota, en dos grupos: **Flota propia** —**Llevan horómetro y mantenimiento. El semáforo viene de su ficha de máquina.**— y **Transportistas** —**Sin mantenimiento: no son de la empresa. Agrupados por empresa propietaria.**—. Los que están fuera de servicio se esconden; **Ver los fuera de servicio** los trae.

**Nuevo camión**, o **Editar** en uno, abre la ventana del camión: **Se guarda en mayúsculas y sin espacios.**

| Campo | Detalle |
| --- | --- |
| **Placa** | |
| **Tipo** | **Camión de volteo**, **Chuto con volqueta**, **Gandola**, **Cava**, **Cisterna** u **Otro** |
| **Descripción** | |
| **Empresa** | De quién es. Si no está registrada, **Otra empresa…** y su nombre |
| **Ficha de máquina** | Si es propio. **Enlazarlo hace que el semáforo de mantenimiento se vea aquí y al momento de despachar.** |
| **Metros cúbicos** y **Toneladas** | La capacidad |
| **Carga útil en m³** | **Metros cúbicos por viaje, medidos por paladas. No supera la capacidad. Sin ella, los viajes no suman metros cúbicos.** Pide su casilla |
| **Nota** | |

Un camión sin carga útil lo dice en su tarjeta: **Sin carga útil: sus viajes no suman m³**.

**La ficha del camión** se abre desde su tarjeta. Tiene el **Chofer** —quién lo maneja ahora y **Antes lo manejaron**—, la **Actividad** —**Pesajes, despachos, guías, choferes y —si es propio— también su combustible, sus horas y sus pasos por el taller.**—, **La ficha** con sus datos y, si es propio, el **Mantenimiento** de su ficha de máquina.

**El chofer se asigna o se traspasa** desde ahí: **Asignar chofer a** la placa, o **Traspasar**, si ya tiene uno. El chofer puede ser **De la casa** —está en nómina, y su cédula y su cargo salen de ella— o **Del transportista**, con su nombre y su cédula. Se dice **Desde** cuándo y el **Motivo**. Al traspasar, el período del chofer anterior se cierra el día antes de la fecha nueva.

> **Ojo con esta confusión, que ya ha costado tiempo.** El tipo de una **máquina** —excavadora, cargador, planta— **no es** el tipo de un **camión** —volteo, chuto, gandola—. Uno describe qué hace el equipo; el otro, qué carga. Un camión propio puede estar en los dos sitios, atado por su ficha de máquina.

### 19.8 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Su usuario no tiene acceso a ….» | Su permiso sobre Maquinaria no llega a escritura | Pídalo a la administración, o que lo haga quien lo tenga |
| «Hacen falta al menos dos fotos de la maquina para registrarla.» | Se quiso registrar una máquina con menos de dos fotos | Añada las fotos de los dos lados |
| «Ya existe una máquina con el código ….» | Ese código ya es de otra máquina | Use otro código |
| «Ese serial ya lo tiene la maquina ….» | Dos fichas con el mismo serial serían la misma máquina | Búsquela: ya está registrada |
| «El aviso (…) tiene que ir antes que la alarma (…), y la alarma antes que el tope (…).» | Los umbrales están desordenados | Póngalos en orden: aviso, alarma, tope |
| «El horómetro no retrocede: el final (…) no puede ser menor que el inicial (…).» | La lectura final quedó por debajo de la inicial | Revise las dos casillas |
| «El horómetro no retrocede. La lectura del … terminó en …, así que la del … no puede arrancar en ….» | La lectura arranca por debajo de donde terminó la anterior | Copie bien el tablero. Si le cambiaron el reloj, eso se corrige en la ficha |
| «No se anota una jornada que todavía no ocurrió.» | La fecha es de mañana o después | Corrija la fecha |
| «La máquina "CAT-01" está en el taller. Se saca cerrando su mantenimiento.» | Se quiso cambiar el estado de una máquina que está dentro | Use **Sacar del taller** |
| «Para meter una máquina al taller hay que abrir su mantenimiento, no cambiarle el estado.» | Se buscó el estado «en el taller» a mano | Use **Meter al taller** |
| «La máquina "CAT-01" ya está en el taller.» | Ya tiene una orden abierta | Sáquela primero, o siga con esa orden |
| «La máquina "CAT-01" está desincorporada: ya no es de la flota.» | No se manda al taller una máquina desincorporada | Si vuelve a la flota, cámbiele el estado primero |
| «Hay que decir por qué entra al taller.» | Falta el motivo | Escriba lo que se sabe ahora |
| «En "…" no se hace ….» | Ese taller no hace esa especialidad | Mire en **Talleres** cuál la hace, o añádale esa especialidad (7.5) |
| «Hay que decir qué se hizo.» | Al sacarla falta el trabajo realizado | Escríbalo |
| «El taller solo tiene … de "…": no alcanza para ….» | Se anotaron más repuestos de los que hay en ese taller | Revise la cantidad, o registre la entrada del repuesto en ese taller |
| «Al salir del taller una máquina queda en espera, activa o fuera de servicio.» | Falta el estado de salida | Elija uno |

---

## 20. Combustible

Es el gasoil y la gasolina: cuánto queda, cuánto consume cada máquina y a qué se le echó. La pantalla lo resume: **Existencias de combustible, consumo por máquina y destino de cada despacho. Ingresa por compra recibida o por carga manual.**

**El combustible es un artículo del inventario como cualquier otro**, guardado en un almacén de tipo Combustible (7.11). Lo que este módulo añade es lo que el inventario no sabe: a qué máquina se le echó y con qué horómetro, que es lo que convierte litros en **litros por hora**.

### 20.1 Quién entra y quién puede despachar

| Qué | Lo decide |
| --- | --- |
| Ver los tanques, el consumo y los vales | El módulo **Combustible** en la matriz de permisos (13.1) |
| Despachar, corregir o anular un vale del día, editar la lista de usos, añadir o quitar fotos de un vale | **Combustible** en escritura |
| Corregir o anular un vale de otro día | **Combustible** en control total |
| Cargar combustible a un tanque, o pasarlo de un sitio a un tanque | El rol **Almacén** |
| Entrar directo a la vista de teléfono al abrir el sistema | La casilla **Entrar directo al surtidor del teléfono** (13.1) |

Quien opera las máquinas es quien les echa combustible, así que el reparto suele seguir al de Maquinaria. Quién tiene cada cosa se mira en la matriz.

### 20.2 Qué se ve

Arriba, los botones: **Vista de teléfono** (20.4), **Usos** —la lista de para qué se echa combustible—, **Tanques**, que lleva a **Inventario › Almacenes**, donde se crean, **Cargar** (20.6) y **Despachar** (20.3). Si un tanque está en su mínimo o por debajo, sale un aviso arriba: **GASOIL en el mínimo o por debajo.**

**En el tanque**: una tarjeta por tanque y combustible, con lo que queda, el costo por litro —o **Sin costo registrado**— y el mínimo si lo tiene. Si no hay combustible en ningún tanque: **El tanque está vacío**.

**Fuera de tanque**, si lo hay: combustible que entró a un almacén que no es un tanque. La pantalla lo dice: **Combustible fuera de un tanque. No se despacha desde ahí: páselo primero a un tanque.** Cada tarjeta tiene **Pasarlo a un tanque**, que abre **Pasar al tanque**: **Se mueve con su costo. El total de la empresa no cambia.** Se elige el **Destino**, la **Cantidad** y el **Motivo**.

**Consumo por máquina**: **Litros despachados entre las horas del parte diario. Sin lecturas de horómetro, la columna va vacía.** Columnas: **Máquina**, **Litros**, **Horas**, **L/hora**, **USD/hora** y **Gasto**. Una máquina con despachos pero sin horómetro sale marcada: **Falta anotar el horómetro en el parte diario.** Sin despachos todavía: **Sin despachos a máquinas**.

**Últimos despachos**: cada vale con sus litros, el combustible y el destino, la máquina o el chip **Sin ficha**, el uso —en naranja si es «Otro», con su detalle pegado— y debajo la fecha, la hora y el número. Un vale corregido lleva el chip **Corregido**; uno anulado, **Anulado**, en gris. A la derecha, los botones del vale (20.5). Sin vales: **Sin despachos registrados**.

### 20.3 Despachar combustible

**Despachar** abre **Despachar combustible**: **Se descuenta del tanque al costo promedio que tenga ahora.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Tanque** | Sí | Solo los que tienen combustible, cada uno con lo que queda |
| **Uso** | Sí | Para qué se usa, no a qué máquina. Sale de la lista de usos |
| **Detalle del uso** | Según el uso | Solo en los usos que piden explicación. Ayuda: **En pocas palabras.** |
| **Máquina** | No | De la flota. Si no está: **No está en la ficha**. Solo salen las que queman ese combustible, y cada una dice cuánto le cabe |
| **Destino** | Sin máquina, sí | A qué se le echó, cuando no es una máquina con ficha |
| **Horómetro** | Con máquina, sí | Lo que marca el tablero. Debajo dice lo último anotado |
| **Cantidad (litros)** | Sí | Debajo dice cuánto alcanza |
| **Fecha** | Sí | Empieza en hoy |
| **Receptor** | Sí | Quien recibió el combustible, de la nómina. Si no está: **No está en la nómina**, y se escriben el **Nombre del receptor** y la **Cédula** |
| **Nota** | No | |

El botón **Despachar** está apagado mientras falte algo de lo obligatorio, el horómetro retroceda, la cantidad pase lo que hay o la máquina haya llegado a su tope del día.

**Sin máquina no hay consumo por hora.** La ayuda lo dice: **Sin máquina no hay consumo por hora: solo cuenta para el gasto.** Con máquina, **el horómetro es obligatorio**: **Obligatorio al surtir una máquina. Queda anotado en el vale.** Es lo que permite comparar dos equipos o notar que uno empezó a beber más de la cuenta.

**Un horómetro no retrocede.** Si la lectura es menor que la última, la ayuda lo dice antes de guardar: **Un horómetro no retrocede: lo último anotado marcaba 1250.** **Y el contador es uno solo, aunque se apunte en dos sitios**: el sistema compara con la lectura más alta anotada hasta la fecha del vale, venga del vale o del parte diario. El aviso de antes de guardar solo mira los vales: una lectura puede pasar el aviso y no guardarse, y entonces el mensaje dice con qué lectura choca.

**Tres vales por máquina al día, como máximo.** La pantalla lo avisa antes de llenar el resto —**Es el surtido 2 de 3 de ese día para esta máquina.**— y al llegar al tope apaga el botón: **Ya se surtió 3 veces ese día. Son 3 al día como máximo.** Y no hay otro camino: el sistema no deja un cuarto.

#### La lista de usos

El botón **Usos** abre **Usos del combustible**: **La lista que sale al despachar. Los cambios no alteran los vales emitidos.** Cada uso lleva su nombre, una pista que explica cuándo se usa y, si hace falta, la marca de que **pide explicación**: con ella, el vale no se guarda sin el **Detalle del uso**.

**La lista la toca quien despacha**: es quien sabe para qué se echa combustible en esta cantera, y quien descubre que falta un uso. Si un mismo «Otro» se repite mucho, conviene que sea un uso propio de la lista.

### 20.4 Surtir desde el teléfono

Es la misma operación, hecha para usarla **de pie al lado del tanque**, con el celular en una mano. Se abre con **Vista de teléfono**, y la puede abrir cualquiera que pueda despachar.

Va en dos pasos. Primero **¿De qué tanque?**: **Toque el tanque del que va a surtir.**, en botones grandes que dicen cuánto queda; si solo hay un tanque con combustible, ese paso se salta. Después el vale: **Cantidad**, **Máquina**, **Destino** si no es una máquina con ficha, **Horómetro**, el uso, **Receptor**, y las **Fotos del despacho**. Los usos son botones, no una lista desplegable, porque es lo que más se toca. La **Fecha** y la **Nota** están plegadas hasta que hagan falta. Se guarda con **Surtir**.

**Las reglas son las mismas** que en la computadora: el tope de tres vales por máquina al día, el horómetro que no retrocede y quien recibe, obligatorio. No es un atajo: es la misma puerta.

<p class="regla"><strong>Si la señal está mala, el sistema lo dice.</strong> Cuando el guardado tarda, aparece: <strong>Está tardando por la señal. El vale ya se está guardando: no lo cargue otra vez.</strong> Es el error más común en la mina: el que espera vuelve a pulsar, y salen dos vales del mismo gasoil.</p>

**Las fotos se suben después de que el vale queda guardado**, a propósito: si la señal se cae a mitad de la subida, el vale no se pierde. El acuse lo avisa —**El vale quedó guardado, pero las fotos no subieron por la señal. Añádalas aquí abajo cuando mejore.**— y se añaden ahí mismo. Una foto se quita solo diciendo por qué, y quitarla no la borra: queda el rastro.

Al guardar, la pantalla dice **Quedó anotado**, con el número del vale, y ofrece **Pasarlo por WhatsApp**, que es como se avisa en el patio, y **Surtir otra vez**. El vale en papel se saca desde la computadora.

**Y el error se arregla ahí mismo.** En el acuse están **Corregir este vale** —vuelve al formulario con todo puesto, y se guarda con el mismo número— y **Anular**, que pide el motivo y devuelve el combustible al tanque con un reverso. Es para el vale que se acaba de emitir, que es donde se descubre el error.

**Quien además lleva el almacén ve «Otras operaciones»**: la entrada de combustible y el traslado a un tanque, con las mismas ventanas y reglas del escritorio.

**Todo se refleja al momento.** Lo que se guarda en el teléfono aparece solo en la pantalla de la oficina, y al revés.

**Quién entra directo.** A quien tiene la casilla **Entrar directo al surtidor del teléfono**, al abrir el sistema le aparece esta pantalla, sin pasar por el tablero. Es para la persona que está en la bomba. **La casilla no da permiso de nada por sí sola**: para despachar hace falta escritura en Combustible. **Al administrador del sistema no le aplica**: entra en el tablero, tenga la casilla o no.

### 20.5 El vale

Cada vale tiene en **Últimos despachos** sus botones: imprimir, las fotos, corregir y anular.

**Imprimir el vale** saca el **Vale de combustible** en papel: **Este papel es el que se firma.** Lleva la misma cabecera que el resto de los papeles del sistema (13.2). Lo firma quien recibe el combustible, y por eso se imprime al despachar y no después.

**Un vale anulado se imprime como anulado.** Lleva el cuño **ANULADO** cruzado sobre la hoja, el motivo de la anulación en vez de las rayas de firma —lo que no se firma, no se raya— y lo dice también el nombre del archivo. Se puede imprimir a propósito: sirve de constancia de que se anuló, y con el cuño encima no se confunde con uno vigente.

**Las fotos**, con el botón de la cámara: se ven las que subió quien surtió, se añaden las que falten y se quita una diciendo por qué.

**Un vale se corrige o se anula; nunca se edita por debajo ni se borra.**

- **Corregir el vale** abre el mismo formulario con el vale puesto. Se cambia lo que haga falta —litros, máquina, horómetro, quién recibió, fecha— y se escribe el **Motivo**: **El vale queda marcado corregido con su nombre y la hora.** Conserva su número. Si cambió la cantidad o la fecha, el libro de inventario lo cuenta con un reverso y una salida nueva, a la vista. **El tanque no se cambia**: **El tanque del vale no se cambia: para eso se anula y se emite otro.**
- **Anular el vale** pide el motivo y devuelve el combustible al tanque con un reverso. El vale queda en gris, con su motivo, y deja de contar para el tope de tres y para el horómetro.

**El vale del día lo corrige o lo anula quien despacha; el de otro día, el control total.** Los botones salen igual en los vales de otros días, y la ventana de anular lo advierte: **No es de hoy: requiere control total.**

### 20.6 Cargar combustible a mano

El combustible entra normalmente **por una compra recibida**. Para lo demás está **Cargar**, que abre **Cargar combustible al tanque**: **Para lo que entra sin una compra de por medio: el saldo con el que arranca el tanque, algo comprado por fuera, un traslado. Si llegó con una orden de compra, entra al recibirla.** Lo hace el rol Almacén.

| Campo | Detalle |
| --- | --- |
| **Tanque** | Solo tanques. Si no hay ninguno: **Sin tanques registrados. Se crean en Inventario › Almacenes, con tipo Combustible.** |
| **Combustible** | Solo artículos de esa categoría |
| **Cantidad (litros)** | Mayor que cero |
| **Costo por unidad (USD)** | **Con esto se valora lo que se despache después. Sin costo, cada vale sale en cero.** |
| **Sin costo** | Viene desmarcada. **Para material trasladado desde otra empresa del grupo, donde ya se registró el gasto.** Ver abajo |
| **Fecha** | |
| **Referencia** | Factura, guía, nota |
| **Origen** | De dónde vino |

**Si el costo se sale mucho del que ese tanque viene teniendo** —más de diez veces, para arriba o para abajo—, la ventana lo advierte con las dos cifras y pide **Compruebe la factura.** Para guardarlo así hay que marcar **Es correcto, guárdelo así — quedará anotado en el movimiento.** Un cero de más en una entrada se arrastra a cada vale que salga después.

#### Lo que llega sin costar nada aquí

Hay combustible que llega a la cantera trasladado desde otra empresa del grupo, donde **ya se registró el gasto**. No es una compra sin precio: **es un traslado entre empresas**. Por eso la casilla dice que no costó nada para esta empresa, en vez de dejar el costo en blanco: un costo vacío no se distingue de un descuido, y este no lo es.

Al marcar **Sin costo**:

- El costo se pone en cero y el campo se apaga: **Entra en cero: el gasto lo asumió la otra empresa.**
- **El origen pasa a exigir una explicación entera** —de dónde vino y quién asumió el gasto—, porque dentro de un año esa nota es lo único que lo va a contestar.
- **El tanque cambia solo** al que admite lo que entra sin costo: **Lo que entra sin costo va a su propio tanque.**

#### Por qué va en un tanque aparte

Porque si no, **el costo de todo el combustible se hunde**.

El sistema lleva un costo promedio por tanque. Con 1.000 litros comprados a $0,42 y 20.000 más entrando a cero, el promedio del conjunto cae a $0,02 — **veintiuna veces menos**. A partir de ahí cada vale carga a la máquina una veintiunava parte de lo que cuesta el gasoil, y con él se hunden el consumo por máquina, el gasto por unidad y el centro de costos. Y no se notaría hasta cuadrar el mes, con cien vales mal valorados.

En tanques aparte, cada uno conserva su costo y cada vale sale valorado según de qué tanque salió, que es la verdad: unos litros costaron y otros no.

**La separación la impone el sistema, no la atención.** Un tanque se marca, en **Inventario › Almacenes**, como el que admite lo que entra sin costo, y el sistema no deja mezclar en ninguno de los dos sentidos (20.7). Lo mismo al pasar combustible de un sitio a otro: no se mueve entre el tanque sin costo y uno con costo.

**Y conviene saberlo:** ese combustible **sí costó dinero**, solo que en la otra empresa. Mientras esté a cero, el costo por máquina de lo que salga de ese tanque queda por debajo de lo que de verdad cuesta. Si algún día se sabe lo que se pagó, entrarlo con ese costo dejaría bien a la vez el promedio, el costo por máquina y el centro de costos.

### 20.7 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: Almacén. Su usuario no tiene ese rol….» | Cargar combustible o pasarlo a un tanque es del almacén | Que lo haga quien tenga el rol Almacén |
| «Su usuario no tiene acceso a ….» | Su permiso sobre Combustible no llega: despachar pide escritura, y un vale de otro día, control total | Pídalo a la administración, o que lo haga quien lo tenga |
| «Hace falta el horómetro de "CAT-01" para surtirla. …» | Se eligió una máquina y no se escribió el horómetro | Escriba lo que marca el tablero |
| «El horómetro de "CAT-01" no retrocede: lo último anotado marcaba … y se está surtiendo con …. …» | La lectura es menor que la más alta anotada, en un vale o en el parte diario | Revise el tablero. Si se ve mal o le cambiaron el reloj, eso se corrige en Maquinaria |
| «A "CAT-01" ya se le surtió … veces el …. El máximo son … al día. …» | La máquina llegó a su tope del día | Si de verdad hizo falta más, hay que revisar por qué esa máquina consume así |
| «Hay que decir quién recibió el combustible. …» | Falta el receptor | Elíjalo de la nómina, o escriba su nombre si no es de la nómina |
| «Hay que decir a qué se le echó.» | Sin máquina y sin destino | Escriba el destino |
| «Con el motivo "…" hay que decir en pocas palabras para qué fue.» | Ese uso pide explicación | Escriba el **Detalle del uso** |
| «El motivo "…" ya no se usa.» | El uso se quitó de la lista mientras se llenaba el vale | Elija otro uso |
| «En el tanque solo quedan … … de ….» | Se despacha más de lo que hay | Despache lo que hay, o cargue el tanque primero |
| «El combustible sale del tanque, no de "…". Ese almacén es de tipo …. …» | Se quiso despachar desde un almacén que no es un tanque | Páselo primero a un tanque |
| «No se despacha combustible con fecha futura.» | La fecha es de mañana o después | Corrija la fecha |
| «El vale … está anulado: lo anulado no se corrige, se emite otro.» | Se quiso corregir un vale anulado | Emita otro vale |
| «Diga por qué se anula.» | Falta el motivo de la anulación | Escríbalo |
| «Aquí no entra material sin costo: se hundiría el costo promedio de lo que ya hay.» | Se marcó **Sin costo** apuntando a un tanque que no admite lo que entra sin costo | **Métalo en el tanque de combustible inicial, que es el que lo lleva aparte**, como dice el propio mensaje (20.6) |
| «Aquí solo entra lo que no costó nada. Lo que tiene precio va al tanque de siempre.» | Se quiso meter combustible comprado al tanque sin costo | Elija el otro tanque y escriba lo que costó |
| «Una entrada sin costo hay que explicarla entera: de dónde vino y quién asumió el gasto. Dentro de un año esa nota es lo único que lo va a contestar.» | El origen quedó corto | Escriba de dónde vino y quién pagó |
| «Hay que decir cuánto costó la unidad. Si el gasto lo asumió otra empresa del grupo, marque «no costó nada para esta empresa» y explique de dónde vino.» | Se dejó el costo vacío sin marcar **Sin costo** | Escriba el costo, o marque **Sin costo** si de verdad no costó |
| «Si el material no costó nada para esta empresa, el costo tiene que ir en cero. Quite la marca o ponga el costo en cero.» | Está marcada **Sin costo** y hay un costo escrito | Lo que dice el propio mensaje |
| «La cantidad que entra tiene que ser mayor que cero.» | Los litros están vacíos o en cero | Escriba cuántos entran |
| «Ese almacén no existe o está inactivo.» | El tanque se desactivó mientras tenía la ventana abierta | Recargue la pantalla |

---

## 21. Facturación

Facturación convierte en factura lo que salió con nota de entrega, corrige lo facturado con notas de crédito y registra lo que pagan los clientes. **Una factura gasta un número de control que no se recupera, y deja a un cliente debiendo**: por eso es un módulo aparte de Ventas, con su propio permiso.

El menú **Facturación** tiene cuatro pantallas, en el orden del trabajo: **Notas de entrega**, **Facturas**, **Notas de crédito** y **Cuentas por cobrar**. La de notas de entrega se cuenta en el capítulo de Ventas (10.6), porque es el paso de la venta que saca el material. El libro de ventas está en **Tesorería › Libro Mayor** (12.12).

### 21.1 Quién entra y quién puede hacer qué

| Qué | Lo decide |
| --- | --- |
| Ver las pantallas de Facturación | El módulo **Facturación** en la matriz de permisos (13.1) |
| Ver los montos de las facturas y lo que deben los clientes | La casilla **Ver las facturas y lo que deben los clientes**. Sin ella los documentos se ven, pero los montos llegan vacíos |
| Preparar una factura y enviarla a autorizar, registrar cobros | **Facturación** en escritura |
| Autorizar y emitir una factura, o rechazarla | La casilla **Autorizar y emitir facturas** (13.1) |
| Anular facturas y cobros, emitir y anular notas de crédito, dejar pasar una factura por encima del límite de crédito del cliente | **Facturación** en control total |

**Quien prepara una factura no la autoriza**, aunque tenga la casilla: la emite otra persona. No hay forma de saltárselo.

Los clientes, su crédito y la lista de precios son de Ventas (10.3 y 10.4): desde aquí se leen para facturar, pero se registran y se corrigen allá.

### 21.2 Facturas

**Facturación › Facturas**

La pantalla lo resume: **Facturas contra notas de entrega —una, o todas las de la semana de un cliente— o sin nota, con renglones propios.**

#### Qué se ve

Arriba, dos botones: **Factura sin nota** y **Facturar notas**, que dice cuántas esperan —**Facturar notas (3 sin factura)**— y está apagado cuando no hay ninguna. Las notas que se ofrecen son las **Despachadas** que se pueden facturar; las que se generaron como solo respaldo de una nota de salida no aparecen (10.10).

Debajo, si las hay, la tarjeta de las **facturas por autorizar** (ver más abajo), y después la lista.

| Columna | Qué muestra |
| --- | --- |
| **Factura** | **FAC-2026-0012** y, debajo, el número de control **00-00000034** |
| **Cliente** | Razón social |
| **Fecha** | La de emisión y, debajo, **vence 03 sep 2026** si es a crédito o, en rojo, **vencida hace 12 d** |
| **Total** | En la moneda de la factura |
| **Saldo** | **Siempre en dólares**, y solo mientras la factura está **Por cobrar** |
| **Estado** | **Por cobrar**, **Cobrada** —o **Saldada con nota de crédito**, cuando lo que la dejó sin saldo fue una nota de crédito y no entró dinero— o **Anulada** |

Si todavía no hay ninguna, **Sin facturas emitidas**, con el botón que toque: **Facturar notas** si hay notas esperando, o **Factura sin nota** si no.

#### Toda factura pasa por autorización

**Nadie emite una factura de un solo paso.** Quien la prepara la envía a autorizar, y otra persona con la casilla **Autorizar y emitir facturas** la emite o la rechaza. Mientras espera, **todavía no es una factura**: lleva un número **PRE-2026-0001**, no gasta número de control, no toca el patio, no entra al libro de ventas y nadie debe nada por ella.

La tarjeta de las facturas por autorizar va arriba de todo en **Facturación › Facturas**, y cada uno ve lo suyo:

- **Quien puede autorizar** ve todas las que esperan, con el cliente, de qué notas sale o cuántos renglones lleva, quién la preparó y lo que suma. La tarjeta lo advierte: **Todavía no son facturas: no tienen número de control ni tocaron el patio. Al autorizarla se emite con la tasa de hoy.** En bolívares, el total puede no ser el que vio quien la preparó.
  - **Autorizar y emitir** la emite en ese momento, con la fecha y la tasa de ese día.
  - **Rechazar** pide el motivo: **No se emite nada. Quien la preparó lee el motivo y, si hace falta, prepara otra.**
- **Quien la preparó** ve las suyas con el chip **Esperando autorización**, y puede retirarla con **Retirar** mientras espera: **Deja de esperar autorización. Sus notas de entrega vuelven a quedar libres para otra factura.** Durante una semana sigue viendo qué pasó con ella: **Emitida**, con el número de la factura que salió, **Rechazada**, con el motivo, o **Retirada**.

**Una nota de entrega que está en una factura por autorizar no entra en otra.** En la lista de notas sale apagada, con **por autorizar en PRE-2026-0001**.

**Si al autorizar algo ya no cuadra** —el patio no alcanza, el cliente pasó su límite de crédito—, **no se emite nada** y la factura sigue por autorizar, para rechazarla con el motivo.

#### Preparar una factura de notas de entrega

1. Pulse **Facturar notas**. Se abre **Preparar factura**: **Marque las notas de entrega que van en esta factura. Tienen que ser del mismo cliente y la misma moneda.**
2. Marque las notas. Cada una muestra su número, el cliente, la fecha, la placa, cuántos renglones trae y su total.
3. **En cuanto marca la primera, las que no son compatibles se apagan solas.** Compatible quiere decir mismo cliente y misma moneda: una factura es de un solo cliente, y bolívares y dólares no se suman en un mismo total.
4. Elija la **Condición de pago**, o déjela en **La que tenga el cliente**. La ayuda avisa: **A crédito, el sistema comprueba el límite del cliente antes de emitir.**
5. Escriba la **Observación**, si hace falta.
6. Decida los impuestos. La casilla **Esta operación lleva IVA** llega marcada o no según la ficha de la empresa (13.2), con su **Alícuota (%)**; la de **Esta operación lleva IGTF** llega desmarcada y, marcada, arranca en el 3 % de ley. **Una factura lleva IVA, IGTF o los dos**: sin ninguno, el botón se apaga y la ventana lo dice. Si el cliente es exento: **ACME C.A. es exento de IVA: la factura sale sin IVA.**
7. Revise el resumen: **2 nota(s) de ACME C.A.** con su suma, el IVA y el IGTF si los lleva, y el **Total de la factura**.
8. Pulse **Enviar a autorizar**.

Si abre la ventana y no hay cola, dentro dice **Sin notas pendientes de facturar** y **Todas las notas despachadas están facturadas. Facturar una nota es opcional.**

**Al facturar, los renglones se copian a la factura**, que guarda los suyos: lo que dice la factura no se lee de la nota cada vez.

#### La factura sin nota

**Factura sin nota** abre **Factura sin nota de entrega**: **Con sus propios renglones. Si el material sale con ella, se descuenta del patio al emitirla; si no, sale después con notas de entrega que se enlazan a esta factura.**

Se llenan el **Cliente**, la **Moneda**, la **Condición de pago**, los renglones —con el mismo bloque de la cotización (10.5), incluida la casilla **Exento de IVA**—, la **Observación** y las casillas del IVA y del IGTF. Y una casilla que decide qué pasa con el material, **El material sale del patio con esta factura**, que viene marcada:

- **Marcada**: **Se descuenta al emitirla. A esta factura no se le podrán enlazar notas de entrega: el material ya salió.** Se elige el **Patio**, y cada renglón puede salir de otro. Un servicio, como un flete, no sale de ninguno.
- **Desmarcada**: **No toca el patio. El material sale después con notas de entrega, que se enlazan a esta factura desde la nota** (10.6, **Enlazar a una factura**).

Se envía a autorizar igual que la de notas.

#### Ver una factura y cobrarla

Pulse en la fila. El título trae el número y el número de control —**FAC-2026-0012 · control 00-00000034**—. Dentro están los chips del estado, la condición de pago, **Vencida hace 12 días** si aplica, **Agente de retención** si el cliente retiene y, si es sin nota, **Sin nota · sacó el material del patio** o **Sin nota · el material sale con notas enlazadas**. Si está anulada, en rojo: **Anulada:** y el motivo. Después, los renglones y los totales, que **cuando hay retención añaden dos líneas**: **Retención de IVA**, en negativo, y **A cobrar**.

Mientras la factura está **Por cobrar** se lee debajo **Abonado $ 400,00 · falta $ 800,00** y **El saldo se lleva en dólares.** Va en dólares porque se cobra en las dos monedas.

Si hay cobros, aparece la tarjeta **Cobros**: cada uno con su número y su método, la fecha y la hora, la cuenta, la referencia y el IGTF si lo hubo. Los anulados se ven más pálidos, con **· anulado**.

| Botón | Cuándo aparece | Qué hace |
| --- | --- | --- |
| **Cerrar** | Siempre | Cierra la ventana |
| **Imprimir** | Siempre | Genera el PDF y lo abre en el visor **Factura** |
| **Registrar cobro** | Mientras está **Por cobrar** | Abre la ventana de cobro. Lo hace quien escribe en Facturación |
| **Anular** | Mientras está **Por cobrar** | Abre la ventana de anulación. Lo hace quien tiene control total sobre Facturación |

#### Registrar un cobro

Se abre **Cobrar la factura FAC-2026-0012**, con el cliente y cuánto falta en el subtítulo. **Un cobro puede llevar varias líneas, y se registran todas o ninguna**: si una no pasa, no queda ninguna a medias. Hay tres clases de línea.

**En dinero.** Cada línea lleva:

| Campo | Detalle |
| --- | --- |
| **Cuenta** | A qué cuenta entró. **El cobro se registra en la moneda de la cuenta** |
| **Monto** | Dice la moneda de la cuenta elegida: **Monto en USD**, **Monto en VES** |
| **Método de pago** | Solo los que sirven para la moneda de esa cuenta. Si el elegido no sirve: **Pago móvil no se usa en USD.** |
| **Referencia** | **Número de la transferencia**. En efectivo, **Se genera sola** |
| **Cobrarle el IGTF del 3% en esta línea** | Viene marcada cuando la empresa cobra IGTF, la cuenta no es en bolívares y la factura no lo lleva ya. Se puede desmarcar |

**Otra cuenta o método** añade otra línea, para el cliente que paga parte por transferencia y parte en efectivo. **El IGTF de un cobro no baja el saldo**: es un impuesto que se recauda aparte. Si el cliente debe $800 y se le cobra el impuesto, sigue debiendo $800 hasta que pague los $800.

**Con crédito del cliente.** Si el cliente tiene un crédito abierto —lo que le sobró de un intercambio anterior—, aparece **Usar el crédito que tiene**, con la cifra. Se elige cuál, en **Saldo**, y cuánto; solo se usa en facturas de la misma moneda que el crédito.

**Con material.** **El cliente paga con material** abre la línea del intercambio: el **Material**, el **Patio** al que entra, la **Cantidad** y la **Unidad**, y el **Precio** al que se toma: de lista, con descuento o acordado. La ventana calcula cuánto vale, cuánto se le aplica a la factura y cuánto sobra. Tres reglas:

- **La factura no baja al registrarlo.** Baja cuando **almacén confirma que el material llegó**, desde la tarjeta **Material de clientes por recibir** del tablero de Inventario (7). Hasta entonces, la ventana de cobro de esa factura avisa: **Esta factura ya tiene material por recibir: … Hasta que almacén lo confirme, el saldo no baja. No lo vuelva a registrar.** Así no se cobra con piedra que nunca llegó, y quien vende no es quien cuenta.
- **Por encima de la lista lo firma el control total.** Al vender, el riesgo es regalar; al recibir material del cliente, el riesgo es pagarle de más. Valorar su material por encima del precio de lista, o sin lista con qué comparar, exige control total sobre Facturación, y la ayuda del precio lo dice.
- **Si el material vale más de lo que falta, hay que decir qué pasa con lo que sobra** en **Excedente**: **Crédito del cliente**, que **se le descuenta de su próxima factura**, o **Por pagarle**, que **aparece en Pagos por hacer y sale de una cuenta de tesorería** (12.4).

Cuando almacén confirma, el material **entra al inventario con costo**: lo que se le descontó al cliente por cada unidad, en dólares a la tasa de la factura. Es una compra, aunque se pague con una venta. El cobro aparece en la tarjeta **Cobros** como un intercambio, sin cuenta.

Al pie, la ventana resume cuánto falta, cuánto entra hoy y cuánto cuando llegue el material, y avisa: **Cifras estimadas con la tasa de hoy; las definitivas se calculan con la tasa de cada documento.** Se guarda con **Registrar el cobro**.

**Cuando el saldo baja de un centavo de dólar, la factura pasa sola a Cobrada.**

#### Anular una factura, y anular un cobro

**Anular** abre **Anular la factura FAC-2026-0012**: **La factura no se borra: se queda con su número, marcada como anulada. Sus notas de entrega vuelven a quedar despachadas, sin factura.** Y dentro, el límite de la herramienta: **Anular sirve mientras la factura no haya salido de la empresa. Una que ya está en manos del cliente se corrige con nota de crédito, no anulándola.**

El **Motivo** es obligatorio —**Queda en el registro de auditoría con su nombre y la hora.**— y el botón **Anular la factura** está apagado hasta las cuatro letras. **No anular** cierra sin hacer nada.

Dos cosas impiden anular: **los cobros registrados**, que se anulan primero, porque el dinero entró y tiene que salir del libro con su propio asiento; y **las notas de crédito**, porque una factura se corrige con notas o se anula, no las dos (21.3).

Un cobro se anula con el botón **Anular** de su fila en la tarjeta **Cobros**. **No pide motivo**: el sistema graba uno fijo, **ANULADO DESDE LA FACTURA**. Si la anulación necesita explicación, conviene escribirla en otro sitio, porque el registro de auditoría de ese cobro no la va a dar. Anular un cobro devuelve la factura a **Por cobrar** y, si hubo IGTF, también lo reversa. Exige control total sobre Facturación.

**Un cobro con material ya recibido no se anula.** El material ya está en el patio y pudo usarse. Se corrige como todo lo que ya salió de la empresa: nota de crédito para la factura y una salida para devolver el material. Mientras esté por recibir sí se anula, porque no movió nada.

#### Qué sale de aquí

El PDF sale con la cabecera de la casa (13.2) y, a la derecha, cuatro datos: **N° FACTURA**, **FECHA**, **VENCE EL** y **N° DE CONTROL**. Debajo, centrado, el rótulo **FACTURA**. En el recuadro del cliente van **CLIENTE**, **RIF** —o **CÉDULA**—, **DIRECCIÓN** y **CONDICIÓN DE PAGO**.

**Un renglón exento de IVA lleva la marca (E)** pegada a su descripción, y al pie de la tabla sale la línea que la explica: **(E) Renglón exento de IVA.**

Los totales son **Subtotal**; **Descuento** y **Flete** si los hay; **Total exento** si hay renglones exentos; **Base imponible**; **IVA** con su alícuota; **IGTF** si lo lleva; raya y **TOTAL**. Si hay retención, **Retención de IVA** y **A pagar**. Debajo, el equivalente en la otra moneda. Firman **Por la empresa** y **Aceptado por el cliente**.

El pie dice: **La retención del IVA, cuando aplica, la declara y entera el comprador. Original: cliente. Copia: archivo.** Y detrás, **si la empresa tiene cargados los datos de su imprenta autorizada** en **Configuración › Datos de la empresa**, el renglón que exige el SENIAT: **Imprenta:** el nombre, su RIF y el número de autorización. **Solo en la factura**: una cotización o una nota de entrega no lo llevan, y ponérselo les daría un aire fiscal que no tienen. Sin esos datos, el renglón no sale: un pie que dijera «Imprenta: —» no cumpliría el requisito.

**Lo que esta factura no puede expresar** es el **desglose por alícuota**: admite una sola, así que una factura con tarifa general y reducida no se puede emitir (21.6).

### 21.3 Notas de crédito

**Facturación › Notas de crédito.** La pantalla lo resume: **Notas de crédito: corrigen una factura ya emitida.** Es el papel que corrige una factura que ya salió de la empresa. Solo la emite quien tiene Facturación en control total, y solo a esa persona le aparece el botón **Emitir nota de crédito**.

Si no hay ninguna: **Sin notas de crédito emitidas**, con la regla que la separa de anular: **Una factura que no ha salido de la empresa se anula y se emite de nuevo. La nota de crédito corrige una factura ya entregada al cliente.**

| Columna | Qué muestra |
| --- | --- |
| **Nota** | Su número y, debajo, su número de control y su fecha |
| **Factura** | La que corrige, con su fecha |
| **Cliente** | Razón social |
| **Motivo** | Cuál de los cuatro y, si devolvió material, **volvió material al patio** |
| **Monto** | En negativo |
| **Estado** | **Vigente** o **Anulada** |

Sirve para cuatro cosas, y se elige cuál en **Por qué se corrige**. Cada una lleva su ayuda:

| Motivo | Cuándo |
| --- | --- |
| **Devolución de material** | **El cliente devolvió lo despachado. Elija el patio y el material vuelve a existencia.** |
| **Corrección** | **El precio o la cantidad quedaron por encima de lo acordado.** |
| **Descuento posterior** | **Una rebaja acordada después de emitir la factura.** |
| **Anulación** | **La venta no ocurrió, pero la factura ya estaba en manos del cliente.** |

#### Cómo se emite

Con **Emitir nota de crédito**. La ventana avisa: **Se arma sobre los renglones de la factura: marque lo que sobra y ajuste la cantidad o el precio.**

1. Elija la **Factura**. Empieza en **Seleccione la factura…**. **Las anuladas no aparecen**, porque a una factura sin efecto no hay nada que restarle. Al elegirla, la ventana dice la tasa que va a usar: **La nota toma la tasa de la factura (Bs … por dólar), no la de hoy.**
2. La **Fecha de la nota** empieza en hoy, y **no puede ser anterior a la factura**.
3. Elija **Por qué se corrige**.
4. Escriba el **Motivo**. La ayuda lo dice: **Sale en la nota: lo leen el cliente y el SENIAT.** Dentro de un año será lo único que la explique.
5. En la tabla de renglones de la factura, marque el que sobra y ajuste su **Cantidad** o su **Precio**. En **Patio**, elija adónde vuelve el material, o deje **No vuelve material**.
6. Revise la suma. Debajo dice cuántos renglones van y, si la factura ya tiene notas, cuánto le queda por acreditar.
7. Pulse **Emitir**.

**La nota se arma sobre los renglones de la factura, no en blanco.** Corregir es decir «de esto que facturé, esto de aquí sobra», y para eso hay que tener delante lo que se facturó.

**El material puede volver o no volver.** Si se despachó piedra 2 cuando pidieron piedra 1 y el cliente la devuelve, ese renglón lleva patio y el material entra al inventario con su propio movimiento. Si lo que se corrige es el precio, no se mueve ninguna piedra. Es el mismo papel para las dos cosas porque para el SENIAT lo es.

#### Lo que la nota hace y lo que no hace

- **Toma la tasa de la factura, no la de hoy.** Una nota que devuelve cien dólares de una factura de hace tres semanas tiene que restar los mismos bolívares que aquella sumó. Con la tasa de hoy restaría otra cosa, y la factura no cerraría nunca en cero.
- **Gasta su propio número de control**, de la misma serie que las facturas: la numeración autorizada corre continua sobre todos los documentos fiscales, no una por cada tipo de papel.
- **Baja lo que el cliente debe**, y también lo que tiene consumido de su límite de crédito.
- **Si deja la factura sin nada que cobrar, la cierra.** En la lista de facturas se lee entonces **Saldada con nota de crédito**. Si después se anula la nota y la factura vuelve a deber, regresa sola a **Por cobrar**.
- **No mueve dinero.** Si la factura ya estaba cobrada, lo que haya que devolverle al cliente sale de tesorería con su propio asiento. La nota baja lo que se debe; no firma cheques.
- **No puede pasarse.** Entre todas las notas de una factura no se devuelve más de lo que la factura cobró. Antes de dejar guardar, la ventana lo dice con números: **Con lo que ya se acreditó, a esta factura solo le quedan $ 300,00 por devolver.**

#### Ver y anular una nota

Pulse en la fila. El título es su número y el subtítulo dice qué corrige: **Corrige la factura FAC-2026-0012 · control 00-00000041**. Mientras está vigente, quien tiene control total ve **Anular**.

Anular abre **Anular la nota** con su número: **El número de control se gastó y no vuelve: queda la nota anulada con su motivo, que es lo que el SENIAT espera encontrar. Si volvió material al patio, vuelve a salir.** Pide el **Motivo**.

**No se anula si ese material ya se vendió otra vez**: deshacer la devolución dejaría el patio en negativo. El sistema lo dice con la cantidad exacta.

#### Corregir o anular, no las dos

Una factura que ya tiene notas de crédito **no se anula**. O se corrige con notas o se deja sin efecto, porque si no quedarían notas colgando de una factura que ya no existe. Si de verdad hay que anularla, primero se anulan sus notas.

### 21.4 Cuentas por cobrar

**Facturación › Cuentas por cobrar**

Lo que le deben a la empresa: **Facturas emitidas con saldo pendiente. El saldo se expresa en dólares.**

Arriba, tres indicadores: **Por cobrar**, el total en dólares sin céntimos; **Vencido**, en rojo si hay algo vencido y en verde si no; y **Clientes con saldo**.

Debajo, una tarjeta por cliente, **ordenadas por la deuda más vieja** y, a igualdad de días, por la mayor. En la cabecera van el nombre, la identificación, cuántas facturas y el total, con un chip rojo con lo vencido —**$ 1.200,00 vencido**— o uno verde, **Sin vencidos**.

| Columna | Qué muestra |
| --- | --- |
| **Factura** | El número y, debajo, el número de control |
| **Emitida** | La fecha de emisión |
| **Vence** | La fecha de vencimiento |
| **Total** | El importe de la factura |
| **Saldo** | Lo que falta por cobrar |
| **Antigüedad** | Cuánto lleva vencida: **Por vencer**, **Hasta 30 días**, **31 a 60 días**, **61 a 90 días** o **Más de 90 días**. En rojo si está vencida |

**El orden es por antigüedad y no por monto, a propósito.** Una deuda de 400 dólares de hace noventa días es un problema distinto de una de 4.000 emitida ayer, y una lista ordenada por monto las pone justo al revés de como hay que atenderlas.

**Proveedores con saldo.** Debajo de los clientes va un segundo bloque, si hay a quién poner: proveedores que **pagaron una compra con material que valía más que la orden, y la diferencia quedó por cobrarles en dinero**. Cada saldo va en la moneda de su orden, con las columnas **Saldo**, **Compra**, **Desde**, **Original**, **Pendiente** y **Antigüedad**. Al total de arriba solo suman los que están en dólares, porque esos saldos no llevan tasa congelada y convertirlos con la de hoy sería inventar.

Al pie queda dicho dónde se cobra: **Los cobros a clientes se registran desde Facturación › Facturas, abriendo la factura. Lo que debe un proveedor se cobra desde Compras › Proveedores, en sus saldos.** Los dos textos llevan a esas pantallas.

Si no debe nadie: **Sin saldos por cobrar**, con el texto **Todas las facturas emitidas están cobradas y ningún proveedor adeuda diferencias. Aparecen aquí las facturas a crédito, las que quedan con saldo y los pagos con material que dejan un monto por cobrar.**

**Desde aquí no se cobra.** No hay filtros, ni acciones, ni descarga.

### 21.5 El libro de ventas

El libro de ventas está en **Tesorería › Libro Mayor**, pestaña **Ventas**, y se cuenta en el 12.12. Dos cosas de él conciernen a quien factura:

**Las notas de crédito van en ese mismo libro, restando.** No son un anexo ni un libro aparte: para el SENIAT son ventas del período con signo contrario. Las facturas anuladas salen en cero y marcadas, porque la numeración de control tiene que correr sin huecos.

**Lo que se vende sin IVA va entero en la columna de exentas.** Cuando un documento no lleva IVA —porque el cliente está marcado como exento o porque se desmarcó la casilla del IVA—, todo su monto es exento y la base imponible queda en cero.

### 21.6 Lo que el módulo no hace

Lo que el módulo no hace, para que nadie lo descubra con una factura en la mano:

- **Nota de débito.** No existe: para cobrarle de más a un cliente al que se le facturó de menos, hay que emitir otra factura.
- **Varias alícuotas en una misma factura.** Admite una sola, así que una factura con tarifa general y reducida no se puede expresar.
- **Papeles.** No salen en PDF la nota de crédito, el recibo de un cobro ni el estado de cuenta de un cliente. El libro de ventas se descarga en hoja de cálculo (12.12).
- **El comprobante de retención que entrega el cliente.** La retención se descuenta en la factura, pero no hay dónde anotar el número, la fecha ni el período del comprobante.
- **Cómo se asigna el número de control.** Lo pone el propio sistema, en una sola serie continua para facturas y notas de crédito. Si la empresa emite con imprenta digital o con máquina fiscal, eso cambia, y es una decisión que se toma con el contador.

### 21.7 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| «Su usuario no tiene acceso a ….» | Su permiso sobre Facturación no llega al nivel que pide esa acción | Registrar cobros pide escritura; anular facturas y cobros y las notas de crédito, control total (21.1). Pídalo a la administración, o que lo haga quien lo tenga |
| «Su usuario no tiene permiso para ….» | Falta la casilla: autorizar facturas, o ver los montos | Se da en la matriz de permisos (13.1) |
| «Una factura lleva IVA, IGTF o los dos: marque al menos uno.» | Las dos casillas quedaron desmarcadas | Marque el IVA, el IGTF o los dos |
| «Alguna de las notas ya no está esperando factura.» | Otra persona facturó o anuló una de las notas mientras usted marcaba | Cierre, vuelva a abrir **Facturar notas** y marque las que sigan en la cola |
| «Alguna de esas notas ya está en una factura por autorizar (PRE-2026-0001).» | Esa nota espera en otra factura | Que se autorice, se rechace o se retire esa factura primero |
| «Una factura es de un solo cliente y en una sola moneda.» | Se mezclaron notas de clientes o de monedas distintas | Prepare una factura por cliente y por moneda |
| «No hay notas de entrega que facturar.» | No se marcó ninguna nota | Marque al menos una |
| «El cliente "ACME C.A." está inactivo.» | Al cliente se le dio de baja | Actívelo en **Ventas › Clientes**, o facture a otro |
| «Una factura no la autoriza quien la preparó.» | Quien prepara no autoriza | Que la autorice otra persona con la casilla |
| «La factura PRE-2026-0001 ya no está por autorizar.» | Otra persona la autorizó, la rechazó o la retiró | Mire la tarjeta: ya está resuelta |
| «Diga por qué se rechaza: quien la preparó lo va a leer.» | Falta el motivo del rechazo | Escríbalo |
| «Solo quien la preparó la retira. Quien autoriza la rechaza.» | Se quiso retirar una factura ajena | Recházela con su motivo |
| «A "ACME C.A." no se le tiene autorizado crédito. Fije su límite o factúrele de contado.» | El cliente no tiene límite fijado | Que Ventas le fije el límite (10.3), o facture de contado |
| «Con esta factura "ACME C.A." quedaría debiendo … $ y su límite es … $.» | La factura pasa el límite de crédito | Cobre lo pendiente, facture de contado, o que la emita quien tenga control total sobre Facturación |
| «En "PATIO PRINCIPAL" hay … de "GRANZÓN" y se están facturando ….» | La factura sin nota saca más material del que hay | Corrija la cantidad, o registre la entrada del material primero |
| «Hay material sin patio: elija de qué patio sale la factura, o el de cada renglón.» | Falta el patio en una factura sin nota que saca material | Elija el patio |
| «No se factura con fecha futura.» | La fecha es de mañana o después | Corrija la fecha |
| «La factura FAC-2026-0012 está … y no admite cobros.» | Ya está cobrada o anulada | Revise la tarjeta **Cobros** de la factura |
| «A la factura FAC-2026-0012 le faltan … $ y se están abonando … $. Si el cliente pagó de más, regístrelo como dos cobros o revise la tasa del día.» | El abono es mayor que lo que falta | Lo que dice el propio mensaje |
| «El monto del cobro tiene que ser mayor que cero.» | El monto quedó vacío o en cero | Escriba lo que entró |
| «No se registra un cobro con fecha futura.» | La fecha es de mañana o después | Corrija la fecha |
| «No hay ninguna línea que cobrar.» | La ventana de cobro quedó sin líneas | Añada al menos una: en dinero, con crédito o con material |
| «Escriba por qué se anula. Una factura anulada sin motivo no se puede explicar.» | El motivo quedó vacío o muy corto | Escriba qué pasó |
| «La factura FAC-2026-0012 tiene 1 cobro(s) registrados. Anúlelos primero: el dinero entró y tiene que salir del libro con su propio asiento.» | La factura tiene dinero cobrado encima | Anule los cobros uno por uno y después la factura |
| «La factura FAC-2026-0012 ya tiene 1 nota(s) de crédito. Se corrige con notas o se anula, no las dos: anúlelas primero si de verdad hay que dejar la factura sin efecto.» | Ya se corrigió con notas | Lo que dice el propio mensaje |
| «La factura FAC-2026-0012 ya estaba anulada.» | Alguien se le adelantó | Ya está anulada |
| «El cobro COB-2026-0003 ya estaba anulado.» | Ese cobro ya se reversó | Cierre y vuelva a abrir la factura |
| «La factura FAC-2026-0012 está anulada. Una factura sin efecto no se corrige: no hay nada que restarle.» | Se quiso emitir una nota sobre una factura anulada | No hace falta nota |
| «La nota es del … y la factura que corrige es del …. Una corrección no puede ser anterior a lo que corrige.» | La fecha de la nota es anterior a la factura | Corrija la fecha de la nota |
| «La nota necesita al menos un renglón: qué se corrige y por cuánto.» | No se marcó ningún renglón | Marque el que sobra |
| «Escriba por qué se emite. …» | Falta el motivo de la nota | Escríbalo: sale en la nota |
| «La nota NCR-2026-0002 devolvió … al patio y ahora solo hay …. Ese material ya salió otra vez: no se puede deshacer la devolución.» | El material devuelto ya se volvió a despachar | La devolución ya no se deshace: la nota se queda vigente |

---

## 22. Control de despacho

**Es la planilla de lo que salió.** Se entra por **Administración › Control de despacho**, justo antes de Facturación, porque es lo que se mira para saber qué falta por cobrar.

Esa planilla se llevaba en Excel y se llenaba entera a mano: había que copiar el número de la nota, la fecha, el cliente, el material y la cantidad de cada despacho antes de poder anotar lo único que no está en ninguna parte del sistema —el precio acordado, el estado del cobro y las observaciones—. **Aquí la mitad izquierda se llena sola**, leyendo las notas de entrega y las notas de salida, y solo quedan cinco cosas por escribir.

### 22.1 Las tres ideas que lo ordenan

**La mitad izquierda se lee de la nota cada vez, y aquí no se edita.** El número, la fecha, el cliente, el material y la cantidad no se copian a esta planilla: se consultan. Por eso, si mañana se corrige la nota, la planilla se corrige sola; y por eso una cantidad equivocada se arregla en la nota, no aquí.

**Este módulo recibe información y no la manda a ningún lado.** Todo lo que se escribe se guarda en las tablas propias de Control de despacho. Ninguna de sus funciones escribe en notas de entrega, notas de salida, inventario, clientes ni facturación: solo los lee. No hay forma de dañar un documento desde esta pantalla, ni siquiera siendo administrador.

**La serie se enseña entera, con sus huecos.** No lista solo las notas que existen: lista todos los números que la numeración gastó. El que no tiene documento detrás sale diciendo «Sin documento», y eso es un despacho que pudo salir sin registrarse. Es justo lo que en el Excel se escribía a mano poniendo «SISTEMA» en la fila.

### 22.2 Quién entra y quién puede hacer qué

**Lectura** ve la planilla, filtra, busca y descarga el Excel y el PDF. **Escritura** además llena las filas a mano, carga desde Excel y dice a qué cliente corresponde un nombre escrito a mano. **Control total** además cambia la lista de status y el nombre de la columna libre.

El módulo nació con el permiso en **Ninguno para todos los roles**: hasta que administración lo reparta (13.1), solo lo ve el administrador.

### 22.3 La pantalla

Se filtra por fecha, con **Desde** y **Hasta** —arranca en el día 1 del mes en curso—, por **Status** —donde **Sin status** deja la lista de lo que falta por revisar— y con el campo **Buscar**, que mira a la vez el número, el cliente, el RIF, el material y las observaciones. Si los filtros no encuentran nada, la pantalla lo dice: **Sin resultados en el período**. La casilla **«Solo lo despachado»** quita lo anulado, las salidas internas, los respaldos de salida y los números sin documento: es la vista para pasar el informe.

Sobre la tabla, una línea dice cuántos despachos hay, la cantidad **separada por unidad** —los metros cúbicos no se suman con las toneladas—, el monto en dólares y dos avisos: cuántas filas van **sin precio** y cuántas **sin RIF**.

Una nota con tres materiales son **tres filas**, porque cada material tiene su cantidad y su precio. **El número de cada fila es un enlace** a su nota, para quien tenga permiso de esa pantalla. Y las filas que no suman se ven en gris, diciendo qué pasó con ese número: anulada, salida interna, deshecha, respaldo de una salida o sin documento.

**La fila de respaldo también dice su material.** La nota de entrega que nació de una nota de salida sale en gris con su material, su cantidad y a qué NS respalda: **Respaldo de una salida · OPTIMAVIAL C.A · ARENA INTEGRAL 16,00 M3 · Respalda la nota de salida NS-2026-0025**. No lleva precio ni entra en los totales a propósito: ese dinero ya lo cuenta la fila de la NS, y sumarlo aquí lo contaría dos veces.

### 22.4 Lo que se escribe aquí

Cinco columnas, y solo cinco: **RIF o cédula**, **Precio US$**, **Status**, **Observaciones** y una columna libre que se llama **Otra** hasta que se le cambie el nombre. El **monto** no se teclea: es cantidad por precio.

Dos de ellas pueden venir puestas:

- **El RIF**, cuando la nota trae un cliente registrado. No se copia: se consulta, así que si el RIF se corrige en la ficha del cliente, todas las filas pasan a decir el correcto. El que se escribe a mano manda sobre ese.
- **El precio**, cuando la nota de entrega está **en dólares**. Una nota en bolívares llega sin precio y la fila lo dice, porque traerlo a una columna en dólares obligaría a inventar una tasa que nadie eligió. Las notas de salida nunca traen precio: son documentos de almacén.

**El destino de una nota de salida es texto libre**, y así viene escrito. Como no coincide con el nombre de ningún cliente registrado, la primera vez se dice a qué cliente corresponde ese nombre; desde ahí, toda salida escrita igual trae su cliente y su RIF sola. Esa equivalencia se apunta en una tabla del módulo: **la ficha del cliente no se toca**.

### 22.5 Cargar muchas filas desde Excel

Para completar veinte o cuarenta despachos de una sentada. Son tres pasos y están en el botón **Cargar desde Excel**:

1. **Descargar la plantilla.** No es una hoja en blanco: trae las filas que se ven en pantalla —o solo las marcadas—, ya identificadas y con lo que tengan escrito. Las columnas que se llenan van con la cabecera en otro color.
2. **Llenarla y subirla.** Admite archivos .xlsx y .csv.
3. **Revisar antes de guardar.** El sistema enseña fila por fila qué va a cambiar, y cuántas vienen iguales. Una hoja mal pegada se ve aquí y no después.

Tres reglas que conviene tener claras:

- **La columna CLAVE es lo que ata cada fila de Excel con la suya**, y no se toca. El número de nota no sirve, porque una nota puede ser varias filas. Sin esa columna, la carga se rechaza entera.
- **Lo que se sube es cómo queda la fila**: una celda vacía borra lo que había. Como la plantilla baja con lo que ya está escrito, subirla tal cual no pierde nada.
- **Una columna que falte entera, en cambio, se respeta.** Así se carga un solo campo: se deja CLAVE y PRECIO, se borran las demás, y se cargan precios sin rozar los RIF ni las observaciones.

**Se guarda todo o no se guarda nada.** Si una fila trae un error —un status que no existe, un precio negativo, una clave repetida— no se guarda ninguna: se corrige la hoja y se vuelve a subir. El límite es de 2.000 filas por carga.

### 22.6 Sacar la información

**Lo que se marca es lo que sale.** Cada fila tiene su casilla y la cabecera marca todas las que se ven; sin ninguna marcada, sale todo lo que hay en pantalla con los filtros puestos.

- **Excel.** Un libro de verdad: cabecera de color, los números como números para poder sumarlos allá, y el RIF y el número de nota como texto para que no pierdan los ceros.
- **PDF.** El papel con el membrete de la empresa. Se ve en el visor antes de descargarlo. Arriba deja constancia del alcance —período, si son las filas marcadas, cuántos despachos, monto, lo que falta por completar y quién lo emitió— y al pie el total de lo despachado.

### 22.7 La lista de status y la columna libre

En el botón **Status y columna**, que abre la ventana **Status y columna libre**, con control total sobre el módulo. Para añadir uno se escribe en **Status nuevo**. La lista de status empieza con **CONTADO**, **CRUCE** y **AUTORIZADO**, que son los que ya usaba el Excel, y se le agregan los que hagan falta. **Un status que ya se usó no se borra: se apaga**, deja de ofrecerse y las filas que lo tienen lo conservan.

La columna libre está para lo que no encaja en ninguna otra —un número de guía, una placa, una referencia—. Al renombrarla cambia en la tabla, en el Excel, en el PDF y en la plantilla, y lo ya escrito en ella no se pierde.

### 22.8 Lo que este módulo no hace

No emite ni anula notas, no corrige lo que dice una nota, no mueve inventario, no crea clientes, no factura y no registra cobros: el status que se pone aquí es una anotación, no un pago. Cada una de esas cosas se hace en su pantalla.

---

## 23. Control de asistencia

Está en **Administración › Control de asistencia** y sirve para saber quién entró, quién salió y a qué hora: con el **carnet** —el mismo que ya tiene el QR de verificación— o cargado a mano por quien tenga permiso.

### 23.1 La idea que lo ordena: la jornada, no la marca

Otros sistemas guardan marcas sueltas —entrada, salida, entrada…— y después intentan emparejarlas. Eso se rompe con el turno de noche, con la salida que alguien olvidó marcar, y con dos lectores escaneando a la vez.

Aquí **cada fila es una jornada entera**: la entrada y la salida juntas, de una misma persona. Una jornada con la salida en blanco está **abierta**. Corregir es cambiar dos horas de una fila. Y una salida olvidada es una fila abierta que se ve, se completa a mano o se queda así: **la entrada del día siguiente nunca la cierra**.

<p class="regla"><strong>La hora la pone el sistema, no el teléfono.</strong> Al escanear, la hora es la del servidor. Un teléfono con el reloj mal puesto no cambia a qué hora entró alguien. Solo la carga a mano trae sus propias horas, y por eso queda marcada como cargada a mano y con el nombre de quien la cargó.</p>

### 23.2 Quién entra y quién puede hacer qué

**Lectura** ve el día de hoy, el calendario y saca el reporte. **Escritura** además **marca** —con el carnet o eligiendo a la persona—, **carga a mano** y **corrige** horas. **Control total** además **anula** una jornada y cambia los **ajustes**.

El módulo nació con el permiso en **Ninguno para todos los roles**: hasta que administración lo reparta (13.1), solo lo ve el administrador.

### 23.3 Marcar

Arriba de la pantalla, la tarjeta **Marcar**. Hay tres maneras, y en las tres **el sistema decide si es entrada o salida**:

| Cómo | Detalle |
| --- | --- |
| **Lector USB** | Se escanea el QR del carnet con el campo «Carnet» activo. El lector teclea la dirección y pulsa Enter solo. Es la manera para un puesto fijo |
| **Cámara** | El botón **Cámara**, en el teléfono o el computador, con cualquier navegador. La primera vez el navegador pregunta si permite la cámara: hay que decir que sí. Apunta al QR del reverso y marca en cuanto lo lee. Si dice que la cámara está bloqueada, se permite desde el candado junto a la dirección |
| **A mano** | En **O elija a la persona** se busca por nombre o ficha y se pulsa **Marcar**. Para quien dejó el carnet en casa |

Debajo aparece en grande lo que pasó: **Entrada · 07:12 · Nombre**, o **Salida**. Si salió mal —carnet anulado, persona que ya no está en el personal, doble escaneo—, lo dice ahí mismo.

**Cómo decide.** Si la persona tiene una jornada abierta con menos de **16 horas** —el campo **Horas máximas de una jornada**, en **Ajustes de asistencia**, admite de 4 a 24—, el toque es su **salida**. Si no tiene ninguna, o la que tiene ya se pasó de las 16 horas, el toque es una **entrada nueva**, y la vieja queda abierta para que alguien la revise: el propio aviso lo dice.

**Dos toques seguidos** del mismo carnet en menos de **2 minutos** —el campo **Minutos para considerar un doble escaneo**, de 0 a 30—: el segundo se rechaza. Es un candado, no un aviso.

### 23.4 Hoy

Quién está **adentro** ahora mismo, quién **ya salió** con sus horas, y —aparte y en amarillo— las jornadas de **otros días que quedaron sin salida**, que son las que hay que corregir.

**El aviso amarillo cuenta, no enumera.** Dice cuántas jornadas sin salida hay y de qué días —*«62 jornadas de otros días sin salida. En 4 días, del 23 de septiembre al 3 de octubre»*— y se despliega con el triangulito si se quieren ver; desplegado van **agrupadas por día**, con los nombres y la hora de entrada en texto corrido.

**Y conviene saber por qué se acumulan:** una jornada sin salida **no se cierra nunca sola**. Si al día siguiente la persona vuelve a marcar entrada, se le abre una jornada nueva y la vieja se queda esperando a que alguien la corrija desde el calendario. Veinte personas que olvidan marcar la salida dejan veinte jornadas abiertas cada día, y se van sumando. La cuenta solo baja corrigiéndolas.

### 23.5 El calendario

Un mes de un vistazo, con cuántas personas marcaron cada día y cuántas jornadas quedaron sin salida. La casilla **Solo una persona** lo reduce a quien se elija. Al tocar un día se ve su gente: entrada, salida, horas, turno (☀️ día si entró entre las 6 y las 18, 🌙 noche el resto), y si vino del carnet o se cargó a mano.

Desde ahí, con permiso:

- **Corregir**: cambiar la entrada, la salida o la nota. Queda anotado quién y cuándo.
- **Anular**: con un motivo. No se borra: queda anulada y a la vista.

**Debajo de la gente que marcó, la pantalla dice quién no marcó ese día** —*«3 sin marcar ese día»*, con el nombre, la ficha y el cargo de cada uno—, o **Todo el personal activo marcó ese día** si no falta nadie. Solo se calcula hasta hoy: un día futuro no enseña esta lista, porque todavía no pasó.

<p class="regla"><strong>Esto no es un registro de faltas, es una resta.</strong> El sistema no sabe qué días trabaja cada quien, ni quién está de vacaciones, de reposo o con un permiso: cuenta a todo el personal activo —sin los eventuales, que no tienen obligación de marcar todos los días— y resta a quien tenga una jornada sin anular ese día. No descuenta domingos, feriados ni permisos que no se hayan registrado como marcación, así que antes de tomarlo como una falta hay que revisarlo. Si alguien ya ingresó después de esa fecha, tampoco sale en la lista: no se le puede pedir que marcara antes de existir en el sistema.</p>

### 23.6 Cargar a mano

El botón **Cargar a mano** abre **Cargar una jornada a mano**: **Persona**, **Entrada**, **Salida** —opcional: vacía, la jornada queda abierta— y una **Nota**. El sistema no deja cargar una jornada que se cruce con otra de la misma persona, ni una de más de 24 horas: si fueron dos días, se cargan como dos.

### 23.7 El reporte

El botón **Reporte** abre **Reporte de asistencia**: **Desde**, **Hasta** y, si se quiere, una sola persona. Sale con el membrete de la empresa, en dos tablas: **por persona** —días, horas, jornadas sin salida— y **jornada por jornada**. Se ve en el visor antes de descargarlo.

<p class="regla"><strong>Una jornada sin salida cuenta como día presente pero no suma horas.</strong> Nadie sabe a qué hora se fue esa persona, y sumarle cero es mentir menos que inventarle ocho.</p>

### 23.8 Lo que no hace

**No alimenta la nómina.** Las horas se ven y se imprimen, y ahí terminan: las faltas y las horas extra se siguen cargando en Nómina › Novedades. Si algún día conviene que salgan de aquí, es una decisión aparte. Tampoco calcula retardos ni amonestaciones.

### 23.9 Los visitantes

Gente de afuera que entra a la cantera —un chofer de otra empresa, un inspector, un cliente que viene a ver el material, un técnico— y que no está en la nómina ni tiene carnet. La tarjeta **Visitantes**, debajo de **Hoy**, es donde se les marca la entrada y la salida. Usa el mismo permiso del módulo: quien marca al personal marca visitantes; quien anula jornadas anula visitas.

**El visitante se registra una vez; después solo se le marca.** Cada persona de afuera está una sola vez en la lista de **Conocidos**, con su nombre, cédula, empresa y teléfono. Cada vez que viene, se le busca y se le marca la entrada: sus datos no se vuelven a escribir. Y la visita sigue la misma idea que la jornada: una fila con la entrada y la salida juntas; sin salida, **sigue adentro**, y no se cierra sola.

| Qué | Cómo |
| --- | --- |
| **Marcar entrada** | El botón de la tarjeta. Se busca al visitante por nombre, cédula, empresa o teléfono; debajo dice cuántas veces ha venido y cuándo fue la última. Se agrega, si se quiere, **a quién visita** del personal, el motivo, la placa del vehículo y una nota. Con la **entrada vacía, la hora la pone el sistema** en ese momento; se llena solo para cargar una visita de antes, con su salida si ya se fue |
| **Es nuevo: registrarlo** | Si no aparece en la búsqueda, se registra como nuevo: puede que esté escrito de otra manera, así que conviene probar antes con la cédula o la empresa. Ese enlace abre los datos de la persona en la misma ventana; se llenan y se pulsa **Registrar y marcar entrada**. Queda registrado y adentro de una vez |
| **Del directorio** | Si el visitante ya está en **Contactos**, se elige arriba y se rellenan solos el nombre, la cédula, la empresa y el teléfono. Solo lo ve quien tiene lectura en Contactos; los demás escriben todo a mano |
| **Salida** | Al lado de cada persona que está adentro. La hora la pone el sistema ahora mismo. Si se fue antes y nadie lo anotó, la casilla **poner la hora real** deja escribirla |
| **Conocidos** | La lista de todos los que han venido, con cuántas visitas lleva cada uno. Desde ahí se **editan** los datos de la persona, que cambian en todas sus visitas, y se deja **inactivo** al que no debe volver a entrar: a un inactivo no se le puede marcar entrada hasta activarlo. También se puede registrar a alguien sin marcarle entrada todavía |
| **Corregir** y **Anular** | En la lista de visitas del día elegido en el calendario, como con las jornadas: corregir cambia las horas, el motivo o la persona, y queda anotado quién lo hizo; anular pide motivo y control total, y no borra |
| **Excel del mes** | Saca las visitas del mes que muestra el calendario, una por fila, con todas sus columnas |

<p class="regla"><strong>Los repetidos los decide el sistema.</strong> Al registrar o editar a un visitante, si otro ya tiene esa cédula o ese teléfono, no se guarda y el aviso dice quién: <em>Ya existe «PEDRO VISITANTE» con la cédula V-12345678</em>. El teléfono se compara por sus dígitos, sin el 58 ni el 0 de adelante, así que 0414-1234567 y +58 414 1234567 son el mismo. Si de verdad es otra persona, aparece la casilla <strong>Es otra persona: registrarlo igual</strong>; marcarla es decir que se miró, y entonces pasa. Y si la cédula o el teléfono coinciden con alguien del directorio de Contactos, el visitante queda enlazado a ese contacto solo: es la misma persona vista desde dos módulos.</p>

**La misma persona no puede estar adentro dos veces.** Si sigue adentro y se le intenta marcar otra entrada, el aviso dice desde qué hora, y hay que registrarle la salida primero. Las visitas de otros días que quedaron sin salida aparecen en la misma lista de **Adentro ahora**, con la marca amarilla **Sin salida**, para que se cierren con la hora real.

Los visitantes **no entran al calendario del personal, ni al reporte de asistencia, ni a la nómina**: son otra tabla, y se sacan por su propio Excel.

## 24. Contactos

**Administración › Contactos**

El directorio general de la empresa: personas y empresas con las que se trata, con sus teléfonos, correos, dirección, etiquetas y quién los atiende. No es un módulo que mueva nada: no factura, no paga, no descuenta. Es donde se busca a alguien.

**Quién entra.** Nace con el permiso cerrado para todos menos administración. Se reparte en Configuración › Usuarios, fila **Contactos**: **lectura** ve y exporta; **escritura** crea, edita e importa; **control total** además bloquea, desbloquea, elimina y edita las etiquetas.

### 24.1 Qué se ve

Arriba, los botones **Excel** y **vCard**, que sacan lo que se ve en pantalla o, si hay contactos marcados, solo esos; **Importar**, y **Nuevo contacto**.

Debajo, el campo **Buscar** y cinco filtros: **Tipo** (personas o empresas), **Etiqueta**, **Estado**, **Región** y **Asignado a**. Se combinan: «los proveedores de Puerto Ordaz que estén activos» es escribir «puerto ordaz» y marcar dos selectores. El estado empieza en **Activo**, para que lo inactivo y lo bloqueado no estorben; se cambia a **Cualquiera** cuando hace falta verlo. Si no hay nada que mostrar, la pantalla distingue los dos casos: **El directorio está vacío** cuando no hay contactos, y **Sin resultados** cuando los filtros no encuentran ninguno.

**El buscador entiende trozos y no le importan los acentos.** Busca en el nombre, la empresa, el cargo, los correos, los teléfonos con y sin formato, la ciudad, las etiquetas y la nota. Cada palabra escrita tiene que estar: «perez 0414» encuentra a Pérez por su celular.

La lista tiene siete columnas —**Contacto**, **Empresa · cargo**, **Canales**, **Dónde**, **Etiquetas**, **Atiende** y **Estado**—. El nombre va con su tratamiento y su documento, y los **canales son enlaces**: el WhatsApp abre el chat, el celular y la oficina llaman, el correo abre el correo. Pulsar en la fila abre su ficha.

Si dos contactos comparten un correo o un teléfono, arriba aparece un aviso amarillo con cuántas parejas hay y el botón **Ver solo esos**; en la lista, cada uno lleva la marca **· repetido**. Puede ser la misma persona dos veces, o dos personas con el teléfono de la misma oficina: lo decide quien lo mira.

### 24.2 La ficha

**Nuevo contacto** o pulsar una fila abre la ficha, en bloques:

| Bloque | Qué lleva |
| --- | --- |
| **Quién es** | El **Tipo**: persona o empresa. Persona: **Tratamiento**, **Nombres**, **Apellidos**, **Cargo**, y la empresa en uno de dos campos — **Empresa registrada**, del directorio, o **Empresa no registrada**, escrita a mano—. Empresa: **Razón social**. El documento cambia de nombre con el tipo: **Cédula o RIF** para una persona, **RIF** para una empresa. Es opcional, con la letra y los guiones |
| **Cómo se le habla** | Celular, WhatsApp, teléfono de oficina con extensión, correo y correo secundario. Debajo, los enlaces para llamar o abrir el chat |
| **Dónde está** | Dirección, ciudad, estado (con la lista de estados de Venezuela como ayuda), código postal, país, y el enlace **Ver en el mapa**, que se arma con la dirección escrita. No hay mapa dentro del sistema |
| **En la web** | Sitio web, LinkedIn, Instagram, Facebook |
| **Cómo se clasifica** | Las **etiquetas**, que son botones y admiten varias (cliente, proveedor, prospecto, socio, contratista, ente público, competidor, otro); **Origen**, de dónde vino, texto libre con sugerencias; **Asignado a**, un usuario del sistema; y el **Estado**, con su **Motivo** cuando no es activo |
| **Es el contacto de…** | El cliente, el proveedor o el trabajador que ya existe en el sistema, para no tenerlo dos veces. Y la nota |

**El control de repetidos lo hace el sistema.** Al guardar, si otro contacto ya tiene ese correo o ese teléfono, no se guarda y el aviso dice quién: **Ya existe «JOSE PEREZ» con el teléfono 4141234567.** El teléfono se compara por sus dígitos, sin el 58 ni el 0 de adelante, así que 0414-1234567, +58 414 1234567 y 4141234567 son el mismo; el correo, sin importar mayúsculas. Debajo del aviso aparece la casilla **Es otra persona: guardar igual**. Marcarla es decir que se miró; entonces pasa.

**Bloquear, o quitar el bloqueo, pide control total.** Un contacto bloqueado sigue en el directorio, con su motivo, y sale con la etiqueta roja. **Eliminar**, también con control total, borra el contacto; queda en la auditoría quién lo hizo. Una empresa con personas enlazadas no se elimina hasta desenlazarlas. Si un contacto solo dejó de ser útil, márquelo inactivo en vez de borrarlo.

### 24.3 Importar y exportar

**Importar** abre la ventana **Cargar contactos desde Excel**, en tres pasos como la del control de despacho: bajar la plantilla, llenarla en Excel, subirla y revisar antes de guardar. La plantilla trae dos filas de ejemplo que se borran, y las columnas obligatorias en realce: TIPO y, según sea, NOMBRES o RAZON SOCIAL. El orden de las columnas da igual, se casan por su título; una que falte se deja vacía. Las etiquetas van separadas por coma, con el nombre que tienen aquí.

**Cargar crea contactos nuevos, nunca pisa los que ya están.** Cada fila pasa por las mismas reglas que la ficha, incluido el repetido: si la fila 12 trae el celular de alguien que ya está, o de la fila 3 del mismo archivo, no se guarda ninguna y el aviso dice **Fila 12: Ya existe «…»**. Lo que ya está se corrige en la pantalla, uno por uno, que es donde se ve el repetido.

**Excel** baja lo que se ve o lo marcado, con todas las columnas más quién lo atiende y el estado. **vCard** baja un archivo `.vcf` que el teléfono, Outlook y WhatsApp importan solos: es la manera de pasarle al celular de alguien los contactos del directorio.

### 24.4 Lo que este módulo no hace

No envía correos ni mensajes: abre el canal y ahí termina. No lleva historial de conversaciones ni recordatorios. No sustituye a Clientes ni a Proveedores: esos siguen llevando lo que factura y lo que se compra; el contacto se enlaza a ellos para no escribir dos veces el mismo teléfono.


## 25. Alimentación

**Administración › Alimentación**

Registra cada comida servida al personal —desayuno, almuerzo o cena— con cuántas personas comieron y qué víveres se gastaron. **Los víveres se descuentan del inventario al servir**, al costo promedio que tengan en ese momento, y de ahí sale el número que justifica el módulo: **el costo por plato**.

**Quién entra.** Nace con el permiso cerrado para todos menos administración; se reparte en Configuración › Usuarios, fila **Alimentación**. **Lectura** ve las comidas y el costo; **escritura** sirve comidas y anula las de hoy; **control total** anula las de cualquier día.

### 25.1 Los víveres

Un víver es un artículo de la categoría **Víveres**, con códigos VIV-0001 en adelante. Se crean en Inventario › Artículos y **entran por una compra recibida**, como todo. Si la cocina tiene su propio almacén, los víveres se le llevan con un **traslado** — un traslado no pierde existencia, así que no hay doble descuento: la única resta la hace la comida al servirse.

### 25.2 Servir una comida

Desde la pantalla, el botón **Servir comida** abre la ventana **Servir una comida**: se elige **Desayuno**, **Almuerzo** o **Cena**, y después **Platos** —cuántos comieron—, **Almacén**, **Fecha**, y la lista de víveres con su **Víver** y su **Cantidad**. Hay además una **Nota**, por si la comida necesita explicarse. La pantalla estima el costo con el promedio actual; **la cifra final la pone el sistema** al guardar, y queda congelada: el plato de ayer no cambia de precio con la compra de mañana.

El sistema no deja servir con fecha futura, ni con un víver repetido en la lista, ni más cantidad de la que hay en el almacén. Cada comida queda con su número — **COM-2026-0001** en adelante — y sus consumos se ven también en el libro de inventario, uno por víver, con el número de la comida en la nota.

### 25.3 La cocina en el teléfono

La vista para quien cocina, con el mismo molde del surtidor de combustible (20.4): se abre desde el botón **Vista de teléfono**, se toca 🍳, 🍽️ o 🌙 —desayuno, almuerzo o cena—, se ponen los **Platos**, se elige el **Almacén** y se escriben las cantidades al lado de cada víver. El buscador de arriba filtra la lista cuando el catálogo es largo. Si la señal está mala y el guardado tarda más de doce segundos, el aviso dice que **ya se está guardando y no hay que cargarla otra vez**. Al guardar, el acuse dice el costo por plato y se puede **pasar por WhatsApp**.

**Quién entra directo.** En Configuración › Usuarios, entre los permisos extendidos de Alimentación, está la casilla **Entrar directo a la cocina del teléfono**: quien la tiene abre el sistema y aparece ya en esa pantalla. No da permiso de nada por sí sola, y nadie la tiene de entrada. Si una misma persona tuviera también la del surtidor, aterriza en el surtidor.

### 25.4 Anular

Una comida no se edita ni se borra: **se anula con motivo**, y los víveres vuelven al inventario con un reverso que queda a la vista. Quien tiene escritura puede anular **la del mismo día** —el error se corrige donde se cometió—; anular una de otro día cambia costos que alguien pudo haber mirado, y por eso pide control total. **La ventana lo avisa antes de pulsar**: «No es de hoy: requiere control total.»

### 25.5 Pedir el mercado

El botón **Pedir el mercado** arma la lista de compra de la cocina sin teclearla: aparecen **todos los víveres del catálogo, ya marcados**, con la cantidad de la última solicitud de mercado como sugerencia y, al lado de cada uno, cuánto hay en existencia. El trabajo es quitar lo que no hace falta y ajustar números. Si falta algo que no es víver —la escoba, el jabón— se agrega **cualquier artículo del catálogo** con el campo **Artículo**; y lo que no existe todavía se escribe en **Descripción**, como texto libre, para que la oficina decida al cotizar. Abajo están el **Destino** y una **Nota para la oficina**.

Lo que sale de ahí **no es un papel aparte: es un pedido de compras de verdad** — número SOL, prioridad urgente, título «Reposición del mercado» — que entra al tablero de Compras y sigue el circuito de siempre: cotizar, aprobar, pagar y recibir. La recepción es la entrada de inventario que repone los víveres. **El Destino puede quedar sin elegir** —dice «Se decide al recibir»—, y entonces el almacén se escoge al recibir el material. Para pedirlo basta la **escritura en Alimentación**: no hace falta el permiso de Compras, porque del pedido en adelante todo lo decide la oficina.

### 25.6 Lo que este módulo no hace

No asocia la comida a un trabajador concreto: cuenta platos, no nombres. No lleva menú ni recetas. Y su analítica de ciclos de mercado —inventario teórico contra conteo, merma, ración por persona— no se trajo todavía: se decidirá con un mes de comidas registradas delante.

---

## 26. Salidas y traslados

**Operación › Salidas y traslados**

Es el módulo de lo que sale del almacén y de lo que se mueve entre almacenes: por qué salió, para quién y quién lo entregó. Tiene su propio permiso (26.1).

Tiene tres pantallas, que son también sus tres pestañas: **Historial**, **Salidas** y **Traslados**.

Hay dos ideas que ordenan todo el módulo:

- **Nada sale sin solicitud, y nada se descuenta hasta entregarlo.** Una salida se pide, la aprueba quien responde por el almacén y la entrega alguien de almacén. Solo al entregarla sale la nota y baja la existencia. Las salidas **directas**, hechas sin solicitud, están en el **Historial**; desde ninguna pantalla se crea una nueva.
- **Las ventas no salen por aquí.** Lo que se le vende a un cliente sale por **Facturación › Notas de entrega**, con su precio y su número; las compras se llevan en Compras.

### 26.1 Quién entra y quién puede hacer qué

Para entrar a cualquiera de las tres pantallas basta con tener **Salidas y traslados** en lectura. Lo demás depende de cada paso:

| Para | Hace falta |
| --- | --- |
| Solicitar una salida | Lectura sobre el módulo |
| Aprobar o no aprobar una salida | Ser el **Responsable** del almacén de donde sale —se pone en **Inventario › Almacenes y talleres**—, o tener la casilla **Aprobar las solicitudes de salida**, que trae el gerente general. **Quien pidió una salida no la aprueba** |
| Entregar una salida | Escritura sobre el módulo |
| Cancelar una salida | Haberla pedido, o poder aprobarla |
| Hacer un traslado | Escritura sobre el módulo. Para enviarlo, además, ser el responsable del almacén de donde sale; para uno directo, de los dos almacenes |
| Aprobar y enviar un traslado, confirmar que llegó o cancelarlo | Ser el responsable del almacén que toca. Aquí no cuenta el nivel del módulo |
| Generar la nota de entrega de una salida | La casilla **Generar la nota de entrega de una salida**. No la trae ningún rol: se le presta a cada persona (13.1) |

El gerente general y el administrador hacen de respaldo en todos los pasos de los almacenes: aprueban, envían, reciben y cancelan aunque no sean los responsables.

El Historial y los traslados se leen, además, con el permiso de Inventario. Quien tiene uno suele tener el otro; si a alguien le salen esas dos pantallas vacías teniendo Salidas y traslados, es lo primero que hay que mirar.

### 26.2 Salidas

**Operación › Salidas y traslados › Salidas**

La pantalla dice: **Solicitudes de salida de material de un almacén. Ninguna salida descuenta existencias hasta que la aprueba el responsable del almacén y el personal de almacén la entrega. Las ventas salen por Facturación › Notas de entrega; las compras se gestionan en Compras.**

Arriba hay dos botones: **Esperan**, con cuántas, que enseña las que faltan por aprobar o por entregar, y **Todas**. Se abre en **Esperan**. Salen las doscientas más recientes, y todo el que entra al módulo ve todas, no solo las suyas.

Cada solicitud es una tarjeta con su número —**Orden SS-2026-0001**— y su estado:

| Estado | Qué quiere decir |
| --- | --- |
| **Por aprobar** | Se pidió y espera a quien responde por el almacén |
| **Por entregar** | Se aprobó y espera a que alguien de almacén la entregue |
| **Entregada** | Salió: tiene su nota de salida y ya descontó la existencia |
| **Rechazada** | Quien responde por el almacén no la aprobó |
| **Cancelada** | Se anuló antes de entregarla |

Debajo, la tarjeta dice de qué almacén sale y para quién, el motivo, un renglón por cada material, quién la pidió, quién la aprobó o la rechazó y quién la entregó. Y lo que falta, en otro color: **Falta que la apruebe quien responde por** el almacén **o quien tenga el permiso de aprobar salidas.**, o **Aprobada. Falta que alguien de almacén la entregue: al entregarla sale la nota y se descuenta la existencia.**

#### Solicitar una salida

1. Pulse **Solicitar salida**. Se abre **Solicitar salida de material**. También se llega desde **Inventario › Existencias**, con el botón **Solicitar salida** de cada fila, y entonces el material y el almacén ya vienen puestos.
2. Elija el **Almacén predeterminado**: es el de todos los renglones que no digan otro.
3. En cada renglón, elija el **Artículo**, el **Almacén** —si solo un sitio lo tiene, se pone solo— y la **Cantidad**. Debajo de la cantidad se ve cuánto hay. Si el artículo tiene presentaciones —tambores, pailas, sacos—, puede contar en ellas y escribir en **Fracción en** la unidad lo que queda del último empezado.
4. Si en ese almacén hay material de varios dueños, aparece **Dueño**: diga de cuál sale.
5. Para otro material, pulse **Añadir otro material**.
6. Diga **¿Quién lo va a recibir?**:
   - **Alguien de la empresa**: un área o un cargo del organigrama.
   - **Alguien de fuera de la empresa**: escriba el **Destino** —la empresa o la persona— y elija el **Responsable**, que firma la nota. Si no es de la empresa, elija **Otra persona — no es de la empresa** y escriba su nombre.
7. Escriba el **Motivo**. Es lo que lee quien la aprueba, y queda en la nota cuando se entregue.
8. Si se lo lleva un vehículo, marque **Se lo lleva un vehículo y alguien lo recibe** y diga el **Vehículo**, quién lo recibe (**Recibido por**) y su **Cédula**. El nombre y la cédula salen en el papel, en el cuadro, como **Recibido por**.
9. Si quiere, adjunte hasta cuatro fotos o PDF del vehículo con **Adjuntar fotos o PDF**. No salen en el papel impreso.
10. Pulse **Enviar solicitud**.

**Una solicitud es de un solo almacén.** Si algún renglón sale de otro almacén, el botón dice **Enviar 2 solicitudes** y sale una por cada almacén, cada una para que la apruebe quien responde por el suyo. O salen todas, o ninguna.

**Una venta no se solicita aquí, y el motivo lo vigila.** Si dice *venta*, *cliente*, *permuta*, *canje* o *pago con material*, la pantalla lo para: **Dice «venta»: una venta no se solicita aquí, se registra en Facturación › Notas de entrega. Si no es una venta, dígalo sin esa palabra; quien la aprueba lee el texto entero.**

El motivo, el destino y el responsable se guardan en mayúsculas.

**Las fotos se pueden añadir y quitar después**, desde la tarjeta, mientras la salida no esté rechazada ni cancelada. Subirlas pide escritura sobre el módulo. Una foto quitada no se borra: queda tachada, con quién la quitó y por qué.

#### Aprobar o no aprobar

Quien responde por el almacén ve en la tarjeta **Aprobar** y **No aprobar**.

**Aprobar** no mueve nada: deja la salida **Por entregar**. Si tiene su firma guardada, antes le pregunta si la pone en **Autorizado por**; si no, aprueba al instante.

**No aprobar** pide un **Motivo**: **Lo lee quien la pidió.** La salida queda **Rechazada**, y quien la pidió ve en su tarjeta quién la rechazó y por qué. Tampoco mueve nada.

#### Entregar

Quien tiene escritura sobre el módulo ve **Entregar material** en las salidas **Por entregar**.

**Un solo clic entrega**: no hay confirmación. En ese momento el sistema vuelve a comprobar que haya existencia, crea la nota de salida —**NS-2026-0001**—, descuenta el material al costo promedio del almacén y abre la nota para imprimirla.

#### Cancelar

Una salida **Por aprobar** o **Por entregar** se cancela con **Cancelar**, y pide un **Motivo**: **Queda escrito y no se puede editar después.** No cambia ninguna existencia, porque nada se descontó antes de entregar. **Una salida entregada ya no se cancela.**

### 26.3 Traslados

**Operación › Salidas y traslados › Traslados**

La pantalla dice: **Traslados de material entre almacenes: solicitados, enviados o directos. Cada fila indica lo pendiente y a quién le corresponde.**

Trasladar no cambia lo que vale el material: **el costo viaja con él**, y llega con el mismo con el que salió. Tampoco cambia de dueño: el traslado lo lleva.

#### Tres maneras de trasladar

Pulse **Nuevo traslado**. Lo primero que pregunta es **¿Qué quiere hacer?**, y cada opción dice quién hace cada paso:

| Opción | Qué pasa | Botón |
| --- | --- | --- |
| **Pedir material de otro almacén** | **Queda pedido y todavía no se mueve nada. Lo aprueba y envía quien responde por el almacén de donde sale; quien responde por el de destino confirma que llegó.** | **Pedir traslado** |
| **Enviar material a otro almacén** | **Sale ahora de un almacén por el que responde y queda «En tránsito». Quien responde por el de destino confirma que llegó.** | **Enviar ahora** |
| **Traslado directo** | **Sale y llega en este mismo momento, sin esperar a nadie. Solo si responde por los dos almacenes, o es administración.** | **Trasladar ahora** |

La opción que no está a su alcance sale apagada y dice por qué.

Después:

1. Elija el **Origen**. Solo salen los almacenes que tienen algo que trasladar.
2. Elija el **Destino**. No puede ser el mismo: **No puede ser el mismo de donde sale.**
3. Elija el **Artículo** y escriba la **Cantidad**. Debajo se ve cuánto hay disponible. Como en las salidas, se puede contar en presentaciones.
4. Si en el origen hay material de varios dueños, diga de cuál en **Dueño**.
5. Escriba el **Motivo**.
6. Pulse el botón de la opción elegida.

El traslado queda con la fecha de hoy: no hay campo de fecha.

Mientras va de camino, el material no desaparece: sigue contando en el inventario, en un sitio que se llama **En camino**, y de ahí sale al confirmar la llegada.

**Lo que entró sin costo** —como el combustible trasladado de otra empresa del grupo— solo se traslada con **Traslado directo**, y solo a sitios que también admiten material sin costo. Así no se mezcla con lo que sí costó.

#### La lista

Arriba hay dos botones: **Pendientes**, con cuántos, y **Todos**. Se abre en **Pendientes**, que son los pedidos y los que van de camino. Salen los trescientos más recientes.

Cada fila dice el número —**TRA-2026-0001**—, su estado, cómo nació (**Pedido**, **Enviado** o **Directo**), el artículo con su motivo, la cantidad, el **Recorrido** de un almacén al otro y el **Seguimiento**: quién dio el último paso y lo que falta.

| Estado | Qué quiere decir |
| --- | --- |
| **Solicitado** | Pedido. No se ha movido nada |
| **En tránsito** | Salió del origen y espera a que confirmen la llegada |
| **Recibido** | Llegó |
| **Cancelado** | Se anuló. Si ya había salido, volvió al origen |

#### Los pasos de cada traslado

- **Aprobar y enviar**: lo ve quien responde por el almacén de origen en un traslado **Solicitado**. El material sale y queda **En tránsito**.
- **Confirmar llegada**: lo ve quien responde por el almacén de destino en un traslado **En tránsito**. El material entra al destino y queda **Recibido**.
- **Nota**: abre la nota de traslado, en cuanto el material ha salido.
- **Cancelar**: pide un **Motivo**. Un traslado **Solicitado** lo cancela quien lo pidió o quien responde por cualquiera de los dos almacenes; uno **En tránsito**, quien responde por cualquiera de los dos. Si el material ya había salido, vuelve al origen, al mismo costo. **No se borra nada: el traslado queda cancelado con su motivo, y si el material ya había salido, su vuelta queda escrita en el libro.**

Si tiene su firma guardada, al enviar y al recibir le pregunta si la pone en **Envió** o en **Recibió** de la nota de traslado.

**Un traslado recibido no se cancela ni se deshace.** Si hay que devolver el material, se hace un traslado nuevo en sentido contrario.

El inventario también tiene un botón **Trasladar**, en **Inventario › Existencias**, que abre esta misma ventana con el almacén ya puesto.

### 26.4 Historial

**Operación › Salidas y traslados › Historial**

Es la consulta de todo lo que ya movió existencia: salidas entregadas y traslados. **Aquí no se registra nada.** Lo dice la pantalla: **Solo aparece lo que ya movió existencia. Una solicitud de salida sin entregar o un traslado pedido sin enviar todavía no está aquí: se ven en su pestaña.**

Los filtros:

- **Buscar una nota**: **Trae la nota entera, con todos sus renglones, aunque sea vieja.** Se busca por el número de la nota de salida —**NS-2026-0012**— o por el del movimiento.
- **Ver**: **Salidas y traslados**, **Solo salidas** o **Solo traslados**.
- **Desde** y **Hasta**, con los atajos **Hoy**, **Esta semana**, **Este mes** y **Mes pasado**. Cuentan el día en que pasó el movimiento.
- **Artículo**, **Almacén**, **Registrado por** y **Destino**.

Salen los doscientos más recientes. Si hay más, lo dice: **el libro trae los 200 más recientes: acote las fechas para ver más atrás**.

Las columnas son **Movimiento**, **Artículo**, **Almacén**, **Destino** y **Cantidad**. En **Movimiento** va el número, la clase de salida, cuándo y quién la registró, y debajo los botones de los papeles:

- **Orden SS-…**, en las salidas que vinieron de una solicitud.
- **Nota NS-…**, en todas las salidas.
- **Nota de traslado**, en los traslados.

El detalle completo de cada movimiento está en el libro de movimientos (7.6), y la pantalla lleva un enlace al pie.

### 26.5 Los papeles

Todos se abren primero en una vista previa, con **Cerrar** y **Descargar**.

**Orden de salida.** Es la solicitud en papel: lo que se pidió y en qué estado está. Se imprime en cualquier estado y no lleva costos. La vista previa lo dice: **Lo solicitado y su estado. Lo que sale consta en la nota de salida, al entregar.** Si la salida se rechazó o se canceló, lleva cruzado el sello **RECHAZADA** o **CANCELADA**.

**Nota de salida.** Es lo que de verdad salió, y es el papel que firma quien recibe: **La firma quien recibe el material.** Compruébela antes de imprimirla. Sale sola al entregar, y se vuelve a sacar con el botón **Nota** de la tarjeta o del Historial.

- Lleva el número de la nota y el de su orden, la fecha, el almacén, para quién es, el vehículo y **Recibido por** con su cédula, si se dijeron al solicitar.
- Debajo, el motivo y la tabla del material, con **Código**, **Artículo**, **Cantidad** y **Unidad**. Si se contó en presentaciones, el artículo lo dice.
- La casilla **Incluir costos** de la vista previa añade el costo y el total. Viene desmarcada.
- Las rayas de firma son **Solicitado por** y **Autorizado por**, con la firma digital de cada uno si la eligió. Las salidas directas, hechas sin solicitud, firman **Entregó** y **Recibió conforme**.

Si la salida fue para alguien de fuera de la empresa, quien tenga la casilla **Generar la nota de entrega de una salida** ve en la vista previa la opción **Generar nota de entrega**: una nota de entrega que respalda lo mismo que ya salió, sin volver a descontar material. Se explica en 10.10.

**Nota de traslado.** Sale en cuanto el material deja el almacén de origen, y se vuelve a sacar con el botón **Nota**. Lleva el origen, el destino, el estado, cómo nació, quién dio cada paso y el motivo. Las rayas de firma son **Envió** y **Recibió**. Si el traslado se canceló, lleva cruzado el sello **CANCELADO**.

### 26.6 Cuando el sistema no le deja

| Lo que ve | Qué significa | Qué hacer |
| --- | --- | --- |
| **Dice «venta»: una venta no se solicita aquí…** al escribir el motivo | El motivo nombra una venta, un cliente o un pago con material | Si es una venta, regístrela en **Facturación › Notas de entrega**. Si no lo es, dígalo sin esa palabra |
| **Ahí solo quedan** y una cantidad, en rojo | Pide más de lo que hay en ese almacén | Baje la cantidad, o saque el resto de otro almacén en otro renglón |
| «Su usuario no tiene permiso para esta acción.» al pulsar **Aprobar** | Lo más probable: la solicitud la pidió usted. Nadie aprueba lo suyo | Que la apruebe otra persona que responda por ese almacén, o el gerente general |
| «La base no admite ese valor. Revise los datos de la operación; si no escribió nada, avise a soporte.» al solicitar en presentaciones | Hoy, pedir presentaciones enteras sin nada suelto falla | Pídalo en la unidad del artículo |
| **La solicitud** y el número **quedó hecha, pero las fotos no subieron** | La salida se pidió, pero las fotos no llegaron | Añádalas desde su tarjeta. Si no le deja, es que subir fotos pide escritura sobre el módulo |
| **No puede ser el mismo de donde sale.** | El destino del traslado es el mismo que el origen | Elija otro destino |
| La opción **Enviar** o **Traslado directo** apagada | No responde por el almacén de origen, o por los dos | Use **Pedir material de otro almacén**, y que lo envíe quien responde por el origen |
| Un mensaje que dice que el traslado **ya se recibió y no se cancela** | El material ya llegó | Haga un traslado de vuelta |
| El Historial o los traslados vacíos, teniendo el módulo | Le falta el permiso de lectura sobre Inventario | Pídalo a la administración |
