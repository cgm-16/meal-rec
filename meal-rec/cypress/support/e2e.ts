// ABOUTME: Cypress support file for global commands and configuration
// ABOUTME: Sets up custom commands and imports for admin portal E2E testing

/// <reference types="cypress" />

// Custom commands for admin testing
Cypress.Commands.add('login', (username: string, pin: string) => {
  cy.visit('/auth/signin');
  cy.get('input[name="username"]').type(username);
  cy.get('input[name="pin"]').type(pin);
  cy.get('button[type="submit"]').click();
});

Cypress.Commands.add('loginAsAdmin', () => {
  cy.login('admin', '1234');
});

declare global {
  namespace Cypress {
    interface Chainable {
      login(username: string, pin: string): Chainable<void>;
      loginAsAdmin(): Chainable<void>;
    }
  }
}