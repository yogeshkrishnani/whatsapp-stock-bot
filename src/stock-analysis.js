// stock-analysis.js
// Detailed WhatsApp Stock Analyzer for Indian retail investors
// npm install axios openai dotenv

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

// Helper function to extract metric value from API response
function findMetricValue(metricsArray, keyName) {
  if (!Array.isArray(metricsArray)) return null;
  const metric = metricsArray.find(item => item.key === keyName);
  if (metric && metric.value !== null && metric.value !== undefined) {
    const value = parseFloat(metric.value);
    return isNaN(value) ? null : value;
  }
  return null;
}

// Extract comprehensive metrics from API response
function extractKeyMetrics(stockData) {
  const metrics = {};

  try {
    if (stockData.keyMetrics) {
      const keyMetrics = stockData.keyMetrics;

      // Valuation metrics
      if (keyMetrics.valuation) {
        metrics.peRatio =
            findMetricValue(
              keyMetrics.valuation,
              'pPerEExcludingExtraordinaryItemsMostRecentFiscalYear'
            ) ||
            findMetricValue(
              keyMetrics.valuation,
              'pPerEIncludingExtraordinaryItemsTTM'
            );
        metrics.pbRatio = findMetricValue(
          keyMetrics.valuation,
          'priceToBookMostRecentFiscalYear'
        );
        metrics.dividendYield = findMetricValue(
          keyMetrics.valuation,
          'currentDividendYieldCommonStockPrimaryIssueLTM'
        );
        metrics.priceToSales = findMetricValue(
          keyMetrics.valuation,
          'priceToSalesMostRecentFiscalYear'
        );
      }

      // Financial strength
      if (keyMetrics.financialstrength) {
        metrics.debtToEquity =
            findMetricValue(
              keyMetrics.financialstrength,
              'totalDebtPerTotalEquityMostRecentFiscalYear'
            ) ||
            findMetricValue(
              keyMetrics.financialstrength,
              'ltDebtPerEquityMostRecentFiscalYear'
            );
        metrics.currentRatio = findMetricValue(
          keyMetrics.financialstrength,
          'currentRatioMostRecentFiscalYear'
        );
        metrics.freeCashFlow = findMetricValue(
          keyMetrics.financialstrength,
          'freeCashFlowtrailing12Month'
        );
      }

      // Profitability margins
      if (keyMetrics.margins) {
        metrics.netProfitMargin = findMetricValue(
          keyMetrics.margins,
          'netProfitMarginPercentTrailing12Month'
        );
        metrics.operatingMargin = findMetricValue(
          keyMetrics.margins,
          'operatingMarginTrailing12Month'
        );
        metrics.grossMargin = findMetricValue(
          keyMetrics.margins,
          'grossMarginTrailing12Month'
        );
      }

      // Management effectiveness
      if (keyMetrics.mgmtEffectiveness) {
        metrics.roe =
            findMetricValue(
              keyMetrics.mgmtEffectiveness,
              'returnOnAverageEquityTrailing12Month'
            ) ||
            findMetricValue(
              keyMetrics.mgmtEffectiveness,
              'returnOnAverageEquityMostRecentFiscalYear'
            );
        metrics.roa = findMetricValue(
          keyMetrics.mgmtEffectiveness,
          'returnOnAverageAssetsTrailing12Month'
        );
        metrics.assetTurnover = findMetricValue(
          keyMetrics.mgmtEffectiveness,
          'assetTurnoverTrailing12Month'
        );
      }

      // Market data
      if (keyMetrics.priceandVolume) {
        metrics.marketCap = findMetricValue(
          keyMetrics.priceandVolume,
          'marketCap'
        );
        metrics.beta = findMetricValue(keyMetrics.priceandVolume, 'beta');
        metrics.avgVolume = findMetricValue(
          keyMetrics.priceandVolume,
          'averageVolume10Day'
        );
      }

      // Per share data
      if (keyMetrics.persharedata) {
        metrics.eps =
            findMetricValue(
              keyMetrics.persharedata,
              'ePSIncludingExtraOrdinaryItemsTrailing12Month'
            ) ||
            findMetricValue(
              keyMetrics.persharedata,
              'ePSExcludingExtraordinaryItemsMostRecentFiscalYear'
            );
        metrics.bookValue = findMetricValue(
          keyMetrics.persharedata,
          'bookValuePerShareMostRecentFiscalYear'
        );
        metrics.cashFlowPerShare = findMetricValue(
          keyMetrics.persharedata,
          'cashFlowPerShareTrailing12Month'
        );
        metrics.dividendPerShare = findMetricValue(
          keyMetrics.persharedata,
          'dividendsPerShareTrailing12Month'
        );
      }

      // Growth metrics
      if (keyMetrics.growth) {
        metrics.revenueGrowth = findMetricValue(
          keyMetrics.growth,
          'revenueGrowthRate5Year'
        );
        metrics.epsGrowth = findMetricValue(
          keyMetrics.growth,
          'ePSGrowthRate5Year'
        );
        metrics.revenueGrowthTTM = findMetricValue(
          keyMetrics.growth,
          'revenueChangePercentTTMPOverTTM'
        );
      }

      // Income statement
      if (keyMetrics.incomeStatement) {
        metrics.revenue = findMetricValue(
          keyMetrics.incomeStatement,
          'revenueTrailing12Month'
        );
        metrics.netIncome = findMetricValue(
          keyMetrics.incomeStatement,
          'netIncomeAvailableToCommonTrailing12Months'
        );
        metrics.ebitda = findMetricValue(
          keyMetrics.incomeStatement,
          'eBITDTrailing12Month'
        );
      }
    }
  } catch (error) {
    console.log('Error extracting metrics:', error.message);
  }

  return metrics;
}

