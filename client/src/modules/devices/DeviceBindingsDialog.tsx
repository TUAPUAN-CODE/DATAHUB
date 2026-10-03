import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Cpu, Printer as PrinterIcon } from 'lucide-react';
import type { ScanProfile } from '@/api/endpoints';
import { toast } from '@/store/ui';
import type { Column } from '@/types';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { Field, Select, TextInput, Toggle } from '@/components/ui/Inputs';
import { devicesApi, SheetDevice, SlipCfg, STATUS_LABEL } from './api';

/** The "รับจากอุปกรณ์" switch of a sheet: which devices write into it, with which QR format, and which printer prints the slip */
export function DeviceBindingsDialog({ open, onClose, sheetId, profiles, columns }: { open: boolean; onClose: () => void; sheetId: string; profiles: ScanProfile[]; columns: Column[] }) {
  const [list, setList] = useState<SheetDevice[]>([]);
  const [printers, setPrinters] = useState<{ id: string; name: string }[]>([]);
  const [cooldown, setCooldown] = useState('0');
  const [openSlip, setOpenSlip] = useState<string | null>(null);
  const load = useCallback(async () => { try { const r = await devicesApi.forSheet(sheetId); setList(r.devices); setPrinters(r.printers); setCooldown(String(r.cooldownMin)); } catch (e) { toast.error(e); } }, [sheetId]);
  const saveCooldown = async () => { try { await devicesApi.saveCooldown(sheetId, Math.max(0, Number(cooldown) || 0)); toast.success('บันทึกเวลารอแล้ว'); } catch (e) { toast.error(e); } };
  useEffect(() => { if (open) void load(); }, [open, load]);
  const save = async (d: SheetDevice, patch: Partial<{ enabled: boolean; profileId: string | null; printerId: string | null; slip: SlipCfg | null }>) => {
    const next = { enabled: d.enabled, profileId: d.profileId, printerId: d.printerId, slip: d.slip, ...patch };
    try { await devicesApi.bind(sheetId, d.id, next); await load(); } catch (e) { toast.error(e); }
  };
  const times = columns.filter((c) => c.dataType === 'datetime' || c.dataType === 'date');
  return (
    <Modal open={open} onClose={onClose} size="lg" icon={<Cpu className="h-5 w-5" />} title="รับข้อมูลจากอุปกรณ์" description="เมื่ออุปกรณ์อ่านค่าได้ ระบบจะเพิ่ม/อัปเดตแถวในชีตนี้ตามรูปแบบ QR ที่เลือก (ทำงานแม้ไม่มีใครเปิดหน้านี้ — ในนามของคนที่เปิดสวิตช์) และพิมพ์สลิปที่เครื่องพิมพ์ที่เลือกได้">
      <div className="space-y-2">
        <Field label="ไม่อ่านการ์ดเดิมซ้ำภายใน (นาที)" hint="ใช้ร่วมกันทุกเครื่องอ่านที่เขียนเข้าชีตนี้ — การ์ดใบเดียวกันที่เครื่องไหนอ่านก่อน เครื่องอื่นจะข้ามจนกว่าจะครบเวลา (0 = ไม่กัน, ทศนิยมได้ เช่น 0.5)">
          <div className="flex gap-2"><TextInput type="number" min={0} step="any" value={cooldown} onChange={(e) => setCooldown(e.target.value)} className="!h-9 !w-28" /><button type="button" onClick={() => void saveCooldown()} className="rounded-lg border border-line px-3 text-sm hover:border-primary/50">บันทึก</button></div>
        </Field>
        {!profiles.length && <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm">ชีตนี้ยังไม่มีรูปแบบ QR — ตั้งที่ “ตั้งค่าสแกน/ผสม” ก่อน (รูปแบบที่มีชุดข้อมูลเดียว = ทั้งค่าที่อ่านได้ เช่น EPC ไปคอลัมน์ที่เลือก)</p>}
        {list.map((d) => {
          const st = STATUS_LABEL[d.status] ?? STATUS_LABEL.off;
          const slip = d.slip ?? {};
          const setSlip = (p: Partial<SlipCfg>) => void save(d, { slip: { ...slip, ...p } });
          return (
            <div key={d.id} className="rounded-xl border border-line">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className={`h-2.5 w-2.5 rounded-full ${st.cls}`} title={st.text} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                <Select value={d.profileId ?? ''} onChange={(e) => void save(d, { profileId: e.target.value || null })} disabled={!d.bound} className="!h-8 !w-40">
                  <option value="">รูปแบบ: อัตโนมัติ</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Select value={d.printerId ?? ''} onChange={(e) => void save(d, { printerId: e.target.value || null })} disabled={!d.bound} className="!h-8 !w-44" title="เครื่องพิมพ์สลิป">
                  <option value="">ไม่พิมพ์สลิป</option>{printers.map((p) => <option key={p.id} value={p.id}>🖨 {p.name}</option>)}
                </Select>
                <button type="button" disabled={!d.printerId} onClick={() => setOpenSlip(openSlip === d.id ? null : d.id)} title="ตั้งค่าสลิป" className="rounded-lg p-1.5 text-muted hover:text-primary disabled:opacity-30"><ChevronDown className={cn('h-4 w-4 transition-transform', openSlip === d.id && 'rotate-180')} /></button>
                <Toggle checked={d.enabled} onChange={(v) => void save(d, { enabled: v })} disabled={!profiles.length} />
              </div>
              {openSlip === d.id && d.printerId && (
                <div className="space-y-3 border-t border-line bg-ink/[.02] p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium"><PrinterIcon className="h-4 w-4 text-primary" />สลิปของแถวที่อ่านได้</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Field label="หัวสลิป (ว่าง = ชื่อชีต)"><TextInput defaultValue={slip.title ?? ''} onBlur={(e) => e.target.value !== (slip.title ?? '') && setSlip({ title: e.target.value || null })} /></Field>
                    <Field label="พิมพ์เมื่อ" hint="เลือกคอลัมน์เวลา เพื่อพิมพ์เฉพาะตอนที่ลงเวลาช่องนั้น (เช่น เฉพาะตอนออกห้องเย็น)">
                      <Select value={slip.onlyStampColumnId ?? ''} onChange={(e) => setSlip({ onlyStampColumnId: e.target.value || null })}><option value="">ทุกครั้งที่อ่านได้</option>{times.map((c) => <option key={c.id} value={c.id}>เมื่อลงเวลา “{c.name}”</option>)}</Select>
                    </Field>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">คอลัมน์ที่พิมพ์บนสลิป (เรียงตามลำดับที่กด)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {columns.filter((c) => c.dataType !== 'image').map((c) => {
                        const ids = slip.columnIds ?? [];
                        const i = ids.indexOf(c.id);
                        return <button key={c.id} type="button" onClick={() => setSlip({ columnIds: i >= 0 ? ids.filter((x) => x !== c.id) : [...ids, c.id].slice(0, 30) })}
                          className={cn('rounded-full border px-2.5 py-0.5 text-xs', i >= 0 ? 'border-primary bg-primary/10 text-primary' : 'border-line hover:border-primary/50')}>{i >= 0 ? `${i + 1}. ` : ''}{c.name}</button>;
                      })}
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <Field label="QR บนสลิป"><Select value={slip.qr ?? 'none'} onChange={(e) => setSlip({ qr: e.target.value as SlipCfg['qr'] })}><option value="none">ไม่มี</option><option value="rowNo">ชื่อชีต#เลขแถว</option><option value="column">ค่าของคอลัมน์…</option></Select></Field>
                    {slip.qr === 'column' && <Field label="คอลัมน์ที่เป็น QR (เช่น mapping_id)"><Select value={slip.qrColumnId ?? ''} onChange={(e) => setSlip({ qrColumnId: e.target.value || null })}><option value="">— เลือก —</option>{columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!list.length && <p className="py-6 text-center text-sm text-muted">ยังไม่มีอุปกรณ์ — ผู้ดูแลเพิ่มได้ที่เมนู “อุปกรณ์”</p>}
      </div>
    </Modal>
  );
}
