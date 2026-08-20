import { useState } from 'react';
import ConnectBank from './ConnectBank';
import Dashboard from './Dashboard';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function App() {
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);
  const [connected, setConnected] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }
      setToken(data.token);
    } catch (err) {
      setError('Network error — is the API awake? (Render free tier can take ~60s to cold start)');
    } finally {
      setLoading(false);
    }
  }

  if (token && !connected) {
    return <ConnectBank token={token} onConnected={() => setConnected(true)} />;
  }

  if (token && connected) {
    return <Dashboard token={token} />;
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif' }}>
      <h1>iBag</h1>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: 8, padding: 8 }} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: 8, padding: 8 }} required />
        <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
          {loading ? 'Please wait…' : mode === 'signup' ? 'Sign Up' : 'Log In'}
        </button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <p style={{ textAlign: 'center', marginTop: 12 }}>
        <button onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
          style={{ background: 'none', border: 'none', color: '#06c', cursor: 'pointer' }}>
          {mode === 'signup' ? 'Already have an account? Log in' : "Need an account? Sign up"}
        </button>
      </p>
    </div>
  );
}
