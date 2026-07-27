# Sistema de control interno — La Cantera

**Fecha:** 27 de julio de 2026
**Estado:** diseño aprobado en lo esencial; pendiente de revisión formal
**Proyecto Supabase:** `xtvgkhrurcsmoonfzwnv` (vacío)

---

## 1. Objetivo

Que la empresa sepa, sin depender de la memoria de nadie, **cuánto produce, cuánto
despacha, cuánto le deben, cuánto debe y cuánto le cuesta cada tonelada** — y que
cada uno de esos números tenga un documento detrás que diga quién lo registró y
quién lo aprobó.

No es un sistema de contabilidad. Es un sistema de **control interno**: su razón de
ser es que quien pide no sea quien aprueba, que quien aprueba no sea quien recibe,
y que nada de eso dependa de la buena voluntad del usuario de turno.

### Criterio de éxito

El sistema cumple su objetivo cuando:

1. El saldo de inventario se puede explicar movimiento por movimiento, y la
   diferencia contra el conteo físico se clasifica automáticamente como dentro o
   fuera de tolerancia.
2. Ninguna orden de compra llega a pago sin haber pasado por su matriz de
   aprobación, y el sistema lo impide por construcción, no por convención.
3. La nómina semanal de obreros y la quincenal de empleados se procesan sin hoja
   de cálculo paralela.
4. Cualquier cifra en bolívares se puede reexpresar a dólares y viceversa, con la
   tasa de la fecha y su fuente a la vista.

---

## 2. Alcance

El sistema completo son siete subsistemas. Construirlos en un solo esfuerzo
garantiza un diseño vago, así que se descomponen y cada uno tiene su propio ciclo
de especificación e implementación.

### Dependencias reales entre módulos

```
Núcleo (auth, roles, auditoría, catálogos, bimoneda)
   ├─ Inventario ──────┬─ alimentado por Explotación
   │                   └─ alimentado por Compras (recepción)
   ├─ Compras ─────────── genera Cuentas por Pagar
   ├─ Ventas ──────────── genera Cuentas por Cobrar
   ├─ Nómina ──────────── genera pagos a personal
   └─ Tesorería ───────── consume todo lo anterior
```

Tesorería va al final porque consume todo lo demás. Empezar por ahí sería
construir sobre datos que no existen.

### En alcance ahora

Núcleo, **Inventario** y **Compras**, en paralelo. Encajan porque la recepción de
una orden de compra es una entrada de inventario: construirlos por separado
obligaría a escribir dos veces la misma operación.

### Fuera de alcance por ahora

Ventas, Nómina, Tesorería y el módulo completo de Explotación. La nómina tiene su
marco de cálculo ya investigado y documentado en
[`docs/nomina-venezuela-marco-calculo.md`](../../nomina-venezuela-marco-calculo.md).

### Salvedad importante sobre Inventario

En una cantera **el inventario se alimenta principalmente de la producción propia,
no de las compras**. Aunque el módulo de Explotación completo (voladuras,
maquinaria, combustible, rendimientos) queda para después, Inventario incluye
desde el día uno una **entrada por producción simplificada**: fecha, turno, frente,
producto y toneladas. Sin ella el stock nunca cuadra.

---

## 3. Contexto de operación

| Dimensión | Valor |
| --- | --- |
| País | Venezuela |
| Usuarios | 15–50, con separación de funciones real |
| Trabajadores | ~40 (obreros semanales + empleados quincenales) |
| Conectividad | Estable. Aplicación en línea, sin modo desconectado |
| Moneda | Bimoneda **real**: se cobra y se paga en Bs y en USD, con cajas y bancos separados por moneda |
| Dispositivos | PC en oficina, teléfono en patio |
| Riesgo IVSS | Máximo (11 % patronal). El Reglamento de la LSS art. 192 nombra textualmente "Canteras, trituración de piedra y saque de tierra" |

---

## 4. Requisitos

### 4.1 Funcionales — Núcleo

| # | Requisito |
| --- | --- |
| N-1 | Autenticación por correo y contraseña. El acceso lo asigna la administración; no hay auto-registro |
| N-2 | Permisos granulares por módulo, entidad y acción (`compras.orden.aprobar`) |
| N-3 | Roles con vigencia por fecha, para cubrir suplencias y vacaciones sin ceder credenciales |
| N-4 | Revocación de permisos **efectiva de inmediato**, sin esperar a que expire la sesión |
| N-5 | Bitácora de auditoría inmutable con actor, fecha, valores anteriores y nuevos |
| N-6 | Catálogo único de artículos con discriminador que decide si se inventaría, va a gasto o es activo fijo |
| N-7 | Registro histórico de tasas de cambio con fuente (BCV, paralelo, interna, contractual) |
| N-8 | Períodos contables que se cierran y bloquean el registro retroactivo |