// Fetch stock data from API
async function fetchStockData(stockName) {
  try {
    console.log(`Searching for: ${stockName}`);

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

      return {
        success: true,
        symbol: stockData.tickerId || stockName.toUpperCase(),
        companyName: stockData.companyName,
        industry: stockData.industry,
        currentPrice:
            stockData.currentPrice?.NSE || stockData.currentPrice?.BSE,
        percentChange: parseFloat(stockData.percentChange) || 0,
        yearHigh: parseFloat(stockData.yearHigh) || null,
        yearLow: parseFloat(stockData.yearLow) || null,
        metrics: extractKeyMetrics(stockData),
        analystView: stockData.analystView,
        rawData: stockData,
      };
    } else {
      return {
        success: false,
        error: 'Stock not found',
        stockName: stockName,
      };
    }
  } catch (error) {
    console.error(`Error fetching ${stockName}:`, error.message);
    return {
      success: false,
      error: 'API error',
      stockName: stockName,
    };
  }
}

// Generate detailed analysis in Hindi (ORIGINAL QUALITY)
async function generateDetailedHindiAnalysis(stockData) {
  try {
    const {
      companyName,
      currentPrice,
      percentChange,
      yearHigh,
      yearLow,
      metrics,
      industry,
    } = stockData;

    // Calculate price position
    let priceFromHigh = '';
    if (currentPrice && yearHigh) {
      const dropPercent = Math.round(
        ((yearHigh - currentPrice) / yearHigh) * 100
      );
      priceFromHigh = dropPercent > 0 ? `${dropPercent}% कम` : 'हाई के पास';
    }

    const prompt = `
आप एक विशेषज्ञ भारतीय स्टॉक विश्लेषक हैं जो 60 वर्षीय खुदरा निवेशकों के लिए हिंदी में विस्तृत विश्लेषण प्रदान कर रहे हैं।

कंपनी: ${companyName}
उद्योग: ${industry}
वर्तमान कीमत: ₹${currentPrice}
आज का बदलाव: ${percentChange}%
52-सप्ताह उच्च: ₹${yearHigh}
52-सप्ताह निम्न: ₹${yearLow}
वर्तमान कीमत अपने 52-सप्ताह के उच्च से ${priceFromHigh} नीचे है।

वित्तीय मेट्रिक्स:
| मेट्रिक               | मूल्य                                    |
|----------------------|----------------------------------------|
| मार्केट कैप            | ₹${metrics.marketCap || 'N/A'} करोड़   |
| PE अनुपात             | ${metrics.peRatio || 'N/A'}            |
| PB अनुपात             | ${metrics.pbRatio || 'N/A'}            |
| ROE                  | ${metrics.roe || 'N/A'}%               |
| ROA                  | ${metrics.roa || 'N/A'}%               |
| कर्ज से इक्विटी अनुपात   | ${metrics.debtToEquity || 'N/A'}       |
| शुद्ध लाभ मार्जिन       | ${metrics.netProfitMargin || 'N/A'}%   |
| EPS                  | ₹${metrics.eps || 'N/A'}               |
| आय                   | ₹${metrics.revenue || 'N/A'} करोड़      |
| शुद्ध आय              | ₹${metrics.netIncome || 'N/A'} करोड़    |
| आय वृद्धि             | ${metrics.revenueGrowth || 'N/A'}%     |
| EPS वृद्धि            | ${metrics.epsGrowth || 'N/A'}%         |

इस सटीक प्रारूप में विश्लेषण बनाएं:

${companyName.toUpperCase()}:

✅ *कंपनी कितनी बड़ी है:* [मार्केट कैप की जानकारी और वास्तविक संख्याओं के साथ आकार का विवरण]
✅ *वर्ष-दर-वर्ष का प्रॉफिट:* [विशिष्ट आय और वृद्धि संख्याओं के साथ लाभ के रुझान]
✅ *शेयर का आज का भाव:* [वर्तमान कीमत और 52-सप्ताह उच्च/निम्न के मुकाबले स्थिति प्रतिशत के साथ]
⚠️ *कीमत vs कमाई (P/E):* [वास्तविक अनुपात और मूल्यांकन आकलन के साथ P/E विश्लेषण]
✅ *जोखिम (Challenges):* [कर्ज के स्तर के साथ विशिष्ट व्यापारिक/बाजार जोखिम]

*संक्षिप्त सार:* [समग्र निवेश स्थिति का 2-3 लाइन का सारांश]

*सलाह:* 👉 *खरीदें* – [मुख्य संख्याओं के साथ सिफारिश का संक्षिप्त तर्क]

प्रतीक दिशानिर्देश:
- ✅ सकारात्मक संकेतक (जैसे मजबूत लाभ, कम कर्ज, आकर्षक मूल्यांकन, मजबूत वृद्धि, बड़ी स्थिर कंपनी)
- ⚠️ तटस्थ/मिश्रित संकेतक (जैसे मध्यम चिंताएं, उद्योग जोखिम, उचित मूल्यांकन, मिश्रित संकेत)  
- ❌ नकारात्मक संकेतक (जैसे हानि, उच्च कर्ज, महंगा मूल्यांकन, गिरते रुझान, उच्च जोखिम)

दिशानिर्देश:
- 60+ आयु वर्ग के लिए सरल, रोजमर्रा के हिंदी शब्दों का उपयोग करें
- जटिल वित्तीय शब्दजाल से बचें - "प्रॉफिटेबिलिटी" के बजाय "मुनाफा" जैसे सरल शब्दों का उपयोग करें
- तकनीकी शब्दों का अनुवाद करें: "Market Cap" → "कंपनी का साइज़", "Debt" → "कर्जा", "Revenue" → "बिक्री"
- जहां भी संभव हो वास्तविक संख्याओं का उपयोग करें
- प्रतिशत, राशि, मार्केट कैप के बारे में विशिष्ट रहें
- बोल्ड फॉर्मेटिंग के लिए एकल तारांकन (*text*) का उपयोग करें
- व्यावहारिक निवेश सलाह दें
- प्रासंगिक होने पर उद्योग औसत के साथ तुलना करें
- व्यवसाय के लिए विशिष्ट जोखिमों का उल्लेख करें
- बातचीत की भाषा रखें और समझने में आसान बनाएं
- सटीक वर्तमान कीमत और 52-सप्ताह की तुलना शामिल करें
- ⚠️ सुनिश्चित करें कि प्रारूपण और प्रतीकों सहित पूरी प्रतिक्रिया 1,500 वर्णों से अधिक न हो
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating Hindi analysis:', error.message);
    return `${stockData.companyName.toUpperCase()}:

✅ *स्थिति:* विश्लेषण पूरा नहीं हो सका।

*संक्षिप्त सार:* ${stockData.companyName} का विस्तृत विश्लेषण तकनीकी समस्या के कारण उपलब्ध नहीं है।

*सलाह:* 👉 *रुकें* – कृपया बाद में कोशिश करें।`;
  }
}

// Generate detailed analysis in English (SAME QUALITY AS HINDI)
async function generateDetailedEnglishAnalysis(stockData) {
  try {
    const {
      companyName,
      currentPrice,
      percentChange,
      yearHigh,
      yearLow,
      metrics,
      industry,
    } = stockData;

    // Calculate price position
    let priceFromHigh = '';
    if (currentPrice && yearHigh) {
      const dropPercent = Math.round(
        ((yearHigh - currentPrice) / yearHigh) * 100
      );
      priceFromHigh = dropPercent > 0 ? `${dropPercent}% below high` : 'near high';
    }

    const prompt = `
You are an expert Indian stock analyst providing detailed analysis in English for retail investors.

Company: ${companyName}
Industry: ${industry}
Current Price: ₹${currentPrice}
Today's Change: ${percentChange}%
52-Week High: ₹${yearHigh}
52-Week Low: ₹${yearLow}
Current Price is ${priceFromHigh} below its 52-week high.

Financial Metrics:
| Metric              | Value                                 |
|---------------------|---------------------------------------|
| Market Cap          | ₹${metrics.marketCap || 'N/A'} crores |
| PE Ratio            | ${metrics.peRatio || 'N/A'}           |
| PB Ratio            | ${metrics.pbRatio || 'N/A'}           |
| ROE                 | ${metrics.roe || 'N/A'}%              |
| ROA                 | ${metrics.roa || 'N/A'}%              |
| Debt to Equity      | ${metrics.debtToEquity || 'N/A'}      |
| Net Profit Margin   | ${metrics.netProfitMargin || 'N/A'}%  |
| EPS                 | ₹${metrics.eps || 'N/A'}              |
| Revenue             | ₹${metrics.revenue || 'N/A'} crores   |
| Net Income          | ₹${metrics.netIncome || 'N/A'} crores |
| Revenue Growth      | ${metrics.revenueGrowth || 'N/A'}%    |
| EPS Growth          | ${metrics.epsGrowth || 'N/A'}%        |

Create analysis in this EXACT format:

*${companyName.toUpperCase()}:*

✅ *Company Size:* [Market cap info and size description with actual numbers]
✅ *Year-on-Year Profits:* [Profit trends with specific revenue and growth numbers]
✅ *Today's Share Price:* [Current price and position vs 52-week high/low with percentages]
⚠️ *Price vs Earnings (P/E):* [P/E analysis with actual ratio and valuation assessment]
✅ *Risks & Challenges:* [Specific business/market risks with debt levels]

*Summary:* [2-3 line summary of overall investment situation]

*Recommendation:* 👉 *BUY* – [Brief reasoning for recommendation with key numbers]

Symbol Guidelines:
- ✅ Positive indicators (e.g., strong profits, low debt, attractive valuation, robust growth, large stable company)
- ⚠️ Neutral/Mixed indicators (e.g., moderate concerns, industry risks, fair valuation, mixed signals)
- ❌ Negative indicators (e.g., losses, high debt, expensive valuation, declining trends, high risk)

Guidelines:
- Use simple English suitable for retail investors
- Include actual financial numbers wherever possible
- Be specific about percentages, amounts, and market cap in crores
- Use SINGLE asterisks for bold formatting (*text*)
- Provide practical investment advice with clear reasoning
- Compare with industry averages when relevant
- Mention specific business risks and opportunities
- Include exact current price and 52-week range analysis
- Use "crores" for Indian market cap and revenue figures
- ⚠️ Ensure the entire response, including formatting and symbols, does not exceed 1,500 characters
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.3,
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating English analysis:', error.message);
    return `*${stockData.companyName.toUpperCase()}:*

✅ *Status:* Analysis could not be completed.

*Summary:* Detailed analysis for ${stockData.companyName} is unavailable due to technical issues.

*Recommendation:* 👉 *WAIT* – Please try again later.`;
  }
}

