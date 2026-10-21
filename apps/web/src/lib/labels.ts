import type { Role, ToolCondition, ToolStatus } from './api';

export const ROLE_LABEL: Record<Role, string> = {
  direction: 'Direction',
  magasinier: 'Magasinier',
  chef_atelier: 'Chef d’atelier',
  travailleur: 'Travailleur',
};

export const STATUS_LABEL: Record<ToolStatus, string> = {
  disponible: 'Disponible',
  en_pret: 'En prêt',
  maintenance: 'Maintenance',
  manquant: 'Manquant',
  reforme: 'Réformé',
};

export const STATUS_TONE: Record<ToolStatus, 'green' | 'blue' | 'amber' | 'red' | 'grey'> = {
  disponible: 'green',
  en_pret: 'blue',
  maintenance: 'amber',
  manquant: 'red',
  reforme: 'grey',
};

export const CONDITION_LABEL: Record<ToolCondition, string> = {
  bon: 'Bon état',
  a_reparer: 'À réparer',
  hors_service: 'Hors service',
};

export const EVENT_LABEL: Record<string, string> = {
  creation: 'Création de la fiche',
  loan: 'Sortie en prêt',
  return: 'Retour',
  status: 'Changement de statut',
  repair: 'Réparation',
  missing: 'Déclaration de manquant',
  correction: 'Correction',
};

export const MOVE_LABEL: Record<string, string> = {
  in: 'Entrée',
  out: 'Sortie',
  correction: 'Correction',
};

export const MOVE_TONE: Record<string, 'green' | 'red' | 'amber'> = {
  in: 'green',
  out: 'red',
  correction: 'amber',
};

export const WORKDAY_LABEL: Record<number, string> = {
  0: 'Dimanche',
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
};

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function todayLabel(): string {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
