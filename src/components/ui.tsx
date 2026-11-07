import { useEffect, useRef, type ReactNode } from 'react';
import { create } from 'zustand';
import { Check as CheckIcon, X } from 'lucide-react';
import type { Subject } from '../data/types';

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden>
      <path
        d="M6 32c1.6-7 2.4-15.5 4.2-21.5.6-2 2.4-2.1 3.2-.2L20 25l6.6-14.7c.8-1.9 2.6-1.8 3.2.2C31.6 16.5 32.4 25 34 32"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Modal({ title, onClose, children, footer, className }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', className)} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <X />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('segmented', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={cx(o.value === value && 'on')} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className={cx('toggle', on && 'on')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Check({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className={cx('check', on && 'on')} role="checkbox" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      {on && <CheckIcon />}
    </button>
  );
}

export function Progress({ value, thin }: { value: number; thin?: boolean }) {
  return (
    <div className={cx('progress', thin && 'progress-thin')}>
      <div style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cx('field', className)}>
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function SubjectSelect({ subjects, value, onChange, allowEmpty, emptyLabel = 'Sem matéria', className = 'select' }: { subjects: Subject[]; value: string | undefined; onChange: (id: string | undefined) => void; allowEmpty?: boolean; emptyLabel?: string; className?: string }) {
  return (
    <select className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {(allowEmpty || !value) && <option value="">{allowEmpty ? emptyLabel : 'Escolha a matéria'}</option>}
      {[...subjects].sort((a, b) => a.order - b.order).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

/** Lista de dias (ex.: lembretes "3 dias antes") editável com chips. */
export function DayChips({ days, onChange, suffix = 'antes' }: { days: number[]; onChange: (d: number[]) => void; suffix?: string }) {
  const ref = useRef<HTMLSelectElement>(null);
  const options = [0, 1, 2, 3, 5, 7, 14].filter((d) => !days.includes(d));
  return (
    <div className="row wrap">
      {[...days].sort((a, b) => b - a).map((d) => (
        <span key={d} className="chip-x">
          {d === 0 ? 'No dia' : `${d} ${d === 1 ? 'dia' : 'dias'} ${suffix}`}
          <button type="button" aria-label="Remover" onClick={() => onChange(days.filter((x) => x !== d))}>
            <X />
          </button>
        </span>
      ))}
      {options.length > 0 && (
        <select
          ref={ref}
          className="select input-sm"
          style={{ width: 'auto' }}
          value=""
          onChange={(e) => {
            if (e.target.value !== '') onChange([...days, Number(e.target.value)]);
          }}
        >
          <option value="">+ Adicionar</option>
          {options.map((d) => (
            <option key={d} value={d}>
              {d === 0 ? 'No dia' : `${d} ${d === 1 ? 'dia' : 'dias'} ${suffix}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/* ---------- toasts ---------- */

interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }));
let toastId = 0;

export function toast(text: string, action?: Toast['action']) {
  const id = ++toastId;
  useToasts.setState((s) => ({ list: [...s.list, { id, text, action }] }));
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), action ? 6000 : 3000);
}

export function Toasts() {
  const list = useToasts((s) => s.list);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                useToasts.setState((s) => ({ list: s.list.filter((x) => x.id !== t.id) }));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
