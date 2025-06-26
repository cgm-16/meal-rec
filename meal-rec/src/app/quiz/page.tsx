// ABOUTME: Quiz flow page with multi-step form collecting food preferences
// ABOUTME: Saves answers to localStorage and redirects to home after completion

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface QuizAnswers {
  ingredientsToAvoid: string[];
  spiciness: number;
  surpriseFactor: number;
}

export default function Quiz() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<QuizAnswers>({
    ingredientsToAvoid: [],
    spiciness: 0,
    surpriseFactor: 5
  });

  const commonIngredients = [
    'nuts', 'shellfish', 'dairy', 'eggs', 'soy', 'gluten', 
    'fish', 'sesame', 'mushrooms', 'onions'
  ];

  const handleIngredientToggle = (ingredient: string) => {
    setAnswers(prev => ({
      ...prev,
      ingredientsToAvoid: prev.ingredientsToAvoid.includes(ingredient)
        ? prev.ingredientsToAvoid.filter(i => i !== ingredient)
        : [...prev.ingredientsToAvoid, ingredient]
    }));
  };

  const handleSubmit = () => {
    // Save to localStorage
    localStorage.setItem('quizAnswers', JSON.stringify(answers));
    // Redirect to home
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h1 className="text-2xl font-bold text-gray-900">Food Preferences Quiz</h1>
              <span className="text-sm text-gray-500">Step {step} of 3</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(step / 3) * 100}%` }}
              ></div>
            </div>
          </div>

          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">What ingredients would you like to avoid?</h2>
              <p className="text-gray-600 mb-6">Select any ingredients you prefer not to have in your meals.</p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                {commonIngredients.map(ingredient => (
                  <button
                    key={ingredient}
                    onClick={() => handleIngredientToggle(ingredient)}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      answers.ingredientsToAvoid.includes(ingredient)
                        ? 'border-red-500 bg-red-50 text-red-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                    data-testid={`ingredient-${ingredient}`}
                  >
                    {ingredient}
                  </button>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  data-testid="next-step-1"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">How spicy do you like your food?</h2>
              <p className="text-gray-600 mb-6">Rate your spice tolerance from 0 (no spice) to 5 (very spicy).</p>
              
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500">No spice</span>
                  <span className="text-sm text-gray-500">Very spicy</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="5"
                  value={answers.spiciness}
                  onChange={(e) => setAnswers(prev => ({ ...prev, spiciness: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  data-testid="spiciness-slider"
                />
                <div className="text-center mt-2">
                  <span className="text-lg font-semibold text-blue-600" data-testid="spiciness-value">
                    {answers.spiciness}
                  </span>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                  data-testid="back-step-2"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  data-testid="next-step-2"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">How adventurous are you feeling?</h2>
              <p className="text-gray-600 mb-6">Rate your surprise factor from 0 (familiar foods) to 10 (totally surprise me!).</p>
              
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-500">Familiar</span>
                  <span className="text-sm text-gray-500">Surprise me!</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={answers.surpriseFactor}
                  onChange={(e) => setAnswers(prev => ({ ...prev, surpriseFactor: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  data-testid="surprise-slider"
                />
                <div className="text-center mt-2">
                  <span className="text-lg font-semibold text-blue-600" data-testid="surprise-value">
                    {answers.surpriseFactor}
                  </span>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                  data-testid="back-step-3"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  data-testid="submit-quiz"
                >
                  Complete Quiz
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}