import { ReactNode, useState } from 'react';
import { isBasicRole } from '@/types';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, FolderOpen, GitFork, History, Home, KeyRound, LayoutDashboard, LogOut, Settings, Star, Trash2, Users, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/store/auth';
import { useData } from '@/store/data';
import { useUi } from '@/store/ui';
import { FolderTree } from './FolderTree';

function Section({ title, icon, children, storageKey }: { title: string; icon: ReactNode; children: ReactNode; storageKey: string }) {
  const [open, setOpen] = useState(() => localStorage.getItem(storageKey) !== '0');
  return (
    <div className="mt-5 px-3">
      <button onClick={() => { setOpen(!open); localStorage.setItem(storageKey, open ? '0' : '1'); }}
        className="mb-1.5 flex w-full items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-wider opacity-70 hover:opacity-100">
        {icon}<span className="flex-1 text-left">{title}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarBody({ onNavigate, scope }: { onNavigate?: () => void; scope: string }) {
  const user = useAuth((s) => s.user)!;
  const logout = useAuth((s) => s.logout);
  const favorites = useData((s) => s.favorites);
  const pending = useData((s) => s.pendingReviews);
  const { pathname } = useLocation();
  const inFiles = pathname.startsWith('/browse') || pathname.startsWith('/folders') || pathname.startsWith('/files');

  const items = [
    { to: '/', label: 'หน้าแรก', icon: <Home className="h-[18px] w-[18px]" />, active: pathname === '/' },
    { to: '/browse', label: 'ไฟล์ทั้งหมด', icon: <FolderOpen className="h-[18px] w-[18px]" />, active: inFiles },
    { to: '/access-requests', label: 'คำขอสิทธิ์', icon: <KeyRound className="h-[18px] w-[18px]" />, badge: pending },
    ...(!isBasicRole(user.role) ? [{ to: '/audit', label: 'ประวัติการแก้ไข', icon: <History className="h-[18px] w-[18px]" /> }] : []),
    ...(user.role === 'admin' ? [{ to: '/users', label: 'จัดการผู้ใช้', icon: <Users className="h-[18px] w-[18px]" /> }] : []),
    { to: '/trash', label: 'ถังขยะ', icon: <Trash2 className="h-[18px] w-[18px]" /> },
    { to: '/traceback', label: 'ย้อนรอย (Traceback)', icon: <GitFork className="h-[18px] w-[18px]" /> },
    { to: '/dashboards', label: 'แดชบอร์ด', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
    { to: '/settings', label: 'ตั้งค่า', icon: <Settings className="h-[18px] w-[18px]" /> },
  ];

  return (
    <div className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-3 px-6 pb-4 pt-6">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/95 text-primary shadow-sm">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h9M10 4v16" /></svg>
        </span>
        <span className="text-[17px] font-semibold tracking-tight">DataSheet Pro</span>
      </Link>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4 pt-6">
        <nav className="space-y-1.5">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={onNavigate}
              className={({ isActive }) => cn('nav-link', (it.active ?? isActive) && 'active')}>
              {({ isActive }) => (
                <>
                  {(it.active ?? isActive) && <motion.span layoutId={`nav-pill-${scope}`} className="nav-pill" transition={{ type: 'spring', stiffness: 420, damping: 38 }} />}
                  {it.icon}
                  <span className="flex-1">{it.label}</span>
                  {!!it.badge && <span className="mr-2 grid h-5 min-w-5 place-items-center rounded-full bg-warning px-1.5 text-[11px] font-semibold text-white">{it.badge}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <Section title="รายการโปรด" icon={<Star className="h-3.5 w-3.5" />} storageKey="dsp_sec_fav">
          {favorites.length === 0 ? (
            <p className="px-3 text-xs opacity-60">กดดาวที่ไฟล์หรือโฟลเดอร์เพื่อปักหมุดไว้ที่นี่</p>
          ) : (
            <div className="space-y-0.5">
              {favorites.slice(0, 10).map((f) => (
                <Link key={`${f.type}:${f.id}`} to={f.type === 'file' ? `/files/${f.id}` : `/folders/${f.id}`} onClick={onNavigate}
                  className={cn('side-item', pathname.endsWith(f.id) && 'active')} title={f.path}>
                  <span className={cn('h-2 w-2 shrink-0', f.type === 'file' ? 'rounded-full' : 'rounded-sm')} style={{ background: f.color }} />
                  <span className="truncate">{f.name}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title="โฟลเดอร์" icon={<FolderOpen className="h-3.5 w-3.5" />} storageKey="dsp_sec_tree">
          <FolderTree onNavigate={onNavigate} />
        </Section>
      </div>

      <div className="border-t border-white/10 p-3">
        <button onClick={() => void logout()} className="side-item w-full !h-10">
          <LogOut className="h-4 w-4" /> ออกจากระบบ
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const mobile = useUi((s) => s.mobileNav);
  const setMobile = useUi((s) => s.setMobileNav);
  return (
    <>
      <aside className="ds-sidebar hidden h-full shrink-0 lg:block"><SidebarBody scope="desktop" /></aside>
      <AnimatePresence>
        {mobile && (
          <motion.div className="fixed inset-0 z-[850] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobile(false)} />
            <motion.aside className="ds-sidebar relative h-full max-w-[85vw]" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
              <button onClick={() => setMobile(false)} className="absolute right-3 top-6 rounded-lg p-1.5 opacity-80 hover:bg-white/10" aria-label="ปิดเมนู"><X className="h-5 w-5" /></button>
              <SidebarBody scope="mobile" onNavigate={() => setMobile(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
