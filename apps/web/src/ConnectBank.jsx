import { useEffect, useState, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function ConnectBank({ token, onConnected }) {
  const [linkToken, setLinkToken] = useState(null);
  const [error, setError] = useState('');
  const [exchanging, setExchanging] = useState(false);

  useEffect(() => {
    async function fetchLinkToken() {
      try {
        const res = await fetch(`${API_BASE}/plaid/link-token`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Could not start bank connection');
          return;
        }
        setLinkToken(data.link_token);
      } catch (err) {
        setError('Network error fetching link token');
      }
    }
    fetchLinkToken();
  }, [token]);

  const onSuccess = useCallback(async (public_token) => {
    setExchanging(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/plaid/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ public_token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to link account');
        return;
      }
      onConnected();
    } catch (err) {
      setError('Network error exchanging token');
    } finally {
      setExchanging(false);
    }
  }, [token, onConnected]);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>Connect your bank</h1>
      <p>Use Plaid Sandbox to link a test account.</p>
      <button onClick={() => open()} disabled={!ready || exchanging} style={{ padding: '10px 20px' }}>
        {exchanging ? 'Linking…' : 'Connect a bank'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  );
}
