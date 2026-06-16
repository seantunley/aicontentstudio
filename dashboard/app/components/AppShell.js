'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UIProvider } from './ui';
import { NewJobButton, LogoutButton } from './actions';
import { SettingsModal } from './settings';
import { TrashModal } from './trash';
import { Clock, Weather } from './topwidgets';

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
  knowledge: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  occasions: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M12 13l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" /></>,
  campaigns: <><path d="M3 11l12-5v12L3 13z" /><path d="M15 8a3 3 0 0 1 0 6" /><path d="M6 13v4a2 2 0 0 0 2 2h1" /></>,
  performance: <><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="7" /><rect x="12" y="7" width="3" height="11" /><rect x="17" y="4" width="3" height="14" /></>,
  engagement: <><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" /></>,
  funnels: <><path d="M22 3H2l8 9.46V19l4 2v-8.54z" /></>,
  flows: <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v3M6 16v-2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" /></>,
  broadcasts: <><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></>,
  learnings: <><path d="M9 18h6M10 21h4" /><path d="M15.1 14c.2-1 .7-1.7 1.4-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.8 1.2 1.5 1.4 2.5" /></>,
  activity: <><path d="M3 12h4l2.5-7 5 14 2.5-7H21" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
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
    { href: '/engagement', key: 'engagement', label: 'Engagement' },
    { href: '/funnels', key: 'funnels', label: 'Funnels' },
    { href: '/flows', key: 'flows', label: 'Flows' },
    { href: '/broadcasts', key: 'broadcasts', label: 'Broadcasts' },
    { href: '/performance', key: 'performance', label: 'Performance' },
  ]},
  { label: 'Intake', items: [
    { href: '/scout', key: 'scout', label: 'Scout', countKey: 'scout' },
    { href: '/occasions', key: 'occasions', label: 'Occasions' },
    { href: '/campaigns', key: 'campaigns', label: 'Campaigns' },
    { href: '/jobs', key: 'jobs', label: 'All jobs' },
  ]},
  { label: 'Brands', items: [
    { href: '/brands', key: 'brands', label: 'Brands' },
  ]},
  { label: 'Library', items: [
    { href: '/vault', key: 'vault', label: 'The Vault', countKey: 'vault', calm: true },
    { href: '/knowledge', key: 'knowledge', label: 'Knowledge' },
  ]},
  { label: 'Operations', items: [
    { href: '/activity', key: 'activity', label: 'Activity', alertKey: 'errors' },
    { href: '/learnings', key: 'learnings', label: 'Learnings' },
    { href: '/accounts', key: 'accounts', label: 'Accounts' },
    { href: '/costs', key: 'costs', label: 'Cost ledger' },
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
  { href: '/knowledge', key: 'knowledge', label: 'Knowledge' },
  { href: '/jobs', key: 'jobs', label: 'All jobs' },
  { href: '/brands', key: 'brands', label: 'Brands' },
  { href: '/accounts', key: 'accounts', label: 'Accounts' },
  { href: '/costs', key: 'costs', label: 'Cost ledger' },
];

function Wordmark({ name }) {
  return <span className="wordmark">{name || 'The Studio'}<em>.</em></span>;
}

// Top-right operator menu: avatar → dropdown (name, Settings, Account, Log out). Sits beside the gear.
function UserMenu({ user, onOpenSettings, onOpenTrash, trashCount }) {
  const [open, setOpen] = useState(false);
  const initial = (user || '?')[0].toUpperCase();
  return (
    <div className="usermenu">
      <button className="usermenu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Operator menu">
        <span className="av">{initial}</span>
        <span className="usermenu-name">{user}</span>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <div className="um-back" onClick={() => setOpen(false)} />}
      {open && (
        <div className="usermenu-pop">
          <div className="usermenu-head">
            <span className="av">{initial}</span>
            <div><div className="um-name">{user}</div><div className="um-role">operator</div></div>
          </div>
          <button className="um-item" onClick={() => { setOpen(false); onOpenSettings(); }}><Icon d={ICONS.settings} /> Settings</button>
          <button className="um-item" onClick={() => { setOpen(false); onOpenSettings('account'); }}><Icon d={ICONS.accounts} /> Account &amp; password</button>
          <button className="um-item" onClick={() => { setOpen(false); onOpenTrash(); }}><Icon d={ICONS.trash} /> Trash{trashCount ? <span className="um-count">{trashCount}</span> : null}</button>
          <div className="um-sep" />
          <div className="um-item um-logout"><LogoutButton /></div>
        </div>
      )}
    </div>
  );
}

