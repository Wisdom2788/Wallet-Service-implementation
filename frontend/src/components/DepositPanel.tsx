import { useState, FormEvent } from 'react';
import { walletApi, newIdempotencyKey } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AxiosError } from 'axios';

interface Props {
  onSuccess: () => void;
}

export default function DepositPanel({ onSuccess }: Props) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

    setLoading(true);
    try {
      
      const key = newIdempotencyKey();
      await walletApi.deposit(user.id, numAmount, key);
      setSuccess(`✓ ₦${numAmount.toLocaleString()} deposited successfully`);
      setAmount('');
      onSuccess();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      setError(axiosErr.response?.data?.error?.message ?? 'Deposit failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [1000, 5000, 10000, 50000];

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
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

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {quickAmounts.map((q) => (
            <button
              key={q}
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setAmount(String(q))}
            >
              ₦{q.toLocaleString()}
            </button>
          ))}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-full"
          disabled={loading || !amount}
        >
          {loading ? <><span className="spinner" /> Processing…</> : '+ Deposit Funds'}
        </button>
      </form>
    </div>
  );
}
