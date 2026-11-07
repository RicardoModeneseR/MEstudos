import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { hasLocalData, importLocalData, loadScope, useStore } from './data/store';
import { Layout } from './components/Layout';
import { Modal, Toasts } from './components/ui';
import { LoginPage } from './pages/Login';
import { OverviewPage } from './pages/Overview';
import { AgendaPage } from './pages/Agenda';
import { SchedulePage } from './pages/Schedule';
import { SubjectsPage } from './pages/Subjects';
import { QuestionsPage } from './pages/Questions';
import { PlanningPage } from './pages/Planning';
import { PomodoroPage } from './pages/Pomodoro';
import { GradesPage } from './pages/Grades';
import { SettingsPage } from './pages/Settings';
import { MorePage } from './pages/More';
import { QuizPage } from './pages/Quiz';

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const loaded = useStore((s) => s.loaded);
  const [offerImport, setOfferImport] = useState(false);

  useEffect(() => {
    if (!supabase) {
      loadScope(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase || session === undefined) return;
    if (userId) {
      loadScope(userId, session?.user.email ?? null).then(() => setOfferImport(hasLocalData())).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (supabase && session === undefined) return <Splash />;
  if (supabase && !session) return <LoginPage />;
  if (!loaded) return <Splash />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="grade" element={<SchedulePage />} />
          <Route path="temas" element={<SubjectsPage />} />
          <Route path="questoes" element={<QuestionsPage />} />
          <Route path="planejamento" element={<PlanningPage />} />
          <Route path="pomodoro" element={<PomodoroPage />} />
          <Route path="notas" element={<GradesPage />} />
          <Route path="ajustes" element={<SettingsPage />} />
          <Route path="mais" element={<MorePage />} />
          <Route path="quiz/:id" element={<QuizPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toasts />
      {offerImport && (
        <Modal
          title="Levar seus dados para a conta?"
          onClose={() => setOfferImport(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOfferImport(false)}>Agora não</button>
              <button className="btn btn-primary" onClick={() => { importLocalData(); setOfferImport(false); }}>Importar</button>
            </>
          }
        >
          <p className="muted">Encontramos dados salvos neste aparelho antes do login. Importe para que eles apareçam também nos outros aparelhos.</p>
        </Modal>
      )}
    </BrowserRouter>
  );
}

function Splash() {
  return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>Abrindo seu caderno…</div>;
}
