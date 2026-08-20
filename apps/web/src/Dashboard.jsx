import { useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function formatMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);
}

export default function Dashboard({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/me/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || 'Failed to load dashboard');
          return;
        }
        setData(body);
      } catch (err) {
        setError('Network error loading dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  if (loading) return <div style={{ padding: 40 }}>Loading your accounts…</div>;
  if (error) return <div style={{ padding: 40, color: 'crimson' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 480, margin: '60px auto', fontFamily: 'sans-serif' }}>
      <h1>Dashboard</h1>
      <p style={{ fontSize: 28, fontWeight: 600 }}>{formatMoney(data.total_balance)}</p>
      <p style={{ color: '#666' }}>Total across {data.accounts.length} account{data.accounts.length === 1 ? '' : 's'}</p>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 24 }}>
        {data.accounts.map((a) => (
          <li key={a.account_id} style={{ padding: '12px 0', borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{a.name} {a.mask ? `••${a.mask}` : ''}</span>
              <strong>{formatMoney(a.current_balance)}</strong>
            </div>
            <div style={{ fontSize: 12, color: '#999', textTransform: 'capitalize' }}>{a.subtype || a.type}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
