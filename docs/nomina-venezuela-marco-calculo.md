# Marco de cálculo de nómina — Venezuela

**Documento técnico de referencia para el motor de nómina del ERP**
**Caso de uso:** cantera (empresa privada, ~40 trabajadores). Nómina **semanal** para obreros y **quincenal** para empleados.
**Fecha de compilación de la investigación:** 27 de julio de 2026.
**Estado:** vigente a julio 2026, sujeto a la revisión periódica descrita en §10.

---

## 0. Cómo leer y mantener este documento

### 0.1 Advertencia central sobre las cifras

Venezuela tiene dos regímenes de cifras que se comportan de forma **radicalmente distinta** y el motor debe tratarlos distinto:

| Tipo | Ejemplos | Estabilidad | Tratamiento en el sistema |
|---|---|---|---|
| **Estructurales** (porcentajes, días, recargos) | 4% IVSS, 50% hora extra, 15 días/trimestre | Años/décadas | Constantes en código, pero expuestas como parámetros |
| **Coyunturales** (montos) | Salario mínimo, cestaticket, bono de guerra, tasa BCV, U.T. | Meses o días | **Nunca hardcodear.** Tabla de parámetros con vigencia por fecha |

**Regla de diseño no negociable:** todo monto en Bs. o USD de la tabla §8 debe vivir en una tabla `parametro_nomina` con `vigencia_desde` / `vigencia_hasta`, y el motor debe resolver el valor **por la fecha del período de nómina que se está calculando**, no por la fecha actual. Esto es obligatorio para poder recalcular nóminas retroactivas y liquidaciones históricas correctamente.

### 0.2 Convención de marcado

- **[VERIFICADO]** — cifra con fuente primaria (Gaceta Oficial, texto de ley) o firma reconocida, citada.
- **[VERIFICAR]** — dato del que no se obtuvo fuente sólida y reciente; **no implementar sin confirmación de asesor laboral/contable venezolano**.
- **[PRÁCTICA]** — es costumbre de mercado, **no** obligación legal.

### 0.3 Advertencia sobre desinformación

Durante la investigación aparecieron múltiples sitios generados automáticamente afirmando aumentos del salario mínimo a "Bs. 1.200" o "+5% en julio 2026". **Ninguno tiene respaldo en Gaceta Oficial ni en fuente confiable.** El salario mínimo sigue en Bs. 130,00. Cualquier actualización de parámetros debe validarse contra Gaceta Oficial o firmas reconocidas (Nayma Consultores, Gálac, Baker Tilly/Moore/Grant Thornton Venezuela, Acceso a la Justicia, Banca y Negocios), nunca contra resultados de búsqueda genéricos.

---

## 1. Marco legal aplicable

### 1.1 Cuerpos normativos

| Norma | Identificación | Vigencia | Ámbito en el motor |
|---|---|---|---|
| **LOTTT** — Ley Orgánica del Trabajo, los Trabajadores y las Trabajadoras | G.O. Ext. N° 6.076 | 07/05/2012 | Núcleo: salario, jornada, prestaciones, vacaciones, utilidades |
| **Reglamento Parcial de la LOTTT sobre el Tiempo de Trabajo** | Decreto N° 44, G.O. N° 40.157 | 30/04/2013 | Jornada, descansos, autorización de horas extras — **[VERIFICAR]** articulado exacto (verificado solo en fuente secundaria) |
| **Reglamento de la Ley Orgánica del Trabajo (2006)** | — | Vigente en lo no derogado | Art. 71: base de cálculo de días adicionales de prestaciones |
| **Ley del Cestaticket Socialista** | Decreto N° 2.066, G.O. N° 40.773 | 23/10/2015 | Beneficio de alimentación |
| **Ley de Fiestas Nacionales** | — | 17/06/1971 | Feriados nacionales (art. 1) |
| **Ley del Seguro Social** (Decreto N° 8.921) y su **Reglamento General** (Decreto N° 8.922) | G.O. N° 39.912 | 30/04/2012 | IVSS |
| **Ley del Régimen Prestacional de Empleo (LRPE)** | G.O. N° 38.281 | 27/09/2005 | RPE / paro forzoso |
| **Ley del Régimen Prestacional de Vivienda y Hábitat (LRPVH)** — Reforma Parcial 2024 | G.O. Ext. N° 6.805 | **01/05/2024** | FAOV / BANAVIH |
| **Decreto-Ley del INCES N° 1.414** | G.O. Ext. N° 6.155 | **19/11/2014** | INCES |
| **Ley de Protección de las Pensiones de Seguridad Social (LPPSS)** | G.O. Ext. N° 6.806 | 08/05/2024 | **Contribución especial 9%** — obligación nueva y frecuentemente omitida |
| **Decreto N° 4.952** (fija la alícuota de la LPPSS en 9%) | G.O. N° 42.880 | 16/05/2024 | Alícuota LPPSS |
| **Decreto N° 4.653** (salario mínimo Bs. 130) | G.O. Ext. N° 6.691 | 15/03/2022 | Salario mínimo nacional |
| **Decreto N° 4.805** (ingreso mínimo integral / cestaticket) | G.O. Ext. N° 6.746 | 01/05/2023 | Cestaticket, bono de guerra |
| **Decreto Ley del BCV**, art. 128 | — | Vigente | Pago de obligaciones en moneda extranjera |

### 1.2 Jornada de trabajo — LOTTT art. 173 [VERIFICADO]

> "La jornada de trabajo no excederá de cinco días a la semana y el trabajador o trabajadora tendrá derecho a **dos días de descanso, continuos y remunerados** durante cada semana de labor."

| Tipo de jornada | Rango horario | Máx. diario | Máx. semanal |
|---|---|---|---|
| **Diurna** | 5:00 a.m. – 7:00 p.m. | 8 h | 40 h |
| **Nocturna** | 7:00 p.m. – 5:00 a.m. | 7 h | 35 h |
| **Mixta** | combinación | 7,5 h | 37,5 h |

**Reglas derivadas que el motor debe implementar:**

1. **Regla de conversión de jornada mixta (art. 173.3):** si el período nocturno de una jornada mixta supera **4 horas**, *toda* la jornada se considera nocturna → el recargo del 30% aplica sobre la jornada completa, no solo sobre las horas nocturnas.
2. **Regla de prolongación (art. 173.2):** "toda prolongación de la jornada nocturna en horario diurno se considerará como hora nocturna". Es decir: si una jornada nocturna se extiende pasadas las 5:00 a.m., esas horas siguen devengando bono nocturno.
3. **Descanso semanal:** 2 días continuos. El Reglamento Parcial sobre el Tiempo de Trabajo (art. 13) exige que **uno de ellos sea domingo** — es decir sábado+domingo o domingo+lunes — salvo trabajos continuos por turnos. **[VERIFICAR]** (fuente secundaria).

**Regímenes especiales relevantes para una cantera:**

- **Art. 175 — horarios especiales o convenidos:** aplicable a trabajadores de dirección, de inspección/vigilancia sin esfuerzo continuo, y de sola presencia o labores discontinuas. Máximo **11 h/día**, promedio **≤ 40 h/semana en ciclos de 8 semanas**, con 2 días continuos de descanso garantizados.
- **Art. 176 — trabajo continuo por turnos:** puede exceder los límites diarios/semanales siempre que el **promedio en 8 semanas no supere 42 h/semana**. Las semanas de 6 días se compensan con **1 día adicional de disfrute vacacional**, pagado con salario pero **sin incidencia en el bono vacacional**.

> **Nota de diseño:** si la cantera opera turnos rotativos o guardias, el motor necesita un **acumulador de ciclo de 8 semanas** por trabajador para validar el promedio de los arts. 175/176. Modelar la jornada como una entidad `patron_jornada` (tipo, hora_inicio, hora_fin, días/semana, ciclo) asociada al contrato, no como campos sueltos.

### 1.3 Día de descanso semanal

- **Art. 119 — pago:** el trabajador tiene derecho al salario del día de descanso cuando prestó servicio durante los días hábiles de la jornada semanal. **No pierde el derecho por faltar un solo día.**
- **Art. 120 — trabajo en día de descanso:** salario del día **más** el trabajo realizado con **recargo del 50% sobre el salario normal**.
- **Art. 188 — descanso compensatorio:**
  - Trabajó **≥ 4 horas** en domingo o su día de descanso → **1 día completo** de salario y de descanso compensatorio.
  - Trabajó **< 4 horas** → **medio día** de salario y de descanso compensatorio.
  - El compensatorio se otorga en la **semana inmediatamente siguiente**.
  - **Excepción:** no procede compensatorio cuando el trabajo ocurre el 1° de enero, lunes y martes de carnaval, Jueves y Viernes Santo, 1° de mayo, 24, 25 y 31 de diciembre, salvo que coincidan con domingo o con el día de descanso semanal.

### 1.4 Días feriados — LOTTT art. 184 + Ley de Fiestas Nacionales art. 1

**Feriados fijos por LOTTT art. 184:**

| Fecha | Concepto | Origen |
|---|---|---|
| Todos los domingos | Descanso semanal | LOTTT 184.a |
| 1 enero | Año Nuevo | LOTTT 184.b |
| Lunes y martes de Carnaval | Móvil | LOTTT 184.b |
| Jueves Santo y Viernes Santo | Móvil | LOTTT 184.b |
| 1 mayo | Día del Trabajador | LOTTT 184.b |
| 24, 25 y 31 diciembre | Navidad / fin de año | LOTTT 184.b |
| 19 abril | Declaración de Independencia | Ley Fiestas Nacionales art. 1 |
| 24 junio | Batalla de Carabobo | Ley Fiestas Nacionales art. 1 |
| 5 julio | Firma del Acta de Independencia | Ley Fiestas Nacionales art. 1 |
| 24 julio | Natalicio de Bolívar | Ley Fiestas Nacionales art. 1 |
| 12 octubre | Resistencia Indígena | Ley Fiestas Nacionales art. 1 |

**Más (art. 184.d):** los declarados festivos por el Gobierno Nacional, los Estados o las Municipalidades, **hasta un límite total de tres por año**.

> **Diseño:** el calendario de feriados **debe ser una tabla editable por año**, no una constante. Requiere: (a) feriados móviles calculados desde la Pascua, (b) feriados regionales/municipales del estado donde opera la cantera, (c) hasta 3 decretados por año. Marcar cada fila con `ambito` (nacional / estadal / municipal) y `origen` (ley / decreto).

- **Art. 185:** las actividades que no pueden interrumpirse (interés público, razones técnicas, circunstancias eventuales) pueden operar en feriados; quienes trabajen se remuneran conforme al **art. 120** (recargo 50%).
- **Art. 186:** las excepciones se aplican **restrictivamente** — solo al trabajo que las justifica y al personal estrictamente necesario.

---

## 2. ASIGNACIONES

### 2.1 Salario básico, salario normal y salario integral — el eje conceptual del motor

Esta distinción es la fuente número uno de errores de cálculo y de reclamos laborales. El motor debe manejar **tres escalones**.

#### (a) Salario básico

Monto fijo pactado por unidad de tiempo (hora, día, semana, quincena, mes) sin ningún recargo ni complemento.

#### (b) Salario normal — LOTTT art. 104 [VERIFICADO]

> "Se entiende por salario la remuneración, provecho o ventaja, **cualquiera fuere su denominación o método de cálculo**, siempre que pueda evaluarse en moneda de curso legal, que corresponda al trabajador o trabajadora por la prestación de su servicio y, entre otros, comprende las comisiones, primas, gratificaciones, participación en los beneficios o utilidades, sobresueldos, bono vacacional, así como recargos por días feriados, horas extraordinarias o trabajo nocturno, alimentación y vivienda. […]
>
> A los fines de esta Ley se entiende por **salario normal**, la remuneración devengada por el trabajador o trabajadora **en forma regular y permanente** por la prestación de su servicio. Quedan excluidas las **percepciones accidentales**, las derivadas de **prestaciones sociales** y las que la Ley considere sin carácter salarial.
>
> Para la estimación del salario normal **ninguno de los conceptos que lo conforman producirá efectos sobre sí mismo**."

**Tres reglas de implementación que salen directamente de este artículo:**

1. **Regla sustantiva ("cualquiera fuere su denominación"):** la etiqueta del concepto no determina su naturaleza. Un bono llamado "no salarial" que se paga regular y permanentemente como retribución del servicio **es salario**. Ver §6.3.
2. **Regla de regularidad:** el motor necesita un flag `es_regular_permanente` por concepto y, para conceptos variables (horas extras, bono nocturno, feriados trabajados), un **promedio** del período de referencia. La práctica y la jurisprudencia usan el **promedio de los últimos 3 meses** para conceptos variables; el art. 121 lo establece expresamente para vacaciones con salario variable. **[VERIFICAR]** el período de promediación aplicable a cada concepto con asesor laboral — la LOTTT no fija un período universal.
3. **Regla anti-recursión (crítica):** "ninguno de los conceptos que lo conforman producirá efectos sobre sí mismo". El motor **no puede** calcular el recargo de hora extra sobre un salario normal que ya incluya recargos de horas extras. La base de un recargo es el salario normal **excluyendo el propio concepto**. Esto obliga a un cálculo por capas, no a una suma plana. Ver §9.2.

#### (c) Salario integral — LOTTT art. 122 [VERIFICADO]

Base para **prestaciones sociales e indemnizaciones**. Es el último salario devengado integrado con **todos** los conceptos salariales, **más**:

```
Salario integral diario = Salario normal diario
                        + Alícuota diaria de bono vacacional
                        + Alícuota diaria de utilidades
```

Fórmulas de alícuota (convención de 360 días/año, estándar de mercado):

```
Alícuota diaria bono vacacional = (Salario normal diario × Días de bono vacacional del año) / 360
Alícuota diaria de utilidades   = (Salario normal diario × Días de utilidades del año)     / 360
```

- Para **salario variable** (unidad de obra, pieza, destajo o comisión): promedio de los **6 meses inmediatamente anteriores** (art. 122).
- Si al momento del cálculo las utilidades no están determinadas, el patrono debe incorporar la cuota una vez determinadas y **pagar la diferencia dentro de 30 días** (art. 122).
- Cuando no hay participación en beneficios, se incluye la alícuota de **bonificación de fin de año**.

