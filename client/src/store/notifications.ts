import { create } from 'zustand';
import { notificationsApi } from '@/api/endpoints';
import type { NotificationItem } from '@/types';

interface NState {
  items: NotificationItem[];
  unread: number;
  load: () => Promise<void>;
  push: (n: NotificationItem) => void;
  markRead: (id: string) => Promise<void>;
  markAll: () => Promise<void>;
}
export const useNotifications = create<NState>((set, get) => ({
  items: [],
  unread: 0,
  load: async () => {
    try {
      const r = await notificationsApi.list();
      set({ items: r.items, unread: r.unreadCount });
    } catch { /* ignore */ }
  },
  push: (n) => set({ items: [n, ...get().items].slice(0, 50), unread: get().unread + 1 }),
  markRead: async (id) => {
    const it = get().items.find((i) => i.id === id);
    if (!it || it.isRead) return;
    set({ items: get().items.map((i) => (i.id === id ? { ...i, isRead: true } : i)), unread: Math.max(0, get().unread - 1) });
    await notificationsApi.read(id).catch(() => undefined);
  },
  markAll: async () => {
    set({ items: get().items.map((i) => ({ ...i, isRead: true })), unread: 0 });
    await notificationsApi.readAll().catch(() => undefined);
  },
}));
