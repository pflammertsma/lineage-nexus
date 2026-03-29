import React from 'react';
import { User, Shield } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const ChatInterface = ({ messages, isLoading }) => {
  if (messages.length === 0) return null;

  return (
    <section className="py-24 bg-surface section-divider">
      <div className="container" style={{ maxWidth: '800px' }}>
        <h3 className="mb-12 flex items-center gap-3">
          <span className="accent-circle"></span>
          Research Log
        </h3>
        
        <div className="flex flex-col gap-8">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div className="flex items-center gap-2 mb-2 px-1 opacity-40 select-none">
                {msg.role === 'user' ? (
                  <>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-right">Researcher</span>
                    <User size={12} />
                  </>
                ) : (
                  <>
                    <Shield size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Orchestrator</span>
                  </>
                )}
              </div>
              
              <div 
                className={`relative px-6 py-4 rounded-2xl border transition-all shadow-sm max-w-[85%] ${
                  msg.role === 'user' 
                    ? 'bg-accent text-white border-accent shadow-accent/10 rounded-tr-none' 
                    : 'bg-card border-border rounded-tl-none'
                }`}
              >
                <div className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-primary/90'} space-y-4 markdown-content`}>
                  <ReactMarkdown>
                    {msg.content || ""}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          
          {/* Thinking / Status Indicator */}
          {isLoading && (
            <div className="flex flex-col items-start mb-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 mb-2 px-1 opacity-40 select-none">
                <Shield size={12} className="animate-spin duration-3000" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Orchestrator thinking...</span>
              </div>
              <div className="bg-card border border-border px-6 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-4">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest opacity-40 italic">
                  {status || 'Orchestrating...'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ChatInterface;
