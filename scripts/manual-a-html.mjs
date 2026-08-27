/*
  Convierte el manual de usuario a la pantalla que se ve dentro del sistema.

      npm run manual

  Lee docs/manual-de-usuario.md y escribe src/pages/manual.generado.html, que
  Manual.tsx importa como texto. El manual sigue viviendo en un solo sitio: el
  markdown. Si alguien edita el .md y no vuelve a correr esto, la pantalla se
  queda con la version anterior, y por eso el archivo generado lleva su aviso
  arriba y no se edita a mano.

  El conversor es propio y entiende solo lo que el manual usa: encabezados,
  tablas, listas, citas, negrita y cursiva. Traerse un motor de markdown para
  eso serian cuatro dependencias nuevas en el paquete que se descarga en un
  telefono con la señal de la cantera.
*/

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import DIAGRAMAS from './manual-diagramas.mjs'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEN = path.join(raiz, 'docs', 'manual-de-usuario.md')
const DESTINO = path.join(raiz, 'src', 'pages', 'manual.generado.html')

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function enLinea(s) {
  let t = esc(s)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return t
}

const limpiar = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/*
  NINGUN ANCLA SE REPITE.

  Los apartados del manual se llaman igual en muchos capitulos --«Que se ve»,
  «Que sale de aqui», «Lo que no te deja el sistema»-- y siete anclas estaban
  duplicadas. No es cosmetico: el buscador de la pantalla del manual indexa por
  el `id` del encabezado, asi que buscar «Que sale de aqui» estando en
  Facturacion llevaba al de Cotizaciones, que es el primero del documento.

  Al segundo y siguientes se les pone un sufijo. Se prefiere eso a prefijarlos
  todos con el numero de capitulo, que arreglaria lo mismo pero cambiaria las
  trescientas setenta anclas de golpe.
*/
const usadas = new Map()
const ancla = (s) => {
  const base = limpiar(s)
  const vistas = usadas.get(base) ?? 0
  usadas.set(base, vistas + 1)
  return vistas === 0 ? base : `${base}-${vistas + 1}`
}

const lineas = fs.readFileSync(ORIGEN, 'utf8').replace(/\r\n/g, '\n').split('\n')
const partes = []
let i = 0
let abierto = false
let saltando = false
let antesDelPrimerCapitulo = true
let capitulos = 0
let diagramasPuestos = 0

const cerrar = () => {
  if (abierto) {
    partes.push('</section>')
    abierto = false
  }
}

