import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import FeatureGrid from './components/FeatureGrid';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import SyncConsentModal from './components/SyncConsentModal';
import ChatInterface from './components/ChatInterface';
import { PrivacyPage, TermsPage } from './components/LegalPage';
import ConsentBanner from './components/ConsentBanner';
import ConfirmDialog from './components/ConfirmDialog';
import ChatInput from './components/ChatInput';
import Notification from './components/Notification';
import { ArrowDown } from 'lucide-react';
import { API_BASE_URL, API_KEY_STORAGE, FALLBACK_API_KEY_STORAGE } from './config';
import useTheme from './useTheme';
import useAuth from './useAuth';
import useSyncedSessions, { readSyncConsent, writeSyncConsent } from './useSyncedSessions';
import {
  analyticsAvailable,
  loadAnalytics,
  readAnalyticsConsent,
  trackPageView,
  writeAnalyticsConsent,
} from './analytics';
import './index.css';

/**
 * Shown while Firebase resolves whether there is an existing session.
 *
 * Without this the routes read `isSignedIn` before `onAuthStateChanged` has fired,
 * so a signed-in user reloading /chat is bounced to the landing page and then
 * redirected back — a visible flash, and a lost deep link. Never appears when
 * Firebase is unconfigured, where `ready` is true from the first render.
 */
