// Loads .env before any other module reads process.env.
try {
  process.loadEnvFile();
} catch {
  // No .env file: run in replay mode with defaults.
}
