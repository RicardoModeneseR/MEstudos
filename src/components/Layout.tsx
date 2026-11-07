import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, BookOpen, CalendarDays, ChartNoAxesCombined, ChevronRight, Ellipsis, GraduationCap, House, LayoutGrid,
  ListChecks, Search, SlidersHorizontal, Sprout, Table2, Timer,
} from 'lucide-react';
import { useList, useSettings, useStore } from '../data/store';
import { useTerm, useToday } from '../data/hooks';
import { pomodoro } from '../data/pomodoro';
import { countdown, diffDays, fmt } from '../lib/dates';
import { reviewsForDay } from '../lib/reviews';
import { BrandMark, cx, Segmented } from './ui';
import { useTheme, type ThemePref } from '../lib/theme';
import { CommandPalette } from './CommandPalette';

export const NAV = [
  { to: '/', label: 'Visão geral', icon: LayoutGrid, end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/grade', label: 'Grade horária', icon: Table2 },
  { to: '/temas', label: 'Matérias e temas', icon: BookOpen },
  { to: '/questoes', label: 'Questões', icon: ChartNoAxesCombined },
  { to: '/planejamento', label: 'Planejamento', icon: ListChecks },
  { to: '/pomodoro', label: 'Pomodoro', icon: Timer },
  { to: '/notas', label: 'Notas', icon: GraduationCap },
];

const TABS = [
  { to: '/', label: 'Hoje', icon: House, end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/temas', label: 'Temas', icon: BookOpen },
  { to: '/pomodoro', label: 'Foco', icon: Timer },
  { to: '/mais', label: 'Mais', icon: Ellipsis },
];

export function initials(name: string, email?: string | null) {
  const base = name.trim() || email?.split('@')[0] || 'Eu';
  const parts = base.split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

function useUpcomingCount() {
  const events = useList('events');
  const today = useToday();
  return events.filter((e) => diffDays(today, e.date) >= 0 && diffDays(today, e.date) <= 30).length;
}

export function ThemeSwitch() {
  const { pref, set } = useTheme();
  return (
    <Segmented<ThemePref>
      value={pref}
      onChange={set}
      options={[
        { value: 'light', label: 'Clara' },
        { value: 'dark', label: 'Escura' },
        { value: 'system', label: 'Sistema' },
      ]}
    />
  );
}

function Sidebar() {
  const term = useTerm();
  const settings = useSettings();
  const email = useStore((s) => s.email);
  const upcoming = useUpcomingCount();
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <BrandMark />
        <span className="brand-name">MEstudos</span>
      </Link>
      <Link to="/grade" className="term-chip">
        <strong>{term ? term.name.replace(/ de /, ' · ') : `${settings.course} · período`}</strong>
        <span className="tiny muted">{term ? `${fmt(term.start, 'dd MMM')} – ${fmt(term.end, 'dd MMM yyyy')}` : 'Configure seu período'}</span>
      </Link>
      <nav className="nav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('nav-link', isActive && 'active')}>
            <Icon />
            <span>{label}</span>
            {to === '/agenda' && upcoming > 0 && <span className="nav-count">{upcoming}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="motto">
        <Sprout size={18} className="accent" />
        <h4>Um tema de cada vez.</h4>
        <p className="tiny muted">Consistência também é cuidar do seu ritmo.</p>
      </div>
      <div>
        <div className="sidebar-section-title">Aparência</div>
        <ThemeSwitch />
        <Link to="/ajustes" className="nav-link mt-2" style={{ padding: '6px 4px', fontSize: 12.5 }}>
          <SlidersHorizontal style={{ width: 15, height: 15 }} />
          Preferências e lembretes
        </Link>
      </div>
      <Link to="/ajustes" className="user-chip" style={{ textDecoration: 'none' }}>
        <span className="avatar">{initials(settings.displayName, email)}</span>
        <span className="grow">
          <strong className="small" style={{ display: 'block', fontWeight: 600 }}>{settings.displayName || email || 'Você'}</strong>
          <SyncLabel />
        </span>
      </Link>
    </aside>
  );
}

function SyncLabel() {
  const sync = useStore((s) => s.sync);
  const text = { local: 'Salvo neste aparelho', synced: 'Sincronizado', syncing: 'Sincronizando…', offline: 'Offline · salvo no aparelho', error: 'Erro ao sincronizar' }[sync];
  return <span className={cx('tiny', sync === 'error' ? 'danger-text' : 'muted')}>{text}</span>;
}

function Bellmenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const events = useList('events');
  const topics = useList('topics');
  const today = useToday();
  const navigate = useNavigate();

  const items = useMemo(() => {
    const out: { key: string; title: string; sub: string; to: string; urgent: boolean }[] = [];
    for (const e of events) {
      const d = diffDays(today, e.date);
      if (d < 0 || d > 7) continue;
      out.push({ key: e.id, title: e.title, sub: `${countdown(today, e.date)}${e.time ? ` · ${e.time}` : ''}`, to: '/agenda', urgent: d <= 1 });
    }
    out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
    const { pending } = reviewsForDay(topics, today);
    for (const r of pending) out.push({ key: r.topic.id + r.index, title: `Revisar ${r.topic.name}`, sub: r.overdue ? 'Revisão atrasada' : 'Revisão de hoje', to: `/temas?tema=${r.topic.id}`, urgent: r.overdue });
    return out;
  }, [events, topics, today]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label="Avisos" onClick={() => setOpen((o) => !o)}>
        <Bell />
        {items.length > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="popover">
          <div className="row-between" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 17 }}>Avisos</h3>
            <Link to="/ajustes" className="card-link" onClick={() => setOpen(false)}>Lembretes</Link>
          </div>
          {items.length === 0 && <p className="small muted" style={{ padding: '12px 0' }}>Nada urgente por aqui. Aproveite o respiro.</p>}
          {items.map((it) => (
            <button key={it.key} className="palette-item" onClick={() => { setOpen(false); navigate(it.to); }}>
              <span className={cx('swatch', it.urgent ? 'tinted c-rose' : 'tinted c-plum')} />
              <span className="grow">
                <span className="small" style={{ display: 'block', fontWeight: 600 }}>{it.title}</span>
                <span className="tiny muted">{it.sub}</span>
              </span>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TITLES: Record<string, string> = {
  '/': 'Visão geral', '/agenda': 'Agenda', '/grade': 'Grade horária', '/temas': 'Matérias e temas', '/questoes': 'Questões',
  '/planejamento': 'Planejamento', '/pomodoro': 'Pomodoro', '/notas': 'Notas', '/ajustes': 'Preferências e lembretes', '/mais': 'Mais',
};

export function Layout() {
  const { pathname } = useLocation();
  const [palette, setPalette] = useState(false);
  const settings = useSettings();
  const email = useStore((s) => s.email);
  const term = useTerm();
  const today = useToday();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // relógio global do pomodoro: conclui ciclos mesmo fora da página do timer
  useEffect(() => {
    pomodoro.tick();
    const id = setInterval(pomodoro.tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const weekOfTerm = term ? Math.min(Math.ceil((diffDays(term.start, today) + 1) / 7), Math.ceil((diffDays(term.start, term.end) + 1) / 7)) : null;
  const totalWeeks = term ? Math.ceil((diffDays(term.start, term.end) + 1) / 7) : null;

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            Meu caderno <ChevronRight size={14} /> <strong>{TITLES[pathname] ?? (pathname.startsWith('/quiz') ? 'Questões do tema' : '')}</strong>
          </div>
          <button className="search-trigger" onClick={() => setPalette(true)}>
            <Search size={15} /> Buscar tema, resumo ou evento <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
          <Bellmenu />
          <span className="small muted nowrap">{fmt(today, 'EEE, dd MMM yyyy').replace(/^./, (c) => c.toUpperCase())}</span>
        </header>
        <header className="mobile-header">
          <Link to="/" className="brand" style={{ padding: 0 }}>
            <BrandMark />
            <span className="brand-name">MEstudos</span>
          </Link>
          <div className="row" style={{ gap: 2 }}>
            <button className="icon-btn" aria-label="Buscar" onClick={() => setPalette(true)}>
              <Search />
            </button>
            <Bellmenu />
            <Link to="/ajustes" className="avatar" style={{ textDecoration: 'none', marginLeft: 4 }}>
              {initials(settings.displayName, email)}
            </Link>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
        <footer className="footer-note">
          <span>{term && weekOfTerm && weekOfTerm > 0 ? `${term.name} · ${weekOfTerm} de ${totalWeeks} semanas do seu semestre` : ''}</span>
          <span>Seu progresso não precisa ser perfeito para ser real.</span>
        </footer>
      </div>
      <nav className="tabbar">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => cx('tab', (isActive || (to === '/mais' && ['/grade', '/questoes', '/planejamento', '/notas', '/ajustes'].includes(pathname)) || (to === '/temas' && pathname.startsWith('/quiz'))) && 'active')}
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </div>
  );
}