const AuthPending = () => (
  <div className="h-[calc(100dvh-var(--h-header))] flex items-center justify-center">
    <div className="flex flex-col items-center gap-4 animate-in">
      <img src="/logo.svg" alt="" className="w-12 h-12 opacity-40 animate-pulse" />
      <p className="text-xs uppercase tracking-widest text-secondary">Restoring your session…</p>
    </div>
  </div>
);

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
  // A ref, not state: this is read inside SSE handlers that close over their
  // creation-time scope, and it must never trigger a re-render on scroll.
  const isAtBottomRef = useRef(true);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [hasNewUnread, setHasNewUnread] = useState(false);
  // Drawer state, mobile only. At `md` and up the sidebar ignores this entirely.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Session queued for deletion, pending confirmation. Deleting a conversation
  // removes it from every signed-in device, so it is not undoable.
  const [pendingDelete, setPendingDelete] = useState(null);
  // null = never asked. Analytics stay unloaded until this is 'granted'.
  const [analyticsConsent, setAnalyticsConsent] = useState(() => readAnalyticsConsent());
  const location = useLocation();
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
    syncWarning,
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

  // A session that has outgrown Firestore's per-document limit. Reported rather
  // than swallowed: the user would otherwise keep researching, believing their
  // work was backed up.
  useEffect(() => {
    if (syncWarning) notify(syncWarning, 'error');
  }, [syncWarning]);

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

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const el = chatContainerRef.current;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceToBottom < 120;
    
    isAtBottomRef.current = atBottom;
    setShowScrollDown(!atBottom && messages.length > 0);
    if (atBottom) {
      setHasNewUnread(false);
    }
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
      isAtBottomRef.current = true;
      setShowScrollDown(false);
      setHasNewUnread(false);
    }
  };

  // Auto-run search from landing page. handleSearch is re-created every render, so including
  // it as a dependency would re-trigger the search on each one.
  useEffect(() => {
    if (isLoggedIn && pendingQuery && messages.length === 0) {
      handleSearch(pendingQuery);
      setPendingQuery(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, pendingQuery, messages.length]);

  // Smart Auto-scroll to bottom of chat only if user is already near the bottom
  useEffect(() => {
    if (chatContainerRef.current && isAtBottomRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    } else if (!isAtBottomRef.current && (messages.length > 0 || status)) {
      setHasNewUnread(true);
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
    const fallbackApiKey = localStorage.getItem(FALLBACK_API_KEY_STORAGE);

    if (!apiKey && !fallbackApiKey) {
      setPendingQuery(query);
      setConfigOpen(true);
      setLoading(false);
      return;
    }

    try {
      const controller = new AbortController();
      stopRef.current = controller;

      const headers = {
        'Content-Type': 'application/json',
      };
      if (apiKey) headers['X-Gemini-API-Key'] = apiKey;
      if (fallbackApiKey) headers['X-Gemini-Fallback-API-Key'] = fallbackApiKey;

      const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
        method: 'POST',
        headers,
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

            if (data.status) {
              setStatus(data.status);
              researchLogs.push(data.status);
            }
            if (data.title) {
              setSessions(sList => sList.map(s => s.id === sessionId ? { ...s, title: data.title } : s));
            }
            if (data.response) {
              setMessages(prev => {
                // `steps` is the trail of tool calls the agent actually made; kept on the
                // message so it survives reloads and syncs with the rest of the session.
                const updated = [...prev, {
                  role: 'model',
                  content: data.response,
                  ...(Array.isArray(data.steps) && data.steps.length ? { steps: data.steps } : {}),
                }];
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

  // Only now is the gtag script fetched — never before consent.
  useEffect(() => {
    if (analyticsConsent === 'granted') loadAnalytics();
  }, [analyticsConsent]);

  // Single-page navigation does not reload the document, so route changes have
  // to be reported explicitly or every visit looks like one page view.
  useEffect(() => {
    if (analyticsConsent === 'granted') trackPageView(location.pathname);
  }, [location.pathname, analyticsConsent]);

  // Escape closes the drawer, and the page behind it must not scroll while it is
  // open — on iOS a scrollable body under an overlay is what makes a drawer feel
  // broken. Both are undone as soon as it closes, including on unmount.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  // Resizing past the breakpoint with the drawer open would otherwise leave the
  // scroll lock and backdrop applied to a desktop layout that has neither.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = (e) => { if (e.matches) setSidebarOpen(false); };
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <div className="min-h-screen bg-background text-primary">
      <Header
        isLoggedIn={isLoggedIn}
        onSignIn={handleSignIn}
        displayName={auth.displayName}
        email={auth.email}
        photoURL={auth.photoURL}
        themePreference={themePreference}
        onCycleTheme={cycleTheme}
        onOpenSettings={() => setConfigOpen(true)}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        isSimulated={auth.isSimulated}
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
          !auth.ready ? <AuthPending /> :
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
                  <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] font-bold uppercase tracking-widest opacity-60">
                    <Link to="/privacy" className="hover:text-accent transition-colors">Privacy</Link>
                    <Link to="/terms" className="hover:text-accent transition-colors">Terms</Link>
                  </nav>
                  <p className="text-xs opacity-40">© 2026 Lineage Nexus. All rights reserved.</p>
                </div>
              </footer>
            </main>
          )
        } />

        <Route path="/chat" element={
          !auth.ready ? <AuthPending /> :
          !isLoggedIn ? <Navigate to="/" replace /> : (
            // dvh, not vh: mobile browser chrome shrinks the visual viewport and
            // vh does not follow it, which clipped the composer off-screen.
            <div className="flex h-[calc(100dvh-var(--h-header))] overflow-hidden">
              <Sidebar
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelectSession={(id) => setActiveSessionId(id)}
                onDeleteSession={(id) => {
                  const session = sessions.find(s => s.id === id);
                  setPendingDelete({ id, title: session?.title || 'this conversation' });
                }}
                onNewChat={() => {
                  setActiveSessionId(null);
                  setMessages([]);
                }}
                syncEnabled={syncConsent === true}
                syncState={syncState}
              />
              <main className="flex-1 min-w-0 overflow-hidden relative bg-surface">
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
                  <div className="h-full overflow-y-auto" ref={chatContainerRef} onScroll={handleScroll}>
                    <ChatInterface
                      messages={messages}
                      isLoading={loading}
                      status={status}
                      onRetry={handleSearch}
                    />
                    {/* Keeps the last line clear of the composer overlay when
                        scrolled to the bottom. Derived from the composer height
                        so the two cannot drift apart. */}
                    <div className="h-[calc(var(--h-composer)+112px)] shrink-0 pointer-events-none" />
                  </div>
                )}
                
                {/* Floating "Scroll to bottom" button when user is scrolled up */}
                {showScrollDown && (
                  <button
                    type="button"
                    onClick={scrollToBottom}
                    className={`absolute bottom-[calc(var(--h-composer)+24px)] right-4 sm:right-8 z-20 flex items-center gap-2 px-3.5 py-2 rounded-full shadow-2xl transition-all hover:scale-105 animate-in fade-in duration-200 cursor-pointer ${
                      hasNewUnread
                        ? 'bg-accent text-on-accent shadow-accent/40 ring-2 ring-accent/30 font-bold'
                        : 'bg-card/90 backdrop-blur-md border border-border/80 text-foreground hover:text-accent font-semibold'
                    }`}
                    title={hasNewUnread ? "New messages received" : "Scroll to bottom"}
                  >
                    <ArrowDown size={14} className={hasNewUnread ? "animate-bounce text-on-accent" : "text-accent"} />
                    <span className="text-xs">
                      {hasNewUnread ? 'New messages' : 'Scroll to bottom'}
                    </span>
                  </button>
                )}

                {/* Floating composer: tight pt-12 fade above the input; inset right-4
                    to unblock the scrollbar track. `.reading-column` matches the
                    transcript exactly, so the input sits directly under the text
                    it answers rather than on its own axis. */}
                <div className="absolute bottom-0 left-0 right-4 pointer-events-none bg-gradient-to-t from-surface via-surface/95 to-transparent pt-12 pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex justify-center z-10">
                  <div className="reading-column pointer-events-auto">
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

        {/* Reachable signed in or out, and linkable from the OAuth consent screen. */}
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* Hosting rewrites every path to index.html, so unknown URLs land here
            rather than on a 404 page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Asked once, and only when analytics could actually run: unconfigured
          builds and browsers sending Do Not Track never see it. */}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete this research?"
          message={`"${pendingDelete.title}" and its full message history will be removed.`}
          detail={syncConsent === true
            ? 'This also deletes it from your other signed-in devices. It cannot be undone.'
            : 'This cannot be undone.'}
          confirmLabel="Delete research"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            // Removes the local copy and the cloud document, so deleting a
            // conversation on one device deletes it everywhere.
            if (activeSessionId === pendingDelete.id) {
              setActiveSessionId(null);
              setMessages([]);
            }
            deleteSession(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}

      {analyticsAvailable() && analyticsConsent === null && (
        <ConsentBanner
          onAccept={() => { writeAnalyticsConsent('granted'); setAnalyticsConsent('granted'); }}
          onDecline={() => { writeAnalyticsConsent('denied'); setAnalyticsConsent('denied'); }}
        />
      )}

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
