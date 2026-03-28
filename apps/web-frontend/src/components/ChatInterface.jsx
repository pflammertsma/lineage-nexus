import React from 'react';

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
              className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className={`text-xs uppercase tracking-widest opacity-40 font-bold`}>
                {msg.role === 'user' ? 'Researcher' : 'Orchestrator'}
              </div>
              <div 
                className={`card ${msg.role === 'user' ? 'bg-accent-soft border-accent' : 'bg-card'}`}
                style={{ maxWidth: '100%', width: 'auto' }}
              >
                <div 
                  className="prose text-sm leading-relaxed whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }}
                />
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex items-center gap-4 opacity-40">
              <div className="animate-pulse w-2 h-2 rounded-full bg-accent-primary"></div>
              <div className="animate-pulse w-2 h-2 rounded-full bg-accent-primary" style={{ animationDelay: '0.2s' }}></div>
              <div className="animate-pulse w-2 h-2 rounded-full bg-accent-primary" style={{ animationDelay: '0.4s' }}></div>
              <span className="text-xs font-bold uppercase tracking-widest">Orchestrating tools...</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default ChatInterface;
