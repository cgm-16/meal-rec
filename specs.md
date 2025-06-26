# Meal Recommendation Service - Developer Specification

## Overview
A Progressive Web Application (PWA) designed to recommend meals with emphasis on variety and surprise. The app balances user preferences, real-time location and weather data, user feedback, and a simple initial quiz to deliver personalized recommendations.

## Goals
- Provide varied, exploratory, and surprising meal suggestions.
- Personalize recommendations through user feedback and optional account-based history.
- Ensure recommendations are contextually appropriate based on location and weather.

## Platform
- Progressive Web Application (PWA) accessible across devices.

## Meal Database
- Minimum 5,000 meal entries.
- Editable and scalable to accommodate future expansion.

### Meal Entry Attributes
- Meal Name
- Cuisine Type
- Primary Ingredients
- Common Allergens
- Recommended Weather Conditions
- Recommended Time of Day
- Spiciness Level
- Heaviness Level
- Image URL
- Short Description
- Flavor Tags (salty, sweet, sour, bitter, umami, fatty)

## User Interaction

### Initial Quiz
All users complete an initial quiz influencing algorithmic recommendations:
- Ingredients to avoid (optional for registered users after initial use)
- Spiciness tolerance (optional for registered users after initial use)
- Surprise factor preference (optional for registered users after initial use)
- Selection from a randomized list of 10 meals to dislike/exclude.

### User Feedback
Users provide immediate feedback via clearly defined buttons:
- **Like:** Positive reinforcement, influences recommendations based on "Surprise Factor".
- **Interested:** Mild positive reinforcement, reduces immediate recurrence, fixed lower impact.
- **Dislike:** Negative reinforcement, reduces likelihood based on "Surprise Factor".

## Feedback Influence & Storage

### Guest Users
- Feedback affects current session only.

### Registered Users
- Feedback stored persistently with a 2-week sliding window.
- Users can permanently remove meals, reversible via preference settings.
- "Interested" feedback reduces recommendation frequency for one day.

## Recommendation Algorithm

### Initial Recommendation
- Filtered randomly based on quiz and stored feedback.

### Subsequent Recommendations
- Weighted scoring system considering:
  - Feedback (Like, Interested, Dislike)
  - Surprise Factor from the quiz
  - Weather and location data
- Feedback dynamically adjusts algorithm, regenerating recommendation after each input.

### Human-readable Explanation
The algorithm dynamically assigns weights based on previous user interactions, feedback, and quiz inputs. Meals matching positive feedback receive preference, moderated by the user's specified surprise factor. Weather and location contextualize the recommendations, ensuring practical and appealing suggestions. Negative feedback proportionally reduces future recommendations.

## UI & UX
- Single meal recommendation displayed at once.
- Recommendation includes meal image, name, and flavor tags.
- Clear feedback buttons beneath recommendation.
- SVG loading animation during recommendation generation.

## Location & Weather Integration
- Opt-in location permission request.
- Recommendations adjusted according to current weather conditions.

## User Accounts & Data Management
- Authentication via simple username and PIN.
- Stored Data: Username, PIN (hashed), feedback history, and preferences.
- User can retake quizzes and edit/delete feedback history via preferences page.

## Privacy and Consent
- Clearly presented, separate privacy policy page.
- Account data deletion and management tools provided.

## Admin Management Tools
- Secure admin authentication (username, password, captcha).
- Tools to manage meal database and user accounts.

## Explore Tab
A dedicated analytics section showing:
- Rankings: Most liked/disliked meals.
- Rankings: Most liked/disliked flavor tags.
- Visualized trends over time.
- Summarized feedback and preferences description.

## Open Graph Metadata
- Title
- Type
- Representative Image
- URL
- Description

## Performance and Scalability
- Algorithm designed for scalability (5,000 to 20,000+ meals).
- Flexible addition of new flavor tags.
- Short recommendation generation delay acceptable with loading animation.

## Error Handling
- Graceful degradation if location/weather data unavailable.
- Input validation for user accounts and admin authentication.
- Fallback recommendations if certain data is incomplete.

## Testing Plan
- Unit testing:
  - Recommendation algorithm
  - User feedback mechanisms
  - Data storage/retrieval integrity
- Integration testing:
  - UI and recommendation integration
  - Location and weather data accuracy
- Performance testing:
  - Scalability and response times
- User acceptance testing (UAT):
  - Quiz clarity
  - Recommendation accuracy and relevance
  - Admin tool effectiveness

This specification ensures developers have clear, actionable guidelines to implement a robust and user-friendly meal recommendation service.
