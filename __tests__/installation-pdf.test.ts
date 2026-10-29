import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
} from 'pdf-lib';
import type { Installation } from '../src/core/domain/models';
import {
  buildInstallationPdf,
  displaySize,
  imagePlacement,
  jpegOrientation,
  photoCaption,
  reportFields,
  reportId,
  toWinAnsi,
  wrapText,
} from '../src/features/reporting/installationPdf';

// Jest define __dirname; los tipos de React Native no lo declaran.
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

// JPEG real de 64×48 generado para las pruebas.
const jpeg: string = readFileSync(join(__dirname, 'fixtures', 'photo.jpg')).toString('base64');

const gps = {
  latitude: -31.4201,
  longitude: -64.1888,
  accuracyMeters: 5,
  capturedAt: '2026-10-29T12:00:00.000Z',
};

function installation(overrides: Partial<Installation> = {}): Installation {
  return {
    id: 'inst-1',
    siteId: 'torre-norte',
    notes: 'ONT instalada. Señal -19 dBm.',
    photos: [
      { id: 'p1', localUri: 'file:///evidence/p1.jpg', capturedAt: '2026-10-29T12:01:00.000Z', coordinates: gps },
      { id: 'p2', localUri: 'file:///evidence/p2.jpg', capturedAt: '2026-10-29T12:02:00.000Z' },
    ],
    coordinates: gps,
    createdAt: '2026-10-29T12:05:00.000Z',
    revision: 2,
    ...overrides,
  };
}

async function inspect(base64: string) {
  const doc = await PDFDocument.load(base64);
  const images = doc.context
    .enumerateIndirectObjects()
    .filter(
      ([, object]) =>
        object instanceof PDFRawStream &&
        object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
    );
  return { doc, pages: doc.getPageCount(), images: images.length };
}

describe('contenido del reporte', () => {
  it('identifica el reporte por instalación y revisión', () => {
    expect(reportId(installation())).toBe('rep-inst-1-r2');
  });

  it('incluye sitio, equipo, revisión, ubicación y cantidad de fotos', () => {
    const fields = Object.fromEntries(
      reportFields(installation({ deviceId: '10.0.2.2' }), new Date()),
    );
    expect(fields).toMatchObject({
      Sitio: 'torre-norte',
      Equipo: '10.0.2.2',
      Revisión: '2',
      Ubicación: '-31.420100, -64.188800 (±5 m)',
      Fotos: '2',
    });
    expect(fields.Registrada).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/u);
  });

  it('indica la falta de equipo y de GPS', () => {
    const fields = Object.fromEntries(
      reportFields(installation({ coordinates: undefined }), new Date()),
    );
    expect(fields.Equipo).toBe('No indicado');
    expect(fields.Ubicación).toBe('Sin GPS');
  });

  it('el epígrafe de cada foto dice si tiene GPS', () => {
    const [withGps, withoutGps] = installation().photos;
    expect(photoCaption(withGps, 0)).toMatch(/^Foto 1 · .* · GPS -31\.420100, -64\.188800 \(±5 m\)$/u);
    expect(photoCaption(withoutGps, 1)).toMatch(/^Foto 2 · .* · sin GPS$/u);
  });

  it('reemplaza caracteres que la fuente del PDF no puede dibujar', () => {
    expect(toWinAnsi('Señal ±5 dBm – “ok” 📡\tfin')).toBe('Señal ±5 dBm – “ok” ? fin');
  });

  it('corta el texto al ancho disponible y respeta los saltos de línea', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText(`${'palabra '.repeat(30)}\nsegunda\n${'x'.repeat(120)}`, font, 11, 200);
    expect(lines.length).toBeGreaterThan(4);
    expect(lines).toContain('segunda');
    for (const line of lines) {
      expect(font.widthOfTextAtSize(line, 11)).toBeLessThanOrEqual(200);
    }
  });
});

// Inserta tras el SOI un bloque EXIF con la etiqueta de orientación.
function withOrientation(orientation: number, little = false): string {
  const bytes: number[] = Array.from(readFileSync(join(__dirname, 'fixtures', 'photo.jpg')));
  const u16 = (n: number) =>
    little ? [n % 256, Math.floor(n / 256)] : [Math.floor(n / 256), n % 256];
  const u32 = (n: number) => (little ? [n, 0, 0, 0] : [0, 0, 0, n]);
  const tiff = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8),
    ...u16(1),
    ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0,
    ...u32(0),
  ];
  const payload = [...Array.from('Exif').map(c => c.charCodeAt(0)), 0, 0, ...tiff];
  const app1 = [0xff, 0xe1, 0, payload.length + 2, ...payload]; // bloque de menos de 256 bytes
  return Buffer.from([...bytes.slice(0, 2), ...app1, ...bytes.slice(2)]).toString('base64');
}
declare const Buffer: { from(data: number[] | string, encoding?: string): { toString(encoding: string): string } & Uint8Array };

