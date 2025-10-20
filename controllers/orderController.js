const db = require('../models/db');
const { generateUniqueOrderId } = require('../helpers/orderIdGenerator');
const { generatePdfAndSave } = require('../helpers/invoiceGenerator');
const { sendInvoiceEmail } = require('../helpers/emailSender');
const { createShipment ,calculatePackageMetrics } = require('../helpers/shiprocketService'); // Adjust path as needed
const path = require('path');
const phonePeClient = require('../helpers/phonepeClient');
const { StandardCheckoutPayRequest, MetaInfo } = require('pg-sdk-node');
const util = require('util');

db.getConnectionPromise = util.promisify(db.getConnection).bind(db);
const promisifyConnectionMethods = (connection) => {
    connection.beginTransactionPromise = util.promisify(connection.beginTransaction).bind(connection);
    connection.queryPromise = util.promisify(connection.query).bind(connection);
    connection.commitPromise = util.promisify(connection.commit).bind(connection);
    connection.rollbackPromise = util.promisify(connection.rollback).bind(connection);
    // Note: connection.release() is often sync or handled as-is.
};

const getInvoiceUrl = (invoiceName) => {
    const port = process.env.PORT || 3000;
    return `https://api.naazaquarium.in/invoices/${invoiceName}`;
};

const getImageUrl = (imageName) => {
    const port = process.env.PORT || 3000;
    return `https://api.naazaquarium.in/uploads/product_images/${imageName}`;
};

function queryPromise(sql, params) {
    return new Promise((resolve, reject) => {
        // Assuming 'db' is your database connection object
        db.query(sql, params, (err, results) => {
            if (err) {
                return reject(err);
            }
            resolve(results);
        });
    });
}


// Helper function to format order data for consistent API responses
const formatProductItem = (item) => {
    // The only remaining GROUP_CONCAT is for images, so we parse that string
    const parsedImages = item.images 
        ? item.images.split(',').map(img => {
            const [imgId, url] = img.split(':');
            return {
                id: parseInt(imgId, 10) || 0,
                url: getImageUrl(url || '')
            };
        })
        : [];

    return {
        // Product Details
        id: parseInt(item.product_id, 10) || 0,
        name: item.product_name || '',
        description: item.product_description || '',
        no_of_reviews: parseInt(item.no_of_reviews, 10) || 0,
        slug: item.slug || '',
        images: parsedImages,

        // Product Size/Variant
        size: {
            id: parseInt(item.size_id, 10) || 0,
            name: item.size_name || '',
            price: parseFloat(item.size_price) || 0,
            discount_price: parseFloat(item.size_discount_price) || 0,
            stock: parseInt(item.size_stock, 10) || 0
        },

        // Order Item Details (from order_products)
        quantity: parseInt(item.quantity, 10) || 0,
        discount: parseFloat(item.item_discount) || 0,

        // Category Details
        category: {
            id: parseInt(item.category_id, 10) || 0,
            name: item.category_name || '',
            slug: item.category_slug || '',
            description: item.category_description || ''
        }
    };
};

const formatOrderData = (order) => {
    return {
        // Order Header Data
        id: order.id,
        unique_order_id: order.unique_order_id,
        user_id: order.user_id,
        address_id: order.address_id,
        status: order.status,
        payment_status: order.payment_status,
        delivery_status: order.delivery_status,
        payment_mode: order.payment_mode,
        transaction_id: order.transaction_id,
        
        subtotal: parseFloat(order.subtotal) || 0,
        tax: parseFloat(order.tax) || 0,
        total: parseFloat(order.total) || 0,
        shipping: parseFloat(order.shipping) || 0,
        discount: parseFloat(order.discount) || 0,
        grand_total: parseFloat(order.grand_total) || 0,
        
        invoice_link: getInvoiceUrl(order.invoice_link),
        created_at: order.created_at,
        updated_at: order.updated_at,

        // User Data
        user: {
            id: order.user_id,
            name: order.user_name,
            email: order.user_email,
            mobile: order.user_mobile
        },

        // Address Data
        address: {
            id: order.address_id,
            address1: order.address_line1,
            address2: order.address_line2,
            landmark: order.address_landmark,
            city: order.address_city,
            state: order.address_state,
            pincode: order.address_pincode
        },
        
        // Products Array
        products: (order?.products || []).map(formatProductItem)
    };
};

