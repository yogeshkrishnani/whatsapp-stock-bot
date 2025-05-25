// stock-analysis.js
// WhatsApp Stock Analyzer with Multi-language Support
// Updated to support both English and Hindi

const axios = require('axios');
const OpenAI = require('openai');
const https = require('https');
require('dotenv').config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// IndianAPI.in configuration via RapidAPI
const INDIAN_API_BASE_URL = 'https://indian-stock-exchange-api2.p.rapidapi.com';
const INDIAN_API_HOST = 'indian-stock-exchange-api2.p.rapidapi.com';

// Main analysis function with language support
async function analyzeStocks(stockInput, language = 'hindi') {
  console.log(`\n🚀 Starting stock analysis in ${language}...`);
  console.log(`📝 Input: "${stockInput}"`);

  try {
    // Step 1: Fetch stock data
    console.log('\n🔍 Phase 1: Data Fetching');
    const stockData = await fetchStockData(stockInput);

    if (!stockData || stockData.length === 0) {
      return language === 'english'
        ? 'No stock data found. Please send correct stock names.'
        : 'कोई स्टॉक डेटा नहीं मिला। कृपया सही नाम भेजें।';
    }

    // Step 2: Analyze the data
    console.log('\n📊 Phase 2: Financial Analysis');
    const analysis = await analyzeFinancialData(stockData);

    // Step 3: Generate response in requested language
    console.log(`\n🗣️ Phase 3: ${language} Response Generation`);
    const finalOutput = await generateLanguageResponse(analysis, language);

    // Log metrics
    console.log('\n📈 Analysis Metrics:');
    console.log(`• Stocks Requested: ${stockInput.split(/[,\s]+/).length}`);
    console.log(`• Successfully Analyzed: ${stockData.length}`);
    console.log(`• Language: ${language}`);

    return finalOutput;
  } catch (error) {
    console.error('🚨 Analysis Error:', error.message);
    return language === 'english'
      ? 'Sorry, analysis failed. Please try again later.'
      : 'माफ़ करें, विश्लेषण में समस्या हुई। कृपया बाद में कोशिश करें।';
  }
}

