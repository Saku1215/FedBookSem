import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fedbooksem_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auth
export const loginUser = (username, password) => api.post('/auth/login', { username, password }).then((r) => r.data);

// Reviews
export const createReview = (data) => api.post('/reviews', data).then((r) => r.data);
export const getReview = (id) => api.get(`/reviews/${id}`).then((r) => r.data);
export const likeReview = (id) => api.post(`/reviews/${id}/like`).then((r) => r.data);
export const announceReview = (id) => api.post(`/reviews/${id}/announce`).then((r) => r.data);
export const replyToReview = (id, content) => api.post(`/reviews/${id}/replies`, { content }).then((r) => r.data);
export const getReplies = (id) => api.get(`/reviews/${id}/replies`).then((r) => r.data);

// Annotations
export const createAnnotation = (data) => api.post('/annotations', data).then((r) => r.data);
export const getAnnotations = (bookSource, exact) => api.get('/annotations', { params: { bookSource, exact } }).then((r) => r.data);
export const getAnnotationThread = (id) => api.get(`/annotations/${id}/thread`).then((r) => r.data);
export const deleteAnnotation = (id) => api.delete(`/annotations/${id}`).then((r) => r.data);

// Feed
export const getFeed = () => api.get('/feed').then((r) => r.data);
export const getAllReviews = () => api.get('/feed/all').then((r) => r.data);
export const getRecommendations = () => api.get('/feed/recommendations').then((r) => r.data);
export const getLikedByFollowed = () => api.get('/feed/liked-by-followed').then((r) => r.data);

// Books
export const getBooks = () => api.get('/books').then((r) => r.data);
export const getBook = (isbn) => api.get(`/books/${isbn}`).then((r) => r.data);
export const getBookReviews = (isbn) => api.get(`/books/${isbn}/reviews`).then((r) => r.data);

// Social
export const getUsers = () => api.get('/social/users').then((r) => r.data);
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