> **Diseño:** `dias_utilidades_anuales` y `dias_bono_vacacional` son **parámetros por trabajador** (el bono vacacional crece 1 día por año de servicio) y, en el caso de utilidades, **parámetro de empresa** (mínimo legal 30, la empresa puede pagar más). El motor debe recalcular la alícuota de bono vacacional en cada aniversario de ingreso.

#### (d) Qué NO entra en ninguno de los dos — LOTTT art. 105 [VERIFICADO]

Beneficios sociales de carácter **no remunerativo**:

1. Servicios de centros de educación inicial
2. **Beneficio de alimentación** (comedores, cupones, dinero, tarjetas electrónicas y otras modalidades)
3. Reembolsos médicos, farmacéuticos y odontológicos
4. Ropa de trabajo / uniformes
5. Útiles escolares y juguetes para los hijos
6. Becas o pago de cursos de capacitación, formación o especialización
7. Gastos funerarios

> "Estos beneficios **no serán considerados salario, salvo que en las convenciones colectivas o contratos individuales de trabajo se hubiere estipulado lo contrario**."

**Implicación de diseño:** el flag `incide_salario_normal` / `incide_salario_integral` debe ser **configurable por concepto y sobreescribible a nivel de contrato individual o convención colectiva**, porque el propio art. 105 lo permite.

#### (e) Base para retenciones — LOTTT art. 107 [VERIFICADO]

> "Cuando el patrono, patrona o el trabajador o trabajadora, estén obligados u obligadas a cancelar una contribución, tasa o impuesto, se calculará, considerando el **salario normal correspondiente al mes inmediatamente anterior** a aquél en que se causó."

Esto rige la base de IVSS, RPE, FAOV e ISLR: **mes inmediatamente anterior**, no el mes corriente. El motor necesita un **acumulador mensual de salario normal** consultable por mes calendario, independiente del período de pago (semanal/quincenal).

### 2.2 Horas extraordinarias

**Recargo — LOTTT art. 118 [VERIFICADO]**

> "Las horas extraordinarias serán pagadas con un **cincuenta por ciento de recargo, por lo menos**, sobre el salario convenido para la jornada ordinaria. Para el cálculo […] se tomará como base el **salario normal** devengado durante la jornada respectiva."

**Límites — LOTTT art. 178 [VERIFICADO]**

| Límite | Valor |
|---|---|
| Duración efectiva total del trabajo (ordinaria + extras) | **10 horas diarias** |
| Horas extraordinarias | **10 por semana** |
| Horas extraordinarias | **100 por año** |

> ⚠️ **Error común a evitar:** la ley **no** dice "máximo 2 horas extra diarias". Dice **10 horas efectivas totales al día**. En jornada diurna de 8 h eso equivale a 2 h extra; en jornada **nocturna de 7 h** equivalen a **3 h extra**; en mixta de 7,5 h, 2,5 h. El motor debe calcular el tope diario como `10 − horas_jornada_ordinaria_del_tipo_de_jornada`.

**Autorización — LOTTT art. 182 [VERIFICADO]**

- Se requiere **permiso de la Inspectoría del Trabajo**. El Inspector responde dentro de 48 horas.
- En casos imprevistos comprobados se puede laborar sin autorización previa, **notificando al día hábil siguiente**.
- **"En caso de laborarse las horas extraordinarias sin la autorización del Inspector o Inspectora del Trabajo, éstas deberán pagarse con el doble del recargo"** → **100% en vez de 50%**, más sanciones.

> **Diseño:** modelar `hora_extra.autorizada` (booleano) y aplicar `factor_recargo = 0,50` o `1,00`. Además, mantener **acumuladores de horas extras** por semana y por año por trabajador, con alerta bloqueante al aproximarse a los topes de 10/semana y 100/año. En una cantera con picos de producción esto se supera con facilidad y es una contingencia real.

**Fórmulas:**

```
Valor hora normal      = Salario normal diario / Horas de la jornada diaria ordinaria
Hora extra diurna      = Valor hora normal × (1 + 0,50)     [o × 2,00 si no autorizada]
Hora extra nocturna    = Valor hora normal × (1 + 0,30 + 0,50)   ← ver nota
```

> **[VERIFICAR] — concurrencia de recargos.** La ley no resuelve expresamente si el bono nocturno y el recargo de hora extra se **suman** (1 + 0,30 + 0,50 = 1,80) o se **componen** (1 × 1,30 × 1,50 = 1,95). Ambas prácticas existen en el mercado. Confirmar con asesor laboral y **dejarlo como parámetro de configuración** (`modo_concurrencia_recargos: SUMA | COMPUESTO`). El método compuesto es más favorable al trabajador y por tanto de menor riesgo de reclamo.

### 2.3 Bono nocturno — LOTTT art. 117 [VERIFICADO]

> "La jornada nocturna será pagada con un **treinta por ciento de recargo, por lo menos**, sobre el salario convenido para la jornada diurna. Para el cálculo […] se tomará como base el **salario normal** devengado durante la jornada respectiva."

```
Bono nocturno = Horas nocturnas trabajadas × Valor hora normal × 0,30
```

Aplicar en conjunto con la regla del art. 173.3: jornada mixta con >4 h nocturnas ⇒ **todas** las horas de la jornada devengan el 30%.

### 2.4 Día de descanso y feriado trabajado — LOTTT art. 120

```
Pago por trabajar un feriado o día de descanso
  = Salario del día (que ya se devenga por el art. 119)
  + (Salario normal diario × 0,50)
```

Es decir, el trabajador recibe **1,5 días** de salario por ese día, además de conservar el día que ya le correspondía. Y si trabajó ≥ 4 h en su descanso semanal, **además** acumula un **día de descanso compensatorio** (art. 188) a otorgar la semana siguiente.

> **Diseño:** `descanso_compensatorio_pendiente` es un saldo por trabajador (en días o medios días) que el motor genera automáticamente y descuenta cuando se otorga. Debe aparecer en el recibo y en el reporte de asistencia.

### 2.5 Día de descanso y feriado NO trabajado — LOTTT art. 119 [VERIFICADO]

**Este es el artículo que gobierna la diferencia entre la nómina semanal de obreros y la quincenal de empleados.**

> "El trabajador o trabajadora tiene derecho a que se le pague el salario correspondiente a los días feriados o de descanso **cuando haya prestado servicio durante los días hábiles de la jornada semanal de trabajo**."

| Modalidad de pago | Tratamiento |
|---|---|
| **Salario mensual pactado** | El pago de feriados y descansos **ya está incluido** en la remuneración mensual. No se paga aparte. |
| **Salario semanal / diario / por unidad de obra** | Se paga **adicionalmente**, calculado sobre el **promedio del salario normal devengado en los días trabajados de la semana respectiva**. |
| **Salario quincenal o mensual variable** | Promedio del salario normal devengado en los días trabajados de la **quincena o mes** respectivo. |

**No se pierde el derecho por faltar un solo día** de la jornada semanal.

> **Diseño — implicación directa para la cantera:**
>
> - **Obreros (nómina semanal, salario por día o por semana):** el motor **debe generar líneas separadas** `DESC-SEM` y `FERIADO-NT` calculadas sobre el promedio diario del salario normal de esa semana. Si el obrero hizo horas extras o bono nocturno esa semana, **el promedio sube** y el día de descanso se paga más caro. Esto se omite con frecuencia y genera pasivos.
> - **Empleados (nómina quincenal con salario mensual):** los descansos y feriados **ya están dentro** del salario quincenal. Generar líneas separadas sería **doble pago**. El motor debe suprimirlas según el flag `modalidad_salario = MENSUAL`.
>
> Modelar esto como una propiedad del contrato: `base_estipulacion_salario ∈ {HORA, DIA, SEMANA, QUINCENA, MES}` — y **no** confundirla con `frecuencia_pago ∈ {SEMANAL, QUINCENAL}`. Son dimensiones independientes: se puede pactar salario mensual y pagarlo quincenalmente.

### 2.6 Vacaciones y bono vacacional

**Días de disfrute — LOTTT art. 190 [VERIFICADO]**

> "Cuando el trabajador o la trabajadora cumpla un año de trabajo ininterrumpido […] disfrutará de un período de vacaciones remuneradas de **quince días hábiles**. Los años sucesivos tendrá derecho además a **un día adicional remunerado por cada año de servicio, hasta un máximo de quince días hábiles**."

```
Días de disfrute (año n) = 15 + min(n − 1, 15)     → tope 30 días HÁBILES
```

⚠️ El tope de **adicionales** es 15 (no 30). El total máximo es 30. Y la unidad es **días hábiles**, no continuos — el motor debe proyectar el retorno saltando descansos y feriados.

Durante las vacaciones el trabajador **conserva el derecho al beneficio de alimentación** (art. 190 in fine).

**Bono vacacional — LOTTT art. 192 [VERIFICADO]**

> "…una bonificación especial para su disfrute equivalente a un **mínimo de quince días de salario normal más un día por cada año de servicios hasta un total de treinta días** de salario normal. **Este bono vacacional tiene carácter salarial.**"

```
Días de bono vacacional (año n) = min(15 + (n − 1), 30)
```

⚠️ Nótese la asimetría con el art. 190: aquí el tope de **30 es el total**, no los adicionales. Son dos progresiones distintas que coinciden numéricamente pero se redactan diferente. Ambas llegan a 30.

**Salario base de vacaciones y bono vacacional — LOTTT art. 121 [VERIFICADO]**

- Salario fijo → **salario normal devengado en el mes efectivo de labores inmediatamente anterior** al disfrute.
- Salario variable (unidad de obra, pieza, destajo, comisión) → **promedio del salario normal de los 3 meses inmediatamente anteriores** al disfrute.

> **Diseño:** el bono vacacional **tiene carácter salarial expreso** → entra en salario normal del período en que se paga e incide en el salario integral vía su alícuota. Provisionar mensualmente.

### 2.7 Utilidades / participación en los beneficios

**LOTTT art. 131 [VERIFICADO]**

- La entidad de trabajo debe distribuir entre todos sus trabajadores **al menos el 15% de los beneficios líquidos** del ejercicio anual.
- **Mínimo por trabajador: 30 días de salario.**
- **Máximo por trabajador: 4 meses de salario** (equivalente a 120 días).
- Si el trabajador no laboró todo el año, se reduce **proporcionalmente a los meses completos de servicio**.
- Si la relación termina antes del cierre del ejercicio, la liquidación puede hacerse al vencimiento del mismo.

**LOTTT art. 132 — bonificación de fin de año [VERIFICADO]**

> "Las entidades de trabajo con fines de lucro pagarán a sus trabajadores y trabajadoras, **dentro de los primeros quince días del mes de diciembre** de cada año o en la oportunidad establecida en la convención colectiva, una cantidad equivalente a **treinta días de salario, por lo menos**, imputable a la participación en los beneficios o utilidades…"

- Si el patrono **no obtuvo beneficio**, lo entregado se considera **bonificación y no está sujeto a repetición** (no se puede recuperar).
- Si los beneficios no alcanzan a cubrir los 30 días anticipados, **la obligación se considera extinguida**.

⚠️ El art. 132 **no** trata a los trabajadores con menos de un año — esa proporcionalidad está en el art. 131.

**Base salarial:** promedio de las remuneraciones del ejercicio. **[VERIFICAR]** el criterio exacto de promediación (salario normal promedio del ejercicio vs. salario del mes de pago) con asesor contable; hay variación en la práctica.

```
Utilidades = (Salario base × Días de utilidades del año) × (Meses completos servidos / 12)
```

> **Diseño:** `dias_utilidades_empresa` es parámetro de empresa (≥ 30, ≤ 120). El sistema debe soportar tanto el **anticipo obligatorio de diciembre** (art. 132) como la **liquidación definitiva** post-cierre fiscal con el cálculo del 15% de beneficios líquidos (art. 131), y el asiento de diferencia.

### 2.8 Cestaticket / beneficio de alimentación

**Marco:** Decreto N° 2.066, G.O. N° 40.773 del 23/10/2015 (Ley del Cestaticket Socialista) + LOTTT art. 105.2.

| Atributo | Valor |
|---|---|
| **Carácter salarial** | **NO.** No forma parte del salario ni de las prestaciones sociales. No genera alícuotas. |
| **Obligados** | Todo patrono, público y privado, **desde 1 trabajador** |
| **Unidad de división** | **30 días calendario** (no días hábiles) |
| **Modalidades** | Comedores propios, comida contratada, comedores comunes, servicios del Estado, cupones/tickets, **tarjeta electrónica de alimentación**; pago en dinero de forma excepcional (entidades con < 20 trabajadores o sin acceso a establecimientos afiliados) |
| **Vacaciones, descansos, permisos y reposos** | **Se sigue pagando** (incapacidad no mayor a 12 meses) |
| **Descuento por inasistencia** | Monto mensual ÷ 30 por cada jornada incumplida **imputable al trabajador**. **No procede** si la ausencia es imputable al patrono, ni por vacaciones, incapacidad, riesgo, emergencia, catástrofe o calamidad pública |

**Prorrateo por frecuencia de nómina:**

```
Cestaticket diario     = Monto mensual vigente / 30
Nómina semanal   (7d)  = Cestaticket diario × 7
Nómina quincenal (15d) = Cestaticket diario × 15   (≈ 50% del mensual)
Descuento por falta    = Cestaticket diario × jornadas injustificadas
```

**Monto vigente — ver §8. Es el parámetro más volátil del sistema y tiene un problema de fuente que hay que entender:**

- El **último decreto efectivamente publicado en Gaceta Oficial** con un monto es el **Decreto N° 4.805, G.O. Ext. 6.746 del 01/05/2023 → Bs. 1.000,00 mensuales**. Ese decreto faculta al Ejecutivo a hacer **ajustes mensuales tomando como referencia el tipo de cambio del BCV**.
- Desde 2024 el Ejecutivo **anuncia** el cestaticket en **USD 40 indexados**, pagados en bolívares a tasa BCV, **sin publicar decreto en Gaceta Oficial** con esa cifra.
- **La Sala de Casación Social del TSJ ha condenado el pago con base en USD 40 pese a la falta de publicación**, tratándolo como "hecho público y comunicacional" (sentencia SCS N° 712 del 19/12/2024).

