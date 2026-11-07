export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function businessDate(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function businessMinutes(d = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Douala',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const part = (type: string) => Number(parts.find((value) => value.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute');
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
  early_checkin_time: string;
  opening_time: string;
  late_threshold_time: string;
  morning_lockout_time: string;
  meal_schedule_mode: 'normal_12h' | 'delayed_13h';
  break_start_time: string;
  break_end_time: string;
  break_normal_start: string;
  break_normal_end: string;
  resume_normal_start: string;
  resume_normal_end: string;
  resume_lockout_time: string;
  break_delayed_start: string;
  break_delayed_end: string;
  resume_delayed_start: string;
  resume_delayed_end: string;
  resume_delayed_lockout_time: string;
  closing_time: string;
  closing_end_time: string;
  day_cutoff_time: string;
  tolerance_minutes: number;
  max_late_minutes_allowed: number;
  workdays: number[];
  late_motifs: string[];
  selfie_retention_days: number;
  card_display_seconds: number;
};

export const DEFAULT_SETTINGS: Settings = {
  early_checkin_time: '07:25',
  opening_time: '07:30',
  late_threshold_time: '08:00',
  morning_lockout_time: '10:00',
  meal_schedule_mode: 'normal_12h',
  break_start_time: '12:00',
  break_end_time: '13:00',
  break_normal_start: '12:00',
  break_normal_end: '12:25',
  resume_normal_start: '13:00',
  resume_normal_end: '13:10',
  resume_lockout_time: '14:00',
  break_delayed_start: '13:00',
  break_delayed_end: '13:25',
  resume_delayed_start: '14:00',
  resume_delayed_end: '14:10',
  resume_delayed_lockout_time: '14:30',
  closing_time: '16:30',
  closing_end_time: '16:40',
  day_cutoff_time: '17:00',
  tolerance_minutes: 10,
  max_late_minutes_allowed: 150, // 10h00 - 7h30 = 150 min avant verrouillage absolu
  workdays: [1, 2, 3, 4, 5, 6],
  late_motifs: ['Transport', 'Motif familial', 'Mission extérieure', 'Autorisé par la direction', 'Autre'],
  selfie_retention_days: 90,
  card_display_seconds: 8,
};
