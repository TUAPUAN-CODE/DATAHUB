const cache = new Map<string, Promise<string | null>>();

/** Fetches an image and returns a JPEG/PNG data URL that pdfmake can embed (webp / gif are converted) */
export function imageDataUrl(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  if (!cache.has(url)) {
    cache.set(url, (async () => {
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) return null;
        const blob = await r.blob();
        const bmp = await createImageBitmap(blob);
        const max = 1600;
        const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
        const g = c.getContext('2d')!;
        const png = blob.type === 'image/png' || blob.type === 'image/webp' || blob.type === 'image/gif';
        if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(bmp, 0, 0, c.width, c.height);
        return png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
      } catch { return null; }
    })());
  }
  return cache.get(url)!;
}

export async function preloadImages(urls: string[], concurrency = 6): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(urls.filter(Boolean))];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (i < list.length) { const u = list[i++]; const d = await imageDataUrl(u); if (d) out.set(u, d); }
  }));
  return out;
}
