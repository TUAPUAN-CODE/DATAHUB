export type Role = 'viewer' | 'user' | 'master' | 'admin';
/** viewer / user cannot build files, folders or manage sharing */
export const isBasicRole = (r?: Role | string | null) => r === 'user' || r === 'viewer';
export type Perm = 'none' | 'read' | 'write' | 'manage';
export const LV = { none: 0, read: 1, write: 2, manage: 3 } as const;

export interface User {
  id: string; username: string; email: string; displayName: string; avatarUrl: string | null; role: Role;
  isActive?: boolean; lastLoginAt?: string | null; createdAt?: string | null;
}
export interface Crumb { id: string; name: string }

export interface FolderItem {
  id: string; name: string; parentId: string | null; description?: string | null; color: string; icon: string;
  sortOrder: number; createdBy: string; createdAt: string; updatedAt: string; level: number; favorite: boolean;
  fileCount: number; folderCount: number;
}

export interface FileItem {
  id: string; name: string; folderId: string; folderName: string | null; description: string | null; icon: string; color: string;
  status: string; createdBy: string; createdByName: string | null; createdAt: string; updatedAt: string; sheetCount?: number;
  lastActivityAt: string | null; lastActivityBy: string | null; lastActivityAvatar: string | null; lastAction: string | null;
  level: number; permission: Perm; favorite: boolean; viewedAt?: string;
}

export type DataType = 'varchar' | 'text' | 'int' | 'float' | 'date' | 'datetime' | 'boolean' | 'select' | 'multi_select' | 'url' | 'email' | 'image' | 'doc_number';
export interface SelectOption { value: string; label: string; color?: string | null }
export interface Validation {
  min?: number | null; max?: number | null; decimals?: number | null; maxLength?: number | null; pattern?: string | null;
  patternMessage?: string | null; minDate?: string | null; maxDate?: string | null; maxSelections?: number | null;
  /** select columns: offer the "— ไม่ระบุ —" choice (default true, never for required columns) */
  allowEmpty?: boolean | null;
  /** options come from a column of another sheet; `parent` limits them to rows matching a value in this row */
  lookup?: Lookup | null;
  /** auto-numbered document id, e.g. {PREFIX}-{YYMMDD}-{SEQ:3} */
  docNumber?: DocNumberCfg | null;
}
export interface DocNumberCfg { template: string; prefixes?: string[] | null; prefixLookup?: Lookup | null; dateColumnId?: string | null }
export interface Lookup { sheetId: string; columnId: string; parent?: { localColumnId: string; foreignColumnId: string } | null }
export type CellValue = string | number | boolean | string[] | null;

export interface Column {
  id: string; sheetId: string; name: string; dataType: DataType; order: number; width: number; isRequired: boolean;
  defaultValue: CellValue; placeholder: string | null; description: string | null; validation: Validation;
  options: SelectOption[]; isDeleted?: boolean; deletedAt?: string | null;
}
/** Column shape used by the builder / column editor before it is saved */
export interface ColumnDraft {
  key: string; id?: string; name: string; dataType: DataType; isRequired: boolean; width: number; defaultValue?: CellValue;
  placeholder?: string | null; description?: string | null; validation?: Validation | null; options?: SelectOption[] | null;
}

export interface Sheet { id: string; fileId: string; name: string; order: number; tabColor: string | null }
export interface SheetPrefs {
  zoom: number; frozenCols: number; frozenRows: number; colWidths: Record<string, number>; rowHeights: Record<string, number>;
  hiddenCols: string[]; rowHeight: number; pageSize: number;
}
export interface Row {
  id: string; order: number; values: Record<string, CellValue>; meta: Record<string, { by: string; at: string }>;
  createdBy: string; createdAt: string; updatedBy: string | null; updatedAt: string; deletedAt?: string | null; deletedBy?: string | null;
}
export type UsersDict = Record<string, { name: string; avatarUrl: string | null }>;

export type FilterOp = 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'is_empty' | 'not_empty';
export interface ColumnFilter {
  columnId: string; mode?: 'include' | 'exclude'; values?: (string | number | boolean)[]; blank?: boolean;
  op?: FilterOp; value?: any; value2?: any;
}
export interface SortSpec { columnId: string; dir: 'asc' | 'desc' }

export interface NotificationItem { id: string; type: string; title: string; message: string; link: string | null; isRead: boolean; createdAt: string }

export interface AccessGrant {
  userId: string; username: string; displayName: string; email: string; avatarUrl: string | null; role: Role; permission: Perm;
  grantedAt: string | null; grantedByName: string | null; expiresAt: string | null; expired: boolean;
  source: 'owner' | 'file' | 'folder' | 'folder_owner'; folderId?: string; folderName?: string;
}
export interface AccessList { owner: AccessGrant | null; direct: AccessGrant[]; inherited: AccessGrant[] }

export interface AccessRequest {
  id: string; targetType: 'file' | 'folder'; targetId: string; targetName: string; permission: Perm; note: string;
  durationDays: number | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requester: { id: string; displayName: string; username: string; avatarUrl: string | null };
  reviewerName: string | null; reviewNote: string | null; reviewedAt: string | null; createdAt: string; canReview: boolean;
}

export interface AuditEntry {
  id: number; userId: string; userName: string; avatarUrl: string | null; action: string; entityType: string; entityId: string;
  fileId: string | null; fileName: string | null; sheetId: string | null; sheetName: string | null; oldValue: any; newValue: any;
  ip: string | null; at: string;
}

export type WidgetType = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'kpi' | 'table' | 'text' | 'image' | 'shape'
  | 'heatmap' | 'pareto' | 'histogram' | 'xchart' | 'xbar' | 'pct' | 'slicer' | 'card' | 'condition';
export type Agg = 'sum' | 'avg' | 'count' | 'count_distinct' | 'min' | 'max' | 'none';
export interface DataSource {
  sheetId: string; xColumnId?: string | null; xBucket?: 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  series: { columnId?: string | null; aggregation: Agg; label?: string | null }[];
  groupByColumnId?: string | null; filters?: ColumnFilter[]; sort?: 'x_asc' | 'x_desc' | 'value_asc' | 'value_desc'; limit?: number;
  kind?: 'histogram' | 'xchart' | 'xbar' | null; bins?: number;
}
export interface WidgetStyle {
  bg?: string; text?: string; border?: string; borderWidth?: number; radius?: number; shadow?: 'none' | 'sm' | 'md' | 'lg';
  padding?: number; opacity?: number; showTitle?: boolean; titleSize?: number; titleAlign?: 'left' | 'center' | 'right'; subtitle?: string;
  hidden?: boolean;
}
export interface Widget {
  id: string; type: WidgetType; title: string; x: number; y: number; w: number; h: number; z: number; locked: boolean;
  config: Record<string, any>; style: WidgetStyle; dataSource: DataSource | null;
}
export interface DashboardMeta {
  id: string; fileId: string; name: string; canvas: { width: number; height: number; gridSize: number; snap: boolean };
  background: { color?: string | null; imageUrl?: string | null; fit?: 'cover' | 'contain' | 'repeat' | null };
  updatedAt?: string;
}
export interface WidgetData {
  categories: string[]; series: { key: string; name: string; values: (number | null)[] }[];
  points: { x: any; y: number | null }[]; totalRows: number;
  stats?: { cl?: number; ucl?: number; lcl?: number; mean?: number; sd?: number; min?: number; max?: number; n?: number };
}
