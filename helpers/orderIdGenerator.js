const generateUniqueOrderId = () => {
    // Get current timestamp in milliseconds and convert to base-36 string
    const timestamp = Date.now().toString(36);
    
    // Generate a random string using Math.random()
    const randomString = Math.random().toString(36).substring(2, 8); 
    
    // Combine the timestamp and random string
    return `${timestamp}-${randomString}`.toUpperCase();
};

module.exports = { generateUniqueOrderId };
