import { del, get, post, put } from './client';
import type {
  AccessList, AccessRequest, AuditEntry, CellValue, Column, ColumnFilter, Crumb, DashboardMeta, DataSource, FileItem, FolderItem,
  NotificationItem, Perm, Role, Row, Sheet, SheetPrefs, SortSpec, User, UsersDict, Widget, WidgetData,
} from '@/types';

export const authApi = {
  login: (username: string, password: string) => post<{ accessToken: string; user: User }>('/auth/login', { username, password }),
  refresh: () => post<{ accessToken: string; user: User }>('/auth/refresh'),
  logout: () => post('/auth/logout'),
  me: () => get<User>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) => post('/auth/change-password', { currentPassword, newPassword }),
};

export const usersApi = {
  list: (params: Record<string, any>) =>
    get<{ items: User[]; total: number; page: number; pageSize: number; stats: { total: number; active: number } }>('/users', params),
  lookup: (q: string) => get<User[]>('/users/lookup', { q }),
  create: (b: { username: string; email: string; displayName: string; password: string; role: Role }) => post<User>('/users', b),
  update: (id: string, b: Partial<{ email: string; displayName: string; role: Role; isActive: boolean }>) => put<User>(`/users/${id}`, b),
  resetPassword: (id: string, password: string) => post(`/users/${id}/reset-password`, { password }),
  bulk: (ids: string[], action: 'activate' | 'deactivate' | 'set_role', role?: Role) => post('/users/bulk', { ids, action, role }),
  updateProfile: (b: { displayName: string; email: string; avatarUrl?: string | null }) => put<User>('/users/me/profile', b),
};

export interface FolderContents { folder: FolderItem | null; breadcrumb: Crumb[]; level: number; subfolders: FolderItem[]; files: FileItem[] }
export const foldersApi = {
  tree: () => get<FolderItem[]>('/folders/tree'),
  contents: (id: string) => get<FolderContents>(`/folders/${id}/contents`),
  create: (b: { name: string; parentId?: string | null; description?: string | null; color?: string }) => post<FolderItem>('/folders', b),
  update: (id: string, b: { name?: string; description?: string | null; color?: string }) => put(`/folders/${id}`, b),
  move: (id: string, parentId: string | null) => post(`/folders/${id}/move`, { parentId }),
  remove: (id: string) => del(`/folders/${id}`),
};

export interface FileDetail { file: FileItem; breadcrumb: Crumb[]; sheets: Sheet[]; dashboards: { id: string; name: string; updatedAt: string }[]; level: number }
export const filesApi = {
  get: (id: string) => get<FileDetail>(`/files/${id}`),
  create: (b: any) => post<{ id: string }>('/files', b),
  update: (id: string, b: { name?: string; description?: string | null; color?: string; status?: string }) => put(`/files/${id}`, b),
  move: (id: string, folderId: string) => post(`/files/${id}/move`, { folderId }),
  duplicate: (id: string, b: { name?: string; folderId?: string; includeData: boolean }) => post<{ id: string }>(`/files/${id}/duplicate`, b),
  remove: (id: string) => del(`/files/${id}`),
  accessible: (q = '') => get<{ id: string; name: string; color: string; folderId: string; path: string }[]>('/files/accessible', { q }),
};

export interface SheetDetail {
  sheet: Sheet; file: { id: string; name: string; folderId: string }; level: number; permission: Perm;
  columns: Column[]; deletedColumns: Column[]; prefs: SheetPrefs;
}
export const sheetsApi = {
  get: (id: string) => get<SheetDetail>(`/sheets/${id}`),
  savePrefs: (id: string, prefs: Partial<SheetPrefs>) => put<SheetPrefs>(`/sheets/${id}/prefs`, prefs),
  create: (fileId: string, b: { name: string; tabColor?: string | null; columns?: any[]; copyStructureFrom?: string | null }) =>
    post<Sheet>(`/files/${fileId}/sheets`, b),
  update: (id: string, b: { name?: string; tabColor?: string | null }) => put(`/sheets/${id}`, b),
  reorder: (fileId: string, ids: string[]) => post(`/files/${fileId}/sheets/reorder`, { ids }),
  remove: (id: string) => del(`/sheets/${id}`),
};

