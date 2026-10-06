import { type ComponentProps, type ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { sportColor } from '../lib/format';

type Variant = 'primary' | 'turf' | 'ghost' | 'danger' | 'quiet' | 'quiet-danger';

const variants: Record<Variant, string> = {
  primary: 'bg-mark text-mark-ink hover:brightness-95 shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]',
  turf: 'bg-turf text-white hover:brightness-110',
  ghost: 'border border-line bg-surface hover:border-ink/40',
  danger: 'bg-danger text-white hover:brightness-110',
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${variants[variant]} ${className}`}
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
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted/70 focus:border-turf focus:outline-none focus:ring-2 focus:ring-turf/25 file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-3 file:py-1 file:text-sm file:text-ink';

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
  <input {...props} className={`${inputClass} read-only:bg-sunken read-only:text-muted ${props.className ?? ''}`} />
);
export const Select = (props: ComponentProps<'select'>) => <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
export const Textarea = (props: ComponentProps<'textarea'>) => <textarea rows={3} {...props} className={`${inputClass} ${props.className ?? ''}`} />;

const tones = {
  mark: 'bg-mark/25 text-ink ring-mark/60',
  turf: 'bg-turf-soft text-turf ring-turf/30',
  info: 'bg-info/10 text-info ring-info/30',
  muted: 'bg-sunken text-muted ring-line',
  danger: 'bg-danger-soft text-danger ring-danger/30',
};

export function Badge({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}

export function Panel({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</section>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-lg">{title}</p>
      {children && <div className="mt-3 text-muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
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
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-md px-2 text-2xl leading-none text-muted hover:text-ink" aria-label="ปิด">
          ×
        </button>
      </div>
      <div className="p-5">{open && children}</div>
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

export function Stars({ value }: { value: number }) {
  return (
    <span className="text-mark" aria-label={`${value} จาก 5 ดาว`}>
      {'★'.repeat(Math.round(value))}
      <span className="text-line">{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  );
}
