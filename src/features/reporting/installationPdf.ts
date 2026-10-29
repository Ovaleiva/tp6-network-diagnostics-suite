import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  decodeFromBase64,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type {
  Coordinates,
  Installation,
  PhotoEvidence,
} from '../../core/domain/models';

// Devuelve el JPEG de la foto en base64, o undefined si el archivo no se pudo leer.
// Se llama de a una foto por vez para no tener todas en memoria a la vez.
export type PhotoReader = (photo: PhotoEvidence) => Promise<string | undefined>;

const MARGIN = 50;
const BODY = 11;
const LINE = 16;
const MAX_IMAGE_HEIGHT = 320;
const TEXT = rgb(0.1, 0.12, 0.16);
const MUTED = rgb(0.4, 0.42, 0.46);

// Un reporte por revisión: regenerar la misma revisión reemplaza el anterior.
export function reportId(installation: Installation): string {
  return `rep-${installation.id}-r${installation.revision}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

// Fecha local legible para el técnico: DD/MM/AAAA HH:MM.
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatCoordinates(coordinates: Coordinates): string {
  return `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)} (±${coordinates.accuracyMeters} m)`;
}

// Datos de cabecera del reporte, separados del dibujo para poder probarlos.
export function reportFields(
  installation: Installation,
  generatedAt: Date,
): [string, string][] {
  return [
    ['Sitio', installation.siteId],
    ['Equipo', installation.deviceId || 'No indicado'],
    ['Instalación', installation.id],
    ['Revisión', String(installation.revision)],
    ['Registrada', formatDate(installation.createdAt)],
    ['Generado', formatDate(generatedAt.toISOString())],
    [
      'Ubicación',
      installation.coordinates
        ? formatCoordinates(installation.coordinates)
        : 'Sin GPS',
    ],
    ['Fotos', String(installation.photos.length)],
  ];
}

export function photoCaption(photo: PhotoEvidence, index: number): string {
  const gps = photo.coordinates
    ? `GPS ${formatCoordinates(photo.coordinates)}`
    : 'sin GPS';
  return `Foto ${index + 1} · ${formatDate(photo.capturedAt)} · ${gps}`;
}

// Las fuentes estándar del PDF usan WinAnsi: los caracteres que no entran
// (emojis, otros alfabetos) se reemplazan para que la generación no falle.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function toWinAnsi(text: string): string {
  let result = '';
  for (const char of text.replace(/\t/gu, ' ')) {
    const code = char.codePointAt(0) ?? 0;
    const printable = (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff);
    result += printable || WIN_ANSI_EXTRA.has(char) ? char : '?';
  }
  return result;
}

// La cámara guarda los píxeles como los lee el sensor y anota en EXIF cómo
// girarlos (etiqueta 0x0112). El PDF no aplica ese giro: hay que hacerlo al dibujar.
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      // El EXIF va antes de la imagen; al llegar a SOS no hay más metadatos.
      if (marker === 0xda) break;
      const isExif =
        marker === 0xe1 &&
        String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'Exif';
      if (isExif) {
        const tiff = offset + 10;
        const little = bytes[tiff] === 0x49; // 'II' little endian, 'MM' big endian
        const ifd = tiff + view.getUint32(tiff + 4, little);
        const entries = view.getUint16(ifd, little);
        for (let index = 0; index < entries; index++) {
          const entry = ifd + 2 + index * 12;
          if (view.getUint16(entry, little) === 0x0112) {
            const value = view.getUint16(entry + 8, little);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        return 1;
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  } catch {
    // EXIF truncado o inválido: se dibuja la foto sin girar.
  }
  return 1;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Con orientación 5 a 8 la foto se ve girada 90°: ancho y alto se intercambian.
export function displaySize(orientation: number, width: number, height: number) {
  return orientation >= 5 ? { width: height, height: width } : { width, height };
}

// Opciones de drawImage para que la foto quede derecha dentro de `box` (tamaño
// visible). pdf-lib gira la imagen en sentido antihorario alrededor de (x, y).
// Las variantes espejadas (2, 4, 5, 7) se giran igual pero sin espejar.
export function imagePlacement(orientation: number, box: Box) {
  switch (orientation) {
    case 3:
    case 4:
      return { x: box.x + box.width, y: box.y + box.height, width: box.width, height: box.height, rotate: 180 };
    case 5:
    case 6:
      return { x: box.x, y: box.y + box.height, width: box.height, height: box.width, rotate: -90 };
    case 7:
    case 8:
      return { x: box.x + box.width, y: box.y, width: box.height, height: box.width, rotate: 90 };
    default:
      return { ...box, rotate: 0 };
  }
}

// Corta el texto en líneas que entran en el ancho; respeta los saltos de línea.
export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const fits = (value: string) => font.widthOfTextAtSize(value, size) <= maxWidth;
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    let line = '';
    for (const word of toWinAnsi(paragraph).split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (fits(candidate)) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Una palabra más larga que el renglón se parte por caracteres.
      line = '';
      for (const char of word) {
        if (!fits(line + char)) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

// Genera el PDF en memoria y lo devuelve en base64 para escribirlo a disco.
export async function buildInstallationPdf(
  installation: Installation,
  readPhoto: PhotoReader,
  generatedAt: Date,
): Promise<string> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Instalación ${installation.siteId} rev. ${installation.revision}`);
  doc.setCreator('Network Diagnostics Suite');
  doc.setCreationDate(generatedAt);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = PageSizes.A4;
  const width = pageWidth - MARGIN * 2;

  let page: PDFPage = doc.addPage(PageSizes.A4);
  let y = pageHeight - MARGIN;
  function ensure(height: number) {
    if (y - height < MARGIN) {
      page = doc.addPage(PageSizes.A4);
      y = pageHeight - MARGIN;
    }
  }
  function write(text: string, options: { font?: PDFFont; size?: number; color?: typeof TEXT; x?: number } = {}) {
    const size = options.size ?? BODY;
    const font = options.font ?? regular;
    const x = options.x ?? MARGIN;
    for (const line of wrapText(text, font, size, width - (x - MARGIN))) {
      ensure(LINE);
      y -= size + (LINE - BODY);
      page.drawText(line, { x, y, size, font, color: options.color ?? TEXT });
    }
  }
  function heading(text: string) {
    y -= 8;
    ensure(LINE * 3);
    write(text, { font: bold, size: 14 });
    y -= 4;
  }

  write('Reporte de instalación', { font: bold, size: 20 });
  write('Network Diagnostics Suite · documento generado sin conexión', {
    color: MUTED,
  });
  y -= 8;
  for (const [label, value] of reportFields(installation, generatedAt)) {
    ensure(LINE);
    const top = y;
    write(`${label}:`, { font: bold });
    y = top;
    write(value, { x: MARGIN + 90 });
  }

  heading('Notas técnicas');
  write(installation.notes.trim() || 'Sin notas.');

  heading('Evidencia fotográfica');
  if (!installation.photos.length) {
    write('La instalación no tiene fotos.', { color: MUTED });
  }
  for (const [index, photo] of installation.photos.entries()) {
    const caption = photoCaption(photo, index);
    const jpegBase64 = await readPhoto(photo).catch(() => undefined);
    if (!jpegBase64) {
      write(`${caption} · archivo no disponible en el dispositivo`, { color: MUTED });
      continue;
    }
    const bytes = decodeFromBase64(jpegBase64);
    const orientation = jpegOrientation(bytes);
    const image = await doc.embedJpg(bytes);
    const visible = displaySize(orientation, image.width, image.height);
    const scale = Math.min(width / visible.width, MAX_IMAGE_HEIGHT / visible.height, 1);
    const size = { width: visible.width * scale, height: visible.height * scale };
    // La foto y su epígrafe quedan en la misma página.
    ensure(size.height + LINE * 2);
    write(caption, { color: MUTED });
    y -= size.height + 6;
    const placement = imagePlacement(orientation, { x: MARGIN, y, ...size });
    page.drawImage(image, { ...placement, rotate: degrees(placement.rotate) });
    y -= 10;
  }

  return doc.saveAsBase64();
}
