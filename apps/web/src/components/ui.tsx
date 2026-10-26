import {
  useCallback,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { toast } from 'sonner';
import { IconAlert, IconCheck, IconX } from './Icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Drawer as DrawerRoot,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from './ui/drawer';
import { Toaster } from './ui/sonner';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet' | 'success' | 'outline-danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: ReactNode;
  loading?: boolean;
  block?: boolean;
};

const BTN_BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-btn font-medium select-none ' +
  'transition-all duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] ' +
  'active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue';
const BTN_VARIANT: Record<string, string> = {
  primary:
    'bg-amber text-slate-950 font-semibold shadow-xs hover:bg-amber-3 hover:shadow-card ' +
    'focus-visible:outline-blue',
  secondary: 'bg-surface-2 text-ink border border-line-strong hover:bg-surface-3 hover:border-line-strong/80 shadow-xs',
  ghost: 'bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-line-strong/80 shadow-xs',
  quiet: 'bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink',
  danger: 'bg-red text-white shadow-xs hover:opacity-90 hover:shadow-card',
  'outline-danger': 'bg-red-500/10 text-red border border-red-500/30 hover:bg-red-500/20',
  success: 'bg-green text-white shadow-xs hover:bg-green-2 hover:shadow-card',
};
const BTN_SIZE: Record<string, string> = {
  sm: 'h-8 px-3 text-[12px] rounded-[6px]',
  md: 'h-9 px-3.5 text-xs rounded-[8px]',
  lg: 'h-11 px-5 text-sm rounded-[8px]',
  xl: 'h-12 px-6 text-base rounded-[10px]',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  loading,
  block,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], block && 'w-full', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

type Tone = 'green' | 'blue' | 'amber' | 'red' | 'grey' | 'neutral' | 'purple';