const initiatePayment = async (data, redirectUrl, callbackUrl) => { // <-- Now takes redirectUrl
    console.log(redirectUrl)
    try {
        const { unique_order_id, grand_total } = data;
        
        // Ensure amount is an integer (paise) to avoid "For input string: decimal" error
        const amountInPaise = Math.round(grand_total * 100); 
        // const redirectUrl = "http://localhost:5173/cart";
        const metaInfo = MetaInfo.builder()
            .udf1("udf1")
            .udf2("udf2")
            .build();
        
        const request = StandardCheckoutPayRequest.builder()
            .merchantOrderId(unique_order_id)
            .amount(amountInPaise)
            .redirectUrl(redirectUrl)
            .metaInfo(metaInfo)
            .build();

        // 💡 FIX: Use await to wait for the Promise result directly
        const response = await phonePeClient.pay(request); 
        console.log(response)
        if (response.redirectUrl) {
             return {
                success: true, // Boolean true
                redirectUrl: response.redirectUrl, 
                merchantOrderId: unique_order_id
            };
        } else {
             // Throw an error to be caught by the outer try/catch block
             throw new Error(response.message || 'PhonePe returned a non-successful response.');
        }

    } catch (error) {
        console.error('PhonePe SDK Payment Initiation Error:', error.message);
        // Return a standard error object
        return { 
            success: false, // Boolean false
            message: 'Payment initiation failed', 
            error: error.message 
        };
    }
}


// --- API Endpoint: Create a new order ---
exports.createOrder = async (req, res) => {
    // Get user data
    const userId = req.userData.userId;

    // Destructure order details from the request body
    const {
        addressId,
        paymentMode,
        subtotal,
        tax,
        total,
        shipping,
        discount,
        grand_total,
        products
    } = req.body;

    // Validation
    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication failed: User ID not found.'
        });
    }
    if (!addressId || !products || products.length === 0 || !grand_total) {
        return res.status(400).json({
            success: false,
            message: 'Missing required order details (addressId, products, grand_total).'
        });
    }

    const uniqueOrderId = generateUniqueOrderId(); // Assumed
    const orderData = {
        unique_order_id: uniqueOrderId,
        user_id: userId,
        address_id: addressId,
        subtotal,
        tax,
        total,
        payment_mode: paymentMode,
        shipping,
        discount,
        grand_total,
    };

    let connection;
    try {
        // SQL Queries
        const insertOrderSql = 'INSERT INTO orders SET ?';
        const insertOrderProductsSql = 'INSERT INTO order_products (order_id, product_id, size_id, quantity, discount) VALUES ?';
        const fetchDetailsSql = `
            SELECT unique_order_id, grand_total 
            FROM orders 
            WHERE id = ?;
        `;

        // 1. Get Connection and Start Transaction
        // Use the promisified getConnection method
        connection = await db.getConnectionPromise();
        // Promisify transaction methods on the acquired connection
        promisifyConnectionMethods(connection); 

        await connection.beginTransactionPromise(); 

        // 2. Insert Order
        // Use the promisified query method
        const insertResult = await connection.queryPromise(insertOrderSql, orderData);
        const orderId = insertResult.insertId;

        // 3. Prepare and Insert Order Products
        const orderProductsData = products.map(p => [
            orderId, 
            p.productId, 
            p.sizeId, 
            p.quantity, 
            p.discount || 0
        ]);
        await connection.queryPromise(insertOrderProductsSql, [orderProductsData]);

        // 4. Fetch Details
        const results = await connection.queryPromise(fetchDetailsSql, [orderId]);

        if (!results || results.length === 0) {
            // Throwing an error will jump to the catch block and trigger rollback
            throw new Error('Order details not found after insertion.');
        }

        const orderDetails = results[0];
        const merchantOrderId = orderDetails.unique_order_id;
        
        // Define payment URLs
        const redirectUrl = `https://naazaquarium.in/order-status/${merchantOrderId}`;
        const callbackUrl = `${req.protocol}://${req.get('host')}/api/phonepe/callback`;

        // 5. Initiate Payment
        const paymentResponse = await initiatePayment(orderDetails, redirectUrl, callbackUrl); 

        // Handle Payment Initiation Error (Pre-Commit Check)
        if (!paymentResponse?.success) {
            await connection.rollbackPromise(); // Use the promisified rollback
            connection.release();
            return res.status(500).json(paymentResponse); 
        }

        // 6. Commit Transaction
        await connection.commitPromise(); // Use the promisified commit
        
        // 7. Success Response
        connection.release();
        res.json(paymentResponse);

    } catch (err) {
        // CENTRALIZED ERROR HANDLING
        console.error('Order creation failed:', err.message || err);

        // If a connection was established, attempt to roll back and release it
        if (connection && connection.rollbackPromise) {
            // Attempt rollback, suppressing potential errors
            await connection.rollbackPromise().catch(rollbackErr => console.error('Rollback failed:', rollbackErr.message));
            connection.release();
        } else if (connection) {
             // Fallback for connections that couldn't be fully promisified
            connection.release();
        }
        
        // Respond with a generic server error
        res.status(500).json({ 
            success: false, 
            message: 'An internal error occurred during order creation or transaction handling.', 
            error: err.message 
        });
    }
};