### 4.2 Funcionales — Inventario

| # | Requisito |
| --- | --- |
| I-1 | Libro mayor de movimientos **inmutable**. Corregir es insertar una reversa, nunca editar |
| I-2 | Doble unidad: tonelada como unidad canónica, m³ como magnitud derivada, con el factor de conversión **congelado en cada movimiento** |
| I-3 | Factores de densidad versionados por producto y fecha, alimentados por laboratorio |
| I-4 | Entrada por producción propia, entrada por compra, salida por despacho, consumo interno, transferencia, ajuste por conteo y merma |
| I-5 | Conteo físico con método declarado (visual, topografía, dron, romana) y banda de incertidumbre |
| I-6 | Tolerancia de merma por artículo: dentro de tolerancia aprueba un nivel, fuera de tolerancia exige dos y justificación |
| I-7 | Costeo por promedio ponderado móvil **medido en USD** |
| I-8 | Saldo consultable a cualquier fecha pasada en tiempo constante |
| I-9 | Prohibición absoluta de saldo negativo en polvorín y almacén de repuestos |

### 4.3 Funcionales — Compras

| # | Requisito |
| --- | --- |
| C-1 | Ciclo completo: requisición → orden de compra → recepción → factura → cuenta por pagar |
| C-2 | Matriz de aprobación por monto **en USD** (un umbral en Bs queda obsoleto en semanas) |
| C-3 | Separación de funciones impuesta por la base de datos: quien solicita ≠ quien aprueba ≠ quien recibe |
| C-4 | Excepción de separación de funciones permitida pero **registrada y reportada**, nunca silenciosa |
| C-5 | Recepciones parciales, con tolerancia de sobre-recepción por categoría |
| C-6 | Devoluciones al proveedor con seguimiento de la nota de crédito esperada |
| C-7 | Cotejo a tres vías (orden ↔ recepción ↔ factura) con tolerancia porcentual **y** absoluta |
| C-8 | Reglas especiales para explosivos: permiso DAEX vigente obligatorio, lote, doble firma y cuadre tras cada voladura |
| C-9 | Retenciones de IVA e ISLR calculadas según la condición fiscal verificada del proveedor |
| D-10 | Cálculo de IGTF sobre pagos en divisas, con control anti-duplicación |

### 4.4 No funcionales

| # | Requisito |
| --- | --- |
| NF-1 | Las mutaciones críticas son **atómicas**. Un movimiento de inventario, una transición de estado o un cierre de nómina ocurren completos o no ocurren |
| NF-2 | El cliente **no puede escribir** en tablas críticas. No es que no deba: la base de datos se lo niega |
| NF-3 | Toda alícuota, porcentaje de retención y valor de unidad tributaria vive en tablas con vigencia por fecha, **nunca en el código** |
| NF-4 | Toda función de cálculo fiscal recibe la fecha de la operación y resuelve el parámetro vigente a esa fecha, no el vigente hoy |
| NF-5 | Los montos se almacenan en `numeric`, jamás en coma flotante |
| NF-6 | Interfaz usable en teléfono para las operaciones de patio; densa en escritorio para las de oficina |
| NF-7 | Foco visible por teclado y respeto a `prefers-reduced-motion` |

---

## 5. Decisiones de arquitectura

### 5.1 Dónde vive la lógica de negocio

**RLS para leer, funciones RPC transaccionales para escribir.**

| Operación | Cómo |
| --- | --- |
| Leer cualquier cosa | Cliente → Supabase directo, filtrado por RLS |
| Catálogos (proveedores, artículos, cargos) | Cliente → tabla directa, con RLS por permiso |
| Movimiento de inventario | **RPC**, transaccional, con bloqueo pesimista y validación de stock |
| Transición de estado en compras | **RPC**, valida estado origen, permiso y límite por monto |
| Cálculo y cierre de nómina | **RPC** atómica, con bloqueo consultivo y período bloqueado al cerrar |

