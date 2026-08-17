import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * Shell for the policy pages. Plain prose, one measure, no chrome — these exist
 * to be read and to be linkable from the Google OAuth consent screen, not to
 * look like the app.
 */
export const LegalPage = ({ title, updated, children }) => (
  <main className="overflow-y-auto">
    <div className="reading-column py-12 sm:py-16">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-secondary/70 hover:text-accent transition-colors mb-8"
      >
        <ArrowLeft size={12} />
        Back to Lineage Nexus
      </Link>

      <h1 className="font-serif text-[32px] sm:text-[40px] font-semibold tracking-tight leading-tight mb-2">
        {title}
      </h1>
      <p className="text-xs text-secondary/60 mb-10">Last updated {updated}</p>

      <div className="agent-prose space-y-6 [&_h2]:font-serif [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_a]:text-accent [&_a]:underline [&_strong]:font-semibold">
        {children}
      </div>
    </div>
  </main>
);

const UPDATED = '18 August 2026';

export const PrivacyPage = () => (
  <LegalPage title="Privacy" updated={UPDATED}>
    <p>
      Lineage Nexus is a genealogical research assistant. This page describes exactly what it
      stores, where, and how to remove it. It is deliberately short, because the app collects
      very little.
    </p>

    <h2>Your Gemini API key</h2>
    <p>
      The app runs on your own Google Gemini API key. The key is stored in your browser's
      local storage on the device where you entered it. It is sent to our backend with each
      research request, used to call the Gemini API on your behalf for that one request, and
      then discarded. <strong>It is never written to disk, never logged, and never
      synchronised between your devices</strong> — if you use Lineage Nexus on a second
      device, you will enter the key again there.
    </p>
    <p>
      You can remove the key at any time from Settings, or by clearing site data in your
      browser.
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

    <h2>What we do not do</h2>
    <ul>
      <li>No analytics, advertising, or third-party trackers.</li>
      <li>No selling or sharing of personal data.</li>
      <li>No use of your research to train models.</li>
    </ul>

    <h2>A note on the people in your research</h2>
    <p>
      Genealogical records concern real people, some of whom may still be living. You are
      responsible for handling information about living people lawfully and considerately,
      particularly before publishing anything to a public tree such as WikiTree.
    </p>
  </LegalPage>
);

export const TermsPage = () => (
  <LegalPage title="Terms of Use" updated={UPDATED}>
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
