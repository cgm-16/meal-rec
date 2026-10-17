# Meal Recommendation PWA

> **PROJECT STATUS: Deployed at https://meal-rec.vercel.app/**
> 
> A meal recommendation PWA built following a 20-prompt LLM code generation plan. Recommendations come from a hand-tuned heuristic scoring engine, not a trained model. See [`FUTURE_ENHANCEMENTS.md`](FUTURE_ENHANCEMENTS.md) for what is not built yet.

## 🚀 Features Implemented

### ✅ Core Functionality
- **Meal Recommendations** - Home page requests `/api/recommend`, which scores a random sample of meals and picks from the best matches
- **Personalized Quiz System** - 3-step quiz (ingredients to avoid, spiciness, surprise factor); answers are kept in `localStorage` and sent with each recommendation request
- **Feedback Learning** - Like/interested/dislike adjusts heuristic scores for the rated meal and for meals with a similar cuisine, heaviness and spiciness (signed-in users only)
- **User Authentication** - Username + 4-digit PIN, hashed server-side, with lockout after repeated failed sign-ins
- **Database Management** - MongoDB with Mongoose; seed data in `data/meals.json` (91 meals)

### ❌ Not Implemented
- **Weather Integration** - `packages/core/src/weather.ts` exists, but nothing asks for location or calls it, so recommendations always use `normal` weather (see `FUTURE_ENHANCEMENTS.md`)

### ✅ Advanced Features (Complete)
- **Analytics Dashboard** - Visual insights with Recharts
- **PWA Support** - Offline functionality, service worker caching
- **Performance Monitoring** - Sentry integration
- **Recommendation Engine** - Heuristic linear scoring (hand-set weights) with weighted sampling from the top 5 meals
- **Load Testing** - Artillery-based performance testing

### ✅ Developer Experience (Complete)
- **TypeScript Monorepo** - Organized workspace structure
- **Testing** - Vitest unit/integration tests and Playwright E2E tests (coverage is not measured for the app package)
- **CI/CD Pipeline** - GitHub Actions with automated testing
- **Code Quality** - ESLint, Prettier, pre-commit hooks
- **Documentation** - Detailed architecture and API docs

## 🏗️ Architecture

```
meal-rec/
├── packages/
│   ├── core/          # Recommendation engine & utilities  ✅
│   ├── database/      # MongoDB models & connections       ✅
│   ├── config/        # Shared configurations             ✅
│   └── scripts/       # Load testing & utilities          ✅
├── meal-rec/          # Main Next.js application          ✅
├── data/              # Seed data (91 meals)              ✅
└── docs/              # Comprehensive documentation       ✅
```

## 📊 Current Status

### Tests
- `pnpm test` runs the Vitest suites for `packages/core`, `packages/database` and `meal-rec`; CI also runs the Playwright E2E flows
- Coverage is not measured in CI. `packages/core` defines coverage thresholds, enforced only when running `pnpm --filter @meal-rec/core test:coverage`

### Build Status
- ✅ Production build succeeds
- ✅ Linting passes
- ⚠️ `tsc --noEmit` reports type errors in test files (app source type-checks during `next build`)
- ⚠️ The scheduled dependency audit workflow (`dependency-check.yml`) is disabled for inactivity; its last runs failed on dev-tooling advisories

### API Endpoints Status
- ✅ `/api/meals` - Meal listing with pagination
- ✅ `/api/meals/random` - Random meal selection  
- ✅ `/api/recommend` - Heuristic recommendations used by the home page
- ✅ `/api/feedback` - Saves feedback for signed-in users (guests receive 401)
- ✅ `/api/auth/*` - Authentication system
- ✅ `/api/analytics` - Usage analytics

## Deployment Status

- ✅ **Live Production Deployment**: https://meal-rec.vercel.app/
- ✅ **MongoDB Atlas Integration**: Connected to cloud database
- ✅ **Vercel Platform**: Automated CI/CD from GitHub
- ✅ **Environment Configuration**: Production environment variables configured

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+
- MongoDB 5.0+

### Installation
```bash
git clone <repository-url>
cd meal-rec
pnpm install          # Installs dependencies + sets up pre-commit hooks
```

### Environment Setup
```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local with your values:
# For local development:
MONGO_URL=mongodb://localhost:27017/meal-rec
# For production: see DEPLOYMENT.md for MongoDB Atlas format

NEXTAUTH_SECRET=your-secret-key-here-minimum-32-characters
NEXTAUTH_URL=http://localhost:3000

# Optional monitoring
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

### Development
```bash
pnpm seed            # Populate database with sample meals
pnpm dev             # Start development server
pnpm test            # Run test suite
pnpm build           # Production build
```

## 🌐 Deployment Information

### Live Application
- **Production URL**: https://meal-rec.vercel.app/
- **Platform**: Vercel (Serverless deployment)
- **Database**: MongoDB Atlas (Cloud hosting)
- **CI/CD**: Automated GitHub integration

### Environment Setup
Production deployment uses:
- MongoDB Atlas cloud database with connection pooling
- Vercel's serverless functions for API routes
- Automatic HTTPS and CDN distribution
- Environment variables managed through Vercel dashboard

## 📋 Remaining Work

### Development & Maintenance
1. **Weather Integration** - Wire `getCurrentWeather` into the recommendation request
2. **Performance Optimization** - Additional caching, CDN setup
3. **Enhanced Monitoring** - More detailed analytics and alerting
4. **Run E2E Tests on Production** - Verify live environment functionality

## 🏆 Implementation Highlights

This project demonstrates:
- **Complete Full-Stack Implementation** - From database to PWA
- **Modern Development Practices** - TypeScript, testing, CI/CD
- **Recommendation Engine** - Heuristic scoring that adapts to quiz answers and feedback
- **Production-Ready Architecture** - Scalable, maintainable, documented
- **Layered Testing** - Unit, integration and end-to-end tests

## 📚 Documentation

- [`DEPLOYMENT.md`](DEPLOYMENT.md) - Complete production deployment guide with Vercel & MongoDB Atlas  
- [`RELEASE_NOTES.md`](RELEASE_NOTES.md) - Complete feature overview and deployment guide
- [`FUTURE_ENHANCEMENTS.md`](FUTURE_ENHANCEMENTS.md) - Features from the original specification that are not built yet
- [`docs/research/recommendation-engine/README.md`](docs/research/recommendation-engine/README.md) - Recommendation research: ten directions, predictive methods, data sources, and experiments
- [`docs/architecture-retrospective.md`](docs/architecture-retrospective.md) - Evidence-backed review of the recommendation engine
- [`docs/test-failures-analysis.md`](docs/test-failures-analysis.md) - Detailed test status analysis
- [`docs/performance.md`](docs/performance.md) - Performance monitoring guide

## 🤝 Contributing

The project follows established patterns and has unit, integration and E2E tests. See the documentation for architecture details and development guidelines.

---

**Built with**: Next.js 15, React 19, TypeScript, MongoDB Atlas, Tailwind CSS, Vitest, Playwright  
**Status**: Deployed at https://meal-rec.vercel.app/

<!-- ABOUTME: Progressive Web Application for personalized meal recommendations using heuristic scoring -->
<!-- ABOUTME: TypeScript monorepo with Next.js frontend, MongoDB backend, and comprehensive test suite -->