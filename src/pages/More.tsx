import { Link } from 'react-router-dom';
import { ChartNoAxesCombined, ChevronRight, GraduationCap, ListChecks, SlidersHorizontal, Table2 } from 'lucide-react';

const ITEMS = [
  { to: '/planejamento', label: 'Planejamento', sub: 'Distribua os temas pela semana', icon: ListChecks },
  { to: '/grade', label: 'Grade horária', sub: 'Aulas do período', icon: Table2 },
  { to: '/questoes', label: 'Questões', sub: 'Registro e desempenho', icon: ChartNoAxesCombined },
  { to: '/notas', label: 'Notas', sub: 'Médias e quanto falta para passar', icon: GraduationCap },
  { to: '/ajustes', label: 'Preferências e lembretes', sub: 'Avisos, aparência, conta e backup', icon: SlidersHorizontal },
];

export function MorePage() {
  return (
    <>
      <div className="page-head"><div><h1>Mais</h1><p>Tudo o que não coube na barra de baixo.</p></div></div>
      <div className="card" style={{ padding: '4px 16px' }}>
        {ITEMS.map(({ to, label, sub, icon: Icon }) => (
          <Link key={to} to={to} className="list-row" style={{ textDecoration: 'none' }}>
            <span className="more-icon"><Icon size={18} /></span>
            <span className="grow">
              <strong style={{ display: 'block', fontWeight: 600 }}>{label}</strong>
              <span className="tiny muted">{sub}</span>
            </span>
            <ChevronRight size={16} className="faint" />
          </Link>
        ))}
      </div>
    </>
  );
}
