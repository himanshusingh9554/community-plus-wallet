import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
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

export const groupApi = {
  getMyGroups: () => api.get('/groups'),
  getGroupWallet: (gid) => api.get(`/groups/${gid}/wallet`),
  getGroupWithdrawals: (gid) => api.get(`/groups/${gid}/withdrawals`),
  createWithdrawal: (gid, amount, note) => api.post(`/groups/${gid}/withdrawals`, { amount, note }),
  approveWithdrawal: (gid, id) => api.post(`/groups/${gid}/withdrawals/${id}/approve`),
  rejectWithdrawal: (gid, id) => api.post(`/groups/${gid}/withdrawals/${id}/reject`),
};

export const adminApi = {
  bulkCredit: (formData) =>
    api.post('/admin/credits/bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const userApi = {
  register: (data) => api.post('/users/register', data),
  getMe: () => api.get('/me'),
  updateRoles: (data) => api.patch('/me/roles', data),
};

export default api;
