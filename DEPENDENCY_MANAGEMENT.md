# Dependency Management Guidelines

## ABOUTME: Guidelines for managing dependencies and preventing deprecated package issues
## ABOUTME: Provides team processes for dependency maintenance and security

## Regular Maintenance Schedule

### Weekly (Automated via GitHub Actions)
- **Monday 9 AM**: Dependency security & deprecation check runs automatically
- Review any warnings in GitHub Actions output

### Monthly (Manual)
```bash
# Check for outdated and vulnerable packages
pnpm run deps:check

# Interactive update of packages
pnpm run deps:update

# Clean up unused dependencies
pnpm run deps:clean
```

## Before Adding New Dependencies

1. **Research the package**:
   - Check last updated date (`pnpm info <package>`)
   - Review GitHub activity and issues
   - Look for active maintenance

2. **Prefer packages that**:
   - Have recent updates (within 6 months)
   - Have good TypeScript support
   - Are widely adopted
   - Have clear upgrade paths

3. **Avoid packages that**:
   - Haven't been updated in > 1 year
   - Have open security vulnerabilities
   - Are marked as deprecated
   - Have better alternatives

## When Deprecation Warnings Appear

1. **Immediate action** (within 1 sprint):
   - Remove unused `@types/*` packages if the main package includes types
   - Update packages with direct replacements

2. **Plan for replacement** (within 1-2 sprints):
   - Research alternatives for deprecated packages
   - Create migration plan for breaking changes
   - Update dependencies systematically

3. **Document decisions**:
   - Record why certain deprecated dependencies remain
   - Set timeline for replacement
   - Monitor for security implications

## Tools & Commands

```bash
# Check for security vulnerabilities
pnpm audit

# Check for outdated packages
pnpm outdated

# Update all packages interactively
pnpm update --interactive

# Check why a package is installed
pnpm why <package-name>

# Remove unused dependencies
pnpm prune

# Check for duplicate dependencies
pnpm dedupe
```

## Emergency Response

If a critical security vulnerability is found:

1. **Immediate**: Update the vulnerable package
2. **Test**: Run full test suite
3. **Deploy**: Emergency deployment if needed
4. **Document**: Record the incident and prevention measures