'use client';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const PolotnoEditor = dynamic(() => import('./polotno-editor'), {
  ssr: false,
  loading: () => <div style={{ padding: 40, color: '#9aa' }}>Loading editor…</div>,
});

export default function EditorMount() {
  const sp = useSearchParams();
  return <PolotnoEditor src={sp.get('src') || ''} topic={sp.get('topic') || ''} />;
}
