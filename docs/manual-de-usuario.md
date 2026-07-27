# Manual de usuario — La Cantera

**Versión 0.1 · 27 de julio de 2026**

Este manual explica cómo usar el sistema. Está escrito para quien trabaja con él
todos los días, no para quien lo programa.

> **Lo que ya funciona:** entrar al sistema, moverse por el menú y leer el panel.
> Los módulos de trabajo (inventario, compras, nómina y los demás) todavía se
> están construyendo. Cada sección de este manual dice claramente si ya está
> disponible o no, y el manual crece a medida que se entregan.

---

## 1. Qué es este sistema y qué no es

Es el sistema de **control interno** de la cantera. Sirve para saber, en cualquier
momento y sin preguntarle a nadie:

- Cuánto se produjo y cuánto se despachó.
- Cuánto material hay en cada patio.
- Qué se compró, quién lo pidió y quién lo aprobó.
- Cuánto se debe y cuánto deben.
- Cuánto cuesta producir cada tonelada.

**No es un sistema de contabilidad.** No sustituye al contador ni emite los
libros fiscales. Lo que hace es que cada cifra tenga un documento detrás y que
ese documento diga quién lo registró y quién lo autorizó.

**Una idea importante:** el sistema está hecho para que ciertas cosas *no* se
puedan hacer. Si en algún momento el sistema no te deja avanzar, casi siempre es
a propósito. La sección 6 explica esas reglas.

---

## 2. Cómo entrar

### 2.1 Desde la computadora

Abre el navegador y entra a la dirección del sistema.

1. Escribe tu **usuario**. No es un correo: es un nombre corto, por ejemplo
   `jperez` o `admin_`. No distingue mayúsculas de minúsculas.
2. Escribe tu **clave**.
3. Pulsa **Entrar**.

Si quieres que el sistema te recuerde y no pedirte la clave cada vez que abres el
navegador, marca **Mantener sesión abierta** antes de entrar. No lo hagas en una
computadora compartida.

### 2.2 Desde el teléfono

Funciona igual, con el mismo usuario y la misma clave. La pantalla se reorganiza
sola: en el teléfono verás una sola columna y el menú se abre con el botón de las
tres rayas, arriba a la izquierda.

El teléfono está pensado para el trabajo de patio — registrar lo que entra y lo
que sale. Las tareas de oficina, como aprobar compras o procesar nómina, se hacen
más cómodas en la computadora.

### 2.3 Si no puedes entrar

| Lo que ves | Qué significa | Qué hacer |
| --- | --- | --- |
| «Usuario o clave incorrectos» | El usuario no existe, o la clave no es esa | Revisa que no tengas activado el bloqueo de mayúsculas. Si sigue fallando, pide a administración que te reinicie la clave |
| La pantalla se queda cargando | Posible falta de conexión | Revisa que tengas internet y vuelve a intentar |
| Entras pero no ves ningún módulo | Tu usuario existe pero todavía no tiene permisos asignados | Pide a administración que te asigne tu rol |

**El sistema no dice si el error fue el usuario o la clave.** Es a propósito: si
lo dijera, cualquiera podría averiguar qué usuarios existen probando nombres.

### 2.4 Sobre las claves

- **Nadie de administración ni de sistemas necesita tu clave.** Si alguien te la
  pide, no la des.
- No hay auto-registro. Las cuentas las crea administración.
- Si eres el administrador y entraste por primera vez con la clave provisional,
  **cámbiala de inmediato**.

---

## 3. Cómo moverse por el sistema

### 3.1 El menú lateral

A la izquierda está el menú, agrupado por área de trabajo:

| Grupo | Contiene |
| --- | --- |
| **Panel** | La pantalla de resumen |
| **Operación** | Explotación, Inventario, Despachos |
| **Administración** | Compras, Ventas, Nómina, Tesorería |
| **Sistema** | Tasas de cambio, Configuración |

Los grupos con una flecha se despliegan al pulsarlos. **Solo se abre uno a la
vez**: con ocho módulos, tener varios abiertos convierte el menú en una lista
interminable.

**Solo verás los módulos para los que tengas permiso.** Si un compañero ve
opciones que tú no ves, no es un error: es que tienen roles distintos.

Cuando un módulo tiene asuntos pendientes que te tocan a ti, aparece un **número
rojo** al lado. Por ejemplo, un `7` en Compras significa siete documentos
esperando tu aprobación.

### 3.2 Ganar espacio en pantalla

