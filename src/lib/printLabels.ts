import type { Book, Copy } from '@/types/models';
import { code128Svg, escapeXml } from './code128';

/**
 * Opens a print-ready sheet of spine/inside-cover labels (3 per row on A4/Letter).
 * Returns false if the browser blocked the print window.
 */
export function printCopyLabels(items: { copy: Copy; book: Book }[], libraryName: string): boolean {
  const labels = items.map(({ copy, book }) => `
    <div class="label">
      <div class="lib">${escapeXml(libraryName)}</div>
      <div class="title">${escapeXml(book.title)}</div>
      ${code128Svg(copy.barcode, { height: 46, module: 1.6 })}
      <div class="code">${escapeXml(copy.barcode)}</div>
      <div class="shelf">Shelf ${escapeXml(copy.shelfLocation)}</div>
    </div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>LIBRAX labels</title>
<style>
  @page { margin: 10mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; margin: 0; color: #111; }
  .sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
  .label { border: 1px dashed #bbb; border-radius: 2mm; padding: 3mm; text-align: center; break-inside: avoid; }
  .label svg { width: 100%; height: auto; max-height: 16mm; }
  .lib { font-size: 7pt; letter-spacing: .08em; text-transform: uppercase; color: #666; }
  .title { font-size: 8.5pt; font-weight: 600; margin: 1mm 0 1.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .code { font-family: ui-monospace, Menlo, monospace; font-size: 9pt; letter-spacing: .06em; }
  .shelf { font-size: 7.5pt; color: #444; }
  .hint { font-size: 10pt; color: #555; margin: 0 0 4mm; }
  @media print { .hint { display: none; } }
</style></head><body>
<p class="hint">${items.length} label${items.length === 1 ? '' : 's'} · Print at 100% scale, then stick each label inside the matching copy.</p>
<div class="sheet">${labels}</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 150); });</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}

/** Opens a print-ready sheet of credit-card-sized library cards (2 per row). */
export function printMemberCards(
  members: { name: string; memberNo: string; type: string; department: string }[],
  libraryName: string,
): boolean {
  const cards = members.map((m) => `
    <div class="card">
      <div class="top"><span class="lib">${escapeXml(libraryName)}</span><span class="type">${escapeXml(m.type)}</span></div>
      <div class="name">${escapeXml(m.name)}</div>
      <div class="dept">${escapeXml(m.department)}</div>
      <div class="bc">${code128Svg(m.memberNo, { height: 44, module: 1.6 })}</div>
      <div class="code">${escapeXml(m.memberNo)}</div>
    </div>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>LIBRAX library cards</title>
<style>
  @page { margin: 10mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; margin: 0; color: #111; }
  .sheet { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 6mm; }
  .card { width: 85.6mm; height: 54mm; box-sizing: border-box; border: 1px solid #ccc; border-radius: 3mm; padding: 4mm 5mm; display: flex; flex-direction: column; break-inside: avoid; background: linear-gradient(135deg, #fbf7ef, #fff); }
  .top { display: flex; justify-content: space-between; font-size: 7pt; letter-spacing: .1em; text-transform: uppercase; color: #8a6420; font-weight: 700; }
  .name { font-family: Georgia, serif; font-size: 13pt; margin-top: 3mm; }
  .dept { font-size: 8pt; color: #555; }
  .bc { margin-top: auto; background: #fff; text-align: center; }
  .bc svg { width: 100%; height: 13mm; }
  .code { text-align: center; font-family: ui-monospace, Menlo, monospace; font-size: 9pt; letter-spacing: .08em; }
  .hint { font-size: 10pt; color: #555; margin: 0 0 5mm; }
  @media print { .hint { display: none; } }
</style></head><body>
<p class="hint">${members.length} card${members.length === 1 ? '' : 's'} · Print at 100% scale, or hold this screen up to the camera to sign in.</p>
<div class="sheet">${cards}</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 200); });</script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=760');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
