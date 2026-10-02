import { get, post, put } from '@/api/client';
import type { MixCfg, ScanProfile } from '@/api/endpoints';
import type { Row } from '@/types';

export type ScanResult = { action: 'created' | 'updated'; rowNo: number; profile: { id: string; name: string }; row: Row };
export const scanApi = {
  saveProfiles: (sheetId: string, profiles: ScanProfile[]) => put(`/sheets/${sheetId}/scan/profiles`, { profiles }),
  scan: (sheetId: string, text: string, profileId?: string | null) => post<ScanResult>(`/sheets/${sheetId}/scan`, { text, profileId: profileId || null }),
  saveMix: (sheetId: string, mix: MixCfg | null) => put(`/sheets/${sheetId}/mix/settings`, { mix }),
  findForMix: (sheetId: string, value: string) => get<{ row: Row }>(`/sheets/${sheetId}/mix/find`, { value }),
  mix: (sheetId: string, b: { inputs: { rowId: string; qty: number }[]; outputQty?: number | null }) =>
    post<{ row: Row; rowNo: number; total: number; remaining: { rowId: string; remaining: number }[] }>(`/sheets/${sheetId}/mix`, b),
};

/** same split as the server (so the editor can show the pieces while typing a sample) */
export const splitScan = (text: string, delimiter: string): string[] => {
  const d = delimiter === '\\t' ? '\t' : delimiter;
  const t = text.replace(/[\r\n]+$/g, '');
  return (d ? t.split(d) : [t]).map((s) => s.trim());
};
