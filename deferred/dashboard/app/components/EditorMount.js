'use client';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const ImageEditor = dynamic(() => import('./image-editor'), {
  ssr: false,
  loading: () => <div style={{ padding: 40, color: '#9aa' }}>Loading editor…</div>,
});

export default function EditorMount() {
  const sp = useSearchParams();
  return <ImageEditor src={sp.get('src') || ''} topic={sp.get('topic') || ''} />;
}
