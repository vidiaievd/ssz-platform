import type { Config } from 'jest';

/**
 * The first test setup this service has had.
 *
 * Copied from learning-service rather than invented: the two services are built the
 * same way (NodeNext ESM, ts-jest, `.js` specifiers in source), and a second dialect of
 * jest config in the same repository would be one more thing to keep in step.
 *
 * The kernel resolves to source, not to `dist`, so a test never depends on somebody
 * having rebuilt the package first.
 */
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
    '^@ssz/shared-kernel/(.*)$': '<rootDir>/../../packages/shared-kernel/src/$1/index.ts',
    '^@ssz/shared-kernel$': '<rootDir>/../../packages/shared-kernel/src/index.ts',
  },
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts', '!src/config/**'],
};

export default config;
