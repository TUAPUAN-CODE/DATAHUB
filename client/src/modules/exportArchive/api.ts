import { del, get, http, post } from '@/api/client';

export interface ArchiveItem {
  id: string; fileId: string; sheetId: string | null; title: string; templateName: string | null; originalName: string; sizeBytes: number; sha256: string;
  pageCount: number | null; rowCount: number | null; meta: { prompts?: Record<string, string>; signers?: { label: string; name: string }[]; note?: string | null; filters?: unknown };
  createdBy: string; createdByName: string | null; createdAt: string;
}
export interface ArchiveMeta {
  title: string; sheetId?: string | null; templateId?: string | null; templateName?: string | null; pageCount?: number | null; rowCount?: number | null;
  filters?: unknown; prompts?: Record<string, string>; signers?: { label: string; name: string }[]; note?: string | null;
}

export const archiveApi = {
  create(fileId: string, pdf: Blob, meta: ArchiveMeta) {
    const f = new FormData();
    f.append('meta', JSON.stringify(meta));
    f.append('pdf', pdf, 'document.pdf');
    return post<ArchiveItem>(`/files/${fileId}/exports`, f, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180_000 });
  },
  list: (fileId: string, params: { limit?: number; offset?: number; search?: string }) => get<{ items: ArchiveItem[]; total: number; canDelete: boolean }>(`/files/${fileId}/exports`, params),
  verify: (id: string) => get<{ intact: boolean; reason?: string }>(`/exports/${id}/verify`),
  remove: (id: string) => del(`/exports/${id}`),
  /** The download needs the login token, so it goes through axios instead of a plain link */
  async download(item: Pick<ArchiveItem, 'id' | 'originalName'>) {
    const r = await http.get(`/exports/${item.id}/download`, { responseType: 'blob', timeout: 180_000 });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.data as Blob);
    a.download = item.originalName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  },
};
