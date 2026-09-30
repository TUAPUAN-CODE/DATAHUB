import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export type Anchor = HTMLElement | { x: number; y: number } | null;

export function Popover({
  open, onClose, anchor, children, placement = 'bottom-start', width, className, offset = 6,
}: {
  open: boolean; onClose: () => void; anchor: Anchor; children: ReactNode; placement?: 'bottom-start' | 'bottom-end';
  width?: number; className?: string; offset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const update = () => {
      const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
      const el = ref.current;
      const w = el?.offsetWidth ?? width ?? 240;
      const h = el?.offsetHeight ?? 240;
      let left = placement === 'bottom-end' ? r.right - w : r.left;
      let top = r.bottom + offset;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      if (left < 8) left = 8;
      if (top + h > window.innerHeight - 8) top = r.top - h - offset > 8 ? r.top - h - offset : Math.max(8, window.innerHeight - h - 8);
      setPos({ top, left });
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchor, placement, width, offset]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor instanceof HTMLElement && anchor.contains(t)) return;
      if ((t as HTMLElement).closest?.('[data-popover-keep]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div ref={ref} data-popover-keep
          style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, zIndex: 1000 }}
          initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.13 }}
          className={cn('ds-card overflow-hidden !shadow-[0_18px_40px_-12px_rgb(16_24_40/.28)]', className)}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.fullscreenElement ?? document.body, // inside the top layer while a page is full screen
  );
}

export interface MenuItemDef {
  label?: string; icon?: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; divider?: boolean; hint?: string; active?: boolean;
}
export function MenuList({ items, onClose }: { items: MenuItemDef[]; onClose: () => void }) {
  return (
    <div className="py-1.5" role="menu">
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="my-1.5 h-px bg-line" />
        ) : (
          <button key={i} role="menuitem" disabled={it.disabled}
            onClick={() => { onClose(); it.onClick?.(); }}
            className={cn('flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors disabled:opacity-40',
              it.danger ? 'text-danger hover:bg-danger/10' : it.active ? 'bg-primary/10 text-primary' : 'hover:bg-ink/5')}>
            <span className="grid w-4 place-items-center [&>svg]:h-4 [&>svg]:w-4">{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className="text-[11px] text-muted">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/** Button that opens a menu */
export function useMenu() {
  const [anchor, setAnchor] = useState<Anchor>(null);
  return { anchor, open: !!anchor, openAt: setAnchor, close: () => setAnchor(null) };
}
