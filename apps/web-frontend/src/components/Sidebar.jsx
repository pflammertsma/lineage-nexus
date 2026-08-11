import { Plus, MessageSquare, Clock, Settings, User, Trash2 } from 'lucide-react';

const initialsFor = (name, email) => {
  const source = (name || email || '').trim();
  if (!source) return '·';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase();
};

const Sidebar = ({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onOpenSettings,
  displayName,
  email,
  syncEnabled = false,
  syncState = 'idle',
}) => {
  const initials = initialsFor(displayName, email);
  const syncLabel = !syncEnabled
    ? 'This device only'
    : { syncing: 'Syncing…', synced: 'Synced', error: 'Sync error' }[syncState] || 'Sync on';

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

      <div className="p-3 border-t border-border flex items-center justify-between text-[11px] text-secondary/60">
        <span>Sync: {syncLabel}</span>
      </div>
    </aside>
  );
};

export default Sidebar;
