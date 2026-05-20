import type { Config } from 'jest';

const config: Config = {
  displayName: 'e2e',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.json',
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/scenarios/**/*.spec.ts'],
  // Each scenario spins up Docker containers — 5-minute timeout per test.
  testTimeout: 300_000,
  // Run scenarios serially to avoid port conflicts and container resource exhaustion.
  maxWorkers: 1,
};

export default config;
