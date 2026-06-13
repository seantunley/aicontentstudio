'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UIProvider } from './ui';
import { NewJobButton, LogoutButton } from './actions';

function Icon({ d, className = 'ico' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}
const ICONS = {
  overview: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  queue: <><path d="M20 6L9 17l-5-5" /></>,
  ready: <><path d="M12 19V5M5 12l7-7 7 7" /></>,
  upcoming: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M7 13h2M11 13h2M15 13h2M7 17h2M11 17h2" /></>,
  scout: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  jobs: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  vault: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="12" cy="12" r="3.2" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
  accounts: <><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>,
  costs: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></>,
  brands: <><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
};

// calm: true → neutral count chip (informational, not "waiting on you")
const GROUPS = [
  { label: 'The desk', items: [
    { href: '/', key: 'overview', label: 'Overview' },
    { href: '/queue', key: 'queue', label: 'Approval queue', countKey: 'queue' },
    { href: '/ready', key: 'ready', label: 'Ready to publish', countKey: 'ready' },
    { href: '/upcoming', key: 'upcoming', label: 'Upcoming', countKey: 'upcoming', calm: true },
    { href: '/calendar', key: 'calendar', label: 'Calendar' },
  ]},
  { label: 'Intake', items: [
    { href: '/scout', key: 'scout', label: 'Scout', countKey: 'scout' },
    { href: '/jobs', key: 'jobs', label: 'All jobs' },
  ]},
  { label: 'Brands', items: [
    { href: '/brands', key: 'brands', label: 'Brands' },
  ]},
  { label: 'Library', items: [
    { href: '/vault', key: 'vault', label: 'The Vault', countKey: 'vault', calm: true },
  ]},
  { label: 'Operations', items: [
    { href: '/accounts', key: 'accounts', label: 'Accounts' },
    { href: '/costs', key: 'costs', label: 'Cost ledger' },
    { href: '/trash', key: 'trash', label: 'Trash', countKey: 'trash', calm: true },
  ]},
];

const TABS = [
  { href: '/', key: 'overview', label: 'Desk' },
  { href: '/queue', key: 'queue', label: 'Queue', countKey: 'queue' },
  { href: '/ready', key: 'ready', label: 'Ready', countKey: 'ready' },
  { href: '/scout', key: 'scout', label: 'Scout', countKey: 'scout' },
];
const MORE = [
  { href: '/calendar', key: 'calendar', label: 'Calendar' },
  { href: '/upcoming', key: 'upcoming', label: 'Upcoming' },
  { href: '/vault', key: 'vault', label: 'The Vault' },
  { href: '/jobs', key: 'jobs', label: 'All jobs' },
  { href: '/brands', key: 'brands', label: 'Brands' },
  { href: '/accounts', key: 'accounts', label: 'Accounts' },
  { href: '/costs', key: 'costs', label: 'Cost ledger' },
  { href: '/trash', key: 'trash', label: 'Trash' },
];

function Wordmark() {
  return <span className="wordmark">The Studio<em>.</em></span>;
}

export function AppShell({ user, counts, children }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const active = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  const moreActive = MORE.some((n) => active(n.href));

  const navItem = (n) => (
    <Link key={n.href} href={n.href} className={`nav-item ${active(n.href) ? 'active' : ''}`} onClick={() => setMore(false)}>
      <Icon d={ICONS[n.key]} />
      {n.label}
      {n.countKey != null ? (
        <span className={`nc ${n.calm ? 'calm' : ''} ${counts[n.countKey] ? '' : 'zero'}`}>{counts[n.countKey] || 0}</span>
      ) : null}
    </Link>
  );

  return (
    <UIProvider>
      <div className="layout">
        <aside className="sidebar">
          <div className="masthead">
            <Wordmark />
            <div className="strap"><span className="pulse" /> operator&rsquo;s desk</div>
          </div>
          <NewJobButton block />
          <nav className="nav">
            {GROUPS.map((g) => (
              <div key={g.label} style={{ display: 'contents' }}>
                <div className="nav-label">{g.label}</div>
                {g.items.map(navItem)}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <div className="who"><span className="av">{(user || '?')[0].toUpperCase()}</span>{user}</div>
            <LogoutButton />
            <div className="colophon">est. 2026 · vol. II</div>
          </div>
        </aside>

        <div style={{ minWidth: 0 }}>
          <div className="mobile-top">
            <Wordmark />
            <NewJobButton />
          </div>
          <main className="main">{children}</main>
        </div>

        {more && <div className="sheet-back" onClick={() => setMore(false)} />}
        {more && (
          <div className="more-sheet">
            <nav className="nav">
              {MORE.map(navItem)}
              <div className="nav-label">Session</div>
              <div style={{ padding: '8px 10px' }}><LogoutButton /></div>
            </nav>
          </div>
        )}
        <nav className="tabbar">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={`tab ${active(t.href) && !more ? 'active' : ''}`} onClick={() => setMore(false)}>
              {t.countKey && counts[t.countKey] ? <span className="tbadge">{counts[t.countKey]}</span> : null}
              <Icon d={ICONS[t.key]} />
              {t.label}
            </Link>
          ))}
          <button className={`tab ${more || moreActive ? 'active' : ''}`} onClick={() => setMore((m) => !m)}>
            <Icon d={ICONS.more} />
            More
          </button>
        </nav>
      </div>
    </UIProvider>
  );
}
