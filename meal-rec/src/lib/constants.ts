// ABOUTME: Application-wide constants to avoid magic numbers
// ABOUTME: Centralized configuration values for maintainability and consistency

export const APP_CONSTANTS = {
  // Feedback system
  RECENT_FEEDBACK_DAYS: 14,
  
  // Recommendations  
  CANDIDATE_MEALS_SAMPLE_SIZE: 50,
  DEFAULT_QUIZ_SPICINESS: 2,
  DEFAULT_QUIZ_SURPRISE_FACTOR: 5,
  
  // Analytics & Display
  ANALYTICS_RESULTS_LIMIT: 10,
  CHART_DISPLAY_LIMIT: 5,
  FLAVOR_TAGS_DISPLAY_LIMIT: 10,
  
  // Auth
  MIN_USERNAME_LENGTH: 3,
  PIN_LENGTH: 4,
  MAX_FAILED_SIGNIN_ATTEMPTS: 5,
  SIGNIN_LOCKOUT_MINUTES: 15,
  SESSION_MAX_AGE_DAYS: 7,
  
  // API Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;