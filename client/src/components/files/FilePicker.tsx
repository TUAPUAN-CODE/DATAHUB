import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileSpreadsheet, Folder, FolderOpen, Home, Lock, Search } from 'lucide-react';
import { filesApi, foldersApi, FolderContents } from '@/api/endpoints';
import { useDebounce } from '@/hooks';
import { cn } from '@/lib/cn';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/misc';

export interface PickedFile { id: string; name: string; path: string; color?: string }

/**
 * File chooser for systems with a lot of files: browse folder → sub-folder → file (breadcrumb on top),
 * or search by name (results show the full path). The caller then picks the sheet and column.
 */
export function FilePicker({ value, onChange, placeholder = 'เลือกไฟล์', extra, className }: {
  value: PickedFile | null; onChange: (f: PickedFile) => void; placeholder?: string; className?: string;
  /** shortcut shown on top (e.g. "the current file") */ extra?: PickedFile[];
}) {
  const [open, setOpen] = useState(false);
  const [folderId, setFolderId] = useState<string>('root');
  const [data, setData] = useState<FolderContents | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 300);
  const [found, setFound] = useState<{ id: string; name: string; path: string; color: string }[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    foldersApi.contents(folderId).then((r) => live && setData(r)).catch(() => live && setData(null)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [open, folderId]);
  useEffect(() => {
    if (!open || !dq) { setFound(null); return; }
    let live = true;
    filesApi.accessible(dq).then((r) => live && setFound(r)).catch(() => live && setFound([]));
    return () => { live = false; };
  }, [open, dq]);

  const crumbs = useMemo(() => data?.breadcrumb ?? [], [data]);
  const pathText = (parts: { name: string }[]) => parts.map((p) => p.name).join(' / ');
  const pick = (f: PickedFile) => { onChange(f); setOpen(false); };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('ds-input flex h-10 w-full items-center gap-2 px-3 text-left text-sm', className)}>
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          {value ? <><span className="block truncate font-medium leading-tight">{value.name}</span>{value.path && <span className="block truncate text-[11px] leading-tight text-muted">{value.path}</span>}</> : <span className="text-muted">{placeholder}</span>}
        </span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} size="lg" icon={<FolderOpen className="h-5 w-5" />} title="เลือกไฟล์ต้นทาง" description="เลือกโฟลเดอร์ → โฟลเดอร์ย่อย → ไฟล์ หรือพิมพ์ชื่อไฟล์เพื่อค้นหา">
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3">
            <Search className="h-4 w-4 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อไฟล์ทั้งระบบ…" className="h-10 w-full bg-transparent text-sm outline-none" />
          </div>
          {extra?.length && !dq ? (
            <div className="flex flex-wrap gap-2">{extra.map((f) => <button key={f.id} onClick={() => pick(f)} className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary hover:bg-primary/10">{f.name} <span className="opacity-60">· {f.path || 'ไฟล์นี้'}</span></button>)}</div>
          ) : null}

          {dq ? (
            <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-line">
              {found === null && <div className="space-y-2 p-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
              {found?.length === 0 && <p className="p-6 text-center text-sm text-muted">ไม่พบไฟล์ที่ค้นหา</p>}
              {found?.map((f) => (
                <button key={f.id} onClick={() => pick({ id: f.id, name: f.name, path: f.path, color: f.color })} className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-ink/5">
                  <FileSpreadsheet className="h-4 w-4 shrink-0" style={{ color: f.color }} />
                  <span className="min-w-0"><span className="block truncate text-sm font-medium">{f.name}</span><span className="block truncate text-xs text-muted">{f.path}</span></span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <nav className="flex flex-wrap items-center gap-1 text-sm">
                <button onClick={() => setFolderId('root')} className={cn('inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-ink/5', folderId === 'root' && 'font-semibold text-primary')}><Home className="h-3.5 w-3.5" />ไฟล์ทั้งหมด</button>
                {crumbs.map((c, i) => (
                  <span key={c.id} className="inline-flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 text-muted" />
                    <button onClick={() => setFolderId(c.id)} className={cn('rounded-lg px-2 py-1 hover:bg-ink/5', i === crumbs.length - 1 && 'font-semibold text-primary')}>{c.name}</button></span>
                ))}
              </nav>
              <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-line">
                {loading && !data && <div className="space-y-2 p-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
                {data && !data.subfolders.length && !data.files.length && <p className="p-6 text-center text-sm text-muted">โฟลเดอร์นี้ว่าง</p>}
                {data?.subfolders.map((f) => (
                  <button key={f.id} onClick={() => setFolderId(f.id)} className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-ink/5">
                    <Folder className="h-4 w-4 shrink-0" style={{ color: f.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                    <span className="text-xs text-muted">{f.folderCount > 0 && `${f.folderCount} โฟลเดอร์ · `}{f.fileCount} ไฟล์</span>
                    {f.level < 1 && <Lock className="h-3.5 w-3.5 text-warning" />}
                    <ChevronRight className="h-4 w-4 text-muted" />
                  </button>
                ))}
                {data?.files.map((f) => {
                  const locked = f.level < 1;
                  return (
                    <button key={f.id} disabled={locked} onClick={() => pick({ id: f.id, name: f.name, path: pathText(crumbs), color: f.color })}
                      className="flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-primary/5 disabled:opacity-50">
                      <FileSpreadsheet className="h-4 w-4 shrink-0" style={{ color: f.color }} />
                      <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                      {locked ? <Lock className="h-3.5 w-3.5 text-warning" /> : <span className="text-xs text-primary">เลือก</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
