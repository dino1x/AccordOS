// Loads .env before any other module reads process.env.
try {
  process.loadEnvFile();
} catch {
  // No .env file: run in replay mode with defaults.
}

// PAYPAL_REPLAY=1 forces the PayPal simulator even when Sandbox keys are set, so routine
// test runs do not send real Sandbox Payouts that drain the merchant account.
if (process.env.PAYPAL_REPLAY === "1") {
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
}
