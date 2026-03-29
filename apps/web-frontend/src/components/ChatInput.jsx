import React, { useRef, useEffect } from 'react';
import { Send, Globe, Search, PlusCircle, Mic } from 'lucide-react';

const ChatInput = ({ onSearch, isLoading, status }) => {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [textareaRef.current?.value]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const query = textareaRef.current.value.trim();
    if (query && !isLoading) {
      onSearch(query);
      textareaRef.current.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  return (
    <div className="w-full">
      <form
        onSubmit={handleSubmit}
        className="relative group transition-all duration-300 w-full"
      >
          <div className="absolute inset-0 bg-accent-primary opacity-0 group-focus-within:opacity-5 blur-xl transition-opacity pointer-events-none rounded-2xl"></div>

          <div className="relative bg-card border border-border group-focus-within:border-accent rounded-2xl overflow-hidden shadow-2xl transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your ancestors..."
              disabled={isLoading}
              className="w-full bg-transparent px-6 py-4 pr-16 focus:outline-none text-sm leading-relaxed resize-none min-h-[56px] transition-all"
            />

            <div className="flex items-center justify-between px-6 py-3 border-t border-border/50 bg-card/50">
              <div className="flex items-center gap-4">
                <button type="button" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
                  <PlusCircle size={16} />
                  <span>Tools</span>
                </button>
                <div className="h-4 w-[1px] bg-border/50 mx-1"></div>
                <button type="button" className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity text-accent">
                  <Globe size={16} />
                  <span>Research Deep</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isLoading ? 'opacity-20 cursor-wait' : 'bg-accent text-white shadow-lg shadow-accent/40 cursor-pointer hover:opacity-90 hover:-translate-y-px'
                    }`}
                >
                  <Send size={18} />
                </button>
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