// Main analysis function with language support
async function analyzeStocks(input, language = 'hindi') {
  console.log('\n🚀 Starting Detailed Stock Analysis...');
  console.log(`📝 Input: "${input}"`);
  console.log(`🗣️ Language: ${language}`);

  // Parse input - handle multiple stocks
  const stockNames = input.split(/[,\s]+/).filter(name => name.length > 0);
  const results = [];

  console.log(`\n🔍 Analyzing ${stockNames.length} stock(s)...`);

  for (const stockName of stockNames) {
    console.log(`\nFetching data for: ${stockName}`);

    // Fetch stock data
    const stockData = await fetchStockData(stockName);

    if (!stockData.success) {
      const errorMsg = language === 'english'
        ? `❌ ${stockName}: Stock not found. Please check the name.`
        : `❌ ${stockName}: स्टॉक नहीं मिला। सही नाम लिखें।`;
      results.push(errorMsg);
      continue;
    }

    // Generate detailed analysis in requested language
    console.log(`Generating detailed ${language} analysis for: ${stockData.companyName}`);

    let analysis;
    if (language === 'english') {
      analysis = await generateDetailedEnglishAnalysis(stockData);
    } else {
      analysis = await generateDetailedHindiAnalysis(stockData);
    }

    results.push(analysis);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Add disclaimer in appropriate language
  const disclaimer = language === 'english'
    ? '\n⚠️ This is information only, not investment advice.'
    : '\n⚠️ यह सिर्फ जानकारी है, निवेश सलाह नहीं है।';

  results.push(disclaimer);

  return results.join('\n\n---\n\n');
}

// Backward compatibility - if no language specified, default to Hindi
const originalAnalyzeStocks = analyzeStocks;

// Command line interface
async function main() {
  const input = process.argv[2];
  const language = process.argv[3] || 'hindi';

  if (!input) {
    console.log('Usage: node stock-analysis.js "stock names" [language]');
    console.log('Examples:');
    console.log('  node stock-analysis.js "TCS" hindi');
    console.log('  node stock-analysis.js "TCS" english');
    console.log('  node stock-analysis.js "Reliance TCS Infosys" english');
    return;
  }

  if (!process.env.OPENAI_API_KEY || !process.env.RAPIDAPI_KEY) {
    console.log('❌ Missing API Keys!');
    console.log('Please set both keys in .env file:');
    console.log('OPENAI_API_KEY=your_openai_key_here');
    console.log('RAPIDAPI_KEY=your_rapidapi_key_here');
    return;
  }

  try {
    const startTime = Date.now();
    const result = await analyzeStocks(input, language);
    const processingTime = Date.now() - startTime;

    console.log('\n' + '='.repeat(70));
    console.log(`📱 WHATSAPP RESPONSE (${language.toUpperCase()}):`);
    console.log('='.repeat(70));
    console.log(result);
    console.log('='.repeat(70));
    console.log(`⏱️ Processing Time: ${processingTime}ms`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { analyzeStocks, fetchStockData };