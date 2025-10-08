const db = require('../models/db');

const getImageUrl = (imageName) => {
    const port = process.env.PORT || 3000; // Use environment variable or default port
    return `https://naaz-aquarium-skdm.onrender.com/uploads/product_images/${imageName}`;
};

exports.getBanners = (req, res) => {
    
    const sql = 'SELECT * FROM banners';
    db.query(sql,  (err, banner) => {
        if (err) {
            return res.status(500).json({ success:false, message: 'Failed to fetch banner.', error: err });
        }
        if (banner.length === 0) {
            return res.status(404).json({ success:false, message: 'banner not found.' });
        }
        const bannersWithUrl = banner.map(banner => ({
            ...banner,
            image: getImageUrl(banner.image_url)
        }));

        // 2. Group the banners by their 'type'
        const categorizedBanners = bannersWithUrl.reduce((acc, banner) => {
            const type = banner.type || 'other'; // Use 'other' or a default if 'type' is missing
            
            // Initialize the array for the type if it doesn't exist
            if (!acc[type]) {
                acc[type] = [];
            }
            
            // Add the banner to the appropriate type array
            acc[type].push(banner);
            
            return acc;
        }, {}); // Start with an empty object {}

        // 3. Send the categorized JSON response
        res.status(200).json({
            success: true,
            data: categorizedBanners // Use 'data' instead of 'bannerWithUrl' to reflect the structure
        });

        });
};

exports.createBanner = (req,res)=>{
    const {name , is_active , link='' , type = '' , description=''} = req.body
    const image = req.files ? req.files[0]?.filename : null;
    if (!name || !is_active) {
        res.status(400).json({
            success:false,
            message:"Name and Active Status are required"
        })
    }
    try {
        const sql = 'INSERT INTO banners (name , image_url , is_active , link , type ,description ) VALUES (? ,? ,? , ? ,? ,?)'
        db.query(sql,[name , image , is_active , link ,type,description],(err,results)=>{
            if (err) {
            return res.status(500).json({ success: false, message: 'Failed to create Banner.', error: err });
        }
        res.status(201).json({
                    success:true, message: 'Banner created successfully.',
                    
                });
        })
    } catch (error) {
        res.status(500).json({
            success:false,
            message:"Some error Occured . Please try again later"
        })
    }
}

exports.deleteBanner = (req, res) => {
    const bannerId = req.params.bannerId;
    const sql = 'DELETE FROM banners WHERE id = ?';
    db.query(sql, [bannerId], (err, result) => {
        if (err) {
            return res.status(500).json({ success:false, message: 'Failed to delete Banner.', error: err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success:false, message: 'Banner not found.' });
        }
        res.status(200).json({ success:true, message: 'Banner deleted successfully.' });
    });
};

exports.updateBanner = async (req, res) => {
    const { bannerId } = req.params;
    const data = req.body; // Contains name, image_url, or is_active
    const image = req.files ? req.files[0]?.filename : null;
    // Validation
    if (isNaN(parseInt(bannerId))) {
        return res.status(400).json({ error: 'Invalid banner ID provided.' });
    }
    if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'No update fields provided.' });
    }
    
    try {
        let updates = [];
        let values = [];
        
        // Build query dynamically based on fields present in the request body
        if (data.name !== undefined) {
            updates.push('name = ?');
            values.push(data.name);
        }
        if (image !== undefined) {
            updates.push('image_url = ?');
            values.push(image);
        }
        // is_active is often a boolean (1 or 0 in MySQL)
        if (data.is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(data.is_active);
        }

        if (data.link) {
            updates.push('link = ?');
            values.push(data.link);
        }
        if (data.type) {
            updates.push('type = ?');
            values.push(data.type);
        }
        if (data.description) {
            updates.push('description = ?');
            values.push(data.description);
        }

        if (updates.length === 0) {
             return res.status(400).json({ error: 'No valid fields provided for update.' });
        }

        values.push(bannerId); // ID for the WHERE clause
        
        const sql = `UPDATE banners SET ${updates.join(', ')} WHERE id = ?`;
        const result = await db.query(sql, values);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Banner not found or no changes were made.' });
        }
        
        res.json({success:true , message: 'Banner updated successfully.' });
    } catch (err) {
        console.error('Error updating banner:', err);
        res.status(500).json({ error: 'Failed to update banner due to server error.' });
    }
}