// --- API Endpoint: Fetch all orders with pagination ---
exports.getAllOrders = (req, res) => {
    // Get page and limit from query parameters with default values
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    // --- Query 1a: Get the total count of orders for pagination ---
    const countSql = 'SELECT COUNT(*) AS totalOrders FROM orders';
    
    db.query(countSql, (err, countResult) => {
        if (err) {
            console.error('Error fetching order count:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch order count.',
                error: err.message
            });
        }
        
        const totalOrders = countResult[0].totalOrders;
        const totalPages = Math.ceil(totalOrders / limit);

        // --- Query 1b: Fetch the paginated order headers ---
        // This query is simplified (no GROUP_CONCAT, no product/size joins)
        const ordersSql = `
            SELECT
                o.id, o.unique_order_id, o.user_id, o.address_id, o.status, o.payment_status, o.delivery_status, o.payment_mode, o.transaction_id,
                o.subtotal, o.tax, o.total, o.invoice_link, o.created_at, o.updated_at,
                o.shipping , o.discount , o.grand_total , 
                u.name AS user_name, u.email AS user_email, u.mobile AS user_mobile,
                a.address1 AS address_line1, a.address2 AS address_line2, a.landmark AS address_landmark, a.city AS address_city, a.state AS address_state, a.pincode AS address_pincode
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN addresses a ON o.address_id = a.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?;
        `;

        db.query(ordersSql, [limit, offset], (err, orderResults) => {
            if (err) {
                console.error('Error fetching paginated orders:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch orders.',
                    error: err.message
                });
            }

            if (orderResults.length === 0) {
                 return res.json({
                    success: true,
                    orders: [],
                    pagination: { totalOrders, totalPages, currentPage: page, limit }
                });
            }

            // Extract the IDs of the fetched orders to use in the next query's IN clause
            const orderIds = orderResults.map(o => o.id);

            // --- Query 2: Fetch all products for the retrieved orders ---
            // We use FIND_IN_SET(op.order_id, ?) instead of IN (?) because the DB driver might handle array placeholders differently
            const productsSql = `
                SELECT
                    op.order_id, op.quantity, op.discount AS item_discount,
                    p.id AS product_id, p.name AS product_name, p.description AS product_description, p.category_id, p.no_of_reviews, p.slug,
                    c.name AS category_name, c.slug AS category_slug, c.description AS category_description,
                    s.id AS size_id, s.name AS size_name, s.price AS size_price, s.discount_price AS size_discount_price, s.stock AS size_stock,
                    -- Image handling using IFNULL to ensure consistent string output, no GROUP_CONCAT limits here
                    IFNULL(
                        (SELECT GROUP_CONCAT(CONCAT(id, ':', url) SEPARATOR ',') FROM images WHERE product_id = p.id),
                        ''
                    ) AS images
                FROM order_products op
                JOIN products p ON op.product_id = p.id
                LEFT JOIN sizes s ON op.size_id = s.id
                JOIN categories c ON p.category_id = c.id
                WHERE op.order_id IN (?);
            `;
            
            // Execute the products query
            db.query(productsSql, [orderIds], (err, productResults) => {
                if (err) {
                    console.error('Error fetching order products:', err);
                    return res.status(500).json({ success: false, message: 'Failed to fetch all order products.', error: err.message });
                }

                // --- Step 3: Programmatically Merge Products into Orders ---

                // Create a map of orderId -> [products] for fast lookup
                const productsMap = new Map();
                productResults.forEach(p => {
                    if (!productsMap.has(p.order_id)) {
                        productsMap.set(p.order_id, []);
                    }
                    productsMap.get(p.order_id).push(p);
                });

                // Merge products into the order results and format
                const ordersWithProducts = orderResults.map(order => {
                    const rawOrderData = {
                        ...order,
                        products: productsMap.get(order.id) || []
                    };
                    return formatOrderData(rawOrderData);
                });
                
                res.json({
                    success: true,
                    orders: ordersWithProducts,
                    pagination: {
                        totalOrders,
                        totalPages,
                        currentPage: page,
                        limit
                    }
                });
            });
        });
    });
};