El botón que está arriba a la izquierda, junto a la lupa, **contrae el menú** y lo
deja como una tira de iconos. Sirve cuando trabajas con tablas anchas.

El sistema recuerda tu preferencia: si lo dejas contraído, seguirá contraído
mañana. En el teléfono no aplica — allí el menú siempre se abre completo.

### 3.3 La barra superior

De izquierda a derecha:

- **Buscar** — buscador general del sistema *(en construcción)*.
- **Tasa BCV · hoy** — la tasa de cambio del día.
- **Campana** — notificaciones. Con punto rojo si hay algo sin leer.
- **Tu nombre** — tu cuenta y la opción de salir.

#### Por qué la tasa está siempre a la vista

No es un adorno. **Cada documento que se emita hoy queda congelado a esa tasa.**
Si la tasa está mal o desactualizada, todo lo que se registre hoy queda mal
valorado, y eso no se descubre hasta el cierre del mes — cuando ya hay decenas de
documentos que corregir.

Si ves que la tasa no coincide con la del BCV, **avisa antes de seguir
registrando**.

---

## 4. El panel

Es la primera pantalla al entrar. Resume el día.

### 4.1 Los cuatro indicadores

| Indicador | Qué mide |
| --- | --- |
| **Producción de hoy** | Toneladas producidas en la jornada |
| **Despachado de hoy** | Toneladas que salieron de la cantera |
| **Por cobrar vencido** | Dinero de clientes con la fecha de pago pasada |
| **Nómina de la semana** | Costo de la nómina en curso |

Debajo de cada cifra hay un porcentaje con una flecha. Indica la variación
respecto al período anterior, que siempre está escrito al lado (por ejemplo, «vs.
ayer»).

**Cuidado con el color:** verde no siempre significa que la flecha suba. En «Por
cobrar vencido», que la cifra suba es malo, así que la flecha hacia arriba se
muestra en rojo. El color indica si es buena o mala noticia, no la dirección.

### 4.2 Producción de la semana

Barras de los últimos siete días. La barra más oscura es hoy. Encima de cada
barra están las toneladas exactas.

### 4.3 Existencia en patio

Cuánto material hay de cada producto y qué porcentaje de la capacidad del acopio
ocupa. **La barra en naranja indica que ese producto está por debajo del mínimo.**

Arriba a la derecha se indica la fecha del último conteo físico y con qué método
se hizo. Importa: un conteo hecho con dron tiene un margen de error muy inferior
al de una estimación a ojo.

### 4.4 Despachos recientes

Los últimos despachos registrados en la romana: guía, cliente, producto, peso
neto, hora, placa del vehículo y estado.

### 4.5 Requiere atención

Asuntos que necesitan que alguien haga algo. Los hay de tres niveles:

- 🔴 **Rojo** — bloquea la operación. Ejemplo: un permiso vencido que impide
  comprar explosivos.
- 🟠 **Naranja** — hay que resolverlo pronto. Ejemplo: existencia por debajo del
  mínimo, o un conteo de combustible que no cuadra.
- 🔵 **Azul** — informativo. Ejemplo: la nómina cierra mañana.

### 4.6 Esperando tu aprobación

Documentos detenidos porque falta tu firma. Cada uno muestra el número, qué se
pide, quién lo pidió, el monto y **cuántos niveles de aprobación exige**.

Que diga «Requiere 3 niveles» significa que además de la tuya faltan otras dos
autorizaciones. Tu aprobación no libera el documento por sí sola.

---

## 5. Los módulos de trabajo

> **En construcción.** Las pantallas de esta sección aún no están disponibles. Al
> entrar a cualquiera verás el aviso «Todavía no construido». El menú y la
> navegación ya están en su sitio para que se pueda revisar la estructura.

Esto es lo que hará cada uno, en el orden en que se van a entregar:

| Módulo | Para qué servirá |
| --- | --- |
| **Inventario** | Existencias por producto y patio, todos los movimientos de entrada y salida, conteos físicos y transferencias entre acopios |
| **Compras** | El ciclo completo: pedir, cotizar, aprobar, recibir, registrar la factura y dejar la deuda anotada |
| **Explotación** | Frentes y bancos, voladuras, producción por turno y costo real por tonelada |
| **Despachos** | Tickets de romana y guías de despacho |
| **Ventas** | Clientes, cotizaciones, facturación y cuentas por cobrar |
| **Nómina** | Personal, asistencia, cálculo de nómina semanal y quincenal, recibos y prestaciones sociales |
| **Tesorería** | Bancos y cajas por moneda, pagos, cobros y conciliación |

