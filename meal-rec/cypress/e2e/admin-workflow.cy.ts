// ABOUTME: Cypress E2E tests for admin workflow - meal and user management
// ABOUTME: Tests complete admin portal functionality including CRUD operations

describe('Admin Workflow', () => {
  beforeEach(() => {
    // Intercept API calls to avoid real database operations
    cy.intercept('GET', '/api/admin/meals', {
      fixture: 'admin-meals.json'
    }).as('getMeals');
    
    cy.intercept('GET', '/api/admin/users', {
      fixture: 'admin-users.json'
    }).as('getUsers');
    
    // Mock session check
    cy.intercept('GET', '/api/auth/session', {
      body: {
        user: {
          id: 'admin-user-id',
          name: 'admin',
          email: null
        },
        expires: '2024-12-31T23:59:59.999Z'
      }
    });
  });

  it('should display admin dashboard for authenticated admin', () => {
    cy.loginAsAdmin();
    cy.visit('/admin');
    
    cy.wait('@getMeals');
    cy.wait('@getUsers');
    
    // Check admin panel loads
    cy.contains('Admin Panel').should('be.visible');
    cy.contains('Meal Management').should('be.visible');
    
    // Check tabs are present
    cy.get('[data-cy="meals-tab"]').should('contain', 'Meals');
    cy.get('[data-cy="users-tab"]').should('contain', 'Users');
  });

  it('should manage meals - create, edit, delete', () => {
    cy.loginAsAdmin();
    cy.visit('/admin');
    
    cy.wait('@getMeals');
    
    // Test meal creation
    cy.intercept('POST', '/api/admin/meals', {
      body: {
        meal: {
          _id: 'new-meal-id',
          name: 'Test Meal',
          cuisine: 'Test Cuisine',
          primaryIngredients: ['test ingredient'],
          spiciness: 3,
          heaviness: 2
        }
      }
    }).as('createMeal');
    
    cy.get('[data-cy="add-meal-btn"]').click();
    cy.get('[data-cy="meal-dialog"]').should('be.visible');
    
    // Fill out meal form
    cy.get('input[name="name"]').type('Test Meal');
    cy.get('input[name="cuisine"]').type('Test Cuisine');
    cy.get('input[name="spiciness"]').clear().type('3');
    cy.get('input[name="primaryIngredients"]').type('test ingredient');
    
    cy.get('[data-cy="save-meal-btn"]').click();
    cy.wait('@createMeal');
    
    // Test meal editing
    cy.intercept('PUT', '/api/admin/meals/*', {
      body: {
        meal: {
          _id: 'existing-meal-id',
          name: 'Updated Meal',
          cuisine: 'Updated Cuisine'
        }
      }
    }).as('updateMeal');
    
    cy.get('[data-cy="edit-meal-btn"]').first().click();
    cy.get('input[name="name"]').clear().type('Updated Meal');
    cy.get('[data-cy="save-meal-btn"]').click();
    cy.wait('@updateMeal');
    
    // Test meal deletion
    cy.intercept('DELETE', '/api/admin/meals/*', {
      body: { message: 'Meal deleted successfully' }
    }).as('deleteMeal');
    
    // Mock window.confirm to return true
    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(true);
    });
    
    cy.get('[data-cy="delete-meal-btn"]').first().click();
    cy.wait('@deleteMeal');
  });

  it('should manage users - ban and unban', () => {
    cy.loginAsAdmin();
    cy.visit('/admin');
    
    cy.wait('@getMeals');
    cy.wait('@getUsers');
    
    // Switch to users tab
    cy.get('[data-cy="users-tab"]').click();
    cy.contains('User Management').should('be.visible');
    
    // Test user banning
    cy.intercept('POST', '/api/admin/users/*/ban', {
      body: {
        message: 'User banned successfully',
        user: {
          _id: 'user-id',
          username: 'testuser',
          banned: true
        }
      }
    }).as('banUser');
    
    // Mock window.confirm to return true
    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(true);
    });
    
    cy.get('[data-cy="ban-user-btn"]').first().click();
    cy.wait('@banUser');
    
    // Test user unbanning
    cy.intercept('POST', '/api/admin/users/*/ban', {
      body: {
        message: 'User unbanned successfully',
        user: {
          _id: 'user-id',
          username: 'testuser',
          banned: false
        }
      }
    }).as('unbanUser');
    
    cy.get('[data-cy="unban-user-btn"]').first().click();
    cy.wait('@unbanUser');
  });

  it('should handle unauthorized access', () => {
    // Mock unauthorized response
    cy.intercept('GET', '/api/admin/meals', {
      statusCode: 403,
      body: { error: 'Admin access required' }
    });
    
    cy.intercept('GET', '/api/admin/users', {
      statusCode: 403,
      body: { error: 'Admin access required' }
    });
    
    cy.visit('/admin');
    
    // Should show error message
    cy.contains('Admin access required').should('be.visible');
    cy.get('[data-cy="go-home-btn"]').should('be.visible');
  });

  it('should handle API errors gracefully', () => {
    cy.loginAsAdmin();
    
    // Mock server error
    cy.intercept('GET', '/api/admin/meals', {
      statusCode: 500,
      body: { error: 'Internal server error' }
    });
    
    cy.intercept('GET', '/api/admin/users', {
      statusCode: 500,
      body: { error: 'Internal server error' }
    });
    
    cy.visit('/admin');
    
    // Should show error message
    cy.contains('Failed to load admin data').should('be.visible');
  });

  it('should prevent regular users from accessing admin panel', () => {
    // Mock regular user session
    cy.intercept('GET', '/api/auth/session', {
      body: {
        user: {
          id: 'regular-user-id',
          name: 'regularuser',
          email: null
        },
        expires: '2024-12-31T23:59:59.999Z'
      }
    });
    
    cy.intercept('GET', '/api/admin/meals', {
      statusCode: 403,
      body: { error: 'Admin access required' }
    });
    
    cy.intercept('GET', '/api/admin/users', {
      statusCode: 403,
      body: { error: 'Admin access required' }
    });
    
    cy.login('regularuser', '1234');
    cy.visit('/admin');
    
    cy.contains('Admin access required').should('be.visible');
  });
});