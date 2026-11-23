export interface HojaImagen {
  blob: Blob;
  url: string;
  ancho: number;
  alto: number;
  anchoPt: number;
  altoPt: number;
}

export function navegadorSinVisorPdf(): boolean {
  return false;
}

export async function dibujarPdfEnCanvas(_datos: ArrayBuffer, cont: HTMLElement, _alCerrar: (fn: () => void) => void): Promise<void> {
  const aviso = document.createElement('div');
  aviso.textContent = 'Documento listo para descargar';
  cont.appendChild(aviso);
}

export async function paginasPdfComoImagenes(_datos: ArrayBuffer): Promise<HojaImagen[]> {
  return [];
}
