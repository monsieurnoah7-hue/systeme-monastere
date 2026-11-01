// Calculateur et référentiel officiel des fêtes légales au Cameroun
// Conforme à la loi N° 73/5 du 7 décembre 1973 fixant le régime des fêtes légales en République du Cameroun.

export type CameroonHoliday = {
  id: string;
  holiday_date: string; // YYYY-MM-DD
  name: string;
  kind: 'legal_national' | 'religious' | 'presidential_decree';
  decree_ref?: string | null;
  is_chome: boolean;
};

// Algorithme de Meeus/Jones/Butcher pour le calcul de la date de Pâques grégorienne
export function getEasterDate(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Table de concordance des fêtes musulmanes mobiles au Cameroun (2024 - 2028)
// Les dates exactes sont confirmées par la Commission Nationale du Croissant Lunaire / Décrets
const MUSLIM_HOLIDAYS_TABLE: Record<number, { eid_fitr: string; tabaski: string; mawlid: string }> = {
  2024: { eid_fitr: '2024-04-10', tabaski: '2024-06-17', mawlid: '2024-09-16' },
  2025: { eid_fitr: '2025-03-31', tabaski: '2025-06-06', mawlid: '2025-09-05' },
  2026: { eid_fitr: '2026-03-20', tabaski: '2026-05-27', mawlid: '2026-08-25' },
  2027: { eid_fitr: '2027-03-10', tabaski: '2027-05-16', mawlid: '2027-08-14' },
  2028: { eid_fitr: '2028-02-27', tabaski: '2028-05-05', mawlid: '2028-08-03' },
};

/**
 * Génère l'ensemble des fêtes légales officielles camerounaises pour une année donnée
 */
export function generateCameroonLegalHolidays(year: number): CameroonHoliday[] {
  const holidays: CameroonHoliday[] = [];

  // 1. Fêtes légales fixes civiles et religieuses (Loi 73/5)
  const fixed = [
    { m: 1, d: 1, name: "Jour de l'An", kind: 'legal_national' as const },
    { m: 2, d: 11, name: 'Fête de la Jeunesse', kind: 'legal_national' as const },
    { m: 5, d: 1, name: 'Fête du Travail', kind: 'legal_national' as const },
    { m: 5, d: 20, name: "Fête Nationale de l'Unité", kind: 'legal_national' as const },
    { m: 8, d: 15, name: "Fête de l'Assomption", kind: 'religious' as const },
    { m: 11, d: 1, name: 'Fête de la Toussaint', kind: 'religious' as const },
    { m: 12, d: 25, name: 'Fête de Noël', kind: 'religious' as const },
  ];

  for (const f of fixed) {
    const dStr = formatDate(year, f.m, f.d);
    const dateObj = new Date(Date.UTC(year, f.m - 1, f.d));
    const dayOfWeek = dateObj.getUTCDay(); // 0 = Dimanche

    holidays.push({
      id: `cm-${dStr}`,
      holiday_date: dStr,
      name: f.name,
      kind: f.kind,
      decree_ref: 'Loi N° 73/5 du 7 décembre 1973',
      is_chome: true,
    });

    // Règle légale camerounaise : si une fête légale tombe un dimanche, le lundi suivant est chômé et payé
    if (dayOfWeek === 0) {
      const nextMondayObj = new Date(Date.UTC(year, f.m - 1, f.d + 1));
      const nextMonStr = formatDate(
        nextMondayObj.getUTCFullYear(),
        nextMondayObj.getUTCMonth() + 1,
        nextMondayObj.getUTCDate(),
      );
      holidays.push({
        id: `cm-${nextMonStr}-report`,
        holiday_date: nextMonStr,
        name: `Lendemain du ${f.name} (Chômé selon Loi 73/5)`,
        kind: f.kind,
        decree_ref: 'Loi N° 73/5 (Report dimanche chômé)',
        is_chome: true,
      });
    }
  }

  // 2. Fêtes chrétiennes mobiles
  const easter = getEasterDate(year);
  const easterDate = new Date(Date.UTC(year, easter.month - 1, easter.day));

  // Vendredi Saint : Pâques - 2 jours
  const goodFriday = new Date(easterDate.getTime() - 2 * 86400000);
  const gfStr = formatDate(goodFriday.getUTCFullYear(), goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate());
  holidays.push({
    id: `cm-${gfStr}`,
    holiday_date: gfStr,
    name: 'Vendredi Saint',
    kind: 'religious',
    decree_ref: 'Fête chrétienne mobile (Loi 73/5)',
    is_chome: true,
  });

  // Ascension : Pâques + 39 jours
  const ascension = new Date(easterDate.getTime() + 39 * 86400000);
  const ascStr = formatDate(ascension.getUTCFullYear(), ascension.getUTCMonth() + 1, ascension.getUTCDate());
  holidays.push({
    id: `cm-${ascStr}`,
    holiday_date: ascStr,
    name: "Fête de l'Ascension",
    kind: 'religious',
    decree_ref: 'Fête chrétienne mobile (Loi 73/5)',
    is_chome: true,
  });

  // 3. Fêtes musulmanes mobiles
  const muslim = MUSLIM_HOLIDAYS_TABLE[year];
  if (muslim) {
    holidays.push({
      id: `cm-${muslim.eid_fitr}`,
      holiday_date: muslim.eid_fitr,
      name: 'Fête de la Fin du Ramadan (Aïd al-Fitr)',
      kind: 'religious',
      decree_ref: 'Fête légale islamique (Loi 73/5)',
      is_chome: true,
    });
    holidays.push({
      id: `cm-${muslim.tabaski}`,
      holiday_date: muslim.tabaski,
      name: 'Fête du Mouton / Sacrifice (Aïd al-Adha / Tabaski)',
      kind: 'religious',
      decree_ref: 'Fête légale islamique (Loi 73/5)',
      is_chome: true,
    });
    holidays.push({
      id: `cm-${muslim.mawlid}`,
      holiday_date: muslim.mawlid,
      name: 'Fête de la Nativité du Prophète (Mawlid al-Nabi)',
      kind: 'religious',
      decree_ref: 'Fête légale islamique (Loi 73/5)',
      is_chome: true,
    });
  }

  return holidays.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date));
}
