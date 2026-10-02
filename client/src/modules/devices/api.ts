import { del, get, post, put } from '@/api/client';

export interface Device { id: string; name: string; kind: 'rfid_tcp' | 'http'; host: string | null; port: number | null; initHex: string | null; startHex: string | null; enabled: boolean; status: string; lastSeen: string | null; lastError: string | null; bindings: number }
export interface DeviceEvent { id: number; value: string; at: string; outcome: 'ok' | 'error' | 'unbound'; detail: string | null }
export interface SheetDevice { id: string; name: string; kind: string; status: string; bound: boolean; enabled: boolean; profileId: string | null }
export const devicesApi = {
  list: () => get<{ devices: Device[]; gateway: boolean }>('/devices'),
  create: (b: { name: string; kind: string; host?: string | null; port?: number | null; initHex?: string | null; startHex?: string | null }) => post<{ id: string; apiKey: string | null }>('/devices', b),
  update: (id: string, b: Partial<{ name: string; host: string; port: number; enabled: boolean; initHex: string; startHex: string }>) => put(`/devices/${id}`, b),
  remove: (id: string) => del(`/devices/${id}`),
  events: (id: string) => get<{ events: DeviceEvent[] }>(`/devices/${id}/events`),
  test: (id: string, value: string) => post<{ outcome: string; detail: string }>(`/devices/${id}/test-event`, { value }),
  forSheet: (sheetId: string) => get<{ devices: SheetDevice[]; cooldownMin: number }>(`/sheets/${sheetId}/devices`),
  saveCooldown: (sheetId: string, cooldownMin: number) => put(`/sheets/${sheetId}/devices-settings`, { cooldownMin }),
  bind: (sheetId: string, deviceId: string, b: { enabled: boolean; profileId?: string | null }) => put(`/sheets/${sheetId}/devices/${deviceId}`, b),
};
export const DEFAULT_INIT_HEX = '7CFFFF823200D2';
export const DEFAULT_START_HEX = '7CFFFF20000501000200C896';
export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  connected: { text: 'เชื่อมต่อแล้ว', cls: 'bg-success' }, disconnected: { text: 'หลุดการเชื่อมต่อ', cls: 'bg-warning' }, error: { text: 'ผิดพลาด', cls: 'bg-danger' }, off: { text: 'ปิดอยู่', cls: 'bg-muted' }, waiting: { text: 'รอตัวเชื่อมต่อ (gateway ยังปิดที่เซิร์ฟเวอร์)', cls: 'bg-warning' },
};
