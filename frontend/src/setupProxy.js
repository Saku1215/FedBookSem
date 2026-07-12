const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = 'http://localhost:3001';
  const paths = ['/api', '/avatars', '/users', '/books', '/.well-known', '/inbox'];
  paths.forEach((path) => {
    app.use(path, createProxyMiddleware({ target, changeOrigin: true }));
  });
};
