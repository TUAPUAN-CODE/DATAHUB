import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, User as UserIcon } from 'lucide-react';
import { apiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Inputs';
import { useAuth } from '@/store/auth';

export default function LoginPage() {
  const login = useAuth((s) => s.login);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(username.trim(), password);
      nav(loc.state?.from ?? '/', { replace: true });
    } catch (e2) {
      setErr(apiError(e2).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]" style={{ background: 'rgb(var(--c-bg))' }}>
      <div className="relative hidden overflow-hidden bg-primary p-12 text-white lg:flex lg:flex-col">
        <svg className="absolute inset-0 h-full w-full opacity-[.12]" aria-hidden>
          <defs><pattern id="g" width="56" height="36" patternUnits="userSpaceOnUse"><path d="M56 0H0V36" fill="none" stroke="white" strokeWidth="1" /></pattern></defs>
          <rect width="100%" height="100%" fill="url(#g)" />
        </svg>
        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-primary">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h9M10 4v16" /></svg>
          </span>
          <span className="text-lg font-semibold">DataSheet Pro</span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight">ข้อมูลทั้งทีม<br />อยู่ในตารางเดียว</h1>
          <p className="mt-4 text-white/80">ออกแบบฟอร์มเอกสาร กำหนดชนิดข้อมูลทุกคอลัมน์ ควบคุมสิทธิ์รายไฟล์ ย้อนดูได้ทุกการแก้ไข และสร้างแดชบอร์ดจากข้อมูลจริง</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="ds-card ds-card-pad w-full max-w-sm !p-8">
          <h2 className="text-2xl font-semibold">เข้าสู่ระบบ</h2>
          <p className="mt-1 text-sm text-muted">ใช้ชื่อผู้ใช้หรืออีเมลขององค์กร</p>
          <div className="mt-6 space-y-4">
            <Field label="ชื่อผู้ใช้หรืออีเมล">
              <TextInput icon={<UserIcon />} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            </Field>
            <Field label="รหัสผ่าน">
              <div className="ds-input flex h-10 items-center gap-2 px-3">
                <Lock className="h-4 w-4 text-muted" />
                <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
                <button type="button" onClick={() => setShow(!show)} className="text-muted hover:text-ink" aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {err && <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</motion.p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>เข้าสู่ระบบ</Button>
          </div>
          {import.meta.env.DEV && (
            <p className="mt-6 rounded-lg bg-ink/5 px-3 py-2 text-xs text-muted">บัญชีทดลอง: admin / Admin@123 · master / Master@123 · user / User@1234</p>
          )}
        </motion.form>
      </div>
    </div>
  );
}
