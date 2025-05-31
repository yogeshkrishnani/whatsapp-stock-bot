const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { analyzeStocks } = require('./stock-analysis');
const UserManager = require('./user-manager');
const { PostHog } = require('posthog-node');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const posthog = new PostHog(process.env.POSTHOG_API_KEY);

// Initialize User Manager
const userManager = new UserManager();

// Meta WhatsApp Business API Configuration
const META_GRAPH_API_URL = 'https://graph.facebook.com/v22.0';
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

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
    status: 'WhatsApp Stock Bot Server Running (Meta API)',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
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

// Webhook endpoint for WhatsApp messages (Meta format)
app.post('/webhook', (req, res) => {
  console.log('📱 Meta webhook received at:', new Date().toISOString());
  console.log('📨 Webhook body:', JSON.stringify(req.body, null, 2));

  try {
    // Parse Meta webhook data
    const body = req.body;

    // Check if it's a WhatsApp message
    if (body.object === 'whatsapp_business_account') {
      // Acknowledge receipt immediately (async pattern)
      res.status(200).send('OK');

      // Process each entry
      body.entry.forEach(entry => {
        const changes = entry.changes || [];

        changes.forEach(change => {
          if (change.field === 'messages') {
            const value = change.value;

            // Process incoming messages
            if (value.messages && value.messages.length > 0) {
              value.messages.forEach(message => {
                processMetaMessage(message, value);
              });
            }
          }
        });
      });
    } else {
      console.log('⚠️ Non-WhatsApp webhook received, ignoring');
      res.status(200).send('OK');
    }
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Webhook verification for Meta (GET request)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔐 Webhook verification request:');
  console.log(`• Mode: ${mode}`);
  console.log(`• Token: ${token}`);
  console.log(`• Challenge: ${challenge}`);

  // Verify the webhook
  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.status(403).send('Verification failed');
  }
});

// Process Meta WhatsApp message
async function processMetaMessage(message, value) {
  try {
    // Extract message details
    const messageType = message.type;
    const messageId = message.id;
    const fromNumber = message.from;
    const timestamp = message.timestamp;

    console.log('📨 Processing Meta message:');
    console.log(`• From: ${fromNumber}`);
    console.log(`• Type: ${messageType}`);
    console.log(`• ID: ${messageId}`);
    console.log(`• Timestamp: ${timestamp}`);

    // Only process text messages
    if (messageType !== 'text') {
      console.log('⚠️ Non-text message received, ignoring');
      return;
    }

    const messageBody = message.text.body;
    console.log(`• Message: "${messageBody}"`);

    // Get contact info if available
    const contact = value.contacts ? value.contacts.find(c => c.wa_id === fromNumber) : null;
    const profileName = contact ? contact.profile.name : 'Unknown';

    console.log(`📊 User Activity: ${profileName} (${fromNumber}) - "${messageBody}"`);

    // Process the message with language preference handling
    await processMessageWithLanguageSupport(messageBody, fromNumber);

  } catch (error) {
    console.error('❌ Error processing Meta message:', error);
  }
}

