import { useState, useCallback } from 'react';

export function useAsync(asyncFn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn(...args);
      return result;
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Something went wrong';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [asyncFn]);

  return { execute, loading, error };
}

export function useDoubleClickGuard(fn) {
  const [submitting, setSubmitting] = useState(false);

  const guarded = useCallback(async (...args) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fn(...args);
    } finally {
      setSubmitting(false);
    }
  }, [fn, submitting]);

  return { guarded, submitting };
}
