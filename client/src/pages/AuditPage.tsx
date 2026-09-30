import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { History, Search, Undo2, X } from 'lucide-react';
import { auditApi, cellsApi } from '@/api/endpoints';
import { Page } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { Select, TextInput } from '@/components/ui/Inputs';
import { Avatar, EmptyState, PageHeader, Pager, Skeleton } from '@/components/ui/misc';
import { useDebounce, useLoad } from '@/hooks';
import { cn } from '@/lib/cn';
import { ACTION_LABEL, fmtDateTime, relTime } from '@/lib/format';
import { confirmDialog, toast } from '@/store/ui';
import type { AuditEntry } from '@/types';

const GROUPS: { label: string; actions: string }[] = [
  { label: 'ทุกการกระทำ', actions: '' },
  { label: 'แก้ไขข้อมูลในเซลล์', actions: 'cell_update,cell_rollback' },
  { label: 'เพิ่ม / ลบ / กู้คืนแถว', actions: 'row_create,row_delete,row_restore,row_rollback,sheet_rollback' },
  { label: 'โครงสร้าง (ชีต/คอลัมน์)', actions: 'sheet_create,sheet_update,sheet_delete,column_create,column_update,column_delete,column_restore' },
  { label: 'ไฟล์และโฟลเดอร์', actions: 'file_create,file_update,file_move,file_duplicate,file_delete,file_restore,folder_create,folder_update,folder_move,folder_delete,folder_restore' },
  { label: 'สิทธิ์การเข้าถึง', actions: 'access_grant,access_revoke,access_request,access_approve,access_reject' },
  { label: 'บัญชีผู้ใช้', actions: 'login,user_create,user_update,user_bulk_update,password_change,password_reset' },
];
const TONE: Record<string, string> = { create: 'bg-success/10 text-success', delete: 'bg-danger/10 text-danger', rollback: 'bg-warning/15 text-warning', access: 'bg-primary/10 text-primary' };
const toneOf = (a: string) => (a.includes('delete') || a.includes('revoke') || a.includes('purge') || a.includes('reject') ? TONE.delete : a.includes('rollback') || a.includes('restore') ? TONE.rollback : a.includes('create') || a.includes('approve') ? TONE.create : a.startsWith('access') ? TONE.access : 'bg-ink/5 text-ink/70');

const short = (v: unknown) => {
  if (v === null || v === undefined || v === '') return <span className="italic text-muted">ว่าง</span>;
  const s = Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return <span title={s}>{s.length > 60 ? `${s.slice(0, 60)}…` : s}</span>;
};

function Detail({ e }: { e: AuditEntry }) {
  const n = e.newValue ?? {};
  const o = e.oldValue ?? {};
  if (e.action === 'cell_update' || e.action === 'cell_rollback')
    return <span className="text-[13px]"><b className="font-medium">{n.columnName}</b> · แถว #{n.rowNo}: <span className="text-muted line-through decoration-danger/40">{short(o.value)}</span> → {short(n.value)}</span>;
  if (e.action === 'row_create') return <span className="text-[13px]">แถว #{n.rowNo}</span>;
  if (e.action === 'row_delete') return <span className="text-[13px]">แถว #{o.rowNo}</span>;
  if (e.action === 'sheet_rollback' || e.action === 'row_rollback') return <span className="text-[13px]">ย้อนไป {fmtDateTime(n.at)} · {n.cellsChanged} เซลล์{n.reason ? ` · “${n.reason}”` : ''}</span>;
  const obj = Object.keys(n).length ? n : o;
  const txt = Object.entries(obj).filter(([k]) => !['ids'].includes(k)).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  return <span className="line-clamp-1 text-[13px] text-muted" title={txt}>{txt}</span>;
}

export default function AuditPage() {
  const [sp, setSp] = useSearchParams();
  const fileId = sp.get('fileId') ?? undefined;
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState(0);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const dq = useDebounce(q, 350);
  const params = { page, pageSize: 30, fileId, action: GROUPS[group].actions || undefined, search: dq || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined };
  const { data, loading, reload } = useLoad(() => auditApi.list(params), [JSON.stringify(params)]);
  const undo = async (e: AuditEntry) => {
    if (!(await confirmDialog({ title: 'ย้อนการแก้ไขนี้?', message: `คืนค่า “${e.newValue?.columnName}” แถว #${e.newValue?.rowNo} กลับเป็นค่าก่อนแก้ไข` }))) return;
    try { await cellsApi.rollback(e.newValue.historyId, 'old'); toast.success('ย้อนค่าแล้ว'); void reload(true); } catch (err) { toast.error(err); }
  };

  return (
    <Page>
      <PageHeader icon={<History />} title="ประวัติการแก้ไข" subtitle="ใครทำอะไร เมื่อไร — ย้อนค่าเซลล์ได้จากรายการ" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput icon={<Search />} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="ค้นหาชื่อไฟล์ ผู้ใช้ หรือค่า" className="w-full sm:w-72" />
        <Select value={group} onChange={(e) => { setGroup(Number(e.target.value)); setPage(1); }} className="w-56">{GROUPS.map((g, i) => <option key={i} value={i}>{g.label}</option>)}</Select>
        <TextInput type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label="ตั้งแต่วันที่" />
        <span className="text-sm text-muted">ถึง</span>
        <TextInput type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label="ถึงวันที่" />
        {fileId && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            เฉพาะไฟล์ {data?.items[0]?.fileName ?? ''}<button onClick={() => { sp.delete('fileId'); setSp(sp); }} aria-label="ล้าง"><X className="h-3.5 w-3.5" /></button>
          </span>
        )}
      </div>
      {loading && !data ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-theme" />)}</div>
        : !data?.items.length ? <div className="ds-card"><EmptyState icon={<History />} title="ไม่พบประวัติ" /></div>
        : (
          <>
            <div className={cn('overflow-x-auto transition-opacity', loading && 'opacity-60')}>
              <table className="row-table min-w-[960px]">
                <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>ไฟล์ / ชีต</th><th>รายละเอียด</th><th /></tr></thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap"><p className="text-[13px]">{relTime(e.at)}</p><p className="text-[11px] text-muted">{fmtDateTime(e.at)}</p></td>
                      <td><span className="inline-flex items-center gap-2"><Avatar name={e.userName} src={e.avatarUrl} size={26} /><span className="max-w-[140px] truncate text-[13px] font-medium">{e.userName}</span></span></td>
                      <td><span className={cn('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', toneOf(e.action))}>{ACTION_LABEL[e.action] ?? e.action}</span></td>
                      <td className="max-w-[200px]">{e.fileId ? <Link to={`/files/${e.fileId}${e.sheetId ? `?sheet=${e.sheetId}` : ''}`} className="block truncate text-[13px] font-medium hover:text-primary">{e.fileName ?? '(ถูกลบ)'}</Link> : <span className="text-muted">—</span>}
                        {e.sheetName && <p className="truncate text-[11px] text-muted">{e.sheetName}</p>}</td>
                      <td className="max-w-[380px]"><Detail e={e} /></td>
                      <td className="text-right">{e.action === 'cell_update' && e.newValue?.historyId && <Button size="sm" variant="ghost" className="!h-7" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => undo(e)}>ย้อนค่า</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4"><Pager page={page} pageSize={30} total={data.total} onPage={setPage} /></div>
          </>
        )}
    </Page>
  );
}
