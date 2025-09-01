const db = require('../models/db');
const path = require('path');
const fs = require('fs');

// Helper function to generate an image URL
const getImageUrl = (imageName) => {
    const port = process.env.PORT || 3000;
    return `https://naaz-aquarium-skdm.onrender.com/uploads/product_images/${imageName}`;
};

// Helper function to create a slug from a string
const slugify = (str) => {
    return str.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w-]+/g, '')       // Remove all non-word chars
        .replace(/--+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')            // Trim - from start of text
        .replace(/-+$/, '');           // Trim - from end of text
};

const formatProductData = (product) => {
    const { category_name, category_slug, category_description, ...rest } = product;
    const images = product.images ? product.images.split(';').map(img => {
        const parts = img.split(':');
        return {
            id: parseInt(parts[0]),
            url: getImageUrl(parts[1])
        };
    }) : [];

    const sizes = product.sizes ? product.sizes.split(';').map(size => {
        const parts = size.split(':');
        return { id: parseInt(parts[0]), name: parts[1], price: parseFloat(parts[2]), discount_price: parseFloat(parts[3]), stock: parseInt(parts[4]) };
    }) : [];
    const reviews = product.reviews ? product.reviews.split(';').map(review => {
        const parts = review.split(':');
        return { id: parseInt(parts[0]), name: parts[1], review: parts[2] };
    }) : [];

    return {
        ...rest,
        category: {
            id: product.category_id,
            name: category_name,
            slug: category_slug,
            description: category_description
        },
        images,
        sizes,
        reviews
    };
};

exports.getAllProducts = (req, res) => {
    const { page = 1, limit = 10, sort, price_min, price_max, size_min, size_max, category_ids } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let baseSql = `
        SELECT p.*,
               c.name AS category_name, c.slug AS category_slug, c.description AS category_description,
               GROUP_CONCAT(DISTINCT CONCAT(i.id, ':', i.url) SEPARATOR ';') AS images,
               GROUP_CONCAT(DISTINCT CONCAT(s.id, ':', s.name, ':', s.price, ':', s.discount_price, ':', s.stock) SEPARATOR ';') AS sizes,
               GROUP_CONCAT(DISTINCT CONCAT(r.id, ':', r.name, ':', r.review) SEPARATOR ';') AS reviews
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN images i ON p.id = i.product_id
        LEFT JOIN reviews r ON p.id = r.product_id
    `;
    let countSql = `SELECT COUNT(DISTINCT p.id) AS total FROM products p`;

    const whereClauses = [];
    const sqlParams = [];

    // Check if we need to join the sizes table
    const needsSizeJoin = price_min || price_max || size_min || size_max || sort === 'price:low-high' || sort === 'price:high-low';
    if (needsSizeJoin) {
        baseSql += ` JOIN sizes s ON p.id = s.product_id`;
        countSql += ` JOIN sizes s ON p.id = s.product_id`;
    } else {
        baseSql += ` LEFT JOIN sizes s ON p.id = s.product_id`;
    }

    // Filter by Price Range
    if (price_min) {
        whereClauses.push(`s.price >= ?`);
        sqlParams.push(parseFloat(price_min));
    }
    if (price_max) {
        whereClauses.push(`s.price <= ?`);
        sqlParams.push(parseFloat(price_max));
    }

    // Filter by Size Range
    if (size_min) {
        whereClauses.push(`CAST(s.name AS UNSIGNED) >= ?`);
        sqlParams.push(parseInt(size_min));
    }
    if (size_max) {
        whereClauses.push(`CAST(s.name AS UNSIGNED) <= ?`);
        sqlParams.push(parseInt(size_max));
    }

    // Filter by Category IDs
    if (category_ids) {
        const ids = category_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        if (ids.length > 0) {
            whereClauses.push(`p.category_id IN (?)`);
            sqlParams.push(ids);
        }
    }
    
    // Construct WHERE clause for both queries
    if (whereClauses.length > 0) {
        const whereClauseString = ` WHERE ` + whereClauses.join(' AND ');
        baseSql += whereClauseString;
        countSql += whereClauseString;
    }
    
    // Grouping
    baseSql += ` GROUP BY p.id`;

    // Sorting
    let orderBy = 'p.id ASC';
    if (sort) {
        const [field, order] = sort.split(':');
        if (field === 'price') {
            orderBy = `MIN(s.price) ${order === 'high-low' ? 'DESC' : 'ASC'}`;
        } else if (field === 'name') {
            orderBy = `p.name ${order === 'high-low' ? 'DESC' : 'ASC'}`;
        }
    }
    baseSql += ` ORDER BY ${orderBy}`;

    // Pagination
    baseSql += ` LIMIT ? OFFSET ?`;
    sqlParams.push(parseInt(limit), offset);
    
    // Execute both queries
    db.query(countSql, sqlParams.slice(0, sqlParams.length - 2), (countErr, countResult) => {
        if (countErr) {
            return res.status(500).json({ success: false, message: 'Failed to get product count.', error: countErr });
        }
        
        const totalCount = countResult[0].total;

        db.query(baseSql, sqlParams, (err, products) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Failed to fetch products.', error: err });
            }

            const formattedProducts = products.map(formatProductData);

            res.json({
                success: true,
                products: formattedProducts,
                pagination: {
                    total: totalCount,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(totalCount / parseInt(limit)),
                },
            });
        });
    });
};

