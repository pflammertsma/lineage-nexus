import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Sun, Moon, Monitor, Settings, LogOut, Menu, ShieldCheck, AlertTriangle, Gauge } from 'lucide-react';
import logo from '../assets/logo.svg';

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'Match system theme',
};

const initialsFor = (name, email) => {
  const source = (name || email || '').trim();
  if (!source) return 'U';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
};

const Header = ({
  isLoggedIn,
  onSignIn,
  displayName,
  email,
  photoURL,
  themePreference = 'system',
  onCycleTheme,
  onOpenSettings,
  onToggleSidebar,
  isSimulated = false,
  isAdmin = false,
}) => {
  const ThemeIcon = THEME_ICON[themePreference] || Monitor;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  // "Platform" is a jump link to a section of the landing page, so it only means
  // anything there. On any other route it resolved against the current path
  // (/privacy#features) and went nowhere; off the landing page the useful
  // destination is the landing page itself.
  const onLandingPage = useLocation().pathname === '/';

  const initials = initialsFor(displayName, email);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-[var(--h-header)] bg-surface border-b border-border sticky top-0 z-[1000]">
      {/* On /chat the bar runs full-bleed so the wordmark aligns with the sidebar
          instead of a centred container, leaving the transcript as the only
          centred element. The landing page keeps the marketing container. */}
      <div className={isLoggedIn ? 'app-bar' : 'container h-full flex items-center justify-between'}>
        <div className="flex items-center gap-1 sm:gap-3 select-none min-w-0">
          {isLoggedIn && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Open research history"
              className="md:hidden w-11 h-11 -ml-1 shrink-0 flex items-center justify-center rounded-lg text-secondary hover:text-accent hover:bg-card transition-colors cursor-pointer"
            >
              <Menu size={20} />
            </button>
          )}
          <Link to="/" className="flex items-center gap-3 min-w-0" aria-label="Lineage Nexus home">
            <img src={logo} alt="" className="w-7 h-7 shrink-0 pointer-events-none" />
            <span className="text-lg font-extrabold tracking-tight text-accent truncate">Lineage Nexus</span>
          </Link>
        </div>

        {/* Marketing links on landing page */}
        {!isLoggedIn && (
          <nav className="hidden md:flex gap-8 items-center opacity-60">
            {onLandingPage ? (
              <a href="#features" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Platform</a>
            ) : (
              <Link to="/" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Home</Link>
            )}
            <Link to="/sources" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Sources</Link>
            <Link to="/ai-transparency" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">AI</Link>
            <Link to="/privacy" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Privacy</Link>
            <Link to="/terms" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Terms</Link>
          </nav>
        )}

        <div className="flex items-center gap-3">
          {/* Firebase is unconfigured, so "sign in" set a localStorage flag rather
              than authenticating anyone. Saying so out loud is the point: an
              indistinguishable fake login is how you ship one to production. */}
          {isSimulated && (
            <span
              title="No Firebase project is configured, so sign-in is simulated and sync is unavailable. Set VITE_FIREBASE_* in .env to enable real Google sign-in."
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-500 text-[10px] font-bold uppercase tracking-widest cursor-help"
            >
              <AlertTriangle size={11} />
              Simulated login
            </span>
          )}

          <button
            onClick={onCycleTheme}
            title={THEME_LABEL[themePreference]}
            aria-label={THEME_LABEL[themePreference]}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-secondary hover:text-accent hover:bg-card border border-transparent hover:border-border transition-colors cursor-pointer"
          >
            <ThemeIcon size={16} />
          </button>

          {!isLoggedIn ? (
            <button
              onClick={onSignIn}
              className="btn btn-primary px-5 py-2 text-xs"
            >
              Sign In
            </button>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="w-9 h-9 rounded-full bg-accent-soft text-accent border border-accent/40 font-bold text-xs flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-accent/40 transition-all focus:outline-none overflow-hidden"
                title="Account & Settings"
              >
                {photoURL ? (
                  <img src={photoURL} alt={displayName || 'User Avatar'} className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-12 w-64 z-[2000] bg-surface border border-border shadow-2xl rounded-2xl p-2 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-2.5 border-b border-border/60 flex items-center gap-3">
                    {photoURL ? (
                      <img src={photoURL} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border border-accent/30" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-accent-soft text-accent font-bold text-xs flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-primary truncate">{displayName || 'User'}</p>
                      <p className="text-[11px] text-secondary/70 truncate">{email || 'Signed in'}</p>
                    </div>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        if (onOpenSettings) onOpenSettings();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-secondary hover:text-accent hover:bg-card transition-colors cursor-pointer"
                    >
                      <Settings size={15} className="shrink-0" />
                      <span>Settings & API Keys</span>
                    </button>

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-secondary hover:text-accent hover:bg-card transition-colors cursor-pointer"
                      >
                        <Gauge size={15} className="shrink-0" />
                        <span>Admin dashboard</span>
                      </Link>
                    )}

                    <Link
                      to="/privacy"
                      onClick={() => setDropdownOpen(false)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-secondary hover:text-accent hover:bg-card transition-colors cursor-pointer"
                    >
                      <ShieldCheck size={15} className="shrink-0" />
                      <span>Privacy & Terms</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onSignIn();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer mt-1"
                    >
                      <LogOut size={15} className="shrink-0" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
