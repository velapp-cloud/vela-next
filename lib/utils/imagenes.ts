/**
 * lib/utils/imagenes.ts
 * Valida (JPG/PNG) y ajusta imágenes en el navegador antes de subirlas.
 *  - 'perfil': recorta al formato vertical 4:5 (el de la galería) y limita a 1080 px de ancho.
 *  - 'documento': NO recorta (debe verse completo); limita el lado mayor a 1600 px.
 * Siempre devuelve un JPEG limpio y una URL de vista previa local.
 */
export const FORMATOS_TEXTO = 'JPG y PNG';

const TIPOS_OK = ['image/jpeg', 'image/png'];
const MAX_BYTES = 15 * 1024 * 1024;
const LADO_MINIMO = 400;

export type ModoImagen = 'perfil' | 'documento';

export type ResultadoImagen =
  | { ok: true; archivo: File; vistaPrevia: string }
  | { ok: false; error: string };

function cargarImagen(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

export async function prepararImagen(file: File, modo: ModoImagen): Promise<ResultadoImagen> {
  const nombre = file.name.toLowerCase();
  const tipoOk = TIPOS_OK.includes(file.type) || (!file.type && /\.(jpe?g|png)$/.test(nombre));
  if (!tipoOk) {
    return { ok: false, error: `Formato no permitido. Usa una imagen ${FORMATOS_TEXTO}.` };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'La imagen pesa más de 15 MB. Elige una más liviana.' };
  }

  let img: HTMLImageElement;
  try {
    img = await cargarImagen(file);
  } catch {
    return { ok: false, error: 'No se pudo leer la imagen. Prueba con otra.' };
  }

  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (Math.min(iw, ih) < LADO_MINIMO) {
    return { ok: false, error: `La imagen es muy pequeña (mínimo ${LADO_MINIMO} px por lado).` };
  }

  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  let ow: number;
  let oh: number;

  if (modo === 'perfil') {
    const ratio = 4 / 5;
    if (iw / ih > ratio) {
      sh = ih;
      sw = Math.round(ih * ratio);
      sx = Math.round((iw - sw) / 2);
    } else {
      sw = iw;
      sh = Math.round(iw / ratio);
      sy = Math.round((ih - sh) / 2);
    }
    ow = Math.min(1080, sw);
    oh = Math.round(ow / ratio);
  } else {
    const escala = Math.min(1, 1600 / Math.max(iw, ih));
    ow = Math.round(iw * escala);
    oh = Math.round(ih * escala);
  }

  const canvas = document.createElement('canvas');
  canvas.width = ow;
  canvas.height = oh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, error: 'Tu navegador no pudo procesar la imagen.' };

  // Fondo blanco por si el PNG tiene transparencia.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ow, oh);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', modo === 'perfil' ? 0.85 : 0.9),
  );
  if (!blob) return { ok: false, error: 'No se pudo preparar la imagen. Intenta de nuevo.' };

  const archivo = new File([blob], `${modo}-${Date.now()}.jpg`, { type: 'image/jpeg' });
  return { ok: true, archivo, vistaPrevia: URL.createObjectURL(archivo) };
}