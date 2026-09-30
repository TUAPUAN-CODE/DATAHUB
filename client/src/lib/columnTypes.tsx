import { AlignLeft, AtSign, Calendar, CalendarClock, CircleDot, Hash, Link, Percent, Tags, ToggleLeft, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ColumnDraft, DataType } from '@/types';

export const TYPE_META: Record<DataType, { label: string; sql: string; icon: ReactNode; width: number; hint: string }> = {
  varchar: { label: 'ข้อความสั้น', sql: 'VARCHAR', icon: <Type />, width: 180, hint: 'ชื่อ รหัส ข้อความบรรทัดเดียว' },
  text: { label: 'ข้อความยาว', sql: 'TEXT', icon: <AlignLeft />, width: 260, hint: 'หมายเหตุ รายละเอียดหลายบรรทัด' },
  int: { label: 'จำนวนเต็ม', sql: 'INT', icon: <Hash />, width: 120, hint: 'จำนวนชิ้น จำนวนครั้ง' },
  float: { label: 'ทศนิยม', sql: 'FLOAT', icon: <Percent />, width: 120, hint: 'น้ำหนัก เปอร์เซ็นต์ ราคา' },
  date: { label: 'วันที่', sql: 'DATE', icon: <Calendar />, width: 130, hint: 'วว/ดด/ปปปป' },
  datetime: { label: 'วันที่และเวลา', sql: 'DATETIME', icon: <CalendarClock />, width: 170, hint: 'วันที่พร้อมเวลา' },
  boolean: { label: 'ใช่ / ไม่ใช่', sql: 'BIT', icon: <ToggleLeft />, width: 110, hint: 'ช่องทำเครื่องหมาย' },
  select: { label: 'ตัวเลือกเดียว', sql: 'SELECT', icon: <CircleDot />, width: 150, hint: 'เลือก 1 ค่าจากรายการ' },
  multi_select: { label: 'หลายตัวเลือก', sql: 'MULTI', icon: <Tags />, width: 200, hint: 'เลือกได้หลายค่า' },
  url: { label: 'ลิงก์', sql: 'URL', icon: <Link />, width: 200, hint: 'https://…' },
  email: { label: 'อีเมล', sql: 'EMAIL', icon: <AtSign />, width: 200, hint: 'name@company.com' },
};
export const DATA_TYPES = Object.keys(TYPE_META) as DataType[];
export const isNumeric = (t: DataType) => t === 'int' || t === 'float';
export const isDateish = (t: DataType) => t === 'date' || t === 'datetime';
export const isSelect = (t: DataType) => t === 'select' || t === 'multi_select';

let k = 0;
export const newKey = () => `c${Date.now().toString(36)}${(k++).toString(36)}`;
export const newDraft = (partial: Partial<ColumnDraft> = {}): ColumnDraft => {
  const dataType = partial.dataType ?? 'varchar';
  return { key: newKey(), name: '', dataType, isRequired: false, width: TYPE_META[dataType].width, validation: {}, options: isSelect(dataType) ? [] : null, ...partial };
};

export const TEMPLATES: { id: string; name: string; description: string; columns: Partial<ColumnDraft>[] }[] = [
  { id: 'blank', name: 'ว่าง', description: 'เริ่มจากคอลัมน์เดียว', columns: [{ name: 'ชื่อรายการ', dataType: 'varchar', isRequired: true }] },
  {
    id: 'production', name: 'บันทึกยอดผลิต', description: 'วันที่ ไลน์ กะ ยอดผลิต ของเสีย',
    columns: [
      { name: 'วันที่', dataType: 'date', isRequired: true },
      { name: 'ไลน์', dataType: 'select', isRequired: true, options: [{ value: 'Line 1', label: 'Line 1', color: '#1552F0' }, { value: 'Line 2', label: 'Line 2', color: '#16A34A' }] },
      { name: 'กะ', dataType: 'select', isRequired: true, options: [{ value: 'Day', label: 'กะเช้า', color: '#0EA5E9' }, { value: 'Night', label: 'กะดึก', color: '#6366F1' }] },
      { name: 'ยอดผลิต', dataType: 'int', isRequired: true, validation: { min: 0 } },
      { name: 'ของเสีย', dataType: 'int', validation: { min: 0 }, defaultValue: 0 },
      { name: 'หมายเหตุ', dataType: 'text' },
    ],
  },
  {
    id: 'checklist', name: 'รายการตรวจสอบ', description: 'หัวข้อ ผู้รับผิดชอบ สถานะ กำหนดส่ง',
    columns: [
      { name: 'หัวข้อ', dataType: 'varchar', isRequired: true },
      { name: 'ผู้รับผิดชอบ', dataType: 'varchar' },
      { name: 'สถานะ', dataType: 'select', isRequired: true, defaultValue: 'todo', options: [{ value: 'todo', label: 'รอดำเนินการ', color: '#F59E0B' }, { value: 'doing', label: 'กำลังทำ', color: '#1552F0' }, { value: 'done', label: 'เสร็จแล้ว', color: '#16A34A' }] },
      { name: 'กำหนดส่ง', dataType: 'date' },
      { name: 'ผ่าน', dataType: 'boolean' },
    ],
  },
];
