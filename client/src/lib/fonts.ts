export interface FontDef { family: string; category: 'thai' | 'sans' | 'serif' | 'display' | 'mono'; weights: string }

/** Curated Google Fonts. Thai-capable families first. Any other Google Font name can be typed in. */
export const FONTS: FontDef[] = [
  { family: 'Prompt', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Kanit', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Sarabun', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Noto Sans Thai', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'IBM Plex Sans Thai', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Anuphan', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Bai Jamjuree', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Mitr', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Chakra Petch', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'K2D', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Krub', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Niramit', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Athiti', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Mali', category: 'thai', weights: '300;400;500;600;700' },
  { family: 'Noto Serif Thai', category: 'serif', weights: '300;400;500;600;700' },
  { family: 'Pridi', category: 'serif', weights: '300;400;500;600;700' },
  { family: 'Taviraj', category: 'serif', weights: '300;400;500;600;700' },
  { family: 'Trirong', category: 'serif', weights: '300;400;500;600;700' },
  { family: 'Itim', category: 'display', weights: '400' },
  { family: 'Sriracha', category: 'display', weights: '400' },
  { family: 'Chonburi', category: 'display', weights: '400' },
  { family: 'Pattaya', category: 'display', weights: '400' },
  { family: 'Inter', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Poppins', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Plus Jakarta Sans', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Manrope', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'DM Sans', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Outfit', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Figtree', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Work Sans', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Montserrat', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Nunito', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Rubik', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Open Sans', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Source Sans 3', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Space Grotesk', category: 'sans', weights: '300;400;500;600;700' },
  { family: 'Lato', category: 'sans', weights: '300;400;700' },
  { family: 'Roboto', category: 'sans', weights: '300;400;500;700' },
  { family: 'Merriweather', category: 'serif', weights: '300;400;700' },
  { family: 'Playfair Display', category: 'serif', weights: '400;500;600;700' },
  { family: 'JetBrains Mono', category: 'mono', weights: '300;400;500;600;700' },
  { family: 'IBM Plex Mono', category: 'mono', weights: '300;400;500;600;700' },
];

const enc = (f: string) => f.trim().replace(/\s+/g, '+');

export function fontUrl(family: string) {
  const def = FONTS.find((f) => f.family.toLowerCase() === family.toLowerCase());
  return def
    ? `https://fonts.googleapis.com/css2?family=${enc(def.family)}:wght@${def.weights}&display=swap`
    : `https://fonts.googleapis.com/css2?family=${enc(family)}&display=swap`;
}

/** Loads the main UI font (replaces the previous one) */
export function loadMainFont(family: string) {
  if (family.trim().toLowerCase() === 'prompt') { document.getElementById('gf-main')?.remove(); return; } // bundled with the app (no request to Google)
  let link = document.getElementById('gf-main') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = 'gf-main';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  const href = fontUrl(family);
  if (link.href !== href) link.href = href;
}

/** Loads a font for any extra use (dashboard text widgets) without replacing the main font */
export function ensureFont(family: string) {
  const id = `gf-${enc(family).toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = fontUrl(family);
  document.head.appendChild(link);
}

/** Tiny subset load (only the glyphs of the preview text) for the font picker list */
export function loadPreviewFont(family: string, text: string) {
  const id = `gfp-${enc(family).toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${enc(family)}&text=${encodeURIComponent(text)}&display=swap`;
  document.head.appendChild(link);
}