// The top bar (desktop): trash + settings gear (both open modals) + the operator menu, top-right.
function TopBar({ user, onOpenSettings, onOpenTrash, trashCount, weatherLocation }) {
  return (
    <div className="topbar">
      <Weather location={weatherLocation} />
      <Clock />
      <UserMenu user={user} onOpenSettings={onOpenSettings} onOpenTrash={onOpenTrash} trashCount={trashCount} />
    </div>
  );
}

// Active-brand switcher (§1b: always explicit, deliberate switch). Scopes the cockpit to one brand.
function BrandSwitcher({ brands, activeBrand }) {
  async function change(e) {
    const slug = e.target.value;
    await fetch('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
    window.location.reload();
  }
  const has = brands && brands.length > 0;
  return (
    <div className={`brandbar ${activeBrand ? 'scoped' : ''}`}>
      <span className="brandbar-lab">Brand</span>
      <select className="brandbar-sel" value={activeBrand || 'all'} onChange={change} disabled={!has}>
        <option value="all">All brands</option>
        {has && brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
      </select>
    </div>
  );
}

export function AppShell({ user, counts, brands, activeBrand, studioName, weatherLocation, children }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState(undefined);
  const [trashOpen, setTrashOpen] = useState(false);
  const openSettings = (tab) => { setSettingsTab(typeof tab === 'string' ? tab : undefined); setSettingsOpen(true); };
  const active = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  const moreActive = MORE.some((n) => active(n.href));

  // Collapsible sidebar groups. Default: "The desk" (and whichever group holds the current page)
  // open, the rest collapsed; the operator's choices are remembered in localStorage.
  const [collapsed, setCollapsed] = useState(() =>
    Object.fromEntries(GROUPS.map((g) => [g.label, g.label !== 'The desk' && !g.items.some((it) => active(it.href))])),
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nav-collapsed') || 'null');
      if (saved && typeof saved === 'object') setCollapsed((c) => ({ ...c, ...saved }));
    } catch {}
  }, []);
  const toggleGroup = (label) => setCollapsed((c) => {
    const next = { ...c, [label]: !c[label] };
    try { localStorage.setItem('nav-collapsed', JSON.stringify(next)); } catch {}
    return next;
  });

  const navItem = (n) => (
    <Link key={n.href} href={n.href} className={`nav-item ${active(n.href) ? 'active' : ''}`} onClick={() => setMore(false)}>
      <Icon d={ICONS[n.key]} />
      {n.label}
      {n.alertKey != null && counts[n.alertKey] ? (
        <span className="nc nc--alert">{counts[n.alertKey]}</span>
      ) : n.countKey != null ? (
        <span className={`nc ${n.calm ? 'calm' : ''} ${counts[n.countKey] ? '' : 'zero'}`}>{counts[n.countKey] || 0}</span>
      ) : null}
    </Link>
  );

  return (
    <UIProvider>
      <div className="layout">
        <aside className="sidebar">
          <div className="masthead">
            <Wordmark name={studioName} />
            <div className="strap"><span className="pulse" /> operator&rsquo;s desk</div>
          </div>
          <NewJobButton block defaultBrand={activeBrand} brands={brands} />
          <nav className="nav">
            {GROUPS.map((g) => (
              <div key={g.label} className={`nav-group ${collapsed[g.label] ? 'collapsed' : ''}`}>
                <button type="button" className="nav-label nav-label--btn" onClick={() => toggleGroup(g.label)} aria-expanded={!collapsed[g.label]}>
                  <span>{g.label}</span>
                  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <div className="nav-group-items">
                  {g.items.map(navItem)}
                </div>
              </div>
            ))}
          </nav>
          <div className="side-bottom">
            <BrandSwitcher brands={brands} activeBrand={activeBrand} />
            <div className="side-foot">
              <div className="colophon">est. 2026 · vol. II</div>
            </div>
          </div>
        </aside>

        <div style={{ minWidth: 0 }}>
          <TopBar user={user} onOpenSettings={openSettings} onOpenTrash={() => setTrashOpen(true)} trashCount={counts.trash} weatherLocation={weatherLocation} />
          <div className="mobile-top">
            <Wordmark name={studioName} />
            <BrandSwitcher brands={brands} activeBrand={activeBrand} />
            <NewJobButton defaultBrand={activeBrand} brands={brands} />
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
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} initialTab={settingsTab} />
        <TrashModal open={trashOpen} onClose={() => setTrashOpen(false)} />
      </div>
    </UIProvider>
  );
}
