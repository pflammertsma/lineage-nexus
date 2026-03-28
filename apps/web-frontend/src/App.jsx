import React from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import FeatureGrid from './components/FeatureGrid';
import ApiKeyModal from './components/ApiKeyModal';
import './index.css';

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
        <ApiKeyModal />
      </main>
      <footer className="py-16 bg-surface section-divider">
        <div className="container">
          <div className="flex flex-col items-center gap-8">
            <div className="flex items-center gap-2 opacity-80">
              <img src="/src/assets/logo.svg" alt="" style={{ width: '24px', height: '24px' }} />
              <span className="font-bold text-sm tracking-tight">Lineage Nexus</span>
            </div>
            <div className="flex flex-wrap justify-center gap-8">
              <a href="https://google.github.io/adk-docs/" className="text-xs text-secondary hover:text-primary">Documentation</a>
              <a href="#" className="text-xs text-secondary hover:text-primary">Community</a>
              <a href="#" className="text-xs text-secondary hover:text-primary">Legal</a>
              <a href="#" className="text-xs text-secondary hover:text-primary">GitHub</a>
            </div>
            <p className="text-xs text-secondary opacity-60">
              &copy; 2026 Lineage Nexus. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
