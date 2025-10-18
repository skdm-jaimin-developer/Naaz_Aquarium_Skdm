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



--second alter

ALTER TABLE products
MODIFY COLUMN tax DECIMAL(6, 2) DEFAULT 0.00,
MODIFY COLUMN shipping DECIMAL(6, 2) DEFAULT 0.00;

UPDATE products
SET
    tax = 0.00,
    shipping = 0.00
WHERE
    tax IS NULL OR shipping IS NULL;


    ALTER TABLE orders
MODIFY COLUMN delivery_status VARCHAR(30) NULL DEFAULT pending;


--third alter 

ALTER TABLE `users` 
ADD COLUMN `google_id` VARCHAR(255) UNIQUE AFTER `id`;

ALTER TABLE `users` 
MODIFY COLUMN `mobile` VARCHAR(20) NULL;

ALTER TABLE `users` 
MODIFY COLUMN `password` VARCHAR(255) NULL;