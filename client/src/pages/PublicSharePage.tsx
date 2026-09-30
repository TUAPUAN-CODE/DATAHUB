import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, Lock, LogIn, Search } from 'lucide-react';
import { apiError } from '@/api/client';
import { publicShareApi, shareApi } from '@/api/endpoints';
import { FileGlyph } from '@/components/files/icons';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Inputs';
import { EmptyState, Pager, Skeleton, Spinner } from '@/components/ui/misc';
import { useDebounce, useLoad } from '@/hooks';
import { cn } from '@/lib/cn';
import { displayValue } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { toast } from '@/store/ui';

/** /s/:token — signed-in users receive the link's permission and are sent to the file; visitors get a read-only view */
export default function PublicSharePage() {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const status = useAuth((s) => s.status);
  const info = useLoad(() => publicShareApi.info(token), [token]);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authed' || !info.data) return;
    let live = true;
    shareApi.redeem(token)
      .then((r) => {
        if (!live) return;
        if (r.granted) toast.success('คุณได้รับสิทธิ์เข้าถึงไฟล์นี้แล้ว');
        nav(`/files/${r.fileId}`, { replace: true });
      })
      .catch((e) => live && setRedeemErr(apiError(e).message));
    return () => { live = false; };
  }, [status, info.data, token, nav]);

  if (status === 'loading' || (info.loading && !info.data)) return <div className="grid h-full place-items-center"><Spinner className="h-7 w-7" /></div>;
  if (info.error) return <Shell><EmptyState icon={<Lock />} title="เปิดลิงก์นี้ไม่ได้" description={info.error.message} action={<Link to="/"><Button>ไปหน้าแรก</Button></Link>} /></Shell>;
  if (status === 'authed') return <Shell>{redeemErr ? <EmptyState icon={<Lock />} title="เปิดลิงก์นี้ไม่ได้" description={redeemErr} action={<Link to="/"><Button>ไปหน้าแรก</Button></Link>} /> : <div className="grid h-40 place-items-center"><Spinner className="h-6 w-6" /></div>}</Shell>;
  if (!info.data) return null;
  const d = info.data;
  const loginBtn = <Button icon={<LogIn className="h-4 w-4" />} onClick={() => nav('/login', { state: { from: `/s/${token}` } })}>เข้าสู่ระบบ</Button>;
  if (!d.allowGuest) return <Shell><EmptyState icon={<Lock />} title={d.file.name} description="ลิงก์นี้เปิดให้เฉพาะผู้ที่มีบัญชี กรุณาเข้าสู่ระบบเพื่อเปิดไฟล์" action={loginBtn} /></Shell>;
  return <GuestView token={token} info={d} loginBtn={loginBtn} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-full place-items-center p-6" style={{ background: 'rgb(var(--c-bg))' }}><div className="ds-card w-full max-w-lg p-6">{children}</div></div>;
}

function GuestView({ token, info, loginBtn }: { token: string; info: NonNullable<ReturnType<typeof useLoad<Awaited<ReturnType<typeof publicShareApi.info>>>>['data']>; loginBtn: React.ReactNode }) {
  const [sheetId, setSheetId] = useState(info.sheets[0]?.id ?? '');
  const [search, setSearch] = useState('');
  const dq = useDebounce(search, 350);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const meta = useLoad(() => publicShareApi.sheet(token, sheetId), [sheetId], { skip: !sheetId });
  const rows = useLoad(() => publicShareApi.rows(token, sheetId, { page, pageSize, search: dq || undefined }), [sheetId, page, dq], { skip: !sheetId });
  useEffect(() => { setPage(1); }, [sheetId, dq]);
  const cols = meta.data?.columns ?? [];

  return (
    <div className="flex h-full flex-col" style={{ background: 'rgb(var(--c-bg))' }}>
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <FileGlyph color={info.file.color} size={36} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{info.file.name}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted"><Eye className="h-3.5 w-3.5" />โหมดดูอย่างเดียว — เข้าสู่ระบบเพื่อแก้ไขตามสิทธิ์ที่ได้รับ</p>
        </div>
        {loginBtn}
      </header>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 sm:px-6">
        {info.sheets.map((s) => (
          <button key={s.id} onClick={() => setSheetId(s.id)} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', s.id === sheetId ? 'bg-primary text-white' : 'bg-surface text-muted hover:text-ink')}>{s.name}</button>
        ))}
        <TextInput icon={<Search />} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา…" className="!h-9 ml-auto w-56" />
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ds-card m-4 flex min-h-0 flex-1 flex-col overflow-hidden sm:mx-6">
        {!sheetId ? <EmptyState title="ไฟล์นี้ยังไม่มีชีต" /> : (!meta.data || !rows.data) ? <div className="space-y-1.5 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div> : (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="ds-th w-14 border-b border-r px-2 py-2 text-center text-xs font-medium">#</th>
                    {cols.map((c) => <th key={c.id} className="ds-th whitespace-nowrap border-b border-r px-3 py-2 text-left text-xs font-medium" style={{ minWidth: c.width }}>{c.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="ds-td border-b border-r px-2 py-1.5 text-center text-xs text-muted">{r.order}</td>
                      {cols.map((c) => <td key={c.id} className="ds-td max-w-[420px] truncate border-b border-r px-3 py-1.5">{displayValue(c, r.values[c.id] ?? null)}</td>)}
                    </tr>
                  ))}
                  {!rows.data.rows.length && <tr><td colSpan={cols.length + 1} className="p-10 text-center text-muted">ไม่มีข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line px-3 py-2"><Pager page={page} pageSize={pageSize} total={rows.data.total} onPage={setPage} /></div>
          </>
        )}
      </motion.div>
    </div>
  );
}
