import React, { useState, useRef, useEffect } from 'react';
import { Send, Search, FileText, Download, ShieldAlert } from 'lucide-react';
import ActionPopovers from './ActionPopovers';

// One definition per chip, rendered by one code path. These were four
// near-identical JSX blocks, which is how the Holocaust chip drifted to a rose
// palette while the rest stayed accent-coloured — it read as a warning rather
// than a peer of the other three.
const ACTIONS = [
  { id: 'research', label: 'Research', Icon: Search },
  { id: 'holocaust', label: 'Holocaust', Icon: ShieldAlert },
  { id: 'biography', label: 'Biography', Icon: FileText },
  { id: 'fetch_profile', label: 'Fetch Profile', Icon: Download },
];

const ChatInput = ({ onSearch, onStop, isLoading }) => {
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const [activePopover, setActivePopover] = useState(null);

  // Close popover on Outside Click or Escape key
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActivePopover(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setActivePopover(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading || !textareaRef.current.value.trim()) return;
    
    onSearch(textareaRef.current.value.trim());
    textareaRef.current.value = '';
    textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    setActivePopover(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const togglePopover = (type) => {
    setActivePopover((prev) => (prev === type ? null : type));
  };

  return (
    <div className="w-full relative" ref={containerRef}>
      {/* Extracted Interactive Action Popovers */}
      <ActionPopovers
        activePopover={activePopover}
        onClose={() => setActivePopover(null)}
        onSearch={onSearch}
      />

      {/* Main Input Form */}
      <form
        onSubmit={handleSubmit}
        className="relative group transition-all duration-300 w-full"
      >
        <div className="absolute inset-0 bg-accent-primary opacity-0 group-focus-within:opacity-5 blur-xl transition-opacity pointer-events-none rounded-2xl"></div>

        <div className="relative bg-card border border-border group-focus-within:border-accent rounded-2xl overflow-hidden shadow-2xl transition-all">
          <textarea
            ref={textareaRef}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your ancestors…"
            className="w-full bg-transparent px-4 sm:px-6 py-4 pr-16 focus:outline-none text-sm leading-relaxed resize-none min-h-[56px] transition-all"
          />

          <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3 border-t border-border/50 bg-card/50">
            {/* One line always: `shrink-0` on each chip stops flex from
                compressing them, and the row scrolls horizontally instead of
                wrapping onto a second line on narrow screens. */}
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-0.5 no-scrollbar">
              {ACTIONS.map((action, i) => (
                <React.Fragment key={action.id}>
                  {i > 0 && <div className="h-4 w-[1px] bg-border/50 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => togglePopover(action.id)}
                    aria-pressed={activePopover === action.id}
                    className={`shrink-0 whitespace-nowrap flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest transition-all px-2.5 py-2.5 sm:py-1.5 rounded-lg cursor-pointer ${
                      activePopover === action.id
                        ? 'bg-accent/20 text-accent opacity-100'
                        : 'opacity-50 hover:opacity-100 hover:text-accent'
                    }`}
                  >
                    <action.Icon size={14} className="shrink-0" />
                    <span>{action.label}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 cursor-pointer hover:bg-rose-500/20 transition-all animate-pulse"
                  title="Stop research"
                >
                  <div className="w-3 h-3 bg-rose-500 rounded-sm"></div>
                </button>
              ) : (
                <button
                  type="submit"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-on-accent shadow-lg shadow-accent/40 cursor-pointer hover:opacity-90 hover:-translate-y-px transition-all"
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      <p className="mt-4 text-[10px] text-center opacity-30 tracking-tight">
        Lineage Nexus uses Gemini to search archives. Results may vary depending on results from sourced archives.
      </p>
    </div>
  );
};

export default ChatInput;
