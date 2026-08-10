import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import logo from '../assets/logo.svg';

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'Match system theme',
};

const Header = ({ isLoggedIn, onSignIn, themePreference = 'system', onCycleTheme }) => {
  const ThemeIcon = THEME_ICON[themePreference] || Monitor;
  return (
    <header className="h-[70px] bg-surface border-b border-border sticky top-0 z-[1000]">
      <div className="container h-full flex items-center justify-between">
        <div className="flex items-center gap-3 select-none">
          <img src={logo} alt="" className="w-7 h-7 pointer-events-none" />
          <span className="text-lg font-extrabold tracking-tight text-accent">Lineage Nexus</span>
        </div>

        {/* Only show marketing links on landing page */}
        {!isLoggedIn && (
          <nav className="hidden md:flex gap-8 items-center opacity-60">
            <a href="#features" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Platform</a>
            <a href="#about" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Privacy</a>
            <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-accent transition-colors">Docs</a>
          </nav>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onCycleTheme}
            title={THEME_LABEL[themePreference]}
            aria-label={THEME_LABEL[themePreference]}
            className="w-9 h-9 flex items-center justify-center rounded-md text-secondary hover:text-accent hover:bg-card border border-transparent hover:border-border transition-colors cursor-pointer"
          >
            <ThemeIcon size={16} />
          </button>
          <button
            onClick={onSignIn}
            className={`btn ${isLoggedIn ? 'btn-secondary opacity-60 hover:opacity-100' : 'btn-primary'} px-5 py-2 text-xs`}
          >
            {isLoggedIn ? 'Sign Out' : 'Sign In'}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
