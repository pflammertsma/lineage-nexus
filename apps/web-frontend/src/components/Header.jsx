import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Sun, Moon, Monitor, Settings, LogOut, Menu, ShieldCheck, AlertTriangle, Gauge,
  Activity, Layers, PieChart, Search, RefreshCw, ChevronDown,
} from 'lucide-react';
import logo from '../assets/logo.svg';
import Button from './Button';

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'Match system theme',
};

const ADMIN_TABS = [
  { id: 'overview', path: '/admin', label: 'System', icon: Activity },
  { id: 'harvesting', path: '/admin/ingestion', label: 'Ingestion', icon: Layers },
  { id: 'coverage', path: '/admin/corpus', label: 'Corpus', icon: PieChart },
  { id: 'query', path: '/admin/query', label: 'Index', icon: Search },
];

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
  const [adminMobileMenuOpen, setAdminMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const adminMobileMenuRef = useRef(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const onLandingPage = location.pathname === '/';
  const isAdminPage = location.pathname.startsWith('/admin');

  const activeTabId = (() => {
    const p = location.pathname;
    if (p.startsWith('/admin/ingestion') || p.startsWith('/admin/harvesting')) return 'harvesting';
    if (p.startsWith('/admin/corpus') || p.startsWith('/admin/coverage')) return 'coverage';
    if (p.startsWith('/admin/query') || p.startsWith('/admin/index')) return 'query';
    return searchParams.get('tab') || 'overview';
  })();
  const activeTabObj = ADMIN_TABS.find((t) => t.id === activeTabId) || ADMIN_TABS[0];
  const ActiveTabIcon = activeTabObj.icon;

  const initials = initialsFor(displayName, email);

  const [isIngestActive, setIsIngestActive] = useState(false);
  const [systemStress, setSystemStress] = useState('normal');

  useEffect(() => {
    const handleIndexingActive = (e) => {
      if (e?.detail) setIsIngestActive(Boolean(e.detail.active));
    };
    const handleSystemStress = (e) => {
      if (e?.detail) setSystemStress(e.detail.level || 'normal');
    };

    window.addEventListener('admin-indexing-active', handleIndexingActive);
    window.addEventListener('admin-system-stress', handleSystemStress);
    return () => {
      window.removeEventListener('admin-indexing-active', handleIndexingActive);
      window.removeEventListener('admin-system-stress', handleSystemStress);
    };
  }, []);

  const stressDotBg =
    systemStress === 'critical'
      ? 'bg-red-500'
      : systemStress === 'warning'
      ? 'bg-amber-500'
      : null;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (adminMobileMenuRef.current && !adminMobileMenuRef.current.contains(e.target)) {
        setAdminMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-[var(--h-header)] bg-surface border-b border-border sticky top-0 z-[1000]">
      <div className={isLoggedIn || isAdminPage ? 'app-bar' : 'container h-full flex items-center justify-between'}>
        {/* Left Section: Logo & Title / Mobile Section Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3 select-none min-w-0">
          {isLoggedIn && !isAdminPage && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Open research history"
              className="md:hidden w-11 h-11 -ml-1 shrink-0 flex items-center justify-center rounded-lg text-secondary hover:text-accent hover:bg-card transition-colors cursor-pointer"
            >
              <Menu size={20} />
            </button>
          )}

          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Lineage Nexus home">
            <img src={logo} alt="" className="w-7 h-7 shrink-0 pointer-events-none" />
            <span className={`text-lg font-extrabold tracking-tight text-accent ${isAdminPage ? 'hidden md:inline' : ''}`}>
              {isAdminPage ? 'Archival Control Panel' : 'Lineage Nexus'}
            </span>
          </Link>

          {/* Admin Mobile Section Dropdown Selector (replaces static title on mobile) */}
          {isAdminPage && (
            <div className="relative md:hidden shrink-0" ref={adminMobileMenuRef}>
              <button
                type="button"
                onClick={() => setAdminMobileMenuOpen((open) => !open)}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-card border border-border text-sm font-bold text-primary hover:border-accent transition-colors cursor-pointer shadow-xs"
              >
                <ActiveTabIcon size={16} className="text-accent shrink-0" />
                <span>{activeTabObj.label}</span>
                {activeTabId === 'overview' && stressDotBg && (
                  <span className="relative flex h-2 w-2 ml-0.5" title={`System ${systemStress} load`}>
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stressDotBg}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${stressDotBg}`}></span>
                  </span>
                )}
                {activeTabId === 'harvesting' && isIngestActive && (
                  <span className="relative flex h-2 w-2 ml-0.5" title="Ingestion in progress">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                  </span>
                )}
                <ChevronDown size={14} className="text-secondary shrink-0 ml-0.5" />
              </button>

              {adminMobileMenuOpen && (
                <div className="absolute left-0 mt-2 w-52 bg-card border border-border-strong rounded-xl shadow-2xl py-1.5 z-[1100]">
                  {ADMIN_TABS.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTabId === tab.id;
                    const isHarvesting = tab.id === 'harvesting';
                    const isOverview = tab.id === 'overview';
                    return (
                      <Link
                        key={tab.id}
                        to={tab.path}
                        onClick={() => setAdminMobileMenuOpen(false)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-accent/10 text-accent font-bold'
                            : 'text-primary hover:bg-muted'
                        }`}
                      >
                        <TabIcon size={16} className={isActive ? 'text-accent' : 'text-secondary'} />
                        <span>{tab.label}</span>

                        {isOverview && stressDotBg && (
                          <span className="ml-auto text-[10px] font-semibold flex items-center gap-1.5" style={{ color: systemStress === 'critical' ? '#EF4444' : '#F59E0B' }}>
                            <span className="relative flex h-2 w-2">
                              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stressDotBg}`}></span>
                              <span className={`relative inline-flex rounded-full h-2 w-2 ${stressDotBg}`}></span>
                            </span>
                            <span>{systemStress === 'critical' ? 'Critical' : 'High Load'}</span>
                          </span>
                        )}

                        {isHarvesting && isIngestActive && (
                          <span className="ml-auto text-[10px] text-accent font-semibold flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                            </span>
                            <span>Active</span>
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Middle Section: Marketing links or Desktop Admin Navigation Tabs */}
        {isAdminPage ? (
          <nav className="hidden md:flex items-stretch gap-1 h-full">
            {ADMIN_TABS.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTabId === tab.id;
              const isHarvesting = tab.id === 'harvesting';
              const isOverview = tab.id === 'overview';
              return (
                <Link
                  key={tab.id}
                  to={tab.path}
                  className={`admin-tab-btn ${isActive ? 'admin-tab-btn-active' : 'admin-tab-btn-inactive'}`}
                >
                  <TabIcon size={16} />
                  <span>{tab.label}</span>
                  {isOverview && stressDotBg && (
                    <span className="relative flex h-2 w-2 ml-1" title={`System ${systemStress} load`}>
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stressDotBg}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${stressDotBg}`}></span>
                    </span>
                  )}
                  {isHarvesting && isIngestActive && (
                    <span className="relative flex h-2 w-2 ml-1" title="Ingestion in progress">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        ) : (
          !isLoggedIn && (
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
          )
        )}

        {/* Right Section: Admin Refresh, Theme, Account Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isAdminPage && (
            <Button
              onClick={() => window.dispatchEvent(new Event('admin-refresh'))}
              title="Refresh status"
              icon={RefreshCw}
              className="py-1.5 px-2.5 sm:px-3 text-xs"
            >
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}

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
                <div className="absolute right-0 mt-2 w-56 bg-card border border-border-strong rounded-xl shadow-2xl py-2 z-[1100]">
                  <div className="px-4 py-2.5 border-b border-border/50">
                    <p className="text-xs font-semibold text-primary truncate">{displayName || 'Logged In User'}</p>
                    <p className="text-[11px] text-secondary truncate">{email || 'No email attached'}</p>
                  </div>

                  {isAdmin && !isAdminPage && (
                    <div className="py-1 border-b border-border/50">
                      <Link
                        to="/admin"
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-primary hover:bg-muted transition-colors font-medium"
                      >
                        <ShieldCheck size={14} className="text-accent" />
                        Archival Admin Panel
                      </Link>
                    </div>
                  )}

                  {isAdminPage && (
                    <div className="py-1 border-b border-border/50">
                      <Link
                        to="/"
                        onClick={() => setDropdownOpen(false)}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-primary hover:bg-muted transition-colors font-medium"
                      >
                        <Gauge size={14} className="text-accent" />
                        Return to Research Hub
                      </Link>
                    </div>
                  )}

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenSettings?.();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-primary hover:bg-muted transition-colors"
                    >
                      <Settings size={14} className="text-secondary" />
                      Settings & Keys
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        window.dispatchEvent(new Event('lineage-signout'));
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-red-500 hover:bg-muted transition-colors"
                    >
                      <LogOut size={14} />
                      Sign Out
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
