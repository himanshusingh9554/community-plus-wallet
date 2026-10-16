import { useState, useEffect, useCallback, useRef } from 'react';
import { walletApi, groupApi, adminApi, userApi, authApi } from '../api/client';
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
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'groups' | 'admin'
  const [currentUser, setCurrentUser] = useState(null);
  const [sandboxOpen, setSandboxOpen] = useState(false);

  // Personal Wallet states
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
  const [toasts, setToasts] = useState([]);

  // Group Wallets states
  const [myGroups, setMyGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupWithdrawals, setGroupWithdrawals] = useState([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalNote, setWithdrawalNote] = useState('');
  const [groupActionMsg, setGroupActionMsg] = useState({ text: '', type: '' });

  // Admin CSV states
  const [csvFile, setCsvFile] = useState(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const [csvError, setCsvError] = useState('');

  const { logout, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const pageRef = useRef(1);

  const addToast = useCallback((title, body, type = 'info') => {
    const id = Date.now() + Math.random();
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setToasts((prev) => [...prev, { id, title, body, type, time }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchProfile = useCallback(async () => {
    try {
      const res = await userApi.getMe();
      setCurrentUser(res.data);
    } catch {
      // Profile fetch failed
    }
  }, []);

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

  const fetchWalletQuietly = useCallback(async () => {
    try {
      const res = await walletApi.getWallet();
      setWallet(res.data);
    } catch {
      // Quiet background update
    }
  }, []);

  const fetchTransactions = useCallback(async (page) => {
    pageRef.current = page;
    setTxLoading(true);
    setTxError('');
    try {
      const res = await walletApi.getTransactions(page, 10);
      setTransactions(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        hasNext: res.data.pagination.hasNext,
        hasPrev: res.data.pagination.hasPrev,
      });
    } catch {
      setTxError('Failed to load transactions');
    } finally {
      setTxLoading(false);
    }
  }, []);

  const fetchTransactionsQuietly = useCallback(async (page = 1) => {
    try {
      const res = await walletApi.getTransactions(page, 10);
      setTransactions(res.data.data);
      setPagination({
        page: res.data.pagination.page,
        totalPages: res.data.pagination.totalPages,
        hasNext: res.data.pagination.hasNext,
        hasPrev: res.data.pagination.hasPrev,
      });
    } catch {
      // Quiet update
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    setGroupLoading(true);
    try {
      const res = await groupApi.getMyGroups();
      setMyGroups(res.data);
      if (res.data.length > 0 && !selectedGroup) {
        setSelectedGroup(res.data[0]);
      }
    } catch {
      // Group fetch failed
    } finally {
      setGroupLoading(false);
    }
  }, [selectedGroup]);

  const fetchWithdrawals = useCallback(async (gid) => {
    if (!gid) return;
    try {
      const res = await groupApi.getGroupWithdrawals(gid);
      setGroupWithdrawals(res.data);
    } catch {
      // Withdrawal fetch failed
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchProfile();
    fetchWallet();
    fetchTransactions(1);
    fetchGroups();
  }, [fetchProfile, fetchWallet, fetchTransactions, fetchGroups]);

  // When selected group changes, load its withdrawals
  useEffect(() => {
    if (selectedGroup) {
      fetchWithdrawals(selectedGroup.id);
    }
  }, [selectedGroup, fetchWithdrawals]);

  // Real-time Event Stream (SSE push)
  useEffect(() => {
    let isMounted = true;
    let controller = new AbortController();

    async function connectStream() {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        const response = await fetch('/api/wallet/stream', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (isMounted) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = 'message';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              try {
                const data = JSON.parse(trimmed.slice(5).trim());

                if (currentEvent === 'balance_updated' || data.type === 'TRANSFER_IN' || data.type === 'TRANSFER_OUT') {
                  if (data.balance !== undefined) {
                    setWallet((prev) =>
                      prev
                        ? {
                            ...prev,
                            balance: data.balance,
                            available: (parseFloat(data.balance) - parseFloat(prev.pending)).toFixed(2),
                          }
                        : prev
                    );
                  } else {
                    fetchWalletQuietly();
                  }
                  fetchTransactionsQuietly(1);

                  if (data.type === 'TRANSFER_IN') {
                    addToast('Points Received! 🎉', data.message || `Received ₹${data.amount} points`, 'credit');
                  } else if (data.type === 'TRANSFER_OUT') {
                    addToast('Transfer Sent 💸', data.message || `Transferred ₹${data.amount} points`, 'debit');
                  }
                } else if (currentEvent === 'notification') {
                  fetchWalletQuietly();
                  fetchTransactionsQuietly(1);
                  addToast('Notification 🔔', data.message, 'info');
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError' && isMounted) {
          setTimeout(connectStream, 3000);
        }
      }
    }

    connectStream();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [fetchWalletQuietly, fetchTransactionsQuietly, addToast]);

  // Fallback auto-sync
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWalletQuietly();
      fetchTransactionsQuietly(pageRef.current);
    }, 4000);

    const onFocus = () => {
      fetchWalletQuietly();
      fetchTransactionsQuietly(1);
      fetchGroups();
      if (selectedGroup) fetchWithdrawals(selectedGroup.id);
    };

    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchWalletQuietly, fetchTransactionsQuietly, fetchGroups, selectedGroup, fetchWithdrawals]);

  // Transfer Handler
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

  // Group Withdrawal Request Handler
  const handleRequestWithdrawal = async (e) => {
    e.preventDefault();
    setGroupActionMsg({ text: '', type: '' });

    const amt = parseFloat(withdrawalAmount);
    if (!withdrawalAmount || isNaN(amt) || amt <= 0) {
      setGroupActionMsg({ text: 'Please enter a valid withdrawal amount', type: 'error' });
      return;
    }

    try {
      await groupApi.createWithdrawal(selectedGroup.id, withdrawalAmount, withdrawalNote);
      setGroupActionMsg({ text: 'Withdrawal requested successfully (pending leader approval)!', type: 'success' });
      setWithdrawalAmount('');
      setWithdrawalNote('');
      fetchGroups();
      fetchWithdrawals(selectedGroup.id);
    } catch (err) {
      setGroupActionMsg({ text: err.response?.data?.error || 'Failed to request withdrawal', type: 'error' });
    }
  };

  // Group Leader Approve / Reject Handlers
  const handleApprove = async (withdrawalId) => {
    setGroupActionMsg({ text: '', type: '' });
    try {
      await groupApi.approveWithdrawal(selectedGroup.id, withdrawalId);
      setGroupActionMsg({ text: 'Withdrawal approved successfully!', type: 'success' });
      fetchGroups();
      fetchWithdrawals(selectedGroup.id);
    } catch (err) {
      setGroupActionMsg({ text: err.response?.data?.error || 'Failed to approve withdrawal', type: 'error' });
    }
  };

  const handleReject = async (withdrawalId) => {
    setGroupActionMsg({ text: '', type: '' });
    try {
      await groupApi.rejectWithdrawal(selectedGroup.id, withdrawalId);
      setGroupActionMsg({ text: 'Withdrawal rejected.', type: 'info' });
      fetchGroups();
      fetchWithdrawals(selectedGroup.id);
    } catch (err) {
      setGroupActionMsg({ text: err.response?.data?.error || 'Failed to reject withdrawal', type: 'error' });
    }
  };

  // Admin CSV Upload Handler
  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      setCsvError('Please select a CSV file');
      return;
    }

    setUploadingCsv(true);
    setCsvError('');
    setCsvResult(null);

    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const res = await adminApi.bulkCredit(formData);
      setCsvResult(res.data);
      setCsvFile(null);
      await fetchWallet();
      await fetchTransactions(1);
    } catch (err) {
      setCsvError(err.response?.data?.error || 'Failed to process CSV file');
    } finally {
      setUploadingCsv(false);
    }
  };

  // Reviewer Sandbox Role Switcher (Strictly for Demo Accounts)
  const handleRoleSwitch = async (roleUpdate) => {
    try {
      const res = await userApi.updateRoles(roleUpdate);
      setAuth(res.data.token, res.data.user);
      setCurrentUser(res.data.user);
      addToast('Permissions Updated', `Switched role to: ${res.data.user.role}`, 'info');
      await fetchGroups();
      if (selectedGroup) await fetchWithdrawals(selectedGroup.id);
    } catch (err) {
      addToast('Error', err.response?.data?.error || 'Failed to update reviewer roles', 'error');
    }
  };

  const handleQuickSwitchAccount = async (targetMobile) => {
    try {
      await authApi.requestOtp(targetMobile);
      const res = await authApi.verifyOtp(targetMobile, '123456');
      setAuth(res.data.token, res.data.user);
      setCurrentUser(res.data.user);
      addToast('Account Switched', `Now logged in as demo: ${targetMobile}`, 'info');
      await fetchProfile();
      await fetchWallet();
      await fetchTransactions(1);
      await fetchGroups();
    } catch (err) {
      addToast('Switch Failed', err.response?.data?.error || 'Failed to switch demo account', 'error');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isAdmin = currentUser?.isAdmin || currentUser?.role === 'ADMIN';
  const isDemoUser = Boolean(
    currentUser?.isDemoAccount ||
    ['9000000001', '9000000002', '9000000003'].includes(currentUser?.mobile)
  );
  const groupAMembership = currentUser?.groups?.find((g) => g.groupId === 'group-a');
  const groupARole = groupAMembership ? groupAMembership.role : null;

  return (
    <>
      <nav>
        <span className="brand">💰 Community Wallet</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="live-badge">
            <span className="live-dot" />
            <span>Live Auto-Sync</span>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      {/* Floating Real-time Toast Notifications */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <div className="toast-content">
              <div className="toast-title">{t.title}</div>
              <div className="toast-body">{t.body}</div>
              <div className="toast-time">{t.time}</div>
            </div>
            <button className="toast-close" onClick={() => removeToast(t.id)} aria-label="Close notification">
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="container">
        {/* Navigation Tabs */}
        <div className="tabs-nav">
          <button
            className={`tab-btn ${activeTab === 'personal' ? 'active' : ''}`}
            onClick={() => setActiveTab('personal')}
          >
            🪙 My Personal Wallet
          </button>
          <button
            className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('groups');
              fetchGroups();
            }}
          >
            👥 Group Wallets ({myGroups.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'admin' ? 'active' : ''} ${!isAdmin ? 'locked' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            {isAdmin ? '📊 Admin CSV Bulk Import' : '🔒 Admin CSV (Locked)'}
          </button>
        </div>

        {/* TAB 1: PERSONAL WALLET */}
        {activeTab === 'personal' && (
          <>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Personal Balance</h2>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '4px 10px', height: 'auto' }}
                  onClick={() => {
                    fetchWalletQuietly();
                    fetchTransactionsQuietly(pagination.page);
                  }}
                  title="Refresh wallet data"
                >
                  🔄 Refresh
                </button>
              </div>

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
                    {transactions.map((tx) => {
                      const isCredit = parseFloat(tx.amount) > 0;
                      const senderMob = tx.senderMobile || tx.metadata?.senderMobile;
                      const receiverMob = tx.receiverMobile || tx.metadata?.receiverMobile;
                      const counterparty = tx.counterpartyMobile || senderMob || receiverMob;

                      let counterpartyLabel = '';
                      if (tx.type === 'TRANSFER_IN') {
                        counterpartyLabel = counterparty ? `From: ${counterparty}` : 'From: Member';
                      } else if (tx.type === 'TRANSFER_OUT') {
                        counterpartyLabel = counterparty ? `To: ${counterparty}` : 'To: Member';
                      } else if (tx.type === 'ADMIN_CREDIT') {
                        counterpartyLabel = 'System / Admin';
                      } else if (tx.type === 'GROUP_WITHDRAWAL') {
                        counterpartyLabel = 'Group Withdrawal';
                      }

                      return (
                        <li key={tx.id} className="tx-item">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span className={`tx-type ${isCredit ? 'tx-credit' : 'tx-debit'}`}>
                                {tx.type.replace(/_/g, ' ')}
                              </span>
                              {counterpartyLabel && (
                                <span className="tx-counterparty-badge">
                                  {counterpartyLabel}
                                </span>
                              )}
                            </div>
                            <div className="tx-date">{formatDate(tx.createdAt)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div className={isCredit ? 'tx-credit' : 'tx-debit'} style={{ fontWeight: 700 }}>
                              {isCredit ? '+' : ''}₹{tx.amount}
                            </div>
                            <div className="tx-date">After: ₹{tx.balanceAfter}</div>
                          </div>
                        </li>
                      );
                    })}
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
          </>
        )}

        {/* TAB 2: GROUP WALLETS */}
        {activeTab === 'groups' && (
          <div>
            {groupLoading ? (
              <div className="loading">Loading your community groups...</div>
            ) : myGroups.length === 0 ? (
              <div className="card locked-card">
                <div className="locked-icon">👥</div>
                <h3>No Group Memberships Found</h3>
                <p style={{ marginTop: 8 }}>
                  You are not a member of any community groups.
                </p>
                <p style={{ marginTop: 8, fontSize: 13, color: '#9ca3af' }}>
                  Tip: Use the Reviewer Switcher bar above to join Group A or switch to a demo account!
                </p>
              </div>
            ) : (
              <>
                {/* Group Selector */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  {myGroups.map((g) => (
                    <button
                      key={g.id}
                      className={`btn ${selectedGroup?.id === g.id ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSelectedGroup(g)}
                    >
                      {g.name} {g.isLeader ? '👑 (Leader)' : '👤 (Member)'}
                    </button>
                  ))}
                </div>

                {selectedGroup && (
                  <>
                    {/* Selected Group Card */}
                    <div className="card">
                      <div className="group-header">
                        <div className="group-title">
                          <span>{selectedGroup.name}</span>
                          <span className={`badge ${selectedGroup.isLeader ? 'role-admin' : 'badge-pending'}`}>
                            {selectedGroup.isLeader ? '👑 Group Leader' : '👤 Regular Member'}
                          </span>
                        </div>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => {
                            fetchGroups();
                            fetchWithdrawals(selectedGroup.id);
                          }}
                        >
                          🔄 Refresh Group
                        </button>
                      </div>

                      <div className="balance-grid">
                        <div className="balance-item">
                          <div className="label">Group Balance</div>
                          <div className="amount">₹{selectedGroup.wallet?.balance}</div>
                        </div>
                        <div className="balance-item">
                          <div className="label">Pending Earmarks</div>
                          <div className="amount">₹{selectedGroup.wallet?.pending}</div>
                        </div>
                        <div className="balance-item available">
                          <div className="label">Available Funds</div>
                          <div className="amount">₹{selectedGroup.wallet?.available}</div>
                        </div>
                      </div>

                      {groupActionMsg.text && (
                        <div className={`alert alert-${groupActionMsg.type === 'error' ? 'error' : 'success'}`}>
                          {groupActionMsg.text}
                        </div>
                      )}

                      {/* Request Withdrawal Form */}
                      <form onSubmit={handleRequestWithdrawal} style={{ marginTop: 20 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
                          Request Group Withdrawal
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                          <div className="input-group">
                            <label>Amount (₹)</label>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              placeholder="e.g. 100.00"
                              value={withdrawalAmount}
                              onChange={(e) => setWithdrawalAmount(e.target.value)}
                              required
                            />
                          </div>
                          <div className="input-group">
                            <label>Purpose / Note</label>
                            <input
                              type="text"
                              placeholder="e.g. Community supplies"
                              value={withdrawalNote}
                              onChange={(e) => setWithdrawalNote(e.target.value)}
                            />
                          </div>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                          Submit Withdrawal Request
                        </button>
                      </form>
                    </div>

                    {/* Group Withdrawals Approval List */}
                    <div className="card">
                      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
                        Withdrawal Requests ({groupWithdrawals.length})
                      </h3>

                      {groupWithdrawals.length === 0 ? (
                        <div className="empty-state">No withdrawal requests found for this group.</div>
                      ) : (
                        groupWithdrawals.map((w) => {
                          const isPending = w.status === 'PENDING_APPROVAL';
                          return (
                            <div key={w.id} className="withdrawal-card">
                              <div className="withdrawal-header">
                                <div>
                                  <strong style={{ fontSize: 16 }}>₹{w.amount}</strong>
                                  <span style={{ marginLeft: 10, fontSize: 13, color: '#6b7280' }}>
                                    Requested by: {w.requesterName} ({w.requesterMobile})
                                  </span>
                                </div>
                                <span className={`badge badge-${w.status.toLowerCase().replace(/_/g, '-')}`}>
                                  {w.status.replace(/_/g, ' ')}
                                </span>
                              </div>

                              {w.note && (
                                <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>
                                  Note: "{w.note}"
                                </div>
                              )}

                              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                Created: {formatDate(w.createdAt)} | Expires: {formatDate(w.expiresAt)}
                              </div>

                              {/* CONDITIONAL RBAC: Only Group Leader can approve or reject pending withdrawals */}
                              {isPending && (
                                <div className="withdrawal-actions">
                                  {selectedGroup.isLeader ? (
                                    <>
                                      <button
                                        className="btn btn-success"
                                        style={{ padding: '6px 14px', fontSize: 13 }}
                                        onClick={() => handleApprove(w.id)}
                                      >
                                        ✓ Approve
                                      </button>
                                      <button
                                        className="btn btn-danger"
                                        style={{ padding: '6px 14px', fontSize: 13 }}
                                        onClick={() => handleReject(w.id)}
                                      >
                                        ✕ Reject
                                      </button>
                                    </>
                                  ) : (
                                    <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                                      🔒 Approval requires group leader ({selectedGroup.name} Leader)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* TAB 3: ADMIN CSV BULK IMPORT */}
        {activeTab === 'admin' && (
          <div>
            {isAdmin ? (
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                    📊 Administrator CSV Bulk Points Credit
                  </h2>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => {
                      const sampleContent = `mobile,amount,reference\n9000000002,50.00,REF-${Date.now()}-A\n9000000003,25.00,REF-${Date.now()}-B`;
                      const blob = new Blob([sampleContent], { type: 'text/csv' });
                      const file = new File([blob], 'demo-bulk-credits.csv', { type: 'text/csv' });
                      setCsvFile(file);
                      addToast('Sample CSV Loaded', 'Pre-loaded demo-bulk-credits.csv ready for upload!', 'info');
                    }}
                  >
                    📄 Load Sample CSV Data
                  </button>
                </div>
                <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 20 }}>
                  Upload a comma-separated values (CSV) file to credit community points to multiple member wallets in a single operation.
                </p>

                {csvError && <div className="alert alert-error">{csvError}</div>}

                {csvResult && (
                  <div className="alert alert-success">
                    <h4 style={{ fontWeight: 700, marginBottom: 4 }}>CSV Batch Processed!</h4>
                    <div>Total Processed: {csvResult.processed}</div>
                    <div>Succeeded: {csvResult.succeeded}</div>
                    <div>Duplicates Skipped: {csvResult.duplicates?.length || 0}</div>
                    <div>Failed: {csvResult.failed?.length || 0}</div>
                  </div>
                )}

                <form onSubmit={handleCsvUpload}>
                  <div className="input-group">
                    <label htmlFor="csv-file-input">Select CSV File</label>
                    <input
                      id="csv-file-input"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    />
                    {csvFile && (
                      <div style={{ marginTop: 6, fontSize: 12, color: '#4f46e5', fontWeight: 600 }}>
                        Selected file: {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, border: '1px solid #e2e8f0' }}>
                    <strong>Expected CSV Header & Format:</strong>
                    <pre style={{ marginTop: 4, color: '#334155' }}>
                      mobile,amount,reference{'\n'}
                      9000000002,50.00,BATCH001{'\n'}
                      9000000003,25.00,BATCH002
                    </pre>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={uploadingCsv || !csvFile}
                    style={{ width: '100%' }}
                  >
                    {uploadingCsv ? 'Processing Bulk Credits...' : 'Upload & Process CSV'}
                  </button>
                </form>
              </div>
            ) : (
              /* LOCKED VIEW FOR NORMAL USERS */
              <div className="card locked-card">
                <div className="locked-icon">🔒</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  Administrator Access Required
                </h2>
                <p style={{ color: '#6b7280', maxWidth: 460, margin: '0 auto', fontSize: 14 }}>
                  You are currently logged in as a regular user (<code>role: 'USER'</code>). Only users with <code>role: 'ADMIN'</code> are authorized to access the CSV Bulk Credit module.
                </p>
                {isDemoUser ? (
                  <div style={{ marginTop: 24 }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleRoleSwitch({ role: 'ADMIN' })}
                    >
                      👑 Switch to ADMIN Role (Reviewer Sandbox)
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 16, fontSize: 13, color: '#9ca3af' }}>
                    This section is restricted to authorized system administrators.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FLOATING REVIEWER SANDBOX TOOLBAR (STRICTLY FOR DEMO ACCOUNTS) */}
      {isDemoUser && (
        <div className="reviewer-floating-container" data-testid="reviewer-sandbox-toolbar">
          {sandboxOpen ? (
            <div className="reviewer-floating-card">
              <div className="reviewer-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🛠️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#f8fafc' }}>Reviewer Sandbox</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Demo: {currentUser?.mobile}</div>
                  </div>
                </div>
                <button
                  className="reviewer-card-close"
                  onClick={() => setSandboxOpen(false)}
                  title="Collapse Toolbar"
                >
                  ✕
                </button>
              </div>

              <div className="reviewer-card-body">
                {/* Active Badges */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span className={`role-pill ${isAdmin ? 'role-admin' : 'role-user'}`}>
                    {isAdmin ? '👑 ADMIN' : '👤 USER'}
                  </span>
                  {groupARole ? (
                    <span className="role-pill role-leader">
                      Group A: {groupARole}
                    </span>
                  ) : (
                    <span className="role-pill" style={{ background: '#334155', color: '#94a3b8' }}>
                      Group A: Non-Member
                    </span>
                  )}
                </div>

                {/* Section 1: System Role */}
                <div className="reviewer-section">
                  <div className="reviewer-section-title">Toggle System Role</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={`reviewer-action-btn ${isAdmin ? 'active' : ''}`}
                      onClick={() => handleRoleSwitch({ role: 'ADMIN' })}
                      disabled={isAdmin}
                    >
                      👑 ADMIN
                    </button>
                    <button
                      className={`reviewer-action-btn ${!isAdmin ? 'active' : ''}`}
                      onClick={() => handleRoleSwitch({ role: 'USER' })}
                      disabled={!isAdmin}
                    >
                      👤 USER
                    </button>
                  </div>
                </div>

                {/* Section 2: Group A Permissions */}
                <div className="reviewer-section">
                  <div className="reviewer-section-title">Group A Permission</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`reviewer-action-btn ${groupARole === 'LEADER' ? 'active' : ''}`}
                      onClick={() => handleRoleSwitch({ groupId: 'group-a', groupRole: 'LEADER' })}
                      disabled={groupARole === 'LEADER'}
                    >
                      👑 Leader
                    </button>
                    <button
                      className={`reviewer-action-btn ${groupARole === 'MEMBER' ? 'active' : ''}`}
                      onClick={() => handleRoleSwitch({ groupId: 'group-a', groupRole: 'MEMBER' })}
                      disabled={groupARole === 'MEMBER'}
                    >
                      👤 Member
                    </button>
                    <button
                      className={`reviewer-action-btn ${!groupARole ? 'active' : ''}`}
                      onClick={() => handleRoleSwitch({ groupId: 'group-a', groupRole: 'NONE' })}
                      disabled={!groupARole}
                    >
                      ❌ Leave
                    </button>
                  </div>
                </div>

                {/* Section 3: Switch Demo User */}
                <div className="reviewer-section" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
                  <div className="reviewer-section-title">Switch Active Demo Account</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      className="reviewer-switch-account-btn"
                      onClick={() => handleQuickSwitchAccount('9000000001')}
                      disabled={currentUser?.mobile === '9000000001'}
                    >
                      👑 9000000001 (Admin & Leader)
                    </button>
                    <button
                      className="reviewer-switch-account-btn"
                      onClick={() => handleQuickSwitchAccount('9000000002')}
                      disabled={currentUser?.mobile === '9000000002'}
                    >
                      👤 9000000002 (Alice Member)
                    </button>
                    <button
                      className="reviewer-switch-account-btn"
                      onClick={() => handleQuickSwitchAccount('9000000003')}
                      disabled={currentUser?.mobile === '9000000003'}
                    >
                      🛡️ 9000000003 (Bob Group B)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              data-testid="reviewer-sandbox-toggle"
              className="reviewer-floating-trigger"
              onClick={() => setSandboxOpen(true)}
              title="Open Reviewer Sandbox Toolbar"
            >
              <span style={{ fontSize: 16 }}>🛠️</span>
              <span>Reviewer Sandbox</span>
              <span className={`role-pill ${isAdmin ? 'role-admin' : 'role-user'}`} style={{ fontSize: 10, padding: '2px 6px' }}>
                {isAdmin ? 'ADMIN' : 'USER'}
              </span>
            </button>
          )}
        </div>
      )}
    </>
  );
}

export default WalletDashboard;
