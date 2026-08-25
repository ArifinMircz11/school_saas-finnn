import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Badge, Btn, Empty, api, toast } from '../services/api';

export default function Results() {
  const qc = useQueryClient();
  const exams = useQuery({ queryKey: ['principal-exams'], queryFn: () => api<any>('/principal/exams') });
  const examsList = exams.data?.data || [];

  const requestPublish = useMutation({
    mutationFn: (exam: any) => api('/principal/approvals', {
      method: 'POST',
      body: { type: 'RESULT_PUBLISH', referenceId: exam.id, reference: exam.name, title: `Publish results — ${exam.name}` },
    }),
    onSuccess: (r) => { toast(r.success ? 'Publish request submitted for approval' : (r.message || 'Failed')); qc.invalidateQueries({ queryKey: ['approvals'] }); },
  });

  const rows = examsList
    .filter((e: any) => e.resultsPublishedPct < 100)
    .map((e: any) => [
      e.name, `${e.resultsPublishedPct}%`, e.pending,
      <Btn disabled={requestPublish.isPending} onClick={() => requestPublish.mutate(e)}>Request publish</Btn>,
    ]);

  return (
    <Page title="Results" subtitle="Monitor result publication and request approvals">
      <p style={{ color: '#6b7280' }}>Results are published through the approval workflow. Request publication below; it will appear in <b>Leave & Approvals</b>.</p>
      {exams.isLoading ? <p>Loading…</p> : rows.length ? <Table headers={['Exam', 'Published', 'Pending', 'Action']} rows={rows} /> : <Empty title="Nothing pending" subtitle="All results are published or no exams exist." />}
    </Page>
  );
}