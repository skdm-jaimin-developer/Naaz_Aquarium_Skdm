const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');


const generatePdfAndSave = async (order, products, user, address) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, right: 50, bottom: 50, left: 50 }
        });
        const fileName = `invoice_${order.unique_order_id}.pdf`;
        const filePath = path.join(__dirname, '..', 'invoices', fileName);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // --- Header Section ---
        doc.fillColor('#333333');
        doc.font('Helvetica-Bold').fontSize(24).text('INVOICE', 50, 50, { align: 'right' });
        doc.font('Helvetica').fontSize(10).text(`Invoice No: ${order.unique_order_id}`, 50, 80, { align: 'right' });
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 95, { align: 'right' });

        doc.fillColor('#5D5D5D').fontSize(14).font('Helvetica-Bold').text('Your Store Name', 50, 50);
        doc.font('Helvetica').fontSize(10).text('contact@yourstore.com', 50, 65);
        doc.text('123 Main Street', 50, 80);
        doc.text('Cityville, State, 12345', 50, 95);

        doc.moveDown(4);
        doc.strokeColor('#EEEEEE').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();

        // --- Customer and Billing Details ---
        doc.moveDown(1.5);
        const customerDetailsY = doc.y;

        doc.font('Helvetica-Bold').fontSize(12).text('BILL TO:', 50, customerDetailsY);
        doc.font('Helvetica').fontSize(10);
        doc.text(`${user.name}`, 50, customerDetailsY + 15);
        doc.text(`${address.address1}`, 50, customerDetailsY + 30);
        if (address.address2) {
            doc.text(`${address.address2}`, 50, customerDetailsY + 45);
        }
        doc.text(`${address.city}, ${address.state} ${address.pincode}`, 50, customerDetailsY + 60);
        if (address.landmark) {
            doc.text(`Landmark: ${address.landmark}`, 50, customerDetailsY + 75);
        }

        doc.moveDown(4);

        // --- Product Table ---
        const tableTop = doc.y;
        const startX = 50;

        // Table Header with light gray background
        doc.rect(startX, tableTop - 5, 500, 20).fill('#F5F5F5');
        doc.fillColor('#333333').font('Helvetica-Bold').fontSize(10)
            .text('Item', startX + 5, tableTop)
            .text('Quantity', startX + 245, tableTop)
            .text('Unit Price', startX + 325, tableTop)
            .text('Total', startX + 415, tableTop, { align: 'right' });

        let currentY = tableTop + 25;
        doc.font('Helvetica');

        // Product rows
        products.forEach(p => {
            doc.fillColor('#666666').fontSize(10);
            doc.text(`${p.name} (${p.size_name})`, startX + 5, currentY);
            doc.text(p.quantity, startX + 245, currentY);
            doc.text(`Rs. ${p.price.toFixed(2)}`, startX + 325, currentY);
            doc.text(`Rs. ${(p.price * p.quantity).toFixed(2)}`, startX + 415, currentY, { align: 'right' });
            currentY += 20;
        });

        // --- Totals Section ---
        const totalsY = currentY + 30;
        doc.strokeColor('#EEEEEE').lineWidth(1).moveTo(startX, totalsY - 10).lineTo(550, totalsY - 10).stroke();

        doc.fillColor('#333333').font('Helvetica').fontSize(10)
            .text('Subtotal:', startX + 325, totalsY)
            .text(`Rs. ${order.subtotal.toFixed(2)}`, startX + 415, totalsY, { align: 'right' });

        doc.text('Tax :', startX + 325, totalsY + 15)
            .text(`Rs. ${order.tax.toFixed(2)}`, startX + 415, totalsY + 15, { align: 'right' });

        doc.rect(startX + 320, totalsY + 30, 180, 25).fill('#F5F5F5');
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12)
            .text('TOTAL:', startX + 325, totalsY + 35)
            .text(`Rs. ${order.total.toFixed(2)}`, startX + 415, totalsY + 35, { align: 'right' });

        // --- Footer ---
        // const footerY = doc.page.height - 50;
        // doc.fillColor('#AAAAAA').fontSize(8).font('Helvetica-Oblique').text('Thank you for your business!', 50, footerY, { align: 'center' });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
};



module.exports = { generatePdfAndSave };