exports.getProductBySlug = (req, res) => {
    const slug = req.params.slug;
    const sql = `
        SELECT p.*,
               c.name AS category_name, c.slug AS category_slug, c.description AS category_description,
               GROUP_CONCAT(DISTINCT CONCAT(i.id, ':', i.url) SEPARATOR ';') AS images,
               GROUP_CONCAT(DISTINCT CONCAT(s.id, ':', s.name, ':', s.price, ':', s.discount_price, ':', s.stock) SEPARATOR ';') AS sizes,
               GROUP_CONCAT(DISTINCT CONCAT(r.id, ':', r.name, ':', r.review) SEPARATOR ';') AS reviews
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN images i ON p.id = i.product_id
        LEFT JOIN sizes s ON p.id = s.product_id
        LEFT JOIN reviews r ON p.id = r.product_id
        WHERE p.slug = ?
        GROUP BY p.id;
    `;

    db.query(sql, [slug], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to fetch product.', error: err });
        if (results.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
        
        const formattedProduct = formatProductData(results[0]);

        res.json({ success: true, product: formattedProduct });
    });
};

const fetchProductDetails = (productId, res, successMessage, statusCode) => {
    const sql = `
        SELECT p.*,
               c.name AS category_name, c.slug AS category_slug, c.description AS category_description,
               GROUP_CONCAT(DISTINCT CONCAT(i.id, ':', i.url) SEPARATOR ';') AS images,
               GROUP_CONCAT(DISTINCT CONCAT(s.id, ':', s.name, ':', s.price, ':', s.discount_price, ':', s.stock) SEPARATOR ';') AS sizes,
               GROUP_CONCAT(DISTINCT CONCAT(r.id, ':', r.name, ':', r.review) SEPARATOR ';') AS reviews
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN images i ON p.id = i.product_id
        LEFT JOIN sizes s ON p.id = s.product_id
        LEFT JOIN reviews r ON p.id = r.product_id
        WHERE p.id = ?
        GROUP BY p.id;
    `;

    db.query(sql, [productId], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to fetch product details after operation.', error: err });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const product = results[0];
        const formattedProduct = {
            ...product,
            category: {
                id: product.category_id,
                name: product.category_name,
                slug: product.category_slug,
                description: product.category_description
            },
            images : product.images ? product.images.split(';').map(img => {
                const parts = img.split(':');
                return { 
                    id: parseInt(parts[0]), 
                    url: getImageUrl(parts[1]) 
                };
            }) : [],
            sizes: product.sizes ? product.sizes.split(';').map(size => {
                const parts = size.split(':');
                return { id: parseInt(parts[0]), name: parts[1], price: parseFloat(parts[2]), discount_price: parseFloat(parts[3]), stock: parseInt(parts[4]) };
            }) : [],
            reviews: product.reviews ? product.reviews.split(';').map(review => {
                const parts = review.split(':');
                return { id: parseInt(parts[0]), name: parts[1], review: parts[2] };
            }) : [],
        };
        // Clean up temporary keys
        delete formattedProduct.category_name;
        delete formattedProduct.category_slug;
        delete formattedProduct.category_description;

        res.status(statusCode).json({ success: true, message: successMessage, product: formattedProduct });
    });
};

