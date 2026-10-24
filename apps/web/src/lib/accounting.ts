import type { Tool } from './api';

export type ToolAccounting = {
  acquisitionCost: number;
  acquisitionYear: number;
  lifespanYears: number;
  ageYears: number;
  annualRate: number; // e.g. 20 for 20%
  annualDepreciation: number;
  cumulativeAmortization: number;
  vnc: number; // Valeur Nette Comptable
  progressPercent: number;
  statusLabel: string;
  statusTone: 'emerald' | 'blue' | 'amber' | 'purple' | 'red';
  isFullyAmortized: boolean;
};

/**
 * Moteur d'Amortissement Linéaire Intelligent (Normes SYSCOHADA / Pratique d'Atelier).
 * Calcule dynamiquement et sans latence la Valeur Nette Comptable (VNC) et l'usure comptable.
 */
export function computeToolAccounting(tool: Tool): ToolAccounting | null {
  const cost = Number(tool.acquisition_cost ?? 0);
  if (!cost || cost <= 0) return null;

  const currentYear = new Date().getFullYear();
  const acqYear = Number(tool.acquisition_year) || (tool.acquisition_date ? new Date(tool.acquisition_date).getFullYear() : currentYear);
  const lifespan = Math.max(1, Number(tool.lifespan_years) || 5);

  const ageYears = Math.max(0, currentYear - acqYear);
  const annualRate = Math.round((100 / lifespan) * 10) / 10;
  const annualDepreciation = cost / lifespan;

  const cumulativeAmortization = Math.min(cost, annualDepreciation * ageYears);
  const vnc = Math.max(0, cost - cumulativeAmortization);
  const progressPercent = Math.min(100, Math.round((cumulativeAmortization / cost) * 100));

  const isFullyAmortized = ageYears >= lifespan || vnc === 0;

  let statusLabel = 'En amortissement';
  let statusTone: ToolAccounting['statusTone'] = 'blue';

  if (ageYears === 0) {
    statusLabel = 'Neuf / Récemment acquis';
    statusTone = 'emerald';
  } else if (isFullyAmortized) {
    statusLabel = 'Totalement amorti (VNC = 0)';
    statusTone = 'purple';
  } else if (progressPercent >= 80) {
    statusLabel = 'Fin de cycle d’amortissement';
    statusTone = 'amber';
  }

  // Alerte combinée si l'outil est hors service ou à réparer
  if (tool.condition === 'hors_service' || tool.status === 'reforme') {
    statusLabel = isFullyAmortized ? 'Amorti · Réformé / Hors service' : 'Déprécié · Hors service';
    statusTone = 'red';
  } else if (tool.condition === 'a_reparer') {
    statusLabel = `${statusLabel} · Maintenance requise`;
  }

  return {
    acquisitionCost: cost,
    acquisitionYear: acqYear,
    lifespanYears: lifespan,
    ageYears,
    annualRate,
    annualDepreciation,
    cumulativeAmortization,
    vnc,
    progressPercent,
    statusLabel,
    statusTone,
    isFullyAmortized,
  };
}

export type PortfolioAuditSummary = {
  totalTools: number;
  ratedTools: number;
  totalAcquisitionCost: number;
  totalVnc: number;
  totalAmortization: number;
  averageAmortizationRate: number;
  fullyAmortizedCount: number;
  inProgressCount: number;
};

export function computePortfolioAudit(tools: Tool[]): PortfolioAuditSummary {
  let ratedCount = 0;
  let totalCost = 0;
  let totalVnc = 0;
  let totalAmort = 0;
  let fullyCount = 0;

  for (const tool of tools) {
    const acc = computeToolAccounting(tool);
    if (acc) {
      ratedCount += 1;
      totalCost += acc.acquisitionCost;
      totalVnc += acc.vnc;
      totalAmort += acc.cumulativeAmortization;
      if (acc.isFullyAmortized) fullyCount += 1;
    }
  }

  const averageAmortizationRate = totalCost > 0 ? Math.round((totalAmort / totalCost) * 100) : 0;

  return {
    totalTools: tools.length,
    ratedTools: ratedCount,
    totalAcquisitionCost: totalCost,
    totalVnc,
    totalAmortization: totalAmort,
    averageAmortizationRate,
    fullyAmortizedCount: fullyCount,
    inProgressCount: ratedCount - fullyCount,
  };
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return `${Math.round(amount).toLocaleString('fr-FR')} FCFA`;
}
