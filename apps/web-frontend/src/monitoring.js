import { SENTRY_DSN, isMonitoringConfigured } from './config';

/**
 * Error reporting, off unless a DSN is configured.
 *
 * Loaded from the CDN at runtime rather than bundled, so an unconfigured build
 * — a local checkout, a fork — ships nothing and fetches nothing.
 *
 * THE SCRUBBING IS NOT OPTIONAL. /privacy states we do not record queries, the
 * names searched, or the records returned. An error reporter that captures a
 * stack trace with the prompt attached would make that untrue, so anything that
 * could carry research content is stripped before a report is sent.
 */
let loaded = false;

// Keys whose values are research content or credentials, never reported.
const REDACT_KEYS = /(message|content|query|prompt|biography|vitals|name|title|apikey|api_key|key|token|steps|response)/i;

function scrub(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.test(k) ? '[redacted]' : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Strips the query string: a research query can end up in a URL we log. */
function scrubUrl(url) {
  if (typeof url !== 'string') return url;
  const cut = url.indexOf('?');
  return cut === -1 ? url : `${url.slice(0, cut)}?[redacted]`;
}

export function initMonitoring() {
  if (loaded || !isMonitoringConfigured) return;
  loaded = true;

  const script = document.createElement('script');
  script.src = 'https://browser.sentry-cdn.com/8.42.0/bundle.min.js';
  script.crossOrigin = 'anonymous';
  script.onload = () => {
    if (!window.Sentry) return;
    window.Sentry.init({
      dsn: SENTRY_DSN,
      // Errors only. Performance tracing would sample URLs and payloads.
      tracesSampleRate: 0,
      // The user's own IP and identity add nothing to a stack trace.
      sendDefaultPii: false,
      beforeBreadcrumb(crumb) {
        // Breadcrumbs record fetch/XHR bodies and console output — both routinely
        // carry research text. Keep the shape, drop the contents.
        if (crumb.category === 'console') return null;
        if (crumb.data?.url) crumb.data.url = scrubUrl(crumb.data.url);
        if (crumb.message) crumb.message = '[redacted]';
        return crumb;
      },
      beforeSend(event) {
        if (event.request) {
          event.request.url = scrubUrl(event.request.url);
          delete event.request.data;
          delete event.request.cookies;
          delete event.request.headers;
        }
        if (event.extra) event.extra = scrub(event.extra);
        if (event.contexts) event.contexts = scrub(event.contexts);
        delete event.user;
        return event;
      },
    });
  };
  document.head.appendChild(script);
}
