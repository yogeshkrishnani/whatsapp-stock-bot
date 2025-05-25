// whatsapp-bot-server.js
// Basic Express server with webhook endpoint for WhatsApp bot
// Step 2C.2: Added Twilio integration and message parsing

const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const { analyzeStocks } = require('./stock-analysis');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Twilio client with API Key authentication (correct format)
const twilioClient = twilio(
  process.env.TWILIO_API_KEY_SID, // API Key SID (SK...)
  process.env.TWILIO_API_KEY_SECRET, // API Key Secret
  {
    accountSid: process.env.TWILIO_ACCOUNT_SID, // Account SID (AC...)
  }
);

// Configuration
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER;
const TARGET_PHONE_NUMBER = process.env.TARGET_PHONE_NUMBER;

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

// Webhook endpoint for WhatsApp messages - Multi-user version
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

  // Process the message for any user
  processStockRequest(messageBody, fromNumber);
});

// Updated processStockRequest to handle any user
async function processStockRequest(messageBody, fromNumber) {
  try {
    console.log(`🔍 Processing request from ${fromNumber}:`, messageBody);

    // Clean up the message
    const stockNames = messageBody.trim();

    if (!stockNames) {
      console.log('❌ Empty message received');
      await sendWhatsAppMessage(
        'कृपया स्टॉक का नाम भेजें। जैसे: TCS या Reliance',
        fromNumber
      );
      return;
    }

    // Send acknowledgment message
    await sendWhatsAppMessage(
      '📊 विश्लेषण कर रहे हैं... कृपया 30 सेकंड रुकें',
      fromNumber
    );

    // Run actual stock analysis
    console.log('📈 Starting stock analysis for:', stockNames);
    const analysisResult = await analyzeStocks(stockNames);

    console.log('✅ Stock analysis completed');

    // Send the analysis result
    await sendWhatsAppMessage(analysisResult, fromNumber);
  } catch (error) {
    console.error('❌ Error processing stock request:', error);

    // Send user-friendly error message
    let errorMessage = 'विश्लेषण में समस्या हुई। कृपया बाद में कोशिश करें।';

    if (error.message && error.message.includes('API')) {
      errorMessage =
        'स्टॉक डेटा प्राप्त करने में समस्या हुई। कृपया बाद में कोशिश करें।';
    } else if (error.message && error.message.includes('OpenAI')) {
      errorMessage = 'विश्लेषण सेवा में समस्या है। कृपया बाद में कोशिश करें।';
    }

    await sendWhatsAppMessage(errorMessage, fromNumber);
  }
}

// Updated sendWhatsAppMessage to accept recipient parameter
async function sendWhatsAppMessage(
  messageText,
  toNumber = TARGET_PHONE_NUMBER
) {
  try {
    console.log(
      `📤 Sending to ${toNumber}:`,
      messageText.substring(0, 50) + '...'
    );

    const message = await twilioClient.messages.create({
      body: messageText,
      from: TWILIO_WHATSAPP_NUMBER,
      to: toNumber,
    });

    console.log('✅ Message sent successfully:', message.sid);
    return message;
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

// Start server
app.listen(port, () => {
  console.log('🚀 WhatsApp Stock Bot Server Started');
  console.log(`📍 Server running on port ${port}`);
  console.log(`🔗 Health check: http://localhost:${port}/`);
  console.log(`🔗 Webhook endpoint: http://localhost:${port}/webhook`);
  console.log('📊 Stock analysis engine imported successfully');
  console.log('---');
  console.log('Environment variables loaded:');
  console.log(`• PORT: ${port}`);
  console.log(
    `• TWILIO_ACCOUNT_SID: ${process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing'}`
  );
  console.log(
    `• TWILIO_API_KEY_SID: ${process.env.TWILIO_API_KEY_SID ? '✅ Set' : '❌ Missing'}`
  );
  console.log(
    `• TWILIO_API_KEY_SECRET: ${process.env.TWILIO_API_KEY_SECRET ? '✅ Set' : '❌ Missing'}`
  );
  console.log(
    `• TWILIO_WHATSAPP_NUMBER: ${process.env.TWILIO_WHATSAPP_NUMBER ? '✅ Set' : '❌ Missing'}`
  );
  console.log(
    `• TARGET_PHONE_NUMBER: ${process.env.TARGET_PHONE_NUMBER ? '✅ Set' : '❌ Missing'}`
  );
  console.log(
    `• OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`
  );
  console.log(
    `• RAPIDAPI_KEY: ${process.env.RAPIDAPI_KEY ? '✅ Set' : '❌ Missing'}`
  );
  console.log('---');
  console.log('⏳ Ready for full stock analysis via WhatsApp...');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});
