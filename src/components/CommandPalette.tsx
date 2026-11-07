import { useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarDays, FileText, Folder } from 'lucide-react';
import { useList } from '../data/store';
import { useSubjectMap } from '../data/hooks';
import { fmt } from '../lib/dates';
import { cx } from './ui';
import { NAV } from './Layout';

interface Item {
  key: string;
  icon: ComponentType<{ size?: number }>;
  title: string;
  sub: string;
  to: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const navigate = useNavigate();
  const topics = useList('topics');
  const events = useList('events');
  const subjects = useSubjectMap();

  const items = useMemo<Item[]>(() => {
    const term = norm(q.trim());
    const pages: Item[] = NAV.map((n) => ({ key: n.to, icon: n.icon, title: n.label, sub: 'Página', to: n.to }));
    if (!term) return pages;
    const out: Item[] = [];
    for (const s of subjects.values()) {
      if (norm(s.name).includes(term)) out.push({ key: s.id, icon: Folder, title: s.name, sub: 'Matéria', to: `/temas?materia=${s.id}` });
    }
    for (const t of topics) {
      const inName = norm(t.name).includes(term);
      const inSummary = !inName && norm(t.summary).includes(term);
      if (inName || inSummary) {
        out.push({
          key: t.id,
          icon: inSummary ? FileText : BookOpen,
          title: t.name,
          sub: `${subjects.get(t.subjectId)?.name ?? 'Tema'}${inSummary ? ' · encontrado no resumo' : ''}`,
          to: `/temas?tema=${t.id}`,
        });
      }
    }
    for (const e of events) {
      if (norm(e.title).includes(term) || norm(e.notes ?? '').includes(term)) {
        out.push({ key: e.id, icon: CalendarDays, title: e.title, sub: `Evento · ${fmt(e.date, "dd 'de' MMM")}`, to: `/agenda?evento=${e.id}` });
      }
    }
    return [...out, ...pages.filter((p) => norm(p.title).includes(term))].slice(0, 30);
  }, [q, topics, events, subjects]);

  const go = (it: Item | undefined) => {
    if (!it) return;
    navigate(it.to);
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette" role="dialog" aria-label="Buscar">
        <input
          autoFocus
          className="palette-input"
          placeholder="Buscar tema, resumo ou evento…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === 'Enter') go(items[sel]);
            if (e.key === 'Escape') onClose();
          }}
        />
        <div className="palette-list">
          {items.length === 0 && <p className="empty small">Nada encontrado para “{q}”.</p>}
          {items.map((it, i) => (
            <button key={it.key} className={cx('palette-item', i === sel && 'sel')} onMouseEnter={() => setSel(i)} onClick={() => go(it)}>
              <it.icon size={16} />
              <span className="grow">
                <span style={{ display: 'block', fontWeight: 500 }}>{it.title}</span>
                <span className="tiny muted">{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
