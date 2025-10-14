const { StandardCheckoutClient, Env } = require('pg-sdk-node');
require('dotenv').config();

// Determine environment
const isProduction = process.env.PHONEPE_ENV === 'PRODUCTION';
const environment = isProduction ? Env.PRODUCTION : Env.SANDBOX;

// Initialize the client globally
const phonePeClient = StandardCheckoutClient.getInstance(
    process.env.PHONEPE_CLIENT_ID,
    process.env.PHONEPE_CLIENT_SECRET,
    parseInt(process.env.PHONEPE_CLIENT_VERSION || 1),
    environment
);

module.exports = phonePeClient;