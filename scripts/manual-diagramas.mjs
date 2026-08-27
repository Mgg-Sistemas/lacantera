/*
  Diagramas del manual de usuario.

  Cada uno se inyecta bajo el encabezado cuyo texto coincide exactamente con la
  clave. Estan dibujados a mano en SVG y no con una libreria: son seis figuras
  que cambian una vez al año, y traerse un motor de diagramas para eso pesaria
  mas que el manual entero.

  Los colores salen de variables que define src/pages/manual.css a partir de los
  tokens del sistema, asi que el tema oscuro los voltea sin tocar este archivo.
*/

const compras = `
<figure class="diagrama">
<svg viewBox="0 0 740 620" role="img" aria-label="El documento de una compra cambia de manos cuatro veces: compras lo prepara, gerencia lo aprueba, tesorería paga y almacén recibe. Entre el pago y la recepción hay dinero fuera de la empresa.">
  <defs>
    <marker id="fc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="currentColor"/>
    </marker>
    <marker id="fc-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="var(--ambar)"/>
    </marker>
  </defs>

  <g class="carril">
    <line x1="195" y1="44" x2="195" y2="606"/>
    <line x1="370" y1="44" x2="370" y2="606"/>
    <line x1="545" y1="44" x2="545" y2="606"/>
  </g>

  <g class="carril-tit">
    <text x="107" y="28" text-anchor="middle">COMPRAS</text>
    <text x="282" y="28" text-anchor="middle">GERENCIA</text>
    <text x="457" y="28" text-anchor="middle">TESORERÍA</text>
    <text x="632" y="28" text-anchor="middle">ALMACÉN</text>
  </g>

  <g class="paso">
    <rect x="32" y="60" width="150" height="44" rx="4"/>
    <text x="107" y="87" text-anchor="middle">Pedido</text>

    <rect x="32" y="140" width="150" height="44" rx="4"/>
    <text x="107" y="167" text-anchor="middle">Confirmada</text>

    <rect x="207" y="220" width="150" height="44" rx="4"/>
    <text x="282" y="241" text-anchor="middle">Confirmar por</text>
    <text x="282" y="256" text-anchor="middle">el gerente</text>

    <rect x="32" y="300" width="150" height="44" rx="4"/>
    <text x="107" y="327" text-anchor="middle">Aprobada</text>

    <rect x="382" y="380" width="150" height="44" rx="4"/>
    <text x="457" y="407" text-anchor="middle">En tesorería</text>

    <rect x="557" y="460" width="150" height="44" rx="4" class="ojo"/>
    <text x="632" y="487" text-anchor="middle">Pagada</text>

    <rect x="557" y="540" width="150" height="44" rx="4"/>
    <text x="632" y="567" text-anchor="middle">Recibida</text>
  </g>

  <g class="hilo">
    <path d="M107,104 V140" marker-end="url(#fc)"/>
    <path d="M107,184 V202 H282 V220" marker-end="url(#fc)"/>
    <path d="M282,264 V282 H107 V300" marker-end="url(#fc)"/>
    <path d="M107,344 V362 H457 V380" marker-end="url(#fc)"/>
    <path d="M632,504 V540" marker-end="url(#fc)"/>
  </g>
  <path class="hilo-ambar" d="M457,424 V442 H632 V460" marker-end="url(#fc-a)"/>

  <g class="hilo-tit">
    <text x="117" y="126">Confirmar el pedido</text>
    <text x="195" y="197" text-anchor="middle">Proponer al gerente</text>
    <text x="195" y="277" text-anchor="middle">Aprobar la compra</text>
    <text x="282" y="357" text-anchor="middle">Enviar a tesorería</text>
    <text x="622" y="526" text-anchor="end">Recibir material</text>
  </g>
  <text class="hilo-tit ambar" x="545" y="437" text-anchor="middle">Registrar el pago</text>
  <text class="nota-ambar" x="545" y="455" text-anchor="middle">el dinero ya salió</text>
</svg>
<figcaption>Una compra no la mueve una sola persona: cambia de manos cuatro veces y cada tramo exige un rol distinto. El tramo en ámbar es el único en que la empresa ya pagó y todavía no tiene el material.</figcaption>
</figure>`

