import { useCallback, useEffect, useState } from 'react';
import { Copy, Cpu, Plus, Printer as PrinterIcon, Trash2 } from 'lucide-react';
import { toast } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextInput, Toggle } from '@/components/ui/Inputs';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { DEFAULT_INIT_HEX, DEFAULT_START_HEX, Device, DeviceEvent, devicesApi, Printer, STATUS_LABEL } from '@/modules/devices/api';

const msg = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } }; message?: string }).response?.data?.error?.message ?? (e as Error).message;

/** Admin / master: readers and IoT senders, their state, live readings, and a simulator */
export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [gateway, setGateway] = useState(true);
  const [sel, setSel] = useState<Device | null>(null);
  const [events, setEvents] = useState<DeviceEvent[]>([]);
  const [add, setAdd] = useState(false);
  const [keyShown, setKeyShown] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', kind: 'rfid_tcp', host: '', port: '49152', initHex: '', startHex: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [sim, setSim] = useState('');
  const [busy, setBusy] = useState(false);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [pForm, setPForm] = useState<{ id: string | null; name: string; agentUrl: string; printerHost: string; printerShare: string; dotWidth: string } | null>(null);

  const load = useCallback(async () => { try { const r = await devicesApi.list(); setDevices(r.devices); setGateway(r.gateway); setSel((s) => (s ? r.devices.find((d) => d.id === s.id) ?? null : s)); } catch (e) { toast.error(e); } }, []);
  const loadPrinters = useCallback(async () => { try { setPrinters((await devicesApi.printers()).printers); } catch (e) { toast.error(e); } }, []);
  useEffect(() => { void loadPrinters(); }, [loadPrinters]);
  const savePrinter = async () => {
    if (!pForm) return;
    setBusy(true);
    try {
      const body = { name: pForm.name, agentUrl: pForm.agentUrl, printerHost: pForm.printerHost || null, printerShare: pForm.printerShare || null, dotWidth: pForm.dotWidth ? Number(pForm.dotWidth) : null };
      if (pForm.id) await devicesApi.updatePrinter(pForm.id, body); else await devicesApi.addPrinter(body);
      setPForm(null); await loadPrinters();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const testPrinter = async (p: Printer) => { try { await devicesApi.testPrinter(p.id); toast.success('ส่งสลิปทดสอบแล้ว', p.name); } catch (e) { toast.error(msg(e)); } };
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    if (!sel) { setEvents([]); return; }
    const pull = () => { if (!document.hidden) void devicesApi.events(sel.id).then((r) => setEvents(r.events)).catch(() => undefined); };
    pull();
    const t = setInterval(pull, 4000);
    return () => clearInterval(t);
  }, [sel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    setBusy(true);
    try {
      if (editId) {
        await devicesApi.update(editId, { name: form.name, host: form.host, port: Number(form.port), initHex: form.initHex, startHex: form.startHex });
      } else {
        const r = await devicesApi.create({ name: form.name, kind: form.kind, host: form.kind === 'rfid_tcp' ? form.host : null, port: form.kind === 'rfid_tcp' ? Number(form.port) : null, initHex: form.initHex || null, startHex: form.startHex || null });
        if (r.apiKey) setKeyShown(r.apiKey);
      }
      setAdd(false); setEditId(null); setForm({ name: '', kind: 'rfid_tcp', host: '', port: '49152', initHex: '', startHex: '' });
      await load();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const toggle = async (d: Device, enabled: boolean) => { try { await devicesApi.update(d.id, { enabled }); await load(); } catch (e) { toast.error(e); } };
  const remove = async (d: Device) => { if (!window.confirm(`ลบอุปกรณ์ “${d.name}” พร้อมการผูกกับชีตและประวัติการอ่าน?`)) return; try { await devicesApi.remove(d.id); setSel(null); await load(); } catch (e) { toast.error(e); } };
  const simulate = async () => {
    if (!sel || !sim.trim()) return;
    try { const r = await devicesApi.test(sel.id, sim.trim()); toast.success(r.detail || r.outcome); setSim(''); setEvents((await devicesApi.events(sel.id)).events); } catch (e) { toast.error(msg(e)); }
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-4 p-4">
      <PageHeader icon={<Cpu className="h-5 w-5" />} title="อุปกรณ์ (RFID / IoT)" subtitle="เครื่องอ่าน RFID และอุปกรณ์ที่ส่งค่าเข้าระบบ — ผูกกับชีตได้ที่ปุ่ม “อุปกรณ์” บนแถบเครื่องมือของแต่ละชีต"
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdd(true)}>เพิ่มอุปกรณ์</Button>} />
      {!gateway && <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm">ตัวเชื่อมต่อเครื่องอ่าน RFID ยังปิดอยู่ที่เซิร์ฟเวอร์ (<code>GATEWAY_ENABLED=1</code>) — อุปกรณ์แบบ HTTP ใช้ได้ปกติ. เครื่องอ่าน 1 เครื่องต่อได้โปรแกรมเดียว: เปิดเฉพาะเมื่อเลิกใช้ RFIDc1.js เดิมกับเครื่องนั้นแล้ว</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-2">
          {devices.map((d) => {
            const st = STATUS_LABEL[d.enabled && d.kind === 'rfid_tcp' && !gateway ? 'waiting' : d.status] ?? STATUS_LABEL.off;
            return (
              <div key={d.id} onClick={() => setSel(d)} className={`ds-card cursor-pointer space-y-1 p-3 ${sel?.id === d.id ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${st.cls}`} title={st.text} />
                  <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                  <span onClick={(e) => e.stopPropagation()}><Toggle checked={d.enabled} onChange={(v) => void toggle(d, v)} /></span>
                </div>
                <p className="text-xs text-muted">{d.kind === 'rfid_tcp' ? `RFID ${d.host}:${d.port}` : 'HTTP / IoT'} · {st.text} · ผูก {d.bindings} ชีต{d.lastSeen ? ` · อ่านล่าสุด ${new Date(d.lastSeen).toLocaleString('th-TH')}` : ''}</p>
                {d.lastError && d.status === 'error' && <p className="truncate text-xs text-danger">{d.lastError}</p>}
              </div>
            );
          })}
          {!devices.length && <EmptyState icon={<Cpu />} title="ยังไม่มีอุปกรณ์" description="กด “เพิ่มอุปกรณ์” เพื่อเพิ่มเครื่องอ่าน RFID หรืออุปกรณ์ HTTP" />}
        </div>
        <div className="ds-card space-y-3 p-4">
          {sel ? (
            <>
              <div className="flex items-center gap-2"><p className="flex-1 text-base font-semibold">{sel.name}</p><Button size="sm" variant="ghost" onClick={() => { setEditId(sel.id); setForm({ name: sel.name, kind: sel.kind, host: sel.host ?? '', port: String(sel.port ?? 49152), initHex: sel.initHex ?? '', startHex: sel.startHex ?? '' }); setAdd(true); }}>แก้ไข</Button><Button size="sm" variant="ghost" className="!text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => void remove(sel)}>ลบ</Button></div>
              <div className="flex gap-2">
                <TextInput value={sim} onChange={(e) => setSim(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void simulate()} placeholder="จำลองการอ่าน: พิมพ์ EPC / ค่า แล้วกด Enter" className="!h-9 flex-1 font-mono" />
                <Button size="sm" variant="secondary" onClick={() => void simulate()} disabled={!sim.trim()}>ส่งค่าทดสอบ</Button>
              </div>
              <p className="text-xs text-muted">การอ่านล่าสุด (อัปเดตทุก 4 วินาที) — ค่าซ้ำภายใน 5 วินาทีถือเป็นการอ่านเดียวกัน</p>
              <div className="max-h-[46vh] space-y-1 overflow-y-auto">
                {events.map((e) => (
                  <div key={e.id} className={`rounded-lg px-2.5 py-1.5 text-sm ${e.outcome === 'ok' ? 'bg-success/10' : e.outcome === 'error' ? 'bg-danger/10' : 'bg-ink/5'}`}>
                    <p className="flex justify-between gap-2"><span className="truncate font-mono">{e.value}</span><span className="shrink-0 text-xs text-muted">{new Date(e.at).toLocaleTimeString('th-TH')}</span></p>
                    {e.detail && <p className="text-xs text-muted">{e.detail}</p>}
                  </div>
                ))}
                {!events.length && <p className="py-6 text-center text-sm text-muted">ยังไม่มีการอ่าน</p>}
              </div>
            </>
          ) : <p className="py-10 text-center text-sm text-muted">เลือกอุปกรณ์เพื่อดูการอ่านล่าสุด</p>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2"><PrinterIcon className="h-5 w-5 text-primary" /><h2 className="flex-1 text-base font-semibold">เครื่องพิมพ์สลิป (Print Agent เดียวกับ PFCM)</h2>
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setPForm({ id: null, name: '', agentUrl: 'http://172.48.0.115:9100', printerHost: '', printerShare: '', dotWidth: '576' })}>เพิ่มเครื่องพิมพ์</Button></div>
        <p className="text-xs text-muted">ตั้งค่าเหมือน RFIDReaderConfig ของ PFCM: URL ของ Print Agent, IP/ชื่อเครื่องที่แชร์เครื่องพิมพ์ + ชื่อ share, ความกว้างจุด (80mm = 576) — แล้วเลือกเครื่องพิมพ์ให้แต่ละ “เครื่องอ่าน → ชีต” ที่ปุ่ม “อุปกรณ์” ของชีต</p>
        <div className="grid gap-2 md:grid-cols-2">
          {printers.map((p) => (
            <div key={p.id} className="ds-card space-y-1 p-3">
              <div className="flex items-center gap-2"><span className="flex-1 truncate font-medium">{p.name}</span>
                <Button size="sm" variant="ghost" onClick={() => void testPrinter(p)}>พิมพ์ทดสอบ</Button>
                <Button size="sm" variant="ghost" onClick={() => setPForm({ id: p.id, name: p.name, agentUrl: p.agentUrl, printerHost: p.printerHost ?? '', printerShare: p.printerShare ?? '', dotWidth: String(p.dotWidth ?? '') })}>แก้ไข</Button>
                <Button size="sm" variant="ghost" className="!text-danger" onClick={() => { if (window.confirm(`ลบเครื่องพิมพ์ “${p.name}”?`)) void devicesApi.removePrinter(p.id).then(loadPrinters).catch((e) => toast.error(e)); }}><Trash2 className="h-4 w-4" /></Button></div>
              <p className="text-xs text-muted">Agent {p.agentUrl}{p.printerHost ? ` · \\\\${p.printerHost}\\${p.printerShare}` : ' · เครื่องพิมพ์ default ของเครื่อง agent'}{p.dotWidth ? ` · ${p.dotWidth} จุด` : ''}</p>
            </div>
          ))}
          {!printers.length && <p className="text-sm text-muted">ยังไม่มีเครื่องพิมพ์</p>}
        </div>
      </div>
      <Modal open={!!pForm} onClose={() => setPForm(null)} size="md" title={pForm?.id ? 'แก้ไขเครื่องพิมพ์' : 'เพิ่มเครื่องพิมพ์'} footer={<><Button variant="secondary" onClick={() => setPForm(null)}>ยกเลิก</Button><Button onClick={() => void savePrinter()} loading={busy} disabled={!pForm?.name.trim() || !pForm?.agentUrl.trim()}>บันทึก</Button></>}>
        {pForm && (
          <div className="space-y-3">
            <Field label="ชื่อเครื่องพิมพ์"><TextInput value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} placeholder="เช่น เครื่องพิมพ์ห้องเย็น 1" /></Field>
            <Field label="URL ของ Print Agent" hint="เครื่องที่รัน print-agent (พอร์ต 9100)"><TextInput value={pForm.agentUrl} onChange={(e) => setPForm({ ...pForm, agentUrl: e.target.value })} className="font-mono" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="IP / ชื่อเครื่องที่แชร์เครื่องพิมพ์" hint="ว่าง = ใช้เครื่องพิมพ์ default ของเครื่อง agent"><TextInput value={pForm.printerHost} onChange={(e) => setPForm({ ...pForm, printerHost: e.target.value })} className="font-mono" placeholder="10.246.145.x" /></Field>
              <Field label="ชื่อ share"><TextInput value={pForm.printerShare} onChange={(e) => setPForm({ ...pForm, printerShare: e.target.value })} className="font-mono" placeholder="POS-80C" /></Field>
            </div>
            <Field label="ความกว้างจุด (printer_dot_width)" hint="กระดาษ 80 mm ที่ 203 dpi = 576"><TextInput type="number" value={pForm.dotWidth} onChange={(e) => setPForm({ ...pForm, dotWidth: e.target.value })} /></Field>
          </div>
        )}
      </Modal>
      <Modal open={add} onClose={() => { setAdd(false); setEditId(null); }} size="md" title={editId ? 'แก้ไขอุปกรณ์' : 'เพิ่มอุปกรณ์'} footer={<><Button variant="secondary" onClick={() => { setAdd(false); setEditId(null); }}>ยกเลิก</Button><Button onClick={create} loading={busy} disabled={!form.name.trim() || (form.kind === 'rfid_tcp' && (!form.host.trim() || !form.port))}>{editId ? 'บันทึก' : 'เพิ่ม'}</Button></>}>
        <div className="space-y-3">
          <Field label="ชื่ออุปกรณ์"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น Reader ห้องเย็น 1" /></Field>
          <Field label="ชนิด"><Select disabled={!!editId} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="rfid_tcp">เครื่องอ่าน RFID (TCP)</option><option value="http">HTTP / IoT (ส่งค่าเข้ามาเอง)</option></Select></Field>
          {form.kind === 'rfid_tcp' && <div className="grid grid-cols-[1fr_8rem] gap-2"><Field label="IP"><TextInput value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className="font-mono" /></Field><Field label="พอร์ต"><TextInput type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></Field></div>}
          {form.kind === 'rfid_tcp' && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">ขั้นสูง: คำสั่งเริ่มอ่านของเครื่องอ่าน (เลขฐาน 16)</summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted">ส่งให้เครื่องอ่านทุกครั้งที่เชื่อมต่อ เพื่อให้เริ่มส่งแท็ก (ค่าว่าง = ใช้ค่าเดียวกับ PFCM เดิม ไม่ต้องกรอก) — EPC ที่อ่านได้ระบบแยกเป็น hex ให้เอง</p>
                <Field label="คำสั่งที่ 1 (ระบบเติม checksum ให้)"><TextInput value={form.initHex} onChange={(e) => setForm({ ...form, initHex: e.target.value })} placeholder={DEFAULT_INIT_HEX} className="font-mono" /></Field>
                <Field label="คำสั่งที่ 2 (ส่งตามที่พิมพ์)"><TextInput value={form.startHex} onChange={(e) => setForm({ ...form, startHex: e.target.value })} placeholder={DEFAULT_START_HEX} className="font-mono" /></Field>
              </div>
            </details>
          )}
          <p className="text-xs text-muted">อุปกรณ์ที่เพิ่มใหม่จะ “ปิดอยู่” จนกว่าจะเปิดสวิตช์</p>
        </div>
      </Modal>
      <Modal open={!!keyShown} onClose={() => setKeyShown(null)} size="md" title="คีย์ของอุปกรณ์ (แสดงครั้งเดียว)" footer={<Button onClick={() => setKeyShown(null)}>รับทราบ</Button>}>
        <div className="space-y-2 text-sm">
          <p>ให้อุปกรณ์ส่ง <code>POST /api/devices/ingest</code> พร้อม header <code>X-Device-Key</code> และ body <code>{'{"value":"…"}'}</code></p>
          <div className="flex items-center gap-2 rounded-lg bg-ink/5 p-2"><code className="min-w-0 flex-1 break-all">{keyShown}</code><Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => { void navigator.clipboard.writeText(keyShown ?? ''); toast.success('คัดลอกแล้ว'); }}>คัดลอก</Button></div>
          <p className="text-xs text-danger">เก็บคีย์นี้ให้ปลอดภัย — ระบบเก็บเฉพาะค่าแฮช ดูซ้ำไม่ได้ (ถ้าหายให้ลบแล้วเพิ่มอุปกรณ์ใหม่)</p>
        </div>
      </Modal>
    </div>
  );
}
