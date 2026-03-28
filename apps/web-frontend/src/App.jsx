import React, { useState } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import FeatureGrid from './components/FeatureGrid';
import ApiKeyModal from './components/ApiKeyModal';
import ChatInterface from './components/ChatInterface';
import './index.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (query) => {
    setLoading(true);
    const userMsg = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);

    const apiKey = localStorage.getItem('google_api_key');
    if (!apiKey) {
      alert("Please configure your Google AI Studio API Key first.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:8080/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-API-Key': apiKey,
        },
        body: JSON.stringify({
          message: query,
          history: messages,
          model: 'gemini-2.0-flash-exp'
        }),
      });

      if (!response.ok) throw new Error(`Backend error: ${response.statusText}`);
      
      const data = await response.json();
      setMessages(prev => [...prev, { role: 'model', content: data.response }]);
    } catch (error) {
      console.error("Search failed:", error);
      alert(`Failed to orchestrate research. Check if backend is running: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero onSearch={handleSearch} />
        <ChatInterface messages={messages} isLoading={loading} />
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
