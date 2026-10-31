import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { useToast } from './ui';

export interface UndoAction {
  id: string;
  title: string;
  details?: string;
  onUndo: () => Promise<void> | void;
  timestamp: number;
}

interface UndoContextValue {
  registerUndo: (action: Omit<UndoAction, 'id' | 'timestamp'>) => void;
  triggerUndo: () => void;
  dismissUndo: () => void;
  activeUndo: UndoAction | null;
}

const UndoContext = createContext<UndoContextValue | null>(null);

const DURATION_MS = 10000; // 10 secondes pour annuler comme sur Google / Adobe

export const UndoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeUndo, setActiveUndo] = useState<UndoAction | null>(null);
  const [progress, setProgress] = useState(100);
  const [isRestoring, setIsRestoring] = useState(false);
  const toast = useToast();

  const dismissUndo = useCallback(() => {
    setActiveUndo(null);
    setProgress(100);
  }, []);

  const registerUndo = useCallback((action: Omit<UndoAction, 'id' | 'timestamp'>) => {
    const newAction: UndoAction = {
      ...action,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    setActiveUndo(newAction);
    setProgress(100);
  }, []);

  const triggerUndo = useCallback(async () => {
    if (!activeUndo || isRestoring) return;
    setIsRestoring(true);
    try {
      await activeUndo.onUndo();
      toast(`Action annulée avec succès : ${activeUndo.title}`, 'success');
      setActiveUndo(null);
    } catch (err) {
      toast(`Échec de l'annulation : ${(err as Error).message}`, 'error');
    } finally {
      setIsRestoring(false);
    }
  }, [activeUndo, isRestoring, toast]);

  // Décompte visuel de 10 secondes
  useEffect(() => {
    if (!activeUndo) return;
    const interval = 100;
    const step = (interval / DURATION_MS) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          setActiveUndo(null);
          return 100;
        }
        return Math.max(0, prev - step);
      });
    }, interval);

    return () => clearInterval(timer);
  }, [activeUndo]);

  // Écouteur global clavier Ctrl+Z / Cmd+Z (Adobe / Google Workspace style)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const target = e.target as HTMLElement | null;
        const isInput = target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        );
        if (isInput) return; // Ne pas intercepter quand l'utilisateur tape du texte

        if (activeUndo) {
          e.preventDefault();
          void triggerUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeUndo, triggerUndo]);

  return (
    <UndoContext.Provider value={{ registerUndo, triggerUndo, dismissUndo, activeUndo }}>
      {children}

      {/* Capsule Flottante Interactive Adobe/Google */}
      {activeUndo && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 max-w-lg w-[calc(100%-2rem)] transition-all animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md text-slate-100 flex items-center justify-between gap-3">
            {/* Barre de progression dégressive */}
            <div
              className="absolute bottom-0 left-0 h-1 bg-amber-500 transition-all ease-linear"
              style={{ width: `${progress}%` }}
            />

            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <RotateCcw className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-100">
                  {activeUndo.title}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {activeUndo.details ?? 'Appuyez sur Ctrl+Z ou cliquez pour restaurer'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => void triggerUndo()}
                disabled={isRestoring}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-black text-slate-950 shadow hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-50"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                <span>Annuler (Ctrl+Z)</span>
              </button>

              <button
                type="button"
                onClick={dismissUndo}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                title="Fermer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </UndoContext.Provider>
  );
};

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) {
    throw new Error('useUndo must be used within an UndoProvider');
  }
  return ctx;
}
