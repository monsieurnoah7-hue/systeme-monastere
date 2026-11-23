import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import { Search, X, Check } from 'lucide-react';
import { Button, cx } from './ui';

export interface ModuleSearchBarProps {
  /** Valeur de recherche courante */
  value: string;
  /** Callback lors de la modification */
  onChange: (value: string) => void;
  /** Texte indicatif */
  placeholder?: string;
  /** Nom du module affiché dans la modale mobile */
  moduleName?: string;
  /** Nombre d'éléments trouvés (pour feedback temps réel) */
  resultsCount?: number;
  /** Classes CSS supplémentaires pour le conteneur du déclencheur */
  className?: string;
  /** Suggestions rapides ou filtres textuels suggérés */
  suggestions?: string[];
  /** Désactiver l'ouverture de la modale sur mobile (optionnel) */
  disableModal?: boolean;
}

/**
 * Barre de recherche responsive haut de gamme (CFTM Bénédictins)
 * - Sur Desktop (>= 1024px) : Saisie directe inline spacieuse avec loupe et bouton d'effacement rapide.
 * - Sur Mobile & Tablette (< 1024px) : Déclencheur tactile compact ergonomique.
 *   Un clic ouvre une modale de recherche dédiée, ancrée en haut d'écran au-dessus du clavier virtuel,
 *   avec saisie confortable (taille de texte anti-zoom iOS), retour visuel du nombre de résultats en direct
 *   et boutons d'action adaptés aux doigts.
 */
