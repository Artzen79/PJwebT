import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Toaster } from 'sonner';
import { api, ok, useMe } from '../api';
import { useCart } from '../lib/cart';

// Server-Sent Events: whenever any booking holds or frees a slot, refetch what shows availability.
function useLiveAvailability() {
  const qc = useQueryClient();
  useEffect(() => {
    const events = new EventSource('/api/v1/events/availability');
    events.addEventListener('availability', () => {
      for (const key of ['board', 'availability', 'equipment-stock', 'cart']) qc.invalidateQueries({ queryKey: [key] });
    });
    return () => events.close();
  }, [qc]);
}

function readTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage blocked: fall back to the system preference
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // per-viewer convenience only
    }
  }, [theme]);
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
      aria-label={theme === 'dark' ? 'ใช้ธีมสว่าง' : 'ใช้ธีมมืด'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-3 py-1.5 text-[0.95rem] transition ${isActive ? 'bg-ink text-bg' : 'text-muted hover:text-ink'}`;

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="7" className="fill-turf" />
        <rect x="6" y="8" width="20" height="16" fill="none" stroke="white" strokeWidth="2" />
        <path d="M16 8v16" stroke="#f5c518" strokeWidth="2" />
      </svg>
      SportHub
    </Link>
  );
}

export function Layout() {
  useLiveAvailability();
  const me = useMe().data;
  const cart = useCart(Boolean(me)).data;
  const count = (cart?.slots.length ?? 0) + (cart?.equipment.length ?? 0);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => ok(api.POST('/api/v1/auth/logout')),
    onSuccess: () => {
      qc.clear();
      navigate('/');
    },
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Logo />
          <nav className="ml-4 hidden gap-1 md:flex" aria-label="เมนูหลัก">
            <MainLinks admin={me?.role === 'admin'} signedIn={Boolean(me)} />
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {me && (
              <Link to="/cart" className="relative grid h-9 place-items-center rounded-lg px-3 text-sm font-medium hover:bg-sunken" aria-label={`ตะกร้า ${count} รายการ`}>
                ตะกร้า
                {count > 0 && (
                  <span className="num absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-mark text-xs font-bold text-mark-ink">{count}</span>
                )}
              </Link>
            )}
            {me ? (
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-1 hover:bg-sunken">
                  {me.avatarUrl ? (
                    <img src={me.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-8 place-items-center rounded-full bg-turf font-display text-sm font-bold text-white">{me.name.slice(0, 1)}</span>
                  )}
                  <span className="hidden max-w-32 truncate text-sm sm:block">{me.name}</span>
                </summary>
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
                  <Link to="/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-sunken">
                    ข้อมูลส่วนตัว
                  </Link>
                  <Link to="/bookings" className="block rounded-lg px-3 py-2 text-sm hover:bg-sunken">
                    การจองของฉัน
                  </Link>
                  <button type="button" onClick={() => logout.mutate()} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft">
                    ออกจากระบบ
                  </button>
                </div>
              </details>
            ) : (
              <Link to="/login" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg">
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="เมนูหลัก">
          <MainLinks admin={me?.role === 'admin'} signedIn={Boolean(me)} />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted">
          <span>SportHub ระบบจองสนามกีฬาและยืมอุปกรณ์</span>
          <a href="/docs" className="hover:text-ink">
            เอกสาร API
          </a>
        </div>
      </footer>
      <Toaster position="bottom-center" richColors closeButton />
    </div>
  );
}

function MainLinks({ admin, signedIn }: { admin: boolean; signedIn: boolean }) {
  return (
    <>
      <NavLink to="/" end className={navClass}>
        ตารางว่าง
      </NavLink>
      <NavLink to="/courts" className={navClass}>
        สนาม
      </NavLink>
      <NavLink to="/equipment" className={navClass}>
        ยืมอุปกรณ์
      </NavLink>
      {signedIn && (
        <NavLink to="/bookings" className={navClass}>
          การจองของฉัน
        </NavLink>
      )}
      {admin && (
        <NavLink to="/admin" className={navClass}>
          ผู้ดูแลระบบ
        </NavLink>
      )}
    </>
  );
}
