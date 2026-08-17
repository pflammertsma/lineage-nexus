import { Plus, MessageSquare, Trash2, X } from 'lucide-react';

/**
 * Research history.
 *
 * Below `md` this is an overlay drawer: it sits above the transcript and is
 * dismissed by the backdrop, Escape, or picking a session. Laying it out beside
 * the chat at phone widths left the transcript around 119px wide, which wrapped
 * the research trail to roughly one character per line.
 *
 * At `md` and up it is an ordinary flex child again, so desktop is unchanged.
 */
const Sidebar = ({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  open = false,
  onClose = () => {},
  syncEnabled = false,
  syncState = 'idle',
}) => {
  const syncLabel = !syncEnabled
    ? 'This device only'
    : { syncing: 'Syncing…', synced: 'Synced', error: 'Sync error' }[syncState] || 'Sync on';

  // Picking a session on a phone means the user is done with the drawer.
  const select = (id) => {
    onSelectSession(id);
    onClose();
  };

  return (
    <>
      {/* Backdrop. Mobile only — on desktop the sidebar is not an overlay. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        aria-label="Research history"
        className={`
          fixed left-0 bottom-0 top-[var(--h-header)] z-40 flex flex-col
          w-[var(--w-sidebar)] max-w-[85vw]
          border-r border-border bg-surface
          transition-transform duration-300 ease-out
          ${open ? 'translate-x-0' : '-translate-x-full invisible'}
          md:static md:z-auto md:h-full md:max-w-none md:translate-x-0 md:visible md:shrink-0
        `}
      >
        <div className="p-4 border-b border-border flex items-center gap-2">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 btn btn-primary py-3"
          >
            <Plus size={18} />
            <span>New Research</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="md:hidden w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-secondary hover:text-accent hover:bg-card transition-colors cursor-pointer"
          >
            <X size={18} />
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
                className={`group flex items-center gap-1 pl-3 pr-1 rounded-lg text-sm transition-colors ${
                  activeSessionId === session.id
                    ? 'bg-accent-soft text-accent'
                    : 'hover:bg-card'
                }`}
              >
                <button
                  onClick={() => select(session.id)}
                  className="flex-1 flex items-center gap-3 overflow-hidden min-h-11 cursor-pointer"
                >
                  <MessageSquare size={16} className="shrink-0 opacity-60" />
                  <span className="truncate text-left">{session.title}</span>
                </button>
                {/* Always visible on touch: hover is not a gesture a phone has. */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  aria-label={`Delete ${session.title}`}
                  className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg transition-all cursor-pointer
                             text-secondary/70 hover:text-red-500
                             opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </nav>

        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-border flex items-center justify-between text-[11px] text-secondary/60">
          <span>Sync: {syncLabel}</span>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
