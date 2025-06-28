// ABOUTME: Lighthouse CI configuration for performance testing
// ABOUTME: Sets performance thresholds and defines pages to test

module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/quiz',
        'http://localhost:3000/explore',
        'http://localhost:3000/auth/signin',
        'http://localhost:3000/auth/signup'
      ],
      startServerCommand: 'pnpm start',
      startServerReadyPattern: 'ready - started server on',
      startServerReadyTimeout: 60000,
      numberOfRuns: 3
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'categories:pwa': ['warn', { minScore: 0.8 }]
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
};