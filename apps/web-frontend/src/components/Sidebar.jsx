import { Plus, MessageSquare, Clock, Settings, User, Trash2 } from 'lucide-react';

const Sidebar = ({ sessions, activeSessionId, onNewChat, onSelectSession, onDeleteSession, onOpenSettings }) => {
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
            <div
              key={session.id}
              className={`group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                activeSessionId === session.id 
                  ? 'bg-accent-soft text-accent' 
                  : 'hover:bg-card'
              }`}
            >
              <button 
                onClick={() => onSelectSession(session.id)}
                className="flex-1 flex items-center gap-3 overflow-hidden"
              >
                <MessageSquare size={16} className="shrink-0 opacity-60" />
                <span className="truncate text-left">{session.title}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all p-1"
                title="Delete session"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </nav>

      <div className="p-4 border-t border-border space-y-2">
        <button
          onClick={onOpenSettings}
          title="API configuration"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-card transition-colors cursor-pointer"
        >
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
