import { useEffect, useState, useCallback } from 'react';
import { walletApi, TransactionHistoryItem } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Props {
  refreshKey: number;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAmount(amount: number, direction: 'CREDIT' | 'DEBIT') {
  const sign = direction === 'CREDIT' ? '+' : '-';
  return `${sign}₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

function txLabel(tx: TransactionHistoryItem): string {
  if (tx.type === 'DEPOSIT') return 'Deposit';
  if (tx.direction === 'DEBIT') return `Transfer to ${tx.counterparty_name ?? 'User'}`;
  return `Received from ${tx.counterparty_name ?? 'User'}`;
}

function txIcon(tx: TransactionHistoryItem): string {
  if (tx.type === 'DEPOSIT') return '↓';
  if (tx.direction === 'DEBIT') return '↑';
  return '↓';
}

export default function TransactionList({ refreshKey }: Props) {
  const { user } = useAuth();
  const [txs, setTxs] = useState<TransactionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchTxs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const res = await walletApi.getTransactions(user.id);
      setTxs(res.data.data.transactions);
    } catch {
      setError('Could not load transactions');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchTxs(); }, [fetchTxs, refreshKey]);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⟳</div>
        Loading transactions…
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (txs.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        No transactions yet. Deposit funds to get started!
      </div>
    );
  }

  return (
    <div className="tx-list">
      {txs.map((tx) => {
        const isCredit = tx.direction === 'CREDIT';
        return (
          <div key={tx.id} className="tx-item">
            <div className="tx-left">
              <div className={`tx-icon ${isCredit ? 'tx-icon-credit' : 'tx-icon-debit'}`}>
                {txIcon(tx)}
              </div>
              <div>
                <div className="tx-label">{txLabel(tx)}</div>
                <div className="tx-sub">{tx.status}</div>
              </div>
            </div>
            <div>
              <div className={`tx-amount ${isCredit ? 'tx-amount-credit' : 'tx-amount-debit'}`}>
                {formatAmount(tx.amount, tx.direction)}
              </div>
              <div className="tx-date">{formatDate(tx.created_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