// --- API Endpoint: Fetch single order by ID ---
exports.getOrderById = (req, res) => {
    const {
        id
    } = req.params;
    const orderSql = `
        SELECT
            o.*,
            u.name AS user_name, u.email AS user_email, u.mobile AS user_mobile,
            a.address1 AS address_line1, a.address2 AS address_line2, a.landmark AS address_landmark, a.city AS address_city, a.state AS address_state, a.pincode AS address_pincode
        FROM orders o
        JOIN users u ON o.user_id = u.id
        JOIN addresses a ON o.address_id = a.id
        WHERE o.unique_order_id = ?;
    `;

    db.query(orderSql, [id], (err, orderResults) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to fetch order header.', error: err.message });
        if (orderResults.length === 0) return res.status(404).json({ success: false, message: 'Order not found.' });

        // Get the order data and its internal ID
        const orderData = orderResults[0];
        const orderId = orderData.id;

        // --- Query 2: Fetch Order Products (Items) ---
        const productsSql = `
            SELECT
                op.order_id, op.quantity, op.discount AS item_discount,
                p.id AS product_id, p.name AS product_name, p.description AS product_description, p.category_id, p.no_of_reviews, p.slug,
                c.name AS category_name, c.slug AS category_slug, c.description AS category_description,
                s.id AS size_id, s.name AS size_name, s.price AS size_price, s.discount_price AS size_discount_price, s.stock AS size_stock,
                IFNULL(
                    (SELECT GROUP_CONCAT(CONCAT(id, ':', url) SEPARATOR ',') FROM images WHERE product_id = p.id),
                    ''
                ) AS images
            FROM order_products op
            JOIN products p ON op.product_id = p.id
            LEFT JOIN sizes s ON op.size_id = s.id
            JOIN categories c ON p.category_id = c.id
            WHERE op.order_id = ?;
        `;
        
        db.query(productsSql, [orderId], (err, productResults) => {
            if (err) return res.status(500).json({ success: false, message: 'Failed to fetch order products.', error: err.message });
            
            // 💡 Handle the case where products are NULL/empty (as you mentioned)
            if (productResults.length === 0) {
                 console.warn(`Order ${id} (ID: ${orderId}) found, but has no products in order_products table.`);
            }

            // Combine the order data and the product list into a single object
            const finalOrder = {
                ...orderData,
                products: productResults
            };
            console.log(productResults)
            // Format and send the response
            const order = formatOrderData(finalOrder); 
            
            res.json({
                success: true,
                order
            });
        });
    });
};

// --- API Endpoint: Fetch orders by User ID with pagination ---
exports.getOrdersByUserId = (req, res) => {
    const { userId } = req.params;
    // Get page and limit from query parameters with default values
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    // --- Query 1a: Get the total count of orders for the specific user ---
    const countSql = 'SELECT COUNT(*) AS totalOrders FROM orders WHERE user_id = ?';
    
    db.query(countSql, [userId], (err, countResult) => {
        if (err) {
            console.error('Error fetching user order count:', err);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch order count for user.',
                error: err.message
            });
        }
        
        const totalOrders = countResult[0].totalOrders;
        const totalPages = Math.ceil(totalOrders / limit);

        // --- Query 1b: Fetch the paginated order headers for the user ---
        const ordersSql = `
            SELECT
                o.id, o.unique_order_id, o.user_id, o.address_id, o.status, o.payment_status, o.delivery_status, o.payment_mode, o.transaction_id,
                o.subtotal, o.tax, o.total, o.invoice_link, o.created_at, o.updated_at,
                o.shipping , o.discount , o.grand_total , 
                u.name AS user_name, u.email AS user_email, u.mobile AS user_mobile,
                a.address1 AS address_line1, a.address2 AS address_line2, a.landmark AS address_landmark, a.city AS address_city, a.state AS address_state, a.pincode AS address_pincode
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN addresses a ON o.address_id = a.id
            WHERE o.user_id = ?
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?;
        `;

        db.query(ordersSql, [userId, limit, offset], (err, orderResults) => {
            if (err) {
                console.error('Error fetching paginated user orders:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch orders.',
                    error: err.message
                });
            }

            if (orderResults.length === 0) {
                 return res.json({
                    success: true,
                    orders: [],
                    pagination: { totalOrders, totalPages, currentPage: page, limit }
                });
            }

            // Extract the IDs of the fetched orders
            const orderIds = orderResults.map(o => o.id);

            // --- Query 2: Fetch all products for the retrieved orders ---
            const productsSql = `
                SELECT
                    op.order_id, op.quantity, op.discount AS item_discount,
                    p.id AS product_id, p.name AS product_name, p.description AS product_description, p.category_id, p.no_of_reviews, p.slug,
                    c.name AS category_name, c.slug AS category_slug, c.description AS category_description,
                    s.id AS size_id, s.name AS size_name, s.price AS size_price, s.discount_price AS size_discount_price, s.stock AS size_stock,
                    -- Image handling using IFNULL to ensure consistent string output
                    IFNULL(
                        (SELECT GROUP_CONCAT(CONCAT(id, ':', url) SEPARATOR ',') FROM images WHERE product_id = p.id),
                        ''
                    ) AS images
                FROM order_products op
                JOIN products p ON op.product_id = p.id
                LEFT JOIN sizes s ON op.size_id = s.id
                JOIN categories c ON p.category_id = c.id
                WHERE op.order_id IN (?);
            `;
            
            // Execute the products query
            db.query(productsSql, [orderIds], (err, productResults) => {
                if (err) {
                    console.error('Error fetching order products:', err);
                    return res.status(500).json({ success: false, message: 'Failed to fetch all order products.', error: err.message });
                }

                // --- Step 3: Programmatically Merge Products into Orders ---

                // Create a map of orderId -> [products] for fast lookup
                const productsMap = new Map();
                productResults.forEach(p => {
                    if (!productsMap.has(p.order_id)) {
                        productsMap.set(p.order_id, []);
                    }
                    productsMap.get(p.order_id).push(p);
                });

                // Merge products into the order results and format
                const ordersWithProducts = orderResults.map(order => {
                    const rawOrderData = {
                        ...order,
                        products: productsMap.get(order.id) || []
                    };
                    return formatOrderData(rawOrderData);
                });
                
                res.json({
                    success: true,
                    orders: ordersWithProducts,
                    pagination: {
                        totalOrders,
                        totalPages,
                        currentPage: page,
                        limit
                    }
                });
            });
        });
    });
};
// Update an order (typically for status changes by admin)
exports.updateOrder = (req, res) => {
    const { id } = req.params;
    const { status, payment_status, delivery_status, transaction_id, invoice_link } = req.body;
    
    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (payment_status) { updates.push('payment_status = ?'); params.push(payment_status); }
    if (delivery_status) { updates.push('delivery_status = ?'); params.push(delivery_status); }
    if (transaction_id) { updates.push('transaction_id = ?'); params.push(transaction_id); }
    if (invoice_link) { updates.push('invoice_link = ?'); params.push(invoice_link); }

    if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields provided for update.' });
    }

    params.push(id);
    const sql = `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`;

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to update order.', error: err.message });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Order not found or no changes made.' });
        res.json({ success: true, message: 'Order updated successfully.' });
    });
};

