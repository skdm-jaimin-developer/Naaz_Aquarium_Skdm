const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const SR_BASE_URL = process.env.SR_BASE_URL || "https://apiv2.shiprocket.in/v1/external";
const SR_API_EMAIL = process.env.SR_API_EMAIL;
const SR_API_PASSWORD = process.env.SR_API_PASSWORD;


async function getShiprocketToken() {
    
    const authEndpoint = `${SR_BASE_URL}/auth/login`;

    try {
        const response = await axios.post(authEndpoint, {
            email: SR_API_EMAIL,
            password: SR_API_PASSWORD,
        });

        const srAuthToken = response.data.token;
        console.log('Shiprocket token generated successfully.');
        return srAuthToken;

    } catch (error) {
        console.log('Shiprocket Auth Error:', error);
        throw new Error('Failed to authenticate with Shiprocket API.');
    }
}


async function createShipment(srOrderPayload) {
    try {
        const token = await getShiprocketToken();
        const createOrderEndpoint = `${SR_BASE_URL}/orders/create/adhoc`;

        const response = await axios.post(
            createOrderEndpoint,
            srOrderPayload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const srResponse = response.data;
        console.log(srResponse)
        if (srResponse) {
            console.log(`Shiprocket Order created. SR ID: ${srResponse?.order_id}`);
            return srResponse;
        } else {
            console.error('Shiprocket API Error (Non-200 Status):', srResponse);
            // throw new Error(`Shiprocket Order Creation failed. Errors: ${JSON.stringify(srResponse.errors)}`);
        }

    } catch (error) {
        console.error('External API Integration Error:', error.response?.data?error.response.data:error);
        // throw error;
    }
}


function calculatePackageMetrics(products) {
    let totalWeight = 0;
    let totalSubTotal = 0;
    
    // Use the maximum dimensions found in any product for simplicity, 
    // or use a standard box size that fits all.
    let maxLength = 0;
    let maxBreadth = 0;
    let maxHeight = 0; 

    products.forEach(item => {
        // Calculation
        const itemWeight = parseFloat(item.weight) || 0;
        const itemPrice = parseFloat(item.price) || 0;
        const itemQuantity = parseInt(item.quantity) || 0;

        totalWeight += itemWeight * itemQuantity;
        totalSubTotal += itemPrice * itemQuantity;
        
        // Use maximum dimension to ensure the declared box size is large enough
        maxLength = Math.max(maxLength, parseFloat(item.length) || 0);
        maxBreadth = Math.max(maxBreadth, parseFloat(item.width) || 0);
        maxHeight = Math.max(maxHeight, parseFloat(item.height) || 0);
    });

    // You should typically set this to a standard box size you use.
    // For this example, we use the max dimensions found:
    const finalLength = maxLength > 1 ? maxLength : 10;
    const finalBreadth = maxBreadth > 1 ? maxBreadth : 10;
    const finalHeight = maxHeight > 1 ? maxHeight : 5;

    return {
        totalWeight: totalWeight.toFixed(2), // Shiprocket expects KG (e.g., 0.5)
        totalSubTotal: totalSubTotal.toFixed(2), // Price with 2 decimal places
        finalLength: finalLength.toFixed(2), 
        finalBreadth: finalBreadth.toFixed(2), 
        finalHeight: finalHeight.toFixed(2),
    };
}

module.exports = { createShipment ,calculatePackageMetrics };
