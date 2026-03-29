import React from 'react';
import { User, Network, Check, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const [copied, setCopied] = React.useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const isWikitext = language === 'wiki' || language === 'wikitext';

  // Render block code (triple backticks with language or explicitly not inline)
  if (!inline && (match || String(children).includes('\n'))) {
    const textToCopy = String(children).replace(/\n$/, '');
    return (
      <div className="relative group rounded-xl border border-border/50 bg-card overflow-hidden my-6 shadow-sm">
        {language && (
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border/50">
            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary/60">
              {isWikitext ? 'Wikitext' : language}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(textToCopy);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-secondary/40 hover:text-accent transition-colors focus:outline-none"
              title="Copy code"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-green-500" />
                  <span className="text-green-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        )}
        <div className="p-4 overflow-x-auto">
          <pre className="text-xs font-mono text-primary/80 leading-relaxed whitespace-pre-wrap">
            <code className={className} {...props}>
              {children}
            </code>
          </pre>
        </div>
      </div>
    );
  }

  // Render inline code (single backticks)
  const isInline = inline || !String(children).includes('\n');
  
  return (
    <code 
      className={`bg-primary/5 text-primary/90 px-1.5 py-0.5 rounded-md text-[0.85em] font-mono border border-primary/10 mx-0.5 ${isInline ? '' : 'block p-4 my-4'}`} 
      {...props}
    >
      {children}
    </code>
  );
};

const ChatInterface = ({ messages, isLoading, status }) => {
  if (messages.length === 0) return null;

  return (
    <section className="bg-surface section-divider">
      <div className="container" style={{ maxWidth: '800px' }}>
        <div className="flex flex-col gap-8">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div className="flex items-center gap-2 mb-2 px-1 opacity-40 select-none">
                {msg.role !== 'user' && (
                  <>
                    <Network size={12} />
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
                  <ReactMarkdown
                    components={{
                      code: CodeBlock,
                      h1: ({node, ...props}) => <h1 className="text-lg font-bold text-primary mb-4 mt-8" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-base font-bold text-primary mb-3 mt-6" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-sm font-bold text-primary mb-2 mt-4" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-primary/90" {...props} />,
                      a: ({node, ...props}) => (
                        <a 
                          className="text-accent underline underline-offset-4 hover:opacity-80 transition-opacity" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          {...props} 
                        />
                      ),
                      ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-2 my-4" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-2 my-4" {...props} />,
                      li: ({node, ...props}) => <li className="pl-1" {...props} />,
                    }}
                  >
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
