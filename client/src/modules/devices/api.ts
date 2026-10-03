import { del, get, post, put } from '@/api/client';

export interface Device { id: string; name: string; kind: 'rfid_tcp' | 'http'; host: string | null; port: number | null; initHex: string | null; startHex: string | null; enabled: boolean; status: string; lastSeen: string | null; lastError: string | null; bindings: number }
export interface DeviceEvent { id: number; value: string; at: string; outcome: 'ok' | 'error' | 'unbound'; detail: string | null }
export interface SlipCfg { title?: string | null; columnIds?: string[] | null; qr?: 'none' | 'rowNo' | 'column'; qrColumnId?: string | null; onlyStampColumnId?: string | null }
export interface SheetDevice { id: string; name: string; kind: string; status: string; bound: boolean; enabled: boolean; profileId: string | null; printerId: string | null; slip: SlipCfg | null }
export interface Printer { id: string; name: string; agentUrl: string; printerHost: string | null; printerShare: string | null; dotWidth: number | null; enabled: boolean }
export const devicesApi = {
  list: () => get<{ devices: Device[]; gateway: boolean }>('/devices'),
  create: (b: { name: string; kind: string; host?: string | null; port?: number | null; initHex?: string | null; startHex?: string | null }) => post<{ id: string; apiKey: string | null }>('/devices', b),
  update: (id: string, b: Partial<{ name: string; host: string; port: number; enabled: boolean; initHex: string; startHex: string }>) => put(`/devices/${id}`, b),
  remove: (id: string) => del(`/devices/${id}`),
  events: (id: string) => get<{ events: DeviceEvent[] }>(`/devices/${id}/events`),
  test: (id: string, value: string) => post<{ outcome: string; detail: string }>(`/devices/${id}/test-event`, { value }),
  forSheet: (sheetId: string) => get<{ devices: SheetDevice[]; cooldownMin: number; printers: { id: string; name: string }[] }>(`/sheets/${sheetId}/devices`),
  printers: () => get<{ printers: Printer[] }>('/printers'),
  addPrinter: (b: Omit<Printer, 'id' | 'enabled'>) => post<{ id: string }>('/printers', b),
  updatePrinter: (id: string, b: Partial<Omit<Printer, 'id'>>) => put(`/printers/${id}`, b),
  removePrinter: (id: string) => del(`/printers/${id}`),
  testPrinter: (id: string) => post<{ sent: boolean }>(`/printers/${id}/test`),
  saveCooldown: (sheetId: string, cooldownMin: number) => put(`/sheets/${sheetId}/devices-settings`, { cooldownMin }),
  bind: (sheetId: string, deviceId: string, b: { enabled: boolean; profileId?: string | null; printerId?: string | null; slip?: SlipCfg | null }) => put(`/sheets/${sheetId}/devices/${deviceId}`, b),
};
export const DEFAULT_INIT_HEX = '7CFFFF823200D2';
export const DEFAULT_START_HEX = '7CFFFF20000501000200C896';
export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  connected: { text: 'เชื่อมต่อแล้ว', cls: 'bg-success' }, disconnected: { text: 'หลุดการเชื่อมต่อ', cls: 'bg-warning' }, error: { text: 'ผิดพลาด', cls: 'bg-danger' }, off: { text: 'ปิดอยู่', cls: 'bg-muted' }, waiting: { text: 'รอตัวเชื่อมต่อ (gateway ยังปิดที่เซิร์ฟเวอร์)', cls: 'bg-warning' },
};