exports.status = async (req, res) => {
    // PhonePe sends the Base64 encoded response in the body 'response' field
    try {
        const merchantOrderId = req.params.orderId;

        if (!merchantOrderId) {
            return res.status(400).json({ success: false, message: 'Missing Order ID.' });
        }
        const payment_status = await queryPromise(`SELECT payment_status from orders where unique_order_id = ? `,[merchantOrderId] )

        if (!payment_status || payment_status.length === 0) {
            return res.status(404).send({success:false,message:'Order details not found.', navigate_to : `/failed/${merchantOrderId}`});
        }

        if (payment_status[0].payment_status == 'paid') {
            return res.status(400).send({success:false,message:'Order already paid  .', navigate_to : `/success/${merchantOrderId}`});
        }
        // 1. Use the SDK's getOrderStatus method for secure verification
        const statusResponse = await phonePeClient.getOrderStatus(merchantOrderId);
        console.log(statusResponse)
        // 2. Process the status
        const paymentState = statusResponse.state; // e.g., 'SUCCESS', 'FAILED', 'PENDING'
        
                if (paymentState === 'COMPLETED') {
                    const newStatus = 'PAID';
                    const neworderStatus = 'processing'
                    const updateSql = 'UPDATE orders SET payment_status = ? , status = ? WHERE unique_order_id = ?';

                    await queryPromise(updateSql, [newStatus,neworderStatus, merchantOrderId], (err, result) => {
                        if (err) {
                            return res.status(500).send({success:false,message:'Some error Ocuured.', navigate_to : `/failed/${merchantOrderId}`});
                        }
                        console.log(`Payment status updated for ${result.affectedRows} row(s).`);
                        // result.affectedRows tells you how many rows were changed
                    });
                    const fetchDetailsSql = `
                        SELECT 
                            u.name AS user_name, u.email AS user_email,u.mobile AS user_mobile,
                            a.address1, a.address2, a.landmark, a.city, a.state, a.pincode,
                            o.unique_order_id AS order_id,
                            o.subtotal,
                                o.tax,
                                o.total,
                                o.shipping,
                                o.discount,
                                o.grand_total,
                                o.payment_mode,
                            GROUP_CONCAT(DISTINCT CONCAT(p.name, ':', s.discount_price,':', p.tax, ':', op.quantity, ':',op.discount, ':', s.name ,':', s.length ,':', s.width ,':', s.height ,':', s.weight ,':',s.id) SEPARATOR ';') AS products
                        FROM orders o
                        JOIN users u ON o.user_id = u.id
                        JOIN addresses a ON o.address_id = a.id
                        JOIN order_products op ON o.id = op.order_id
                        JOIN products p ON op.product_id = p.id
                        JOIN sizes s ON op.size_id = s.id
                        WHERE o.unique_order_id = ?
                        GROUP BY o.id;
                    `;
                   
                       const results = await queryPromise(fetchDetailsSql, [merchantOrderId]);

                        if (!results || results.length === 0) {
                            return res.status(404).send({success:false,message:'Order details not found.', navigate_to : `/failed/${merchantOrderId}`});
                        }

                        const details = results[0];
                        
                    
                // 5. Generate PDF, save it, update the connection with the file name, and send the email
                        
                        const orderInfo = {
                            unique_order_id: details.order_id,
                            subtotal:details.subtotal,
                            tax:details.tax,
                            total:details.total,
                            shipping:details.shipping,
                            discount:details.discount,
                            grand_total:details.grand_total,
                            payment_mode:details.payment_mode
                        };
                        const user = {
                            name: details.user_name,
                            email: details.user_email,
                            phone : details.user_mobile
                        };
                        const address = {
                            address1: details.address1,
                            address2: details.address2,
                            landmark: details.landmark,
                            city: details.city,
                            state: details.state,
                            pincode: details.pincode
                        };
                        const productsForPdf = details.products.split(';').map(p => {
                            const [name, discount_price,tax, quantity,discount, size_name ,length,width,height,weight ,size_id] = p.split(':');
                            return {
                                name,
                                price: parseFloat(discount_price),
                                quantity: parseInt(quantity),
                                size_name,
                                discount:parseInt(discount),
                                tax: parseFloat(tax), // Ensure these are numbers
                                length: parseFloat(length), // Ensure these are numbers
                                width: parseFloat(width),
                                height: parseFloat(height),
                                weight: parseFloat(weight),
                                size_id
                            };
                        });
                        const updateStockSql = 'UPDATE sizes SET stock = stock - ? WHERE  id = ?';

                        for (const product of productsForPdf) {
                            try {
                                await queryPromise(updateStockSql, [
                                    product.quantity,     // The amount to subtract (the quantity ordered)
                                    product.size_id
                                ]);
                                
                            } catch (stockUpdateError) {
                                console.error('Stock update failed for product:', product, stockUpdateError);
                            }
                        }

                        const fullName = user.name || 'Customer';
                        const nameParts = fullName.split(' ').filter(part => part.length > 0); // Filter empty strings just in case
                        const billingFirstName = nameParts[0] || 'Customer';
                        // 4. Determine the Last Name
                        let billingLastName = 'NA';

                        if (nameParts.length > 1) {
                            // If there is more than one part, the last part is the last name
                            billingLastName = nameParts[nameParts.length - 1];
                        } else if (nameParts.length === 1 && nameParts[0] !== 'Customer') {
                            // If there is only one part and it's not the default 'Customer', use it as last name too (or leave as NA)
                            // Common practice is to duplicate the single name if it's the only one present.
                            billingLastName = nameParts[0];
                        }
                        const metrics = calculatePackageMetrics(productsForPdf);
                        const shiprocketPayload = {
                            "order_id": String(orderInfo.unique_order_id),
                            "order_date": new Date().toISOString().slice(0, 19).replace('T', ' '),
                            "pickup_location": "NAAZ AQUARIUM SHOP", // MUST match a location name in your SR account
                            "billing_customer_name": billingFirstName,
                            "billing_last_name":billingLastName,
                            "billing_address": address.address1,
                            "billing_address_2": (address.address2 ? address.address2 + ' ' : '') + (address.landmark || ''),
                            "billing_city": address.city,
                            "billing_pincode": String(address.pincode),
                            "billing_state": address.state,
                            "billing_country": "India",
                            "billing_email": user.email,
                            "billing_phone": user.phone, // Assuming phone is available in details
                            "shipping_is_billing" : true,
                            
                            // Map products for PDF to Shiprocket's required format
                            "order_items": productsForPdf.map(item => ({
                                "name": item.name,
                                "sku": `SKU-${item.name.slice(0, 3)}-${merchantOrderId}`, // Generate a SKU or use your internal SKU
                                "units": item.quantity,
                                "selling_price": item.price.toFixed(2),
                                "length": String(item.length),
                                "breadth": String(item.width),
                                "height": String(item.height),
                                "weight": String(item.weight),
                                "gst_rate":item.tax,
                                "tax_included":"No",
                                "hsn": 3303, // Placeholder HSN, replace with actual
                            })),
                            
                            "payment_method": orderInfo.payment_mode || "Prepaid", // COD or Prepaid
                             "sub_total": Number(orderInfo.subtotal ?? 0).toFixed(2), 
                            "tax": Number(orderInfo.tax ?? 0).toFixed(2),
                            "total": Number(orderInfo.grand_total ?? 0).toFixed(2),
                            "discount": Number(orderInfo.discount ?? 0).toFixed(2),
                            
                            // Ensure metrics helper returns strings, or explicitly cast here
                            "length": String(metrics.finalLength), 
                            "breadth": String(metrics.finalBreadth), 
                            "height": String(metrics.finalHeight), 
                            "weight": String(metrics.totalWeight), 
                        };

                        const shipmentResponse = await createShipment(shiprocketPayload)

                        try {
                                // 1. Generate the PDF and get the path. (This is already set up correctly)
                                const invoicePath = await generatePdfAndSave(orderInfo, productsForPdf, user, address);
                                
                                // 2. Extract the file name.
                                const invoiceFileName = path.basename(invoicePath);
                                const updateInvoiceLinkSql = 'UPDATE orders SET invoice_link = ? WHERE unique_order_id = ?';
                                const updateInvoiceAndShipmentLinkSql = 'UPDATE orders SET invoice_link = ? , delivery_status = ? WHERE unique_order_id = ?';
                                
                                if (shipmentResponse && shipmentResponse.status == 'NEW') {
                                    console.log("New Status Update " ,shipmentResponse ,shipmentResponse.status)
                                   await queryPromise(updateInvoiceAndShipmentLinkSql, [invoiceFileName,shipmentResponse.status, merchantOrderId]);
                                }else{
                                    await queryPromise(updateInvoiceLinkSql, [invoiceFileName, merchantOrderId]);
                                }
                                // 3. Update the database.
                                // We await this outside of its own try/catch, so if it fails, the outer block catches the critical error.

                                // 4. Send the invoice email (Non-critical step)
                                try {
                                    const emailBody = "Dear customer, thank you for your order. Please find your invoice attached.";
                                    await sendInvoiceEmail(user.email, `Invoice for Order #${merchantOrderId}`, emailBody, invoicePath);

                                    // If DB update and Email succeed:
                                    return res.json({ success: true, message: 'Order updated and email sent successfully.' , navigate_to : `/success/${merchantOrderId}`});

                                } catch (emailErr) {
                                    // 5. Handle email failure: Log the error, but still return success for the API call.
                                    console.error('Failed to send invoice email:', emailErr);
                                    // The order is valid and the DB is updated, so we report success to the user.
                                    return res.json({ success: true, message: 'Order updated, but the invoice email failed to send.', navigate_to : `/success/${merchantOrderId}` });
                                }

                            } catch (criticalError) {
                                // 6. Handle critical errors (PDF generation or Database update failure).
                                console.error('A critical error occurred during order processing:', criticalError);
                                return res.status(500).json({ success: false, message: 'Failed to complete order processing due to an internal error.' , navigate_to : `/failed/${merchantOrderId}`});
                            } 
                        } else if (paymentState === 'PENDING') {
                                // Update DB to PENDING and inform the user to wait
                                return res.json({ 
                                    success: false, 
                                    message: 'Payment is pending. Please check back later.',
                                    status: paymentState , navigate_to : `/failed/${merchantOrderId}`
                                });

                        } else {
                            // FAILED, CANCELLED, etc.
                            return res.json({ 
                                success: false, 
                                message: 'Payment failed.',
                                status: paymentState , navigate_to : `/failed/${merchantOrderId}`
                            });
                        }
   } catch (error) {
            console.error('Post-Payment Processing Error:', error);
            // In a real app, log the error and potentially use a payment status check API
            // or a retry mechanism for your business logic.
            return res.status(500).send({success:false,message:'Processing Error'});
        }
};

