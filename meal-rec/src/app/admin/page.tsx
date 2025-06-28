// ABOUTME: Admin dashboard page with meal and user management tables
// ABOUTME: Protected route with role-based access control and CRUD operations

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Meal {
  _id: string;
  name: string;
  cuisine?: string;
  primaryIngredients: string[];
  allergens: string[];
  weather: string[];
  timeOfDay: string[];
  spiciness: number;
  heaviness: number;
  imageUrl?: string;
  description?: string;
  flavorTags: string[];
}

interface User {
  _id: string;
  username: string;
  role: 'user' | 'admin';
  banned: boolean;
  createdAt: string;
}

export default function AdminPage() {
  const sessionResult = useSession();
  const { data: session, status } = sessionResult || { data: null, status: 'loading' };
  const router = useRouter();
  
  const [meals, setMeals] = useState<Meal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'meals' | 'users'>('meals');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [showMealDialog, setShowMealDialog] = useState(false);
  const [mealFormData, setMealFormData] = useState<Partial<Meal>>({});

  // Redirect if not authenticated or not admin
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }
    
    // Note: In a real app, you'd check the user's role from the session
    // For now, we'll let the API handle the admin check
    fetchData();
  }, [session, status, router]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [mealsResponse, usersResponse] = await Promise.all([
        fetch('/api/admin/meals'),
        fetch('/api/admin/users')
      ]);
      
      if (!mealsResponse.ok || !usersResponse.ok) {
        if (mealsResponse.status === 403 || usersResponse.status === 403) {
          setError('Admin access required');
          return;
        }
        throw new Error('Failed to fetch admin data');
      }
      
      const mealsData = await mealsResponse.json();
      const usersData = await usersResponse.json();
      
      setMeals(mealsData.meals);
      setUsers(usersData.users);
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    if (!confirm('Are you sure you want to delete this meal?')) return;
    
    try {
      const response = await fetch(`/api/admin/meals/${mealId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete meal');
      }
      
      setMeals(meals.filter(meal => meal._id !== mealId));
    } catch (err) {
      console.error('Delete meal error:', err);
      alert('Failed to delete meal');
    }
  };

  const handleEditMeal = (meal: Meal) => {
    setEditingMeal(meal);
    setMealFormData(meal);
    setShowMealDialog(true);
  };

  const handleCreateMeal = () => {
    setEditingMeal(null);
    setMealFormData({
      name: '',
      cuisine: '',
      primaryIngredients: [],
      allergens: [],
      weather: [],
      timeOfDay: [],
      spiciness: 0,
      heaviness: 0,
      imageUrl: '',
      description: '',
      flavorTags: []
    });
    setShowMealDialog(true);
  };

  const handleSaveMeal = async () => {
    try {
      const url = editingMeal 
        ? `/api/admin/meals/${editingMeal._id}`
        : '/api/admin/meals';
      
      const method = editingMeal ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mealFormData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save meal');
      }
      
      await fetchData(); // Refresh data
      setShowMealDialog(false);
    } catch (err) {
      console.error('Save meal error:', err);
      alert(err instanceof Error ? err.message : 'Failed to save meal');
    }
  };

  const handleToggleUserBan = async (userId: string, currentBanned: boolean) => {
    const action = currentBanned ? 'unban' : 'ban';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    
    try {
      const response = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ banned: !currentBanned })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${action} user`);
      }
      
      setUsers(users.map(user => 
        user._id === userId 
          ? { ...user, banned: !currentBanned }
          : user
      ));
    } catch (err) {
      console.error('Toggle user ban error:', err);
      alert(err instanceof Error ? err.message : `Failed to ${action} user`);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading admin panel...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800 font-medium">{error}</div>
          <button
            data-cy="go-home-btn"
            onClick={() => router.push('/')}
            className="mt-2 bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded text-sm"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Admin Panel</h1>
        
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              data-cy="meals-tab"
              onClick={() => setActiveTab('meals')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'meals'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Meals ({meals.length})
            </button>
            <button
              data-cy="users-tab"
              onClick={() => setActiveTab('users')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Users ({users.length})
            </button>
          </nav>
        </div>

        {/* Meals Tab */}
        {activeTab === 'meals' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Meal Management</h2>
              <button
                data-cy="add-meal-btn"
                onClick={handleCreateMeal}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
              >
                Add New Meal
              </button>
            </div>
            
            <div className="bg-white shadow overflow-hidden rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cuisine
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Spiciness
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {meals.map((meal) => (
                    <tr key={meal._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {meal.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {meal.cuisine || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {meal.spiciness}/5
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          data-cy="edit-meal-btn"
                          onClick={() => handleEditMeal(meal)}
                          className="text-blue-600 hover:text-blue-900 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          data-cy="delete-meal-btn"
                          onClick={() => handleDeleteMeal(meal._id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">User Management</h2>
            </div>
            
            <div className="bg-white shadow overflow-hidden rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Username
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {user.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.role === 'admin' 
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.banned 
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {user.banned ? 'Banned' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {user.role !== 'admin' && (
                          <button
                            data-cy={user.banned ? 'unban-user-btn' : 'ban-user-btn'}
                            onClick={() => handleToggleUserBan(user._id, user.banned)}
                            className={`${
                              user.banned 
                                ? 'text-green-600 hover:text-green-900'
                                : 'text-red-600 hover:text-red-900'
                            }`}
                          >
                            {user.banned ? 'Unban' : 'Ban'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Meal Edit/Create Dialog */}
        {showMealDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div data-cy="meal-dialog" className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  {editingMeal ? 'Edit Meal' : 'Create New Meal'}
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      name="name"
                      type="text"
                      value={mealFormData.name || ''}
                      onChange={(e) => setMealFormData({ ...mealFormData, name: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Cuisine</label>
                    <input
                      name="cuisine"
                      type="text"
                      value={mealFormData.cuisine || ''}
                      onChange={(e) => setMealFormData({ ...mealFormData, cuisine: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      value={mealFormData.description || ''}
                      onChange={(e) => setMealFormData({ ...mealFormData, description: e.target.value })}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      rows={3}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Spiciness (0-5)</label>
                      <input
                        name="spiciness"
                        type="number"
                        min="0"
                        max="5"
                        value={mealFormData.spiciness || 0}
                        onChange={(e) => setMealFormData({ ...mealFormData, spiciness: parseInt(e.target.value) })}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Heaviness (0-5)</label>
                      <input
                        type="number"
                        min="0"
                        max="5"
                        value={mealFormData.heaviness || 0}
                        onChange={(e) => setMealFormData({ ...mealFormData, heaviness: parseInt(e.target.value) })}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Primary Ingredients (comma-separated)</label>
                    <input
                      name="primaryIngredients"
                      type="text"
                      value={(mealFormData.primaryIngredients || []).join(', ')}
                      onChange={(e) => setMealFormData({ 
                        ...mealFormData, 
                        primaryIngredients: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                      })}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Flavor Tags (comma-separated)</label>
                    <input
                      type="text"
                      value={(mealFormData.flavorTags || []).join(', ')}
                      onChange={(e) => setMealFormData({ 
                        ...mealFormData, 
                        flavorTags: e.target.value.split(',').map(s => s.trim()).filter(s => s)
                      })}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setShowMealDialog(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    data-cy="save-meal-btn"
                    onClick={handleSaveMeal}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                  >
                    {editingMeal ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}