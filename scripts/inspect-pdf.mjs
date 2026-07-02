// Inspect the wordbook PDF: determine if it's text-based, and sample the layout.
// Run: node scripts/inspect-pdf.mjs
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "node:fs";

const PDF = "2027考研英语红宝书（乱序版）中文词表.pdf";
const data = new Uint8Array(readFileSync(PDF));
const doc = await getDocument({ data }).promise;

console.log(`# Pages: ${doc.numPages}`);

for (const p of [1, 2, doc.numPages]) {
  const page = await doc.getPage(p);
  const content = await page.getTextContent();
  console.log(`\n===== PAGE ${p}  (items=${content.items.length}) =====`);

  // Print text in reading order (pdfjs gives items with transform; sort by y desc, x asc)
  const items = content.items
    .map((it) => ({ text: it.str, x: it.transform[4], y: it.transform[5], h: it.height || 0, font: it.fontName }))
    .filter((it) => it.text.trim().length > 0);

  // group by row (same y within tolerance)
  const rows = {};
  for (const it of items) {
    const key = Math.round(it.y);
    if (!rows[key]) rows[key] = [];
    rows[key].push(it);
  }
  const ys = Object.keys(rows).map(Number).sort((a, b) => b - a); // top to bottom
  for (const y of ys) {
    const row = rows[y].sort((a, b) => a.x - b.x);
    const line = row.map((it) => it.text).join("");
    console.log(`y=${y}  |  ${line}`);
  }
}
