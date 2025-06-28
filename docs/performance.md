# Performance Monitoring & Testing

## ABOUTME: Comprehensive guide for performance monitoring and load testing
## ABOUTME: Covers Sentry monitoring, Artillery load testing, and optimization strategies

## Overview

This document outlines the performance monitoring and testing setup for the Meal Recommendation PWA. We use Sentry for error tracking and performance monitoring, and Artillery for load testing.

## Error Monitoring with Sentry

### Setup

Sentry is configured to monitor both client-side and server-side errors with performance tracking enabled.

**Environment Variables Required:**
```bash
# Client-side DSN (public, used in browser)
NEXT_PUBLIC_SENTRY_DSN=https://your-public-dsn@sentry.io/project-id

# Server-side DSN (private, used on server)
SENTRY_DSN=https://your-private-dsn@sentry.io/project-id

# Optional: Sentry organization and project for source map uploads
SENTRY_ORG=mealrec
SENTRY_PROJECT=meal-recommendation-pwa
```

### Features Enabled

- **Error Tracking**: Automatic capture of JavaScript errors, API errors, and crashes
- **Performance Monitoring**: Transaction tracing for API routes and page loads
- **Source Maps**: Uploaded for readable stack traces in production
- **Release Tracking**: Automatic release detection and tracking
- **User Context**: Session and user information attached to events

### Monitoring Routes

- **Tunnel Route**: `/monitoring` - Routes Sentry requests through Next.js to avoid ad-blockers
- **Automatic Instrumentation**: All API routes and pages are automatically instrumented

## Load Testing with Artillery

### Quick Start

Run a load test against your local development server:

```bash
# Start your development server
pnpm dev

# In another terminal, run the load test
cd packages/scripts
npx ts-node loadtest.ts http://localhost:3000
```

### Test Scenarios

The load test includes four main scenarios:

1. **Guest User Flow (60% of traffic)**
   - Visit homepage
   - Get random meal recommendation
   - Submit feedback
   - Get another recommendation

2. **Quiz Flow (20% of traffic)**
   - Visit quiz page
   - Submit quiz answers
   - Get personalized recommendation

3. **Analytics Browsing (15% of traffic)**
   - Visit explore page
   - Load analytics data

4. **API Stress Test (5% of traffic)**
   - Rapid API calls to test throughput

### Load Test Phases

1. **Warm up** (60s): 5 requests/second
2. **Ramp up** (120s): 10 requests/second
3. **Sustained load** (300s): 20 requests/second
4. **Peak load** (60s): 50 requests/second
5. **Cool down** (120s): 5 requests/second

### Running Tests in CI

Load tests run automatically when a PR is labeled with `performance`:

1. Add the `performance` label to your PR
2. GitHub Actions will:
   - Build the application
   - Start it with a test database
   - Run the load test suite
   - Generate and upload results
   - Comment performance metrics on the PR

### Interpreting Results

Key metrics to monitor:

- **Success Rate**: Should be >99% under normal load
- **Average Response Time**: Should be <200ms for API routes
- **95th Percentile**: Should be <500ms for API routes
- **99th Percentile**: Should be <1000ms for API routes
- **Error Rate**: Should be <1% under sustained load

## Performance Optimization Strategies

### Database Optimization

1. **Indexing**: Ensure proper indexes on frequently queried fields
   - `name` field in meals collection (for search)
   - `userId` field in feedback collection (for user queries)
   - Compound indexes for complex queries

2. **Connection Pooling**: MongoDB connections are pooled automatically by Mongoose

3. **Query Optimization**: 
   - Use projection to limit returned fields
   - Implement pagination for large result sets
   - Use aggregation pipelines for complex analytics

### API Performance

1. **Caching**: 
   - Implemented in PWA service worker for `/api/meals` and `/api/recommend`
   - Consider Redis for server-side caching of expensive operations

2. **Rate Limiting**: Consider implementing rate limiting for public APIs

3. **Response Compression**: Next.js handles gzip compression automatically

### Frontend Performance

1. **Code Splitting**: Next.js automatically splits code by routes
2. **Image Optimization**: Use Next.js Image component for optimized loading
3. **PWA Caching**: Service worker caches API responses and static assets

## Monitoring in Production

### Sentry Alerts

Configure alerts for:
- Error rate >1% in 5 minutes
- Performance degradation >500ms average response time
- High memory usage or crashes

### Key Performance Indicators (KPIs)

Track these metrics:
- **API Response Times**: 95th percentile <500ms
- **Page Load Times**: First Contentful Paint <1.5s
- **Error Rate**: <0.5% of total requests
- **Database Query Times**: <100ms average
- **Cache Hit Rate**: >80% for frequently accessed data

## Troubleshooting Performance Issues

### High Response Times

1. Check database query performance with MongoDB profiler
2. Review Sentry performance traces for slow operations
3. Verify adequate server resources (CPU, memory)
4. Check for memory leaks in long-running processes

### High Error Rates

1. Review Sentry error reports for common patterns
2. Check database connectivity and health
3. Verify environment variables and configuration
4. Review application logs for detailed error context

### Database Performance

1. Use MongoDB Compass to analyze query performance
2. Review slow query logs
3. Check index usage with `explain()` plans
4. Monitor connection pool usage

## Load Testing Best Practices

### Test Environment

- Use a staging environment that mirrors production
- Seed database with realistic test data
- Test with production-like network conditions
- Include authentication and real user flows

### Test Data Management

- Use consistent test datasets for reproducible results
- Clean up test data between runs
- Consider data privacy for any production-like data

### Continuous Performance Testing

- Run load tests on major feature releases
- Include performance tests in CI/CD pipeline
- Set performance budgets and fail builds if exceeded
- Track performance trends over time

## Emergency Response

### Performance Incident Response

1. **Immediate**: Check Sentry for error spikes and performance degradation
2. **Assess**: Use monitoring data to identify affected components
3. **Mitigate**: Scale resources or rollback if necessary
4. **Investigate**: Use load testing to reproduce issues safely
5. **Resolve**: Fix root cause and verify with load tests
6. **Follow-up**: Update monitoring and add preventive measures

### Escalation Procedures

1. Performance degradation >2x normal response times
2. Error rate >5% for >5 minutes
3. Complete service unavailability
4. Database connection failures

Contact on-call engineer and follow incident response procedures.