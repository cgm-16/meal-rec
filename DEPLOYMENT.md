# Deployment Guide

## 🌐 Live Application

**Production URL**: https://meal-rec.vercel.app/

This application is successfully deployed using Vercel for hosting and MongoDB Atlas for the database.

## 🏗️ Deployment Architecture

### Platform Stack
- **Frontend/API**: Vercel (Serverless deployment)
- **Database**: MongoDB Atlas (Cloud hosting)
- **CI/CD**: GitHub integration with Vercel
- **Domain**: Vercel-provided subdomain with automatic HTTPS

### Infrastructure Benefits
- **Auto-scaling**: Serverless functions scale automatically
- **Global CDN**: Automatic edge caching for static assets
- **Zero-downtime deploys**: Atomic deployments
- **HTTPS**: Automatic SSL certificate management

## 🚀 Deployment Process

### 1. Vercel Setup

1. **Connect GitHub Repository**
   ```bash
   # Link your GitHub repo to Vercel
   # Visit: https://vercel.com/new
   # Import your meal-rec repository
   ```

2. **Configure Build Settings**
   - **Framework Preset**: Next.js
   - **Root Directory**: `meal-rec/` (if monorepo)
   - **Build Command**: `pnpm build`
   - **Output Directory**: `.next` (auto-detected)

3. **Environment Variables Setup**
   Configure these in Vercel Dashboard → Settings → Environment Variables:
   ```bash
   MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/meal-rec?retryWrites=true&w=majority&appName=meal-rec
   NEXTAUTH_SECRET=your-production-secret-minimum-32-characters
   NEXTAUTH_URL=https://your-app.vercel.app
   ADMIN_USERNAME=your-admin-username
   ADMIN_PIN=your-admin-pin
   NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
   ```

### 2. MongoDB Atlas Setup

1. **Create MongoDB Atlas Account**
   - Visit https://www.mongodb.com/atlas
   - Create a new cluster

2. **Database Configuration**
   ```bash
   # Cluster Name: meal-rec
   # Database Name: meal-rec
   # Collections: users, meals, feedback
   ```

3. **Network Access**
   - Add IP Address: `0.0.0.0/0` (Allow from anywhere for Vercel)
   - Or use specific Vercel IP ranges if available

4. **Database User**
   ```bash
   # Create database user with read/write permissions
   # Username: your-db-user
   # Password: secure-password
   ```

5. **Connection String Format**
   ```
   mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority&appName=<appName>
   ```

### 3. Data Seeding

Seed your production database:

```bash
# Local seeding (connects to production DB)
MONGO_URL="your-production-mongo-url" pnpm seed

# Or run seed script in Vercel serverless function
# Create /api/seed endpoint for one-time use
```

## 🔧 Environment Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/meal-rec?options` |
| `NEXTAUTH_SECRET` | NextAuth.js secret key | `32-character-random-string` |
| `NEXTAUTH_URL` | Application base URL | `https://meal-rec.vercel.app` |
| `ADMIN_USERNAME` | Admin panel username | `admin` |
| `ADMIN_PIN` | Admin panel PIN | `1234` |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry error tracking |
| `SENTRY_AUTH_TOKEN` | Sentry deployment integration |

## 🔄 CI/CD Pipeline

### Automatic Deployments

Vercel automatically deploys on:
- **Production**: Pushes to `main` branch → https://meal-rec.vercel.app
- **Preview**: Pull requests → Unique preview URLs
- **Development**: Pushes to other branches → Branch preview URLs

### Build Process

```bash
# Vercel build steps:
1. pnpm install          # Install dependencies
2. pnpm build           # Next.js production build  
3. Deploy functions     # Deploy serverless API routes
4. Update CDN          # Invalidate and update global cache
```

## 🔍 Monitoring & Observability

### Vercel Analytics
- **Performance**: Core Web Vitals monitoring
- **Usage**: Request volume and response times  
- **Errors**: Build and runtime error tracking

### Sentry Integration
- **Error Tracking**: Automatic error capture and alerts
- **Performance Monitoring**: API response time tracking
- **Source Maps**: Deployed for better debugging

### Health Checks
- **Database Connection**: Monitor MongoDB Atlas connectivity
- **API Endpoints**: Verify critical routes respond correctly
- **Service Worker**: Ensure PWA functionality works

## 🚨 Troubleshooting

### Common Deployment Issues

1. **Build Failures**
   ```bash
   # Check build logs in Vercel dashboard
   # Common issues:
   - Missing environment variables
   - TypeScript compilation errors  
   - Missing dependencies
   ```

2. **Database Connection Issues**
   ```bash
   # Verify MongoDB Atlas:
   - Network access whitelist includes 0.0.0.0/0
   - Database user has correct permissions
   - Connection string format is correct
   - Database name matches the one in connection string
   ```

3. **Environment Variable Problems**
   ```bash
   # Ensure all required vars are set in Vercel:
   - MONGO_URL (with database name)
   - NEXTAUTH_SECRET (minimum 32 chars)
   - NEXTAUTH_URL (matches deployment URL)
   ```

### Testing Deployment

```bash
# Test critical functionality:
1. Visit https://meal-rec.vercel.app
2. Test user signup/signin
3. Verify random meal recommendations work
4. Check admin panel access
5. Test offline PWA functionality
```

## 🔄 Rolling Back Deployments

If issues arise:

1. **Vercel Dashboard**: Visit Deployments → Click previous version → Promote to Production
2. **Git Revert**: Revert commits and push to trigger automatic redeployment
3. **Environment Rollback**: Restore previous environment variable values

## 📊 Performance Optimization

### Production Optimizations Applied
- **Static Generation**: Pages pre-rendered at build time
- **Image Optimization**: Automatic WebP conversion and sizing
- **Code Splitting**: Automatic bundle optimization
- **Service Worker**: Offline caching for PWA functionality
- **CDN**: Global edge caching for static assets

### Database Optimizations
- **Connection Pooling**: Configured in MongoDB Atlas
- **Indexing**: Optimized queries on meal and user collections
- **Aggregation**: Efficient random meal selection

---

**Last Updated**: September 2, 2025  
**Status**: ✅ Production Deployed & Live