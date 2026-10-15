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
      setInfo('OTP sent successfully');
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP');
    }
  });

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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#4f46e5', marginBottom: 8 }}>Community Wallet</h1>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>Sign in to your account</p>

        {error && <div className="alert alert-error">{error}</div>}
        {info && step === 'otp' && <div className="alert alert-success">{info}</div>}

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
              <label htmlFor="login-otp">One-Time Password</label>
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

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
          New user?{' '}
          <Link to="/register" style={{ color: '#4f46e5', fontWeight: 600 }}>Register here</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