---

## 6. Las reglas que el sistema impone

Estas reglas explican la mayoría de los casos en que el sistema no te deja hacer
algo. **No son fallas.**

### 6.1 Quien pide no aprueba, quien aprueba no recibe

Nadie puede aprobar su propia solicitud, ni recibir el material de una compra que
él mismo gestionó. Es la protección básica contra el fraude y contra el error
honesto.

Si en el patio, a deshora, no hay otra persona disponible, se puede pedir una
**excepción**. La excepción se concede, pero queda registrada con el motivo y con
quién la autorizó, y aparece en el informe de auditoría. **Nunca pasa en
silencio.**

### 6.2 Aprobación por monto

Mientras más caro, más firmas. Los montos se evalúan **en dólares**, no en
bolívares: un límite en bolívares queda obsoleto en pocas semanas.

Hay excepciones que no dependen del monto. Por ejemplo, cualquier compra de
explosivos exige el nivel máximo de aprobación, valga lo que valga.

### 6.3 Los movimientos no se borran ni se editan

Un movimiento de inventario registrado **no se puede modificar ni eliminar**. Si
está mal, se registra un movimiento de reversa y luego el correcto. Los dos
quedan visibles.

Parece incómodo, y lo es. Pero significa que el saldo de inventario siempre se
puede explicar movimiento por movimiento, y que un error o un desvío deja rastro
por construcción.

### 6.4 El conteo físico no reemplaza el saldo

Cuando se cuenta el material de un patio, ese número **no sobrescribe** lo que
dice el sistema. Se registra la diferencia como un ajuste, con el método usado y
la explicación.

La razón es física: no se cuentan piedras, se estima el volumen de una pila y se
multiplica por una densidad. Ambas cosas tienen margen de error. Incluso con dron
el margen ronda el 2 a 5 %. Un número que parece exacto no lo es, y tratarlo como
exacto esconde las diferencias que sí importan.

### 6.5 Los períodos se cierran

Cuando se cierra un mes, no se puede registrar nada con fecha dentro de ese mes.
Si hace falta corregir algo de un período cerrado, se hace con un documento nuevo
en el período actual.

### 6.6 Cada documento guarda su tasa

Un documento emitido hoy conserva para siempre la tasa de hoy. Si mañana cambia
la tasa, **ese documento no cambia**. Es lo correcto: la tasa usada forma parte
del hecho, no es un dato que se actualiza.

---

## 7. Preguntas frecuentes

**¿Puedo usar el sistema desde mi teléfono personal?**
Sí. Solo necesitas navegador e internet. No hay aplicación que instalar.

**Se me fue el internet mientras registraba algo. ¿Se perdió?**
Si no llegaste a guardar, sí. El sistema necesita conexión para guardar. Vuelve a
registrarlo cuando tengas señal.

**¿Por qué no veo el mismo menú que mi compañero?**
Porque tienen roles distintos. Cada quien ve solo lo que su rol permite.

**Aprobé un documento y sigue pendiente. ¿Falló?**
No. Ese documento necesita más de una aprobación. Fíjate en el texto que dice
cuántos niveles exige.

**Un dato está mal. ¿Lo corrijo?**
Depende. Los catálogos —proveedores, clientes, artículos— se editan normalmente.
Los movimientos y documentos aprobados no: se corrigen con un documento de
reversa. Si no estás segura, pregunta antes.

**¿Quién puede ver lo que yo hago?**
Todo queda registrado: quién, cuándo, qué cambió y qué valor tenía antes. Esa
bitácora la consulta quien tenga permiso de auditoría. No es vigilancia sobre las
personas, es el requisito que hace confiables las cifras.

---

## 8. A quién acudir

| Problema | A quién |
| --- | --- |
| No puedo entrar, olvidé la clave, no tengo permisos | Administración |
| La tasa del día está mal | Administración |
| Un dato de un documento está equivocado | A tu supervisor, antes de tocar nada |
| El sistema muestra un error o se comporta raro | Sistemas, indicando **qué pantalla**, **qué hiciste** y **qué apareció** |

Cuando reportes un problema, la información más útil es: en qué pantalla estabas,
qué botón pulsaste y qué decía exactamente el mensaje. Una captura de pantalla
ahorra media hora de ida y vuelta.
