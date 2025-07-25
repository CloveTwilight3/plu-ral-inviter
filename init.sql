-- This file will be executed when the MySQL container starts for the first time
-- It ensures the database and user are properly set up

CREATE DATABASE IF NOT EXISTS userproxy_bot;
CREATE USER IF NOT EXISTS 'botuser'@'%' IDENTIFIED BY 'your_secure_password_here';
GRANT ALL PRIVILEGES ON userproxy_bot.* TO 'botuser'@'%';
FLUSH PRIVILEGES;