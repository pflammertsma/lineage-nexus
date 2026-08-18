import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'lineage_theme';
export const THEME_ORDER = ['light', 'dark', 'system'];

// Keep in sync with the pre-paint script in index.html.
function applyPreference(preference) {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Suppress transitions across the swap.
  //
  // Elements carrying `transition-colors` take their colour from a theme custom
  // property. When the property changes, the engine does not restart the running
  // transition, so those elements keep the *previous* palette's colour until some
  // unrelated restyle happens to flush them. Switching light -> dark left small
  // links at the light-mode colour on a dark ground — around 2:1, effectively
  // invisible — and it persisted rather than settling.
  //
  // Killing transitions for one frame makes the swap instant and correct. The
  // forced reflow between the two class changes is required: without it the
  // browser coalesces them and the suppression never takes effect.
  const root = document.documentElement;
  root.classList.add('theme-switching');
  root.dataset.theme = dark ? 'dark' : 'light';
  // Tells the browser which palette to use for scrollbars, form controls and
  // the canvas behind the page.
  root.style.colorScheme = dark ? 'dark' : 'light';
  void root.offsetHeight; // force a synchronous restyle before re-enabling
  requestAnimationFrame(() => root.classList.remove('theme-switching'));
}

export default function useTheme() {
  const [preference, setPreference] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'system'
  );

  // The only job here is syncing an external system (the document element), so
  // the effect deliberately sets no React state.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference);
    applyPreference(preference);

    // Only follow the OS while the user has not made an explicit choice.
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyPreference('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const cycleTheme = useCallback(() => {
    setPreference(current => {
      const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
      return next;
    });
  }, []);

  return { preference, setPreference, cycleTheme };
}