export const columnsApi = {
  create: (sheetId: string, b: any) => post<Column>(`/sheets/${sheetId}/columns`, b),
  update: (id: string, b: any) => put<{ column: Column; conversion: { converted: number; cleared: number } | null }>(`/columns/${id}`, b),
  reorder: (sheetId: string, ids: string[]) => post(`/sheets/${sheetId}/columns/reorder`, { ids }),
  remove: (id: string) => del(`/columns/${id}`),
  restore: (id: string) => post<Column>(`/columns/${id}/restore`),
};

export interface RowQueryBody { page: number; pageSize: number; sorts: SortSpec[]; filters: ColumnFilter[]; search?: string }
export interface RowPage { rows: Row[]; total: number; page: number; pageSize: number; users: UsersDict }
export interface CellVersion { id: number; oldValue: CellValue; newValue: CellValue; source: string; by: string; byName: string; avatarUrl: string | null; at: string; version: number }
export const rowsApi = {
  query: (sheetId: string, b: RowQueryBody) => post<RowPage>(`/sheets/${sheetId}/rows/query`, b),
  distinct: (sheetId: string, b: { columnId: string; filters: ColumnFilter[]; search?: string; valueSearch?: string; limit?: number }) =>
    post<{ items: { value: any; count: number }[]; blankCount: number; truncated: boolean }>(`/sheets/${sheetId}/distinct`, b),
  create: (sheetId: string, values: Record<string, CellValue>) => post<{ row: Row; users: UsersDict }>(`/sheets/${sheetId}/rows`, { values }),
  remove: (rowId: string) => del(`/rows/${rowId}`),
  removeMany: (sheetId: string, rowIds: string[]) => post(`/sheets/${sheetId}/rows/delete`, { rowIds }),
  trash: (sheetId: string) => get<{ rows: Row[]; users: UsersDict }>(`/sheets/${sheetId}/trash`),
  restore: (sheetId: string, rowIds: string[]) => post<{ restored: number }>(`/sheets/${sheetId}/rows/restore`, { rowIds }),
  history: (rowId: string) =>
    get<{ row: { id: string; order: number; createdAt: string; isDeleted: boolean }; history: (CellVersion & { columnId: string; columnName: string; dataType: string })[]; snapshots: any[] }>(`/rows/${rowId}/history`),
  rollback: (rowId: string, b: { at: string; reason?: string; preview?: boolean }) => post<any>(`/rows/${rowId}/rollback`, b),
  sheetRollback: (sheetId: string, b: { at: string; reason?: string; preview?: boolean }) => post<any>(`/sheets/${sheetId}/rollback`, b),
};

export interface BulkResult { updated: { rowId: string; columnId: string; value: CellValue; at: string; by: string }[]; unchanged: number; errors: { rowId: string; columnId: string; message: string; rowNo?: number; columnName?: string }[] }
export const cellsApi = {
  update: (rowId: string, columnId: string, value: CellValue) =>
    put<{ rowId: string; columnId: string; value: CellValue; at: string; by: string; unchanged?: boolean }>(`/rows/${rowId}/cells/${columnId}`, { value }),
  bulk: (sheetId: string, updates: { rowId: string; columnId: string; value: CellValue }[], partial = false, source = 'edit') =>
    post<BulkResult>(`/sheets/${sheetId}/cells/bulk`, { updates, partial, source }),
  history: (rowId: string, columnId: string) =>
    get<{ column: { name: string; dataType: string; options: any[] } | null; rowNo: number; canRollback: boolean; versions: CellVersion[] }>('/cells/history', { rowId, columnId }),
  rollback: (historyId: number, target: 'new' | 'old' = 'new') => post('/cells/rollback', { historyId, target }),
};

