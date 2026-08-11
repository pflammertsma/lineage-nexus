import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Settings, LogOut } from 'lucide-react';
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
}) => {
  const ThemeIcon = THEME_ICON[themePreference] || Monitor;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

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
    <header className="h-[70px] bg-surface border-b border-border sticky top-0 z-[1000]">
      <div className="container h-full flex items-center justify-between">
        <div className="flex items-center gap-3 select-none">
          <img src={logo} alt="" className="w-7 h-7 pointer-events-none" />
          <span className="text-lg font-extrabold tracking-tight text-accent">Lineage Nexus</span>
        </div>

        {/* Marketing links on landing page */}
        {!isLoggedIn && (
          <nav className="hidden md:flex gap-8 items-center opacity-60">
            <a href="#features" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Platform</a>
            <a href="#about" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Privacy</a>
            <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Docs</a>
          </nav>
        )}

        <div className="flex items-center gap-3">
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
