import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { API_KEY_STORAGE } from '../config';

const SettingsModal = ({
  notify,
  onClose,
  onSave,
  canSync = false,
  isSignedIn = false,
  syncEnabled = false,
  onToggleSync,
  syncState = 'idle',
  sessionCount = 0,
  onDeleteAllData,
}) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = () => {
    localStorage.setItem(API_KEY_STORAGE, apiKey);
    if (notify) notify('API key updated.', 'success');
    if (onSave) onSave();
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      await onDeleteAllData('all');
      if (notify) notify('All research data deleted.', 'success');
      setConfirmingDelete(false);
      onClose();
    } catch (e) {
      if (notify) notify(e.message || 'Could not delete your data.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const syncLabel = {
    idle: 'Not syncing',
    syncing: 'Syncing…',
    synced: 'Synced',
    error: 'Sync error — changes are still saved on this device',
  }[syncState];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[3000] p-4 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
    >
      <div className="card relative w-full my-8" style={{ maxWidth: '460px' }}>
        <button
          onClick={onClose}
          aria-label="Close settings"
          className="absolute top-4 right-4 text-secondary hover:text-primary transition-colors cursor-pointer"
        >
          <X size={20} />
        </button>

        <div className="mb-6">
          <div className="text-accent text-xs mb-2 font-bold tracking-widest uppercase">Settings</div>
          <h2 style={{ fontSize: '22px' }}>API configuration</h2>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="gemini-key" className="text-xs text-secondary">
              Google AI Studio API key
            </label>
            <input
              id="gemini-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your key here"
              className="input-field"
            />
            <p className="text-xs text-secondary">
              Stored in this browser only, and sent directly to Gemini with each request. Never synced.
            </p>
          </div>
          <button onClick={() => { handleSave(); onClose(); }} className="btn btn-primary w-full">
            Save key
          </button>
          <p className="text-xs text-secondary text-center">
            Need a key?{' '}
            <a
              href="https://aistudio.google.com/app/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              Get one free at Google AI Studio.
            </a>
          </p>
        </div>

        <div className="mt-8 pt-6 divider">
          <h3 className="mb-4">Your data</h3>

          {canSync && isSignedIn && (
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="text-sm text-primary">Cross-device sync</p>
                <p className="text-xs text-secondary mt-1">
                  {syncEnabled
                    ? syncLabel
                    : 'Research stays on this device only.'}
                </p>
              </div>
              <button
                onClick={() => onToggleSync(!syncEnabled)}
                role="switch"
                aria-checked={syncEnabled}
                aria-label="Cross-device sync"
                className={`relative w-11 h-6 rounded-full shrink-0 transition-colors cursor-pointer ${
                  syncEnabled ? 'bg-accent' : 'bg-border-strong'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-surface transition-all ${
                    syncEnabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          )}

          {!canSync && (
            <p className="text-xs text-secondary mb-5">
              Cross-device sync is unavailable — this deployment has no Firebase project configured.
              Research is stored in this browser only.
            </p>
          )}

          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="btn w-full border border-red-500/40 bg-transparent text-red-500 hover:bg-red-500/5"
            >
              Delete all research data
            </button>
          ) : (
            <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4">
              <div className="flex gap-3 mb-4">
                <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-primary leading-relaxed">
                  This permanently deletes{' '}
                  <span className="font-semibold">
                    {sessionCount} research {sessionCount === 1 ? 'session' : 'sessions'}
                  </span>{' '}
                  from this device
                  {canSync && isSignedIn && syncEnabled ? ' and from your account' : ''}. This cannot be undone.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="btn flex-1 border border-border-strong bg-surface text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAll}
                  disabled={deleting}
                  className="btn flex-1 bg-red-600 text-white hover:bg-red-700"
                >
                  {deleting ? 'Deleting…' : 'Delete everything'}
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-secondary mt-4" style={{ lineHeight: 1.6 }}>
            Individual conversations can be deleted from the history list at any time.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
