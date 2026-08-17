import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LeagueDataProvider, useLeagueData } from './context/LeagueDataContext';
import { Nav } from './components/Nav';
import { LoadingState, ErrorState } from './components/LoadingError';
import { Standings } from './pages/Standings';
import { Participants } from './pages/Participants';
import { TopPlayers } from './pages/TopPlayers';
import { TeamPage } from './pages/TeamPage';

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
            <Route path="/teilnehmer" element={<Participants />} />
            <Route path="/top-spieler" element={<TopPlayers />} />
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
