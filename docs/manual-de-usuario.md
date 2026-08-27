# Manual de usuario — La Cantera

**Sistema de control interno · Minería Internacional TS, C.A.**

**Versión 1.4 · 27 de agosto de 2026**

---

## Cómo está hecho este manual

Está escrito para quien trabaja con el sistema todos los días, no para quien lo programa. No hace falta saber de computación para seguirlo.

Cada capítulo corresponde a un módulo y sigue siempre el mismo orden: para qué sirve, quién puede entrar, qué se ve en cada pantalla, cómo se hace cada tarea paso a paso, y una tabla final con los mensajes que puede mostrar el sistema y qué hacer ante cada uno.

Tres convenciones que se repiten en todo el documento:

- Lo que aparece **en negrita** es texto que vas a ver escrito en la pantalla: un botón, el nombre de un campo, el título de una columna.
- Lo que aparece «entre comillas angulares» es un mensaje que muestra el sistema, copiado tal cual.
- Las rutas se escriben como se recorre el menú: **Operación › Inventario › Existencias**.

**Este manual describe el sistema que existe hoy, no el que se planeó.** Donde algo esté a medio construir, el manual lo dice. El capítulo 15 reúne todo lo que todavía no está disponible y los puntos donde conviene tener cuidado, para que nadie planifique su trabajo contando con algo que aún no puede hacer.

El orden de los capítulos es el del camino del material: primero se extrae, luego se almacena, después sale por el portón, y por último se administra lo que eso genera.

### Por qué hay capítulos que hoy no se alcanzan

El sistema se entrega por partes, y el menú va creciendo. Hoy ofrece diez entradas: **Panel**, **Maquinaria**, **Inventario**, **Combustible**, **Asignaciones**, **Compras**, **Nómina**, **Tasas de cambio**, **Configuración** y **Manual de usuario**.

Lo que todavía no sale —**Explotación**, **Despachos**, **Ventas** y el **Organigrama**— **existe, funciona y está construido**, pero no se ofrece desde el menú mientras se termina de afinar. **Tesorería es distinto: dejó de ser un módulo**, y lo que quedaba vivo se lo llevó Compras.

De los dos caminos posibles, este manual eligió el segundo:

- Reordenar los capítulos para poner delante lo que hoy se alcanza y mandar el resto al final.
- **Dejar cada capítulo en su sitio y avisar al principio de los que hoy no se alcanzan.**

El motivo es que las dos cosas se mueven a velocidades distintas. **El orden de los capítulos describe cómo funciona la cantera**, que es el mismo de hace veinte años: se extrae, se almacena, sale por el portón y se administra lo que eso genera. **El menú describe qué está entregado**, y eso cambia cada pocas semanas. Reordenar el manual con cada entrega lo dejaría sin ninguna estructura estable, cambiaría los números de capítulo debajo de los pies de quien lo tiene impreso, y dentro de dos meses habría que volver a moverlo todo.

Así que los capítulos de los módulos escondidos **no se borraron ni se movieron**: siguen siendo verdad y hacen falta. Lo único que cambió es que cada uno abre con un recuadro que lo dice, y que el índice lleva una columna que se lee de un vistazo.

---

## Índice

| | Capítulo | ¿Se alcanza hoy desde el menú? |
| --- | --- | --- |
| 1 | Qué es este sistema y qué no es | — |
| 2 | Cómo entrar | Sí |
| 3 | Cómo moverse por el sistema | Sí |
| 4 | El panel | Sí |
| 5 | Tasas de cambio | Sí |
| 6 | Explotación | **No, está en obra** |
| 7 | Inventario | Sí |
| 8 | Despachos | **No, está en obra** |
| 9 | Compras | Sí |
| 10 | Ventas | **No, está en obra** |
| 11 | Nómina | Sí |
| 12 | Tesorería | **No: se retiró, lo absorbió Compras** |
| 13 | Configuración | Sí |
| 14 | Las reglas que el sistema impone | — |
| 15 | Lo que todavía no está construido | — |
| 16 | Preguntas frecuentes | — |
| 17 | A quién acudir | — |
| 18 | Asignaciones | Sí |
| 19 | Maquinaria | Sí |
| 20 | Combustible | Sí |

**Asignaciones, Maquinaria y Combustible tienen sus capítulos al final** —el 18, el 19 y el 20— y no en el sitio que les tocaría por el menú. El motivo es el mismo por el que los capítulos no se reordenan cuando un módulo entra o sale: meterlos en medio correría diez números debajo de quien tiene el manual impreso, y rompería las remisiones repartidas por todo el documento. El **Organigrama** tiene apartado propio, el 11.12, y su pantalla sigue en obra.

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

Cuando el sistema te detiene, en la enorme mayoría de los casos es a propósito. La restricción no está para complicarte el trabajo: está para que dentro de seis meses, cuando alguien pregunte por qué faltaban cuarenta toneladas o por qué se le pagó de más a un trabajador, la respuesta esté escrita y no dependa de que alguien se acuerde.

El capítulo 14 reúne esas reglas y explica el motivo de cada una. Vale la pena leerlo antes que los capítulos de los módulos.

### 1.2 Cómo se organiza el trabajo

El sistema no reparte el trabajo por persona sino por **módulo**, y a cada usuario se le habilitan los módulos que necesita.

Los módulos son quince. La última columna dice cuáles se ofrecen hoy en el menú lateral y cuáles están en obra; el apartado 1.5 explica qué significa eso exactamente.

| Módulo | De qué se ocupa | Hoy |
| --- | --- | --- |
| **Panel** | La pantalla de inicio: qué hay que atender hoy | En el menú |
| **Explotación** | Frentes y bancos, voladuras, y el parte de producción de cada turno | En obra |
| **Maquinaria** | Los equipos de la cantera, su horómetro y lo que ha pasado por el taller | En el menú |
| **Combustible** | El gasoil y la gasolina que se despachan a cada máquina | En el menú |
| **Inventario** | Lo que hay en cada patio y almacén, y todo lo que entra y sale | En el menú |
| **Asignaciones** | Lo que se le entrega a una persona y hay que recuperar, y lo que se pierde o se daña | En el menú |
| **Despachos** | El pesaje en la romana y las guías de movilización | En obra |
| **Compras** | Pedir, cotizar, aprobar, recibir, facturar y **pagar** lo que la empresa compra | En el menú |
| **Ventas** | Clientes, precios, cotizaciones, notas de entrega y facturas | En obra |
| **Nómina** | Personal, novedades, cálculo, recibos, pagos, prestaciones sociales y el organigrama | En el menú |
| **Tesorería** | Bancos y cajas, y cuentas por cobrar. **La empresa dejó de llevar saldos**: los pagos por hacer y los movimientos de dinero se mudaron a Compras | **No: se retiró** |
| **Tasas de cambio** | Las tasas del día, que valorizan todo lo que se registre | En el menú |
| **Configuración** | Datos de la empresa, documentos legales y auditoría | En el menú |
| **Usuarios y roles** | Quién entra al sistema y a qué llega cada quien | En el menú |
| **Respaldo de la base** | La copia completa de los datos, para guardarla fuera | En el menú |

**Usuarios y roles** y **Respaldo de la base** cuelgan de Configuración en el menú, pero son módulos aparte a la hora de repartir permisos: quien mantiene el catálogo de artículos no tiene por qué poder crear cuentas ni llevarse la base entera en un archivo. El capítulo 13 lo explica.

El **Organigrama** no es un módulo propio: se reparte con el permiso de Nómina, porque quien lleva el personal es quien sabe de quién depende quién. Hoy su pantalla está en obra.

El **Manual de usuario** aparece siempre al final del menú y **no es un módulo**: no se reparte por permisos y no figura en la tabla. Quien acaba de entrar y todavía no tiene nada asignado lo ve igual, y es a propósito — es lo único que tiene mientras espera que administración le reparta lo demás. No contiene ningún dato de la empresa: solo explica cómo se usa el sistema.

**Tesorería dejó de existir como módulo, y conviene entender por qué.** No se escondió mientras se afina: la empresa decidió que el sistema no lleva bancos ni cajas, solo refleja los movimientos. Sus dos piezas vivas —**Pagos por hacer** y **Movimientos de dinero**— cuelgan hoy de **Compras**, que es donde se usan. El capítulo 12 sigue en el manual porque lo que cuenta esas dos pantallas vale, pero su primera línea avisa de dónde están ahora.

### 1.3 Por dónde entra y por dónde sale el material

Conviene tener este recorrido en la cabeza antes de leer los capítulos, porque explica por qué el sistema pide lo que pide en cada paso:

1. Se registra el **frente** donde se trabaja.
2. Se registra la **voladura**, contra ese frente.
3. Al cierre del turno se carga el **parte de producción**, y ahí es donde la piedra entra al patio. Es la única puerta.
4. El material se guarda, se traslada entre patios y se cuenta, en **Inventario**.
5. Cuando se vende, el camión se pesa en la **romana** y se le emite la **guía**.
6. Sale con su **nota de entrega**, que es el paso que descuenta el patio.
7. Se **factura** y se **cobra**.

### 1.4 Bolívares y dólares

La empresa cobra y paga en las dos monedas, y el sistema está hecho para eso desde el principio.

Cada documento se emite en la moneda en que se pactó la operación, y **guarda para siempre la tasa de cambio del día en que se emitió**. Si mañana la tasa cambia, ese documento no cambia. La tasa usada forma parte del hecho, igual que la fecha o el monto: no es un dato que se actualice.

Por eso la tasa del día está siempre visible en la parte de arriba de la pantalla, y por eso importa que esté correcta antes de empezar a registrar. El capítulo 5 lo explica.

### 1.5 Lo que hoy se ofrece, y lo que está en obra

Esto es lo primero que hay que saber antes de buscar una pantalla, porque explica por qué el menú no trae todo lo que este manual cuenta.

**Hoy el menú lateral ofrece esto:**

**Panel · Maquinaria · Inventario · Combustible · Asignaciones · Compras · Nómina · Tasas de cambio · Configuración · Manual de usuario**

Lo decidió así la líder de sistemas, para entregar primero lo que ya se puede usar todos los días sin sobresaltos, e ir soltando el resto conforme se afina. **El menú ha ido creciendo**: en agosto ofrecía seis entradas y hoy son diez —entraron Maquinaria, Combustible, Asignaciones y el propio manual—, así que si tienes un manual impreso de hace unas semanas, esta lista es la que manda.

**Lo que hoy no sale en el menú son cuatro módulos completos** —**Explotación**, **Despachos**, **Ventas** y **Tesorería**— **y una pantalla suelta**: el **Organigrama**, cuyo módulo, Nómina, sí está. Tampoco los encuentra la barra buscadora. Las pantallas que cuelgan de un módulo escondido —**Cuentas por cobrar**, por ejemplo— no están escondidas por su cuenta: lo está el grupo entero.

Ahora la parte que hay que entender bien, porque no es lo que parece:

**Esos módulos no se borraron, ni se cerraron, ni se le quitaron a nadie.** Sus pantallas siguen existiendo y sus direcciones siguen respondiendo. Es deliberado: el equipo los sigue desarrollando y cerrarlos lo dejaría sin poder verlos. Lo único que se hizo fue dejar de ofrecerlos desde el menú.

Y para que nadie tropiece con una pantalla a medio afinar sin saberlo, **quien llegue a una de esas direcciones —escribiéndola a mano, por un enlace que le pasaron o porque quedó en el historial del navegador— se encuentra primero un cartel de obra**:

> **En construcción.** *Esta parte del sistema todavía se está trabajando y no forma parte de lo que hoy está en uso. Lo que se haga aquí puede perderse o no cuadrar con el resto.* Y debajo, en letra más pequeña: *Si llegaste por un enlace o escribiendo la dirección, no te equivocaste: la pantalla existe, pero aún no está lista.* El único botón es **Volver al panel**.

**El cartel se le pone a todo el mundo, incluida la administración.** Quien tiene el rol de administrador ve además, en letra pequeña y en tono menor, un enlace **Entrar de todos modos**: es la puerta de servicio del equipo que está construyendo, no una invitación. Se recuerda mientras la pestaña esté abierta y se olvida al cerrarla, para que nadie se deje la puerta abierta sin darse cuenta en el equipo con el que se enseña el sistema.

Dos consecuencias prácticas que conviene tener presentes:

- **No es un problema de permisos.** Un candado —**Ventas no está a tu alcance**— significa que a tu rol no le abrieron ese módulo, y se resuelve pidiéndoselo a administración. El cartel de obra significa otra cosa: que esa parte todavía no está entregada, y pedir el permiso no lo cambia.
- **Tesorería es un caso aparte, y no es «todavía no».** Los otros tres módulos escondidos están construidos y esperando. Tesorería **dejó de ser un módulo**: la empresa decidió que el sistema no lleva bancos ni cajas, solo refleja los movimientos, y sus dos pantallas vivas se mudaron a **Compras**. Su capítulo sigue en el manual, con el aviso puesto.

**Este manual sigue contando esos módulos entero**, capítulo por capítulo, porque lo que dicen es cierto y porque el día que vuelvan al menú va a hacer falta. Cada uno abre con un recuadro que recuerda que hoy no se alcanza.

**El manual sí está en el menú**, al final, en **Sistema**, con un icono de libro. Y es la única entrada que no comprueba permisos: quien acaba de entrar y todavía no tiene ningún módulo asignado la ve igual. Es lo único que tiene mientras espera que administración le reparta lo demás.

#### La pantalla que se abre sin entrar

Hay una sola, y conviene conocerla porque no se parece a nada más del sistema: **la página que abre el QR del carnet**.

Su dirección es **/v** seguida del código del carnet, y **no pide usuario ni clave**. Es deliberado: quien la abre es un vigilante en un portón o un fiscal en la carretera, con el plástico en una mano y el teléfono en la otra, y no tiene cuenta en el sistema ni la va a tener. Tampoco da el cartel de obra, y se ve igual con sesión abierta y sin ella.

Enseña si el carnet vale, la foto y los datos de la persona que hacen falta en un portón o en un accidente. **No enseña el sueldo, ni la cuenta bancaria, ni las incidencias.** Está contada entera en 11.4.

Escribiendo **/v** a secas, sin código, se abre la misma página con un campo para teclearlo a mano: es lo que se usa cuando el plástico está rayado y el QR no lee.

---

## 2. Cómo entrar

El sistema no es anónimo. Cada movimiento de inventario, cada compra y cada pago quedan escritos con el nombre de la persona que los registró, y esa persona es la que entró con su usuario y su clave. De ahí sale la única regla que hay que entender antes de nada:

**Tu clave es tuya y de nadie más.** Si dos personas usan el mismo usuario, lo que se registre con él no identifica a ninguna de las dos, y el rastro que hace útil al sistema deja de valer. Por eso, en cuanto la administración te entrega una clave, el sistema te obliga a cambiarla antes de dejarte trabajar.

### 2.1 La portada

Es la puerta de la calle. Se ve al abrir la dirección del sistema, con sesión y sin ella, y también es donde cae cualquier dirección equivocada que se escriba.

No muestra ningún dato de la operación. Solo esto, en este orden:

1. El logo de la empresa.
2. El titular **BIENVENIDO AL SISTEMA DE CONTROL INTERNO DE MINERIA INTERNACIONAL TS, C.A.** La razón social va en mayúsculas y sin tilde a propósito, porque así consta en el RIF.
3. **RIF J-50209170-0**.
4. El botón **Ingresar al Sistema**.
5. El aviso **El acceso lo asigna la administración de la empresa.**
6. Una foto del frente de explotación.
7. El pie **Explotación de piedra**.

Dos cosas de esta pantalla que conviene saber. La primera: si ya tienes la sesión abierta y vuelves a la portada, **la portada se sigue viendo**; no te devuelve al panel. Es intencional. La segunda: es la única pantalla del sistema que no cambia con el tema claro u oscuro, siempre va sobre fondo azul.

Pulsa **Ingresar al Sistema** para pasar a la pantalla de entrar.

### 2.2 La pantalla de entrar

Es donde el sistema comprueba quién eres y abre la sesión de trabajo. Si ya tienes sesión abierta, esta pantalla no se ve: te lleva directo al panel.

Arriba del formulario está el título **Bienvenido de vuelta** y debajo **Entra para registrar la operación del día.** Si algo falla, aparece una caja roja encima del formulario con el motivo.

En pantallas grandes, a la izquierda, hay una ilustración con dos tarjetas de cifras: **Despachado hoy**, **Existencia en patio** y una lista de materiales con sus toneladas.

**Esas cifras son un ejemplo de adorno, no datos de la cantera.** Están escritas fijas en la pantalla y no salen de nada registrado. Da igual lo que haya pasado hoy en el patio: siempre dicen lo mismo. No las mires para saber cuánto se despachó.

#### Los datos que se piden

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Usuario** | Sí | Se escribe en minúscula. Es el único campo de texto del sistema que **no** se convierte a mayúsculas, porque subirlo dejaría a todo el mundo fuera. Aparece con el ejemplo **tu.usuario** |
| **Clave** | Sí | Se ve por puntos. Tiene un botón de ojo para mostrarla y ocultarla |
| **Mantener sesión abierta** | No | Casilla, viene desmarcada |

#### Entrar con usuario y clave

1. Escribe tu **Usuario**.
2. Escribe tu **Clave**.
3. Pulsa **Entrar**. Mientras comprueba, el botón dice **Entrando…** y no se puede volver a pulsar.
4. Si todo va bien, entras directo al panel.

Al pie queda siempre el aviso **El acceso lo asigna la administración de la empresa. Si no tienes credenciales, escribe a sistemas.**

**El sistema no dice si el error fue el usuario o la clave.** Ante los dos casos responde «Usuario o clave incorrectos.» Es a propósito: si lo dijera, cualquiera podría averiguar qué usuarios existen probando nombres.

Si dejas un campo en blanco y pulsas **Entrar**, quien te avisa es el navegador con su propio texto, no el sistema.

#### Dos cosas de esta pantalla que hoy no funcionan

Conviene decirlas claro, porque están a la vista y parece que hacen algo:

- **La casilla Mantener sesión abierta no cambia nada.** Marcarla o dejarla en blanco da el mismo resultado: la sesión se guarda igual en ese aparato. Está en pantalla, pero no se lee.
- **El enlace Olvidé mi contraseña no lleva a ninguna parte.** No hay recuperación por cuenta propia. Si olvidaste la clave, pídele a la administración que te la reponga; entrarás con la que te den y el sistema te pedirá cambiarla enseguida.

### 2.3 Entrar con la huella

Sirve para entrar poniendo el dedo en lugar de teclear la clave. Se activa **en un equipo concreto**, y hay que activarla otra vez en cada aparato desde el que trabajes: activarla en la oficina no la activa en el teléfono.

#### Cómo se registra

Se hace desde **Mi cuenta**, en la tarjeta **Entrar con la huella**, cuyo subtítulo lo resume: **Se activa por equipo. En el teléfono hay que activarla aparte.**

1. Entra al sistema con tu usuario y tu clave.
2. Abre el menú de tu usuario, arriba a la derecha, y pulsa **Mi cuenta**.
3. Baja a la tarjeta **Entrar con la huella** y pulsa **Activar la huella**.
4. El botón pasa a **Esperando el dedo…** y se abre el diálogo del propio equipo pidiendo la huella, la cara o el PIN. Hay un minuto para responder.
5. Al reconocerte, aparece en verde «Listo. En este equipo ya puedes entrar con la huella.»

Si el equipo no tiene lector, **la tarjeta no muestra ningún botón** y explica por qué: **Este equipo no tiene lector de huella, o el navegador todavía no sabe usarlo. En un teléfono suele funcionar aunque aquí no.** Mientras el sistema averigua si hay lector, la tarjeta directamente no aparece.

Cuando aún no está activada y el equipo sí tiene lector, la tarjeta explica qué se guarda: **Tu huella no sale del aparato: ni el sistema ni nadie la ve. Lo que se guarda aquí es tu pase de sesión cifrado, y hace falta tu dedo para abrirlo.**

Una vez activada, dice **Activada en este equipo. Al entrar te la pedirá en vez de la clave.** Si el pase guardado es de otra persona, lo indica con su nombre. Y debajo, en letra pequeña, queda el aviso que más importa: **Si pierdes este equipo, cambia tu clave: eso la desactiva aquí y en cualquier otro aparato donde la hayas puesto.**

Para quitarla, pulsa **Quitar de este equipo**. El botón pasa a **Quitando…** y termina con «Quitada de este equipo. Aquí se entra con la clave.»

#### Cómo se usa

1. Abre la pantalla de entrar. Si la huella está activada en ese equipo, debajo del botón **Entrar** aparece un separador con la letra **o** y el botón **Entrar con la huella de** seguido de tu nombre de usuario. Si no se guardó el nombre, dice solo **Entrar con la huella**.
2. Púlsalo. El botón pasa a **Esperando el dedo…**
3. Pon el dedo cuando el equipo lo pida. Si te reconoce, entras directo al panel.

Si cancelas el diálogo del dedo, **no aparece ningún error**: cancelar no es equivocarse.

La huella no sustituye a la clave, es un camino aparte. Si falla, el acceso con usuario y clave sigue justo encima, intacto.

#### Lo que conviene entender de la huella

- **La huella nunca sale del aparato.** El sistema no la ve ni la guarda en ningún sitio: no hay nada que robar. Lo que se guarda en el equipo es tu pase de sesión, cifrado, y hace falta tu dedo para abrirlo.
- **Se mantiene sola.** El pase se renueva en silencio mientras usas el sistema, así que mañana sigue funcionando sin volver a activarla.
- **Es un cierre serio de la puerta, no un búnker.** Quien tenga tu equipo desbloqueado y tu dedo entra. Trátalo como tratas la llave de la oficina.
- **Cerrar sesión no quita la huella** de ese equipo. Solo la quitan **Quitar de este equipo** o un cambio de clave.
- **Si pierdes el equipo o el teléfono, cámbiate la clave desde cualquier otro sitio.** Eso cierra las demás sesiones y deja el pase guardado en el aparato perdido sin valor. Es la única forma de desactivar la huella a distancia.
- Quitar la huella aquí no borra la llave de acceso que Windows o el teléfono guardaron por su cuenta; eso se hace en los ajustes del propio equipo. Pero sin el pase cifrado ya no sirve para entrar.

### 2.4 El primer ingreso: ponerle tu propia clave

La primera vez que entras, el sistema no te deja pasar a ninguna pantalla hasta que cambies la clave. Ocupa la pantalla entera, sin menú y sin barra superior:

- Título **Ponle tu propia clave**.
- Texto **Hola,** seguido de tu nombre, **La clave con la que acabas de entrar te la dio la administración, así que la saben dos personas. Elige una que sepas solo tú para seguir.**
- El formulario de clave, con el botón rotulado **Guardar y entrar**.

Aparece en tres casos: cuando te crean el usuario, cuando la administración te repone la clave, y a todo el mundo la vez que se implantó esta regla.

**No se puede posponer.** No hay botón de "más tarde" ni de cerrar, y como no hay barra superior tampoco hay **Cerrar sesión**: se sale cambiando la clave o cerrando el navegador. La razón es la del principio del capítulo: mientras la clave siga siendo la que te dieron, la saben dos personas, y lo que registres con ella no prueba que fuiste tú.

Aunque vengas obligado, **el sistema te sigue pidiendo la clave actual**. Es para que alguien que se encuentre tu sesión abierta no pueda quedarse con tu cuenta cambiándole la clave.

Los campos y los avisos de este formulario son los mismos de **Mi cuenta**; están en el apartado 3.7.

### 2.5 Desde el teléfono

El sistema se usa igual desde el teléfono, con cuatro diferencias que conviene conocer para no buscar lo que no está:

- El menú lateral no está fijo: se abre como un cajón por encima de la pantalla, con el botón **☰** de la barra superior, y se cierra con la **X** o pulsando fuera. Mientras está abierto, la página del fondo no se mueve.
- **Contraer el menú solo existe en pantallas grandes.** En el teléfono no hace falta: el menú ya está escondido.
- El indicador de la tasa y tu nombre completo no caben y no se muestran; el círculo con tus iniciales sí.
- La ilustración de la pantalla de entrar solo sale en pantallas grandes. En el teléfono se ve directamente el formulario.

La huella suele funcionar mejor en el teléfono que en un equipo de oficina, pero **hay que activarla ahí también**, entrando primero con la clave.

### 2.6 Cuando no puedes entrar

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Usuario o clave incorrectos.» | El usuario no existe o la clave está mal. El sistema no distingue cuál de los dos, para que nadie averigüe qué usuarios existen | Revisa el usuario y vuelve a escribir la clave. Si sigue, pide a la administración que te la reponga |
| «El usuario solo admite letras, números, punto, guion y guion bajo.» | El nombre que escribiste lleva espacios, tildes u otros signos | Escríbelo tal como te lo entregó la administración |
| «No se pudo entrar.» | Falló el acceso y no vino ninguna explicación | Reintenta. Si se repite, avisa a sistemas |
| «No se pudo entrar: …» seguido de un detalle | Falló algo fuera de tu control | Reintenta. Si se repite, pasa el detalle a sistemas |
| «Tu sesión guardada caducó. Entra con tu clave y vuelve a activar la huella.» | El pase guardado en ese equipo dejó de valer | Entra con la clave y activa la huella otra vez en **Mi cuenta** |
| «No se reconoció la huella.» | El lector no te identificó | Vuelve a intentarlo o entra con la clave |
| «La huella no está activada en este equipo.» | No hay pase guardado aquí | Entra con la clave y actívala en **Mi cuenta** |
| «Se perdió la llave de este equipo. Entra con tu clave.» | El equipo ya no tiene con qué abrir el pase guardado | Entra con la clave y vuelve a activar la huella |
| «No se pudo abrir la sesión.» | El pase se abrió pero la sesión no llegó a crearse | Entra con la clave |
| «Este equipo no tiene lector de huella, o el navegador no sabe usarlo.» | Ese aparato no puede usar la huella | Entra con la clave. En el teléfono suele sí funcionar |
| «No hay una sesión abierta que guardar. Vuelve a entrar.» | Intentaste activar la huella sin sesión válida | Vuelve a entrar y actívala |
| «No se registró la huella.» | El registro no llegó a completarse | Repite **Activar la huella** |
| «Este navegador no deja guardar la llave de cifrado.» / «No se pudo abrir el almacén de llaves.» | Ese navegador no puede guardar el pase | Entra con la clave, o usa el sistema desde otro navegador |
| **El sistema no pudo arrancar** en una pantalla blanca sin diseño | El sistema no llegó a cargar | Recarga. Si se repite, pasa a sistemas el detalle que aparece debajo del título |

---

## 3. Cómo moverse por el sistema

Dentro, todas las pantallas comparten el mismo marco: el menú a la izquierda, la barra superior arriba y el contenido en el medio. Al cambiar de pantalla, el menú y la barra se quedan quietos y solo el centro muestra **Cargando…**

### 3.1 El menú lateral

Está organizado en tres secciones, y dentro de ellas en grupos que se despliegan.

Arriba del todo, sin rótulo de sección, está **Panel**, que lleva a la pantalla de inicio.

Esto es todo lo que ofrece el menú hoy:

**Operación**

| Grupo | Pantallas |
| --- | --- |
| **Maquinaria** | **Equipos**, **Historial de taller** |
| **Inventario** | **Tablero**, **Existencias**, **Transferencias**, **Almacenes y talleres** |
| **Combustible** | Enlace directo, sin submenú |
| **Asignaciones** | **Quién tiene qué**, **Dotación por cargo**, **Incidencias** |

**Administración**

| Grupo | Pantallas |
| --- | --- |
| **Compras** | **Tablero**, **Proveedores**, **Recepciones**, **Pagos por hacer**, **Movimientos de dinero**, **Centro de costos**, **Libro de compras**, **Gasto por unidad** |
| **Nómina** | **Tablero**, **Personal**, **Nómina del período**, **Prestaciones y parámetros** |

**Sistema**

| Grupo | Pantallas |
| --- | --- |
| **Tasas de cambio** | Enlace directo, sin submenú |
| **Configuración** | **Tablero**, **Usuarios y roles**, **Datos de la empresa**, **Documentos legales**, **Auditoría**, **Respaldo de la base** |
| **Manual de usuario** | Enlace directo. **Es la única entrada que se ve sin tener ningún permiso** |

**Muchas pantallas ya no están en el menú: están en pestañas.** El menú se quedó con la puerta de cada cosa y el resto se agrupó por dentro, arriba de la pantalla. Es lo que hay que saber para no darlas por perdidas:

| Si buscas | Está en |
| --- | --- |
| **Catálogo de artículos**, **Movimientos** | Pestañas de **Inventario › Existencias** |
| **Talleres** | **Inventario › Almacenes y talleres**, segunda pestaña |
| **Facturas de proveedor** | **Compras › Proveedores**, segunda pestaña. **Ahí se llama Facturas recibidas** |
| **Cuentas por pagar** | **Compras › Pagos por hacer**, segunda pestaña. **Ahí se llama Por proveedor** |
| **Centro de costos**, **Libro de compras**, **Gasto por unidad** | Están en el menú, y además son pestañas entre sí |
| **Tabulador de cargos**, **Carnets** | Pestañas de **Nómina › Personal** |
| **Novedades del período**, **Procesar nómina**, **Recibos de pago** | Las tres pestañas de **Nómina › Nómina del período**, numeradas **1 · Novedades**, **2 · Procesar** y **3 · Recibos**, en el orden en que se hacen |
| **Prestaciones sociales**, **Parámetros de nómina** | Pestañas de **Nómina › Prestaciones y parámetros** |
| **Cargar por planilla** —artículos, personal o proveedores— | No es pestaña: es un **botón** dentro del Catálogo de artículos, de Personal y de Proveedores. También hay atajos en el Panel |

**La lupa (Ctrl+K) sí las encuentra todas**, aunque no estén en el menú, y por su nombre corriente: buscar «cargar artículo» o «cuentas por pagar» lleva a donde toca.

**Todas las entradas de este menú están construidas.** Ninguna abre el cartel de obra. Si una pantalla no se abre, es por permisos o por conexión, no porque falte.

#### Lo que no sale en el menú, y sigue existiendo

Estas ramas están construidas y funcionando, pero hoy no se ofrecen desde el menú lateral ni las encuentra la barra buscadora. El apartado 1.5 explica el porqué y qué se ve al entrar en ellas.

| Grupo | Pantallas | Capítulo |
| --- | --- | --- |
| **Explotación** | **Tablero**, **Frentes y bancos**, **Voladuras**, **Producción por turno** | 6 |
| **Despachos** | **Tablero**, **Tickets de romana**, **Guías de movilización**, **Vehículos** | 8 |
| **Ventas** | **Tablero**, **Clientes**, **Lista de precios**, **Cotizaciones**, **Notas de entrega**, **Facturación**, **Notas de crédito**, **Libro de ventas** | 10 |
| **Organigrama** | Enlace directo, sin submenú | 11.12 |
| **Tesorería** | **Tablero**, **Bancos y cajas**, **Cuentas por cobrar** | 12 |

**Tesorería está en esta lista por otro motivo que los demás.** Los otros cuatro están construidos y esperando. Tesorería **dejó de ser un módulo**: de sus seis pantallas, **Pagos por hacer** y **Movimientos de dinero** —que era el libro de tesorería— se mudaron a **Compras** y sí están en el menú; **Cuentas por pagar** desapareció como pantalla propia. Lo que queda escondido es lo que la empresa decidió no llevar: bancos y cajas.

**Se esconden para todo el mundo, incluido el administrador.** No es un permiso: es que el MVP se enseña desde una cuenta con todos los permisos, y si al administrador le siguiera saliendo el menú entero, esconderlo no habría servido de nada.

Dos nombres que cambiaron y conviene no buscar por el viejo: lo que antes era **Guías de despacho** hoy es **Guías de movilización** —es el permiso del ministerio para que el camión circule, no el papel que se le entrega al cliente—, y la primera entrada de casi todos los grupos pasó a llamarse **Tablero**.

Cómo se comporta el menú:

- **Solo hay un grupo abierto a la vez.** Abrir uno cierra el anterior. Con quince módulos, varios abiertos convertirían el menú en una lista de cuarenta líneas.
- Al entrar en una pantalla, **se abre solo el grupo al que pertenece**.
- La pantalla en la que estás se ve en azul relleno con letra blanca.
- Al pie, siempre a la vista, está **quién está dentro**: el círculo con tus iniciales, tu nombre completo y tu usuario debajo. Está ahí a propósito: es lo que evita que alguien registre algo sin darse cuenta de que quedó abierta la sesión de otra persona.

**Los módulos sobre los que no tienes permiso no aparecen en el menú.** Y si a un grupo se le ocultan todas sus pantallas, desaparece el grupo entero; si a una sección se le vacían los grupos, desaparece la sección. No es pudor: sin permiso, esas pantallas se abrirían vacías, y una lista vacía miente.

Durante el primer instante después de entrar, mientras los permisos aún no han llegado, **se ve el menú completo**. Un menú vacío durante medio segundo se lee como que el sistema se rompió.

Si escribes a mano la dirección de un módulo que no te toca, o llegas por un enlace que alguien te pasó, no ves una pantalla vacía sino una explicación con un candado: el nombre del módulo seguido de **no está a tu alcance**, el texto **Tu rol no tiene acceso a este módulo. Si lo necesitas para tu trabajo, pídeselo a quien administra el sistema.** y el enlace **Volver al panel**.

**Auditoría** tiene su propio mensaje, porque es solo del administrador: **Esto lo ve la administración**, con el texto **El registro de auditoría guarda todo lo que ha hecho cada persona en el sistema. Solo lo abre quien tiene el rol de administrador.**

Los permisos son una escalera de cuatro peldaños, no cuatro opciones sueltas: ninguno, lectura, escritura y total. El control total incluye escribir, y escribir incluye leer. Para ver una pantalla basta con lectura.

**Mi cuenta** es la excepción: se abre siempre, aunque te hayan quitado todos los permisos, porque nadie debe quedarse sin poder cambiarse la clave.

#### Contraer el menú

En pantallas de escritorio, el botón de la barra superior contrae el menú a una tira de iconos. Su etiqueta alterna entre **Contraer menú** y **Expandir menú**.

Contraído, cada icono muestra su nombre al pasar el ratón por encima, y **los grupos no se despliegan**: no hay ancho para el texto. Para llegar a una pantalla de dentro de un grupo hay que expandirlo primero.

**El sistema recuerda cómo lo dejaste**, en ese equipo, incluso después de cerrar el navegador. Quien trabaja con tablas anchas lo deja contraído y ya no lo repite cada mañana.

### 3.2 La barra superior

De izquierda a derecha:

1. **☰** para abrir el menú, solo en el teléfono. Su etiqueta es **Abrir menú**.
2. El botón de **Contraer menú** / **Expandir menú**, solo en escritorio.
3. **Buscar**, con una lupa y la tecla sugerida **Ctrl K**.
4. El aviso **Sin conexión en vivo**, que solo aparece cuando hace falta.
5. El indicador **Tasa BCV**.
6. La campana de notificaciones.
7. Tu círculo con las iniciales, que abre el menú del usuario.

**Sin conexión en vivo** aparece únicamente si se pierde el enlace con el sistema, y explica qué implica: **Se perdió el enlace con el servidor. Lo que ves puede estar viejo; recarga la página para ponerlo al día.** En pantallas chicas se reduce al icono de la señal tachada, pero no desaparece: se esconde justo donde la señal se cae, que es el patio.

El indicador **Tasa BCV** tiene estos estados:

| Lo que ves | Qué significa |
| --- | --- |
| Punto gris parpadeando | Todavía está consultando |
| Punto rojo y **No disponible** | No se pudo consultar. El globo lo dice: **No se pudo consultar la tasa. Verifica la conexión antes de emitir documentos.** |
| Punto verde, **Tasa BCV · hoy** y la cifra en bolívares | La tasa publicada es de hoy y además está registrada |
| Punto naranja y **Tasa BCV** seguido de una fecha anterior | La última publicada es de otro día |
| Punto naranja y **Tasa BCV · hoy · sin registrar** | El BCV ya publicó la de hoy, pero nadie la ha registrado en el sistema |

**El indicador solo enseña el dólar, pero se despliega.** Al pulsarlo se abre un panel con tres cosas: el aviso **La tasa de hoy no está registrada** cuando toca —*El sistema valora con la del 15 ago. Regístrala antes de emitir.*—, la lista **Con lo que valora el sistema** con las tres monedas (**Dólar**, **Euro** y **Tether (USDT)**, cada una con su cifra en bolívares o la palabra **sin registrar**), la calculadora, y al pie el enlace **Ver y registrar tasas →**.

Este indicador **solo informa**. No es la tasa con la que el sistema valora los documentos; esa se registra en **Tasas de cambio** y se explica en el capítulo 5.

#### La barra buscadora

**El buscador ya funciona**, y es la forma más rápida de llegar a cualquier sitio sin recorrer el menú. Hasta la versión anterior de este manual estaba dibujado y no hacía nada; ahora encuentra dos cosas distintas: **pantallas** y **documentos**.

Se abre de dos formas: pulsando **Buscar** en la barra, o con **Ctrl+K** desde cualquier pantalla —en un Mac, **Cmd+K**—. El mismo atajo la cierra, y también la cierran la tecla Escape y pulsar fuera de la caja. Al abrirse, el campo aparece vacío y con el cursor puesto.

El campo dice **Una pantalla, un número de documento, un nombre…** Se escribe, se sube y se baja con las flechas **↑** y **↓**, y se abre lo resaltado con **Enter**.

**Qué encuentra:**

- **Pantallas.** Con el campo vacío ofrece las primeras ocho; al escribir, hasta seis. Cada una lleva debajo, en gris, **su grupo y su sección**, para distinguir dos pantallas con nombre parecido.
- **Documentos y fichas**, bajo ese mismo encabezado. Nueve clases: **Orden de compra** por su número, **Proveedor** y **Cliente** por nombre o RIF, **Factura** y **Nota de entrega** por su número, **Artículo** por código o nombre, **Trabajador** por nombres, apellidos, cédula o número de ficha, **Máquina** por código o nombre, y **Vehículo** por su placa.

**Entiende cómo habla la gente, no cómo se rotula el menú.** El menú dice «Tasas de cambio» y quien necesita la calculadora escribe «convertir»; el menú dice «Tickets de romana» y quien la usa escribe «pesaje» o «peso bruto». Cada pantalla tiene detrás una lista de palabras equivalentes: «stock» lleva a Existencias, «gasoil» a Combustible, «excel» o «planilla» a la carga por planilla, «liquidación» a Prestaciones sociales. Y las palabras se pueden escribir en cualquier orden y a medias: **mant taller** encuentra el historial de taller.

Cuatro cosas de su funcionamiento que evitan malentendidos:

- Hay que escribir **al menos dos letras**. Con menos dice **Escribe al menos dos letras.**
- Los documentos se buscan en la base, así que espera un instante después de que dejes de teclear. Mientras tanto dice **Buscando…**
- **Solo encuentra lo que tu permiso alcanza.** Ofrecer un atajo a una pantalla que va a rebotar por falta de permiso es enseñar una puerta cerrada. Si no hay nada, dice **Nada con ese nombre, ni en las pantallas ni en los documentos que puedes ver.**
- **Las pantallas escondidas del menú tampoco salen aquí.** La lupa es otra puerta al mismo menú, y un módulo escondido que se encontrara escribiendo su nombre no estaría escondido. Con una salvedad que conviene conocer: **los documentos sí salen**. Una factura o una placa de vehículo pueden aparecer en la lista, y al pulsarlas se llega al cartel de obra.

Solo tres resultados llevan al registro concreto —la orden de compra, el trabajador y el vehículo—; los demás dejan en la lista donde ese registro vive.

#### El menú del usuario

Se abre pulsando el círculo con tus iniciales, y se cierra pulsando fuera o con la tecla Escape. Contiene:

1. Tu nombre completo y, debajo en gris, tu usuario.
2. El bloque **Apariencia**, con los tres botones del tema.
3. **Mi cuenta**.
4. **Cerrar sesión**.

**Cerrar sesión cierra la sesión al instante, sin preguntar.** No hay confirmación, así que no lo pulses con algo a medio escribir: lo que no se guardó, no quedó.

Cerrar sesión **no quita la huella** de ese equipo.

### 3.3 Las notificaciones

Sirven para enterarte de lo que pasa en el sistema —pedidos, entradas de inventario, pagos— sin tener que ir a mirar módulo por módulo. Se abren con la campana de la barra superior; no tienen pantalla propia.

Si hay avisos sin leer, la campana lleva una burbuja roja con el número. A partir de cien muestra **99+**.

El panel que se despliega tiene:

- La cabecera **Movimientos** y, debajo, cuántos hay sin leer o **Todo al día**.
- El botón de silencio a la derecha de la cabecera, con el globo **Silenciar el sonido de aviso** o **Activar el sonido de aviso**.
- La lista de avisos, el más reciente arriba, hasta cuarenta.
- Al pie, solo si hay sin leer, el botón **Marcar todas como leídas**.

Cada aviso lleva un círculo con el icono de su módulo, el título —en negrita si no lo has leído—, un detalle en letra pequeña y una última línea con el tiempo transcurrido y quién lo provocó. El tiempo se escribe **ahora mismo**, **hace 5 min**, **hace 2 h**, **hace 3 d** o **hace 2 meses**. Las no leídas tienen fondo azul claro y un punto azul a la derecha.

El color indica la importancia: azul es informativo, naranja pide atención y rojo es urgente.

Qué se puede hacer:

1. **Leer un aviso**: púlsalo. Queda marcado como leído aunque no lleve a ninguna pantalla, porque leerlo ya es haberse enterado. Si lleva a algún sitio, el panel se cierra y te deja allí.
2. **Marcar todas como leídas**: el botón del pie. Mientras trabaja queda deshabilitado.
3. **Silenciar el sonido**: el botón de la cabecera. Tu decisión se recuerda en ese aparato.

Sobre el sonido, tres cosas que evitan malentendidos:

- Es una nota corta y a volumen bajo, generada por el propio sistema.
- **No suena al abrir el sistema**, aunque tengas avisos acumulados de ayer. Solo suena por los que llegan con la pantalla ya abierta.
- **Puede no sonar la primera vez**: los navegadores no dejan sonar nada hasta que la persona ha pulsado algo en la página.

Si no hay nada, se ve **Sin movimientos todavía** con el texto **Aquí entran los pedidos, las entradas de inventario y los pagos.** Mientras carga, **Cargando…**

La lista se refresca sola cada cinco minutos y cada vez que vuelves a la pestaña, además del enlace en vivo que trae los avisos en el momento.

### 3.4 El tema claro y oscuro

En el menú del usuario, el bloque **Apariencia** tiene tres botones: **Claro**, **Oscuro** y **Sistema**. El activo se ve resaltado.

**Sistema** es lo que viene puesto de fábrica: sigue lo que tenga configurado Windows o el teléfono, y cambia solo si el equipo cambia al anochecer con el sistema abierto.

El cambio es inmediato, sin recargar. Y **es por aparato y por navegador**: no viaja con tu cuenta. Ponerlo en oscuro en la oficina no lo cambia en el teléfono.

La portada es la única pantalla que no obedece al tema: siempre va azul.

### 3.5 El aviso de versión nueva

De vez en cuando se publica una versión nueva del sistema. Lo normal es que no te enteres: el sistema lo comprueba al abrirlo, cada cinco minutos y cada vez que vuelves a la pestaña, y **se recarga solo, sin preguntar**. Verás la pantalla refrescarse y nada más.

Si después de recargarse una vez el navegador sigue trayendo la versión vieja, entonces sí aparece un recuadro naranja, abajo a la derecha —abajo y centrado en el teléfono—, por encima de todo lo demás:

- Título **Estás viendo una versión antigua del sistema**
- Detalle **Hay una más reciente publicada y tu navegador sigue trayendo la anterior. Recarga con Ctrl+Shift+R, o abre el sistema en una ventana de incógnito.**
- Botón **Recargar**

**El aviso no se puede cerrar ni posponer**: no tiene X ni botón de "más tarde". Se va solo cuando el navegador consiga traer la versión nueva. Es incómodo a propósito: trabajar sobre una versión vieja creyendo que estás al día es peor que la molestia del recuadro.

El aviso aparece en cualquier pantalla, incluidas la portada y la de entrar. Y sin conexión no avisa de nada, porque no saber no es motivo para molestar.

### 3.6 Mi cuenta

**Menú del usuario › Mi cuenta**

Es donde consultas tus datos y haces las dos únicas cosas que son tuyas y de nadie más: cambiar tu clave y activar o quitar la huella en tu equipo. No está en el menú lateral, y se abre siempre, aunque no tengas permiso sobre ningún módulo.

El encabezado dice **Mi cuenta** y **Tus datos y tu clave.** Debajo hay tres tarjetas.

**Tus datos.** Llevan por título tu nombre completo y por subtítulo **Para cambiar estos datos, habla con quien administra el sistema.**

| Dato | Qué muestra |
| --- | --- |
| **Usuario** | Tu nombre de acceso |
| **Cargo** | Tu cargo. Si no está puesto, un guion |
| **Cédula** | Tu cédula. Si no está puesta, un guion |
| **Teléfono** | Tu teléfono. Si no está puesto, un guion |
| **En el sistema desde** | La fecha en que te dieron de alta, escrita completa |

Debajo, bajo el rótulo **Roles**, están los roles que tienes. El de administrador se pinta en naranja y el resto en gris. Si no tienes ninguno, dice **Sin roles asignados**.

**Ninguno de estos datos se edita aquí.** No hay campos ni botón de guardar para el nombre, el cargo, la cédula ni el teléfono. La razón es que identifican a la persona en todo lo que firma, y quien los cambia es quien administra el sistema, no cada quien sobre sí mismo. Si algo está mal, pídelo a administración.

**Cambiar la clave.** Con el subtítulo **Nadie más debería saberla, ni siquiera quien administra el sistema.** Si tu clave sigue siendo la que te dieron, encima del formulario aparece un aviso naranja: **Tu clave todavía es la que te asignó la administración. Cámbiala por una que solo tú sepas: mientras tanto, lo que registres con ella no distingue si fuiste tú.**

**Entrar con la huella.** Es la tercera tarjeta, explicada en el apartado 2.3.

### 3.7 Cambiar la clave

Es el mismo formulario en **Mi cuenta** y en la pantalla obligatoria del primer día; solo cambia el rótulo del botón.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Clave actual** | Sí | Oculta, con botón de ojo para verla |
| **Clave nueva** | Sí | Oculta. Debajo, la ayuda **Mínimo 8 caracteres.** |
| **Repite la clave nueva** | Sí | Oculta, con botón de ojo |

1. Escribe tu **Clave actual**.
2. Escribe la **Clave nueva**, de ocho caracteres o más.
3. Repítela en **Repite la clave nueva**.
4. Pulsa **Cambiar la clave**, o **Guardar y entrar** si es tu primer ingreso. Mientras guarda dice **Cambiando…**

**El botón está apagado hasta que las cuatro condiciones se cumplen**: que haya algo escrito en **Clave actual**, que la nueva llegue a ocho caracteres, que la nueva y su repetición sean idénticas, y que la nueva sea distinta de la actual. Mientras escribes, los avisos salen en rojo debajo del campo: **Faltan 3 caracteres.**, **Tiene que ser distinta de la actual.** y **Las dos claves no son iguales.** Este último no aparece hasta que hayas escrito algo en la repetición, porque señalar el error mientras se teclea es ruido.

Al terminar sale en verde «Clave cambiada. La próxima vez entra con la nueva.» y los tres campos se vacían.

#### Qué le pasa a tus otras sesiones

Esto es lo más importante de la pantalla y conviene saberlo de antemano:

**Cambiar tu clave cierra todas tus demás sesiones abiertas**, en cualquier otro equipo o teléfono. Quedan cerradas en el momento, sin aviso para quien las tuviera delante.

**La sesión desde la que estás cambiando la clave se respeta**: tú no sales de tu propia pantalla.

**Y desactiva la huella en todas partes.** El pase guardado en cualquier otro aparato deja de servir en cuanto cambias la clave. Es la única forma de desactivarla a distancia, y por eso es lo primero que hay que hacer si se pierde un teléfono o un equipo: cámbiate la clave desde otro sitio y con eso echas a quien esté dentro y anulas la huella allí.

Cuando la administración le repone la clave a alguien pasa exactamente lo mismo: se le cierran las demás sesiones, y la clave nueva vuelve a nacer marcada como prestada, así que esa persona tendrá que ponerse la suya al entrar.

### 3.8 Cuando algo no sale

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «La clave actual no es correcta.» | La clave que escribiste arriba no es la que tienes puesta | Vuelve a escribirla. Si no la recuerdas, pide a la administración que la reponga |
| «La clave nueva debe tener al menos 8 caracteres.» | La nueva es corta | Alárgala hasta ocho o más |
| «La clave nueva tiene que ser distinta de la actual.» | Pusiste la misma que ya tenías | Elige otra |
| «Sesión no válida. Vuelve a entrar.» | Tu sesión caducó mientras estabas en la pantalla | Vuelve a entrar y repite el cambio |
| «No se encontró tu perfil.» | El sistema no encuentra tus datos | Avisa a la administración |
| **Nombre del módulo** seguido de **no está a tu alcance** | Abriste una dirección de un módulo que no te toca | Pulsa **Volver al panel**. Si lo necesitas para tu trabajo, pide el permiso a administración |
| **Esto lo ve la administración** | Intentaste abrir Auditoría sin ser administrador | Pulsa **Volver al panel** |
| «Tu usuario no tiene permiso para esta acción.» | Falta el permiso para lo que intentaste hacer | Pide el permiso a administración, o que lo haga quien lo tenga |
| «Esa operación todavía no existe en la base de datos. Falta correr las migraciones.» | Esa parte del sistema todavía no está instalada | Avisa a sistemas. No es algo que puedas resolver desde la pantalla |
| «No hay conexión con el servidor. Revisa la red e inténtalo otra vez.» | Se cayó el internet | Reintenta cuando vuelva la señal. Lo que no se guardó, no quedó |
| **Sin conexión en vivo** en la barra superior | El enlace en vivo se cortó; lo que ves puede estar viejo | Recarga la página para ponerla al día |

---

## 4. El panel

**Panel** es la primera entrada del menú y adonde llega todo el que entra al sistema. Sirve para ver de un vistazo lo que hay que atender hoy y cómo va la operación.

La idea que hay que entender es esta: **el panel no se administra, se lee.** No hay ningún formulario, filtro ni botón de guardar; todo lo que se puede pulsar es un enlace a la pantalla donde el asunto se resuelve. Cada aviso nace de una condición del sistema y desaparece solo cuando esa condición deja de cumplirse. No se apagan a mano: el aviso de que falta la tasa se va cuando se registra la tasa, no cuando alguien lo descarta.

El encabezado dice **Panel** y debajo **Operación de** seguido del día de la semana y la fecha.

### 4.1 De dónde salen las cifras

El propio panel lo dice al pie, con estas palabras: **Todas las cifras salen de lo registrado en el sistema. No hay ningún número de ejemplo en esta pantalla.**

Es cierto y conviene tenerlo claro, porque contrasta con la pantalla de entrar: **las tarjetas de toneladas que se ven al entrar sí son de adorno** y no salen de nada registrado. En el panel, no. Lo que aquí dice cero, es cero.

Con dos salvedades que hay que conocer antes de apoyarse en el **Valor del inventario**:

- Lo que la cantera produce **entra al inventario valorado en cero**, porque el sistema todavía no calcula lo que cuesta producir una tonelada. Mientras eso siga así, el valor en dólares del material producido no es una cifra en la que apoyarse; las toneladas sí.
- **Los indicadores muestran solo lo que tu permiso alcanza.** Eso se explica enseguida.

### 4.2 Los cuatro indicadores

Son las cuatro tarjetas grandes de arriba. Cada una lleva un rótulo, una cifra en dólares sin céntimos y una línea de abajo que la explica.

| Rótulo | Qué mide | La línea de abajo |
| --- | --- | --- |
| **En cuentas, en divisas** | Lo que hay en las cuentas, en dólares | La misma cantidad en bolívares |
| **Por pagar a proveedores** | Lo que se le debe a los proveedores | **Nada pendiente**, o cuántos pagos están autorizados |
| **Pagado sin recibir** | Dinero que ya salió de la empresa por material que todavía no llegó | **Todo lo pagado llegó**, o cuántas órdenes vienen en camino |
| **Valor del inventario** | Lo que vale el material que hay | **Ningún artículo bajo mínimo**, o cuántos están bajo el mínimo |

**Una tarjeta que no ves no es una tarjeta en cero.** Cada indicador aparece solo si tienes permiso sobre su módulo: **En cuentas, en divisas** necesita Tesorería; **Pagado sin recibir**, Compras; **Valor del inventario**, Inventario; y **Por pagar a proveedores** se ve con cualquiera de los dos, Tesorería o Compras.

La razón de ocultarlas en lugar de mostrarlas vacías está bien pensada: sin permiso, el sistema no devuelve los datos y el indicador saldría en cero, y **un cero se lee como «no hay plata en las cuentas», que es una afirmación falsa**. Es preferible no mostrar nada que mostrar una mentira.

#### Los colores

El color de estas tarjetas no es decoración, avisa de algo:

- **Por pagar a proveedores** se pone naranja cuando el pago más viejo lleva más de siete días esperando.
- **Pagado sin recibir** se pone naranja si hay compras atrasadas, y verde si no hay ninguna.

En los avisos de la tarjeta siguiente, los colores significan lo mismo en todo el sistema: **rojo** es algo que ya está haciendo daño, **naranja** es algo que hay que atender antes de que lo haga, y **azul** es información que conviene completar.

#### Los porcentajes

**El panel no muestra ningún porcentaje de variación.** No hay flechas de subida o bajada, ni comparaciones con ayer o con el mes pasado. Si alguien te habla del "12,4% frente a ayer", está mirando la ilustración de la pantalla de entrar, que es un dibujo de ejemplo. Las cifras del panel son la foto de ahora mismo, no una tendencia.

### 4.3 Requiere atención

Es la tarjeta que dice qué está detenido. Su subtítulo es **Nada detenido ahora mismo** o cuántos asuntos hay abiertos.

Si no hay nada, se ve un recuadro punteado con el texto **Ninguna compra atrasada, ningún pago esperando y ningún artículo bajo el mínimo.**

Si hay algo, aparece una lista de recuadros, y cada uno lleva a la pantalla donde se resuelve. Estos son los cinco avisos que pueden salir:

| Color | Lo que ves | Por qué importa | Adónde lleva |
| --- | --- | --- | --- |
| Rojo | **La tasa de hoy no está cargada** | **Sin ella no se puede cotizar, aprobar ni pagar: todo documento valorado congela la tasa del día.** | **Tasas de cambio** |
| Rojo | Cuántas **compras pagadas sin recibir** hay | **Más de una semana esperando material.** Es dinero que ya salió de la empresa | **Compras** |
| Naranja | Cuántos días lleva **un pago autorizado sin salir** | **El proveedor no reserva el material hasta ver el pago, y la cotización tiene fecha de vencimiento.** Aparece a partir de los tres días | **Pagos por hacer** |
| Naranja | Cuántas **compras esperan al gerente** | **Hasta que se apruebe no hay orden, y sin orden el proveedor no despacha.** | **Compras** |
| Naranja | Cuántos **artículos están bajo el mínimo** | **Reponer antes de que pare una máquina cuesta menos que pararla.** | **Existencias** |

**Los avisos también se filtran por tu permiso.** Si el aviso lleva a un módulo que no puedes abrir, no se te muestra: avisarte de algo que no puedes ir a resolver solo sirve para inquietarte. Consecuencia práctica: **el panel de cada persona es distinto**, y que tú no veas un asunto no significa que no exista.

**Hubo un sexto aviso y se retiró.** Contaba cuántas cuentas estaban sin saldo de apertura y llevaba a **Bancos y cajas**. Pedía abrir un saldo que la empresa decidió no llevar —Tesorería dejó de ser un módulo justamente porque no se van a llevar bancos ni cajas, y el sistema solo refleja los movimientos—, y encima llevaba a una pantalla que está fuera del menú por lo mismo: al administrador le abría, y a todos los demás les daba el candado. Un aviso que pide arreglar algo por una puerta cerrada no es un aviso.

### 4.4 Compras en curso

Esta tarjeta solo se ve con permiso de Compras. Su subtítulo es **Dónde está detenida cada una**, y muestra cinco filas con su número al lado, en este orden:

1. **Pedidos por confirmar**
2. **Buscando precios**
3. **Esperando al gerente**
4. **Por indicar el pago**
5. **Pagadas, por recibir**

Los ceros se ven en gris claro, para que la vista se vaya sola a lo que tiene número. Al final, el botón **Ver el tablero** lleva al tablero de Compras.

Si no tienes permiso de Compras y esta tarjeta no se dibuja, la de **Requiere atención** ocupa el ancho completo.

### 4.5 Esperando aprobación del gerente

Este bloque **solo aparece si hay algo pendiente de aprobar**. Su subtítulo es **Lo que lleva más tiempo detenido, primero**, y ese es exactamente el orden: lo más antiguo arriba.

Cada tarjeta muestra el número de la compra, la etiqueta roja **Urgente** si lo es, el título, y una línea con quién la solicitó, el proveedor y cuánto tiempo lleva esperando. Si falta el solicitante dice **Sin solicitante**; si falta el proveedor, **sin proveedor**. A la derecha va el total en dólares, o un guion si todavía no lo tiene. Cada tarjeta lleva al detalle de esa compra.

### 4.6 Lo que el panel todavía no mide

Al final hay dos tarjetas que no son indicadores, sino avisos de lo que falta por construir. Están ahí para que nadie busque esas cifras creyendo que salen en cero:

- **Producción y explotación**: **Todavía no se registra. Cuando el módulo esté, aquí van las toneladas del día y de la semana.**
- **Ventas y despachos**: **Todavía no se registran. Con ellos aparecerán aquí las guías de la romana y lo que está por cobrar.**

Dicho sin rodeos: **hoy el panel no mide producción, ni despachos, ni ventas, ni cobranza.** Mide dinero en cuentas, deuda con proveedores, compras y valor de inventario. Para saber las toneladas del día hay que ir al inventario.

### 4.7 Cuando algo no sale

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| **Cargando…** con un aro girando | Todavía está trayendo las cifras | Espera unos segundos |
| Caja roja con un triángulo y un mensaje | No se pudieron traer las cifras | Recarga. Los mensajes más frecuentes están en la tabla del apartado 3.8 |
| Una tarjeta de indicador que no aparece | No tienes permiso sobre ese módulo, y por eso no se muestra en lugar de mostrar un cero falso | Pide el permiso a administración si lo necesitas para tu trabajo |

El panel se refresca solo cada cinco minutos, además del enlace en vivo. No se puede descargar ni imprimir.

---

## 5. Tasas de cambio

**Sistema › Tasas de cambio**

Esta pantalla registra las tasas del día, que son con las que el sistema valora todos los documentos que se emiten. La propia pantalla marca la diferencia con el indicador de la barra superior en una frase que conviene aprenderse: **La tasa que valora los documentos. No es la del indicador de arriba: esa informa, esta compromete.**

**Ya no es solo el dólar.** El sistema lleva tres monedas contra el bolívar, cada una con su tasa y su propia fuente:

| Moneda | Cómo se rotula | Símbolo | De dónde sale la referencia |
| --- | --- | --- | --- |
| Dólar | **Dólar estadounidense** | **$** | Lo publicado por el **BCV** |
| Euro | **Euro** | **€** | Lo publicado por el **BCV** |
| Tether | **Tether (USDT)** | **USDT** | La **mediana del P2P de Binance**. Se registra con fuente **PARALELO**: no hay fuente oficial que consultar |

El bolívar no aparece en la lista porque su tasa contra sí mismo es uno por definición.

Antes de tocar nada hay que entender esto: **una tasa registrada no se puede corregir ni borrar. Nunca, para nadie.** No hay botón de editar ni de eliminar en toda la pantalla. La razón es que la tasa es evidencia: con ella se valoró lo que se cotizó, se aprobó y se pagó ese día, y cambiarla después alteraría de golpe documentos ya emitidos. Si se publica una corrección, se registra una fila nueva y los documentos afectados se reprocesan aparte, con administración.

### 5.1 Qué se ve

Lo primero de la pantalla es **la fila de monedas**: una píldora por cada una, con su nombre y su símbolo al lado en gris. **Todo lo que hay debajo —el formulario, los avisos y el historial— es de la moneda que esté elegida.**

**Abre siempre en el dólar**, porque es con lo que se mide todo el sistema; las otras dos están a un clic. Cambiar de moneda **vacía el campo del valor** a propósito: la cifra que ibas a escribir para el dólar no vale para el euro.

**Registrar la tasa del día · $** es la tarjeta ancha de arriba, y el símbolo del final cambia con la moneda elegida. Si tu permiso sobre Tasas de cambio es de consulta, el título dice solo **La tasa del día · $** y el subtítulo explica de dónde sale: **La toma el sistema del BCV. Aquí se consulta cuál está rigiendo.** Con permiso de escritura, el subtítulo repite la regla: **Una vez registrada no se puede corregir. Si se publica una corrección, se registra una fila nueva.**

Debajo hay un aviso de estado, siempre uno de los dos:

- En verde, si ya se registró: **La tasa de hoy ya está registrada: Bs** seguido de la cifra **por $. Los documentos que se emitan hoy en $ se valoran con esta.**
- En naranja, si no: **Todavía no se ha registrado la tasa de hoy en $.**, seguido de **Los documentos se están valorando con la del** y la fecha de la última. Si no hay ninguna tasa registrada de esa moneda, dice **Sin ninguna tasa registrada no se puede emitir nada en $.**

**Ahora mismo** es la tarjeta estrecha, y muestra las dos tasas una encima de la otra para que no se confundan:

- Arriba, la de la calle: **Publicada por el BCV** para el dólar y el euro, **Mediana del P2P de Binance** para el USDT. Debajo, la etiqueta **De hoy** o **De un día anterior** en el caso del BCV, y **De ahora mismo** en el de Binance.
- Abajo, **Con la que valora el sistema**: la cifra registrada, o **Ninguna todavía.** Al lado, en letra pequeña, **Registrada el** y la fecha, con la palabra **arrastrada** si viene de un día anterior.

Y debajo de esa tarjeta está la calculadora, que tiene su propio apartado (5.5).

**Historial** es la tercera tarjeta, con el subtítulo **Últimas tasas registradas en $.** Tiene tres columnas:

| Columna | Qué muestra |
| --- | --- |
| **Fecha** | El día de la semana abreviado, el día, el mes y el año |
| **Bs por $** | El valor, con cuatro decimales |
| **Fuente** | De dónde salió. **BCV** se pinta en azul; **PARALELO** y las demás, en gris |

Los cuatro decimales no son un capricho: a más de doscientos bolívares por dólar, el cuarto decimal ya mueve céntimos en una factura.

La tabla va de la más reciente a la más antigua, **es solo de la moneda elegida** y **muestra hasta sesenta filas. No tiene buscador, ni filtros, ni paginación**, así que una tasa muy antigua deja de aparecer aquí. Si no hay ninguna, se ve **Sin tasas registradas en $**.

### 5.2 Cómo se carga una tasa

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Fecha** | Sí | Viene puesta la de hoy en Venezuela. **No admite días futuros** |
| **Bolívares por $** | Sí | Numérico, admite decimales. El rótulo cambia con la moneda: **Bolívares por €**, **Bolívares por USDT**. Empieza vacío, con **0,0000** de ejemplo |

1. Elige la **moneda** en la fila de píldoras. Si es el dólar, ya está elegida.
2. Revisa la **Fecha**. Normalmente es la de hoy y no hay que tocarla.
3. Escribe el valor. Si el sistema pudo consultar la fuente pública, tienes un botón que la copia de un golpe: **Usar la del BCV** para el dólar y el euro, **Usar la de Binance** para el USDT. Ese botón no aparece si la consulta falló.
4. Pulsa **Registrar**. Mientras guarda dice **Guardando…** y no se puede volver a pulsar.
5. Al guardar, el campo del valor se vacía solo y las tres tarjetas se ponen al día.

Debajo del campo del valor hay una línea de ayuda que dice qué se pudo consultar: **Según el BCV: Bs** con la cifra, o **Según la mediana del P2P de Binance: Bs** con la cifra, a la que se añade **(no es de hoy)** cuando la publicada corresponde a otro día. Si no se pudo consultar, dice **No se pudo consultar el BCV; escribe el valor a mano.**

**El botón Registrar está apagado mientras el campo del valor esté vacío**, y el selector de fecha no deja elegir mañana ni después, porque una tasa futura valoraría documentos con un número que todavía no se ha publicado.

Registrar la tasa del dólar apaga el aviso rojo **La tasa de hoy no está cargada** del panel.

**Cargar una tasa exige permiso de escritura sobre Tasas de cambio**, que hoy tienen **administración, la gerencia general y recursos humanos**. No tesorería: ese rol se retiró (12.1). Quien solo la consulta ve la pantalla completa —las monedas, el historial y la calculadora— pero sin el formulario. Esto cambió el 4 de agosto de 2026: antes lo podía hacer cualquiera que entrara al sistema.

### 5.3 De dónde salen las tasas

Hay dos tasas distintas en el sistema y no hay que confundirlas.

**La de la calle** se consulta a una fuente pública en internet y se refresca cada media hora. Es solo para mirar. Para el dólar y el euro es lo que publica el BCV; para el USDT es la mediana de las diez primeras ofertas del mercado entre particulares de Binance, consultada desde el servidor porque el navegador no puede pedirla directamente. **Ninguna de las tres valora nada.**

**La registrada en esta pantalla** es la que el sistema usa para valorar los documentos. Puede escribirse a mano o copiarse de la pública con el botón, pero mientras no se registre aquí, para el sistema no existe.

Si las dos no coinciden —arriba dice una cosa y **Con la que valora el sistema** dice otra—, significa que la tasa del día todavía no se ha cargado. Alguien tiene que registrarla antes de emitir nada.

**El USDT no tiene tasa oficial, y eso hay que saberlo.** El dólar y el euro los publica el BCV y se registran con fuente **BCV**; el USDT se registra con fuente **PARALELO**, porque nadie lo publica oficialmente: lo pone quien lo negocia. La cifra de Binance es una referencia de mercado, no una publicación con respaldo. Antes de registrarla, confírmala con quien cierra las operaciones.

#### La tasa que se arrastra

El BCV no publica los fines de semana ni los feriados. Un documento emitido en sábado tiene que valorarse con algo, y ese algo es la última tasa registrada. Por eso la tarjeta **Ahora mismo** dice **arrastrada** cuando la que está valorando es de un día anterior: no es un error ni un descuido, es el sistema trabajando con lo último publicado.

**Cada moneda se arrastra por su cuenta.** Registrar la del dólar no registra la del euro. Si mañana hay que emitir algo en euros y nadie ha cargado el euro esta semana, se valorará con el euro de la semana pasada.

### 5.4 Por qué cada documento congela la tasa del día

Cuando se emite una cotización, se aprueba una compra o se registra un pago, el documento **se queda con la tasa que había ese día**. No se recalcula después, aunque la tasa suba mañana.

La razón es la que sostiene toda la contabilidad de la empresa: una factura de hace tres meses tiene que valer hoy lo mismo que valía cuando se emitió. Si los documentos se revaloraran cada vez que cambia la tasa, ningún total cuadraría dos días seguidos, y una cotización que el cliente aceptó por una cifra pasaría a decir otra.

De ahí salen dos consecuencias prácticas:

- **Cargar la tasa es lo primero de la mañana.** Mientras no esté, el sistema avisa en rojo en el panel, porque todo lo que se emita antes de cargarla se valorará con la del día anterior.
- **Corregir una tasa mal cargada no se hace en esta pantalla.** Se registra una fila nueva y los documentos ya emitidos con la equivocada se revisan con administración. Por eso vale la pena mirar dos veces la cifra antes de pulsar **Registrar**.

### 5.5 La calculadora

Está en dos sitios: en la tarjeta **Ahora mismo** de esta pantalla, y dentro del panel que se despliega al pulsar el indicador de tasa de la barra superior. Sirve para hacer una cuenta con monedas mezcladas sin sacar la calculadora del teléfono ni buscar la tasa a mano.

Su rótulo es **Calcular** y el campo trae de ejemplo **(300 $ + 120 €) / 3**. Se escribe la cuenta como se diría en voz alta y el resultado sale debajo, en grande, mientras se teclea. Con el campo vacío ofrece tres ejemplos pulsables: **(300 $ + 120 €) / 3**, **850 usdt \* 1,16** y **1200 $ - 340,50 €**.

Cuando el resultado es dinero aparece una fila **en** con una píldora por cada moneda —**Bs**, **$**, **€**, **USDT**—, y pulsando una se convierte el resultado a esa moneda. Solo salen las monedas que tengan tasa registrada. Empieza en bolívares.

Debajo del resultado, la calculadora **repite cómo leyó la cuenta**, con los signos escritos como se escriben a mano: `300,00 $ + 120,00 € ÷ 3`. Es para que se vea si entendió lo que quisiste decir antes de apuntar el número.

**Cómo hay que escribirle:**

- La moneda se nombra por su símbolo, su código o su nombre: **$**, **USD**, **dólar**, **dólares**, **€**, **euro**, **Bs**, **USDT**. Da igual mayúscula o minúscula.
- El decimal puede ir con coma o con punto: **15,50** y **15.50** valen lo mismo.
- Se puede sumar, restar, multiplicar, dividir y agrupar con paréntesis.

**Cuatro reglas que explican casi todos sus avisos:**

- **Dinero más dinero da dinero**, aunque sean monedas distintas: todo pasa por bolívares, que es la única moneda contra la que hay tasas.
- **Dinero por un número da dinero.** Es lo que se usa para el IVA: **× 1,16**.
- **Dinero entre un número da dinero.** Es repartir.
- **Dinero entre dinero da un número**, que es una proporción. Y **dinero por dinero no existe**: el resultado no sería una cantidad de nada. Si lo intentas, responde: «No se puede multiplicar dinero por dinero: el resultado no sería una cantidad. Para un porcentaje usa un número suelto, como «× 1,16».»

Si escribes una moneda que no existe, te lo dice y, cuando se parece a una que sí, la propone: ««bsb» no es una moneda. ¿Querías escribir Bs?» Y si la moneda existe pero nadie ha cargado su tasa, avisa de lo que falta: «Falta registrar la tasa de Euro.»

**La calculadora no registra nada.** Es una cuenta a mano hecha en pantalla: no queda guardada, no aparece en ningún documento y no valora nada. Lo que valora es lo registrado en esta pantalla.

### 5.6 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Ya existe una tasa BCV para USD/VES del … Las tasas no se corrigen: si el valor cambió, consulte con administración.» | Ya se cargó la tasa de ese día y esa moneda. Es el caso más frecuente | Revisa el historial: la de hoy ya está. Si el valor cargado está mal, habla con administración |
| «La tasa debe ser mayor que cero (recibido: …)» | Escribiste cero o un valor negativo | Escribe la tasa publicada |
| «No se puede registrar una tasa con fecha futura» | La fecha es de mañana o después | Corrige la fecha |
| «Tu usuario no tiene acceso a Tasas de cambio.» | Tu permiso sobre este módulo es de consulta | Que la cargue administración, la gerencia o recursos humanos |
| «No autenticado» | Tu sesión ya no vale | Vuelve a entrar y repite el registro |
| «Las tasas de cambio no se modifican ni se borran (operación: …). Inserte una tasa nueva.» | Se intentó cambiar o eliminar una tasa ya registrada | Registra una fila nueva. Las tasas anteriores se quedan |
| **No disponible** en el indicador de la barra superior | No se pudo consultar la tasa pública | Escribe el valor a mano. La consulta pública no hace falta para registrar |
| «Falta registrar la tasa de Euro.» en la calculadora | Metiste esa moneda en la cuenta y nadie ha cargado su tasa | Regístrala arriba, eligiendo esa moneda |
| «No hay conexión con el servidor. Revisa la red e inténtalo otra vez.» | Se cayó el internet | Reintenta cuando vuelva la señal. Lo que no se guardó, no quedó |

---

## 6. Explotación

> **Hoy este módulo no se ofrece en el menú.** Está construido y sus pantallas funcionan —todo lo que cuenta este capítulo es cierto—, pero se dejó fuera del menú lateral mientras se termina de afinar, y quien escriba su dirección a mano se encuentra primero el cartel de **En construcción**. Lo que eso significa exactamente está en 1.5. Consecuencia inmediata: **mientras Explotación no vuelva al menú, no entra piedra al patio por ninguna vía**, porque el parte de turno es la única puerta y vive aquí.

Explotación es el principio de todo lo demás. Aquí se anota dónde se está arrancando el material, qué voladuras se hicieron y cuánto produjo cada turno. De esta última anotación sale la piedra que después se cuenta en el patio, se vende y se despacha.

Hay una idea que conviene entender antes de tocar nada, porque explica casi todas las reglas del módulo:

**El parte de turno es la única puerta por la que entra material al patio.** No es una forma más de cargar producción: es la única que queda. Mientras Explotación no existía había un atajo en Existencias, y ese atajo se cerró. Dos puertas al mismo patio es exactamente como se cuenta dos veces la misma piedra: una vez por el parte y otra por el atajo.

De ahí se desprende la consecuencia práctica: **si el parte de turno no se carga, el inventario dice cero.** Y con el inventario en cero no se puede despachar ni facturar, porque el sistema no deja sacar material que según el libro no está.

### 6.1 Quién entra y quién puede hacer qué

Hay tres puertas distintas, y conviene no confundirlas.

La primera es **ver el módulo**. Depende del permiso sobre Explotación que administración le haya dado a tu usuario. Si no lo tienes, el grupo Explotación no aparece en el menú, y si escribes la dirección a mano verás una tarjeta con un candado: **Explotación no está a tu alcance**.

La segunda es **poder registrar**: crear frentes, registrar voladuras y cargar partes de turno.

La tercera es **poder anular**. Anular una voladura o un parte no es una operación del día: un parte anulado le quita material al patio que quizá ya se despachó. Por eso pide el escalón más alto del módulo.

**Hoy no lo alcanza nadie salvo el administrador del sistema.** Sobre Explotación, los otros nueve roles están en **Ninguno**, igual que en Despachos y en Ventas: mientras un módulo esté en obra, tampoco se reparte.

La tabla que sigue es **cómo está previsto repartirlo el día que se ofrezca**, y así es como se comportan las pantallas:

| Rol | Ve el módulo | Registra frentes, voladuras y partes | Anula voladuras y partes |
| --- | --- | --- | --- |
| Administrador del sistema | Sí | Sí | Sí |
| Operaciones | Sí | Sí | Sí |
| Gerente general | Sí | No | No |
| Los otros siete roles | No | No | No |

Administración lo abre desde la matriz de permisos cuando toque.

Fíjate en la fila de Almacén: **quien lleva el patio no entra a Explotación.** Tiene consecuencias que hay que saber, y están explicadas en 6.6.

Si ves las pantallas pero no ves ningún botón de acción, no es una falla: tu permiso es de consulta.

**Lo que escribes se convierte solo a mayúsculas y se le quitan las tildes.** Ocurre mientras tecleas, en los nombres de los frentes, en el responsable de la voladura, en el operador y en las notas. La eñe se conserva. Unifica la forma de escribir para que buscar «CAMIÓN» y «camion» encuentre lo mismo.

**Lo que registra otra persona aparece sin recargar la pantalla.** Si el operador carga el parte desde el patio mientras tú miras las existencias en la oficina, la piedra aparece sola.

### 6.2 Cómo llega la piedra al patio

Son cuatro pasos y siempre van en el mismo orden. Quien entienda esto entiende el módulo entero.

1. **El frente.** Alguien anota en **Frentes y bancos** el sitio del cerro donde se está trabajando, y con qué se arranca: voladura, martillo, o los dos. Sin al menos un frente activo no se puede hacer nada más, porque tanto la voladura como el parte tienen que decir de dónde salió el material.
2. **La voladura.** Cuando se dispara, se registra en **Voladuras** con su fecha, su explosivo, su responsable y su permiso. Aquí se anotan las **Toneladas estimadas**: lo que se calcula haber arrancado. Es una estimación, no una cuenta.
3. **El parte de turno.** Al cerrar el turno, quien opera carga en **Producción por turno** lo que la trituradora produjo de verdad: un renglón por cada material, con sus toneladas. Puede enlazar el parte a la voladura que se estuvo trabajando.
4. **La entrada al patio.** Al pulsar **Guardar el parte**, y en ese mismo momento, cada renglón escribe una entrada en el libro de inventario, en el patio que se eligió. A partir de ahí el material existe para el resto del sistema: se ve en Existencias y se puede despachar.

Ese cuarto paso es el que hay que tener claro. **El parte de turno no es un reporte: es el asiento que mueve el inventario.** Guardarlo es meter la piedra al patio, y anularlo es sacarla.

Y el paso 2 se cierra con el paso 3: cuando el parte se enlaza a la voladura, el sistema compara lo que se estimó con lo que se produjo y muestra el **Desvío**. Es el número que dice si quien calcula las voladuras está calibrado.

### 6.3 Frentes y bancos

**Operación › Explotación › Frentes y bancos**

Dónde se está arrancando el material, y con qué. Es la primera pantalla del módulo porque todo lo demás cuelga de ella.

#### Qué se ve

Una tarjeta por frente. Cada una muestra el nombre, debajo el código, el banco y el material, y a la derecha una etiqueta con el estado: **activo**, **suspendido** o **agotado**.

Debajo, cuatro cifras: **Producido** (las toneladas que han cargado los partes de ese frente), **Arranque**, **Voladuras** (cuántas se han registrado) y **Última** (la fecha de la más reciente). Si el frente tiene reserva anotada, aparece al pie: **Reserva estimada 40.000 t**.

Si todavía no hay ninguno, la pantalla lo dice: **Todavía no hay frentes**.

#### Crear o corregir un frente

1. Pulsa **Nuevo frente**, arriba a la derecha. Para corregir uno que ya existe, **pulsa en cualquier parte de su tarjeta**: no hay botón de editar y nada en la pantalla lo indica.
2. Llena la ficha.
3. Pulsa **Guardar**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Código** | Sí | Corto, del estilo de **F-01**. No se puede repetir |
| **Nombre** | Sí | Cómo lo llama la gente: **Frente norte** |
| **Banco o cota** | No | En una cantera se avanza por bancos, y el mismo frente en dos bancos da material distinto |
| **Material** | No | La roca: granito, caliza, arenisca |
| **Cómo se arranca** | — | **Voladura**, **Martillo hidráulico** o **Los dos, según el material**. Empieza en **Voladura** |
| **Estado** | — | **Activo**, **Suspendido** o **Agotado**. Empieza en **Activo** |
| **Reserva estimada (t)** | No | Lo que estima geología. Es una cifra que se corrige, no una cuenta |
| **Nota** | No | |

#### Lo que no te deja el sistema

**Sin código y sin nombre no se guarda.** El botón **Guardar** ni siquiera se enciende, y si llegara a intentarse, el sistema responde «El frente necesita un código con el que llamarlo.» o «El frente necesita un nombre.» Un frente sin nombre en la lista de un parte de turno no le dice nada a quien lo tiene que elegir a las seis de la mañana.

**Dos frentes no pueden tener el mismo código.** El sistema no lo guarda, pero conviene saber que el aviso que aparece en ese caso no está escrito para quien lo lee: es el texto técnico que devuelve el sistema por su cuenta. Si al guardar un frente te sale un mensaje que no entiendes, revisa primero si ese código ya está en uso.

**Un frente no se borra.** Se le pone **Suspendido** cuando se para, o **Agotado** cuando se acaba. La razón es que sus voladuras y sus partes siguen en el libro y tienen que poder seguir señalando de dónde salieron.

**El estado manda sobre lo que se puede registrar después**, y la propia ficha lo advierte: *Un frente suspendido o agotado no admite partes de turno.*

**El método de arranque también manda**, y el encabezado de la ficha lo dice: *El método de arranque manda: un frente de martillo no admite voladuras.* Está explicado en 6.4.

### 6.4 Voladuras

**Operación › Explotación › Voladuras**

Lo que se arranca del cerro, con su permiso y su responsable. Cada voladura es un evento con explosivo de por medio, así que queda registrada con su número, no se edita y no se borra.

#### Qué se ve

Una lista, de la más reciente a la más antigua, con estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Voladura** | El número — **VOL-2026-0001**, que se reinicia cada año — y debajo la fecha y la hora |
| **Frente** | El nombre del frente y, debajo, el banco |
| **Barrenos** | Cuántos se perforaron |
| **Explosivo** | Los kilos que se cargaron |
| **Estimado** | Las toneladas que se calculó arrancar |
| **Producido** | Las toneladas que después cargaron los partes de turno enlazados a esta voladura |
| **Desvío** | Cuánto se apartó lo producido de lo estimado |

Las voladuras anuladas se quedan en la lista, atenuadas, con la etiqueta **Anulada** en lugar del desvío.

**El desvío es la cifra que hay que mirar.** Sale en verde cuando la diferencia es del 15 % o menos, hacia arriba o hacia abajo, y en ámbar cuando se pasa de ahí. Solo aparece si se anotaron las **Toneladas estimadas**: sin estimación no hay con qué comparar, y la columna muestra una raya.

Pulsando en una línea se abre el detalle, con todo lo que se cargó y la observación.

#### Registrar una voladura

1. Pulsa **Registrar voladura**, arriba a la derecha.
2. Elige el **Frente**. Ojo con esta lista, porque no trae todos: está explicado abajo.
3. Llena lo que sepas. La **Fecha** viene puesta en hoy.
4. Pulsa **Registrar**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Frente** | Sí | Es lo único obligatorio |
| **Fecha** | — | Viene puesta en hoy. Se puede poner una anterior, no una futura |
| **Hora** | No | |
| **Barrenos** | No | |
| **Metros perforados** | No | |
| **Diámetro (mm)** | No | |
| **Tipo de explosivo** | No | **Emulsión**, por ejemplo |
| **Explosivo (kg)** | No | |
| **Detonadores** | No | |
| **Cordón (m)** | No | |
| **Toneladas estimadas** | No | Sin ella no se calcula el **Desvío** |
| **Responsable** | No | Quién la dirigió |
| **Permiso** | No | La autorización de explosivos |
| **Observación** | No | |

El encabezado del formulario recuerda de qué se trata: *Lo que se cargó y lo que se estima haber arrancado. El tonelaje real aparece después, en los partes de turno.*

#### Lo que no te deja el sistema

**En la lista de frentes no aparecen los de martillo.** Tampoco los suspendidos ni los agotados. Es la misma regla que aplica el sistema al guardar, dicha antes de que escribas nada.

Si de todos modos se intenta registrar una voladura contra un frente de martillo, el sistema la rechaza en vez de guardarla: «El frente "FRENTE SUR" se trabaja con martillo, no con voladura. Si eso cambió, corrígelo primero en la ficha del frente.» **Se rechaza y no se guarda, y esa diferencia importa.** Guardarla dejaría un consumo de explosivo imputado a un sitio donde no se usó explosivo, y ese error no lo encuentra nadie hasta que aparece en un informe seis meses después. Si el frente de verdad cambió de método, se corrige primero en su ficha y después se registra la voladura.

**No se registra una voladura con fecha futura**, porque una voladura que todavía no ocurrió no tiene consumo real que anotar. El sistema responde «No se registra una voladura con fecha futura.»

**Si no hay ningún frente que se trabaje con voladura, el botón Registrar voladura está apagado.** La pantalla lo explica: *Primero hace falta un frente activo que se trabaje con voladura. Se crean en Frentes y bancos.*

**Una voladura no se edita.** Si está mal, se anula con motivo y se registra la correcta.

#### Anular una voladura

1. Pulsa en la línea para abrir el detalle.
2. Pulsa **Anular**.
3. Escribe **Por qué se anula**. Son mínimo cuatro letras, y el sistema responde «Escribe por qué se anula la voladura.» si se deja corto.
4. Pulsa **Anular**.

La voladura **no se borra**: queda con su número, atenuada en la lista y con el motivo a la vista en el detalle. Es lo que se le puede enseñar a quien venga a preguntar.

**No se puede anular una voladura que ya tiene partes de turno enlazados.** El sistema lo dice con la cuenta: «La voladura VOL-2026-0003 tiene 2 parte(s) de turno que trabajaron ese material. Anúlalos primero.» La razón es el orden: esos partes ya metieron piedra al patio, y borrar la voladura de la que dicen venir dejaría el tonelaje sin explicación.

### 6.5 Producción por turno

**Operación › Explotación › Producción por turno**

Lo que produjo cada turno, y por dónde entra al patio. Es la pantalla que mueve el inventario.

#### Qué se ve

Una lista de partes, del más reciente al más antiguo:

| Columna | Qué muestra |
| --- | --- |
| **Parte** | El número — **PRO-2026-0001**, que se reinicia cada año — y debajo la fecha y el turno |
| **Frente** | De dónde salió el material |
| **Patio** | A qué almacén entró |
| **Producido** | La suma de todos los renglones del parte |
| **Horas** | Las horas operativas y, en ámbar debajo, las horas de paro si las hubo |
| **Rendimiento** | Toneladas por hora |

Los partes anulados se quedan en la lista, atenuados, con la etiqueta **Anulado** en lugar del rendimiento.

**El rendimiento solo aparece si se anotaron las horas operativas.** No es un capricho de la pantalla: 300 toneladas no significan nada sueltas — puede ser un turno excelente de cuatro horas o uno malo de ocho. Sin horas, ese parte no se puede comparar con ningún otro.

Pulsando en una línea se abre el detalle: primero los renglones, uno por material con su cantidad, y debajo el patio, las horas, el paro, el rendimiento, la voladura y el operador.

#### Cargar un parte

1. Pulsa **Cargar parte**, arriba a la derecha.
2. Revisa la **Fecha**, que viene puesta en hoy, y elige el **Turno**.
3. Elige el **Frente** y el **Patio**.
4. Enlaza la **Voladura**, si la hubo.
5. Escribe las **Horas operativas** y, si hubo parada, las **Horas de paro** y el **Motivo del paro**.
6. Llena el **Material producido**: en cada renglón elige el material y escribe las **Toneladas**. Con **Agregar material** se añade otro renglón, y con **Quitar** se elimina el que sobre. Abajo a la derecha se va sumando el **Total del turno**.
7. Pulsa **Guardar el parte**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Fecha** | Sí | Viene puesta en hoy. Se puede poner una anterior, no una futura |
| **Turno** | — | **Turno I**, **Turno II** o **Turno III**. Empieza en **Turno I** |
| **Operador** | No | Quién reporta |
| **Frente** | Sí | Solo salen los frentes activos |
| **Patio** | Sí | Adónde entra el material. Si solo hay un almacén, viene elegido |
| **Voladura** | No | Empieza en **Ninguna en particular**. Solo salen las voladuras vigentes de ese frente. *Enlazarla permite comparar lo estimado con lo producido* |
| **Horas operativas** | No | *Sin ellas, el tonelaje no se puede comparar con otro turno* |
| **Horas de paro** | No | |
| **Motivo del paro** | Depende | Obligatorio en cuanto pongas horas de paro |
| **Renglón** y **Toneladas** | Sí | Al menos uno, con cantidad mayor que cero |
| **Nota** | No | |

El encabezado del formulario dice lo importante en una línea: *Lo que se produjo entra al patio en el momento de guardar.*

#### Lo que no te deja el sistema

**Un parte sin material producido no se guarda.** El botón **Guardar el parte** está apagado mientras el total sea cero, y el sistema lo repite si llega a intentarse: «Un parte de turno sin material producido no dice nada.» Un parte que no mete piedra al patio no es un parte: es una nota.

**Un renglón a medias no se guarda.** Si eliges el material y dejas las toneladas en blanco, o al revés, ese renglón se descarta en silencio y el resto del parte sí se guarda. Revisa el **Total del turno** antes de guardar: es la comprobación de que están todos.

**Si pones horas de paro tienes que decir por qué.** El campo se pone en rojo con el aviso *Un paro sin motivo no se puede cuadrar después*, y el botón no se enciende. Un paro sin motivo es una hora perdida que nadie va a poder explicar cuando se revise el mes.

**Solo entran materiales del catálogo marcados como producto de cantera.** Si se intenta otra cosa, el sistema responde «La cantera produce productos. "GASOIL" está catalogado como COMBUSTIBLE.» La cantera produce piedra; el gasoil entra por una compra, no por un turno.

**No se registra producción con fecha futura**, porque un turno que todavía no ocurrió no produjo nada que meter al patio.

**Solo hay un parte por turno y por frente.** Es la regla más importante de la pantalla y está explicada en 6.6.

#### Anular un parte

1. Pulsa en la línea para abrir el detalle.
2. Pulsa **Anular**.
3. Escribe **Por qué se anula**. Mínimo cuatro letras: «Escribe por qué se anula el parte.»
4. Pulsa **Anular el parte**.

La ventana avisa de lo que va a pasar antes de hacerlo: *El material que metió sale del patio con un asiento contrario. Si ya se despachó, no se puede: habrá que corregir con un ajuste.*

El parte queda con su número, atenuado y con el motivo a la vista. En el libro de inventario aparecen las entradas contrarias con la nota **ANULACIÓN DEL PARTE PRO-2026-0012:** seguida de tu explicación.

**No se puede anular un parte cuyo material ya se despachó.** El sistema lo comprueba material por material antes de escribir nada y lo dice con nombre y cantidad: «De "GRANZON" ya no quedan las 120 que metió este parte: se despacharon. Corrige con un ajuste de inventario, que deja constancia de la diferencia.» El motivo es que devolverlo dejaría el patio en negativo, y una existencia negativa no es un dato: es un error que alguien tendrá que deshacer más adelante, cuando ya nadie recuerde de dónde salió.

### 6.6 Lo que conviene entender

#### El parte de turno es la única puerta, y el atajo de Existencias ya no existe

Hubo un botón **Cargar producción** en **Existencias**, que fue la puerta provisional mientras Explotación no existía. **Ya no está.** Hoy en su lugar hay un botón **Registrar entrada**, que es otra cosa: sirve para lo que entra sin una compra de por medio —el saldo inicial de un almacén, algo comprado por fuera— y **no carga producción de cantera**. Está explicado en 7.4.

La piedra entra por el parte de turno y por ningún otro sitio. El parte, además, sabe de qué frente salió, con cuántas horas y contra qué voladura. Dos puertas al mismo patio es como se cuenta dos veces la misma piedra, así que se dejó una sola.

Con Explotación fuera del menú, la consecuencia es la que dice el aviso del principio de este capítulo: **hoy no entra piedra al patio por ninguna vía.**

#### Un parte lleva varios renglones porque un turno produce varios materiales

Una trituradora no saca un solo material: del mismo turno salen piedra 1, piedra 2, granzón y polvillo a la vez. Por eso el parte tiene renglones y no una sola cantidad. Obligar a llenar cuatro partes del mismo turno sería llenar cuatro veces la misma cabecera y arriesgarse a que una se quede sin cargar.

Lo que hay que saber es cómo se traduce eso al inventario: **cada renglón escribe su propia entrada en el libro**, con su número de movimiento, y el parte se queda apuntado con cuál escribió cada uno.

Ahí está la razón de que anular funcione bien. **Al anular, el sistema reversa exactamente esas entradas y no otras parecidas.** Buscar «una entrada parecida» — mismo artículo, misma cantidad, mismo patio — devolvería la del turno de al lado el día que dos partes coincidan, y se estaría sacando del patio la piedra equivocada.

Y como cada renglón es una entrada distinta, nada impide poner el mismo material en dos renglones del mismo parte. Si eso pasa, entran las dos cantidades por separado. Revisa el **Total del turno** antes de guardar.

#### Un parte por turno y por frente

**El mismo turno en el mismo frente no admite dos partes.** Si se intenta, el sistema no lo guarda.

La razón se dice en una frase: **dos partes del mismo turno en el mismo frente son el mismo tonelaje contado dos veces.** El segundo se carga casi siempre sin mala intención — alguien no sabe que el otro ya lo cargó — y el resultado es un patio con material que no existe, que se descubre el día que se va a despachar y no aparece.

Si un parte quedó mal cargado, el camino es anularlo y hacer otro. Sale más largo, y a cambio quedan los dos en el libro: el equivocado, el motivo por el que se anuló y el correcto.

Una advertencia honesta sobre esta regla: **el aviso que sale al intentar guardar el segundo parte no está escrito para quien lo lee.** Es el texto técnico que devuelve el sistema por su cuenta. Si al guardar un parte te aparece un mensaje que no entiendes, lo primero que hay que mirar es si ese turno ya está cargado para ese frente.

#### El frente dice con qué se trabaja, y por eso se rechaza la voladura

El método de arranque es un dato del frente y no una casilla que se marca en cada voladura. Eso es deliberado: quien registra una voladura a las siete de la mañana no está en condiciones de decidir con qué se trabaja el frente; eso se decidió antes y se anotó una sola vez.

De ahí sale el control. Registrar una voladura contra un frente de martillo es un error de captura, y **el sistema lo rechaza en lugar de guardarlo**. Guardarlo sería más cómodo en el momento y mucho peor después: quedaría un consumo de explosivo imputado a un sitio donde no se usó explosivo, y ese número aparecería seis meses más tarde en un informe de costos que ya nadie puede reconstruir. Un rechazo se resuelve en el instante; un dato falso, no.

#### La producción entra valorada en cero

Cada renglón del parte entra al patio **con costo cero**. No es un olvido.

Lo que cuesta producir una tonelada de piedra sale de la nómina, el gasoil, el explosivo y el desgaste de la trituradora. Ese cálculo el sistema todavía no lo hace. Poner un número inventado valoraría el patio con una cifra que nadie calculó, y esa cifra acabaría en un balance. Cero es falso, pero se ve falso; un costo inventado es falso y parece cierto.

Consecuencia práctica, y hay que tenerla presente al mirar Existencias: **la producción sube las toneladas del patio pero no sube el Valor del inventario**, y arrastra el **Costo prom.** hacia abajo. Mientras el costeo no esté construido, el valor en dólares del material producido no es una cifra en la que apoyarse. Las toneladas sí.

#### Lo que muestran las listas

**Las tres pantallas muestran lo más reciente y no tienen paginación.** Frentes y bancos los muestra todos. Voladuras y Producción por turno muestran los 300 registros más recientes, sin filtros ni botón de ver más. Es una limitación real: en una cantera con tres turnos diarios, un parte de hace unos meses deja de aparecer en la pantalla aunque siga en el libro y siga contando en las existencias.

### 6.7 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Tu usuario no tiene permiso para esta acción.» | Te falta permiso sobre Explotación, y el mensaje no dice cuál | Si fue al anular una voladura o un parte, hace falta el control total sobre Explotación. Pídelo a administración, o que lo haga quien lo tenga |
| **Explotación no está a tu alcance** | Llegaste a una pantalla del módulo sin permiso para verlo | Pulsa **Volver al panel**. Si lo necesitas para tu trabajo, pide el permiso a administración |
| «El frente necesita un código con el que llamarlo.» | El código quedó vacío | Escribe un código corto, del estilo de **F-01** |
| «El frente necesita un nombre.» | El nombre quedó vacío | Escribe cómo llama la gente a ese frente |
| «El frente "FRENTE SUR" se trabaja con martillo, no con voladura. Si eso cambió, corrígelo primero en la ficha del frente.» | Se intentó registrar una voladura contra un frente de martillo | Si el frente cambió de método, corrígelo en **Frentes y bancos** y vuelve a registrar la voladura |
| «El frente "FRENTE SUR" está agotado.» | Contra un frente agotado no se registran voladuras | Elige otro frente, o reactívalo en su ficha si de verdad se sigue trabajando |
| «No se registra una voladura con fecha futura.» | La fecha es de mañana o después | Corrige la fecha |
| «Escribe por qué se anula la voladura.» | El motivo quedó vacío o con menos de cuatro letras | Escribe qué pasó con esa voladura |
| «La voladura VOL-2026-0003 ya estaba anulada.» | Esa voladura ya se anuló | Recarga la pantalla: la anulación ya está hecha |
| «La voladura VOL-2026-0003 tiene 2 parte(s) de turno que trabajaron ese material. Anúlalos primero.» | Hay partes de turno enlazados que ya metieron piedra al patio | Anula primero esos partes. Si no se pueden anular porque el material ya se despachó, la voladura se queda como está |
| «Un parte de turno sin material producido no dice nada.» | No se cargó ningún renglón con cantidad | Añade al menos un material con sus toneladas |
| «El frente "FRENTE NORTE" está suspendido.» | Un frente suspendido o agotado no admite partes de turno | Elige otro frente, o vuelve a ponerlo **Activo** en su ficha si se retomó el trabajo |
| «El patio "PATIO VIEJO" está cerrado.» | El almacén elegido está desactivado | Elige otro patio, o pide que lo reactiven en **Almacenes y patios** |
| «No se registra producción con fecha futura.» | La fecha del parte es de mañana o después | Corrige la fecha |
| «La voladura indicada no existe o está anulada.» | La voladura que enlazaste se anuló mientras llenabas el parte | Recarga la pantalla y elige otra, o deja **Ninguna en particular** |
| «La cantera produce productos. "GASOIL" está catalogado como COMBUSTIBLE.» | Ese material no es un producto de cantera | Elige un producto de cantera. Si falta en la lista, revísalo en el catálogo de artículos |
| «La cantidad de "GRANZON" tiene que ser mayor que cero.» | Un renglón quedó en cero | Escribe las toneladas, o quita el renglón |
| «Escribe por qué se anula el parte.» | El motivo quedó vacío o con menos de cuatro letras | Escribe qué pasó con ese parte |
| «El parte PRO-2026-0012 ya estaba anulado.» | Ese parte ya se anuló | Recarga la pantalla: la anulación ya está hecha |
| «De "GRANZON" ya no quedan las 120 que metió este parte: se despacharon. Corrige con un ajuste de inventario, que deja constancia de la diferencia.» | El material del parte ya salió del patio y no se puede devolver | Haz un conteo físico en Existencias y explica la diferencia |
| Un mensaje en inglés al guardar un parte o un frente | Casi siempre es un dato repetido: ese turno ya está cargado para ese frente, o ese código de frente ya existe | Revisa la lista antes de volver a guardar |
| «No hay conexión con el servidor. Revisa la red e inténtalo otra vez.» | Se cayó el internet | Reintenta cuando vuelva la señal. Lo que no se guardó, no quedó |

---

## 7. Inventario

El inventario es el libro de lo que hay. Todo lo que entra y todo lo que sale del patio, del almacén, del taller y del surtidor queda escrito en una sola lista, en orden, con la fecha, la hora, la cantidad y el nombre de quien lo registró.

Hay una idea que conviene entender antes de tocar nada, porque explica casi todo lo demás:

**La existencia no es un número guardado. Es una suma.** El sistema no tiene apuntado en ningún lado que hay 125 toneladas de granzón. Lo que tiene es la lista de movimientos, y cada vez que abres la pantalla los suma. Por eso el número nunca puede quedar desactualizado ni desincronizarse: no existe hasta que se calcula.

De ahí se desprende la consecuencia práctica: **para cambiar una existencia hay que escribir un movimiento**. No hay otra forma. No se puede corregir el número directamente, ni siquiera siendo administrador.

### 7.1 Quién entra y quién puede registrar

Hay dos puertas distintas, y conviene no confundirlas.

La primera es **ver el módulo**. Depende del permiso sobre Inventario que administración le haya dado a tu usuario. Si no lo tienes, el grupo Inventario no aparece en el menú, y si escribes la dirección a mano verás una tarjeta con un candado: **Inventario no está a tu alcance**.

La segunda es **poder registrar**. Los botones que escriben algo solo se dibujan para el rol de **Almacén** y para administración. Son estos:

| Dónde | Botones |
| --- | --- |
| Cabecera de **Existencias** | **Acta de conteo físico**, **Registrar entrada**, **Registrar salida**, **Mandar al taller** |
| En cada fila | **Contar**, **Sacar**, **Al taller**, **Dar de baja** |
| **Transferencias** | **Nuevo traslado** |
| **Movimientos** | **Deshacer** |

**El botón «Al taller» de la fila no siempre está.** Solo aparece en los artículos marcados como reparables en su ficha: un pote de aceite no se manda a arreglar. Está en 7.8.

**Aquí hay un desajuste que confunde, y conviene saberlo.** Compras y la gerencia general tienen sobre Inventario el permiso más alto —**Control total**— y aun así **no ven ninguno de estos botones**, porque los botones cuelgan del **rol Almacén** y no del nivel de permiso. Si alguien con control total sobre Inventario te dice que no puede registrar, no es un error: es esto.

**Las dos columnas no dicen lo mismo, y ahí está la trampa.** La primera sale de la matriz de permisos; la segunda, del rol.

| Rol | Permiso sobre Inventario | ¿Ve los botones? |
| --- | --- | --- |
| Administrador | Control total | **Sí** |
| Almacén | Escritura | **Sí** |
| Compras | Control total | **No** |
| Gerencia general | Control total | **No** |
| Recursos humanos | Escritura | **No** |
| Operaciones, Ventas, Solicitante, Consulta | Lectura | No |
| Respaldo | Ninguno | — |

**Inventario es el módulo más repartido del sistema**: nueve de los diez roles lo ven. Tiene sentido — casi todo el mundo necesita saber qué hay en el patio aunque no toque nada.

Si ves las pantallas pero no ves ningún botón de acción, no es una falla: tu rol es de consulta.

### 7.2 Dos cosas que pasan en todas las pantallas

**Lo que escribes se convierte solo a mayúsculas y se le quitan las tildes.** Ocurre mientras tecleas, en los nombres y en las notas. La eñe se conserva. No es un capricho: unifica la forma de escribir para que buscar «CAMIÓN» y «camion» encuentre lo mismo.

**Lo que registra otra persona aparece sin recargar la pantalla.** Si el operador carga el parte de turno desde el patio mientras tú miras las existencias en la oficina, la piedra aparece sola.

### 7.3 El tablero

**Operación › Inventario › Tablero**

Es la primera de las **cuatro** entradas del grupo —**Tablero**, **Existencias**, **Transferencias** y **Almacenes y talleres**— y la pantalla por la que se empieza. Las demás pantallas del módulo se reparten en pestañas dentro de esas cuatro; está en 3.1. No se registra nada aquí: se lee cómo está el patio y se sale hacia donde toca. Su descripción lo resume: **Cómo está el patio ahora mismo, y por dónde entra y sale el material.**

Arriba hay cuatro tarjetas:

| Rótulo | Qué mide | La línea de abajo |
| --- | --- | --- |
| **Artículos con existencia** | Cuántos artículos tienen algo, no cuántos hay en el catálogo | **de 28 en el catálogo** |
| **Valor del inventario** | Lo que vale todo lo que hay | **A costo promedio, no a precio de venta** |
| **Bajo el mínimo** | Cuántos artículos están por debajo de su mínimo | **Nada por reponer**, o **Conviene pedirlos antes de que falten** |
| **Movimientos de hoy** | Cuántas líneas se escribieron hoy en el libro | **Entradas, salidas y traslados** |

**Bajo el mínimo es la única tarjeta que se enciende**, con un filo ámbar arriba y el triángulo de aviso, y solo cuando hay algo que atender. Lo demás informa; esta reclama. Un artículo sin mínimo puesto no cuenta: no está bajo mínimo, está sin configurar.

Debajo, los atajos. **Ya no se agrupan por lo que le pasa al material sino por el orden en que hacen falta**, que es lo que sirve a quien está montando el almacén y a quien ya lo tiene andando:

| Bloque | Atajos |
| --- | --- |
| **Poner el almacén en marcha** | Va numerado, 1 a 3: **Cargar el catálogo**, **Abrir los almacenes**, **Cargar el saldo inicial** |
| **El día a día** | **Llegó una compra**, **Sacar o dar de baja material**, **Trasladar a otro almacén** |
| **Revisar y cuadrar** | **Contar el almacén**; **Reponer lo que falta (3)** cuando hay artículos en el mínimo, o **Ver lo que está por debajo del mínimo** cuando no; y **Ver qué le pasó a un artículo** |

**Los atajos que escriben solo se dibujan con permiso de escritura.** Enseñar una acción que va a rebotar contra un permiso es peor que no enseñarla: manda a alguien a intentarlo para que el sistema le diga que no.

**Y ya no hay ningún atajo que lleve al cartel de obra.** Los había —*Salió producción del turno* iba a Explotación y *Se despachó a un cliente* a Ventas— y se quitaron a propósito: un mapa que enseña calles cortadas hace perder el viaje. El día que esos módulos vuelvan al menú, los atajos vuelven con ellos.

Al pie, para quien entra por primera vez, queda esta explicación: *"El inventario no se escribe a mano: se mueve solo cuando pasa algo. Entra al recibir una compra o al cargar el parte de turno; sale al despachar a un cliente o al consumir en el frente. Las existencias son la suma de todo eso. Por eso no hay un botón de «cargar existencias»: si un número no cuadra, se corrige con un ajuste, que queda anotado con su motivo."*

### 7.4 Existencias

**Operación › Inventario › Existencias**

Cuánto hay ahora mismo de cada cosa, dónde está y cuánto vale. Desde aquí se saca material, se cuenta y se carga lo que entra sin una compra de por medio.

**Primero todo, después dónde.** Esta pantalla abre con **el total de la empresa**: una fila por artículo, con lo que hay sumando todos los sitios. Antes abría con una fila por almacén y artículo, y el mismo saco de cemento aparecía cuatro veces sin que en ninguna dijera cuántos hay en total. Con un solo almacén no se notaba; con patio, almacenes y varios talleres, la primera pregunta —cuánto tiene la empresa— se quedaba sin respuesta.

De ahí se baja: se abre el desglose de un artículo, se ve en qué sitios está, y en cada uno se saca o se cuenta.

#### Qué se ve

Arriba, si hay artículos en el mínimo o por debajo, aparece una franja ámbar: **3 artículos en el mínimo o por debajo**, seguida de **Conviene pedirlos antes de que hagan falta.** y el enlace **Ver solo esos**, que se convierte en **Ver todo** al pulsarlo. Solo se controlan los artículos que tengan una existencia mínima distinta de cero.

Debajo hay dos filtros: **Buscar**, que acepta el nombre o el código del artículo, y **Dónde**, que empieza en **Todo el inventario**. Los talleres se distinguen en la lista con un **· taller** detrás del nombre.

Sobre la lista, a la izquierda va cuántos artículos se están viendo y a la derecha el **Valor del inventario**. Cuidado con este número: **suma solo las filas que se están viendo**. Si filtraste por un sitio, es el valor de ese sitio, no el de la cantera.

La lista tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Artículo** | Nombre y, debajo, el código |
| **Existencia** | Cantidad y unidad. En ámbar, con la etiqueta **Mínimo**, si está bajo |
| **Almacén** | El sitio. Viendo el total se llama **Repartido en** y dice **3 sitios** |
| **Costo prom.** | Lo que cuesta en promedio cada unidad, en dólares |
| **Valor** | Existencia por costo promedio |

Debajo de la cantidad pueden salir dos líneas más, y solo cuando hace falta:

- **10 disponibles · 4 en manos de alguien**, si hay unidades entregadas a alguna persona. Es la distinción del apartado 7.12: existir no es estar disponible.
- **≈ 45 M3**, la otra medida, en los materiales a los que se les cargó la densidad. Sin ese dato no se supone nada: se calla.

**Las acciones cuelgan de un sitio, no del total.** Viendo el total, el único botón de la fila es **Ver dónde está**, que abre el desglose: cada sitio con su cantidad y su costo por unidad, y ahí sí los botones de **Sacar** y **Contar**. Sacar material del «inventario general» no significa nada: el material sale de un sitio concreto y de ahí se descuenta.

En el desglose, **los sitios con existencia cero se muestran igual, apagados**. Saber que un taller tuvo el repuesto y se le acabó es distinto de no verlo listado, que se lee como que nunca lo manejó.

#### Registrar entrada

Arriba a la derecha, para el rol de Almacén, está el botón **Registrar entrada**. Es para **lo que entra sin una compra de por medio**: el saldo con el que arranca un almacén, algo comprado por fuera, material que trae alguien.

**Este botón sustituyó al de Cargar producción**, que llevaba a Explotación. Se cambió por dos razones: la primera, que Explotación hoy está detrás del cartel de obra y el botón principal de la pantalla mandaba a una puerta cerrada; la segunda, y más de fondo, que **Inventario tiene que valerse solo**. Sin esta entrada, la única forma de meter mercancía con su costo era una orden de compra, y un almacén que arranca no tiene ninguna todavía.

**Entran varios artículos de una vez.** El almacén se elige una sola vez y debajo van **Renglón 1**, **Renglón 2**… con el botón **Añadir otro artículo** y un enlace **Quitar** en cada uno. Cargar el saldo inicial de un almacén con veinte artículos es una ventana, no veinte.

1. Pulsa **Registrar entrada**.
2. Elige **A qué almacén entra**.
3. En cada renglón: **Qué entra** —del catálogo entero, no de lo que ya tiene existencia—, **Cantidad**, **Costo por unidad** y **Moneda**.
4. Si viene al caso, llena la **Referencia**: *quién lo trajo, o el número de una factura de fuera*.
5. Escribe **De dónde vino**, que son mínimo cuatro letras.
6. Pulsa **Registrar**.

**El costo se escribe en la moneda en que se pagó, y el sistema convierte.** Si el material se pagó en bolívares, se pone en bolívares: la conversión a dólares la hace el sistema con la tasa del día, y no hay que echar la cuenta a mano. Es lo que evita el error de escribir un precio en bolívares en un campo que decía dólares.

**El costo es obligatorio y es lo que distingue una entrada de un ajuste.** Sin él el almacén quedaría lleno y valorado en nada, que es exactamente el problema que arrastra la producción de cantera. Si el campo está vacío, la ayuda lo dice: **Sin costo no se puede valorar lo que hay.**

#### Sacar material

Es la salida de siempre: material que se entrega a un mecánico, gasoil que se carga a una máquina, un repuesto que se instala.

**Hay dos puertas, y sirven para dos maneras de pensar.** La de la fila es para cuando sabes qué artículo vas a sacar; la de la cabecera, **Registrar salida**, es para cuando lo que tienes es una lista —«necesito estas cinco cosas»— y no quieres buscar cinco filas y sacar cinco veces.

1. Busca la fila del artículo y del almacén correcto.
2. Pulsa **Sacar**.
3. Escribe la **Cantidad que sale**.
4. Elige **¿Por qué sale?** Son ocho motivos y salen de un catálogo, no de una lista escrita en la pantalla: **Se usó trabajando**, **Se perdió en el manejo**, **Quedó obsoleto**, **Se dañó**, **Se venció**, **No aparece**, **Se lo llevaron** y **Otro**. Cada uno trae su pista debajo.
5. Escribe **Para qué sale**. Son mínimo cuatro letras y el sistema no las deja en blanco.
6. Pulsa **Registrar**.

**El motivo se elige además de escribirlo, y no en vez de.** El desplegable es para poder contar después —cuánto se perdió en el manejo este trimestre— y el texto es para saber qué pasó en ese caso concreto. Uno sin el otro no sirve.

La salida queda **con la fecha de hoy**. Esta pantalla no permite elegir otra fecha, así que si el material salió el sábado y lo tecleas el lunes, el libro dirá lunes. Cuando eso pase, escríbelo en el motivo.

El material sale valorado **al costo promedio que tenga el almacén en ese momento**, no al precio al que se compró aquel lote en particular.

#### Dar de baja

**No es lo mismo que sacar.** Sacar es material que se usó; dar de baja es material que **dejó de servir**. La diferencia importa porque una baja destruye valor en libros y hay que poder justificarla.

Tiene su propio botón en cada fila. Pregunta tres cosas:

1. La **Cantidad** que se da de baja.
2. **¿Por qué?**, entre cinco causas: **Dañado sin reparación** *(se rompió y no compensa arreglarlo)*, **Obsoleto** *(funciona, pero ya no sirve para lo que se hace hoy)*, **Vencido** *(caducó: químicos, filtros con vida útil, consumibles)*, **Extraviado** *(no aparece y nadie sabe dónde está)* y **Robado** *(falta, y hay motivos para creer que se lo llevaron)*.
3. **¿Y qué se hizo con eso?**, que es opcional: *"Se desechó, se vendió como chatarra, se guardó para repuestos — para que nadie lo salga a buscar después."*

**Pide más explicación que una salida normal: diez caracteres frente a cuatro.** Es deliberado. Dentro de un año, esa frase es lo único que va a justificar por qué el almacén vale menos.

#### Mandar al taller

**Mandar algo al taller no es sacarlo, porque vuelve.** Por eso tiene su propia operación y no se registra como una salida.

Hay dos puertas: **Mandar al taller** en la cabecera, y **Al taller** en la fila. **El de la fila solo aparece en los artículos marcados como reparables** en su ficha; un pote de aceite no se manda a arreglar. Ese marbete está en 7.8.

La ventana **Mandar material al taller** pide: **Qué se manda**, **De dónde sale**, **A qué taller**, **Cuánto mandas**, **Qué le pasa** —*"Lo que se sabe ahora. Qué se le hizo se anota al cerrarla."*—, la **Urgencia**, **Qué hace falta**, **Sale el** y los **Días estimados**.

**El taller puede rechazar el trabajo por su oficio.** La ayuda lo advierte: *"Si el taller declaró sus oficios y este no está, no lo acepta."* Los oficios de cada taller se editan en 7.5.

**La vuelta se registra desde Talleres**, no desde aquí: es allí donde se ve lo que está dentro.

#### Contar (conteo físico)

Contar no es corregir el sistema a mano. Es declarar lo que se contó y dejar que el sistema calcule y registre la diferencia.

1. Pulsa **Contar** en la fila del artículo.
2. En **Cantidad contada** verás precargada la existencia que dice el sistema. **Bórrala y escribe lo que contaste de verdad.** Este es el error más común de la pantalla: si pulsas **Registrar** sin tocar el número, el sistema responde «Lo contado coincide con lo que dice el sistema (125). No hay nada que ajustar.»
3. Debajo aparece la cuenta hecha: **Diferencia: −15 TON**.
4. Escribe **Qué explica la diferencia**.
5. Pulsa **Registrar**.

El sistema escribe un movimiento de ajuste **por la diferencia**, nunca por el total contado, y lo valora al costo promedio. Un faltante, por lo tanto, también baja el valor del inventario.

La nota queda compuesta sola, con las tres cosas juntas: «Conteo físico: 110 contra 125 en sistema. SE MOJÓ EL LOTE DEL FONDO».

Se cuenta **un artículo y un almacén a la vez**. No hay una pantalla de toma de inventario general.

#### La producción entra valorada en cero

Esto no es de esta pantalla, pero se ve aquí y desconcierta: **el material que produce la cantera entra al inventario sin valor.** No es un olvido. Lo que cuesta producir una tonelada sale de la nómina, el gasoil y la voladura, y ese cálculo todavía no lo hace el sistema. Poner un número inventado valoraría el patio con una cifra que nadie calculó.

Consecuencia que hay que tener presente al mirar esta pantalla: la producción sube las toneladas del patio pero no sube el **Valor del inventario**, y arrastra el **Costo prom.** hacia abajo. Mientras el costeo no esté construido, el valor en dólares del material producido no es una cifra en la que apoyarse; las toneladas sí.

### 7.5 Talleres

**Operación › Inventario › Almacenes y talleres › Talleres**

**No es una entrada del menú**: es la segunda pestaña de **Almacenes y talleres**, junto a **Almacenes y patios**.

Un taller es un almacén más —los de tipo **Taller**—, pero se mira con otra pregunta. Las existencias responden *cuánto hay*; esta pantalla responde *qué tiene asignado cada taller y en qué lo está gastando*. Su descripción lo dice: **Qué tiene asignado cada taller y en qué lo está gastando. El detalle artículo por artículo vive en Existencias.**

Hay una tarjeta por taller, con su nombre, su código y la etiqueta **Cerrado** si está inactivo.

**Arriba van los oficios**: unas etiquetas con lo que ahí se hace —soldadura, hidráulica, motores— o, si no se declaró ninguno, **Acepta cualquier trabajo**. El botón **Oficios** los edita. **No es decoración: al mandar algo al taller el sistema comprueba contra esa lista**, y si el trabajo no está entre sus oficios no lo acepta. Un taller sin oficios declarados acepta todo, que es lo razonable mientras nadie los haya escrito.

Dentro, tres bloques:

- **Material asignado**: cuántos artículos tiene y cuánto valen, con la etiqueta ámbar **2 bajo mínimo** si la hay. Si el taller no ha recibido nada, no se inventa un cero con aire de dato: dice **Todavía no ha recibido material. Llega por transferencia desde otro almacén o por una compra recibida aquí.**
- **En el taller ahora**: las órdenes abiertas, con su urgencia, de dónde salió el material y cuántos días lleva dentro contra los que se estimaron. Es el bloque que se mira todos los días: lo que lleva más días de los previstos es lo que hay que ir a preguntar.
- **Máquinas asignadas**: las que tienen ese taller como sede, cada una con su código y su semáforo de mantenimiento. Si alguna está en alarma, el rótulo añade en rojo **· 2 necesitan atención**. Si no hay ninguna, **Ninguna máquina tiene este taller como sede.** Es lo que convierte a un taller en algo distinto de un depósito.

Al pie, dos botones: **Ver su inventario**, que lleva a **Existencias** con ese taller ya elegido en el filtro **Dónde**, y el de las reparaciones que ha atendido. Por eso Talleres está pegada a Existencias en el menú: se ve el total, se ve dónde está, y aquí qué pasa en cada taller.

Si no hay ninguno, la pantalla lo explica: **Un taller se crea como almacén, eligiendo el tipo Taller. A partir de ahí recibe material, guarda lo suyo y las reparaciones se le pueden atribuir.**, con el botón **Ir a almacenes**.

### 7.6 Movimientos

**Operación › Inventario › Existencias › Movimientos**

**No es una entrada del menú**: es la tercera pestaña de la cabecera de **Existencias** —**Existencias · Catálogo · Movimientos**—.

Es el libro. Aquí no se registra nada nuevo: se consulta lo que pasó y, si algo se registró mal, se corrige escribiendo el movimiento contrario.

Cada línea muestra el número del movimiento — **MOV-2026-0001**, que se reinicia cada año —, el tipo, la fecha y hora, quién lo registró y, entre comillas angulares, la nota que se escribió.

La cantidad va **en verde con un más** si entró material y **en rojo con un menos** si salió.

**La pantalla muestra los 200 movimientos más recientes.** No hay paginación ni botón de ver más. Es una limitación real: en un patio con mucho tránsito, un movimiento de hace unas semanas deja de aparecer aquí aunque siga en el libro — y para eso están los filtros.

**Hay dos filtros: el almacén y un rango de fechas.** Conviene saber cómo filtra el segundo, porque no es obvio: **el rango se aplica sobre la fecha del movimiento** —el día en que pasó— **y no sobre el momento en que alguien lo escribió**, que es lo que sigue mandando en el orden de la lista. Si el material salió el sábado y se tecleó el lunes, el filtro lo encuentra en el sábado y la lista lo enseña en el sitio del lunes.

En la cabecera hay además **Imprimir el libro**, que saca en PDF exactamente lo que se está viendo, con los filtros puestos.

En las salidas, cada línea lleva un botón **Nota**, que saca la nota de salida en papel. Solo en las salidas: de una entrada no hay nada que entregarle a nadie.

#### Deshacer un movimiento

**El botón se llama Deshacer**, no «Reversar». Por dentro la operación sigue llamándose reverso —es lo que se lee en la nota que deja—, pero en la pantalla no aparece esa palabra.

1. Busca la línea equivocada.
2. Pulsa **Deshacer**.
3. Escribe por qué.
4. Confirma con **Deshacer** en el botón rojo.

El movimiento original **se queda en el libro**. Lo que se escribe es uno nuevo, del mismo tamaño y en sentido contrario, con la nota «Reverso de MOV-2026-0007» seguida de tu explicación. Después se registra el movimiento correcto.

Tres reglas que conviene saber de antemano:

- **Un movimiento deshecho no se vuelve a deshacer.** Si te equivocaste al deshacer, registra el movimiento que corresponda.
- **Un movimiento solo se deshace una vez.**
- **No se puede deshacer si el material ya no está.** Si deshacer una entrada obligaría a sacar material que ya se consumió, el sistema lo impide y lo dice con nombre y cantidad. En ese caso el camino es un conteo físico.

### 7.7 Transferencias

**Operación › Inventario › Transferencias**

Mover material de un sitio a otro. El total de la cantera no cambia: baja en un almacén y sube en el otro, por la misma cantidad y **al mismo costo**. Trasladar no cambia lo que vale el material.

#### Hacer un traslado

1. Pulsa **Nuevo traslado**.
2. Elige **Sale de**.
3. Elige **Entra en**. El almacén de origen desaparece de esta lista.
4. Elige el **Artículo**.
5. Escribe la **Cantidad**. Debajo verás **Disponible: 125**, y si te pasas, **Solo hay 125.** en rojo.
6. Escribe **Por qué se mueve**.
7. Pulsa **Trasladar**.

Un traslado escribe **dos movimientos hermanos**: la salida del origen y la entrada en el destino. Por eso en la lista aparece una sola línea con la columna **Recorrido**, pero en el libro hay dos.

El traslado queda con la fecha de hoy. No se puede fechar hacia atrás.

#### Deshacer un traslado

Pulsa **Deshacer**, escribe **Por qué se deshace** y confirma. Un traslado son dos movimientos —la salida de un almacén y la entrada en el otro— y se deshacen los dos a la vez. El material vuelve donde estaba.

El sistema comprueba las dos antes de escribir ninguna. **O se deshacen las dos, o no se deshace ninguna**, nunca se queda a medias. Si el material ya salió del destino, no deja deshacerlo y lo explica.

### 7.8 Catálogo de artículos

**Operación › Inventario › Existencias › Catálogo**

**No es una entrada del menú**: es la segunda pestaña de la cabecera de **Existencias**.

La lista de todo lo que la empresa pide, compra y cuenta. Un artículo mal definido se convierte más adelante en existencias que no cuadran, así que vale la pena crearlo con calma. La propia pantalla lo dice: **Lo que se pide, se compra y se cuenta. Un artículo mal definido se convierte en existencias que no cuadran.**

Se filtra por **Buscar** y por **Categoría**, que empieza en **Todas**. La lista muestra activos e inactivos, con estas columnas: **Código**, **Artículo**, **Categoría**, **Unidad**, **Al entregarlo**, **Mínimo** y **Estado**.

**Pulsar la fila abre la ficha del artículo**, que es donde está su historia. Está en 7.9. Los dos botones del final del renglón —el lápiz y la papelera— no abren la ficha; la etiqueta de **Estado**, en cambio, sí abre la ficha además de cambiar el estado.

#### Crear un artículo

Pulsa **Nuevo artículo** y llena la ficha:

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Código** | Sí | No se puede repetir y **no se cambia después** |
| **Nombre** | Sí | Sin él no se habilita **Guardar** |
| **Categoría** | Sí | Empieza en **Repuesto**. Las nueve son: **Producto de cantera**, **Repuesto**, **Insumo**, **Combustible**, **Lubricante**, **Equipo de protección**, **Herramienta**, **Explosivo** y **Servicio** |
| **Unidad** | Sí | Empieza en **Unidad**. Los productos de cantera van en tonelada |
| **Existencia mínima** | No | **Cero significa que no se controla.** |
| **Al entregarlo a una persona** | — | Las tres opciones están abajo. La categoría propone una y se puede cambiar |
| **Descripción** | No | |
| **Entra al inventario** | — | Viene marcada. Se apaga sola si la categoría es **Servicio**, y al lado aparece **(un servicio no se almacena)** |
| **Se puede mandar al taller** | — | **(vuelve arreglado)** o **(se gasta, no se repara)**. Viene marcada sola en las herramientas y los repuestos, y se puede corregir. Se apaga si el artículo no entra al inventario |

**La casilla de taller decide si el artículo ofrece el botón «Al taller» en Existencias** (7.4). Marcarla en un pote de aceite llenaría de ruido el desplegable de lo que se manda a reparar; no marcarla en una herramienta la deja sin poder mandarse.

#### Qué pasa al entregarlo

Es el campo que se añadió después y el que evita un error caro. Lo que faltaba era que el formulario no decía si un artículo se le puede entregar a alguien, y por eso Asignaciones ofrecía gasolina «hasta que la devuelva». Entregar un destornillador y entregar gasolina no son la misma operación.

| Opción | Qué significa |
| --- | --- |
| **Se presta y vuelve** | **Queda a nombre de quien lo recibe y se le pide de vuelta. Aparece en Asignaciones.** |
| **Se entrega y no vuelve** | **Se gasta al usarlo. Sale por su propio camino —combustible, dotación, movimiento de almacén— y no como préstamo.** |
| **No se le entrega a una persona** | **Lo que se vende o se contrata. Nadie se lo lleva.** |

**La categoría propone el modo que acierta más veces** —una herramienta o un equipo de protección vuelven, un repuesto se instala, un producto o un servicio no se le entregan a nadie— y se puede cambiar en el mismo formulario. Si ya se eligió a mano, cambiar la categoría **no** lo pisa: sería deshacer una decisión de quien está mirando.

En la lista, esta columna se llama **Al entregarlo** y muestra la etiqueta correspondiente.

#### Corregir y borrar un artículo

**Esto cambió, y para bien.** Hasta la versión anterior de este manual un artículo creado no se podía editar ni borrar, y el único camino era desactivarlo y crear otro. Hoy:

- **Se corrige** con el botón del lápiz. Se abre **Corregir REP-BOMBA** y se puede cambiar todo menos el código, que sale bloqueado con la ayuda **No se cambia.** El motivo está escrito en la ventana: **El código no se cambia: es con lo que se pide en el almacén y ya está impreso en lo emitido.**
- **Se borra** con la papelera, y **solo mientras nada lo haya tocado todavía**. En cuanto el artículo aparece en una orden de compra o en un movimiento de inventario, la base lo impide y el mensaje dice que se desactive. No es una traba: borrar un artículo que ya se movió dejaría el libro señalando a algo que no existe.
- **Se activa y se desactiva** pulsando la etiqueta de la columna **Estado**, que cambia al instante y sin pedir confirmación.

Sigue valiendo el consejo, aunque ya no sea irreversible: **revisa el nombre y la unidad antes de guardar.** Un artículo desactivado deja de aparecer en las listas, pero sus movimientos anteriores siguen en el libro.

### 7.9 La ficha de un artículo

**No está en el menú.** Se llega pulsando la fila del artículo en el **Catálogo de artículos**.

Es donde un artículo cuenta su historia: qué es, cuánto hay y **todo lo que le ha pasado desde que se creó**. Hasta ahora esa historia había que reconstruirla mirando el libro de movimientos y filtrando a ojo; aquí sale sola y en orden.

Arriba van el **código**, el **nombre** y la **descripción**, y a la derecha el botón **Al catálogo** para volver.

#### De un vistazo

Cuatro tarjetas:

| Rótulo | Qué muestra |
| --- | --- |
| **Existencia** | Cuánto hay en total, con su unidad |
| **Categoría** | La categoría, y debajo **Se lleva en el libro** o **No entra al inventario** |
| **Al entregarlo** | **Vuelve** / **Se gasta** / **No se entrega**, y debajo la explicación: **Queda a nombre de quien lo tiene**, **Sale del almacén y no vuelve** o **No es algo que se le dé a una persona** |
| **Mínimo** | El número, o un guion. Debajo, **Avisa al bajar de aquí** o **No se controla** |

Dentro de **Existencia**, y **solo cuando hay unidades en manos de alguien**, aparece una segunda línea: **6 disponible · 4 en manos de alguien**. Si el disponible llega a cero o menos, se pinta en ámbar. Cuando nadie tiene nada prestado esa línea no se dibuja: repetirla siempre enseñaría a no leerla, y entonces no se leería el día que dice cero.

Esta ficha **no muestra precios de venta**. Los precios viven en la lista de precios de Ventas.

#### Su historia

Es la tarjeta grande de abajo, y su subtítulo lo resume: **Todo lo que le ha pasado desde que se creó, de lo más reciente a lo más viejo.**

No es una tabla, es una lista: un renglón por hecho. Cada uno lleva un icono a la izquierda —**flecha verde hacia abajo** si sumó existencia, **flecha roja hacia arriba** si la restó, **círculo** si no la movió—, el nombre de lo que pasó, la cantidad con su unidad, el almacén, y al pie la fecha y la hora, el documento y **lo registró** seguido del nombre de la persona. Cuando el hecho tiene que ver con alguien —una entrega, una devolución, una pérdida— aparece además el nombre de esa persona en una etiqueta gris.

Los hechos que puede contar son estos:

| Lo que se lee | Qué fue |
| --- | --- |
| **Se creó en el catálogo** | El primer renglón de todos. Al lado, su categoría y su unidad |
| **Entró por una compra** | Una recepción de compras |
| **Entró por producción** | Un parte de turno de Explotación |
| **Volvió al almacén** | Material devuelto |
| **Entró sin compra de por medio** | La entrada directa de 7.4: el saldo inicial, algo comprado por fuera |
| **Salió para consumo** | Una salida de las de todos los días |
| **Salió en un despacho** | Una nota de entrega de Ventas |
| **Se perdió en el manejo** | Merma: se rompió, se derramó, se echó a perder moviéndolo |
| **Se dio de baja** | Dejó de servir. La operación de 7.4, con su causa |
| **Ajuste: sobraba** / **Ajuste: faltaba** | Un conteo físico, en cada sentido |
| **Se trasladó a otro almacén** / **Llegó de otro almacén** | Los dos movimientos de un traslado |
| **Se deshizo un movimiento** | Una corrección |
| **Se entregó como dotación** | Se le dio a alguien por su rol |
| **Se asignó para una actividad** | Se le dio a alguien para una faena concreta |
| **La devolvió** | Volvió a manos de la empresa |
| **Se dio por perdida** / **Se reportó dañada** | En ámbar: no mueven existencia, pero cambian quién responde |
| **Se saldó con descuento de nómina** / **La repuso** / **Se le exoneró** | Cómo se cerró una pérdida (18.5) |
| **Se mandó al taller · reparación** | Con el motivo, el oficio y la urgencia detrás |
| **Volvió del taller** | Con lo que se le hizo y, si volvió menos de lo que se mandó, **faltaron 2** |

Si el artículo todavía no ha tenido movimiento, se ve **Sin movimientos todavía**. Si el identificador de la dirección no corresponde a ninguno, **No existe ese artículo.** con el enlace **Volver al catálogo**.

**La ficha de un artículo desactivado se sigue abriendo.** Su historia no desaparece porque se le apague la etiqueta.

### 7.10 Cargar artículos por planilla

**No está en el menú ni en ninguna pestaña.** Se llega por el botón **Cargar por planilla** de la cabecera del **Catálogo de artículos**, y también desde un atajo del Panel.

Para dar de alta muchos artículos de una vez, o corregir los que ya están, sin teclear la ficha uno por uno. Es la pantalla que hace falta el día que se monta el catálogo, y la que sirve después para cambiarle el mínimo o el precio a cincuenta artículos de un golpe.

La idea que ordena toda la pantalla es esta: **primero se ve lo que va a pasar, y solo después se escribe.** Y es todo o nada: **con una sola fila mal, no entra ninguna.**

Son tres pasos, los tres a la vista en la misma página. A la derecha hay un panel de ayuda, **Qué va en cada columna**, con el detalle de cada una y un aviso ámbar **Obligatoria** en las que lo son.

#### 1 · Baja la plantilla

**Trae las columnas en el orden que el sistema espera, dos filas de ejemplo, y una segunda hoja que explica qué va en cada una.**

Pulsa **Descargar plantilla**. Baja un archivo llamado `plantilla-articulos.xlsx`. **Es un Excel de dos hojas**: la que se llena y otra con las instrucciones de cada columna, para no tener que volver al manual mientras se rellena.

Trae dieciséis columnas, en este orden:

| Columna | ¿Hace falta? | Qué va |
| --- | --- | --- |
| `codigo` | **Sí** | **El código con el que se pide. Si ya existe, la fila lo actualiza en vez de crearlo.** |
| `nombre` | **Sí** | **Cómo se llama.** |
| `descripcion` | No | **Detalle. Si se deja vacía en un artículo que ya existe, se respeta la que tenía.** |
| `categoria` | **Sí** | **PRODUCTO, REPUESTO, INSUMO, COMBUSTIBLE, LUBRICANTE, EPP, HERRAMIENTA, EXPLOSIVO o SERVICIO.** |
| `unidad` | **Sí** | **UND, M3, TON, KG, L, GAL, M, PAR, JGO, CAJA, SACO, ROLLO, HORA o SERV.** |
| `inventariable` | No | **SI o NO. En uno nuevo, vacío es SI; en uno que ya existe, vacío respeta lo que tenía. Un SERVICIO tiene que ser NO.** |
| `modo_entrega` | No | **Qué pasa al entregarlo: RETORNABLE vuelve, CONSUMIBLE se gasta, NO es que no se entrega a nadie. En uno nuevo, vacío es CONSUMIBLE; en uno que ya existe, vacío respeta lo que tenía.** |
| `reparable` | No | **SI o NO: si esto se puede mandar al taller y vuelve arreglado. Vacío se deduce de la categoría — un repuesto o una herramienta sí, lo demás no.** |
| `stock_minimo` | No | **A partir de cuánto avisa. En uno nuevo, vacío es cero —que es no avisar—; en uno que ya existe, vacío respeta lo que tenía.** |
| `densidad_ton_m3` | No | **Toneladas por metro cúbico. Solo para lo que se pesa y se mide de las dos formas.** |
| `precio` | No | **Precio de venta. Poner precio exige permiso de escritura en Ventas.** |
| `precio_minimo` | No | **Lo más bajo que se puede vender. Vacío es cero: sin suelo.** |
| `moneda` | No | **La moneda del precio y del costo. Vacío es USD.** |
| `almacen` | No | **Dónde está lo que hay. Se escribe el código o el nombre, como se lee en la pantalla de almacenes. Va con cantidad y costo: las tres o ninguna.** |
| `cantidad` | No | **Cuánto hay de esto en ese almacén. Entra como carga inicial, con su movimiento y su fecha.** |
| `costo` | No | **Cuánto vale la unidad de lo que entra. NO es el precio de venta: de este número salen el valor del inventario y lo que costará cada salida futura.** |

**Las tres últimas van juntas o no va ninguna**, y son las que convierten la planilla en una forma de arrancar un almacén entero: cargan el catálogo y su existencia inicial de una vez, cada una con su movimiento y su fecha.

**No confundas `costo` con `precio`.** El precio es a cuánto se vende; el costo es cuánto vale lo que entra. De este último salen el valor del inventario y lo que costará cada salida futura.

Las dos filas de ejemplo se borran y se escribe encima. **Los títulos de las columnas se pueden escribir como se quiera**: «Stock mínimo», «stock_minimo» y «STOCK MINIMO» valen lo mismo. Y las columnas de más que traiga la planilla se ignoran.

#### 2 · Súbela llena

**Se revisa al instante y se te dice qué va a pasar con cada fila, antes de tocar nada.**

Pulsa **Elegir archivo**. Acepta **CSV** y **Excel (.xlsx)**; del Excel lee **solo la primera hoja**. **No hay botón de revisar**: en cuanto se elige el archivo la revisión arranca sola y aparece el paso 3.

Si el archivo no se puede leer, el aviso sale en rojo debajo del botón. Los más frecuentes:

| Lo que ves | Qué hacer |
| --- | --- |
| «La planilla no trae ninguna fila con datos.» | Llénala antes de subirla |
| «La planilla no tiene una columna «codigo». ¿Seguro que es la plantilla del sistema?» | Estás subiendo otro archivo. Baja la plantilla y trabaja sobre ella |
| «El formato .xls es de Excel 97 y no se puede leer. Ábrelo y guárdalo como .xlsx o como CSV.» | Guárdalo otra vez con **Guardar como** |
| «Este navegador no sabe abrir archivos .xlsx. Guarda la planilla como CSV y vuelve a subirla.» | Guárdala como CSV |
| «No se pudo leer el archivo. Comprueba que sea la plantilla en CSV o en Excel.» | Cualquier otro problema del archivo |

#### 3 · Esto es lo que va a pasar

Aquí está lo importante de la pantalla. **Nada se ha escrito todavía**, y eso es lo que dice el subtítulo mientras no haya errores.

Arriba, cuatro etiquetas de resumen: **12 se crean** en verde, **3 se actualizan** en azul, **2 con problemas** en rojo —solo si las hay— y **17 filas en total** en gris.

Debajo, la lista fila por fila. **Las filas con problema se ponen arriba del todo** y con el fondo teñido de rojo. Cada renglón lleva **Fila 7**, una etiqueta de estado, el código, el nombre y, si algo va mal, el motivo en rojo al final.

| Etiqueta | Qué significa |
| --- | --- |
| **Se crea** *(verde)* | Ese código no existe todavía en el catálogo |
| **Se actualiza** *(azul)* | Ese código ya está, y la fila lo corrige |
| **No entra** *(rojo)* | Esa fila tiene un problema |

Al pie, el botón. Si todo está bien dice **Cargar 15 artículos** y escribe. **Si hay una sola fila mal, el botón se apaga y dice No se puede cargar todavía**, y el subtítulo lo explica: **Con una sola fila mal no entra ninguna. Corrige la planilla y vuelve a subirla.**

Los motivos de rechazo son estos, y se leen tal cual:

- **Falta el código.** · **Falta el nombre.** · **Falta la categoría.** · **Falta la unidad.**
- **El código REP-BOMBA se repite en la planilla.**
- **«REPUEST» no es una categoría del sistema.**
- **«X» no dice qué pasa al entregarlo: NO, RETORNABLE o CONSUMIBLE.**
- **La unidad «UNI» no existe.**, seguido de la lista completa de las que hay.
- **Hay un número que no se entiende. Se escriben sin separador de miles y con punto decimal.**
- **La columna «inventariable» se responde SI o NO.**
- **El mínimo no puede ser negativo.** · **La densidad, si se pone, es mayor que cero.**
- **Un servicio no se guarda en el almacén: «inventariable» tiene que ser NO.**
- **El precio tiene que ser mayor que cero.** · **Hay precio mínimo sin precio.** · **El precio mínimo no puede pasar del precio.**
- **La moneda «GBP» no está activa en el sistema.**

Cuando la carga entra, la pantalla se limpia sola y aparece **Cargado.** con el detalle —**12 nuevos y 3 actualizados.**— y el enlace **Al catálogo**. **El detalle ya no nombra qué se cargó**: el formulario es el mismo para artículos, personal y proveedores, así que dice cuántos y no de qué.

#### Cuatro cosas que conviene saber de antemano

- **Lo que ves en la previsualización es exactamente lo que va a pasar.** No lo calcula el navegador por su cuenta: es la misma comprobación que hará la base, hecha en modo mirar. Si dice «se actualiza», se actualiza.
- **El código manda, y subir dos veces no duplica.** Si el código ya existe, la fila lo corrige; si no, lo crea. La misma planilla sirve para dar de alta y para corregir.
- **Lo que se deja en blanco sobre un artículo que ya existe se respeta.** Una descripción vacía no borra la que tenía. No hace falta volver a escribirlo todo para cambiar un mínimo.
- **Si alguna fila trae precio, hace falta además permiso de escritura sobre Ventas.** Cargar el catálogo es cosa de inventario; ponerle precio a lo que se vende, no. Sin ese permiso la respuesta es «Tu usuario no tiene permiso para esta acción.»

### 7.11 Almacenes y patios

**Operación › Inventario › Almacenes y talleres**

En el menú se llama **Almacenes y talleres**; dentro, la primera pestaña se llama **Almacenes y patios** y la segunda **Talleres** (7.5).

Dónde se guarda cada cosa. Las existencias se llevan por almacén, no en un montón único, y por eso hace falta al menos uno para poder recibir material.

Para **editar** un almacén se pulsa **en cualquier parte de su fila**. No hay botón de editar y nada en la pantalla lo indica.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Código** | Sí | No se puede repetir |
| **Nombre** | Sí | |
| **Tipo** | Sí | Almacén, Patio de material, Taller, Combustible o En tránsito |
| **Ubicación** | No | |
| **Capacidad del tanque** | Según el tipo | Solo si el tipo es **Combustible**. En litros. Con ella el saldo deja de leerse «720 L» y pasa a **720 de 5.000** |
| **Trabajos a la vez** | Según el tipo | Solo si el tipo es **Taller**. Sin él, el taller no sabe decir si le queda sitio |
| **Es el almacén propuesto al recibir una compra** | — | |
| **Activo** | — | Viene marcada |

Un almacén **no se borra**: se desmarca **Activo** y deja de aparecer en las listas.

Dos avisos sobre la casilla del almacén propuesto: el sistema **no impide marcarla en varios almacenes a la vez**, y si eso pasa, cuál se propone al recibir una compra deja de ser previsible. Márcala en uno solo.

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
| Recepción de una compra *(desde Compras)* | Salida a consumo |
| Parte de turno *(desde Explotación)* | Despacho de una venta *(desde Ventas)* |
| Entrada de un traslado | Salida de un traslado |
| Ajuste por conteo, cuando sobra | Ajuste por conteo, cuando falta |
| Reverso de una salida | Reverso de una entrada, incluida la anulación de un parte de turno |

Lo que nunca ocurre es que una cantidad cambie sin que quede una línea en el libro con su número, su fecha, su hora, su responsable y su motivo.

#### Nunca se queda en negativo

El sistema no permite que una existencia baje de cero, y lo comprueba en los cinco sitios donde podría pasar: al sacar, al trasladar, al deshacer un movimiento, al despachar una venta y al anular un parte de turno.

El motivo es simple: una existencia negativa no es un dato, es un error que alguien va a tener que deshacer más adelante, cuando ya nadie recuerde de dónde salió.

**Qué hacer cuando salta.** Si en el patio sí está el material pero el sistema dice que no, lo que falta es una entrada. Carga el parte de turno que quedó pendiente, o haz el conteo físico, y después repite la salida.

#### Existir no es estar disponible

Diez cascos en el libro pueden ser diez cascos en diez cabezas.

**Lo que está en manos de una persona sigue contando como existencia** —es de la empresa y vale— **pero no se puede volver a entregar.** Por eso el sistema lleva dos números y los distingue: la **existencia**, que es lo que hay, y lo **disponible**, que es lo que queda sin entregar.

Se ve en tres sitios: en **Existencias**, en la **ficha del artículo** y en la pantalla de Asignaciones. Y **solo cuando difieren**: si nadie tiene nada prestado, la línea no se dibuja. Repetir «10 · 10 disponibles» en cada renglón enseñaría a no leerlo, y entonces no se leería el día que dice cero.

**El sistema no deja entregar más de lo disponible**, y lo dice con nombre y cantidad: «Solo quedan 2 de "LLAVE STILSON" sin asignar.» Con lo que se gasta —guantes, mascarillas— el aviso es el de siempre, el de la existencia: «De "GUANTES DE CUERO" solo hay 4 en existencia y se intentan entregar 6.»

**Entregar no descuenta del almacén** cuando el artículo es de los que vuelven: el bien sigue siendo de la empresa y sigue valorado en el inventario. Lo que baja es cuántos quedan por entregar. Cuando la persona lo devuelve, o se da por perdido, el disponible vuelve a subir solo.

Cuál de los dos comportamientos tiene cada artículo lo dice su campo **Al entregarlo a una persona**, en el catálogo (7.8).

#### Los caminos que el libro conoce

Además de los que van en la tabla de arriba, el libro registra cuatro movimientos más que conviene reconocer al leerlo:

| Camino | Cuándo |
| --- | --- |
| **Entrada directa** | El botón **Registrar entrada** de 7.4: el saldo inicial, algo comprado por fuera |
| **Devolución** | Material que vuelve al almacén |
| **Merma** | Se perdió en el manejo: se rompió, se derramó, se echó a perder moviéndolo |
| **Baja** | Dejó de servir, con su causa (7.4). **No es lo mismo que la merma** y por eso son dos tipos distintos |

A eso se suma la salida que escribe **Asignaciones** cuando se reporta perdido o dañado un bien que estaba en manos de alguien (18.5).

#### Toneladas y metros cúbicos

Cada artículo tiene **una sola unidad**, la que se le puso al crearlo. La razón de fondo no ha cambiado: la tonelada es lo único que mide un instrumento auditable, la romana, y el volumen de una pila siempre es una estimación.

**Pero el sistema sí sabe convertir, si se le dice cómo.** Cada artículo tiene un campo de **densidad** —cuántas toneladas pesa un metro cúbico de ese material—, y la planilla de carga trae esa columna. Cuando está lleno, Existencias y la ficha del artículo enseñan la misma cantidad en la otra medida, en gris y precedida de **≈**, para que se lea como lo que es: una equivalencia, no una medición.

**Hoy no hay ningún artículo con densidad cargada**, así que en la práctica no se ve ninguna equivalencia. Si a la empresa le sirve, es cuestión de llenar ese campo; mientras no se llene, la conversión la sigue haciendo la persona antes de teclear.

**Y ojo con lo que se decide al crear el artículo**, porque la unidad no se cambia después: un material dado de alta en metros cúbicos se mueve en metros cúbicos, y la densidad solo añade la lectura equivalente. **Hoy la cantera opera en metros cúbicos** mientras tramita la licencia para vender por tonelada.

### 7.13 Los papeles del inventario

Del módulo salen cuatro documentos, y **los cuatro llevan la misma cabecera que el resto de los papeles del sistema** (13.2):

| Papel | De dónde sale |
| --- | --- |
| **Nota de salida** | Se arma sola al registrar una salida y se ve en el visor antes de imprimirla. Se vuelve a sacar desde **Movimientos**, con el botón **Nota** de esa línea |
| **Acta de conteo físico** | Desde la cabecera de **Existencias**. Trae lo que el sistema dice que hay, para salir a contar contra el papel |
| **Libro de movimientos** | Desde la cabecera de **Movimientos**, con el botón **Imprimir el libro**: saca en PDF lo que se está viendo, con los filtros puestos |
| **Constancia de entrega** | Desde **Asignaciones**. Es el papel que firma quien recibe (18.2) |

**El acta se imprime antes de contar, no después.** Es su razón de ser: se sale al patio con lo que el sistema cree que hay y se anota al lado lo que se cuenta. Un acta impresa después del conteo no sirve para cuadrar nada.

### 7.14 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: Almacén. Tu usuario no tiene ese rol.» | Tu usuario consulta pero no registra | Pide el rol a administración, o que lo registre quien lo tenga |
| «Tu usuario no tiene permiso para esta acción.» | Falta el permiso sobre el módulo | Pide el permiso a administración |
| «De "GASOIL" solo hay 40 en existencia y se intentan sacar 100.» | Quieres sacar más de lo que hay | Revisa el almacén. Si el material está, falta registrar su entrada |
| «Un ajuste sin explicación es un descuadre disfrazado. Escribe qué pasó.» | El motivo quedó vacío o muy corto | Escribe qué explica la diferencia |
| «Lo contado coincide con lo que dice el sistema (125). No hay nada que ajustar.» | No cambiaste la cantidad precargada | Escribe la cantidad que contaste de verdad |
| «Un reverso no se reversa. Registra el movimiento que corresponda.» | Intentas reversar una corrección | Registra el movimiento que falta |
| «El movimiento MOV-2026-0007 ya fue reversado.» | Ese movimiento ya se corrigió | Revisa el libro: la corrección ya está |
| «No se puede reversar MOV-2026-0007: … Ese material ya se usó.» | El material que habría que devolver ya no está | Corrige con un conteo físico |
| «El origen y el destino son el mismo almacén.» | Elegiste dos veces el mismo sitio | Cambia el destino |
| «Ya existe un artículo con el código REP-BOMBA.» | El código está ocupado | Busca el artículo. Si existe, úsalo; si está inactivo, actívalo |
| «No hay conexión con el servidor. Revisa la red e inténtalo otra vez.» | Se cayó el internet | Reintenta cuando vuelva la señal. Lo que no se guardó, no quedó |

---

## 8. Despachos

> **Hoy este módulo no se ofrece en el menú.** Está construido y sus pantallas funcionan —todo lo que cuenta este capítulo es cierto—, pero se dejó fuera del menú lateral mientras se termina de afinar, y quien escriba su dirección a mano se encuentra primero el cartel de **En construcción**. Lo que eso significa exactamente está en 1.5. La pantalla **Vehículos**, que no existía cuando se escribió este capítulo, cuelga también de aquí.

Despachos guarda los dos papeles que acompañan al camión: el pesaje de la romana y la guía de movilización. Los dos se hacían a mano dentro de la nota de entrega, y los dos existen aunque no haya venta. Aquí se producen; Ventas los consume.

Hay una idea que conviene entender antes de tocar nada:

**La báscula pesa todo lo que cruza el portón, no solo lo que se vende.** Una gandola de gasoil que llega también se pesa, y ese pesaje no termina nunca en una nota de entrega. Por eso el ticket tiene tipo — **Salida** o **Entrada** — y por eso vive en su propio módulo. Si la romana solo registrara ventas, el resto del tránsito del portón habría que llevarlo en un cuaderno, que es justo de donde se viene.

De ahí se desprende lo demás: un ticket es la prueba de un viaje, la guía es el permiso de ese viaje, y la nota de entrega es la que los gasta.

### 8.1 Quién entra y quién puede hacer qué

Para ver el módulo hace falta que administración le haya dado a tu usuario acceso a Despachos. Si no lo tiene, el grupo Despachos no aparece en el menú, y si escribes la dirección a mano verás una tarjeta con un candado: **Despachos no está a tu alcance**.

Dentro hay dos alcances distintos. El primero es **el trabajo del día**: pesar camiones y cargar guías. El segundo es **el control total sobre Despachos**, y cubre lo que corrige o lo que exceptúa: anular un pesaje, anular una guía y — esto es lo que más importa — autorizar un despacho de mineral sin guía.

**Hoy no lo alcanza nadie salvo el administrador del sistema.** Sobre Despachos, los otros nueve roles están en **Ninguno**. Es coherente con que el módulo esté en obra: mientras no se ofrezca, tampoco se reparte.

La tabla que sigue es **cómo está previsto repartirlo el día que se ofrezca**, y así es como se comportan las pantallas. Se deja escrita porque el reparto ya está decidido y porque las pantallas ya lo respetan; lo que falta es abrir el permiso.

| Rol | Ve el módulo | Pesa y carga guías | Anula pesajes y guías, y autoriza despachos sin guía |
| --- | --- | --- | --- |
| Almacén | Sí | Sí | No |
| Ventas | Sí | Sí | No |
| Administrador | Sí | Sí | Sí |
| Gerencia general | Sí | No | No |
| Consulta | Sí | No | No |

Los demás roles no ven el módulo. Si ves las pantallas pero no ves los botones **Pesar** ni **Cargar guía**, no es una falla: tu rol es de consulta.

Conviene fijarse en una cosa del reparto: **el control total sobre Despachos no lo tiene la gerencia, lo tiene la administración del sistema.** Quien autoriza una salida sin guía no es quien vende ni quien firma la venta, y ese reparto es deliberado: el permiso que se salta un requisito no debe estar en manos de quien tiene prisa por despachar.

**Cuando te falta permiso, el sistema no te dice cuál.** Siempre ves el mismo texto: «Tu usuario no tiene permiso para esta acción.»

Una cosa más, que vale para las dos pantallas: **lo que escribes se convierte solo a mayúsculas y se le quitan las tildes.** Ocurre en las placas, los nombres de chofer, el transportista, el destino y las notas. Así una placa buscada como «a12bc34» encuentra la misma que se tecleó como «A12BC34».

Y las dos pantallas **se refrescan solas**. Si la garita registra un pesaje mientras tú miras la lista desde la oficina, lo verás aparecer sin recargar nada.

### 8.2 El tablero

**Operación › Despachos › Tablero**

Es la primera entrada del grupo y por donde se aterriza al abrir Despachos. No se registra nada aquí. Describe el módulo en una línea —*"El papeleo de la romana: se pesa el camión y se emite la guía con la que sale."*— y ofrece los dos pasos, numerados:

| Paso | A dónde lleva |
| --- | --- |
| **I · Se pesa en la romana** | Tickets de romana |
| **II · Se emite la guía** | Guías de movilización. *"La guía de movilización, que es con lo que el camión puede circular."* |

### 8.3 Del pesaje a la salida del camión

Esta es la sección que hay que leer aunque no se lea ninguna otra. El circuito son cinco pasos y va siempre en el mismo orden.

1. **Se pesa el camión.** **Operación › Despachos › Tickets de romana › Pesar**. Se guarda el bruto, la tara y la placa. El ticket recibe su número — **TCK-2026-0001** — y nace **Sin usar**.
2. **Se carga la guía de movilización.** **Operación › Despachos › Guías de movilización › Cargar guía**. El sistema no emite la guía: la emite el ministerio y aquí se copia el papel, con su número, su vigencia, su destino, el material y las toneladas que ampara. Nace **Vigente**.
3. **Sale el camión con su nota de entrega.** **Ventas › Notas de entrega › Despachar**. Ahí se eligen los dos papeles: el **Ticket de romana** y la **Guía de movilización**. Al elegir el ticket, los pesos y la placa se traen solos de la báscula. **Si la nota lleva mineral y no lleva guía, el despacho se rechaza entero**, y con él la salida del inventario: el camión no sale.
4. **Los dos papeles quedan gastados.** En cuanto la nota se guarda, el ticket pasa a **En una nota** y la guía a **Usada**, las dos con el número de la nota a la vista. Ninguno de los dos vuelve a aparecer para elegir.
5. **Si la nota se anula, los dos vuelven a quedar libres.** El ticket regresa a **Sin usar** y la guía a **Vigente**, listos para la nota que corrige a la anterior.

Dos avisos sobre este circuito, para que nadie los descubra a mitad de camino.

**Un ticket de entrada nunca llega a una nota de entrega.** El pesaje de una gandola que llega se queda aquí, como registro del portón. Al despachar solo se ofrecen los tickets de salida.

**Los dos papeles son opcionales para el sistema, salvo la guía cuando hay mineral.** Se puede despachar sin haber pesado el camión, y en ese caso los pesos se teclean a mano. Lo que no se puede es sacar mineral sin guía.

### 8.4 Tickets de romana

**Operación › Despachos › Tickets de romana**

Cada pesada del portón, entre o salga. La pantalla lo resume así: **Cada pesada del portón, entre o salga.**

#### Qué se ve

Arriba, si hay pesajes disponibles, una etiqueta verde: **3 sin usar**. Al lado, el botón **Pesar**.

Debajo, el filtro **Ver**, que empieza en **Todos** y admite **Sin usar**, **Ya en una nota** y **Anulados**. No hay buscador: el filtro por estado es lo único que hay para acotar la lista.

Si todavía no hay ninguna pesada, aparece la tarjeta **No hay pesadas registradas**, que explica para qué sirve la pantalla: **Al despachar, la nota de entrega toma los pesos de aquí en vez de que alguien los teclee dos veces.**

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
| **Estado** | **Sin usar** en verde, **En una nota** en azul, **Anulado** en gris |

Los tickets anulados se ven más pálidos, pero siguen en la lista.

**La pantalla muestra los 400 tickets más recientes.** No hay paginación ni botón de ver más. Es una limitación real: en un portón con mucho tránsito, un pesaje de hace unas semanas deja de aparecer aquí.

#### Pesar un vehículo

1. Pulsa **Pesar**. La ventana avisa: **El neto sale solo. Si el bruto no supera a la tara, algo se escribió al revés.**
2. Elige el **Tipo**: **Salida — material que se va** o **Entrada — algo que llega**.
3. Elige el **Vehículo**. Sale del catálogo de **Despachos › Vehículos** y trae la placa, lo que carga y el transportista; **al elegirlo, el transportista se rellena solo**. Si el camión no está en el catálogo —el que viene una vez y no vuelve— se elige **Otro — escribo la placa** y aparece el campo **Placa** para teclearla.
4. Escribe el **Peso bruto (kg)** y la **Tara (kg)**. Debajo, el recuadro **Neto** hace la resta mientras tecleas.
5. Completa lo que sepas: **Transportista**, **Chofer**, **Cédula del chofer**, **Material**, y el **Cliente** si es una salida o el **Proveedor** si es una entrada.
6. Revisa la **Fecha**, que viene puesta en hoy, y escribe la **Hora** si la llevas.
7. Pulsa **Guardar el pesaje**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Tipo** | Sí | Empieza en **Salida — material que se va** |
| **Placa** | Sí | El botón queda apagado mientras esté vacía |
| **Transportista** | No | |
| **Chofer** | No | |
| **Cédula del chofer** | No | Con la forma **V-12345678** |
| **Material** | No | Empieza en **Sin especificar**. Trae todos los artículos activos |
| **Cliente** | No | Solo en las salidas. Empieza en **Sin cliente todavía** |
| **Proveedor** | No | Solo en las entradas. Empieza en **Sin proveedor** |
| **Peso bruto (kg)** | Sí | Tiene que ser mayor que la tara |
| **Tara (kg)** | Sí | Si iguala o supera al bruto, aparece en rojo **La tara no puede igualar al bruto** |
| **Fecha** | Sí | Viene puesta en hoy. No admite una fecha futura |
| **Hora** | No | |
| **Romana** | No | Cuál báscula pesó, si hay más de una |
| **Operador** | No | Quién pesó |
| **Nota** | No | |

**El cliente se puede dejar en blanco.** Se pesa cuando el camión llega al portón, y a esa hora a veces todavía no se sabe a nombre de quién sale la nota. Un ticket sin cliente se puede usar en el despacho de cualquiera; uno con cliente, solo en el de ese cliente.

**Un pesaje no se puede modificar.** Ni los pesos, ni la placa, ni la fecha. Si está mal, se anula y se registra otro, porque un peso que se puede retocar después deja de ser una prueba de nada el día que alguien discuta la cantidad.

#### Anular un pesaje

El botón **Anular** aparece en la fila, en rojo, **solo mientras el ticket está Sin usar**, y solo para quien tenga el control total sobre Despachos.

1. Pulsa **Anular**. Se abre **Anular el ticket TCK-2026-0004**, con el aviso **Se queda con su número, marcado como anulado. Un pesaje que desaparece deja un hueco en la numeración de la garita.**
2. Escribe **Por qué se anula**.
3. Pulsa **Anular**.

El botón está apagado hasta que el motivo tenga al menos cuatro letras.

**Un ticket que ya está en una nota de entrega no se anula desde aquí.** El sistema lo rechaza con «El ticket TCK-2026-0004 está en la nota de entrega. Anula primero la nota.» El orden es ese porque el ticket es lo que justifica el peso de esa nota: dejarlo anulado por debajo dejaría una nota de entrega con un peso que ningún pesaje respalda.

### 8.5 Guías de movilización

**Operación › Despachos › Guías de movilización**

El permiso con el que el mineral puede circular. La pantalla lo dice así: **El permiso con el que el mineral puede circular.**

**El sistema no emite la guía.** La emite el ministerio, y lo que se hace aquí es copiar el papel para saber cuáles hay, cuáles siguen vigentes y cuál amparó cada despacho. La ventana lo advierte: **Se copia del papel que emitió el ministerio. El número es el suyo, no uno nuestro.**

#### Qué se ve

Arriba, dos etiquetas cuando corresponde: **2 por vencer**, en ámbar, para las que vencen dentro de tres días o menos, y **5 vigentes**, en verde. Al lado, el botón **Cargar guía**.

Debajo, el filtro **Ver**, que empieza en **Todas** y admite **Vigentes**, **Ya usadas** y **Anuladas**.

Si no hay ninguna, aparece la tarjeta **No hay guías cargadas**, con el texto **Sin guía vigente, Ventas rechaza el despacho de mineral. Quien tenga control total sobre Despachos puede autorizar una salida sin ella, y esa nota queda marcada.**

| Columna | Qué muestra |
| --- | --- |
| **Guía** | El número del ministerio y, debajo, el número nuestro — **GMV-2026-0001** — y la fecha de emisión |
| **Destino** | A dónde va el viaje y, debajo, el cliente si se le puso uno |
| **Material** | El producto amparado y, debajo, el frente del que sale |
| **Ampara** | La cantidad que cubre el papel, con su medida: **m³** o **t** |
| **Vigencia** | Hasta cuándo vale y, cuando ya se usó, el número de la nota de entrega |
| **Estado** | **Vigente**, **Vence en 2 d**, **Vencida**, **Usada** o **Anulada** |

**Vencida no es un estado que alguien marque: se calcula cada vez que abres la pantalla**, comparando la vigencia con el día de hoy. Guardado, haría falta que algo lo cambiara todas las noches, y la noche que no corriera una guía vencida seguiría diciendo que está vigente.

Igual que en la romana, **la pantalla muestra las 400 guías más recientes** y el único filtro es el de estado.

#### Cargar una guía

1. Pulsa **Cargar guía**.
2. Escribe el **Número de guía**, que es el del papel del ministerio.
3. Revisa **Emitida el**, que viene en hoy, y escribe **Vence el**.
4. Escribe el **Destino**.
5. Elige el **Material**, escribe la **Cantidad que ampara** y elige la **Medida**: **Metros cúbicos** o **Toneladas**. La ayuda dice el criterio: *"La que diga el papel."* **Viene puesto en metros cúbicos**, porque es en lo que opera hoy la cantera mientras tramita la licencia para vender por tonelada.
6. Completa lo que traiga el papel: **Cliente**, **Frente de origen** u **Origen**, **Transportista**, **Placa**, **Chofer**, **Cédula del chofer** y la **Observación**.
7. Pulsa **Guardar la guía**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Número de guía** | Sí | El del ministerio. No se puede repetir |
| **Emitida el** | Sí | Viene puesta en hoy |
| **Vence el** | Sí | No puede ser anterior a la emisión |
| **Destino** | Sí | La ciudad o el sitio al que va el viaje |
| **Cliente** | No | Empieza en **Sin cliente concreto** |
| **Material** | Sí | Empieza en **Elige el material**. Solo trae productos de cantera |
| **Cantidad que ampara** | Sí | Mayor que cero |
| **Medida** | Sí | **Metros cúbicos** o **Toneladas**. Empieza en metros cúbicos |
| **Frente de origen** | No | Empieza en **Sin frente concreto** |
| **Origen** | No | Para cuando no sale de un frente del sistema |
| **Transportista** | No | |
| **Placa** | No | |
| **Chofer** | No | |
| **Cédula del chofer** | No | Con la forma **V-12345678** |
| **Observación** | No | |

**El cliente se puede dejar en blanco**, igual que en el ticket. Una guía sin cliente ampara el despacho de cualquiera; una guía con cliente, solo el de ese cliente.

**Una guía cargada no se puede editar.** Si el número o la vigencia quedaron mal, se anula y se carga otra vez, porque lo que está guardado tiene que decir lo mismo que el papel que lleva el chofer.

#### Anular una guía

El botón **Anular** aparece en la fila **solo mientras la guía está Vigente**, y solo para quien tenga el control total sobre Despachos. Se abre **Anular la guía GM-2026-0099**, con el aviso **Deja de estar disponible para amparar despachos.** Escribe **Por qué se anula** — mínimo cuatro letras — y pulsa **Anular**.

Una guía que ya amparó un despacho no se anula desde aquí: el sistema responde «La guía GM-2026-0099 amparó un despacho. Anula primero la nota de entrega.» El motivo es el mismo que en el ticket: la nota quedaría diciendo que viajó amparada por un papel que el sistema da por anulado.

### 8.6 Vehículos

**Operación › Despachos › Vehículos**

*"La flota propia y la de los transportistas, con lo que carga cada uno. Es lo que permite saber si un despacho cabe en el camión."*

Es el catálogo del que salen los desplegables **Vehículo** del ticket y de la guía. Cada ficha lleva:

| Campo | Detalle |
| --- | --- |
| **Placa** | Con la que se le identifica en todo el sistema |
| **Tipo** | Volteo, chuto, gandola… |
| **Descripción** | Lo que ayude a reconocerlo |
| **Metros cúbicos** y **Toneladas** | Lo que carga. Es el dato que responde si un despacho cabe |
| **Ficha en Maquinaria** | Si el camión es de la empresa, se ata a su ficha de Maquinaria |
| **Transportista** | Si es de un tercero. Es lo que se rellena solo en el ticket al elegir el vehículo |
| **Nota** | |

**Un camión es propio o es de un transportista, no las dos cosas.** Los de la empresa se atan a Maquinaria para que su mantenimiento y su horómetro vivan en un solo sitio; los de fuera llevan el nombre de quien los pone.

### 8.7 Lo que conviene entender

#### La romana pesa todo, no solo lo que se vende

Un ticket puede ser de salida o de entrada. La de salida es el material que se va; la de entrada, la gandola de gasoil que llega o la recepción de una compra.

Solo los tickets de salida llegan a Ventas. Los de entrada se quedan aquí como registro del portón, y si intentas usar uno en un despacho el sistema lo rechaza con «El ticket TCK-2026-0004 es de una entrada a la cantera, no de una salida.»

Esto tiene una consecuencia práctica que conviene tener presente: **un ticket de entrada no mete material en el inventario.** Pesar la gandola no es recibirla. La entrada al inventario se registra donde siempre, en Compras o en Inventario. La romana deja constancia de lo que cruzó el portón; el inventario, de lo que se guardó.

#### Un ticket se usa una sola vez

Un pesaje pertenece a un viaje. En cuanto una nota de entrega lo toma, el ticket pasa a **En una nota** y desaparece de la lista de los que se pueden elegir. Si intentas usarlo otra vez, el sistema responde «El ticket TCK-2026-0004 está usado.»

La razón se entiende sola en el patio: **si el mismo ticket pudiera colgarse de dos notas de entrega, el mismo camión estaría justificando dos despachos.** Las dos notas dirían que salieron veintiocho toneladas y habría una sola pesada para respaldarlas.

**Al anular la nota, el ticket vuelve a quedar Sin usar.** Esto no es una excepción a la regla anterior, es la misma regla: el camión se pesó igual. Ese pesaje ocurrió, es válido, y lo que se cayó fue la nota. Si tuvieras que volver a pesar un camión que ya se fue, la nota corregida saldría con un peso inventado. Lo mismo pasa con la guía, que vuelve a **Vigente**.

#### Ninguna salida de mineral viaja sin guía

Es la regla más dura del módulo y la que conviene explicar bien.

**Cuando una nota de entrega lleva un producto de cantera y no se le eligió guía, el despacho se rechaza entero.** No se avisa y se sigue: no se guarda la nota y no sale nada del patio. El mensaje es: «Este despacho lleva mineral y no tiene guía de movilización. Cárgala en Despachos › Guías, o pídele a quien tenga control total sobre Despachos que lo autorice sin ella.»

La razón es que la guía es lo que hace legal que el camión circule con la piedra. Un camión detenido en la vía sin guía es un problema de la empresa, no del sistema, y el sistema es el último sitio donde se puede impedir que salga.

**La comprobación mira lo que va en los renglones, no lo que dice el papel.** Si la nota es solo un flete o un servicio, no hace falta guía. Basta con que haya un producto de cantera para que se exija.

**Hay una excepción, y solo una: quien tenga el control total sobre Despachos puede despachar sin guía.** Existe porque hay días en que el papel llega tarde y el cliente está esperando, y una empresa que no puede despachar es una empresa parada. Ese permiso no lo da el control total sobre Ventas: es el de Despachos, y por defecto solo lo tiene la administración del sistema.

**Y esa autorización queda marcada.** La nota queda guardada sin guía asociada, y el registro de auditoría guarda quién la despachó, cuándo y con qué datos. Eso importa por una razón concreta: una excepción que no deja rastro deja de ser una excepción y se convierte en la forma normal de trabajar, porque nadie puede contar cuántas veces se usó ni pedirle cuentas a nadie.

Aquí hay que ser exacto sobre lo que el sistema hace hoy: **ninguna pantalla muestra una etiqueta que diga que una nota salió sin guía.** Ni la lista de notas de entrega, ni el detalle de la nota, ni el PDF. La única forma de revisarlo es el registro de auditoría, que solo abre quien tiene el rol de administrador. La pantalla de guías dice que la nota «queda marcada», y conviene leerlo por lo que es: queda guardada y auditada, no señalada a la vista de todo el mundo. Si la empresa quiere revisar esas salidas de forma habitual, hoy hay que pedirlo por fuera.

#### Al elegir el ticket, los pesos y la placa se traen solos

En la ventana de despachar hay dos listas, **Ticket de romana** y **Guía de movilización**, y debajo los campos del camión. La ayuda de la primera lo dice: **Al elegirlo, los pesos y la placa se traen de la báscula.**

Al elegir un ticket se llenan solos el **Peso bruto (kg)**, la **Tara (kg)**, la **Placa del vehículo**, el **Chofer** y la **Cédula del chofer**.

**Y lo que se guarda son los del ticket, no los que se vean en la pantalla.** Aunque después de elegir el ticket alguien escriba otro peso encima, el sistema guarda el de la báscula. Los pesos no se teclean a mano por lo mismo que no se copian dos veces a mano en ningún sitio: **teclear el peso otra vez es la forma de que el papel y la báscula terminen diciendo cosas distintas**, y el día que un cliente discuta la cantidad, la nota y el ticket tienen que decir lo mismo o ninguno de los dos sirve.

La placa, el chofer y la cédula funcionan al revés: si los escribes tú, se respeta lo que escribiste; solo se traen del ticket cuando los dejas en blanco. Es a propósito, porque el chofer que se anotó en la garita a las seis de la mañana puede no ser el que se llevó el camión.

#### Lo que el sistema no comprueba

Conviene decirlo con claridad, porque es fácil suponer lo contrario:

- **No compara el peso neto del ticket con las cantidades de la nota.** Puedes despachar cien toneladas con un ticket de veintiocho. El peso queda como prueba, no como control.
- **No compara las toneladas de la guía con lo que se despacha**, ni el material de la guía con el de los renglones. Una guía que ampara treinta toneladas de granzón no impide despachar cincuenta.
- **No comprueba que el material del ticket sea el de la nota.**

Lo que sí comprueba es el cliente: **si el ticket o la guía se emitieron a nombre de un cliente, solo sirven para el despacho de ese cliente.** Si no coinciden, verás «El ticket TCK-2026-0004 se pesó para otro cliente.» o «La guía GM-2026-0099 se emitió para otro cliente.»

Y comprueba la vigencia: una guía cuya vigencia terminó antes de la fecha del despacho se rechaza con «La guía GM-2026-0099 venció el 02/08/2026.»

#### Los números de los documentos

Cada pesaje lleva su correlativo, **TCK-2026-0001**, y cada guía lleva dos números: el del ministerio, que es el que se busca y el que va en el papel, y el nuestro, **GMV-2026-0001**, que sirve para nombrarla dentro del sistema. **Los dos correlativos se reinician cada enero.**

**Nada se borra.** Un pesaje equivocado se anula y se queda con su número, y una guía anulada sigue en la lista. La razón es la misma que en el resto del sistema: un correlativo con huecos es lo primero que se pregunta en una revisión, y en la garita un número que falta es un camión del que nadie sabe dar cuenta.

### 8.8 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Tu usuario no tiene permiso para esta acción.» | Te falta permiso, y el mensaje no dice cuál | Si fue al anular un pesaje o una guía, hace falta el control total sobre Despachos. Pídelo a administración, o que lo haga quien lo tenga |
| «Un pesaje sin placa no se puede atribuir a nadie.» | La placa quedó vacía | Escribe la placa del camión |
| «El peso bruto (12000) tiene que ser mayor que la tara (12000).» | El bruto no supera a la tara | Revisa los dos números: el bruto es el camión cargado |
| «No se registra un pesaje con fecha futura.» | La fecha es de mañana o después | Corrige la fecha |
| «Escribe por qué se anula el pesaje.» | El motivo quedó vacío o con menos de cuatro letras | Escribe qué pasó con ese pesaje |
| «El ticket TCK-2026-0004 ya estaba anulado.» | Alguien se te adelantó | Recarga la lista: la anulación ya está hecha |
| «El ticket TCK-2026-0004 está en la nota de entrega. Anula primero la nota.» | Ese pesaje ya se usó en un despacho | Anula la nota desde **Ventas › Notas de entrega**. El ticket vuelve solo a **Sin usar** |
| «La guía necesita su número, que es el que lleva el papel del ministerio.» | El número quedó vacío | Cópialo del papel |
| «La guía necesita el destino: una guía ampara un viaje a un sitio.» | El destino quedó vacío | Escribe a dónde va el camión |
| «La guía no puede vencer antes de emitirse.» | **Vence el** quedó antes de **Emitida el** | Revisa las dos fechas del papel |
| «La guía tiene que amparar un tonelaje mayor que cero.» | La cantidad quedó vacía o en cero | Escribe la cantidad que dice el papel. **El mensaje habla de tonelaje aunque la guía se emita en metros cúbicos**: es un texto que quedó de antes |
| Un mensaje largo en inglés al guardar la guía | Ese número de guía ya está cargado | Búscala en la lista con el filtro **Ver** en **Todas**. Si ya está, no hace falta cargarla otra vez |
| «Escribe por qué se anula la guía.» | El motivo quedó vacío o muy corto | Escribe al menos cuatro letras que expliquen qué pasó |
| «La guía GM-2026-0099 ya estaba anulada.» | Alguien se te adelantó | Recarga la lista |
| «La guía GM-2026-0099 amparó un despacho. Anula primero la nota de entrega.» | Esa guía ya se usó | Anula la nota desde **Ventas › Notas de entrega**. La guía vuelve sola a **Vigente** |
| «Este despacho lleva mineral y no tiene guía de movilización. Cárgala en Despachos › Guías, o pídele a quien tenga control total sobre Despachos que lo autorice sin ella.» | La nota lleva producto de cantera y no se eligió guía | Carga la guía y repite el despacho, o pide la autorización a quien tenga el control total sobre Despachos |
| «El ticket TCK-2026-0004 es de una entrada a la cantera, no de una salida.» | Se eligió un pesaje de algo que llegó | Elige un ticket de salida, o registra el pesaje del camión que se va |
| «El ticket TCK-2026-0004 está usado.» | Otra nota lo tomó primero | Cierra, vuelve a abrir **Despachar** y elige uno de los que sigan **Sin usar** |
| «El ticket TCK-2026-0004 se pesó para otro cliente.» | El pesaje se registró a nombre de otro | Elige el ticket correcto, o pesa de nuevo el camión |
| «La guía GM-2026-0099 está usada.» | Otra nota la tomó primero | Elige otra guía vigente |
| «La guía GM-2026-0099 venció el 02/08/2026.» | La vigencia terminó antes de la fecha del despacho | Consigue una guía vigente. Una vencida no ampara el viaje |
| «La guía GM-2026-0099 se emitió para otro cliente.» | La guía tiene otro cliente puesto | Elige la guía de ese cliente, o una que no tenga cliente |
| «No hay conexión con el servidor. Revisa la red e inténtalo otra vez.» | Se cayó el internet | Reintenta cuando vuelva la señal. Lo que no se guardó, no quedó |

---

## 9. Compras

Compras es el camino por el que la empresa consigue lo que no produce: un repuesto, combustible, un flete, un servicio. Todo ese camino cabe en una sola pantalla, y cada compra es una tarjeta que avanza de un panel al siguiente, desde que alguien la pide hasta que el material entra al almacén.

Hay una idea que conviene entender antes de tocar nada:

**Una compra no avanza porque alguien la mueva. Avanza porque alguien hace la acción que toca.** Las tarjetas no se arrastran de un panel a otro. El panel en el que está una compra es la consecuencia de lo último que se hizo con ella, y el orden de esas acciones es fijo: se confirma, se cotiza, se aprueba, se instruye el pago, se paga y se recibe. La propia pantalla lo dice en su descripción: **Cada tarjeta es una compra. Avanza de un panel al siguiente y no se salta pasos.**

La segunda idea es la que explica la mitad de las alarmas del módulo: **aquí se paga antes de recibir**. Entre el momento en que tesorería transfiere y el momento en que llega el camión hay dinero de la empresa en manos de un tercero. Por eso el tablero cuenta los días y avisa.

### 9.1 Quién entra y quién puede hacer qué

Hay dos puertas distintas, y conviene no confundirlas.

La primera es **entrar al módulo**. Depende del permiso sobre Compras que administración le haya dado a tu usuario. Sin ese permiso no se ve nada: ni el menú, ni las tarjetas, ni las fichas.

La segunda es **poder hacer cada paso**. Cada acción exige un rol concreto, y son roles distintos a propósito.

| Rol | Entra al módulo | Qué puede hacer dentro |
| --- | --- | --- |
| Administrador | Sí | Todo |
| Gerencia general | Sí | Aprueba la compra, la devuelve a compras, cancela órdenes, marca el desistimiento del proveedor y resuelve el dinero |
| Compras | Sí | Crea pedidos, los confirma, carga y propone cotizaciones, indica el método de pago, registra proveedores y cancela |
| Solicitante | Sí | Crea pedidos |
| Operaciones | Sí | Crea pedidos |
| RRHH | Sí | Crea pedidos |
| Almacén | Sí, de consulta | Crea pedidos y registra la recepción del material |
| Consulta | Sí, de consulta | Nada: solo mirar |
| Ventas, Respaldo | No | — |

**Ya no hay rol de Tesorería.** Lo hubo, y en esta tabla tenía su fila: registraba los pagos. Se retiró junto con el módulo, y **quien paga hoy es el rol Compras** —lo exige la propia función de la base, no la matriz de permisos—. Por eso **Pagos por hacer** cuelga del menú de Compras. Está contado en 12.1.

Si abres una compra y no ves ningún botón, no es una falla: el paso en el que está esa compra le toca a otro rol, y la pantalla te dice a quién estás esperando.

**La pantalla de facturas de proveedor se guarda de otra manera**, y conviene saberlo antes de repartir nada. Ahí el sistema no pregunta por el rol sino por el nivel de permiso sobre Compras que administración le haya puesto a tu usuario. La repartición que resulta no coincide con la de esta tabla, y se detalla en la sección de esa pantalla.

**Que un botón no se dibuje es solo cortesía.** El permiso se comprueba de verdad en el momento de ejecutar la acción, no al pintar la pantalla. Quien llegue por otro camino recibe el mismo «Esta acción la realiza: Compras. Tu usuario no tiene ese rol.» Se hace así porque una autorización que dependiera de lo que se ve en la pantalla se saltaría con solo escribir una dirección a mano.

### 9.2 El circuito de una compra

Esta es la sección que hay que leer si solo se va a leer una. Todo lo demás del capítulo son detalles de estas nueve casillas.

| # | Cómo se llama | Quién lo mueve | Qué hace falta para pasar al siguiente |
| --- | --- | --- | --- |
| 0 | **Borrador** *(opcional)* | Quien lo cargó | Pulsar **Enviar el pedido** |
| 1 | **Pedido** | Compras | Pulsar **Confirmar el pedido** |
| 2 | **Confirmada** *(en la ficha: **Confirmada · indicar proveedores**)* | Compras | Cargar al menos una cotización y pulsar **Proponer al gerente** |
| 3 | **Confirmar por el gerente** *(en la ficha: **Por confirmar el gerente**)* | Gerencia general | Pulsar **Aprobar la compra**. Ahí nace la orden de compra y el precio queda fijo |
| 4 | **Aprobada** *(en la ficha: **Aprobada · indicar método de pago**)* | Compras | Decir **con qué entrega el proveedor**, y después **Indicar método de pago** y **Enviar a tesorería** |
| 5 | **En tesorería** | Compras | **Registrar el pago** de cada instrucción, hasta cubrir el total |
| 6 | **Pagada** *(en la ficha: **Pagada · falta que llegue**)* | Almacén | **Recibir material** |
| 7 | **Recibida parcialmente** | Almacén | Volver a **Recibir material** hasta completar |
| 8 | **Recibida** | — | Cerrada |

Una compra recibida **se queda a la vista** en su panel. No desaparece: si desapareciera al recibirse, no habría dónde comprobar que llegó.

**Los nombres cambian ligeramente entre el tablero y la ficha.** En el tablero, el panel se llama **Confirmada** y debajo dice la acción que falta, **Indicar proveedores**. En la ficha de la compra, la etiqueta junta las dos cosas: **Confirmada · indicar proveedores**. Es el mismo paso.

#### Las dos salidas que no son un fallo

Además de los nueve pasos, una compra puede terminar de dos maneras que no son errores del sistema sino hechos del negocio:

- **Cancelada.** Solo antes de que tesorería pague.
- **El proveedor desistió.** Después de pagar. Existe porque aquí se paga antes de recibir, y el sistema tiene que poder decir cuánto dinero está fuera y desde hace cuántos días. Se cierra eligiendo qué pasó con ese dinero: devuelto, saldo a favor o dado por perdido.

#### Los dos retrocesos

- **Gerencia devuelve a compras.** La compra vuelve del paso 3 al paso 2, y **la cotización elegida se borra**. Es a propósito: si se devuelve, es porque esa opción no sirve.
- **Tesorería devuelve una instrucción de pago.** Si no queda ninguna instrucción viva, la orden vuelve del paso 5 al paso 4 para que compras corrija el método de pago.

Hay un estado más que no sale en la tabla porque no es un paso, sino un desvío: **Contra entrega · esperando el material**. Es donde queda una orden que se pactó para pagar al recibir, y por eso no pasa por tesorería antes que por el almacén.

#### La factura del proveedor: lo que sí exige el sistema y lo que no

Al circuito le falta un papel que no aparece en la tabla de arriba: **la factura que emite el proveedor**. Se registra en su propia pantalla, **Facturas de proveedor**, que tiene su sección más adelante en este capítulo.

**Lo que cambió, y es lo más importante del capítulo: ninguna orden se paga sin decir con qué entrega el proveedor.** En el paso 4, antes de poder indicar el método de pago, hay que declarar si el proveedor entrega con **nota de entrega** o con **factura**. No es opcional y no se puede saltar: el botón **Indicar método de pago** está apagado hasta que se responda. Está en 9.9.

**Registrar la factura, en cambio, sigue sin mover la tarjeta.** No hay un panel de facturas ni un estado nuevo: una compra recibida se queda en **Recibida** con factura o sin ella, y ni el tablero ni la ficha avisan de las que faltan. **Y la factura sigue sin poder atarse a su orden desde la pantalla**: el formulario de alta no tiene campo para elegirla. Así que el sistema ya sabe qué compras prometieron factura, pero **no puede comprobar cuáles la cumplieron**. Ese cotejo sigue siendo trabajo de la oficina.

Y hay que decir dónde está el riesgo, porque cuesta dinero: **una misma compra se puede pagar por dos caminos distintos y el sistema no los cruza**. Uno es la instrucción de pago de la orden, que ejecuta tesorería en el paso 5. El otro es el pago que se registra sobre la factura, dentro de su propia pantalla. Los dos sacan dinero de una cuenta de verdad y ninguno de los dos sabe del otro, así que usar los dos para la misma compra saca el dinero dos veces sin que nada lo impida. La empresa tiene que decidir de antemano cuál de los dos caminos usa, y usar ese.

#### Lo que ya no se deshace

- **Un pedido enviado no se puede editar.** El sistema responde «El pedido ya fue enviado y no se puede editar. Cancélalo y crea otro.» La razón es que a partir del envío otras personas ya lo están mirando y decidiendo sobre él; cambiarle el contenido por debajo dejaría sin sentido lo que ya aprobaron.
- **Una compra cancelada no se reabre.** Si vuelve a hacer falta, se crea un pedido nuevo.
- **Una recepción no se corrige.** El libro de inventario no se modifica: una corrección se hace con un ajuste, y los dos apuntes quedan visibles.

### 9.3 El tablero

**Administración › Compras › Tablero**

Es la pantalla de cabecera del módulo: una tarjeta por compra, repartidas en paneles según el paso en el que están. No hay una lista de pedidos por un lado y otra de órdenes por otro; es todo lo mismo visto de una vez.

#### Qué se ve

Arriba, el título **Compras** y el botón **Nuevo pedido**.

Si hay compras pagadas que llevan más de una semana sin recibirse, aparece un aviso con el número de compras y el monto: **Ese dinero ya salió de la empresa.** Es el aviso más importante de la pantalla, porque señala plata fuera de la empresa sin nada a cambio todavía.

Debajo, los ocho paneles, en rejilla. Cada uno lleva su título, en letra pequeña la acción que hace falta, y a la derecha cuántas tarjetas tiene:

| Panel | Acción que falta |
| --- | --- |
| **Pedido** | **Confirmar** |
| **Confirmada** | **Indicar proveedores** |
| **Confirmar por el gerente** | **Aprobar** |
| **Aprobada** | **Indicar método de pago** |
| **Pagada** | **Pendiente por recepcionar** |
| **Recibida** | **Cerrada** |
| **Cancelada** | **No sigue** |
| **El proveedor desistió** | **Resolver el dinero** |

La franja de color de un panel solo se enciende si tiene tarjetas. Un panel vacío muestra **Sin órdenes**.

#### Qué lleva cada tarjeta

De arriba abajo: el número del documento — el de la orden si ya existe, y si no el del pedido —, el título de la compra, cuántos renglones tiene (**3 ítems**), y **· Urgente** o **· Prioridad alta** cuando la prioridad no es normal. Después, quién lo solicita, o **Sin solicitante**, con el destino al lado si lo hay. Luego la fecha de creación, el proveedor cuando ya se sabe, una etiqueta de señal, y al pie el monto en dólares o el texto **Sin cotizar** si todavía no hay precio, con el tiempo transcurrido a la derecha.

Las etiquetas de señal son estas:

| Etiqueta | Cuándo aparece |
| --- | --- |
| **Borrador** | El pedido todavía no se ha enviado |
| **Sin cotizaciones** | Está confirmada y nadie ha cargado precios |
| **3 cotizaciones** | Cuántos proveedores han cotizado |
| **Falta el método de pago** | Está aprobada y compras no ha indicado cómo se paga |
| **En tesorería** | La instrucción de pago ya está cargada |
| **Pagada hoy** | Se pagó hoy y aún no llega el material |
| **12 días sin recibir** | Los días desde el pago. Cambia de verde a naranja a la semana, y a rojo pasados quince días |
| **Dinero sin resolver** | El proveedor desistió y nadie ha decidido qué pasó con el dinero |
| **Reembolsado** / **Queda a favor** / **Dado por perdido** | Ya se resolvió el dinero de un desistimiento |

Mientras carga se lee **Cargando el tablero…** Si no hay ninguna compra todavía, aparece **Todavía no hay compras** con el botón **Crear el primer pedido**.

#### Qué se puede hacer

1. Pulsa en cualquier parte de una tarjeta para abrir la ficha de esa compra.
2. Pulsa **Nuevo pedido** para crear uno.

Debajo de los paneles hay además un bloque, **¿Qué quieres hacer?**, con dos grupos de atajos:

| Grupo | Atajos |
| --- | --- |
| **La cadena de una compra** | Numerados, en el orden en que ocurren: **Pedir algo**, **Cotizar y proponer**, **Pagar lo aprobado**, **Recibir el material** |
| **Alrededor de la compra** | **Cargar proveedores por planilla**, **Proveedores**, **Facturas del proveedor**, **Libro de compras** |

Los del segundo grupo son la puerta a pantallas que ya no están en el menú (3.1), así que este bloque es la forma corta de llegar a ellas.

**Ninguna acción cambia el estado de una compra desde el tablero**: todo ocurre dentro de la ficha, donde está el contexto completo de lo que se va a decidir.

El tablero se actualiza solo cuando otra persona mueve algo, y además se recarga cada cinco minutos por si acaso.

#### Su limitación

**No hay buscador, ni filtros, ni forma de cambiar el orden.** Las tarjetas vienen siempre de la más reciente a la más antigua.

**El tablero no se imprime**, y no hace falta: los dos papeles del módulo —la **orden de compra** y el **comprobante de pago**— salen de la ficha de cada compra, no de aquí. Está en 9.5. Lo que sigue sin imprimirse es la cotización y la factura del proveedor.

### 9.4 Nuevo pedido

Se llega desde el botón **Nuevo pedido** del tablero. **No está en el menú**, porque un pedido siempre nace mirando el tablero.

Es donde alguien pide lo que necesita. La pantalla lo advierte en su descripción: **Lo que pidas aquí entra al tablero en la columna Pedido.**

La pantalla tiene dos tarjetas: a la izquierda **Qué se necesita**, con **Un renglón por cosa distinta.**, y a la derecha **Datos del pedido**.

#### Qué se necesita — un recuadro por renglón

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Renglón 1 · artículo del catálogo** | No | Si el artículo existe en el catálogo, elígelo y se rellenan solos la descripción y la unidad. Si no, deja **No está en el catálogo — lo describo abajo** |
| **Descripción** | Sí | Qué es. Ejemplo: un filtro de aire con su máquina |
| **Cantidad** | Sí | Admite decimales |
| **Unidad** | No | Empieza en **Unidad**, o la del artículo elegido |
| **Observación** | No | Marca, medida, número de parte |

Pulsa **Agregar renglón** por cada cosa distinta. **Quitar** borra un renglón, y está apagado cuando solo queda uno, porque un pedido sin renglones no es un pedido.

#### Datos del pedido

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Título** | Sí | **Es lo que se lee en la tarjeta del tablero.** Mínimo cuatro letras |
| **Para qué es** | Sí | **Quien aprueba no está en el frente.** Mínimo diez letras |
| **Quién lo solicita** | — | Empieza en tu propio nombre. La lista trae a cada persona activa con su cargo, y al final **Otra persona — no tiene usuario** |
| **Nombre de quien solicita** | Sí, si elegiste **Otra persona** | Mínimo tres letras |
| **Cargo o frente** | No | Solo si elegiste **Otra persona** |
| **Prioridad** | No | **Normal**, **Alta** o **Urgente — para la planta**. Empieza en **Normal** |
| **Se necesita para** | No | Fecha |
| **Destino** | No | Taller, planta, frente 3 |

**Por qué existe Otra persona.** En la cantera la mayoría de quienes necesitan algo no tienen computadora ni cuenta: el mecánico pide por radio y alguien en la oficina carga el pedido. Sin esa opción el sistema anotaría al de la oficina y se perdería a la única persona a la que hay que preguntarle si llega otra cosa.

#### Cómo se envía

1. Llena los renglones y los datos del pedido.
2. Pulsa **Enviar el pedido**. Mientras guarda dice **Enviando…**
3. El sistema abre sola la ficha de esa compra.

También está **Guardar como borrador**, que deja el pedido en el panel **Pedido** con la etiqueta **Borrador**, visible solo para quien lo creó.

Dos avisos sobre el borrador. El primero: **Guardar como borrador no comprueba los campos obligatorios**, así que un borrador puede quedar incompleto y solo te enterarás al enviarlo. El segundo: **no hay pantalla para editar un borrador**. Desde la ficha solo se puede enviar o cancelar. Si hay que cambiarle algo, se cancela y se crea otro.

**Un renglón sin descripción o con cantidad en cero no se envía, y el sistema no avisa de que lo descartó.** Revisa la lista antes de pulsar.

**Lo que escribes se convierte solo a mayúsculas y se le quitan las tildes.** Ocurre mientras tecleas, en todas las pantallas del módulo. La eñe se conserva. Se hace a la vista desde la primera letra para que no parezca que el sistema cambió el dato por su cuenta.

Del pedido sale un número: **SOL-2026-0001**.

### 9.5 El detalle de una compra

Se llega pulsando una tarjeta del tablero. **No está en el menú.**

Es la ficha completa: qué se pidió, qué cotizaron los proveedores, la orden emitida, los pagos y el historial. **Todas** las acciones que hacen avanzar una compra se ejecutan desde aquí.

En la cabecera está el título de la compra y, debajo, la línea que la identifica: **SOL-2026-0001 · Orden OC-2026-0007 · pedido por** el nombre y el cargo. El botón **Tablero** devuelve a la pantalla anterior.

#### Las tarjetas de la ficha

**Qué se pidió.** Lo que se pidió y para qué, con la etiqueta de estado a la derecha. La tabla tiene tres columnas: **Descripción**, **Cantidad** y **Unidad**.

**Cotizaciones.** Aparece mientras la compra está entre el paso 2 y el paso 4. Cada cotización es una tarjeta con el proveedor, su número — **COT-2026-0001** —, el RIF, la fecha, el total y su equivalente en la otra moneda, y tres datos más: **Entrega**, **IVA** y **Validez**. Si el proveedor numeró su papel, se ve también ese número. La cotización elegida lleva la etiqueta **Propuesta al gerente**, y la más barata lleva **Más económica**, que solo se muestra cuando hay más de una: comparar una sola cotización consigo misma no dice nada.

**Orden OC-…** La orden emitida, con el proveedor y la fecha de aprobación. Sus columnas son **Descripción**, **Cant.**, **Precio** y **Subtotal**, y se le añade **Recibido** en cuanto la orden está pagada: en verde si llegó todo, en naranja si llegó parte y en gris si no ha llegado nada. Al pie, **Subtotal**, **Descuento** y **Flete** cuando los hay, **IVA**, **Total** y el **Equivalente** en la otra moneda.

En la cabecera de esa misma tarjeta está el botón **Imprimir**, que saca **la orden de compra en papel**. Tiene su apartado enseguida.

**Pagos.** Aparece en cuanto hay instrucciones de pago: **Lo que se instruyó pagar y lo que tesorería ya ejecutó.** Cada instrucción muestra el método, cuándo se cargó, su estado — **Por pagar**, **Pagada**, **Devuelta a compras** o **Anulada** —, el monto, el impuesto cuando corresponde, los datos de la transacción y la nota entre comillas angulares.

**Historial.** **Quién movió esta compra y cuándo.** Cada línea trae el paso, el nombre de quien lo hizo, la fecha y hora y la nota que escribió. Si no hay nada todavía: **Sin movimientos todavía.**

**Qué sigue.** Es el panel lateral, y es el que hay que mirar primero: **muestra solo la acción que toca ahora**. En el teléfono sube al principio de la pantalla.

**Datos.** El resto de la ficha: **Pedido**, **Solicita**, **Cargado por** cuando quien teclea no es quien pide, **Creado**, **Prioridad**, **Se necesita**, **Destino**, **Confirmado por** y **Aprobado por**. Lo que falta se muestra como **—**.

#### Imprimir la orden de compra

**Esto es nuevo, y deshace la que era la peor limitación del módulo:** hasta ahora de compras no salía ningún papel, y la orden que se le mandaba al proveedor se hacía por fuera.

1. Abre la ficha de la compra. El botón **Imprimir** está en la cabecera de la tarjeta **Orden OC-…**, a la izquierda de la etiqueta de estado. Solo aparece cuando la compra ya tiene orden.
2. Se abre el visor con el título **Orden de compra** y el documento entero a la vista.
3. Revísalo y pulsa **Descargar**, o **Cerrar** si no hace falta. **Nada se guarda hasta que pulses Descargar.**

El archivo se llama `orden-compra-oc-2026-0007.pdf`.

**Sale con la misma cabecera que los demás papeles del sistema** (13.2): el logo, la razón social, la actividad, el RIF y el domicilio fiscal de la empresa, y a la derecha tres datos —**N° orden**, **Ref. pedido** y **Emitida**—. Debajo, entre dos rayas finas y centrado, el rótulo **ORDEN DE COMPRA**.

Lo que viene después, en este orden:

| Bloque | Qué trae |
| --- | --- |
| **Proveedor** | Nombre, **RIF**, **Teléfono** y **Dirección**. La empresa no se repite aquí: ya está arriba |
| **CONDICIONES** | **Departamento**, **Solicitante**, **Solicitada el**, **Finalidad**, **Notas**, **Clasificación**, **Entrega prometida**, **Forma de pago**, **Documentos**, **Aprobada por** y **Aprobada el**, **Confirmada por** y **Confirmada el** |
| **ÍTEMS** | La tabla: **SKU · Descripción · Categoría · Cantidad · Precio unit. · Subtotal**, y el **TOTAL** con su moneda |
| Desglose | **Subtotal**, **Descuento**, **Flete** e **IVA**, y **solo si hay algo que desglosar**. Una orden sin descuento, sin flete y exenta no los enseña en cero |
| **NOTAS / OBSERVACIONES** | Solo si la orden las lleva |

**La forma de pago va escrita en palabras** —«Crédito 30 días»—, nunca en el código interno.

**Una sola firma, centrada: Firma autorizada**, con el nombre debajo. La raya de «recibido por el proveedor» se quitó porque salía en blanco en todas las órdenes: la orden se manda por correo o por WhatsApp, no se le pone delante a nadie para que la firme, y una raya que nunca se llena enseña que las rayas de este papel no se firman. **Si quien autorizó lo hizo con un permiso concedido por otra persona, la firma lo dice**: *Firma autorizada · bajo autorización de* seguido del nombre.

Al pie de cada página: **Documento generado por el sistema**, el número del pedido del que salió y la fecha y hora, y a la derecha **Página 1 de 2** cuando pasa de una hoja.

**Una orden cancelada o anulada sale con el sello ANULADA cruzado en rojo.** Una orden cancelada que se imprimiera sin decirlo es una orden que alguien puede despachar por error.

#### Cuando alguien aprueba con un permiso que no es suyo por el puesto

Aprobar una compra es del gerente general por su puesto. Pero el sistema permite **extenderle esa facultad a una persona concreta y por un plazo** —el gerente se va de viaje, hay que seguir comprando—, y eso cambia dos cosas.

**La orden dice quién autorizó.** El papel impreso no firma solo con el nombre de quien aprobó: dice *Firma autorizada · bajo autorización de* seguido del nombre de quien le extendió el permiso. Quien recibe la orden ve de dónde viene la facultad.

**Y hay que dejar el respaldo.** A quien aprueba por su puesto no se le pide nada más. A quien aprueba con un permiso extendido se le exige subir el papel —el correo, el mensaje, la nota— que lo autorizaba. En la tarjeta **Papeles recibidos** aparece para eso un tipo más: **Respaldo de la autorización**.

**Ese tipo no se le ofrece a todo el mundo.** Solo lo ve quien puede aprobar, y solo sobre una orden que se aprobó de esa manera. A los demás ni siquiera aparece en la lista, porque el sistema se lo rechazaría: va por otra puerta, que pregunta si puedes aprobar en vez de si eres de compras.

#### El comprobante de pago

Cada instrucción **ya pagada** lleva su propio botón, **Comprobante de pago**, que saca un PDF con la misma cabecera que la orden. Es lo que se le manda al proveedor cuando pregunta si ya le pagaron.

Trae la orden y el pedido de los que sale, el proveedor, quién lo solicitó, la condición de pago, el total de la orden, el método con el que se pagó, el monto, la fecha y la referencia.

**Solo aparece cuando la instrucción está pagada.** Antes no hay nada que comprobar.

#### Los papeles que manda el proveedor

Debajo de la orden hay una tarjeta, **Papeles recibidos**: *"Lo que entregó el proveedor: el comprobante del pago, la nota de entrega, la factura. Con los años el papel se pierde; esta copia no."*

Cuelga de la orden, así que **no aparece hasta que la compra tiene orden**. Primero se elige **¿Qué papel es?** y después el archivo — en ese orden, para que nadie suba una factura rotulada como nota de entrega por ir rápido.

| Tipo | Cuándo |
| --- | --- |
| **Comprobante de pago** | El que manda el banco o el proveedor |
| **Nota de entrega** | El papel con el que llegó el material |
| **Factura del proveedor** | La que da derecho al crédito fiscal |
| **Otro papel** | Cualquier otra cosa que convenga guardar |

**Los archivos van a un sitio privado**, no a una dirección pública: se abren con un enlace que se firma en el momento y caduca a los cinco minutos. Un enlace público sería eterno y reenviable.

**Lo demás de compras sigue sin imprimirse**: ni la cotización, ni el tablero, ni la factura del proveedor.

#### Qué muestra Qué sigue en cada paso

| Estado de la compra | Si te toca a ti | Si le toca a otro |
| --- | --- | --- |
| **Borrador** | Botón **Enviar el pedido** | Nadie más lo ve |
| **Pedido** | Botón **Confirmar el pedido** (Compras) | **Esperando que compras lo confirme.** |
| **Confirmada · indicar proveedores** | Botón **Cargar cotización** y, en cada una, **Proponer al gerente** (Compras) | **Compras está pidiendo precios a los proveedores.** |
| **Por confirmar el gerente** | Botones **Aprobar la compra** y **Devolver a compras** (Gerencia general) | **Esperando la confirmación del gerente general.** |
| **Aprobada · indicar método de pago** | Botón **Indicar método de pago** (Compras) | **Compras está cargando el método de pago.** |
| **En tesorería** | Botones **Registrar el pago** y **Devolver a compras** en cada instrucción (Tesorería) | **Tesorería tiene la orden para pagar.** |
| **Pagada · falta que llegue** y **Recibida parcialmente** | Botón **Recibir material** (Almacén) | **La recepción la registra almacén.** |
| **El proveedor desistió**, con dinero pendiente | Botón **Resolver el dinero** (Gerencia general o Tesorería) | La tarjeta se queda a la vista hasta que se resuelva |

Antes de aprobar, el panel dice el monto exacto por el que se emitirá la orden y advierte que **a partir de ahí, el precio queda fijo**. Léelo: es la última pantalla en la que el precio todavía se puede discutir.

#### Cancelar

**Cancelar la compra** está disponible mientras el pedido esté en **Borrador**, **Pedido**, **Confirmada** o **Por confirmar el gerente**. Una vez emitida la orden, lo que se cancela es la orden.

**Cancelar la orden** solo lo ven Compras y Gerencia general, y solo mientras la orden esté en **Aprobada · indicar método de pago** o **En tesorería**. Después ya no: **si ya se pagó y el proveedor no entregó, lo que corresponde es marcar el desistimiento**, porque una cancelación borraría del tablero una compra que todavía tiene dinero de la empresa por resolver.

#### Los diálogos de motivo

Cinco acciones piden explicación antes de ejecutarse. Todas tienen el mismo campo **Motivo**, con la ayuda **Queda en el historial de la compra.**, y en todas **el botón de confirmar está apagado hasta que escribas cinco letras**. Sin motivo, dentro de un mes nadie sabrá qué pasó.

| Acción | Qué avisa el diálogo | Botón |
| --- | --- | --- |
| **Cancelar la compra** | **La tarjeta se va a la columna Cancelada y no se puede reabrir.** | **Cancelar la compra** |
| **Devolver a compras** *(desde gerencia)* | **Vuelve a la columna de cotizaciones para que consigan otra opción.** | **Devolver** |
| **Cancelar la orden** | **Solo se puede antes de que tesorería pague.** | **Cancelar la orden** |
| **El proveedor desistió** | **La compra ya está pagada. La tarjeta se queda a la vista hasta que se resuelva el dinero.** | **Marcar desistimiento** |
| **Devolver a compras** *(desde tesorería)* | **La instrucción no se paga y compras tendrá que corregirla.** | **Devolver** |

El diálogo **Resolver el dinero** es distinto: muestra cuánto se pagó y a quién, y tiene un solo campo, **Qué pasó con el dinero**, con tres opciones — **El proveedor lo devolvió**, **Queda como saldo a favor con el proveedor** y **Se dio por perdido** —. Empieza en la primera.

### 9.6 Proveedores

**Administración › Compras › Proveedores**

El registro de a quién se le compra: **A quién se le compra. El RIF y la condición de pago se usan al emitir la orden.** **Sin proveedores no se pueden cargar cotizaciones**, así que es lo primero que hay que llenar al arrancar el módulo.

La tabla tiene cinco columnas: **Proveedor**, **RIF**, **Contacto**, **Condición** y **Estado**. Muestra activos e inactivos, y **no tiene buscador ni filtros**.

Para **crear** uno, pulsa **Nuevo proveedor**. Para **editar** uno, pulsa **en cualquier parte de su fila**: no hay botón de editar y nada en la pantalla lo indica.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **RIF** | Sí | Con la forma J-12345678-9. Se puede escribir sin guiones y el sistema los pone |
| **Razón social** | Sí | Mínimo tres letras |
| **Nombre comercial** | No | |
| **Persona de contacto** | No | |
| **Teléfono** | No | |
| **Correo** | No | |
| **Condición de pago** | No | De contado, o crédito a 15, 30 o 60 días. Empieza en **De contado** |
| **Moneda con la que cotiza** | No | **Dólares**, **Bolívares** o **Euros**. Empieza en **Dólares** |
| **Dirección** | No | |
| **Notas** | No | |
| **Contribuyente especial — se le retiene IVA al pagar** | No | Viene desmarcada. Marcarla muestra un distintivo **Especial** en la lista |
| **Activo — aparece al cargar cotizaciones** | — | Viene marcada |

**La casilla de contribuyente especial ya no es un dato de referencia: manda.** Al registrar la factura de un proveedor marcado así, **el formulario propone la retención de IVA** con el porcentaje que la empresa tenga configurado en sus datos fiscales (13.2), y descuenta lo retenido del total a pagar.

**Se propone y se deja tocar, a propósito.** El porcentaje sube al 100 % cuando la factura no cumple los requisitos del reglamento, y eso lo ve quien tiene el papel delante, no el sistema. Si el proveedor no está marcado como contribuyente especial, o la factura no lleva IVA, no se propone nada.

**Lo que sigue sin calcularse es la retención de ISLR**: el campo está y admite el monto, pero hay que echar la cuenta aparte.

No hay que confundir esto con el IVA que retiene un cliente cuando la empresa le vende: eso sí lo calcula el sistema, y es asunto del módulo de Ventas.

**Un proveedor no se borra.** La única forma de retirarlo es desmarcar **Activo**, y entonces deja de aparecer al cargar cotizaciones. No se borra porque sus cotizaciones y sus órdenes anteriores tienen que seguir explicándose.

### 9.7 Cargar una cotización

Se llega desde la ficha de una compra confirmada, con el botón **Cargar cotización**. Solo lo ve el rol Compras.

Es donde se carga el precio que mandó cada proveedor, **tal como lo mandó**, para poder compararlos. La descripción del diálogo avisa de la regla principal: **Se carga tal como la mandó el proveedor. Cargar otra del mismo proveedor sustituye a esta.** Si lo que hace falta es cambiarle algo a una que ya está cargada, **no se vuelve a cargar: se corrige** — ver más abajo.

Antes de nada, el diálogo mira la tasa del BCV. Si la hay, avisa con qué tasa y de qué fecha se va a congelar la cotización, y dice si viene arrastrada de un día anterior. Si no la hay, aparece **No hay tasa del BCV registrada. Sin ella no se puede valorar la cotización.** con el enlace **Registrar la tasa de hoy**. Este es el bloqueo más frecuente al empezar el día, y se resuelve en **Sistema › Tasas de cambio**.

#### Los campos

En la cabecera: **Proveedor** — obligatorio, y hasta elegirlo el botón de guardar está apagado —, **Fecha**, que empieza en hoy, y **Moneda**. Al elegir el proveedor, el sistema cambia solo la moneda y la condición de pago a las suyas.

Debajo, en **Precios por renglón**, por cada renglón del pedido: **Cantidad**, que empieza en lo pedido, **Precio unitario** y la casilla **Exento de IVA**. Bajo cada renglón se lee lo que se pidió, para poder compararlo.

**Solo se guardan los renglones que tengan precio escrito.** Los que quedan en blanco se omiten sin avisar.

**La cantidad puede diferir de la pedida a propósito**, porque el proveedor vende por caja de doce y se pidieron diez. Se carga lo que él ofrece, no lo que se pidió.

Al pie: **Descuento** y **Flete**, que empiezan en cero; **IVA %**, que empieza en 16; **Entrega en (días)**; **Condición de pago**; **Validez (días)**, que empieza en 15; y **Observación**. Después, **Guardar cotización**.

El recuadro de totales que se ve mientras escribes — **Subtotal**, **Base imponible**, **IVA**, **Total** — es un adelanto. El total que queda guardado lo calcula el sistema al guardar.

#### Corregir una cotización ya cargada

Pasa todo el rato: la cotización está cargada y hay que ajustarle las condiciones de pago antes de proponerla —*la base se cancela en USDT y el IVA a la tasa oficial del BCV*—, o el proveedor corrige un precio.

**En la tarjeta de cada cotización hay un botón Editar**, junto a **Proponer al gerente** y **Eliminar**. Abre el mismo formulario del alta, **ya lleno con lo que la cotización dice hoy**, y se cambia lo que haga falta: la observación, las condiciones, los precios, el descuento, el flete, la fecha.

**Se corrige sobre la misma cotización.** Conserva su número —sigue siendo la COT-2026-0001— y su sitio en el historial del pedido, donde queda anotado que se corrigió y quién lo hizo.

**El proveedor no se puede cambiar.** Sale fijo, porque cambiarlo no sería corregir esta cotización sino cargar la de otro, y para eso está **Cargar cotización**.

**Si cambias la fecha, cambia la tasa.** La cotización guarda congelada la del día que lleva escrito, así que mover la fecha vuelve a pedir la tasa del BCV de ese día.

> **Una cotización propuesta al gerente no se corrige.** Los botones **Editar** y **Eliminar** desaparecen mientras lo esté, y si se intenta por otro camino el sistema se niega: *«Esta cotización está propuesta al gerente. Retira la propuesta antes de corregirla, o él aprobaría unas condiciones distintas de las que se le enseñaron.»* Se retira la propuesta, se corrige y se vuelve a proponer — y las tres cosas quedan anotadas.

**Tampoco se corrige una que ya generó su orden de compra**: a esas alturas sus precios están impresos en un papel que salió de la empresa.

#### Cómo se calcula el total

1. El **subtotal** es la suma de cantidad por precio de cada renglón.
2. El **descuento se reparte proporcionalmente sobre lo gravado**, para que un descuento aplicado sobre renglones exentos no rebaje el IVA que sí se debe.
3. El **flete forma parte de la base imponible**.
4. El **IVA** es esa base por el porcentaje.
5. El **total** es subtotal menos descuento, más flete, más IVA.

#### Una cotización por proveedor y por pedido

**Un proveedor solo puede tener una cotización en cada pedido.** Volver a cargarla sustituye a la anterior y **conserva el mismo número**. Recargar es corregir el precio del mismo documento, no emitir otro: si cambiara el número, el papel que tiene el proveedor en la mano dejaría de coincidir con el del sistema.

La tasa del BCV del día **queda congelada** dentro de la cotización, como evidencia de a qué cambio se valoró ese precio.

Una cotización se puede **Eliminar** mientras no esté propuesta al gerente y no haya generado una orden.

### 9.8 Recibir material

Se llega desde la ficha de una compra en **Pagada · falta que llegue** o en **Recibida parcialmente**, con el botón **Recibir material**. Solo lo ve el rol Almacén; los demás leen **La recepción la registra almacén.**

**Sin el papel del proveedor no se puede recibir.** Si en la tarjeta **Papeles recibidos** no hay ni factura ni nota de entrega, la ficha lo dice en ámbar: *"Falta el papel del proveedor. Sube la **factura** o la **nota de entrega** en «Papeles de la compra», aquí abajo, y se podrá recibir."*

**El comprobante de pago no sirve para esto**, y la propia pantalla lo aclara: *"El comprobante de pago puede llegar después."* Dice que se pagó, no que llegó — y lo que hay que respaldar al recibir es que el material entró.

Es lo que cierra el círculo: hasta aquí hay dinero pagado y nada en el almacén. La descripción del diálogo avisa de lo que más importa: **Lo que se registre aquí entra al inventario y no se puede editar después: una corrección se hace con un ajuste.**

En **Qué llegó** aparecen **solo los renglones que todavía tienen algo pendiente**, cada uno con lo pedido, lo ya recibido y lo que falta. Si no falta nada, se lee **Ya se recibió todo lo de esta orden.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Almacén que recibe** | Sí | Empieza en el almacén marcado para recibir compras |
| **Fecha de recepción** | No | Empieza en hoy. **No admite fechas futuras** |
| **Cantidad que llegó** | No | Uno por renglón. Empieza en todo lo que falta y no deja escribir más. **Déjalo en cero si este renglón no llegó todavía.** |
| **Nota** | No | Número de guía, quién trajo el material, estado en que llegó |

Después, **Registrar la recepción**. El botón está apagado si todas las cantidades están en cero, porque una recepción de nada no es una recepción.

Al registrar, el material entra al inventario con su propio número de movimiento y su costo en dólares, calculado con las tasas que quedaron congeladas en la orden. **Solo entra al inventario lo que es inventariable**: un flete o una reparación se compran y se pagan, pero no hay nada que guardar en un estante, así que la orden avanza sin generar movimiento.

El estado de la orden se recalcula solo: **Recibida** si no falta nada, **Recibida parcialmente** si falta algo.

#### La pantalla de Recepciones

El mismo diálogo se alcanza desde **Compras › Recepciones**, sin tener que abrir la compra. Es la lista de lo que está pagado y todavía no ha llegado, en orden de antigüedad del pago.

La diferencia no es de comodidad, es de punto de vista: quien sigue una compra la busca por su número, pero quien está en el portón ve llegar un camión y sabe **de qué proveedor viene y qué trae**, no de qué orden salió. Cada tarjeta enseña el proveedor, cuándo se pagó, cuánto costó y qué falta renglón por renglón, con **Llegó una parte** marcado cuando ya entró algo.

Debajo, **Lo último que entró**: las últimas treinta entradas al inventario por compra, con su número de movimiento, el material, el almacén y la cantidad. Sirve para comprobar de un vistazo que lo que se recibió hace un rato quedó registrado.

El botón **Registrar recepción** solo lo ve quien tiene Inventario en escritura.

### 9.9 Indicar el método de pago

Se llega desde la ficha de una compra en **Aprobada · indicar método de pago**, con el botón **Indicar método de pago**. Solo lo ve el rol Compras.

Sirve para decirle a tesorería **cómo y a quién** se le paga al proveedor: **Con esto la orden pasa a tesorería para que ejecute el pago.**

#### Antes de nada: con qué entrega el proveedor

Encima del botón, mientras no se responda, hay un recuadro naranja con esta pregunta:

> **¿Con qué entrega el proveedor?** *Solo la factura da derecho al crédito fiscal y entra en el libro de compras. Sin decirlo no se puede pagar.*

Se responde con uno de dos botones: **Nota de entrega** o **Factura**. **No hay tercera opción y no se puede posponer**: hasta que se pulse uno, el botón **Indicar método de pago** está apagado.

Se pregunta aquí y no dentro del formulario de pago a propósito. La base se niega a instruir un pago sin este dato, y descubrirlo después de llenar banco, cuenta, titular y cédula sería enseñar la puerta cerrada al final del pasillo.

Una vez respondido, el recuadro desaparece y queda una línea en gris: **El proveedor entrega con factura.** o **El proveedor entrega con nota de entrega.** Si fue factura, se añade el recordatorio: **Recuerda registrarla para poder descontar el IVA.**

**La respuesta no se puede cambiar desde la pantalla.** Hoy el recuadro solo se dibuja mientras la orden está en ese paso y todavía no se ha respondido; una vez respondida, o si la orden ya avanzó, no hay dónde corregirla. Si te equivocaste, avisa a quien administra el sistema. Lo único que sí impide el sistema es retroceder de factura a nota de entrega cuando la factura ya está registrada: «Esta orden ya tiene una factura registrada. Anúlala antes de decir que se entregó con nota de entrega.»

**Las órdenes que ya habían pasado de ese punto cuando esto se implantó se quedaron sin declarar**, y no hay pantalla para ponerlas al día. No es un error tuyo si te encuentras alguna.

| Campo | Detalle |
| --- | --- |
| **Cómo se paga** | Sale del catálogo de métodos, no de una lista escrita en la pantalla. Hoy son siete |
| **Moneda** | Empieza en la de la orden. Cada método decide qué monedas admite, así que a veces no hay nada que elegir |
| **Monto** | **Falta por pagar:** y la cifra. Empieza en lo que falta, no en el total |
| **Nota para tesorería** | Llamar antes de transferir, pagar solo en horario de oficina |

**Los métodos de pago son un catálogo, no una lista fija.** Cada uno trae escrito en qué moneda se puede usar y qué datos exige. Estos son los siete activos hoy:

| Método | Moneda | Qué datos pide |
| --- | --- | --- |
| **Transferencia bancaria** | Cualquiera | Banco, número de cuenta, titular y su documento |
| **Pago móvil** | **Solo bolívares** | Banco, teléfono y documento |
| **Efectivo** | Cualquiera | Quién recibe y su documento |
| **Zelle** | **Nunca bolívares** | Correo y titular |
| **Binance / USDT** | **Nunca bolívares** | Titular |
| **Cheque** | Cualquiera | Banco, número de cuenta y titular |
| **Otro** | Cualquiera | Ninguno |

**Todos menos el efectivo exigen la referencia al darse por pagados.** Es el número de la transferencia, del cheque o de la operación; en efectivo no hay ninguno que apuntar.

Para terminar, **Enviar a tesorería**.

**Cambiar el método borra los datos ya escritos** de la transacción, porque los datos de una transferencia no sirven para un pago móvil y dejarlos ahí solo produciría pagos a cuentas equivocadas.

Si la moneda no es el bolívar, el diálogo avisa en naranja: el pago **causa IGTF del 3 %**, y ese impuesto **sale además del monto**. Una transferencia o un pago móvil en bolívares no lo causan.

**Cuidado con los datos de la transacción: la pantalla no los marca como obligatorios, pero el sistema los exige al enviar.** Si falta alguno, la respuesta llega al pulsar **Enviar a tesorería**, con la lista completa de lo que hace falta según el método. Conviene rellenarlos todos antes.

#### Cambiar el método en una orden ya aprobada

Pasa a menudo: la orden se aprobó para pagarla por transferencia y el proveedor pide pago móvil, o al revés. **Antes había que devolver la orden a compras y volver a aprobarla.** Ya no.

Sobre una instrucción que siga **Por pagar** hay un tercer botón, **Cambiar el método**, entre **Registrar el pago** y **Devolver a compras**.

> **Cambiar el método de pago.** *La orden sigue aprobada y en la cola. Solo cambia por dónde sale el dinero.*

**Lo que no toca:** ni el monto, ni la moneda, ni el estado de la orden. La aprobación del gerente sigue valiendo, porque lo que él aprobó —qué se compra, a quién y por cuánto— no ha cambiado.

**Solo se ofrecen los métodos que sirven para la moneda que la instrucción ya tiene.** Si está en bolívares no aparecerán Zelle ni Binance, y si está en dólares no aparecerá el pago móvil.

**Hay que decir por qué, y es obligatorio.** El motivo pide un mínimo de cinco caracteres y **queda anotado**: quién lo cambió, cuándo, de qué método a cuál y con qué razón. No es burocracia — es la diferencia entre un cambio de método y un pago desviado a otra cuenta.

**Los datos de la transacción se piden de nuevo**, los que exija el método nuevo. Los del anterior no se conservan: los de una transferencia no sirven para un pago móvil, y dejarlos ahí solo produciría pagos a cuentas equivocadas.

#### Se puede pagar en partes

Una orden admite **varias instrucciones de pago**: mitad ahora y mitad al entregar. Por eso el **Monto** viene con lo que falta y no con el total.

**Y cada instrucción puede ir en una moneda distinta.** Es lo que permite la forma de comprar de la casa: **la base se cancela en divisa y el IVA en bolívares a la tasa oficial del BCV**.

Se hace en dos pasos, sobre la misma orden:

1. **Indicar método de pago** con la moneda de la divisa —USDT, dólares— y el monto de la base.
2. Otra vez **Indicar método de pago**, esta vez en **bolívares**, por el IVA.

**Debajo del monto hay tres botones que hacen la cuenta**: **Todo**, **Solo la base** y **Solo el IVA**, cada uno con su cifra ya calculada.

**La base se cubre primero**, que es el orden en que se paga aquí. Así que después de instruir la base entera, **Solo el IVA** ofrece el IVA completo y **Solo la base** desaparece: ya no queda base que pagar. Las dos cifras siempre suman lo que falta.

**Si la moneda elegida no es la de la orden, la cifra se convierte con la tasa que la orden lleva congelada**, no con la de hoy. Es la que el sistema usa para comprobar cuánto falta, así que es la única con la que la cuenta cuadra: convertir con la del día haría que el sistema rechazara el pago por unos céntimos en cuanto la tasa se moviera. La pantalla dice qué tasa está usando.

**El reparto solo se calcula pagando en la moneda de la orden o en bolívares.** Para otra divisa hace falta su tasa de hoy, que esta pantalla no tiene, y proponer un número aproximado sería ofrecer un pago que el sistema va a rechazar. En ese caso se escribe el monto a mano.

Es una propuesta: el monto que vale es el que quede escrito, y se puede corregir.

> **Cuidado con el IGTF, que es la mitad del motivo de repartir así.** Un pago en divisa causa el **3 %** y uno en bolívares no. Pagar el IVA en bolívares se ahorra ese 3 % sobre esa parte. La casilla del IGTF se propone según la moneda y se puede cambiar.

**Lo que falta por pagar se calcula en dólares y se vuelve a expresar en la moneda de la orden.** Es lo que permite mezclar monedas sin que la cuenta se descuadre: dos instrucciones, una de $9.140,66 y otra de Bs 1.151.755,29, cubren exactamente una orden de $10.603,17.

**La orden solo pasa a Pagada · falta que llegue cuando ya no queda nada por pagar.** Con un abono parcial se queda esperando el resto, porque mientras se le deba al proveedor la compra no está pagada.

#### Registrar el pago (tesorería)

Cuando la instrucción está **Por pagar**, quien tenga el rol **Compras** ve tres botones en ella: **Registrar el pago**, **Cambiar el método** y **Devolver a compras**. **No es tesorería quien paga**: ese rol se retiró con el módulo, y la propia función de la base exige el rol Compras. La cola de pagos vive hoy en **Administración › Compras › Pagos por hacer**.

**Registrar el pago** abre un diálogo con los datos del destino a la vista y tres campos:

| Campo | Detalle |
| --- | --- |
| **De qué cuenta sale** | **El saldo baja al confirmar.** Solo se ofrecen cuentas **en la misma moneda** de la instrucción |
| **Número de referencia** | **El número que devolvió el banco o la plataforma.** En efectivo es opcional |
| **Fecha del pago** | **Vacío es hoy. Es la fecha que aparece en el estado de cuenta.** |

Si en la cuenta elegida no alcanza el saldo, el diálogo lo dice y explica el camino: si el dinero ya está, lo que falta es registrar el ingreso o el saldo de apertura. Para terminar, **Confirmar el pago**.

Si no hay ninguna cuenta en esa moneda, se lee **No hay cuentas en Bolívares**. **Bancos y cajas ya no está en el menú**, así que crear una cuenta hoy lo hace el administrador (12.3).

### 9.10 Facturas de proveedor

**Administración › Compras › Proveedores › Facturas recibidas**

**Ya no es una entrada del menú: es la segunda pestaña de Proveedores**, y allí se llama **Facturas recibidas**. El título de la pantalla es **Facturas recibidas de proveedores**, y se presenta así: *"El papel que manda el proveedor por una orden ya aprobada. Es lo que sustenta el crédito fiscal del IVA."*

**Aquí no se registra ninguna factura**, aunque el manual anterior dijera que sí. Esta pantalla es la lista de lo que ya se recibió. **La factura nace en la ficha de la compra**, con el botón **Registrar factura** de la tarjeta de la orden, y solo cuando el proveedor declaró que entrega con factura. Es lo que impide que se cargue una factura suelta que no case con ninguna orden.

Cuando no hay ninguna, la pantalla lo dice: **Todavía no se ha recibido ninguna factura**.

#### Para qué sirve registrar la factura

Conviene decirlo en llano, porque es toda la razón de que esta pantalla exista.

Cuando la empresa vende, le cobra IVA al cliente y ese dinero no se queda en casa: hay que entregarlo. Cuando la empresa compra, le paga IVA al proveedor. Lo que la ley permite es descontar el IVA que se pagó del IVA que se cobró y entregar solo la diferencia, y ese descuento solo se puede hacer con la factura del proveedor registrada.

**Una compra sin su factura cargada termina pagando el IVA dos veces: una al proveedor y otra al fisco, porque no hubo con qué descontarlo.** No es papeleo: es dinero de la empresa que se queda en el camino. La propia pantalla lo dice mientras no haya ninguna factura, bajo el título **No hay facturas de proveedor**: **Sin la factura registrada, el IVA que se pagó no se puede descontar del que se cobró. Es dinero real que se queda en el camino.**

De ahí sale la regla práctica: **la factura del proveedor se carga aunque la compra ya esté recibida y pagada**, y se carga aunque no haya pasado por el tablero. Lo que le importa a esta pantalla es el papel, no el camino que siguió la compra.

#### Quién puede hacer qué

Aquí no manda el rol sino el nivel de permiso sobre Compras. Esta es la repartición que trae el sistema:

| Acción | Quién la tiene |
| --- | --- |
| Registrar una factura y registrar sus pagos | Compras, Operaciones, RRHH, Solicitante, Gerencia general y Administrador |
| Anular una factura o anular un pago | Gerencia general y Administrador |
| Solo mirar la lista | Almacén, Tesorería y Consulta |

Dos cosas de esa repartición conviene mirarlas de frente: **Tesorería no puede registrar el pago de una factura de proveedor**, aunque sea quien paga todo lo demás en la empresa, y **el rol de Solicitante sí puede**. Es como está repartido hoy el permiso sobre Compras. Si a la empresa no le sirve, se corrige en los permisos, no en esta pantalla.

Quien no llega al nivel que hace falta no ve el botón, y si llega por otro camino recibe «Tu usuario no tiene acceso a Compras.»

#### Qué se ve

Arriba, el título **Facturas de proveedor** y su frase. A la derecha, una etiqueta roja con las que ya se pasaron de fecha — **2 vencidas** — y el botón **Registrar factura**.

Debajo, la lista, con estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Factura** | El número que trae impreso y, debajo, **control** con el número de control cuando se cargó |
| **Proveedor** | El nombre y, debajo, el RIF |
| **Fecha** | La de emisión. Debajo, en rojo, **vencida hace 12 d**; o **vence 04/09/2026** si la factura es a crédito y todavía no se pasó |
| **Total** | El total de la factura, en la moneda en que está |
| **Saldo** | Lo que falta por pagar, **siempre en dólares**. En las que ya no están por pagar se ve un guion |
| **Estado** | **Por pagar**, **Pagada** o **Anulada** |

**El saldo se lleva en dólares aunque la factura esté en bolívares.** Se hace así porque a un mismo proveedor se le paga unas veces en una moneda y otras veces en la otra, y solo hay una forma de saber cuánto falta: llevar la cuenta en una sola.

Pulsando en cualquier parte de una fila se abre la ficha de esa factura.

**Sus dos limitaciones.** La lista **no tiene buscador ni filtros**, y muestra **las cuatrocientas facturas más recientes** por fecha de emisión. Es una limitación real: pasado ese número, una factura vieja deja de aparecer aquí aunque siga registrada.

Lo que registre otra persona aparece sin recargar la pantalla.

#### Registrar una factura

El diálogo se llama **Registrar factura de proveedor** y avisa de la regla principal: **Se copian las cifras del papel. Si la suma no coincide con el total impreso, el sistema se para antes de guardar.**

1. Pulsa **Registrar factura**.
2. Elige el **Proveedor**. La lista trae el RIF delante del nombre, para distinguir dos razones sociales parecidas.
3. Copia el **Número de factura** y, si lo trae, el **Número de control**.
4. Revisa la **Fecha de emisión**, que empieza en hoy, y elige la **Moneda** y la **Condición de pago**.
5. Escribe el **Exento** y la **Base imponible**. Al escribir la base, el sistema propone el **IVA**.
6. Compara el **IVA** propuesto con el del papel y corrígelo si no coincide.
7. Escribe el **Total impreso** y comprueba que el recuadro **Total** dé lo mismo.
8. Pulsa **Registrar**. Mientras guarda dice **Registrando…**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Proveedor** | Sí | Hasta elegirlo, el botón de guardar está apagado |
| **Número de factura** | Sí | El que trae impreso el papel. Es del proveedor, no nuestro |
| **Número de control** | No | El otro número impreso, con la forma 00-12345678 |
| **Fecha de emisión** | Sí | Empieza en hoy. **No admite fechas futuras** |
| **Moneda** | — | **Bolívares** o **Dólares**. Empieza en bolívares |
| **Condición de pago** | — | **De contado**, **Crédito 15 días**, **Crédito 30 días** o **Crédito 60 días**. Empieza en **De contado**, y de aquí sale la fecha de vencimiento que después se ve en la lista |
| **Exento** | No | **Lo que no lleva IVA** |
| **Base imponible** | No | Lo que sí lleva IVA |
| **Alícuota (%)** | — | Viene precargada con la alícuota general. Se cambia si el papel trae otra |
| **IVA** | No | **Se propone solo; manda lo que diga el papel.** Si lo pisas y no cuadra con la alícuota, debajo se lee **Por la alícuota daría 160.00** |
| **Total impreso** | No | **Opcional. Sirve para que el sistema compruebe la suma.** |
| **Observación** | No | |

El recuadro **Total** de la derecha se va sumando mientras escribes: es el exento, más la base imponible, más el IVA.

**No se teclean los renglones de la factura.** Una factura de proveedor puede traer cuarenta líneas y nadie las copia: lo que hace falta para descontar el IVA son esas cuatro cifras, y el detalle de qué llegó ya está en la recepción de la compra.

**Si escribes el total impreso y no cuadra con lo tecleado**, bajo ese campo aparece **Lo tecleado suma 1160.00** y el botón se apaga. Es a propósito: cuando la suma no da, o está mal el papel o está mal el tecleo, y las dos cosas hay que verlas ahora y no en la declaración.

El número de la factura, el de control y la observación se guardan en mayúsculas y sin tildes, como en el resto del módulo.

#### La ficha de una factura

Se abre pulsando su fila. Arriba, el número de la factura y, debajo, el proveedor y la fecha.

Luego una fila de etiquetas: el estado, la condición de pago, **Vencida hace 12 días** cuando aplica y **Orden OC-2026-0007** cuando la factura viene enlazada a una orden de compra. Si la factura está anulada, debajo se lee en rojo **Anulada:** con el motivo que se escribió.

Después, el desglose: **Exento**, **Base imponible**, **IVA** con su alícuota y **Total**. Si la factura está por pagar, al pie se lee **Pagado** una cifra **· falta** la otra, las dos en dólares.

Debajo, cuando ya hay alguno, la tarjeta **Pagos**. Cada pago muestra su número y cómo se pagó, y en letra pequeña la fecha y hora, la cuenta de donde salió, la referencia si la hay y el **IGTF** si lo causó. Los pagos anulados se quedan a la vista, más apagados y con la palabra **anulado** al lado.

Al final de la ficha está la tarjeta **El documento del proveedor**, que es donde se guarda el papel. Tiene su apartado enseguida.

Al pie del diálogo: **Cerrar**, **Anular** y **Registrar pago**, según lo que tu permiso alcance.

#### Guardar el papel de la factura

**Esto también es nuevo.** Hasta ahora la factura del proveedor se registraba como cifras y el papel se quedaba en una carpeta de la oficina. Ahora el archivo se guarda con la factura.

La tarjeta se llama **El documento del proveedor** y su subtítulo dice lo que admite: **PDF o foto del papel, hasta 10 MB.** Una vez cargado, cambia a **Guardado. Solo lo ven compras, tesorería y gerencia.**

1. Abre la factura pulsando su fila.
2. Baja a **El documento del proveedor** y pulsa **Cargar el documento**. Mientras sube dice **Subiendo…**
3. Al terminar, el nombre del archivo queda escrito al lado.

Para verlo, **Ver el documento** —mientras abre, **Abriendo…**—. Se muestra en el visor, con el título **Documento del proveedor** y el aviso **Tal como lo entregó. La dirección caduca en cinco minutos.** Abajo, **Cerrar** y **Descargar**. Se baja con el mismo nombre que tenía al subirlo.

Para quitarlo, el botón rojo **Quitar**, que solo tiene quien administra el sistema o tiene control total sobre Compras.

Cuatro cosas que conviene saber:

- **Quién lo ve y quién lo toca no es lo mismo.** Lo abren administración, gerencia, compras y tesorería; **lo suben y lo quitan solo administración y compras**. Tesorería paga contra el documento pero no lo produce.
- **Reemplazar borra el anterior.** No hay historial de versiones: el archivo que estaba se pierde.
- **Una factura anulada conserva su archivo**, a propósito. Anular es decir que ese documento no cuenta, no que no existió.
- **Si al cargar sale un mensaje en inglés**, es que el archivo pesa más de 10 MB o no es de los que se admiten: PDF, JPG, PNG, WEBP o HEIC. El selector de archivos deja elegir más cosas de las que el sistema acepta, así que el rechazo llega al final. Ese aviso viene sin traducir.

Si tu permiso es de consulta y todavía no hay archivo, la tarjeta dice solo **Todavía no se ha cargado.**

#### Registrar un pago

Desde la ficha, con el botón **Registrar pago**. El diálogo dice de quién es la factura y cuánto falta.

1. Elige **De qué cuenta sale**. Solo aparecen las cuentas abiertas.
2. Escribe el **Monto**. La etiqueta cambia sola y te recuerda en qué moneda estás escribiendo.
3. Elige **Cómo se pagó**: **Transferencia**, **Pago móvil**, **Efectivo**, **Binance** o **Cheque**.
4. Escribe la **Referencia**, que es el **Número de la transferencia**.
5. Revisa la casilla del IGTF.
6. Pulsa **Registrar el pago**.

**El pago se registra en la moneda de la cuenta.** Lo dice la propia ayuda del campo, y es la razón de que el saldo se lleve en dólares: se elige la cuenta y esa cuenta manda.

Sobre el IGTF. La casilla dice **Pagar el IGTF del 3%** y explica debajo: **Grava los pagos en divisas. No abona la factura: va en su propio asiento porque no es del proveedor sino del fisco.** **Viene marcada sola cuando la cuenta no es en bolívares**, y se puede desmarcar. Que vaya en su propio asiento importa: si se sumara al pago, parecería que al proveedor se le dio de más.

El dinero sale de la cuenta en el momento. Si en esa cuenta no alcanza el saldo, el sistema no deja registrar el pago y lo dice con el nombre de la cuenta y las dos cifras, porque una salida que deja la cuenta en negativo casi nunca es una salida real: falta cargar algo que sí entró.

**Una factura admite varios pagos.** Cuando ya no queda saldo, pasa sola a **Pagada**.

#### Anular un pago

En la tarjeta **Pagos**, cada pago vivo lleva su propio botón **Anular**, y solo lo ven Gerencia general y Administrador.

**Este botón no pide confirmación ni motivo: se ejecuta en cuanto se pulsa.** Conviene saberlo antes de acercarse al ratón.

El pago no se borra: se queda en la lista, apagado y marcado como **anulado**, y el dinero vuelve a la cuenta con un movimiento contrario. Si el pago causó IGTF, ese también se devuelve, con su propio movimiento. Y si la factura ya estaba en **Pagada**, vuelve a **Por pagar**.

#### Anular una factura

Desde la ficha, con el botón **Anular**, que solo ven Gerencia general y Administrador. El diálogo se llama **Anular la factura** con su número y avisa de lo que se pierde: **Sale del libro de compras y su crédito fiscal deja de contar.**

Escribe **Por qué se anula** —queda con tu nombre y la hora— y pulsa **Anular**. El botón está apagado hasta que escribas cuatro letras.

**Una factura anulada no vuelve.** Si estaba mal, se anula y se registra otra.

#### Lo que el sistema no deja hacer aquí

- **No deja registrar dos veces la misma factura del mismo proveedor**, porque registrarla dos veces descuenta dos veces el mismo crédito fiscal, que es justo lo que busca un reparo. El sistema responde con el número, el nombre del proveedor y esa razón.
- **No deja guardar si la suma no cuadra con el total impreso**, porque un descuadre que pasa aquí reaparece en la declaración, cuando ya no hay a quién preguntarle.
- **No deja registrar una factura con fecha futura**, porque una factura que todavía no se emitió no sustenta nada.
- **No deja registrar una factura que suma cero.** Si el exento, la base y el IVA quedan todos vacíos, no hay factura que registrar.
- **No deja editar una factura registrada.** No hay pantalla para corregirla: el camino es anularla, con su motivo, y registrar la correcta. Es la misma razón de siempre: lo que ya se declaró tiene que poder explicarse, y una cifra corregida por debajo no deja rastro de qué se declaró antes.
- **No deja anular una factura que tenga pagos vivos.** Primero se anulan los pagos, porque el dinero salió de una cuenta de verdad y tiene que volver con su propio movimiento antes de que la factura desaparezca del libro.
- **No deja pagar más de lo que falta**, ni pagar una factura anulada o ya pagada, porque un pago de más no es un pago: es un error que alguien tendrá que perseguir con el proveedor.
- **No deja registrar nada si no hay tasa del BCV** para la fecha de la factura. Sin ella no se puede valorar, y valorar con una tasa inventada es peor que no registrar. Se resuelve en **Sistema › Tasas de cambio**.
- **No se enlaza la factura con su orden de compra.** La pantalla no pregunta a qué orden corresponde, así que **no hay ningún cotejo entre lo que se pidió, lo que llegó y lo que facturaron**: si el proveedor factura más de lo que entregó, el sistema no lo nota. Esa comparación hoy la hace la persona, con los dos documentos delante.
- **No hay nada que imprimir aquí.** Ni la factura ni un comprobante del pago. Lo que se archiva sigue siendo el papel del proveedor.

### 9.11 El libro de compras

**Compras › Libro de compras.** Es la mitad de la declaración del IVA: el crédito fiscal, que es el impuesto que se pagó a los proveedores y que se descuenta del que se le cobró a los clientes. Sin este libro ese dinero se queda en el camino.

Arriba se elige el **mes**. Empieza en el mes pasado, que es el que casi siempre se viene a ver: el IVA se declara dentro de los primeros quince días del mes siguiente.

El **resumen** trae las cuatro cifras que van a la planilla —compras exentas, base imponible, crédito fiscal y total de compras— y debajo, la lista documento por documento. Si hubo retenciones, se dicen aparte.

**Todo está en bolívares**, convertido con la tasa que congeló cada factura, no con la de hoy. Aquí se compra en las dos monedas y el libro se declara en una sola; sumar la columna en moneda original daría un número que no es ni dólares ni bolívares. En las facturas en divisas se enseña además, en pequeño, la cifra tal como está impresa en el papel, para poder cotejar.

**Descargar** baja el libro en CSV para abrirlo en la hoja de cálculo desde la que se transcribe. Va separado por punto y coma, porque con coma se abriría partido por la mitad en una computadora configurada en Venezuela.

**Las facturas anuladas no aparecen.** El número de control de una factura de compra es del proveedor, no nuestro, así que un salto en su serie no es algo que la empresa tenga que explicar; una factura anulada de este lado es una fila que se cargó mal y no se declara. En el libro de ventas es al revés, y allá se explica por qué.

### 9.12 Lo que conviene entender

#### Quién pide, quién aprueba, quién recibe

El circuito reparte cada paso en un rol distinto:

| Paso | Quién lo hace |
| --- | --- |
| Pedir | Solicitante, Compras, Operaciones, Almacén o RRHH |
| Confirmar el pedido | Compras |
| Cargar, eliminar y proponer cotizaciones | Compras |
| Aprobar la compra | Gerencia general por su puesto, **y quien tenga ese permiso extendido** (13.1) |
| Devolver a compras | Gerencia general |
| Indicar el método de pago | Compras |
| Registrar el pago o devolver la instrucción | Tesorería |
| Recibir el material | Almacén |
| Cancelar la orden o marcar el desistimiento | Compras o Gerencia general |
| Resolver el dinero de un desistimiento | Gerencia general o Tesorería |

Aprobar es la única acción del sistema reservada a un solo rol. Todo lo demás lo puede hacer más de uno.

Fuera de esta tabla quedan **la factura del proveedor y sus pagos**, que no son un paso del circuito y no se reparten por rol sino por nivel de permiso sobre Compras. Están en su propia sección.

**Y aquí hay que decir algo con honestidad, porque afecta a cualquiera que audite estas compras.**

**El sistema comprueba el rol, pero no comprueba que sean personas distintas.** Al aprobar, mira que quien aprueba tenga el rol de Gerencia general y que la compra esté en el paso correcto. No compara nombres. Si una misma persona tiene los roles de Compras y de Gerencia general, **puede recorrer sola todo el circuito hasta la orden de compra**: pedir, confirmar, cargar la cotización, proponerla y aprobarla.

Lo mismo, y más amplio, ocurre con el rol de Administrador: **pasa siempre, en todo**. Puede pedir, confirmar, cotizar, aprobar, pagar y recibir él solo. Es deliberado: si un rol quedara sin asignar a nadie, el sistema se bloquearía y no habría forma de destrabarlo desde dentro.

La consecuencia práctica es una sola, y conviene tenerla presente al repartir los roles: **la separación de funciones aquí es una decisión de administración, no una barrera del sistema**. Lo que el sistema sí garantiza es el rastro: quién hizo cada paso y cuándo queda escrito en el **Historial** de la compra, y la ficha muestra **Cargado por** cuando quien teclea no es quien pide.

#### Aprobación por monto

**No existe.** Hay una sola aprobación, siempre, sea cual sea el monto: la del gerente general. Una compra de veinte dólares y una de veinte mil recorren exactamente el mismo camino y necesitan exactamente una firma. No hay topes, ni segundo aprobador, ni escalamiento por monto.

Se dice aquí para evitar el malentendido más caro posible: **nadie debe suponer que una compra grande se detendrá sola en alguna parte**. Si hace falta un control por monto, hoy es un acuerdo entre personas, no algo que el sistema imponga.

#### Recepciones parciales

Casi ninguna entrega llega completa a la primera, y el sistema está hecho contando con eso.

**Si llega menos de lo pedido**, se escribe en **Cantidad que llegó** lo que realmente llegó, y cero en los renglones que no llegaron. La orden queda en **Recibida parcialmente** y **sigue en el panel Pagada** del tablero. El botón **Recibir material** sigue disponible, y la próxima vez el diálogo muestra solo lo que falta. En la tabla de la orden, la columna **Recibido** se ve naranja mientras esté incompleto y verde cuando llegue todo. La orden pasa a **Recibida** sola cuando ya no falta nada.

Un detalle que sorprende y que es a propósito: **el contador de días sin recibir sigue corriendo** durante la recepción parcial, y la compra sigue apareciendo en el aviso de dinero que ya salió de la empresa. Mientras falte material pagado, el dinero sigue fuera.

**Si llega más de lo pedido, no se puede registrar.** El campo no deja escribir más de lo que falta, y si se intenta por otra vía el sistema corta. El motivo es que recibir de más no es un descuido: o llegó otra cosa, o el precio pactado ya no cubre lo que entró, y en cualquiera de los dos casos hay que mirarlo antes de meterlo al inventario. En la práctica se recibe lo pedido y el excedente se resuelve aparte, con un ajuste de inventario o devolviéndolo al proveedor; el sistema no tiene hoy un procedimiento propio para ese caso.

**Si el proveedor no entrega nunca**, se marca **El proveedor desistió** y después se usa **Resolver el dinero**.

#### Cómo se numeran los documentos

Cada documento lleva un número con la forma prefijo, año y cuatro cifras.

| Documento | Ejemplo | Cuándo se asigna |
| --- | --- | --- |
| Pedido | **SOL-2026-0001** | Al crear el pedido |
| Cotización | **COT-2026-0001** | Al guardar la cotización |
| Orden de compra | **OC-2026-0007** | Al aprobar la compra |
| Movimiento de inventario | | Al registrar la recepción |

Cuatro reglas que evitan discusiones:

- **El contador se reinicia cada año**, y el año se toma con la hora de Caracas, no con la del equipo desde el que se teclea.
- **El número lo asigna el sistema, nunca la pantalla.** Dos personas cargando a la vez obtendrían el mismo número si cada una lo calculara por su cuenta.
- **Cada número es único.** Puede haber huecos en la serie si una operación se cae después de tomar el número.
- **La numeración del pedido y la de la orden son independientes.** El pedido **SOL-2026-0001** puede terminar en la orden **OC-2026-0007**. Y si una orden se cancela y se emite otra para el mismo pedido, la nueva lleva su propio número.

Además de su propio número, la cotización guarda **el número que el proveedor puso en su papel**, cuando lo puso. Sirve para casar después su factura con lo que se cotizó. Ese cotejo lo hace la persona, mirando los dos documentos: el sistema guarda los dos números pero no los compara.

#### Lo que todavía no está construido

Conviene saberlo antes de buscarlo:

- **La orden de compra ya se imprime**, y su papel se guarda con el mismo membrete que la factura. **La cotización y el tablero siguen sin imprimirse.**
- **No hay pantalla para editar un pedido en borrador.** Solo se puede enviar o cancelar.
- **El sistema no coteja lo pedido con lo recibido y lo facturado.** La factura ya nace atada a su orden, pero nadie compara las cifras: si el proveedor factura más de lo que se pidió, o menos de lo que llegó, el sistema no lo dice. Ese cuadre lo sigue haciendo la persona.
- **Con qué entrega el proveedor no se puede corregir después.** Se declara una sola vez, en el paso 4, y no hay pantalla para cambiarlo ni para ponerse al día con las órdenes anteriores a que esto existiera.
- **El sistema sabe qué compras prometieron factura, pero no avisa de las que no la cumplieron.** Ese pendiente existe por dentro y todavía no sale en ninguna pantalla.
- **Lo que se debe por facturas de proveedor no aparece en la cola de Compras › Pagos por hacer › Por proveedor**, que sigue mostrando solo las instrucciones de pago de las órdenes. Lo que falta por pagar de una factura solo se ve en la columna **Saldo** de su propia pantalla.

### 9.13 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: Compras. Tu usuario no tiene ese rol.» | Ese paso le toca a otro rol | Pide el rol a administración, o que lo haga quien lo tenga |
| «Ponle un título al pedido: es lo que se lee en el tablero.» | El título tiene menos de cuatro letras | Escribe un título que se entienda desde el tablero |
| «Explica para qué es. Quien aprueba no está en el frente y necesita el porqué.» | La explicación tiene menos de diez letras | Escribe para qué se necesita |
| «Indica quién solicita: elige a alguien del sistema o escribe su nombre.» | No se eligió persona ni se escribió un nombre | Elige a alguien de la lista o escribe el nombre |
| «El nombre de quien solicita es demasiado corto para identificar a nadie.» | El nombre tiene menos de tres letras | Escribe el nombre completo |
| «Quien solicita no existe o está inactivo.» | Esa persona ya no está activa | Elige a otra persona o escribe su nombre |
| «El pedido necesita al menos un renglón.» | Ningún renglón tenía descripción y cantidad | Llena al menos un renglón completo |
| «El renglón 2 no tiene descripción.» | Ese renglón quedó sin describir | Escribe qué es, o quita el renglón |
| «La cantidad del renglón 2 debe ser mayor que cero.» | Falta la cantidad | Escribe cuánto se necesita |
| «El pedido ya fue enviado y no se puede editar. Cancélalo y crea otro.» | Un pedido enviado no se toca | Cancélalo y crea uno nuevo |
| «Solo quien creó el borrador puede editarlo.» | El borrador es de otra persona | Pídele a esa persona que lo envíe o lo corrija |
| «Solo se envía un borrador. Este pedido está en "Pedido".» | Ese pedido ya se envió | Revisa el tablero: ya está en circulación |
| «Solo se confirma un pedido recién enviado. Este está en "Confirmada".» | Ya alguien lo confirmó | Sigue por el paso siguiente |
| «No hay tasa BCV registrada para el 04/08/2026 ni para ninguna fecha anterior. Regístrala en Sistema › Tasas de cambio.» | Sin tasa no se valora nada | Registra la tasa del día y repite la operación |
| «Una cotización no puede tener fecha futura.» | La fecha es de mañana o después | Corrige la fecha |
| «La cotización necesita al menos un renglón con precio.» | Ningún renglón llevaba precio | Escribe el precio de al menos un renglón |
| «Las cotizaciones se cargan sobre un pedido confirmado. Este está en "Pedido".» | El pedido todavía no se confirmó | Que compras lo confirme primero |
| «El RIF "J123" no tiene forma válida. Se espera J-12345678-9.» | El RIF está mal escrito | Corrígelo con esa forma |
| «Ya hay un proveedor registrado con el RIF J-12345678-9.» | Ese proveedor ya existe | Búscalo en la lista. Si está inactivo, actívalo |
| «El nombre o razón social del proveedor es obligatorio.» | La razón social tiene menos de tres letras | Escribe la razón social completa |
| «Esta cotización está propuesta al gerente. Retira la propuesta antes de eliminarla.» | Es la que está en manos de gerencia | Propón otra, y después elimina esta |
| «Esta cotización ya generó una orden de compra y no se puede eliminar.» | De ahí salió la orden | Si la compra no procede, cancela la orden |
| «El pedido no tiene una cotización propuesta.» | No hay nada que aprobar | Que compras proponga una cotización |
| «Di qué hay que corregir: sin eso, compras vuelve a mandar lo mismo.» | El motivo de la devolución tiene menos de cinco letras | Escribe qué hay que corregir |
| «Esta orden está en "Pagada por recibir" y no admite instrucciones de pago.» | La orden ya está pagada | Revisa la tarjeta de pagos: el pago ya está hecho |
| «El monto a pagar debe ser mayor que cero.» | El monto quedó en cero | Escribe cuánto se paga |
| «Con esta instrucción se pagaría más que el total de la orden.» | Entre todas las instrucciones se pasa del total | Revisa lo ya instruido y ajusta el monto |
| «Faltan datos del pago. Transferencia: banco, cuenta, titular y documento. Pago móvil: banco, teléfono y documento. Binance: correo o billetera y titular. Efectivo: quién recibe y su documento.» | Faltan datos de la transacción | Rellena todos los datos del método elegido |
| «Falta el número de referencia de la transacción.» | Tesorería no puso la referencia del banco | Escribe el número que devolvió el banco |
| «Indica de qué cuenta sale el dinero.» | No se eligió la cuenta | Elige la cuenta desde la que se pagó |
| «La instrucción es por Bolívares y la cuenta "CAJA USD" está en Dólares. Elige una cuenta en Bolívares o cambia la instrucción.» | La cuenta no es de esa moneda | Elige una cuenta en la moneda de la instrucción |
| «Esta instrucción está en "Pagada" y no se puede volver a pagar.» | Ese pago ya se registró | Revisa la tarjeta de pagos |
| «Solo se devuelve una instrucción pendiente de pago.» | Esa instrucción ya no está por pagar | Revisa su estado en la tarjeta de pagos |
| «Esta orden está en "Recibida" y no admite recepción.» | Ya se recibió todo, o la orden no está pagada | Revisa el estado de la orden en su ficha |
| «El almacén indicado no existe o está inactivo.» | Ese almacén ya no está activo | Elige otro almacén, o pide que lo activen |
| «No se indicó ninguna cantidad recibida.» | Todas las cantidades quedaron en cero | Escribe lo que llegó de verdad |
| «De "FILTRO DE AIRE" se pidieron 10 y ya se recibieron 8. No se pueden recibir 5 más.» | Llegó más de lo pedido | Recibe lo que falta. El excedente se resuelve aparte |
| «Una orden en "Recibida" no se puede marcar como desistida.» | El desistimiento solo aplica a órdenes pagadas sin recibir del todo | Revisa el estado de la orden |
| «Describe qué pasó con el proveedor.» | El motivo del desistimiento quedó corto | Escribe qué ocurrió |
| «Esta orden no está marcada como desistida.» | No hay dinero pendiente que resolver | Revisa el estado de la orden |
| «Un pedido en "Aprobada" ya no se cancela desde aquí. Si ya hay orden de compra, cancélala en la orden.» | La compra pasó de la etapa de pedido | Cancela la orden desde su propia tarjeta |
| «Una orden en "Pagada por recibir" ya no se cancela. Si ya se pagó y el proveedor no entregó, márcala como desistida.» | Ya se pagó: cancelar borraría del tablero dinero pendiente | Usa **El proveedor desistió** y después **Resolver el dinero** |
| «Escribe por qué se cancela. Sin motivo, dentro de un mes nadie sabrá qué pasó.» | El motivo tiene menos de cinco letras | Escribe por qué se cancela |
| «Tu usuario no tiene acceso a Compras.» | Tu permiso sobre Compras no llega al nivel que pide esa acción | Pide el permiso a administración, o que lo haga quien lo tenga |
| «La factura necesita su número, que es el que trae impreso.» | El número de la factura quedó vacío | Copia el número que trae el papel |
| «No se registra una factura con fecha futura.» | La fecha de emisión es de mañana o después | Corrige la fecha |
| «La factura suma cero. Revisa el exento, la base imponible y el IVA.» | Las tres cifras quedaron vacías o en cero | Escribe las cifras del papel |
| «El papel dice 1160.00 y lo tecleado suma 1150.00. Revisa el exento (0), la base (1000) y el IVA (150).» | El total impreso no coincide con lo tecleado | Repasa las tres cifras contra el papel. Si el papel es el que está mal, resuélvelo con el proveedor |
| «La factura F-00123 de "FERRETERIA EL TORNILLO" ya está registrada. Registrarla dos veces descuenta dos veces el mismo crédito fiscal.» | Esa factura de ese proveedor ya se cargó | Búscala en la lista. Ya está |
| «Escribe por qué se anula la factura.» | El motivo tiene menos de cuatro letras | Escribe qué pasó con esa factura |
| «La factura F-00123 ya estaba anulada.» | Alguien la anuló antes | Revisa la lista: ya está fuera del libro |
| «La factura F-00123 tiene 1 pago(s) registrados. Anúlalos primero: el dinero salió y tiene que volver al libro con su propio asiento.» | Se quiere anular una factura que ya se pagó | Anula los pagos desde la ficha y vuelve a intentarlo |
| «La factura F-00123 está pagada y no admite pagos.» | Esa factura ya no debe nada | Revisa su ficha: el saldo está en cero |
| «El monto del pago tiene que ser mayor que cero.» | El monto quedó vacío o en cero | Escribe cuánto se paga |
| «A la factura F-00123 le faltan 500 $ y se están pagando 800 $.» | Se está pagando más de lo que se debe | Ajusta el monto a lo que falta |
| «En "CAJA USD" hay 100 USD y se intentan sacar 500. Si el saldo no está al día, registra primero el saldo de apertura o el ingreso que falta.» | No alcanza el saldo de esa cuenta | Elige otra cuenta, o pide a tesorería que ponga esa al día |
| «El pago PGC-2026-0001 ya estaba anulado.» | Otra persona lo anuló primero | Cierra y vuelve a abrir la ficha: ya está anulado |

---

## 10. Ventas

> **Hoy este módulo no se ofrece en el menú.** Está construido y sus pantallas funcionan —todo lo que cuenta este capítulo es cierto—, pero se dejó fuera del menú lateral mientras se termina de afinar, y quien escriba su dirección a mano se encuentra primero el cartel de **En construcción**. Lo que eso significa exactamente está en 1.5. El módulo ganó además una primera entrada, **Tablero**, que no existía cuando se escribió este capítulo.

Ventas es el camino del material hacia afuera: a quién se le vende, a cuánto, qué se le entregó, qué se le facturó y qué ha pagado. Las cinco pantallas están en el menú en ese mismo orden, que es el orden en que ocurren las cosas.

Hay una idea que conviene entender antes de tocar nada, porque es la que ordena todo el módulo:

**El material sale del patio con la nota de entrega, no con la factura.** Cuando registras un despacho, el sistema descuenta el material en ese instante. La factura viene después y es otro papel: el fiscal. Puede juntar varias notas de entrega y no mueve ni un kilo de inventario, porque el material ya salió.

De ahí se desprende lo demás: una nota de entrega mal hecha se corrige en el patio; una factura mal hecha se corrige con su número, que ya se consumió y no se recupera.

### 10.1 Quién entra y quién puede hacer qué

Para ver el módulo hace falta que administración le haya dado a tu usuario acceso a Ventas. Si no lo tiene, el grupo Ventas no aparece en el menú.

Dentro del módulo hay dos alcances distintos. El primero es **el trabajo del día**: cotizar, despachar, facturar y registrar cobros. El segundo es **el control total sobre Ventas**, que es como lo llaman las propias pantallas, y cubre las decisiones que comprometen dinero de la empresa: poner precios, dar crédito, vender por debajo del mínimo y anular.

| Rol | Ve el módulo | Cotiza, despacha, factura y cobra | Pone precios, da crédito, vende bajo el mínimo y anula |
| --- | --- | --- | --- |
| Ventas | Sí | Sí | No |
| Administrador | Sí | Sí | Sí |
| Gerencia general | Sí | Sí | Sí |

El rol Ventas está descrito así: **Cotiza, despacha material, factura y registra cobros.** Es el reparto de siempre en una empresa: quien despacha no decide a cuánto vende la empresa ni a quién se le fía.

**Cuando te falta permiso, el sistema no te dice cuál.** Siempre ves el mismo texto: «Tu usuario no tiene permiso para esta acción.» No es una falla ni un mensaje incompleto: es el único que llega hasta la pantalla. Si te sale al guardar un precio, al fijar un crédito o al anular, lo que falta es el control total sobre Ventas.

**El control total sobre Ventas no alcanza para todo.** Despachar mineral sin guía de movilización depende de otro permiso, el control total sobre Despachos, y por defecto solo lo tiene quien administra el sistema. Se explica en el capítulo de Despachos.

Una cosa más, que vale para todas las pantallas del módulo: **lo que escribes se convierte solo a mayúsculas y se le quitan las tildes** mientras tecleas. El **Correo** es la excepción y se guarda en minúscula.

### 10.2 El circuito de una venta

Esta es la sección que hay que leer aunque no se lea ninguna otra. Del cliente al cobro son seis pasos, y cada uno tiene un requisito para pasar al siguiente.

1. **Se registra el cliente.** **Ventas › Clientes › Nuevo cliente**. Sin cliente no se cotiza, no se despacha y no se factura. Hace falta el **RIF** y la **Razón social**; el **Domicilio fiscal** se imprime en la factura.
2. **Se le pone precio a lo que se vende.** **Ventas › Lista de precios**. Cada producto lleva un **Precio de lista**, que es el que se propone solo al cotizar y al despachar, y un **Precio mínimo**, que es el suelo. Un producto sin precio se puede elegir igual, pero hay que teclear el precio a mano.
3. **Se cotiza, si hace falta.** **Ventas › Cotizaciones › Nueva cotización**. Nace en **Enviada**. Desde el detalle se cierra con **La aceptó**, y pasa a **Aceptada**, o con **La rechazó**, y pasa a **Rechazada**. Este paso es opcional: se puede despachar sin haber cotizado. Una cotización no compromete existencias, así que aceptarla no aparta material.
4. **Sale el camión.** **Ventas › Notas de entrega › Despachar**. Hacen falta un cliente activo, el patio de donde sale, al menos un renglón con producto y cantidad, material suficiente en ese patio y la tasa del día registrada. **Y si en la nota va mineral, hace falta además una guía de movilización vigente**, que se carga antes en Despachos. La nota nace en **Por facturar**. **Este es el único paso que descuenta el patio.**
5. **Se emite la factura.** **Ventas › Facturación › Facturar**. Se marcan una o varias notas que estén en **Por facturar**, del mismo cliente y de la misma moneda. Si la condición es a crédito, el cliente tiene que tener límite fijado y la factura tiene que caber dentro de él. Las notas pasan a **Facturada** y la factura nace en **Por cobrar**.
6. **Se cobra.** Botón **Registrar cobro** dentro de la factura. Se pueden registrar varios abonos, en cualquiera de las dos monedas. **Cuando el saldo baja de un centavo de dólar, la factura pasa sola a Cobrada.** Nadie tiene que marcarla.

**Las vueltas atrás.** Todas exigen el control total sobre Ventas y todas dejan rastro:

- **Anular una nota que está en Por facturar** devuelve el material al patio y la nota queda en **Anulada**, a la vista. Pide motivo.
- **Anular una factura que está en Por cobrar** deja la factura en **Anulada** con su número, y **sus notas de entrega vuelven a estar en Por facturar**, listas para facturarse otra vez. Pide motivo y exige que no haya cobros vivos.
- **Anular un cobro** devuelve la factura de **Cobrada** a **Por cobrar**.

**Los dos papeles del camión ya no se escriben aquí.** El pesaje de la romana y la guía de movilización se registran antes, en su propio módulo, y al despachar se eligen de una lista. Al elegir el pesaje, los pesos y la placa se traen solos de la báscula; al guardar la nota, los dos papeles quedan gastados en ese viaje y no se pueden usar otra vez. Si la nota se anula, los dos vuelven a quedar libres. Todo eso está explicado en el capítulo de Despachos.

**Tres avisos sobre este circuito, para que nadie los descubra a mitad de camino:**

**Sin guía de movilización no sale mineral.** No es un aviso que se pueda pasar de largo: el despacho se rechaza entero y no se descuenta nada del patio. Solo quien tenga el control total sobre Despachos —que no es el control total sobre Ventas— puede autorizar una salida sin ella.

**La cotización aceptada no se convierte en despacho.** No hay botón que la pase a nota de entrega. Aunque el cliente haya aceptado, al despachar hay que volver a elegir el cliente y volver a cargar los renglones. Por lo mismo, el detalle de una cotización nunca llega a mostrar despachos asociados.

**Una cotización no se puede anular desde la pantalla.** Solo se puede cerrar como **Aceptada** o como **Rechazada**. Una oferta que se cayó se cierra con **La rechazó**.

### 10.3 Clientes

**Ventas › Clientes**

A quién se le vende. La propia pantalla lo resume: **A quién se le vende. La dirección se imprime en la factura y el límite de crédito se aplica al facturar.**

#### Qué se ve

Arriba, el botón **Nuevo cliente**. Si todavía no hay ninguno, aparece la tarjeta **Todavía no hay clientes** con el texto **Sin cliente no se puede despachar ni facturar. Empieza por los que se llevan material todas las semanas.** y el botón **Registrar el primero**.

| Columna | Qué muestra |
| --- | --- |
| **Cliente** | Razón social y, debajo, el nombre comercial si lo tiene |
| **RIF** | Tal cual |
| **Condición** | La condición de pago y, si retiene, el chip **Retiene IVA** |
| **Debe** | Lo que debe, en dólares. Debajo, **de $ X** si tiene límite, en rojo cuando la deuda lo pasó |
| **Última venta** | Fecha de la última factura no anulada, o **—** |
| **Estado** | **Activo** o **Inactivo** |

**No hay buscador ni filtros.** La lista trae todos los clientes, activos e inactivos, ordenados por nombre. Es una limitación real: con muchos clientes hay que buscar con los ojos.

Las cuatro condiciones de pago son **De contado**, **Crédito a 15 días**, **Crédito a 30 días** y **Crédito a 60 días**.

#### Registrar y editar

Pulsa **Nuevo cliente**. Se abre la ventana **Nuevo cliente**, con el aviso **El RIF y la dirección salen impresos en la factura.** Llena la ficha y pulsa **Guardar**.

Para editar, **pulsa en cualquier parte de la fila**. Se abre la misma ventana, titulada **Editar cliente**. No hay botón de editar.

**No se borra un cliente.** Se desmarca **Activo** y deja de aparecer al cotizar y al despachar, pero sus facturas y sus notas siguen donde están, que es lo que permite explicar una venta de hace un año.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **RIF** | Sí | Con la forma **J-12345678-9**: una letra V, E, J, P, G o C, guion, ocho dígitos, guion, un dígito |
| **Razón social** | Sí | Mínimo tres letras |
| **Nombre comercial** | No | |
| **Persona de contacto** | No | |
| **Teléfono** | No | |
| **Correo** | No | Se guarda en minúscula |
| **Domicilio fiscal** | No | La ayuda avisa: **Va impreso en la factura. Una factura sin la dirección del comprador está mal emitida.** |
| **Condición de pago** | Sí | Empieza en **De contado** |
| **Moneda con la que se le factura** | Sí | **Dólares** o **Bolívares**. Empieza en **Dólares** |
| **Límite de crédito, en dólares** | No | Solo aparece si la condición no es **De contado** |
| **Contribuyente especial — retiene IVA al pagar** | No | Viene desmarcada |
| **Porcentaje de IVA que retiene** | No | Solo aparece si la casilla anterior está marcada. Empieza en **75** |
| **Exento de IVA — sus documentos salen con alícuota cero** | No | Viene desmarcada |
| **Activo — aparece al cotizar y despachar** | — | Viene marcada |
| **Notas** | No | |

Dos ayudas de esta ficha conviene leerlas enteras, porque explican decisiones que después no se pueden discutir con el sistema. La del límite: **No es un aviso: por encima de este monto el sistema no deja facturarle a crédito. En cero, no se le vende a crédito.** Y la del recuadro naranja: **Dar crédito compromete dinero de la empresa. Solo lo puede fijar quien tenga control total sobre Ventas.**

La del porcentaje que retiene: **Normalmente 75%. Se descuenta de lo que hay que cobrarle, no del total de la factura.**

#### Qué no te deja el sistema

**Poner un límite de crédito, o cualquier condición que no sea De contado, exige el control total sobre Ventas.** La razón está escrita arriba: fiar es comprometer dinero de la empresa, y esa no es una decisión de la persona que carga el cliente.

**Dos clientes no pueden compartir RIF.** Si lo repites verás «Ya hay un cliente registrado con el RIF J-12345678-9.» El RIF es lo que identifica al comprador en la factura; repetido, la deuda de uno se mezcla con la del otro.

Y un aviso práctico: **el botón Guardar no se apaga aunque falten el RIF o la razón social.** La pantalla no lo comprueba antes; el rechazo llega después de pulsar, en un recuadro rojo dentro de la misma ventana. Revísalos antes de guardar y te ahorras el viaje.

### 10.4 Lista de precios

**Ventas › Lista de precios**

A cuánto se vende cada cosa, y por debajo de cuánto no se vende.

#### Qué se ve

El título **Lista de precios** y, a la derecha, si hay productos activos a los que no se les ha puesto precio, un aviso: **3 productos sin precio**.

**Aquí no se crean artículos.** Solo se les pone precio a los que ya están en el catálogo y son vendibles. Si el catálogo no tiene nada que vender, la pantalla dice **No hay nada que vender en el catálogo** y explica: **Los precios se le ponen a los artículos de categoría Producto o Servicio. Créalos primero en Inventario › Catálogo de artículos.**

| Columna | Qué muestra |
| --- | --- |
| **Producto** | Nombre y, debajo, el código, con **· servicio** si lo es y **· dado de baja** si el artículo no está activo |
| **Unidad** | La del artículo |
| **Precio** | El importe, o el aviso **Sin precio** |
| **Mínimo** | El importe, o **—** si es cero |
| **Actualizado** | Fecha del último cambio, o **—** |

La lista va ordenada por categoría y por nombre. **Sin buscador ni filtros.**

#### Poner un precio

1. Pulsa en cualquier parte de la fila del producto. Se abre una ventana titulada con el nombre del producto y el subtítulo **Precio por** su unidad.
2. Elige la **Moneda**: **Dólares** o **Bolívares**. Empieza en **Dólares**.
3. Escribe el **Precio de lista**.
4. Escribe el **Precio mínimo**, si va a haber suelo. En cero, no hay tope por abajo.
5. Pulsa **Guardar precio**.

Al pie de la ventana está la regla, escrita por la propia pantalla: **El mínimo no es una sugerencia: quien despacha no puede bajar de ahí. Solo lo salta quien tenga control total sobre Ventas. En cero, no hay tope por abajo.**

#### Qué no te deja el sistema

**El botón Guardar precio está apagado si el precio está vacío o en cero.** Un producto con precio cero se despacharía regalado sin que nadie lo note.

**El mínimo no puede ser mayor que el precio**, y el sistema lo dice con las dos cifras: «El precio mínimo (12.00) no puede ser mayor que el precio (10.00).» Un suelo por encima del techo dejaría el producto imposible de vender sin saltar el mínimo.

**Poner precios exige el control total sobre Ventas**, porque es decidir a cuánto vende la empresa, y esa decisión no la toma quien despacha.

Solo se le pone precio a productos y servicios. A un insumo el sistema responde «Solo se le pone precio de venta a lo que se vende. "45" es INSUMO.»

### 10.5 Cotizaciones

**Ventas › Cotizaciones**

Lo que se le ofrece al cliente antes de despachar. No compromete existencias.

#### Qué se ve

El botón **Nueva cotización**. Si no hay ninguna, la tarjeta **Todavía no se ha cotizado nada**, con el texto **Una cotización sirve para que el cliente sepa el precio antes de mandar el camión. También se puede despachar sin cotizar.** y el botón **Cotizar**.

| Columna | Qué muestra |
| --- | --- |
| **Número** | **COTV-2026-0001** |
| **Cliente** | Razón social |
| **Fecha** | La de emisión y, debajo, **vale hasta 19 ago 2026**; en naranja, **venció el 19 ago 2026**, si ya pasó |
| **Total** | Con el símbolo de su moneda |
| **Estado** | **Enviada** en azul, **Aceptada** en verde, **Rechazada** en rojo, **Anulada** en gris |

Se muestran **las 200 más recientes**, las nuevas primero, y no hay filtros ni buscador en pantalla.

#### Los renglones: el bloque donde se decide el precio

Este bloque es el mismo en **Nueva cotización** y en **Despachar material**, así que se explica una sola vez.

Cada renglón es un recuadro con el desplegable **Renglón 1**, que empieza en **Elige el producto** y muestra cada opción como el código, el nombre y su precio; **Cantidad**; **Precio por** la unidad del producto; **Total del renglón**, que se calcula solo; y la casilla **Exento de IVA**, que va renglón por renglón. Abajo, **Agregar renglón**. El botón **Quitar** está apagado cuando solo queda un renglón, porque un documento sin renglones no dice nada.

**Al elegir el producto, el precio se trae solo de la lista y queda editable.** Es a propósito: el precio se negocia. Si escribes uno por debajo del suelo, aparece el aviso amarillo **Por debajo del mínimo de $ 8,00** y el botón de guardar sigue encendido; quien decide es el sistema al guardar.

**Si el documento va en bolívares y el mínimo está en dólares, el aviso usa la tasa del día.** Cuando no hay tasa del día registrada, **el aviso no aparece**: un aviso calculado con una tasa inventada engaña más que el silencio.

**Un renglón a medio llenar no da error: se descarta.** Si dejas un renglón sin producto, o con la cantidad en cero, al guardar simplemente no viaja. Cuenta los renglones del documento guardado antes de imprimirlo.

#### Crear una cotización

1. Pulsa **Nueva cotización**. La ventana avisa: **El precio sale de la lista y se puede ajustar. La tasa queda congelada en el documento.**
2. Elige el **Cliente**. Solo aparecen los activos. **Al elegirlo, la moneda cambia sola a la que tenga el cliente.**
3. Carga los renglones.
4. Ajusta **Válida por (días)**, que empieza en **15**.
5. Escribe **Descuento** y **Flete**, si los hay. El descuento es un monto, no un porcentaje. El flete lleva la ayuda **Se le suma a la base imponible.**
6. Escribe la **Observación**, si hace falta.
7. Revisa el bloque de totales, que se recalcula mientras escribes: **Subtotal**, **Descuento** y **Flete** cuando los hay, **IVA 16%** y, tras una raya, **Total**.
8. Pulsa **Guardar cotización**.

Si el cliente está marcado como exento, la ventana lo dice: **ACME C.A. está registrado como exento: el documento sale sin IVA.**

#### Ver, cerrar e imprimir

Pulsa en la fila. Se abre el detalle con el número por título, los chips del estado, la tarjeta **Renglones** con las columnas **Descripción**, **Cantidad**, **Precio** y **Total** —los renglones exentos llevan el chip **Exento**— y el bloque de totales.

| Botón | Cuándo aparece | Qué hace |
| --- | --- | --- |
| **Cerrar** | Siempre | Cierra la ventana |
| **Imprimir** | Siempre | Genera el PDF y lo abre en el visor **Cotización** |
| **La aceptó** | Solo si está **Enviada** | La pasa a **Aceptada** |
| **La rechazó** | Solo si está **Enviada** | La pasa a **Rechazada** |

**Vencida no es un estado: es un cálculo.** Sale de la fecha más los días de validez. Se hace así a propósito: un estado que solo cambia con el paso del tiempo obliga a que alguien lo cambie, y el día que nadie lo cambie el papel queda mintiendo. **Una cotización vencida se puede aceptar o rechazar igual**; nada lo impide.

#### Qué sale de aquí

El PDF sale con la misma cabecera que los demás papeles del sistema (13.2): la razón social, la actividad, el RIF, el domicilio fiscal y, si están cargados, el teléfono y el correo; a la derecha, **N° COTIZACIÓN**, **FECHA** y **VÁLIDA HASTA**. Debajo, centrado entre dos rayas, el rótulo **COTIZACIÓN**. Después, el recuadro del cliente con **CLIENTE**, **RIF**, **DIRECCIÓN** y **TELÉFONO**, y la tabla **DESCRIPCIÓN · CANTIDAD · UNIDAD · PRECIO · TOTAL**, que se parte en hojas numeradas **Página 2 de 3**.

Bajo los totales sale siempre el equivalente en la otra moneda —**Equivale a Bs 45.320,00**— y, en el pie, la tasa usada: **Tasa del día: 235,4500 Bs/$**. Firman **Por la empresa** y **Aceptado por el cliente**, ambas con **Nombre, cédula y fecha**.

El pie dice, literal: **Los precios están expresados con la tasa del día indicada arriba y se ajustan al momento de facturar. Esta cotización no compromete existencias.**

### 10.6 Notas de entrega

**Ventas › Notas de entrega**

El papel con el que sale el camión. Al despachar, el material se descuenta del patio.

#### Qué se ve

El botón **Despachar**, con un camión. Si no ha salido ninguno: **Todavía no ha salido ningún camión**, con el texto **Cada despacho rebaja el patio y queda esperando por facturar. Si el patio está en cero, carga primero la producción desde Inventario › Existencias.**

| Columna | Qué muestra |
| --- | --- |
| **Nota** | **NE-2026-0001** y, debajo, el número de la factura si ya está facturada |
| **Cliente** | Razón social |
| **Vehículo** | La placa, o **—**, y debajo el chofer |
| **Fecha** | La del despacho |
| **Total** | Con el símbolo de su moneda |
| **Estado** | **Por facturar** en naranja, **Facturada** en verde, **Anulada** en gris |

Las 200 más recientes, sin filtros.

#### Despachar material

1. Pulsa **Despachar**. La ventana avisa: **Esto rebaja el patio en el acto. Si el camión no sale, hay que anular la nota.**
2. Elige el **Cliente**. La moneda se ajusta sola a la suya.
3. Elige **De qué patio sale**.
4. Carga los renglones. **Con el patio ya elegido, cada renglón dice cuánto hay**: **Hay 1.250 TON en el patio elegido.** Si pides más, la **Cantidad** se pone en rojo con **No hay tanto en el patio**.
5. Baja al recuadro del camión y la romana. El recuadro lo explica: **Datos del camión y de la romana. El peso no cambia lo que se factura: es la prueba del día que alguien discuta la cantidad.**
6. Elige el **Ticket de romana** de la lista, que trae los pesajes de salida que todavía no se han usado. **Al elegirlo, los pesos y la placa se traen de la báscula**, y no hay que teclearlos.
7. Elige la **Guía de movilización**. Si en la nota va mineral, este paso no es opcional.
8. Completa a mano lo que falte del camión.
9. Escribe el **Flete** y la **Observación**, si los hay.
10. Pulsa **Despachar**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Cliente** | Sí | Solo los activos |
| **Moneda** | Sí | Se sobrescribe con la del cliente |
| **De qué patio sale** | Sí | Solo almacenes activos |
| **Ticket de romana** *(la lista)* | No | Empieza en **Sin pesaje registrado**. Trae los pesajes de salida sin usar, con su placa y su neto |
| **Guía de movilización** | Sí, cuando hay mineral | Empieza en **Sin guía**. Trae las vigentes que no estén vencidas, con su material y sus toneladas |
| **Placa del vehículo** | No | Con la forma **A12BC3D**. Se llena sola al elegir el ticket |
| **Chofer** | No | Se llena solo al elegir el ticket |
| **Cédula del chofer** | No | Con la forma **V-12345678**. Se llena solo al elegir el ticket |
| **Ticket de romana** *(la casilla de texto)* | No | Se llena sola con el número del ticket elegido |
| **Peso bruto (kg)** | No | Se llena solo al elegir el ticket. Si lo escribes a mano, tiene que ser mayor que la tara |
| **Tara (kg)** | No | Se llena sola al elegir el ticket. Con el bruto puesto, debajo aparece **Neto: 28.500 kg** |
| **Flete** | No | |
| **Observación** | No | |

**Hay dos campos con el mismo nombre y no es un error.** Arriba está la lista **Ticket de romana**, donde se elige el pesaje; abajo, la casilla de texto **Ticket de romana**, que se llena sola con el número al elegirlo. La casilla se puede escribir a mano cuando el pesaje no esté registrado en el sistema, pero si eliges un ticket de la lista, lo que se guarda es el número de ese ticket y no lo que hayas tecleado.

**Con un ticket elegido, los pesos que se guardan son los de la báscula.** Aunque escribas otros encima, el sistema guarda los del pesaje. Los pesos no se teclean a mano porque teclearlos otra vez es la forma de que el papel y la báscula terminen diciendo cosas distintas, y ese día ninguno de los dos sirve para discutir la cantidad con el cliente.

Con la placa, el chofer y la cédula ocurre lo contrario: si las escribes tú, se respeta lo que escribiste, y solo se toman del ticket cuando las dejas en blanco. Es a propósito, porque el chofer que se anotó en la garita puede no ser el que se llevó el camión.

Debajo de las dos listas hay ayudas que conviene leer. Si no hay pesajes disponibles: **No hay pesajes sin usar. Se registran en Despachos › Tickets de romana.** Y bajo la guía, siempre: **Ninguna salida de mineral viaja sin guía.** Si no hay ninguna vigente, el aviso sale en rojo: **No hay guías vigentes: el despacho de mineral se rechazará**.

**Ninguna salida de mineral viaja sin guía.** Cuando la nota lleva un producto de cantera y no se eligió guía, el despacho se rechaza entero: no queda nota y no sale nada del patio. El sistema lo dice así: «Este despacho lleva mineral y no tiene guía de movilización. Cárgala en Despachos › Guías, o pídele a quien tenga control total sobre Despachos que lo autorice sin ella.» La razón es que la guía es lo que hace legal que el camión circule con la piedra, y el sistema es el último sitio donde se puede impedir que salga sin ella. Si la nota es solo un flete, no hace falta guía.

La excepción existe y conviene decir cómo funciona: **quien tenga el control total sobre Despachos puede despachar sin guía**, para los días en que el papel llega tarde y el cliente está esperando. **Esa nota queda guardada sin guía y quien la despachó queda en el registro de auditoría**, que solo abre la administración. Ninguna pantalla ni el PDF muestran una etiqueta que lo señale. El detalle está en el capítulo de Despachos.

**En el despacho no hay campo de descuento.** Conviene saberlo antes de negociar: como la factura suma lo que traen sus notas, **ninguna factura emitida desde el sistema puede llevar descuento**. Si hay que rebajar, se rebaja en el precio del renglón.

**Escribe la tara siempre menor que el peso bruto.** Si la pones mayor, el sistema rechaza el despacho, pero con un mensaje sin redactar que no se entiende. No es que hayas roto nada: es esa comprobación. Con un ticket de romana elegido esto no llega a pasar, porque los dos pesos vienen de la báscula y allí ya se comprobaron.

#### Ver una nota, imprimirla y anularla

Pulsa en la fila. El título es el número y el subtítulo dice de qué patio salió. Dentro están los chips del estado, la placa, **Neto 28.500 kg** si hay pesos y **En la factura FAC-2026-0012** si ya se facturó. Si está anulada, en rojo: **Anulada:** y el motivo.

Los botones son **Cerrar**, **Imprimir** —abre el visor **Nota de entrega**— y **Anular**, en rojo, que **solo aparece mientras la nota está en Por facturar**. Una nota ya facturada no se anula desde aquí: primero se anula la factura, porque el número fiscal ya se emitió y tiene que quedar explicado.

Para anular:

1. Se abre **Anular la nota NE-2026-0007**, con el aviso **El material vuelve al patio con un reverso. La nota se queda a la vista, anulada.**
2. Escribe **Por qué se anula**. La ayuda avisa: **Queda escrito en el registro de auditoría con tu nombre.**
3. Pulsa **Anular la nota**.

**El botón está apagado hasta que el motivo tenga al menos cuatro letras**, y anular exige el control total sobre Ventas. La razón es que anular un despacho devuelve al patio material que nadie contó: es una corrección, no una operación del día.

#### Qué sale de aquí

El PDF sale con la cabecera de la casa, como los demás, **pero el rótulo NOTA DE ENTREGA va en naranja** y no en el azul del resto. Es lo único que cambia de color en todo el sistema, y es a propósito: la nota es un papel de patio, se lee con guantes, y en un fajo de hojas mezcladas el color es lo que la separa de una factura sin tener que leer ninguna. A la derecha van **N° NOTA** y **FECHA**; bajo el recuadro del cliente, una segunda fila con **VEHÍCULO**, **CHOFER**, **CÉDULA** y **TICKET · PESO NETO**. Firman **Entregado por** y **Recibido conforme**, distintas a propósito de las de la cotización y la factura.

El pie es lo más importante del papel: **ESTE DOCUMENTO NO ES UNA FACTURA. Ampara el traslado del material; la factura se emite aparte. Quien recibe firma conforme el material y el peso.**

### 10.7 Facturación

**Ventas › Facturación**

Se factura contra notas de entrega: una, o todas las de la semana de un cliente.

#### Qué se ve

El botón principal **cambia de texto según haya cola**: **Facturar (3 por facturar)** cuando hay notas esperando, o **Facturar** a secas y **apagado** cuando no hay ninguna. No es un fallo: **sin nota de entrega no hay nada que facturar.**

| Columna | Qué muestra |
| --- | --- |
| **Factura** | **FAC-2026-0012** y, debajo, el número de control **00-00000034** |
| **Cliente** | Razón social |
| **Fecha** | La de emisión y, debajo, **vence 03 sep 2026** o, en rojo, **vencida hace 12 d** |
| **Total** | En la moneda de la factura |
| **Saldo** | **Siempre en dólares**, y solo mientras la factura está en **Por cobrar** |
| **Estado** | **Por cobrar** en azul, **Cobrada** en verde, **Anulada** en gris |

#### Emitir una factura

1. Pulsa **Facturar (3 por facturar)**. Se abre **Emitir factura**, con la regla: **Marca las notas de entrega que van en esta factura. Tienen que ser del mismo cliente y la misma moneda.**
2. Marca las notas. Cada una muestra su número, el cliente, la fecha, la placa y cuántos renglones trae.
3. **En cuanto marcas la primera, las que no son compatibles se apagan solas.** Compatible quiere decir mismo cliente y misma moneda: una factura es de un solo cliente, y bolívares y dólares no se pueden sumar en el mismo total.
4. Elige la **Condición de pago**, o déjala en **La que tenga el cliente**. La ayuda avisa: **A crédito, el sistema comprueba el límite del cliente antes de emitir.**
5. Escribe la **Observación**, si hace falta.
6. Revisa el resumen sombreado: **2 nota(s) de ACME C.A.** con el total sumado.
7. Pulsa **Emitir la factura**.

Si abres la ventana y no hay cola, dentro dice **No hay notas por facturar** y **Todo lo despachado ya está facturado.**

#### Ver una factura y cobrarla

Pulsa en la fila. El título trae el número y el número de control. Dentro están los chips del estado, la condición de pago, **Vencida hace 12 días** si aplica y **Retiene IVA** si el cliente retiene; la tarjeta **Renglones**; y el bloque de totales, que **cuando hay retención añade dos líneas**: **IVA que retiene el cliente**, en negativo, y **A cobrar**.

Mientras la factura está en **Por cobrar** verás debajo **Abonado $ 400,00 · falta $ 800,00** y la explicación **El saldo se lleva en dólares porque se cobra en las dos monedas.**

Si hay cobros, aparece la tarjeta **Cobros**: cada uno con su número y su método, la fecha y la hora, la cuenta, la referencia y el **IGTF** si lo hubo. Los anulados se ven más pálidos, con el sufijo **· anulado**.

| Botón | Cuándo aparece | Qué hace |
| --- | --- | --- |
| **Cerrar** | Siempre | Cierra la ventana |
| **Imprimir** | Siempre | Genera el PDF y lo abre en el visor **Factura** |
| **Registrar cobro** | Solo mientras está **Por cobrar** | Abre la ventana de cobro |
| **Anular** | Solo mientras está **Por cobrar** | Abre la ventana de anulación |

Para registrar un cobro se abre **Cobrar la factura FAC-2026-0012**, con el cliente y cuánto falta en el subtítulo.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **A qué cuenta entró** | Sí | Solo cuentas activas. Ayuda: **El cobro se registra en la moneda de la cuenta.** |
| **Monto** | Sí | La etiqueta cambia a **Monto en USD** o **Monto en VES** al elegir la cuenta |
| **Cómo pagó** | Sí | **Transferencia**, **Pago móvil**, **Efectivo**, **Zelle**, **Binance**, **Cheque** u **Otro**. Empieza en **Transferencia** |
| **Referencia** | No | **Número de la transferencia** |
| **Cobrarle el IGTF del 3%** | No | Viene marcada cuando la cuenta no es en bolívares. Se puede desmarcar |

La casilla del IGTF lo explica en su propia letra chica: **Grava los pagos en divisas. No abona la factura: es un impuesto que se recauda y se entera al SENIAT, y va en su propio asiento del libro.** Es decir: **el IGTF no baja el saldo.** Si el cliente debe $800 y le cobras el impuesto, sigue debiendo $800 hasta que pague los $800.

Se pueden registrar tantos abonos como haga falta. **Cuando el saldo baja de un centavo de dólar, la factura pasa sola a Cobrada.**

#### Anular una factura y anular un cobro

Anular la factura abre **Anular la factura FAC-2026-0012**, que empieza aclarando qué pasa: **La factura no se borra: se queda con su número, marcada como anulada. Sus notas de entrega vuelven a estar por facturar.** Y dentro, el límite de la herramienta: **Anular sirve mientras la factura no haya salido de la empresa. Una que ya está en manos del cliente se corrige con nota de crédito, no anulándola.**

El motivo es obligatorio y el botón **Anular la factura** está apagado hasta las cuatro letras. **Una factura con cobros registrados no se anula**: primero se anulan los cobros, porque el dinero entró y tiene que salir del libro con su propio asiento.

Los cobros se anulan con el botón **Anular** de la tarjeta **Cobros**. **No pide motivo**: el sistema graba uno fijo. Conviene saberlo, porque el registro de auditoría de ese cobro no va a explicar nada; si la anulación necesita explicación, escríbela en la observación de la factura o déjala anotada donde la empresa lleve esas cosas.

Anular un cobro devuelve la factura de **Cobrada** a **Por cobrar** y, si hubo IGTF, también lo reversa. Como toda anulación del módulo, exige el control total sobre Ventas.

#### Qué sale de aquí

El PDF sale con la cabecera de la casa (13.2) y, a la derecha, cuatro datos: **N° FACTURA**, **FECHA**, **VENCE EL** y **N° DE CONTROL**. Debajo, centrado, el rótulo **FACTURA**. En el recuadro del cliente van **CLIENTE**, **RIF**, **DIRECCIÓN** y **CONDICIÓN**; cuando hay condición de pago, esa casilla ocupa el sitio del teléfono.

**Un renglón exento de IVA lleva la marca (E)** pegada a su descripción, y al pie de la tabla sale la línea que la explica: **(E) Renglón exento de IVA.** Si ningún renglón es exento, no aparece nada.

Los totales son **Subtotal**, **Descuento**, **Flete**, **IVA 16%**, raya y **TOTAL**, más **IVA retenido por el cliente** y **A pagar** cuando hay retención, y debajo el equivalente en la otra moneda. Firman **Por la empresa** y **Aceptado por el cliente**.

El pie dice: **La retención del IVA, cuando aplica, la declara y entera el comprador. Original: cliente. Copia: archivo.**

> **Lo que esta factura todavía no imprime, y hace falta para que sea completa ante el SENIAT:** la **base imponible**, el **total exento** en los totales, el **desglose por alícuota** —hoy solo admite una, así que una factura mixta no se puede expresar— y los **datos de la imprenta autorizada** con su número de autorización, que no existen en ninguna pantalla del sistema. Está anotado en el capítulo 15.

### 10.8 Notas de crédito

**Ventas › Notas de crédito.** Es el papel que corrige una factura que ya salió de la empresa. Solo lo emite quien tiene Ventas en control total.

Sirve para cuatro cosas, y se elige cuál en **Por qué se corrige**:

| Motivo | Cuándo |
| --- | --- |
| **Devolución de material** | El cliente devolvió lo despachado |
| **Se facturó de más** | El precio o la cantidad quedaron por encima de lo acordado |
| **Descuento posterior** | Una rebaja acordada después de emitir la factura |
| **Dejar la factura sin efecto** | La venta no ocurrió, pero la factura ya estaba en manos del cliente |

#### Cómo se emite

Con **Emitir nota de crédito**. Primero se elige la factura; **las anuladas no aparecen**, porque a una factura sin efecto no hay nada que restarle.

Al elegirla, **la nota se arma sobre los renglones de esa factura**, no en blanco. Corregir es decir «de esto que facturé, esto de aquí sobra», y para eso hay que tener delante lo que se facturó. Se marca el renglón que sobra y se ajusta la cantidad o el precio.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Factura que se corrige** | Sí | Solo las que siguen en pie |
| **Fecha de la nota** | Sí | Empieza en hoy. **No puede ser anterior a la factura** |
| **Por qué se corrige** | Sí | Los cuatro motivos de arriba |
| **Motivo** | Sí | Lo lee el cliente, lo lee el SENIAT y lo lee quien abra esto en un año |
| **¿Vuelve al patio?** | No | Por renglón. El almacén al que entra el material devuelto |

**El material puede volver o no volver.** Si se despachó piedra 2 cuando pidieron piedra 1 y el cliente la devuelve, ese renglón lleva almacén y el material entra al inventario con su propio movimiento. Si lo que se corrige es el precio, no se mueve ninguna piedra. Es el mismo papel para las dos cosas porque para el SENIAT lo es.

#### Lo que la nota hace y lo que no hace

- **Congela la tasa de la factura, no la de hoy.** Una nota que devuelve cien dólares de una factura de hace tres semanas tiene que restar los mismos bolívares que aquella sumó. Con la tasa de hoy restaría otra cosa y la factura no cerraría nunca en cero. La pantalla lo dice al elegir la factura.
- **Gasta su propio número de control**, de la misma serie que las facturas: la numeración autorizada de la imprenta corre continua sobre todos los documentos fiscales, no una por cada tipo de papel.
- **Baja lo que el cliente debe**, y también lo que tiene consumido de su cupo de crédito.
- **No mueve dinero.** Si la factura ya estaba cobrada, eso es plata que hay que devolverle al cliente y sale de tesorería con su propio asiento. La nota baja lo que se debe; no firma cheques.
- **No puede pasarse.** Entre todas las notas de una factura no se devuelve más de lo que la factura cobró. La pantalla descuenta lo que esa factura ya tiene acreditado y lo dice con números antes de dejar guardar.

#### Anular una nota

Desde su ficha, con **Anular**. El número de control se gastó y no vuelve: queda la nota anulada con su motivo, que es lo que el SENIAT espera encontrar. Si había entrado material, vuelve a salir.

**No se puede anular si ese material ya se vendió otra vez**: deshacer la devolución dejaría el patio en negativo. El sistema lo dice con la cantidad exacta que falta.

#### Corregir o anular, no las dos

Una factura que ya tiene notas de crédito **no se puede anular**. O se corrige con notas o se deja sin efecto, porque si no quedarían notas colgando de una factura que ya no existe. Si de verdad hay que anularla, primero se anulan sus notas.

### 10.9 El libro de ventas

**Ventas › Libro de ventas.** La otra mitad de la declaración: el débito fiscal, que es el IVA que se le cobró a los clientes.

Funciona igual que el libro de compras —se elige el mes, empieza en el pasado, se descarga en CSV, todo en bolívares a la tasa de cada documento—, con dos diferencias que conviene entender:

**Las notas de crédito van en este mismo libro, en negativo.** No son un anexo ni un libro aparte: para el SENIAT son ventas del período con signo contrario. Cada una dice a qué número de control corrige.

**Las facturas anuladas sí aparecen, en cero y marcadas.** Aquí el número de control es el nuestro y tiene que correr continua. Un salto sin explicación en la serie es lo primero que se busca en una fiscalización; una fila que dice «anulada» lo explica sola.

Al pie, la suma del período con las notas ya restadas. Es lo que va a la planilla.

### 10.10 Lo que conviene entender

#### La nota de entrega y la factura no son el mismo papel

Es la confusión más común, y sale cara: quien la tiene, o le entrega al cliente una nota creyendo que ya facturó, o factura dos veces lo mismo.

| | Nota de entrega | Factura |
| --- | --- | --- |
| Qué es | El papel con el que sale el camión | El documento fiscal |
| Lo dice el propio papel | **ESTE DOCUMENTO NO ES UNA FACTURA.** | — |
| Numeración | **NE-2026-0001** | **FAC-2026-0012** más el número de control **00-00000034** |
| ¿Mueve el patio? | Sí, en el acto | No. El material ya salió con la nota |
| Cuántas | Una por camión | Una puede juntar varias notas del mismo cliente y misma moneda |
| Datos propios | Vehículo, chofer, cédula, ticket de romana, peso, guía de movilización | Número de control, condición de pago, vencimiento, retención |
| Color de la banda | Naranja de seguridad | Azul de la casa |
| Firmas | **Entregado por** / **Recibido conforme** | **Por la empresa** / **Aceptado por el cliente** |
| Estado al nacer | **Por facturar** | **Por cobrar** |

Una cosa más, que importa cuando algo se corrige: **al facturar, los renglones se copian a la factura, no se leen de la nota**. Por eso la factura sigue diciendo lo mismo aunque después alguien anule la nota de la que salió.

**Anular no es lo mismo que corregir.** Anular sirve mientras la factura no ha salido de la empresa: se rompe el papel y se hace otro. En cuanto está en manos del cliente, él tiene un documento fiscal con un número de control que existe —y el SENIAT también—, y entonces lo que corresponde es la **nota de crédito**, que tiene su propia sección más adelante.

#### Cómo se descuenta el inventario al despachar

Cuando pulsas **Despachar**, el sistema hace todo esto de una vez:

1. Comprueba el pesaje, si elegiste uno: que sea de salida, que no esté usado ni anulado y que no se haya pesado para otro cliente. **De ahí toma el bruto, la tara y el número del ticket.**
2. Comprueba la guía, si elegiste una: que esté vigente, que no haya vencido y que no se haya emitido para otro cliente.
3. Crea la nota con su número y **congela la tasa del día** en el documento.
4. Carga los renglones y comprueba que ningún precio quede por debajo del mínimo.
5. **Comprueba que haya guía si en los renglones va mineral.** Lo mira aquí y no antes porque hasta este momento no sabía si la nota lleva producto o es solo un flete.
6. Mira la existencia real del patio, renglón por renglón.
7. **Los servicios se saltan.** Un flete se cobra, pero no sale de ningún almacén.
8. Escribe la salida en el libro de inventario, valorada al costo promedio, con la nota **DESPACHO A ACME C.A.**
9. **Guarda en cada renglón el número exacto de la salida que escribió.**
10. Marca el ticket y la guía como gastados en este viaje: el ticket pasa a **En una nota** y la guía a **Usada**.

Ese último paso es el que hace que anular funcione bien: al anular, el sistema devuelve exactamente lo que sacó ese camión, no una salida parecida. Buscar «una salida parecida» devolvería la del camión de al lado el día que dos despachos coincidan en artículo y cantidad.

**O sale el material del patio y queda la nota, o no pasa ninguna de las dos cosas.** Nunca se queda a medias: no existe la nota impresa sin material descontado, ni el material descontado sin nota.

**Qué pasa si no hay material.** El despacho se rechaza entero y el sistema dice con nombre y cifras qué falta: «En "PATIO PRINCIPAL" hay 120.0000 de "GRANZÓN" y se están despachando 200.0000.» No deja el patio en negativo, porque una existencia negativa no es un dato: es un error que alguien va a tener que deshacer más adelante, cuando ya nadie recuerde de dónde salió. Si el material sí está en el patio pero el sistema dice que no, lo que falta es la entrada: se carga la producción o se hace el conteo desde **Inventario › Existencias**, y después se repite el despacho.

**Al anular**, el sistema escribe en el libro el movimiento contrario, con la nota **ANULACIÓN DE LA NOTA NE-2026-0007** y tu motivo. El inventario nunca se edita: se le escribe el contrario, y los dos movimientos quedan visibles.

**Y al anular, el pesaje y la guía vuelven a quedar libres**: el ticket regresa a **Sin usar** y la guía a **Vigente**, listos para la nota que corrija a la anterior. La razón es sencilla: el camión se pesó igual y la guía se emitió igual. Lo que se cayó fue la nota, no el pesaje. Si hubiera que volver a pesar un camión que ya se fue, la nota corregida saldría con un peso inventado.

#### La lista de precios, y si se puede vender por debajo

Cada producto lleva dos números: el **Precio de lista**, que es el que se propone solo, y el **Precio mínimo**, que es el suelo.

Al cargar un renglón, el precio de lista se copia solo y **se puede escribir otro encima**. Eso es intencional: el precio se negocia y el sistema no puede negociar por ti. Si el precio que escribes queda por debajo del suelo, aparece el aviso amarillo **Por debajo del mínimo de $ 8,00**, pero el botón de guardar sigue encendido. Quien decide es el sistema al guardar:

- **Con el mínimo en cero no hay tope por abajo.** Cualquiera puede poner el precio que quiera.
- **Con un mínimo puesto, quien hace el trabajo del día no puede bajar de ahí.** Verá «De "GRANZÓN" no se vende por debajo de 8.000000 USD. Se está ofreciendo 6 USD.»
- **Quien tiene el control total sobre Ventas sí puede bajar de ahí, y el sistema no le pide explicación ni deja un aviso.** Es una decisión de la empresa, no del sistema: si un descuento excepcional tiene que quedar justificado, escríbelo en la **Observación** del documento.

La comparación se hace **pasando los dos importes a dólares con la tasa del día del documento**, para que un mínimo fijado en dólares hace tres meses siga siendo comparable con un precio tecleado hoy en bolívares.

Y una consecuencia del reparto de permisos: **poner precios exige el control total**, así que quien despacha no puede subir el suelo para poder bajarlo.

#### El límite de crédito, y cuándo se aplica

El límite se fija en la ficha del cliente, en dólares, y **solo aparece si su condición de pago no es De contado**.

**El límite no se comprueba al cotizar ni al despachar. Se comprueba al emitir la factura**, y solo si esa factura va a crédito. Conviene tenerlo presente: se puede despachar material a un cliente que después no va a poder facturarse a crédito, y a esas alturas el camión ya salió. Si un cliente anda al tope, revisa su columna **Debe** antes de despachar.

Al emitir hay dos rechazos distintos:

- **Sin límite fijado, no hay crédito.** El sistema dice «A "ACME C.A." no se le tiene autorizado crédito. Fija su límite o factúrale de contado.» Un límite en cero no significa crédito ilimitado: significa que no se le vende a crédito.
- **Con la factura por encima del límite**, el sistema dice cuánto quedaría debiendo y cuál es su tope: «Con esta factura "ACME C.A." quedaría debiendo 5400.00 $ y su límite es 5000.00 $.» Solo lo puede pasar quien tenga el control total sobre Ventas, porque pasarse del límite es ampliar el crédito, y eso es una decisión de quien lo fijó.

La deuda del cliente y su límite **se llevan siempre en dólares**, igual que el saldo de las facturas, porque una factura en dólares se abona con transferencias en bolívares más de lo que se cree, y restar bolívares de dólares no se puede.

#### Dos personas trabajando a la vez

Esta sección existe para que trabajes tranquilo cuando hay dos personas en el sistema, que es lo normal un día de mucho movimiento.

**Qué pasaba antes.** El sistema miraba, decidía y escribía, y entre el mirar y el decidir cabía otra operación. Dos personas facturándole al mismo cliente desde dos computadoras pasaban las dos la comprobación, porque ninguna veía lo que la otra todavía no había terminado. Salían **dos facturas por el mismo material, cada una con su número de control**. Lo mismo con los cobros: dos abonos simultáneos sobre la misma factura pasaban los dos y el dinero de más se perdía de vista. Lo mismo con dos camiones cargando el mismo material a la vez, que podían dejar el patio en negativo. Y lo mismo con dos personas anulando la misma nota, que devolvían el material al patio dos veces.

**Qué hace ahora el sistema.** Cierra la puerta antes de mirar. En cuanto alguien empieza una de estas operaciones, el sistema aparta ese documento —esa nota, esa factura, esa casilla de patio y artículo— y **el resto espera su turno**. Cuando le llega el turno al segundo, lo que ve ya no es el estado viejo: es el que dejó el primero. La espera dura lo que dura la operación, que es un instante; no vas a notarla.

**Qué ve exactamente quien pierde la carrera.** No ve un error raro ni una pantalla en blanco. Ve un mensaje que le dice qué pasó mientras tanto:

| Lo que pasó al mismo tiempo | Lo que ve el segundo |
| --- | --- |
| Otra persona facturó esas mismas notas | «Solo se facturan notas despachadas: 2 de las indicadas ya están facturadas o anuladas.» |
| Otra persona terminó de cobrar la factura | «La factura FAC-2026-0012 está cobrada y no admite cobros.» |
| Otra persona abonó y ya no queda tanto saldo | «A la factura FAC-2026-0012 le faltan 100.00 $ y se están abonando 900.00 $. …» |
| Alguien registró un cobro mientras tú anulabas la factura | «La factura FAC-2026-0012 tiene 1 cobro(s) registrados. Anúlalos primero: …» |
| Otro camión se llevó ese material | «En "PATIO PRINCIPAL" hay 120.0000 de "GRANZÓN" y se están despachando 200.0000.» |
| Otra nota tomó ese mismo pesaje | «El ticket TCK-2026-0004 está usado.» |
| Otra nota tomó esa misma guía | «La guía GM-2026-0099 está usada.» |
| Otra persona ya anuló esa nota | «La nota NE-2026-0007 ya estaba anulada.» |

En todos los casos la regla es la misma: **lo que ves rechazado no se hizo a medias, no se hizo.** Vuelve a mirar la lista, que se actualiza sola, y decide con lo que hay.

**Las pantallas de Ventas se refrescan solas.** Lo que registra otra persona aparece sin que recargues nada, y una escritura de ventas actualiza a la vez las cotizaciones, las notas, las facturas, los cobros, los clientes y las existencias. Es lo que permite que dos personas facturen al mismo tiempo viendo la misma cola de notas por facturar.

#### Los números de los documentos

Cada documento lleva su correlativo: **COTV-2026-0001** las cotizaciones, **NE-2026-0001** las notas, **FAC-2026-0012** las facturas y **COB-2026-0001** los cobros. **Se reinician cada enero.**

La factura lleva además un **número de control**, **00-00000034**, que es una serie aparte y **no se reinicia con el año**: sigue corriendo.

**Ninguna factura se borra.** Una factura equivocada se anula y **se queda con su número**, marcada como anulada y con marca de agua en el PDF. La razón es la que hace útil toda la numeración: un correlativo con huecos es lo primero que se pregunta en una revisión, y «se borró por error» no es una respuesta.

#### El IVA y la moneda, tal como los calcula el sistema hoy

**El sistema calcula con una alícuota del 16% y no hay ninguna pantalla para cambiarla.** La línea de los totales dice **IVA 16%**. Si la alícuota cambiara, el cambio no se hace desde el sistema: hay que pedirlo a quien lo mantiene.

Lo que sí se puede ajustar por documento y por cliente:

- **Cliente exento**: la casilla **Exento de IVA** en su ficha hace que todos sus documentos salgan sin IVA.
- **Renglón exento**: la casilla **Exento de IVA** de cada línea deja ese renglón fuera de la base imponible.
- **El flete suma a la base imponible.**
- **El descuento se reparte en proporción sobre lo gravado**, de modo que un descuento aplicado a renglones exentos no rebaje el IVA.
- **Una factura no puede mezclar documentos con IVA y sin IVA.** Si una nota es exenta y otra no, se facturan por separado, porque un mismo total no puede declarar dos tratamientos distintos.

Sobre la retención: cuando el cliente está marcado como contribuyente especial, la factura calcula la retención sobre el IVA y la muestra como dos líneas más, **IVA retenido por el cliente** y **A pagar**. **El sistema no emite un comprobante de retención aparte**: la retención sale como una línea dentro de la factura.

Sobre la moneda: cada documento **congela la tasa del día** al crearse, y esa es la que se imprime al pie. **Sin tasa del día registrada no se emite nada**, ni cotización, ni nota, ni factura. El cobro se registra **en la moneda de la cuenta donde cayó el dinero**, no en la de la factura, y el sistema lo pasa a dólares para descontarlo del saldo. Por eso el saldo, la deuda y el límite de crédito van siempre en dólares.

### 10.11 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Tu usuario no tiene permiso para esta acción.» | Te falta permiso, y el mensaje no dice cuál | Si fue al poner precios, dar crédito, vender bajo el mínimo o anular, hace falta el control total sobre Ventas. Pídelo a administración o que lo haga quien lo tenga |
| «La razón social del cliente es obligatoria.» | Quedó vacía o con menos de tres letras | Escribe la razón social completa |
| «El RIF "J-123" no tiene la forma J-12345678-9.» | El RIF está incompleto o mal escrito | Corrígelo con la forma letra, guion, ocho dígitos, guion, un dígito |
| «Ya hay un cliente registrado con el RIF J-12345678-9.» | Ese cliente ya está cargado | Búscalo en la lista. Si está inactivo, ábrelo y márcalo **Activo** |
| «El cliente "ACME C.A." está inactivo.» | Al cliente se le dio de baja | Actívalo desde su ficha, o elige otro cliente |
| «El precio tiene que ser mayor que cero.» | El precio quedó vacío o en cero | Escribe el precio de lista |
| «El precio mínimo (12.00) no puede ser mayor que el precio (10.00).» | El suelo quedó por encima del precio | Baja el mínimo o sube el precio |
| «Solo se le pone precio de venta a lo que se vende. "45" es INSUMO.» | Ese artículo no es producto ni servicio | Revisa su categoría en el catálogo de artículos |
| «Un documento sin renglones no dice nada. Agrega al menos uno.» | No viajó ningún renglón válido | Revisa que cada renglón tenga producto y cantidad mayor que cero |
| «El artículo "GRANZÓN" está dado de baja y no se puede vender.» | El producto se desactivó en el catálogo | Actívalo en el catálogo, o vende otro |
| «La cantidad de "GRANZÓN" tiene que ser mayor que cero.» | Un renglón quedó en cero | Escribe la cantidad |
| «De "GRANZÓN" no se vende por debajo de 8.000000 USD. Se está ofreciendo 6 USD.» | El precio quedó bajo el mínimo | Sube el precio, o que lo autorice quien tenga control total sobre Ventas |
| «No se cotiza con fecha futura.» / «No se despacha con fecha futura.» | La fecha es de mañana o después | Corrige la fecha |
| «No hay tasa BCV registrada para el 04/08/2026 ni para ninguna fecha anterior. Regístrala en Sistema › Tasas de cambio.» | Falta la tasa del día | Regístrala en **Sistema › Tasas de cambio** y repite el documento |
| «El documento COTV-2026-0007 quedaría en -35.00: el descuento se come el total. …» | El descuento es mayor que el documento entero | Baja el descuento. Un papel con total negativo no se puede cobrar |
| «La cotización COTV-2026-0007 ya está aceptada.» | Otra persona ya la cerró | Recarga y mira el estado que tiene |
| «El almacén "PATIO SUR" está cerrado.» | Ese patio no está activo | Elige otro patio, o pide que lo activen |
| «En "PATIO PRINCIPAL" hay 120.0000 de "GRANZÓN" y se están despachando 200.0000.» | No hay tanto material | Si en el patio sí está, falta registrar su entrada: carga la producción o haz el conteo en **Inventario › Existencias** |
| Un mensaje largo en inglés al pulsar **Despachar** | Escribiste la tara mayor que el peso bruto | Corrige la tara: siempre es menor que el bruto |
| «Este despacho lleva mineral y no tiene guía de movilización. Cárgala en Despachos › Guías, o pídele a quien tenga control total sobre Despachos que lo autorice sin ella.» | La nota lleva producto de cantera y quedó sin guía | Carga la guía y repite el despacho, o pide la autorización a quien tenga el control total sobre Despachos |
| «El ticket TCK-2026-0004 es de una entrada a la cantera, no de una salida.» | El pesaje elegido es de algo que llegó, no de algo que sale | Elige un pesaje de salida, o que la garita registre el del camión que se va |
| «El ticket TCK-2026-0004 está usado.» / «está anulado.» | Ese pesaje ya no está disponible | Cierra, vuelve a abrir **Despachar** y elige uno de los que sigan sin usar |
| «El ticket TCK-2026-0004 se pesó para otro cliente.» | El pesaje se registró a nombre de otro cliente | Elige el pesaje correcto, o pesa de nuevo el camión |
| «La guía GM-2026-0099 está usada.» / «está anulada.» | Esa guía ya no ampara nada | Elige otra guía vigente |
| «La guía GM-2026-0099 venció el 02/08/2026.» | La vigencia terminó antes de la fecha del despacho | Consigue una guía vigente: una vencida no ampara el viaje |
| «La guía GM-2026-0099 se emitió para otro cliente.» | La guía tiene otro cliente puesto | Elige la guía de ese cliente, o una que no tenga cliente |
| «Escribe por qué se anula. Un despacho anulado sin motivo no se puede auditar.» | El motivo quedó vacío o muy corto | Escribe al menos cuatro letras que expliquen qué pasó |
| «La nota NE-2026-0007 ya estaba anulada.» | Alguien se te adelantó | Recarga la lista: la anulación ya está hecha |
| «La nota NE-2026-0007 ya está en la factura. Anula primero la factura.» | Esa nota ya se facturó | Anula la factura. La nota vuelve sola a **Por facturar** |
| «No hay notas de entrega que facturar.» | No marcaste ninguna nota | Marca al menos una de la lista |
| «Solo se facturan notas despachadas: 1 de las indicadas ya están facturadas o anuladas.» | Otra persona movió esas notas mientras tú marcabas | Cierra, vuelve a abrir **Facturar** y marca las que sigan en la cola |
| «Las notas son de 2 clientes distintos. Una factura es de un solo cliente.» | Se colaron notas de otro cliente | Emite una factura por cliente |
| «Las notas están en monedas distintas y no se pueden sumar en una factura.» | Hay notas en dólares y en bolívares | Sepáralas por moneda |
| «Las notas llevan alícuotas de IVA distintas. Factúralas por separado.» | Una nota es exenta y otra no | Emite una factura para las exentas y otra para las gravadas |
| «A "ACME C.A." no se le tiene autorizado crédito. Fija su límite o factúrale de contado.» | El cliente no tiene límite fijado | Fija el límite en su ficha, o cambia la condición a **De contado** |
| «Con esta factura "ACME C.A." quedaría debiendo 5400.00 $ y su límite es 5000.00 $.» | La factura pasa el límite | Cóbrale lo pendiente, factura de contado, o que lo autorice quien tenga control total sobre Ventas |
| «La factura FAC-2026-0012 está cobrada y no admite cobros.» | Ya no queda saldo | Revisa los cobros de la factura antes de registrar otro |
| «A la factura FAC-2026-0012 le faltan 800.00 $ y se están abonando 900.00 $. …» | El abono es mayor que lo que falta | Registra el monto que falta. Si el cliente pagó de más, regístralo como dos cobros o revisa la tasa del día |
| «El monto del cobro tiene que ser mayor que cero.» | El monto quedó vacío o en cero | Escribe lo que entró |
| «No se registra un cobro con fecha futura.» | La fecha es de mañana o después | Corrige la fecha |
| «La factura FAC-2026-0012 tiene 2 cobro(s) registrados. Anúlalos primero: …» | La factura tiene dinero cobrado encima | Anula los cobros uno por uno y después la factura |
| «La factura FAC-2026-0012 ya estaba anulada.» | Alguien se te adelantó | Recarga: ya está anulada |
| «El cobro COB-2026-0003 ya estaba anulado.» | Ese cobro ya se reversó | Recarga la tarjeta **Cobros** |

---

## 11. Nómina

La nómina es el registro de quién trabaja en la empresa, cuánto gana cada quien y cuánto se le pagó en cada período. De aquí salen los recibos de pago, la ficha del trabajador, su carnet y las constancias que pide un banco. Y de aquí sale también la cuenta de las prestaciones sociales de cada trabajador: cuánto lleva acumulado, cuánto se le ha adelantado y cuánto habría que pagarle si se fuera mañana.

Hay una idea que conviene entender antes de tocar nada, porque explica casi todo lo demás:

**Una nómina no se teclea: se arma sola con dos cosas.** La primera es la ficha del trabajador, que dice desde cuándo trabaja, cuánto gana y cómo se le paga. La segunda son las novedades del período: lo único que cambia de una quincena a otra —horas extra, faltas, un bono, la cuota de un préstamo—. El resto lo pone el sistema. La pantalla lo dice con estas palabras: *"Lo único que cambia de una quincena a otra: horas extra, faltas, bonos y descuentos. El resto lo saca el sistema del contrato."*

La segunda idea es de la que depende que este módulo no te cueste dinero: **un período se abre, se calcula, se aprueba y se paga, en ese orden y en tres manos distintas.** Hasta el momento de pagar, todo se puede rehacer. Después de pagar, nada. Esa frontera está explicada con detalle en 11.2 y en 11.11, y es lo primero que hay que aprenderse de este capítulo.

### 11.1 Quién entra y quién puede hacer qué

Hay dos puertas distintas, y en este módulo conviene no confundirlas.

La primera es **ver el módulo**. Depende del permiso sobre Nómina que administración le haya dado a tu usuario. Si no lo tienes, el grupo Nómina no te sirve de nada: verás una tarjeta con un candado, **Nómina no está a tu alcance**, con el texto *"Tu rol no tiene acceso a este módulo. Si lo necesitas para tu trabajo, pídeselo a quien administra el sistema."* y el enlace **Volver al panel**.

La segunda es **poder ejecutar cada paso**. Aquí no hay un solo rol que registre y otros que consulten, como en inventario. Hay tres roles que hacen cosas distintas, y ninguno puede hacer la del otro.

#### Qué ve cada rol dentro del módulo

| Rol | Personal, fichas, tabulador y recibos | Novedades del período | Períodos y parámetros |
| --- | --- | --- | --- |
| Administrador | Sí | Sí | Sí |
| Gerencia general | Sí | Sí | Sí |
| Recursos humanos | Sí | Sí | Sí |
| Los otros siete roles | No | No | No |

**Nómina es el módulo menos repartido del sistema, y es a propósito.** Solo tres roles lo alcanzan. **Consulta queda fuera**, a diferencia de casi todos los demás módulos: «solo lectura» sobre Nómina sigue siendo ver el sueldo de todo el mundo.

**Aquí había una cuarta fila, la de Tesorería.** Ese rol ya no existe: se retiró junto con el módulo. Ver 12.1.

**Quien paga la nómina es recursos humanos o la gerencia general**, no un tesorero: ese rol se retiró (12.1). Lo exige la propia función de la base, y por equivalencia pasa también quien tenga escritura sobre Nómina — que hoy son los mismos.

**Prestaciones sociales la ven los cuatro**, porque para verla basta el mismo permiso sobre Nómina que para ver el resto del módulo. Otra cosa es poder registrar allí: eso está en 11.10 y no se reparte igual.

#### Quién ejecuta cada acción

| Acción | Quién la hace |
| --- | --- |
| Crear, editar, egresar y borrar fichas de personal | Recursos humanos |
| Cargar la foto y guardar el encuadre | Recursos humanos |
| Crear y editar los cargos del tabulador, y **Sincronizar** | Recursos humanos |
| Cargar novedades del período | Recursos humanos |
| **Abrir período**, **Calcular** y **Anular** | Recursos humanos |
| Cargar una **Nueva vigencia** de un parámetro | Recursos humanos |
| **Aprobar la nómina** | **Gerencia general, y nadie más** |
| **Pagar** | **Recursos humanos o gerencia general** |
| Ver e imprimir recibos | Cualquiera que vea el módulo |
| **Cerrar trimestre** e **Intereses del mes**, en prestaciones sociales | Recursos humanos |
| **Cargar el corte**, **Anticipo**, **Liquidar** y **Pagar y dar de baja** | Solo quien tenga el permiso más alto sobre Nómina. Recursos humanos no lo trae de fábrica |

El rol de administrador pasa por encima de todo lo anterior.

Las dos filas en negrita son el corazón del módulo. **Quien calcula la nómina no la aprueba, y quien la aprueba no la paga.** No es burocracia: es lo que impide que una sola persona, sola, abra un período, se lo apruebe y saque el dinero de la cuenta. La propia pantalla lo resume: *"No se salta pasos: cada uno deja constancia de quién lo hizo."*

Si intentas un paso que no te toca, el sistema responde «Esta acción la realiza: Gerencia general. Tu usuario no tiene ese rol.», con el nombre del rol que sí puede hacerlo. No es una falla: es la respuesta correcta.

### 11.2 El ciclo de una nómina

Esta sección es el módulo entero. Si solo lees una parte del capítulo, que sea esta.

1. **Abrir período** — lo hace Recursos humanos, en **Nómina › Nómina del período › 2 · Procesar**

**No es una entrada del menú**: es la segunda pestaña de **Nómina del período**.. Se elige el tipo (**Semanal — 7 días**, **Quincenal — 15 días**, **Mensual — 30 días** o **Especial — días del calendario**) y las fechas **Desde** y **Hasta**. El período nace en borrador. *Se deshace:* sí, anulándolo.
2. **Cargar novedades** — Recursos humanos, en **Nómina › Nómina del período › 1 · Novedades**

**No es una entrada del menú**: es la primera de las tres pestañas de **Nómina del período**, numeradas en el orden en que se hacen.. Horas extra, faltas, bonos y descuentos. *Se deshace:* sí, se corrige y se vuelve a guardar todas las veces que haga falta, mientras el período esté en borrador o calculado.
3. **Calcular** — Recursos humanos, desde la tarjeta del período. Genera los recibos y el período pasa a calculado. *Se deshace:* sí. Recalcular borra los recibos anteriores y los rehace enteros; no acumula ni deja nada a medias.
4. **Ver recibos** — cualquiera que vea el módulo, en **Nómina › Nómina del período › 3 · Recibos**

**No es una entrada del menú**: es la tercera pestaña de **Nómina del período**.. Es el paso de revisión. No cambia nada. *Se deshace:* no hace falta, no escribe nada.
5. **Aprobar la nómina** — **solo gerencia general**. El período pasa a aprobado y le llega un aviso a tesorería y a recursos humanos. *Se deshace:* sí, anulando el período.
6. **Confirmar el pago** — **recursos humanos o gerencia general**. Se elige de qué cuenta sale el dinero, el saldo de esa cuenta baja y queda una línea en el libro de tesorería. *Se deshace:* **no. Nunca. Por nadie.**

Los estados que verás en la etiqueta de cada período, y la frase que el sistema pone debajo para decirte qué toca ahora:

| Etiqueta | Qué toca hacer, según la propia pantalla |
| --- | --- |
| **Borrador · cargar novedades** | *"Carga las novedades del período —horas extra, faltas, bonos— y calcula."* |
| **Calculada · por aprobar** | *"Revisa los recibos. Al aprobar, la nómina queda lista para que tesorería pague."* |
| **Aprobada · por pagar** | *"Se paga desde una cuenta y queda anotado de dónde salió."* |
| **Pagada** | *"Cerrada. Los recibos quedan como comprobante."* |
| **Anulada** | El motivo que se escribió al anularla |

**Anular** es la marcha atrás del módulo, y solo funciona antes de pagar: se puede anular un período en borrador, calculado o aprobado, siempre escribiendo por qué. El período no desaparece: queda a la vista con su motivo, porque una nómina que se deshace sin explicación es una nómina que nadie puede defender después.

Una nómina **pagada** no se anula, no se recalcula y su salida de dinero no se reversa. La única corrección posible es la que el propio sistema indica: **cargar la diferencia en el período siguiente**, como bono o como descuento.

### 11.3 Personal

**Nómina › Personal**

El registro de quién trabaja en la empresa. La pantalla lo dice así: *"Quién trabaja aquí, desde cuándo y cuánto gana. De la fecha de ingreso salen la antigüedad, el bono vacacional y las prestaciones."*

#### Qué se ve

Arriba a la derecha, y solo con el rol de recursos humanos, hay **dos** botones: **Cargar por planilla** y **Nuevo trabajador**. El primero da de alta a toda la gente de una vez, o corrige las fichas que ya están; es el mismo mecanismo que el del catálogo de artículos, con su plantilla de Excel y su vista previa antes de escribir nada.

Debajo, dos filtros: **Buscar**, que acepta el nombre, la cédula o el cargo, y la casilla **Incluir a los desincorporados**, que viene **desmarcada**: la lista trae solo a quien está activo.

Si todavía no hay nadie cargado, la pantalla muestra **Todavía no hay personal cargado**, el texto *"Sin trabajadores no se puede calcular una nómina."* y el botón **Cargar el primero**.

La lista tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Trabajador** | Apellidos y nombres, como enlace a su ficha. Si la persona ya no está, al lado del nombre va una etiqueta roja **Desincorporado** y debajo, en pequeño, el motivo. Luego la cédula y el número de ficha |
| **Cargo** | El cargo y, debajo, el departamento |
| **Ingreso** | La fecha de ingreso y, debajo, la antigüedad, o **hasta** la fecha de egreso si egresó. Si la fecha de ingreso no está confirmada, en su lugar sale una etiqueta ámbar **Por confirmar** |
| **Salario** | El monto con su símbolo y, debajo, la base y la frecuencia |

En cada fila hay un botón **Ficha** para todos, y para recursos humanos además el lápiz para editar y **Desincorporar** (solo si la persona está activa). Quien no tenga ese rol ve en su lugar la etiqueta verde **Activo**. Al final de la fila de un desincorporado no va nada: su etiqueta ya está junto al nombre, y repetirla enseñaría lo mismo dos veces.

**Ya no hay papelera.** Hasta el 6 de agosto de 2026 existía un botón para borrar una ficha; se quitó. Ver más abajo, en «Las fichas no se borran».

#### Cargar un trabajador

1. Pulsa **Nuevo trabajador**.
2. Llena los datos personales y laborales.
3. Llena el bloque **Cómo se le paga**.
4. Pulsa **Guardar**.

**El número de ficha no se escribe.** Bajo el título, al crear, la pantalla lo advierte: *"El número de ficha lo asigna el sistema al guardar: cuatro dígitos, correlativo."*

Los datos del primer bloque:

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Cédula** | Sí | Se escribe **V-12345678**. Empieza en **V-** y se pasa a mayúsculas al teclear |
| **Nombres** | Sí | Sin esto no se habilita **Guardar** |
| **Apellidos** | Sí | Sin esto no se habilita **Guardar** |
| **Fecha de nacimiento** | No | |
| **Género** | No | Empieza en **Sin indicar** |
| **Estado civil** | No | Empieza en **Sin indicar** |
| **Nacionalidad** | No | Empieza en **VENEZOLANA** |
| **Grupo sanguíneo** | No | *"Va en el carnet. En una emergencia es lo primero que se busca."* |
| **Cargo del tabulador** | No | Empieza en **Fuera del tabulador**. Al elegir un nivel rellena solos el cargo, el salario y la moneda |
| **Cargo** | Sí | Se **bloquea** si elegiste un nivel del tabulador, con la ayuda *"Lo pone el tabulador."* |
| **Departamento o frente** | No | |
| **Fecha de ingreso** | Sí | *"De aquí salen la antigüedad y las prestaciones."* |
| **Teléfono** | No | |
| **A quién llamar en una emergencia** | No | |
| **Teléfono de esa persona** | No | |
| **Dirección** | No | |

Y el bloque **Cómo se le paga**:

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Salario estipulado** | — | **Por mes** (así empieza), **Por día** o **Por hora** |
| **Monto** | No bloquea **Guardar** | Con nivel del tabulador: *"Sale del tabulador. Si lo cambias aquí, esta ficha aparecerá como desfasada hasta que alguien sincronice o corrija el nivel."* |
| **Moneda** | — | **Bs** (así empieza) o **$** |
| **Frecuencia de pago** | — | **Semanal**, **Quincenal** (así empieza) o **Mensual** |
| **Jornada** | — | **Diurna — 8 h** (así empieza), **Nocturna — 7 h** o **Mixta — 7,5 h**. *"Decide el valor de la hora y el tope de horas extra."* |
| **Días de utilidades al año** | No | Si se deja vacío, el sistema aplica el mínimo que tenga cargado en **Parámetros de nómina** |
| **Forma de pago** | — | **Transferencia** (así empieza), **Pago móvil**, **Efectivo** o **Binance** |
| **Banco** | No | Aparece solo con **Transferencia** o **Pago móvil**. Lista cerrada, con el código delante: **0102 · BANCO DE VENEZUELA** |
| **Número de cuenta** | No | Solo con **Transferencia** |
| **Teléfono del pago móvil** | No | Solo con **Pago móvil** |
| **Nota** | No | |

**Guardar** se habilita cuando están **Nombres**, **Apellidos**, **Cargo** y **Fecha de ingreso**. La fecha de ingreso es la más delicada de las cuatro, y el propio sistema explica por qué si intentas dejarla vacía: de ella dependen la antigüedad, el bono vacacional y las prestaciones.

Cuando una ficha viene de la carga del libro de nómina y su fecha de ingreso nadie la ha revisado, el campo lo dice: *"Esta fecha vino de la carga del libro de nómina y nadie la ha revisado. Corrígela: de aquí salen la antigüedad, el bono vacacional y la liquidación."* Mientras eso siga así, en la lista sale **Por confirmar** y no se le puede emitir una constancia de trabajo.

#### Quién tiene cuenta en el sistema

En la columna del trabajador, junto al nombre, **a quien tiene cuenta le sale un iconito gris de persona**. Al pasar el ratón dice **Entra al sistema como** seguido de su usuario, y lo mismo lee un lector de pantalla.

**A quien no tiene cuenta no le sale nada**, y es a propósito: de la plantilla, solo unos pocos entran al sistema. Marcar a la mayoría con un «no tiene» llenaría la lista de ruido.

Es el espejo de lo que hace la lista de usuarios en Configuración, que dice al revés si esa cuenta es de alguien de la plantilla (13.1).

#### Egresar a un trabajador

1. Pulsa **Egresar** en su fila.
2. Escribe el **Último día trabajado**.
3. Escribe el **Motivo**. Son mínimo cuatro letras y el sistema no las deja en blanco, porque *"De él dependen las prestaciones que le tocan."*
4. Pulsa **Egresar**.

La ventana lo resume: *"Deja de entrar en las nóminas siguientes y queda marcado en la lista. Su historial se conserva entero: no se borra nada."* Desincorporar **no borra nada**: guarda la fecha y el motivo, y la persona deja de aparecer en la lista salvo que marques **Incluir a los desincorporados**.

**Egresar aquí no le calcula la liquidación, y además cierra la puerta para calcularla.** La liquidación se hace en **Nómina › Prestaciones y parámetros › Prestaciones sociales**

**No es una entrada del menú**: es la primera pestaña de **Prestaciones y parámetros**. (ver 11.10), y esa pantalla solo deja liquidar a quien está activo. Si egresas primero, la persona queda con su saldo de prestaciones a la vista y sin forma de cerrarle la cuenta. El sistema no avisa de esto.

Por eso, **cuando alguien se va, el orden es liquidarlo primero en Prestaciones sociales**: el botón que paga la liquidación egresa a la persona por su cuenta, con la fecha y el motivo, y no hay que volver a esta pantalla. **Egresar** aquí queda para cuando no hay nada que liquidar.

#### Las fichas no se borran

**No existe forma de borrar una ficha de personal.** Antes existía, con candados —solo dejaba borrar a quien no tuviera recibos ni novedades, es decir, a quien nunca había cobrado por el sistema— y aun así se quitó, porque esos candados no comprueban lo que hace falta comprobar. «Nunca cobró por el sistema» no significa «nunca trabajó aquí»: puede ser que su nómina no se haya procesado todavía, que se le pagara por fuera, o que la ficha se cargara ayer.

**Una ficha cargada por error también se egresa.** Escribe el motivo tal cual —«cargada por error», «duplicada de la ficha 0012»— y desaparece de la lista de activos, que es todo lo que se quería. La diferencia es que dentro de un año se puede leer qué pasó, y que una desincorporación se deshace volviendo a activar la ficha, mientras que un borrado no se deshacía desde ninguna pantalla.

Si alguien llama a la función vieja —una pestaña abierta desde antes del cambio, por ejemplo—, el sistema responde: *«Las fichas de personal ya no se borran: se desincorporan. Usa "Egresar" con la fecha y el motivo —"cargada por error" también es un motivo—, y esa persona deja de salir entre los activos sin que se pierda lo que decía su ficha.»*

#### La pestaña Carnets

**Nómina › Personal › Carnets**

Es la tercera pestaña de Personal, junto a **Personal** y **Tabulador de cargos**, y responde a una sola pregunta: **quién tiene carnet emitido y quién no**.

Existe para el arranque. Emitir el carnet de veintidós trabajadores desde la ficha de cada uno son veintidós visitas a veintidós pantallas; aquí se hace de una vez.

La pantalla se reparte en tres tarjetas, y la primera solo aparece si hace falta:

| Tarjeta | Qué trae |
| --- | --- |
| **N sin carnet** | Los que faltan, con su ficha y su cargo. Arriba a la derecha, el botón **Emitir los N** |
| **N no se pudieron emitir** | Solo si alguno falló. Se reintenta pulsando otra vez, o desde su ficha |
| **N con carnet** | Los que ya lo tienen, con su código y la fecha en que se emitió |

**Emitir los N va de uno en uno, aunque el botón sea uno solo, y se ve avanzar.** No es lentitud: cada carnet necesita la foto de esa persona, recortada con su propio encuadre, y eso ocurre en el navegador. Con veintidós fotos que bajar, tarda. **No cierres la pestaña a media faena**; si se corta, los que ya salieron quedan emitidos y los demás siguen en la lista.

**Aquí solo se emiten los que faltan.** A quien ya tiene carnet no se le ofrece ningún botón, y es a propósito: volver a emitir anula el carnet anterior, y eso es una decisión de una persona concreta —se le perdió, se le rompió— que se toma en su ficha y diciendo por qué. Un botón de «reemitir a todos» convertiría en un clic el anular veintidós plásticos que están en veintidós bolsillos. La propia pantalla lo advierte al pie.

**Quién puede emitir:** recursos humanos, administración y la gerencia general. Los demás ven la lista y nada más.

**La pestaña solo cuenta al personal activo.** A quien egresó no se le pide carnet y no aparece en ninguna de las dos listas, ni siquiera en «N con carnet» si llegó a tener uno. Aquí no hay casilla **Incluir a los desincorporados** como en Personal, y es coherente: a quien ya no trabaja aquí no se le emite carnet.

### 11.4 La ficha del trabajador

**No está en el menú.** Se llega pinchando el nombre de la persona en la lista de **Personal**, o desde la tabla de fichas desfasadas del tabulador.

Es la pantalla donde se ve de un vistazo todo lo de una persona y **desde donde salen sus documentos**.

#### Qué se ve

Arriba, el nombre completo y, debajo, el número de ficha, el cargo y el departamento. A la derecha, la etiqueta **Activo** en verde o **Desincorporado** en rojo —la misma que en la lista— y, solo para recursos humanos, el botón **Editar datos**, que abre el formulario de Personal ya cargado con esa persona.

A la izquierda, **la foto**. El recuadro tiene la proporción del carnet y, si no hay foto, dice **Sin foto**.

1. Pulsa **Cargar foto** —o **Cambiar foto**, si ya hay una—.
2. Mueve la barra de acercamiento y arrastra la foto. La ayuda lo explica: *"Arrastra para centrar la cara sobre la línea."* Hay una guía punteada que marca dónde debe quedar.
3. Pulsa **Guardar el encuadre**.

Para quitarla, **Quitar**. La foto tiene que ser JPG, PNG o WEBP y pesar como mucho 5 MB; si te pasas, el sistema te dice cuánto pesa y qué hacer.

A la derecha están los datos, agrupados y **de solo lectura**. Son exactamente los mismos que salen impresos en la ficha, y están escritos una sola vez a propósito, para que la pantalla y el papel no puedan decir cosas distintas.

| Bloque | Qué trae |
| --- | --- |
| **Identificación** | **Cédula**, **Fecha de nacimiento**, **Edad**, **Grupo sanguíneo**, **Género**, **Nacionalidad**, **Estado civil** |
| **Contacto** | **Teléfono**, **En una emergencia, llamar a**, **Dirección** |
| **Datos laborales** | **Cargo**, **Departamento**, **Fecha de ingreso**, **Antigüedad**, **Jornada**, **Utilidades** |
| **Cómo se le paga** | **Salario**, **Frecuencia**, **Forma de pago**, **Cuenta** |
| **Egreso** | Solo si egresó: **Último día trabajado** y **Motivo** |
| **Observaciones** | Solo si la ficha tiene una nota |

Lo que no tiene dato sale con un guion. Para cambiar cualquiera de estos datos hay que ir a **Editar datos**: aquí no se escribe.

#### Su firma

Debajo de los datos hay una tarjeta, **Su firma**. La guarda recursos humanos, no el trabajador: el obrero no entra al sistema, así que se carga con él delante.

Bajo la firma guardada hay una etiqueta que dice en qué estado está: **Se estampa en los papeles** o **Guardada, pero sin usar**. Esa segunda es lo que permite tener la firma guardada y apagada mientras se aclara algo, sin borrarla.

**Sirve para el recibo de pago.** Cuando el trabajador tiene firma guardada y encendida, **el recibo sale con ella estampada** sobre la raya de la izquierda. Está en 11.8.

#### Cuenta del sistema

Al pie de la ficha, una tarjeta dice si esa persona entra al sistema: con qué **Usuario**, cuándo se creó la cuenta y qué alcance tiene.

Es lo mismo que el iconito de la lista de Personal, pero con el detalle. Y es lo que hay que mirar **cuando alguien egresa**: saber qué cuenta era suya es lo que evita que se quede abierta.

#### Los documentos

En la tarjeta de abajo hay dos botones: **Ficha completa (PDF)** y **Constancia de trabajo**. El carnet ya no está aquí: tiene tarjeta propia justo debajo, y el porqué está explicado en el apartado siguiente.

**Los dos se abren primero en el visor**, con **Cerrar** y **Descargar** abajo, y nada se guarda hasta que pulses **Descargar**. La ficha trae todos los datos en A4. La constancia es la carta que se entrega a un banco o a quien la pida, y avisa: *"Revísala antes de entregarla. La firma va a mano."*

Los dos salen con la misma cabecera que la orden de compra, el recibo y la factura: la razón social, el RIF y **el domicilio fiscal completo**, tal como estén cargados en **Configuración › Datos de la empresa** (13.2). Lo que falte ahí, falta en el papel.

#### El carnet

**El carnet dejó de ser una imagen que se baja y pasó a ser un documento que se emite.** El motivo es el QR: cada carnet lleva impreso en el reverso un código propio, distinto para cada persona, y ese código es el que abre la página que dice si el carnet sigue valiendo. Un código que no se ha emitido no verifica nada.

**Ojo si tienes impreso un manual anterior.** Hasta la versión 1.2 el reverso del carnet era igual para todos —solo la marca, la razón social y el RIF— y se mandaba a la imprenta una sola vez. **Eso ya no es cierto y no puede hacerse:** un reverso repetido haría que todos los carnets de la cantera apuntaran a la misma persona al escanearlos.

**Solo hay un carnet vigente por persona.** Emitir uno nuevo anula el anterior, y por eso hace falta decir por qué.

**Quién puede emitir desde aquí:** recursos humanos y administración. El resto ve la tarjeta y puede imprimir, pero no emitir.

**La gerencia general no ve estos botones en la ficha, aunque sí puede emitir.** Su permiso sobre Nómina se lo permite, y de hecho sí los ve en la pestaña **Carnets**; es la tarjeta de la ficha la que pregunta por el rol de recursos humanos. Es un desajuste, no una regla.

##### Cuando todavía no tiene carnet

La tarjeta lo dice —**Sin emitir**— y explica lo que va a pasar: *"Todavía no tiene carnet. Al emitirlo sale su PDF listo para la imprenta: dos páginas de 54 × 86 mm a 300 dpi, con el QR de verificación en el reverso."*

Se pulsa **Emitir el carnet**, se confirma, y el PDF se abre solo. No hay que buscarlo después.

**Sin foto también se emite**, y conviene saberlo porque el botón no avisa. Lo que pasa es que el carnet sale sin cara y **la página del QR no puede comparar a nadie**, que es para lo único que la foto está ahí. Carga la foto antes.

**A quien ya egresó no se le emite carnet.** El sistema lo dice con su nombre: *«… ya no trabaja en la empresa: no se le emite un carnet nuevo.»*

##### Cuando ya lo tiene

La tarjeta muestra tres cosas y un botón:

| Qué | Para qué sirve |
| --- | --- |
| **Código impreso bajo el QR** | El mismo que sale escrito en el plástico, en grupos de seis. Sirve para teclearlo a mano cuando el QR está rayado y no lee |
| **Adónde lleva el QR** | La dirección completa. El botón **Copiar la dirección** la deja en el portapapeles |
| **Emitido el** | Fecha y hora |
| **Imprimir el carnet** | Vuelve a sacar el mismo PDF. **Esto no emite nada ni anula nada** |

**Imprimir es lo que se viene a hacer aquí casi siempre**: el carnet se perdió, se rompió, hace falta otra copia. No hay ningún límite ni ningún registro por imprimir de nuevo; el código sigue siendo el mismo y el carnet que ya está en el bolsillo sigue valiendo.

##### La página que abre el QR

Conviene saber qué enseña, porque quien la abre no es alguien de la empresa: es **un vigilante en un portón o un fiscal en la carretera**, con un teléfono en la mano y sin cuenta en el sistema. Está hecha para leerse en un teléfono, a pleno sol, en menos de tres segundos.

Lo primero y más grande es un sello con una sola palabra:

| Sello | Qué significa |
| --- | --- |
| **Vigente** | El carnet vale. La persona trabaja aquí |
| **Rechazado** | No vale. Debajo dice por qué: **Ya no trabaja aquí** o **Carnet anulado** |

**La foto va dentro del sello**, del mismo color, para que no se pueda leer «Vigente» y mirar una cara que no corresponde sin darse cuenta de que son dos cosas distintas.

Debajo, los datos:

| Bloque | Qué enseña |
| --- | --- |
| Identificación | Nombre, **número de ficha**, cargo, cédula |
| Antigüedad | Desde cuándo trabaja aquí, y cuánto lleva, en años y meses |
| Edad | Los años cumplidos |
| **En caso de emergencia** | Grupo sanguíneo, a quién llamar y su teléfono, el teléfono de la persona, y su dirección |
| Código | El mismo que está impreso bajo el QR |

**Los teléfonos son enlaces**: se pulsan y el teléfono llama. Es la razón por la que ese bloque existe y por la que está separado del resto con su propio rótulo en rojo — si alguien se accidenta en la carretera, quien encuentre el carnet no tiene que copiar un número a mano.

**Lo que NO enseña:** el sueldo, la cuenta bancaria, las incidencias, y el motivo por el que se anuló un carnet anterior. Nada de eso sale a la calle.

Si el QR está rayado y no lee, la dirección **/v** sin código abre la misma página con un campo para teclearlo. Acepta el código escrito con espacios o sin ellos, y corrige las confusiones de siempre —una **O** por un **cero**, una **I** o una **L** por un **uno**—.

##### Volver a emitir, y anular

Debajo hay dos botones pequeños, y solo los ve quien puede emitir:

- **Se perdió** — emite uno nuevo. **El anterior queda anulado**, y si alguien lo encuentra y lo escanea, la página dirá que no vale.
- **Anular** — deja a la persona sin carnet vigente, sin emitir otro. Para cuando egresa.

Las dos piden un motivo. El de anular es obligatorio; el de reemitir, opcional. **Lo que se escriba ahí no sale publicado**: es una nota interna de nómina, y la página del QR no la enseña.

Si hay carnets anulados, la tarjeta los lista abajo con su código, su fecha y su motivo. Sirve para cuando alguien aparece con un carnet que escanea como no válido y hay que responder de dónde salió.

##### Las dos caras sueltas

Al pie de la tarjeta, en letra pequeña: *"¿Hace falta una cara suelta para retocarla? el frente · el reverso, en PNG."* Son un apaño de taller —mirar o retocar una cara— y nada más. **El carnet que se manda a la imprenta es el PDF**, que ya trae las dos páginas al tamaño y a la resolución que pide.

#### Dotación, asignación e incidencias

Debajo de los documentos hay tres tarjetas más, y **son tres cosas distintas** que conviene no mezclar:

| Tarjeta | Qué guarda |
| --- | --- |
| **Dotación** | **Lo que necesita por su rol: casco, botas, uniforme, equipo.** |
| **Asignado para una actividad** | **Lo que se le dio para una faena concreta y hay que recuperar.** |
| **Incidencias** | **Lo que le pasó: enfermedad, lesión en labores, ausencia, conflicto.** |

**La diferencia entre dotación y asignación no es si vuelve, es para qué se le dio.** Una laptop es dotación y vuelve; unas mascarillas son dotación y se gastan; un kit de llaves para montar una banda es asignación. Si el bien vuelve o no lo dice cada artículo en el catálogo, en su campo **Al entregarlo a una persona** (7.8), y eso es un eje aparte.

Las dos primeras tarjetas tienen las mismas cuatro columnas —**Qué**, **Cuánto**, **Desde** y **Estado**— y el mismo botón **Entregar** arriba a la derecha, que ven almacén y recursos humanos. En **Qué** va el nombre del artículo y debajo su código y el número de la entrega.

La columna **Estado** dice en qué quedó cada cosa:

| Etiqueta | Qué significa |
| --- | --- |
| **Entregado** | Se gastó al usarlo. No hay nada que devolver |
| **En su poder** | Lo tiene, y se le va a pedir de vuelta |
| **Devuelta** | Ya volvió |
| **Perdida** | No apareció |
| **Dañada** | Volvió rota o dejó de servir |
| **Repuesta** | Trajo otra en su lugar |

Cuando no hay nada, cada tarjeta lo dice a su manera: **Todavía no se le ha dado dotación.** y **No tiene nada asignado.**

**Desde aquí no se entrega nada.** Las dos tarjetas son de solo lectura: el botón **Entregar** lleva a la pantalla de entrega de Asignaciones, **que hoy sí se alcanza** —el módulo entró al menú— y está contada en 18.3. Y hay un detalle que hace perder tiempo: **al llegar allí la persona no viene puesta**, hay que volver a elegirla en el desplegable.

#### Anotar una incidencia

Esta sí se registra desde la ficha, con el botón **Anotar una**, que ve recursos humanos. La ventana se llama **Anotar una incidencia de** seguido del nombre, y explica para qué es: **Lo que pasó, cuándo y por qué. Queda en su ficha y en la de quien haya participado.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Cuándo** | Sí | Viene la fecha de hoy. No admite días futuros ni fechas anteriores al ingreso |
| **Qué pasó** | Sí | Empieza en **Ausencia justificada** |
| **Dónde** | No | El sitio. Se pasa solo a mayúsculas |
| **Cuánto duró** | Sí | Empieza en **Todo el día** |
| **Días de reposo** | Según el caso | Solo aparece en los tipos que pueden llevar reposo. **Obligatorio si duró varios días.** |
| **Quién más estuvo** | No | Casillas con el resto del personal activo. **Sin nadie marcado queda como individual.** |
| **Motivo** | Sí | **Mínimo cinco caracteres.** La ayuda lo dice todo: *"Lo que se escriba aquí es lo que se va a leer dentro de un año."* |

Los ocho tipos de **Qué pasó** son: **Conflicto**, **Enfermedad**, **Lesión en labores**, **Accidente común**, **Ausencia justificada**, **Ausencia injustificada**, **Llegada tarde** y **Otra**. Y los cinco de **Cuánto duró**: **En la mañana**, **En la tarde**, **En la noche**, **Todo el día** y **Varios días**.

**El botón Anotar está apagado hasta que el motivo llegue a cinco caracteres.** No sale ningún aviso en rojo: simplemente no se puede pulsar.

**Una incidencia con más de un implicado se anota una sola vez y sale en todas las fichas.** Al marcar a alguien en **Quién más estuvo**, la incidencia aparece también en su ficha, con la línea **Anotada en la ficha de** seguida del nombre de la persona sobre la que se registró. Es lo que evita que un altercado entre dos se cuente como dos hechos distintos.

En la lista, cada incidencia se lee en una línea: la fecha, el tipo, el lugar, cuánto duró, los días de reposo entre paréntesis si los hay, y quiénes estuvieron o la palabra **Individual**. Debajo, **Motivo:** con lo que se escribió. Si no hay ninguna, **Ninguna anotada.**

**Ojo con la palabra «incidencia», que el sistema usa para dos cosas.** Aquí es *algo que le pasó a una persona*. En la pantalla **Asignaciones › Incidencias** significa otra: *un bien perdido o dañado que sigue sin resolverse*. No se mezclan.

#### Emitir una constancia de trabajo

1. Pulsa **Constancia de trabajo**.
2. Lee el párrafo que anticipa lo que dirá la carta: desde cuándo trabaja aquí y con qué cargo.
3. Decide si dejas marcada la casilla **Incluir el sueldo**. Viene marcada, y debajo el sistema explica el criterio: *"El banco lo exige; un arrendador no tiene por qué verlo."*
4. Pulsa **Emitir**.
5. Revísala en el visor y pulsa **Descargar**.

**No se puede emitir una constancia si la fecha de ingreso está sin confirmar.** El botón **Emitir** queda apagado y en su lugar aparece este aviso:

> *"Falta confirmar la fecha de ingreso. La constancia declara desde cuándo trabaja aquí y sale firmada por la empresa: no se puede emitir con una fecha que nadie ha revisado."*

Junto al aviso está el enlace **Corregir la fecha de ingreso**, que te lleva directo a arreglarlo. La razón de que sea un bloqueo y no una advertencia está escrita en el propio sistema: un aviso que se puede saltar con un clic se salta, y una constancia con una fecha inventada la firma la empresa.

Si nadie ha cargado quién firma por recursos humanos, la ventana también lo dice, y la carta sale con el cargo y el renglón en blanco para firmar a mano. Eso se arregla en **Parámetros de nómina** (ver 11.9).

### 11.5 Tabulador de cargos

**Nómina › Personal › Tabulador de cargos**

**No es una entrada del menú**: es la segunda pestaña de **Personal**.

La escala de sueldos de la empresa: cuánto gana cada cargo al mes. La pantalla lo resume así: *"Cuánto gana cada cargo al mes. El quincenal sale de esa cifra: no se escribe aparte, para que las dos no puedan desfasarse."*

#### Qué se ve

Arriba, solo para recursos humanos, dos botones: **Sincronizar** y **Nuevo cargo**.

**Sincronizar está siempre visible**, tenga o no algo que hacer. Es a propósito: un botón que solo aparece cuando hace falta no se puede encontrar cuando hace falta. Si hay fichas desfasadas, lleva pegada una etiqueta ámbar con cuántas son.

Debajo, una de estas dos franjas:

- **Si hay fichas desfasadas**, la franja las lista una por una con las columnas **Trabajador**, **Cargo**, **Tiene** y **Pasa a**, y explica exactamente qué va a pasar: *"Esto es lo que hará el botón Sincronizar de arriba: bajarles el sueldo y el nombre del cargo tal como están en la escala. Los recibos ya emitidos no cambian; una nómina en borrador sí tomará el sueldo nuevo cuando se vuelva a calcular."*
- **Si no hay ninguna**, la franja dice *"Todas las fichas coinciden con el tabulador, así que Sincronizar no tiene nada que hacer ahora mismo. Cuando cambies un sueldo aquí abajo, esta franja te dirá a quién le toca y de cuánto a cuánto, antes de que pulses nada."*

La escala tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Cargo** | El nombre y, debajo, cuánta gente está en ese nivel, y **inactivo** si no está vigente |
| **Mensual** | Lo único que se guarda |
| **Quincenal** | Su mitad, calculada cada vez |

El pie de la tabla vuelve a decirlo, porque es el punto de todo: *"Solo se guarda el mensual. El quincenal es su mitad y se calcula cada vez, así que las dos cifras no pueden acabar diciendo cosas distintas."*

**El tabulador no lleva el bono de alimentación.** Lo llevó hasta el 6 de agosto de 2026, en una columna por cargo, y se quitó: el beneficio de alimentación es el mismo para toda la empresa, se carga una sola vez en **Parámetros de nómina** —con su fecha de vigencia y el decreto del que sale— y es de ahí de donde la nómina lo paga. Escrito también aquí, el día que cambiara el anuncio el tabulador seguiría enseñando el monto viejo, y el tabulador es justamente la pantalla que se consulta para saber cuánto gana un cargo.

#### Crear o editar un cargo

1. Pulsa **Nuevo cargo**, o el lápiz de la fila que quieres cambiar.
2. Llena la ficha del nivel.
3. Pulsa **Guardar**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Cargo** | Sí, mínimo tres letras | *"Es el nombre con el que las fichas se enganchan a este nivel."* |
| **Sueldo mensual** | Sí | |
| **Moneda** | — | Empieza en **$** |
| **Quincena** | — | **Está bloqueada.** Se calcula sola mientras escribes el mensual: *"La mitad del mensual. Se calcula sola."* |
| **Orden en la lista** | No | *"Menor sale primero. El tabulador se lee como una escala, no en alfabético."* |
| **Vigente** | — | Viene marcada |
| **Nota** | No | |

Debajo, una banda gris recuerda dónde está lo que no se escribe aquí: *"Aquí solo va el sueldo. El beneficio de alimentación es el mismo para todos y se carga una sola vez en Parámetros de nómina."* — con enlace directo a esa pantalla.

El nombre del cargo **se guarda en mayúsculas y sin tildes**, y no se puede repetir. La razón es que «Vigilante» y «VIGILANTE» acabarían siendo dos niveles distintos y nadie sabría cuál es el bueno.

#### Bajar los sueldos a las fichas

1. Cambia el sueldo del cargo y guarda.
2. Vuelve a la franja de desfase y **lee la lista**: te dice a quién le toca, cuánto tiene y a cuánto pasa. Verde si sube, rojo si baja.
3. Pulsa **Sincronizar**.
4. Lee el resumen. Si cambió algo, sale **{n} fichas actualizadas** con la advertencia *"Estas personas cobran distinto a partir de la próxima nómina que se calcule."* y el detalle de cada una. Si no cambió nada, sale **No había nada que sincronizar** con la explicación *"Alguien más lo había hecho ya, o el desfase se resolvió desde la ficha."*
5. Pulsa **Entendido**.

#### Quitar un cargo

**Un cargo con gente dentro no se puede quitar.** El sistema lo dice antes de que lo intentes: *"Hay {n} persona(s) en este nivel. La base no va a dejar quitarlo: si se soltaran, seguirían cobrando lo mismo pero dejarían de subir cuando suba el cargo, y nadie sabría por qué. Muévelas antes, o desmarca «Vigente» para que deje de ofrecerse sin perder a quien está dentro."*

Esa es la salida buena: **desmarcar Vigente**. El nivel deja de ofrecerse al crear fichas nuevas, pero quien está dentro sigue enganchado y sigue subiendo cuando suba el cargo.

### 11.6 Novedades del período

**Nómina › Nómina del período › 1 · Novedades**

**No es una entrada del menú**: es la primera de las tres pestañas de **Nómina del período**.

Es la única pantalla donde se teclea algo cada quincena: *"Lo único que cambia de una quincena a otra: horas extra, faltas, bonos y descuentos. El resto lo saca el sistema del contrato."*

También se llega desde el botón **Cargar novedades** de la tarjeta de un período, y en ese caso llega con el período ya elegido.

#### Qué se ve

Arriba, el selector **Período**, que empieza en **Elige el período**. No lista los períodos anulados. Al lado, la etiqueta de estado.

Si no eliges ninguno, la pantalla dice **Elige un período** y *"Las novedades se cargan sobre el período que se va a pagar."*

Si el período ya no admite cambios, el aviso es claro: *"Este período está en «{estado}» y ya no admite cambios. Lo que se ve es lo que se usó para calcular."* En ese caso todas las casillas quedan apagadas y desaparecen los botones. No es una falla: los recibos ya están emitidos con esos números y cambiarlos ahora dejaría el papel diciendo una cosa y el sistema otra.

La tabla se titula **Personal activo**, con el subtítulo *"Se guarda por trabajador. Lo que no se toca queda en cero."* Sus columnas:

| Columna | Qué se carga |
| --- | --- |
| **Trabajador** | Apellidos, nombres y cargo; debajo, los bonos y descuentos ya cargados y el enlace **Bono o descuento** |
| **HE diurnas** | Horas extra diurnas |
| **HE nocturnas** | Horas extra nocturnas |
| **H. nocturnas** | Horas trabajadas en horario nocturno |
| **Feriados trab.** | Días feriados trabajados |
| **Descansos trab.** | Días de descanso trabajados |
| **Faltas s/j** | Faltas sin justificar |
| **Faltas just.** | Faltas justificadas |

Cada casilla admite medios (0,5) y no admite números negativos.

#### Cargar las cantidades de un trabajador

1. Elige el **Período**.
2. Busca su fila y escribe lo que corresponda en cada casilla.
3. Pulsa **Guardar** al final de esa fila.

**Se guarda fila por fila.** Lo que no toques queda en cero, así que no hace falta pasar por todo el mundo: solo por quien tuvo algo.

#### Cargar un bono o un descuento

1. Pulsa **Bono o descuento** bajo el nombre de la persona.
2. Elige el **Concepto**. La lista trae, para sumar, **Prima**, **Comisiones** y **Bono en divisas**; y para restar, **Cuota de préstamo**, **Anticipo de prestaciones** y **Otra deducción**. Cada opción dice si suma o resta.
3. Escribe el **Monto**. Tiene que ser mayor que cero.
4. Elige la **Moneda**. Empieza en **Bs**.
5. Escribe la **Nota**. El marcador te recuerda para qué sirve: **Aparece en el recibo**.
6. Pulsa **Agregar**.

La ventana explica qué va aquí y qué no: *"Lo que no sale del contrato ni de las horas: una prima, un bono en divisas, la cuota de un préstamo."*

**Cuidado con el concepto Anticipo de prestaciones de esta lista.** Desde que existe la pantalla de **Prestaciones sociales**, un anticipo de prestaciones se registra allí, y allí es donde baja el saldo de la persona y sale el dinero de la cuenta. Si además lo cargas aquí como descuento, se le descuenta dos veces: una del saldo de sus prestaciones y otra de su quincena. El sistema no avisa de esa duplicación, así que decidan en la casa por cuál de las dos vías se hace y no se mezclen.

Para quitar uno, pulsa la papelera que tiene al lado. **Se borra al instante, sin pedir confirmación.**

Si cargas un monto en dólares, el sistema lo pasa a bolívares con la tasa que quedó congelada al abrir el período, no con la del día en que lo tecleas.

### 11.7 Procesar nómina

**Nómina › Nómina del período › 2 · Procesar**

**No es una entrada del menú**: es la segunda pestaña de **Nómina del período**.

Es la pantalla donde vive el ciclo completo: *"Un período se abre, se calcula, se aprueba y se paga. No se salta pasos: cada uno deja constancia de quién lo hizo."*

Se ve una tarjeta por período, con su número —**NOM-2026-0001**, que se reinicia cada año—, sus fechas, su etiqueta de estado, la frase de qué toca hacer ahora y, cuando ya hay recibos, cuatro cifras: **Recibos**, **Asignaciones**, **Deducciones** y **Neto a pagar**.

Si todavía no hay ninguno, sale **Todavía no hay ningún período**, el texto *"Una nómina empieza abriendo el período que se va a pagar."* y el botón **Abrir el primero**.

Los botones de cada tarjeta cambian según el estado y según tu rol:

| Botón | Cuándo aparece | Quién lo ve |
| --- | --- | --- |
| **Cargar novedades** | Borrador o calculada | Recursos humanos |
| **Calcular** | Borrador o calculada | Recursos humanos |
| **Ver recibos** | Cuando ya hay recibos | Cualquiera |
| **Aprobar la nómina** | Calculada | Gerencia general |
| **Pagar** | Aprobada | Recursos humanos o gerencia general |
| **Anular** | Borrador, calculada o aprobada | Recursos humanos |

En un período anulado no sale ningún botón.

#### Abrir un período

1. Pulsa **Abrir período**.
2. Elige el **Tipo**: **Semanal — 7 días**, **Quincenal — 15 días**, **Mensual — 30 días** o **Especial — días del calendario**.
3. Escribe **Desde** y **Hasta**.
4. Escribe la **Descripción**, si quieres. Es el nombre con el que lo vas a reconocer después.
5. Pulsa **Abrir**.

Dos cosas que hay que saber antes de pulsar:

**La tasa se congela al abrir el período, no al pagar.** La propia ventana lo dice: *"La tasa del BCV se congela al abrirlo: si se moviera, el mismo recibo valdría distinto cada vez."* Todo lo que se calcule en ese período usa esa tasa: los montos en dólares de las novedades, y el equivalente en dólares que sale en los recibos.

**Los días que se pagan no son los del calendario.** La ayuda del campo lo explica: *"Los días que se pagan no son los del calendario: el mes son 30, tenga 28 o 31."* Un período mensual paga los días que estén cargados en **Parámetros de nómina**, no los del almanaque.

**Dos períodos del mismo tipo no pueden solaparse**, porque dos nóminas sobre los mismos días pagarían dos veces. Dos períodos de tipo distinto sí pueden convivir en las mismas fechas.

#### Calcular

Pulsa **Calcular**. El sistema genera un recibo por trabajador y el período pasa a calculado.

**Recalcular no acumula: borra los recibos del período y los vuelve a hacer enteros.** Puedes recalcular cuantas veces haga falta mientras el período esté en borrador o calculado. La razón está escrita en el propio sistema: quien corrige una hora extra mal cargada no tiene que adivinar qué quedó a medias.

Si a alguien las faltas sin justificar le dejan cero días pagados o menos, **esa persona no genera recibo**.

Si falta algún parámetro, el sistema no calcula a medias: se detiene y te dice cuál falta y dónde cargarlo.

#### Aprobar la nómina

Lo hace **gerencia general** —y la administración del sistema, que pasa por encima de todo—. **Esta sí es de las pocas que no tienen segunda puerta**: aprobar una nómina no se delega por nivel de permiso ni se extiende a nadie. Solo se aprueba una nómina calculada, y solo si tiene recibos: aprobar un período vacío sería aprobar nada.

Al aprobar, le llega un aviso a tesorería y a recursos humanos: **Nómina {número} aprobada**, con cuántos recibos son, por cuánto, y que está lista para pagar.

#### Pagar

Lo hacen **recursos humanos y la gerencia general** —y la administración, que pasa por encima de todo—. **No es tesorería: ese rol se retiró** (12.1).

1. Pulsa **Pagar**.
2. Elige **De qué cuenta sale**. La lista muestra el saldo de cada cuenta.
3. Escribe la **Referencia**, si la tienes.
4. Escribe la **Fecha del pago**. La ayuda dice **Vacío es hoy.**
5. Pulsa **Confirmar el pago**.

La ayuda del primer campo explica qué pasa si pagas desde una cuenta en divisas: *"Los recibos están en bolívares. Desde una cuenta en divisas sale el equivalente a la tasa del período, la misma con la que se calculó."*

Al confirmar, el saldo de esa cuenta baja, queda una línea de egreso en el libro de tesorería con el concepto **Nómina {número} — {n} trabajadores**, y les llega un aviso a gerencia general, a recursos humanos y a tesorería.

**Antes de pulsar Confirmar el pago, lee 11.11.** Este botón es el punto de no retorno del módulo.

#### Anular

1. Pulsa **Anular**.
2. Escribe **Por qué se anula**. Son mínimo diez letras y el sistema no las deja en blanco, porque *"La nómina es un documento con consecuencias legales."*
3. Pulsa **Anular**.

La ventana lo resume: *"El período queda a la vista con su motivo. Una nómina pagada no se puede anular."*

### 11.8 Recibos de pago

**Nómina › Nómina del período › 3 · Recibos**

**No es una entrada del menú**: es la tercera pestaña de **Nómina del período**.

Aquí no se registra nada: **esta pantalla solo se lee y se imprime.** No tiene botones de editar ni de borrar.

El recibo es el documento que justifica el pago, y la pantalla explica por qué se le da tanta importancia: *"El recibo es un documento con consecuencias legales: sin él, en un juicio se presume cierto lo que alegue el trabajador."*

#### Qué se ve

Arriba, el selector **Período**, que empieza en **Elige el período** y **solo lista los períodos que ya tienen recibos**. Sin período elegido, la pantalla dice **Elige un período** y *"Los recibos aparecen cuando la nómina está calculada."*

Si nadie ha cargado quién firma por la empresa, aparece una tarjeta ámbar: *"Los recibos van a salir sin el nombre de quien firma por la empresa. Se pone una sola vez en Nómina → Parámetros → RRHH_FIRMA_NOMBRE."*

Sobre la lista, cuántos recibos hay y el botón **Imprimir todos**. La lista trae:

| Columna | Qué muestra |
| --- | --- |
| **Trabajador** | Apellidos y nombres; debajo, la cédula y el cargo |
| **Días** | Los días pagados |
| **Asignaciones** | El total en bolívares |
| **Deducciones** | El total en bolívares |
| **Neto** | En bolívares y, debajo, el equivalente en dólares |

**Pincha en cualquier parte de la fila** para abrir el detalle. El icono de la impresora, en cambio, saca el papel directamente sin abrir el detalle.

#### El detalle de un recibo

Arriba, tres cifras: **Salario básico diario**, **Salario normal diario** y **Salario integral diario**. Debajo, cuatro bloques:

| Bloque | Qué trae |
| --- | --- |
| **Lo que se gana** | Lo que suma |
| **Lo que se descuenta** | Lo que resta |
| **Aportes del patrono** | *"No se le descuentan al trabajador: son costo de la empresa."* |
| **Se aparta para prestaciones** | *"Se acumula a su favor. No sale de su pago."* |

Al final, el **Neto a cobrar**, con su equivalente en dólares, y cómo se le paga.

Los dos últimos bloques son los que más confusión generan cuando alguien lee su recibo por primera vez. **Ni los aportes del patrono ni lo que se aparta para prestaciones salen de su pago**, y por eso en el papel impreso van con el título completo: **APORTES DEL PATRONO — NO SE LE DESCUENTAN** y **SE APARTA A SU FAVOR — NO SALE DE SU PAGO**, y a propósito no llevan subtotal, para que nadie los sume al descuento.

El bloque **Se aparta para prestaciones** dice lo que se apartó **en ese período**. Lo que la persona lleva acumulado en total, con sus intereses y sus adelantos, está en **Nómina › Prestaciones y parámetros › Prestaciones sociales**, explicado en 11.10. Son la misma cosa vista en dos sitios: el recibo enseña el aporte de esa quincena, la otra pantalla enseña la cuenta completa.

#### Imprimir

Pulsa **Imprimir recibo** en el detalle, el icono de impresora en la fila, o **Imprimir todos** para el período completo. El recibo se abre primero en el visor, y solo se descarga si pulsas **Descargar**.

**Cada recibo sale siempre por duplicado**: **Original — para la empresa** y **Copia — para el trabajador**. Si caben en la misma hoja, van separados por una línea roja punteada con el rótulo **corte aquí**; si no caben, la copia va en su propia hoja.

Cada copia trae el nombre, la cédula, la ficha, el cargo, las fechas y los días pagados; los tres salarios diarios; los cuatro bloques; la franja **NETO A COBRAR**; la declaración **Recibí conforme la cantidad indicada y estoy de acuerdo con los conceptos detallados.**; el renglón **Fecha de recibido:**; y dos firmas, la del trabajador y la de la empresa.

Bajo el neto sale también el equivalente en dólares, con la palabra **referencia** delante. Es intencional: **no es lo que se paga, es lo que valía ese día**.

### 11.9 Parámetros de nómina

**Nómina › Prestaciones y parámetros › Parámetros de nómina**

**No es una entrada del menú**: es la segunda pestaña de **Prestaciones y parámetros**.

Es la pantalla donde viven los porcentajes, los topes y los días con los que se calcula todo lo demás. La bajada lo dice sin rodeos: *"Ninguna cifra legal está escrita en el código. Todas viven aquí con su fecha de vigencia, porque en Venezuela cambian por decreto."*

En la cabecera hay un aviso ámbar fijo:

> *"El cestaticket y la base de la contribución de pensiones se anuncian sin publicarse en gaceta y cambian con frecuencia. Conviene revisarlos cada mes: una nómina calculada con el monto viejo se paga corta."*

**Este manual no publica ningún valor.** Los que rigen hoy son los que estén cargados en esta pantalla, y quién los fija se explica más abajo, en 11.11.

#### Qué se ve

La lista trae **Parámetro**, **Valor**, **Rige desde** y **Fuente**. Solo se muestra **la vigencia más reciente de cada uno**. Si hay anteriores guardadas, al pie lo dice: *"Hay {n} vigencias anteriores guardadas. No se borran: son las que permiten recalcular una nómina vieja con las cifras que regían entonces."*

Cada valor se muestra según su unidad: con el símbolo de porcentaje, con **Bs** o **$** delante, o con la palabra **días**, **h** o **× salario mínimo** detrás.

#### Cargar un valor nuevo

1. Pulsa **Nueva vigencia**.
2. Elige el **Parámetro**. La lista **solo ofrece los que ya existen**: desde aquí no se inventan parámetros nuevos.
3. Escribe el **Valor nuevo**.
4. Revisa la **Unidad**, que viene rellena con la del valor anterior.
5. Escribe **Rige desde**. Lee bien la ayuda: *"La fecha del decreto, no la de hoy: los períodos anteriores conservan el valor viejo."*
6. Escribe la **Descripción**.
7. Escribe la **Fuente**: la gaceta o el decreto. El marcador te muestra el formato.
8. Pulsa **Guardar**.

**Un valor nuevo no borra el anterior.** La ventana lo explica: *"No sustituye el valor anterior: lo cierra el día antes y empieza uno nuevo."* Y aquí **no hay borrado de ninguna clase**: lo único que se puede hacer es cargar una vigencia nueva.

#### Quién firma los recibos y las constancias

El nombre, el cargo y la cédula de quien firma por recursos humanos también se cargan aquí, como parámetros de texto. La razón es la misma: el día que cambie la persona, eso lo corrige recursos humanos desde su pantalla.

Hay un detalle que conviene conocer: **el sistema trata el texto «Por definir» como si estuviera vacío**. Si el nombre del firmante dice eso, los recibos salen con el renglón de la firma en blanco, no firmados por alguien llamado «Por definir». Ese arreglo viene de un fallo real: durante semanas los recibos salieron firmados por un nombre que no era un nombre.

### 11.10 Prestaciones sociales

**Nómina › Prestaciones y parámetros › Prestaciones sociales**

**No es una entrada del menú**: es la primera pestaña de **Prestaciones y parámetros**.

Es la cuenta de lo que la empresa le debe a cada trabajador por el tiempo que lleva trabajando aquí. La pantalla lo dice en una línea: *"Lo que la empresa le debe a cada quien por el tiempo trabajado."*

Esta cuenta se lleva dentro del sistema, no en una hoja aparte, y se lleva separada de la nómina de la quincena. La razón es que no es dinero que se pague ahora: se acumula a favor del trabajador y solo sale de la empresa en dos momentos, cuando se le adelanta una parte y cuando se le liquida.

#### Lo que conviene entender antes de abrirla

Esta es la parte que hay que saber explicar cuando alguien se acerca a preguntar cuánto tiene acumulado.

**Lo que se le va acumulando se llama garantía.** Cada trimestre —cada tres meses del calendario— la empresa le abona a cada trabajador una cantidad de días de su salario. No se los paga en la quincena: se los apunta a su favor. Ese apunte es el mismo que sale en el recibo bajo el título **Se aparta para prestaciones**, y por eso el recibo advierte que *"Se acumula a su favor. No sale de su pago."*

**El día que cumple años de trabajo se le suman días adicionales.** Pasada la antigüedad que fija la ley, cada aniversario de ingreso trae unos días más, que se van acumulando año tras año hasta un tope. Se le abonan en el trimestre donde cae su aniversario, que es cuando se ganan.

**Cuántos días son, en los dos casos, no lo dice este manual.** Los fija la ley, y este capítulo no publica ni uno solo: un número equivocado en materia de prestaciones cuesta dinero de verdad. Los días del trimestre están en **Parámetros de nómina**, en el renglón **Días de garantía de prestaciones por trimestre**, con su fecha de vigencia y su fuente; ahí se consultan y ahí se corrigen. Los días adicionales del aniversario y su tope, en cambio, **no están en esa pantalla**: van escritos por dentro del sistema, así que si la ley los cambia hay que pedir que los cambien. En los dos casos el valor bueno lo fija quien lleva la nómina junto con su asesor laboral o contable, con la gaceta delante.

**Los intereses son lo que produce ese dinero mientras está apartado.** Mes a mes, lo acumulado gana intereses a favor del trabajador. La pantalla lo resume así: *"Corren sobre la garantía acumulada, a la tasa que publica el BCV."* Dos precisiones que ahorran discusiones: los intereses corren sobre la garantía, no sobre los intereses que ya se abonaron —eso sería interés sobre interés—, y la tasa hay que escribirla a mano cada mes, porque el sistema no la puede adivinar.

**Un anticipo es un adelanto de lo que ya tiene acumulado.** Es dinero que se le entrega hoy a cuenta de lo que se le debe. No es un préstamo y no se descuenta de la quincena: baja directamente el saldo de su cuenta de prestaciones. No se le puede adelantar todo: la ley fija hasta qué parte de lo acumulado se puede adelantar, y de ahí se resta lo que ya se le adelantó antes. Tampoco se adelanta para cualquier cosa; la propia pantalla lo recuerda debajo del campo: *"La ley permite adelantar para vivienda, salud, educación y pensión alimentaria."*

**La liquidación es la cuenta final**, la que se hace cuando la persona se va, y suma todo lo anterior más lo que le quede pendiente del último año trabajado.

#### Quién puede hacer qué aquí

Ver la pantalla es lo mismo que ver el resto del módulo: con el permiso sobre Nómina alcanza. Registrar es otra cosa, y aquí hay dos alturas distintas:

| Acción | Qué permiso pide |
| --- | --- |
| Ver la lista y la cuenta de cada quien | El permiso sobre Nómina, el mismo del resto del módulo |
| **Cerrar trimestre** e **Intereses del mes** | Permiso de carga sobre Nómina. Lo tiene recursos humanos |
| **Cargar el corte**, **Anticipo**, **Liquidar** y **Pagar y dar de baja** | El permiso más alto sobre Nómina |

Los cuatro botones de la última fila piden el permiso más alto porque los cuatro mueven dinero o mueven la base con la que se calcula: el corte decide cuánto traía acumulado alguien de antes, y los otros tres sacan plata de la cuenta de la empresa. **Recursos humanos, con el permiso que trae de fábrica, no los ve.** Si hacen falta, se piden a quien administra el sistema. Si no los tienes, los botones no se dibujan.

#### Qué se ve

Arriba a la derecha, dos botones: **Cerrar trimestre** e **Intereses del mes**.

Debajo, tres cifras:

| Tarjeta | Qué muestra |
| --- | --- |
| **Se les debe hoy** | La suma de lo que se le debe a todo el personal activo |
| **Adelantado** | La suma de todo lo que se les ha adelantado y está restando de sus saldos |
| **Sin corte cargado** | Cuántos trabajadores no tienen todavía su punto de partida. En rojo si hay alguno, en verde si no queda ninguno |

**Las dos primeras cifras salen partidas por moneda** cuando en la empresa hay sueldos en bolívares y sueldos en dólares: se muestran una al lado de la otra, separadas por un punto, y no se suman. Sumarlas daría un número que no es ni bolívares ni dólares, y a qué tasa se convierten no lo puede decidir una pantalla.

**Las tres cifras cuentan solo a quien está activo.** La lista de abajo, en cambio, trae también a quien ya egresó, en gris.

Si falta algún punto de partida, aparece una franja de aviso: *"Hay {n} trabajador(es) sin corte cargado. Mientras no lo tengan, su cuenta arranca en cero y el sistema no sabe qué traían de antes. El corte se carga desde la ficha de cada uno, con lo que tenga acumulado a una fecha."* Una advertencia sobre esa última frase: **el corte no se carga en la ficha del trabajador, sino aquí mismo**, pinchando la fila de la persona. La ficha no muestra nada de prestaciones.

Si no hay nadie cargado en Personal, la pantalla dice **No hay trabajadores** y *"Las prestaciones se calculan sobre el personal cargado en Nómina."*

La lista tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Trabajador** | Apellidos y nombres y, debajo, el número de ficha y el cargo, más **liquidado** si ya se le liquidó |
| **Desde** | Su fecha de ingreso |
| **Garantía** | Lo acumulado: lo que traía del corte más lo abonado trimestre a trimestre |
| **Intereses** | Los intereses abonados a su favor |
| **Adelantado** | Lo que ya se le adelantó, en ámbar y con un menos delante. Un guion si nunca se le adelantó nada |
| **Se le debe** | La garantía más los intereses, menos lo adelantado. Es la cifra que se responde cuando preguntan |
| **Corte** | La fecha de su punto de partida, o la etiqueta **Sin corte** |

**Pincha en cualquier parte de la fila** para abrir la cuenta de esa persona.

#### Cargar el corte

El corte es el punto de partida: lo que esa persona ya tenía acumulado el día en que el sistema empezó a llevarle la cuenta. Sin él, su cuenta arranca en cero y la lista lo dice.

La propia ventana explica por qué se teclea a mano en vez de calcularlo el sistema: *"El sistema no tiene los salarios de los años anteriores, así que calcular hacia atrás daría un número con cara de exacto y falso. Esto se carga a mano, y se ve que es a mano."*

1. Pincha la fila de la persona.
2. Pulsa **Cargar el corte** —o **Corregir el corte**, si ya tiene uno—.
3. Llena la ficha del corte.
4. Pulsa **Guardar el corte**.

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Acumulado hasta** | Sí | La fecha del corte. Sin ella no se habilita **Guardar el corte** |
| **Días acumulados** | No | Cuántos días llevaba acumulados a esa fecha |
| **Garantía en {moneda}** | No | El monto acumulado, en la moneda de su sueldo |
| **Intereses acumulados** | No | Los intereses que ya había ganado |
| **Ya adelantado** | No | Lo que se le había adelantado antes de esa fecha |
| **De dónde sale esta cifra** | No | *"Queda guardado con tu nombre y la hora."* |

Ese último campo es el que hace defendible al corte: es lo único que explica, dentro de un año, de dónde salió el número que alguien tecleó.

Tres cosas que el sistema no deja al cargar un corte, y por qué:

- **No acepta una fecha futura**, porque nadie tiene acumulado todavía lo de un día que no ha llegado.
- **No acepta una fecha anterior al ingreso** de esa persona, porque no se acumula nada antes de empezar a trabajar.
- **No deja poner más adelantado que acumulado**, porque no se puede haber adelantado dinero que nunca se acumuló.

Y una cuarta, que es la que más incomoda: **si ya hay trimestres cerrados anteriores a esa fecha, el corte no se guarda.** El sistema responde «Ya hay trimestres calculados antes de esa fecha de corte. Anúlalos primero: si no, ese tiempo quedaría contado dos veces.» La razón está en el propio mensaje: el corte ya incluye ese tiempo, y el trimestre lo volvería a contar. Ahora la parte incómoda: **esta pantalla no tiene ningún botón para anular un trimestre cerrado.** Si te topas con ese mensaje, no hay salida desde la pantalla; hay que pedírselo a quien administra el sistema.

Por eso el orden importa: **primero se carga el corte de todo el mundo, y después se cierran trimestres.** Al revés se llega a un callejón.

#### Cerrar el trimestre

Es la operación que abona a cada quien lo que le tocó de ese trimestre. Se hace una vez, cuando el trimestre ya terminó.

1. Pulsa **Cerrar trimestre**, arriba a la derecha.
2. Escribe el **Año**.
3. Elige el **Trimestre**: **1 — enero a marzo**, **2 — abril a junio**, **3 — julio a septiembre** o **4 — octubre a diciembre**. Viene propuesto el anterior al que corre.
4. Pulsa **Cerrar el trimestre**.

Al terminar sale un aviso con cuántos trabajadores se abonaron: «Trimestre cerrado para {n} trabajador(es).» Si no había nada que abonar —porque ese trimestre ya estaba cerrado, o porque nadie llevaba todavía el tiempo mínimo de servicio—, el aviso también lo dice. Se cierra con **Entendido**.

Cuatro cosas que conviene saber antes de pulsar:

**De dónde sale el salario con el que se calcula.** La ventana lo explica: *"El salario sale del último recibo del trimestre, con las horas extras y los recargos que de verdad se pagaron. Si no hay recibos, se calcula desde la ficha y el depósito queda marcado como estimado. Volver a correrlo no duplica nada."* Un abono marcado como **estimado** no está mal calculado: está calculado sobre el sueldo de la ficha y no sobre lo que de verdad se pagó, y se marca para que se sepa.

**No se puede cerrar un trimestre que no ha terminado.** El sistema responde «El trimestre … de … todavía no ha terminado: cierra el ….», con la fecha en que se podrá. Cerrar un trimestre a mitad de camino abonaría menos de lo que corresponde y nadie se acordaría después de volver.

**A quien no lleva todavía el tiempo mínimo de servicio no se le abona nada** ese trimestre. Empieza a acumular cuando la ley dice que empieza, y ese tiempo mínimo no lo decide el sistema.

**Volver a cerrar el mismo trimestre no duplica nada.** A quien ya tiene su abono se le salta. Por eso se puede correr sin miedo después de cargar el corte de alguien que faltaba.

#### Abonar los intereses del mes

Se hace una vez al mes, cuando el mes ya cerró y el Banco Central publicó su tasa.

1. Pulsa **Intereses del mes**, arriba a la derecha.
2. Escribe el **Año** y el **Mes**. Viene propuesto el mes anterior.
3. Escribe la **Tasa anual (%)** que publicó el Banco Central para ese mes.
4. Pulsa **Abonar intereses**.

Sale el aviso «Intereses abonados a {n} trabajador(es).»

**Sin tasa no se abona nada, y es a propósito.** La ventana lo dice con todas sus letras: *"La tasa se guarda con el mes al que pertenece: sin ella no se calcula nada, porque unos intereses con una tasa inventada también son inventados."* Si intentas calcular un mes sin tasa cargada, el sistema responde «No está cargada la tasa de intereses de …. Cárgala antes de calcular: con una tasa inventada, los intereses también lo serían.»

**La tasa queda guardada con el mes al que pertenece**, no con el día en que la tecleaste. Eso es lo que permite que abonar marzo en agosto dé el mismo resultado que habría dado en marzo.

**Tampoco se puede abonar un mes que no ha terminado.**

**Volver a correr un mes ya abonado no suma dos veces**: rehace el abono de ese mes con la tasa que esté cargada. Si te equivocaste al teclear la tasa, esa es la forma de corregirlo: vuelve a correr el mismo mes con la tasa buena.

#### La cuenta de una persona

Se abre pinchando su fila. Arriba, el nombre; debajo, la ficha, el cargo y desde cuándo trabaja.

Lo primero es el resumen de su cuenta: **Garantía acumulada**, **Intereses**, **Adelantado** y, separada por una línea, la cifra que importa, **Se le debe**. Al pie, la pantalla dice hasta cuánto se le puede adelantar hoy.

Más abajo, y solo si los tiene, aparecen dos listas:

- **Depósitos trimestrales**, uno por trimestre cerrado, con el año, el trimestre, los días que se le abonaron —y los adicionales, si le tocaron—, el salario diario con el que se calculó y el monto. Los marcados **estimado** son los que se calcularon desde la ficha por no haber recibos.
- **Anticipos**, cada uno con su número —**ANT-2026-0001**, que también se reinicia cada año—, para qué fue, la fecha, de qué cuenta salió y el monto.

Los depósitos y los anticipos anulados siguen apareciendo, en gris. No desaparecen: una cuenta de la que se borran renglones deja de poder explicarse.

#### Registrar un anticipo

1. Abre la cuenta de la persona y pulsa **Anticipo**.
2. Escribe el **Monto en {moneda}**. La ventana ya te dice arriba hasta cuánto se le puede adelantar; si escribes más, el campo se marca en rojo y avisa de que pasa del tope permitido.
3. Elige **Para qué**: **Vivienda**, **Salud**, **Educación**, **Pensión alimentaria** u **Otro**.
4. Elige **De qué cuenta sale**. Si lo dejas en **Sin mover tesorería**, el anticipo queda apuntado en su cuenta pero no sale dinero de ninguna cuenta de la empresa.
5. Escribe la **Referencia**, si la tienes.
6. Escribe el **Detalle**.
7. Pulsa **Registrar el anticipo**.

**Si eliges una cuenta, el dinero sale de verdad**: el saldo de esa cuenta baja y queda una línea de egreso en el libro de tesorería a nombre de esa persona. Si no la eliges, no baja ningún saldo. Conviene tenerlo claro antes de pulsar, porque son dos cosas distintas y el botón es el mismo.

Lo que el sistema no deja, y por qué:

- **No deja adelantar más de lo permitido.** Responde «A … se le pueden adelantar hasta … y se están pidiendo …» La razón es que un anticipo por encima del tope no es un anticipo: es dinero entregado contra algo que todavía no existe.
- **No deja un monto de cero o negativo**, porque un anticipo que no entrega nada no es un anticipo.
- **No deja fecharlo hacia adelante**, porque el dinero no puede salir mañana y estar apuntado hoy.
- **No se puede anular un anticipo desde esta pantalla.** Si se registró mal, hay que pedírselo a quien administra el sistema.

#### Liquidar a un trabajador

Liquidar es la cuenta final de alguien que se va. Son dos pasos separados a propósito: primero se calcula y se revisa, y después se paga.

**Paso uno: calcular.**

1. Abre la cuenta de la persona y pulsa **Liquidar**.
2. Escribe el **Último día trabajado**. Viene propuesto hoy.
3. Elige **Por qué sale**: **Renuncia**, **Despido injustificado**, **Despido justificado**, **Contrato vencido**, **Jubilación** o **Fallecimiento**. La ayuda advierte de lo que cambia según elijas: *"El despido injustificado paga, además, otro tanto igual."*
4. Escribe **Otras asignaciones** y **Otras deducciones**, si las hay.
5. Escribe la **Observación**.
6. Pulsa **Calcular la liquidación**.

La ventana deja claro qué hace y qué no: *"Calcular no paga ni da de baja a nadie: deja el cálculo a la vista para revisarlo."* Ese es el punto: entre calcular y pagar hay una pausa, y esa pausa es la única oportunidad de revisar el cálculo mientras todavía se puede rehacer.

El cálculo aparece dentro de la cuenta de esa persona, en una tarjeta con su número —**Liquidación LIQ-2026-0001**, que se reinicia cada año— y su etiqueta de estado, **calculada** o **pagada**, con estos renglones:

| Renglón | Qué es |
| --- | --- |
| **Garantía acumulada** | Lo que se le fue abonando trimestre a trimestre, más lo que traía del corte |
| La cuenta por años de servicio | La otra forma de calcular lo mismo: los días por año de servicio que manda la ley, al último salario integral. Su título en pantalla trae el número de días; este manual no lo reproduce |
| **Base (la mayor)** | De las dos anteriores, la que dé más. Esa es la que se paga |
| **Intereses** | Los intereses acumulados a su favor |
| **Vacaciones fraccionadas** | La parte que le corresponde del último año trabajado |
| **Bono vacacional** | Lo mismo, del bono |
| **Utilidades fraccionadas** | Lo mismo, de las utilidades |
| **Indemnización** | Solo trae cifra si sale por despido injustificado |
| **Menos lo adelantado** | Todos sus anticipos, más lo que venía como adelantado en su corte |
| **Total a pagar** | El resultado |

La pantalla lo resume así: *"Se calculan las dos cuentas que manda comparar la ley y se paga la mayor."* Se enseñan las dos, y no solo el resultado, porque quien firma una liquidación tiene que poder explicar de dónde salió el número.

**Paso dos: pagar.**

1. En esa misma tarjeta, elige **Pagar desde** la cuenta de la que sale el dinero.
2. Pulsa **Pagar y dar de baja**.

El nombre del botón dice exactamente lo que hace: sale el dinero de la cuenta, queda la línea en el libro de tesorería y **la persona queda egresada en su ficha**, con la fecha y el motivo de la liquidación. No hay que ir a **Personal** a egresarla después: un trabajador liquidado que siguiera apareciendo como activo volvería a salir en la próxima nómina.

Al revés hay una trampa, y es la más cara de este capítulo: **si primero lo egresas desde Personal, ya no lo puedes liquidar aquí.** Los botones **Anticipo** y **Liquidar** solo se dibujan para quien está activo, así que una persona egresada aparece en la lista, en gris, con su saldo a la vista y sin forma de cerrarle la cuenta desde la pantalla. El sistema no avisa de esto en ninguno de los dos sitios.

De ahí sale la regla de la casa: **cuando alguien se va, primero se le liquida aquí y se le paga.** El egreso lo pone el propio botón **Pagar y dar de baja**. **Egresar** en Personal queda para el caso en que no haya nada que liquidar.

Lo que el sistema no deja, y por qué:

- **No deja liquidar dos veces.** Si ya hay un cálculo, responde «A … ya se le calculó la liquidación. Anúlala primero si hay que rehacerla.» Y aquí vale la misma advertencia de antes: **esta pantalla no tiene botón para anular una liquidación.** Antes de pulsar **Calcular la liquidación**, revisa la fecha y el motivo.
- **No deja fechar el egreso antes del ingreso ni hacia adelante**, porque ninguna de las dos cosas puede haber pasado.
- **No deja pagar una liquidación que no arroja monto**, ni pagar dos veces la misma.
- **No deja adelantar ni liquidar a quien ya está egresado o ya se liquidó**: los botones **Anticipo** y **Liquidar** solo se dibujan para quien está activo y sin liquidar. Su cuenta se sigue viendo, pero de solo lectura.

#### Lo que esta pantalla no hace

Cuatro límites reales, dichos sin rodeos porque se descubren el primer día:

- **No imprime nada.** No sale un comprobante de liquidación, ni un recibo de anticipo, ni un estado de cuenta para entregarle al trabajador. Lo que se le enseñe hay que copiarlo de la pantalla.
- **No se anula nada desde aquí**: ni un trimestre cerrado, ni un anticipo, ni una liquidación. Los tres se pueden anular en el sistema, pero no hay botón que lo haga, así que hoy pasa por quien lo administra.
- **No cierra el trimestre sola, ni abona los intereses sola.** Las dos cosas hay que acordarse de hacerlas: el trimestre cuando termina, los intereses cuando el Banco Central publica su tasa del mes. Nadie avisa.
- **La ficha del trabajador no muestra nada de esto.** Para saber cuánto tiene acumulado alguien hay que venir a esta pantalla.

### 11.11 Lo que conviene entender

#### La nómina semanal y la quincenal

Son dos cosas distintas y conviene tenerlas separadas en la cabeza:

- **La frecuencia de pago está en la ficha de cada trabajador**: **Semanal**, **Quincenal** o **Mensual**. Es un dato de esa persona.
- **El tipo está en el período**: **Semanal — 7 días**, **Quincenal — 15 días**, **Mensual — 30 días** o **Especial — días del calendario**. Es un dato de esa nómina.

**Cómo se elige el período.** No se elige: se abre. Recursos humanos pulsa **Abrir período**, elige el tipo y las fechas, y a partir de ahí ese período aparece en el desplegable **Período** de Novedades y de Recibos. Dos períodos del mismo tipo no pueden pisarse, pero un período semanal y uno quincenal sí pueden convivir sobre las mismas fechas, y eso es lo que permite llevar las dos nóminas a la vez.

Ahora la limitación, que hay que decir con todas sus letras porque cambia cómo se trabaja:

**Al calcular, el sistema genera recibos para todo el personal activo, sin mirar la frecuencia de pago de cada ficha.** Si abres un período semanal y pulsas **Calcular**, no salen solo los obreros de frecuencia semanal: sale todo el mundo. Lo mismo pasa en **Novedades del período**, que lista a todo el personal activo. Hoy la **Frecuencia de pago** de la ficha sirve para informar —se ve en la lista y en la ficha—, no para separar las dos nóminas al calcular.

Mientras eso siga así, la separación entre las dos nóminas la tiene que sostener la persona que las lleva, revisando los recibos calculados antes de aprobar nada. Conviene confirmar este punto con quien administra el sistema antes de montar el procedimiento de la casa sobre él.

#### El tabulador y cómo baja a las fichas

El tabulador guarda **una sola cifra por cargo: el sueldo mensual**. La quincena es su mitad y se calcula cada vez que se muestra. No se puede escribir aparte, y ese es exactamente el punto: dos cifras que tienen que cuadrar entre sí acaban algún día sin cuadrar, y entonces nadie sabe cuál de las dos es la buena.

El sueldo del tabulador llega a la ficha de una persona por dos caminos:

1. **Al crear o editar la ficha.** Se elige el **Cargo del tabulador** y la pantalla copia en el acto el cargo, el sueldo y la moneda. El campo **Cargo** queda bloqueado, porque a partir de ahí lo pone el tabulador.
2. **Con el botón Sincronizar.** Cuando cambia el sueldo de un cargo, las fichas enganchadas a él quedan **desfasadas**, y la franja del tabulador las lista con lo que tienen y lo que van a pasar a tener. **Sincronizar** les baja el sueldo y el nombre del cargo tal como están en la escala.

Una ficha se considera desfasada si no coincide el sueldo, la moneda, la base **o el nombre del cargo**. Lo del nombre no es un capricho: si se rebautiza un nivel y las fichas se quedan con el nombre viejo, dentro de un año la lista de personal y el tabulador hablan de puestos que parecen distintos y son el mismo.

**Qué no toca Sincronizar**, y por qué:

- **A quien no tiene cargo del tabulador.** Está fuera de la escala a propósito. Su sueldo se escribió a mano y no sube cuando suba el tabulador.
- **A quien ya egresó.** Su ficha es historia. Reescribirle el sueldo cambiaría la base de una liquidación que quizá ya se pagó.
- **A los recibos ya emitidos.** Guardan sus propias cifras. Un recibo firmado no cambia porque suba el tabulador.

Lo que sí cambia es un período abierto: uno en borrador o calculado tomará el sueldo nuevo la próxima vez que se calcule. Por eso el resumen de **Sincronizar** avisa: *"Estas personas cobran distinto a partir de la próxima nómina que se calcule."*

#### El pago no se puede deshacer

Este es el punto más importante del capítulo.

Hasta que se pulsa **Confirmar el pago**, todo tiene vuelta atrás:

- Se puede **recalcular** cuantas veces haga falta. Recalcular rehace los recibos enteros.
- Se pueden **corregir las novedades**: una hora extra mal cargada, una falta que no era, un bono que sobra.
- Se puede **anular el período entero**, incluso ya aprobado, escribiendo por qué.

Después de **Confirmar el pago**, no hay ninguna de las tres:

- **La nómina no se anula.** El sistema responde «Esta nómina ya se pagó y no se puede anular. Corrige la diferencia en el período siguiente.»
- **La nómina no se recalcula.** El sistema responde «El período está en "PAGADA" y ya no se recalcula. Anúlalo si hay que rehacerlo.» — y anularla tampoco deja.
- **La salida de dinero no se reversa.** En el libro de tesorería, un movimiento equivocado normalmente se corrige con un reverso, que es otra línea en sentido contrario. El pago de una nómina no admite ni siquiera eso: el botón de deshacer no se ofrece para esas líneas, y si se intenta, el sistema responde «Este movimiento es el pago de una nómina. Reversarlo dejaría los recibos diciendo que se cobró y el banco que no salió nada.»

La razón es esa misma frase. Si se devolviera el dinero a la cuenta, el período seguiría diciendo «pagada» y los recibos seguirían diciendo que la gente cobró. El sistema quedaría contando dos historias distintas, y esa contradicción no se descubre hasta el cierre, cuando ya nadie recuerda qué pasó.

**La única corrección posible es en el período siguiente.** Está escrita en el propio mensaje: se carga la diferencia en **Novedades del período** como un bono, si se pagó de menos, o como un descuento, si se pagó de más. Así quedan las dos cosas a la vista: lo que se pagó mal y la corrección.

**Qué revisar antes de llegar ahí.** El paso de revisión existe y está entre calcular y aprobar. Úsalo:

1. **Recalcula** después del último cambio en novedades. Un cambio guardado no entra en los recibos hasta que se vuelve a calcular.
2. Abre **Ver recibos** y mira las cuatro cifras del período: **Recibos**, **Asignaciones**, **Deducciones** y **Neto a pagar**. Si el número de recibos no es el que esperas, sobra o falta gente.
3. **Entra a los recibos, uno por uno.** La fila se abre pinchando en cualquier parte. Revisa los días pagados y los renglones de **Lo que se gana** y **Lo que se descuenta**.
4. Comprueba que el tabulador no tenga fichas desfasadas sin sincronizar, porque si las hay, el sueldo del recibo no es el de la escala.
5. Comprueba en **Parámetros de nómina** que los valores que cambian con frecuencia estén al día. Una nómina calculada con un monto viejo se paga corta.
6. Solo entonces, **Aprobar la nómina**. Y solo entonces, **Confirmar el pago**.

Que aprobar y pagar sean de dos personas distintas está pensado justo para esto: entre las dos hay una pausa, y esa pausa es la última oportunidad de encontrar un error mientras todavía se puede arreglar.

#### Por qué los porcentajes y los topes se cargan en pantalla

Las cifras con las que se calcula la nómina de cada período —los porcentajes de las deducciones, los topes y los días de referencia— no están escritas por dentro del sistema. Viven en **Parámetros de nómina**, cada una con su fecha de vigencia y su fuente.

La razón la explica el propio sistema: en Venezuela estas cifras cambian por decreto, y a veces con efecto hacia atrás. Un número escrito por dentro obligaría a que un técnico tocara el sistema cada vez que sale una gaceta. Cargado en pantalla, lo actualiza recursos humanos el mismo día, sin esperar a nadie.

**Con las prestaciones sociales esto se cumple solo a medias, y conviene saberlo.** Los días de garantía de cada trimestre sí están en **Parámetros de nómina**, en el renglón **Días de garantía de prestaciones por trimestre**. Pero otras cifras que usa esa pantalla van escritas por dentro: los días adicionales del aniversario y su tope, el tiempo mínimo de servicio para empezar a acumular, hasta qué parte de lo acumulado se puede adelantar y los días por año con los que se compara la liquidación. Ninguna de esas se puede corregir desde ninguna pantalla. Si la ley cambia alguna, hay que pedir que la cambien, y mientras tanto lo que salga en pantalla hay que contrastarlo con el asesor antes de pagar nada.

De ahí sale la segunda regla, que es la que hace que los recibos sean defendibles: **los valores se aplican por la fecha del período, no por la de hoy.** Recalcular en agosto una nómina de marzo tiene que dar lo mismo que dio en marzo. Por eso las vigencias anteriores no se borran nunca.

**Quién los mantiene.** Los carga recursos humanos, y **su valor lo fija quien lleve la nómina junto con su asesor laboral o contable**, con la gaceta o el decreto delante. Este manual no dice cuánto vale ninguno, y nadie debería tomar esos números de un manual: se toman de la fuente y se escriben en la pantalla, dejando anotada esa fuente en el campo **Fuente**.

Si al calcular falta alguno, el sistema no calcula a medias: se detiene y te dice cuál falta y dónde cargarlo.

#### Las fichas de personal no se borran

Hasta el 6 de agosto de 2026 se podía borrar una ficha, con candados: el sistema comprobaba que la persona existiera, que no tuviera ningún recibo de nómina y que no tuviera ninguna novedad cargada. La idea era dejar borrar solo una ficha cargada por error —un nombre mal escrito, una cédula repetida, alguien metido dos veces— y nunca a quien ya hubiera cobrado.

**Se quitó.** Los candados comprobaban lo que la base sabe, no lo que hace falta saber. Que alguien no tenga recibos no significa que no haya trabajado aquí: puede que su nómina no se haya procesado todavía, que se le pagara por fuera, o que la ficha se cargara ayer. Y esos candados tampoco miraban las prestaciones: un corte cargado, unos trimestres cerrados o unos intereses abonados se iban con la ficha, en silencio.

Encima, el borrado era la única acción de todo el sistema que no se podía deshacer desde ninguna pantalla.

**Lo que se hace ahora, en todos los casos, es egresar.** Con la fecha y el motivo escrito, y «cargada por error» o «duplicada de la ficha 0012» son motivos perfectamente válidos. La persona deja de salir en la lista de activos —que es lo único que se quería— y lo que decía su ficha se conserva. Si mañana resulta que no había que sacarla, se vuelve a activar.

**Lo que se borró antes del cambio se recuperó.** El registro de auditoría guarda la fila completa cuando algo se borra, así que las fichas volvieron con sus datos, desincorporadas y con el motivo apuntando a quién las borró y cuándo. Vuelven desincorporadas y no activas a propósito: nadie puede saber hoy cuál era una persona trabajando y cuál un duplicado, y devolverlas activas metería gente en la próxima nómina sin que nadie lo hubiera decidido. Quien sepa, las reactiva una por una.

**El número de ficha no se reutiliza.** El correlativo nunca se reinicia. Si faltan números en la serie, son fichas de la época en que se podía borrar.


#### Los documentos que salen del módulo

Son cinco, salen de dos sitios distintos y **todos se abren en pantalla antes de guardarse**:

| Documento | De dónde sale | Cómo sale |
| --- | --- | --- |
| **Ficha completa (PDF)** | La ficha del trabajador | Se abre en el visor y se descarga desde ahí |
| **Carnet (PDF)** | La tarjeta del carnet, en la ficha | Se emite y se abre solo. Después, **Imprimir el carnet** |
| **Constancia de trabajo** | La ficha del trabajador | Se abre en el visor y se descarga desde ahí |
| **Recibo de pago** | Recibos de pago | Se abre en el visor y se descarga desde ahí |

- **La ficha** va en A4 con todos los datos de la pantalla, la foto, el estado de la persona y dos renglones de firma: **Firma del trabajador** y **Recursos humanos**. Al pie lleva quién la emitió y cuándo, y el rótulo **Documento interno**.
- **El carnet** es un PDF de dos páginas, cada una de 54 × 86 mm a 300 dpi, que es lo que pide una imprenta para que no salga pixelado. En el frente van la foto, el nombre, el cargo y cuatro datos: **Cédula**, **Departamento**, **Ingreso** y **Sangre**. En el reverso, la marca, la razón social, el RIF y **el QR de verificación con el código de esa persona**.
- **El reverso NO es igual para todos.** El código del QR es distinto en cada carnet: es lo que identifica a esa persona cuando alguien escanea. Está explicado entero en 11.4.
- **La constancia** es la carta que se entrega a un banco o a quien la pida. Va en papel de la empresa, redactada en el tiempo verbal correcto según la persona siga trabajando o ya no, y con el sueldo dentro o fuera según dejes marcada la casilla **Incluir el sueldo**. Lleva un recuadro que repite el nombre, la cédula y la ficha para poder cotejarlos.
- **El recibo** sale siempre por duplicado, original y copia, y esa es la mitad de su valor: la copia firmada por el trabajador es la constancia de que cobró. **Si el trabajador tiene firma guardada y encendida en su ficha, el recibo sale ya con ella estampada** sobre la raya de la izquierda; solo queda en blanco si no la tiene o está apagada. **La raya de la empresa, en cambio, sale siempre vacía**: de quien firma por la empresa se guarda el nombre y el cargo, no una imagen.

La ficha, la constancia y el recibo llevan al pie quién los emitió y cuándo, y **abren con la misma cabecera que el resto de los papeles del sistema** (13.2). Los que llevan firma de la empresa dependen de que el nombre del firmante esté cargado en **Parámetros de nómina**: si no lo está, el renglón sale con el cargo y en blanco, para firmar a mano. El carnet no lleva pie ni firma: en una tarjeta de 54 mm no cabe, y no hace falta.

### 11.12 Organigrama

> **Hoy esta pantalla no se ofrece en el menú.** Está construida y funciona, pero se dejó fuera mientras se afina, y quien escriba su dirección a mano se encuentra primero el cartel de **En construcción**. Está explicado en 1.5.

Es una sección propia y no una pantalla dentro de Nómina, que es como lo pidió la líder de sistemas. **El permiso sí es el de Nómina**: quien lleva el personal es quien sabe de quién depende quién. Con Nómina en lectura se ve el árbol; para cambiarlo hace falta escritura, y sin ella no aparece ningún botón.

Responde una pregunta que ninguna otra pantalla contesta: **Quién depende de quién, y cuánta gente hay prevista en cada puesto.**

#### Qué se ve

Tres tarjetas arriba:

| Rótulo | Qué mide |
| --- | --- |
| **Prevista en el organigrama** | Cuántas personas suman todos los puestos dibujados |
| **Registrada en nómina** | Cuántas hay activas de verdad. Debajo, **cuadra** o **3 de diferencia**, y **· 2 sin departamento escrito** si las hay |
| **Departamentos sin sitio** | Departamentos que existen en nómina y a los que nadie colgó de la estructura |

Debajo, la tarjeta **La estructura**, con el subtítulo **Cada sangría es un escalón de dependencia.** El árbol se dibuja anidado, con un riel a la izquierda en vez de cajas y líneas, porque así se lee también en el teléfono.

Cada renglón lleva, en este orden: el **nombre** —en negrita si es una unidad—, **quién lo ocupa** en azul si tiene titular, **el número de personas previstas entre paréntesis**, y una etiqueta de nómina.

Esa etiqueta es lo que hay que aprender a leer, y hay una tarjeta al lado que lo explica:

- Verde, **4 en nómina**: la nómina tiene esa gente registrada en el departamento enlazado.
- Ámbar, **3 ≠ 5**: la nómina no coincide con lo previsto. **No es un error del sistema: es lo que hay que cuadrar.**
- **Sin etiqueta**: ese puesto no está enlazado a ningún departamento de nómina. Sin enlace no es cero: es que no se sabe, y pintar un cero sería mentir.

Y sobre las dos cifras, la propia pantalla avisa: **Son dos, y no tienen por qué coincidir todavía.** El número entre paréntesis es la gente **prevista**, que sale del organigrama; la etiqueta de color es la **registrada** en nómina. Mientras la nómina se termina de cargar, mandan las cifras del organigrama.

#### Cómo se cambia

Los botones son iconos, y su nombre sale al pasar el ratón por encima:

1. **+**, **Colgar un puesto de aquí**. Abre el formulario debajo del renglón, sin ventana emergente.
2. El **lápiz**, **Editar**.
3. Las **flechas**, **Moverlo a otra dependencia**. No se arrastra: se abre un buscador —**Mover «Mantenimiento» a**— donde se escribe el código o el nombre del sitio nuevo. Cada opción muestra debajo de quién cuelga hoy, para distinguir dos «Mantenimiento» distintos. Para dejarlo como estaba, **Dejarlo donde está**.
4. La **papelera**, **Quitarlo**, que solo aparece si de ese puesto no cuelga nada.

El formulario pide: **Cómo se llama**, **Quién lo ocupa** —*se deja vacío si el puesto no tiene nombre y apellido*—, **Qué es** (**Unidad** o **Cargo**), **Cuántos**, **Departamento de nómina** —*para saber cuánta gente hay de verdad aquí*, y se puede dejar **Sin enlazar**— y una **Nota** para *lo que el nombre no alcanza a decir*. Se cierra con **Añadir** o **Guardar**, y con **Cancelar**.

Una **Unidad** es una dependencia —Administración, Cocina, Operaciones—; un **Cargo** es un puesto con su gente, como «Cocineros (2)».

#### Cuando no te deja

| Lo que ves | Qué significa |
| --- | --- |
| «Ya hay una cabeza en el organigrama. Cuelga este nodo de alguna.» | Solo puede haber una raíz |
| «De ahí cuelgan 3 puesto(s). Muévelos o quítalos primero.» | No se quita un puesto con gente colgando |
| «No se puede mover ahí: ese puesto ya depende de este.» | Estabas creando un círculo |
| «Un cargo no puede depender de sí mismo.» | Elegiste como destino el mismo puesto |
| «El nombre del cargo o la unidad no puede quedar vacío.» | Falta el nombre |

### 11.13 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: … Tu usuario no tiene ese rol.» | Ese paso lo ejecuta otro rol | Pídele que lo haga a quien tenga el rol que nombra el mensaje |
| «Sesión no válida. Vuelve a entrar.» | Se cerró tu sesión | Vuelve a entrar al sistema |
| «Faltan el nombre y el apellido del trabajador.» | La ficha quedó sin nombre o sin apellido | Complétalos |
| «La fecha de ingreso decide la antigüedad, el bono vacacional y las prestaciones. No puede quedar vacía.» | Falta la fecha de ingreso | Escríbela. Si no la sabes con certeza, búscala antes de guardar |
| «La fecha de nacimiento da menos de 14 años. Es la edad mínima para trabajar (LOPNNA art. 96); revísala.» | La fecha de nacimiento está mal tecleada | Corrígela |
| «Ya hay un trabajador con esa cédula.» | Esa persona ya está cargada | Búscala en la lista. Si no aparece, marca **Incluir a los desincorporados** |
| «Hay un dato con formato inválido: la cédula se escribe V-12345678, y el grupo sanguíneo es uno de A+, A-, B+, B-, AB+, AB-, O+ u O-.» | La cédula o el grupo sanguíneo no tienen la forma esperada | Corrige el que corresponda |
| «Ese cargo del tabulador ya no existe.» | El nivel se quitó mientras tenías la ficha abierta | Cierra, vuelve a abrir y elige otro cargo |
| «Escribe el motivo del egreso: de él dependen las prestaciones que le tocan.» | El motivo quedó vacío o muy corto | Escribe por qué se va |
| «No existe ese trabajador.» | La ficha ya no está | Recarga la lista |
| «Las fichas de personal ya no se borran: se desincorporan…» | Alguien llamó al borrado viejo, casi siempre desde una pestaña abierta desde antes del cambio | Recarga la página y usa **Egresar** |
| «La foto tiene que ser JPG, PNG o WEBP.» | El archivo no es una imagen de esas | Manda otra foto |
| «La foto pesa … MB y el máximo son 5. Sácala con menos resolución o mándala por WhatsApp y guarda la que llega.» | La foto pesa demasiado | Haz lo que dice el mensaje |
| «El encuadre quedó fuera de la foto. Vuelve a centrarla.» | El recuadro se salió de la imagen | Arrastra la foto hasta que la cara quede sobre la línea |
| «El cargo no puede quedar vacío: es el nombre con el que las fichas se enganchan al tabulador.» | El nivel quedó sin nombre | Escríbelo |
| «El sueldo mensual tiene que ser un número de cero para arriba.» | El sueldo está vacío o en negativo | Escribe la cifra |
| «Ya hay un cargo con ese nombre en el tabulador.» | Ese nivel ya existe | Búscalo en la escala y edítalo en vez de crear otro |
| «No existe ese cargo en el tabulador.» | El nivel se quitó mientras trabajabas | Recarga la pantalla |
| «Hay … ficha(s) enganchadas a "…". Muévelas a otro cargo antes de quitarlo, o desactívalo en vez de borrarlo.» | Hay gente en ese nivel | Desmarca **Vigente**, o cámbiales el cargo primero |
| «El período está en "…" y ya no admite cambios.» | Ese período ya se aprobó, se pagó o se anuló | Lo que haya que corregir va en el período siguiente |
| «El período termina antes de empezar.» | **Hasta** es anterior a **Desde** | Corrige las fechas |
| «Ya hay un período … que se solapa con esas fechas. Dos nóminas sobre los mismos días pagarían dos veces.» | Ya existe un período del mismo tipo sobre esos días | Busca el que ya está y trabaja sobre él |
| «No existe el período ….» | Ese período ya no está | Recarga la pantalla |
| «El período está en "PAGADA" y ya no se recalcula. Anúlalo si hay que rehacerlo.» | Ya se pagó. Y una nómina pagada tampoco se anula | Corrige la diferencia en el período siguiente |
| «Falta el parámetro de nómina "…" para el …. Cárgalo en Nómina › Parámetros antes de calcular.» | Falta un valor para esas fechas | Cárgalo en **Parámetros de nómina** con su fecha de vigencia y vuelve a calcular |
| «A … no se le pueden descontar … por "…": el tope del período es … (un tercio de lo que gana, LOTTT 154).» | El descuento cargado supera el tope del período | Baja el monto y reparte la cuota en varios períodos |
| «Solo se aprueba una nómina calculada. Esta está en "…".» | El período no está calculado | Pulsa **Calcular** primero |
| «Este período no tiene ningún recibo. Calcúlalo antes de aprobarlo.» | No se generó ningún recibo | Revisa que haya personal activo y vuelve a calcular |
| «Escribe por qué se anula la nómina. Es un documento con consecuencias legales.» | El motivo quedó vacío o muy corto | Escribe qué pasó, con al menos diez letras |
| «Esta nómina ya se pagó y no se puede anular. Corrige la diferencia en el período siguiente.» | El pago ya salió | Carga un bono o un descuento en el período siguiente |
| «Este período ya estaba anulado.» | Alguien lo anuló antes que tú | Revisa la tarjeta: el motivo está a la vista |
| «Solo se paga una nómina aprobada. Esta está en "…".» | Falta que gerencia general la apruebe | Pídele a gerencia general que la apruebe |
| «Indica de qué cuenta sale el dinero.» | No elegiste la cuenta | Elige la cuenta en **De qué cuenta sale** |
| «Este movimiento es el pago de una nómina. Reversarlo dejaría los recibos diciendo que se cobró y el banco que no salió nada.» | Intentas deshacer un pago de nómina desde el libro de tesorería | No hay forma de deshacerlo. La corrección va en el período siguiente |
| «Tu usuario no tiene acceso a Nómina.» | O no tienes permiso sobre el módulo, o lo tienes pero no al nivel que pide esa acción | Pide el permiso a administración, o que lo haga quien lo tenga |
| «El corte no puede ser de una fecha futura.» | La fecha del corte es de mañana o después | Corrige la fecha |
| «El corte (…) es anterior al ingreso de … (…).» | El corte es de antes de que esa persona empezara a trabajar | Revisa las dos fechas: una de las dos está mal |
| «Los anticipos (…) no pueden superar lo acumulado (…).» | En el corte pusiste más adelantado que acumulado | Revisa las cifras del corte contra el papel de donde salen |
| «Ya hay trimestres calculados antes de esa fecha de corte. Anúlalos primero: si no, ese tiempo quedaría contado dos veces.» | Ese tiempo ya está abonado por trimestre y el corte lo contaría otra vez | La pantalla no anula trimestres. Pídeselo a quien administra el sistema |
| «El trimestre … de … todavía no ha terminado: cierra el ….» | Estás cerrando un trimestre en curso | Espera a la fecha que dice el mensaje |
| «El trimestre va del 1 al 4 (recibido: …).» | El trimestre está mal escrito | Elige uno de los cuatro de la lista |
| «No está cargada la tasa de intereses de …. Cárgala antes de calcular: con una tasa inventada, los intereses también lo serían.» | Falta la tasa de ese mes | Escribe en **Tasa anual (%)** la que publicó el Banco Central para ese mes |
| «El mes …/… todavía no ha terminado.» | Estás abonando intereses de un mes en curso | Espera a que el mes cierre |
| «El anticipo tiene que ser mayor que cero.» | El monto quedó vacío o en cero | Escribe el monto |
| «No se registra un anticipo con fecha futura.» | La fecha del anticipo es de mañana o después | Corrige la fecha |
| «A … se le pueden adelantar hasta … y se están pidiendo …» | El anticipo pasa del tope de lo que se le puede adelantar | Baja el monto al que dice el mensaje |
| «A … ya se le calculó la liquidación. Anúlala primero si hay que rehacerla.» | Esa persona ya tiene una liquidación calculada | Ábrela en su cuenta y revísala. Para rehacerla hay que anularla, y eso no se hace desde la pantalla |
| «La fecha de egreso es anterior a la de ingreso.» | El último día trabajado es de antes del ingreso | Corrige la fecha |
| «No se liquida con fecha futura.» | El último día trabajado todavía no ha llegado | Corrige la fecha |
| «La liquidación … está ….» | Ya se pagó, o se anuló | Revisa su etiqueta de estado en la cuenta de esa persona |
| «La liquidación … no arroja monto a pagar.» | La cuenta dio cero o menos, casi siempre por anticipos que se comieron lo acumulado | Revisa los renglones del cálculo antes de seguir |
| «No existe la cuenta ….» | La cuenta de la que iba a salir el dinero ya no está | Recarga la pantalla y elige otra |
| «Un parámetro de texto necesita un valor escrito.» | Ese parámetro lleva palabras, no un número | Escribe el texto |
| «Un parámetro de unidad … necesita un número.» | Ese parámetro lleva una cifra, no palabras | Escribe el número |

---

## 12. Tesorería

**Tesorería dejó de ser un módulo, y no es que esté escondida mientras se afina.** La empresa decidió que el sistema **no lleva bancos ni cajas**: anota de dónde salió cada pago, pero no controla ningún saldo. Con esa decisión, la mitad del módulo dejó de tener sentido.

Lo que se usa todos los días **se mudó a Compras y sí está en el menú**. Este capítulo se conserva porque lo que cuenta de esas pantallas sigue valiendo; lo que cambió es dónde se entra:

| Pantalla | Dónde está hoy |
| --- | --- |
| **Pagos por hacer** | **Administración › Compras › Pagos por hacer** |
| **Cuentas por pagar** | La misma pantalla, pestaña **Por proveedor** |
| **Libro de tesorería** | **Administración › Compras › Movimientos de dinero** |
| **Tablero**, **Bancos y cajas**, **Cuentas por cobrar** | Siguen fuera del menú. Son lo que la empresa decidió no llevar |

**Ninguna de las seis da el cartel de obra**: las direcciones responden y las pantallas se abren. Lo que las cierra hoy es el permiso, no el cartel — y sobre este módulo **solo el administrador tiene permiso**.

Tesorería es el libro del dinero. Cada banco, cada caja de efectivo y cada billetera digital de la empresa tiene aquí su cuenta, y todo lo que entra y sale de ellas queda escrito en una sola lista, en orden, con la fecha, el concepto, la referencia y el nombre de quien lo registró.

Hay una idea que conviene entender antes de tocar nada, y es la misma que ordena el inventario:

**El saldo no es un número guardado. Es una suma.** El sistema no tiene apuntado en ningún lado que en Banesco hay 40.000 bolívares. Lo que tiene es la lista de movimientos de esa cuenta, y cada vez que abres la pantalla los suma. La propia pantalla lo dice: **Dónde está el dinero. El saldo se suma del libro: no hay un número guardado que pueda quedar viejo.**

De ahí sale la consecuencia práctica: **para cambiar un saldo hay que escribir un movimiento**. No hay otra forma. No se corrige el número directamente, ni siquiera siendo administrador.

Y hay una segunda regla que conviene tener presente desde la primera pantalla: **una cuenta, una moneda**. Una cuenta en bolívares no guarda dólares y una cuenta en dólares no guarda bolívares. La razón está en la sección 12.8.

### 12.1 Quién entra y quién puede hacer qué

**No existe el rol de Tesorería.** Lo hubo y se retiró junto con el módulo. Los roles del sistema son diez y ninguno se llama así; están todos en 13.1.

Hay **tres** puertas distintas, y conviene no confundirlas.

**La primera es ver las pantallas del módulo** —Tablero, Bancos y cajas, Cuentas por cobrar—. Depende del permiso sobre Tesorería, y hoy **solo lo tiene el administrador del sistema**. Todos los demás roles están en **Ninguno**, el gerente general y compras incluidos. Quien escriba la dirección ve la tarjeta **Tesorería no está a tu alcance**, con el texto **Tu rol no tiene acceso a este módulo. Si lo necesitas para tu trabajo, pídeselo a quien administra el sistema.** y el enlace **Volver al panel**.

| Rol | Sobre Tesorería |
| --- | --- |
| Administrador del sistema | **Total** |
| Los otros nueve roles | **Ninguno** |

**La segunda es mover dinero en esas pantallas** —**Nueva cuenta**, **Trasladar**, **Saldo de apertura**, **Ingreso**, **Egreso**, **Ajustar**, **Deshacer una línea**—. Pide permiso de **escritura** sobre Tesorería, que sale de la matriz de permisos como cualquier otro. Hoy, por lo anterior, solo el administrador.

**La tercera es registrar un pago de la cola**, y esta no sale de la matriz: **la exige la propia función de la base y pide el rol Compras**, o ser administrador. Por eso quien paga las órdenes es compras, y por eso «Pagos por hacer» vive en el menú de Compras y no aquí.

**Esa tercera puerta no se puede abrir desde la matriz de permisos.** Dar permiso sobre Tesorería a alguien no le deja pagar; lo que hace falta es el rol Compras.

### 12.2 El circuito del dinero

Antes de entrar en las pantallas conviene saber por dónde nace y por dónde muere cada deuda. En este módulo casi nada se teclea desde cero: la mayor parte llega sola desde Compras y desde Ventas.

#### Lo que se debe a un proveedor

1. **Alguien pide material.** Nace un pedido en Compras.
2. **Compras cotiza y prepara la orden**, y la aprueba el **Gerente general**. Es quien la aprueba por su puesto — y, desde que existen los permisos extendidos, también quien tenga esa facultad prestada por un plazo (13.1). Lo aprobado de esa manera queda marcado como tal en la orden impresa.
3. **Compras indica cómo se paga**: el método — **Transferencia bancaria**, **Pago móvil**, **Binance** o **Efectivo** —, la moneda, el monto y los datos de a dónde va el dinero. En ese momento nace la instrucción de pago, y con ella el IGTF ya calculado si la moneda no es el bolívar.
4. **La instrucción aparece sola en Compras**, en dos vistas de la misma pantalla: **Pagos por hacer**, en orden de llegada, y su pestaña **Por proveedor**, agrupada. Nadie la carga a mano.
5. **Quien tenga el rol Compras pulsa Pagar** y dice **por dónde salió** el dinero, con qué referencia y en qué fecha. No hay «tesorero»: ese rol no existe.
6. **Al pulsar Confirmar el pago**, el sistema hace todo de una vez: escribe la línea **Pago a proveedor** en el libro y baja el saldo de la cuenta; si hay IGTF, escribe una segunda línea **IGTF** aparte; marca la instrucción como pagada; lo anota en la bitácora de la compra; y si con eso la orden queda saldada, la compra pasa a esperar que llegue el material.
7. **La instrucción desaparece de la cola** y la línea se queda para siempre en el libro.

Una deuda con un proveedor, por lo tanto, **se cierra pagándola desde tesorería, no borrándola**. Y si el pago estuvo mal, no se arregla reversando la línea del libro: hay que ir a la compra y devolver la instrucción de pago, porque reversar solo el dinero dejaría la compra marcada como pagada y el dinero de vuelta en la cuenta.

#### Lo que debe un cliente

1. **Ventas emite una factura.** Si queda con saldo, la deuda aparece sola en **Cuentas por cobrar**. Tampoco esta se carga a mano.
2. **Se llama al cliente.** La lista está ordenada por antigüedad, no por monto, para que se vea a quién hay que llamar primero.
3. **El cobro se registra en Ventas › Facturación**, abriendo la factura. No se cobra desde tesorería. Ahí se elige la cuenta donde cayó el dinero, el monto, el método, la fecha, la referencia y si se le cobra el IGTF.
4. **El cobro escribe su línea en el libro de tesorería**, de tipo **Ingreso**, con el concepto de la factura, y sube el saldo de la cuenta. Si hay IGTF, va en una línea aparte.
5. **Cuando el saldo de la factura llega a cero**, la factura queda cobrada y desaparece de la lista.

Dos cosas que conviene entender de aquí. La primera: **el cobro entra en la moneda de la cuenta donde cae el dinero, no en la de la factura**. Si la factura está en dólares y el cliente pagó a la cuenta en bolívares, el cobro es en bolívares. La segunda, que se deriva de la anterior: por eso los saldos de **Cuentas por cobrar** se muestran todos en dólares, porque se cobra en las dos monedas y hay que poder sumarlos.

Registrar un cobro exige permiso de escritura sobre el módulo Ventas. Quien factura es quien cobra. (El rol de Tesorería, que es lo que alguien podría esperar aquí, ya no existe: ver 12.1.)

### 12.3 Bancos y cajas

**Fuera del menú.** Es lo que la empresa decidió no llevar: hoy solo la abre el administrador.

Es la pantalla de cabecera del módulo: dónde está el dinero de la empresa y cuánto hay en cada sitio. Desde aquí se crean las cuentas, se registran los ingresos y egresos que no vienen de una compra ni de una venta, y se traslada dinero de un sitio a otro.

#### Qué se ve

Arriba, una tarjeta con el rótulo **Disponible en cuentas activas**. **La cifra ya no es fija en dólares**: junto al rótulo hay una fila de píldoras, una por cada moneda con tasa registrada —**Bs**, **$**, y las demás con su símbolo—, y el total se expresa en la que se elija.

Al lado, la advertencia de cómo está hecha esa suma: **Convertido con las tasas de hoy (Bs X por $), no con la del día en que entró cada saldo. Cada cuenta manda el suyo.**

Si falta la tasa del día y hay cuentas en bolívares, la cifra se sustituye por **—** y el texto pasa a ser **Falta la tasa del día para convertir los bolívares. Regístrala en Sistema › Tasas de cambio; mientras tanto, el saldo de cada cuenta sí es exacto.** El sistema prefiere no dar el total antes que darlo mal.

Debajo, una tarjeta por cuenta. Cada una muestra el nombre, debajo el número de cuenta o el titular, la etiqueta de moneda arriba a la derecha — **VES** o **USD** —, el rótulo **Saldo** con el importe en la moneda de esa cuenta, en rojo si es negativo, y una línea final: **Sin movimientos todavía**, o el número de movimientos y la fecha del último. Las cuentas inactivas se ven atenuadas.

**No hay buscador ni filtros en esta pantalla.**

Si todavía no hay ninguna cuenta, aparece **No hay cuentas**, con el texto **Sin una cuenta no se puede registrar de dónde sale el dinero de una compra.** y el botón **Crear la primera**.

#### Crear una cuenta

Pulsa **Nueva cuenta**. La ventana lleva escrito el porqué de la regla principal: **Una cuenta, una moneda. Mezclarlas obliga a inventar un saldo que ya no coincide con el del banco.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Tipo** | Sí | Empieza en **BANCO**. Opciones: **Cuenta bancaria**, **Caja / efectivo**, **Billetera digital (Binance)** |
| **Moneda** | Sí | Empieza en **VES**. Opciones: **Bolívares**, **Dólares**. Al editar avisa: **No cambia si ya tiene movimientos.** |
| **Nombre** | Sí | Mínimo tres letras. Sin él, **Guardar** está apagado |
| **Banco** | Solo si el tipo es cuenta bancaria | Empieza en **Elige el banco**. Lista cerrada de los bancos del país, con su código |
| **Número de cuenta** | Solo si el tipo es cuenta bancaria | |
| **Correo de la plataforma** | Solo en billetera | Hace falta este o la dirección de la wallet |
| **Dirección de la wallet** | Solo en billetera | Hace falta esta o el correo |
| **Red** | No | Solo en billetera |
| **Titular** | Sí en cuenta bancaria y en caja | Si el tipo es caja, la etiqueta cambia a **Quién responde por el efectivo** |
| **Cédula o RIF** | No | |
| **Nota** | No | |
| **Admite sobregiro** | — | Viene desmarcada. **Solo si el banco dio línea de crédito. Una caja chica no entrega billetes que no tiene.** |
| **Activa** | — | Viene marcada |

Cierra con **Guardar**. Para corregir los datos de una cuenta existente se pulsa **Editar** en su tarjeta.

**La moneda no se cambia después del primer movimiento.** Si te equivocaste, el camino es crear otra cuenta: cambiarla obligaría a reinterpretar como dólares todo lo que ya se registró en bolívares, y ningún saldo volvería a coincidir con el del banco.

#### Registrar dinero que entra o que sale

En la tarjeta de cada cuenta hay cuatro botones que escriben en el libro. No son intercambiables: cada uno responde a una situación distinta y así queda escrito en la línea.

| Botón | Cuándo se usa | Lo que dice la ventana |
| --- | --- | --- |
| **Saldo de apertura** | Solo aparece si la cuenta no tiene ningún movimiento | **Lo que había en la cuenta el día que empieza a llevarse aquí. Se registra una sola vez.** |
| **Ingreso** | Dinero que entró y no viene de una venta ya registrada | **Dinero que entró y no viene de una venta ya registrada.** |
| **Egreso** | Dinero que salió y no es el pago de una compra | **Dinero que salió y no es el pago de una compra: eso se registra desde la compra.** |
| **Ajustar** | Solo aparece si la cuenta ya tiene movimientos | **Solo cuando el banco dice otra cosa y ya se buscó el porqué. La diferencia queda escrita.** |

Los pasos son los mismos en los cuatro casos:

1. Pulsa el botón en la tarjeta de la cuenta.
2. Escribe el **Monto en VES** o el **Monto en USD** — la etiqueta lleva la moneda de la cuenta. En **Ajustar** el monto va **positivo si sobra dinero en la cuenta, negativo si falta**.
3. Escribe el **Concepto**. No aparece en el saldo de apertura, y en **Ajustar** la etiqueta cambia a **Qué explica la diferencia**.
4. Rellena **De quién / a quién** y **Referencia** si es un ingreso o un egreso. Los dos son opcionales.
5. **Fecha**: si la dejas en blanco, queda hoy.
6. Pulsa **Registrar**.

El botón **Registrar** está apagado mientras el monto no sea mayor que cero — en el ajuste basta con que sea distinto de cero — y mientras el concepto sea demasiado corto. En el ajuste se exige una explicación más larga que en el resto, porque un ajuste sin explicación es la única línea del libro que puede tapar un descuadre en vez de contarlo.

**Un pago a un proveedor no se registra aquí.** Se registra desde la compra, para que el dinero y la orden queden atados: un egreso suelto bajaría el saldo pero dejaría la compra esperando pago para siempre.

#### Trasladar entre cuentas

Sirve para mover dinero de un sitio a otro sin que cuente como gasto ni como ingreso. Lo dice la propia ventana: **El mismo dinero cambiando de sitio. No cuenta como ingreso ni como gasto del mes.**

1. Pulsa **Trasladar**.
2. Elige **Sale de**. Cada opción se lee con el nombre de la cuenta y su saldo.
3. Escribe el **Monto**. La etiqueta añade la moneda del origen en cuanto lo eliges.
4. Elige **Entra en**. La cuenta de origen ya no aparece en esta lista.
5. Si las dos cuentas son de monedas distintas, aparece **Cuánto llegó en {moneda}** y hay que llenarlo: **Se copia del comprobante. La casa de cambio no usa la tasa oficial y el sistema no va a inventar un número que el banco desmienta.**
6. Rellena **Referencia** y **Fecha** si hace falta. Los dos son opcionales.
7. Pulsa **Trasladar**.

Entre dos cuentas de la misma moneda **tiene que llegar exactamente lo que sale**. Si el banco cobró comisión, se registra aparte como un egreso: meterla dentro del traslado haría que el mismo dinero pareciera haber cambiado de valor al cambiar de sitio.

De aquí no sale ningún papel imprimible. Lo que produce esta pantalla son líneas en el libro de tesorería.

### 12.4 Pagos por hacer

**Administración › Compras › Pagos por hacer**

Es la cola de trabajo de quien paga: **Lo que compras ya autorizó y todavía no ha salido del banco. Al pagar, la compra queda esperando que llegue el material.**

#### Qué se ve

Arriba, dos tarjetas de resumen:

| Tarjeta | Qué muestra |
| --- | --- |
| **Por pagar** | Cuántas instrucciones esperan, y debajo cuántas llevan más de tres días |
| **Suma, con IGTF** | El total, **Al cambio de cada pago** |

**Había una tercera, «En cuentas en dólares», y se retiró.** Enseñaba un disponible que ya no actualiza nadie: la empresa dejó de llevar saldos, así que ese número habría envejecido en pantalla dando la impresión contraria.

Si alguna instrucción lleva más de una semana esperando, aparece un aviso naranja: **Hay instrucciones esperando más de una semana. El proveedor no reserva el material hasta que ve el pago, y la cotización tiene fecha de vencimiento.**

Debajo está la **Cola de pagos**, con el subtítulo **En orden de llegada. La más vieja primero.** No es una tabla: es una lista de filas. Cada fila muestra el número de la orden, que es un enlace a la compra; la etiqueta del método; los días que lleva esperando, en naranja pasados tres días y en rojo pasados siete; el proveedor y el título de la compra; a dónde va el dinero, escrito según el método — banco y número de cuenta en una transferencia, banco y teléfono en un pago móvil, correo o cuenta en Binance, y **Entregar a {nombre}** en efectivo —; el titular y su documento; y a la derecha el importe en su moneda, con el IGTF sumado en naranja cuando aplica.

**Sí hay filtros, y están para armar las tandas.** Sobre la cola hay tres controles:

| Control | Qué hace |
| --- | --- |
| **Qué urge** | Vacío es **Todas las prioridades**. Filtra por Urgente, Alta o Normal |
| **Para qué unidad** | Vacío es **Todas las unidades**. Solo salen las que hoy tienen pagos pendientes |
| **Por dónde empezar** | El orden de la lista: por antigüedad —el de partida—, por monto o por prioridad |

**La lista se refresca sola**: lo que instruya Compras aparece aquí sin que tengas que recargar la pantalla.

Si no hay nada pendiente: **No hay nada por pagar**, con el texto **Cuando compras autorice una orden e indique cómo se paga, aparece aquí.**

#### Pagar

1. Busca la fila y pulsa **Pagar**.
2. Se abre **Registrar el pago**. Arriba, el método y el importe, y un recuadro con el destino del dinero y el titular. Si hay IGTF, en naranja: **Con IGTF salen $ 1.287,50 — $ 37,50 de impuesto.**
3. Elige **Por dónde salió el dinero**. Ayuda: **Queda anotado en el pago. El sistema no lleva el saldo de las cuentas.** Las opciones se leen solo con el nombre de la cuenta: ya no llevan el saldo al lado, y **ya no hay aviso de saldo insuficiente**. Los dos eran la vigilancia de un número que la empresa dejó de llevar.
4. Escribe el **Número de referencia**: **El número que devolvió el banco o la plataforma.** Si el método es efectivo, la etiqueta cambia a **Referencia (opcional en efectivo)**.
5. Rellena la **Fecha del pago** si no es hoy: **Vacío es hoy. Es la fecha que aparece en el estado de cuenta.**
6. Pulsa **Confirmar el pago**.

**En la lista de cuentas solo salen las que están en la misma moneda de la instrucción.** Si no hay ninguna, la lista lo dice. **Bancos y cajas ya no está en el menú** —es una de las pantallas que quedaron fuera cuando Tesorería dejó de ser un módulo—, así que crear una cuenta hoy lo hace el administrador. No es un olvido: pagar una instrucción en dólares desde una cuenta en bolívares obligaría al sistema a inventar la tasa a la que se hizo el cambio, y esa cifra la pone el banco, no el sistema.

Si el saldo de la cuenta elegida no alcanza, aparece un aviso naranja que **no impide confirmar**: **En esa cuenta hay $ 200,00 y el pago es de $ 1.287,50. Si el dinero ya está, falta registrar el ingreso o el saldo de apertura.** Avisa porque lo más frecuente no es que falte el dinero, sino que falte registrarlo. Quien sí impide confirmar es el propio libro, más adelante, si al escribir la línea el saldo queda por debajo de cero y la cuenta no admite sobregiro.

#### Pagar varias de una vez

Es lo que se usa cuando se va al banco a hacer la tanda del día.

Cada fila lleva **una casilla** a la izquierda, y solo la ve quien puede pagar.

**Al marcar la primera, la moneda del lote queda fijada.** Las filas de otra moneda pierden su casilla, y con ella la posibilidad de entrar en ese lote. No es un capricho: **el lote entero sale de una sola cuenta y con una sola referencia**, y una cuenta tiene una sola moneda.

Al pie, pegada abajo mientras se recorre la lista, aparece una barra con **N pagos marcados** y, debajo, la suma: *"Suman $ 1.287,50, con IGTF. Salen todos de la misma cuenta y con la misma referencia."* A la derecha, **Desmarcar** y **Registrar los N**.

**Si el banco te devolvió una referencia por cada pago, no uses el lote.** El lote escribe la misma en todos, y entonces el número del estado de cuenta deja de casar con el del sistema — que es justo lo que se mira cuando algo no cuadra.

### 12.5 Cuentas por pagar

**Administración › Compras › Pagos por hacer › Por proveedor**

Ya no tiene entrada propia en el menú: es la segunda pestaña de **Pagos por hacer**. El título de la pantalla sigue diciendo **Cuentas por pagar**.

Es la misma deuda de la pantalla anterior, pero vista al revés: **Lo que se le debe a cada proveedor, por autorizaciones de compra que todavía no han salido del banco.** La cola sirve para pagar en orden; esta pantalla sirve para decidir a quién se le paga.

Arriba, la **Deuda total con proveedores** en dólares, y debajo cuántos proveedores y cuántos pagos autorizados la componen.

Luego, una tarjeta por proveedor, de mayor a menor deuda. En la cabecera van el nombre, el RIF, el total en dólares y, si la deuda más vieja pasa de siete días, una etiqueta roja con los días de la más antigua; entre cuatro y siete días, la etiqueta es naranja.

Dentro de cada tarjeta hay una tabla:

| Columna | Qué muestra |
| --- | --- |
| **Orden** | El número, que es un enlace al detalle de la compra |
| **Compra** | El título de la compra |
| **Autorizada** | La fecha en que se autorizó |
| **Monto** | El importe en la moneda de la instrucción y, debajo en naranja, el IGTF si aplica |

Si no se debe nada: **No se le debe nada a nadie**, con el texto **Toda compra autorizada ya está pagada.**

**Desde aquí no se paga.** Es una pantalla de solo consulta: no tiene filtros, ni acciones, ni botón de imprimir ni de exportar. Para pagar hay que ir a **Pagos por hacer** o al detalle de la compra, donde está el formulario que ata el dinero a la orden.

### 12.6 Cuentas por cobrar

**Fuera del menú.** Es una de las tres pantallas que quedaron escondidas, y hoy solo la abre el administrador.

Lo que deben los clientes: **Facturas emitidas y todavía sin cobrar del todo. El saldo va en dólares porque se cobra en las dos monedas.**

Arriba, tres indicadores: **Por cobrar**, con el total en dólares sin céntimos; **Vencido**, en rojo si hay algo vencido y en verde si no; y **Clientes que deben**.

Debajo, una tarjeta por cliente, ordenadas por la deuda más vieja y, a igualdad de días, por la mayor. En la cabecera van el nombre, el RIF, cuántas facturas y el total, con una etiqueta roja con lo vencido o una verde que dice **Al día**.

Dentro de cada tarjeta:

| Columna | Qué muestra |
| --- | --- |
| **Factura** | El número y, debajo, el número de control |
| **Emitida** | La fecha de emisión |
| **Vence** | La fecha de vencimiento |
| **Total** | El importe de la factura |
| **Saldo** | Lo que falta por cobrar |
| **Antigüedad** | **Al día**, **Hasta 30 días**, **31 a 60 días**, **61 a 90 días** o **Más de 90 días**. En rojo si la factura está vencida |

**El orden es por antigüedad y no por monto, a propósito.** Una deuda de 400 dólares de hace noventa días es un problema distinto de una de 4.000 emitida ayer, y una lista ordenada por monto las pone justo al revés de como hay que atenderlas.

Al pie de la pantalla queda dicho dónde se cobra: **Los cobros se registran desde Ventas › Facturación, abriendo la factura.** El texto es un enlace.

Si no debe nadie: **Nadie debe nada**, con el texto **Todas las facturas emitidas están cobradas. Las nuevas aparecen aquí en cuanto se emiten a crédito o quedan con saldo.**

**Desde aquí no se cobra.** No hay filtros, ni acciones, ni exportación.

### 12.7 Libro de tesorería

**Administración › Compras › Movimientos de dinero**

En el menú se llama así. El título de la pantalla sigue diciendo **Libro de tesorería**.

Es el libro contable del dinero: **Todo el dinero que entró y salió. No se edita ni se borra: lo que estuvo mal se deshace y las dos líneas quedan.** Aquí no se registra nada nuevo: se consulta, y si algo se registró mal, se escribe la línea contraria.

#### Qué se ve

Arriba hay **tres filtros**:

| Filtro | Qué hace |
| --- | --- |
| **Cómo se pagó** | Empieza en **De cualquier forma**. Efectivo, transferencia, pago móvil, Zelle, Binance u otro |
| **Moneda** | Empieza en **Todas** |
| **Rango de fechas** | Con atajos para los períodos de siempre |

**Había un cuarto, el de Cuenta, y se retiró**: ya no se manejan cajas ni bancos, así que filtrar por cuenta dejó de decir nada.

La tabla tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Movimiento** | El número del asiento y, debajo, una etiqueta con el tipo |
| **Fecha** | La fecha del movimiento |
| **Concepto** | El texto y, debajo, la contraparte, la referencia y quién lo registró |
| **Monto** | Con signo más o menos, en la moneda de la cuenta, y debajo en gris el equivalente en la otra moneda |

Los tipos que puede llevar la etiqueta son: **Saldo de apertura**, **Ingreso**, **Egreso**, **Pago a proveedor**, **IGTF**, **Comisión bancaria**, **Traslado entre cuentas**, **Ajuste** y **Reverso**. Los reversos y los ajustes salen en naranja; las entradas, en verde. **El tipo se sigue llamando «Reverso» aunque el botón diga «Deshacer»**: es el nombre del asiento, no el del botón.

El equivalente en gris se calcula **con la tasa congelada del día del movimiento**, no con la de hoy. Es una diferencia con el total de la pantalla de cuentas, y es deliberada: así un pago de enero se puede comparar con uno de julio.

**La pantalla muestra las 200 líneas más recientes**, de la más nueva a la más vieja. No hay paginación ni botón de ver más, y el único filtro es el de cuenta. Es una limitación real: en un mes de mucho movimiento, una línea de hace unas semanas deja de aparecer aquí aunque siga en el libro.

Si todavía no hay nada: **Todavía no hay movimientos**, con el texto **El libro se llena solo: cada pago, ingreso o traslado escribe su línea.**

#### Deshacer una línea

**El botón se llama Deshacer**, igual que en el libro de inventario. Por dentro la operación sigue siendo un reverso —es lo que dice la nota que deja— pero esa palabra no aparece en la pantalla.

1. Busca la línea equivocada.
2. Pulsa **Deshacer**. Se abre la ventana **Deshacer TES-000123** y el texto **Se escribe el movimiento contrario. El equivocado se queda a la vista: así se entiende qué pasó.**
3. Arriba verás un recuadro fijo, que no se puede tocar, con el concepto y el importe de lo que vas a anular.
4. Escribe **Por qué se reversa**. Mínimo diez letras. Ayuda: **Queda escrito en el movimiento nuevo.**
5. Confirma con **Deshacer** en el botón rojo.

La línea original **se queda en el libro**. Lo que se escribe es una nueva, del mismo tamaño y en sentido contrario. Después, si hace falta, se registra la correcta.

**El botón Deshacer no aparece en cuatro casos**, y cada uno tiene su motivo:

- **La línea ya deshace otra.** Lo que ya se deshizo no se vuelve a deshacer: si la corrección estuvo mal, se registra el movimiento que corresponda.
- **La línea es el pago de una compra.** Deshacerla a solas dejaría la compra marcada como pagada y el dinero de vuelta en la cuenta. Se devuelve la instrucción de pago desde la compra.
- **La línea es una de las dos mitades de un traslado.** Deshacer solo esa devolvería el dinero al origen dejándolo también en el destino. Se deshace con un traslado en sentido contrario.
- **La línea es el pago de una nómina.**

Y a esos se suma el de siempre: **sin permiso de escritura sobre Tesorería, el botón tampoco se dibuja.**

**Aquí hay una asimetría que conviene entender**, porque es lo que hace que alguien de compras vea el libro y no pueda tocarlo:

| Para… | Hace falta |
| --- | --- |
| **Entrar al libro** | El permiso de **Compras**, que es de donde cuelga en el menú |
| **Deshacer una línea** | El permiso de **escritura sobre Tesorería**, que hoy solo tiene la administración |

No es un rol —el de Tesorería se retiró y ya no existe— sino un nivel de la matriz. Y como sobre Tesorería todos los demás roles están en **Ninguno** (12.1), en la práctica **solo el administrador deshace una línea del libro**.

### 12.8 Lo que conviene entender

#### Las cuentas van separadas por moneda, y no se mezclan

Es la primera decisión del módulo y la que más consecuencias tiene: **una cuenta en bolívares no guarda dólares.**

La razón es que el saldo de una cuenta existe para compararse con una sola cosa: lo que dice el banco. Mezclar las dos monedas en una cuenta obliga a inventar un saldo «equivalente» que ya no coincide con ningún estado de cuenta, y a partir de ahí no hay forma de saber si un descuadre es un error de registro o una diferencia de cambio.

De esa regla salen todas estas otras, que en la práctica se encuentran una tras otra:

- La cuenta **no puede cambiar de moneda** una vez que tiene movimientos.
- Un pago **solo puede salir de una cuenta en la misma moneda de la instrucción**.
- Un traslado entre dos cuentas de la misma moneda **tiene que llegar completo**.
- Un traslado entre monedas distintas **exige que escribas cuánto llegó**, porque ese número lo pone la casa de cambio y no el sistema.
- El saldo de cada cuenta se muestra **en su propia moneda**; solo el total de la cabecera se convierte, y con la tasa de hoy.

Hay tres tipos de cuenta y cada uno pide datos distintos, por lo que hace cada uno: la **Cuenta bancaria** exige banco, número y titular, porque es lo que se necesita para conciliar; la **Caja / efectivo** exige saber quién responde por el efectivo, porque una caja chica no tiene estado de cuenta y lo único que responde por ella es una persona; y la **Billetera digital (Binance)** exige el correo de la plataforma o la dirección de la wallet, que es a donde llega el dinero.

Por defecto **ninguna cuenta deja sacar más de lo que tiene**. Se autoriza cuenta por cuenta con la casilla **Admite sobregiro**, y solo tiene sentido marcarla donde el banco haya dado línea de crédito: una caja chica no entrega billetes que no tiene, así que en una caja el sobregiro no es una autorización, es un error de conteo esperando a aparecer.

#### El IGTF

Es el impuesto que grava los pagos hechos en divisas: dólares, euros y criptomonedas.

**Quién decide si se aplica: el sistema, no la persona.** Se marca en el momento en que Compras dice cómo se va a pagar, y la regla es una sola: **se aplica cuando la moneda del pago no es el bolívar**. En bolívares no aplica, sea transferencia o pago móvil. Nadie lo activa ni lo desactiva a mano.

**Cuánto es.** La alícuota es un valor que el sistema tiene configurado, y hoy las pantallas la muestran escrita en sus propios textos: quien indica el pago en Compras lee **Pago en divisa: causa IGTF del 3% = $ X. Sale además del monto.**, la casilla del cobro en Ventas dice **Cobrarle el IGTF del 3%**, y el concepto que queda escrito en el libro es del estilo **IGTF 3% de la orden OC-2026-0002**. Este manual no fija ese porcentaje ni interpreta la ley: cuál es la alícuota vigente y cuándo cambia lo determina quien lleva la administración con su asesor, y ese valor es el que el sistema debe tener configurado.

**Cómo evita el sistema cobrarlo dos veces.** Con cuatro cierres:

1. **El monto del impuesto no se teclea: se calcula solo** a partir del monto del pago. No hay ninguna casilla donde escribirlo, así que nadie puede duplicarlo tecleándolo mal.
2. **Va en una línea aparte, no dentro del pago.** Al confirmar un pago se escriben dos líneas: una de tipo **Pago a proveedor**, por el monto limpio, y otra de tipo **IGTF**, por el impuesto. Sale de la misma cuenta, pero no es parte del precio: escrito aparte, se puede responder cuánto se pagó de impuesto en el mes sin desarmar cada pago uno por uno.
3. **La segunda línea solo se escribe si hay impuesto que escribir.** Cuando no aplica, no hay línea de IGTF.
4. **Una instrucción no se puede pagar dos veces.** Al pagarla queda marcada como pagada, y un segundo intento choca con **Esta instrucción está en "PAGADA" y no se puede volver a pagar.** Como el impuesto se escribe dentro de esa misma operación, tampoco puede duplicarse.

En las ventas funciona al revés y también va aparte: cuando se le cobra a un cliente en divisas, el impuesto se recauda y entra como una línea propia, porque no es dinero de la empresa sino un impuesto que se recauda y se entrega. Mezclado con el cobro haría creer que el cliente pagó más de lo que abonó. Y por lo mismo, **el IGTF cobrado no abona la factura**: el saldo del cliente baja solo por lo que abonó.

#### El diferencial cambiario

**Esta parte todavía no está disponible.** El sistema no reconoce ni contabiliza ganancia ni pérdida por diferencial cambiario. No hay una pantalla, ni un informe, ni un cálculo que lo haga.

Conviene decirlo claro porque hay algo parecido que sí funciona y se puede confundir con ello. Cada línea del libro guarda **la tasa del día en que se registró**, congelada, y de ahí sale el equivalente en la otra moneda que se ve en gris. El saldo de una cuenta se suma movimiento a movimiento con la tasa de cada día, no convirtiendo el saldo final con la tasa de hoy — porque convertir el saldo final diría cuánto valdría ese dinero si hubiera entrado hoy, que es otra pregunta.

Eso hace que cada línea sea comparable con la del mes pasado. Pero no calcula el diferencial. Si hoy hace falta reconocer una diferencia por ese motivo, se hace a mano con el botón **Ajustar**, escribiendo en la explicación qué se está reconociendo y por qué.

#### La conciliación bancaria

**Tampoco está disponible.** No hay ninguna pantalla que cruce el libro con el estado de cuenta del banco. Lo que sí hay es todo lo que hace posible conciliar a mano: cada línea lleva su referencia, su fecha y su concepto obligatorio, y el saldo de cada cuenta se muestra en la moneda del banco para que se pueda comparar cifra contra cifra.

Es también el motivo de que el sistema insista tanto con el concepto y la referencia. Los mensajes lo dicen con esas palabras: un monto sin concepto **no se puede conciliar después**. Quien escribe la línea tarda diez segundos; quien tenga que cuadrar el mes sin ella puede tardar una tarde.

#### Por qué el libro no se edita ni se borra

Una línea registrada no se modifica y no se elimina. Nunca, para nadie, ni siquiera para administración. Si alguien lo intenta desde fuera de las pantallas, salta el mismo candado: **El libro de tesorería no se edita ni se borra. Para corregir el movimiento TES-000123, revérsalo: queda la línea equivocada y la que la anula, y se entiende qué pasó.**

La razón es la que hace útil al libro: un saldo que no cuadra se corrige con una línea nueva que lo explica, no borrando la que estaba mal. Es la única forma de que dentro de seis meses alguien pueda responder por qué el 14 de marzo salieron mil dólares de la caja.

Corregir tiene tres caminos, según qué se haya registrado mal:

1. **Deshacer** la línea, si es un ingreso, un egreso, un ajuste o un saldo de apertura.
2. **Devolver la instrucción de pago desde la compra**, si lo que estuvo mal fue el pago de un proveedor.
3. **Trasladar en sentido contrario**, si lo que estuvo mal fue un traslado.

### 12.9 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: Tesorería. Tu usuario no tiene ese rol.» | Tu usuario consulta pero no mueve dinero | Pide el rol a administración, o que lo registre quien lo tenga |
| «Tu usuario no tiene permiso para esta acción.» | Falta el permiso sobre el módulo | Pide el permiso a administración |
| «Ponle nombre a la cuenta: es lo que se lee al elegir de dónde sale el dinero.» | El nombre quedó vacío o muy corto | Escribe un nombre que se reconozca en una lista, con el banco y la moneda |
| «Una cuenta bancaria necesita banco, número de cuenta y titular.» | Falta alguno de los tres | Complétalos. Sin ellos la cuenta no se puede conciliar |
| «Una caja necesita saber quién responde por el efectivo.» | Falta la persona responsable | Escribe quién responde por esa caja |
| «Una billetera necesita el correo de la plataforma o la dirección de la wallet.» | No pusiste ninguno de los dos | Pon al menos uno: es a donde llega el dinero |
| «La cuenta ya tiene movimientos en VES y no puede cambiar de moneda. Crea otra cuenta.» | Quieres cambiarle la moneda a una cuenta con historia | Crea otra cuenta en la moneda correcta y desactiva esta |
| «Esta cuenta ya tiene su saldo de apertura. Si estaba mal, corrígelo con un ajuste.» | El saldo de apertura se registra una sola vez | Pulsa **Ajustar** y explica la diferencia |
| «Escribe de qué es el ingreso. Un monto sin concepto no se puede conciliar después.» | El concepto quedó vacío o muy corto | Escribe de dónde vino el dinero |
| «Escribe en qué se gastó. Un monto sin concepto no se puede conciliar después.» | El concepto quedó vacío o muy corto | Escribe en qué se gastó |
| «Un ajuste sin explicación es un descuadre escondido. Escribe qué apareció o qué faltó.» | La explicación del ajuste es demasiado corta | Escribe qué dice el banco y qué decía el sistema |
| «Un ajuste de cero no ajusta nada.» | El monto del ajuste quedó en cero | Pon la diferencia: positiva si sobra, negativa si falta |
| «El monto tiene que ser mayor que cero.» | El monto quedó vacío o en cero | Escribe el importe |
| «La cuenta "Caja chica en divisas" está cerrada. Reábrela si todavía se mueve dinero por ella.» | La cuenta está inactiva | Si sigue en uso, pulsa **Editar** y marca **Activa** |
| «No se puede registrar un movimiento con fecha futura.» | La fecha es de mañana o después | Corrige la fecha |
| «En "Caja chica en bolívares" hay 120,00 VES y se intentan sacar 300,00. Si el saldo no está al día, registra primero el saldo de apertura o el ingreso que falta.» | Sacarías más de lo que hay y la cuenta no admite sobregiro | Si el dinero está, falta registrar su entrada. Registra el saldo de apertura o el ingreso |
| «El origen y el destino son la misma cuenta.» | Elegiste dos veces la misma cuenta | Cambia el destino |
| «Entre dos cuentas en VES debe llegar lo mismo que sale. Si el banco cobró comisión, regístrala aparte.» | Pusiste importes distintos entre dos cuentas de la misma moneda | Iguala los importes y registra la comisión como un egreso |
| «Indica cuánto llegó en USD : entre monedas distintas el monto lo decide el cambio, no el sistema.» | Falta decir cuánto llegó al destino | Cópialo del comprobante del banco o de la casa de cambio |
| «No hay tasa BCV registrada para el 04/08/2026 ni para ninguna fecha anterior. Regístrala en Sistema › Tasas de cambio.» | Falta la tasa del día | Regístrala en **Sistema › Tasas de cambio** y repite la operación |
| «Esta instrucción está en "PAGADA" y no se puede volver a pagar.» | Ese pago ya se hizo | Revisa el libro: la línea ya está |
| «Falta el número de referencia de la transacción.» | Todo pago que no sea en efectivo necesita referencia | Copia el número que devolvió el banco o la plataforma |
| «Indica de qué cuenta sale el dinero.» | No elegiste cuenta | Elige la cuenta en **De qué cuenta sale** |
| «La instrucción es por USD y la cuenta "Caja chica en bolívares" está en VES. Elige una cuenta en USD o cambia la instrucción.» | La cuenta no es de la moneda del pago | Elige una cuenta en la moneda de la instrucción, o pide a compras que cambie la instrucción |
| «En esa cuenta hay $ 200,00 y el pago es de $ 1.287,50. Si el dinero ya está, falta registrar el ingreso o el saldo de apertura.» | Aviso, no bloqueo: el saldo registrado no alcanza | Registra el ingreso que falta antes de confirmar |
| «Escribe por qué se reversa. La línea anulada se queda a la vista y sin motivo no se entiende.» | El motivo tiene menos de diez letras | Explica qué pasó |
| «El movimiento TES-000123 ya fue reversado.» | Esa línea ya se corrigió | Revisa el libro: la corrección ya está |
| «Este movimiento es el pago de una compra. Reversarlo a solas dejaría la compra pagada y el dinero de vuelta: devuelve la instrucción de pago desde la compra.» | El pago está atado a una orden | Abre la compra y devuelve la instrucción de pago |
| «El movimiento TES-000123 es una de las dos mitades de un traslado. Reversar solo esta devolvería el dinero al origen dejándolo también en el destino. Deshazlo con un traslado en sentido contrario.» | Un traslado tiene dos líneas | Haz un traslado en sentido contrario |
| «El libro de tesorería no se edita ni se borra. Para corregir el movimiento TES-000123, revérsalo: queda la línea equivocada y la que la anula, y se entiende qué pasó.» | Se intentó cambiar o borrar una línea | Corrígela con un reverso |
| «No hay conexión con el servidor. Revisa la red e inténtalo otra vez.» | Se cayó el internet | Reintenta cuando vuelva la señal. Lo que no se guardó, no quedó |

---

## 13. Configuración

Configuración es donde se decide quién entra al sistema, a qué llega cada quien, qué datos de la empresa salen impresos en los papeles que emite y dónde quedan guardados los documentos legales. Es también donde vive el registro de auditoría, que anota todo lo que se escribe en el sistema.

La idea que conviene entender antes de tocar nada es que **aquí hay dos capas distintas de autorización**, y confundirlas es el error más caro del módulo:

- **La matriz de permisos por módulo** decide a qué llega cada rol y qué puede hacer ahí. Los tres niveles son una escalera, no tres casillas sueltas: control total incluye escritura, y escritura incluye lectura. Darle **escritura en Nómina** a un rol lo habilita para escribir en Nómina de verdad, no solo para ver la pantalla.
- **Los roles con nombre propio** guardan lo que no es acceso sino responsabilidad. **Gerente general** aprueba compras y nóminas; **Administrador del sistema** crea usuarios y reparte permisos. Eso no cuelga de ningún nivel de la escalera, y por eso no se puede repartir desde la matriz.

La razón de la segunda capa es la separación de tareas: si «control total en Compras» bastara para aprobar, el mismo comprador que arma la orden la firmaría. Y si la administración de usuarios colgara de un nivel, quien administra un módulo podría darse a sí mismo todos los demás.

**Esto cambió el 4 de agosto de 2026.** Antes la matriz solo cerraba puertas: se le daba Nómina en escritura a un rol propio, la pantalla se abría, la persona llenaba la ficha entera y al guardar le rebotaba «tu usuario no tiene ese rol». Ahora la matriz manda de verdad sobre los módulos de trabajo. **Nadie perdió nada**: los roles que ya existían siguen valiendo igual.

Un efecto secundario que conviene saber: **cargar la tasa del BCV pasó a pedir escritura en Tasas de cambio.** Antes lo podía hacer cualquiera que entrara al sistema, y la tasa es con lo que se valora cada cotización, factura y recibo. Hoy la tienen administración, la gerencia general y recursos humanos; quien solo la consulta ve la pantalla completa pero sin el formulario.

### 13.1 Usuarios y permisos

**Sistema › Configuración › Usuarios y roles**

**Quién entra al sistema y a qué llega cada quien.**

Esta pantalla la maneja el rol de Administrador del sistema. Quien tenga permiso para verla pero no ese rol lee arriba un aviso naranja: **Estás viendo esta pantalla en solo lectura. Crear usuarios y cambiar permisos lo hace quien tiene el rol de administrador del sistema.** No aparecen **Nuevo usuario** ni **Nuevo rol**, no hay botones en las filas y las casillas de la matriz salen apagadas.

La pantalla tiene tres pestañas: **Usuarios**, **Roles y permisos** y **Permisos extendidos**.

**El aviso de solo lectura vale para las dos primeras, no para la tercera.** El gerente general lo lee arriba y, sin embargo, **sí puede extender y retirar permisos**: esa pestaña la manejan el administrador del sistema y la gerencia general. Es lo único de esta pantalla que la gerencia puede usar de verdad.

#### La pestaña Usuarios

Arriba queda dicho cómo funciona el alta: **Las cuentas las crea la administración: no hay registro abierto. Quien entra lo hace con nombre de usuario, no con correo, porque buena parte de la plantilla no tiene uno.**

La tabla tiene estas columnas:

| Columna | Qué muestra |
| --- | --- |
| **Usuario** | El nombre de usuario. En tu propia fila lleva la etiqueta **Tú** |
| **Nombre** | Nombre y apellido |
| **Cargo** | El cargo, si se llenó |
| **Ficha de personal** | Si la cuenta está relacionada con un trabajador. Ver abajo |
| **Roles** | Una etiqueta por rol. Si no tiene ninguno: **Sin roles** |
| **Estado** | **Activo** o **Inactivo**, más el botón de la llave para cambiar la clave y el del muñeco para inactivar o reactivar |

Pulsar cualquier parte de la fila abre la ficha del usuario. **No hay buscador ni filtros** en esta pestaña.

#### La columna «Ficha de personal»

Es el espejo de lo que ya hace la ficha del trabajador, que dice si esa persona tiene cuenta. Aquí se lee al revés: si esa cuenta es de alguien de la plantilla.

| Lo que dice | Qué significa |
| --- | --- |
| **Ficha 0018 · Jesmary Barco** | La cuenta está atada a ese trabajador |
| En naranja: **Hay una ficha con su cédula** | No está atada, pero existe un trabajador con la misma cédula. **Es lo único de esta columna sobre lo que hay que hacer algo** |
| En gris | Ni atada ni hay ficha con esa cédula. Es lo normal en una cuenta de sistemas o de un tercero |

**Sirve para dos cosas distintas.** La primera es no darle dos identidades a la misma persona. La segunda es más útil de lo que parece: cuando alguien egresa, saber qué cuenta era suya es lo que evita que se quede abierta.

#### Crear un usuario

1. Entra en la pestaña **Usuarios**.
2. Pulsa **Nuevo usuario**. La ventana avisa: **Los roles deciden a qué llega. Se pueden cambiar después.**
3. Escribe el **Nombre de usuario**. **De 3 a 32 caracteres: letras, números, punto y guion.** Se pasa solo a minúsculas y se le quitan los espacios.
4. Escribe el **Nombre y apellido**. Se escribe solo en mayúsculas y sin tildes.
5. Escribe la **Clave inicial**. **Mínimo 8 caracteres. Dásela en persona y que la cambie.**
6. Rellena el **Cargo**, la **Cédula** y el **Teléfono** si los tienes. Los tres son opcionales, y los tres se guardan.

**El Teléfono no se guardaba hasta el 27 de agosto de 2026.** El campo estaba en la ventana y el alta no lo llevaba a la base: el usuario se creaba sin dar error y el número se perdía. Si tienes usuarios creados antes de esa fecha a los que les falta el teléfono, es esto — se arregla abriendo su ficha y escribiéndolo.
7. Marca al menos un rol en el bloque **Roles**. Viene marcado **Solicitante**.
8. Pulsa **Guardar**. Aparece el aviso **Usuario p.ramirez creado. Dile la clave en persona, no por escrito.**

La primera vez que esa persona entre, el sistema le obliga a ponerse una clave propia antes de dejarle ver nada. El motivo es que la clave que pone administración la saben dos personas, y mientras eso sea así la sesión existe pero no identifica a nadie.

Los roles que trae el sistema son **diez**, con la descripción que se lee al lado de cada casilla. **Hubo un undécimo, Tesorería, y se retiró el 25 de agosto de 2026** junto con el módulo: sus permisos, sus acciones y las cuentas que lo tenían se borraron el mismo día. Si tienes un manual impreso donde aparece, esta lista es la que manda.

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

**Editar.** Pulsa la fila. Se abre **Editar usuario**: **El nombre de usuario no cambia: es con lo que entra y con lo que quedó firmado lo que ya hizo.** Cambia lo que haga falta y pulsa **Guardar**.

**Cambiar la clave.** Pulsa el botón de la llave en la fila. Se abre **Cambiar la clave**, con un solo campo, **Clave nueva**, y la ayuda **Mínimo 8 caracteres.** Cambiarle la clave a alguien **cierra todas sus sesiones abiertas** y le obliga a ponerse una propia la próxima vez que entre. Es lo mismo que pasa con un usuario nuevo, y por el mismo motivo.

**Inactivar.** Pulsa el botón del muñeco. La ventana explica qué pasa: **Deja de poder entrar al sistema desde ya. Lo que hizo hasta hoy se conserva entero: su nombre sigue en lo que pidió, aprobó o pagó.** Y debajo: **Los usuarios no se borran: un documento firmado por alguien que ya no existe no serviría de nada.** Al reactivar, el texto es **Vuelve a poder entrar con la misma clave que tenía. Si no la recuerda, cámbiasela desde la llave.**

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

Faltan cuatro de los quince, y no es un olvido: **la matriz esconde los módulos que están en obra** —Explotación, Despachos, Ventas y Tesorería—. Repartir permisos sobre lo que nadie puede abrir solo sirve para que alguien crea que tiene acceso a algo. El día que uno vuelva al menú, vuelve también a la matriz con lo que tuviera repartido.

Los quince del sistema, para referencia, son:

| # | Módulo | |
| --- | --- | --- |
| 1 | **Panel** | |
| 2 | **Explotación** | *(en obra: no sale en la matriz)* |
| 3 | **Maquinaria** | |
| 4 | **Combustible** | |
| 5 | **Inventario** | |
| 6 | **Asignaciones** | |
| 7 | **Despachos** | *(en obra: no sale en la matriz)* |
| 8 | **Compras** | |
| 9 | **Ventas** | *(en obra: no sale en la matriz)* |
| 10 | **Nómina** | |
| 11 | **Tesorería** | *(en obra: no sale en la matriz)* |
| 12 | **Tasas de cambio** | |
| 13 | **Configuración** | |
| 14 | **Usuarios y roles** | |
| 15 | **Respaldo de la base** | |

**Lo que un módulo en obra tuviera repartido no se pierde**: sigue guardado aunque su columna no se vea, y vuelve a la matriz el día que el módulo vuelva al menú. Lo que no se puede es repartirlo mientras tanto.

**El Organigrama no tiene fila propia**: se gobierna con el permiso de Nómina.

**Qué significa cada nivel en la práctica:**

| Nivel | Qué le da al rol |
| --- | --- |
| Ninguna casilla marcada | El módulo no aparece en el menú. Si alguien escribe la dirección a mano, ve la tarjeta **{Módulo} no está a tu alcance** |
| **Lectura** | Entra al módulo y consulta lo que hay. No escribe nada |
| **Escritura** | Además de consultar, registra en ese módulo |
| **Control total** | El escalón más alto de la matriz: abre el módulo entero |

**Los tres niveles son una escalera, no tres opciones sueltas.** Marcar **Control total** marca también **Escritura** y **Lectura**; desmarcar **Lectura** apaga las tres. Es así porque escribir sin poder leer no significa nada, y una matriz que lo permitiera solo serviría para dejar gente con permisos que no se pueden usar.

Y la advertencia que conviene repetir: **ningún nivel de esta matriz convierte a nadie en gerente ni en administrador.** Marcarle **Control total** en Tesorería al rol de Almacén no le da el botón de pagar: seguirá chocando con la regla que exige el rol **Compras**, y esa no sale de esta matriz. Para prestarle a alguien una facultad concreta está la tercera pestaña, **Permisos extendidos**.

#### Cambiar un permiso

1. Entra en la pestaña **Roles y permisos**.
2. Busca la tarjeta del rol.
3. En la fila del módulo, marca o desmarca la casilla.

**Se guarda al instante.** No hay botón de guardar y no se pide confirmación. Y recuerda lo principal: **no le estás dando permiso a una persona, se lo estás dando a un rol.** Todos los que tengan ese rol quedan afectados por el mismo clic.

**El reparto se ajusta desde esta misma pantalla, así que la referencia buena es la matriz que tengas delante**, no una tabla impresa. Esta de aquí es orientativa y sirve para ver la forma que tiene el reparto:

| Rol | Hasta dónde llega |
| --- | --- |
| **Administrador del sistema** | Control total en los catorce módulos de trabajo. **Respaldo de la base no**: ver más abajo |
| **Gerente general** | Control total en casi todo. Lectura en Maquinaria, Combustible y Asignaciones |
| **Compras** | Control total en Compras e Inventario; escritura en Configuración; lectura en Panel, Maquinaria, Combustible, Tesorería y Tasas |
| **Tesorería** | Control total en el circuito del dinero y en lo que lo alimenta; nada en Maquinaria, Combustible ni Asignaciones |
| **Almacén** | Escritura en Inventario, Asignaciones, Maquinaria, Combustible, Despachos y Configuración; lectura en Panel y Compras |
| **Ventas** | Escritura en Ventas y Despachos; lectura en Panel, Inventario, Tesorería y Tasas |
| **Operaciones** | Control total en Explotación; escritura en Maquinaria, Combustible y Compras; lectura en Panel, Inventario y Asignaciones |
| **Recursos humanos** | Escritura en Nómina, Asignaciones, Inventario, Compras y Ventas; control total en Tasas de cambio |
| **Solicitante** | Escritura en Compras; lectura en Panel e Inventario. Nada más |
| **Consulta** | Lectura en Panel, Maquinaria, Combustible, Inventario, Asignaciones, Despachos, Compras y Tasas |
| **Respaldo de la base** | Solo eso, y nada más |

Nómina, Tesorería y Ventas quedan fuera del rol de Consulta a propósito: «solo lectura» de lo que gana cada quien sigue siendo ver el sueldo de todo el mundo.

**El Respaldo de la base es la única excepción a que el administrador llegue a todo.** Ese módulo no se le da a nadie por el hecho de administrar el sistema: hace falta el rol **Respaldo de la base**. «Puede administrar el sistema» y «puede llevarse todos los datos de la empresa en un archivo» no son la misma autorización. Está explicado en 13.5.

#### Crear y editar roles

**Nuevo rol** abre una ventana que avisa de dónde empieza: **Nace sin acceso a nada. Se le abre después, módulo por módulo.**

| Campo | ¿Hace falta? | Detalle |
| --- | --- | --- |
| **Código** | Sí | **Mayúsculas y guion bajo. Es el nombre interno y no se puede cambiar después.** Se pasa solo a mayúsculas y los espacios se vuelven guion bajo |
| **Nombre** | Sí | Es lo que se lee en la tarjeta |
| **Descripción** | No | **Qué hace quien tiene este rol. Se lee en la tarjeta.** |

Al editar, el **Código** queda bloqueado y la ventana lo explica: **El código no cambia: hay funciones de la base que lo nombran.**

**Los roles que trae el sistema no se pueden borrar.** Solo se borran los que creó la empresa, y solo si no los tiene nadie. Si un rol del sistema sobra en alguien, el camino no es borrarlo sino quitárselo a quien no deba tenerlo: borrarlo dejaría sin dueño todas las reglas que lo nombran.

#### Cinco atajos entre el nivel y el rol

Hay una regla del sistema que no se ve en ninguna pantalla y explica muchas sorpresas: **para cinco casos, tener el nivel equivale a tener el rol.**

Cuando una acción pide un rol y no lo tienes, el sistema mira además si tienes el nivel equivalente. Si lo tienes, pasas.

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

**Lo que se presta es una acción, no un módulo.** El sistema tiene un catálogo de **153 acciones** repartidas en quince módulos —aprobar una compra, anular un carnet, autorizar un despacho sin guía—, y se extiende una, no el módulo entero.

Con el botón **Extender un permiso** se pide:

| Campo | Detalle |
| --- | --- |
| **A quién** | Una persona activa del sistema |
| **Qué se le extiende** | Una acción del catálogo. La ayuda dice el límite: *"Solo puedes extender lo que tú mismo puedes hacer."* |
| **Desde** | En blanco, desde hoy |
| **Hasta** | En blanco, **indefinida**. Conviene poner fecha |
| **Justificación** | Obligatoria, y la ayuda dice por qué: *"Por qué hace falta. Dentro de un mes es lo único que va a explicar por qué esta persona pudo hacer esto."* |

**Nadie puede extender lo que él mismo no puede hacer.** Es lo que impide que esta pantalla se use para escalar permisos: el administrador puede prestar cualquier cosa porque lo puede todo, pero el gerente general solo presta lo suyo.

**Lo que se hace con un permiso extendido queda marcado como tal.** No es lo mismo aprobar una compra porque es tu puesto que aprobarla porque alguien te prestó la facultad: la orden impresa dice *bajo autorización de* seguido del nombre, y a quien la usa se le exige subir el papel que la respalda. Está contado en 9.5.

**Un permiso extendido se retira**, no se borra, y al retirarlo se pide **Por qué se retira**: queda el rastro de que existió, de quién lo dio, por qué y hasta cuándo.

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

Si al RIF le quedan noventa días o menos para vencer, arriba del todo sale un aviso. En naranja si está por vencer — **El RIF vence el 04 jul 2028, dentro de 45 días. Conviene renovarlo antes.** — y en rojo si ya venció: **El RIF venció el 04 jul 2028. Con el RIF vencido no se puede facturar.** Va arriba del todo porque es lo único de esta pantalla que puede detener la operación de un día para otro.

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

Estos datos salen del comprobante del SENIAT, no de la memoria de nadie. Cópialos del papel.

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

| Quién | Ve la lista | Carga, corrige y quita |
| --- | --- | --- |
| Administrador del sistema | Sí | Sí |
| Gerente general | Sí | Sí |
| Almacén | Sí | Sí |
| Compras | Sí | Sí |
| El resto de los roles | No | No |

Está repartido así a propósito: cargar y quitar papeles de la empresa es de la gerencia. **Aquí había una fila de Tesorería y ese rol ya no existe** (12.1). Quien consulta estos papeles para hacer su trabajo hoy es compras, que paga contra ellos.

#### Cargar un documento

1. Pulsa **Cargar documento**. La ventana dice lo que admite: **PDF o imagen, hasta 50 MB. Queda guardado dentro del sistema.**
2. Elige el **Tipo de documento**. Empieza en **Elige el tipo**.
3. Escribe el **Nombre**, mínimo tres letras: **Como lo buscará quien lo necesite dentro de un año.** Se escribe solo en mayúsculas y sin tildes.
4. Elige el **Archivo**.
5. Rellena **Emitido el** y **Vence el** si las sabes. Las dos son opcionales; la ayuda de la segunda avisa cuando ese tipo de papel suele caducar.
6. Escribe una **Nota** si hace falta.
7. Pulsa **Cargar**.

Los tipos disponibles son once, en este orden: **Alianza de la cantera – Gobernación**, **Registro Único de Información Fiscal (RIF)**, **Acta constitutiva**, **Acta de asamblea**, **Registro mercantil**, **Concesión minera**, **Permiso ambiental**, **Contrato**, **Solvencia**, **Poder o autorización** y **Otro documento**.

**Qué formatos admite: PDF, JPG, PNG y WEBP.** Cualquier otro no se puede elegir.

**Qué tamaño admite: hasta 50 MB.** Si el archivo se pasa, debajo aparece en rojo el nombre, su peso y el aviso de que pasa del tope, y el botón se apaga. El límite está puesto en 50 MB porque un acta escaneada con firmas y sellos pesa de verdad — la alianza con la Gobernación son 17 MB —; el tope existe para que nadie suba un vídeo, no para pelear con un escáner.

#### Corregir un documento sin volver a subirlo

**Sí se puede, y es lo normal.** Pulsa el lápiz: **Cambia lo que haga falta. El archivo solo se toca si subes uno nuevo.**

Se pueden cambiar el tipo, el nombre, las fechas y la nota sin que el archivo se mueva. El campo del archivo cambia de etiqueta a **Reemplazar el archivo** y queda opcional: **Déjalo vacío y se queda el que ya está. Solo elige uno si llegó una versión nueva del papel.** Con papeles de diecisiete megas, esa diferencia es la que hay entre corregir una fecha y no corregirla nunca.

Si sí eliges un archivo nuevo, el viejo se borra solo.

Ten cuidado con una cosa: **la fecha de vencimiento no puede ser anterior a la de emisión**, y el sistema lo rechaza. El aviso que aparece en ese caso todavía no está escrito en lenguaje llano, así que si al guardar sale un mensaje que no se entiende, revisa primero esas dos fechas.

#### Quitar un documento

Pulsa la papelera. La ventana lo dice sin rodeos: **Se borra {nombre} y también el archivo. Esto no se puede deshacer: si es el único ejemplar que queda, tendrás que volver a escanearlo.** Confirma con **Quitar**.

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

Quien llegue escribiendo la dirección a mano ve una tarjeta: **Esto lo ve la administración**, con el texto **El registro de auditoría guarda todo lo que ha hecho cada persona en el sistema. Solo lo abre quien tiene el rol de administrador.**

El motivo es el contenido, no la desconfianza. Los demás módulos se reparten sin problema: a alguien de tesorería se le puede dar Nómina en lectura. La auditoría no se reparte, porque es el registro de lo que ha hecho todo el mundo — incluida la propia administración — y quien la lee ve de una sentada los sueldos, las cédulas y las cuentas bancarias que pasaron por el sistema. Eso no es un permiso más: es una llave aparte.

El candado está puesto dos veces, y la segunda no sobra. Aunque alguien lograra abrir la pantalla, no recibiría ninguna línea; pero una pantalla vacía se lee como «no ha pasado nada», que en un registro de auditoría es exactamente la mentira que no puede contar. Por eso la pantalla ni siquiera se abre.

#### Por qué no se puede modificar ni borrar

Ninguna línea de la auditoría se cambia y ninguna se borra. No hay un botón para hacerlo, no hay una pantalla para hacerlo, y quien lo intente desde fuera choca con el mismo aviso: **El registro de auditoría no se modifica ni se borra. Es lo único que lo hace valer.**

La frase resume la razón entera, y conviene leerla despacio. Un registro que se puede editar o borrar no sirve para lo único que existe. Quien quisiera tapar algo tendría que empezar por tapar la prueba de que lo hizo, y eso es justamente lo que aquí no se puede.

Conviene decir también lo que no es. **La auditoría no está para vigilar a las personas.** Está para que las cifras se puedan sostener. Cuando el saldo de una cuenta no cuadra, cuando una existencia no aparece, cuando alguien pregunta por qué una orden se aprobó por ese monto, la respuesta no puede ser el recuerdo de nadie: tiene que ser una línea con fecha, hora y nombre. Sin ese registro, cualquier número del sistema es una afirmación que hay que creer. Con él, es un dato que se puede revisar.

De ahí sale otra decisión que a primera vista parece un descuido: **el registro no está atado a la ficha de los usuarios.** Es a propósito. Si lo estuviera, inactivar o modificar a una persona podría arrastrar su rastro, y el rastro de quien ya no está es justo el que hace falta el día que se investiga algo.

### 13.5 Respaldo de la base

**Configuración › Respaldo de la base**

Una copia de todos los datos del sistema, para guardarla fuera de aquí.

#### Quién puede

**Solo quien tenga el rol Respaldo de la base**, que hoy tienen dos personas. No lo abre nadie más, y **tampoco lo abre quien administra el sistema por el hecho de administrarlo**: en todo lo demás el administrador pasa por encima de la matriz de permisos, y aquí a propósito no. «Puede administrar el sistema» y «puede llevarse todos los datos de la empresa en un archivo» no son la misma autorización.

Un administrador sí puede otorgarse ese rol desde Usuarios y roles —esa llave no se le puede quitar sin dejar el sistema sin salida de emergencia—, pero tiene que hacerlo, y ese movimiento queda escrito en la auditoría con su nombre.

Quien entre sin el rol ve la pantalla, no el botón, y una explicación de por qué.

#### Qué lleva y qué no

**Lleva todos los datos**: personal, inventario, compras, ventas, tesorería, nómina y la bitácora de auditoría completa.

**No lleva las contraseñas.** Viven cifradas en otro sitio que el respaldo no toca. Al restaurar hay que volver a crear los usuarios.

**No lleva la estructura de la base**, que vive en el repositorio del sistema. Para reconstruir la base hacen falta las dos cosas y en este orden: primero las migraciones sobre una base limpia, después este archivo.

#### Cómo se descarga

Pulsa **Descargar respaldo**. Una ventana repite qué es lo que va a bajar y hay que confirmarlo. El archivo se llama `respaldo-lacantera-AAAA-MM-DD-HHMM.sql`, con la fecha delante para que se ordenen solos en la carpeta cuando ya haya varios.

La pantalla dice cuántas tablas tiene la base, cuántas filas tiene aproximadamente, y cuándo fue el último respaldo y quién lo bajó.

#### Cuidado con este archivo

**Es el archivo más delicado que produce el sistema.** Lleva juntas las cédulas, los sueldos y las cuentas bancarias de todo el personal, los precios, los clientes y la bitácora entera. Todo lo que aquí dentro está repartido por permisos, ahí queda junto y **sin ninguna protección**: quien lo abra lo ve todo.

Guárdalo donde guardarías el libro de nómina en papel. No lo mandes por correo ni lo dejes en la carpeta de descargas de una computadora que usa más gente.

**Cada descarga queda anotada en la auditoría**, con el nombre de quien la pidió, la fecha y la hora.


### 13.6 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esta acción la realiza: Administrador del sistema. Tu usuario no tiene ese rol.» | Estás en la pantalla pero sin el rol que la maneja | Pide a administración que lo haga, o que te dé el rol |
| «Estás viendo esta pantalla en solo lectura. Crear usuarios y cambiar permisos lo hace quien tiene el rol de administrador del sistema.» | Aviso, no error: puedes consultar pero no cambiar | Si necesitas un cambio, pídeselo a administración |
| «Asigna al menos un rol. Un usuario sin roles no puede hacer nada.» | Intentaste guardar un usuario sin marcar ningún rol | Marca al menos uno. **Solicitante** es el mínimo de cualquier supervisor |
| «El usuario "p.ramirez" no es válido: de 3 a 32 caracteres, solo letras, números, punto, guion y guion bajo.» | El nombre de usuario tiene caracteres que no se admiten | Escríbelo con letras, números, punto y guion, sin espacios ni tildes |
| «El usuario "p.ramirez" ya existe.» | Ese nombre de usuario está ocupado | Elige otro. Si la persona ya tiene cuenta, búscala en la lista y reactívala |
| «El usuario necesita un nombre.» | Falta el nombre y apellido | Escríbelo |
| «La clave debe tener al menos 8 caracteres.» | La clave inicial es demasiado corta | Pon una de ocho caracteres o más y dásela en persona |
| «Un usuario sin roles no puede hacer nada. Desactívalo en vez de dejarlo sin roles.» | Le quitaste todos los roles a alguien que sigue activo | Si ya no trabaja aquí, inactívalo desde el botón del muñeco |
| «No puedes desactivar tu propio usuario.» | Estás intentando cerrarte la puerta a ti mismo | Que lo haga otro administrador |
| «Es el único administrador activo. Nombra otro antes de desactivarlo.» | Quedaría el sistema sin nadie que lo administre | Dale el rol de administrador a otra persona y repite |
| «Es el único administrador activo. Nombra otro antes de quitarle el rol.» | Lo mismo, quitando el rol en vez de desactivar | Nombra a otro administrador primero |
| «El administrador tiene acceso completo por definición y no se puede recortar.» | Intentaste mover las casillas del rol de administrador | No se pueden mover: es la salida de emergencia del sistema |
| «El código "xx" no es válido: de 3 a 32 caracteres, mayúsculas, números y guion bajo.» | El código del rol nuevo no tiene la forma admitida | Escríbelo en mayúsculas, con guion bajo en vez de espacios |
| «El rol necesita un nombre.» | Falta el nombre del rol | Escríbelo: es lo que se lee en la tarjeta |
| «El rol "TESORERIA" es del sistema y no se puede borrar. Quítaselo a quien no deba tenerlo.» | Los roles del sistema no se borran | Quítaselo a quien no deba tenerlo, desde su ficha |
| «El rol todavía lo tienen 3 usuario(s). Quítaselo antes de borrarlo.» | El rol está en uso | Quítaselo a esas personas y vuelve a intentarlo |
| «Esta acción la realiza: Administrador del sistema o Gerente general. Tu usuario no tiene ese rol.» | Los datos de la empresa y los documentos legales los cambian esos dos roles | Pídeselo a la gerencia o a administración |
| «Solo la gerencia y quien administra el sistema pueden cambiar estos datos.» | Ves los datos de la empresa pero no puedes tocarlos | Pide el cambio a quien corresponda |
| «La razón social no puede quedar vacía.» | Falta la razón social | Cópiala del registro, tal como está inscrita |
| «El RIF "J-5020917" no tiene forma de RIF. Debe ser como J-50209170-0.» | El RIF está incompleto o mal escrito | Cópialo del comprobante, con la letra, el guion y el dígito final |
| «Ponle nombre al documento. Una lista de archivos sin nombre no se consulta.» | Falta el nombre del papel | Ponle el nombre con el que lo buscarían dentro de un año |
| «Falta el archivo.» | Estás cargando un documento nuevo sin elegir archivo | Elige el archivo. Al corregir uno ya cargado sí puedes dejarlo vacío |
| «acta.pdf · 62,3 MB — pasa del tope de 50 MB.» | El archivo pesa más de lo admitido | Escanéalo con menos resolución, o divídelo, y vuelve a intentarlo |
| «No se pudo subir el archivo: …» | La carga se cortó | Revisa la conexión y repítela. Lo que no subió, no quedó |
| «No se pudo abrir el documento: …» | La dirección del papel no se pudo preparar | Recarga la pantalla y pulsa **Ver** otra vez |
| «No se pudo preparar el documento.» | El visor no logró mostrar el papel | Cierra la vista y vuelve a abrirla. Si sigue, avisa a quien administra el sistema |
| «Esto lo ve la administración» | Llegaste a la Auditoría sin el rol de administrador | La auditoría no se reparte. Pide lo que necesites saber a quien administra el sistema |
| «El registro de auditoría no se modifica ni se borra. Es lo único que lo hace valer.» | Se intentó cambiar o quitar una línea del registro | No hay forma de hacerlo, ni la habrá. Es lo que sostiene las cifras |
| «Tu usuario no tiene permiso para esta acción.» | Falta el permiso sobre el módulo | Pide el permiso a administración |
| «Esa operación todavía no existe en la base de datos. Falta correr las migraciones.» | El sistema quedó a medio actualizar | Avisa a quien administra el sistema. No es algo que se resuelva desde la pantalla |
| «No hay conexión con el servidor. Revisa la red e inténtalo otra vez.» | Se cayó el internet | Reintenta cuando vuelva la señal. Lo que no se guardó, no quedó |

---

## 14. Las reglas que el sistema impone

Estas son las reglas que explican la mayoría de los casos en que el sistema no te deja avanzar. **No son fallas.** Cada una está puesta a propósito y aquí se explica por qué.

### 14.1 Lo que se registra, se queda

Un movimiento de inventario no se modifica ni se elimina. Una nómina pagada no se revierte. Un pesaje no se corrige. Un cobro anulado no desaparece: queda anulado y a la vista.

La razón es la misma en todos los casos. Si un dato se puede borrar, ningún número del sistema significa nada, porque siempre cabe la sospecha de que alguien arregló lo que no cuadraba. Corregir consiste en **escribir un documento nuevo que explique la corrección**, de modo que el error y su arreglo queden los dos visibles.

Es más incómodo. También es lo único que hace que las cifras se puedan defender frente a un auditor, un socio o el SENIAT.

### 14.2 Una sola puerta para cada cosa

La piedra entra al patio por el parte de turno, y por ningún otro sitio. Un pesaje de la romana se usa en un solo despacho. Una guía de movilización ampara un solo viaje.

Todas estas reglas dicen lo mismo de formas distintas: **dos puertas al mismo sitio es como se cuenta dos veces lo mismo**. Un turno cargado dos veces son toneladas que no existen; un ticket usado dos veces es un camión que pesó una vez y salió dos.

Cuando algo queda libre otra vez —al anular una nota, el ticket y la guía vuelven a quedar disponibles— es porque el hecho físico sigue siendo cierto: el camión se pesó igual.

### 14.3 Cada documento guarda su tasa

Un documento emitido hoy conserva para siempre la tasa de hoy. Si mañana el BCV publica otra, ese documento no cambia.

Esto elimina de raíz un problema clásico: que el informe en bolívares y el informe en dólares dejen de cuadrar entre sí. No pueden desincronizarse, porque cada línea lleva su propia tasa congelada.

### 14.4 No se saca lo que no hay

Ninguna operación puede dejar una existencia por debajo de cero: ni una salida, ni un traslado, ni un despacho, ni deshacer una entrada, ni anular un parte de turno.

Una existencia negativa no es un dato, es un error que alguien va a tener que deshacer más adelante, cuando ya nadie recuerde de dónde salió. Es preferible detenerse en el momento y registrar la entrada que falta.

### 14.5 Los documentos se numeran solos

Los números de los documentos los pone el sistema, en orden y sin repetir, y se reinician cada año. Nadie los escribe a mano.

Dos personas registrando al mismo tiempo nunca obtienen el mismo número. Puede haber huecos en la serie si una operación se cae a mitad de camino; un hueco no es un documento perdido.

### 14.6 Dos personas pueden trabajar a la vez

Cuando dos personas intentan actuar sobre el mismo documento, el mismo material o el mismo pesaje en el mismo instante, el sistema atiende a una y detiene a la otra con un aviso. Nunca deja que las dos avancen.

Es lo que impide que salgan dos notas de entrega por la misma cotización, que dos despachos se lleven el mismo material del patio, o que un ticket de romana se gaste dos veces. Si te toca ser quien recibe el aviso, no perdiste nada: vuelve a abrir el documento, comprueba cómo quedó y sigue desde ahí.

### 14.7 Todo queda registrado

Cada operación guarda quién la hizo y cuándo. La bitácora de auditoría no se puede modificar ni borrar, y solo la consulta administración.

No es vigilancia sobre las personas. Es lo que permite responder una pregunta concreta —quién autorizó este pago, quién despachó sin guía, quién cambió este precio— sin que la respuesta dependa de la memoria o la buena voluntad de nadie. Un sistema donde no se puede responder eso no sirve para controlar nada.

### 14.8 Las excepciones se conceden, pero se anotan

Hay **dos maneras** de salirse de una regla, y conviene no confundirlas.

**La primera es por control total sobre el módulo.** Algunas reglas admiten excepción para quien tenga el escalón más alto: despachar mineral sin guía —hay días en que el papel llega tarde y el cliente está esperando—, vender por debajo del precio mínimo del artículo, o facturar a crédito por encima del límite del cliente. La facultad viene del nivel de permiso, no de un permiso aparte.

**La segunda es por un permiso extendido**, que es lo contrario: no viene del nivel sino de que alguien te prestó una facultad concreta, a ti y por un plazo. Aprobar una compra sin ser el gerente general es el caso vivo. Está contado en 13.1.

**Las dos quedan registradas en la auditoría**, con el nombre de quien las autorizó. Nunca pasan en silencio.

**Y la segunda deja además rastro en el papel.** Quien aprueba una compra con un permiso extendido no firma como si fuera suyo: la orden impresa dice **bajo autorización de** seguido del nombre de quien se lo extendió, y el sistema le exige subir el papel que lo respalda. **El respaldo se pide solo ahí**: a quien actúa por su puesto no se le pide nada, porque no hay nada que justificar.

### 14.9 Sobre la separación de funciones

El diseño del sistema establece que quien pide una compra no debe ser quien la aprueba, y quien la aprueba no debe ser quien recibe el material.

**Hoy esa regla no la impone el sistema: la tiene que sostener la organización.** El sistema no compara identidades al aprobar, así que una persona con los dos permisos puede recorrer sola el circuito completo.

Se dice aquí con claridad porque es la diferencia entre un control real y uno supuesto. Mientras esto no esté construido, la protección consiste en **no darle a la misma persona el permiso de pedir y el de aprobar**, y en revisar la auditoría con regularidad. El capítulo 13 explica cómo se reparten los permisos.

---

## 15. Lo que todavía no está construido

El sistema se entrega por partes. Este capítulo reúne lo que se espera del diseño pero **todavía no funciona**, y los puntos donde conviene tener cuidado.

No es una lista de fallas. Es el estado real de la obra, y está aquí para que nadie organice su trabajo contando con algo que aún no puede hacer.

Antes de nada, lo primero que hay que saber: **tres módulos construidos no se ofrecen hoy en el menú, más dos pantallas sueltas.** Explotación, Despachos y Ventas existen y funcionan, pero se dejaron fuera mientras se afinan, y sus direcciones responden con un cartel de obra; lo mismo el **Organigrama** y **Cuentas por cobrar**. **Tesorería es aparte: no está escondida, se retiró** (12.1). Eso está explicado en 1.5 y no se repite aquí: **este capítulo habla de lo que falta, no de lo que está escondido.**

### 15.1 Puntos donde hay que tener cuidado

Estos no son cosas que falten, sino cosas que hoy pueden salir mal si nadie las sabe. Son las más importantes del capítulo.

**Una compra se puede pagar dos veces por caminos distintos.** El dinero puede salir por la instrucción de pago de la orden, en Tesorería, y también por el pago registrado sobre la factura del proveedor. Los dos descuentan de una cuenta real y **ninguno de los dos sabe del otro**. Hasta que eso se cruce, conviene acordar en la empresa un solo camino y usar siempre ese.

**El sistema pregunta con qué entrega el proveedor, pero no comprueba que se cumpla.** Declarar «factura» es obligatorio antes de pagar, y eso sí lo exige. Lo que no hay todavía es una pantalla que enseñe cuáles prometieron factura y no la registraron, ni forma de atar una factura a su orden. El cotejo sigue siendo trabajo de la oficina.

**Con qué entrega el proveedor no se corrige.** Se declara una vez y no hay dónde cambiarlo. Las órdenes que ya habían pasado de ese paso cuando la regla se implantó se quedaron sin declarar y así siguen.

**Hay que liquidar antes de egresar.** El botón de liquidar prestaciones solo aparece mientras la persona está activa. Si se egresa primero, la liquidación ya no se puede calcular desde el sistema. El orden correcto es: liquidar, y después registrar la salida.

**El anticipo de prestaciones se puede descontar dos veces.** Existe como concepto en las novedades del período y también como operación propia en la pantalla de prestaciones. Si se carga por los dos lados, se descuenta dos veces. Elige uno.

**El USDT no tiene tasa oficial.** El dólar y el euro salen de lo que publica el BCV; el USDT sale de la mediana del mercado entre particulares de Binance y se registra como **PARALELO**. Es una referencia de mercado, no una publicación con respaldo. Confírmala con quien cierra las operaciones antes de registrarla.

**La barra buscadora encuentra documentos de módulos escondidos.** Las pantallas escondidas no salen, pero una factura, una nota de entrega o una placa de vehículo sí pueden aparecer en la lista, y al pulsarlas se llega al cartel de obra. No es un fallo del buscador: es que el documento existe y su pantalla todavía no se ofrece.

### 15.2 Lo que falta dentro de módulos que sí funcionan

**Costo por tonelada.** La producción entra al inventario valorada en cero, porque el costo real depende de la nómina, el gasoil y la voladura, y ese cálculo todavía no existe. Consecuencia práctica: **el valor en dólares del material producido no es una cifra en la que apoyarse.** Las toneladas sí son confiables.

**En Compras.** No hay matriz de aprobación por monto: toda compra necesita una sola aprobación, valga lo que valga. La factura del proveedor **ya se enlaza con su orden de compra** —nace desde la ficha de la compra y lleva su orden dentro—, pero el sistema todavía no cruza las cifras: no compara lo pedido con lo recibido y lo facturado. Ese cotejo lo sigue haciendo la persona. El sistema no calcula retenciones a proveedores. Lo que se debe por facturas no llega a **Compras › Pagos por hacer › Por proveedor**, que sigue leyendo solo las instrucciones de pago de las órdenes. **La orden de compra sí se imprime**; la cotización y el tablero, no.

**En Inventario.** Un artículo ya se puede corregir y borrar, pero **el código sigue sin poder cambiarse**: es con lo que se pide en el almacén y ya está impreso en lo emitido. Y **borrar solo funciona mientras nada lo haya tocado**; en cuanto aparece en una orden o en un movimiento, el camino es desactivarlo.

**En Despachos.** El sistema comprueba el cliente, el tipo, el estado y la vigencia de los papeles, pero **no compara cifras**: ni el peso neto del ticket contra las cantidades de la nota, ni las toneladas de la guía contra los renglones. Cuadrar eso sigue siendo trabajo de la persona. Además, la nota despachada sin guía **no se marca en ninguna pantalla**: el único rastro está en la auditoría.

**En Ventas.** **No hay nota de débito**, que es el papel contrario a la de crédito: para cobrarle de más a un cliente al que se le facturó de menos, hoy hay que emitir otra factura. La alícuota de IVA está fija y no se cambia desde ninguna pantalla. Las facturas emitidas desde el sistema no admiten descuento. **La nota de crédito no se imprime**: se registra y se declara, pero el papel que se le entrega al cliente todavía se hace por fuera, y fiscalmente es un documento con número de control propio.

**La factura impresa todavía no está completa ante el SENIAT**, aunque ya le falta menos. Tiene el número, el número de control, el RIF de las dos partes, la dirección del cliente, la fecha, el vencimiento, la condición de pago, la retención, la tasa del día y —desde el 27 de agosto— la **base imponible** y el **total exento** (10.7). **Le faltan dos cosas:**

| Falta | Por qué importa |
| --- | --- |
| **Desglose por alícuota** | Hoy la factura admite una sola alícuota. Una factura mixta no se puede expresar |
| **Datos de la imprenta autorizada** | Con su número de autorización. **No existen en ninguna pantalla del sistema**: hay que crearlos primero en Datos de la empresa |

Las dos se deciden con quien lleva la contabilidad: la primera cambia el cálculo y la segunda no existe todavía como dato.

**En Nómina.** El cálculo recorre a todo el personal activo sin separar a los obreros de pago semanal de los empleados de pago quincenal; conviene confirmarlo antes de montar el procedimiento de la casa. Y aunque la mayoría de los parámetros se cargan en pantalla, **algunas cifras de prestaciones están escritas por dentro** y no se pueden corregir desde ninguna pantalla: si la ley cambia, hace falta una actualización del sistema. **Desde la ficha del trabajador no se registra dotación ni asignación**: las tres tarjetas son de solo lectura y el botón **Entregar** manda a otra pantalla. Lo que sí se arregló es que **la persona ya llega puesta** cuando se entra desde la dotación (18.4).

**En las incidencias del personal.** Si se elige un tipo que no pide reposo —**Conflicto**, **Llegada tarde** u **Otra**— y a la vez se marca **Varios días**, el campo de los días de reposo no se dibuja y el guardado falla con un mensaje sin traducir. Mientras eso se arregla, **para varios días usa un tipo que pida reposo**, o anota la duración en el motivo.

**En Tesorería.** No hay conciliación bancaria: no existe una pantalla que cruce el libro con el estado de cuenta del banco. Tampoco se calcula el diferencial cambiario; lo que sí existe es la tasa congelada en cada línea.

### 15.3 Detalles de la pantalla que conviene conocer

- **Mantener sesión abierta**, en la pantalla de entrar, no cambia nada: marcarla o no da el mismo resultado.
- **Olvidé mi contraseña** no lleva a ninguna parte. La reposición de clave se pide a administración.
- **Las cifras de la pantalla de entrar son un adorno.** Las tarjetas de toneladas de la ilustración están escritas fijas y no salen de nada registrado. **Las del panel, en cambio, son reales**: salen de lo registrado en el sistema, y el propio panel lo dice al pie.
- **Las listas largas se cortan** en los registros más recientes y no tienen paginación: 200 en los movimientos de inventario y en el libro de tesorería, 300 en voladuras y partes de turno, 400 en tickets, guías y facturas de proveedor, 60 en el historial de tasas. Un registro más antiguo sigue guardado, pero no se alcanza desde esa pantalla.
- **Qué se descarga hoy.** El libro de compras y el de ventas bajan en CSV; la plantilla de carga de artículos baja en CSV; la orden de compra, la factura, la nota de entrega, la cotización, la ficha del trabajador, su carnet y su constancia bajan en PDF o en imagen; el respaldo de la base baja en SQL. Ninguna otra pantalla exporta.

### 15.4 Lo que quedó sin comprobar en esta revisión

Se dice para que nadie lo lea como verificado:

- **El reparto de permisos que trae el sistema de fábrica.** Las tablas de roles de esta versión se levantaron de la base tal como está hoy, y esa base es también donde se prueba: puede llevar clics de ajuste que no son la configuración de arranque. La referencia buena es la propia matriz en pantalla.
- **Los capítulos de los módulos escondidos** —Explotación y Ventas— no se revisaron pantalla por pantalla. Lo que dicen era cierto en una versión anterior y sus módulos han seguido cambiando; el aviso del principio de cada uno lo advierte. **Despachos sí se revisó** en esta versión, aunque siga en obra.
- **Los capítulos 19 y 20, Maquinaria y Combustible, son nuevos.** Se escribieron leyendo las pantallas y la base, no usándolas. Si algo no coincide con lo que hace el módulo en el patio, es de esperar en una primera versión: dilo y se corrige.
- **El capítulo 12 se revisó por encima.** Se corrigió lo que engañaba —dónde está cada pantalla, quién puede pagar, que el rol de Tesorería ya no existe— pero las pantallas que quedaron escondidas no se recorrieron una por una.
- **La factura de venta no está completa ante el SENIAT.** Lo que le falta está en 15.2, y no es un olvido de este manual sino del sistema.

---

## 16. Preguntas frecuentes

**¿Puedo usar el sistema desde mi teléfono?**
Sí. Solo necesitas navegador e internet, con el mismo usuario y la misma clave. No hay aplicación que instalar. El teléfono está pensado para el trabajo de patio; las tareas de oficina, como procesar la nómina o aprobar compras, se hacen más cómodas en la computadora.

**Se me fue el internet mientras registraba algo. ¿Se perdió?**
Si no llegaste a guardar, sí. El sistema necesita conexión para guardar y no trabaja sin señal. Vuelve a registrarlo cuando vuelva el internet.

**Ayer estaba Ventas en el menú y hoy no. ¿Se borró?**
No. El menú va creciendo por partes y hoy ofrece **Panel, Maquinaria, Inventario, Combustible, Asignaciones, Compras, Nómina, Tasas de cambio, Configuración y Manual de usuario**. Explotación, Despachos, Ventas y el Organigrama siguen construidos y funcionando, pero no se ofrecen mientras se afinan. El apartado 1.5 lo explica entero.

**Antes había Tesorería y ahora no la encuentro.**
Tesorería **dejó de ser un módulo**. No está escondida: la empresa decidió que el sistema no lleva bancos ni cajas, solo refleja los movimientos. Lo que se usaba todos los días se mudó a **Compras**: **Pagos por hacer** y **Movimientos de dinero** están ahí, en el mismo menú, y funcionan igual. El capítulo 12 las sigue contando.

**Escribí la dirección de Ventas y me salió «En construcción».**
Es lo previsto. Esa pantalla existe, pero todavía no está entregada, y lo que se haga ahí puede perderse o no cuadrar con el resto. No es un problema de permisos: pedir el permiso no lo cambia.

**¿Por qué no veo el mismo menú que mi compañero?**
Porque tienen permisos distintos. Cada quien ve solo los módulos que necesita para su trabajo. No es una falla.

**¿Cómo llego rápido a una pantalla sin recorrer el menú?**
Con **Ctrl+K**, en cualquier momento. Encuentra pantallas y también documentos: el número de una orden de compra, el RIF de un proveedor, la cédula de un trabajador, la placa de un camión. Y entiende cómo habla la gente: «convertir» lleva a la calculadora de tasas, «stock» a Existencias, «gasoil» a Combustible.

**Entré y no veo ningún módulo.**
Tu usuario existe pero todavía no tiene permisos asignados. Pídeselos a administración.

**Veo la pantalla pero no me aparece ningún botón para registrar.**
Tu permiso sobre ese módulo es de consulta. Ver y registrar son dos permisos distintos.

**Quiero cargar la producción del turno y no encuentro dónde.**
Está en **Operación › Explotación › Producción por turno**. Es la única puerta por la que entra material al patio.

**¿Los precios se escriben con punto o con coma?**
Con lo que tengas a mano: **el sistema entiende las dos**. Escribas «3,20» o «3.20», guarda tres con veinte. Se hizo así porque en Venezuela el decimal es la coma y el teclado del teléfono ofrece coma, pero antes el campo no la admitía: la gente escribía «320» sin darse cuenta, y en un precio unitario eso no se nota hasta el total.

**Pegué «1.500,25» copiado de una factura y salió bien. ¿Y «1.500» a secas?**
Cuando hay dos separadores, el decimal es el último y el otro es de millar: «1.500,25» son mil quinientos con veinticinco, como esperabas. Pero **«1.500» a secas el sistema lo lee como uno y medio**, porque es lo que dice tal cual, y no hay forma de acertar siempre. **Si quieres mil quinientos, escríbelo sin punto: 1500.**

**En un campo de número no me deja escribir letras.**
Es a propósito. Esos campos aceptan cifras, un solo separador decimal y el signo menos delante, y nada más.

**Se perdió el carnet de un trabajador. ¿Qué hago?**
Entra en su ficha, tarjeta del carnet, y pulsa **Se perdió**. Sale uno nuevo con un código nuevo, y **el anterior queda anulado**: si alguien lo encuentra y lo escanea, la página dirá que no vale. Si el carnet no se perdió y solo hace falta otra copia impresa, usa **Imprimir el carnet**, que no anula nada.

**¿Puedo mandar a la imprenta un solo reverso para todos los carnets?**
**No.** Antes sí —el reverso era igual para todos— pero desde que lleva QR cada uno es distinto: el código del reverso es el que identifica a esa persona. Un reverso repetido haría que todos los carnets apuntaran al mismo trabajador.

**Un dato está mal. ¿Lo corrijo?**
Depende de qué sea. Los catálogos —clientes, proveedores, almacenes— se corrigen normalmente. Los movimientos y los documentos ya aprobados no se editan: se corrigen con un documento nuevo que explica la corrección. Si no tienes claro cuál es el caso, pregunta antes de tocar nada.

**Me equivoqué al crear un artículo. ¿Lo borro?**
Ahora sí se puede corregir, con el lápiz del catálogo, y todo menos el código. Y se puede borrar **solo mientras nada lo haya tocado**: en cuanto aparece en una orden o en un movimiento, el camino es desactivarlo. Aun así, conviene revisar el nombre y la unidad antes de guardar.

**Tengo que cargar cien artículos. ¿Uno por uno?**
No. Con el botón **Cargar por planilla** del **Catálogo de artículos**: se baja la plantilla, se llena en Excel, se sube y el sistema enseña qué va a pasar con cada fila antes de escribir nada. Sirve también para corregir los que ya están. Está en 7.10.

**Tengo diez cascos pero no me deja entregar ninguno.**
Porque están todos en manos de alguien. Existir y estar disponible no es lo mismo: lo prestado sigue contando como existencia —es de la empresa— pero no se puede volver a entregar. En la ficha del artículo se lee **0 disponible · 10 en manos de alguien**.

**¿Dónde veo todo lo que le ha pasado a un artículo?**
En su ficha. Se llega pulsando su fila en el **Catálogo de artículos**, y la tarjeta **Su historia** lista todo desde que se creó: entradas, salidas, ajustes, traslados, entregas, devoluciones y pérdidas, con la fecha y el nombre de quien lo registró.

**El sistema me dice que no hay material, pero yo lo estoy viendo en el patio.**
Falta registrar su entrada. Carga el parte de turno que quedó pendiente, o haz un conteo físico, y después repite la salida.

**El camión está esperando y la guía no ha llegado.**
Sin guía no sale mineral. Quien tenga el permiso más alto sobre Despachos puede autorizar la salida igual, y esa autorización queda registrada. No es una decisión que se tome sin avisar a quien corresponda.

**¿Quién puede ver lo que yo hago?**
Todo queda registrado: quién, cuándo y qué cambió. Esa bitácora la consulta administración. No es vigilancia sobre las personas: es el requisito que hace confiables las cifras de todos.

**¿Por qué el sistema no dice si me equivoqué en el usuario o en la clave?**
A propósito. Si lo dijera, cualquiera podría averiguar qué usuarios existen probando nombres.

**Nadie me tiene que pedir la clave.**
Ni administración, ni sistemas, ni la gerencia. Nadie necesita tu clave para hacer su trabajo. Si alguien te la pide, no la des y avísalo.

---

## 17. A quién acudir

| Situación | A quién |
| --- | --- |
| No puedo entrar, olvidé la clave, no tengo permisos | Administración |
| La tasa del día está mal o no se ha cargado | Administración |
| Un dato de un documento está equivocado | A tu supervisor, antes de tocar nada |
| Una cifra no cuadra y no sé por qué | A tu supervisor |
| El camión espera y falta un papel | A tu supervisor |
| El sistema muestra un error o se comporta raro | Sistemas |

Cuando reportes un problema a sistemas, la información que sirve es siempre la misma:

1. **En qué pantalla estabas.**
2. **Qué botón pulsaste.**
3. **Qué decía exactamente el mensaje.**

Una fotografía de la pantalla ahorra media hora de ida y vuelta. Si el mensaje trae un número de documento, cópialo tal cual.

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

**La primera es el permiso sobre Asignaciones**, el de la matriz de 13.1:

| Rol | Sobre Asignaciones |
| --- | --- |
| Administrador del sistema | **Total** |
| Almacén | **Escritura** |
| Recursos humanos | **Escritura** |
| Gerente general, Operaciones, Consulta | **Lectura** |
| Ventas, Solicitante, Respaldo | Ninguno |

**La segunda es el rol.** Los botones que entregan y que cierran casos solo se dibujan para **Almacén**, **Recursos humanos** y **Administrador**. No sale de la matriz: está escrito en la pantalla.

Hoy los dos conjuntos son el mismo, así que nadie ve un botón que luego le falle. **Si algún día administración le da escritura a otro rol y ese rol no ve los botones, no es una falla del permiso: es que la pantalla mira el rol.**

### 18.2 Quién tiene qué

**Operación › Asignaciones › Quién tiene qué**

La pantalla lo dice: *"Quién tiene qué, desde cuándo, y qué queda por entregar. Lo que vuelve no descuenta del almacén: el bien sigue siendo de la empresa."*

Dos filtros: **Buscar** —acepta el trabajador, la ficha, la cédula o el artículo— y **Sitio**.

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

1. En **A quién y de dónde**: el **Trabajador**, **De qué almacén sale** y la **Fecha**.
2. En **Qué se lleva**, se escriben las cantidades. La ayuda lo dice: *"Deja en blanco lo que no se entrega."*
3. La **Nota** es opcional, y su ejemplo dice para qué sirve: *"Opcional: para qué frente, quién autorizó."*

Si el almacén elegido no tiene nada entregable, la pantalla lo dice en vez de enseñar una lista vacía: **En ese almacén no hay nada que entregar**.

**Se entrega de varias cosas a la vez a propósito.** Un trabajador que empieza se lleva casco, botas y uniforme en el mismo acto, y hacerlo en tres pantallas es tres veces la misma ficha.

### 18.4 Dotación por cargo

**Operación › Asignaciones › Dotación por cargo**

*"Qué le corresponde a cada puesto y cada cuánto se repone. De aquí sale la lista de a quién le toca hoy."*

Se define una vez por cargo y sirve para todos los que lo tengan. La ventana **Qué le toca a este cargo** pide: **Cargo**, **Qué se le entrega**, **Cuántas**, **Se repone cada (meses)** y una **Nota**.

Arriba está la tarjeta **A quién le toca ahora**, que es lo que se mira todos los días: quién debería tener algo y no lo tiene, o lo tiene vencido.

**Ojo con esta trampa, que hace perder tiempo:** esa lista **solo ve a quien tenga un cargo del tabulador en su ficha**. Un trabajador con el cargo escrito a mano, sin cargo del tabulador asignado, **no aparece nunca**, por mucha dotación que le corresponda. Si echas de menos a alguien en esa lista, revisa primero su ficha en **Nómina › Personal**, no la dotación.

#### Entregar desde aquí

Hay dos caminos, y responden a dos formas de trabajar.

**Por la lista**, cuando se va bajando por los pendientes: cada persona lleva un botón **Entregar** en su primer renglón. Se lleva a la pantalla de entrega **con ella puesta y con todo lo que se le debe**, no solo el renglón que se pulsó — quien llega al almacén se lleva de una vez lo suyo, y tres botones iguales en tres renglones seguidos harían pensar que entregan cosas distintas.

**Por la persona**, cuando llega alguien concreto: el botón **Entregar a alguien**, arriba. Se elige el **Cargo** —que es solo un filtro para acortar la lista, y se puede dejar en blanco— y después **A quién**. La ventana enseña lo que se le va a entregar antes de continuar.

| Si la persona… | Se propone |
| --- | --- |
| Debe algo | **Lo que se le debe ahora mismo** |
| Está al día | **Lo que su cargo dice**, por si hay que reponerle unas botas rotas antes de tiempo. La ventana lo advierte |
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

**No se puede descontar lo que no tiene costo.** Si la herramienta no tiene costo calculado, el sistema no deja y lo dice: *«Esa herramienta no tiene costo calculado, así que no hay cuánto descontar. Sáldala con reposición o exoneración.»*

**Si no hay ningún período abierto, tampoco.** El mensaje es: *«No hay ningún período de nómina que admita cambios donde cargar el descuento. Abre el período, o sáldala con reposición o exoneración.»*

**Si el período ya está calculado, hay que volver a calcularlo.** La deducción entra igual, pero el recibo no la recoge hasta que se recalcule. El sistema no lo avisa: es cosa de quien lleva la nómina acordarse.

### 18.6 El módulo avisa solo

Asignaciones es de los pocos sitios del sistema que trabajan sin que nadie abra la pantalla. Hay dos avisos automáticos:

| Cuándo | Qué avisa | A quién |
| --- | --- | --- |
| **Todos los días** | Cada asignación cuya fecha de vuelta ya pasó y sigue sin devolver, con el número, la persona y los días de retraso | Almacén y administración |
| **Los lunes** | A quién le toca dotación y no la tiene | Almacén y administración |

**El aviso de retraso sale una sola vez por asignación**, no todos los días hasta que vuelva. Es deliberado: un aviso que se repite se deja de leer.

### 18.7 Cuando el sistema no te deja

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Esa herramienta no tiene costo calculado, así que no hay cuánto descontar. Sáldala con reposición o exoneración.» | El artículo no tiene costo | Ciérralo como reposición o exoneración |
| «No hay ningún período de nómina que admita cambios donde cargar el descuento. Abre el período, o sáldala con reposición o exoneración.» | Ningún período en borrador ni calculado | Abre el período en Nómina, o cierra el caso de otra forma |
| «Esa asignación está devuelta: solo se cierra lo que tuvo una incidencia.» | El bien ya volvió | No hay nada que cerrar |
| **En ese almacén no hay nada que entregar** | El almacén elegido está sin existencias entregables | Elige otro almacén, o carga la entrada primero |
| No ves el botón de entregar | Tu rol no es Almacén, Recursos humanos ni Administrador | Pídeselo a administración |

---

## 19. Maquinaria

**Va al final por el mismo motivo que el 18**: meterlo en su sitio del menú correría diez números debajo de quien tiene el manual impreso.

Es la flota: cada excavadora, cada cargador, cada camión y cada planta, con lo que lleva trabajado y **cuánto le falta para su próximo mantenimiento**. La pantalla lo resume así: *"Cada equipo, lo que lleva trabajado y cuánto le falta para su mantenimiento."*

**La idea que hay que entender antes de nada es el horómetro.** Una máquina no se mantiene por calendario sino por horas de trabajo, y el sistema no las adivina: **alguien las anota**. De ahí sale todo lo demás — cuándo toca el taller, cuántos litros por hora consume, si vale lo que cuesta.

### 19.1 Quién entra y quién puede registrar

Aquí **no hay dos puertas: hay una sola**, y es el permiso sobre Maquinaria. A diferencia de Inventario, los botones no cuelgan de ningún rol: si tienes escritura, escribes.

| Rol | Sobre Maquinaria |
| --- | --- |
| Administrador del sistema | **Control total** |
| Almacén | **Escritura** |
| Operaciones | **Escritura** |
| Compras, Gerencia general, Consulta | Lectura |
| Ventas, Recursos humanos, Solicitante, Respaldo | Ninguno |

### 19.2 Equipos

**Operación › Maquinaria › Equipos**

Tres filtros: **Buscar**, **Estado** y **Tipo**. Arriba, dos cuentas que son las que importan: cuántas máquinas **bloquean** y cuántas tienen algo **pendiente**.

#### El semáforo de mantenimiento

Es lo primero que se mira, y ordena la lista: lo peor arriba.

| Semáforo | Qué significa |
| --- | --- |
| **(sin marca)** | Dentro de su intervalo de mantenimiento |
| **Programar**, en ámbar | Pasó el primer umbral. Conviene programarlo |
| **Alarma**, en naranja | Quedan pocas horas para el tope |
| **Pasó el tope**, en rojo y titilando | **No debería estar trabajando** |

**El rojo titila a propósito.** Una máquina que se pasó del tope sigue arrancando —el sistema no apaga motores— pero cada hora que trabaja así se paga después, y más cara.

#### El estado

Es otra cosa distinta del semáforo: el semáforo dice **si le toca taller**, el estado dice **dónde está**.

| Estado | Qué significa |
| --- | --- |
| **Activa** | Trabajando o asignada a un frente |
| **En espera** | Sana y disponible, sin asignar |
| **En el taller** | Dentro, con una orden abierta |
| **Fuera de servicio** | Averiada o parada sin fecha. **No se puede mandar a trabajar** |
| **Desincorporada** | Ya no es de la flota. Se conserva por su historial |

**Una máquina no se borra: se desincorpora.** Su historial —lo que consumió, lo que costó tenerla— es justamente lo que sirve para decidir sobre la siguiente.

Al cambiar el estado hay que decir **Por qué**, y esa razón *"queda en la ficha de la máquina y se avisa a operaciones"*.

Los tipos son ocho: **Excavadora**, **Cargador**, **Camión**, **Planta**, **Perforadora**, **Vehículo**, **Generador** y **Otro**.

> **Ojo con esta confusión, que ya ha costado tiempo.** El tipo de una **máquina** —excavadora, cargador, planta— **no es** el tipo de un **vehículo** de Despachos —volteo, chuto, gandola—. Son dos catálogos distintos para dos cosas distintas: uno describe qué hace el equipo, el otro qué carga el camión. Un camión de la flota puede estar en los dos, atado por su ficha (8.6).

### 19.3 Anotar el horómetro

**Es la tarea diaria del módulo, y de ella depende todo lo demás.**

La ventana lo dice sin rodeos: *"Copia los dos números que marca el reloj. La resta la hace el sistema."* Se pide la **Fecha**, **Al arrancar** y **Al terminar**.

**No se anota la diferencia, se anotan las dos lecturas.** Es deliberado: quien copia dos números del tablero se equivoca menos que quien hace una resta de cabeza en el patio, y si algo no cuadra, las dos lecturas dejan ver dónde.

### 19.4 La ficha de una máquina

Se llega pulsando su fila. Tiene cinco bloques:

| Bloque | Qué guarda |
| --- | --- |
| **Foto** | *"Para reconocerla de un vistazo."* |
| **Cuál es** | *"El código es con el que se la nombra en el patio y en todos los papeles."* |
| **Qué combustible quema** | *"Con esto, el vale se niega a echarle lo que no es y a pasarse de lo que le cabe."* |
| **Cuándo avisar** | Los tres umbrales, en horas desde el último mantenimiento |
| **Su historia** | Combustible, horas trabajadas, pasos por el taller, repuestos y cambios de estado |

**Los tres umbrales van en orden: primero el aviso, después la alarma, y el tope al final.** Son los que encienden el semáforo de 19.2, y **si no se llenan, la máquina nunca avisa de nada**: se queda en blanco para siempre, que parece estar bien y no lo está.

**El bloque del combustible no es informativo, es un candado.** Con él puesto, el vale de combustible (20.3) se niega a echarle gasoil a una máquina de gasolina y a pasarse de lo que le cabe el tanque. Sin él, acepta cualquier cosa.

### 19.5 Mandarla al taller

Desde su ficha. La ventana abre recordando en qué situación está: *"Lleva 412 horas desde el último mantenimiento, sobre un tope de 500."*

| Campo | Detalle |
| --- | --- |
| **Por qué entra** | *"Lo que se sabe ahora. Qué se le hizo se anota al sacarla."* |
| **Entra el** | La fecha |
| **Taller** | *"Los repuestos salen de aquí."* Es un almacén de tipo Taller (7.11) |
| **Días estimados** | Contra los que se mide el retraso |
| **Urgencia** | **Normal** *(entra en la cola cuando toque)*, **Alta** *(antes que lo normal, sin parar lo demás)* o **Urgente** *(la máquina no trabaja hasta que salga)* |
| **Qué hace falta** | El oficio. Si el taller declaró los suyos y este no está, no lo acepta (7.5) |

**El taller que se elige es de dónde salen los repuestos**, así que la orden descuenta del inventario de ese taller y no de otro. Elegir el taller equivocado no rompe nada, pero deja el repuesto descontado del almacén que no era.

### 19.6 Historial de taller

**Operación › Maquinaria › Historial de taller**

*"Qué ha entrado, cuánto tardó, qué se le hizo y qué costó. Las órdenes abiertas son máquinas paradas ahora mismo."*

Esa última frase es la razón de que esta pantalla exista aparte: **una orden abierta no es un registro, es una máquina que no está trabajando.** Filtra por **Buscar** y por **Estado**.

---

## 20. Combustible

Es el gasoil y la gasolina: **cuánto queda, cuánto consume cada máquina y a qué se le echó**. La pantalla lo dice entero: *"Cuánto queda, cuánto consume cada máquina y a qué se le echó. Entra por una compra recibida, o a mano desde Cargar."*

**El combustible es un artículo del inventario como cualquier otro**, guardado en un almacén de tipo Combustible (7.11). Lo que este módulo añade es lo que el inventario no sabe: a qué máquina se le echó y con qué horómetro, que es lo que convierte litros en **litros por hora**.

### 20.1 Quién entra y quién puede despachar

El reparto es el mismo que el de Maquinaria, y por el mismo motivo: quien opera las máquinas es quien les echa combustible.

| Rol | Sobre Combustible |
| --- | --- |
| Administrador del sistema | **Control total** |
| Almacén | **Escritura** |
| Operaciones | **Escritura** |
| Compras, Gerencia general, Consulta | Lectura |
| Los demás | Ninguno |

**Editar la lista de motivos pide control total**, que solo tiene administración. Despachar, no.

### 20.2 Qué se ve

Arriba, **los tanques con su saldo**. Si no hay ninguno con existencia, la pantalla lo dice: **El tanque está vacío**.

Debajo, **el consumo por máquina** —litros por hora— y la lista de despachos. Cuando una máquina tiene despachos pero le falta el horómetro, sale marcada: **Falta anotar el horómetro en el parte diario**. Sin ese dato los litros no se pueden convertir en litros por hora, así que esa máquina no entra en la comparación.

Si todavía no se ha despachado nada, cada bloque lo dice a su manera: **Todavía no se ha despachado a ninguna máquina** y **Sin despachos todavía**.

### 20.3 Despachar combustible

| Campo | Detalle |
| --- | --- |
| **De qué tanque** | Solo salen los que tienen saldo |
| **Para qué** | Del catálogo de motivos. Ver abajo |
| **¿Para qué exactamente?** | Solo en los motivos que lo exigen. *"En pocas palabras. Si esto se repite mucho, conviene que sea una opción propia."* |
| **A qué máquina** | De la flota. Si no está, **No está en la ficha** |
| **A qué se le echó** | Cuando no es una máquina de la flota |
| **Horómetro al echarle** | *"Es lo que convierte los litros en litros por hora."* |
| **Fecha** | |

Los motivos son seis y salen de un catálogo, no de una lista escrita en la pantalla:

| Motivo | Cuándo |
| --- | --- |
| **Producción** | Sacar material: excavación, trituración, planta |
| **Operación** | Acarreo y movimiento dentro de la cantera |
| **Taller** | Mantenimiento, y la prueba de después |
| **Planta** | Planta fija y generadores |
| **Tercero** | Equipo que no es de la empresa |
| **Otro** | Cualquier otro caso: **hay que decir cuál** |

**El horómetro es el campo que más se salta y el que más falta hace.** Sin él el despacho se registra igual —los litros salen del tanque— pero esa máquina deja de tener consumo por hora, que es lo único que permite comparar dos equipos o notar que uno empezó a beber más de la cuenta.

**La lista de motivos la toca quien despacha**, no sistemas: es quien sabe para qué se echa combustible en esta cantera. Pero cambiarla pide control total.

### 20.4 El vale

Cada despacho saca su **Vale de combustible** en papel, con el botón **Imprimir el vale**. Lleva la misma cabecera que el resto de los papeles del sistema (13.2).

**Es el papel que firma quien recibe el combustible**, y por eso se imprime al despachar y no después.
