ALTER TABLE orders
ADD COLUMN shipping DECIMAL(10, 2),
ADD COLUMN discount DECIMAL(10, 2),
ADD COLUMN grand_total DECIMAL(10, 2);


ALTER TABLE order_products
ADD COLUMN discount DECIMAL(10, 2) DEFAULT 0;

select * from sizes ;
ALTER TABLE sizes
ADD COLUMN length DECIMAL(10, 2),
ADD COLUMN width DECIMAL(10, 2),
ADD COLUMN height DECIMAL(10, 2),
ADD COLUMN weight DECIMAL(10, 2);