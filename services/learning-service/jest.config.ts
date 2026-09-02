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
  // Strip .js extensions so ts-jest can resolve .ts source files
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // Source rather than dist, as in the other services: a test must not depend on
    // somebody having rebuilt the kernel first.
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
};

export default config;
