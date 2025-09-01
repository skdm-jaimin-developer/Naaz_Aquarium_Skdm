const db = require('../models/db');
const { generateUniqueOrderId } = require('../helpers/orderIdGenerator');
const { generatePdfAndSave } = require('../helpers/invoiceGenerator');
const { sendInvoiceEmail } = require('../helpers/emailSender');
const path = require('path');

const getInvoiceUrl = (invoiceName) => {
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}/invoices/${invoiceName}`;
};

const getImageUrl = (imageName) => {
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}/uploads/product_images/${imageName}`;
};

// Helper function to format order data for consistent API responses
const formatOrderData = (order) => {
    // Helper to parse concatenated strings from SQL
    const parseAggregatedData = (dataString, parser) => {
        if (!dataString) return [];
        return dataString.split(';').map(parser);
    };

    const productParser = (p) => {
        const parts = p.split('|');
        const [
            id, name, description, category_id, no_of_reviews, slug,
            images, sizeDetails,
            category_name, category_slug, category_description,
            quantity
        ] = parts;

        const [sizeId, sizeName, price, discount_price, stock] = sizeDetails.split(':');

        return {
            id: parseInt(id),
            name: name,
            description: description,
            category_id: parseInt(category_id),
            no_of_reviews: parseInt(no_of_reviews),
            slug: slug,
            images: parseAggregatedData(images, (img) => {
                const [imgId, url] = img.split(':');
                return {
                    id: parseInt(imgId),
                    url:getImageUrl(url)
                };
            }),
            size: {
                id: parseInt(sizeId),
                name: sizeName,
                price: parseFloat(price),
                discount_price: parseFloat(discount_price),
                stock: parseInt(stock)
            },
            quantity: parseInt(quantity),
            category: {
                id: parseInt(category_id),
                name: category_name,
                slug: category_slug,
                description: category_description
            }
        };
    };

    return {
        id: order.id,
        unique_order_id: order.unique_order_id,
        user_id: order.user_id,
        address_id: order.address_id,
        status: order.status,
        payment_status: order.payment_status,
        delivery_status: order.delivery_status,
        payment_mode: order.payment_mode,
        transaction_id: order.transaction_id,
        subtotal: parseFloat(order.subtotal),
        tax: parseFloat(order.tax),
        total: parseFloat(order.total),
        invoice_link: getInvoiceUrl(order.invoice_link),
        created_at: order.created_at,
        updated_at: order.updated_at,
        user: {
            id: order.user_id,
            name: order.user_name,
            email: order.user_email,
            mobile: order.user_mobile
        },
        address: {
            id: order.address_id,
            address1: order.address_line1,
            address2: order.address_line2,
            landmark: order.address_landmark,
            city: order.address_city,
            state: order.address_state,
            pincode: order.address_pincode
        },
        products: parseAggregatedData(order.products, productParser)
    };
};

