const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = 'http://localhost:3001';

  // Only /api and /avatars need to be proxied to the backend now.
  // The old /users, /books, /.well-known, /inbox entries were for ActivityPub
  // and were removed on 2026-08-16 with the federation pivot — they clashed
  // with the SPA routes /books/:isbn and /users/:username, causing direct
  // navigations (and refresh) to those pages to 404 through the proxy.
  const paths = ['/api', '/avatars'];
  paths.forEach((path) => {
    app.use(path, createProxyMiddleware({ target, changeOrigin: true }));
  });
};
