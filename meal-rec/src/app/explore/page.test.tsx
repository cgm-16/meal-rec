// ABOUTME: Integration tests for explore page with mock data and chart rendering verification
// ABOUTME: Tests loading states, error handling, and chart component rendering

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExplorePage from './page';

// Mock recharts components
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ dataKey, fill }: { dataKey: string; fill: string }) => (
    <div data-testid="bar" data-key={dataKey} data-fill={fill} />
  ),
  XAxis: ({ dataKey }: { dataKey: string }) => (
    <div data-testid="x-axis" data-key={dataKey} />
  ),
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ data, dataKey }: { data: unknown; dataKey: string }) => (
    <div data-testid="pie" data-chart-data={JSON.stringify(data)} data-key={dataKey} />
  ),
  Cell: () => <div data-testid="cell" />
}));

const mockAnalyticsData = {
  topLikedMeals: [
    {
      _id: '1',
      name: 'Pasta Carbonara',
      cuisine: 'Italian',
      likeCount: 15
    },
    {
      _id: '2',
      name: 'Chicken Tikka Masala',
      cuisine: 'Indian',
      likeCount: 12
    }
  ],
  topDislikedMeals: [
    {
      _id: '3',
      name: 'Brussels Sprouts Salad',
      cuisine: 'American',
      dislikeCount: 8
    }
  ],
  topFlavorTags: [
    { tag: 'spicy', count: 25 },
    { tag: 'creamy', count: 20 },
    { tag: 'sweet', count: 18 }
  ]
};

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ExplorePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(<ExplorePage />);

    expect(screen.getByText('Explore Food Trends')).toBeInTheDocument();
    expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('animate-spin');
  });

  it('should fetch analytics data on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData)
    });

    render(<ExplorePage />);

    expect(mockFetch).toHaveBeenCalledWith('/api/analytics');
  });

  it('should render analytics data when loaded successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData)
    });

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Summary')).toBeInTheDocument();
    });

    // Check summary stats
    expect(screen.getByText('2')).toBeInTheDocument(); // Top Liked Meals count
    expect(screen.getByText('1')).toBeInTheDocument(); // Top Disliked Meals count  
    expect(screen.getByText('3')).toBeInTheDocument(); // Top Flavor Tags count

    // Check section headers
    expect(screen.getByText('Most Liked Meals')).toBeInTheDocument();
    expect(screen.getByText('Most Disliked Meals')).toBeInTheDocument();
    expect(screen.getByText('Popular Flavor Tags')).toBeInTheDocument();
  });

  it('should render liked meals bar chart with data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData)
    });

    render(<ExplorePage />);

    await waitFor(() => {
      const barCharts = screen.getAllByTestId('bar-chart');
      expect(barCharts).toHaveLength(2); // One for liked, one for disliked
      
      const likedMealsChart = barCharts[0];
      const chartData = JSON.parse(likedMealsChart.getAttribute('data-chart-data') || '[]');
      expect(chartData).toHaveLength(2);
      expect(chartData[0].name).toBe('Pasta Carbonara');
      expect(chartData[0].likeCount).toBe(15);
    });

    expect(screen.getAllByTestId('bar')[0]).toHaveAttribute('data-key', 'likeCount');
  });

  it('should render disliked meals bar chart with data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData)
    });

    render(<ExplorePage />);

    await waitFor(() => {
      const barCharts = screen.getAllByTestId('bar-chart');
      const dislikedMealsChart = barCharts[1];
      const chartData = JSON.parse(dislikedMealsChart.getAttribute('data-chart-data') || '[]');
      expect(chartData).toHaveLength(1);
      expect(chartData[0].name).toBe('Brussels Sprouts Salad');
      expect(chartData[0].dislikeCount).toBe(8);
    });
  });

  it('should render flavor tags pie chart with data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData)
    });

    render(<ExplorePage />);

    await waitFor(() => {
      const pieChart = screen.getByTestId('pie');
      const chartData = JSON.parse(pieChart.getAttribute('data-chart-data') || '[]');
      expect(chartData).toHaveLength(3);
      expect(chartData[0].tag).toBe('spicy');
      expect(chartData[0].count).toBe(25);
    });

    // Check flavor tags list
    expect(screen.getByText('spicy')).toBeInTheDocument();
    expect(screen.getByText('25 votes')).toBeInTheDocument();
    expect(screen.getByText('creamy')).toBeInTheDocument();
    expect(screen.getByText('20 votes')).toBeInTheDocument();
  });

  it('should handle empty data gracefully', async () => {
    const emptyData = {
      topLikedMeals: [],
      topDislikedMeals: [],
      topFlavorTags: []
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(emptyData)
    });

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getByText('No liked meals data available')).toBeInTheDocument();
      expect(screen.getByText('No disliked meals data available')).toBeInTheDocument();
      expect(screen.getByText('No flavor tags data available')).toBeInTheDocument();
    });

    // Summary should show zeros
    expect(screen.getAllByText('0')).toHaveLength(3);
  });

  it('should display error state when API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading analytics')).toBeInTheDocument();
      expect(screen.getByText('HTTP 500: Internal Server Error')).toBeInTheDocument();
    });

    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getByText('Error loading analytics')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should retry fetching when try again button is clicked', async () => {
    const user = userEvent.setup();
    
    // First call fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    // Second call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData)
    });

    render(<ExplorePage />);

    await waitFor(() => {
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Try again'));

    await waitFor(() => {
      expect(screen.getByText('Analytics Summary')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should limit displayed charts to top 5 items', async () => {
    const manyMeals = Array.from({ length: 10 }, (_, i) => ({
      _id: `meal-${i}`,
      name: `Meal ${i}`,
      cuisine: 'Test',
      likeCount: 10 - i
    }));

    const dataWithManyMeals = {
      ...mockAnalyticsData,
      topLikedMeals: manyMeals
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(dataWithManyMeals)
    });

    render(<ExplorePage />);

    await waitFor(() => {
      const barCharts = screen.getAllByTestId('bar-chart');
      const likedMealsChart = barCharts[0];
      const chartData = JSON.parse(likedMealsChart.getAttribute('data-chart-data') || '[]');
      expect(chartData).toHaveLength(5); // Should be limited to 5
    });
  });

  it('should render responsive containers for all charts', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAnalyticsData)
    });

    render(<ExplorePage />);

    await waitFor(() => {
      const responsiveContainers = screen.getAllByTestId('responsive-container');
      expect(responsiveContainers).toHaveLength(3); // Two bar charts + one pie chart
    });
  });
});