> **Conclusión práctica:** la obligación de pagar **USD 40 indexados es judicialmente exigible** aunque su soporte formal en Gaceta sea discutido. Implementar como **USD 40 × tasa BCV de la fecha de pago**, parametrizable, con capacidad de cambiar a monto fijo en Bs. si sale un decreto.

---

## 3. DEDUCCIONES DEL TRABAJADOR Y APORTES DEL PATRONO

### 3.1 Cuadro resumen

| Concepto | Aporte patronal | Retención al trabajador | Base de cálculo | Tope | Periodicidad de declaración |
|---|---|---|---|---|---|
| **IVSS** | 9% / 10% / 11% según riesgo → **cantera: 11%** | **4%** | Salario normal, causación **semanal** | **5 salarios mínimos urbanos** | Mensual (TIUNA) |
| **RPE** (paro forzoso) | **2,0%** (80% del 2,5%) | **0,5%** (20% del 2,5%) | Salario normal del **mes anterior** | Piso 1 SM · **Techo 10 SM** urbanos | Mensual, meses vencidos, primeros **5 días hábiles** |
| **FAOV** | **2,0%** (2/3 del 3%) | **1,0%** (1/3 del 3%) | **Salario integral** mensual | **Sin tope superior** (solo piso = 1 SM) | Mensual, primeros **5 días hábiles** |
| **INCES** | **2,0%** | **0,5%** | Patrono: **salario normal mensual** del trimestre. Trabajador: **utilidades y aguinaldos** | Sin tope | Patrono: **trimestral**, dentro de **5 días** del cierre. Trabajador: **dentro de 10 días siguientes al pago** de utilidades |
| **LPPSS** (contribución especial de pensiones) | **9,0%** | — | **Total de pagos salariales Y NO salariales** al trabajador | **Base mínima USD 240** | **Mensual**, ante SENIAT |
| **ISLR** | — | Según tabla ARI | Enriquecimiento neto anual estimado | Exento ≤ **1.000 U.T.** anuales | Retención en cada pago; ARI trimestral |

> ⚠️ **Advertencia de diseño — no existe una base única.** Los cuatro parafiscales clásicos usan **tres bases distintas** y **tres regímenes de tope distintos**:
>
> | | Base | Tope |
> |---|---|---|
> | IVSS | Salario **semanal** derivado del normal | 5 SM |
> | RPE · INCES | Salario **normal mensual** (RPE: del mes anterior) | RPE: 10 SM · INCES: sin tope |
> | FAOV | **Salario integral** mensual | **Sin tope** |
> | LPPSS | **Todos los pagos, salariales y NO salariales** | Piso USD 240 |
>
> Calcular los cinco sobre una base común es el error estructural más costoso que puede cometer el motor.

### 3.2 IVSS — Instituto Venezolano de los Seguros Sociales

**Porcentajes [VERIFICADO — con una salvedad importante]**

| Clase de riesgo | Patrono | Trabajador |
|---|---|---|
| Mínimo | 9% | 4% |
| Medio | 10% | 4% |
| Máximo | **11%** | 4% |

**Sobre la aparente contradicción legal — resuelta [VERIFICADO]:**

⚠️ **Advertencia de numeración.** En el texto refundido de 2012 los artículos se corrieron respecto de la numeración clásica de 1991. El citado habitualmente como "art. 66" (11/12/13%) **hoy es el art. 65**; el "art. 67" (4% del asegurado) **hoy es el art. 66**.

| Norma | Qué dice |
|---|---|
| **LSS art. 65** | La cotización *"**al iniciarse la aplicación de esta Ley**"* será de 11% (riesgo mínimo), 12% (medio), 13% (máximo) |
| **LSS art. 66** | La parte del asegurado será, *"al iniciarse la aplicación de esta Ley"*, del **4%** |
| **LSS arts. 59 y 61** | La cotización y la parte que corresponde a cada uno **serán determinadas por el Ejecutivo Nacional** |
| **Reglamento General art. 109** | Tabla vigente: **patrono 9% / 10% / 11%** según riesgo, **asegurado 4%** |

**Conclusión:** el 11/12/13% del art. 65 es la **tasa total inicial congelada en el texto legal**, no la vigente. Los arts. 59 y 61 **delegan expresamente en el Ejecutivo** la fijación de las porciones, delegación ejercida en el **art. 109 del Reglamento General**. Por tanto **9/10/11% patronal + 4% del trabajador no es práctica administrativa: es derecho positivo vigente**. La cotización total real hoy es 13/14/15%.

> ⚠️ **Dato erróneo que circula ampliamente:** el reparto *"3/4 patrono – 1/4 trabajador"*. **No existe en la LSS ni en su Reglamento General.** La ley no reparte por fracciones: fija un **4% fijo** para el asegurado (art. 66). La confusión probablemente nace de que 4/13 ≈ 31% y 9/13 ≈ 69% se parecen a 1/4 y 3/4. **No implementar.**

**Clasificación de riesgo de una cantera [VERIFICADO]**

El **art. 192 del Reglamento General** enumera como **riesgo máximo**, textualmente, **"Canteras, trituración de piedra y saque de tierra"** y **"Minas"**.

➡️ **Una cantera es RIESGO MÁXIMO → aporte patronal 11%.**

Códigos de clasificación: 1 = mínimo, 2 = medio, 3 = máximo, 4 = parcial. Riesgo medio = "todas las empresas no incluidas expresamente en otra clase". Riesgo mínimo = empresas sin fuerza motriz, vapor ni motores de combustión interna.

> **[VERIFICAR] — confirmar, no asumir.** Aunque la norma es explícita, la clasificación efectiva la **asigna la Oficina Administrativa del IVSS** al inscribir la empresa (**Forma 14-01**, dentro de los 3 días hábiles siguientes al inicio de actividades) y consta en el expediente patronal. Consultar la clase efectivamente asignada a esta cantera y cargarla como parámetro de empresa. Un error genera diferencias del 1–2% sobre toda la nómina, retroactivas.

**Base de cálculo y mecánica semanal [VERIFICADO]**

- **LSS art. 58 / Reglamento art. 83:** el cálculo se hace sobre el salario devengado. El art. 83 define el salario a efectos del SSO **excluyendo utilidades, aguinaldos y horas extras no regulares** → en sustancia, **salario normal**. **[VERIFICAR]** la composición exacta respecto de horas extras y bono nocturno contra la Gaceta.
- **Reglamento art. 99:** *"Las cotizaciones para el Seguro Social se causarán **semanalmente**"*.
- **Reglamento art. 102:** se deben desde el primer día de trabajo de cada semana; **por cada semana no se debe más de una cotización** aunque el asegurado cambie de patrono.
- **Reglamento art. 100:** el IVSS puede establecer que el pago se efectúe por períodos de **4 o 5 semanas**. ← **De aquí sale el conteo de "lunes del mes"**: es el mecanismo para contar 4 o 5 semanas dentro del mes calendario.
- **Reglamento art. 103:** la retención se hace **al momento de pagar el salario**; si no se descuenta entonces, **no puede cobrarse después al trabajador**. Regla dura para el motor: una retención omitida en su período no es recuperable.

```
Salario diario  → base semanal = salario diario × 7
Salario mensual → base semanal = (salario mensual × 12) / 52

Cotización del mes = base_semanal × % aplicable × N° de lunes del mes
```

**Tope — Reglamento art. 98 [VERIFICADO]:** *"El límite de salario para cotizar y recibir prestaciones en dinero… se fija en el equivalente a **cinco (5) salarios mínimos urbanos vigentes mensuales**."*

> **Diseño:** el tope se aplica sobre el **salario mensual** antes de derivar el semanal. Con el salario mínimo en Bs. 130, el tope es Bs. 650/mes — cifra que **cualquier nómina real supera ampliamente**, de modo que en la práctica **casi todos los trabajadores cotizan al tope**. Implementar `base_ivss = MIN(salario_normal_mensual, 5 × salario_minimo)` y no dar por irrelevante el tope: si el salario mínimo se ajusta, la base salta de golpe para toda la plantilla.

**Declaración y pago:** sistema **TIUNA** (Sistema de Gestión y Autoliquidación de Empresas). El IVSS emite las **órdenes de pago electrónicas por el portal dentro de los primeros 7 días de cada mes**; pago **mensual**. Mora → intereses conforme al Código Orgánico Tributario (Reglamento art. 104).

> ⚠️ El plazo de *"primeros 5 días hábiles del mes siguiente"* que circula para el IVSS **solo aparece en blogs SEO — NO VERIFICADO**. Los arts. 100 y 101 del Reglamento dejan la oportunidad de pago a lo que establezca el Instituto. **[VERIFICAR]** el calendario TIUNA vigente 2026.

**Acumulador requerido:** número de **semanas cotizadas** por trabajador (métrica clave para pensión). El motor debe llevarlo y reportarlo.

### 3.3 RPE — Régimen Prestacional de Empleo (antiguo "paro forzoso")

**Ley del Régimen Prestacional de Empleo, G.O. N° 38.281 del 27/09/2005 — art. 46 [VERIFICADO]**

> "La cotización al Régimen Prestacional de Empleo será del **dos coma cincuenta por ciento (2,50%) del salario normal devengado** por el trabajador, trabajadora o aprendiz **en el mes inmediatamente anterior** a aquel en que se causó, correspondiéndole al empleador o empleadora el pago del **ochenta por ciento (80%)** de la misma, y al trabajador o trabajadora el pago del **veinte por ciento (20%)** restante."

El mismo artículo fija la base contributiva con *"límite inferior el monto de un salario mínimo urbano y como límite superior diez salarios mínimos urbanos"*.

| Atributo | Valor |
|---|---|
| Cotización total | **2,50%** |
| Patrono | **80% del total = 2,00%** |
| Trabajador | **20% del total = 0,50%** |
| Base | **Salario normal del mes inmediatamente anterior** a la causación |
| Límite inferior de la base | **1 salario mínimo urbano** |
| Límite superior de la base | **10 salarios mínimos urbanos** |
| Periodicidad | **Art. 47:** se causan por **meses vencidos**; enterar dentro de los **primeros 5 días hábiles de cada mes** |

```
Base RPE = CLAMP(salario_normal_mes_anterior, 1 × SM, 10 × SM)
Retención trabajador = Base RPE × 0,005
Aporte patronal      = Base RPE × 0,020
```

> - El tope del RPE (10 SM) es el **doble** del tope del IVSS (5 SM). Son bases distintas y el motor debe calcularlas por separado — reutilizar la base del IVSS es un error frecuente.
> - El **2% patronal del RPE es ADICIONAL** al 9/10/11% del SSO, no está incluido en él. **Carga patronal total para la cantera: 11% + 2% = 13%.** Carga del trabajador: 4% + 0,5% = 4,5%.
> - El art. 47 manda enterar a la **Tesorería de Seguridad Social**, que nunca entró en funcionamiento; en la práctica **la recaudación la ejecuta el IVSS junto con el SSO a través de TIUNA**. [PRÁCTICA, corroborada por fuentes secundarias y por el propio portal del IVSS.]

### 3.4 FAOV / BANAVIH — Fondo de Ahorro Obligatorio para la Vivienda

**LRPVH — Reforma Parcial, G.O. Ext. N° 6.805 del 01/05/2024 [VERIFICADO]**

⚠️ **La ley fue reformada en 2024 y los artículos se renumeraron.** El art. 30 que suele citarse **hoy es el art. 33**; el plazo de depósito está en el **art. 34**.

**Art. 33, numeral 1 (literal):**

> "El aporte mensual en la cuenta de cada trabajadora o trabajador **equivalente al tres por ciento (3%) de su salario integral**, indicando por separado: los **ahorros obligatorios del trabajador equivalentes a un tercio (1/3)** del aporte mensual y los **aportes obligatorios de los patronos… equivalente a dos tercios (2/3)** del aporte mensual."

| Atributo | Valor |
|---|---|
| Aporte total | **3,00% del salario integral mensual** (no puede ser menor) |
| Trabajador | **1/3 del total = 1,00%** (ahorro obligatorio) |
| Patrono | **2/3 del total = 2,00%** (aporte obligatorio) |
| Base | **Salario integral** (salario normal + alícuota bono vacacional + alícuota utilidades) |
| **Tope superior** | **NO EXISTE** — ver abajo |
| Piso | 1 salario mínimo |
| Plazo de depósito | **Art. 34:** dentro de los **primeros 5 días hábiles de cada mes** |

**Ausencia de tope — art. 116 LOSSS** (reformado por Decreto 6.243, G.O. Ext. 5.891 del 31/07/2008):

> "Para la base de las cotizaciones del Régimen Prestacional de Vivienda y Hábitat, **se establece únicamente el salario mínimo obligatorio como límite inferior**, a fin de no excluir de este régimen a los trabajadores que superen los diez (10) salarios mínimos como ingreso mensual."

➡️ **El FAOV es el único parafiscal sin techo.** Sobre nóminas altas es la contribución más costosa en términos absolutos.

**La base "salario integral" — controversia resuelta [VERIFICADO]**

La evolución normativa fue: *salario normal* (Ley 2000) → *ingreso total mensual* (LRPVH 2005) → **salario integral** (desde el Decreto 6.072, vigente 01/08/2008, mantenido en 2012 y 2024).

| Fase | Hito |
|---|---|
| 1 | La Sala Político-Administrativa imponía "salario normal", tratando el FAOV como contribución parafiscal — **SPA N° 01202 del 25/11/2010** |
| 2 | La **Sala Constitucional, sentencia N° 1771 del 28/11/2011** (Exp. 11-1279) **ANULÓ** la 01202/2010, extendió el efecto a todas las sentencias sobre la misma materia, y declaró que **los aportes al FAOV no son parafiscales ni se rigen por el derecho tributario**, y que son **imprescriptibles** |
| 3 | La SPA rectificó — **SPA N° 01527 del 12/12/2012** (ACBL de Venezuela), ratificada por **SPA 00748 del 27/06/2013** (Productos EFE) y **SPA 00779 del 03/07/2013** (Owens Illinois): la base evolucionó *"del salario normal inicialmente concebido al salario integral"* |