exports.createProduct = (req, res) => {
    const { name, description, category_id } = req.body;
    if (!name || !category_id) return res.status(400).json({ success: false, message: 'Product name and category ID are required.' });

    const slug = slugify(name);
    const sql = 'INSERT INTO products (name, description, category_id, slug) VALUES (?, ?, ?, ?)';

    db.query(sql, [name, description, category_id, slug], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: 'Product with this slug already exists.' });
            }
            if (err.code === 'ER_NO_REFERENCED_ROW_2') {
                return res.status(400).json({ success: false, message: 'Invalid category ID.' });
            }
            return res.status(500).json({ success: false, message: 'Failed to create product.', error: err });
        }
        
        const productId = result.insertId;
        
        const images = req.files.map(file => ({ productId, url: file.filename }));
        if (images.length > 0) {
            const imageSql = 'INSERT INTO images (product_id, url) VALUES ?';
            const imageValues = images.map(img => [img.productId, img.url]);
            db.query(imageSql, [imageValues], (imgErr) => {
                if (imgErr) {
                    console.error('Failed to save images:', imgErr);
                }
                // Even if image saving fails, we proceed to fetch and return the product.
                fetchProductDetails(productId, res, 'Product created successfully.', 201);
            });
        } else {
            fetchProductDetails(productId, res, 'Product created successfully.', 201);
        }
    });
};

exports.updateProduct = (req, res) => {
    const { id } = req.params;
    const { name, description, category_id } = req.body;
    
    const slug = name ? slugify(name) : undefined;
    
    let updateFields = {};
    if (name) updateFields.name = name;
    if (description) updateFields.description = description;
    if (category_id) updateFields.category_id = category_id;
    if (slug) updateFields.slug = slug;

    const sql = `UPDATE products SET ? WHERE id = ?`;
    
    db.query(sql, [updateFields, id], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: 'Product with this new name/slug already exists.' });
            }
            if (err.code === 'ER_NO_REFERENCED_ROW_2') {
                return res.status(400).json({ success: false, message: 'Invalid category ID.' });
            }
            return res.status(500).json({ success: false, message: 'Failed to update product.', error: err });
        }
        
        if (req.files && req.files.length > 0) {
            const images = req.files.map(file => ({ productId: id, url: file.path }));
            const imageSql = 'INSERT INTO images (product_id, url) VALUES ?';
            const imageValues = images.map(img => [img.productId, img.url]);
            db.query(imageSql, [imageValues], (imgErr) => {
                if (imgErr) {
                    console.error('Failed to add new images:', imgErr);
                }
                // Even if image saving fails, we proceed to fetch and return the product.
                fetchProductDetails(id, res, 'Product updated successfully.', 200);
            });
        } else {
            fetchProductDetails(id, res, 'Product updated successfully.', 200);
        }
    });
};

exports.deleteProduct = (req, res) => {
    const { id } = req.params;

    // First, delete associated image files from the server
    const getImagesSql = 'SELECT url FROM images WHERE product_id = ?';
    db.query(getImagesSql, [id], (err, images) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to get images to delete.', error: err });
        
        images.forEach(image => {
            const imagePath = path.join(__dirname, '..', image.url);
            fs.unlink(imagePath, (unlinkErr) => {
                if (unlinkErr) console.error('Failed to delete image file:', unlinkErr);
            });
        });

        // Then, delete the product from the database (cascade will delete images, sizes, and reviews)
        const sql = 'DELETE FROM products WHERE id = ?';
        db.query(sql, [id], (deleteErr, result) => {
            if (deleteErr) return res.status(500).json({ success: false, message: 'Failed to delete product.', error: deleteErr });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Product not found.' });

            res.json({ success: true, message: 'Product and all associated data deleted successfully.' });
        });
    });
};





