import { Calendar } from '@/app/components/Calendar';

export const dynamic = 'force-dynamic';

export default function CalendarPage() {
  return (
    <>
      <div className="phead">
        <div><h1>Calendar</h1><div className="lede">Every scheduled and published post, mirrored from Postiz. It refreshes itself; move posts in Postiz and they update here.</div></div>
      </div>
      <Calendar />
    </>
  );
}
