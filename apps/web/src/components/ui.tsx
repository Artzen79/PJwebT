import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { sportColor } from '../lib/format';

type Variant = 'primary' | 'turf' | 'ghost' | 'danger' | 'quiet' | 'quiet-danger';

const variants: Record<Variant, string> = {
  primary:
    'bg-linear-to-b from-mark-hi to-mark text-mark-ink font-semibold shadow-[inset_0_-3px_0_rgb(0_0_0/0.22)] hover:shadow-[inset_0_-3px_0_rgb(0_0_0/0.22),0_0_14px_rgb(245_197_66/0.45)]',
  turf: 'bg-turf text-turf-ink font-semibold shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)] hover:brightness-110',
  ghost: 'border-2 border-line bg-sunken hover:border-line-hi',
  danger: 'bg-danger-strong text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.25)] hover:brightness-110',
  quiet: 'text-muted hover:text-ink hover:bg-sunken',
  'quiet-danger': 'text-danger hover:bg-danger-soft',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  pending,
  className = '',
  children,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; pending?: boolean }) {
  const sizes = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4', lg: 'h-12 px-6 text-lg' };
  return (
    <button
      type="button"
      disabled={pending || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'ghost', className = '', children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 font-medium transition ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export const Spinner = () => <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;

const inputClass =
  'w-full rounded-lg border-2 border-line bg-sunken px-3 py-2 text-ink placeholder:text-muted/70 focus:border-mark focus:outline-none focus:ring-2 focus:ring-mark/25 file:mr-3 file:rounded-md file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm file:text-ink';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

// :read-only also matches <select>, so the read-only look lives on Input alone
export const Input = (props: ComponentProps<'input'>) => (
  <input {...props} className={`${inputClass} read-only:border-line/50 read-only:text-muted ${props.className ?? ''}`} />
);
export const Select = (props: ComponentProps<'select'>) => <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
export const Textarea = (props: ComponentProps<'textarea'>) => <textarea rows={3} {...props} className={`${inputClass} ${props.className ?? ''}`} />;

const tones = {
  mark: 'bg-mark/15 text-mark ring-mark/70',
  turf: 'bg-turf/15 text-turf ring-turf/60',
  info: 'bg-info/15 text-info ring-info/50',
  muted: 'bg-sunken text-muted ring-line',
  danger: 'bg-danger/15 text-danger ring-danger/60',
};

export function Badge({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-xl border-2 border-line bg-linear-to-b from-surface-hi to-surface ${className}`}>{children}</section>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-line bg-sunken/50 px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold uppercase">{title}</p>
      {children && <div className="mt-3 text-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/50 bg-danger-soft px-3 py-2 text-sm text-danger">
      {error instanceof Error ? error.message : String(error)}
    </p>
  );
}

export function Loading({ label = 'กำลังโหลด' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-muted" aria-live="polite">
      <Spinner /> {label}
    </div>
  );
}

// Native <dialog>: focus trap, Esc to close and inert background come for free.
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[20px] border-2 border-line-hi bg-panel p-0 text-ink shadow-[0_0_0_4px_var(--frame),0_18px_50px_rgb(0_0_0/0.6)]"
    >
      <div className="m-2 flex items-center justify-between gap-3 rounded-xl bg-sunken/70 px-4 py-2.5">
        <h2 className="text-lg">{title}</h2>
        <IconButton label="ปิด" onClick={onClose} tone="danger">
          ×
        </IconButton>
      </div>
      <div className="px-5 pt-2 pb-5">{open && children}</div>
    </dialog>
  );
}

// Each sport's real line markings, drawn on a 120×80 court (net/halfway at x = 60).
const courtLines: Record<string, ReactNode> = {
  '⚽': (
    <>
      <path d="M60 8v64M8 24h14v32H8M112 24H98v32h14M8 33h5v14H8M112 33h-5v14h5" />
      <circle cx="60" cy="40" r="10" />
    </>
  ),
  '🏸': <path d="M8 13h104M8 67h104M48 8v64M72 8v64M14 8v64M106 8v64M8 40h40M72 40h40M60 6v68" strokeWidth="1.6" />,
  '🏀': (
    <>
      <path d="M60 8v64M8 30h22v20H8M112 30H90v20h22M8 13h6a27 27 0 0 1 0 54H8M112 13h-6a27 27 0 0 0 0 54h6" />
      <circle cx="60" cy="40" r="8" />
    </>
  ),
  '🎾': <path d="M8 16h104M8 64h104M33 16v48M87 16v48M33 40h54M60 5v70" />,
  '🏓': <path d="M8 40h104M60 4v72" strokeWidth="1.6" />,
  '🏐': <path d="M43 8v64M77 8v64M60 4v72" />,
};

// Placeholder art when a court or item has no photo: the sport's surface and its line markings
// (courts), or a plain swatch of that surface (equipment).
export function SportArt({
  icon,
  sportId = 0,
  imageUrl,
  gear = false,
  className = '',
}: { icon: string; sportId?: number; imageUrl?: string | null; gear?: boolean; className?: string }) {
  if (imageUrl) return <img src={imageUrl} alt="" className={`object-cover ${className}`} />;
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: sportColor(icon, sportId), containerType: 'inline-size' }}
      aria-hidden
    >
      {gear ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_55%,rgb(255_255_255/0.28),transparent_60%)]" />
      ) : (
        <svg viewBox="0 0 120 80" className="absolute inset-0 size-full" preserveAspectRatio="none">
          <g fill="none" stroke="white" strokeOpacity="0.6" strokeWidth="1.1">
            <rect x="8" y="8" width="104" height="64" />
            {courtLines[icon] ?? <path d="M60 8v64" />}
          </g>
        </svg>
      )}
      <span className="absolute inset-0 grid place-items-center drop-shadow-md" style={{ fontSize: gear ? 'clamp(2rem, 30cqw, 7rem)' : 'clamp(1.25rem, 16cqw, 4.5rem)' }}>
        {icon}
      </span>
    </div>
  );
}

// Square 32px icon button from the game header (settings, mail, close).
export function IconButton({ label, tone, className = '', children, ...props }: ComponentProps<'button'> & { label: string; tone?: 'danger' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid size-8 shrink-0 place-items-center rounded-lg border-2 text-lg leading-none transition hover:border-line-hi ${tone === 'danger' ? 'border-danger-strong/70 bg-danger-soft text-danger' : 'border-line bg-sunken text-ink'} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// Amber progress bar on a dark well track, as in the farming HUD and battle pass.
export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-sunken ${className}`}>
      <div className="h-full rounded-full bg-linear-to-r from-prog to-prog-hi" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="text-mark" aria-label={`${value} จาก 5 ดาว`}>
      {'★'.repeat(Math.round(value))}
      <span className="text-muted/40">{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  );
}