exports.getSearch = (req, res) => {
    // Get the search query and pagination parameters from the request.
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Use '%' to create a fuzzy search pattern for the SQL LIKE operator.
    const searchTerm = `%${query}%`;

    // SQL query to search both products and categories.
    let sql, countSql;

    if (!query) {
        // If there is no query, send a random selection of 5 products and 5 categories.
        sql = `
            (
                SELECT
                    p.id,
                    p.name  AS name,
                    p.slug  AS slug,
                    p.description  AS description,
                    'product' AS type,
                    c.name  AS category_name,
                    c.slug  AS category_slug,
                    GROUP_CONCAT(DISTINCT CONCAT(i.id, ':', i.url) SEPARATOR ';') AS images
                FROM
                    products p
                LEFT JOIN
                    categories c ON p.category_id = c.id
                LEFT JOIN
                    images i ON p.id = i.product_id
                GROUP BY
                    p.id
                ORDER BY RAND()
                LIMIT 3
            )
            UNION ALL
            (
                SELECT
                    c.id,
                    c.name  AS name,
                    c.slug  AS slug,
                    c.description  AS description,
                    'category' AS type,
                    NULL AS category_name,
                    NULL AS category_slug,
                    NULL AS images
                FROM
                    categories c
                ORDER BY RAND()
                LIMIT 2
            )
        `;

        // We don't need a separate count query for this case.
        countSql = null;

    } else {
        // SQL query to search both products and categories.
        // We use a UNION to combine results from both tables and give them a consistent structure.
        sql = `
            (
                -- Search Products
                SELECT
                    p.id,
                    p.name COLLATE utf8mb4_unicode_ci AS name,
                    p.slug COLLATE utf8mb4_unicode_ci AS slug,
                    p.description COLLATE utf8mb4_unicode_ci AS description,
                    'product' AS type,
                    c.name COLLATE utf8mb4_unicode_ci AS category_name,
                    c.slug COLLATE utf8mb4_unicode_ci AS category_slug,
                    GROUP_CONCAT(DISTINCT CONCAT(i.id, ':', i.url) SEPARATOR ';') AS images
                FROM
                    products p
                LEFT JOIN
                    categories c ON p.category_id = c.id
                LEFT JOIN
                    images i ON p.id = i.product_id
                WHERE
                    p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?
                GROUP BY
                    p.id
            )
            UNION ALL
            (
                -- Search Categories
                SELECT
                    c.id,
                    c.name COLLATE utf8mb4_unicode_ci AS name,
                    c.slug COLLATE utf8mb4_unicode_ci AS slug,
                    c.description COLLATE utf8mb4_unicode_ci AS description,
                    'category' AS type,
                    NULL AS category_name,
                    NULL AS category_slug,
                    NULL AS images
                FROM
                    categories c
                WHERE
                    c.name LIKE ? OR c.description LIKE ?
            )
            ORDER BY
                name
            LIMIT ? OFFSET ?;
        `;

        // SQL query to get the total count of results for pagination.
        countSql = `
            SELECT
                (
                    (SELECT COUNT(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)
                    +
                    (SELECT COUNT(*) FROM categories c WHERE c.name LIKE ? OR c.description LIKE ?)
                ) AS total_count;
        `;
    }

    if (query) {
        // Execute the count query first to get total number of results
        db.query(countSql, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm], (err, countResults) => {
            if (err) {
                console.error('Failed to get search result count:', err);
                return res.status(500).json({ success: false, message: 'Failed to perform search count.', error: err.message });
            }

            const totalCount = countResults[0].total_count;
            const totalPages = Math.ceil(totalCount / limit);

            // Execute the main search query
            db.query(sql, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit, offset], (err, results) => {
                if (err) {
                    console.error('Failed to perform search:', err);
                    return res.status(500).json({ success: false, message: 'Failed to perform search.', error: err.message });
                }

                // Format the results to include a proper images array
                const formattedResults = results.map(item => {
                    if (item.type === 'product' && item.images) {
                        item.images = item.images.split(';').map(img => {
                            const parts = img.split(':');
                            return {
                                id: parseInt(parts[0]),
                                url: getImageUrl(parts[1])
                            };
                        });
                    }
                    return item;
                });

                // Send a single combined list of results with pagination metadata.
                res.json({
                    success: true,
                    results: formattedResults,
                    pagination: {
                        totalResults: totalCount,
                        totalPages: totalPages,
                        currentPage: page,
                        pageSize: limit,
                    }
                });
            });
        });
    } else {
        // Execute the single query for the "no query" case.
        db.query(sql, (err, results) => {
            if (err) {
                console.error('Failed to get default results:', err);
                return res.status(500).json({ success: false, message: 'Failed to get default results.', error: err.message });
            }

            // Format the results to include a proper images array
            const formattedResults = results.map(item => {
                if (item.type === 'product' && item.images) {
                    item.images = item.images.split(';').map(img => {
                        const parts = img.split(':');
                        return {
                            id: parseInt(parts[0]),
                            url: getImageUrl(parts[1])
                        };
                    });
                }
                return item;
            });

            // Send a single combined list of results with no pagination metadata.
            res.json({
                success: true,
                results: formattedResults,
                pagination: null
            });
        });
    }
};