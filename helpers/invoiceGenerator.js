const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');


const generatePdfAndSave = async (order, products, user, address) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, right: 50, bottom: 50, left: 50 }
        });

        // --- Configuration ---
        const PRIMARY_COLOR = '#007bff'; 
        const SECONDARY_COLOR = '#495057'; 
        const BORDER_COLOR = '#E9ECEF'; 

        const FONT_NORMAL = 'Helvetica';
        const FONT_BOLD = 'Helvetica-Bold';
        const FONT_ITALIC = 'Helvetica-Oblique';
        
        const PADDING_X = 50;
        const CONTENT_WIDTH = 500;
        const startX = PADDING_X;

        const fileName = `invoice_${order.unique_order_id}.pdf`;
        const filePath = path.join(__dirname, '..', 'invoices', fileName);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Helper function for drawing a line
        const drawHorizontalLine = (y, color = BORDER_COLOR) => {
            doc.strokeColor(color).lineWidth(1).moveTo(startX, y).lineTo(startX + CONTENT_WIDTH, y).stroke();
        };

        // --- Header Section ---
        
        // Store Info
        doc.fillColor(PRIMARY_COLOR).font(FONT_BOLD).fontSize(16).text('E-COMMERCE STORE', startX, 50);
        doc.fillColor(SECONDARY_COLOR).font(FONT_NORMAL).fontSize(9);
        doc.text('123 Modern Avenue, Suite 400', startX, 70);
        doc.text('Cityville, State, 12345 | contact@store.com', startX, 85);

        // Invoice Heading
        doc.fillColor(PRIMARY_COLOR).font(FONT_BOLD).fontSize(28).text('INVOICE', startX, 50, { align: 'right' });
        doc.fillColor(SECONDARY_COLOR).font(FONT_NORMAL).fontSize(10);
        doc.text(`Invoice No: ${order.unique_order_id}`, startX, 85, { align: 'right' });
        doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, startX, 100, { align: 'right' });

        doc.moveDown(4.5);
        drawHorizontalLine(doc.y);

        // --- Customer and Billing Details ---
        doc.moveDown(1);
        const customerDetailsY = doc.y;

        // BILL TO Column
        doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY_COLOR).text('BILL TO:', startX, customerDetailsY);
        doc.font(FONT_NORMAL).fontSize(10).fillColor(SECONDARY_COLOR);
        doc.text(`${user.name}`, startX, customerDetailsY + 15);
        doc.text(`${user.email}`, startX, customerDetailsY + 30);
        doc.text(`${user.phone || ''}`, startX, customerDetailsY + 45);


        // SHIP TO Column (Offset by half the width)
        const shipToX = startX + CONTENT_WIDTH / 2;
        doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY_COLOR).text('SHIP TO:', shipToX, customerDetailsY);
        doc.font(FONT_NORMAL).fontSize(10).fillColor(SECONDARY_COLOR);
        doc.text(`${address.address1}`, shipToX, customerDetailsY + 15);
        if (address.address2) {
            doc.text(`${address.address2}`, shipToX, customerDetailsY + 30);
            doc.text(`${address.city}, ${address.state} ${address.pincode}`, shipToX, customerDetailsY + 45);
        } else {
            doc.text(`${address.city}, ${address.state} ${address.pincode}`, shipToX, customerDetailsY + 30);
        }

        doc.moveDown(5); 

        // --- Product Table ---
        const tableTop = doc.y;
        
        // --- Adjusted Column Positions for More Item Space ---
        // Item column width is now ~200 points.
        const cols = {
            item: startX,
            qty: startX + 220,         // Start Qty at 220
            price: startX + 280,       // Start Price at 280
            discount: startX + 370,    // Start Discount at 370
            total: startX + 460        // Start Line Total at 460
        };
        const PRICE_COL_WIDTH = 80; // Width for price/total columns

        // Table Header 
        doc.rect(startX, tableTop, CONTENT_WIDTH, 25).fill(PRIMARY_COLOR);
        doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(10)
            .text('Item', cols.item + 5, tableTop + 8)
            .text('Qty', cols.qty, tableTop + 8)
            .text('Unit Price', cols.price, tableTop + 8)
            .text('Discount', cols.discount, tableTop + 8) 
            .text('Line Total', cols.total, tableTop + 8, { align: 'right', width: PRICE_COL_WIDTH }); // Use width for right-aligned text

        let currentY = tableTop + 35;
        doc.font(FONT_NORMAL).fontSize(9).fillColor(SECONDARY_COLOR);

        // Product rows
        products.forEach(p => {
            const lineTotal = (p.price * p.quantity) - (p.discount || 0);
            
            // Item Name (Use a width limit for wrapping/clipping)
            doc.font(FONT_NORMAL).fontSize(9);
            const itemName = `${p.name}`;
            const sizeName = `(${p.size_name})`;

            // Print item name, allowing it to take two lines if necessary (width: 200)
            doc.text(itemName, cols.item + 5, currentY, { width: 200, lineBreak: true });
            
            // Determine the Y position for the next elements
            let nextElementY = doc.y; // The Y position after the item name finished printing

            // Print variant name
            doc.font(FONT_ITALIC).fontSize(8).text(sizeName, cols.item + 5, nextElementY);
            
            // Reset Y position for all fixed-position columns
            // Use the starting Y of the row (currentY)
            doc.font(FONT_NORMAL).fontSize(9)
                .text(p.quantity, cols.qty, currentY)
                .text(`Rs. ${p.price.toFixed(2)}`, cols.price, currentY, { width: PRICE_COL_WIDTH, align: 'left' })
                .text(`Rs. ${(p.discount || 0).toFixed(2)}`, cols.discount, currentY, { width: PRICE_COL_WIDTH, align: 'left' })
                .text(`Rs. ${lineTotal.toFixed(2)}`, cols.total, currentY, { width: PRICE_COL_WIDTH, align: 'right' });
            
            // Advance Y position based on the tallest item (Item name/variant)
            // Use Math.max to ensure enough vertical space for the potentially long item name
            const spaceNeeded = (doc.y - currentY) > 20 ? (doc.y - currentY) : 30;
            currentY += spaceNeeded + 5; 
        });
        
        doc.moveDown(1);
        drawHorizontalLine(currentY); 

        // --- Totals Section (Right Aligned) ---
        const totalsY = currentY + 20;
        
        // Adjusted X positions for Totals to prevent overlap
        const totalColX = startX + 300; // Label column starts further right
        const valueColX = startX + 410; // Value column starts further right
        const TOTALS_COL_WIDTH = 140; // Total width for value column

        let runningY = totalsY;

        const totalStyles = (label, value, isBold = false, color = SECONDARY_COLOR, size = 10) => {
            doc.fillColor(color).font(isBold ? FONT_BOLD : FONT_NORMAL).fontSize(size);
            // Label is left-aligned in its column
            doc.text(label, totalColX, runningY, { width: 100, align: 'left' });
            // Value is right-aligned in its column
            doc.text(`Rs. ${value.toFixed(2)}`, valueColX, runningY, { width: TOTALS_COL_WIDTH - 10, align: 'right' });
            runningY += 18; // Increased spacing for totals
        };
        
        // Calculate the actual values (using provided order structure)
        const subtotal = order.subtotal || products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        const totalDiscount = order.discount || 0; 
        const shipping = order.shipping || 0;
        const tax = order.tax || 0;
        
        // Calculations
        const netTotal = subtotal - totalDiscount;
        const grandTotal = netTotal + shipping + tax;
        
        // Totals Breakdown
        totalStyles('Subtotal:', subtotal);
        totalStyles('Discount:', -totalDiscount, false, '#dc3545'); 
        totalStyles('Net Total:', netTotal, true, SECONDARY_COLOR, 10);
        totalStyles('Shipping:', shipping);
        totalStyles('Tax:', tax);
        
        // Grand Total Box
        const grandTotalBoxX = totalColX - 5;
        const grandTotalBoxWidth = CONTENT_WIDTH - grandTotalBoxX + startX;

        doc.rect(grandTotalBoxX, runningY + 5, grandTotalBoxWidth, 25).fill(PRIMARY_COLOR);
        doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(14)
            .text('GRAND TOTAL:', totalColX, runningY + 12)
            .text(`Rs. ${grandTotal.toFixed(2)}`, valueColX, runningY + 12, { width: TOTALS_COL_WIDTH - 10, align: 'right' });

        runningY += 40; 

        // --- Payment Status & Footer ---
        drawHorizontalLine(doc.page.height - 100);
        const footerY = doc.page.height - 90;

        doc.fillColor(SECONDARY_COLOR).font(FONT_BOLD).fontSize(10);
        doc.text('PAYMENT STATUS:', startX, footerY);
        
        const statusText = order.payment_status?.toUpperCase() || 'PENDING';
        const statusColor = statusText === 'PAID' ? '#28a745' : '#ffc107'; 
        
        doc.rect(startX + 100, footerY - 2, 70, 15).fill(statusColor);
        doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(10).text(statusText, startX + 105, footerY + 1);

        doc.fillColor('#AAAAAA').fontSize(8).font(FONT_ITALIC).text('Thank you for your order! All prices are in INR (₹).', startX, footerY + 25, { align: 'center', width: CONTENT_WIDTH });

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
};



module.exports = { generatePdfAndSave };
