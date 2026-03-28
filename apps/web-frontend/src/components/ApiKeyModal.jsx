import React, { useState, useEffect } from 'react';

const ApiKeyModal = () => {
  const [apiKey, setApiKey] = useState('');
  
  useEffect(() => {
    const savedKey = localStorage.getItem('google_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  const handleSave = () => {
    localStorage.setItem('google_api_key', apiKey);
    alert('API Key updated successfully.');
  };

  return (
    <section id="about" className="py-24">
      <div className="container flex justify-center">
        <div className="card" style={{ maxWidth: '560px', width: '100%' }}>
          <div className="text-center mb-8">
            <div className="text-accent text-xs mb-2">SECURITY & PRIVACY</div>
            <h2 className="mb-4">Bring your own key</h2>
            <p className="text-secondary">
              Power your research with your own Google AI Studio key. 
              We never store your keys—everything stays in your browser.
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
            <button onClick={handleSave} className="btn btn-primary w-full">
              Save Configuration
            </button>
          </div>
          
          <div className="mt-8 pt-6 section-divider text-center">
            <p className="text-xs text-secondary">
              Don't have a key? <a href="https://ai.google.dev" className="text-accent underline">Get one for free at Google AI Studio</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ApiKeyModal;
