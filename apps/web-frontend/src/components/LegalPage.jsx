import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Shell for the policy pages. Plain prose, one measure, no chrome — these exist
 * to be read and to be linkable from the Google OAuth consent screen, not to
 * look like the app.
 */
export const LegalPage = ({ title, updated, sibling, children }) => (
  <main className="overflow-y-auto">
    <div className="reading-column py-12 sm:py-16">
      {/* Full-strength secondary throughout, not the muted variants used as app
          chrome: at 10px the dimmed tokens measured 3.4–4.3:1, under the 4.5:1
          AA floor, and a policy page is the last place to make text hard to read. */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-accent transition-colors mb-8"
      >
        <ArrowLeft size={12} />
        Back to Lineage Nexus
      </Link>

      <h1 className="font-serif text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight mb-2">
        {title}
      </h1>
      <p className="text-xs text-secondary mb-10">Last updated {updated}</p>

      <div className="agent-prose space-y-6 [&_h2]:font-serif [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_a]:text-accent [&_a]:underline [&_strong]:font-semibold">
        {children}
      </div>

      <nav className="mt-14 pt-6 border-t border-border flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-secondary">
        {sibling === 'terms' ? (
          <Link to="/terms" className="hover:text-accent transition-colors">Terms of Use</Link>
        ) : (
          <Link to="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
        )}
        <Link to="/" className="hover:text-accent transition-colors">Back to the app</Link>
      </nav>
    </div>
  </main>
);

const UPDATED = '18 August 2026';

export const PrivacyPage = () => (
  <LegalPage title="Privacy" updated={UPDATED} sibling="terms">
    <p>
      Lineage Nexus is a genealogical research assistant. This page describes exactly what it
      stores, where, and how to remove it. It is deliberately short, because the app collects
      very little.
    </p>

    <h2>Your Gemini API key</h2>
    <p>
      The app runs on your own Google Gemini API key. The key is stored in your browser's
      local storage on the device where you entered it.
    </p>
    <p>
      To be precise about what happens to it: the research itself runs on our server, not in
      your browser, so <strong>your key is sent to our server with each request</strong>. It
      is held in memory only for the duration of that request, used to call Gemini on your
      behalf, and then discarded. <strong>It is never written to disk, never recorded in our
      logs, and never synchronised between your devices</strong> — if you use Lineage Nexus on
      a second device, you will enter the key again there. We cannot see your Google Cloud
      usage or billing.
    </p>
    <p>
      You can remove the key at any time from Settings, or by clearing site data in your
      browser. If you would rather it never left your machine at all, revoke the key in Google
      AI Studio when you are done — keys are free to create and replace.
    </p>

    <h2>Your research</h2>
    <p>
      Conversations are stored in your browser. Nothing leaves your device unless you sign in
      and explicitly opt in to cross-device sync — sync is off until you accept, and declining
      keeps the app fully functional on that device.
    </p>
    <p>
      With sync enabled, your conversations are mirrored to Google Cloud Firestore under your
      account, readable only by you. Security rules deny every cross-account read and write.
    </p>

    <h2>Your account</h2>
    <p>
      Signing in uses Google via Firebase Authentication. We receive your name, email address,
      profile picture and a user identifier. We use these to attach your research to your
      account and to show who is signed in. We do not use them for anything else, and we do
      not send you email.
    </p>

    <h2>Deleting your data</h2>
    <ul>
      <li>Delete a single conversation from the history list — it is removed from this device and from the cloud.</li>
      <li>Delete everything from Settings — this empties your cloud copy and, if you choose, this device's copy too.</li>
      <li>Signing out and clearing site data removes the local copy, including your API key.</li>
    </ul>
    <p>
      Deletions are immediate rather than queued. If you want your account removed entirely,
      delete everything first, then contact us.
    </p>

    <h2>Third parties</h2>
    <p>
      Research queries are sent to services that hold the records being searched:{' '}
      <a href="https://www.openarchieven.nl/" target="_blank" rel="noreferrer noopener">Open Archieven</a>,{' '}
      <a href="https://www.wikitree.com/" target="_blank" rel="noreferrer noopener">WikiTree</a>, and Google's Gemini API.
      Each has its own privacy policy. We send them the search terms needed to answer your
      question; we do not send them your identity.
    </p>

    <h2>Logs and analytics</h2>
    <p>
      <strong>We do not log your research.</strong> Our server does not record your queries,
      the names you search for, or the records returned — not in application logs, not
      anywhere. Errors are recorded as a type only, with no request content attached. Our
      hosting provider keeps standard request metadata (timestamp, IP address, response
      status) for its own operational logs, as any web host does; that metadata does not
      include what you searched for.
    </p>
    <p>
      For product analytics we use <strong>Google Analytics</strong>, and nothing else.
      It is <strong>off until you agree</strong>: the script is not fetched at all unless
      you accept the banner shown on your first visit, and declining leaves nothing
      loaded. If your browser sends a Do Not Track or Global Privacy Control signal we
      treat that as a decline and never ask.
    </p>
    <p>
      When it is on, it receives the page you are on (<code>/chat</code>,
      <code>/privacy</code>) and the page title — never your research. Queries, names,
      biographies and archive results are not sent to it, in any field. Advertising
      features and ad personalisation are disabled, and IP addresses are anonymised.
    </p>

    <h2>What we do not do</h2>
    <ul>
      <li>No advertising on this site, and no third-party trackers.</li>
      <li>No selling or sharing of personal data.</li>
      <li>No use of your research to train models — by us.</li>
    </ul>
    <p>
      That last point deserves a caveat we cannot control on your behalf: your queries are
      processed by Google's Gemini API under <em>your own</em> API key, so Google's terms for
      that key apply, not ours. Google treats paid and free API tiers differently, and on the
      free tier it may use submitted content to improve its services. If that matters to you,
      check the current terms for your key's tier before researching living relatives.
    </p>

    <h2>A note on the people in your research</h2>
    <p>
      Genealogical records concern real people, some of whom may still be living. You are
      responsible for handling information about living people lawfully and considerately,
      particularly before publishing anything to a public tree such as WikiTree.
    </p>
  </LegalPage>
);

export const TermsPage = () => (
  <LegalPage title="Terms of Use" updated={UPDATED} sibling="privacy">
    <h2>What this is</h2>
    <p>
      Lineage Nexus is a research aid, provided free and as-is. It uses a language model to
      search archives and draft biographies. It has no warranty of any kind.
    </p>

    <h2>Verify before you publish</h2>
    <p>
      <strong>Model output can be wrong.</strong> Dates, places, relationships and
      identifications may be misread, conflated between similarly named people, or invented
      outright. Every generated biography must be checked against the cited primary sources
      before it is added to WikiTree or any other tree. Treat this tool as a fast first
      draft and a search assistant, never as an authority.
    </p>

    <h2>Your API key and costs</h2>
    <p>
      You supply your own Gemini API key, and any usage charges or quota limits on that key
      are yours. We do not bill you and we cannot see your Google Cloud spend.
    </p>

    <h2>Fair use of the archives</h2>
    <p>
      The archival services this tool queries are run by others, most of them non-commercial.
      Requests are rate-limited deliberately. Do not attempt to circumvent that pacing, script
      the app for bulk extraction, or use it in any way that burdens those services.
    </p>

    <h2>Source attribution</h2>
    <p>
      Records retrieved through the app remain subject to the terms of the archive they came
      from. Generated biographies include citations for this reason: keep them intact when you
      publish, so the record can be traced back to its source.
    </p>

    <h2>Availability</h2>
    <p>
      The service may change or stop at any time. Because your research is stored in your own
      browser, and in your own cloud account when sync is on, you are not dependent on us to
      keep a copy.
    </p>

    <h2>Liability</h2>
    <p>
      To the extent permitted by law, we are not liable for any loss arising from use of this
      tool, including reliance on inaccurate research output.
    </p>
  </LegalPage>
);

export default LegalPage;