➡️ Para nómina 2025-2026 la base es **salario integral**, sin discusión. El archivo TXT que exige el portal **FAOV en Línea** trae expresamente el campo **"Salario Integral"**.

> ⚠️ **La base del FAOV es salario INTEGRAL, no normal, y no tiene tope.** Es la mayor diferencia entre el FAOV y los demás parafiscales y una fuente clásica de reparos de BANAVIH. El motor debe usar un cálculo específico.
>
> Los porcentajes y el reparto patrono/trabajador **pueden ser modificados por el Ministerio** competente en vivienda, pero **nunca por debajo del 3%** total. Mantenerlos parametrizados.
>
> El **aporte patronal del 2% no forma parte de la base de cálculo de prestaciones e indemnizaciones** (art. 33 in fine).

**Depósito y sanciones:** en la **cuenta individual** de cada trabajador administrada por BANAVIH, vía portal **FAOV en Línea**. Afiliación del patrono dentro de **30 días hábiles** de constituida la empresa. Mora → intereses de pleno derecho de **1,2 veces la tasa activa bancaria** del BCV (art. 93). Multa por aporte no enterado: hasta **20 veces el tipo de cambio de la moneda de mayor valor publicada por el BCV** (art. 98.4) — la reforma de 2024 **eliminó la Unidad Tributaria** como unidad de cuenta sancionatoria.

> **[VERIFICAR]** la anulación automática de la planilla vencidos los 5 días hábiles: circula en prensa (julio 2025) pero **no está confirmada en comunicado oficial de BANAVIH**.

### 3.5 INCES — Instituto Nacional de Capacitación y Educación Socialista

⚠️ **Corrección de base normativa:** la norma vigente **no** es el art. 14 del Decreto-Ley de 2008 (derogado). Es el **Decreto-Ley del INCES N° 1.414, G.O. Ext. N° 6.155 del 19/11/2014**, Capítulo VIII, **arts. 49 a 52**.

**Aporte patronal — art. 49 (literal) [VERIFICADO]**

> "Las entidades de trabajo del sector privado y las empresas del Estado con ingresos propios y autogestionarias, **que den ocupación a cinco o más trabajadoras o trabajadores**, están en la obligación de aportar al Instituto… el **dos por ciento del salario normal mensual** pagado a los trabajadores y trabajadoras, **dentro de los cinco días siguientes al vencimiento de cada trimestre**. El hecho imponible de este aporte se generará a partir del pago del salario… **Queda prohibido el descuento de dinero a los trabajadores**…"

**Aporte del trabajador — art. 50 (literal) [VERIFICADO]**

> "Los trabajadores y trabajadoras de las entidades de trabajo que den ocupación a cinco o más trabajadores y trabajadoras, están en la obligación de aportar el **cero coma cinco por ciento de sus utilidades anuales, aguinaldos o bonificaciones de fin de año**. Las entidades de trabajo deberán **efectuar la retención** del aporte… con la indicación de la procedencia, y enterarán dicha contribución **dentro de los diez días siguientes al pago**."

| Atributo | Aporte patronal | Retención al trabajador |
|---|---|---|
| **Porcentaje** | **2,0%** | **0,5%** |
| **Base** | **Salario normal mensual** pagado en el trimestre calendario | **Utilidades anuales, aguinaldos o bonificaciones de fin de año** |
| **Contribuyente** | El patrono | **El trabajador** (el patrono es solo agente de retención) |
| **Obligados** | Entidades privadas y empresas del Estado con **5 o más trabajadores** | Trabajadores de esas mismas entidades |
| **Periodicidad** | **Trimestral** (ene-mar, abr-jun, jul-sep, oct-dic) | **Por evento de pago** |
| **Plazo** | **5 días** siguientes al vencimiento del trimestre | **10 días** siguientes al pago |
| **Artículo** | 49 | 50 |

```
Aporte patronal INCES = Σ(salario normal mensual del trimestre calendario) × 0,02
Retención trabajador  = (Utilidades + aguinaldos pagados) × 0,005
```

**¿Entran las utilidades en la base del 2% patronal? NO.** Doble fundamento: (a) textual — el art. 104 LOTTT excluye las utilidades del salario normal; (b) jurisprudencial — criterio pacífico y reiterado de la SPA/TSJ (00422/2009 P&G, 00203/2010 Helmerich & Payne, 01547/2011, 00979/2014 Reyco 9000, 21/02/2018 Sun Microsystems), más Sala Constitucional N° 301 del 27/02/2007 (vinculante) y N° 499 del 30/06/2016.

> ⚠️ **Matiz crítico 2025 — SPA N° 00575 del 16/07/2025 (Blindados Centro Occidente).** Ratifica la base de salario normal **pero invierte la carga probatoria**: *"está obligado el patrono a demostrar en vía judicial que se incluyeron en el reparo pagos por conceptos que no eran ni regulares y permanentes"*. En ese fallo: **bono navideño gravable en 2013** (se pagó todos los trimestres) y no gravable en 2014; **bono vacacional excluido**; **salario de los días de vacaciones disfrutadas SÍ gravable**.
>
> **Implicación de diseño:** la exclusión de un concepto de la base INCES **no es automática por su etiqueta** — depende de la regularidad efectivamente probada. El sistema debe conservar, por concepto y por trimestre, la **evidencia de frecuencia de pago** (cuántas veces se pagó en el período), porque es lo que decide un reparo.

> **Otras reglas de diseño:**
>
> - El INCES patronal es el único parafiscal con **base acumulada trimestral**. Se necesita un acumulador `salario_normal_trimestre_calendario` que corte en marzo/junio/septiembre/diciembre, independiente de los períodos semanal/quincenal.
> - Con ~40 trabajadores la cantera **está claramente obligada** (umbral: 5 o más). Con menos de 5 igual hay que **declarar en cero**.
> - **Prohibido descontar al trabajador el 2% patronal** (art. 49 in fine). El 2% es costo puro del patrono.
> - La retención del 0,5% aparece **solo en el recibo de utilidades**, y debe enterarse en **10 días**, no esperar al cierre del trimestre. El recibo de nómina ordinaria **no debe mostrarla**.
> - La ley *"no establece una clasificación de las utilidades entre legales y convencionales"* (SPA 00575/2025) → **se retiene sobre el total pagado**, incluyendo lo que exceda el mínimo legal.
> - **Registro:** inscripción en el registro del INCES dentro de **45 días hábiles** desde la constitución (art. 51). Sanciones conforme al COT (art. 55).
> - **Portal SIGAT** (`inces.sigat.net`) sustituye las planillas bancarias. Recaudos obligatorios en PDF: **facturas del IVSS** de los meses del trimestre + **nómina en el formato oficial** descargable del sistema. El 0,5% de utilidades se declara en **planilla separada**.

> **[VERIFICAR] — dos puntos:**
> 1. **"5 días" ¿continuos o hábiles?** El art. 49 dice solo *"cinco días"*, sin "hábiles", y el comunicado oficial del INCES lo repite igual. Nótese que el art. 51 sí dice expresamente "cuarenta y cinco días **hábiles**". La lectura "5 días hábiles" que publican varios preparadores fiscales **no está respaldada por el texto**. **Recomendación conservadora: cumplir en 5 días continuos.**
> 2. Una **base imponible mínima por trabajador/mes en SIGAT** reportada por una firma en nov. 2025 **no pudo verificarse** contra Gaceta Oficial ni Providencia del INCES, y es jurídicamente cuestionable (principio de legalidad tributaria, art. 317 CRBV). **Confirmar en el portal antes de programarla como regla dura.**

### 3.6 LPPSS — Contribución especial para la Protección de las Pensiones ⚠️ OBLIGACIÓN NUEVA

**Ley de Protección de las Pensiones de Seguridad Social**, G.O. Ext. N° 6.806 del **08/05/2024**, alícuota fijada por **Decreto N° 4.952**, G.O. N° 42.880 del **16/05/2024**.

| Atributo | Valor |
|---|---|
| **Alícuota** | **9%** (la ley autoriza hasta 15%; el Ejecutivo la fijó en 9%) |
| **Base de cálculo** | **Total de los pagos hechos a los trabajadores por bonificaciones salariales Y NO SALARIALES** |
| **Base mínima** | **USD 240,00** por trabajador (convertida a Bs. a tasa BCV) — desde el ajuste de abril/mayo 2026 |
| **Sujetos obligados** | **Personas jurídicas y entidades económicas del sector privado**. Excluidas las personas naturales y el sector público |
| **Recaudador** | **SENIAT** |
| **Periodicidad** | **Mensual**, según calendario SENIAT por dígito terminal del RIF |
| **Deducibilidad** | **Sí es deducible** de la base de cálculo del ISLR |

> ⚠️ **Este es el punto de mayor riesgo de omisión en un ERP construido con conocimiento previo a 2024.** Tres razones por las que rompe los supuestos habituales:
>
> 1. **La base incluye los pagos NO salariales.** Los bonos en USD que la empresa etiqueta como no salariales para evitar incidencia en prestaciones **sí computan** para esta contribución del 9%. La estrategia de "desalarización" no reduce esta obligación.
> 2. **Hay una base mínima en USD 240** por trabajador. Aunque el trabajador gane menos, el 9% se calcula sobre USD 240 convertidos a tasa BCV. Es aquí donde el "ingreso mínimo integral" anunciado en 2026 **sí produce un efecto legal concreto y obligatorio sobre el sector privado**, aunque el anuncio en sí sea un exhorto.
> 3. Se declara ante **SENIAT**, no ante el IVSS, con calendario propio por dígito de RIF.
>
> **[VERIFICAR]** el calendario SENIAT 2026 vigente y si la base mínima de USD 240 sigue siendo la aplicable en el mes que se calcula — este valor sigue al "ingreso mínimo integral" y por tanto es volátil.

### 3.7 ISLR — retención sobre sueldos

| Atributo | Valor |
|---|---|
| **Unidad Tributaria vigente** | **Bs. 43,00** — Providencia SENIAT, **G.O. N° 43.140 del 02/06/2025** [VERIFICADO] |
| **Umbral de retención** | Enriquecimiento neto anual **> 1.000 U.T.** |
| **Instrumento** | Formulario **ARI** presentado por el trabajador |
| **Actualización del ARI** | **Trimestral** (típicamente abril, julio, octubre) o cada vez que cambie el valor de la U.T. |

```
% de retención = [ (Ingreso bruto anual estimado − desgravámenes − rebajas − 1.000 U.T.)
                   → aplicar tarifa 1 → impuesto anual estimado ]
                 / Ingreso bruto anual estimado
```

> ⚠️ **Observación aritmética (cálculo propio, no de fuente):** 1.000 U.T. × Bs. 43 = **Bs. 43.000 anuales**, es decir ~Bs. 3.583/mes. A tasas de cambio de 2026 eso equivale a pocos dólares mensuales — el umbral de exención es **nominalmente irrelevante** y prácticamente toda nómina formal lo supera, incluyendo la que solo paga cestaticket.
>
> Esto colisiona de frente con la práctica bimoneda: los bonos en USD convertidos a Bs. inflan el enriquecimiento declarable aunque se consideren no salariales a efectos laborales. **[VERIFICAR] con asesor tributario venezolano** la interacción exacta entre bonos no salariales en divisas y la base de retención ARI — no se encontró doctrina que la trate expresamente. No implementar retención automática de ISLR sin esa validación.
>
> **[VERIFICAR]** el número del Decreto 1.808 (Reglamento Parcial de la LISLR en materia de Retenciones) contra fuente primaria antes de citarlo en el sistema.

**Restricción de uso de la U.T.:** el valor de Bs. 43,00 **solo** puede usarse como unidad de medida para **tributos nacionales competencia del SENIAT**. **No** puede usarse para determinar beneficios laborales. El motor no debe usar la U.T. para ningún cálculo laboral.

### 3.8 Contribuciones anuales fuera del motor de nómina (informativo)

| Contribución | Umbral | Base | Aplica a la cantera |
|---|---|---|---|
| **Ley Orgánica de Deporte** (FONDEPORTE) | Utilidad neta anual > 20.000 U.T. | 1% de la utilidad neta contable anual | Probable — depende del resultado del ejercicio |
| **Ley Orgánica de Drogas** (FONA), art. 32 | **50 o más trabajadores** | 1% de la ganancia neta anual | **No aplica hoy** (~40 trabajadores) — **vigilar el umbral** |

> Ninguna de las dos se calcula en la nómina (son sobre resultado del ejercicio), pero el ERP debe **alertar** cuando la plantilla se acerque a 50 trabajadores, porque el FONA se activa por conteo de personal.

**Fuera del alcance de este documento pero relevante para una cantera:** las obligaciones de **LOPCYMAT / INPSASEL**, que incluyen un sistema de **clasificación de riesgos propio** (Resolución N° 689, G.O. Ext. 6.789), **distinto e independiente** de la clasificación de riesgo del IVSS. No confundir ambas clasificaciones ni reutilizar el parámetro.

---

## 4. PRESTACIONES SOCIALES — LOTTT art. 142

### 4.1 El sistema dual y por qué obliga a acumular dos series en paralelo

El art. 142 establece **dos métodos de cálculo que corren simultáneamente** y, al terminar la relación laboral, se paga **el mayor**. El sistema debe mantener ambos vivos y comparables en cualquier momento, no solo al final.

| Literal | Regla |
|---|---|
| **a)** | El patrono deposita al trabajador, por garantía de prestaciones sociales, **el equivalente a 15 días cada trimestre**, calculado **con base al último salario devengado**. El derecho se adquiere **desde el inicio del trimestre**. |
| **b)** | Adicionalmente y **después del primer año de servicio**, el patrono deposita **2 días de salario por cada año**, **acumulativos hasta 30 días** de salario. |
| **c)** | Al terminar la relación laboral por cualquier causa, las prestaciones se calculan a razón de **30 días por cada año de servicio o fracción superior a 6 meses**, calculado **al último salario**. |
| **d)** | El trabajador recibe **el monto que resulte MAYOR** entre el total de la garantía depositada (a + b) y el cálculo del literal c. |
| **e)** | Si la relación termina **antes de los primeros 3 meses**, el pago es de **5 días de salario por mes trabajado o fracción**. |
| **f)** | El pago se hace dentro de los **5 días** siguientes a la terminación. El incumplimiento genera **intereses de mora a la tasa activa** determinada por el BCV. |

