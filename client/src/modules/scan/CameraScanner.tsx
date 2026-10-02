import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, FlipHorizontal2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';


type Facing = 'environment' | 'user';
const KEY = 'scan.camera';
const readPref = (): Facing => { try { return localStorage.getItem(KEY) === 'user' ? 'user' : 'environment'; } catch { return 'environment'; } };
const savePref = (f: Facing) => { try { localStorage.setItem(KEY, f); } catch { /* private window: fine */ } };

/**
 * Camera QR reader: back camera first, a button flips front / back, torch when the phone has one.
 * Keeps scanning until closed; the same text is not handed over twice within 2.5 s, and nothing is handed over while `busy`.
 * The browser allows the camera only on https:// or localhost — the message below explains it when it is blocked.
 */
export function CameraScanner({ onText, busy = false, onClose, onFail }: { onText: (text: string) => void; busy?: boolean; onClose?: () => void; onFail?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<import('qr-scanner').default | null>(null);
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const busyRef = useRef(busy);
  const cb = useRef(onText);
  busyRef.current = busy; cb.current = onText;
  const [facing, setFacing] = useState<Facing>(readPref);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState<{ has: boolean; on: boolean }>({ has: false, on: false });
  const [cams, setCams] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('เบราว์เซอร์เปิดกล้องได้เฉพาะหน้าเว็บที่เป็น https:// (หรือ localhost) — ตอนนี้ใช้ http:// ซึ่งกล้องถูกบล็อก ให้ผู้ดูแลเปิด HTTPS ให้ระบบ หรือใช้เครื่องสแกนแทน');
      return;
    }
    let dead = false;
    void (async () => {
      try {
        const { default: QrScanner } = await import('qr-scanner');
        if (dead || !video.current) return;
        if (!(await QrScanner.hasCamera())) { setError('ไม่พบกล้องในเครื่องนี้'); return; }
        const s = new QrScanner(video.current, (r) => {
          const text = r.data?.trim();
          if (!text || busyRef.current) return;
          const now = Date.now();
          if (text === last.current.text && now - last.current.at < 2500) return;
          last.current = { text, at: now };
          try { navigator.vibrate?.(60); } catch { /* not supported */ }
          cb.current(text);
        }, { preferredCamera: readPref(), returnDetailedScanResult: true, highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8 });
        scanner.current = s;
        await s.start();
        if (dead) { s.destroy(); return; }
        setReady(true);
        setCams((await QrScanner.listCameras(false)).length);
        setFlash({ has: await s.hasFlash().catch(() => false), on: false });
      } catch (e) {
        const n = (e as { name?: string })?.name ?? String(e);
        setError(n === 'NotAllowedError' || /permission|denied/i.test(String(e)) ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — กดไอคอนกุญแจ/กล้องที่แถบที่อยู่ของเบราว์เซอร์แล้วเลือก “อนุญาต”' : n === 'NotFoundError' ? 'ไม่พบกล้องในเครื่องนี้' : `เปิดกล้องไม่สำเร็จ (${n}) — ลองปิดโปรแกรมอื่นที่ใช้กล้องอยู่`);
      }
    })();
    return () => { dead = true; scanner.current?.destroy(); scanner.current = null; };
  }, []);

  const flip = async () => {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    try { await scanner.current?.setCamera(next); setFacing(next); savePref(next); setFlash({ has: (await scanner.current?.hasFlash().catch(() => false)) ?? false, on: false }); } catch { setError('สลับกล้องไม่สำเร็จ'); }
  };
  const torch = async () => { try { await scanner.current?.toggleFlash(); setFlash((f) => ({ ...f, on: !!scanner.current?.isFlashOn() })); } catch { /* ignore */ } };

  if (error) {
    return (
      <div className="space-y-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
        <p className="flex items-start gap-2 text-danger"><CameraOff className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>
        {(onFail ?? onClose) && <Button size="sm" variant="secondary" onClick={onFail ?? onClose}>ปิด (ใช้เครื่องสแกนแทน)</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={video} className="mx-auto max-h-[42vh] w-full object-cover" muted playsInline />
        {!ready && <p className="absolute inset-0 grid place-items-center text-sm text-white/80">กำลังเปิดกล้อง…</p>}
        {busy && <p className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-xs text-white">กำลังบันทึก…</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={<FlipHorizontal2 className="h-4 w-4" />} onClick={() => void flip()} disabled={!ready || cams < 2}>
          {facing === 'environment' ? 'สลับเป็นกล้องหน้า' : 'สลับเป็นกล้องหลัง'}
        </Button>
        {flash.has && <Button size="sm" variant="secondary" icon={<Zap className="h-4 w-4" />} onClick={() => void torch()}>{flash.on ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย'}</Button>}
        {onClose && <Button size="sm" variant="ghost" icon={<CameraOff className="h-4 w-4" />} onClick={onClose}>ปิดกล้อง</Button>}
        <span className="text-xs text-muted">เล็ง QR ให้อยู่ในกรอบ สแกนต่อเนื่องได้</span>
      </div>
    </div>
  );
}

const OPEN_KEY = 'scan.cameraOpen';
/** Opens by itself the first time; once the user closes the camera (to use a scanner device) it stays closed on this device */
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) !== 'off'; } catch { return true; } };
const saveOpen = (v: boolean) => { try { localStorage.setItem(OPEN_KEY, v ? 'on' : 'off'); } catch { /* private window: fine */ } };

/** Camera reader under an input — opens as soon as the dialog opens (the scanner device keeps working in the input as before) */
export function CameraBox({ onText, busy }: { onText: (text: string) => void; busy?: boolean }) {
  const [open, setOpen] = useState(readOpen);
  const choose = (v: boolean) => { setOpen(v); saveOpen(v); };
  return open
    ? <CameraScanner onText={onText} busy={busy} onClose={() => choose(false)} onFail={() => setOpen(false)} />
    : <Button size="sm" variant="secondary" icon={<Camera className="h-4 w-4" />} onClick={() => choose(true)}>เปิดกล้องสแกน</Button>;
}