exports.createShipment = async (req , res) => {
    try {
        const merchantOrderId = req.body.orderId;

        if (!merchantOrderId) {
            return res.status(400).json({ success: false, message: 'Missing Order ID.' });
        }
        const payment_status = await queryPromise(`SELECT payment_status from orders where unique_order_id = ? `,[merchantOrderId] )

        if (!payment_status || payment_status.length === 0) {
            return res.status(404).send({success:false,message:'Order details not found.'});
        }

        if (payment_status[0].payment_status !== 'paid') {
            return res.status(400).send({success:false,message:'Order Not  paid  .'});
        }

         const fetchDetailsSql = `
            SELECT 
                u.name AS user_name, u.email AS user_email,u.mobile AS user_mobile,
                a.address1, a.address2, a.landmark, a.city, a.state, a.pincode,
                o.unique_order_id AS order_id,
                o.subtotal,
                    o.tax,
                    o.total,
                    o.shipping,
                    o.discount,
                    o.grand_total,
                    o.payment_mode,
                GROUP_CONCAT(DISTINCT CONCAT(p.name, ':', s.discount_price,':', p.tax, ':', op.quantity, ':',op.discount, ':', s.name ,':', s.length ,':', s.width ,':', s.height ,':', s.weight ,':',s.id) SEPARATOR ';') AS products
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN addresses a ON o.address_id = a.id
            JOIN order_products op ON o.id = op.order_id
            JOIN products p ON op.product_id = p.id
            JOIN sizes s ON op.size_id = s.id
            WHERE o.unique_order_id = ?
            GROUP BY o.id;
        `;
        
            const results = await queryPromise(fetchDetailsSql, [merchantOrderId]);

            if (!results || results.length === 0) {
                return res.status(404).send({success:false,message:'Order details not found.', navigate_to : `/failed/${merchantOrderId}`});
            }

            const details = results[0];
            
        
    // 5. Generate PDF, save it, update the connection with the file name, and send the email
            
            const orderInfo = {
                unique_order_id: details.order_id,
                subtotal:details.subtotal,
                tax:details.tax,
                total:details.total,
                shipping:details.shipping,
                discount:details.discount,
                grand_total:details.grand_total,
                payment_mode:details.payment_mode
            };
            const user = {
                name: details.user_name,
                email: details.user_email,
                phone : details.user_mobile
            };
            const address = {
                address1: details.address1,
                address2: details.address2,
                landmark: details.landmark,
                city: details.city,
                state: details.state,
                pincode: details.pincode
            };
            const productsForPdf = details.products.split(';').map(p => {
                const [name, discount_price,tax, quantity,discount, size_name ,length,width,height,weight ,size_id] = p.split(':');
                return {
                    name,
                    price: parseFloat(discount_price),
                    quantity: parseInt(quantity),
                    size_name,
                    discount:parseInt(discount),
                    tax: parseFloat(tax), // Ensure these are numbers
                    length: parseFloat(length), // Ensure these are numbers
                    width: parseFloat(width),
                    height: parseFloat(height),
                    weight: parseFloat(weight),
                    size_id
                };
            });

            const fullName = user.name || 'Customer';
            const nameParts = fullName.split(' ').filter(part => part.length > 0); // Filter empty strings just in case
            const billingFirstName = nameParts[0] || 'Customer';
            // 4. Determine the Last Name
            let billingLastName = 'NA';

            if (nameParts.length > 1) {
                // If there is more than one part, the last part is the last name
                billingLastName = nameParts[nameParts.length - 1];
            } else if (nameParts.length === 1 && nameParts[0] !== 'Customer') {
                // If there is only one part and it's not the default 'Customer', use it as last name too (or leave as NA)
                // Common practice is to duplicate the single name if it's the only one present.
                billingLastName = nameParts[0];
            }
            const metrics = calculatePackageMetrics(productsForPdf);
            const shiprocketPayload = {
                "order_id": String(orderInfo.unique_order_id),
                "order_date": new Date().toISOString().slice(0, 19).replace('T', ' '),
                "pickup_location": "NAAZ AQUARIUM SHOP", // MUST match a location name in your SR account
                "billing_customer_name": billingFirstName,
                "billing_last_name":billingLastName,
                "billing_address": address.address1,
                "billing_address_2": (address.address2 ? address.address2 + ' ' : '') + (address.landmark || ''),
                "billing_city": address.city,
                "billing_pincode": String(address.pincode),
                "billing_state": address.state,
                "billing_country": "India",
                "billing_email": user.email,
                "billing_phone": user.phone, // Assuming phone is available in details
                "shipping_is_billing" : true,
                
                // Map products for PDF to Shiprocket's required format
                "order_items": productsForPdf.map(item => ({
                    "name": item.name,
                    "sku": `SKU-${item.name.slice(0, 3)}-${merchantOrderId}`, // Generate a SKU or use your internal SKU
                    "units": item.quantity,
                    "selling_price": item.price.toFixed(2),
                    "length": String(item.length),
                    "breadth": String(item.width),
                    "height": String(item.height),
                    "weight": String(item.weight),
                    "gst_rate":item.tax,
                    "tax_included":"No",
                    "hsn": 3303, // Placeholder HSN, replace with actual
                })),
                
                "payment_method": orderInfo.payment_mode || "Prepaid", // COD or Prepaid
                    "sub_total": Number(orderInfo.subtotal ?? 0).toFixed(2), 
                "tax": Number(orderInfo.tax ?? 0).toFixed(2),
                "total": Number(orderInfo.grand_total ?? 0).toFixed(2),
                "discount": Number(orderInfo.discount ?? 0).toFixed(2),
                
                // Ensure metrics helper returns strings, or explicitly cast here
                "length": String(metrics.finalLength), 
                "breadth": String(metrics.finalBreadth), 
                "height": String(metrics.finalHeight), 
                "weight": String(metrics.totalWeight), 
            };

            const shipmentResponse = await createShipment(shiprocketPayload)

            if (shipmentResponse && shipmentResponse.status == 'NEW') {
                const updateShipment = 'UPDATE orders SET  delivery_status = ? WHERE unique_order_id = ?';
                await queryPromise(updateShipment, [shipmentResponse.status, merchantOrderId]);

                return res.json({ success: true, message: 'Shiprocket order created Successfully ' });
            }else{
                return res.status(500).send({success:false,message:shipmentResponse,});
            }


    }catch (error) {
            console.error('Post-Payment Processing Error:', error);
            // In a real app, log the error and potentially use a payment status check API
            // or a retry mechanism for your business logic.
            return res.status(500).send({success:false,message:'Processing Error'});
    }
}