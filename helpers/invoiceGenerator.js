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
        const PRIMARY_COLOR = '#32307B'; 
        const SECONDARY_COLOR = '#495057'; 
        const BORDER_COLOR = '#E9ECEF'; 

        const FONT_NORMAL = 'Helvetica';
        const FONT_BOLD = 'Helvetica-Bold';
        const FONT_ITALIC = 'Helvetica-Oblique';
        
        const PADDING_X = 50;
        const CONTENT_WIDTH = doc.page.width - 2 * PADDING_X;
        const startX = PADDING_X;
        
        const STORE_IMAGE_PATH = path.join(__dirname, '..', 'assets', '2.png');
        const STORE_IMAGE_PATH_FOOTER = path.join(__dirname, '..', 'assets', '3.png');

        const fileName = `invoice_${order.unique_order_id}.pdf`;
        const filePath = path.join(__dirname, '..', 'invoices', fileName);
        const stream = fs.createWriteStream(filePath);

        doc.pipe(stream);

        // Helper function for drawing a line
        const drawHorizontalLine = (y, color = BORDER_COLOR) => {
            doc.strokeColor(color).lineWidth(1).moveTo(startX, y).lineTo(startX + CONTENT_WIDTH, y).stroke();
        };

        // --- Header Section ---
        
        const imageStartY = 50;
        try {
            doc.image(STORE_IMAGE_PATH, startX, imageStartY, {
                fit: [CONTENT_WIDTH, 10000],
                align: 'center',
                valign: 'top'
            });
        } catch (error) {
            console.error('Error adding image:', error.message);
        }

        const titleY = (doc.y > imageStartY) ? doc.y + 10 : imageStartY + 100;

        doc.fillColor(SECONDARY_COLOR).font(FONT_NORMAL).fontSize(10);
        doc.text(`Invoice No: ${order.unique_order_id}`, startX, titleY + 35, { align: 'right' });
        doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, startX, titleY + 50, { align: 'right' });

        const nextContentY = Math.max(doc.y, titleY + 65);

        // --- FIX: Use a more reliable way to move Y ---
        doc.y = nextContentY; 
        drawHorizontalLine(doc.y);

        // --- Customer and Billing Details ---
        doc.moveDown(1);
        const customerDetailsY = doc.y;

        doc.font(FONT_BOLD).fontSize(10).fillColor(PRIMARY_COLOR).text('BILL TO:', startX, customerDetailsY);
        doc.font(FONT_NORMAL).fontSize(10).fillColor(SECONDARY_COLOR);
        doc.text(`${user.name}`, startX, customerDetailsY + 15);
        doc.text(`${user.email}`, startX, customerDetailsY + 30);
        doc.text(`${user.phone || ''}`, startX, customerDetailsY + 45);

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
        
        // --- FIX: Use a more reliable way to move Y ---
        // Set doc.y to be the max height of either column
        const billToHeight = customerDetailsY + 60; // 45 (last item) + 15 padding
        const shipToHeight = doc.y; // doc.y was updated by the last text() call
        doc.y = Math.max(billToHeight, shipToHeight) + 15;


        // --- Product Table ---
        const tableTop = doc.y;
        
        const itemWidth = 210;
        const qtyWidth = 40;
        const priceWidth = 85;
        const discountWidth = 85;
        const totalWidth = 80; 

        const cols = {
            item: startX,
            qty: startX + itemWidth,
            price: startX + itemWidth + qtyWidth,
            discount: startX + itemWidth + qtyWidth + priceWidth,
            total: startX + itemWidth + qtyWidth + priceWidth + discountWidth
        };
        
        // --- NEW: Helper function to draw the table header ---
        const drawTableHeader = (y) => {
            doc.rect(startX, y, CONTENT_WIDTH, 25).fill(PRIMARY_COLOR);
            doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(10)
               .text('Item', cols.item + 5, y + 8, { width: itemWidth - 10 })
               .text('Qty', cols.qty, y + 8, { width: qtyWidth, align: 'left' })
               .text('Unit Price', cols.price, y + 8, { width: priceWidth, align: 'left' })
               .text('Discount', cols.discount, y + 8, { width: discountWidth, align: 'left' }) 
               .text('Line Total', cols.total, y + 8, { width: totalWidth - 5, align: 'right' });
            // Return the Y position *after* the header
            return y + 35; 
        };

        // --- NEW: Draw the first header ---
        let currentY = drawTableHeader(tableTop);
        
        doc.font(FONT_NORMAL).fontSize(9).fillColor(SECONDARY_COLOR);

        // --- NEW: Define page bottom margin ---
        // We leave space for the footer (100) and totals (approx 160)
        const pageBreakY = doc.page.height - doc.page.margins.bottom - 260; 
        const minRowHeight = 25;

        // Product rows
        products.forEach(p => {
            const lineTotal = (p.price * p.quantity) - (p.discount || 0);
            
            // --- NEW: Estimate row height *before* drawing ---
            const itemName = `${p.name}`;
            const itemHeightEstimate = doc.font(FONT_NORMAL).fontSize(9).heightOfString(itemName, { 
                width: itemWidth - 10, 
                lineBreak: true 
            });
            const sizeHeightEstimate = doc.font(FONT_ITALIC).fontSize(8).heightOfString(`(${p.size_name})`);
            // Estimate height based on item/size, but use minRowHeight as a floor
            const estimatedRowHeight = Math.max(itemHeightEstimate + sizeHeightEstimate, minRowHeight) + 10; // +10 padding

            // --- NEW: Page Break Check ---
            if (currentY + estimatedRowHeight > pageBreakY) {
                doc.addPage();
                
                // Redraw header at the top of the new page
                const newTableTop = doc.page.margins.top;
                currentY = drawTableHeader(newTableTop);
                
                // Reset font/color for the new page's rows
                doc.font(FONT_NORMAL).fontSize(9).fillColor(SECONDARY_COLOR);
            }
            
            const rowStartY = currentY;

            // Draw the other columns
            doc.font(FONT_NORMAL).fontSize(9)
               .text(p.quantity, cols.qty, rowStartY, { width: qtyWidth, align: 'left' })
               .text(`Rs. ${p.price.toFixed(2)}`, cols.price, rowStartY, { width: priceWidth, align: 'left' })
               .text(`Rs. ${(p.discount || 0).toFixed(2)}`, cols.discount, rowStartY, { width: discountWidth, align: 'left' })
               .text(`Rs. ${lineTotal.toFixed(2)}`, cols.total, rowStartY, { width: totalWidth - 5, align: 'right' });

            // Draw the (potentially multi-line) item name
            doc.font(FONT_NORMAL).fontSize(9);
            doc.text(itemName, cols.item + 5, rowStartY, { 
                width: itemWidth - 10, 
                lineBreak: true 
            });
            
            // Draw the variant name
            doc.font(FONT_ITALIC).fontSize(8).text(`(${p.size_name})`, cols.item + 5, doc.y);

            // Calculate the actual height
            const actualItemHeight = doc.y - rowStartY;
            const rowHeight = Math.max(actualItemHeight, minRowHeight);

            // Advance currentY for the next row
            currentY += rowHeight + 10; // Add 10 points of padding
        });
        
        // Ensure we are below the last item
        currentY = Math.max(currentY, doc.y + 10);

        // --- NEW: Check if Totals section will fit ---
        const totalsHeight = 160; // 6 lines * 18 + 25 box + padding
        const footerLineY = doc.page.height - 100; // Absolute Y of footer line

        if (currentY + totalsHeight > footerLineY) {
            doc.addPage();
            currentY = doc.page.margins.top; // Start at top of new page
        }
        
        drawHorizontalLine(currentY); 

        // --- Totals Section (Right Aligned) ---
        const totalsY = currentY + 20;
        
        const totalLabelWidth = 120;
        const totalValueWidth = 150;
        const totalValueX = startX + CONTENT_WIDTH - totalValueWidth;
        const totalLabelX = totalValueX - totalLabelWidth;

        let runningY = totalsY;

        const totalStyles = (label, value, isBold = false, color = SECONDARY_COLOR, size = 10) => {
            doc.fillColor(color).font(isBold ? FONT_BOLD : FONT_NORMAL).fontSize(size);
            doc.text(label, totalLabelX, runningY, { 
                width: totalLabelWidth, 
                align: 'left' 
            });
            doc.text(`Rs. ${value.toFixed(2)}`, totalValueX, runningY, { 
                width: totalValueWidth, 
                align: 'right' 
            });
            runningY += 18; 
        };
        
        const subtotal = order.subtotal || products.reduce((sum, p) => sum + (p.price * p.quantity), 0);
        const totalDiscount = order.discount || 0; 
        const shipping = order.shipping || 0;
        const tax = order.tax || 0;
        
        const netTotal = subtotal - totalDiscount;
        const grandTotal = netTotal + shipping + tax;
        
        totalStyles('Subtotal:', subtotal);
        totalStyles('Discount:', -totalDiscount, false, '#dc3545'); 
        totalStyles('Net Total:', netTotal, true, SECONDARY_COLOR, 10);
        totalStyles('Shipping:', shipping);
        totalStyles('Tax:', tax);
        
        const grandTotalBoxX = totalLabelX - 5; 
        const grandTotalBoxWidth = totalLabelWidth + totalValueWidth + 10; 

        doc.rect(grandTotalBoxX, runningY + 5, grandTotalBoxWidth, 25).fill(PRIMARY_COLOR);
        doc.fillColor('#FFFFFF').font(FONT_BOLD).fontSize(14)
           .text('GRAND TOTAL:', totalLabelX, runningY + 12, {
               width: totalLabelWidth,
               align: 'left'
           })
           .text(`Rs. ${grandTotal.toFixed(2)}`, totalValueX, runningY + 12, { 
               width: totalValueWidth, 
               align: 'right' 
           });

        runningY += 40;

        // --- Footer ---
        // This draws at the bottom of the *current* page (which is now the last page)
        const footerLineYa = doc.page.height - doc.page.margins.bottom - 80; 
        drawHorizontalLine(footerLineYa);
        const footerY = footerLineYa + 10;

        try {
            
            doc.image(STORE_IMAGE_PATH_FOOTER, startX, footerY, {
                fit: [CONTENT_WIDTH, 10000],
                align: 'center',
                valign: 'top'
            });
        } catch (error) {
            // 🚩 IMPORTANT: Check your terminal for this error! 
            // If the path is wrong or the image file is corrupted, the footer won't show.
            console.log('Error adding footer image:', error.message);
        }

        doc.end();

        stream.on('finish', () => resolve(filePath));
        stream.on('error', reject);
    });
};


module.exports = { generatePdfAndSave };
