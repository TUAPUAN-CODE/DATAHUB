import { useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Widget } from '@/types';
import { WIDGETS } from './widgets';

/** Layer manager: top of the list = front-most. Drag rows (or use the arrows) to change stacking order. */
export function LayersPanel({ widgets, selected, onSelect, onReorder, onUpdate }: {
  widgets: Widget[]; selected: string | null; onSelect: (id: string) => void; onReorder: (idsTopFirst: string[]) => void; onUpdate: (id: string, p: Partial<Widget>) => void;
}) {
  const list = [...widgets].sort((a, b) => b.z - a.z);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const move = (id: string, to: number) => {
    const ids = list.map((w) => w.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    onReorder(ids);
  };
  const drop = () => {
    if (!drag || !over || drag === over.id) { setDrag(null); setOver(null); return; }
    const ids = list.map((w) => w.id).filter((x) => x !== drag);
    const at = ids.indexOf(over.id) + (over.after ? 1 : 0);
    ids.splice(at, 0, drag);
    onReorder(ids);
    setDrag(null); setOver(null);
  };
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm font-semibold">เลเยอร์</p>
        <p className="text-xs text-muted">บนสุด = อยู่หน้าสุด · ลากเพื่อสลับลำดับ</p>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {list.length === 0 && <p className="p-4 text-center text-xs text-muted">ยังไม่มีชิ้นส่วนบนผืนผ้าใบ</p>}
        {list.map((w, i) => {
          const meta = WIDGETS.find((m) => m.type === w.type);
          const name = w.title || (w.type === 'text' ? String(w.config.text ?? '').slice(0, 24) : '') || w.config.heading || meta?.label || w.type;
          return (
            <div key={w.id} draggable onDragStart={(e) => { setDrag(w.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); }}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ id: w.id, after: e.clientY > r.top + r.height / 2 }); }}
              onDrop={(e) => { e.preventDefault(); drop(); }} onDragEnd={() => { setDrag(null); setOver(null); }}
              onClick={() => onSelect(w.id)}
              className={cn('group relative flex cursor-pointer items-center gap-1.5 rounded-lg border px-1.5 py-1.5 text-sm transition-colors',
                selected === w.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-ink/5', drag === w.id && 'opacity-40')}>
              {over?.id === w.id && drag !== w.id && <span className={cn('absolute inset-x-1 h-0.5 rounded bg-primary', over.after ? '-bottom-[3px]' : '-top-[3px]')} />}
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted" />
              <span className="shrink-0 text-primary [&>svg]:h-4 [&>svg]:w-4">{meta?.icon}</span>
              <span className={cn('min-w-0 flex-1 truncate', w.style?.hidden && 'opacity-50 line-through')}>{name}</span>
              <span className="hidden items-center gap-0.5 group-hover:flex">
                <button title="หน้าสุด" onClick={(e) => { e.stopPropagation(); move(w.id, 0); }} disabled={i === 0} className="rounded p-0.5 text-muted hover:bg-ink/10 disabled:opacity-30"><ArrowUpToLine className="h-3.5 w-3.5" /></button>
                <button title="ขึ้น" onClick={(e) => { e.stopPropagation(); move(w.id, i - 1); }} disabled={i === 0} className="rounded p-0.5 text-muted hover:bg-ink/10 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button title="ลง" onClick={(e) => { e.stopPropagation(); move(w.id, i + 1); }} disabled={i === list.length - 1} className="rounded p-0.5 text-muted hover:bg-ink/10 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button title="หลังสุด" onClick={(e) => { e.stopPropagation(); move(w.id, list.length - 1); }} disabled={i === list.length - 1} className="rounded p-0.5 text-muted hover:bg-ink/10 disabled:opacity-30"><ArrowDownToLine className="h-3.5 w-3.5" /></button>
              </span>
              <button title={w.style?.hidden ? 'แสดง' : 'ซ่อน'} onClick={(e) => { e.stopPropagation(); onUpdate(w.id, { style: { ...w.style, hidden: !w.style?.hidden } }); }} className="rounded p-0.5 text-muted hover:bg-ink/10">
                {w.style?.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button title={w.locked ? 'ปลดล็อก' : 'ล็อก'} onClick={(e) => { e.stopPropagation(); onUpdate(w.id, { locked: !w.locked }); }} className={cn('rounded p-0.5 hover:bg-ink/10', w.locked ? 'text-warning' : 'text-muted')}>
                {w.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
