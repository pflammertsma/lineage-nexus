import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
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
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('lineage_is_logged_in') === 'true';
  });
  const [activeSessionId, setActiveSessionId] = useState(() => {
    return localStorage.getItem('lineage_active_session_id');
  });
  
  // Real sessions from localStorage
  const [sessions, setSessions] = useState(() => {
    const saved = localStorage.getItem('lineage_sessions');
    return saved ? JSON.parse(saved) : [];
  });

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('lineage_sessions', JSON.stringify(sessions));
    localStorage.setItem('lineage_is_logged_in', isLoggedIn);
    localStorage.setItem('lineage_active_session_id', activeSessionId || '');
  }, [sessions, isLoggedIn, activeSessionId]);

  // Load messages for the active session
  useEffect(() => {
    if (activeSessionId) {
      const active = sessions.find(s => s.id === activeSessionId);
      if (active) setMessages(active.messages || []);
    } else {
      setMessages([]);
    }
  }, [activeSessionId]);

  // Auto-run search from landing page
  useEffect(() => {
    if (isLoggedIn && pendingQuery && messages.length === 0) {
      handleSearch(pendingQuery);
      setPendingQuery(null);
    }
  }, [isLoggedIn, pendingQuery, messages.length]);

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
    }

    let sessionId = activeSessionId;
    const isRetry = messages.length > 0 && messages[messages.length - 1].content === query && messages[messages.length - 1].role === 'user';
    let newMessages = isRetry ? messages : [...messages, { role: 'user', content: query }];
    
    // Create new session if none is active
    if (!sessionId && !isRetry) {
      sessionId = Math.random().toString(36).substr(2, 9);
      const newSession = {
        id: sessionId,
        title: query.length > 30 ? query.substring(0, 30) + '...' : query,
        messages: newMessages
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(sessionId);
    }

    if (!isRetry) setMessages(newMessages);
    setLoading(true);
    setStatus("Analyzing ancestry...");

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

  const handleSignIn = () => {
    if (isLoggedIn) {
      setIsLoggedIn(false);
      navigate('/');
    } else {
      setIsLoggedIn(true);
      navigate('/chat');
    }
  };

  return (
    <div className="min-h-screen bg-background text-primary">
      <Header 
        isLoggedIn={isLoggedIn} 
        onSignIn={handleSignIn}
      />
      
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

      <Routes>
        <Route path="/" element={
          isLoggedIn ? <Navigate to="/chat" replace /> : (
            <main className="overflow-y-auto">
              <Hero onSearch={(q) => {
                setPendingQuery(q);
                setIsLoggedIn(true);
                navigate('/chat');
              }} onConfig={() => setConfigOpen(true)} />
              <FeatureGrid />
              <footer className="py-16 bg-card border-t border-border">
                <div className="container flex flex-col items-center gap-6">
                  <span className="text-xl font-extrabold tracking-tight text-accent">Lineage Nexus</span>
                  <p className="text-xs opacity-40">© 2026 Lineage Nexus. All rights reserved.</p>
                </div>
              </footer>
            </main>
          )
        } />
        
        <Route path="/chat" element={
          !isLoggedIn ? <Navigate to="/" replace /> : (
            <div className="flex h-[calc(100vh-70px)] overflow-hidden">
              <Sidebar 
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={(id) => setActiveSessionId(id)}
                onNewChat={() => {
                  setActiveSessionId(null);
                  setMessages([]);
                }}
              />
              <main className="flex-1 overflow-hidden relative bg-surface">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in">
                    <div className="w-20 h-20 bg-accent-soft rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-accent/10 border border-accent/20 transition-transform hover:scale-110 duration-500">
                      <span className="text-3xl font-serif text-accent italic">L/N</span>
                    </div>
                    <h2 className="text-4xl font-serif mb-4 tracking-tight">
                      Good afternoon, Paul.
                    </h2>
                    <p className="text-xl font-serif text-secondary/60 italic max-w-[500px]">
                      Where should we start your research?
                    </p>
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto">
                    <ChatInterface 
                      messages={messages} 
                      isLoading={loading} 
                      status={status}
                    />
                    <div className="h-40 shrink-0"></div>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-8 pt-0 pointer-events-none">
                  <div className="max-w-[800px] mx-auto pointer-events-auto">
                    <ChatInput 
                      onSearch={handleSearch} 
                      isLoading={loading}
                      status={status}
                    />
                  </div>
                </div>
              </main>
            </div>
          )
        } />
      </Routes>

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
    </div>
  );
}

export default App;
