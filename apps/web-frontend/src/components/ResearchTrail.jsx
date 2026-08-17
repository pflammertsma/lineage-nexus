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

      {/* Rows wrap rather than compress: at phone widths the result column's
          `ml-auto` used to squeeze the query into a one-character-per-line
          ribbon. Below `sm` the result drops onto its own line instead, and
          queries break at spaces (`break-words`) rather than mid-word. */}
      {open && (
        <ol className="mt-2 border-l border-border pl-3 sm:pl-4 space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-relaxed">
              <span className="shrink-0 self-start mt-1">
                {step.ok === false ? (
                  <AlertCircle size={11} className="text-amber-500" />
                ) : (
                  <Check size={11} className="text-green-600/70" />
                )}
              </span>
              <span className="text-secondary shrink-0">{step.label || step.tool}</span>
              {step.detail && (
                <span className="text-primary/90 font-mono text-[11px] break-words min-w-0">
                  {step.detail}
                </span>
              )}
              {step.result && (
                <span className="text-secondary/60 basis-full sm:basis-auto sm:ml-auto pl-5 sm:pl-2 sm:text-right">
                  {step.result}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default ResearchTrail;
