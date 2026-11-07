import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Dashboard as DashboardType } from '../lib/api';
import { STATUS_LABEL } from '../lib/labels';

const STATUS_ORDER = ['disponible', 'en_pret', 'maintenance', 'manquant', 'reforme'] as const;
type ToolStatusKey = (typeof STATUS_ORDER)[number];

const STATUS_COLOR: Record<ToolStatusKey, string> = {
  disponible: '#10b981',
  en_pret: '#ff5500',
  maintenance: '#f59e0b',
  manquant: '#ef4444',
  reforme: '#71717a',
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number; name?: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  if (!item) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-300">{label ?? item.name}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-white">
        {item.value} <span className="text-xs font-normal text-slate-400">mouvements</span>
      </p>
    </div>
  );
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { value?: number; name?: string }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  if (!item) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-semibold text-slate-300 capitalize">{item.name}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-white">
        {item.value} <span className="text-xs font-normal text-slate-400">outils</span>
      </p>
    </div>
  );
}

export function ToolsDonut({
  das01,
  onPick,
}: {
  das01: DashboardType['das01'];
  onPick: (status: ToolStatusKey) => void;
}) {
  const data = STATUS_ORDER.filter((status) => das01[status] > 0).map((status) => ({
    status,
    name: STATUS_LABEL[status],
    value: das01[status],
  }));

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row touch-pan-y">
      <div className="relative h-[170px] w-[170px] shrink-0 touch-pan-y">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              {data.map((slice) => (
                <Cell key={slice.status} fill={STATUS_COLOR[slice.status]} onClick={() => onPick(slice.status)} className="cursor-pointer" />
              ))}
            </Pie>
            <Tooltip cursor={false} content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="font-mono text-2xl font-bold leading-none text-ink tabular-nums">{das01.total}</p>
            <p className="mt-1 text-[10px] uppercase font-semibold tracking-wider text-ink-faint">outils</p>
          </div>
        </div>
      </div>
      <div className="grid w-full gap-1.5">
        {STATUS_ORDER.map((status) => (
          <button key={status} type="button" onClick={() => onPick(status)} className="flex min-h-10 items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-xs transition-colors hover:border-amber hover:bg-amber-wash/30">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />
              <span className="truncate font-medium text-ink">{STATUS_LABEL[status]}</span>
            </span>
            <span className="font-mono font-bold text-ink tabular-nums">{das01[status]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DailyMovesChart({
  moves,
  onSelect,
}: {
  moves: { name: string; value: number; color: string }[];
  onSelect: () => void;
}) {
  return (
    <div className="h-44 w-full touch-pan-y">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart data={moves} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 11, fill: '#6b7280' }} />
          <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<ChartTooltip />} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
            {moves.map((bar) => <Cell key={bar.name} fill={bar.color} onClick={onSelect} className="cursor-pointer" />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
