import React from 'react';
import logo from '../assets/logo.svg';

const Header = () => {
  return (
    <header className="h-[80px] bg-surface border-b border-border sticky top-0 z-[1000]">
      <div className="container h-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="w-8 h-8" />
          <span className="text-xl font-extrabold tracking-tight text-accent">Lineage Nexus</span>
        </div>
        
        <nav className="hidden md:flex gap-8 items-center">
          <a href="#features" className="text-sm font-semibold hover:text-accent transition-colors">Platform</a>
          <a href="#about" className="text-sm font-semibold hover:text-accent transition-colors">Privacy</a>
          <a href="#" className="text-sm font-semibold hover:text-accent transition-colors">Documentation</a>
        </nav>

        <div className="flex items-center gap-4">
          <button className="btn btn-primary">Launch Research</button>
        </div>
      </div>
    </header>
  );
};

export default Header;
