const sqlite3 = require('sqlite3').verbose();

class UserManager {
  constructor(dbPath = '/data/users.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  // Initialize database and create tables
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('❌ Error opening database:', err.message);
          reject(err);
          return;
        }
        console.log('✅ Connected to SQLite database:', this.dbPath);
        this.createTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  // Create users table if not exists
  async createTables() {
    return new Promise((resolve, reject) => {
      const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
          phone_number TEXT PRIMARY KEY,
          language_preference TEXT NOT NULL DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
          message_count INTEGER DEFAULT 0
        )
      `;

      this.db.run(createUsersTable, (err) => {
        if (err) {
          console.error('❌ Error creating users table:', err.message);
          reject(err);
          return;
        }
        console.log('✅ Users table ready');
        resolve();
      });
    });
  }

  // Get user by phone number
  async getUser(phoneNumber) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM users WHERE phone_number = ?';

      this.db.get(query, [phoneNumber], (err, row) => {
        if (err) {
          console.error('❌ Error getting user:', err.message);
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  }

  // Create new user with pending language preference
  async createUser(phoneNumber) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO users (phone_number, language_preference, message_count)
        VALUES (?, 'pending', 1)
      `;

      this.db.run(query, [phoneNumber], function(err) {
        if (err) {
          console.error('❌ Error creating user:', err.message);
          reject(err);
          return;
        }
        console.log(`✅ New user created: ${phoneNumber}`);
        resolve({ phone_number: phoneNumber, language_preference: 'pending' });
      });
    });
  }

  // Update user language preference
  async setLanguagePreference(phoneNumber, language) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE users 
        SET language_preference = ?, last_used = CURRENT_TIMESTAMP
        WHERE phone_number = ?
      `;

      this.db.run(query, [language.toLowerCase(), phoneNumber], function(err) {
        if (err) {
          console.error('❌ Error updating language preference:', err.message);
          reject(err);
          return;
        }
        console.log(`✅ Language updated for ${phoneNumber}: ${language}`);
        resolve();
      });
    });
  }

  // Update user activity (last used, increment message count)
  async updateUserActivity(phoneNumber) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE users 
        SET last_used = CURRENT_TIMESTAMP, message_count = message_count + 1
        WHERE phone_number = ?
      `;

      this.db.run(query, [phoneNumber], function(err) {
        if (err) {
          console.error('❌ Error updating user activity:', err.message);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  // Check if message is a language command
  isLanguageCommand(message) {
    const cleanMessage = message.trim().toLowerCase();
    const languageCommands = ['english', 'hindi', 'gujarati', 'eng', 'hin', 'guj'];
    return languageCommands.includes(cleanMessage);
  }

  // Parse language from message
  parseLanguage(message) {
    const cleanMessage = message.trim().toLowerCase();

    if (['english', 'eng'].includes(cleanMessage)) {
      return 'english';
    }
    if (['hindi', 'hin'].includes(cleanMessage)) {
      return 'hindi';
    }
    if (['gujarati', 'guj'].includes(cleanMessage)) {
      return 'gujarati';
    }
    return null;
  }

  // Get user language preference with automatic user creation
  async getUserLanguagePreference(phoneNumber) {
    try {
      let user = await this.getUser(phoneNumber);

      if (!user) {
        // New user - create with pending status
        user = await this.createUser(phoneNumber);
        return 'pending';
      }

      // Update user activity
      await this.updateUserActivity(phoneNumber);

      return user.language_preference;
    } catch (error) {
      console.error('❌ Error getting user language preference:', error);
      return 'pending'; // Default fallback
    }
  }

  // Handle language preference flow
  async handleLanguagePreference(phoneNumber, message) {
    try {
      const userLanguage = await this.getUserLanguagePreference(phoneNumber);

      // Check if message is a language command
      if (this.isLanguageCommand(message)) {
        const language = this.parseLanguage(message);
        if (language) {
          await this.setLanguagePreference(phoneNumber, language);
          return {
            isLanguageCommand: true,
            language: language,
            message: language === 'english'
              ? 'Language set to English! Send any stock name for analysis.'
              : language === 'hindi'
                ? 'भाषा हिंदी सेट कर दी गई! विश्लेषण के लिए कोई भी स्टॉक का नाम भेजें।'
                : 'ભાષા ગુજરાતી સેટ કરવામાં આવી! વિશ્લેષણ માટે કોઈપણ સ્ટોકનું નામ મોકલો.'
          };
        }
      }

      // If user language is pending, ask for preference
      if (userLanguage === 'pending') {
        return {
          isLanguageCommand: false,
          needsLanguagePreference: true,
          message: 'Welcome! Please choose your language:\n\nSend "English" for English\nSend "Hindi" for हिंदी\n\n"English" भेजें अंग्रेजी के लिए\n"Hindi" भेजें हिंदी के लिए'
        };
      }

      // User has language preference set - proceed with stock analysis
      return {
        isLanguageCommand: false,
        needsLanguagePreference: false,
        language: userLanguage
      };

    } catch (error) {
      console.error('❌ Error handling language preference:', error);
      return {
        isLanguageCommand: false,
        needsLanguagePreference: true,
        message: 'Welcome! Please choose your language: English, Hindi or Gujarati'
      };
    }
  }

  // Get user statistics (for monitoring/debugging)
  async getUserStats() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_users,
          SUM(CASE WHEN language_preference = 'english' THEN 1 ELSE 0 END) as english_users,
          SUM(CASE WHEN language_preference = 'hindi' THEN 1 ELSE 0 END) as hindi_users,
          SUM(CASE WHEN language_preference = 'gujarati' THEN 1 ELSE 0 END) as gujarati_users,
          SUM(CASE WHEN language_preference = 'pending' THEN 1 ELSE 0 END) as pending_users,
          SUM(message_count) as total_messages
        FROM users
      `;

      this.db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }

  // Close database connection
  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('❌ Error closing database:', err.message);
          } else {
            console.log('✅ Database connection closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = UserManager;