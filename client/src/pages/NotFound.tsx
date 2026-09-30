import { Link } from 'react-router-dom';
import { Page } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/misc';

export default function NotFound() {
  return <Page><div className="ds-card mt-8"><EmptyState title="ไม่พบหน้าที่ต้องการ" description="ลิงก์อาจไม่ถูกต้อง หรือรายการถูกย้าย/ลบไปแล้ว" action={<Link to="/"><Button>กลับหน้าแรก</Button></Link>} /></div></Page>;
}
