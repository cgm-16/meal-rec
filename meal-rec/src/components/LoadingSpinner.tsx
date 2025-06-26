// ABOUTME: Loading spinner component with fork and knife animation
// ABOUTME: Shows while fetching meal recommendations

export function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="relative">
        <div className="animate-spin text-6xl">
          🍴
        </div>
      </div>
      <p className="mt-4 text-gray-600 font-medium">
        Finding your next meal...
      </p>
    </div>
  );
}