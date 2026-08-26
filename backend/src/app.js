require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers — allow cross-origin images (avatars, book covers)
// CSP is relaxed for images to permit any HTTPS source, so Google Books
// thumbnails on Kaggle catalogue books load in the browser.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:', 'http:'],
    },
  },
}));

app.use(cors());
app.use(morgan('dev'));

// JSON body parser
app.use(express.json());

// Static file serving for avatars
app.use('/avatars', express.static(path.join(__dirname, '../public/avatars')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'fedbooksem-backend' });
});

// Routes
const authRoutes = require('./routes/auth');
const reviewRoutes = require('./routes/reviews');
const bookRoutes = require('./routes/books');
const socialRoutes = require('./routes/social');
const feedRoutes = require('./routes/feed');
const userRoutes = require('./routes/users');
const coverRoutes = require('./routes/covers');
const recommendRoutes = require('./routes/recommend');

app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/users', userRoutes);
app.use('/api/covers', coverRoutes);
app.use('/api/recommend', recommendRoutes);

// --- Removed in scope-pivot (2026-08-16): ActivityPub + annotations. ---
// Route files are kept on disk (backend/src/routes/{actors,webfinger,inbox,annotations}.js
// and backend/src/activitypub/) so federation can be re-enabled by uncommenting
// the block below. The current build is a local-only social bookstore:
// login / read / follow-user / follow-book (reading-status) / reviews.
//
// const actorRoutes = require('./routes/actors');
// const webfingerRoutes = require('./routes/webfinger');
// const inboxRoutes = require('./routes/inbox');
// const annotationRoutes = require('./routes/annotations');
// app.use('/api/annotations', annotationRoutes);
// app.use('/.well-known', webfingerRoutes);
// app.use('/inbox', inboxRoutes);
// app.use('/', actorRoutes);

// Don't crash the whole process on a single request-scoped async failure
// (e.g. transient Neo4j "Connection was closed by server" during warmup).
// Individual routes still surface a 500 to the client via Express's default
// error handler; this just prevents the whole server dying.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err && err.message ? err.message : err);
});

app.listen(PORT, () => {
  console.log(`FedBook-Sem backend running on port ${PORT}`);
});

module.exports = app;
