const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Import the database connection
const db = require('./models/db');

// Import all route files
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const addressRoutes = require('./routes/addressRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const coupounRoutes = require('./routes/coupounRoutes');
const activityRoutes = require('./routes/activityRoutes');


const ensureDirectoryExists = (directoryPath) => {
    try {
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });
            console.log(`Directory created at: ${directoryPath}`);
        } else {
            console.log(`Directory already exists at: ${directoryPath}`);
        }
    } catch (err) {
        console.error('Error creating directory:', err);
    }
};


const ensureFileAndDirectoryExists = (filePath, content) => {
    const directoryPath = path.dirname(filePath);
    
    ensureDirectoryExists(directoryPath);

    try {
        // Now that the directory is guaranteed to exist, write the file
        fs.writeFileSync(filePath, content);
        console.log(`File created/updated at: ${filePath}`);
    } catch (err) {
        console.error('Error creating file:', err);
    }
};

// --- Example Usage ---

// Define the paths for the new folders
const uploadsDir = path.join(__dirname, 'uploads');
const invoicesDir = path.join(__dirname, 'invoices');
const category_imagesDir = path.join(uploadsDir, 'category_images');
const product_imagesDir = path.join(uploadsDir, 'product_images');

// Create the top-level folders
ensureDirectoryExists(uploadsDir);
ensureDirectoryExists(invoicesDir);

// Create the nested image folders
ensureDirectoryExists(category_imagesDir);
ensureDirectoryExists(product_imagesDir);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads/category_images', express.static(path.join(__dirname, 'uploads', 'category_images')));
app.use('/uploads/product_images', express.static(path.join(__dirname, 'uploads', 'product_images')));
app.use('/invoices', express.static(path.join(__dirname, 'invoices')));

// Use the imported route files
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
// app.use('/api/images', imageRoutes);
// app.use('/api/sizes', sizeRoutes);
// app.use('/api/reviews', reviewRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/coupouns', coupounRoutes);
app.use('/api/activity', activityRoutes);

// Simple welcome route to confirm the server is running
app.get('/', (req, res) => {
    res.status(200).send('API is running.');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
