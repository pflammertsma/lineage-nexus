import React, { useState } from 'react';
import { Settings, KeyRound, ExternalLink } from 'lucide-react';
import { API_KEY_STORAGE, FALLBACK_API_KEY_STORAGE } from '../config';

const Hero = ({ onSearch, onConfig }) => {
  const [query, setQuery] = useState('');
  // Read once on mount: the first search silently bounces into the settings
  // modal without a key, which is a confusing way to learn the app is BYOK.
  const [hasKey] = useState(() =>
    Boolean(localStorage.getItem(API_KEY_STORAGE) || localStorage.getItem(FALLBACK_API_KEY_STORAGE))
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <section className="py-24">
      <div className="container text-center">
        <h1 className="sr-only">Lineage Nexus</h1>
        <p
          aria-hidden="true"
          className="font-serif text-[40px] sm:text-[64px] font-semibold tracking-tight leading-[1.1] mb-6"
        >
          Uncover your <span className="accent-text">heritage.</span>
        </p>
        <p className="hero-sub mb-6">
          <strong className="font-semibold text-primary">Lineage Nexus</strong> is an AI research
          assistant for Dutch genealogy. It searches public historical archives — Open Archieven
          and WikiTree — for birth, marriage and death records, then drafts fully sourced
          biographies you can publish to a family tree.
        </p>
        <p className="hero-sub mb-12 text-sm">
          Signing in with Google is optional, and is used only to sync your research between your
          own devices. We never contact you or share your account with anyone.
        </p>

        <form onSubmit={handleSubmit} className="mb-12 max-w-[640px] mx-auto text-center">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Explore ancestor (e.g., Aaltje Zwiers 1847)"
              className="input-field flex-1"
            />
            <button type="submit" className="btn btn-accent px-8">
              Start
            </button>
            <button
              type="button"
              onClick={onConfig}
              className="btn border border-border-strong bg-surface px-4"
              title="API Configuration"
            >
              <Settings size={20} className="text-secondary" />
            </button>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-8 opacity-60">
            <span className="text-xs">OpenArchieven</span>
            <span className="text-xs">WikiTree</span>
            <span className="text-xs">National Archives</span>
          </div>
        </form>

        {/* Says up front that the app is bring-your-own-key. Without this the
            first search just opens a settings dialog the visitor did not ask
            for, which reads as an error rather than a setup step. */}
        {!hasKey && (
          <div className="max-w-[640px] mx-auto mb-12 flex items-start gap-3 text-left bg-card border border-border rounded-lg px-5 py-4">
            <KeyRound size={16} className="text-accent shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-secondary">
              <strong className="text-primary font-semibold">You bring your own Gemini API key.</strong>{' '}
              Lineage Nexus runs on your key, so your research is billed to your own Google
              account and never metered by us. Get a free key from{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent font-semibold hover:underline inline-flex items-center gap-1"
              >
                Google AI Studio
                <ExternalLink size={11} />
              </a>
              , then{' '}
              <button
                type="button"
                onClick={onConfig}
                className="text-accent font-semibold hover:underline cursor-pointer"
              >
                add it here
              </button>
              . It is stored only in this browser.
            </p>
          </div>
        )}

        <div className="flex justify-center">
          <div className="bg-accent-soft text-accent px-4 py-2 rounded-full text-[12px] font-extrabold">
            NEW: AI-POWERED BIOGRAPHIES
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
{/* (rest of components) */ }