const ventas = `
<figure class="diagrama">
<svg viewBox="0 0 760 300" role="img" aria-label="Circuito de una venta: cliente, cotización opcional, nota de entrega, factura y cobro. Solo la nota de entrega descuenta material del patio.">
  <defs>
    <marker id="fv" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="currentColor"/>
    </marker>
    <marker id="fv-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="var(--regio)"/>
    </marker>
  </defs>

  <g class="paso">
    <rect x="14" y="110" width="105" height="46" rx="4"/>
    <text x="66" y="138" text-anchor="middle">Cliente</text>

    <rect x="171" y="110" width="105" height="46" rx="4"/>
    <text x="223" y="138" text-anchor="middle">Cotización</text>

    <rect x="328" y="110" width="105" height="46" rx="4" class="ojo-regio"/>
    <text x="380" y="132" text-anchor="middle">Nota de</text>
    <text x="380" y="148" text-anchor="middle">entrega</text>

    <rect x="485" y="110" width="105" height="46" rx="4"/>
    <text x="537" y="138" text-anchor="middle">Factura</text>

    <rect x="642" y="110" width="105" height="46" rx="4"/>
    <text x="694" y="138" text-anchor="middle">Cobro</text>
  </g>

  <g class="hilo">
    <path d="M119,133 H166" marker-end="url(#fv)"/>
    <path d="M276,133 H323" marker-end="url(#fv)"/>
    <path d="M433,133 H480" marker-end="url(#fv)"/>
    <path d="M590,133 H637" marker-end="url(#fv)"/>
  </g>

  <path class="hilo-punteado" d="M66,110 V64 H380 V105" marker-end="url(#fv)"/>
  <text class="hilo-tit" x="223" y="56" text-anchor="middle">se puede despachar sin cotizar</text>

  <g class="paso">
    <rect x="300" y="228" width="160" height="40" rx="4"/>
    <text x="380" y="253" text-anchor="middle">Patio de material</text>
  </g>
  <path class="hilo-regio" d="M380,228 V161" marker-end="url(#fv-r)"/>
  <text class="hilo-tit regio" x="392" y="200">descuenta el material</text>

  <text class="nota" x="223" y="180" text-anchor="middle">paso opcional</text>
</svg>
<figcaption>De los cinco pasos, solo la nota de entrega toca el patio. Ni la cotización aparta material ni la factura lo descuenta: cuando el camión sale, el material ya salió del sistema.</figcaption>
</figure>`

const nomina = `
<figure class="diagrama">
<svg viewBox="0 0 760 300" role="img" aria-label="Ciclo de una nómina: abrir período, cargar novedades, calcular y aprobar se pueden anular. Confirmar el pago no se deshace nunca.">
  <defs>
    <marker id="fn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="currentColor"/>
    </marker>
    <marker id="fn-d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="var(--alarma)"/>
    </marker>
  </defs>

  <g class="carril-tit">
    <text x="225" y="72" text-anchor="middle">RECURSOS HUMANOS</text>
    <text x="541" y="72" text-anchor="middle">GERENCIA</text>
    <text x="699" y="72" text-anchor="middle">TESORERÍA</text>
  </g>
  <path class="abrazadera" d="M10,82 V76 H440 V82"/>
  <path class="abrazadera" d="M484,82 V76 H598 V82"/>
  <path class="abrazadera" d="M642,82 V76 H756 V82"/>

  <g class="paso">
    <rect x="8" y="86" width="118" height="52" rx="4"/>
    <text x="67" y="110" text-anchor="middle">Abrir</text>
    <text x="67" y="126" text-anchor="middle">período</text>

    <rect x="166" y="86" width="118" height="52" rx="4"/>
    <text x="225" y="110" text-anchor="middle">Cargar</text>
    <text x="225" y="126" text-anchor="middle">novedades</text>

    <rect x="324" y="86" width="118" height="52" rx="4"/>
    <text x="383" y="118" text-anchor="middle">Calcular</text>

    <rect x="482" y="86" width="118" height="52" rx="4"/>
    <text x="541" y="118" text-anchor="middle">Aprobar</text>

    <rect x="640" y="86" width="118" height="52" rx="4" class="ojo-alarma"/>
    <text x="699" y="110" text-anchor="middle">Confirmar</text>
    <text x="699" y="126" text-anchor="middle">el pago</text>
  </g>

  <g class="hilo">
    <path d="M126,112 H161" marker-end="url(#fn)"/>
    <path d="M284,112 H319" marker-end="url(#fn)"/>
    <path d="M442,112 H477" marker-end="url(#fn)"/>
  </g>
  <path class="hilo-alarma" d="M600,112 H635" marker-end="url(#fn-d)"/>

  <line class="corte" x1="620" y1="60" x2="620" y2="230"/>
  <text class="nota-alarma" x="620" y="52" text-anchor="middle">punto de no retorno</text>

  <path class="hilo-punteado" d="M541,138 V196 H67 V143" marker-end="url(#fn)"/>
  <text class="hilo-tit" x="304" y="190" text-anchor="middle">Anular — se puede, mientras no se haya pagado</text>

  <text class="nota-alarma" x="699" y="160" text-anchor="middle">el dinero sale</text>
  <text class="nota-alarma" x="699" y="176" text-anchor="middle">y no se deshace</text>
</svg>
<figcaption>Los cuatro primeros pasos se pueden anular escribiendo el motivo. El quinto no: cuando tesorería confirma el pago, el saldo baja y la nómina queda cerrada. Un error detectado después solo se corrige cargando la diferencia en el período siguiente.</figcaption>
</figure>`

