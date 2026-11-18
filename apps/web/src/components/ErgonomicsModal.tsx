import { useState, useEffect } from 'react';
import {
  Smartphone,
  Eye,
  SunMedium,
  RotateCcw,
  Sparkles,
  Vibrate,
  CheckCircle2,
} from 'lucide-react';
import { Modal, Button, cx } from './ui';
import {
  getUiPreferences,
  saveUiPreferences,
  DEFAULT_UI_PREFERENCES,
  type UiPreferences,
  type TextScale,
} from '../lib/ui-preferences';

interface ErgonomicsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ErgonomicsModal({ open, onClose }: ErgonomicsModalProps) {
  const [prefs, setPrefs] = useState<UiPreferences>(getUiPreferences);

  useEffect(() => {
    if (open) {
      setPrefs(getUiPreferences());
    }
  }, [open]);

  const update = (partial: Partial<UiPreferences>) => {
    const updated = saveUiPreferences(partial);
    setPrefs(updated);
  };

  const handleReset = () => {
    const reset = saveUiPreferences(DEFAULT_UI_PREFERENCES);
    setPrefs(reset);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confort Visuel & Ergonomie Mobile"
    >
      <div className="space-y-6 pt-1">
        <p className="text-xs text-ink-soft -mt-2">
          Ajustez la taille des boutons et des textes selon votre appareil et votre confort de lecture.
        </p>

        {/* =========================================================================
            1. MODE TACTILE & DENSITÉ (DENSITY)
        ========================================================================= */}
        <div>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-faint mb-2.5">
            <Smartphone size={15} className="text-amber" />
            <span>Mode d'affichage & Cibles tactiles</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Standard */}
            <button
              type="button"
              onClick={() => update({ density: 'standard' })}
              className={cx(
                'flex flex-col items-start p-3 rounded-xl border text-left transition-all relative',
                prefs.density === 'standard'
                  ? 'border-amber bg-amber-wash/30 text-ink ring-1 ring-amber/50 shadow-xs'
                  : 'border-line bg-surface hover:border-line-strong text-ink-soft'
              )}
            >
              <div className="flex w-full items-center justify-between mb-1">
                <span className="text-xs font-bold text-ink">Standard</span>
                {prefs.density === 'standard' && <CheckCircle2 size={15} className="text-amber" />}
              </div>
              <p className="text-[11px] text-ink-faint leading-snug">
                Idéal pour ordinateur de bureau ou grand écran.
              </p>
            </button>

            {/* Confort */}
            <button
              type="button"
              onClick={() => update({ density: 'confort' })}
              className={cx(
                'flex flex-col items-start p-3 rounded-xl border text-left transition-all relative',
                prefs.density === 'confort'
                  ? 'border-amber bg-amber-wash/30 text-ink ring-1 ring-amber/50 shadow-xs'
                  : 'border-line bg-surface hover:border-line-strong text-ink-soft'
              )}
            >
              <div className="flex w-full items-center justify-between mb-1">
                <span className="text-xs font-bold text-ink">Confort (+15%)</span>
                {prefs.density === 'confort' && <CheckCircle2 size={15} className="text-amber" />}
              </div>
              <p className="text-[11px] text-ink-faint leading-snug">
                Boutons 48px et textes élargis pour smartphone.
              </p>
            </button>

            {/* Atelier / Chantier */}
            <button
              type="button"
              onClick={() => update({ density: 'atelier' })}
              className={cx(
                'flex flex-col items-start p-3 rounded-xl border text-left transition-all relative',
                prefs.density === 'atelier'
                  ? 'border-amber bg-amber-wash/30 text-ink ring-1 ring-amber/50 shadow-xs'
                  : 'border-line bg-surface hover:border-line-strong text-ink-soft'
              )}
            >
              <div className="flex w-full items-center justify-between mb-1">
                <span className="text-xs font-bold text-amber">Atelier (Max)</span>
                {prefs.density === 'atelier' && <CheckCircle2 size={15} className="text-amber" />}
              </div>
              <p className="text-[11px] text-ink-faint leading-snug">
                Grands boutons 54px, idéal pour doigts avec poussière.
              </p>
            </button>
          </div>
        </div>

        {/* =========================================================================
            2. TAILLE DES POLICES (TEXT SCALE)
        ========================================================================= */}
        <div>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-faint mb-2.5">
            <Eye size={15} className="text-blue" />
            <span>Taille des textes</span>
          </label>

          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'normal' as TextScale, label: 'Normal', desc: '100%' },
              { id: 'large' as TextScale, label: 'Grand', desc: '+12%' },
              { id: 'xlarge' as TextScale, label: 'Très grand', desc: '+25%' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => update({ textScale: item.id })}
                className={cx(
                  'flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-medium transition-all',
                  prefs.textScale === item.id
                    ? 'border-blue bg-blue-wash/30 text-ink ring-1 ring-blue/40 font-semibold'
                    : 'border-line bg-surface text-ink-soft hover:border-line-strong'
                )}
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-ink-faint font-mono">{item.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* =========================================================================
            3. OPTIONS COMPLÉMENTAIRES
        ========================================================================= */}
        <div className="space-y-3 rounded-xl border border-line bg-surface/40 p-3.5">
          {/* Contraste Atelier */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                <SunMedium size={15} className="text-amber" />
                Contraste renforcé d'atelier
              </span>
              <p className="text-[11px] text-ink-faint mt-0.5">
                Bordures et contrastes accentués pour les écrans sous forte lumière ou plein soleil.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.highContrast}
              onClick={() => update({ highContrast: !prefs.highContrast })}
              className={cx(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                prefs.highContrast ? 'bg-amber' : 'bg-surface-3 border-line'
              )}
            >
              <span
                className={cx(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                  prefs.highContrast ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>

          {/* Retour haptique */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-line/60">
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                <Vibrate size={15} className="text-green" />
                Vibration au toucher (Retour haptique)
              </span>
              <p className="text-[11px] text-ink-faint mt-0.5">
                Vibration discrète sur le clavier virtuel pour confirmer chaque appui.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.hapticFeedback}
              onClick={() => update({ hapticFeedback: !prefs.hapticFeedback })}
              className={cx(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                prefs.hapticFeedback ? 'bg-green' : 'bg-surface-3 border-line'
              )}
            >
              <span
                className={cx(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                  prefs.hapticFeedback ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>

        {/* Aperçu direct */}
        <div className="rounded-xl border border-dashed border-line bg-paper/60 p-3 text-center">
          <p className="text-[11px] text-ink-faint mb-2">Aperçu en direct d'un bouton d'action :</p>
          <button
            type="button"
            className="w-full rounded-btn bg-amber text-white font-bold shadow-xs active:scale-95 transition-all flex items-center justify-center gap-2 py-2.5"
          >
            <Sparkles size={16} />
            <span>Exemple : Valider le pointage</span>
          </button>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-line">
          <Button
            type="button"
            variant="quiet"
            size="sm"
            onClick={handleReset}
            icon={<RotateCcw size={13} />}
          >
            Réinitialiser
          </Button>

          <Button type="button" variant="primary" size="md" onClick={onClose}>
            Appliquer & Fermer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
