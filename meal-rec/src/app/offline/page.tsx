// ABOUTME: Offline fallback page for PWA when network is unavailable
// ABOUTME: Displays helpful message and cached content options

'use client';

import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md mx-auto text-center">
        <div className="mb-8">
          <div className="text-6xl mb-4">🍽️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            You&rsquo;re Offline
          </h1>
          <p className="text-gray-600">
            It looks like you&rsquo;re not connected to the internet. Don&rsquo;t worry, you can still browse your recent meal recommendations!
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">What you can do:</h2>
          <ul className="text-left space-y-2 text-gray-700">
            <li>• Browse previously loaded meals</li>
            <li>• View your quiz results</li>
            <li>• Check the explore analytics</li>
          </ul>
        </div>
        
        <div className="space-y-3">
          <Link 
            href="/"
            className="block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse previously loaded meals
          </Link>
          
          <button 
            onClick={() => window.history.back()}
            className="text-blue-600 hover:text-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}