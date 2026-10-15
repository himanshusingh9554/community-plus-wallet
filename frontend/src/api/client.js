import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  requestOtp: (mobile) => api.post('/auth/otp/request', { mobile }),
  verifyOtp: (mobile, otp) => api.post('/auth/otp/verify', { mobile, otp }),
};

export const walletApi = {
  getWallet: () => api.get('/wallet'),
  transfer: (receiverMobile, amount, idempotencyKey) =>
    api.post('/wallet/transfers', { receiverMobile, amount }, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    }),
  getTransactions: (page = 1, limit = 10) =>
    api.get(`/wallet/transactions?page=${page}&limit=${limit}`),
};

export const userApi = {
  register: (data) => api.post('/users/register', data),
  getMe: () => api.get('/users/me'),
};

export default api;
