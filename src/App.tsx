import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LeagueDataProvider, useLeagueData } from './context/LeagueDataContext';
import { Nav } from './components/Nav';
import { LoadingState, ErrorState } from './components/LoadingError';
import { Standings } from './pages/Standings';
import { Participants } from './pages/Participants';
import { TopPlayers } from './pages/TopPlayers';
import { TeamPage } from './pages/TeamPage';
import { Schedule } from './pages/Schedule';
import { FunFacts } from './pages/FunFacts';
import { PlayerHistory } from './pages/PlayerHistory';
import { Draft } from './pages/Draft';
import { Awards } from './pages/Awards';

function AppShell() {
  const { loading, error, reload } = useLeagueData();

  return (
    <div className="app">
      <Nav />
      <main className="main">
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !error && (
          <Routes>
            <Route path="/" element={<Standings />} />
            <Route path="/spielplan" element={<Schedule />} />
            <Route path="/teilnehmer" element={<Participants />} />
            <Route path="/top-spieler" element={<TopPlayers />} />
            <Route path="/fun-facts" element={<FunFacts />} />
            <Route path="/spieler-historie" element={<PlayerHistory />} />
            <Route path="/draft" element={<Draft />} />
            <Route path="/awards" element={<Awards />} />
            <Route path="/team/:rosterId" element={<TeamPage />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <LeagueDataProvider>
        <AppShell />
      </LeagueDataProvider>
    </BrowserRouter>
  );
}
