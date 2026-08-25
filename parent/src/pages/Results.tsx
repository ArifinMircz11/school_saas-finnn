import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

export default function Results() {
  const { data } = useQuery({ queryKey: ['results'], queryFn: () => api<any[]>('/results?publishedOnly=true') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Exams & Results" subtitle="Published results for your ward">
      {list.length === 0 ? <Empty title="No published results yet" /> : (
        <div className="saa-card"><Table headers={['Exam', 'Subject', 'Marks', 'Pass']} rows={list.map((r: any) => [r.exam?.name, r.examSubject?.subject?.name, Number(r.marksObtained), Number(r.marksObtained) >= (r.examSubject?.passMarks || 0) ? '✓' : '✗'])} /></div>
      )}
    </Page>
  );
}