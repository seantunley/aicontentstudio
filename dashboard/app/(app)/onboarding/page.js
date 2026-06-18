import { getActiveBrand } from '@/lib/brand';
import { listBrands, getBrandBySlug, getSetting } from '@/lib/db';
import OnboardingWizard from '@/app/components/onboardingWizard';

export const dynamic = 'force-dynamic';

const hasEnv = (k) => !!(process.env[k] && String(process.env[k]).trim());
const setting = (k) => { try { return getSetting(k) || ''; } catch { return ''; } };

// Guided setup wizard — walks a new operator through Telegram, studio basics, the brand pack
// (the biggest lever on output) and reference photos. Non-blocking: every step is skippable.
export default async function OnboardingPage() {
  const activeSlug = await getActiveBrand();
  let brands = [];
  try { brands = listBrands() || []; } catch { brands = []; }
  let brand = null;
  try { brand = (activeSlug && getBrandBySlug(activeSlug)) || brands[0] || null; } catch { brand = null; }

  return (
    <>
      <div className="phead">
        <div>
          <h1>Set up your studio</h1>
          <div className="lede">A few steps to get the studio sounding like you and producing its best work. Nothing here is required — fill in what you can; the rest can wait.</div>
        </div>
      </div>
      <OnboardingWizard
        initialBrand={brand}
        telegramConnected={hasEnv('TELEGRAM_BOT_TOKEN') && hasEnv('TELEGRAM_ALLOWED_USERS')}
        studioName={setting('studio_name')}
        region={setting('default_region')}
      />
    </>
  );
}