// --- API Endpoint: Create a new order ---
exports.createOrder = (req, res) => {
    // Get the user ID from the verified JWT token (handled by middleware)
    const userId = req.userData.userId;

    // Destructure order details from the request body
    const {
        addressId,
        paymentMode,
        subtotal,
        tax,
        total,
        products
    } = req.body;

    // Validate that the user ID is present
    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'Authentication failed: User ID not found.'
        });
    }

    const uniqueOrderId = generateUniqueOrderId();
    const orderData = {
        unique_order_id: uniqueOrderId,
        user_id: userId,
        address_id: addressId,
        subtotal,
        tax,
        total,
        payment_mode: paymentMode,
    };

    // Begin a database transaction to ensure atomicity
    db.beginTransaction(err => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Failed to start transaction.',
                error: err.message
            });
        }

        // 1. Insert the new order into the `orders` table
        const insertOrderSql = 'INSERT INTO orders SET ?';
        db.query(insertOrderSql, orderData, (err, result) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).json({
                        success: false,
                        message: 'Failed to create order.',
                        error: err.message
                    });
                });
            }

            const orderId = result.insertId;

            // 2. Insert product and quantity details into the `order_products` table
            const insertOrderProductsSql = 'INSERT INTO order_products (order_id, product_id, size_id, quantity) VALUES ?';
            const orderProductsData = products.map(p => [orderId, p.productId, p.sizeId, p.quantity]);

            db.query(insertOrderProductsSql, [orderProductsData], (err) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({
                            success: false,
                            message: 'Failed to add products to order.',
                            error: err.message
                        });
                    });
                }

                // 3. Update the stock for each size
                const updateStockPromises = products.map(p => {
                    return new Promise((resolve, reject) => {
                        const updateStockSql = 'UPDATE sizes SET stock = stock - ? WHERE id = ?';
                        db.query(updateStockSql, [p.quantity, p.sizeId], (err, updateResult) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                });

                // 4. Fetch the data needed for the invoice and email
                const fetchDetailsSql = `
                    SELECT 
                        u.name AS user_name, u.email AS user_email,u.mobile AS user_mobile,
                        a.address1, a.address2, a.landmark, a.city, a.state, a.pincode,
                        GROUP_CONCAT(DISTINCT CONCAT(p.name, ':', s.discount_price, ':', op.quantity, ':', s.name) SEPARATOR ';') AS products
                    FROM orders o
                    JOIN users u ON o.user_id = u.id
                    JOIN addresses a ON o.address_id = a.id
                    JOIN order_products op ON o.id = op.order_id
                    JOIN products p ON op.product_id = p.id
                    JOIN sizes s ON op.size_id = s.id
                    WHERE o.id = ?
                    GROUP BY o.id;
                `;

                Promise.all(updateStockPromises)
                    .then(() => new Promise((resolve, reject) => {
                        db.query(fetchDetailsSql, [orderId], (err, results) => {
                            if (err) return reject(err);
                            resolve(results[0]);
                        });
                    }))
                    .then(details => {
                        // 5. Generate PDF, save it, update the DB with the file name, and send the email
                        console.log(details,"details")
                        const orderInfo = {
                            unique_order_id: uniqueOrderId,
                            subtotal,
                            tax,
                            total
                        };
                        const user = {
                            name: details.user_name,
                            email: details.user_email
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
                            const [name, discount_price, quantity, size_name] = p.split(':');
                            return {
                                name,
                                price: parseFloat(discount_price),
                                quantity: parseInt(quantity),
                                size_name
                            };
                        });

                        return generatePdfAndSave(orderInfo, productsForPdf, user, address)
                            .then(invoicePath => {
                                console.log(invoicePath)
                                // Store only the file name in the database
                                const invoiceFileName = path.basename(invoicePath);
                                const updateInvoiceLinkSql = 'UPDATE orders SET invoice_link = ? WHERE id = ?';
                                return new Promise((resolve, reject) => {
                                    db.query(updateInvoiceLinkSql, [invoiceFileName, orderId], (err) => {
                                        if (err) return reject(err);
                                        // ⚡️ NEW: Send the invoice email after the DB is updated
                                        const emailBody = "Dear customer, thank you for your order. Please find your invoice attached.";
                                        sendInvoiceEmail(user.email, `Invoice for Order #${uniqueOrderId}`, emailBody, invoicePath)
                                            .then(() => resolve()) // Resolve promise after email is sent
                                            .catch(emailErr => {
                                                console.error('Failed to send invoice email:', emailErr);
                                                // Don't reject, as the order is still valid. Just log the error.
                                                resolve();
                                            });
                                    });
                                });
                            });
                    })
                    .then(() => {
                        // 6. Commit the transaction
                        db.commit((commitErr) => {
                            if (commitErr) {
                                return db.rollback(() => {
                                    res.status(500).json({
                                        success: false,
                                        message: 'Failed to commit transaction.',
                                        error: commitErr.message
                                    });
                                });
                            }
                            // 7. Fetch the complete, formatted order details to send in the final response
                            const fetchOrderSql = `
                                SELECT
                                    o.id, o.unique_order_id, o.user_id, o.address_id, o.status, o.payment_status, o.delivery_status, o.payment_mode, o.transaction_id,
                                    o.subtotal, o.tax, o.total, o.invoice_link, o.created_at, o.updated_at,
                                    u.name AS user_name, u.email AS user_email,u.mobile AS user_mobile,
                                    a.address1 AS address_line1, a.address2 AS address_line2, a.landmark AS address_landmark, a.city AS address_city, a.state AS address_state, a.pincode AS address_pincode,
                                    GROUP_CONCAT(
                                        DISTINCT CONCAT(
                                            p.id, '|', p.name, '|', p.description, '|', p.category_id, '|', p.no_of_reviews, '|', p.slug, '|',
                                            (SELECT GROUP_CONCAT(CONCAT(id, ':', url) SEPARATOR ',') FROM images WHERE product_id = p.id), '|',
                                            (SELECT CONCAT(s.id, ':', s.name, ':', s.price, ':', s.discount_price, ':', s.stock) FROM sizes s WHERE s.id = op.size_id), '|',
                                            c.name, '|', c.slug, '|', c.description, '|', op.quantity
                                        ) SEPARATOR ';'
                                    ) AS products
                                FROM orders o
                                JOIN users u ON o.user_id = u.id
                                JOIN addresses a ON o.address_id = a.id
                                JOIN order_products op ON o.id = op.order_id
                                JOIN products p ON op.product_id = p.id
                                JOIN categories c ON p.category_id = c.id
                                WHERE o.id = ?
                                GROUP BY o.id;
                            `;
                            db.query(fetchOrderSql, [orderId], (err, fetchResults) => {
                                if (err) {
                                    console.error('Failed to fetch order after creation:', err.message);
                                    return res.status(500).json({
                                        success: false,
                                        message: 'Order created and email sent, but failed to fetch details.'
                                    });
                                }
                                if (fetchResults.length === 0) {
                                    return res.status(404).json({
                                        success: false,
                                        message: 'Order created, but details could not be found.'
                                    });
                                }
                                try {
                                    const createdOrder = formatOrderData(fetchResults[0]);
                                    res.status(201).json({
                                        success: true,
                                        order: createdOrder
                                    });
                                } catch (formatError) {
                                    console.error('Failed to format order data:', formatError.message);
                                    res.status(500).json({
                                        success: false,
                                        message: 'Order created, but failed to format response data.'
                                    });
                                }
                            });
                        });
                    })
                    .catch(err => {
                        db.rollback(() => {
                            console.error('Transaction rollback due to an error:', err);
                            res.status(500).json({
                                success: false,
                                message: 'Transaction failed, rolling back.',
                                error: err.message
                            });
                        });
                    });
            });
        });
    });
};

