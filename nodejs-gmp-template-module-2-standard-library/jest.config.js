module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  modulePaths: ['<rootDir>/src/'],
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  verbose: true,
  reporters: ['default', 'jest-junit'],
};
