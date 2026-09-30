import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useUi } from '@/store/ui';
import { Button } from './Button';
import { Modal } from './Modal';

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="ds-card pointer-events-auto flex items-start gap-3 p-3.5 !shadow-[0_16px_36px_-12px_rgb(16_24_40/.3)]">
            <span className="mt-0.5">
              {t.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-success" /> : t.type === 'error' ? <XCircle className="h-5 w-5 text-danger" /> : <Info className="h-5 w-5 text-primary" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.message && <p className="mt-0.5 line-clamp-3 text-[13px] text-muted">{t.message}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="ปิด"><X className="h-4 w-4" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ConfirmHost() {
  const c = useUi((s) => s.confirmState);
  const close = (v: boolean) => {
    c?.resolve(v);
    useUi.setState({ confirmState: null });
  };
  return (
    <Modal open={!!c} onClose={() => close(false)} size="sm" title={c?.title} description={c?.message}
      icon={c?.danger ? <AlertTriangle className="h-5 w-5 text-danger" /> : <Info className="h-5 w-5" />}
      footer={<>
        <Button variant="secondary" onClick={() => close(false)}>{c?.cancelText ?? 'ยกเลิก'}</Button>
        <Button variant={c?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{c?.confirmText ?? 'ยืนยัน'}</Button>
      </>} />
  );
}
