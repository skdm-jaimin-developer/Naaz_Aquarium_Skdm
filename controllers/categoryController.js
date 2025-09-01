const db = require('../models/db');
const multer = require('multer');
const path = require('path');

// Configure multer for file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/category_images');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 1 // 2MB file size limit
    },
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|gif/;
        const mimeType = fileTypes.test(file.mimetype);
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());

        if (mimeType && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .jpeg, .jpg, .png, and .gif formats are supported.'));
    }
}).single('image');


const generateSlug = (name) => {
    return name
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')         // Replace spaces with -
        .replace(/[^\w-]+/g, '')      // Remove all non-word chars
        .replace(/--+/g, '-');        // Replace multiple - with single -
};


const getImageUrl = (imageName) => {
    const port = process.env.PORT || 3000; // Use environment variable or default port
    return `http://localhost:${port}/uploads/category_images/${imageName}`;
};



exports.createCategory = (req, res) => {
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success:false, message: 'File size exceeds the 1MB limit.' });
            }
            return res.status(500).json({ success:false, message: 'File upload error.', error: err });
        } else if (err) {
            return res.status(400).json({ success:false, message: err.message });
        }

        const { name, description } = req.body;
        const image = req.file ? req.file.filename : null;

        if (!name || !image) {
            return res.status(400).json({ success:false, message: 'Category name and image are required.' });
        }

        const slug = generateSlug(name);

        const sql = 'INSERT INTO categories (name, image, slug, description) VALUES (?, ?, ?, ?)';
        db.query(sql, [name, image, slug, description], (dbErr, result) => {
            if (dbErr) {
                // Handle potential duplicate slug error
                if (dbErr.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ success:false, message: 'Category name already exists, please choose a different name.', error: dbErr });
                }
                return res.status(500).json({ success:false, message: 'Failed to create category.', error: dbErr });
            }
            const newCategoryId = result.insertId;
            const fetchSql = 'SELECT id, name, image, slug, description FROM categories WHERE id = ?';
            db.query(fetchSql, [newCategoryId], (fetchErr, categoryResult) => {
                if (fetchErr) {
                    return res.status(500).json({ success:false, message: 'Category created, but failed to fetch details.', error: fetchErr });
                }
                const category = categoryResult[0];
                category.image = getImageUrl(category.image);
                res.status(201).json({
                    success:true, message: 'Category created successfully.',
                    category: category
                });
            });
        });
    });
};

exports.getAllCategories = (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    db.query('SELECT COUNT(*) AS total FROM categories', (err, result) => {
        if (err) {
            return res.status(500).json({ success:false, message: 'Failed to fetch total category count.', error: err });
        }
        const totalCategories = result[0].total;

        const sql = 'SELECT id, name, image, slug, description FROM categories LIMIT ? OFFSET ?';
        db.query(sql, [limit, offset], (err, categories) => {
            if (err) {
                return res.status(500).json({ success:false, message: 'Failed to fetch categories.', error: err });
            }
            // Map over categories to update image URL
            const categoriesWithUrls = categories.map(category => ({
                ...category,
                image: getImageUrl(category.image)
            }));
            res.status(200).json({
                success:true,
                total: totalCategories,
                page,
                limit,
                categories: categoriesWithUrls
            });
        });
    });
};

exports.getCategoryById = (req, res) => {
    const categoryId = req.params.id;
    const sql = 'SELECT id, name, image, slug, description FROM categories WHERE id = ?';
    db.query(sql, [categoryId], (err, category) => {
        if (err) {
            return res.status(500).json({ success:false, message: 'Failed to fetch category.', error: err });
        }
        if (category.length === 0) {
            return res.status(404).json({ success:false, message: 'Category not found.' });
        }
        const categoryWithUrl = category[0];
        categoryWithUrl.image = getImageUrl(categoryWithUrl.image);
        res.status(200).json({
            success:true,
            categoryWithUrl});
    });
};

exports.updateCategory = (req, res) => {
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success:false, message: 'File size exceeds the 2MB limit.' });
            }
            return res.status(500).json({ success:false, message: 'File upload error.', error: err });
        } else if (err) {
            return res.status(400).json({ success:false, message: err.message });
        }

        const categoryId = req.params.id;
        const { name, description } = req.body;
        const image = req.file ? req.file.filename : null;

        if (!name && !image && !description) {
            return res.status(400).json({ success:false, message: 'At least one field (name, image, or description) is required to update.' });
        }

        let sql = 'UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        let values = [categoryId];

        if (name) {
            sql = 'UPDATE categories SET name = ?, slug = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            const slug = generateSlug(name);
            values = [name, slug, categoryId];
        }

        if (description) {
            if (name) {
                sql = 'UPDATE categories SET name = ?, slug = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                const slug = generateSlug(name);
                values = [name, slug, description, categoryId];
            } else {
                sql = 'UPDATE categories SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                values = [description, categoryId];
            }
        }

        if (image) {
            if (name && description) {
                sql = 'UPDATE categories SET name = ?, slug = ?, description = ?, image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                const slug = generateSlug(name);
                values = [name, slug, description, image, categoryId];
            } else if (name) {
                 sql = 'UPDATE categories SET name = ?, slug = ?, image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                 const slug = generateSlug(name);
                 values = [name, slug, image, categoryId];
            } else if (description) {
                 sql = 'UPDATE categories SET description = ?, image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                 values = [description, image, categoryId];
            } else {
                 sql = 'UPDATE categories SET image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                 values = [image, categoryId];
            }
        }

        db.query(sql, values, (dbErr, result) => {
            if (dbErr) {
                if (dbErr.code === 'ER_DUP_ENTRY' && name) {
                    return res.status(409).json({ success:false, message: 'Category name already exists, please choose a different name.', error: dbErr });
                }
                return res.status(500).json({ success:false, message: 'Failed to update category.', error: dbErr });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success:false, message: 'Category not found.' });
            }
            const fetchSql = 'SELECT id, name, image, slug, description FROM categories WHERE id = ?';
            db.query(fetchSql, [categoryId], (fetchErr, updatedCategoryResult) => {
                if (fetchErr) {
                    return res.status(500).json({ success:false, message: 'Category updated, but failed to fetch details.', error: fetchErr });
                }
                const category = updatedCategoryResult[0];
                category.image = getImageUrl(category.image);
                res.status(200).json({
                    success:true, message: 'Category updated successfully.',
                    category: category
                });
            });
        });
    });
};

exports.deleteCategory = (req, res) => {
    const categoryId = req.params.id;
    const sql = 'DELETE FROM categories WHERE id = ?';
    db.query(sql, [categoryId], (err, result) => {
        if (err) {
            return res.status(500).json({ success:false, message: 'Failed to delete category.', error: err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success:false, message: 'Category not found.' });
        }
        res.status(200).json({ success:true, message: 'Category deleted successfully.' });
    });
};
