// Helper function to format currency
const formatCurrency = (amount) => (
    amount == null ? 'N/A' : `₹ ${parseFloat(amount).toFixed(2)}`
);

// Generates the HTML table rows for the products
const generateProductRows = (products) => {
    return products.map(p => `
        <tr style="border-bottom: 1px solid #eeeeee;">
            <td style="padding: 12px 0; color: #444444; font-size: 14px;">
                ${p.name}
                <div style="font-size: 11px; color: #888;">Size: ${p.size_name || 'N/A'}</div>
            </td>
            <td style="padding: 12px 0; text-align: center; color: #444444; font-size: 14px;">${p.quantity}</td>
            <td style="padding: 12px 0; text-align: right; color: #444444; font-size: 14px;">${formatCurrency(p.price.toFixed(2))}</td>
            <td style="padding: 12px 0; text-align: right; color: #444444; font-size: 14px;">${formatCurrency(((p.price * p.quantity) - (p.discount || 0)).toFixed(2))}</td>
        </tr>
    `).join('');
};

// Generates the common structure (header, footer, styles)
// Updated to accept orderInfo for header details
const baseEmailTemplate = (contentHtml, headerTitle, isCustomer, orderInfo) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${headerTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', sans-serif; background-color: #f4f4f4;">
    <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); overflow: hidden;">
        
        <!-- Header -->
        <div style="background-color: ${isCustomer ? '#007bff' : '#dc3545'}; color: #ffffff; padding: 30px; text-align: center; border-bottom: 4px solid ${isCustomer ? '#0056b3' : '#a71d2a'};">
            <h1 style="margin: 0; font-size: 24px; font-weight: 700;">${headerTitle}</h1>
            <p style="margin: 5px 0 0; font-size: 14px;">Order ID: ${orderInfo.unique_order_id}</p>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
            ${contentHtml}
        </div>
        
        <!-- Footer -->
        <div style="padding: 20px 30px; background-color: #f8f9fa; text-align: center; border-top: 1px solid #eeeeee;">
            <p style="margin: 0; font-size: 12px; color: #6c757d;">
                ${isCustomer ? 'Thank you for shopping with us.' : 'Action required: Process this order immediately.'}
            </p>
            
        </div>
    </div>
