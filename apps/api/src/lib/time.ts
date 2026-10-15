export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function minutesOfDay(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function parseHm(value: string): number {
  const [h, m] = value.split(':');
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}

export function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type Settings = {
  opening_time: string;
  closing_time: string;
  tolerance_minutes: number;
  workdays: number[];
  late_motifs: string[];
  selfie_retention_days: number;
  card_display_seconds: number;
};

export const DEFAULT_SETTINGS: Settings = {
  opening_time: '07:30',
  closing_time: '16:30',
  tolerance_minutes: 10,
  workdays: [1, 2, 3, 4, 5, 6],
  late_motifs: ['Transport', 'Motif familial', 'Mission extérieure', 'Autorisé par la direction', 'Autre'],
  selfie_retention_days: 90,
  card_display_seconds: 8,
};
