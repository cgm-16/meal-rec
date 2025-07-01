# Temporary TODO List

## Database & Images (In Progress)
- [ ] Fix database seeding with proper dotenv support
- [ ] Add imageUrl fields to all meals in data/meals.json using Picsum photos  
- [ ] Replace emoji fallback (🍽️) in MealCard with actual default image
- [ ] Reseed database with image data

## ESLint Configuration Issues
- [ ] Add proper ESLint configuration to packages/database and packages/core
- [ ] Fix inconsistent linting standards across monorepo packages
- [ ] Migrate to flat config format or maintain consistent legacy format
- [ ] Add lint scripts to all package.json files

## Sentry Configuration Warnings (Original Request)
- [ ] Fix Sentry onRequestError hook warning in instrumentation file
- [ ] Add global error handler for Sentry (global-error.js)
- [ ] Fix Sentry config file deprecation warning (rename sentry.client.config.ts)
- [ ] Address Serwist disabled warnings (or determine if they can be ignored)

## Notes
- Pre-commit hooks are failing due to ESLint configuration issues
- Database package lacks proper tooling setup compared to main app
- System reminders keep reverting changes during commit attempts