function bytesOf(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

describe('orientación de las fotos', () => {
  it('lee la orientación EXIF en ambos órdenes de bytes', () => {
    expect(jpegOrientation(bytesOf(jpeg))).toBe(1);
    expect(jpegOrientation(bytesOf(withOrientation(6)))).toBe(6);
    expect(jpegOrientation(bytesOf(withOrientation(8, true)))).toBe(8);
    expect(jpegOrientation(bytesOf(withOrientation(3)))).toBe(3);
  });

  it('dibuja sin girar si el EXIF está truncado', () => {
    expect(jpegOrientation(bytesOf(withOrientation(6)).subarray(0, 24))).toBe(1);
  });

  it('intercambia ancho y alto cuando la foto se ve girada 90°', () => {
    expect(displaySize(6, 1280, 960)).toEqual({ width: 960, height: 1280 });
    expect(displaySize(3, 1280, 960)).toEqual({ width: 1280, height: 960 });
  });

  // Gira las esquinas como lo hace pdf-lib y devuelve el rectángulo que ocupan.
  function bounds(p: ReturnType<typeof imagePlacement>) {
    const rad = (p.rotate * Math.PI) / 180;
    const corners = [
      [0, 0],
      [p.width, 0],
      [0, p.height],
      [p.width, p.height],
    ].map(([u, v]) => [
      p.x + u * Math.cos(rad) - v * Math.sin(rad),
      p.y + u * Math.sin(rad) + v * Math.cos(rad),
    ]);
    const xs = corners.map(c => Math.round(c[0]));
    const ys = corners.map(c => Math.round(c[1]));
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  it.each([1, 3, 6, 8])('con orientación %i la foto ocupa exactamente su recuadro', orientation => {
    const box = { x: 50, y: 100, width: 300, height: 400 };
    expect(bounds(imagePlacement(orientation, box))).toEqual(box);
  });

  it('con orientación 6 la esquina superior izquierda del sensor queda arriba a la derecha', () => {
    const p = imagePlacement(6, { x: 0, y: 0, width: 300, height: 400 });
    // En el sensor (sin girar) la esquina superior izquierda es (0, alto).
    const rad = (p.rotate * Math.PI) / 180;
    const [u, v] = [0, p.height];
    const x = Math.round(p.x + u * Math.cos(rad) - v * Math.sin(rad));
    const y = Math.round(p.y + u * Math.sin(rad) + v * Math.cos(rad));
    expect({ x, y }).toEqual({ x: 300, y: 400 });
  });
});

describe('generación del PDF', () => {
  it('embebe una foto con orientación EXIF', async () => {
    const rotated = withOrientation(6);
    const { images } = await inspect(
      await buildInstallationPdf(installation(), async () => rotated, new Date()),
    );
    expect(images).toBe(2);
  });

  it('genera un PDF válido con cada foto embebida', async () => {
    const read = jest.fn(async () => jpeg);
    const base64 = await buildInstallationPdf(installation(), read, new Date());
    const { doc, pages, images } = await inspect(base64);
    expect(read).toHaveBeenCalledTimes(2);
    expect(pages).toBe(1);
    expect(images).toBe(2);
    expect(doc.getTitle()).toBe('Instalación torre-norte rev. 2');
  });

  it('sigue adelante si una foto no se puede leer', async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('sin permiso'));
    const { images } = await inspect(await buildInstallationPdf(installation(), read, new Date()));
    expect(images).toBe(0);
  });

  it('genera un PDF sin fotos ni notas', async () => {
    const empty = installation({ photos: [], notes: '', coordinates: undefined });
    const { pages, images } = await inspect(
      await buildInstallationPdf(empty, async () => undefined, new Date()),
    );
    expect(pages).toBe(1);
    expect(images).toBe(0);
  });

  it('pasa a otra página cuando las fotos no entran', async () => {
    const photos = Array.from({ length: 10 }, (_, index) => ({
      id: `p${index}`,
      localUri: `file:///evidence/p${index}.jpg`,
      capturedAt: '2026-10-29T12:00:00.000Z',
    }));
    // Diez fotos con su epígrafe superan el alto de una página A4.
    const { pages, images } = await inspect(
      await buildInstallationPdf(installation({ photos }), async () => jpeg, new Date()),
    );
    expect(images).toBe(10);
    expect(pages).toBeGreaterThan(1);
  });
});
