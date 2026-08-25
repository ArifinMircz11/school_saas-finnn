import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

export default function Exams() {
  const { data } = useQuery({ queryKey: ['exams'], queryFn: () => api<any[]>('/exams') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Exams" subtitle="Upcoming and past examinations">
      {list.length === 0 ? <Empty title="No exams scheduled" /> : (
        <div className="saa-card"><Table headers={['Exam', 'Start', 'End']} rows={list.map((e: any) => [e.name, e.startDate?.slice(0, 10), e.endDate?.slice(0, 10)])} /></div>
      )}
    </Page>
  );
}