### 4.2 Garantía trimestral — literal (a)

```
Depósito trimestral = 15 días × Salario integral diario del último salario devengado del trimestre
```

- **15 días por trimestre → 60 días por año.** Este es el punto clave: el método (a) acumula **60 días/año**, el doble que el método (c) que da **30 días/año**.
- Se calcula con **salario INTEGRAL** (normal + alícuota bono vacacional + alícuota utilidades).
- El derecho se adquiere **desde que se inicia el trimestre** — si el trabajador egresa a mitad de trimestre, el trimestre en curso **ya se causó**. **[VERIFICAR]** si el trimestre incompleto se deposita completo o proporcional; la lectura literal del art. 142.a ("el derecho a este depósito se adquiere desde el momento de iniciar el trimestre") favorece el depósito completo, pero la práctica varía.

> **Diseño:** el trimestre se cuenta desde la **fecha de ingreso del trabajador**, no desde el trimestre civil. Cada trabajador tiene su propio calendario de trimestres. El motor necesita un job que, al cumplirse cada trimestre de antigüedad, genere el asiento de depósito usando el salario integral vigente en ese momento.

### 4.3 Días adicionales — literal (b)

```
Días adicionales (año n) = 2 × (n − 1)   →  acumulativo, tope 30 días
```

- Se generan **después del primer año** de servicio (el año 1 no genera; el año 2 genera 2 días; el año 3, 4 días; etc.).
- El tope de 30 días se alcanza a los **16 años de servicio**; a partir de allí se siguen generando 30 días.
- **Base de cálculo:** el **salario integral PROMEDIO del año** correspondiente, conforme al **art. 71 del Reglamento de la LOT** — **no** el último salario. Criterio ratificado por la Sala de Casación Social del TSJ.
- Se **pagan anualmente**, salvo que el trabajador manifieste **por escrito** su voluntad de capitalizarlos (depositarlos con las prestaciones).

> ⚠️ **Diferencia de base entre (a) y (b):** la garantía trimestral usa el **último salario integral**; los días adicionales usan el **salario integral promedio del año**. El motor necesita **dos acumuladores distintos**: uno de último salario integral y otro de salario integral promedio anual. Confundirlos es un error de cálculo común.

### 4.4 Cálculo retroactivo — literal (c)

```
Prestaciones art. 142(c) = 30 días × Años de servicio (o fracción > 6 meses)
                              × Salario integral diario del ÚLTIMO salario
```

- La fracción **superior a 6 meses** cuenta como año completo.
- Se usa el **último salario integral** — de ahí el nombre "retroactivo": todo el historial se revalúa al salario final.

### 4.5 La comparación final — literal (d)

```
Prestaciones a pagar = MAX( Σ garantía trimestral (a) + Σ días adicionales (b),
                            cálculo retroactivo (c) )
```

**Cuál gana, en la práctica:**

| Escenario | Método que suele ganar | Por qué |
|---|---|---|
| Salario relativamente estable en términos reales | **(a)+(b)** | Acumula 60 días/año vs. 30 días/año |
| Salario final mucho mayor que el histórico (alta inflación en Bs., ascensos) | **(c)** | Revalúa todo el historial al salario final |
| **Salario denominado en divisas** | **(a)+(b)** | El TSJ lo señaló expresamente — ver abajo |

**Sentencia SCS N° 306 del 26/07/2024** (ponencia conjunta): cuando el salario se paga en divisas, **conviene el sistema del art. 142 literales (a) y (b)** frente al literal (c), por resultar más favorable al trabajador. Esto es directamente relevante para una nómina bimoneda.

> **Diseño:** el motor **no puede** elegir un método y descartar el otro. Debe mantener el saldo acumulado de (a)+(b) **y** poder recalcular (c) en cualquier fecha de corte, exponiendo ambos en el reporte de pasivo laboral. La provisión contable debe hacerse por **el mayor de los dos**, recalculado al cierre de cada período.

### 4.6 Terminación antes de 3 meses — literal (e)

```
Pago = 5 días de salario × Meses trabajados (o fracción)
```

Relevante en una cantera con rotación de personal de obra.

### 4.7 Intereses sobre prestaciones — LOTTT art. 143

Los depósitos se hacen en **fideicomiso individual** o en el **Fondo Nacional de Prestaciones Sociales**, a voluntad del trabajador.

| Dónde está depositado | Tasa de interés aplicable |
|---|---|
| Fideicomiso o Fondo Nacional de Prestaciones Sociales | **El rendimiento que produzcan esos instrumentos** |
| Acreditado en la **contabilidad de la empresa**, con autorización escrita del trabajador | **Tasa PASIVA** determinada por el BCV |
| **El patrono NO hizo el depósito** (incumplimiento) | **Tasa ACTIVA** determinada por el BCV, promedio de los 6 principales bancos |

- Los intereses se **calculan mensualmente** sobre el saldo acumulado.
- Se **pagan anualmente** al cumplir cada año de servicio, **salvo que el trabajador solicite por escrito su capitalización**.

> **Diseño:** `tasa_pasiva_bcv` y `tasa_activa_bcv` son **parámetros mensuales** que hay que cargar del BCV. El motor debe:
> 1. Almacenar la **modalidad de depósito** por trabajador (fideicomiso / FNPS / contabilidad de la empresa) y la autorización escrita correspondiente.
> 2. Calcular intereses **mensualmente** sobre el saldo, con la tasa que corresponda a la modalidad.
> 3. Aplicar **automáticamente la tasa activa (más alta) como penalización** si detecta que un depósito trimestral venció sin ejecutarse. Esto convierte el sistema en un control interno, no solo en una calculadora.
> 4. Manejar el flag `capitaliza_intereses` (requiere solicitud escrita) para decidir entre pagar o acumular.

### 4.8 Qué debe acumularse periódicamente — resumen para el modelo de datos

| Acumulador | Frecuencia de actualización | Usado por |
|---|---|---|
| `salario_normal_mensual` | Mensual (por mes calendario) | Base IVSS, RPE, ISLR (art. 107) |
| `salario_normal_trimestre_civil` | Trimestral | Aporte INCES patronal |
| `salario_integral_diario_actual` | Cada cambio de salario | Garantía trimestral (142.a), FAOV, cálculo (142.c) |
| `salario_integral_promedio_anual` | Mensual, promediado por año de servicio | Días adicionales (142.b) |
| `saldo_garantia_prestaciones` | Trimestral (por aniversario del trabajador) | Comparación 142.d, anticipos |
| `saldo_dias_adicionales` | Anual | Comparación 142.d |
| `intereses_prestaciones_acumulados` | **Mensual** | Pago anual o capitalización |
| `dias_vacaciones_causados` / `disfrutados` | Anual | Vacaciones, liquidación |
| `dias_bono_vacacional_causados` | Anual | Provisión, alícuota |
| `utilidades_causadas` | Mensual (prorrateo) | Provisión, alícuota |
| `horas_extra_semana` / `horas_extra_año` | Por período | Control de topes art. 178 |
| `semanas_cotizadas_ivss` | Semanal | Reporte IVSS |
| `descanso_compensatorio_pendiente` | Por evento | Art. 188 |
| `anticipos_prestaciones_otorgados` | Por evento | Control del tope del 75% |
| `saldo_prestamos_trabajador` | Por evento | Control del tope de 1/3 (art. 154) |

---

## 5. ANTICIPOS DE PRESTACIONES Y PRÉSTAMOS AL TRABAJADOR

### 5.1 Anticipo de prestaciones sociales — LOTTT art. 144

El trabajador tiene derecho a solicitar un anticipo de **hasta el 75%** de lo depositado como garantía de sus prestaciones sociales, para atender obligaciones derivadas de:

| Causal | Descripción |
|---|---|
| **a)** | Construcción, adquisición, mejora o reparación de vivienda para el trabajador y su familia |
| **b)** | Liberación de hipoteca o de cualquier otro gravamen sobre vivienda de su propiedad |
| **c)** | Inversión en educación para el trabajador o su familia |
| **d)** | Gastos por atención médica y hospitalaria del trabajador o su familia |

Si las prestaciones están acreditadas en la contabilidad de la empresa, el patrono debe **otorgar al trabajador crédito o aval** hasta el saldo a su favor. Si opta por el aval, **la diferencia de intereses que perjudique al trabajador es responsabilidad del patrono**.

> **Diseño:**
> - `anticipo_max = 0,75 × saldo_garantia_prestaciones` — validación bloqueante en el flujo de solicitud.
> - Registrar la **causal** (a/b/c/d) y exigir soporte documental; es un requisito legal, no administrativo.
> - El anticipo **reduce el saldo de la garantía** pero **no reduce la antigüedad**: al liquidar, se calcula el total y se **deducen los anticipos ya pagados**. Modelar como `deduccion_liquidacion`, no como reducción de la base de cálculo.
> - Los anticipos deben aparecer en la liquidación final como partida deducible claramente identificada.

### 5.2 Préstamos al trabajador — LOTTT arts. 152–155

**Inembargabilidad (art. 152):** el salario, las prestaciones sociales y las indemnizaciones son **inembargables**, salvo para garantizar pensiones alimentarias decretadas por tribunal con competencia en protección de niños, niñas y adolescentes.

**Excepción (art. 153):** lo anterior no impide la ejecución de medidas por obligaciones de carácter familiar y manutención, ni de **las originadas por préstamos o garantías otorgadas conforme a esta Ley**.

**Límite de amortización (art. 154) [VERIFICADO]**

> "Mientras dure la relación de trabajo, las deudas que los trabajadores y las trabajadoras contraigan con el patrono o patrona **sólo serán amortizables, semanal o mensualmente, por cantidades que no podrán exceder de la tercera parte del equivalente a una semana de trabajo o a un mes de trabajo**, según el caso."

```
Descuento máximo por período = (1/3) × salario del período de pago
```

- Nómina **semanal** → máximo 1/3 de una semana de salario por semana.
- Nómina **quincenal/mensual** → máximo 1/3 del período correspondiente.

**Al terminar la relación laboral:** el patrono puede compensar el saldo pendiente contra los créditos del trabajador **hasta un máximo del 50%** de los montos de liquidación (prestaciones, vacaciones, utilidades). El remanente impago se persigue por vía civil o se condona. **[VERIFICAR]** el fundamento normativo exacto de ese 50% con asesor laboral — la fuente consultada es doctrina de firma, no texto legal citado.

> **Diseño:**
> - `descuento_prestamo_periodo = MIN(cuota_pactada, salario_periodo / 3)`. Si la cuota pactada excede el tope, el motor debe **reprogramar automáticamente** el plan de pagos, no truncar silenciosamente.
> - El tope de 1/3 aplica al **conjunto de deudas con el patrono**, no préstamo por préstamo. Necesita un cálculo agregado.
> - Otorgar préstamos **no es obligatorio**; es una política discrecional del empleador. Modelar `politica_prestamos` a nivel de empresa (monto máximo, plazo máximo, causales, tasa).
> - Documentar por escrito la autorización de descuento. Aunque la fuente consultada no lo señala como requisito legal expreso, es la práctica prudente y respalda el descuento ante una inspección.

---

## 6. LA REALIDAD BIMONEDA

Esta sección distingue de forma explícita **obligación legal** de **práctica de mercado**, porque el motor debe modelar ambas y el riesgo está en confundirlas.

### 6.1 Lo que la empresa privada está LEGALMENTE obligada a pagar (julio 2026)

| Obligación | Monto | Incidencia salarial | Fuente |
|---|---|---|---|
| **Salario mínimo nacional** | **Bs. 130,00/mes** | **SÍ, plena** | Decreto 4.653, G.O. Ext. 6.691, 15/03/2022 |
| **Cestaticket** | **USD 40/mes** convertidos a tasa BCV del día de pago | **NO** | Decreto 4.805 + criterio TSJ (SCS 712, 19/12/2024) |
| **Base mínima LPPSS** | **USD 240** por trabajador para el 9% | n/a (es base tributaria) | LPPSS art. 7 |
| **Retención ISLR** | Según ARI, sobre renta > 1.000 U.T. | n/a | LISLR |

### 6.2 Lo que NO es obligación legal para el sector privado [PRÁCTICA]

- **Bono contra la Guerra Económica (USD 200/mes):** creado por Decreto N° 4.805 (01/05/2023, G.O. Ext. 6.746) para **trabajadores del sector público**, pagado por **Sistema Patria / veMonedero**. Naturaleza **no salarial** (LOTTT art. 105). **El sector privado no está obligado a pagarlo**, aunque muchas empresas pagan un concepto homónimo voluntariamente.
- **Bono de Responsabilidad Profesional (USD 62–129):** exclusivo del sector público (militar, seguridad, energía/petróleo, educación).
- **El "ingreso mínimo integral indexado de USD 240"** anunciado el **30/04/2026**: **NO se publicó decreto en Gaceta Oficial**. Es un **exhorto al sector privado, no un mandato**. El salario mínimo base **no cambió** (sigue en Bs. 130). El aumento se canalizó íntegramente por bonificaciones **sin incidencia salarial** — no impacta vacaciones, utilidades ni prestaciones sociales.

  > **Salvedad importante:** su único efecto jurídico vinculante sobre el privado es servir de **base mínima de cálculo del aporte del 9% de la LPPSS** (§3.6). Y hay un precedente inquietante: el cestaticket de USD 40 **tampoco** está en Gaceta Oficial con esa cifra, y el TSJ igualmente lo declaró exigible tratándolo como "hecho público y comunicacional". **No dar por sentado que lo no publicado no será exigido.**

### 6.3 Estructura típica de la nómina privada [PRÁCTICA]

```
┌─ Salario base en Bs.  ────── mínimo legal o poco más ── incidencia salarial PLENA
├─ Cestaticket USD 40 ──────── indexado a tasa BCV ────── obligación legal, SIN incidencia
└─ Bonos complementarios ───── en USD o indexados ─────── voluntarios, etiquetados no salariales
   (el grueso de la remuneración real)
```

El sector privado ya pagaba entre **USD 180 y USD 250/mes** de ingreso total antes del anuncio de abril 2026 — es decir, el "aumento" a USD 240 fue en buena medida **convalidación de lo que el mercado ya pagaba**.

