import React, { useState } from 'react';
import { API_KEY_STORAGE } from '../config';

const ApiKeyModal = ({ notify, onClose, onSave }) => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY_STORAGE) || '');

  const handleSave = () => {
    localStorage.setItem(API_KEY_STORAGE, apiKey);
    if (notify) notify('API Key updated successfully.', 'success');
    if (onSave) onSave();
  };

  return (
    <div className="fixed-inset flex items-center justify-center" style={{ zIndex: 3000, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', position: 'fixed', inset: 0 }}>
      <div className="card" style={{ maxWidth: '420px', width: '90%', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        
        <div className="text-center mb-6">
          <div className="text-accent text-xs mb-2">CONFIGURATION</div>
          <h2 className="mb-2" style={{ fontSize: '24px' }}>API Configuration</h2>
          <p className="text-secondary text-sm">
            Securely link your Google AI Studio account. Your key is stored locally in your browser and never sent to our servers.
          </p>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs text-secondary">Google AI Studio API Key</label>
            <input 
              type="password" 
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your key here"
              className="input-field"
            />
          </div>
          <button onClick={() => { handleSave(); onClose(); }} className="btn btn-primary w-full">
            Save Key
          </button>
        </div>
        
        <div className="mt-6 pt-6 divider text-center">
          <p className="text-xs text-secondary" style={{ lineHeight: 1.6 }}>
            Need a key? <a href="https://aistudio.google.com/app/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent underline">Get one for free at Google AI Studio.</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApiKeyModal;