**Por qué.** PostgREST envuelve cada petición en una transacción: una llamada RPC es
atómica por construcción. Una función de borde que hace tres llamadas a la API son
tres transacciones independientes — si la tercera falla, las dos primeras ya se
comprometieron.

En las tablas críticas se **revoca `INSERT`, `UPDATE` y `DELETE`** al rol
autenticado. La única puerta es la función, y la función valida.

Esto encaja con un cambio de la plataforma: **desde el 30 de octubre de 2026 las
tablas nuevas ya no se exponen automáticamente al Data API**. Sin un `GRANT`
explícito, nadie las toca. Lo que era una decisión de diseño pasó a ser el
comportamiento por defecto.

### 5.2 Autorización

**Híbrida.** El JWT lleva solo identidad de baja cardinalidad (roles, empresa). Los
permisos granulares se resuelven en Postgres mediante una función en un esquema no
expuesto.

**Por qué no todo en el JWT:** un token sigue siendo válido hasta que expira. Si a
alguien se le retira el permiso de aprobar compras, con permisos en el JWT lo
conserva hasta el siguiente refresco. Resolviéndolos en la base, la revocación es
efectiva en el instante siguiente.

**Por qué no todo en la base:** la interfaz necesita saber qué menús pintar sin un
viaje extra al servidor. El JWT cubre eso — pero solo el renderizado. **La autoridad
siempre es la base de datos.**

El coste se amortiza envolviendo la función en `(select …)`, lo que la convierte en
un *InitPlan*: se evalúa una vez por sentencia en lugar de una vez por fila. La
diferencia medida en la documentación oficial va de 11 000 ms a 10 ms.

### 5.3 Bimoneda

**Toda línea monetaria del sistema lleva cinco columnas**, sin excepciones:

```
moneda      char(3)         -- la del documento: verdad jurídica
monto       numeric(20,6)   -- en esa moneda
tasa        numeric(20,8)   -- CONGELADA en la fila, evidencia de auditoría
monto_bs    numeric(20,2)   -- GENERATED ALWAYS ... STORED
monto_usd   numeric(20,2)   -- GENERATED ALWAYS ... STORED
```

**Por qué las derivadas son columnas generadas y no un cálculo en el reporte:**
elimina de raíz la clase de error "el informe en bolívares no cuadra con el
informe en dólares". No pueden desincronizarse porque la base no lo permite.

**Por qué la tasa se copia en la fila y no basta la referencia:** la tasa usada es
un atributo del hecho económico. Si el BCV publica una corrección, los documentos
ya emitidos no deben cambiar solos.

**Diferencial cambiario.** Se calcula al aplicar un pago contra una deuda, y cada
cuenta lleva una **marca de agua** (`tasa_ultima_revaluacion`). Sin ella, un pago
posterior a una revaluación de cierre reconoce dos veces el mismo diferencial —
el error más frecuente y más difícil de detectar en sistemas venezolanos.

### 5.4 Inventario como libro mayor inmutable

Un campo `stock` actualizable pierde la historia, no es auditable, se corrompe bajo
concurrencia y no permite reprocesar. En un negocio donde el conteo físico es
**una estimación con ±2 a 5 % de error incluso con dron**, la trazabilidad
documental es el único control real contra el hurto y el error.

El saldo se mantiene en una tabla de acumulados actualizada por disparador, que es
**caché reconstruible, no verdad**, más instantáneas mensuales de cierre para
consultar saldos históricos sin escanear años de movimientos.

**Unidad canónica: la tonelada.** Es la única magnitud que mide un instrumento
auditable — la romana. El volumen de una pila siempre es estimación. El m³ se
persiste como magnitud secundaria junto al factor exacto aplicado, de modo que
recalibrar la densidad no reescriba el pasado.

### 5.5 Frontend

React 19 + Vite + TypeScript + Tailwind 4, con TanStack Query para estado de
servidor. Lenguaje visual replicado de Materio (MUI) en azul rey — tokens extraídos
del DOM de la referencia, no estimados.

**No se adopta MUI**: obligaría a descartar Tailwind y cargar Emotion. Además es un
template comercial; los componentes son propios en ese lenguaje visual.

### 5.6 Gestión del esquema

**Migraciones versionadas**, no esquema declarativo. El motor de diferencias
(`pg-delta`) está en alfa pública y no rastrea `ALTER POLICY`, particiones,
privilegios de esquema, vistas materializadas ni datos — y este sistema usa las
cinco cosas.

---

## 6. Roadmap

Cada fase termina con algo utilizable, no con una capa técnica a medias.

