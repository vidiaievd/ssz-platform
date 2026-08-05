import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.test.json',
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // The kernel is resolved through its source rather than its build: jest never
    // reads the package's `exports` map, and testing the same files the compiler
    // sees means a stale `dist` cannot make a green run lie.
    '^@ssz/shared-kernel/(.*)$': '<rootDir>/../../packages/shared-kernel/src/$1/index.ts',
    '^@ssz/shared-kernel$': '<rootDir>/../../packages/shared-kernel/src/index.ts',
  },
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/config/**',
  ],
  coverageDirectory: 'coverage',
};

export default config;
