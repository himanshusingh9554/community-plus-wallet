import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api/client';
import useAuthStore from '../store/authStore';
import { useDoubleClickGuard } from '../hooks/useAsync';

function LoginPage() {
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('mobile');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const validateMobile = (val) => /^\d{10}$/.test(val);

  const { guarded: requestOtp, submitting: requestingOtp } = useDoubleClickGuard(async () => {
    setError('');
    if (!validateMobile(mobile)) {
      setError('Mobile must be exactly 10 digits');
      return;
    }
    try {
      await authApi.requestOtp(mobile);
      setInfo('OTP sent successfully (Demo accounts use OTP: 123456)');
      setStep('otp');
      if (['9000000001', '9000000002', '9000000003'].includes(mobile)) {
        setOtp('123456');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP');
    }
  });

  const handleSelectDemo = (demoMobile) => {
    setMobile(demoMobile);
    setError('');
    if (step === 'otp') {
      setOtp('123456');
      setInfo(`Switched to demo ${demoMobile}. OTP pre-filled with 123456.`);
    } else {
      setInfo(`Auto-filled demo account: ${demoMobile}. Click "Send OTP" or use 1-Click Login below.`);
    }
  };

  const handleQuickLogin = async (demoMobile) => {
    setError('');
    setInfo('');
    setMobile(demoMobile);
    try {
      await authApi.requestOtp(demoMobile);
      const res = await authApi.verifyOtp(demoMobile, '123456');
      setAuth(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Quick login failed');
    }
  };

  const { guarded: verifyOtp, submitting: verifyingOtp } = useDoubleClickGuard(async () => {
    setError('');
    if (!otp || otp.length < 4) {
      setError('Enter the OTP received');
      return;
    }
    try {
      const res = await authApi.verifyOtp(mobile, otp);
      setAuth(res.data.token, res.data.user);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid OTP';
      setError(msg);
    }
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa', padding: '24px 16px' }}>
      <div className="card" style={{ width: '100%', maxWidth: 440 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#4f46e5', marginBottom: 8 }}>Community Wallet</h1>
        <p style={{ color: '#6b7280', marginBottom: 20 }}>Sign in to your account</p>

        {error && <div className="alert alert-error">{error}</div>}
        {info && <div className="alert alert-success">{info}</div>}

        <div className="input-group">
          <label htmlFor="login-mobile">Mobile Number</label>
          <input
            id="login-mobile"
            data-testid="login-mobile"
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile number"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
            disabled={step === 'otp'}
            className={error && step === 'mobile' ? 'error' : ''}
          />
        </div>

        {step === 'mobile' && (
          <button
            data-testid="login-submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={requestOtp}
            disabled={requestingOtp}
          >
            {requestingOtp ? 'Sending OTP...' : 'Send OTP'}
          </button>
        )}

        {step === 'otp' && (
          <>
            <div className="input-group">
              <label htmlFor="login-otp">One-Time Password (OTP)</label>
              <input
                id="login-otp"
                data-testid="login-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>

            <button
              data-testid="login-submit"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: 12 }}
              onClick={verifyOtp}
              disabled={verifyingOtp}
            >
              {verifyingOtp ? 'Verifying...' : 'Login'}
            </button>

            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => { setStep('mobile'); setOtp(''); setError(''); setInfo(''); }}
            >
              Change Number
            </button>
          </>
        )}

        {/* 1-CLICK DEMO LOGIN PILLS FOR REVIEWERS */}
        <div className="demo-box">
          <div className="demo-box-header">
            <span className="demo-box-title">⚡ Quick Demo Login</span>
            <span className="demo-box-badge">OTP: 123456</span>
          </div>

          <div className="demo-pills-list">
            <div
              data-testid="demo-login-admin"
              className="demo-pill-card"
              onClick={() => handleSelectDemo('9000000001')}
            >
              <div className="demo-pill-info">
                <span className="demo-icon">👑</span>
                <div>
                  <div className="demo-role-title">Admin + Group A Leader</div>
                  <div className="demo-meta">9000000001 • Full Privileges</div>
                </div>
              </div>
              <button
                type="button"
                className="demo-quick-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickLogin('9000000001');
                }}
                title="1-Click Instant Login"
              >
                1-Click Login ⚡
              </button>
            </div>

            <div
              data-testid="demo-login-member"
              className="demo-pill-card"
              onClick={() => handleSelectDemo('9000000002')}
            >
              <div className="demo-pill-info">
                <span className="demo-icon">👤</span>
                <div>
                  <div className="demo-role-title">Group A Member (Alice)</div>
                  <div className="demo-meta">9000000002 • USER & Member Only</div>
                </div>
              </div>
              <button
                type="button"
                className="demo-quick-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickLogin('9000000002');
                }}
                title="1-Click Instant Login"
              >
                1-Click Login ⚡
              </button>
            </div>

            <div
              data-testid="demo-login-outsider"
              className="demo-pill-card"
              onClick={() => handleSelectDemo('9000000003')}
            >
              <div className="demo-pill-info">
                <span className="demo-icon">🛡️</span>
                <div>
                  <div className="demo-role-title">Group B Leader (Bob)</div>
                  <div className="demo-meta">9000000003 • Non-member of Group A</div>
                </div>
              </div>
              <button
                type="button"
                className="demo-quick-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickLogin('9000000003');
                }}
                title="1-Click Instant Login"
              >
                1-Click Login ⚡
              </button>
            </div>
          </div>
        </div>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
          New user?{' '}
          <Link to="/register" style={{ color: '#4f46e5', fontWeight: 600 }}>Register here</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
