import React from 'react';
import { Cloud, MonitorSmartphone, Trash2, X } from 'lucide-react';

/**
 * Shown once per account, the first time a user signs in. Sync stays off unless
 * they actively choose it here — declining is a plain, equally-weighted option,
 * not a dismissal.
 */
const SyncConsentModal = ({ sessionCount = 0, accountEmail, onAccept, onDecline }) => {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[3000] p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div className="card relative w-full" style={{ maxWidth: '460px' }}>
        <button
          onClick={onDecline}
          aria-label="Close"
          className="absolute top-4 right-4 text-secondary hover:text-primary transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-accent-soft flex items-center justify-center mx-auto mb-4">
            <MonitorSmartphone size={22} className="text-accent" />
          </div>
          <h2 className="mb-2" style={{ fontSize: '22px' }}>Sync your research?</h2>
          <p className="text-secondary text-sm">
            Keep your research sessions available on every device you sign in to
            {accountEmail ? <> as <span className="text-primary">{accountEmail}</span></> : null}.
          </p>
        </div>

        <div className="flex flex-col gap-3 mb-6 text-sm">
          <div className="flex gap-3">
            <Cloud size={16} className="text-accent shrink-0 mt-0.5" />
            <p className="text-secondary">
              {sessionCount > 0 ? (
                <>
                  Your <span className="text-primary font-semibold">
                    {sessionCount} existing {sessionCount === 1 ? 'session' : 'sessions'}
                  </span> on this device will be uploaded, along with everything you research from now on.
                </>
              ) : (
                <>Research sessions will be stored in your account as you create them.</>
              )}
            </p>
          </div>
          <div className="flex gap-3">
            <Trash2 size={16} className="text-accent shrink-0 mt-0.5" />
            <p className="text-secondary">
              You can delete individual conversations, or erase everything, at any time from Settings.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={onAccept} className="btn btn-accent w-full">
            Turn on sync
          </button>
          <button
            onClick={onDecline}
            className="btn w-full border border-border-strong bg-surface text-primary"
          >
            Keep research on this device only
          </button>
        </div>

        <p className="mt-4 text-xs text-secondary text-center" style={{ lineHeight: 1.6 }}>
          Your Gemini API key is never synced — it stays in this browser.
        </p>
      </div>
    </div>
  );
};

export default SyncConsentModal;