</body>
</html>
`;

// --- Customer Email Template Generator ---
const generateCustomerEmailHtml = (orderInfo, user, address, products) => {
    const emailBody = "Dear customer, thank you for your order. We are preparing your shipment now. Below is your detailed order summary and shipping information. The invoice is attached (simulated).";

    const contentHtml = `
        <p style="font-size: 16px; color: #333333; line-height: 1.6;">${emailBody}</p>

        <!-- Order Summary Card -->
        <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-top: 25px;">
            <h2 style="font-size: 18px; color: #007bff; margin-top: 0; margin-bottom: 15px; border-bottom: 1px dashed #e0e0e0; padding-bottom: 10px;">Order Summary</h2>
            <table width="100%" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #555;">
                <tr>
                    <td style="padding-bottom: 8px; width: 50%;">Payment Mode:</td>
                    <td style="padding-bottom: 8px; width: 50%; text-align: right; font-weight: bold;">${orderInfo.payment_mode}</td>
                </tr>
                <tr>
                    <td style="padding-bottom: 8px;">Shipping:</td>
                    <td style="padding-bottom: 8px; text-align: right;">${formatCurrency(orderInfo.shipping)}</td>
                </tr>
                <tr>
                    <td style="padding-bottom: 8px;">Discount Applied:</td>
                    <td style="padding-bottom: 8px; text-align: right; color: #28a745;">-${formatCurrency(orderInfo.discount)}</td>
                </tr>
                <tr style="border-top: 2px solid #007bff;">
                    <td style="padding-top: 10px; font-weight: bold; font-size: 16px;">Grand Total:</td>
                    <td style="padding-top: 10px; text-align: right; font-weight: bold; font-size: 16px; color: #007bff;">${formatCurrency(orderInfo.grand_total)}</td>
                </tr>
            </table>
        </div>

        <!-- Product Details -->
        <h2 style="font-size: 18px; color: #333333; margin-top: 30px; margin-bottom: 15px; border-bottom: 2px solid #007bff; padding-bottom: 5px;">Items Ordered</h2>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
            <thead>
                <tr style="background-color: #f8f9fa;">
                    <th style="padding: 10px 0; text-align: left; color: #333;">Product</th>
                    <th style="padding: 10px 0; text-align: center; color: #333; width: 15%;">Qty</th>
                    <th style="padding: 10px 0; text-align: right; color: #333; width: 25%;">Unit Price</th>
                    <th style="padding: 10px 0; text-align: right; color: #333; width: 25%;">Line Total</th>
                </tr>
            </thead>
            <tbody>
                ${generateProductRows(products)}
            </tbody>
        </table>

        <!-- Address Details -->
        <div style="margin-top: 30px;">
            <h3 style="font-size: 16px; color: #333333; margin-bottom: 10px;">Shipping Address</h3>
            <p style="margin: 0; font-size: 14px; color: #555;">${user.name}</p>
            <p style="margin: 0; font-size: 14px; color: #555;">${address.address1}</p>
            <p style="margin: 0; font-size: 14px; color: #555;">${address.address2 ? address.address2 + ', ' : ''}${address.city}, ${address.state} - ${address.pincode}</p>
            <p style="margin: 0; font-size: 14px; color: #555;">Landmark: ${address.landmark}</p>
        </div>
    `;
    return baseEmailTemplate(contentHtml, 'Your Order Confirmation', true, orderInfo);
};

// --- Admin Email Template Generator ---
const generateAdminEmailHtml = (orderInfo, user, address, products) => {
    const adminEmailBody = `A new order (ID: ${orderInfo.unique_order_id}) has been placed and requires immediate processing. Details are below.`;

    const contentHtml = `
        <p style="font-size: 16px; color: #dc3545; font-weight: bold; line-height: 1.6;">${adminEmailBody}</p>

        <!-- Customer and Order Info -->
        <div style="display: flex; gap: 20px; margin-top: 20px;">
            <div style="flex: 1; border: 1px solid #f2f2f2; border-radius: 8px; padding: 15px; background-color: #fffafb;">
                <h3 style="font-size: 16px; color: #dc3545; margin-top: 0; border-bottom: 1px dashed #dc3545; padding-bottom: 5px;">Customer Details</h3>
                <p style="margin: 5px 0; font-size: 14px; color: #333;">Name: ${user.name}</p>
                <p style="margin: 5px 0; font-size: 14px; color: #333;">Email: <a href="mailto:${user.email}" style="color: #dc3545;">${user.email}</a></p>
                <p style="margin: 5px 0; font-size: 14px; color: #333;">Phone: ${user.phone}</p>
            </div>
            <div style="flex: 1; border: 1px solid #f2f2f2; border-radius: 8px; padding: 15px; background-color: #fffafb;">
                <h3 style="font-size: 16px; color: #dc3545; margin-top: 0; border-bottom: 1px dashed #dc3545; padding-bottom: 5px;">Financial Summary</h3>
                <p style="margin: 5px 0; font-size: 14px; color: #333;">Total: ${formatCurrency(orderInfo.grand_total)}</p>
                <p style="margin: 5px 0; font-size: 14px; color: #333;">Tax: ${formatCurrency(orderInfo.tax)}</p>
                <p style="margin: 5px 0; font-size: 14px; color: #333;">Payment: ${orderInfo.payment_mode}</p>
            </div>
        </div>

        <!-- Product Table -->
        <h2 style="font-size: 18px; color: #333333; margin-top: 30px; margin-bottom: 15px; border-bottom: 2px solid #dc3545; padding-bottom: 5px;">Product List (${products.length} Items)</h2>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
            <thead>
                <tr style="background-color: #fbe0e3;">
                    <th style="padding: 10px 0; text-align: left; color: #333;">Product (ID / Size)</th>
                    <th style="padding: 10px 0; text-align: center; color: #333; width: 10%;">Qty</th>
                    <th style="padding: 10px 0; text-align: right; color: #333; width: 20%;">Price</th>
                </tr>
            </thead>
            <tbody>
                ${products.map(p => `
                    <tr style="border-bottom: 1px solid #ffcccc;">
                        <td style="padding: 10px 0; color: #444444; font-size: 14px;">
                            ${p.name}
                            <div style="font-size: 10px; color: #777;"> Size: ${p.size_name}</div>
                        </td>
                        <td style="padding: 10px 0; text-align: center; color: #444444; font-size: 14px;">${p.quantity}</td>
                        <td style="padding: 10px 0; text-align: right; color: #444444; font-size: 14px;">${formatCurrency(((p.price * p.quantity) - (p.discount || 0)).toFixed(2))}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <!-- Shipping Address -->
        <div style="margin-top: 30px;">
            <h3 style="font-size: 16px; color: #333333; margin-bottom: 10px;">Shipping To</h3>
            <p style="margin: 0; font-size: 14px; color: #555;">${user.name}</p>
            <p style="margin: 0; font-size: 14px; color: #555;">${address.address1}, ${address.address2 || ''}</p>
            <p style="margin: 0; font-size: 14px; color: #555;">${address.city}, ${address.state} ${address.pincode}</p>
        </div>
    `;
    return baseEmailTemplate(contentHtml, 'NEW Order Alert!', false, orderInfo);
};

module.exports = {
    generateCustomerEmailHtml,
    generateAdminEmailHtml
};
