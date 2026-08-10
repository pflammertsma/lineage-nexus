import React, { useState } from 'react';
import { User, Network, Check, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const content = String(children).replace(/\n$/, '');
  
  if (!inline && (match || content.includes('\n'))) {
    const language = match ? match[1] : '';
    return (
      <div className="relative group/code rounded-xl border border-border/50 bg-card overflow-hidden my-6 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/50">
          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary/60">
            {language || 'Code'}
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(content);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-secondary/40 hover:text-accent transition-colors focus:outline-none"
          >
            {copied ? (
              <>
                <Check size={12} className="text-green-500" />
                <span className="text-green-500">Copied</span>
              </>
            ) : (
              <>
                <Copy size={12} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="p-5 font-mono text-xs overflow-x-auto leading-relaxed">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  }

  return (
    <code className="bg-accent/10 text-accent px-1.5 py-0.5 rounded font-mono text-[0.9em] border border-accent/20" {...props}>
      {children}
    </code>
  );
};

const ChatInterface = ({ messages, isLoading, status, onRetry }) => {
  const [copiedIdx, setCopiedIdx] = useState(null);

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  if (messages.length === 0) return null;

  return (
    <section className="bg-surface section-divider">
      <div className="container" style={{ maxWidth: '800px' }}>
        <div className="flex flex-col gap-8">
          {messages.map((msg, idx) => {
            if (msg.role === 'error') {
              return (
                <div key={idx} className="flex flex-col items-center justify-center p-8 bg-red-500/5 border border-red-500/20 rounded-2xl animate-in fade-in slide-in-from-bottom-2">
                  <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
                    <span className="text-red-400 font-bold text-xl">!</span>
                  </div>
                  <h3 className="text-rose-200/90 text-[10px] font-bold uppercase tracking-[0.2em] mb-3">Research Interrupted</h3>
                  <div className="text-rose-100/80 text-sm text-center max-w-[550px] mb-6 leading-relaxed markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  {msg.retry && (
                    <button
                      onClick={() => {
                        const lastUser = [...messages].reverse().find(m => m.role === 'user');
                        if (lastUser && onRetry) onRetry(lastUser.content);
                      }}
                      className="btn btn-primary bg-red-600 hover:bg-red-700 h-10 px-8 text-xs font-bold uppercase tracking-widest shadow-lg shadow-red-900/10 cursor-pointer"
                    >
                      Retry Search
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div
                key={idx}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300 group`}
              >
                <div className="w-full flex items-center justify-between mb-2 px-1 opacity-40 select-none">
                  <div className="flex items-center gap-2">
                    {msg.role !== 'user' && (
                      <>
                        <Network size={12} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Lineage Nexus</span>
                      </>
                    )}
                  </div>
                  
                  {msg.role !== 'user' && (
                    <button 
                      onClick={() => handleCopy(msg.content, idx)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 hover:text-accent"
                    >
                      {copiedIdx === idx ? <Check size={10} /> : <Copy size={10} />}
                      <span className="text-[9px] font-bold uppercase tracking-tighter">
                        {copiedIdx === idx ? 'Copied' : 'Copy'}
                      </span>
                    </button>
                  )}
                </div>

                <div
                  className={`relative transition-all ${msg.role === 'user'
                    ? 'bg-accent text-white px-6 py-4 rounded-2xl shadow-sm border-accent shadow-accent/10 rounded-tr-none ml-auto max-w-[85%]'
                    : 'w-full pt-2'
                    }`}
                >
                  <div className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-primary/95'} space-y-4 markdown-content`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code: CodeBlock,
                        table: ({ node, ...props }) => (
                          <div className="overflow-x-auto my-6 border border-border rounded-xl">
                            <table className="w-full text-left border-collapse" {...props} />
                          </div>
                        ),
                        thead: ({ node, ...props }) => <thead className="bg-card border-b border-border" {...props} />,
                        th: ({ node, ...props }) => <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-secondary/60" {...props} />,
                        td: ({ node, ...props }) => <td className="px-4 py-3 border-b border-border/50 text-xs" {...props} />,
                        h1: ({ node, ...props }) => <h1 className="text-lg font-bold text-primary mb-4 mt-8" {...props} />,
                        h2: ({ node, ...props }) => <h2 className="text-base font-bold text-primary mb-3 mt-6" {...props} />,
                        h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-primary mb-2 mt-4" {...props} />,
                        strong: ({ node, ...props }) => <strong className="font-bold text-primary/90" {...props} />,
                        a: ({ node, ...props }) => (
                          <a
                            className={`${msg.role === 'user' ? 'text-white underline font-bold' : 'text-accent'} underline underline-offset-4 hover:opacity-80 transition-opacity`}
                            target="_blank"
                            rel="noopener noreferrer"
                            {...props}
                          />
                        ),
                        ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-2 my-4" {...props} />,
                        ol: ({ node, ...props }) => <ol className="list-decimal pl-5 space-y-2 my-4" {...props} />,
                        li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                      }}
                    >
                      {msg.content || ""}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex flex-col items-start mb-8 animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-card border border-border px-6 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-4">
                <div className="flex gap-1.5 h-4 items-center">
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-secondary/60">
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