const inventario = `
<figure class="diagrama">
<svg viewBox="0 0 760 340" role="img" aria-label="Cinco maneras de que entre material y cinco de que salga, todas escritas en el mismo libro. La existencia se calcula sumando el libro, no se guarda como un número.">
  <defs>
    <marker id="fi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="currentColor"/>
    </marker>
  </defs>

  <rect class="libro" x="290" y="58" width="180" height="212" rx="5"/>
  <text class="libro-tit" x="380" y="150" text-anchor="middle">EL LIBRO</text>
  <text class="nota" x="380" y="174" text-anchor="middle">cada línea lleva número,</text>
  <text class="nota" x="380" y="189" text-anchor="middle">fecha, hora, quién</text>
  <text class="nota" x="380" y="204" text-anchor="middle">y por qué</text>

  <g class="col-tit">
    <text x="250" y="40" text-anchor="end">ENTRA POR</text>
    <text x="510" y="40" text-anchor="start">SALE POR</text>
  </g>

  <g class="etiqueta">
    <text x="250" y="94" text-anchor="end">Recepción de una compra</text>
    <text x="250" y="132" text-anchor="end">Carga de producción</text>
    <text x="250" y="170" text-anchor="end">Entrada de un traslado</text>
    <text x="250" y="208" text-anchor="end">Conteo: sobrante</text>
    <text x="250" y="246" text-anchor="end">Reverso de una salida</text>

    <text x="512" y="94" text-anchor="start">Salida a consumo</text>
    <text x="512" y="132" text-anchor="start">Despacho de una venta</text>
    <text x="512" y="170" text-anchor="start">Salida de un traslado</text>
    <text x="512" y="208" text-anchor="start">Conteo: faltante</text>
    <text x="512" y="246" text-anchor="start">Reverso de una entrada</text>
  </g>

  <g class="hilo">
    <path d="M258,90 H285" marker-end="url(#fi)"/>
    <path d="M258,128 H285" marker-end="url(#fi)"/>
    <path d="M258,166 H285" marker-end="url(#fi)"/>
    <path d="M258,204 H285" marker-end="url(#fi)"/>
    <path d="M258,242 H285" marker-end="url(#fi)"/>

    <path d="M475,90 H502" marker-end="url(#fi)"/>
    <path d="M475,128 H502" marker-end="url(#fi)"/>
    <path d="M475,166 H502" marker-end="url(#fi)"/>
    <path d="M475,204 H502" marker-end="url(#fi)"/>
    <path d="M475,242 H502" marker-end="url(#fi)"/>
  </g>

  <text class="cierre" x="380" y="308" text-anchor="middle">La existencia no está guardada en ninguna parte:</text>
  <text class="cierre" x="380" y="326" text-anchor="middle">se calcula sumando el libro cada vez que se mira.</text>
</svg>
<figcaption>Diez puertas y un solo libro. Como el saldo se calcula sumando, no puede quedar desactualizado ni desincronizarse — y por eso mismo no hay forma de corregirlo sin escribir una línea más.</figcaption>
</figure>`

