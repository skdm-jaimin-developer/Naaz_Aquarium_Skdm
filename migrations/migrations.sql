CREATE DATABASE IF NOT EXISTS `naaz_aquarium`;
USE `naaz_aquarium`;

-- -----------------------------------------------------
-- Table `users`
-- -----------------------------------------------------
-- This table stores all user information for authentication and authorization.
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `mobile` VARCHAR(20) NOT NULL UNIQUE,
  `role` VARCHAR(50) DEFAULT 'user',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `addresses`
-- -----------------------------------------------------
-- Stores shipping and billing addresses for users.
CREATE TABLE IF NOT EXISTS `addresses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `address1` VARCHAR(255) NOT NULL,
  `address2` VARCHAR(255),
  `landmark` VARCHAR(255),
  `city` VARCHAR(100) NOT NULL,
  `state` VARCHAR(100) NOT NULL,
  `pincode` VARCHAR(10) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `fk_addresses_users_idx` (`user_id` ASC) VISIBLE,
  CONSTRAINT `fk_addresses_users`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE CASCADE
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `categories`
-- -----------------------------------------------------
-- Stores product categories.
CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `image` VARCHAR(255),
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `products`
-- -----------------------------------------------------
-- Main table for product details.
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `category_id` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `fk_products_categories_idx` (`category_id` ASC) VISIBLE,
  CONSTRAINT `fk_products_categories`
    FOREIGN KEY (`category_id`)
    REFERENCES `categories` (`id`)
    ON DELETE RESTRICT
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `product_images`
-- -----------------------------------------------------
-- Stores multiple images for a single product.
CREATE TABLE IF NOT EXISTS `product_images` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `url` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `fk_images_products_idx` (`product_id` ASC) VISIBLE,
  CONSTRAINT `fk_images_products`
    FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`)
    ON DELETE CASCADE
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `product_sizes`
-- -----------------------------------------------------
-- Manages different sizes, prices, and stock for a product.
CREATE TABLE IF NOT EXISTS `product_sizes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `name` VARCHAR(50) NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  `discount_price` DECIMAL(10, 2),
  `stock` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `fk_sizes_products_idx` (`product_id` ASC) VISIBLE,
  CONSTRAINT `fk_sizes_products`
    FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`)
    ON DELETE CASCADE
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `reviews`
-- -----------------------------------------------------
-- Stores customer reviews for products.
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `review` TEXT NOT NULL,
  `rating` INT CHECK (rating >= 1 AND rating <= 5),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `fk_reviews_users_idx` (`user_id` ASC) VISIBLE,
  INDEX `fk_reviews_products_idx` (`product_id` ASC) VISIBLE,
  CONSTRAINT `fk_reviews_users`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_reviews_products`
    FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`)
    ON DELETE CASCADE
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `orders`
-- -----------------------------------------------------
-- Stores the main order information.
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unique_order_id` VARCHAR(255) NOT NULL UNIQUE,
  `user_id` INT NOT NULL,
  `address_id` INT NOT NULL,
  `status` VARCHAR(50) DEFAULT 'Pending',
  `payment_status` VARCHAR(50) DEFAULT 'Pending',
  `delivery_status` VARCHAR(50) DEFAULT 'Pending',
  `payment_mode` VARCHAR(50) NOT NULL,
  `subtotal` DECIMAL(10, 2) NOT NULL,
  `tax` DECIMAL(10, 2) NOT NULL,
  `total` DECIMAL(10, 2) NOT NULL,
  `transaction_id` VARCHAR(255),
  `invoice_link` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `fk_orders_users_idx` (`user_id` ASC) VISIBLE,
  INDEX `fk_orders_addresses_idx` (`address_id` ASC) VISIBLE,
  CONSTRAINT `fk_orders_users`
    FOREIGN KEY (`user_id`)
    REFERENCES `users` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_orders_addresses`
    FOREIGN KEY (`address_id`)
    REFERENCES `addresses` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `order_products`
-- -----------------------------------------------------
-- Junction table for the many-to-many relationship between orders and products.
-- Stores the quantity and price of each product at the time of purchase.
CREATE TABLE IF NOT EXISTS `order_products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `product_id` INT NOT NULL,
  `size_id` INT,
  `quantity` INT NOT NULL,
  `price` DECIMAL(10, 2) NOT NULL,
  INDEX `fk_op_orders_idx` (`order_id` ASC) VISIBLE,
  INDEX `fk_op_products_idx` (`product_id` ASC) VISIBLE,
  INDEX `fk_op_sizes_idx` (`size_id` ASC) VISIBLE,
  CONSTRAINT `fk_op_orders`
    FOREIGN KEY (`order_id`)
    REFERENCES `orders` (`id`)
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_op_products`
    FOREIGN KEY (`product_id`)
    REFERENCES `products` (`id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_op_sizes`
    FOREIGN KEY (`size_id`)
    REFERENCES `product_sizes` (`id`)
    ON DELETE SET NULL
    ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

