-- ==========================================================================
-- EMC Lab — manual MySQL setup (the server also creates the table itself)
--   mysql -u root -p < server/schema.sql
-- ==========================================================================
CREATE DATABASE IF NOT EXISTS emc_lab
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE emc_lab;

CREATE TABLE IF NOT EXISTS progress (
  user_id    VARCHAR(64) NOT NULL PRIMARY KEY,   -- anonymous client-generated id
  payload    JSON        NOT NULL,               -- {topics, quizBest, quizAttempts, quizLast, quizHistory}
  updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- A least-privilege account for the app:
-- CREATE USER IF NOT EXISTS 'emc'@'localhost' IDENTIFIED BY 'change-me';
-- GRANT SELECT, INSERT, UPDATE ON emc_lab.progress TO 'emc'@'localhost';