const explotacion = `
<figure class="diagrama">
<svg viewBox="0 0 760 260" role="img" aria-label="La piedra llega al patio por un solo camino: se define el frente, se registra la voladura contra ese frente, y al cierre del turno el parte de producción escribe una entrada al patio por cada material.">
  <defs>
    <marker id="fe" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="currentColor"/>
    </marker>
    <marker id="fe-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="var(--regio)"/>
    </marker>
  </defs>

  <g class="paso">
    <rect x="20" y="100" width="120" height="48" rx="4"/>
    <text x="80" y="129" text-anchor="middle">Frente</text>

    <rect x="190" y="100" width="120" height="48" rx="4"/>
    <text x="250" y="129" text-anchor="middle">Voladura</text>

    <rect x="360" y="64" width="160" height="124" rx="4" class="ojo-regio"/>

    <rect x="612" y="100" width="128" height="48" rx="4"/>
    <text x="676" y="129" text-anchor="middle">Patio</text>
  </g>

  <text class="paso-tit" x="440" y="86" text-anchor="middle">Parte de turno</text>
  <g class="renglon">
    <rect x="374" y="96" width="132" height="18" rx="2"/>
    <rect x="374" y="122" width="132" height="18" rx="2"/>
    <rect x="374" y="148" width="132" height="18" rx="2"/>
  </g>
  <g class="nota">
    <text x="440" y="109" text-anchor="middle">Piedra N.º 1</text>
    <text x="440" y="135" text-anchor="middle">Granzón</text>
    <text x="440" y="161" text-anchor="middle">Polvillo</text>
  </g>

  <g class="hilo">
    <path d="M140,124 H185" marker-end="url(#fe)"/>
    <path d="M310,124 H355" marker-end="url(#fe)"/>
  </g>
  <g class="hilo-regio-g">
    <path d="M520,105 L607,118" marker-end="url(#fe-r)"/>
    <path d="M520,131 L607,124" marker-end="url(#fe-r)"/>
    <path d="M520,157 L607,130" marker-end="url(#fe-r)"/>
  </g>

  <g class="nota">
    <text x="80" y="166" text-anchor="middle">se define una vez</text>
    <text x="250" y="166" text-anchor="middle">cada vez que se vuela</text>
    <text x="440" y="206" text-anchor="middle">al cierre de cada turno</text>
    <text x="676" y="166" text-anchor="middle">la piedra ya está</text>
  </g>

  <text class="cierre" x="380" y="240" text-anchor="middle">Es la única puerta por la que entra material al patio.</text>
</svg>
<figcaption>Un parte lleva un renglón por cada material que salió en ese turno, y cada renglón escribe su propia entrada al patio. Por eso anular el parte reversa exactamente esas entradas y no otras parecidas.</figcaption>
</figure>`

const despachos = `
<figure class="diagrama">
<svg viewBox="0 0 760 300" role="img" aria-label="El pesaje de la romana y la guía de movilización se gastan al emitir la nota de entrega, y los dos vuelven a quedar libres si la nota se anula.">
  <defs>
    <marker id="fd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,1 L9,5 L0,9 z" fill="currentColor"/>
    </marker>
  </defs>

  <g class="paso">
    <rect x="30" y="56" width="190" height="50" rx="4"/>
    <text x="125" y="86" text-anchor="middle">Ticket de romana</text>

    <rect x="30" y="168" width="190" height="50" rx="4"/>
    <text x="125" y="198" text-anchor="middle">Guía de movilización</text>

    <rect x="340" y="112" width="170" height="50" rx="4" class="ojo-regio"/>
    <text x="425" y="142" text-anchor="middle">Nota de entrega</text>

    <rect x="590" y="112" width="150" height="50" rx="4"/>
    <text x="665" y="142" text-anchor="middle">Sale el camión</text>
  </g>

  <g class="hilo">
    <path d="M220,90 L333,126" marker-end="url(#fd)"/>
    <path d="M220,186 L333,150" marker-end="url(#fd)"/>
    <path d="M510,137 H585" marker-end="url(#fd)"/>
  </g>

  <g class="hilo-tit">
    <text x="268" y="100">se gasta</text>
    <text x="268" y="182">se gasta</text>
  </g>

  <g class="nota">
    <text x="125" y="126" text-anchor="middle">un pesaje, un viaje</text>
    <text x="125" y="238" text-anchor="middle">sin ella no sale mineral</text>
  </g>

  <path class="hilo-punteado" d="M425,162 V272 H16 V81 H26" marker-end="url(#fd)"/>
  <text class="hilo-tit" x="245" y="266" text-anchor="middle">al anular la nota, los dos vuelven a quedar libres</text>
</svg>
<figcaption>Los dos papeles de la garita se usan una sola vez, porque un pesaje pertenece a un viaje y una guía ampara un viaje. Si la nota se anula vuelven a quedar disponibles: el camión se pesó igual.</figcaption>
</figure>`

export default {
  '6.2 Cómo llega la piedra al patio': explotacion,
  '8.3 Del pesaje a la salida del camión': despachos,
  '9.2 El circuito de una compra': compras,
  '10.2 El circuito de una venta': ventas,
  '11.2 El ciclo de una nómina': nomina,
  'De dónde entra y por dónde sale el material': inventario,
}
