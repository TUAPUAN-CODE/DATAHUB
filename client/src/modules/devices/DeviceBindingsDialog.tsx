import { useCallback, useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import type { ScanProfile } from '@/api/endpoints';
import { toast } from '@/store/ui';
import { Modal } from '@/components/ui/Modal';
import { Select, Toggle } from '@/components/ui/Inputs';
import { devicesApi, SheetDevice, STATUS_LABEL } from './api';

/** The "รับจากอุปกรณ์" switch of a sheet: which devices write into it, and with which QR format */
export function DeviceBindingsDialog({ open, onClose, sheetId, profiles }: { open: boolean; onClose: () => void; sheetId: string; profiles: ScanProfile[] }) {
  const [list, setList] = useState<SheetDevice[]>([]);
  const load = useCallback(async () => { try { setList((await devicesApi.forSheet(sheetId)).devices); } catch (e) { toast.error(e); } }, [sheetId]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  const save = async (d: SheetDevice, enabled: boolean, profileId: string | null) => {
    try { await devicesApi.bind(sheetId, d.id, { enabled, profileId }); await load(); } catch (e) { toast.error(e); }
  };
  return (
    <Modal open={open} onClose={onClose} size="md" icon={<Cpu className="h-5 w-5" />} title="รับข้อมูลจากอุปกรณ์" description="เมื่ออุปกรณ์อ่านค่าได้ ระบบจะเพิ่ม/อัปเดตแถวในชีตนี้ตามรูปแบบ QR ที่เลือก (ทำงานแม้ไม่มีใครเปิดหน้านี้ — ในนามของคนที่เปิดสวิตช์)">
      <div className="space-y-2">
        {!profiles.length && <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm">ชีตนี้ยังไม่มีรูปแบบ QR — ตั้งที่ “ตั้งค่าสแกน/ผสม” ก่อน (รูปแบบที่มีชุดข้อมูลเดียว = ทั้งค่าที่อ่านได้ เช่น EPC ไปคอลัมน์ที่เลือก)</p>}
        {list.map((d) => {
          const st = STATUS_LABEL[d.status] ?? STATUS_LABEL.off;
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
              <span className={`h-2.5 w-2.5 rounded-full ${st.cls}`} title={st.text} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
              <Select value={d.profileId ?? ''} onChange={(e) => void save(d, d.enabled, e.target.value || null)} disabled={!d.bound} className="!h-8 !w-44">
                <option value="">รูปแบบ: อัตโนมัติ</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Toggle checked={d.enabled} onChange={(v) => void save(d, v, d.profileId)} disabled={!profiles.length} />
            </div>
          );
        })}
        {!list.length && <p className="py-6 text-center text-sm text-muted">ยังไม่มีอุปกรณ์ — ผู้ดูแลเพิ่มได้ที่เมนู “อุปกรณ์”</p>}
      </div>
    </Modal>
  );
}
