import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Page, Stat, Table, SelectField, Empty, api } from '../services/api';

export default function AcademicPerformance() {
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const exams = useQuery({ queryKey: ['principal-exams'], queryFn: () => api<any>('/principal/exams') });
  const ac = useQuery({ queryKey: ['academic-profile'], queryFn: () => api<any>('/academic/profile') });
  const perf = useQuery({
    queryKey: ['principal-academic', examId, classId, subjectId],
    queryFn: () => api<any>(`/principal/academic/performance?examId=${examId}&classId=${classId}&subjectId=${subjectId}`),
  });
  const d = perf.data?.data;
  const examOptions = (exams.data?.data || []).map((e: any) => ({ value: e.id, label: e.name }));
  const classOptions = (ac.data?.data?.classes || []).map((c: any) => ({ value: c.id, label: c.name }));
  const subjectOptions = (ac.data?.data?.subjects || []).map((s: any) => ({ value: s.id, label: s.name }));
  const colors = ['#7c3aed', '#4f46e5', '#0ea5e9', '#16a34a', '#d97706'];

  return (
    <Page title="Academic Performance" subtitle="Analyse class, subject and exam performance">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
        <SelectField label="Exam" name="exam" value={examId} onChange={(e) => setExamId(e.target.value)} options={examOptions} placeholder="All exams" />
        <SelectField label="Class" name="class" value={classId} onChange={(e) => setClassId(e.target.value)} options={classOptions} placeholder="All classes" />
        <SelectField label="Subject" name="subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} options={subjectOptions} placeholder="All subjects" />
      </div>

      {perf.isLoading ? <p>Loading…</p> : !d ? <Empty title="No results yet" subtitle="Enter marks and publish results to see performance." /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
            <Stat label="Overall Average" value={`${d.overallAverage}%`} />
            <Stat label="Pass Percentage" value={`${d.passPct}%`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Subject-wise Average</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.subjectWise || []}>
                  <XAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="average" name="Average %" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Class-wise Average</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.classWise || []}>
                  <XAxis dataKey="className" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} />
                  <Tooltip />
                  <Bar dataKey="average" name="Average %" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Grade Distribution</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={d.gradeDistribution || []} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={70} label>
                    {(d.gradeDistribution || []).map((_: any, i: number) => <Cell key={i} fill={colors[i % colors.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Exam-wise Average</h3>
              {d.examWise?.length ? <Table headers={['Exam', 'Average', 'Students']} rows={(d.examWise || []).map((e: any) => [e.exam, `${e.average}%`, e.students])} /> : <p style={{ color: '#6b7280' }}>No exam data.</p>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Top Students</h3>
              {d.topStudents?.length ? <Table headers={['Name', 'Class', 'Average', 'Grade']} rows={(d.topStudents || []).map((s: any) => [s.name, s.className, `${s.average}%`, s.grade])} /> : <p style={{ color: '#6b7280' }}>None.</p>}
            </div>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Requires Attention (&lt;50%)</h3>
              {d.requiresAttention?.length ? <Table headers={['Name', 'Class', 'Average']} rows={(d.requiresAttention || []).map((s: any) => [s.name, s.className, `${s.average}%`])} /> : <p style={{ color: '#16a34a' }}>No students below 50%.</p>}
            </div>
          </div>
        </>
      )}
    </Page>
  );
}