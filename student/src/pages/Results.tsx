import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

export default function Results() {
  const { data } = useQuery({ queryKey: ['results'], queryFn: () => api<any[]>('/results?publishedOnly=true') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Results" subtitle="Your published results">
      {list.length === 0 ? <Empty title="No published results yet" /> : (
        <div className="saa-card"><Table headers={['Exam', 'Subject', 'Marks', 'Out of', 'Pass']} rows={list.map((r: any) => [r.exam?.name, r.examSubject?.subject?.name, Number(r.marksObtained), r.examSubject?.maxMarks, Number(r.marksObtained) >= (r.examSubject?.passMarks || 0) ? '✓' : '✗'])} /></div>
      )}
    </Page>
  );
}