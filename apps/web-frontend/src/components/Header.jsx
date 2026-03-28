import React from 'react';
import logo from '../assets/logo.svg';

const Header = () => {
  return (
    <header className="header">
      <div className="container header-inner">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" style={{ width: '32px', height: '32px' }} />
          <span style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em' }}>Lineage Nexus</span>
        </div>
        
        <nav className="md:flex gap-8 items-center">
          <a href="#features" className="text-sm font-semibold hover:accent">Platform</a>
          <a href="#about" className="text-sm font-semibold hover:accent">Privacy</a>
          <a href="#" className="text-sm font-semibold hover:accent">Documentation</a>
        </nav>

        <div className="flex items-center gap-4">
          <button className="btn btn-primary">Launch Research</button>
        </div>
      </div>
    </header>
  );
};

export default Header;
