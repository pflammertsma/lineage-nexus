import React, { useState } from 'react';
import { Settings } from 'lucide-react';

const Hero = ({ onSearch, onConfig }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
    }
  };

  return (
    <section className="py-24">
      <div className="container text-center">
        <h1 className="mb-6">Uncover your <span className="accent-text">heritage.</span></h1>
        <p className="hero-sub mb-12">
          Harness advanced AI orchestration to explore archives and automate professional genealogical record-keeping.
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
