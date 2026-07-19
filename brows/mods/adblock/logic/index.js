// AdBlock extension logic
// Блокировка рекламы и трекеров

const TRACKER_DOMAINS = [
  'google-analytics.com',
  'analytics.google.com',
  'doubleclick.net',
  'facebook.net',
  'fbcdn.net',
  'connect.facebook.net',
  'twitter.com',
  'platform.twitter.com',
  'linkedin.com',
  'static.linkedin.com',
  'hotjar.com',
  'hotjar.io',
  'crazyegg.com',
  'optimizely.com',
  'segment.com',
  'amplitude.com',
  'mixpanel.com',
  'bugsnag.com',
  'sentry.io',
  'newrelic.com',
  'appsflyer.com',
  'adjust.com',
  'branch.io',
  'taboola.com',
  'outbrain.com',
  'ads.yahoo.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'casalemedia.com',
  'quantserve.com',
  'scorecardresearch.com',
  'krxd.net',
  'bluekai.com',
  'exelator.com',
  'turn.com',
  'media.net',
  'adsrvr.org',
  'mathtag.com',
  'demdex.net',
  'everesttech.net',
  'rlcdn.com',
  'tapad.com',
  'adsymptotic.com',
  'contextweb.com',
  'yieldmo.com'
];

const AD_KEYWORDS = [
  'doubleclick',
  'adservice',
  'adsystem',
  'advert',
  'advertisement',
  'banner',
  'sponsor',
  'promote',
  'affiliate',
  'tracking',
  'pixel',
  'beacon'
];

function isTracker(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    
    // Check exact domain match
    for (const domain of TRACKER_DOMAINS) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return true;
      }
    }
    
    // Check keywords in URL
    for (const keyword of AD_KEYWORDS) {
      if (hostname.includes(keyword) || url.includes(keyword)) {
        return true;
      }
    }
    
    return false;
  } catch (e) {
    return false;
  }
}

// Export for use in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isTracker, TRACKER_DOMAINS };
}
