import {useCallback, useEffect, useState} from 'react';
import {getFunctions, httpsCallable} from 'firebase/functions';

const call = async (name: string, data: any = {}) => (await httpsCallable(getFunctions(), name)(data)).data as any;
const command = () => crypto.randomUUID().replaceAll('-', '_');
const EN = {
  title: 'Course-provided availability', loading: 'Loading availability…', empty: 'No availability slots.',
  error: 'Course availability could not be loaded.',
  boundary: 'Golfriend coordinates third-party booking only. No payment, fee, settlement or financial transaction is owned by Golfriend.',
  create: 'Create pending slot', approve: 'Approve', close: 'Close', reopen: 'Reopen', cancel: 'Cancel',
};
const COPY: any = {
  en: EN,
  th: {...EN, title: 'เวลาว่างที่สนามกอล์ฟเป็นผู้ให้บริการ', loading: 'กำลังโหลดเวลาว่าง…', empty: 'ยังไม่มีช่วงเวลา', error: 'ไม่สามารถโหลดเวลาว่างของสนามได้', boundary: 'Golfriend ประสานการจองกับบุคคลที่สามเท่านั้น ไม่รับชำระ ค่าธรรมเนียม หรือการชำระบัญชี'},
  ko: {...EN, title: '코스 제공 예약 가능 시간'}, ja: {...EN, title: 'コース提供の空き時間'}, zh: {...EN, title: '球场提供的可用时段'}, es: {...EN, title: 'Disponibilidad proporcionada por el campo'}, fr: {...EN, title: 'Disponibilités fournies par le parcours'}, de: {...EN, title: 'Vom Platz bereitgestellte Verfügbarkeit'},
};

export default function CourseAvailabilityV2({admin = false}: {admin?: boolean}) {
  // Courses owns the canonical receipt-bound pipeline.  This legacy availability
  // panel is still used by the partner surface, but has no Admin Courses role.
  if (admin) return null;
  const locale = localStorage.getItem(admin ? 'golfriend.admin.locale' : 'golfriend.locale') || 'en';
  const copy = COPY[locale] || EN;
  const [data, setData] = useState<any>(null), [state, setState] = useState('loading'), [busy, setBusy] = useState(false);
  const [courseId, setCourseId] = useState(''), [date, setDate] = useState(''), [time, setTime] = useState(''), [timeZone, setTimeZone] = useState('Asia/Bangkok'), [capacity, setCapacity] = useState(4), [notice, setNotice] = useState('');
  const load = useCallback(async () => { setState('loading'); try { setData(await call(admin ? 'listCourseAvailabilityAdminV2' : 'getCourseAvailabilityV2')); setState('ready'); } catch { setState('error'); } }, [admin]);
  useEffect(() => { void load(); }, [load]);
  const run = async (operation: () => Promise<any>) => { setBusy(true); try { const result = await operation(); setNotice(`OK · ${result.receiptId}`); await load(); } catch { setNotice(copy.error); } finally { setBusy(false); } };
  if (state === 'loading') return <p role="status">{copy.loading}</p>;
  if (state === 'error') return <p role="alert">{copy.error}</p>;
  return <section className="partner-authority"><h2>{copy.title}</h2><strong>{copy.boundary}</strong>
    {!admin && !data.readOnly && <form onSubmit={event => { event.preventDefault(); void run(() => call('manageCourseAvailabilityV2', {action: 'create', courseId, date, time, timeZone, capacity, expectedVersion: 0, commandId: command()})); }}>
      <label>Course ID<input required value={courseId} onChange={event => setCourseId(event.target.value)}/></label><label>Date<input required type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label>Local time<input required type="time" value={time} onChange={event => setTime(event.target.value)}/></label><label>Time zone<input required value={timeZone} onChange={event => setTimeZone(event.target.value)}/></label><label>Capacity<input required type="number" min="1" max="8" value={capacity} onChange={event => setCapacity(Number(event.target.value))}/></label><button disabled={busy}>{copy.create}</button>
    </form>}
    {!data.slots.length ? <p>{copy.empty}</p> : <ul>{data.slots.map((slot: any) => <li key={slot.slotId}>{slot.courseId} · {slot.date} {slot.time} {slot.timeZone} · {slot.bookedCount}/{slot.capacity} · {slot.status} · v{slot.version}{admin && <>{slot.status === 'pending_admin' && <button onClick={() => void run(() => call('reviewCourseAvailabilityV2', {slotId: slot.slotId, status: 'open', expectedVersion: slot.version, commandId: command()}))}>{copy.approve}</button>}{slot.status === 'open' && <button onClick={() => void run(() => call('reviewCourseAvailabilityV2', {slotId: slot.slotId, status: 'closed', expectedVersion: slot.version, commandId: command()}))}>{copy.close}</button>}{slot.status === 'closed' && <button onClick={() => void run(() => call('reviewCourseAvailabilityV2', {slotId: slot.slotId, status: 'open', expectedVersion: slot.version, commandId: command()}))}>{copy.reopen}</button>}</>}</li>)}</ul>}
    {notice && <p role={notice.startsWith('OK') ? 'status' : 'alert'}>{notice}</p>}
  </section>;
}
