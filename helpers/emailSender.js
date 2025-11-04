// helpers/emailSender.js
const nodemailer = require('nodemailer');
const fs = require('fs');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendInvoiceEmail = (toEmail, subject, htmlContent, attachmentPath) => {
    const mailOptions = {
        from: {
        name: "Naaz Aquarium", // The name you want to display
        address: process.env.EMAIL_USER // The actual email address
    },
        to: toEmail,
        subject: subject,
        html: htmlContent,
        attachments: [
            {
                filename: 'invoice.pdf',
                path: attachmentPath,
                contentType: 'application/pdf'
            }
        ]
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Email send error:", error);
                reject(error);
            } else {
                console.log("Email sent:", info.response);
                // Clean up the generated PDF file after sending
                // fs.unlink(attachmentPath, (unlinkErr) => {
                //     if (unlinkErr) console.error("Failed to delete PDF file:", unlinkErr);
                // });
                resolve(info);
            }
        });
    });
};

module.exports = { sendInvoiceEmail };