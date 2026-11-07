/*
  «🖨 IMPRIMIR» SIN PASAR POR EL VISOR (MGG `imprimirPdfDoc`)

  El PDF ya armado se carga en un marco invisible y se le pide al navegador
  que lo imprima: sale el diálogo de impresión directamente, a tamaño real y
  con sus márgenes. Si el navegador no deja imprimir desde el marco (algunos
  móviles), se abre el PDF en otra pestaña para imprimirlo desde ahí.
*/
export function imprimirPdf(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const marco = document.createElement('iframe')
  marco.style.position = 'fixed'
  marco.style.width = '0'
  marco.style.height = '0'
  marco.style.border = '0'
  marco.style.right = '0'
  marco.style.bottom = '0'
  marco.src = url
  const limpiar = () => {
    setTimeout(() => {
      marco.remove()
      URL.revokeObjectURL(url)
    }, 60_000)
  }
  marco.onload = () => {
    try {
      marco.contentWindow?.focus()
      marco.contentWindow?.print()
    } catch {
      window.open(url, '_blank', 'noopener')
    }
    limpiar()
  }
  document.body.appendChild(marco)
}
