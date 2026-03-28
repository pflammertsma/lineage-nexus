import React, { useState } from 'react';

const Hero = ({ onSearch }) => {
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
        <h1 className="mb-6">Uncover your <span className="accent">heritage.</span></h1>
        <p className="hero-sub mb-12">
          Harness advanced AI orchestration to explore Dutch archives and automate professional genealogical record-keeping.
        </p>

        <form onSubmit={handleSubmit} className="mb-12" style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ancestor (e.g., Aaltje Zwiers 1847)"
              className="input-field flex-1"
            />
            <button type="submit" className="btn btn-accent px-8">
              Start
            </button>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-8 opacity-60">
            <span className="text-xs">OpenArchieven</span>
            <span className="text-xs">WikiTree</span>
            <span className="text-xs">National Archives</span>
          </div>
        </form>

        <div className="flex justify-center">
          <div style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-primary)', padding: '8px 16px', borderRadius: '32px', fontSize: '12px', fontWeight: '800' }}>
            NEW: AI-POWERED BIOGRAPHIES
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
{/* (rest of components) */ }
