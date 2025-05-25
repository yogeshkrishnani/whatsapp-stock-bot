// whatsapp-bot-server.js
// WhatsApp Stock Bot Server with Language Preference Management
// Step 2.6b: Integrated SQLite user management

const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const { analyzeStocks } = require('./stock-analysis');
const UserManager = require('./user-manager');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Twilio client with API Key authentication
const twilioClient = twilio(
  process.env.TWILIO_API_KEY_SID,
  process.env.TWILIO_API_KEY_SECRET,
  {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
  }
);

// Initialize User Manager
const userManager = new UserManager();

// Configuration
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'WhatsApp Stock Bot Server Running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Health check endpoint (alternative)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Admin endpoint to get user statistics
app.get('/admin/stats', async (req, res) => {
  try {
    const stats = await userManager.getUserStats();
    res.status(200).json({
      status: 'success',
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get user statistics',
    });
  }
});

// Webhook endpoint for WhatsApp messages
app.post('/webhook', (req, res) => {
  console.log('📱 Webhook received at:', new Date().toISOString());

  // Acknowledge receipt immediately (async pattern)
  res.status(200).send('OK');

  // Parse Twilio webhook data
  const messageBody = req.body.Body || '';
  const fromNumber = req.body.From || '';
  const toNumber = req.body.To || '';
  const profileName = req.body.ProfileName || '';

  console.log('📨 Message received:');
  console.log(`• From: ${fromNumber} (${profileName})`);
  console.log(`• To: ${toNumber}`);
  console.log(`• Message: "${messageBody}"`);

  // Validate this is to our WhatsApp number (security check)
  if (toNumber !== TWILIO_WHATSAPP_NUMBER) {
    console.log('⚠️ Message to unexpected number, ignoring');
    console.log(`Expected: ${TWILIO_WHATSAPP_NUMBER}`);
    console.log(`Received: ${toNumber}`);
    return;
  }

  // Log user activity for monitoring
  console.log(
    `📊 User Activity: ${profileName || 'Unknown'} (${fromNumber}) - "${messageBody}"`
  );

  // Process the message with language preference handling
  processMessageWithLanguageSupport(messageBody, fromNumber);
});

// Process message with language preference management
async function processMessageWithLanguageSupport(messageBody, fromNumber) {
  try {
    console.log(`🔍 Processing message from ${fromNumber}:`, messageBody);

    // Handle language preference flow
    const languageResult = await userManager.handleLanguagePreference(
      fromNumber,
      messageBody
    );

    // If it's a language command, send confirmation and return
    if (languageResult.isLanguageCommand) {
      console.log(
        `🗣️ Language command processed: ${languageResult.language}`
      );
      await sendWhatsAppMessage(languageResult.message, fromNumber);
      return;
    }

    // If user needs to set language preference, ask for it
    if (languageResult.needsLanguagePreference) {
      console.log('❓ New user - asking for language preference');
      await sendWhatsAppMessage(languageResult.message, fromNumber);
      return;
    }

    // User has language preference - proceed with stock analysis
    const userLanguage = languageResult.language;
    console.log(`📈 Proceeding with stock analysis in: ${userLanguage}`);

    // Clean up the message
    const stockNames = messageBody.trim();

    if (!stockNames) {
      console.log('❌ Empty message received');
      const emptyMessage =
          userLanguage === 'english'
            ? 'Please send a stock name. Example: TCS or Reliance'
            : 'कृपया स्टॉक का नाम भेजें। जैसे: TCS या Reliance';
      await sendWhatsAppMessage(emptyMessage, fromNumber);
      return;
    }

    // Send acknowledgment message in user's preferred language
    const acknowledgmentMessage =
        userLanguage === 'english'
          ? '📊 Analyzing stocks... Please wait 30 seconds'
          : '📊 विश्लेषण कर रहे हैं... कृपया 30 सेकंड रुकें';

    await sendWhatsAppMessage(acknowledgmentMessage, fromNumber);

    // Run stock analysis with language preference
    console.log('📈 Starting stock analysis for:', stockNames);
    const analysisResult = await analyzeStocks(stockNames, userLanguage);

    console.log('✅ Stock analysis completed');

    // Send the analysis result
    await sendWhatsAppMessage(analysisResult, fromNumber);
  } catch (error) {
    console.error('❌ Error processing message:', error);

    // Send user-friendly error message based on error type and language
    let errorMessage = 'विश्लेषण में समस्या हुई। कृपया बाद में कोशिश करें।';
    let userLanguage = 'hindi'; // Default to hindi

    try {
      // Try to get user language for error message
      userLanguage = await userManager.getUserLanguagePreference(fromNumber);
    } catch (langError) {
      console.error('❌ Could not determine user language for error:', langError);
      // Keep default hindi language
    }

    // Set base error message based on language
    if (userLanguage === 'english') {
      errorMessage = 'Analysis failed. Please try again later.';
    }

    // Customize error message based on error type
    if (error.message && error.message.includes('API')) {
      errorMessage =
          userLanguage === 'english'
            ? 'Unable to fetch stock data. Please try again later.'
            : 'स्टॉक डेटा प्राप्त करने में समस्या हुई। कृपया बाद में कोशिश करें।';
    } else if (error.message && error.message.includes('OpenAI')) {
      errorMessage =
          userLanguage === 'english'
            ? 'Analysis service is experiencing issues. Please try again later.'
            : 'विश्लेषण सेवा में समस्या है। कृपया बाद में कोशिश करें।';
    }

    await sendWhatsAppMessage(errorMessage, fromNumber);
  }
}

