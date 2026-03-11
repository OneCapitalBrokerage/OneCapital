// config.js

export const config = {
    // Kite Connect configuration
    kite: {
        apiKey: process.env.KITE_API_KEY,
        accessToken: process.env.KITE_ACCESS_TOKEN,
        apiSecret: process.env.KITE_API_SECRET // Optional, for token generation
    },
    origin: process.env.CORS_ORIGIN || "",
    port: process.env.PORT || 8080
};

