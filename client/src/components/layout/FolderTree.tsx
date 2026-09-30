import { DragEvent, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Lock } from 'lucide-react';
import { filesApi, foldersApi } from '@/api/endpoints';
import { cn } from '@/lib/cn';
import { useData } from '@/store/data';
import { toast } from '@/store/ui';
import type { FolderItem } from '@/types';

const KEY = 'dsp_tree_open';
const readOpen = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};

export const DRAG_MIME = 'application/x-dsp-item';
export interface DragPayload { type: 'file' | 'folder'; id: string; name: string }

/** Moves a dragged item into a folder. Returns true if moved. */
export async function dropInto(e: DragEvent, folderId: string | null): Promise<boolean> {
  const raw = e.dataTransfer.getData(DRAG_MIME);
  if (!raw) return false;
  const p = JSON.parse(raw) as DragPayload;
  if (p.type === 'folder' && p.id === folderId) return false;
  try {
    if (p.type === 'file') {
      if (!folderId) return false;
      await filesApi.move(p.id, folderId);
    } else await foldersApi.move(p.id, folderId);
    toast.success(`ย้าย "${p.name}" แล้ว`);
    void useData.getState().loadTree();
    window.dispatchEvent(new CustomEvent('dsp:moved'));
    return true;
  } catch (err) {
    toast.error(err, 'ย้ายไม่สำเร็จ');
    return false;
  }
}

export function FolderTree({ onNavigate }: { onNavigate?: () => void }) {
  const tree = useData((s) => s.tree);
  const [open, setOpen] = useState(readOpen);
  const [dropId, setDropId] = useState<string | null>(null);
  const { pathname } = useLocation();
  const children = useMemo(() => {
    const m = new Map<string | null, FolderItem[]>();
    const ids = new Set(tree.map((f) => f.id));
    for (const f of tree) {
      const p = f.parentId && ids.has(f.parentId) ? f.parentId : null;
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(f);
    }
    return m;
  }, [tree]);

  const toggle = (id: string) => {
    const next = { ...open, [id]: !open[id] };
    setOpen(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const render = (parent: string | null, depth: number) =>
    (children.get(parent) ?? []).map((f) => {
      const kids = children.get(f.id) ?? [];
      const active = pathname === `/folders/${f.id}`;
      return (
        <div key={f.id}>
          <div
            onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDropId(f.id); } }}
            onDragLeave={() => setDropId((d) => (d === f.id ? null : d))}
            onDrop={async (e) => { e.preventDefault(); setDropId(null); await dropInto(e, f.id); }}
            className={cn('side-item', active && 'active', dropId === f.id && 'drop')} style={{ paddingLeft: 6 + depth * 14 }}>
            <button onClick={() => toggle(f.id)} aria-label={open[f.id] ? 'ยุบ' : 'ขยาย'} className={cn('grid h-5 w-5 place-items-center rounded', !kids.length && 'invisible')}>
              <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open[f.id] && 'rotate-90')} />
            </button>
            <Link to={`/folders/${f.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: f.color }} />
              <span className="truncate">{f.name}</span>
              {f.level === 0 && <Lock className="ml-auto h-3 w-3 shrink-0 opacity-60" />}
            </Link>
          </div>
          {open[f.id] && kids.length > 0 && render(f.id, depth + 1)}
        </div>
      );
    });

  if (!tree.length) return <p className="px-3 text-xs opacity-60">ยังไม่มีโฟลเดอร์</p>;
  return <div className="space-y-0.5">{render(null, 0)}</div>;
}
