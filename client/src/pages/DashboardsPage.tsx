import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Pencil, Search } from 'lucide-react';
import { dashboardsApi } from '@/api/endpoints';
import { FileGlyph } from '@/components/files/icons';
import { Page } from '@/components/layout/AppShell';
import { TextInput } from '@/components/ui/Inputs';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { useLoad } from '@/hooks';
import { relTime } from '@/lib/format';

/** Every dashboard the user is allowed to open, across all files */
export default function DashboardsPage() {
  const { data, loading } = useLoad(() => dashboardsApi.all(), []);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((d) => !s || d.name.toLowerCase().includes(s) || d.fileName.toLowerCase().includes(s) || d.path.toLowerCase().includes(s));
  }, [data, q]);
  const groups = useMemo(() => {
    const m = new Map<string, { fileName: string; fileColor: string; path: string; items: typeof list }>();
    for (const d of list) {
      if (!m.has(d.fileId)) m.set(d.fileId, { fileName: d.fileName, fileColor: d.fileColor, path: d.path, items: [] });
      m.get(d.fileId)!.items.push(d);
    }
    return [...m.entries()];
  }, [list]);

  return (
    <Page>
      <PageHeader icon={<LayoutDashboard />} title="แดชบอร์ด" subtitle={data ? `${data.length} แดชบอร์ดที่คุณมีสิทธิ์เข้าถึง` : ''}
        actions={<TextInput icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาแดชบอร์ดหรือไฟล์…" className="!h-10 w-64" />} />
      {loading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-theme" />)}</div>
        : !groups.length ? <div className="ds-card"><EmptyState icon={<LayoutDashboard />} title={q ? 'ไม่พบแดชบอร์ดที่ค้นหา' : 'ยังไม่มีแดชบอร์ด'} description={q ? undefined : 'สร้างแดชบอร์ดได้จากแท็บ “+ แดชบอร์ด” ในหน้าไฟล์'} /></div>
        : (
          <div className="space-y-8">
            {groups.map(([fileId, g]) => (
              <section key={fileId}>
                <Link to={`/files/${fileId}`} className="mb-3 flex items-center gap-3 hover:opacity-80">
                  <FileGlyph color={g.fileColor} size={28} />
                  <span className="min-w-0"><span className="block truncate font-semibold">{g.fileName}</span><span className="block truncate text-xs text-muted">{g.path}</span></span>
                </Link>
                <motion.div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.04 } } }}>
                  {g.items.map((d) => (
                    <motion.div key={d.id} variants={{ h: { opacity: 0, y: 10 }, s: { opacity: 1, y: 0 } }}>
                      <div className="ds-card group relative transition-shadow hover:shadow-lg">
                        <Link to={`/files/${d.fileId}/dashboards/${d.id}`} className="flex items-center gap-3 p-4 pr-12">
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LayoutDashboard className="h-5 w-5" /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{d.name}</span><span className="block truncate text-xs text-muted">แก้ไข{relTime(d.updatedAt)}</span></span>
                        </Link>
                        {d.canEdit && <Link to={`/files/${d.fileId}/dashboards/${d.id}?edit=1`} title="แก้ไขแดชบอร์ด" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted opacity-0 hover:bg-ink/5 hover:text-primary focus:opacity-100 group-hover:opacity-100"><Pencil className="h-4 w-4" /></Link>}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              </section>
            ))}
          </div>
        )}
    </Page>
  );
}