### 6.4 Marco legal de la moneda extranjera — art. 128 del Decreto Ley del BCV

> "Los pagos estipulados en monedas extranjeras se cancelan, **salvo convención especial**, con la entrega de lo equivalente en moneda de curso legal, **al tipo de cambio corriente en el lugar de la fecha de pago**."

**Distinción operativa crítica:**

| Concepto | Significado | Efecto |
|---|---|---|
| **Moneda de cuenta** | La divisa solo denomina la obligación | Se paga válidamente en Bs. a tasa BCV del día de pago |
| **Moneda de pago** | La divisa es el medio de cumplimiento | Debe entregarse la divisa; requiere **convención especial** |

**Sentencia SCS N° 84 del 08/07/2022** (caso *Dragados S.A.*): la "convención especial" **no se presume**; debe ser **pacto expreso y escrito**. El solo hecho de haber pagado en divisas **no prueba** la existencia de tal obligación.

> **Diseño:** cada concepto en divisas necesita el flag `rol_moneda ∈ {CUENTA, PAGO}` y, si es PAGO, referencia al documento contractual que lo sustenta. El default debe ser **CUENTA** (pago liberatorio en Bs.), que es el régimen supletorio legal.

### 6.5 Jurisprudencia sobre bonos en divisas — hay DOS líneas en tensión

**Línea A — los bonos en divisas NO son salario (criterio dominante y reciente):**

| Sentencia | Fecha | Criterio |
|---|---|---|
| **SCS N° 523**, exp. 24-058 | **13/11/2025** | Bonos pagados **regularmente** en moneda extranjera **no forman parte del salario**: tienen "carácter social y no remunerativo" (art. 105 LOTTT). No inciden en prestaciones, utilidades ni vacaciones. |
| **SCS N° 218** (*DISVEN 2022, C.A.*) | **26/06/2025** | Bono "contra la guerra económica" creado **unilateralmente por empresa privada** = beneficio social no remunerativo, por su finalidad teleológica (cubrir necesidades alimentarias). |
| SCS N° 1.356 (*Palazzolo vs. Banco Provincial*) | 19/06/2007 | Bonos sin intención retributiva no son salario. |
| SCS N° 489 (*Briceño vs. Banco Mercantil*) | 30/07/2003 | Subsidios de asistencia familiar no son salario. |

**Línea B — bonos etiquetados "no salariales" que SÍ son salario (riesgo vivo):**

| Sentencia | Fecha | Criterio |
|---|---|---|
| **SCS N° 21** (*Analistas e Inspecciones Venezolanos de Petróleo C.A.*) | **09/03/2022** | Pagos etiquetados "bono no salarial" **adquieren carácter salarial** cuando: (a) se depositan regularmente **en la cuenta nómina**, (b) se vinculan directamente a la prestación del servicio, (c) son constantes y periódicos. |
| SCS N° 1.633 (*Álvarez vs. Abbott Laboratories*) | 14/12/2004 | Bonos por desempeño **individual** tienen carácter salarial. |
| SCS N° 0970 (*De Oliveira vs. Logística de Venezuela*) | 05/08/2011 | Bonos anuales por desempeño son salario. |

**Criterio diferenciador que emerge:**

| Tiende a SER salario | Tiende a NO ser salario |
|---|---|
| Individual | Colectivo / general |
| Retributivo del servicio prestado | Finalidad social o asistencial |
| Enriquece el patrimonio sin restricción de uso | Destinado a cubrir necesidades alimentarias o específicas |
| Ligado a desempeño o metas individuales | Desvinculado del rendimiento |
| Depositado en la cuenta nómina | Pagado por vía separada y documentada |

### 6.6 Riesgos concretos para el empleador y qué debe soportar el sistema

1. **La carga de la prueba del carácter NO salarial recae en el empleador.** Si no lo documenta, se expone a reclamos por diferencias en prestaciones, vacaciones y utilidades — **retroactivos**.
2. **Las adendas firmadas DESPUÉS de un reclamo laboral carecen de valor probatorio.** Formalizar **antes** de implementar el esquema.
3. **Depositar en la cuenta nómina** es el indicio más citado por el TSJ para recalificar un bono como salario.
4. **La jurisprudencia tiene dos líneas en tensión.** La reciente favorece al empleador, pero puede virar, y los reclamos son retroactivos por toda la relación laboral.

> **Requisitos funcionales que se derivan:**
>
> - El recibo debe **discriminar claramente** el bono del salario base (§7).
> - Cada concepto no salarial debe tener campos de **finalidad documentada** y **referencia al soporte contractual**.
> - El sistema debe permitir **simular el pasivo laboral bajo el escenario adverso**: recalcular prestaciones, vacaciones y utilidades **como si** todos los bonos fueran salariales. Ese delta es la **contingencia laboral** de la empresa y debería ser un reporte de primera clase, no un ejercicio manual.
> - Guardar la **tasa BCV efectivamente usada** en cada línea de nómina, con su fecha. Sin esto no se puede reconstruir ni defender un cálculo histórico.

### 6.7 Registro contable y fiscal

- **Conversión:** a Bs. usando la tasa BCV vigente a la fecha en que **se devenga** la transacción. La práctica de nómina es usar la tasa BCV de la **fecha de pago** para bonos indexados.
- **ISLR:** los pagos en divisas se incorporan al cálculo en su equivalente en Bs. El **diferencial cambiario afecta directamente la base imponible del ISLR**.
- **LPPSS:** recordar que la contribución del 9% **incluye los bonos no salariales** en su base.
- **IGTF (Impuesto a las Grandes Transacciones Financieras):** alícuota del **3%** sobre pagos en moneda distinta a la de curso legal. **[VERIFICAR] — no se encontró fuente que trate expresamente si el pago de nómina o bonos en USD en efectivo a trabajadores constituye hecho imponible.** Las fuentes consultadas se centran en transacciones comerciales y en la condición de **Sujeto Pasivo Especial** del receptor. Dado que el efecto sería del 3% sobre toda la porción en divisas de la nómina, **este punto debe resolverse con asesor tributario antes de diseñar el flujo de pago en efectivo**. La mitigación habitual es pagar en Bs. a tasa BCV, que no genera IGTF.

> **Diseño mínimo para bimoneda:**
>
> - Toda línea de nómina almacena: `monto_moneda_origen`, `moneda_origen`, `tasa_bcv`, `fecha_tasa`, `monto_bs`.
> - Los parámetros indexados se definen en su **moneda de origen** (ej. cestaticket = USD 40) y se convierten en tiempo de cálculo.
> - Tabla `tasa_cambio_bcv` con carga diaria e histórico completo. **Nunca** recalcular un período cerrado con la tasa de hoy.

---

## 7. RECIBO DE PAGO — LOTTT art. 106

**Texto [VERIFICADO]:**

> "El patrono o patrona otorgará un recibo de pago a los trabajadores y trabajadoras, **cada vez que pague las remuneraciones y beneficios**, indicando el **monto del salario** y, **detalladamente**, lo correspondiente a comisiones, primas, gratificaciones, participación en los beneficios o utilidades, bonificación de fin de año, sobresueldos, bono vacacional, recargos por días feriados, horas extraordinarias, trabajo nocturno y demás conceptos salariales, **así como las deducciones correspondientes**.
>
> El **incumplimiento de esta obligación hará presumir, salvo prueba en contrario, el salario alegado por el trabajador o trabajadora**, sin menoscabo de las sanciones establecidas en esta Ley."

### 7.1 Consecuencia jurídica — por qué esto no es un requisito cosmético

La sanción del art. 106 es una **inversión de la carga de la prueba**: si no hay recibo, en un juicio laboral **se presume cierto el salario que alegue el trabajador**. El recibo es la principal prueba documental del empleador. Un recibo incompleto o mal discriminado es un pasivo, no un trámite.

### 7.2 Checklist obligatorio del recibo

**Encabezado / identificación:**

- [ ] Identificación del patrono (razón social, RIF)
- [ ] Identificación del trabajador (nombre, C.I., cargo)
- [ ] Período de pago (fecha desde–hasta) y fecha de pago
- [ ] Frecuencia de nómina (semanal / quincenal)

**Asignaciones (detalladas, art. 106):**

- [ ] **Monto del salario** (básico del período)
- [ ] Días de descanso y feriados **no** trabajados (solo si el salario no es mensual — art. 119)
- [ ] Comisiones
- [ ] Primas
- [ ] Gratificaciones
- [ ] Sobresueldos
- [ ] **Recargo por horas extraordinarias** (con cantidad de horas y tarifa)
- [ ] **Recargo por trabajo nocturno** (bono nocturno)
- [ ] **Recargo por días feriados / descanso trabajado**
- [ ] Bono vacacional (cuando aplique)
- [ ] Participación en beneficios / utilidades / bonificación de fin de año (cuando aplique)
- [ ] Demás conceptos salariales

**Conceptos no salariales (separados y claramente rotulados):**

- [ ] **Cestaticket / beneficio de alimentación** — rotulado como no salarial
- [ ] Bonos no salariales en divisas — **con su denominación, finalidad y tasa BCV aplicada**

**Deducciones:**

- [ ] IVSS (4%)
- [ ] RPE / paro forzoso (0,5%)
- [ ] FAOV (1%)
- [ ] INCES (0,5%) — **solo en el recibo de utilidades**
- [ ] Retención ISLR (si aplica)
- [ ] Anticipos de prestaciones
- [ ] Cuotas de préstamos
- [ ] Otras deducciones autorizadas

**Totales y anexos recomendados (no exigidos por el art. 106, pero de alto valor probatorio y de gestión):**

- [ ] Total asignaciones / Total deducciones / **Neto a pagar**
- [ ] Salario normal y salario integral diario del período
- [ ] Tasa BCV utilizada y fecha
- [ ] Saldo de garantía de prestaciones e intereses acumulados
- [ ] Días de vacaciones causados y disfrutados
- [ ] Saldo de descansos compensatorios pendientes
- [ ] Saldo de préstamos

> **Diseño:** el art. 106 exige detalle **"cada vez que pague las remuneraciones y beneficios"** — es decir, también para pagos extraordinarios (utilidades, vacaciones, liquidación), no solo para la nómina ordinaria. El sistema debe generar recibo para **todo** evento de pago. Conservar los recibos firmados o con acuse electrónico; sin acuse, el valor probatorio se debilita. **Art. 232 (control de pagos)** obliga además a llevar registro de pagos — **[VERIFICAR]** su alcance exacto antes de diseñar el módulo de archivo.

---

## 8. TABLA DE PARÁMETROS CONFIGURABLES

> **Ninguno de estos valores debe estar hardcodeado.** Todos requieren `vigencia_desde` / `vigencia_hasta` y resolución por fecha del período calculado.

### 8.1 Parámetros monetarios — ALTA VOLATILIDAD

| Parámetro | Valor actual | Moneda | Vigencia desde | Fuente | Cómo se actualiza |
|---|---|---|---|---|---|
| `salario_minimo_nacional` | **130,00** | Bs./mes | **15/03/2022** | Decreto 4.653, G.O. Ext. 6.691 | Decreto en Gaceta Oficial. Sin cambios desde 2022 |
| `cestaticket_mensual` | **40,00** | USD indexado | Anuncio 2024–2026; último decreto con monto: 4.805 (01/05/2023, Bs. 1.000) | Decreto 4.805 + SCS N° 712 (19/12/2024) | Anuncio del Ejecutivo; exigible por criterio TSJ pese a falta de publicación. **Revisar mensualmente** |
| `base_minima_lppss` | **240,00** | USD | ~30/04/2026 | LPPSS art. 7 + anuncio del ingreso mínimo integral | Sigue al "ingreso mínimo integral". **Revisar mensualmente** |
| `tasa_bcv_usd` | *diaria* | Bs./USD | Diaria | BCV | **Carga diaria automatizada.** Histórico completo obligatorio |
| `unidad_tributaria` | **43,00** | Bs. | **02/06/2025** | Providencia SENIAT, G.O. N° 43.140 | Providencia SENIAT. Solo para tributos nacionales, **nunca para cálculos laborales** |
| `tasa_pasiva_bcv` | *mensual* | % | Mensual | BCV | Carga mensual. Intereses de prestaciones acreditadas en la empresa |
| `tasa_activa_bcv` | *mensual* | % | Mensual | BCV (promedio 6 principales bancos) | Carga mensual. Intereses por falta de depósito y mora del art. 142.f |
| `bono_guerra_economica` | **200,00** [PRÁCTICA] | USD | 30/04/2026 | Decreto 4.805 (sector público) | **No obligatorio para el privado.** Si la empresa lo replica, es política interna |

### 8.2 Parámetros de contribuciones — BAJA VOLATILIDAD

| Parámetro | Valor actual | Vigencia | Fuente |
|---|---|---|---|
| `ivss_patronal_riesgo_minimo` | 9,00% | 30/04/2012 | **Reglamento General LSS art. 109** |
| `ivss_patronal_riesgo_medio` | 10,00% | 30/04/2012 | Reglamento General LSS art. 109 |
| `ivss_patronal_riesgo_maximo` | 11,00% | 30/04/2012 | Reglamento General LSS art. 109 |
| `ivss_trabajador` | 4,00% | 30/04/2012 | Reglamento General LSS art. 109; LSS art. 66 |
| `ivss_tope_salarios_minimos` | 5 | 30/04/2012 | **Reglamento General LSS art. 98** |
| `ivss_clase_riesgo_cantera` | **máximo (11%)** | 30/04/2012 | **Reglamento General LSS art. 192** — "Canteras, trituración de piedra y saque de tierra" |
| `rpe_total` | 2,50% | 27/09/2005 | LRPE art. 46, G.O. 38.281 |
| `rpe_proporcion_patrono` | 80% (→ 2,00%) | 27/09/2005 | LRPE art. 46 |
| `rpe_proporcion_trabajador` | 20% (→ 0,50%) | 27/09/2005 | LRPE art. 46 |
| `rpe_piso_salarios_minimos` | 1 | 27/09/2005 | LRPE art. 46 |
| `rpe_tope_salarios_minimos` | 10 | 27/09/2005 | LRPE art. 46 |
| `faov_total` | 3,00% | **01/05/2024** | **LRPVH art. 33.1**, G.O. Ext. 6.805 |
| `faov_proporcion_patrono` | 2/3 (→ 2,00%) | 01/05/2024 | LRPVH art. 33.1 |
| `faov_proporcion_trabajador` | 1/3 (→ 1,00%) | 01/05/2024 | LRPVH art. 33.1 |
| `faov_tope` | **ninguno** (solo piso = 1 SM) | 31/07/2008 | **LOSSS art. 116** |
| `inces_patronal` | 2,00% | **19/11/2014** | **Decreto-Ley INCES art. 49**, G.O. Ext. 6.155 |
| `inces_trabajador` | 0,50% | 19/11/2014 | **Decreto-Ley INCES art. 50** |
| `inces_umbral_trabajadores` | 5 | 19/11/2014 | Decreto-Ley INCES arts. 49 y 50 |
| `lppss_alicuota` | **9,00%** | **16/05/2024** | Decreto 4.952, G.O. 42.880 (ley permite hasta 15%) |
| `islr_umbral_ut` | 1.000 U.T. | Vigente | LISLR |

