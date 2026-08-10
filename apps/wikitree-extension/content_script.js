// Lineage Nexus WikiTree Assistant Content Script

(function () {
  'use strict';

  const getLogoHtml = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const logoUrl = chrome.runtime.getURL('assets/logo.svg');
      return `<img src="${logoUrl}" class="nexus-logo-img" alt="Lineage Nexus" />`;
    }
    return `<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><circle cx="256" cy="256" r="256" fill="#134074"/></svg>`;
  };

  // Check if we are on a WikiTree page or Lineage Nexus app
  const isWikiTreePage = () => window.location.hostname.includes('wikitree.com');
  const isLineageAppPage = () => window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

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

    // 3. Check for embedded JSON comment <!-- LINEAGE_NEXUS_DATA: {...} -->
    if (raw && Object.keys(vitals).length === 0) {
      const jsonCommentMatch = raw.match(/<!--\s*LINEAGE_NEXUS_DATA:\s*({[\s\S]+?})\s*-->/);
      if (jsonCommentMatch) {
        try {
          vitals = JSON.parse(jsonCommentMatch[1]);
          raw = raw.replace(/<!--\s*LINEAGE_NEXUS_DATA:[\s\S]+?-->/, '').trim();
        } catch (err) {}
      }
    }

    // 4. Regex fallback parsing
    if (raw && !vitals.firstName) {
      const nameMatch = raw.match(/'''([^']+)'''/) || raw.match(/Name at Birth:\s*([^\n]+)/i);
      if (nameMatch) {
        const fullName = nameMatch[1].trim();
        const parts = fullName.split(' ');
        if (parts.length > 1) {
          vitals.firstName = parts.slice(0, -1).join(' ');
          vitals.lastNameAtBirth = parts[parts.length - 1];
        } else {
          vitals.firstName = fullName;
        }
      }
    }

    if (raw && !vitals.birthDate) {
      const birthMatch = raw.match(/was born on\s+([^,]+),\s+in\s+([^\n]+?)(?:,\s*(?:the\s+)?(?:son|daughter)\s+of|\.|$)/i) ||
                         raw.match(/was born on\s+([^,]+),\s+in\s+([^,.\n]+)/i) ||
                         raw.match(/Birth Date:\s*([^\n]+)/i);
      if (birthMatch) {
        vitals.birthDate = birthMatch[1].trim();
        if (birthMatch[2] && !vitals.birthLocation) {
          vitals.birthLocation = birthMatch[2]
            .replace(/,?\s*(?:the\s+)?(?:son|daughter)\s+of[\s\S]*/i, '')
            .replace(/,?\s*\[\[[\s\S]*/, '')
            .replace(/\.$/, '')
            .trim();
        }
      }
    }

    if (raw && !vitals.marriageEndDate) {
      const divorceMatch = raw.match(/(?:marriage ended in divorce|divorced)\s+on\s+([^,.\n]+)/i);
      if (divorceMatch) {
        vitals.marriageEndDate = divorceMatch[1].trim();
      }
    }

    if (raw && !vitals.gender) {
      if (/was born[^\n]*\bthe son of\b/i.test(raw) || /\bHe married\b/i.test(raw) || /^\s*Gender:\s*Male/im.test(raw)) {
        vitals.gender = 'Male';
      } else if (/was born[^\n]*\bthe daughter of\b/i.test(raw) || /\bShe married\b/i.test(raw) || /^\s*Gender:\s*Female/im.test(raw)) {
        vitals.gender = 'Female';
      }
    }

    if (vitals.lastNameAtBirth && !vitals.lastNameCurrent && vitals.gender === 'Male') {
      vitals.lastNameCurrent = vitals.lastNameAtBirth;
    }

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
          barPanel.style.display = 'flex';
          iconBtn.style.display = 'none';
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
    const isStep1 = isStepOnePage();

    if (hasData) {
      const v = parsed.vitals;
      const personName = [v.firstName, v.lastNameAtBirth].filter(Boolean).join(' ') || 'staged profile';
      if (isStep1) {
        statusMsg.innerHTML = `👉 <strong>Step 1:</strong> Ready to advance & import for <strong>${personName}</strong>`;
      } else {
        statusMsg.innerHTML = `Ready to import profile for <strong>${personName}</strong>`;
      }

      // Auto-expand panel when data is ready
      barPanel.style.display = 'flex';
      iconBtn.style.display = 'none';
    } else {
      // Collapse to single logo icon when inactive/no data
      statusMsg.innerHTML = isStep1
        ? `👉 <strong>Step 1:</strong> Advance to creation form`
        : `Ready for WikiTree creation`;

      barPanel.style.display = 'none';
      iconBtn.style.display = 'flex';
    }
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
    if (parsed.vitals && Object.keys(parsed.vitals).length > 0) {
      vitalsCount = fillVitalsFields(parsed.vitals);
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
  const fillVitalsFields = (vitals) => {
    let filledCount = 0;

    const fieldMap = {
      firstName: ['#mFirstName', 'input[name="mFirstName"]', '#mRealName'],
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

    for (const [key, selectors] of Object.entries(fieldMap)) {
      if (vitals[key]) {
        for (const sel of selectors) {
          const input = document.querySelector(sel);
          if (input) {
            setNativeInputValue(input, vitals[key]);
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

    return filledCount;
  };

  // Run injection safely after DOMContentLoaded if loading
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingAssistant);
  } else {
    injectFloatingAssistant();
  }
})();
