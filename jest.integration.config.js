/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css\\?inline)$": "<rootDir>/test/__mocks__/styleMock.js",
    "\\.(css)$": "<rootDir>/test/__mocks__/styleMock.js",
  },
  setupFiles: ["<rootDir>/test/setup.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "./tsconfig.json",
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["<rootDir>/integration/**/*.integration.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};