// Fetch stock data from API
async function fetchStockData(stockInput) {
  const stockNames = stockInput.split(/[,\s]+/).filter(name => name.length > 0);
  const results = [];

  for (const stockName of stockNames) {
    try {
      console.log(`🔍 Fetching data for: ${stockName}`);

      const response = await axios.get(`${INDIAN_API_BASE_URL}/stock`, {
        params: { name: stockName },
        headers: {
          'x-rapidapi-host': INDIAN_API_HOST,
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          Accept: 'application/json',
        },
        timeout: 10000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });

      if (response.data && response.data.companyName) {
        const stockData = response.data;
        const processedData = {
          symbol: stockData.tickerId || stockName.toUpperCase(),
          companyName: stockData.companyName,
          industry: stockData.industry,
          currentPrice: {
            BSE: stockData.currentPrice?.BSE,
            NSE: stockData.currentPrice?.NSE,
          },
          percentChange: parseFloat(stockData.percentChange) || 0,
          yearHigh: parseFloat(stockData.yearHigh) || null,
          yearLow: parseFloat(stockData.yearLow) || null,
          metrics: extractMetrics(stockData),
          analystView: stockData.analystView || null,
          rawData: stockData,
        };

        results.push(processedData);
        console.log(`✅ Successfully fetched data for ${stockData.companyName}`);
      } else {
        console.log(`❌ No data found for ${stockName}`);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Error fetching ${stockName}:`, error.message);
    }
  }

  return results;
}

// Extract financial metrics from API response
function extractMetrics(stockData) {
  const metrics = {};

  try {
    if (stockData.keyMetrics) {
      const keyMetrics = stockData.keyMetrics;

      if (keyMetrics.valuation) {
        const valuation = keyMetrics.valuation;
        metrics.peRatio = findMetricValue(
          valuation,
          'pPerEExcludingExtraordinaryItemsMostRecentFiscalYear'
        );
        metrics.pbRatio = findMetricValue(
          valuation,
          'priceToBookMostRecentFiscalYear'
        );
        metrics.dividendYield = findMetricValue(
          valuation,
          'currentDividendYieldCommonStockPrimaryIssueLTM'
        );
      }

      if (keyMetrics.financialstrength) {
        const financial = keyMetrics.financialstrength;
        metrics.debtToEquity = findMetricValue(
          financial,
          'totalDebtPerTotalEquityMostRecentFiscalYear'
        );
        metrics.currentRatio = findMetricValue(
          financial,
          'currentRatioMostRecentFiscalYear'
        );
      }

      if (keyMetrics.margins) {
        const margins = keyMetrics.margins;
        metrics.netProfitMargin = findMetricValue(
          margins,
          'netProfitMarginPercentTrailing12Month'
        );
        metrics.operatingMargin = findMetricValue(
          margins,
          'operatingMarginTrailing12Month'
        );
      }

      if (keyMetrics.mgmtEffectiveness) {
        const mgmt = keyMetrics.mgmtEffectiveness;
        metrics.roe = findMetricValue(
          mgmt,
          'returnOnAverageEquityTrailing12Month'
        );
        metrics.roa = findMetricValue(
          mgmt,
          'returnOnAverageAssetsTrailing12Month'
        );
      }

      if (keyMetrics.priceandVolume) {
        const priceVol = keyMetrics.priceandVolume;
        metrics.marketCap = findMetricValue(priceVol, 'marketCap');
        metrics.beta = findMetricValue(priceVol, 'beta');
      }

      if (keyMetrics.persharedata) {
        const perShare = keyMetrics.persharedata;
        metrics.eps = findMetricValue(
          perShare,
          'ePSIncludingExtraOrdinaryItemsTrailing12Month'
        );
        metrics.bookValuePerShare = findMetricValue(
          perShare,
          'bookValuePerShareMostRecentFiscalYear'
        );
      }
    }
  } catch (error) {
    console.log('❌ Error extracting metrics:', error.message);
  }

  return metrics;
}

// Helper function to find metric value
function findMetricValue(metricsArray, keyName) {
  if (!Array.isArray(metricsArray)) return null;

  const metric = metricsArray.find(item => item.key === keyName);
  if (metric && metric.value !== null && metric.value !== undefined) {
    const value = parseFloat(metric.value);
    return isNaN(value) ? null : value;
  }
  return null;
}

// Analyze financial data using AI
async function analyzeFinancialData(stockData) {
  console.log(`📊 Analyzing ${stockData.length} stocks`);

  const analysisResults = [];

  for (const stock of stockData) {
    try {
      const analysisPrompt = `
        Analyze this Indian stock and provide investment signals:
        
        Company: ${stock.companyName}
        Industry: ${stock.industry}
        Current Price: BSE ₹${stock.currentPrice?.BSE || 'N/A'}, NSE ₹${
  stock.currentPrice?.NSE || 'N/A'
}
        Price Change: ${stock.percentChange}%
        52-Week Range: ₹${stock.yearLow} - ₹${stock.yearHigh}
        
        Financial Metrics:
        - PE Ratio: ${stock.metrics?.peRatio || 'N/A'}
        - PB Ratio: ${stock.metrics?.pbRatio || 'N/A'}
        - Market Cap: ₹${stock.metrics?.marketCap || 'N/A'} Cr
        - ROE: ${stock.metrics?.roe || 'N/A'}%
        - Debt to Equity: ${stock.metrics?.debtToEquity || 'N/A'}
        - Profit Margin: ${stock.metrics?.netProfitMargin || 'N/A'}%
        
        Based on these metrics, provide a comprehensive analysis with:
        1. Company size and sector strength
        2. Profit trends and financial health  
        3. Current price position (high/low/fair)
        4. Valuation attractiveness
        5. Key risks to watch
        
        For each point, indicate: ✅ (positive), ⚠️ (mixed), or ❌ (negative)
        End with overall recommendation: BUY/HOLD/SELL with reasoning.
        
        IMPORTANT: Return ONLY valid JSON without any markdown formatting or code blocks.
        
        Return as JSON: {
          "points": [
            {"aspect": "Company Size", "signal": "✅", "analysis": "Large cap with strong market position"},
            {"aspect": "Profit Trends", "signal": "⚠️", "analysis": "Stable but slowing growth"},
            {"aspect": "Price Position", "signal": "❌", "analysis": "Trading near 52-week high"},
            {"aspect": "Valuation", "signal": "✅", "analysis": "PE ratio attractive at 15x"},
            {"aspect": "Risks", "signal": "⚠️", "analysis": "High debt levels concern"}
          ],
          "recommendation": "HOLD",
          "reasoning": "Good fundamentals but wait for better entry price"
        }
      `;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
                'You are a financial analyst specializing in Indian stocks. Provide practical investment analysis for retail investors.',
          },
          { role: 'user', content: analysisPrompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      });

      try {
        // Clean the response by removing markdown code blocks
        let responseText = completion.choices[0].message.content.trim();

        // Remove markdown json code blocks if present
        responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');

        const analysis = JSON.parse(responseText);
        analysisResults.push({
          symbol: stock.symbol,
          companyName: stock.companyName,
          currentPrice: stock.currentPrice,
          percentChange: stock.percentChange,
          analysis: analysis,
          rawStock: stock,
        });
      } catch (parseError) {
        console.error(`❌ JSON parse error for ${stock.symbol}:`, parseError.message);
        console.error('Raw response:', completion.choices[0].message.content);
        // Fallback analysis
        analysisResults.push({
          symbol: stock.symbol,
          companyName: stock.companyName,
          analysis: {
            points: [
              {
                aspect: 'Analysis',
                signal: '⚠️',
                analysis: 'Unable to complete detailed analysis',
              },
            ],
            recommendation: 'HOLD',
            reasoning: 'Insufficient data for recommendation',
          },
        });
      }
    } catch (error) {
      console.error(`❌ Error analyzing ${stock.symbol}:`, error.message);
    }
  }

  return analysisResults;
}

// Generate response in requested language
async function generateLanguageResponse(analysisData, language) {
  console.log(`🗣️ Generating ${language} response for ${analysisData.length} stocks`);

  const responses = [];

  for (const stock of analysisData) {
    try {
      const isHindi = language === 'hindi';
      const prompt = isHindi ? getHindiTranslationPrompt(stock) : getEnglishFormatPrompt(stock);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: isHindi
              ? 'You are a Hindi language specialist for financial content. Translate complex analysis into simple Hindi for 60+ year old investors.'
              : 'You are a financial communication specialist. Format stock analysis in clear, simple English for retail investors.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      responses.push(completion.choices[0].message.content.trim());
    } catch (error) {
      console.error(`❌ Error generating response for ${stock.symbol}:`, error.message);

      const errorMsg = language === 'hindi'
        ? `❌ ${stock.symbol}: अनुवाद में समस्या हुई।`
        : `❌ ${stock.symbol}: Translation failed.`;
      responses.push(errorMsg);
    }
  }

  return responses.join('\n\n---\n\n');
}

// Hindi translation prompt
function getHindiTranslationPrompt(stock) {
  return `
    Convert this stock analysis into simple Hindi for WhatsApp:
    
    Company: ${stock.companyName} (${stock.symbol})
    Current Price: ₹${stock.currentPrice?.NSE || stock.currentPrice?.BSE || 'N/A'}
    Change: ${stock.percentChange}%
    
    Analysis Points:
    ${stock.analysis.points.map(p => `${p.signal} ${p.aspect}: ${p.analysis}`).join('\n')}
    
    Recommendation: ${stock.analysis.recommendation}
    Reasoning: ${stock.analysis.reasoning}
    
    Format as:
    📊 [COMPANY NAME] Analysis
    
    ${stock.analysis.points.map(p => `${p.signal} **${p.aspect}**: [Simple Hindi explanation in one line]`).join('\n')}
    
    📝 **सुझाव**: [Overall recommendation in Hindi with reasoning]
    
    ⚠️ यह सिर्फ जानकारी है, निवेश सलाह नहीं है
    
    Use simple Hindi words, avoid English financial jargon.
  `;
}

// English formatting prompt
function getEnglishFormatPrompt(stock) {
  return `
    Format this stock analysis for WhatsApp in clear English:
    
    Company: ${stock.companyName} (${stock.symbol})
    Current Price: ₹${stock.currentPrice?.NSE || stock.currentPrice?.BSE || 'N/A'}
    Change: ${stock.percentChange}%
    
    Analysis Points:
    ${stock.analysis.points.map(p => `${p.signal} ${p.aspect}: ${p.analysis}`).join('\n')}
    
    Recommendation: ${stock.analysis.recommendation}
    Reasoning: ${stock.analysis.reasoning}
    
    Format as:
    📊 **${stock.companyName}** Analysis
    
    ${stock.analysis.points.map(p => `${p.signal} **${p.aspect}**: [Clear explanation in one line]`).join('\n')}
    
    📝 **Recommendation**: [${stock.analysis.recommendation}] - [Reasoning in simple English]
    
    ⚠️ This is information only, not investment advice
    
    Keep language simple and practical for retail investors.
  `;
}

module.exports = { analyzeStocks };