const TONE_CLASS: Record<Tone, { chip: string; dot: string }> = {
  green: { chip: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  blue: { chip: 'bg-sky-500/10 text-sky-400 border-sky-500/20', dot: 'bg-sky-400' },
  amber: { chip: 'bg-amber-500/10 text-amber-300 border-amber-500/20', dot: 'bg-amber-400' },
  red: { chip: 'bg-rose-500/10 text-rose-400 border-rose-500/20', dot: 'bg-rose-400' },
  grey: { chip: 'bg-slate-500/10 text-slate-300 border-slate-500/20', dot: 'bg-slate-400' },
  neutral: { chip: 'bg-slate-500/10 text-slate-300 border-slate-500/20', dot: 'bg-slate-400' },
  purple: { chip: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20', dot: 'bg-indigo-400' },
};

export function Chip({
  tone = 'neutral',
  children,
  className,
  dot = true,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const conf = TONE_CLASS[tone] ?? TONE_CLASS.neutral;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
        'transition-colors duration-[120ms]',
        conf.chip,
        className,
      )}
    >
      {dot ? (
        <span
          className={cx('inline-block h-1.5 w-1.5 rounded-full shrink-0', conf.dot)}
          aria-hidden
        />
      ) : null}
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
  hover,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-card border border-line bg-surface shadow-card',
        hover &&
          'transition-all duration-[160ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-card-hover hover:-translate-y-[1px]',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  hint,
  actions,
  eyebrow,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 slide-up">
      <div>
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-blue uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-[24px] font-bold tracking-tight text-ink">{title}</h1>
        {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  className,
  'aria-invalid': ariaInvalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('block', className)}>
      <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">{label}</span>
      <input
        id={id}
        aria-invalid={ariaInvalid}
        className={cx(
          'h-9 w-full rounded-btn border bg-surface px-3 text-xs text-ink placeholder:text-ink-faint',
          'transition-colors duration-[120ms] focus:outline-none focus:ring-2',
          ariaInvalid
            ? 'border-red focus:border-red focus:ring-red/15'
            : 'border-line-strong focus:border-blue focus:ring-blue/15',
        )}
        {...rest}
      />
      {hint ? <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('block', className)}>
      {label ? <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">{label}</span> : null}
      <select
        id={id}
        className={cx(
          'h-9 w-full rounded-btn border border-line-strong bg-surface px-3 text-xs text-ink',
          'transition-colors duration-[120ms] focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/15',
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className={cx('block', className)}>
      {label ? <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">{label}</span> : null}
      <textarea
        id={id}
        className={cx(
          'w-full rounded-btn border border-line-strong bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-faint',
          'transition-colors duration-[120ms] focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue/15',
        )}
        rows={3}
        {...rest}
      />
    </label>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-line-strong bg-surface-2/60 px-6 py-14 text-center fade-in">
      {icon ? (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-surface text-ink-faint border border-line">
          {icon}
        </div>
      ) : (
        <div className="h-10 w-10 rounded-full border border-line-strong bg-surface" />
      )}
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint ? <p className="mt-1 max-w-md text-[13px] text-ink-soft">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'animate-pulse rounded-btn bg-gradient-to-r from-surface-3 via-surface-2 to-surface-3',
        'bg-[length:400px_100%]',
        className,
      )}
      style={{ animation: 'shimmer 1.6s infinite linear' }}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-amber',
        className,
      )}
      role="status"
      aria-label="Chargement"
    />
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: 'info' | 'error' | 'success' | 'warning';
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'border-[#272732] bg-[#141419] text-[#e4e4e7]',
    error: 'border-red/30 bg-red-wash text-[#fca5a5]',
    success: 'border-green/30 bg-green-wash text-[#86efac]',
    warning: 'border-amber/30 bg-amber-wash text-[#fdba74]',
  }[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cx('flex items-start gap-2.5 rounded-btn border px-3.5 py-3 text-sm fade-in', styles, className)}
    >
      <span className="mt-0.5 shrink-0">
        {icon ?? (tone === 'success' ? <IconCheck size={16} /> : <IconAlert size={16} />)}
      </span>
      <div>
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cx(title ? 'mt-0.5' : '')}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <DrawerRoot
      open={open}
      direction="right"
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className={cx(
          'h-full gap-0 bg-paper p-0 shadow-pop',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <DrawerHeader className="border-b border-line bg-surface px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle className="font-semibold text-ink">{title}</DrawerTitle>
              {subtitle ? (
                <DrawerDescription className="mt-0.5 text-[13px] text-ink-soft">
                  {subtitle}
                </DrawerDescription>
              ) : (
                <DrawerDescription className="sr-only">{title}</DrawerDescription>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-btn p-1.5 text-ink-soft transition-colors hover:bg-grey-wash hover:text-ink"
              aria-label="Fermer le panneau"
            >
              <IconX size={18} />
            </button>
          </div>
        </DrawerHeader>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DrawerContent>
    </DrawerRoot>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cx(
          'grid max-h-[92vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden bg-paper p-0 sm:rounded-card',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <DialogHeader className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base font-semibold text-ink">{title}</DialogTitle>
            <button
              onClick={onClose}
              className="rounded-btn p-1.5 text-ink-soft transition-colors hover:bg-grey-wash hover:text-ink"
              aria-label="Fermer"
            >
              <IconX size={18} />
            </button>
          </div>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        <div className="scroll-thin min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type ToastTone = 'info' | 'error' | 'success';

export function useToast() {
  return useCallback((message: string, tone: ToastTone = 'info') => {
    if (tone === 'success') {
      toast.success(message);
    } else if (tone === 'error') {
      toast.error(message);
    } else {
      toast(message);
    }
  }, []);
}

export function ToastHost({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-center" theme="light" className="no-print" />
    </>
  );
}

export function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-2 last:border-b-0">
      <span className="text-[13px] text-ink-soft">{label}</span>
      <span className={cx('ml-auto whitespace-nowrap text-right text-sm font-medium text-ink', mono && 'font-mono num')}>{value}</span>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue';
  icon?: ReactNode;
  trend?: { value: string; positive?: boolean };
}) {
  const toneMap = {
    neutral: 'bg-surface text-ink-soft',
    green: 'bg-green-wash text-green',
    amber: 'bg-amber-wash text-amber',
    red: 'bg-red-wash text-red',
    blue: 'bg-blue-wash text-blue',
  }[tone];
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card transition-all duration-[160ms] hover:shadow-card-hover hover:-translate-y-[1px] slide-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-ink-soft">{label}</p>
          <p className="mt-1.5 text-[28px] font-semibold tracking-[-0.02em] text-ink num leading-none">{value}</p>
          {hint ? <p className="mt-1.5 text-[12px] text-ink-faint">{hint}</p> : null}
        </div>
        {icon ? (
          <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-btn', toneMap)}>{icon}</span>
        ) : null}
      </div>
      {trend ? (
        <p className={cx('mt-2 text-[12px] font-medium', trend.positive ? 'text-green' : 'text-red')}>
          {trend.value}
        </p>
      ) : null}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cx(
        'inline-flex items-center gap-1 rounded-btn border border-line bg-surface-2 p-1',
        size === 'sm' ? 'text-[12px]' : 'text-sm',
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-all duration-[120ms]',
            size === 'sm' ? 'h-7 px-2.5' : 'h-8 px-3',
            value === option.value
              ? 'bg-surface text-ink shadow-xs'
              : 'text-ink-soft hover:text-ink hover:bg-grey-wash/50',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({
  name,
  size = 'md',
  src,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string | null;
}) {
  const sizes = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-[13px]', lg: 'h-14 w-14 text-[17px]', xl: 'h-20 w-20 text-[22px]' }[size];
  const initialsText = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cx(sizes, 'shrink-0 rounded-full object-cover ring-2 ring-line')}
      />
    );
  }
  return (
    <span
      className={cx(
        sizes,
        'grid shrink-0 place-items-center rounded-full bg-charcoal font-semibold text-white ring-2 ring-line',
      )}
    >
      {initialsText || '?'}
    </span>
  );
}

export function ProgressBar({
  value,
  max,
  tone = 'amber',
  className,
}: {
  value: number;
  max: number;
  tone?: 'amber' | 'green' | 'red' | 'blue';
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bar = { amber: 'bg-amber', green: 'bg-green', red: 'bg-red', blue: 'bg-blue' }[tone];
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className={cx('h-full rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]', bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
