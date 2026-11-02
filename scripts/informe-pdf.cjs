// Genera docs/INFORME_TECNICO.pdf a partir de docs/INFORME_TECNICO.md.
// Markdown -> HTML (marked), diagramas Mermaid dibujados en el navegador e
// impresión con Chrome o Edge sin ventana. Uso: npm.cmd run docs:pdf
// Otro navegador: definir CHROME_PATH con la ruta del ejecutable.
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { marked } = require('marked');

const root = join(__dirname, '..');
const source = join(root, 'docs', 'INFORME_TECNICO.md');
const output = join(root, 'docs', 'INFORME_TECNICO.pdf');
const work = join(root, 'tmp', 'informe-pdf');

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function escapeHtml(text) {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function buildHtml(markdown) {
  // El título y la línea de fecha del Markdown pasan a la portada.
  const header =
    /^# .*\n+Desarrollo de Aplicaciones Móviles 2026 · Fecha: (.*?)\.?\n/u;
  const date = markdown.match(header)?.[1] ?? '';
  const renderer = new marked.Renderer();
  const renderCode = renderer.code.bind(renderer);
  renderer.code = (code, lang, escaped) =>
    lang === 'mermaid'
      ? `<pre class="mermaid">${escapeHtml(code)}</pre>`
      : renderCode(code, lang, escaped);
  // Los enlaces a otros archivos del repositorio no sirven dentro del PDF: queda el texto.
  renderer.link = (href, _title, text) =>
    /^https?:/u.test(href)
      ? `<a href="${href}">${text}</a>`
      : `<span class="ref">${text}</span>`;
  const body = marked.parse(markdown.replace(header, ''), {
    renderer,
    gfm: true,
  });

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Informe técnico · Network Diagnostics Suite</title>
<style>
  @page { size: A4; margin: 20mm 18mm;
    @bottom-center { content: counter(page) " / " counter(pages); font: 9pt "Segoe UI", Arial, sans-serif; color: #666; } }
  @page :first { @bottom-center { content: none; } }
  body { font: 10.5pt/1.5 "Segoe UI", Arial, sans-serif; color: #1d2b36; }
  .cover { height: 230mm; display: flex; flex-direction: column; justify-content: center; text-align: center; break-after: page; }
  .cover .inst { font-size: 14pt; font-weight: 700; }
  .cover .course { font-size: 12pt; margin-bottom: 30mm; }
  .cover h1 { font-size: 28pt; color: #2f6db3; font-weight: 500; margin: 0 0 4mm; }
  .cover .sub { font-size: 13pt; font-style: italic; color: #555; margin-bottom: 30mm; }
  .cover .meta { font-size: 11pt; color: #444; line-height: 1.8; }
  h2 { font-size: 16pt; font-weight: 500; color: #1f3d5c; border-bottom: 1.5px solid #2f5d8a; padding-bottom: 2px; margin: 9mm 0 3mm; break-after: avoid; }
  h3 { font-size: 12.5pt; font-weight: 600; color: #1f3d5c; margin: 6mm 0 2mm; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  ul, ol { padding-left: 6mm; }
  li { margin: 1mm 0; }
  table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9pt; }
  thead { display: table-header-group; }
  th { background: #1f4e79; color: #fff; text-align: left; font-weight: 600; }
  th, td { border: 1px solid #9fb3c8; padding: 1.5mm 2mm; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #eef3f8; }
  tr { break-inside: avoid; }
  table:first-of-type td:first-child { white-space: nowrap; }
  code { font: 8.8pt Consolas, monospace; background: #eef1f4; padding: 0 1mm; border-radius: 2px; }
  pre.mermaid { text-align: center; break-inside: avoid; margin: 4mm 0; }
  pre.mermaid svg { max-width: 100%; height: auto; max-height: 120mm; }
  .ref { font-style: italic; }
  a { color: #2f6db3; text-decoration: none; }
</style></head><body>
<section class="cover">
  <div class="inst">Licenciatura en Sistemas de Información</div>
  <div class="course">Desarrollo de Aplicaciones Móviles · 2026</div>
  <h1>Network Diagnostics Suite</h1>
  <div class="sub">Informe técnico · TP6</div>
  <div class="meta">Subconjunto SNMP · Credenciales SSH · Cola offline<br>${escapeHtml(
    date,
  )}</div>
</section>
${body}
<script src="mermaid.min.js"></script>
<script>
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', fontFamily: 'Segoe UI, Arial, sans-serif',
    flowchart: { htmlLabels: true, useMaxWidth: true }, stateDiagram: { useMaxWidth: true } });
  mermaid.run({ querySelector: 'pre.mermaid' });
</script>
</body></html>`;
}

const browser = BROWSERS.find(path => existsSync(path));
if (!browser) {
  console.error(
    'No se encontró Chrome ni Edge. Defina CHROME_PATH con la ruta del navegador.',
  );
  process.exit(1);
}

mkdirSync(work, { recursive: true });
const html = join(work, 'informe.html');
writeFileSync(html, buildHtml(readFileSync(source, 'utf8')));
copyFileSync(
  require.resolve('mermaid/dist/mermaid.min.js'),
  join(work, 'mermaid.min.js'),
);

const startedAt = Date.now();
// virtual-time-budget deja que Mermaid termine de dibujar antes de imprimir.
const result = spawnSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--virtual-time-budget=20000',
    `--user-data-dir=${join(work, 'profile')}`,
    `--print-to-pdf=${output}`,
    pathToFileURL(html).href,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
if (
  result.status !== 0 ||
  !existsSync(output) ||
  statSync(output).mtimeMs < startedAt
) {
  console.error(result.stderr?.toString() || 'El navegador no generó el PDF.');
  process.exit(1);
}
console.log(
  `PDF generado: ${output} (${Math.round(statSync(output).size / 1024)} KB)`,
);