// --- API Endpoint: Fetch all orders with pagination ---
exports.getAllOrders = (req, res) => {
    // Get page and limit from query parameters with default values
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    // First query to get the total count of orders
    const countSql = 'SELECT COUNT(*) AS totalOrders FROM orders';
    db.query(countSql, (err, countResult) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch order count.',
                error: err.message
            });
        }
        const totalOrders = countResult[0].totalOrders;
        const totalPages = Math.ceil(totalOrders / limit);

        // Second query to fetch the paginated orders
        const sql = `
            SELECT
                o.id, o.unique_order_id, o.user_id, o.address_id, o.status, o.payment_status, o.delivery_status, o.payment_mode, o.transaction_id,
                o.subtotal, o.tax, o.total, o.invoice_link, o.created_at, o.updated_at,
                u.name AS user_name, u.email AS user_email,u.mobile AS user_mobile,
                a.address1 AS address_line1, a.address2 AS address_line2, a.landmark AS address_landmark, a.city AS address_city, a.state AS address_state, a.pincode AS address_pincode,
                GROUP_CONCAT(
                    DISTINCT CONCAT(
                        p.id, '|', p.name, '|', p.description, '|', p.category_id, '|', p.no_of_reviews, '|', p.slug, '|',
                        (SELECT GROUP_CONCAT(CONCAT(id, ':', url) SEPARATOR ',') FROM images WHERE product_id = p.id), '|',
                        (SELECT CONCAT(s.id, ':', s.name, ':', s.price, ':', s.discount_price, ':', s.stock) FROM sizes s JOIN order_products op ON s.id = op.size_id WHERE op.product_id = p.id AND op.order_id = o.id), '|',
                        c.name, '|', c.slug, '|', c.description, '|', op.quantity
                    ) SEPARATOR ';'
                ) AS products
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN addresses a ON o.address_id = a.id
            JOIN order_products op ON o.id = op.order_id
            JOIN products p ON op.product_id = p.id
            JOIN categories c ON p.category_id = c.id
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?;
        `;

        db.query(sql, [limit, offset], (err, results) => {
            if (err) return res.status(500).json({
                success: false,
                message: 'Failed to fetch orders.',
                error: err.message
            });

            const orders = results.map(formatOrderData);
            res.json({
                success: true,
                orders,
                pagination: {
                    totalOrders,
                    totalPages,
                    currentPage: page,
                    limit
                }
            });
        });
    });
};


