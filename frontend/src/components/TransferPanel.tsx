import { useState, useEffect, FormEvent } from 'react';
import { walletApi, usersApi, newIdempotencyKey, User } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AxiosError } from 'axios';

interface Props {
  onSuccess: () => void;
}

export default function TransferPanel({ onSuccess }: Props) {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [toUserId, setToUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    usersApi
      .listAll()
      .then((res) => setUsers(res.data.data))
      .catch(() => setError('Could not load user list'))
      .finally(() => setLoadingUsers(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');
    setSuccess('');

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }
    if (!toUserId) {
      setError('Please select a recipient');
      return;
    }

    setLoading(true);
    try {
      const key = newIdempotencyKey();
      await walletApi.transfer(user.id, toUserId, numAmount, key);
      const recipient = users.find((u) => u.id === toUserId);
      setSuccess(`✓ ₦${numAmount.toLocaleString()} transferred to ${recipient?.name ?? 'recipient'}`);
      setAmount('');
      setToUserId('');
      onSuccess();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      setError(axiosErr.response?.data?.error?.message ?? 'Transfer failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Recipient</label>
          {loadingUsers ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              Loading users…
            </div>
          ) : users.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No other users found. Ask someone to register!
            </div>
          ) : (
            <select
              className="form-select"
              value={toUserId}
              onChange={(e) => { setToUserId(e.target.value); setError(''); setSuccess(''); }}
              required
            >
              <option value="">— Select recipient —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Amount (₦)</label>
          <input
            className="form-input"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(''); setSuccess(''); }}
            min="0.01"
            step="0.01"
            required
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={loading || !amount || !toUserId || loadingUsers}
        >
          {loading ? <><span className="spinner" /> Processing…</> : '↗ Send Money'}
        </button>
      </form>
    </div>
  );
}
