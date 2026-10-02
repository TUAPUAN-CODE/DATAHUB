import { get, post } from '@/api/client';

export interface FormulaFn { name: string; group: string; signature: string; description: string; example?: string }
export type FormulaCheck = { valid: true; display: string; dependsOn: string[] } | { valid: false; message: string; pos: number };

let cache: FormulaFn[] | null = null;

export const formulaApi = {
  async functions(): Promise<FormulaFn[]> {
    if (!cache) cache = (await get<{ functions: FormulaFn[] }>('/formula/functions')).functions;
    return cache;
  },
  validate: (sheetId: string, body: { expr: string; dataType: string; columnId?: string | null; sources?: { alias: string; sheetId: string }[] }) => post<FormulaCheck>(`/sheets/${sheetId}/formula/validate`, body),
  recompute: (sheetId: string) => post<{ queued: boolean; rows?: number; cellsChanged?: number }>(`/sheets/${sheetId}/formula/recompute`),
};
