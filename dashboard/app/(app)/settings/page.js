import { allSettings } from '@/lib/db';
import { getSession } from '@/lib/session';
import { EDITABLE_TABS } from '@/lib/settingsSchema';
import { settingsStatus } from '@/lib/settingsStatus';
import { SettingsPanel } from '@/app/components/settings';

export const dynamic = 'force-dynamic';

// Standalone /settings page — a fallback for a direct URL. The primary entry point is the top-right
// gear, which opens the same panel as a modal (see SettingsModal in AppShell).
export default async function Settings() {
  const session = await getSession();
  let stored = {};
  try { stored = allSettings(); } catch {}
  const values = {};
  for (const t of EDITABLE_TABS) {
    for (const f of t.fields) values[f.key] = stored[f.key] != null ? stored[f.key] : f.default;
  }
  const { integrations, system, registry, options } = settingsStatus();

  return (
    <>
      <div className="phead">
        <div>
          <h1>Settings</h1>
          <div className="lede">The studio&rsquo;s control panel. Editable options save instantly and take effect on the next run — no restart. Secrets and keys are shown as status only; they live in the gitignored <span className="kbd">.env</span> files, never here.</div>
        </div>
        <div className="crumbs">operator control</div>
      </div>
      <SettingsPanel tabs={EDITABLE_TABS} values={values} integrations={integrations} system={system} registry={registry} me={session.user || null} options={options} />
    </>
  );
}
