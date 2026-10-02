import { useEffect, useState } from 'react';
import { Columns3, RotateCcw } from 'lucide-react';
import { apiError } from '@/api/client';
import { columnsApi } from '@/api/endpoints';
import { relTime } from '@/lib/format';
import { TYPE_META } from '@/lib/columnTypes';
import { confirmDialog, toast } from '@/store/ui';
import type { Column, ColumnDraft } from '@/types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ColumnEditor, draftToPayload, validateDrafts } from './ColumnEditor';
import { validationForEditor } from '@/modules/formula/expr';

const toDraft = (c: Column, all: Column[]): ColumnDraft => ({
  key: c.id, id: c.id, name: c.name, dataType: c.dataType, isRequired: c.isRequired, width: c.width, defaultValue: c.defaultValue,
  placeholder: c.placeholder, description: c.description, validation: validationForEditor(c, all), options: c.options,
});

export function ColumnManagerModal({ open, onClose, sheetId, columns, deleted, onSaved, fileId, fileName }: {
  open: boolean; onClose: () => void; sheetId: string; fileId?: string; fileName?: string; columns: Column[]; deleted: Column[]; onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<ColumnDraft[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setDrafts(columns.map((c) => toDraft(c, columns))); }, [open, columns]);

  const save = async () => {
    const err = validateDrafts(drafts);
    if (err) return toast.error(err, 'ตรวจสอบคอลัมน์');
    setBusy(true);
    try {
      const orig = new Map(columns.map((c) => [c.id, c]));
      const removed = columns.filter((c) => !drafts.some((d) => d.id === c.id));
      if (removed.length && !(await confirmDialog({ title: `ลบ ${removed.length} คอลัมน์?`, message: `${removed.map((c) => c.name).join(', ')} — ข้อมูลยังถูกเก็บไว้และกู้คืนได้จากหน้าต่างนี้`, danger: true, confirmText: 'ลบคอลัมน์' }))) { setBusy(false); return; }
      for (const c of removed) await columnsApi.remove(c.id);
      const ids: string[] = [];
      for (const d of drafts) {
        const payload = draftToPayload(d);
        if (!d.id) {
          const created = await columnsApi.create(sheetId, payload);
          ids.push(created.id);
          continue;
        }
        ids.push(d.id);
        const o = orig.get(d.id)!;
        const before = JSON.stringify(draftToPayload(toDraft(o, columns)));
        if (before === JSON.stringify(payload)) continue;
        try {
          await columnsApi.update(d.id, payload);
        } catch (e) {
          const info = apiError(e);
          if (info.code !== 'NEEDS_CONVERSION') throw e;
          const ok = await confirmDialog({ title: `เปลี่ยนชนิดข้อมูลของ “${d.name}”?`, message: `${info.message}\nเปลี่ยนจาก ${TYPE_META[o.dataType].label} เป็น ${TYPE_META[d.dataType].label}`, confirmText: 'แปลงข้อมูล', danger: true });
          if (!ok) continue;
          const r = await columnsApi.update(d.id, { ...payload, convert: true });
          if (r.conversion) toast.info(`แปลงข้อมูล “${d.name}” แล้ว`, `สำเร็จ ${r.conversion.converted} เซลล์ · ล้างค่า ${r.conversion.cleared} เซลล์ที่แปลงไม่ได้`);
        }
      }
      const origOrder = columns.map((c) => c.id).filter((id) => ids.includes(id));
      if (JSON.stringify(origOrder) !== JSON.stringify(ids.filter((id) => orig.has(id))) || ids.some((id) => !orig.has(id))) await columnsApi.reorder(sheetId, ids);
      toast.success('บันทึกโครงสร้างคอลัมน์แล้ว');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const restore = async (c: Column) => {
    try { await columnsApi.restore(c.id); toast.success(`กู้คืน “${c.name}” แล้ว`); onSaved(); } catch (e) { toast.error(e); }
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" icon={<Columns3 className="h-5 w-5" />} title="จัดการคอลัมน์" description="กำหนดชื่อ ชนิดข้อมูล การบังคับกรอก และกฎตรวจสอบของแต่ละคอลัมน์"
      footer={<><Button variant="secondary" onClick={onClose}>ยกเลิก</Button><Button onClick={save} loading={busy}>บันทึกการเปลี่ยนแปลง</Button></>}>
      <div className="max-h-[62vh] overflow-y-auto pr-1">
        <ColumnEditor columns={drafts} onChange={setDrafts} fileId={fileId} fileName={fileName} sheetId={sheetId} />
        {deleted.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">คอลัมน์ที่ถูกลบ</p>
            <div className="space-y-1.5">
              {deleted.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2 text-sm">
                  <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{TYPE_META[c.dataType].icon}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted">ลบ{relTime(c.deletedAt)}</span>
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => restore(c)}>กู้คืน</Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
