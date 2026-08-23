import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

function formatPrimitive(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}

function valueClass(value) {
  if (value === null || value === undefined) return 'text-secondary/50 italic';
  if (typeof value === 'string') return 'text-emerald-400';
  if (typeof value === 'number') return 'text-sky-400';
  if (typeof value === 'boolean') return 'text-amber-400';
  return 'text-primary';
}

/**
 * One node of the tree. Objects and arrays start collapsed one level below
 * the root — the top-level fields of a record are worth seeing at a glance,
 * but a `persons` array of five people each with ten fields is not.
 */
function JsonNode({ label, value, depth }) {
  const isObject = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < 1);

  if (!isObject) {
    return (
      <div className="flex gap-1.5 py-0.5 text-[11px] font-mono leading-relaxed">
        {label !== null && <span className="text-accent/80 shrink-0">{label}:</span>}
        <span className={`break-all ${valueClass(value)}`}>{formatPrimitive(value)}</span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
  const count = entries.length;

  return (
    <div className="text-[11px] font-mono leading-relaxed">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-secondary hover:text-accent transition-colors cursor-pointer"
      >
        {open ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />}
        {label !== null && <span className="text-accent/80">{label}:</span>}
        <span className="text-secondary/70">
          {isArray ? `Array(${count})` : count === 0 ? '{}' : 'Object'}
          {!open && count > 0 && ' {…}'}
        </span>
      </button>
      {open && count > 0 && (
        <div className="pl-3.5 border-l border-border/40 ml-[5px]">
          {entries.map(([k, v]) => (
            <JsonNode key={k} label={String(k)} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function JsonTree({ data }) {
  return (
    <div className="p-2.5 rounded bg-muted/60 border border-border/60 max-h-96 overflow-auto">
      <JsonNode label={null} value={data} depth={0} />
    </div>
  );
}
