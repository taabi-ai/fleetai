import Script from 'next/script'
import { getIntegration } from '@/lib/integrations'

/**
 * Server component: when the New Relic integration is enabled in /admin/integrations, injects the
 * standard New Relic Browser (RUM) agent. The browser license key is a public browser key by design.
 */
export async function NewRelicRum() {
  let cfg: Awaited<ReturnType<typeof getIntegration>> = null
  try { cfg = await getIntegration('new_relic') } catch { cfg = null }
  if (!cfg?.enabled) return null
  const c = cfg.config
  if (!c.accountID || !c.applicationID || !c.licenseKey) return null
  const beacon = c.beacon || 'bam.nr-data.net'
  const agentID = c.agentID || c.applicationID
  const trustKey = c.trustKey || c.accountID
  const init = JSON.stringify({
    distributed_tracing: { enabled: true },
    privacy: { cookies_enabled: true },
    ajax: { deny_list: [beacon] },
    session_replay: { enabled: false },
  })
  const info = JSON.stringify({ beacon, errorBeacon: beacon, licenseKey: c.licenseKey, applicationID: c.applicationID, sa: 1 })
  const loader = JSON.stringify({ accountID: c.accountID, trustKey, agentID, licenseKey: c.licenseKey, applicationID: c.applicationID })
  return (
    <>
      <Script id="nr-config" strategy="beforeInteractive">{`window.NREUM||(NREUM={});NREUM.init=${init};NREUM.loader_config=${loader};NREUM.info=${info};`}</Script>
      <Script id="nr-loader" src="https://js-agent.newrelic.com/nr-loader-spa-current.min.js" strategy="afterInteractive" />
    </>
  )
}
