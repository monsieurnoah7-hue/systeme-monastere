export type UiDensity = 'standard' | 'confort' | 'atelier';
export type TextScale = 'normal' | 'large' | 'xlarge';

export interface UiPreferences {
  density: UiDensity;
  textScale: TextScale;
  highContrast: boolean;
  hapticFeedback: boolean;
}

const STORAGE_KEY = 'mf.ui_preferences';

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  density: 'standard',
  textScale: 'normal',
  highContrast: false,
  hapticFeedback: true,
};

export function getUiPreferences(): UiPreferences {
  if (typeof window === 'undefined') return DEFAULT_UI_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      density: ['standard', 'confort', 'atelier'].includes(parsed.density)
        ? parsed.density
        : DEFAULT_UI_PREFERENCES.density,
      textScale: ['normal', 'large', 'xlarge'].includes(parsed.textScale)
        ? parsed.textScale
        : DEFAULT_UI_PREFERENCES.textScale,
      highContrast: Boolean(parsed.highContrast),
      hapticFeedback: parsed.hapticFeedback !== undefined ? Boolean(parsed.hapticFeedback) : true,
    };
  } catch {
    return DEFAULT_UI_PREFERENCES;
  }
}

export function applyUiPreferences(prefs: UiPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-ui-density', prefs.density);
  root.setAttribute('data-text-size', prefs.textScale);
  root.setAttribute('data-high-contrast', prefs.highContrast ? 'true' : 'false');
}

export function saveUiPreferences(next: Partial<UiPreferences>): UiPreferences {
  const current = getUiPreferences();
  const updated: UiPreferences = { ...current, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Local storage plein ou bloqué
  }
  applyUiPreferences(updated);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mf:ui-preferences-changed', { detail: updated }));
  }
  return updated;
}
