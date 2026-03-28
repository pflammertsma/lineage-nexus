import React from 'react';
import logo from '../assets/logo.svg';

const Header = () => {
  return (
    <header className="header">
      <div className="container header-inner">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" style={{ width: '32px', height: '32px' }} />
          <span className="text-xl font-extrabold tracking-tight">Lineage Nexus</span>
        </div>
        
        <nav className="md:flex gap-8 items-center">
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