export const accessApi = {
  get: (type: 'file' | 'folder', id: string) => get<AccessList>(`/${type}s/${id}/access`),
  grant: (type: 'file' | 'folder', id: string, b: { userId: string; permission: Perm; expiresAt?: string | null }) =>
    put<{ granted: boolean; cappedToWrite: boolean }>(`/${type}s/${id}/access`, b),
  revoke: (type: 'file' | 'folder', id: string, userId: string) => del(`/${type}s/${id}/access/${userId}`),
};

export const requestsApi = {
  create: (b: { targetType: 'file' | 'folder'; targetId: string; permission: Perm; note: string; durationDays?: number | null }) => post('/access-requests', b),
  list: (box: 'mine' | 'review', status = 'all') => get<AccessRequest[]>('/access-requests', { box, status }),
  pendingCount: () => get<{ count: number }>('/access-requests/pending-count'),
  approve: (id: string, b: { permission?: Perm; expiresAt?: string | null; reviewNote?: string }) => post(`/access-requests/${id}/approve`, b),
  reject: (id: string, reviewNote: string) => post(`/access-requests/${id}/reject`, { reviewNote }),
  cancel: (id: string) => post(`/access-requests/${id}/cancel`),
};

export const auditApi = {
  list: (params: Record<string, any>) => get<{ items: AuditEntry[]; total: number; page: number; pageSize: number }>('/audit', params),
};

export interface FavoriteItem { type: 'file' | 'folder'; id: string; name: string; color: string; path: string; level: number }
export const favoritesApi = {
  list: () => get<FavoriteItem[]>('/favorites'),
  toggle: (entityType: 'file' | 'folder', entityId: string) => post<{ favorite: boolean }>('/favorites/toggle', { entityType, entityId }),
};

export const activityApi = {
  recent: () => get<FileItem[]>('/activity/recent-files'),
  feed: () => get<FileItem[]>('/activity/feed'),
};

export interface SearchResult {
  folders: { id: string; name: string; color: string; path: string; level: number }[];
  files: { id: string; name: string; color: string; description: string | null; updatedAt: string; folderId: string; path: string; level: number }[];
}
export const searchApi = { search: (q: string, limit = 20) => get<SearchResult>('/search', { q, limit }) };

export const notificationsApi = {
  list: () => get<{ items: NotificationItem[]; unreadCount: number }>('/notifications'),
  read: (id: string) => post(`/notifications/${id}/read`),
  readAll: () => post('/notifications/read-all'),
};

export const themesApi = {
  me: () => get<{ theme: any; orgDefault: any }>('/themes/me'),
  save: (theme: any) => put('/themes/me', { theme }),
  reset: () => del('/themes/me'),
  saveOrg: (theme: any) => put('/themes/org', { theme }),
  resetOrg: () => del('/themes/org'),
};

export const dashboardsApi = {
  list: (fileId: string) => get<DashboardMeta[]>(`/files/${fileId}/dashboards`),
  create: (fileId: string, name: string) => post<DashboardMeta>(`/files/${fileId}/dashboards`, { name }),
  get: (id: string) => get<{ dashboard: DashboardMeta; widgets: Widget[]; file: { id: string; name: string }; sheets: Sheet[]; level: number }>(`/dashboards/${id}`),
  save: (id: string, b: { name: string; canvas: DashboardMeta['canvas']; background: DashboardMeta['background']; widgets: Widget[] }) => put(`/dashboards/${id}`, b),
  remove: (id: string) => del(`/dashboards/${id}`),
  data: (dataSource: DataSource) => post<WidgetData>('/dashboards/data', { dataSource }),
};

export const uploadsApi = {
  image: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return post<{ url: string }>('/uploads/image', fd);
  },
};

export interface TrashItem { type: 'file' | 'folder'; id: string; name: string; color: string; deletedAt: string; deletedByName: string | null; purgeAt: string; detail: string; blocked?: boolean }
export const trashApi = {
  list: () => get<{ retentionDays: number; items: TrashItem[] }>('/trash'),
  restore: (type: 'file' | 'folder', id: string) => post('/trash/restore', { type, id }),
  purge: (type: 'file' | 'folder', id: string) => del(`/trash/${type}/${id}`),
};
