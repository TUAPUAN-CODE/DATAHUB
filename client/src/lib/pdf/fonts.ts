import { PDF_FONTS, PdfFont } from './types';

const FILES: Record<PdfFont, { normal: string; bold: string; italics?: string; bolditalics?: string }> = {
  Sarabun: { normal: 'Sarabun-Regular.ttf', bold: 'Sarabun-Bold.ttf', italics: 'Sarabun-Italic.ttf', bolditalics: 'Sarabun-BoldItalic.ttf' },
  Prompt: { normal: 'Prompt-Regular.ttf', bold: 'Prompt-Bold.ttf' },
  Kanit: { normal: 'Kanit-Regular.ttf', bold: 'Kanit-Bold.ttf' },
};

const cache = new Map<string, Promise<string>>();
async function b64(file: string): Promise<string> {
  if (!cache.has(file)) {
    cache.set(file, fetch(`/fonts/${file}`).then(async (r) => {
      if (!r.ok) throw new Error(`โหลดฟอนต์ ${file} ไม่สำเร็จ`);
      const buf = new Uint8Array(await r.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }).catch((e) => { cache.delete(file); throw e; }));
  }
  return cache.get(file)!;
}

/** Loads pdfmake once and registers the Thai fonts that the template uses */
let lib: Promise<any> | null = null;
export async function loadPdfMake(fonts: PdfFont[]) {
  if (!lib) {
    lib = import('pdfmake/build/pdfmake').then((m: any) => {
      const pm = m.default ?? m;
      try { pm.setUrlAccessPolicy?.(() => false); pm.setLocalAccessPolicy?.(() => false); } catch { /* older builds */ }
      return pm;
    });
  }
  const pm = await lib;
  const vfs: Record<string, string> = {};
  const defs: Record<string, Record<string, string>> = {};
  for (const f of new Set<PdfFont>([...fonts, 'Sarabun'])) {
    const spec = FILES[PDF_FONTS.includes(f) ? f : 'Sarabun'];
    const entry: Record<string, string> = {};
    for (const [style, file] of Object.entries(spec)) { if (file) { vfs[file] = await b64(file); entry[style] = file; } }
    // fonts without italic files fall back to the upright face
    entry.italics ??= spec.normal; entry.bolditalics ??= spec.bold;
    defs[f] = entry;
  }
  pm.addVirtualFileSystem(vfs);
  pm.addFonts(defs);
  return pm;
}
