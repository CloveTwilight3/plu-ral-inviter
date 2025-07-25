import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export class Database {
  private connection: mysql.Connection | null = null;

  async connect() {
    try {
      this.connection = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
      });

      await this.createTables();
      console.log('Connected to MySQL database');
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  private async createTables() {
    if (!this.connection) throw new Error('No database connection');

    // User-proxy relationships table
    await this.connection.execute(`
      CREATE TABLE IF NOT EXISTS user_proxies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL,
        proxy_id VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_proxy_id (proxy_id)
      )
    `);

    // Pending requests table
    await this.connection.execute(`
      CREATE TABLE IF NOT EXISTS pending_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id VARCHAR(20) NOT NULL UNIQUE,
        user_id VARCHAR(20) NOT NULL,
        proxy_id VARCHAR(20) NOT NULL,
        requested_roles JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_message_id (message_id)
      )
    `);

    // Bot settings table
    await this.connection.execute(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        guild_id VARCHAR(20) PRIMARY KEY,
        mod_channel_id VARCHAR(20),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  }

  async savePendingRequest(messageId: string, userId: string, proxyId: string, roles: any) {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'INSERT INTO pending_requests (message_id, user_id, proxy_id, requested_roles) VALUES (?, ?, ?, ?)',
      [messageId, userId, proxyId, JSON.stringify(roles)]
    );
  }

  async getPendingRequest(messageId: string) {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM pending_requests WHERE message_id = ?',
      [messageId]
    ) as mysql.RowDataPacket[][];

    return rows[0] || null;
  }

  async deletePendingRequest(messageId: string) {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'DELETE FROM pending_requests WHERE message_id = ?',
      [messageId]
    );
  }

  async saveUserProxy(userId: string, proxyId: string) {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'INSERT INTO user_proxies (user_id, proxy_id) VALUES (?, ?)',
      [userId, proxyId]
    );
  }

  async getUserProxies(userId: string) {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT * FROM user_proxies WHERE user_id = ?',
      [userId]
    ) as mysql.RowDataPacket[][];

    return rows;
  }

  async removeUserProxies(userId: string) {
    if (!this.connection) throw new Error('No database connection');

    const [result] = await this.connection.execute(
      'DELETE FROM user_proxies WHERE user_id = ?',
      [userId]
    ) as mysql.ResultSetHeader[];

    return result.affectedRows;
  }

  async setModChannel(guildId: string, channelId: string) {
    if (!this.connection) throw new Error('No database connection');

    await this.connection.execute(
      'INSERT INTO bot_settings (guild_id, mod_channel_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE mod_channel_id = ?',
      [guildId, channelId, channelId]
    );
  }

  async getModChannel(guildId: string): Promise<string | null> {
    if (!this.connection) throw new Error('No database connection');

    const [rows] = await this.connection.execute(
      'SELECT mod_channel_id FROM bot_settings WHERE guild_id = ?',
      [guildId]
    ) as mysql.RowDataPacket[][];

    return rows[0]?.mod_channel_id || null;
  }
}

export const database = new Database();