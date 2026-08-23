import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fedbooksem_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth
export const loginUser = (username, password) => api.post('/auth/login', { username, password }).then((r) => r.data);
export const registerUser = (payload) => api.post('/auth/register', payload).then((r) => r.data);

// Reviews
export const createReview = (data) => api.post('/reviews', data).then((r) => r.data);
export const getReview = (id) => api.get(`/reviews/${id}`).then((r) => r.data);
export const likeReview = (id) => api.post(`/reviews/${id}/like`).then((r) => r.data);
export const announceReview = (id) => api.post(`/reviews/${id}/announce`).then((r) => r.data);
export const replyToReview = (id, content) => api.post(`/reviews/${id}/replies`, { content }).then((r) => r.data);
export const getReplies = (id) => api.get(`/reviews/${id}/replies`).then((r) => r.data);

// Annotations — removed in scope pivot (2026-08-16). AnnotationPanel component
// still exists on disk but is no longer imported; /api/annotations is unmounted.

// Reading-status (want-to-read | reading | finished)
export const setReadingStatus = (isbn, status) =>
  api.put('/social/reading-status', { isbn, status }).then((r) => r.data);
export const clearReadingStatus = (isbn) =>
  api.delete(`/social/reading-status/${encodeURIComponent(isbn)}`).then((r) => r.data);
export const getMyReadingStatus = (isbn) =>
  api.get(`/social/reading-status/${encodeURIComponent(isbn)}`).then((r) => r.data);
export const getReadingList = (username) =>
  api.get(`/social/reading-list/${encodeURIComponent(username)}`).then((r) => r.data);

// Feed
export const getFeed = () => api.get('/feed').then((r) => r.data);
export const getAllReviews = () => api.get('/feed/all').then((r) => r.data);
export const getRecommendations = () => api.get('/feed/recommendations').then((r) => r.data);
export const getLikedByFollowed = () => api.get('/feed/liked-by-followed').then((r) => r.data);

// Books — server-side search + pagination. Response: {books, total, hasMore}.
export const getBooks = ({ q = '', limit = 60, offset = 0 } = {}) =>
  api.get('/books', { params: { q, limit, offset } }).then((r) => r.data);
export const getBook = (isbn) => api.get(`/books/${isbn}`).then((r) => r.data);
export const getBookReviews = (isbn) => api.get(`/books/${isbn}/reviews`).then((r) => r.data);

// Recommendations — proxies to ML /recommend/similar. Response: {items, degraded}.
export const getSimilarBooks = (isbn, k = 8) =>
  api.get('/recommend/similar', { params: { isbn, k } }).then((r) => r.data);

// Social
// People search — response: {users, limit, offset, q}. Server-side filter on username + displayName.
export const getUsers = ({ q = '', limit = 20, offset = 0 } = {}) =>
  api.get('/social/users', { params: { q, limit, offset } }).then((r) => r.data);
export const getSuggestedUsers = (limit = 8) =>
  api.get('/social/suggested-users', { params: { limit } }).then((r) => r.data);
export const followActor = (targetId) => api.post('/social/follow', { targetId }).then((r) => r.data);
export const unfollowActor = (targetId) => api.post('/social/unfollow', { targetId }).then((r) => r.data);
export const getFollowers = (actorId) => axios.get('/api/social/followers', { params: { actorId } }).then((r) => r.data);
export const getFollowing = (actorId) => axios.get('/api/social/following', { params: { actorId } }).then((r) => r.data);

// User profiles
export const getUserProfile = (username) => api.get(`/users/${username}`).then((r) => r.data);
export const updateProfile = (username, data) => api.put(`/users/${username}`, data).then((r) => r.data);
export const uploadAvatar = (username, file) => {
  const form = new FormData();
  form.append('avatar', file);
  return api.post(`/users/${username}/avatar`, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
};

export default api;