while (i < lineas.length) {
  const l = lineas[i]

  if (/^---\s*$/.test(l)) {
    i++
    continue
  }

  // Hasta cinco. El quinto nivel entro con el carnet: la ficha del trabajador
  // ya tenia cuatro --capitulo, seccion, apartado-- y el carnet pide un escalon
  // mas para separar «cuando todavia no lo tiene» de «cuando ya lo tiene». Con
  // cuatro, los cinco encabezados salian impresos tal cual: «##### La pagina
  // que abre el QR» en medio de la pantalla.
  const h = l.match(/^(#{1,5})\s+(.*)$/)
  if (h) {
    const nivel = h[1].length
    const texto = h[2].trim()

    // El indice del markdown lo sustituye el riel lateral de la pantalla.
    if (nivel === 2 && /^Índice$/i.test(texto)) {
      saltando = true
      i++
      continue
    }
    saltando = false

    // El titulo y la ficha de version los pone la cabecera de la pantalla.
    if (nivel === 1) {
      i++
      continue
    }

    if (nivel === 2) {
      antesDelPrimerCapitulo = false
      cerrar()
      const m = texto.match(/^(\d+)\.\s+(.*)$/)
      const num = m ? m[1] : ''
      const nombre = m ? m[2] : texto
      capitulos++
      abierto = true
      partes.push(`<section class="cap" id="${ancla(texto)}" data-cap="${esc(num)}">`)
      partes.push(
        `<h2 class="cap-tit">${num ? `<span class="cap-num">${num}</span>` : ''}<span>${enLinea(nombre)}</span></h2>`,
      )
      i++
      continue
    }

    partes.push(`<h${nivel} id="${ancla(texto)}">${enLinea(texto)}</h${nivel}>`)
    if (DIAGRAMAS[texto]) {
      partes.push(DIAGRAMAS[texto])
      diagramasPuestos++
    }
    i++
    continue
  }

  if (saltando || antesDelPrimerCapitulo) {
    i++
    continue
  }

  // Tablas
  if (/^\s*\|/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lineas[i + 1] || '')) {
    const celdas = (fila) =>
      fila
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim())

    const cabecera = celdas(l)
    i += 2
    const filas = []
    while (i < lineas.length && /^\s*\|/.test(lineas[i])) {
      filas.push(celdas(lineas[i]))
      i++
    }

    // Las tablas de mensajes son las que se consultan con un error en pantalla:
    // se marcan para que el buscador de la pantalla pueda mirarlas aparte.
    const deMensajes = /lo que ves/i.test(cabecera[0] || '')
    let t = `<div class="tabla-caja"><table${deMensajes ? ' class="tabla-mensajes"' : ''}><thead><tr>`
    t += cabecera.map((c) => `<th>${enLinea(c)}</th>`).join('')
    t += '</tr></thead><tbody>'
    for (const f of filas) {
      t += '<tr>' + cabecera.map((_, n) => `<td>${enLinea(f[n] || '')}</td>`).join('') + '</tr>'
    }
    partes.push(t + '</tbody></table></div>')
    continue
  }

  // Listas numeradas: son los procedimientos paso a paso
  if (/^\d+\.\s+/.test(l)) {
    const items = []
    while (i < lineas.length && /^\d+\.\s+/.test(lineas[i])) {
      let txt = lineas[i].replace(/^\d+\.\s+/, '')
      i++
      while (i < lineas.length && /^\s{3,}\S/.test(lineas[i])) {
        txt += ' ' + lineas[i].trim()
        i++
      }
      items.push(txt)
    }
    partes.push('<ol class="pasos">' + items.map((t) => `<li>${enLinea(t)}</li>`).join('') + '</ol>')
    continue
  }

  // Listas con viñeta
  if (/^[-*]\s+/.test(l)) {
    const items = []
    while (i < lineas.length && /^[-*]\s+/.test(lineas[i])) {
      let txt = lineas[i].replace(/^[-*]\s+/, '')
      i++
      while (i < lineas.length && /^\s{2,}\S/.test(lineas[i])) {
        txt += ' ' + lineas[i].trim()
        i++
      }
      items.push(txt)
    }
    partes.push('<ul>' + items.map((t) => `<li>${enLinea(t)}</li>`).join('') + '</ul>')
    continue
  }

  // Citas
  if (/^>\s?/.test(l)) {
    const buf = []
    while (i < lineas.length && /^>\s?/.test(lineas[i])) {
      buf.push(lineas[i].replace(/^>\s?/, ''))
      i++
    }
    partes.push(`<blockquote>${enLinea(buf.join(' '))}</blockquote>`)
    continue
  }

  if (l.trim() === '') {
    i++
    continue
  }

  const buf = [l]
  i++
  while (
    i < lineas.length &&
    lineas[i].trim() !== '' &&
    !/^(#{1,5}\s|\s*\||[-*]\s|\d+\.\s|>|---\s*$)/.test(lineas[i])
  ) {
    buf.push(lineas[i])
    i++
  }
  const txt = buf.join(' ').trim()

  /*
    Un parrafo que enuncia una regla no es prosa corriente: es lo que alguien
    viene a buscar cuando el sistema no le deja avanzar, y conviene que se vea
    desde lejos al recorrer la pagina con el pulgar.
  */
  const esRegla =
    /^\*\*[^*]+\*\*/.test(txt) &&
    /(no se|nunca|no puede|no deja|no lo|a propósito|cuidado|importante|ojo)/i.test(txt)

  partes.push(esRegla ? `<p class="regla">${enLinea(txt)}</p>` : `<p>${enLinea(txt)}</p>`)
}
cerrar()

const aviso = `<!-- Generado por scripts/manual-a-html.mjs desde docs/manual-de-usuario.md.
     No se edita a mano: los cambios se hacen en el markdown y se corre "npm run manual". -->\n`

fs.writeFileSync(DESTINO, aviso + partes.join('\n') + '\n', 'utf8')

const salida = partes.join('\n')
console.log('capitulos :', capitulos)
console.log('secciones :', (salida.match(/<h3 /g) || []).length)
console.log('tablas    :', (salida.match(/<table/g) || []).length)
console.log('  mensajes:', (salida.match(/tabla-mensajes/g) || []).length)
console.log('diagramas :', diagramasPuestos, 'de', Object.keys(DIAGRAMAS).length)
console.log('bytes     :', Buffer.byteLength(salida))

if (diagramasPuestos !== Object.keys(DIAGRAMAS).length) {
  console.error('\nHay diagramas sin colocar: algun encabezado cambio de texto.')
  process.exit(1)
}
