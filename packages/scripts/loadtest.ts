// ABOUTME: Load testing script using Artillery for performance testing
// ABOUTME: Tests API endpoints under various load scenarios

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

interface LoadTestConfig {
  target: string;
  phases: Array<{
    duration: number;
    arrivalRate: number;
    name?: string;
  }>;
  scenarios: Array<{
    name: string;
    weight: number;
    flow: Array<{
      get?: {
        url: string;
        headers?: Record<string, string>;
      };
      post?: {
        url: string;
        json?: Record<string, any>;
        headers?: Record<string, string>;
      };
      think?: number;
    }>;
  }>;
}

const createLoadTestConfig = (baseUrl: string): LoadTestConfig => ({
  target: baseUrl,
  phases: [
    { duration: 60, arrivalRate: 5, name: 'Warm up' },
    { duration: 120, arrivalRate: 10, name: 'Ramp up load' },
    { duration: 300, arrivalRate: 20, name: 'Sustained load' },
    { duration: 60, arrivalRate: 50, name: 'Peak load' },
    { duration: 120, arrivalRate: 5, name: 'Cool down' }
  ],
  scenarios: [
    {
      name: 'Guest user flow',
      weight: 60,
      flow: [
        { get: { url: '/' } },
        { think: 2 },
        { get: { url: '/api/meals/random' } },
        { think: 3 },
        {
          post: {
            url: '/api/feedback',
            json: {
              mealId: '{{ $randomString() }}',
              type: 'like'
            },
            headers: {
              'Content-Type': 'application/json'
            }
          }
        },
        { think: 1 },
        { get: { url: '/api/meals/random' } }
      ]
    },
    {
      name: 'Quiz flow',
      weight: 20,
      flow: [
        { get: { url: '/quiz' } },
        { think: 5 },
        {
          post: {
            url: '/api/recommend',
            json: {
              spiciness: 3,
              surpriseFactor: 5,
              ingredientsToAvoid: ['shellfish']
            },
            headers: {
              'Content-Type': 'application/json'
            }
          }
        },
        { think: 2 }
      ]
    },
    {
      name: 'Analytics browsing',
      weight: 15,
      flow: [
        { get: { url: '/explore' } },
        { think: 4 },
        { get: { url: '/api/analytics' } },
        { think: 2 }
      ]
    },
    {
      name: 'API stress test',
      weight: 5,
      flow: [
        { get: { url: '/api/meals?page=1&limit=10' } },
        { think: 1 },
        { get: { url: '/api/meals?page=2&limit=10' } },
        { think: 1 },
        { get: { url: '/api/meals/random' } },
        { think: 1 },
        { get: { url: '/api/analytics' } }
      ]
    }
  ]
});

async function runLoadTest(baseUrl: string = 'http://localhost:3000'): Promise<void> {
  console.log(`🚀 Starting load test against ${baseUrl}`);
  
  // Create config
  const config = createLoadTestConfig(baseUrl);
  
  // Ensure output directory exists
  mkdirSync(path.join(process.cwd(), 'loadtest-results'), { recursive: true });
  
  // Write config file
  const configPath = path.join(process.cwd(), 'loadtest-results', 'config.yml');
  const yamlConfig = `
config:
  target: '${config.target}'
  phases:
${config.phases.map(phase => `    - duration: ${phase.duration}\n      arrivalRate: ${phase.arrivalRate}${phase.name ? `\n      name: '${phase.name}'` : ''}`).join('\n')}
  
scenarios:
${config.scenarios.map(scenario => `  - name: '${scenario.name}'\n    weight: ${scenario.weight}\n    flow:\n${scenario.flow.map(step => {
  if (step.get) {
    return `      - get:\n          url: '${step.get.url}'${step.get.headers ? `\n          headers:\n${Object.entries(step.get.headers).map(([k, v]) => `            ${k}: '${v}'`).join('\n')}` : ''}`;
  }
  if (step.post) {
    return `      - post:\n          url: '${step.post.url}'${step.post.json ? `\n          json:\n${Object.entries(step.post.json).map(([k, v]) => `            ${k}: ${typeof v === 'string' ? `'${v}'` : Array.isArray(v) ? `[${v.map(i => `'${i}'`).join(', ')}]` : v}`).join('\n')}` : ''}${step.post.headers ? `\n          headers:\n${Object.entries(step.post.headers).map(([k, v]) => `            ${k}: '${v}'`).join('\n')}` : ''}`;
  }
  if (step.think) {
    return `      - think: ${step.think}`;
  }
  return '';
}).join('\n')}`).join('\n')}
`;
  
  writeFileSync(configPath, yamlConfig);
  
  // Run Artillery
  const outputPath = path.join(process.cwd(), 'loadtest-results', `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  
  return new Promise((resolve, reject) => {
    const artillery = spawn('npx', ['artillery', 'run', '--output', outputPath, configPath], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    artillery.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Load test completed. Results saved to ${outputPath}`);
        console.log(`📊 Generate HTML report with: npx artillery report ${outputPath}`);
        resolve();
      } else {
        reject(new Error(`Load test failed with exit code ${code}`));
      }
    });
    
    artillery.on('error', (error) => {
      reject(error);
    });
  });
}

// CLI interface
if (require.main === module) {
  const baseUrl = process.argv[2] || 'http://localhost:3000';
  
  runLoadTest(baseUrl)
    .then(() => {
      console.log('✅ Load test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Load test failed:', error.message);
      process.exit(1);
    });
}

export { runLoadTest, createLoadTestConfig };