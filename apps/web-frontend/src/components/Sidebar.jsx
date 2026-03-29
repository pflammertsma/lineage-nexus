import React from 'react';
import { Plus, MessageSquare, Clock, Settings, User } from 'lucide-react';

const Sidebar = ({ sessions, activeSessionId, onNewChat, onSelectSession }) => {
  return (
    <aside className="w-64 border-r border-border bg-surface flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-border">
        <button 
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 btn btn-primary py-3"
        >
          <Plus size={18} />
          <span>New Research</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-3 py-2 text-xs font-bold uppercase tracking-widest opacity-40">
          History
        </div>
        {sessions.length === 0 ? (
          <div className="px-3 py-4 text-xs opacity-30 italic">
            No research sessions yet
          </div>
        ) : (
          sessions.map(session => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSessionId === session.id 
                  ? 'bg-accent-soft text-accent' 
                  : 'hover:bg-card'
              }`}
            >
              <MessageSquare size={16} className="shrink-0 opacity-60" />
              <span className="truncate text-left">{session.title}</span>
            </button>
          ))
        )}
      </nav>

      <div className="p-4 border-t border-border space-y-2">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-card transition-colors">
          <Settings size={16} className="opacity-60" />
          <span>Settings</span>
        </button>
        <div className="pt-2 flex items-center gap-3 px-3">
          <div className="w-8 h-8 rounded-full bg-accent-primary flex items-center justify-center text-white font-bold text-xs">
            PL
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold truncate">Paul Lammertsma</span>
            <span className="text-[10px] opacity-40 truncate">Professional Plan</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
