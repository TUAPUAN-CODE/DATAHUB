import { useState } from 'react';
import { AlertTriangle, Layers, RefreshCw, Settings2 } from 'lucide-react';
import { unionApi } from '@/api/endpoints';
import { relTime } from '@/lib/format';
import { toast } from '@/store/ui';
import type { UnionStatus } from '@/types';
import { Button } from '../ui/Button';
import { UnionDialog } from '../files/UnionDialog';

/** Shown above a union sheet: where the rows come from, when they were synced, and any source that no longer matches */
export function UnionBanner({ sheetId, union, canManage, onSynced }: { sheetId: string; union: UnionStatus; canManage: boolean; onSynced: () => void }) {
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const bad = union.sources.filter((s) => !s.ok);
  const sync = async () => {
    setBusy(true);
    try { await unionApi.sync(sheetId); toast.success('ซิงค์ข้อมูลแล้ว'); onSynced(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <div className="shrink-0 border-b border-line bg-primary/[.04] px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-2 font-medium text-primary"><Layers className="h-4 w-4" />ชีตรวมข้อมูลจาก {union.sources.length} แหล่ง (อ่านอย่างเดียว)</span>
        <span className="text-xs text-muted">ซิงค์ล่าสุด {union.lastSyncAt ? relTime(union.lastSyncAt) : 'กำลังดึงข้อมูล…'}</span>
        <span className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={sync} loading={busy}>ซิงค์ตอนนี้</Button>
          {canManage && <Button size="sm" variant="secondary" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setEdit(true)}>แหล่งข้อมูล</Button>}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-muted" title={union.sources.map((s) => `${s.fileName} / ${s.sheetName}`).join(' · ')}>
        {union.sources.map((s) => `${s.fileName ?? '?'} / ${s.sheetName ?? '?'}${s.rows != null ? ` (${s.rows.toLocaleString()})` : ''}`).join('  ·  ')}
      </p>
      {bad.map((s) => (
        <p key={s.sheetId} className="mt-1 flex items-start gap-1.5 text-xs text-danger"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><b>{s.fileName ?? '?'} / {s.sheetName ?? '?'}</b> — {s.message}</span></p>
      ))}
      <UnionDialog open={edit} onClose={() => setEdit(false)} mode="edit" sheetId={sheetId} initialSources={union.sources.map((s) => ({ sheetId: s.sheetId, label: `${s.fileName ?? '?'} / ${s.sheetName ?? '?'}` }))} onDone={onSynced} />
    </div>
  );
}
