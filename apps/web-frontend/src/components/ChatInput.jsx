import React, { useRef, useEffect } from 'react';
import { Send, Search, FileText, Download, Mic } from 'lucide-react';

const ChatInput = ({ onSearch, onStop, isLoading, status }) => {
  const textareaRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLoading || !textareaRef.current.value.trim()) return;
    
    onSearch(textareaRef.current.value.trim());
    textareaRef.current.value = '';
    textareaRef.current.dispatchEvent(new Event('input', { bubbles: true })); // trigger auto-resize
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleActionClick = (prompt) => {
    if (textareaRef.current) {
      textareaRef.current.value = prompt;
      textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
      textareaRef.current.focus();
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
              onKeyDown={handleKeyDown}
              placeholder="Ask about your ancestors..."
              className="w-full bg-transparent px-6 py-4 pr-16 focus:outline-none text-sm leading-relaxed resize-none min-h-[56px] transition-all"
            />

            <div className="flex items-center justify-between px-6 py-3 border-t border-border/50 bg-card/50">
              <div className="flex items-center gap-4">
                <button 
                  type="button" 
                  onClick={() => handleActionClick("Use the researcher agent to perform research. Look for any relevant genealogical records.")}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                >
                  <Search size={14} />
                  <span>Research</span>
                </button>
                <div className="h-4 w-[1px] bg-border/50 mx-1"></div>
                <button 
                  type="button" 
                  onClick={() => handleActionClick("Use the formatter agent to format a biography that includes as much relevant details about the profile we've been talking about, including references and only links to known profiles. Provide the final biography in a code block with language 'wiki' so it can be easily copied to WikiTree.")}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                >
                  <FileText size={14} />
                  <span>Biography</span>
                </button>
                <div className="h-4 w-[1px] bg-border/50 mx-1"></div>
                <button 
                  type="button" 
                  onClick={() => handleActionClick("Read [ENTER-WIKITREE-ID] from WikiTree, fetching it as the data may have changed if you have read it previously.")}
                  className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                >
                  <Download size={14} />
                  <span>Fetch Profile</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
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
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/40 cursor-pointer hover:opacity-90 hover:-translate-y-px transition-all"
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
