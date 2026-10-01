import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { sheetsApi } from '@/api/endpoints';
import { TYPE_META } from '@/lib/columnTypes';
import { toast } from '@/store/ui';
import type { Column } from '@/types';
import { Button } from '../ui/Button';
import { Checkbox, TextInput } from '../ui/Inputs';
import { Modal } from '../ui/Modal';

/** Managers choose which columns of this sheet get a filter / sort button above the table (useful with many columns) */
export function FilterBarSettings({ open, onClose, sheetId, columns, selected, onSaved }: {
  open: boolean; onClose: () => void; sheetId: string; columns: Column[]; selected: string[] | null | undefined; onSaved: () => void;
}) {
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPick(new Set(selected ?? columns.map((c) => c.id))); setQ(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => columns.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())), [columns, q]);
  const toggle = (id: string) => setPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = async () => {
    setBusy(true);
    try {
      await sheetsApi.saveSettings(sheetId, { filterColumns: pick.size === columns.length ? null : columns.filter((c) => pick.has(c.id)).map((c) => c.id) });
      toast.success('บันทึกการตั้งค่าแถบกรอง/เรียงแล้ว'); onSaved(); onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="md" icon={<SlidersHorizontal className="h-5 w-5" />} title="แถบกรอง / เรียง ของชีตนี้"
      description="เลือกคอลัมน์ที่จะแสดงเป็นปุ่มกรอง/เรียงด้านบนตาราง (ทุกคนที่เปิดชีตนี้จะเห็นเหมือนกัน) คอลัมน์ที่ไม่เลือกยังกรองได้จากเมนูหัวคอลัมน์"
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button onClick={save} loading={busy} disabled={!pick.size}>บันทึก ({pick.size}/{columns.length})</Button></>}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาคอลัมน์…" className="!h-9 flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setPick(new Set(columns.map((c) => c.id)))}>เลือกทั้งหมด</Button>
          <Button size="sm" variant="ghost" onClick={() => setPick(new Set())}>ล้าง</Button>
        </div>
        <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-line">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-ink/5">
              <Checkbox checked={pick.has(c.id)} onChange={() => toggle(c.id)} />
              <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{TYPE_META[c.dataType].icon}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
              <span className="text-xs text-muted">{TYPE_META[c.dataType].label}</span>
            </div>
          ))}
          {!list.length && <p className="p-4 text-center text-sm text-muted">ไม่พบคอลัมน์</p>}
        </div>
      </div>
    </Modal>
  );
}
