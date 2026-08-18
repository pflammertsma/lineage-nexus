import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

/**
 * Asked once, before any analytics script is fetched.
 *
 * Declining is as easy as accepting — same size, same prominence, no dark
 * pattern — because a consent dialog that nudges is not consent. The app is
 * fully usable either way; nothing here gates functionality.
 */
const ConsentBanner = ({ onAccept, onDecline }) => (
  <div
    role="dialog"
    aria-live="polite"
    aria-label="Analytics consent"
    className="fixed inset-x-0 bottom-0 z-[3000] p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] animate-in"
  >
    <div className="reading-column">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <BarChart3 size={18} className="text-accent shrink-0 hidden sm:block" />

        <p className="flex-1 text-xs leading-relaxed text-secondary">
          <strong className="text-primary font-semibold">May we count page views?</strong>{' '}
          We use Google Analytics to see which features get used. It never receives your
          research — no queries, names, or biographies. Decline and nothing loads.{' '}
          <Link to="/privacy" className="text-accent hover:underline font-semibold">
            Privacy
          </Link>
        </p>

        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg border border-border-strong text-xs font-semibold text-secondary hover:text-primary hover:border-accent transition-colors cursor-pointer"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-lg bg-accent text-on-accent text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default ConsentBanner;
