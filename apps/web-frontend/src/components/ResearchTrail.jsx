import React, { useState } from 'react';
import { ChevronRight, Check, AlertCircle } from 'lucide-react';

/**
 * The tool calls the agent made to produce a reply — which WikiTree profiles it read, which
 * archive queries it ran. Collapsed by default: it is provenance, not the answer, and the
 * biography should stay the focus of the message.
 */
const ResearchTrail = ({ steps }) => {
  const [open, setOpen] = useState(false);

  if (!Array.isArray(steps) || steps.length === 0) return null;

  const failures = steps.filter((s) => s && s.ok === false).length;
  const label = `${steps.length} research ${steps.length === 1 ? 'step' : 'steps'}`;

  return (
    <div className="mt-3 mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-secondary/60 hover:text-accent transition-colors cursor-pointer focus:outline-none"
      >
        <ChevronRight
          size={12}
          className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
        <span>{label}</span>
        {failures > 0 && (
          <span className="text-amber-500 normal-case tracking-normal font-normal">
            · {failures} without results
          </span>
        )}
      </button>

      {open && (
        <ol className="mt-2 border-l border-border pl-4 space-y-1.5">
          {steps.map((step, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs leading-relaxed">
              <span className="shrink-0 mt-0.5">
                {step.ok === false ? (
                  <AlertCircle size={11} className="text-amber-500" />
                ) : (
                  <Check size={11} className="text-green-600/70" />
                )}
              </span>
              <span className="text-secondary shrink-0">{step.label || step.tool}</span>
              {step.detail && (
                <span className="text-primary/90 font-mono text-[11px] break-all">
                  {step.detail}
                </span>
              )}
              {step.result && (
                <span className="text-secondary/60 shrink-0 ml-auto pl-2">{step.result}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default ResearchTrail;
