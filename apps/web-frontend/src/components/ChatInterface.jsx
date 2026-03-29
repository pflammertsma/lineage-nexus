import React from 'react';
import { User, Shield } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const ChatInterface = ({ messages, isLoading }) => {
  if (messages.length === 0) return null;

  return (
    <section className="py-4 bg-surface section-divider">
      <div className="container" style={{ maxWidth: '800px' }}>
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
                    <span className="text-[10px] font-bold uppercase tracking-widest">Lineage Nexus</span>
                  </>
                )}
              </div>

              <div
                className={`relative transition-all ${msg.role === 'user'
                    ? 'bg-accent text-white px-6 py-4 rounded-2xl shadow-sm border-accent shadow-accent/10 rounded-tr-none ml-auto max-w-[85%]'
                    : 'w-full pt-2'
                  }`}
              >
                <div className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-primary/95'} space-y-4 markdown-content`}>
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
              <div className="bg-card border border-border px-6 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-4">
                <div className="flex gap-1.5 h-4 items-center">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary/60 italic">
                  {status || 'Connecting to archives...'}
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