// --- API Endpoint: Fetch single order by ID ---
exports.getOrderById = (req, res) => {
    const {
        id
    } = req.params;
    const sql = `
        SELECT
            o.id, o.unique_order_id, o.user_id, o.address_id, o.status, o.payment_status, o.delivery_status, o.payment_mode, o.transaction_id,
            o.subtotal, o.tax, o.total, o.invoice_link, o.created_at, o.updated_at,
            u.name AS user_name, u.email AS user_email,u.mobile AS user_mobile,
            a.address1 AS address_line1, a.address2 AS address_line2, a.landmark AS address_landmark, a.city AS address_city, a.state AS address_state, a.pincode AS address_pincode,
            GROUP_CONCAT(
                DISTINCT CONCAT(
                    p.id, '|', p.name, '|', p.description, '|', p.category_id, '|', p.no_of_reviews, '|', p.slug, '|',
                    (SELECT GROUP_CONCAT(CONCAT(id, ':', url) SEPARATOR ',') FROM images WHERE product_id = p.id), '|',
                    (SELECT CONCAT(s.id, ':', s.name, ':', s.price, ':', s.discount_price, ':', s.stock) FROM sizes s WHERE s.id = op.size_id), '|',
                    c.name, '|', c.slug, '|', c.description, '|', op.quantity
                ) SEPARATOR ';'
            ) AS products
        FROM orders o
        JOIN users u ON o.user_id = u.id
        JOIN addresses a ON o.address_id = a.id
        JOIN order_products op ON o.id = op.order_id
        JOIN products p ON op.product_id = p.id
        JOIN categories c ON p.category_id = c.id
        WHERE o.unique_order_id = ?
        GROUP BY o.id;
    `;
    db.query(sql, [id], (err, results) => {
        if (err) return res.status(500).json({
            success: false,
            message: 'Failed to fetch order.',
            error: err.message
        });
        if (results.length === 0) return res.status(404).json({
            success: false,
            message: 'Order not found.'
        });
        const order = formatOrderData(results[0]);
        res.json({
            success: true,
            order
        });
    });
};

// --- API Endpoint: Fetch orders by User ID with pagination ---
exports.getOrdersByUserId = (req, res) => {
    const {
        userId
    } = req.params;
    // Get page and limit from query parameters with default values
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    // First query to get the total count of orders for the specific user
    const countSql = 'SELECT COUNT(*) AS totalOrders FROM orders WHERE user_id = ?';
    db.query(countSql, [userId], (err, countResult) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch order count for user.',
                error: err.message
            });
        }
        const totalOrders = countResult[0].totalOrders;
        const totalPages = Math.ceil(totalOrders / limit);

        // Second query to fetch the paginated orders for the user
        const sql = `
            SELECT
                o.id, o.unique_order_id, o.user_id, o.address_id, o.status, o.payment_status, o.delivery_status, o.payment_mode, o.transaction_id,
                o.subtotal, o.tax, o.total, o.invoice_link, o.created_at, o.updated_at,
                u.name AS user_name, u.email AS user_email,u.mobile AS user_mobile,
                a.address1 AS address_line1, a.address2 AS address_line2, a.landmark AS address_landmark, a.city AS address_city, a.state AS address_state, a.pincode AS address_pincode,
                GROUP_CONCAT(
                    DISTINCT CONCAT(
                        p.id, '|', p.name, '|', p.description, '|', p.category_id, '|', p.no_of_reviews, '|', p.slug, '|',
                        (SELECT GROUP_CONCAT(CONCAT(id, ':', url) SEPARATOR ',') FROM images WHERE product_id = p.id), '|',
                        (SELECT CONCAT(s.id, ':', s.name, ':', s.price, ':', s.discount_price, ':', s.stock) FROM sizes s WHERE s.id = op.size_id), '|',
                        c.name, '|', c.slug, '|', c.description, '|', op.quantity
                    ) SEPARATOR ';'
                ) AS products
            FROM orders o
            JOIN users u ON o.user_id = u.id
            JOIN addresses a ON o.address_id = a.id
            JOIN order_products op ON o.id = op.order_id
            JOIN products p ON op.product_id = p.id
            JOIN categories c ON p.category_id = c.id
            WHERE o.user_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?;
        `;
        db.query(sql, [userId, limit, offset], (err, results) => {
            if (err) return res.status(500).json({
                success: false,
                message: 'Failed to fetch orders.',
                error: err.message
            });
            const orders = results.map(formatOrderData);
            res.json({
                success: true,
                orders,
                pagination: {
                    totalOrders,
                    totalPages,
                    currentPage: page,
                    limit
                }
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
