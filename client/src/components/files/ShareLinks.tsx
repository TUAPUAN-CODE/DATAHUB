import { useState } from 'react';
import { Check, Copy, Globe, Link2, Plus, Trash2, UserRound } from 'lucide-react';
import { shareApi, ShareLink } from '@/api/endpoints';
import { useLoad } from '@/hooks';
import { fmtDateTime } from '@/lib/format';
import { toast } from '@/store/ui';
import { Button } from '../ui/Button';
import { Select, Toggle } from '../ui/Inputs';

export const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

/** Works on plain-HTTP intranet hosts too, where navigator.clipboard is unavailable */
export async function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  return ok;
}

const PERM_OPTS = [{ v: 'read', label: 'ดูข้อมูล' }, { v: 'write', label: 'กรอก/แก้ไขข้อมูล' }, { v: 'manage', label: 'จัดการ' }];
const EXP = [{ v: '', label: 'ไม่หมดอายุ' }, { v: '1', label: '1 วัน' }, { v: '7', label: '7 วัน' }, { v: '30', label: '30 วัน' }, { v: '90', label: '90 วัน' }];

function LinkRow({ l, onChanged }: { l: ShareLink; onChanged: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(l.token);
  const copy = async () => {
    if (await copyText(url)) { setCopied(true); toast.success('คัดลอกลิงก์แล้ว'); setTimeout(() => setCopied(false), 1800); }
    else toast.error('คัดลอกไม่สำเร็จ กรุณาคัดลอกลิงก์ด้วยตัวเอง');
  };
  const update = async (p: Partial<Pick<ShareLink, 'permission' | 'allowGuest'>>) => {
    try { await shareApi.update(l.id, { permission: p.permission ?? l.permission, allowGuest: p.allowGuest ?? l.allowGuest }); onChanged(); } catch (e) { toast.error(e); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="ds-input h-9 min-w-0 flex-1 px-3 text-xs" aria-label="ลิงก์แชร์" />
        <Button size="sm" variant="secondary" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy}>{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</Button>
        <button onClick={async () => { try { await shareApi.revoke(l.id); toast.success('ยกเลิกลิงก์แล้ว'); onChanged(); } catch (e) { toast.error(e); } }}
          className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" aria-label="ยกเลิกลิงก์" title="ยกเลิกลิงก์"><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-muted" />ผู้มีบัญชี:
          <Select value={l.permission} onChange={(e) => void update({ permission: e.target.value as ShareLink['permission'] })} className="w-40 [&>select]:!h-8 [&>select]:text-xs">
            {PERM_OPTS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </Select>
        </label>
        <Toggle checked={l.allowGuest} onChange={(v) => void update({ allowGuest: v })} label={<span className="inline-flex items-center gap-1 text-xs"><Globe className="h-3.5 w-3.5 text-muted" />ผู้ไม่มีบัญชีดูได้</span>} />
        <span className="ml-auto text-muted">เปิด {l.accessCount} ครั้ง{l.expiresAt ? ` · ${l.expired ? 'หมดอายุแล้ว' : `หมดอายุ ${fmtDateTime(l.expiresAt)}`}` : ''}</span>
      </div>
    </div>
  );
}

/** Shareable links for one file: anyone with the link can view; signed-in users get the chosen permission */
export function ShareLinksSection({ fileId }: { fileId: string }) {
  const { data, loading, reload } = useLoad(() => shareApi.list(fileId), [fileId]);
  const [perm, setPerm] = useState<ShareLink['permission']>('read');
  const [guest, setGuest] = useState(true);
  const [exp, setExp] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const l = await shareApi.create(fileId, { permission: perm, allowGuest: guest, expiresAt: exp ? new Date(Date.now() + Number(exp) * 86400_000).toISOString() : null });
      await copyText(shareUrl(l.token));
      toast.success('สร้างลิงก์และคัดลอกแล้ว');
      void reload(true);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <section className="mb-5 rounded-2xl border border-primary/20 bg-primary/[.04] p-3">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" />แชร์ด้วยลิงก์</p>
      <p className="mb-3 text-xs text-muted">ผู้ไม่มีบัญชีจะ<b>ดูได้อย่างเดียว</b> · ผู้ที่เข้าสู่ระบบแล้วจะได้สิทธิ์ตามที่เลือก (ผู้ใช้ระดับ User ได้สูงสุด “กรอก/แก้ไขข้อมูล”)</p>
      <div className="space-y-2">
        {loading && !data && <div className="skeleton h-16" />}
        {data?.map((l) => <LinkRow key={l.id} l={l} onChanged={() => void reload(true)} />)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={perm} onChange={(e) => setPerm(e.target.value as ShareLink['permission'])} className="w-44 [&>select]:!h-9 [&>select]:text-sm">
          {PERM_OPTS.map((o) => <option key={o.v} value={o.v}>ผู้มีบัญชี: {o.label}</option>)}
        </Select>
        <Select value={exp} onChange={(e) => setExp(e.target.value)} className="w-32 [&>select]:!h-9 [&>select]:text-sm">{EXP.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</Select>
        <Toggle checked={guest} onChange={setGuest} label={<span className="text-xs">ผู้ไม่มีบัญชีดูได้</span>} />
        <Button size="sm" className="ml-auto" icon={<Plus className="h-4 w-4" />} onClick={create} loading={busy}>สร้างลิงก์ใหม่</Button>
      </div>
    </section>
  );
}
