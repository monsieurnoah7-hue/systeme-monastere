import { useState, useCallback } from 'react';
import { Delete, CornerDownLeft, ArrowBigUp } from 'lucide-react';
import { cx } from './ui';

export type KeyboardMode = 'alpha' | 'numeric' | 'symbols';

interface ModularKeyboardProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  maxLength?: number;
  className?: string;
}

export function ModularKeyboard({
  value,
  onChange,
  onSubmit,
  maxLength = 12,
  className,
}: ModularKeyboardProps) {
  // Mode : 'alpha' (AZERTY), 'numeric' (123 + symboles), 'symbols' ({&= symboles 2)
  const [mode, setMode] = useState<KeyboardMode>('alpha');
  const [isShift, setIsShift] = useState(true); // Majuscules par défaut pour matricules et badges
  const [capsLock, setCapsLock] = useState(true);

  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(12);
      }
    } catch {
      // Ignorer si non supporté
    }
  }, []);

  const handleKeyPress = useCallback(
    (char: string) => {
      triggerHaptic();
      if (value.length < maxLength) {
        onChange(value + char);
        // Si shift temporaire (pas caps lock), revenir en minuscule
        if (isShift && !capsLock && mode === 'alpha') {
          setIsShift(false);
        }
      }
    },
    [value, onChange, maxLength, isShift, capsLock, mode, triggerHaptic]
  );

  const handleBackspace = useCallback(() => {
    triggerHaptic();
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }, [value, onChange, triggerHaptic]);

  const toggleShift = useCallback(() => {
    triggerHaptic();
    if (isShift && capsLock) {
      setIsShift(false);
      setCapsLock(false);
    } else if (isShift && !capsLock) {
      setCapsLock(true);
    } else {
      setIsShift(true);
      setCapsLock(false);
    }
  }, [isShift, capsLock, triggerHaptic]);

  const switchMode = useCallback(
    (newMode: KeyboardMode) => {
      triggerHaptic();
      setMode(newMode);
    },
    [triggerHaptic]
  );

  // Rangées pour le Mode Alphabétique (AZERTY SwiftKey Style)
  const ALPHA_ROW_1 = ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
  const ALPHA_ROW_2 = ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'];
  const ALPHA_ROW_3 = ['W', 'X', 'C', 'V', 'B', 'N', "'"];

  // Rangées pour le Mode Numérique & Symboles 1 (Image 1 SwiftKey Style)
  const NUM_ROW_1 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const NUM_ROW_2 = ['@', '#', '$', '&', '_', '-', '(', ')', '=', '%'];
  const NUM_ROW_3 = ['"', '*', "'", ':', '/', '!', '?', '+'];

  // Rangées pour le Mode Symboles 2 ({&= Style)
  const SYM_ROW_1 = ['~', '\\', '|', '<', '>', '{', '}', '[', ']', '^'];
  const SYM_ROW_2 = ['°', '•', '¤', '€', '£', '¥', '§', '¿', '¡', '«'];
  const SYM_ROW_3 = ['»', '©', '®', '™', '…', '¶', '×', '÷'];

  return (
    <div
      className={cx(
        'w-full select-none rounded-2xl border border-line bg-[#131318] p-1.5 shadow-2xl sm:p-3',
        className
      )}
      style={{ touchAction: 'manipulation' }}
    >
      {/* =========================================================================
          MODE 1 : ALPHABÉTIQUE (AZERTY)
      ========================================================================= */}
      {mode === 'alpha' && (
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {/* Rangée 1 : A Z E R T Y U I O P */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {ALPHA_ROW_1.map((char) => {
              const displayChar = isShift ? char : char.toLowerCase();
              return (
                <KeyButton
                  key={char}
                  onClick={() => handleKeyPress(displayChar)}
                  className="flex-1"
                >
                  {displayChar}
                </KeyButton>
              );
            })}
          </div>

          {/* Rangée 2 : Q S D F G H J K L M */}
          <div className="flex w-full gap-1 sm:gap-1.5 px-[2%]">
            {ALPHA_ROW_2.map((char) => {
              const displayChar = isShift ? char : char.toLowerCase();
              return (
                <KeyButton
                  key={char}
                  onClick={() => handleKeyPress(displayChar)}
                  className="flex-1"
                >
                  {displayChar}
                </KeyButton>
              );
            })}
          </div>

          {/* Rangée 3 : [Shift ⇧]  W X C V B N '  [Backspace ⌫] */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {/* Shift Button */}
            <FunctionButton
              onClick={toggleShift}
              className={cx(
                'w-[14%] sm:w-[13%]',
                isShift
                  ? capsLock
                    ? 'border-amber bg-amber/20 text-amber'
                    : 'border-line-strong bg-[#252530] text-ink'
                  : 'text-ink-soft'
              )}
              title={capsLock ? 'Majuscules verrouillées' : isShift ? 'Majuscule active' : 'Minuscules'}
            >
              <div className="relative flex items-center justify-center">
                <ArrowBigUp
                  size={19}
                  className={cx(
                    'transition-transform',
                    isShift && 'fill-current',
                    capsLock && 'text-amber'
                  )}
                />
                {capsLock && (
                  <span className="absolute -bottom-1 h-0.5 w-2.5 rounded-full bg-amber" />
                )}
              </div>
            </FunctionButton>

            {/* Lettres W X C V B N ' */}
            {ALPHA_ROW_3.map((char) => {
              const displayChar = isShift ? char : char.toLowerCase();
              return (
                <KeyButton
                  key={char}
                  onClick={() => handleKeyPress(displayChar)}
                  className="flex-1"
                >
                  {displayChar}
                </KeyButton>
              );
            })}

            {/* Backspace Button */}
            <FunctionButton
              onClick={handleBackspace}
              className="w-[14%] sm:w-[13%]"
              title="Effacer"
            >
              <Delete size={19} />
            </FunctionButton>
          </div>

          {/* Rangée 4 : [123] [,] [Espace] [.] [Valider ↵] */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {/* Bascule Mode Numérique */}
            <FunctionButton
              onClick={() => switchMode('numeric')}
              className="w-[15%] sm:w-[14%] font-bold text-xs sm:text-sm text-amber"
              title="Chiffres et symboles"
            >
              123
            </FunctionButton>

            {/* Virgule */}
            <KeyButton
              onClick={() => handleKeyPress(',')}
              className="w-[10%] sm:w-[9%]"
            >
              ,
            </KeyButton>

            {/* Barre Espace SwiftKey Style */}
            <button
              type="button"
              onClick={() => handleKeyPress(' ')}
              className="flex-1 h-11 sm:h-13 rounded-xl border border-line bg-[#1c1c24] text-xs sm:text-sm font-medium text-ink-soft shadow-sm transition-all hover:bg-[#252530] active:scale-[0.98] active:bg-amber/15 flex items-center justify-center"
            >
              <span className="tracking-widest opacity-60 text-[11px] sm:text-xs">espace</span>
            </button>

            {/* Point */}
            <KeyButton
              onClick={() => handleKeyPress('.')}
              className="w-[10%] sm:w-[9%]"
            >
              .
            </KeyButton>

            {/* Bouton Valider / Entrée */}
            <button
              type="button"
              disabled={value.length === 0}
              onClick={onSubmit}
              className={cx(
                'w-[18%] sm:w-[16%] h-11 sm:h-13 rounded-xl border border-amber/30 bg-amber text-white font-bold shadow-float transition-all flex items-center justify-center active:scale-95',
                value.length === 0 ? 'opacity-40 cursor-not-allowed bg-[#252530] border-line text-ink-faint' : 'hover:bg-amber-2'
              )}
              title="Valider la saisie"
            >
              <CornerDownLeft size={18} />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODE 2 : NUMÉRIQUE & SYMBOLES 1 (SwiftKey Image 1)
      ========================================================================= */}
      {mode === 'numeric' && (
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {/* Rangée 1 : 1 2 3 4 5 6 7 8 9 0 */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {NUM_ROW_1.map((char) => (
              <KeyButton
                key={char}
                onClick={() => handleKeyPress(char)}
                className="flex-1 font-mono font-bold"
              >
                {char}
              </KeyButton>
            ))}
          </div>

          {/* Rangée 2 : @ # $ & _ - ( ) = % */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {NUM_ROW_2.map((char) => (
              <KeyButton
                key={char}
                onClick={() => handleKeyPress(char)}
                className="flex-1 font-mono"
              >
                {char}
              </KeyButton>
            ))}
          </div>

          {/* Rangée 3 : [{&=]  " * ' : / ! ? +  [Backspace ⌫] */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {/* Bascule vers Symboles 2 */}
            <FunctionButton
              onClick={() => switchMode('symbols')}
              className="w-[14%] sm:w-[13%] font-mono text-xs sm:text-sm font-bold text-amber"
              title="Autres symboles"
            >
              {'{&='}
            </FunctionButton>

            {NUM_ROW_3.map((char) => (
              <KeyButton
                key={char}
                onClick={() => handleKeyPress(char)}
                className="flex-1 font-mono"
              >
                {char}
              </KeyButton>
            ))}

            {/* Backspace Button */}
            <FunctionButton
              onClick={handleBackspace}
              className="w-[14%] sm:w-[13%]"
              title="Effacer"
            >
              <Delete size={19} />
            </FunctionButton>
          </div>

          {/* Rangée 4 : [abc] [,] [Espace] [.] [Valider ↵] */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {/* Rebascule vers Lettres (AZERTY) */}
            <FunctionButton
              onClick={() => switchMode('alpha')}
              className="w-[15%] sm:w-[14%] font-bold text-xs sm:text-sm text-amber"
              title="Clavier alphabétique"
            >
              abc
            </FunctionButton>

            {/* Virgule */}
            <KeyButton
              onClick={() => handleKeyPress(',')}
              className="w-[10%] sm:w-[9%]"
            >
              ,
            </KeyButton>

            {/* Barre Espace */}
            <button
              type="button"
              onClick={() => handleKeyPress(' ')}
              className="flex-1 h-11 sm:h-13 rounded-xl border border-line bg-[#1c1c24] text-xs sm:text-sm font-medium text-ink-soft shadow-sm transition-all hover:bg-[#252530] active:scale-[0.98] active:bg-amber/15 flex items-center justify-center"
            >
              <span className="tracking-widest opacity-60 text-[11px] sm:text-xs">espace</span>
            </button>

            {/* Point */}
            <KeyButton
              onClick={() => handleKeyPress('.')}
              className="w-[10%] sm:w-[9%]"
            >
              .
            </KeyButton>

            {/* Bouton Valider / Entrée */}
            <button
              type="button"
              disabled={value.length === 0}
              onClick={onSubmit}
              className={cx(
                'w-[18%] sm:w-[16%] h-11 sm:h-13 rounded-xl border border-amber/30 bg-amber text-white font-bold shadow-float transition-all flex items-center justify-center active:scale-95',
                value.length === 0 ? 'opacity-40 cursor-not-allowed bg-[#252530] border-line text-ink-faint' : 'hover:bg-amber-2'
              )}
              title="Valider la saisie"
            >
              <CornerDownLeft size={18} />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODE 3 : SYMBOLES SECONDAIRES 2 ({&=)
      ========================================================================= */}
      {mode === 'symbols' && (
        <div className="flex flex-col gap-1.5 sm:gap-2">
          {/* Rangée 1 : ~ \ | < > { } [ ] ^ */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {SYM_ROW_1.map((char) => (
              <KeyButton
                key={char}
                onClick={() => handleKeyPress(char)}
                className="flex-1 font-mono"
              >
                {char}
              </KeyButton>
            ))}
          </div>

          {/* Rangée 2 : ° • ¤ € £ ¥ § ¿ ¡ « */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {SYM_ROW_2.map((char) => (
              <KeyButton
                key={char}
                onClick={() => handleKeyPress(char)}
                className="flex-1 font-mono"
              >
                {char}
              </KeyButton>
            ))}
          </div>

          {/* Rangée 3 : [123]  » © ® ™ … ¶ × ÷  [Backspace ⌫] */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {/* Rebascule vers Chiffres */}
            <FunctionButton
              onClick={() => switchMode('numeric')}
              className="w-[14%] sm:w-[13%] font-mono text-xs sm:text-sm font-bold text-amber"
              title="Chiffres"
            >
              123
            </FunctionButton>

            {SYM_ROW_3.map((char) => (
              <KeyButton
                key={char}
                onClick={() => handleKeyPress(char)}
                className="flex-1 font-mono"
              >
                {char}
              </KeyButton>
            ))}

            {/* Backspace Button */}
            <FunctionButton
              onClick={handleBackspace}
              className="w-[14%] sm:w-[13%]"
              title="Effacer"
            >
              <Delete size={19} />
            </FunctionButton>
          </div>

          {/* Rangée 4 : [abc] [,] [Espace] [.] [Valider ↵] */}
          <div className="flex w-full gap-1 sm:gap-1.5">
            {/* Rebascule vers Lettres (AZERTY) */}
            <FunctionButton
              onClick={() => switchMode('alpha')}
              className="w-[15%] sm:w-[14%] font-bold text-xs sm:text-sm text-amber"
              title="Clavier alphabétique"
            >
              abc
            </FunctionButton>

            {/* Virgule */}
            <KeyButton
              onClick={() => handleKeyPress(',')}
              className="w-[10%] sm:w-[9%]"
            >
              ,
            </KeyButton>

            {/* Barre Espace */}
            <button
              type="button"
              onClick={() => handleKeyPress(' ')}
              className="flex-1 h-11 sm:h-13 rounded-xl border border-line bg-[#1c1c24] text-xs sm:text-sm font-medium text-ink-soft shadow-sm transition-all hover:bg-[#252530] active:scale-[0.98] active:bg-amber/15 flex items-center justify-center"
            >
              <span className="tracking-widest opacity-60 text-[11px] sm:text-xs">espace</span>
            </button>

            {/* Point */}
            <KeyButton
              onClick={() => handleKeyPress('.')}
              className="w-[10%] sm:w-[9%]"
            >
              .
            </KeyButton>

            {/* Bouton Valider / Entrée */}
            <button
              type="button"
              disabled={value.length === 0}
              onClick={onSubmit}
              className={cx(
                'w-[18%] sm:w-[16%] h-11 sm:h-13 rounded-xl border border-amber/30 bg-amber text-white font-bold shadow-float transition-all flex items-center justify-center active:scale-95',
                value.length === 0 ? 'opacity-40 cursor-not-allowed bg-[#252530] border-line text-ink-faint' : 'hover:bg-amber-2'
              )}
              title="Valider la saisie"
            >
              <CornerDownLeft size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Bouton Touche Standard (Lettre, Chiffre, Symbole)
 */
function KeyButton({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'h-11 sm:h-13 min-w-0 rounded-xl border border-line/60 bg-[#1e1e27] text-base sm:text-lg font-semibold text-ink shadow-xs transition-all duration-75',
        'hover:bg-[#292934] hover:border-line-strong active:scale-90 active:bg-amber/25 active:text-amber active:border-amber/40',
        'flex items-center justify-center',
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * Bouton Touche Fonction (Shift, 123, abc, Backspace, etc.)
 */
function FunctionButton({
  children,
  onClick,
  className,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cx(
        'h-11 sm:h-13 min-w-0 rounded-xl border border-line bg-[#16161d] text-ink-soft shadow-xs transition-all duration-75',
        'hover:bg-[#22222d] hover:text-ink active:scale-90 active:bg-amber-wash active:text-amber',
        'flex items-center justify-center',
        className
      )}
    >
      {children}
    </button>
  );
}
