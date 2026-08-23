import React from 'react';

/**
 * Renders the family relationships in one record as a small diagram.
 *
 * The shape depends on what kind of record it is — a birth has two parents
 * above a child, a marriage has each side's parents above that side's
 * partner — so this picks a layout from which roles are actually present
 * rather than from `kind`, since the same layouts recur across bsg/dtb_d,
 * bsh/dtb_t etc. Anything the chosen layout doesn't have a slot for (a
 * witness, a role this file has never seen) is still shown, just below the
 * diagram rather than dropped.
 */

const ROLE_LABELS = {
  child: 'Child', father: 'Father', mother: 'Mother',
  groom: 'Groom', bride: 'Bride',
  groom_father: "Groom's Father", groom_mother: "Groom's Mother",
  bride_father: "Bride's Father", bride_mother: "Bride's Mother",
  deceased: 'Deceased', registered: 'Registered', witness: 'Witness',
  seller: 'Seller', buyer: 'Buyer', partner: 'Partner', other: 'Other',
};

function labelFor(person) {
  return person.r || ROLE_LABELS[person.role] || person.role || '';
}

function subInfo(person) {
  const parts = [];
  if (person.bir_year) parts.push(`b. ${person.bir_year}`);
  else if (person.age != null && person.age !== '') parts.push(`age ${person.age}`);
  if (person.bir_place) parts.push(person.bir_place);
  return parts.join(' · ');
}

function PersonBox({ person, emphasize }) {
  if (!person) return null;
  const sub = subInfo(person);
  return (
    <div
      className={`px-3 py-2 rounded-lg border text-center min-w-[110px] max-w-[160px] ${emphasize
          ? 'bg-accent/15 border-accent/50 shadow-xs'
          : 'bg-card border-border'
        }`}
    >
      <div className="text-[9px] uppercase tracking-wide text-secondary font-bold mb-0.5">
        {labelFor(person)}
      </div>
      <div className="text-xs font-semibold text-primary leading-snug break-words">{person.n}</div>
      {sub && <div className="text-[10px] text-secondary mt-0.5">{sub}</div>}
    </div>
  );
}

// Gap between a box and the line it connects to — enough that the line
// visibly starts and ends in empty space rather than touching a border.
const STUB = 8;

/**
 * Connects a two-person parent row to whatever sits below it.
 *
 * Both parent cells and this connector live in the same CSS grid, in equal
 * `1fr` columns — that's what makes "under father" and "under mother" exact
 * fractions (25% / 75%) regardless of how wide either name actually renders,
 * rather than hoping two independently-centered flex blocks land on the same
 * point. With only one parent the horizontal bar has nothing to span between,
 * so this drops straight down from whichever side that parent occupies.
 *
 * Each box gets its own short stub down to the bar, rather than the bar
 * sitting flush against both boxes' bottom edges — a line that touches the
 * border it's connecting reads as glued-on, not connected.
 */
function ParentElbow({ hasFather, hasMother, gridColumn }) {
  if (!hasFather && !hasMother) return null;
  const both = hasFather && hasMother;
  return (
    // gridColumn is explicit, not left to auto-flow: when the *other* side
    // has no parents its elbow renders nothing at all (no DOM node to fill a
    // slot), and auto-placement would otherwise slide this one in to fill the
    // gap instead of sitting under its own parents.
    <div
      className={gridColumn ? 'relative' : 'col-span-2 relative'}
      style={{ height: STUB * 3, ...(gridColumn ? { gridColumn } : null) }}
    >
      {both && (
        <>
          <div className="absolute top-0 border-l-2 border-border-strong" style={{ left: '25%', height: STUB }} />
          <div className="absolute top-0 border-l-2 border-border-strong" style={{ left: '75%', height: STUB }} />
          <div className="absolute left-1/4 right-1/4 border-t-2 border-border-strong" style={{ top: STUB }} />
        </>
      )}
      <div
        className="absolute bottom-0 border-l-2 border-border-strong"
        style={{ left: both ? '50%' : hasFather ? '25%' : '75%', top: both ? STUB : 0 }}
      />
    </div>
  );
}

