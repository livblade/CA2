-- Migration: Add displayCurrency and bnplMonths columns to orders table
-- Date: 2026-01-28
-- Description: Adds support for storing display currency and BNPL plan information

USE c372_supermarketdb;

-- Add displayCurrency column (nullable, defaults to NULL for existing orders)
ALTER TABLE `orders` 
ADD COLUMN `displayCurrency` VARCHAR(10) DEFAULT NULL COMMENT 'Display currency used during checkout (for reference only)' AFTER `total`;

-- Add bnplMonths column (nullable, defaults to NULL for existing orders)
ALTER TABLE `orders` 
ADD COLUMN `bnplMonths` INT DEFAULT NULL COMMENT 'BNPL installment months selected (simulator only)' AFTER `displayCurrency`;

-- Verify the changes
DESCRIBE `orders`;

-- Sample query to see the new structure
SELECT * FROM `orders` LIMIT 1;