### Fase 0 — Base ✅ *completada*

Andamiaje, sistema de diseño, login, shell con menú colapsable, panel e interfaz
base. Rutas derivadas del archivo de navegación.

### Fase 1 — Núcleo

Extensiones, monedas y tasas, períodos contables, parametría fiscal. RBAC con
roles, permisos y vigencia. Generador de políticas RLS. Auditoría con actor y
particionado mensual. Organización, almacenes y catálogo de artículos con factores
de conversión.

**Entregable:** iniciar sesión con usuario real, gestionar usuarios y roles, cargar
la tasa del día y mantener el catálogo de artículos.

### Fase 2 — Inventario y Compras

Libro mayor de movimientos con sus funciones RPC, saldos, conteos físicos y entrada
por producción simplificada. Ciclo de compras completo con matriz de aprobación,
recepciones parciales, cotejo a tres vías y cuentas por pagar.

**Entregable:** el ciclo completo desde que alguien pide un repuesto hasta que se
recibe, se factura y queda la deuda registrada — con el material entrando al
inventario en la misma transacción.

### Fase 3 — Explotación

Frentes y bancos, voladuras con control DAEX, producción por turno, costeo de
productos conjuntos y cierre mensual de costeo.

**Entregable:** costo real por tonelada y por producto.

### Fase 4 — Ventas y Despachos

Clientes, cotizaciones, tickets de romana, guías de despacho, facturación con
requisitos del SENIAT y cuentas por cobrar.

### Fase 5 — Nómina

Personal, asistencia, motor de cálculo con las cinco bases y tres regímenes de tope
distintos, prestaciones sociales acumuladas, recibos y pagos.

### Fase 6 — Tesorería

Bancos y cajas por moneda, conciliación, pagos con IGTF, diferencial cambiario y
revaluación de cierre.

### Fase 7 — Landing y despliegue

Página pública, dominio de GoDaddy apuntando a DigitalOcean, entornos separados de
desarrollo y producción.

---

## 7. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **La normativa fiscal venezolana cambia por providencia a mitad de mes** | Toda alícuota y porcentaje en tablas con vigencia, cargadas por el contador. Ningún despliegue de código por un cambio fiscal |
| **18 puntos fiscales sin confirmar** | Documentados y marcados. Requieren asesor laboral y tributario venezolano antes de implementarse |
| **Los bonos en divisas pueden declararse salariales por vía judicial** | El sistema debe poder simular el pasivo bajo escenario adverso. Ese delta es la contingencia laboral real y hoy nadie la conoce |
| **El conteo físico de una pila nunca es exacto** | Método e incertidumbre declarados por conteo; tolerancia por artículo; ajuste explícito y firmado, nunca sobrescritura del saldo |
| **El costo real solo se conoce al cierre del mes** | Costo estándar intra-mes más movimientos de ajuste de valor con cantidad cero, que corrigen la valuación sin violar la inmutabilidad del libro mayor |
| **La operación en patio ocurre sin supervisión a deshora** | Excepción de separación de funciones permitida, pero registrada con motivo y autorizante, y reportada en auditoría |

---

## 8. Puntos pendientes de verificación

Antes de codificar la parte fiscal hace falta confirmar con asesor:

1. Alícuota de IVA vigente y tratamiento del gasoil industrial.
2. Providencia SNAT/2025/000054: umbral de operaciones alcanzadas, plazos de
   comprobante y calendario de enteramiento.
3. Porcentajes y sustraendos del Decreto 1.808 aplicables, y valor vigente de la
   unidad tributaria.
4. Alícuota de IGTF vigente y si aplica al pago de nómina en divisas en efectivo.
5. Si la empresa, como sujeto pasivo especial, está excluida del ajuste por
   inflación fiscal.
6. Régimen minero estatal: la Ley Orgánica de Minas de abril de 2026 atribuye los
   minerales no metálicos a competencia exclusiva de los estados. Permisos,
   regalía y guía de control de volumen se tramitan ante la gobernación.
7. Criterio del período del Libro de Compras: fecha de emisión o de recepción.
8. Clase de riesgo efectivamente asignada a la empresa en la Forma 14-01 del IVSS.

---

## 9. Documentos relacionados

- [`docs/nomina-venezuela-marco-calculo.md`](../../nomina-venezuela-marco-calculo.md) — marco de cálculo de nómina venezolana, conceptos, parámetros y 18 puntos a verificar.