/** A short horizontal tie between two people shown side by side — spouses, partners. */
function SideLink() {
  return <div className="w-5 border-t-2 border-border-strong shrink-0 self-center" />;
}

/** The single-column case: one line straight down from parent to child. */
function VLine({ height = 16 }) {
  return <div className="border-l-2 border-border-strong" style={{ height }} />;
}

/**
 * Parents-then-principal, in a 2-column grid so the elbow above always lines
 * up with the boxes regardless of name length. Falls back to a single
 * straight line when only one parent is known, and to nothing at all — just
 * the principal — when neither is.
 */
function ParentChildBlock({ father, mother, children }) {
  if (!father && !mother) {
    return <div className="flex flex-col items-center">{children}</div>;
  }
  return (
    <div className="grid gap-x-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="justify-self-center"><PersonBox person={father} /></div>
      <div className="justify-self-center"><PersonBox person={mother} /></div>
      <ParentElbow hasFather={Boolean(father)} hasMother={Boolean(mother)} />
      <div className="col-span-2 flex flex-col items-center">{children}</div>
    </div>
  );
}

function LeftoverBadges({ persons }) {
  if (persons.length === 0) return null;
  return (
    <div className="mt-4 pt-3 border-t border-border/40 w-full">
      <div className="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1.5 text-center">
        Also recorded
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {persons.map((p, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded-md text-[11px] bg-muted/60 border border-border/60 text-primary/80"
          >
            {p.n} <span className="text-[10px] opacity-70 font-mono">({labelFor(p)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function groupByRole(persons) {
  const map = {};
  for (const p of persons) {
    (map[p.role] ||= []).push(p);
  }
  return map;
}

// Each of these is a plain function, not a component — it must run to
// completion *before* RelationshipDiagram decides what's left over, and a
// JSX tag like `<BirthLayout/>` only defers the body until React reconciles
// it, well after that decision has already been made from an empty set.
// Returning `placedPersons` as the actual object references (rather than
// role names) also means a second person who happens to share a placed
// role — an extra "father" a messy record occasionally carries — still
// surfaces below instead of silently vanishing alongside the one shown.

function birthLayout(map) {
  const father = map.father?.[0];
  const mother = map.mother?.[0];
  const child = map.child?.[0];
  const element = (
    <ParentChildBlock father={father} mother={mother}>
      <PersonBox person={child} emphasize />
    </ParentChildBlock>
  );
  return { element, placedPersons: [father, mother, child].filter(Boolean) };
}

function deathLayout(map) {
  const father = map.father?.[0];
  const mother = map.mother?.[0];
  const deceased = map.deceased?.[0];
  const partner = map.partner?.[0];
  const element = (
    <ParentChildBlock father={father} mother={mother}>
      <div className="flex items-center">
        <PersonBox person={deceased} emphasize />
        {partner && (
          <>
            <SideLink />
            <PersonBox person={partner} />
          </>
        )}
      </div>
    </ParentChildBlock>
  );
  return { element, placedPersons: [father, mother, deceased, partner].filter(Boolean) };
}

function populationLayout(map) {
  const father = map.father?.[0];
  const mother = map.mother?.[0];
  const registered = map.registered?.[0];
  const partner = map.partner?.[0];
  const children = map.child || [];
  const element = (
    <ParentChildBlock father={father} mother={mother}>
      <div className="flex items-center">
        {partner && (
          <>
            <PersonBox person={partner} />
            <SideLink />
          </>
        )}
        <PersonBox person={registered} emphasize />
      </div>
      {children.length > 0 && (
        <>
          <VLine height={12} />
          <div className="flex flex-wrap gap-3 justify-center">
            {children.map((c, i) => <PersonBox key={i} person={c} />)}
          </div>
        </>
      )}
    </ParentChildBlock>
  );
  return { element, placedPersons: [father, mother, registered, partner, ...children].filter(Boolean) };
}

/**
 * Bride's parents above bride, groom's parents above groom, both sides in one
 * 4-column grid (bride-father / bride-mother / groom-father / groom-mother) so
 * each side's elbow spans exactly its own two columns.
 *
 * Bride and groom are centered *within their own half* (25% / 75% of the
 * whole), not centered as a joint pair — a pair centered as a unit drifts
 * away from whichever side has a wider elbow above it, so the stem no longer
 * lands on the box it's meant to connect to. Splitting the row into two
 * `flex-1` halves keeps each spouse under their own parents by construction,
 * the same way `ParentElbow` keeps father and mother at fixed fractions
 * regardless of name length. The spousal line reuses that same 25%–75% span,
 * so it always reaches both box centers exactly, whatever their widths are.
 */
function marriageLayout(map) {
  const bride = map.bride?.[0];
  const groom = map.groom?.[0];
  const brideFather = map.bride_father?.[0];
  const brideMother = map.bride_mother?.[0];
  const groomFather = map.groom_father?.[0];
  const groomMother = map.groom_mother?.[0];

  const element = (
    <div className="grid gap-x-3 w-full max-w-2xl" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
      <div className="justify-self-center"><PersonBox person={brideFather} /></div>
      <div className="justify-self-center"><PersonBox person={brideMother} /></div>
      <div className="justify-self-center"><PersonBox person={groomFather} /></div>
      <div className="justify-self-center"><PersonBox person={groomMother} /></div>

      <ParentElbow hasFather={Boolean(brideFather)} hasMother={Boolean(brideMother)} gridColumn="1 / 3" />
      <ParentElbow hasFather={Boolean(groomFather)} hasMother={Boolean(groomMother)} gridColumn="3 / 5" />

      <div className="relative flex items-center pt-2" style={{ gridColumn: '1 / -1' }}>
        <div className="absolute left-1/4 right-1/4 top-1/2 border-t-2 border-border-strong -z-10" />
        <div className="flex-1 flex justify-center"><PersonBox person={bride} emphasize /></div>
        <div className="flex-1 flex justify-center"><PersonBox person={groom} emphasize /></div>
      </div>
    </div>
  );
  return {
    element,
    placedPersons: [bride, groom, brideFather, brideMother, groomFather, groomMother].filter(Boolean),
  };
}

function GenericLayout({ persons }) {
  const map = groupByRole(persons);
  const order = Object.keys(map).sort();
  return (
    <div className="w-full">
      <p className="text-[11px] text-secondary italic text-center mb-3">
        This record's roles don't fit a standard family diagram — showing everyone by role instead.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        {order.map((role) => (
          <div key={role} className="flex flex-col items-center gap-1.5">
            <div className="text-[9px] uppercase tracking-wide text-secondary font-bold">
              {ROLE_LABELS[role] || role}
            </div>
            <div className="flex flex-col gap-1.5">
              {map[role].map((p, i) => <PersonBox key={i} person={p} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RelationshipDiagram({ hit }) {
  const raw = hit.raw || hit;
  const persons = raw.persons || hit.persons || [];

  if (persons.length === 0) {
    return <p className="text-xs text-secondary italic py-8 text-center">No person data to diagram.</p>;
  }

  const map = groupByRole(persons);

  let result = null;
  if (map.bride || map.groom) result = marriageLayout(map);
  else if (map.child && !map.registered) result = birthLayout(map);
  else if (map.deceased) result = deathLayout(map);
  else if (map.registered) result = populationLayout(map);

  if (!result) {
    return <GenericLayout persons={persons} />;
  }

  const { element, placedPersons } = result;
  return (
    <div className="flex flex-col items-center py-2">
      {element}
      <LeftoverBadges persons={persons.filter((p) => !placedPersons.includes(p))} />
    </div>
  );
}
