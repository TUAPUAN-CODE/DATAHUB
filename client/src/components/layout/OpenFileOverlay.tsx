import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useUi } from '@/store/ui';
import { FileGlyph } from '../files/icons';

/** The "file opening" moment: the clicked card expands into the workspace, then dissolves. */
export function OpenFileOverlay() {
  const t = useUi((s) => s.openTransition);
  const clear = () => useUi.getState().setOpenTransition(null);
  const [target, setTarget] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!t) return;
    const main = document.getElementById('main-panel');
    setTarget(main ? main.getBoundingClientRect() : new DOMRect(0, 0, window.innerWidth, window.innerHeight));
    const id = setTimeout(clear, 900);
    return () => clearTimeout(id);
  }, [t]);

  return (
    <AnimatePresence>
      {t && target && (
        <motion.div key="open" className="pointer-events-none fixed z-[800] flex items-center justify-center overflow-hidden"
          initial={{ top: t.rect.y, left: t.rect.x, width: t.rect.w, height: t.rect.h, borderRadius: 16, opacity: 1 }}
          animate={{ top: target.top, left: target.left, width: target.width, height: target.height, borderRadius: 28, opacity: [1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.62, ease: [0.2, 0.8, 0.2, 1], opacity: { times: [0, 0.6, 1], duration: 0.62 } }}
          style={{ background: `color-mix(in srgb, ${t.color} 10%, rgb(var(--c-bg)))` }}>
          <motion.div className="flex flex-col items-center gap-3" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.08 }}>
            <FileGlyph color={t.color} size={56} />
            <span className="max-w-[60vw] truncate text-lg font-semibold">{t.name}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function playOpenFile(el: HTMLElement | null, color: string, name: string) {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  useUi.getState().setOpenTransition({ rect: { x: r.left, y: r.top, w: r.width, h: r.height }, color, name });
}