// Process message with language preference management (unchanged logic)
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
      posthog.capture({
        distinctId: fromNumber,
        event: languageResult.language === 'english' ? 'language_set_english' : 'language_set_hindi',
        properties: {
          language: languageResult.language,
        }
      });
      await sendMetaWhatsAppMessage(languageResult.message, fromNumber);
      return;
    }

    // If user needs to set language preference, ask for it
    if (languageResult.needsLanguagePreference) {
      console.log('❓ New user - asking for language preference');
      posthog.capture({
        distinctId: fromNumber,
        event: 'new_user_joined',
        properties: {
          language_status: 'pending'
        }
      });
      await sendMetaWhatsAppMessage(languageResult.message, fromNumber);
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
      await sendMetaWhatsAppMessage(emptyMessage, fromNumber);
      return;
    }

    // Send acknowledgment message in user's preferred language
    const acknowledgmentMessage =
        userLanguage === 'english'
          ? '📊 Analyzing stocks... Please wait 30 seconds'
          : '📊 विश्लेषण कर रहे हैं... कृपया 30 सेकंड रुकें';

    await sendMetaWhatsAppMessage(acknowledgmentMessage, fromNumber);

    const stockList = stockNames.split(/[,\s]+/).filter(name => name.length > 0);
    posthog.capture({
      distinctId: fromNumber,
      event: 'stock_analysis_requested',
      properties: {
        stocks: stockNames,
        stock_count: stockList.length,
        language: userLanguage,
        is_multi_stock: stockList.length > 1
      }
    });

    // Run stock analysis with language preference
    console.log('📈 Starting stock analysis for:', stockNames);
    const startTime = Date.now();
    const analysisResult = await analyzeStocks(stockNames, userLanguage);
    const responseTime = Math.round((Date.now() - startTime) / 1000); // in seconds

    console.log('✅ Stock analysis completed');

    posthog.capture({
      distinctId: fromNumber,
      event: 'stock_analysis_completed',
      properties: {
        stocks: stockNames,
        language: userLanguage,
        response_time: responseTime,
        success: true
      }
    });

    // Send the analysis result
    await sendMetaWhatsAppMessage(analysisResult, fromNumber);
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

    posthog.capture({
      distinctId: fromNumber,
      event: 'stock_analysis_failed',
      properties: {
        stocks: messageBody || 'unknown',
        language: userLanguage || 'unknown',
        error_type: error.message?.includes('API') ? 'api_error' :
          error.message?.includes('OpenAI') ? 'openai_error' : 'unknown_error',
        error_message: error.message
      }
    });

    await sendMetaWhatsAppMessage(errorMessage, fromNumber);
  }
}

// Send WhatsApp message via Meta Business Cloud API with fallback splitting
async function sendMetaWhatsAppMessage(messageText, toNumber) {
  try {
    console.log(
      `📤 Sending Meta message to ${toNumber}:`,
      messageText.substring(0, 50) + '...'
    );
    console.log(`📏 Message length: ${messageText.length} characters`);

    const MAX_LENGTH = 1500; // WhatsApp limit with buffer

    // Try to send as single message first
    if (messageText.length <= MAX_LENGTH) {
      const response = await axios.post(
        `${META_GRAPH_API_URL}/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: toNumber,
          text: { body: messageText },
          type: 'text'
        },
        {
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Meta message sent successfully:', response.data.messages[0].id);
      return response.data;
    }

    // Fallback: Message too long, split intelligently
    console.log(`⚠️ Message over limit (${messageText.length} chars), using fallback splitting...`);

    const parts = splitMessageIntelligently(messageText, MAX_LENGTH);

    console.log(`📤 Sending ${parts.length} parts to ${toNumber}`);

    // Send each part with small delay to ensure order
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const partHeader = parts.length > 1 ? `(${i + 1}/${parts.length}) ` : '';
      const messageToSend = partHeader + part;

      console.log(`📤 Sending part ${i + 1}/${parts.length} (${messageToSend.length} chars)`);

      const response = await axios.post(
        `${META_GRAPH_API_URL}/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: 'whatsapp',
          to: toNumber,
          text: { body: messageToSend },
          type: 'text'
        },
        {
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Part ${i + 1} sent successfully:`, response.data.messages[0].id);

      // Small delay between messages
      if (i < parts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ All ${parts.length} parts sent successfully (fallback splitting used)`);
    return { success: true, parts: parts.length };

  } catch (error) {
    console.error('❌ Error sending Meta WhatsApp message:', error);

    if (error.response) {
      console.error('API Error Details:');
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }

    return null;
  }
}

// Intelligently split message at natural break points (unchanged from Twilio version)
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
      console.log('🚀 WhatsApp Stock Bot Server Started (Meta API)');
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
        `• META_PHONE_NUMBER_ID: ${
          process.env.META_PHONE_NUMBER_ID ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log(
        `• META_ACCESS_TOKEN: ${
          process.env.META_ACCESS_TOKEN ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log(
        `• WEBHOOK_VERIFY_TOKEN: ${
          process.env.WEBHOOK_VERIFY_TOKEN ? '✅ Set' : '❌ Missing'
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
      console.log(
        `• POSTHOG_API_KEY: ${
          process.env.POSTHOG_API_KEY ? '✅ Set' : '❌ Missing'
        }`
      );
      console.log('---');
      console.log('⏳ Ready for multi-language stock analysis via Meta WhatsApp API...');
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