export function ModuleSearchBar({
  value,
  onChange,
  placeholder = 'Rechercher…',
  moduleName,
  resultsCount,
  className,
  suggestions,
  disableModal = false,
}: ModuleSearchBarProps) {
  const [modalOpen, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Focus automatique lors de l'ouverture de la modale
  useEffect(() => {
    if (modalOpen) {
      // Court délai pour laisser le temps au DOM et au clavier mobile d'apparaître fluidement
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [modalOpen]);

  // Gestion des touches Escape et Enter dans la modale
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Enter') {
      setOpen(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <>
      {/* =========================================================================
          1. RENDU DESKTOP (lg: >= 1024px) - Saisie directe inline
      ========================================================================= */}
      <div className={cx('hidden lg:relative lg:flex lg:flex-1 lg:max-w-xs xl:max-w-md items-center min-w-0', className)}>
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={moduleName ? `Rechercher dans ${moduleName}` : placeholder}
          className="h-9 w-full rounded-xl border border-line bg-surface/90 pl-8 pr-7 text-xs sm:text-sm text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none transition-all shadow-2xs focus:ring-1 focus:ring-amber/30"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 grid h-5 w-5 place-items-center text-ink-faint hover:text-ink hover:bg-paper-2 rounded-md transition-colors"
            title="Effacer la recherche"
            aria-label="Effacer la recherche"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* =========================================================================
          2. RENDU MOBILE / TABLETTE (< lg) - Déclencheur tactile ergonomique
      ========================================================================= */}
      <div className={cx('flex lg:hidden flex-1 min-w-0', className)}>
        {!value ? (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => {
              if (!disableModal) setOpen(true);
            }}
            className="flex h-9 w-full min-w-0 items-center gap-1.5 rounded-xl border border-line bg-surface/90 px-2.5 text-xs text-ink-faint shadow-2xs transition-all hover:border-amber/40 hover:text-ink active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            aria-label={moduleName ? `Ouvrir la recherche : ${moduleName}` : 'Ouvrir la recherche'}
            title={placeholder}
          >
            <Search size={14} className="shrink-0 text-amber" />
            <span className="truncate flex-1 text-left font-normal select-none">
              {placeholder}
            </span>
          </button>
        ) : (
          <div className="flex h-9 w-full min-w-0 items-center justify-between gap-1.5 rounded-xl border border-amber/40 bg-amber-wash/20 px-2 text-xs shadow-2xs transition-all">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => {
                if (!disableModal) setOpen(true);
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left active:scale-[0.99] focus-visible:outline-none"
              aria-label={`Modifier la recherche : ${value}`}
              title="Cliquer pour modifier la recherche"
            >
              <Search size={14} className="shrink-0 text-amber" />
              <span className="truncate font-semibold text-ink max-w-[120px] sm:max-w-none">
                {value}
              </span>
              {resultsCount !== undefined && (
                <span className="shrink-0 rounded-full bg-amber px-1.5 py-0.2 font-mono text-[10px] font-bold text-white tabular-nums">
                  {resultsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-paper-2 hover:text-ink active:scale-95 transition-colors"
              title="Effacer la recherche"
              aria-label="Effacer la recherche"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          3. MODALE DE RECHERCHE MOBILE / TABLETTE (Plein confort tactile)
      ========================================================================= */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4">
          {/* Toile de fond assombrie avec flou */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity animate-in fade-in-0 duration-150"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Panneau de recherche ancré en haut pour échapper au clavier virtuel */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={moduleName ? `Recherche · ${moduleName}` : 'Recherche'}
            className="relative z-10 w-full max-w-lg mt-[max(0.5rem,env(safe-area-inset-top))] flex flex-col gap-3 rounded-2xl border border-line-strong bg-paper p-4 shadow-pop animate-in zoom-in-95 fade-in-0 duration-150"
          >
            {/* En-tête de la modale */}
            <div className="flex items-center justify-between pb-1 border-b border-line">
              <div className="flex items-center gap-2 min-w-0">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-amber-wash border border-amber/30 text-amber shrink-0">
                  <Search size={14} />
                </div>
                <div className="min-w-0 leading-tight">
                  <h2 className="text-xs sm:text-sm font-bold text-ink truncate">
                    Recherche {moduleName ? `· ${moduleName}` : ''}
                  </h2>
                  <p className="text-[10px] text-ink-soft">Filtrage instantané et ergonomique</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint hover:text-ink hover:bg-paper-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                aria-label="Fermer la recherche"
              >
                <X size={16} />
              </button>
            </div>

            {/* Champ de saisie XXL avec icône et effacement */}
            <div className="relative flex items-center">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber pointer-events-none"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="h-12 w-full rounded-xl border-2 border-amber/50 bg-surface pl-11 pr-11 text-base text-ink placeholder:text-ink-faint focus:border-amber focus:ring-2 focus:ring-amber/20 focus:outline-none transition-all shadow-inner"
              />
              {value && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg text-ink-faint hover:text-ink hover:bg-paper-2 active:scale-95 transition-all"
                  aria-label="Vider le champ"
                  title="Vider le champ"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Feedback sur les résultats en temps réel */}
            <div className="flex items-center justify-between text-xs px-1 text-ink-soft">
              {resultsCount !== undefined ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-amber">{resultsCount}</span>
                  <span>{resultsCount <= 1 ? 'résultat trouvé' : 'résultats trouvés'}</span>
                </div>
              ) : (
                <span className="text-[11px] text-ink-faint">Tapez pour filtrer les éléments</span>
              )}

              {value && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="text-xs font-semibold text-amber hover:underline transition-colors"
                >
                  Tout effacer
                </button>
              )}
            </div>

            {/* Suggestions rapides optionnelles */}
            {suggestions && suggestions.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-[10px] font-semibold text-ink-faint uppercase tracking-wider block">
                  Suggestions rapides :
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        onChange(sug);
                      }}
                      className={cx(
                        'px-2.5 py-1 rounded-full text-xs font-medium border transition-all active:scale-95',
                        value.toLowerCase() === sug.toLowerCase()
                          ? 'bg-amber text-white border-amber font-bold'
                          : 'bg-surface text-ink-soft border-line hover:border-amber/40 hover:text-ink',
                      )}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Boutons d'action au bas de la modale */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-9 px-3 text-xs text-ink-soft hover:text-ink"
              >
                Fermer
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setOpen(false)}
                icon={<Check size={14} />}
                className="h-9 px-4 text-xs font-bold shadow-xs"
              >
                Valider ({resultsCount ?? (value ? 1 : 0)})
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
