'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UIProvider } from './ui';
import { NewJobButton, LogoutButton } from './actions';

function Icon({ d }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}
const ICONS = {
  overview: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  queue: <><path d="M3 7h18M3 12h18M3 17h10" /></>,
  ready: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  jobs: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  accounts: <><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>,
  upcoming: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
};

const NAV = [
  { href: '/', key: 'overview', label: 'Overview' },
  { href: '/queue', key: 'queue', label: 'Approval queue', countKey: 'queue' },
  { href: '/ready', key: 'ready', label: 'Ready to publish', countKey: 'ready' },
  { href: '/upcoming', key: 'upcoming', label: 'Upcoming', countKey: 'upcoming' },
  { href: '/jobs', key: 'jobs', label: 'All jobs' },
  { href: '/accounts', key: 'accounts', label: 'Accounts' },
];

export function AppShell({ user, counts, children }) {
  const path = usePathname();
  const active = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  const items = NAV.map((n) => (
    <Link key={n.href} href={n.href} className={`nav-item ${active(n.href) ? 'active' : ''}`}>
      <Icon d={ICONS[n.key]} />
      {n.label}
      {n.countKey != null ? <span className={`nc ${counts[n.countKey] ? '' : 'zero'}`}>{counts[n.countKey] || 0}</span> : null}
    </Link>
  ));

  return (
    <UIProvider>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <span className="dot" />
            <span className="nm">STUDIO<span>·</span>CK</span>
            <span className="v">v1</span>
          </div>
          <NewJobButton block />
          <nav className="nav"><div className="nav-label">Cockpit</div>{items}</nav>
          <div className="side-foot">
            <div className="who"><span className="av">{(user || '?')[0].toUpperCase()}</span>{user}</div>
            <LogoutButton />
          </div>
        </aside>

        <div className="mobile-bar">
          <span className="mb">STUDIO<span>·</span>CK</span>
          {items}
        </div>

        <main className="main">{children}</main>
      </div>
    </UIProvider>
  );
}
