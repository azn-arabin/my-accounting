import { redirect } from 'next/navigation';

// Reports were replaced by Insights (category analysis by period); keep old links working.
export default function ReportsPage() {
  redirect('/insights');
}
