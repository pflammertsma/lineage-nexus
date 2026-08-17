// Lineage Nexus WikiTree Assistant Content Script

(function () {
  'use strict';

  const getLogoHtml = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const logoUrl = chrome.runtime.getURL('assets/logo.svg');
      return `<img src="${logoUrl}" class="nexus-logo-img" alt="Lineage Nexus" />`;
    }
    return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" class="nexus-logo-img"><circle cx="256" cy="256" r="256" fill="#134074"/><path d="m 298.43277,147.90002 -12.71309,12.22015 c -17.06155,17.72993 -35.58839,38.84812 -45.61421,51.60053 -1.85579,2.3605 -6.38482,8.86713 -6.58758,8.6642 -0.34408,-0.3443 -11.12534,-27.52931 -15.03256,-32.26532 -2.39817,-2.90687 1.9414,-3.83472 -2.83816,-1.32784 -4.16183,2.23375 -6.92672,0.89349 -11.35886,2.48371 0,0 4.93356,8.7241 7.21774,18.17653 2.28417,9.45244 8.01544,32.28823 8.01544,32.28823 l -4.71094,8.05666 c -9.9269,16.97565 -21.57053,41.58175 -30.92578,65.35352 -5.02866,12.77787 -17.91993,50.51796 -17.91993,52.46288 0,0.54987 -0.26281,1.1634 -0.58593,1.3633 -0.32314,0.1999 -4.69808,-1.93104 -9.72071,-4.73439 -5.02263,-2.80331 -13.92057,-6.94892 -14.06819,-6.7721 -3.94971,4.73087 -6.91051,7.78706 -14.39731,9.18032 -0.21824,0.0406 16.49921,9.49291 22.62957,13.15626 l 11.14648,6.66014 -1.93359,8.86913 c -4.80905,22.06188 -10.17124,63.90037 -13.8711,93.42775 25.95399,12.46527 53.82486,20.46291 82.43945,23.65626 0.39039,-13.91235 -4.87723,-39.74242 -6.34374,-58.8086 -2.4699,-32.11141 -2.40327,-43.95902 0.32226,-57.1836 3.3937,-16.4665 12.67675,-34.93384 23.12891,-46.0137 13.69525,-14.51763 35.50472,-27.24701 62.98437,-36.75976 6.75445,-2.33821 17.99379,-3.85007 17.71931,-4.56563 -5.52202,-2.69673 -12.41705,-4.31604 -8.50818,-17.83144 l -8.59972,0.68811 c -27.80197,2.58658 -48.06116,7.7229 -66.5371,16.86915 -4.74056,2.34671 -8.85027,4.37401 -9.13281,4.50583 -0.70325,0.32825 5.0185,-15.99333 9.40234,-26.81834 14.89026,-36.76857 36.32733,-76.87489 63.60054,-115.65719 l 4.99024,-6.49133 c -3.37061,-10.22203 -7.93932,-12.49489 -12.19716,-14.45342 z" fill="#4a90e2"/><path d="m 327.81597,76.15967 8.30782,20.47245 c 3.47313,8.56169 10.26363,15.35219 18.82532,18.82532 l 20.47245,8.30782 c 3.78469,1.53754 3.78469,6.89724 0,8.43188 l -20.47245,8.30783 c -8.56169,3.47314 -15.35219,10.26363 -18.82532,18.82531 l -8.30782,20.47247 c -1.53754,3.78467 -6.89724,3.78467 -8.43188,0 l -8.30783,-20.47247 c -3.47314,-8.56168 -10.26363,-15.35217 -18.82531,-18.82531 l -20.47247,-8.30783 c -3.78467,-1.53752 -3.78467,-6.89723 0,-8.43188 l 20.47247,-8.30782 c 8.56168,-3.47313 15.35217,-10.26363 18.82531,-18.82532 l 8.30783,-20.47245 c 1.53464,-3.78469 6.89434,-3.78469 8.43188,0 z" fill="#c8a464" stroke="#134074" stroke-width="16"/></svg>`;
  };

  const formatDateToISO = (str) => {
    if (!str) return str;
    let s = str.trim().replace(/^(on|in)\s+/i, '');
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return s;
    
    const isBefore = /\bbefore\b|\bbef\b/i.test(s);
    const isAfter = /\bafter\b|\baft\b/i.test(s);
    const isEstimate = /\babout\b|\babt\b|\best\b|\bestimated\b|\bcirca\b/i.test(s);

    const clean = s.replace(/^(before|bef|after|aft|about|abt|est|estimated|circa|c\.|on|in)\s+/i, '').trim();

    const months = {
      january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04',
      may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08',
      sep: '09', september: '09', oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
      jan: '01', februari: '02', maart: '03', mei: '05', juni: '06', juli: '07', augustus: '08', oktober: '10'
    };

    const m1 = clean.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m1 && months[m1[1].toLowerCase()]) {
      const mm = months[m1[1].toLowerCase()];
      const dd = m1[2].padStart(2, '0');
      const iso = `${m1[3]}-${mm}-${dd}`;
      return isBefore ? `before ${iso}` : isAfter ? `after ${iso}` : isEstimate ? `about ${iso}` : iso;
    }

    const m2 = clean.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m2 && months[m2[2].toLowerCase()]) {
      const mm = months[m2[2].toLowerCase()];
      const dd = m2[1].padStart(2, '0');
      const iso = `${m2[3]}-${mm}-${dd}`;
      return isBefore ? `before ${iso}` : isAfter ? `after ${iso}` : isEstimate ? `about ${iso}` : iso;
    }

    const m3 = clean.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (m3 && months[m3[1].toLowerCase()]) {
      const mm = months[m3[1].toLowerCase()];
      const iso = `${m3[2]}-${mm}`;
      return isBefore ? `before ${iso}` : isAfter ? `after ${iso}` : isEstimate ? `about ${iso}` : iso;
    }

    // Unrecognised shape (e.g. a bare year, or an already-padded YYYY-00-00). Re-apply the
    // qualifier that was stripped above, otherwise "about 1910" degrades to a date asserted
    // as certain and setDateRadioStatus picks the wrong radio.
    return isBefore ? `before ${clean}` : isAfter ? `after ${clean}` : isEstimate ? `about ${clean}` : clean;
  };

  // The LINEAGE_NEXUS_DATA comment is written by a language model, so treat it as untrusted
  // input rather than a guaranteed contract. Without this, a stray "unknown" or "N/A" is typed
  // straight into a WikiTree field, and a free-text date bypasses normalisation entirely
  // (formatDateToISO is otherwise only applied on the regex fallback path).
  const PLACEHOLDER_VALUES = new Set([
    'unknown', 'n/a', 'na', 'none', 'null', 'undefined', '?', '-', '', 'not known', 'not recorded'
  ]);
  const DATE_FIELDS = ['birthDate', 'deathDate', 'marriageDate', 'marriageEndDate'];

  const sanitizeVitals = (vitals) => {
    if (!vitals || typeof vitals !== 'object') return {};
    const out = {};

    for (const [key, value] of Object.entries(vitals)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'boolean' || typeof value === 'number') {
        out[key] = value;
        continue;
      }
      if (typeof value !== 'string') continue;

      const trimmed = value.trim();
      // Drop placeholders so downstream truthiness checks correctly treat them as absent.
      if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) continue;
      out[key] = trimmed;
    }

    // Marriages arrive as an array so multiple marriages survive the round trip. Normalise
    // each entry, then project the first onto the flat fields the form filler uses, since
    // WikiTree's edit form only takes one spouse at a time.
    const hasMarriagesKey = Array.isArray(vitals.marriages);
    const marriages = hasMarriagesKey ? vitals.marriages : [];
    // `out.marriages` ends up [] either way, so record whether that emptiness was asserted
    // by the agent or merely absent from an older payload. Ticking "No spouses" on the
    // strength of a missing key would state something the research never claimed.
    out.marriagesKnown = hasMarriagesKey;
    out.marriages = marriages
      .filter(m => m && typeof m === 'object')
      .map(m => ({
        spouseName: typeof m.spouseName === 'string' ? m.spouseName.trim() : '',
        // Needed by inferRelationship to spot "this profile is the spouse".
        spouseWikiTreeId: typeof m.spouseWikiTreeId === 'string' ? m.spouseWikiTreeId.trim() : '',
        date: m.date ? formatDateToISO(String(m.date).trim()) : '',
        location: typeof m.location === 'string' ? m.location.trim() : '',
        endDate: m.endDate ? formatDateToISO(String(m.endDate).trim()) : '',
        endReason: typeof m.endReason === 'string' ? m.endReason.trim() : '',
      }))
      .filter(m => m.spouseName || m.date || m.location || m.spouseWikiTreeId);

    if (out.marriages.length > 0) {
      const first = out.marriages[0];
      if (first.spouseName) out.spouseName = first.spouseName;
      if (first.date) out.marriageDate = first.date;
      if (first.location) out.marriageLocation = first.location;
      if (first.endDate) out.marriageEndDate = first.endDate;
    } else if (hasMarriagesKey) {
      // An explicitly empty array asserts the subject never married, so clear any flat fields.
      // A payload with no `marriages` key at all is simply the older schema — leave it alone.
      delete out.spouseName;
      delete out.marriageDate;
      delete out.marriageLocation;
      delete out.marriageEndDate;
    }

    // Normalise dates the model may have written in prose form ("September 9, 1880").
    // formatDateToISO preserves about/before/after, which setDateRadioStatus needs.
    for (const field of DATE_FIELDS) {
      if (out[field]) out[field] = formatDateToISO(out[field]);
    }

    // WikiTree only accepts these two; anything else would fail to match a gender control.
    if (out.gender && !/^(male|female)$/i.test(out.gender)) {
      delete out.gender;
    } else if (out.gender) {
      out.gender = out.gender[0].toUpperCase() + out.gender.slice(1).toLowerCase();
    }

    return out;
  };

  // --- Contextual relationship detection -----------------------------------
  // The metadata carries the subject's own WikiTree ID plus those of their parents and
  // spouses. Comparing them against the profile currently open in the browser tells us what
  // the user is actually trying to do: attach a newly researched child to this parent, add a
  // spouse, or update this very profile.
  const WIKITREE_ID_RE = /^[A-Za-z][A-Za-z0-9_'’.-]*-\d+$/;

  const getCurrentProfileId = () => {
    const m = (location.pathname || '').match(/^\/wiki\/([^/?#]+)/);
    if (!m) return null;
    let id;
    try { id = decodeURIComponent(m[1]); } catch (e) { id = m[1]; }
    return WIKITREE_ID_RE.test(id) ? id : null;
  };

  const getCurrentProfileName = () => {
    const heading = document.querySelector('h1');
    const text = heading && heading.textContent ? heading.textContent.trim().replace(/\s+/g, ' ') : '';
    return text || null;
  };

  const fullNameOf = (v) =>
    [v && v.firstName, v && v.middleName, v && v.lastNameAtBirth].filter(Boolean).join(' ').trim();

  /**
   * Works out how the staged person relates to the open profile.
   * Returns null when there is nothing sensible to offer.
   */
  // Lowercase, strip accents and punctuation so "van Wattum" and "Van_Wattum" compare equal.
  const normaliseName = (value) =>
    String(value || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[()[\].,'’`"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // A WikiTree ID carries the last name at birth: "Van_Wattum-7" -> "van wattum".
  const lnabFromProfileId = (id) =>
    normaliseName(String(id || '').replace(/-\d+$/, '').replace(/_/g, ' '));

  /**
   * True when the staged person appears to BE the profile on screen.
   *
   * The agent usually has no WikiTree ID for somebody it researched from archives, so
   * `wikiTreeId` is empty and an exact match is impossible — yet the user is plainly looking
   * at that person's profile. Both the URL and the page title carry the name, and requiring
   * BOTH to agree keeps this safe: a child shares its father's surname, so the ID alone would
   * match Wichertje Porringa against her father's Porringa-2 page. The given name breaks the tie.
   */
  const looksLikeCurrentProfile = (vitals, currentProfileId, currentProfileName) => {
    const first = normaliseName(vitals.firstName);
    const lnab = normaliseName(vitals.lastNameAtBirth);
    if (!first || !lnab) return false;

    if (lnabFromProfileId(currentProfileId) !== lnab) return false;

    // WikiTree renders a married name as "Jantiene (Porringa) Rijsdijk", so match on tokens.
    const shown = normaliseName(currentProfileName);
    if (!shown) return false;              // no title to corroborate: do not guess
    return shown.split(' ').includes(first);
  };

  const inferRelationship = (vitals, currentProfileId, currentProfileName) => {
    if (!vitals || !currentProfileId) return null;
    const subject = fullNameOf(vitals);
    if (!subject) return null;

    const who = currentProfileName || currentProfileId;
    const isCurrent = (id) =>
      Boolean(id) && String(id).trim().toLowerCase() === currentProfileId.toLowerCase();

    if (isCurrent(vitals.wikiTreeId)) {
      return { type: 'update', subject, label: `Update ${subject}'s profile with this research?` };
    }
    if (isCurrent(vitals.fatherWikiTreeId) || isCurrent(vitals.motherWikiTreeId)) {
      return { type: 'add-child', subject, label: `Add ${subject} as a child of ${who}?` };
    }
    const marriages = Array.isArray(vitals.marriages) ? vitals.marriages : [];
    if (marriages.some((m) => isCurrent(m && m.spouseWikiTreeId))) {
      return { type: 'add-spouse', subject, label: `Add ${subject} as a spouse of ${who}?` };
    }
    // No ID matched. Checked last so an explicitly stated relationship always wins, this
    // catches the common case where the agent researched somebody from archives and never
    // learned their WikiTree ID, yet the user is looking at that very profile.
    if (looksLikeCurrentProfile(vitals, currentProfileId, currentProfileName)) {
      return { type: 'update', subject, label: `Update ${subject}'s profile with this research?` };
    }
    // Staged data with no stated link to this profile. Importing here would silently fill
    // nothing, so ask for the relationship rather than implying the import will work.
    return {
      type: 'unknown-relation',
      subject,
      label: `How is ${subject} related to ${who}?`,
    };
  };

  /**
   * True when this page actually has a profile form to populate. A profile *view* page has
   * none, which is why "Import Profile" there filled 0 fields and still claimed success.
   */
  const canFillProfileForm = () => {
    const nameInput = document.querySelector('#mFirstName') ||
                      document.querySelector('input[name="mFirstName"]') ||
                      document.querySelector('#mRealName');
    if (nameInput) return true;
    return Boolean(
      document.querySelector('input[type="radio"]#editAction_createNew') ||
      document.querySelector('#editAction_createNew') ||
      document.querySelector('input[type="radio"][value="create"]')
    );
  };

  /**
   * WikiTree renders its own "add relative" links on a profile ([spouse?], [children?], the
   * pencil icons). Reading them off the page avoids inventing URLs, and means the user lands
   * on the form the extension can actually fill.
   */
  // WikiTree encodes the relationship in the query string, e.g.
  //   /index.php?title=Special:EditFamily&u=51238239&who=spouse
  // so read `who` rather than guessing from link text ("[spouse?]", "add sibling").
  const RELATION_LABELS = {
    child: 'Add as child',
    spouse: 'Add as spouse',
    parent: 'Add as parent',
    sibling: 'Add as sibling',
  };

  const findRelativeLinks = () => {
    const found = new Map();
    for (const a of document.querySelectorAll('a[href*="EditFamily"], a[href*="editfamily"]')) {
      const href = a.getAttribute('href') || '';
      const param = href.match(/[?&]amp;?who=([a-z]+)/i);
      let who = param ? param[1].toLowerCase() : '';

      if (!who) {
        // Fall back to the visible text for any markup that omits the parameter.
        const text = `${href} ${a.textContent || ''}`.toLowerCase();
        who = Object.keys(RELATION_LABELS).find((k) => text.includes(k)) || '';
      }
      if (who === 'children') who = 'child';
      if (who === 'spouses') who = 'spouse';
      if (who === 'parents') who = 'parent';

      if (RELATION_LABELS[who] && !found.has(who)) {
        found.set(who, { key: who, title: RELATION_LABELS[who], href: a.href });
      }
    }
    return Array.from(found.values());
  };

  const findEditPersonLink = () => {
    const a = document.querySelector('a[href*="Special:EditPerson"], a[href*="EditPerson"]');
    return a ? a.href : null;
  };

  const RELATION_FOR_TYPE = {
    'add-child': 'child',
    'add-spouse': 'spouse',
    'add-parent': 'parent',
  };

  /** The WikiTree form this suggestion should open, or null if the page offers none. */
  const linkForSuggestion = (suggestion) => {
    if (!suggestion) return null;
    if (suggestion.type === 'update') return findEditPersonLink();
    const key = RELATION_FOR_TYPE[suggestion.type];
    if (!key) return null;
    const match = findRelativeLinks().find((l) => l.key === key);
    return match ? match.href : null;
  };

  const sanitizeDutchNamePrefixes = (vitals) => {
    if (!vitals) return vitals;
    const dutchPrefixes = ['van', 'de', 'den', 'der', 'van de', 'van den', 'van der', 'ten', 'ter', 'te', 'in \'t', 'op \'t', 'van \'t', 'vander', 'vanden', 'du', 'la', 'le', 'von'];
    
    if (vitals.firstName) {
      const fnParts = vitals.firstName.trim().split(/\s+/);
      if (fnParts.length >= 2) {
        let prefixToMove = '';
        const lastTwo = `${fnParts[fnParts.length - 2]} ${fnParts[fnParts.length - 1]}`.toLowerCase();
        if (dutchPrefixes.includes(lastTwo)) {
          prefixToMove = fnParts.slice(-2).join(' ');
          vitals.firstName = fnParts.slice(0, -2).join(' ');
        } else {
          const lastOne = fnParts[fnParts.length - 1].toLowerCase();
          if (dutchPrefixes.includes(lastOne)) {
            prefixToMove = fnParts[fnParts.length - 1];
            vitals.firstName = fnParts.slice(0, -1).join(' ');
          }
        }

        if (prefixToMove) {
          const currentLastName = vitals.lastNameAtBirth || '';
          if (!currentLastName.toLowerCase().startsWith(prefixToMove.toLowerCase())) {
            vitals.lastNameAtBirth = `${prefixToMove} ${currentLastName}`.trim();
          }
        }
      }
    }

    // If lastNameCurrent was set equal to (or un-prefixed version of) lastNameAtBirth, delete it so the optional field remains blank
    if (vitals.lastNameCurrent && vitals.lastNameAtBirth) {
      const cleanCurrent = vitals.lastNameCurrent.trim().toLowerCase();
      const cleanBirth = vitals.lastNameAtBirth.trim().toLowerCase();
      if (cleanCurrent === cleanBirth || cleanBirth.endsWith(` ${cleanCurrent}`) || cleanBirth.endsWith(`'${cleanCurrent}`)) {
        delete vitals.lastNameCurrent;
      }
    }

    return vitals;
  };

  // Check if we are on a WikiTree page or Lineage Nexus app
  const isWikiTreePage = () => window.location.hostname.includes('wikitree.com');
  // The deployed app, plus localhost for development. Only the postMessage
  // listener below runs here — the WikiTree UI is gated on isWikiTreePage().
  const isLineageAppPage = () =>
    window.location.hostname === 'lineage.nexus' ||
    window.location.hostname === 'www.lineage.nexus' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  // If on Lineage Nexus web app, listen for Send to Extension messages and save to chrome.storage.local
  if (isLineageAppPage()) {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'LINEAGE_NEXUS_PUSH_BIO') {
        const { biography, vitals } = event.data;
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.set({
              pending_biography: biography,
              pending_vitals: vitals
            }, () => {
              if (chrome.runtime.lastError) return;
              console.log('[Lineage Nexus Extension] Synced biography & vitals to chrome.storage.local');
            });
          } catch (e) {}
        }
      }
    });
    return;
  }

  if (!isWikiTreePage()) return;

  // Helper to safely set input values on modern framework / jQuery form fields & textareas
  const setNativeInputValue = (input, val) => {
    if (!input || val === undefined || val === null) return;
    try {
      const isTextArea = input.tagName.toLowerCase() === 'textarea';
      const prototype = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(input, val);
      } else {
        input.value = val;
      }
    } catch (e) {
      input.value = val;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    input.dispatchEvent(new Event('keyup', { bubbles: true }));
  };

  // Helper to check if an element is actually visible on screen
  const isInputVisible = (el) => {
    if (!el) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  };

  // Detect if we are currently on Step 1 (action selection) vs Step 2 (basic data form)
  const isStepOnePage = () => {
    const firstNameInput = document.querySelector('#mFirstName') ||
                           document.querySelector('input[name="mFirstName"]') ||
                           document.querySelector('#mRealName');

    // If First Name input is VISIBLE on screen, we are 100% on Step 2 (Form Ready)
    if (isInputVisible(firstNameInput)) {
      return false;
    }

    // Otherwise check for Step 1 choice radio or action button
    const stepOneRadio = document.querySelector('input[type="radio"]#editAction_createNew') ||
                         document.querySelector('#editAction_createNew') ||
                         document.querySelector('input[type="radio"][value="create"]');

    return !!stepOneRadio;
  };

  // Helper to parse vitals & clean biography from chrome.storage or clipboard with strict timeout
  const parseClipboardOrStorage = async (allowClipboardPrompt = true) => {
    let raw = '';
    let vitals = {};

    // 1. Try reading chrome.storage.local safely with strict 300ms timeout
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage && chrome.storage.local) {
      try {
        const storagePromise = new Promise((resolve) => {
          chrome.storage.local.get(['pending_biography', 'pending_vitals'], (data) => {
            if (chrome.runtime.lastError || !data) { resolve({}); return; }
            resolve(data);
          });
        });
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({}), 300));
        const data = await Promise.race([storagePromise, timeoutPromise]);
        if (data.pending_biography) raw = data.pending_biography;
        if (data.pending_vitals) vitals = data.pending_vitals;
      } catch (e) {}
    }

    // 2. Try reading clipboard if storage is empty
    if (!raw && allowClipboardPrompt && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) raw = text.trim();
      } catch (e) {}
    }

    // 3. The metadata comment embedded in the biography is authoritative and ALWAYS wins.
    //    It is the payload the agent produced for this exact biography, whereas
    //    `pending_vitals` in storage may be left over from an earlier copy or an older
    //    schema. Previously this only ran when storage yielded nothing, so a stale object
    //    written before `wikiTreeId` existed masked the fresh comment and relationship
    //    detection silently failed — the extension could not tell it was already looking at
    //    the subject's own profile.
    if (raw) {
      const jsonCommentMatch = raw.match(/<!--\s*LINEAGE_NEXUS_DATA:\s*({[\s\S]+?})\s*-->/);
      if (jsonCommentMatch) {
        try {
          vitals = JSON.parse(jsonCommentMatch[1]);
          raw = raw.replace(/<!--\s*LINEAGE_NEXUS_DATA:[\s\S]+?-->/, '').trim();
        } catch (err) {}
      }
    }

    // The metadata comment is the sole source of vitals. Deriving them from prose with
    // regexes produced confident nonsense — "died unmarried" matched the marriage pattern and
    // yielded a spouse called "at the age of", while the death date was missed entirely. If
    // the agent did not supply the comment, we report that rather than guessing.
    const hasStructuredData = Object.keys(vitals).length > 0;

    // Applied whatever the source: vitals loaded straight from storage previously skipped
    // sanitising altogether, so dates went unnormalised and marriages unprojected.
    vitals = sanitizeVitals(vitals);

    // Sanitize Dutch tussenvoegsels (van, de, van der, etc.) placed inside firstName
    vitals = sanitizeDutchNamePrefixes(vitals);

    return { rawWikitext: raw, vitals };
  };

  // Create & Inject Floating Assistant (Collapsed Logo Icon when inactive; Expanded bar ONLY when data ready)
  const injectFloatingAssistant = async () => {
    if (!document.body) return;

    // Check if staged data exists
    const parsed = await parseClipboardOrStorage(false);
    const hasData = !!(parsed && (parsed.vitals.firstName || parsed.rawWikitext));

    let iconBtn = document.querySelector('#lineage-nexus-collapsed-icon');
    let barPanel = document.querySelector('#lineage-nexus-floating-bar');

    // Create collapsed logo icon if missing
    if (!iconBtn) {
      iconBtn = document.createElement('div');
      iconBtn.id = 'lineage-nexus-collapsed-icon';
      iconBtn.title = 'Lineage Nexus Assistant (Click to open)';
      iconBtn.innerHTML = getLogoHtml();
      document.body.appendChild(iconBtn);

      iconBtn.addEventListener('click', () => {
        if (barPanel) {
          openPanel(barPanel, iconBtn);
        }
      });
    }

    // Create expanded panel if missing
    if (!barPanel) {
      barPanel = document.createElement('div');
      barPanel.id = 'lineage-nexus-floating-bar';

      document.body.appendChild(barPanel);

      barPanel.innerHTML = `
        <div class="nexus-header">
          <div class="nexus-title">
            ${getLogoHtml()}
            <span>Lineage Nexus Assistant <small style="opacity:0.6;font-size:10px;">v0.1</small></span>
          </div>
          <button class="nexus-close" id="nexus-close-btn">&times;</button>
        </div>
        <div class="nexus-status" id="nexus-status-msg"></div>
        <div id="nexus-relation-actions"></div>
        <div id="nexus-toast-container"></div>
        <div class="nexus-actions">
          <button class="nexus-btn nexus-btn-gold" id="nexus-import-all-btn">
            ✨ Import Profile
          </button>
        </div>
      `;

      document.querySelector('#nexus-close-btn').addEventListener('click', () => {
        barPanel.style.display = 'none';
        iconBtn.style.display = 'flex';
      });

      document.querySelector('#nexus-import-all-btn').addEventListener('click', () => handleOneStepImport(true));
    }

    // Update status text
    const statusMsg = document.querySelector('#nexus-status-msg');
    const relationActions = document.querySelector('#nexus-relation-actions');
    const importBtn = document.querySelector('#nexus-import-all-btn');
    const isStep1 = isStepOnePage();

    // Rendered with textContent rather than innerHTML: names come from model output.
    const setStatus = (parts) => {
      statusMsg.textContent = '';
      for (const part of parts) {
        if (typeof part === 'string') {
          statusMsg.appendChild(document.createTextNode(part));
        } else {
          const strong = document.createElement('strong');
          strong.textContent = part.strong;
          statusMsg.appendChild(strong);
        }
      }
    };

    if (relationActions) relationActions.textContent = '';

    if (hasData) {
      const v = parsed.vitals;
      const personName = [v.firstName, v.middleName, v.lastNameAtBirth].filter(Boolean).join(' ') || 'staged profile';
      const fillable = canFillProfileForm();

      if (!fillable) {
        // A profile view page has no form. Previously "Import Profile" ran here, filled
        // nothing, and still reported success — so explain what is actually needed instead.
        const relationship = inferRelationship(v, getCurrentProfileId(), getCurrentProfileName());
        const whoHere = getCurrentProfileName() || getCurrentProfileId() || 'this profile';
        const links = findRelativeLinks();

        const known = relationship && relationship.type !== 'unknown-relation';
        if (relationship && relationship.type === 'add-child') {
          setStatus([{ strong: personName }, ` is a child of ${whoHere}.`]);
        } else if (relationship && relationship.type === 'add-spouse') {
          setStatus([{ strong: personName }, ` is a spouse of ${whoHere}.`]);
        } else if (relationship && relationship.type === 'update') {
          setStatus([`This profile is `, { strong: personName }, `.`]);
        } else {
          setStatus([`No stated relationship between `, { strong: personName }, ` and ${whoHere}.`]);
        }

        // Offer updating the profile that is open, which the metadata often cannot know —
        // frequently the staged person IS this profile, just without a wikiTreeId recorded.
        const options = links.slice();
        const editHref = findEditPersonLink();
        const currentId = getCurrentProfileId();
        if (editHref && currentId) {
          options.unshift({ key: 'update', title: `Update ${currentId}`, href: editHref });
        }

        if (relationActions && options.length) {
          const hint = document.createElement('div');
          hint.className = 'nexus-relation-hint';
          hint.textContent = known ? 'Open on WikiTree' : 'Choose a relationship';
          relationActions.appendChild(hint);
          for (const option of options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'nexus-btn nexus-btn-relation' +
              (option.key === 'update' ? ' nexus-btn-relation-update' : '');
            btn.textContent = option.title;
            btn.addEventListener('click', () => { window.location.href = option.href; });
            relationActions.appendChild(btn);
          }
        }

        // The import button cannot do anything here; hiding it beats a button that lies.
        // Hide its row too: an empty flex child still consumes the panel's row gap, which
        // showed up as unbalanced padding along the bottom edge.
        if (importBtn) {
          importBtn.style.display = 'none';
          if (importBtn.parentElement) importBtn.parentElement.style.display = 'none';
        }
        openPanel(barPanel, iconBtn);
        return;
      }

      if (importBtn) {
        importBtn.style.display = '';
        if (importBtn.parentElement) importBtn.parentElement.style.display = '';
      }
      if (isStep1) {
        setStatus(['👉 ', { strong: 'Step 1:' }, ' Ready to advance & import for ', { strong: personName }]);
      } else {
        setStatus(['Ready to import profile for ', { strong: personName }]);
      }

      // Auto-expand panel when data is ready
      openPanel(barPanel, iconBtn);
    } else {
      if (importBtn) {
        importBtn.style.display = '';
        if (importBtn.parentElement) importBtn.parentElement.style.display = '';
      }
      // Collapse to single logo icon when inactive/no data
      statusMsg.innerHTML = isStep1
        ? `👉 <strong>Step 1:</strong> Advance to creation form`
        : `Ready for WikiTree creation`;

      barPanel.style.display = 'none';
      iconBtn.style.display = 'flex';
    }
  };

  // --- Panel visibility ----------------------------------------------------
  // The chip and the expanded panel are two presentations of the same state, so exactly one
  // may be on screen. Showing both stacked them on top of each other.
  const isPanelOpen = () => {
    const bar = document.querySelector('#lineage-nexus-floating-bar');
    return Boolean(bar && bar.style.display === 'flex');
  };

  const openPanel = (bar, icon) => {
    const panel = bar || document.querySelector('#lineage-nexus-floating-bar');
    const logo = icon || document.querySelector('#lineage-nexus-collapsed-icon');
    if (panel) panel.style.display = 'flex';
    if (logo) logo.style.display = 'none';
    dismissSuggestion();
  };

  // --- Contextual suggestion chip -----------------------------------------
  // Sits to the left of the collapsed logo. Clicking it opens the existing panel; the import
  // itself is still a deliberate click on "Import Profile", unchanged.
  const dismissSuggestion = () => {
    const chip = document.querySelector('#lineage-nexus-suggestion');
    if (chip) chip.remove();
  };

  const renderSuggestion = (vitals) => {
    if (!document.body) return;
    const suggestion = inferRelationship(vitals, getCurrentProfileId(), getCurrentProfileName());
    if (!suggestion) return;

    // The panel already states this, in more detail. Refresh it rather than stacking a chip
    // on top of it.
    if (isPanelOpen()) {
      dismissSuggestion();
      injectFloatingAssistant();
      return;
    }

    dismissSuggestion();

    const chip = document.createElement('div');
    chip.id = 'lineage-nexus-suggestion';
    chip.dataset.action = suggestion.type;

    const label = document.createElement('button');
    label.className = 'nexus-suggestion-label';
    label.type = 'button';
    label.textContent = suggestion.label;   // textContent, never innerHTML: this is model output
    label.addEventListener('click', () => {
      // Accepting the suggestion should land on the form that can actually be filled, which
      // is what WikiTree's own [spouse?] / [children?] links open.
      const href = linkForSuggestion(suggestion);
      if (href) {
        dismissSuggestion();
        window.location.href = href;
        return;
      }
      // No matching form on this page: fall back to opening the panel, which explains why.
      const bar = document.querySelector('#lineage-nexus-floating-bar');
      const icon = document.querySelector('#lineage-nexus-collapsed-icon');
      if (bar) bar.style.display = 'flex';
      if (icon) icon.style.display = 'none';
      dismissSuggestion();
    });

    const close = document.createElement('button');
    close.className = 'nexus-suggestion-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss suggestion');
    close.textContent = '×';
    close.addEventListener('click', dismissSuggestion);

    chip.appendChild(label);
    chip.appendChild(close);
    document.body.appendChild(chip);

    const icon = document.querySelector('#lineage-nexus-collapsed-icon');
    if (icon) icon.style.display = 'flex';
  };

  // --- Clipboard watcher ---------------------------------------------------
  // Copying a biography in Lineage Nexus should be enough for the assistant to offer the right
  // action. Two deliberate constraints:
  //   * readText() rejects unless the document is focused, so polling a background tab would
  //     only produce console noise. We read on focus and while visible.
  //   * We ignore anything that does not carry our own marker, so ordinary clipboard contents
  //     are never inspected, stored or transmitted.
  const CLIPBOARD_POLL_MS = 1500;
  let lastClipboardSignature = null;
  let clipboardTimer = null;

  const readClipboardQuietly = async () => {
    if (!navigator.clipboard || !navigator.clipboard.readText) return null;
    if (!document.hasFocus() || document.visibilityState !== 'visible') return null;
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      return null;   // not focused, or permission withheld
    }
  };

  const checkClipboardForBiography = async () => {
    const text = await readClipboardQuietly();
    if (!text || text.indexOf('LINEAGE_NEXUS_DATA') === -1) return;

    // Cheap change detection so we only act on genuinely new content.
    const signature = `${text.length}:${text.slice(-160)}`;
    if (signature === lastClipboardSignature) return;
    lastClipboardSignature = signature;

    const match = text.match(/<!--\s*LINEAGE_NEXUS_DATA:\s*({[\s\S]+?})\s*-->/);
    if (!match) return;

    let vitals;
    try {
      vitals = sanitizeVitals(JSON.parse(match[1]));
    } catch (e) {
      return;
    }
    vitals = sanitizeDutchNamePrefixes(vitals);

    // Stage it exactly as "Send to Extension" would, so the existing manual import path is
    // unchanged and still works from the panel.
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.storage) {
      try {
        chrome.storage.local.set({ pending_biography: text.trim(), pending_vitals: vitals });
      } catch (e) {}
    }

    renderSuggestion(vitals);
  };

  const startClipboardWatcher = () => {
    if (clipboardTimer) return;
    const tick = () => { checkClipboardForBiography(); };
    clipboardTimer = setInterval(tick, CLIPBOARD_POLL_MS);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    tick();
  };

  const showToast = (msg, isError = false) => {
    const container = document.querySelector('#nexus-toast-container');
    if (!container) return;
    container.innerHTML = `<div class="nexus-toast" style="${isError ? 'color:#EF4444;background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.2);' : ''}">${msg}</div>`;
    setTimeout(() => {
      container.innerHTML = '';
    }, 4500);
  };

  // Populate Step 2 fields when form is ready
  const populateStepTwo = async (userGesture = true) => {
    const parsed = await parseClipboardOrStorage(userGesture);
    if (!parsed || (!parsed.rawWikitext && Object.keys(parsed.vitals).length === 0)) {
      showToast('No staged biography/vitals found. Click "Send to Extension" in Lineage Nexus!', true);
      return;
    }

    let vitalsCount = 0;
    if (parsed.vitals || parsed.rawWikitext) {
      vitalsCount = fillVitalsFields(parsed.vitals || {}, parsed.rawWikitext || '');
    }

    const textarea = document.querySelector('#wpTextbox1') ||
                     document.querySelector('textarea[name="wpTextbox1"]') ||
                     document.querySelector('#mBio') ||
                     document.querySelector('textarea[name="mBio"]') ||
                     document.querySelector('#mSources') ||
                     document.querySelector('textarea[name="mSources"]') ||
                     document.querySelector('textarea.form-control') ||
                     document.querySelector('textarea');

    if (textarea && parsed.rawWikitext) {
      insertWikitextIntoTextarea(textarea, parsed.rawWikitext);
    }

    showToast(`✨ Vitals (${vitalsCount} fields) & biography auto-filled! Please review before saving.`);
  };

  // One-Step Unified Import
  const handleOneStepImport = async (userGesture = true) => {
    const isStep1 = isStepOnePage();

    // If on Step 1: Select radio & click Continue
    if (isStep1) {
      const createRadio = document.querySelector('input[type="radio"]#editAction_createNew') ||
                           document.querySelector('#editAction_createNew') ||
                           document.querySelector('input[type="radio"][value="create"]') ||
                           document.querySelector('input[type="radio"]');

      if (createRadio) {
        createRadio.checked = true;
        createRadio.dispatchEvent(new Event('change', { bubbles: true }));
        createRadio.dispatchEvent(new Event('click', { bubbles: true }));
      }

      showToast('🚀 Advancing to creation form...');

      const continueBtn = document.querySelector('#actionButton') ||
                          document.querySelector('#enterBasicDataButton') ||
                          document.querySelector('.btn-secondary') ||
                          (createRadio ? createRadio.closest('form')?.querySelector('button, input[type="submit"]') : null);

      if (continueBtn) {
        continueBtn.click();
      } else {
        const form = createRadio ? createRadio.closest('form') : document.querySelector('form');
        if (form) form.submit();
      }

      // Short 250ms polling loop (max 10 attempts = 2.5s) to auto-fill if step toggles in-page
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        const firstNameInput = document.querySelector('#mFirstName') || document.querySelector('input[name="mFirstName"]');
        if (isInputVisible(firstNameInput) || attempts >= 10) {
          clearInterval(pollInterval);
          if (isInputVisible(firstNameInput)) {
            injectFloatingAssistant();
            await populateStepTwo(userGesture);
          }
        }
      }, 250);

      return;
    }

    // On Step 2 directly:
    await populateStepTwo(userGesture);
  };

  // Helper to insert Wikitext cleanly into textarea
  const insertWikitextIntoTextarea = (textarea, wikitext) => {
    if (!textarea) return;
    const cleanText = wikitext.replace(/<!--\s*LINEAGE_NEXUS_DATA:[\s\S]+?-->/, '').trim();

    setNativeInputValue(textarea, cleanText);
    textarea.value = cleanText;

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.dispatchEvent(new Event('blur', { bubbles: true }));
    textarea.focus();
  };

  // Helper to fill vitals fields
  const fillVitalsFields = (vitals = {}, rawWikitext = '') => {
    let filledCount = 0;

    const fieldMap = {
      firstName: ['#mFirstName', 'input[name="mFirstName"]', '#mRealName'],
      middleName: ['#mMiddleName', 'input[name="mMiddleName"]'],
      lastNameAtBirth: ['#mLastNameAtBirth', 'input[name="mLastNameAtBirth"]'],
      lastNameCurrent: ['#mLastNameCurrent', 'input[name="mLastNameCurrent"]'],
      birthDate: ['#mBirthDate', 'input[name="mBirthDate"]'],
      birthLocation: ['#mBirthLocation', 'input[name="mBirthLocation"]'],
      deathDate: ['#mDeathDate', 'input[name="mDeathDate"]'],
      deathLocation: ['#mDeathLocation', 'input[name="mDeathLocation"]'],
      marriageDate: ['#mMarriageDate', 'input[name="mMarriageDate"]'],
      marriageEndDate: ['#mMarriageEndDate', 'input[name="mMarriageEndDate"]'],
      marriageLocation: ['#mMarriageLocation', 'input[name="mMarriageLocation"]']
    };

    const cleanDateInputVal = (val) => {
      if (!val) return '';
      let clean = val.trim()
        .replace(/^(before|bef|after|aft|about|abt|est|estimated|circa|c\.|on|in)\s+/i, '')
        .trim();

      // WikiTree partial dates format for YYYY-MM is YYYY-MM-00
      if (/^\d{4}-\d{2}$/.test(clean)) {
        return `${clean}-00`;
      }
      return clean;
    };

    for (const [key, selectors] of Object.entries(fieldMap)) {
      if (vitals[key]) {
        for (const sel of selectors) {
          const input = document.querySelector(sel);
          if (input) {
            let valToSet = vitals[key];
            if (key.endsWith('Date')) {
              valToSet = cleanDateInputVal(valToSet);
            }
            setNativeInputValue(input, valToSet);
            filledCount++;
            break;
          }
        }
      }
    }

    // Gender selection: Handle both select#mGender dropdown and radio inputs
    if (vitals.gender) {
      const genderSelect = document.querySelector('#mGender') || document.querySelector('select[name="mGender"]');
      if (genderSelect) {
        const targetVal = vitals.gender.toLowerCase() === 'female' ? 'female' : 'male';
        for (let i = 0; i < genderSelect.options.length; i++) {
          const opt = genderSelect.options[i];
          if (opt.value.toLowerCase() === targetVal || opt.text.toLowerCase() === targetVal) {
            genderSelect.selectedIndex = i;
            genderSelect.dispatchEvent(new Event('change', { bubbles: true }));
            filledCount++;
            break;
          }
        }
      } else {
        const isFemale = vitals.gender.toLowerCase() === 'female';
        const genderRadio = isFemale
          ? (document.querySelector('input[name="mGender"][value="Female"]') || document.querySelector('#mGender_Female'))
          : (document.querySelector('input[name="mGender"][value="Male"]') || document.querySelector('#mGender_Male'));

        if (genderRadio) {
          genderRadio.checked = true;
          genderRadio.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
        }
      }
    }

    // Language selection: Set "Language for Locations" to Dutch/Flemish if location is in the Netherlands
    const allLocations = [vitals.birthLocation, vitals.deathLocation, vitals.marriageLocation, rawWikitext].filter(Boolean).join(' ');
    const isDutch = vitals.isDutch || /Netherlands Sticker|Nederlanders|Nederland|Netherlands|Friesland|Groningen|Drenthe|Overijssel|Gelderland|Utrecht|Noord-Holland|Zuid-Holland|Zeeland|Noord-Brabant|Limburg|Flevoland/i.test(allLocations);
    
    if (isDutch) {
      const langSelect = document.querySelector('#mLanguage') ||
                         document.querySelector('select[name="mLanguage"]') ||
                         document.querySelector('#mLocationLanguage') ||
                         document.querySelector('select[name="mLocationLanguage"]') ||
                         document.querySelector('select[name*="Language"]') ||
                         document.querySelector('select[name*="language"]');
      if (langSelect) {
        for (let i = 0; i < langSelect.options.length; i++) {
          const opt = langSelect.options[i];
          const text = opt.text.toLowerCase();
          const val = opt.value.toLowerCase();
          if (text.includes('dutch') || text.includes('nederlands') || val === 'nl' || val === 'dutch' || val.includes('dutch')) {
            langSelect.selectedIndex = i;
            langSelect.dispatchEvent(new Event('change', { bubbles: true }));
            filledCount++;
            break;
          }
        }
      }
    }

    // "No spouses" / "No children".
    //
    // The spouse checkbox is `name="mStatus_Spouse" value="blank"` and carries no id, so the
    // previous #mNoSpouses / [name="mNoSpouses"] selectors never matched it — it was never
    // ticked, including for {{Died Young}}.
    const tickCheckbox = (selectors) => {
      for (const sel of selectors) {
        const box = document.querySelector(sel);
        if (!box) continue;
        if (box.checked) return false;
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        box.dispatchEvent(new Event('click', { bubbles: true }));
        return true;
      }
      return false;
    };

    const isDiedYoung = vitals.diedYoung || (rawWikitext && /\{\{\s*Died\s+Young/i.test(rawWikitext));
    // An explicitly empty marriages array is the agent asserting the subject never married.
    const neverMarried = vitals.marriagesKnown === true &&
                         Array.isArray(vitals.marriages) &&
                         vitals.marriages.length === 0;

    if (isDiedYoung || neverMarried) {
      if (tickCheckbox([
        'input[name="mStatus_Spouse"]',
        '#mNoSpouses',
        'input[name="mNoSpouses"]',
        'input[id*="NoSpouse"]',
      ])) filledCount++;

      if (tickCheckbox([
        'input[name="mNoChildren"]',
        '#mNoChildren',
        'input[id*="NoChildren"]',
      ])) filledCount++;
    }

    // Auto-select Date & Location Certainty Radio Buttons
    if (vitals.birthDate) setDateRadioStatus('Birth', vitals.birthDate);
    if (vitals.birthLocation) setLocationRadioStatus('Birth', vitals.birthLocation);
    if (vitals.deathDate) setDateRadioStatus('Death', vitals.deathDate);
    if (vitals.deathLocation) setLocationRadioStatus('Death', vitals.deathLocation);
    if (vitals.marriageDate) setDateRadioStatus('Marriage', vitals.marriageDate);
    if (vitals.marriageEndDate) setDateRadioStatus('MarriageEnd', vitals.marriageEndDate);
    if (vitals.marriageLocation) setLocationRadioStatus('Marriage', vitals.marriageLocation);

    return filledCount;
  };

  // Helper to select Date Status Radio (certain/exact vs guess/uncertain vs before vs after)
  const setDateRadioStatus = (prefix, dateVal) => {
    if (!dateVal) return;
    const cleanDate = dateVal.trim();
    if (!cleanDate) return;

    let nameSelectors = [];
    if (prefix === 'Marriage') {
      nameSelectors = [`input[name="mMarriageStatus_marriage_date"]`, `input[name="mStatus_MarriageDate"]`];
    } else if (prefix === 'MarriageEnd') {
      nameSelectors = [`input[name="mMarriageStatus_marriage_end_date"]`, `input[name="mStatus_MarriageEndDate"]`];
    } else {
      nameSelectors = [
        `input[name="mStatus_${prefix}Date"]`,
        `input[name="m${prefix}DateStatus"]`,
        `input[name="m${prefix}Date_status"]`
      ];
    }

    let radios = [];
    for (const sel of nameSelectors) {
      radios = Array.from(document.querySelectorAll(sel));
      if (radios.length > 0) break;
    }

    if (radios.length === 0) {
      const dateInput = document.querySelector(`#${prefix}Date`) || document.querySelector(`#m${prefix}Date`);
      if (dateInput) {
        const container = dateInput.closest('.form-group, tr, div, td, p') || dateInput.parentElement?.parentElement;
        if (container) {
          radios = Array.from(container.querySelectorAll('input[type="radio"]'));
        }
      }
    }

    if (radios.length === 0) return;

    let targetType = 'exact';
    if (/about|abt|est|estimated|circa|c\.|~/i.test(cleanDate)) {
      targetType = 'estimate';
    } else if (/before|bef/i.test(cleanDate)) {
      targetType = 'before';
    } else if (/after|aft/i.test(cleanDate)) {
      targetType = 'after';
    }

    for (const radio of radios) {
      const val = (radio.value || '').toLowerCase();
      const id = (radio.id || '').toLowerCase();
      const labelText = (radio.labels && radio.labels[0] ? radio.labels[0].innerText : radio.parentElement?.innerText || '').toLowerCase();

      let isMatch = false;
      if (targetType === 'exact') {
        isMatch = val === 'certain' || val === 'exact' || val === '2' ||
                  id.endsWith('-certain') || id.includes('-certain') || id.includes('_certain') ||
                  (labelText.includes('certain') && !labelText.includes('uncertain')) ||
                  (labelText.includes('exact') && !labelText.includes('inexact'));
      } else if (targetType === 'estimate') {
        isMatch = val === 'guess' || val === 'estimate' || val === 'estimated' || val === 'uncertain' || val === '1' ||
                  id.endsWith('-guess') || id.includes('-guess') || id.includes('-estimate') ||
                  labelText.includes('uncertain') || labelText.includes('estimate') || labelText.includes('approximate');
      } else if (targetType === 'before') {
        isMatch = val === 'before' || val === '3' || id.endsWith('-before') || id.includes('-before') || labelText.includes('before');
      } else if (targetType === 'after') {
        isMatch = val === 'after' || val === '4' || id.endsWith('-after') || id.includes('-after') || labelText.includes('after');
      }

      if (isMatch) {
        radio.checked = true;
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        break;
      }
    }
  };

  // Helper to select Location Status Radio (certain vs uncertain)
  const setLocationRadioStatus = (prefix, locationVal) => {
    if (!locationVal) return;
    const cleanLoc = locationVal.trim();
    if (!cleanLoc) return;

    let nameSelectors = [];
    if (prefix === 'Marriage') {
      nameSelectors = [`input[name="mMarriageStatus_marriage_location"]`, `input[name="mMarriageStatus_location"]`];
    } else {
      nameSelectors = [
        `input[name="mStatus_${prefix}Location"]`,
        `input[name="m${prefix}LocationStatus"]`,
        `input[name="m${prefix}Location_status"]`
      ];
    }

    let radios = [];
    for (const sel of nameSelectors) {
      radios = Array.from(document.querySelectorAll(sel));
      if (radios.length > 0) break;
    }

    if (radios.length === 0) {
      const locInput = document.querySelector(`#${prefix}Location`) || document.querySelector(`#m${prefix}Location`);
      if (locInput) {
        const container = locInput.closest('.form-group, tr, div, td, p') || locInput.parentElement?.parentElement;
        if (container) {
          radios = Array.from(container.querySelectorAll('input[type="radio"]'));
        }
      }
    }

    if (radios.length === 0) return;

    const targetCertainty = /uncertain|\?/i.test(cleanLoc) ? 'uncertain' : 'certain';

    for (const radio of radios) {
      const val = (radio.value || '').toLowerCase();
      const id = (radio.id || '').toLowerCase();
      const labelText = (radio.labels && radio.labels[0] ? radio.labels[0].innerText : radio.parentElement?.innerText || '').toLowerCase();

      let isMatch = false;
      if (targetCertainty === 'certain') {
        isMatch = val === 'certain' || val === '2' ||
                  id.endsWith('-certain') || id.includes('-certain') ||
                  (labelText.includes('certain') && !labelText.includes('uncertain'));
      } else {
        isMatch = val === 'uncertain' || val === '1' ||
                  id.endsWith('-guess') || id.includes('-guess') || id.includes('uncertain') ||
                  labelText.includes('uncertain');
      }

      if (isMatch) {
        radio.checked = true;
        radio.dispatchEvent(new Event('input', { bubbles: true }));
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        radio.dispatchEvent(new Event('click', { bubbles: true }));
        break;
      }
    }
  };

  const start = () => {
    injectFloatingAssistant();
    startClipboardWatcher();
  };

  // Run injection safely after DOMContentLoaded if loading
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
