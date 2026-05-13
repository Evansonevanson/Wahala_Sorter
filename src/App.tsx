import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LoginForm } from './components/LoginForm';
import { WahalaBoard } from './components/WahalaBoard';

function App() {
  const [loginSource, setLoginSource] = useState<'nav' | 'limit' | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('dark-mode');
    return stored ? stored === 'true' : false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('dark-mode', String(isDark));
  }, [isDark]);

  const toggleDark = () => setIsDark((prev) => !prev);

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <Navbar isLoggedIn={isLoggedIn} userName={userName} isDark={isDark} onToggleDark={toggleDark} onLoginClick={() => setLoginSource('nav')} onLogout={() => setIsLoggedIn(false)} />
      <main className="flex-1 w-full">
        <WahalaBoard isLoggedIn={isLoggedIn} onShowLogin={() => setLoginSource('limit')} />
      </main>
      {loginSource && (
        <LoginForm
          message={loginSource === 'limit' ? "You've reached the limit of 5 tasks. Login to add more." : undefined}
          onClose={() => setLoginSource(null)}
          onLogin={(name) => {
            setIsLoggedIn(true);
            if (name) setUserName(name.split(' ')[0]);
            setLoginSource(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