// Send WhatsApp message via Twilio with fallback splitting
async function sendWhatsAppMessage(messageText, toNumber) {
  try {
    console.log(
      `📤 Sending to ${toNumber}:`,
      messageText.substring(0, 50) + '...'
    );
    console.log(`📏 Message length: ${messageText.length} characters`);

    const MAX_LENGTH = 1500; // WhatsApp limit with buffer

    // Try to send as single message first
    if (messageText.length <= MAX_LENGTH) {
      const message = await twilioClient.messages.create({
        body: messageText,
        from: TWILIO_WHATSAPP_NUMBER,
        to: toNumber,
      });

      console.log('✅ Message sent successfully (single):', message.sid);
      return message;
    }

    // Fallback: AI didn't respect character limit, split intelligently
    console.log(`⚠️ Message over limit (${messageText.length} chars), using fallback splitting...`);

    const parts = splitMessageIntelligently(messageText, MAX_LENGTH);

    console.log(`📤 Sending ${parts.length} parts to ${toNumber}`);

    // Send each part with small delay to ensure order
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partHeader = parts.length > 1 ? `(${i + 1}/${parts.length}) ` : '';
      const messageToSend = partHeader + part;

      console.log(`📤 Sending part ${i + 1}/${parts.length} (${messageToSend.length} chars)`);

      const message = await twilioClient.messages.create({
        body: messageToSend,
        from: TWILIO_WHATSAPP_NUMBER,
        to: toNumber,
      });

      console.log(`✅ Part ${i + 1} sent successfully:`, message.sid);

      // Small delay between messages
      if (i < parts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ All ${parts.length} parts sent successfully (fallback splitting used)`);
    return { success: true, parts: parts.length };

  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    console.error('Error details:', {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return null;
  }
}

// Intelligently split message at natural break points
function splitMessageIntelligently(text, maxLength) {
  const parts = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitIndex = maxLength;

    // Try to find good break points in order of preference
    const breakPoints = [
      '\n\n---\n\n',  // Between different stocks
      '\n\n',         // Between major sections
      '\n*',          // Before bullet points
      '\n',           // Any line break
      '. ',           // End of sentence
      ', ',           // After comma
      ' '             // Any space as last resort
    ];

    // Find the best break point within the limit
    for (const breakPoint of breakPoints) {
      const lastBreakIndex = remaining.lastIndexOf(breakPoint, maxLength);
      if (lastBreakIndex > maxLength * 0.7) { // Don't split too early (70% minimum)
        splitIndex = lastBreakIndex + breakPoint.length;
        break;
      }
    }

    // Extract this part and clean it up
    const part = remaining.substring(0, splitIndex).trim();
    parts.push(part);

    // Remove this part from remaining text
    remaining = remaining.substring(splitIndex).trim();
  }

  // Add the final part if any remaining
  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}

// Catch-all for undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `${req.method} ${req.originalUrl} is not supported`,
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Initialize user manager and start server
async function startServer() {
  try {
    // Initialize user management system
    console.log('🔄 Initializing user management system...');
    await userManager.initialize();

    // Start server
    app.listen(port, () => {
      console.log('🚀 WhatsApp Stock Bot Server Started');
      console.log(`📍 Server running on port ${port}`);
      console.log(`🔗 Health check: http://localhost:${port}/`);
      console.log(`🔗 Webhook endpoint: http://localhost:${port}/webhook`);
      console.log(`🔗 Admin stats: http://localhost:${port}/admin/stats`);
      console.log('📊 Stock analysis engine imported successfully');
      console.log('🗄️ SQLite user management ready');
      console.log('---');
      console.log('Environment variables loaded:');
      console.log(`• PORT: ${port}`);
      console.log(
        `• TWILIO_ACCOUNT_SID: ${
          process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log(
        `• TWILIO_API_KEY_SID: ${
          process.env.TWILIO_API_KEY_SID ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log(
        `• TWILIO_API_KEY_SECRET: ${
          process.env.TWILIO_API_KEY_SECRET ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log(
        `• TWILIO_WHATSAPP_NUMBER: ${
          process.env.TWILIO_WHATSAPP_NUMBER ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log(
        `• OPENAI_API_KEY: ${
          process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log(
        `• RAPIDAPI_KEY: ${
          process.env.RAPIDAPI_KEY ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log('---');
      console.log('⏳ Ready for multi-language stock analysis via WhatsApp...');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  await userManager.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  await userManager.close();
  process.exit(0);
});

// Start the server
startServer();