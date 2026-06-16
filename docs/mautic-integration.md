# Mautic integration — funnel / nurture lane

**Status: STOOD UP + installed (15 Jun 2026).** Login is live on the LAN at
`http://172.18.18.101:4010` (admin = the email/password in `mautic/.env`). It's idle until leads
flow — wire the handoffs below when a platform connects. Stack in
[`mautic/docker-compose.yml`](../mautic/docker-compose.yml).

Mautic is the **open-source marketing-automation suite** (GPL-3.0, ~250k orgs). It owns the
**outbound funnel lane**: contacts, segments, lead scoring, drip campaigns (the visual funnel
builder), landing pages, forms, and email/SMS — across channels, not one platform.

## Is it free / local / functional?
- **Free** — GPL-3.0, no licence cost. You pay only for infra (this box) and, if you send email,
  an SMTP relay/SES.
- **Local** — fully self-hosted via Docker (MariaDB + PHP/Apache + a cron worker). Two things reach
  outside the box and are **not** local: **(1)** email *delivery* needs an external SMTP relay /
  Amazon SES (you can't deliverably send mail from a residential/LAN IP); **(2)** public landing
  pages / forms need a public URL leads can reach. The automation/campaign engine itself is 100% local.
- **Functional** — the community edition is the full suite (campaigns, segments, scoring, emails,
  landing pages, forms, multi-channel). Not crippled; only Mautic's managed cloud adds hosting/support.

## Lanes — one owner each, no overlap
| Layer | Owner | Role |
|---|---|---|
| Create | **Studio** | content + lead magnets (posts, reels, scripts, infographics) |
| Publish | **Postiz** | pushes content to social platforms |
| Converse | **Chatwoot** | omnichannel inbox + social DMs (IG/WA/TG/FB/web), agent bots, human replies |
| **Nurture / funnel** | **Mautic** | contacts, segments, scoring, drip campaigns, landing pages, forms, email/SMS |

Mautic owns everything *after* someone becomes a lead. It does **not** do social-DM automation
(weak there) — DMs stay in Chatwoot / the IG Graph webhook. Mautic is the lead **system-of-record**
once a lead exists; do not duplicate the contact store elsewhere.

## Handoffs
1. **Studio → Mautic (assets):** the studio generates the lead magnet + landing/email copy; Mautic
   hosts the forms, landing pages and emails. The studio can push an asset via Mautic's REST API.
2. **Lead capture → Mautic (entry):**
   - Mautic form/landing submission → contact enters a campaign.
   - Chatwoot conversation qualifies (keyword/automation) → Chatwoot webhook → Mautic Contacts API.
   - IG comment-to-DM (Graph webhook) → a Chatwoot conversation **and** a Mautic contact.
3. **Mautic runs the funnel:** visual Campaign builder (trigger → wait → branch → email/SMS → score
   → convert). On a score/behaviour threshold → hand back to Chatwoot for a human, or notify the operator.
4. **Loop back → Studio Performance (§7f):** Mautic's opens/clicks/conversions per piece feed the
   performance panel — *which content actually converts*.

## Contact-handoff contract (Chatwoot / studio → Mautic)
Auth: Mautic API (OAuth2 preferred; Basic for a quick start). Base: `${MAUTIC_URL}/api`.

**1. Create/update the contact** (`POST /api/contacts/new` — Mautic dedupes on email/unique fields):
```json
{
  "email": "lead@example.com",          // or "mobile" for SMS-only leads
  "firstname": "",
  "tags": ["source:instagram", "brand:lactation", "magnet:gv-checklist"],
  "ig_username": "the_handle",          // custom field
  "lead_source": "chatwoot",            // custom field — where the lead came from
  "overwriteWithBlank": false
}
```
Response → `contact.id`.

**2. Drop the contact into the funnel** (pick one):
```
POST /api/segments/{segmentId}/contact/{contactId}/add     # segment-driven campaign
POST /api/campaigns/{campaignId}/contact/{contactId}/add   # add straight to a campaign
```

**3. (optional) Push studio-generated assets:** create/update a Mautic email or landing page from a
studio draft via `POST /api/emails/new` / the assets API, so the funnel sends *our* content.

**Reverse (Mautic → studio/Chatwoot):** a Mautic webhook (Settings → Webhooks) on
`mautic.lead_post_save` / campaign events → a studio endpoint that opens/updates a Chatwoot
conversation when a nurtured lead needs a human, and records conversion stats for Performance.

## Stack (see mautic/docker-compose.yml)
- `mautic` (web + API, port **4010**) · `mautic-cron` (`cron -f` — segments/campaigns/email queue) · `mautic-db` (MariaDB).
- Secrets in `mautic/.env` (gitignored; template in `mautic/.env.example`). Pin `mautic/mautic` to a stable digest.
- **GOTCHA (already handled in the compose):** the image declares `/var/www/html/{config,docroot/media/*,var/logs}`
  as Dockerfile VOLUMEs, so they MUST be explicit shared named volumes — otherwise web + cron each get their
  own anonymous `config` volume and never see the same `local.php`, and the cron sits forever "Waiting for
  Mautic to be installed." Also: the image reads `MAUTIC_DB_DATABASE` (not `_NAME`), needs `MAUTIC_DB_PORT`,
  and `MAUTIC_VOLUME_CONFIG` must be set on the cron role.

**Bring up:**
```
docker compose --project-directory mautic -f mautic/docker-compose.yml --env-file mautic/.env up -d
```
**One-off install (schema + admin)** — run after the app volume populates:
```
docker exec -u www-data mautic php /var/www/html/bin/console mautic:install \
  http://172.18.18.101:4010 --force --no-interaction \
  --db_driver=pdo_mysql --db_host=mautic-db --db_port=3306 --db_name=mautic \
  --db_user=mautic --db_password=$MAUTIC_DB_PASSWORD \
  --admin_email=$MAUTIC_ADMIN_EMAIL --admin_username=admin \
  --admin_firstname=... --admin_lastname=... --admin_password=$MAUTIC_ADMIN_PASSWORD
```
First job after first login: **Settings → Email** — point it at an SMTP relay/SES so campaign mail sends.

## Prerequisites / reality
- Heavier than a plugin: another DB + PHP + a cron worker + an SMTP/SES path for email.
- Public URL needed only for public landing pages/forms or inbound email tracking (same LAN-only
  caveat as the IG webhook). Email-only nurture needs just SMTP.
- Lighter alternative for the same lane: **Dittofeed** (embeddable, modern journeys) — at the cost
  of Mautic's maturity and its built-in landing-page/form builder.

## Phasing
- **A (now):** lanes locked (this doc) + the contact-handoff contract above.
- **B (when a platform + leads exist):** stand up the stack; wire Chatwoot→Mautic lead handoff +
  a "Funnels" link/panel in the desk; studio pushes lead-magnet assets.
- **C:** pipe Mautic conversion stats into the Performance loop (§7f).

## Enabling the REST API (one-time, required for the native Funnels mirror)

The studio renders Mautic natively by calling its REST API server-side. Mautic ships with the API
OFF. Enable it once (it persists on the `mautic_config` named volume):

```bash
# add api_enabled + api_enable_basic_auth to config/local.php, preserving existing config
docker exec -u www-data mautic php -r '$f="/var/www/html/config/local.php";$parameters=array();include $f;$parameters["api_enabled"]=true;$parameters["api_enable_basic_auth"]=true;file_put_contents($f,"<?php\n\$parameters = ".var_export($parameters,true).";\n");'
docker exec -u www-data -w /var/www/html mautic php bin/console cache:clear --no-warmup
```

Then set in the root `.env` (gitignored): `MAUTIC_API_URL` (server-side, e.g. `http://host.docker.internal:4010`),
`MAUTIC_API_USER=admin`, `MAUTIC_API_PASSWORD=<admin password>`. The dashboard uses HTTP Basic auth.
Lead capture from Typebot posts to `/api/funnels/capture?token=$FUNNEL_CAPTURE_TOKEN`.
