import { useState, useEffect, useCallback } from 'react';
import { walletApi } from '../api/client';
import useAuthStore from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useDoubleClickGuard } from '../hooks/useAsync';

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function WalletDashboard() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, hasNext: false, hasPrev: false });
  const [walletLoading, setWalletLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(true);
  const [walletError, setWalletError] = useState('');
  const [txError, setTxError] = useState('');

  const [receiverMobile, setReceiverMobile] = useState('');
  const [amount, setAmount] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');

  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const fetchWallet = useCallback(async () => {
    setWalletLoading(true);
    setWalletError('');
    try {
      const res = await walletApi.getWallet();
      setWallet(res.data);
    } catch {
      setWalletError('Failed to load wallet');
    } finally {
      setWalletLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (page) => {
    setTxLoading(true);
    setTxError('');
    try {
      const res = await walletApi.getTransactions(page, 10);
      setTransactions(res.data.data);
      setPagination({ page: res.data.pagination.page, totalPages: res.data.pagination.totalPages, hasNext: res.data.pagination.hasNext, hasPrev: res.data.pagination.hasPrev });
    } catch {
      setTxError('Failed to load transactions');
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
    fetchTransactions(1);
  }, [fetchWallet, fetchTransactions]);

  const { guarded: handleTransfer, submitting: transferring } = useDoubleClickGuard(async () => {
    setTransferError('');
    setTransferSuccess('');

    if (!/^\d{10}$/.test(receiverMobile)) {
      setTransferError('Receiver mobile must be exactly 10 digits');
      return;
    }
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      setTransferError('Enter a valid positive amount');
      return;
    }

    try {
      const key = crypto.randomUUID();
      const res = await walletApi.transfer(receiverMobile, amount, key);
      setTransferSuccess(`Transferred ₹${res.data.amount} successfully`);
      setReceiverMobile('');
      setAmount('');
      await fetchWallet();
      await fetchTransactions(1);
    } catch (err) {
      setTransferError(err.response?.data?.error || 'Transfer failed');
    }
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <nav>
        <span className="brand">💰 Community Wallet</span>
        <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
      </nav>

      <div className="container">
        <div className="card">
          <h2 style={{ marginBottom: 16, fontSize: 18, fontWeight: 700 }}>My Wallet</h2>

          {walletLoading ? (
            <div className="loading">Loading balance...</div>
          ) : walletError ? (
            <div className="alert alert-error">{walletError}</div>
          ) : wallet ? (
            <div className="balance-grid">
              <div className="balance-item">
                <div className="label">Total Balance</div>
                <div data-testid="wallet-balance" className="amount">₹{wallet.balance}</div>
              </div>
              <div className="balance-item">
                <div className="label">Pending</div>
                <div data-testid="wallet-pending" className="amount">₹{wallet.pending}</div>
              </div>
              <div className="balance-item available">
                <div className="label">Available</div>
                <div data-testid="wallet-available" className="amount">₹{wallet.available}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 16, fontSize: 18, fontWeight: 700 }}>Transfer Points</h2>

          {transferError && <div className="alert alert-error">{transferError}</div>}
          {transferSuccess && <div className="alert alert-success">{transferSuccess}</div>}

          <div className="input-group">
            <label htmlFor="transfer-mobile">Receiver Mobile</label>
            <input
              id="transfer-mobile"
              data-testid="transfer-mobile"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile"
              value={receiverMobile}
              onChange={(e) => setReceiverMobile(e.target.value.replace(/\D/g, ''))}
            />
          </div>

          <div className="input-group">
            <label htmlFor="transfer-amount">Amount</label>
            <input
              id="transfer-amount"
              data-testid="transfer-amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="e.g. 10.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <button
            data-testid="transfer-submit"
            className="btn btn-primary"
            onClick={handleTransfer}
            disabled={transferring}
            style={{ width: '100%' }}
          >
            {transferring ? 'Sending...' : 'Send Points'}
          </button>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 16, fontSize: 18, fontWeight: 700 }}>Transaction History</h2>

          {txLoading ? (
            <div className="loading">Loading transactions...</div>
          ) : txError ? (
            <div className="alert alert-error">{txError}</div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">No transactions yet</div>
          ) : (
            <>
              <ul className="tx-list">
                {transactions.map((tx) => (
                  <li key={tx.id} className="tx-item">
                    <div>
                      <div className={`tx-type ${parseFloat(tx.amount) > 0 ? 'tx-credit' : 'tx-debit'}`}>
                        {tx.type.replace(/_/g, ' ')}
                      </div>
                      <div className="tx-date">{formatDate(tx.createdAt)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className={parseFloat(tx.amount) > 0 ? 'tx-credit' : 'tx-debit'} style={{ fontWeight: 700 }}>
                        {parseFloat(tx.amount) > 0 ? '+' : ''}₹{tx.amount}
                      </div>
                      <div className="tx-date">After: ₹{tx.balanceAfter}</div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="pagination">
                <button
                  data-testid="tx-prev"
                  className="btn btn-secondary"
                  disabled={!pagination.hasPrev}
                  onClick={() => fetchTransactions(pagination.page - 1)}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: 14, color: '#6b7280' }}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  data-testid="tx-next"
                  className="btn btn-secondary"
                  disabled={!pagination.hasNext}
                  onClick={() => fetchTransactions(pagination.page + 1)}
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default WalletDashboard;
