import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Page, Stat, Table, Empty, api, formats } from '../services/api';

export default function Fees() {
  const { data, isLoading } = useQuery({ queryKey: ['principal-fees'], queryFn: () => api<any>('/principal/fees/overview') });
  const d = data?.data;
  const classRows = (d?.classWise || []).map((c: any) => [c.name, formats.money(c.pending)]);

  return (
    <Page title="Fees Overview" subtitle="Financial summary (configuration & collection managed by School Admin)">
      {isLoading ? <p>Loading…</p> : d ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 12 }}>
            <Stat label="Today's Collection" value={formats.money(d.todayCollection)} hint={`${d.todayPayments ?? 0} payments`} />
            <Stat label="Monthly Collection" value={formats.money(d.monthCollection)} />
            <Stat label="Total Pending" value={formats.money(d.pendingAmount)} />
            <Stat label="Overdue" value={formats.money(d.overdueAmount)} hint={`${d.overdueCount ?? 0} overdue rows`} />
          </div>
          <div className="saa-card" style={{ marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Class-wise Pending</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={d.classWise || []}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="pending" name="Pending" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {d.classWise?.length ? <div style={{ marginTop: 16 }}><Table headers={['Class', 'Pending']} rows={classRows} /></div> : null}
        </>
      ) : <Empty title="No fee data" />}
    </Page>
  );
}