### 8.3 Parámetros laborales — ESTRUCTURALES

| Parámetro | Valor | Fuente |
|---|---|---|
| `jornada_diurna_horas_dia` / `_semana` | 8 / 40 | LOTTT art. 173.1 |
| `jornada_nocturna_horas_dia` / `_semana` | 7 / 35 | LOTTT art. 173.2 |
| `jornada_mixta_horas_dia` / `_semana` | 7,5 / 37,5 | LOTTT art. 173.3 |
| `horario_diurno` | 05:00 – 19:00 | LOTTT art. 173.1 |
| `horario_nocturno` | 19:00 – 05:00 | LOTTT art. 173.2 |
| `umbral_nocturno_convierte_mixta` | 4 horas | LOTTT art. 173.3 |
| `dias_descanso_semanal` | 2 continuos | LOTTT art. 173 |
| `recargo_hora_extra` | 50% (**100%** si no autorizada) | LOTTT arts. 118 y 182 |
| `recargo_bono_nocturno` | 30% | LOTTT art. 117 |
| `recargo_feriado_descanso_trabajado` | 50% | LOTTT art. 120 |
| `max_horas_efectivas_dia` | 10 | LOTTT art. 178.a |
| `max_horas_extra_semana` | 10 | LOTTT art. 178.b |
| `max_horas_extra_anio` | 100 | LOTTT art. 178.c |
| `umbral_horas_descanso_compensatorio` | 4 horas | LOTTT art. 188 |
| `vacaciones_dias_base` / `_adicional_max` | 15 / 15 hábiles | LOTTT art. 190 |
| `bono_vacacional_dias_base` / `_tope_total` | 15 / 30 | LOTTT art. 192 |
| `utilidades_dias_minimo` / `_maximo` | 30 / 120 (4 meses) | LOTTT art. 131 |
| `utilidades_porcentaje_beneficios` | 15% | LOTTT art. 131 |
| `prestaciones_dias_por_trimestre` | 15 | LOTTT art. 142.a |
| `prestaciones_dias_adicionales_por_anio` | 2 | LOTTT art. 142.b |
| `prestaciones_dias_adicionales_tope` | 30 | LOTTT art. 142.b |
| `prestaciones_dias_retroactivo_por_anio` | 30 | LOTTT art. 142.c |
| `prestaciones_dias_por_mes_menor_3m` | 5 | LOTTT art. 142.e |
| `anticipo_prestaciones_max` | 75% | LOTTT art. 144 |
| `descuento_prestamo_max_periodo` | 1/3 | LOTTT art. 154 |
| `dias_base_alicuotas` | 360 | Convención de mercado |
| `cestaticket_divisor` | 30 días calendario | Ley Cestaticket |

### 8.4 Parámetros de empresa (a definir con el cliente)

| Parámetro | Valor a definir | Nota |
|---|---|---|
| `clase_riesgo_ivss` | **Máximo → 11%** (norma expresa: Regl. LSS art. 192 nombra "Canteras, trituración de piedra y saque de tierra") | **[VERIFICAR]** la clase efectivamente asignada en la Forma 14-01 / expediente IVSS de la empresa |
| `dias_utilidades_empresa` | ≥ 30 | Política de la empresa o convención colectiva |
| `modalidad_deposito_prestaciones` | Fideicomiso / FNPS / contabilidad de la empresa | Por trabajador, con autorización escrita |
| `modo_concurrencia_recargos` | SUMA o COMPUESTO | **[VERIFICAR]** con asesor laboral |
| `convencion_colectiva_vigente` | — | Puede mejorar cualquier mínimo legal |

---

## 9. TABLA DE CONCEPTOS DE NÓMINA

**Leyenda de tipo:** `ASIG` = asignación · `DED` = deducción al trabajador · `APOR` = aporte patronal · `PROV` = provisión
**SN** = incide en salario normal · **SI** = incide en salario integral

### 9.1 Catálogo de conceptos

| Código | Nombre | Tipo | Base de cálculo | Fórmula | SN | SI | Base legal |
|---|---|---|---|---|:--:|:--:|---|
| `SAL-BAS` | Salario básico | ASIG | Salario pactado | `salario_periodo` según `base_estipulacion` | ✅ | ✅ | LOTTT 104 |
| `DESC-SEM` | Día de descanso semanal no trabajado | ASIG | Promedio salario normal de días trabajados del período | `prom_diario × n_dias_descanso` — **solo si salario NO es mensual** | ✅ | ✅ | LOTTT 119 |
| `FER-NT` | Feriado no trabajado | ASIG | Promedio salario normal del período | `prom_diario × n_feriados` — **solo si salario NO es mensual** | ✅ | ✅ | LOTTT 119 |
| `HE-DIU` | Hora extra diurna | ASIG | Salario normal de la jornada | `horas × valor_hora × 1,50` | ✅ | ✅ | LOTTT 118 |
| `HE-DIU-NA` | Hora extra diurna no autorizada | ASIG | Salario normal de la jornada | `horas × valor_hora × 2,00` | ✅ | ✅ | LOTTT 118 + 182 |
| `HE-NOC` | Hora extra nocturna | ASIG | Salario normal de la jornada | `horas × valor_hora × f(recargos)` — ver §2.2 **[VERIFICAR]** | ✅ | ✅ | LOTTT 117 + 118 |
| `BON-NOC` | Bono nocturno | ASIG | Salario normal de la jornada | `horas_noct × valor_hora × 0,30`; si mixta con >4 h noct → todas las horas | ✅ | ✅ | LOTTT 117, 173.3 |
| `FER-TRAB` | Feriado trabajado (recargo) | ASIG | Salario normal diario | `salario_normal_diario × 0,50` (adicional al día ya devengado) | ✅ | ✅ | LOTTT 120 |
| `DESC-TRAB` | Día de descanso trabajado (recargo) | ASIG | Salario normal diario | `salario_normal_diario × 0,50` + genera compensatorio | ✅ | ✅ | LOTTT 120, 188 |
| `COMIS` | Comisiones | ASIG | Según política | Variable | ✅ | ✅ | LOTTT 104 |
| `PRIMA` | Primas (antigüedad, profesionalización, etc.) | ASIG | Según política | Variable | ✅ | ✅ | LOTTT 104 |
| `VAC-SAL` | Salario de vacaciones | ASIG | Salario normal del mes anterior (o prom. 3 meses si variable) | `salario_normal_diario × dias_habiles_disfrute` | ✅ | ✅ | LOTTT 121, 190 |
| `BON-VAC` | Bono vacacional | ASIG | Salario normal del mes anterior | `salario_normal_diario × min(15 + (n−1), 30)` | ✅ | ✅ | LOTTT 192 |
| `UTIL` | Utilidades / bonificación de fin de año | ASIG | Salario base promedio del ejercicio | `salario × dias_utilidades × (meses_completos/12)` | ✅ | ✅ | LOTTT 131, 132 |
| `CESTA` | Cestaticket / beneficio de alimentación | ASIG | Monto mensual vigente | `(monto_mensual/30) × dias_periodo − faltas_injustificadas` | ❌ | ❌ | LOTTT 105.2; Ley Cestaticket |
| `BON-USD` | Bono complementario en divisas | ASIG | Política de empresa | `monto_usd × tasa_bcv_fecha_pago` | ⚠️ | ⚠️ | LOTTT 105 — **ver §6.5** |
| `BON-GUE` | Bono contra la guerra económica | ASIG | Política de empresa [PRÁCTICA] | `monto_usd × tasa_bcv` | ❌* | ❌* | LOTTT 105; SCS 218/2025 |
| `DED-IVSS` | Retención IVSS | DED | `MIN(salario_normal_mensual, 5×SM)`, base semanal | `base_semanal × 0,04 × n_lunes_del_mes` | — | — | LSS |
| `DED-RPE` | Retención RPE (paro forzoso) | DED | `CLAMP(sal_normal_mes_ant, 1×SM, 10×SM)` | `base × 0,005` | — | — | LRPE 46 |
| `DED-FAOV` | Retención FAOV | DED | **Salario INTEGRAL mensual** | `salario_integral_mensual × 0,01` | — | — | LRPVH |
| `DED-INCES` | Retención INCES | DED | **Utilidades y aguinaldos pagados** (total, sin distinguir legal/convencional) | `utilidades × 0,005` — **solo en recibo de utilidades**; enterar en 10 días | — | — | D-L INCES 50 |
| `DED-ISLR` | Retención ISLR | DED | Enriquecimiento neto estimado | `pago × %ARI` — solo si renta > 1.000 U.T. | — | — | LISLR |
| `DED-ANT` | Anticipo de prestaciones | DED | Saldo de garantía | `≤ 0,75 × saldo_garantia` | — | — | LOTTT 144 |
| `DED-PRE` | Cuota de préstamo | DED | Salario del período | `MIN(cuota, salario_periodo/3)` | — | — | LOTTT 154 |
| `APO-IVSS` | Aporte patronal IVSS | APOR | `MIN(salario_normal_mensual, 5×SM)`, base semanal | `base_semanal × 0,11` (cantera = riesgo máximo) `× n_lunes` | — | — | Regl. LSS 109 y 192 |
| `APO-RPE` | Aporte patronal RPE | APOR | `CLAMP(sal_normal_mes_ant, 1×SM, 10×SM)` | `base × 0,02` | — | — | LRPE 46 |
| `APO-FAOV` | Aporte patronal FAOV | APOR | **Salario INTEGRAL mensual** | `salario_integral_mensual × 0,02` | — | — | LRPVH |
| `APO-INCES` | Aporte patronal INCES | APOR | **Σ salario normal mensual del trimestre calendario** (sin utilidades) | `acum_trimestre × 0,02` — trimestral. **Prohibido descontarlo al trabajador** | — | — | D-L INCES 49 |
| `APO-LPPSS` | Contribución especial de pensiones | APOR | **Total pagos salariales + NO salariales**, mín. USD 240 | `MAX(total_pagos, 240×tasa_bcv) × 0,09` — mensual, SENIAT | — | — | LPPSS; Decreto 4.952 |
| `PRV-GAR` | Provisión garantía de prestaciones | PROV | Salario integral diario (último) | `15 × salario_integral_diario` por trimestre de antigüedad | — | — | LOTTT 142.a |
| `PRV-ADI` | Provisión días adicionales | PROV | **Salario integral PROMEDIO del año** | `2 × (n−1) × sal_integral_prom_anual`, tope 30 días | — | — | LOTTT 142.b; Regl. LOT 71 |
| `PRV-INT` | Provisión intereses sobre prestaciones | PROV | Saldo acumulado de prestaciones | `saldo × tasa (pasiva/activa/rendimiento)` — mensual | — | — | LOTTT 143 |
| `PRV-VAC` | Provisión vacaciones y bono vacacional | PROV | Salario normal | Prorrateo mensual de los días causados | — | — | LOTTT 190, 192 |
| `PRV-UTI` | Provisión utilidades | PROV | Salario normal | `(dias_utilidades/12) × salario_normal_diario` mensual | — | — | LOTTT 131 |

\* **Nota sobre `BON-GUE` y `BON-USD`:** la incidencia salarial está marcada como configurable (⚠️/❌*) **a propósito**. La jurisprudencia reciente sostiene que no inciden, pero existe la línea contraria (§6.5) y el art. 105 permite pactar lo contrario en convención colectiva o contrato individual. **El flag debe ser configurable por concepto y sobreescribible por contrato**, y el sistema debe poder simular el escenario adverso.

### 9.2 Orden de operaciones del motor (crítico por la regla anti-recursión del art. 104)

El salario normal **no puede calcularse de una sola pasada**, porque los recargos se calculan sobre el salario normal pero luego forman parte de él, y el art. 104 prohíbe que un concepto produzca efectos sobre sí mismo.

```
FASE 0 — Resolver parámetros
  └─ Cargar parámetros vigentes a la fecha del período (salario mínimo, tasa BCV, U.T., tasas)

FASE 1 — Salario normal BASE (sin recargos)
  ├─ SAL-BAS, COMIS, PRIMA y demás conceptos regulares y permanentes
  └─ → salario_normal_base_diario = base / días del período

FASE 2 — Recargos (calculados sobre FASE 1, nunca sobre sí mismos)
  ├─ valor_hora = salario_normal_base_diario / horas_jornada_ordinaria
  ├─ BON-NOC   ← aplicar regla del art. 173.3 antes de contar horas
  ├─ HE-DIU / HE-NOC / HE-*-NA   ← validar topes art. 178 y flag de autorización
  └─ FER-TRAB / DESC-TRAB  ← generar DESC-COMP pendiente si ≥ 4 h (art. 188)

FASE 3 — Descansos y feriados NO trabajados (art. 119)
  ├─ SI base_estipulacion == MES  → OMITIR (ya incluidos en el salario mensual)
  └─ SI NO → prom_diario = (FASE 1 + FASE 2) / días efectivamente trabajados
             DESC-SEM y FER-NT = prom_diario × n_días

FASE 4 — Salario normal del período (consolidado)
  └─ salario_normal = FASE 1 + FASE 2 + FASE 3
     → acumular en salario_normal_mensual y salario_normal_trimestre_civil

FASE 5 — Salario integral
  ├─ alicuota_bv  = (salario_normal_diario × dias_bono_vacacional) / 360
  ├─ alicuota_uti = (salario_normal_diario × dias_utilidades)      / 360
  └─ salario_integral_diario = salario_normal_diario + alicuota_bv + alicuota_uti

FASE 6 — Conceptos no salariales
  └─ CESTA, BON-USD, BON-GUE (con tasa BCV y fecha almacenadas por línea)

FASE 7 — Deducciones
  └─ DED-IVSS, DED-RPE (base mes anterior, art. 107), DED-FAOV (base integral),
     DED-ISLR, DED-ANT, DED-PRE (tope 1/3 agregado)

FASE 8 — Aportes patronales
  └─ APO-IVSS, APO-RPE, APO-FAOV, APO-INCES (trimestral), APO-LPPSS (base ampliada)

FASE 9 — Provisiones y acumuladores
  └─ PRV-GAR, PRV-ADI, PRV-INT, PRV-VAC, PRV-UTI; actualizar todos los acumuladores de §4.8

FASE 10 — Neto y recibo
  └─ neto = Σ asignaciones + Σ no salariales − Σ deducciones
     Generar recibo conforme al checklist del §7.2
```

