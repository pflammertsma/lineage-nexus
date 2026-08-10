import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import FeatureGrid from './components/FeatureGrid';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import SyncConsentModal from './components/SyncConsentModal';
import ChatInterface from './components/ChatInterface';
import ChatInput from './components/ChatInput';
import Notification from './components/Notification';
import { API_BASE_URL, API_KEY_STORAGE } from './config';
import useTheme from './useTheme';
import useAuth from './useAuth';
import useSyncedSessions, { readSyncConsent, writeSyncConsent } from './useSyncedSessions';
import './index.css';

function App() {
  const navigate = useNavigate();
  const { preference: themePreference, cycleTheme } = useTheme();
  const auth = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [configOpen, setConfigOpen] = useState(false);
  const [pendingQuery, setPendingQuery] = useState(null);
  const [status, setStatus] = useState(null);
  const chatContainerRef = useRef(null);
  const isLoggedIn = auth.isSignedIn;
  const [activeSessionId, setActiveSessionId] = useState(() => {
    return localStorage.getItem('lineage_active_session_id');
  });

  // null = never asked, so the consent dialog is shown once per account.
  const [syncConsent, setSyncConsent] = useState(() => readSyncConsent(auth.uid));
  useEffect(() => setSyncConsent(readSyncConsent(auth.uid)), [auth.uid]);

  const {
    sessions,
    setSessions,
    deleteSession,
    deleteAllData,
    syncState,
    storageError,
  } = useSyncedSessions({ uid: auth.uid, syncEnabled: syncConsent === true });

  const needsSyncDecision = auth.canSync && auth.isSignedIn && auth.uid && syncConsent === null;

  const decideSync = (enabled) => {
    writeSyncConsent(auth.uid, enabled);
    setSyncConsent(enabled);
    notify(
      enabled ? 'Sync is on. Your research is available on any device you sign in to.'
              : 'Sync is off. Research stays on this device.',
      enabled ? 'success' : 'info'
    );
  };

  // Surface a full localStorage rather than failing silently on the next write.
  useEffect(() => {
    if (storageError) notify(storageError, 'error');
  }, [storageError]);

  useEffect(() => {
    localStorage.setItem('lineage_active_session_id', activeSessionId || '');
  }, [activeSessionId]);

  // Load messages for the active session. `sessions` is deliberately not a dependency: this
  // should only fire when the user switches sessions, not on every message written into one.
  useEffect(() => {
    if (activeSessionId) {
      const active = sessions.find(s => s.id === activeSessionId);
      if (active) setMessages(active.messages || []);
    } else {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId]);

  // Auto-run search from landing page. handleSearch is re-created every render, so including
  // it as a dependency would re-trigger the search on each one.
  useEffect(() => {
    if (isLoggedIn && pendingQuery && messages.length === 0) {
      handleSearch(pendingQuery);
      setPendingQuery(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, pendingQuery, messages.length]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, status]);

  const notify = (msg, type = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, msg, type }]);
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const stopRef = useRef(null);

  const handleStop = () => {
    if (stopRef.current) {
      stopRef.current.abort();
      stopRef.current = null;
      setLoading(false);
      setStatus(null);
    }
  };

  const handleSearch = async (query) => {
    if (!query.trim()) return;
    if (loading) return;
    // Sign-in is now a real auth round-trip, so it cannot be forced from here.
    // The landing page signs in before routing to /chat.
    if (!isLoggedIn) {
      setPendingQuery(query);
      await auth.signIn();
      return;
    }

    let sessionId = activeSessionId;
    const isRetry = messages.length > 0 && messages[messages.length - 1].content === query && messages[messages.length - 1].role === 'user';
    let newMessages = isRetry ? messages : [...messages, { role: 'user', content: query }];

    // Create new session if none is active
    if (!sessionId && !isRetry) {
      sessionId = Math.random().toString(36).substr(2, 9);
      const newSession = {
        id: sessionId,
        title: query.length > 30 ? query.substring(0, 30) + '…' : query,
        messages: newMessages
      };
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(sessionId);
    } else if (!isRetry) {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: newMessages } : s));
    }

    if (!isRetry) setMessages(newMessages);
    setLoading(true);
    setStatus("Analyzing ancestry…");

    // Statuses are also tracked locally: state updates are not visible to this closure, and
    // the interrupted-research log has to be readable from the error handlers below.
    const researchLogs = [];

    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (!apiKey) {
      setPendingQuery(query);
      setConfigOpen(true);
      setLoading(false);
      return;
    }

    try {
      const controller = new AbortController();
      stopRef.current = controller;

      const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-API-Key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          // On a retry the failed turn is still the last entry in `messages`; drop it so the
          // query is not sent twice. Non-user roles are filtered server-side.
          message: query,
          history: isRetry ? messages.slice(0, -1) : messages,
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
            console.log(`[SSE ${new Date().toLocaleTimeString()}] Data:`, data);
            
            if (data.status) {
              setStatus(data.status);
              researchLogs.push(data.status);
            }
            if (data.title) {
              console.log(`[SSE ${new Date().toLocaleTimeString()}] Updating session title to: "${data.title}"`);
              setSessions(sList => sList.map(s => s.id === sessionId ? { ...s, title: data.title } : s));
            }
            if (data.response) {
              setMessages(prev => {
                const updated = [...prev, { role: 'model', content: data.response }];
                setSessions(sList => sList.map(s => s.id === sessionId ? { ...s, messages: updated } : s));
                return updated;
              });
              setStatus(null);
              researchLogs.length = 0;
            }
            if (data.error) {
              let cleanError = data.error;
              if (typeof cleanError === 'string' && (cleanError.includes('RESOURCE_EXHAUSTED') || cleanError.includes('429') || cleanError.includes('Quota exceeded'))) {
                cleanError = 'Gemini API Quota Exceeded. You have reached the rate limit for free-tier requests (5 requests/min). Please wait ~1 minute before retrying or check your API key in Settings.';
              }
              const logsHeader = researchLogs.length > 0 ? `\n\n**Interrupted Research Log:**\n${researchLogs.map(l => `- ${l}`).join('\n')}` : '';
              setMessages(prev => {
                const updated = [...prev, {
                  role: 'error',
                  content: `${cleanError}${logsHeader}`,
                  retry: data.retry !== undefined ? data.retry : true
                }];
                setSessions(sList => sList.map(s => s.id === sessionId ? { ...s, messages: updated } : s));
                return updated;
              });
              setStatus(null);
              researchLogs.length = 0;
            }
          } catch (e) {
            console.error("Failed to parse SSE line:", trimmed, e);
          }
        }
      }
    } catch (error) {
      const logsHeader = researchLogs.length > 0
        ? `\n\n**Attempted Steps:**\n${researchLogs.map(l => `- ${l}`).join('\n')}`
        : '';

      // The kill-switch is a normal outcome, not a failure: keep whatever research was
      // completed so the user can review it, but skip the toast.
      const content = error.name === 'AbortError'
        ? `Research stopped at your request.${logsHeader}`
        : `Search failed: ${error.message}${logsHeader}`;

      if (error.name !== 'AbortError') console.error("Search failed:", error);

      setMessages(prev => {
        const updated = [...prev, { role: 'error', content, retry: true }];
        setSessions(sList => sList.map(s => s.id === sessionId ? { ...s, messages: updated } : s));
        return updated;
      });
      setStatus(null);

      if (error.name !== 'AbortError') {
        notify(`Failed to orchestrate research. ${error.message}`, "error");
      }
    } finally {
      setLoading(false);
      stopRef.current = null;
    }
  };

  const handleSignIn = async () => {
    if (isLoggedIn) {
      await auth.signOut();
      setActiveSessionId(null);
      setMessages([]);
      navigate('/');
    } else {
      await auth.signIn();
      navigate('/chat');
    }
  };

  useEffect(() => {
    if (auth.error) notify(auth.error, 'error');
  }, [auth.error]);

  return (
    <div className="min-h-screen bg-background text-primary">
      <Header
        isLoggedIn={isLoggedIn}
        onSignIn={handleSignIn}
        themePreference={themePreference}
        onCycleTheme={cycleTheme}
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
                auth.signIn().then(() => navigate('/chat'));
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
                onDeleteSession={(id) => {
                  // Removes the local copy and the cloud document, so deleting a
                  // conversation on one device deletes it everywhere.
                  if (activeSessionId === id) {
                    setActiveSessionId(null);
                    setMessages([]);
                  }
                  deleteSession(id);
                }}
                onNewChat={() => {
                  setActiveSessionId(null);
                  setMessages([]);
                }}
                onOpenSettings={() => setConfigOpen(true)}
                displayName={auth.displayName}
                email={auth.email}
                syncEnabled={syncConsent === true}
                syncState={syncState}
              />
              <main className="flex-1 overflow-hidden relative bg-surface">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in">
                    <div className="w-24 h-24 mb-6 transition-transform hover:scale-110 duration-500">
                      <img src="/logo.svg" alt="Lineage Nexus Logo" className="w-full h-full object-contain pointer-events-none drop-shadow-2xl" />
                    </div>
                    <h2 className="text-4xl font-serif mb-4 tracking-tight">
                      {auth.displayName ? `Welcome, ${auth.displayName.split(' ')[0]}.` : 'Welcome.'}
                    </h2>
                    <p className="text-xl font-serif text-secondary/60 italic max-w-[500px]">
                      Where should we start your research?
                    </p>
                  </div>
                ) : (
                  <div className="h-full overflow-y-auto pb-4" ref={chatContainerRef}>
                    <ChatInterface
                      messages={messages}
                      isLoading={loading}
                      status={status}
                      onRetry={handleSearch}
                    />
                    <div className="h-64 shrink-0"></div>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 pointer-events-none bg-gradient-to-t from-surface via-surface/95 to-transparent pt-32 pb-8 flex justify-center">
                  <div className="w-full max-w-[800px] px-8 pointer-events-auto bg-surface">
                    <ChatInput
                      onSearch={handleSearch}
                      onStop={handleStop}
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
        <SettingsModal
          notify={notify}
          onClose={() => setConfigOpen(false)}
          onSave={() => {
            if (pendingQuery) handleSearch(pendingQuery);
            setPendingQuery(null);
          }}
          canSync={auth.canSync}
          isSignedIn={auth.isSignedIn}
          syncEnabled={syncConsent === true}
          onToggleSync={decideSync}
          syncState={syncState}
          sessionCount={sessions.length}
          onDeleteAllData={async (scope) => {
            await deleteAllData(scope);
            // Clear the open conversation too, otherwise deleted research stays
            // on screen until the next navigation.
            setActiveSessionId(null);
            setMessages([]);
          }}
        />
      )}

      {needsSyncDecision && (
        <SyncConsentModal
          sessionCount={sessions.length}
          accountEmail={auth.email}
          onAccept={() => decideSync(true)}
          onDecline={() => decideSync(false)}
        />
      )}
    </div>
  );
}

export default App;
