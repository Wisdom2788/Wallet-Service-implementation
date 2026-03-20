import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { walletApi, BalanceResponse } from '../services/api';
import DepositPanel from '../components/DepositPanel';
import TransferPanel from '../components/TransferPanel';
import TransactionList from '../components/TransactionList';

type Tab = 'deposit' | 'transfer';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('deposit');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    setBalanceLoading(true);
    try {
      const res = await walletApi.getBalance(user.id);
      setBalance(res.data.data);
    } catch {
      // balance will remain null — handled in render
    } finally {
      setBalanceLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchBalance(); }, [fetchBalance, refreshKey]);

  const handleTxSuccess = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="app-shell">
      
      <nav className="navbar">
        <span className="navbar-brand">⬡ Lance<span>Wallet</span></span>
        <div className="navbar-user">
          <span>{user?.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Sign Out
          </button>
        </div>
      </nav>

      <main className="main-content">
        
        <div className="page-header">
          <div className="page-title">My Wallet</div>
          <div className="page-subtitle">
            Welcome back, {user?.name?.split(' ')[0]}
          </div>
        </div>

        <div className="section-gap">
          
          <div className="card balance-card">
            <div className="balance-label">Available Balance</div>
            {balanceLoading ? (
              <div className="balance-amount">—</div>
            ) : (
              <div className="balance-amount">
                ₦
                {balance?.balance.toLocaleString('en-NG', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) ?? '0.00'}
                <span className="balance-currency">NGN</span>
              </div>
            )}
            
          </div>

          
          <div className="card-grid">
            <div className="card">
              <div className="tabs">
                <button
                  className={`tab-btn ${activeTab === 'deposit' ? 'active' : ''}`}
                  onClick={() => setActiveTab('deposit')}
                >
                  Deposit
                </button>
                <button
                  className={`tab-btn ${activeTab === 'transfer' ? 'active' : ''}`}
                  onClick={() => setActiveTab('transfer')}
                >
                  Transfer
                </button>
              </div>

              {activeTab === 'deposit' ? (
                <DepositPanel onSuccess={handleTxSuccess} />
              ) : (
                <TransferPanel onSuccess={handleTxSuccess} />
              )}
            </div>

            
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card-title">Account Info</div>
              <InfoRow label="Name" value={user?.name ?? '—'} />
              <InfoRow label="Email" value={user?.email ?? '—'} />
              <InfoRow
                label="Member since"
                value={
                  user?.created_at
                    ? new Date(user.created_at).toLocaleDateString('en-NG', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '—'
                }
              />
              <InfoRow
                label="Balance"
                value={`₦${balance?.balance.toLocaleString('en-NG', { minimumFractionDigits: 2 }) ?? '—'}`}
                highlight
              />
            </div>
          </div>

          
          <div className="card">
            <div className="card-title">Transaction History</div>
            <TransactionList refreshKey={refreshKey} />
          </div>
        </div>
      </main>
    </div>
  );
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 12,
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: '0.875rem',
          fontWeight: highlight ? 700 : 500,
          color: highlight ? 'var(--color-primary)' : 'var(--color-text)',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  );
}
