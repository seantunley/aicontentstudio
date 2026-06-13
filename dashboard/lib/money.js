// Generation APIs bill in USD, so the cost ledger stores USD. The operator is in South
// Africa, so the cockpit shows Rands. The rate fluctuates, so it's operator-configurable
// via ZAR_PER_USD (set it in compose/.env); the default is a recent spot rate.
export const ZAR_PER_USD = Number(process.env.ZAR_PER_USD || 16.28);

// Format a USD amount as ZAR, e.g. zar(1.5) -> "R24.42".
export const zar = (usd, dp = 2) => `R${(Number(usd || 0) * ZAR_PER_USD).toFixed(dp)}`;
