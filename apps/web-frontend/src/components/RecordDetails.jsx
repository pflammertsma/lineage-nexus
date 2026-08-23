import React from 'react';
import { ExternalLink } from 'lucide-react';
import { getKindLabel } from '../config';

function Field({ label, value, mono }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-secondary/70">{label}</div>
      <div className={`text-primary ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</div>
    </div>
  );
}

function personSummary(person) {
  const parts = [];
  if (person.bir_year) parts.push(`b. ${person.bir_year}`);
  else if (person.age != null && person.age !== '') parts.push(`age ${person.age}`);
  if (person.bir_place) parts.push(person.bir_place);
  return parts.join(' · ');
}

/** Everything known about one record and where it came from. */
export default function RecordDetails({ hit }) {
  const raw = hit.raw || hit;
  const persons = raw.persons || hit.persons || [];
  const institution = hit.source?.institution || raw.institution;

  return (
    <div className="text-xs space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        <Field label="Event" value={raw.event_type || hit.event_type} />
        <Field label="Date" value={raw.event_date || hit.event_date} />
        <Field label="Place" value={raw.event_place || hit.event_place} />
        <Field
          label="Archive"
          value={institution ? `${hit.source?.archive} — ${institution}` : hit.source?.archive}
        />
        <Field label="Record type" value={getKindLabel(hit.source?.kind || raw.kind)} />
        <Field label="Last changed at source" value={hit.source?.last_changed || raw.last_changed} />
        <Field label="Record ID" value={raw.guid || raw.id} mono />
      </div>

      {hit.url && (
        <a
          href={hit.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-accent hover:underline font-medium"
        >
          <ExternalLink size={12} /> View original at Open Archieven
        </a>
      )}

      {persons.length > 0 && (
        <div className="pt-2 border-t border-border/40">
          <div className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5">
            People in this record
          </div>
          <div className="space-y-1">
            {persons.map((p, i) => {
              const summary = personSummary(p);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded bg-muted/40 border border-border/40"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-primary">{p.n}</span>
                    {p.r && <span className="ml-1.5 text-[10px] text-secondary font-mono">({p.r})</span>}
                  </div>
                  {summary && <div className="text-[10px] text-secondary text-right shrink-0">{summary}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