### 9.3 Diferencias operativas entre las dos nóminas de la cantera

| Aspecto | Obreros — nómina SEMANAL | Empleados — nómina QUINCENAL |
|---|---|---|
| Días del período | 7 calendario (5 laborables + 2 descanso) | 15 calendario |
| `base_estipulacion_salario` típica | DIA o SEMANA | MES |
| `DESC-SEM` / `FER-NT` | **Se generan** como líneas separadas (art. 119) | **NO se generan** — ya incluidos en el salario mensual |
| Base del promedio del art. 119 | Días trabajados de **la semana** | n/a |
| Cestaticket | `mensual/30 × 7` | `mensual/30 × 15` |
| Base IVSS | `salario_diario × 7` | `(salario_mensual × 12)/52` |
| Retenciones mensuales (IVSS/RPE/FAOV) | **Prorratear o concentrar** — decidir política y ser consistente | Naturalmente alineadas al mes |
| Horas extras | Control semanal directo contra el tope de 10/semana | Control semanal dentro de la quincena |

> **Punto de diseño importante:** las contribuciones (IVSS, RPE, FAOV, LPPSS) son de **base y declaración MENSUAL**, pero la nómina de obreros es **semanal**. El motor debe separar el **período de pago** del **período de causación de contribuciones**. Dos opciones válidas:
>
> 1. **Retener semanalmente** un prorrateo estimado y ajustar en la última semana del mes.
> 2. **Retener en una sola semana del mes** (típicamente la última).
>
> La opción 1 es más suave para el flujo de caja del trabajador y es la práctica más común, pero exige un **asiento de ajuste mensual**. Cualquiera que se elija debe ser consistente y estar documentada, porque afecta el neto semanal visible en el recibo. **[VERIFICAR]** con el contador de la empresa cuál es la práctica que viene usando, para no alterar el neto que los obreros ya esperan.

---

## 10. MANTENIMIENTO Y VERIFICACIÓN

### 10.1 Calendario de obligaciones

| Obligación | Frecuencia | Plazo |
|---|---|---|
| IVSS — declaración y pago (TIUNA) | Mensual | Órdenes de pago emitidas por el portal en los **primeros 7 días del mes** |
| RPE — se entera con el IVSS | Mensual, meses vencidos | **Primeros 5 días hábiles** del mes (LRPE art. 47) |
| FAOV — depósito en cuentas individuales | Mensual | **Primeros 5 días hábiles** del mes (LRPVH art. 34) |
| INCES — aporte patronal 2% | **Trimestral** (calendario) | **5 días** tras cierre del trimestre (art. 49) — **[VERIFICAR]** si continuos o hábiles; asumir continuos |
| INCES — retención 0,5% al trabajador | **Por evento de pago** | **10 días** siguientes al pago de utilidades/aguinaldos (art. 50) |
| **LPPSS 9%** — declaración SENIAT | **Mensual** | Calendario SENIAT por dígito de RIF |
| ISLR — actualización del ARI | Trimestral | Abril, julio, octubre, o al cambiar la U.T. |
| Utilidades — anticipo de 30 días | Anual | **Primeros 15 días de diciembre** |
| Garantía de prestaciones — depósito | Trimestral | Por **aniversario de ingreso de cada trabajador** |
| Días adicionales + intereses | Anual | Por aniversario de ingreso |
| Liquidación por terminación | Por evento | **5 días** tras la terminación (art. 142.f) |

### 10.2 Revisión de parámetros

| Frecuencia | Qué revisar |
|---|---|
| **Diaria** | Tasa BCV |
| **Mensual** | Cestaticket, base mínima LPPSS, tasas activa/pasiva BCV, calendario SENIAT |
| **Trimestral** | Unidad Tributaria, salario mínimo, cambios en alícuotas parafiscales |
| **Anual** | Calendario de feriados del año siguiente (incluidos regionales y los hasta 3 decretados) |
| **Por evento** | Publicaciones en Gaceta Oficial; sentencias de la Sala de Casación Social sobre salario en divisas |

**Fuentes de verificación aceptables:** Gaceta Oficial; portales oficiales (SENIAT, IVSS, BANAVIH, INCES, BCV); firmas y publicaciones reconocidas (Nayma Consultores, Gálac, Moore/Grant Thornton/Baker Tilly Venezuela, Acceso a la Justicia, Banca y Negocios, Badell & Grau). **No aceptar** blogs SEO ni sitios generados automáticamente.

### 10.3 Índice consolidado de [VERIFICAR]

Puntos que **no deben implementarse sin confirmación** de un asesor laboral/contable venezolano:

| # | Punto | Sección | Impacto si se yerra |
|---|---|---|---|
| 1 | **Clase de riesgo IVSS efectivamente asignada** a la cantera. La norma (Regl. art. 192) dice riesgo máximo = 11%, pero confirmar contra la **Forma 14-01** / expediente patronal | §3.2 | 1–2% sobre toda la nómina, retroactivo |
| 1b | **Composición exacta del salario a efectos del SSO** (Regl. art. 83) respecto de horas extras y bono nocturno | §3.2 | Base del IVSS |
| 1c | **INCES: "5 días" ¿continuos o hábiles?** El texto no dice "hábiles" | §3.5 | Extemporaneidad |
| 1d | **INCES: base imponible mínima por trabajador en SIGAT** — reportada por una firma, sin respaldo en Gaceta | §3.5 | Monto del aporte |
| 1e | **BANAVIH: anulación automática de la planilla** vencidos los 5 días hábiles — solo en prensa | §3.4 | Operativa de pago |
| 2 | **Concurrencia de recargos** hora extra + bono nocturno: ¿suma o composición? | §2.2 | Diferencias en pago de horas extras nocturnas |
| 3 | **Período de promediación** del salario normal para conceptos variables | §2.1(b) | Base de casi todos los cálculos |
| 4 | **Base salarial exacta de las utilidades** (promedio del ejercicio vs. salario del mes de pago) | §2.7 | Monto de utilidades y su alícuota |
| 5 | **Trimestre incompleto** en la garantía del art. 142.a: ¿completo o proporcional? | §4.2 | Liquidaciones |
| 6 | **Tope del 50%** para compensar deudas contra la liquidación final | §5.2 | Recuperación de préstamos |
| 7 | **IGTF sobre pagos de nómina/bonos en USD en efectivo** | §6.7 | 3% sobre la porción en divisas de la nómina |
| 8 | **Interacción de bonos no salariales en divisas con la base de retención ARI del ISLR** | §3.7 | Retención de ISLR |
| 9 | **Calendarios de declaración** IVSS (TIUNA) y SENIAT vigentes 2026 | §10.1 | Multas por extemporaneidad |
| 10 | **Reglamento Parcial sobre el Tiempo de Trabajo** (Decreto 44) — articulado verificado solo en fuente secundaria | §1.2 | Reglas de descanso semanal |
| 11 | **Art. 232 LOTTT** (control de pagos) — alcance exacto | §7.2 | Módulo de archivo de recibos |
| 12 | **Decreto 1.808** (Reglamento de Retenciones de ISLR) — número no confirmado contra fuente primaria | §3.7 | Cita normativa |
| 13 | **Monto del cestaticket** convertido a Bs. — depende del anuncio vigente y la tasa; no existe decreto en Gaceta con USD 40 | §2.8, §8.1 | Monto pagado a todos los trabajadores |
| 14 | **Política de retención de contribuciones mensuales en nómina semanal** que ya usa la empresa | §9.3 | Neto semanal de los obreros |

---

## 11. Fuentes

**Textos normativos**
- LOTTT (arts. 104, 105, 106, 107, 117, 118, 119, 120, 121, 122, 131, 132, 142, 143, 144, 152–155, 173–178, 182, 184–188, 190, 192) — https://www.ley.com.ve/laboral/ y https://tugacetaoficial.com/laboral/
- Ley de Fiestas Nacionales — https://docs.venezuela.justia.com/federales/leyes/ley-de-fiestas-nacionales.pdf
- Ley del Seguro Social (G.O. 39.912, 30/04/2012) — https://pandectasdigital.blogspot.com/2017/02/ley-del-seguro-social.html
- Reglamento General de la LSS, Decreto 8.922 (G.O. 39.912) — https://oig.cepal.org/sites/default/files/2012_d8922_ven.pdf
- Ley del Régimen Prestacional de Empleo (G.O. 38.281) — https://www.mpppst.gob.ve/mpppstweb/wp-content/uploads/2014/03/LEY_DEL_REGIMEN_PRESTACIONAL_DE_EMPLEO.pdf
- LRPVH texto consolidado 2024 (G.O. Ext. 6.805) — https://tugacetaoficial.com/leyes/ley-del-regimen-prestacional-de-vivienda-y-habitat-2024/
- BANAVIH — Preguntas Frecuentes (oficial) — https://www.banavih.gob.ve/banavihweb/acerca-de/
- Decreto-Ley del INCES (G.O. Ext. 6.155) — https://www.traviesoevans.com/memos/2014-11-19-6155-inces.pdf · comunicado oficial INCES — https://www.inces.gob.ve/wp-content/uploads/2018/05/exhorto.pdf
- IVSS — Sistema TIUNA — http://autoliquidacionv2.ivss.gob.ve:28080/TiunaWeb/login.htm
- Ley del Cestaticket Socialista (Decreto 2.066) — https://www.asambleanacional.gob.ve/leyes/sancionadas/decreto-no-2066-mediante-el-cual-se-dicta-el-decreto-con-rango-valor-y-fuerza-de-ley-del-cestatike-socialista-para-los-trabajadores-y-trabajadoras
- Decreto 4.952 (alícuota 9% LPPSS) — https://tugacetaoficial.com/leyes/decreto-n-4-952-que-establece-el-nueve-por-ciento-9-para-contribucion-especial-de-la-ley-de-proteccion-de-las-pensiones-de-seguridad-social/
- Decreto 4.805 (G.O. Ext. 6.746) — https://bonus.com.ve/wp-content/uploads/2023/09/Gaceta-Oficial-6.746.pdf
- Decreto 4.653 (salario mínimo) — https://www.legis.com.ve/BancoConocimiento/N/nota-21032022n3/nota-21032022n3.asp

**Firmas contables/laborales y análisis jurídico**
- Nayma Consultores — prestaciones sociales, cestaticket, utilidades, LPPSS, ingreso mínimo integral, bonos en divisas, préstamos a trabajadores — https://naymaconsultores.com/
- Rodríguez & Asociados — Ley del Seguro Social, FAOV, INCES, FONDEPORTE — https://rodriguezc.com/
- Gálac — IGTF, INCES, LPPSS — https://galac.com/
- Acceso a la Justicia — art. 142, días adicionales, salario en divisas, U.T., cestaticket, INCES — https://accesoalajusticia.org/
- Badell & Grau — cálculo de prestaciones en Bs. y divisas — https://badellgrau.com/
- Holland & Knight — LPPSS — https://www.hklaw.com/
- Grant Thornton Venezuela — tabla de retenciones ISLR con U.T. 43 — https://www.grantthornton.com.ve/
- Moore Venezuela — compendio de normas laborales, IGTF — https://www.moore-venezuela.com/

**Jurisprudencia (TSJ – Sala de Casación Social)**
- SCS N° 306, 26/07/2024 — prestaciones con salario en divisas — https://historico.tsj.gob.ve/decisiones/scs/julio/335854-306-26724-2024-22-154.HTML
- SCS N° 523, 13/11/2025 — bonos en divisas no salariales
- SCS N° 218, 26/06/2025 — bono contra la guerra económica en empresa privada
- SCS N° 712, 19/12/2024 — cestaticket USD 40 indexado
- SCS N° 84, 08/07/2022 — convención especial para pago en divisas
- SCS N° 21, 09/03/2022 — bonos "no salariales" que sí son salario

**Jurisprudencia (TSJ – Sala Constitucional y Político-Administrativa)**
- SC N° 1771, 28/11/2011 — FAOV: salario integral, no parafiscal, imprescriptible — https://historico.tsj.gob.ve/decisiones/scon/noviembre/1771-281111-2011-11-1279.HTML
- SPA N° 00779, 03/07/2013 (Owens Illinois) — FAOV salario integral — https://historico.tsj.gob.ve/decisiones/spa/julio/00779-3713-2013-2010-1114.HTML
- SPA N° 00575, 16/07/2025 (Blindados Centro Occidente) — INCES: base salario normal e inversión de la carga probatoria — https://historico.tsj.gob.ve/decisiones/spa/julio/346193-00575-16725-2025-2025-0233.html
- SC N° 301, 27/02/2007 (vinculante) y SC N° 499, 30/06/2016 — exclusión de utilidades del salario normal

**Prensa económica (para parámetros coyunturales)**
- Banca y Negocios — https://www.bancaynegocios.com/
- Bloomberg Línea Venezuela — https://www.bloomberglinea.com/latinoamerica/venezuela/
- Efecto Cocuyo — https://efectococuyo.com/
