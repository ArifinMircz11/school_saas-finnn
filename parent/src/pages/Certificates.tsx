import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api, formats } from '../services/api';

export default function Certificates() {
  const { data } = useQuery({ queryKey: ['certificates'], queryFn: () => api<any[]>('/certificates') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Certificates" subtitle="Certificates issued for your ward">
      {list.length === 0 ? <Empty title="No certificates yet" /> : (
        <div className="saa-card"><Table headers={['Number', 'Type', 'Issued', 'Download']} rows={list.map((c: any) => [c.number, c.type, formats.date(c.issuedAt), <a key={'c' + c.id} href={c.pdfUrl || '#'} style={{ fontSize: 14 }}>⬇</a>])} /></div>
      )}
    </Page>
  );
}