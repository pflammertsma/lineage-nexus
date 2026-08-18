import { GA_MEASUREMENT_ID, isAnalyticsConfigured, ANALYTICS_CONSENT_STORAGE } from './config';

/**
 * Google Analytics, loaded only after the visitor agrees.
 *
 * Nothing here runs until `loadAnalytics()` is called, and nothing calls it
 * until consent is granted — the gtag script is not even fetched before then,
 * which is what makes the claim in /privacy true rather than aspirational.
 *
 * What is sent: the route path (/, /chat, /privacy, /terms) and the page title.
 * What is never sent: the query, biographies, names, archive results, or any
 * other research content. Those never leave the app except to the research API.
 */
let loaded = false;

export function readAnalyticsConsent() {
  try {
    return localStorage.getItem(ANALYTICS_CONSENT_STORAGE);
  } catch {
    return null;
  }
}

export function writeAnalyticsConsent(value) {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_STORAGE, value);
  } catch {
    /* preference is best-effort; analytics stay off if we cannot record it */
  }
}

/**
 * Do Not Track and Global Privacy Control are an explicit request not to be
 * measured. Honour them as a standing "no" rather than asking again — a banner
 * that ignores a signal the browser already sent is just noise.
 */
export function browserOptsOut() {
  return (
    navigator.doNotTrack === '1' ||
    window.doNotTrack === '1' ||
    navigator.msDoNotTrack === '1' ||
    navigator.globalPrivacyControl === true
  );
}

/** Analytics can only ever run if configured at build time and not opted out. */
export function analyticsAvailable() {
  return isAnalyticsConfigured && !browserOptsOut();
}

export function loadAnalytics() {
  if (loaded || !analyticsAvailable()) return;
  loaded = true;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true,
    // Advertising features off, so the "no advertising" line in /privacy holds.
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // Page views are sent manually: this is a single-page app, so the automatic
    // one would only ever fire for the first route the visitor landed on.
    send_page_view: false,
  });
  // Deliberately does not send the first page view. App.jsx reports route
  // changes, and that effect also fires on mount — sending one here too
  // double-counted every visitor's landing page.
}

export function trackPageView(path) {
  if (!loaded || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.origin + path,
    page_title: document.title,
  });
}
