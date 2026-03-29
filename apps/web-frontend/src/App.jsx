import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import FeatureGrid from './components/FeatureGrid';
import Sidebar from './components/Sidebar';
import ApiKeyModal from './components/ApiKeyModal';
import ChatInterface from './components/ChatInterface';
import ChatInput from './components/ChatInput';
import Notification from './components/Notification';
import './index.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [pendingQuery, setPendingQuery] = useState(null);
  const [status, setStatus] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Fake sessions for now to demonstrate UI
  const [sessions, setSessions] = useState([
    { id: '1', title: 'Johannes Lammertsma (Bolsward)' },
    { id: '2', title: 'Hendrik Lammerts & Maaike' }
  ]);

  const notify = (msg, type = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, msg, type }]);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleSearch = async (query) => {
    // If not logged in, log them in first
    if (!isLoggedIn) {
      setIsLoggedIn(true);
      // Wait for state to reflect or just continue if search handles it
    }

    setLoading(true);
    setStatus("Orchestrating tools...");
    const userMsg = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);

    const apiKey = localStorage.getItem('google_api_key');
    if (!apiKey) {
      setPendingQuery(query);
      setConfigOpen(true);
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
          model: 'gemini-flash-latest'
        }),
      });

      if (!response.ok) throw new Error(`Backend error: ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          
          try {
            const jsonStr = trimmed.slice(6);
            const data = JSON.parse(jsonStr);
            if (data.status) setStatus(data.status);
            if (data.response) {
              setMessages(prev => [...prev, { role: 'model', content: data.response }]);
              setStatus(null);
            }
            if (data.error) throw new Error(data.error);
          } catch (e) {
            console.error("Failed to parse SSE line:", trimmed, e);
          }
        }
      }
    } catch (error) {
      console.error("Search failed:", error);
      notify(`Failed to orchestrate research. ${error.message}`, "error");
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  const LandingView = () => (
    <div className="min-h-screen flex flex-col bg-surface overflow-y-auto">
      <Header isLoggedIn={isLoggedIn} onSignIn={() => setIsLoggedIn(true)} />
      <main className="flex-1">
        <Hero onSearch={handleSearch} onConfig={() => setConfigOpen(true)} />
        <FeatureGrid />
      </main>
      <footer className="py-16 bg-surface border-t border-border">
        <div className="container flex flex-col items-center gap-6">
          <span className="text-xl font-extrabold tracking-tight text-accent">Lineage Nexus</span>
          <p className="text-xs opacity-40">© 2026 Lineage Nexus. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );

  const AppView = () => (
    <div className="flex h-screen bg-surface">
      <Sidebar 
        sessions={sessions} 
        activeSessionId={activeSessionId}
        onNewChat={() => setMessages([])} 
        onSelectSession={setActiveSessionId}
      />
      
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <Header isLoggedIn={isLoggedIn} onSignIn={() => setIsLoggedIn(false)} />
        
        <div className="toast-container overflow-visible z-50">
          {notifications.map(n => (
            <Notification
              key={n.id}
              id={n.id}
              message={n.msg}
              type={n.type}
              onClose={removeNotification}
            />
          ))}
        </div>

        <main className="flex-1 overflow-y-auto flex flex-col">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-center space-y-6" style={{ maxWidth: '600px' }}>
                <div className="inline-block p-4 bg-accent-soft rounded-3xl mb-4 border border-accent/20">
                  <span className="text-4xl text-accent font-serif tracking-tighter italic">L/N</span>
                </div>
                <h1 className="text-4xl font-serif tracking-tight text-primary leading-tight">
                  Good afternoon, Paul.<br/>
                  <span className="opacity-40 italic">Where should we start your research?</span>
                </h1>
              </div>
            </div>
          ) : (
            <ChatInterface messages={messages} isLoading={loading} status={status} />
          )}
          <div className="h-32 shrink-0"></div>
        </main>

        <ChatInput onSearch={handleSearch} isLoading={loading} status={status} />
      </div>
    </div>
  );

  return (
    <>
      {isLoggedIn ? <AppView /> : <LandingView />}

      {configOpen && (
        <ApiKeyModal
          notify={notify}
          onClose={() => setConfigOpen(false)}
          onSave={() => {
            if (pendingQuery) handleSearch(pendingQuery);
            setPendingQuery(null);
          }}
        />
      )}
    </>
  );
}

export default App;
