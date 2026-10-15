import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { userApi } from '../api/client';
import { useDoubleClickGuard } from '../hooks/useAsync';

const DRAFT_KEY = 'registration_draft';

const FIELD_TO_STEP = {
  fullName: 1,
  mobile: 1,
  dob: 1,
  memberType: 1,
  gstin: 1,
  pincode: 2,
};

const INITIAL_FORM = {
  fullName: '',
  mobile: '',
  dob: '',
  memberType: 'INDIVIDUAL',
  gstin: '',
  pincode: '',
};

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : INITIAL_FORM;
  } catch {
    return INITIAL_FORM;
  }
}

function saveDraft(data) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY);
}

function validateStep1(form) {
  const errors = {};
  if (!form.fullName || form.fullName.length < 2 || form.fullName.length > 60) {
    errors.fullName = 'Full name must be 2–60 characters';
  }
  if (!form.mobile || !/^\d{10}$/.test(form.mobile)) {
    errors.mobile = 'Mobile must be exactly 10 digits';
  }
  if (!form.dob) {
    errors.dob = 'Date of birth is required';
  } else {
    const age = (Date.now() - new Date(form.dob).getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 18) errors.dob = 'Must be at least 18 years old';
  }
  if (!['INDIVIDUAL', 'BUSINESS'].includes(form.memberType)) {
    errors.memberType = 'Select a valid member type';
  }
  if (form.memberType === 'BUSINESS') {
    if (!form.gstin || !/^[A-Z0-9]{15}$/.test(form.gstin)) {
      errors.gstin = 'GSTIN must be exactly 15 alphanumeric characters';
    }
  }
  return errors;
}

function validateStep2(form) {
  const errors = {};
  if (!form.pincode || !/^\d{6}$/.test(form.pincode)) {
    errors.pincode = 'Pincode must be exactly 6 digits';
  }
  return errors;
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <div className="field-error">{msg}</div>;
}

function RegisterPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(loadDraft);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const fieldRefs = {
    fullName: useRef(null),
    mobile: useRef(null),
    dob: useRef(null),
    memberType: useRef(null),
    gstin: useRef(null),
    pincode: useRef(null),
  };

  useEffect(() => {
    saveDraft(form);
  }, [form]);

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const goToStep = (n, errs) => {
    setStep(n);
    setErrors(errs || {});
    const firstErrField = Object.keys(errs || {})[0];
    if (firstErrField && fieldRefs[firstErrField]) {
      setTimeout(() => {
        fieldRefs[firstErrField].current?.focus();
        fieldRefs[firstErrField].current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      const errs = validateStep1(form);
      if (Object.keys(errs).length > 0) {
        goToStep(1, errs);
        return;
      }
      setStep(2);
    } else if (step === 2) {
      const errs = validateStep2(form);
      if (Object.keys(errs).length > 0) {
        goToStep(2, errs);
        return;
      }
      setStep(3);
    }
  };

  const { guarded: handleSubmit, submitting } = useDoubleClickGuard(async () => {
    setSubmitError('');
    try {
      await userApi.register({
        fullName: form.fullName,
        mobile: form.mobile,
        dob: form.dob,
        memberType: form.memberType,
        gstin: form.memberType === 'BUSINESS' ? form.gstin : undefined,
        pincode: form.pincode,
      });
      clearDraft();
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      const serverErrors = err.response?.data?.errors;
      if (serverErrors) {
        const firstErrField = Object.keys(serverErrors)[0];
        const targetStep = FIELD_TO_STEP[firstErrField] || 1;
        goToStep(targetStep, serverErrors);
        setSubmitError(`Please fix the highlighted fields`);
      } else {
        setSubmitError(err.response?.data?.error || 'Registration failed. Please try again.');
      }
    }
  });

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ marginBottom: 8 }}>Registration Successful!</h2>
          <p style={{ color: '#6b7280' }}>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
      <div className="card" style={{ width: '100%', maxWidth: 480 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24, color: '#1a1a2e' }}>Create Account</h1>

        <div className="step-indicator">
          {['Personal', 'Address', 'Review'].map((label, i) => (
            <div key={label} className={`step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}>
              {step > i + 1 ? '✓ ' : `${i + 1}. `}{label}
            </div>
          ))}
        </div>

        {submitError && <div className="alert alert-error">{submitError}</div>}

        {step === 1 && (
          <>
            <div className="input-group">
              <label>Full Name</label>
              <input
                ref={fieldRefs.fullName}
                type="text"
                placeholder="2–60 characters"
                value={form.fullName}
                onChange={(e) => update('fullName', e.target.value)}
                className={errors.fullName ? 'error' : ''}
              />
              <FieldError msg={errors.fullName} />
            </div>

            <div className="input-group">
              <label>Mobile Number</label>
              <input
                ref={fieldRefs.mobile}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit mobile"
                value={form.mobile}
                onChange={(e) => update('mobile', e.target.value.replace(/\D/g, ''))}
                className={errors.mobile ? 'error' : ''}
              />
              <FieldError msg={errors.mobile} />
            </div>

            <div className="input-group">
              <label>Date of Birth</label>
              <input
                ref={fieldRefs.dob}
                type="date"
                value={form.dob}
                onChange={(e) => update('dob', e.target.value)}
                className={errors.dob ? 'error' : ''}
              />
              <FieldError msg={errors.dob} />
            </div>

            <div className="input-group">
              <label>Member Type</label>
              <select
                ref={fieldRefs.memberType}
                value={form.memberType}
                onChange={(e) => update('memberType', e.target.value)}
                className={errors.memberType ? 'error' : ''}
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="BUSINESS">Business</option>
              </select>
              <FieldError msg={errors.memberType} />
            </div>

            {form.memberType === 'BUSINESS' && (
              <div className="input-group">
                <label>GSTIN (15 alphanumeric)</label>
                <input
                  ref={fieldRefs.gstin}
                  type="text"
                  maxLength={15}
                  placeholder="e.g. ABCDE1234F12345"
                  value={form.gstin}
                  onChange={(e) => update('gstin', e.target.value.toUpperCase())}
                  className={errors.gstin ? 'error' : ''}
                />
                <FieldError msg={errors.gstin} />
              </div>
            )}

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleNext}>
              Next: Address →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div className="input-group">
              <label>Pincode</label>
              <input
                ref={fieldRefs.pincode}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit pincode"
                value={form.pincode}
                onChange={(e) => update('pincode', e.target.value.replace(/\D/g, ''))}
                className={errors.pincode ? 'error' : ''}
              />
              <FieldError msg={errors.pincode} />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(1)}>
                ← Back
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleNext}>
                Next: Review →
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="review-section">
              <h3>Personal</h3>
              <p>{form.fullName}</p>
              <p style={{ color: '#6b7280', fontSize: 14 }}>{form.mobile}</p>
              <p style={{ color: '#6b7280', fontSize: 14 }}>{form.dob} · {form.memberType}</p>
              {form.memberType === 'BUSINESS' && <p style={{ color: '#6b7280', fontSize: 14 }}>GSTIN: {form.gstin}</p>}
            </div>

            <div className="review-section">
              <h3>Address</h3>
              <p>Pincode: {form.pincode}</p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(2)}>
                ← Back
              </button>
              <button
                className="btn btn-success"
                style={{ flex: 2 }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Creating account...' : '✓ Create Account'}
              </button>
            </div>
          </>
        )}

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#4f46e5', fontWeight: 600 }}>Login</Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
