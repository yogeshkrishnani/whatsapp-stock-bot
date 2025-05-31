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

// Helper function to find financial statement item by key
function findFinancialItem(financialArray, keyName) {
  if (!Array.isArray(financialArray)) return null;
  const item = financialArray.find(item => item.key === keyName);
  if (item && item.value !== null && item.value !== undefined) {
    const value = parseFloat(item.value);
    return isNaN(value) ? null : value;
  }
  return null;
}

// New function to prepare 3-year historical financial data and risk assessment
function prepareHistoricalFinancialData(stockData) {
  const historicalData = {
    // For populating existing metrics placeholders
    revenueGrowth: null,
    epsGrowth: null,

    // For Year-on-Year Profits section context
    contextSummary: '',

    // Risk assessment for consistent evaluation
    riskLevel: 'moderate',
    volatilityScore: 0,

    // Raw 3-year data for debugging
    yearlyData: []
  };

  try {
    // Debug: Check what data structure we have
    console.log('🔍 Checking stockData structure:');
    console.log(`   Has financials: ${!!stockData.financials}`);
    console.log(`   Financials type: ${typeof stockData.financials}`);
    console.log(`   Financials length: ${stockData.financials?.length || 'N/A'}`);

    // Check if financials data exists
    if (!stockData.financials || !Array.isArray(stockData.financials)) {
      console.log('⚠️ No financials data available for historical analysis');
      return historicalData; // Return default values
    }

    // Get last 3 years of Annual financial data
    const annualData = stockData.financials
      .filter(f => f.Type === 'Annual')
      .slice(0, 3) // Most recent 3 years
      .reverse(); // Arrange oldest to newest for growth calculation

    if (annualData.length === 0) {
      console.log('⚠️ No Annual financial data found');
      return historicalData; // Return default values
    }

    console.log(`📊 Found ${annualData.length} years of Annual data`);

    // Extract financial data for each year
    annualData.forEach(yearData => {
      const { INC, BAL } = yearData.stockFinancialMap || {};
      if (INC) {
        const revenue = findFinancialItem(INC, 'Revenue') ||
            findFinancialItem(INC, 'TotalRevenue');
        const netIncome = findFinancialItem(INC, 'NetIncome') ||
            findFinancialItem(INC, 'NetIncomeAfterTaxes');

        // Get shares outstanding for EPS calculation
        const sharesOutstanding = BAL ? findFinancialItem(BAL, 'TotalCommonSharesOutstanding') : null;
        const eps = (netIncome && sharesOutstanding) ? netIncome / sharesOutstanding : null;

        historicalData.yearlyData.push({
          year: yearData.FiscalYear,
          revenue: revenue,
          netIncome: netIncome,
          eps: eps,
          margin: (revenue && netIncome) ? ((netIncome / revenue) * 100) : null
        });
      }
    });

    // Calculate growth rates if we have at least 2 years of data
    if (historicalData.yearlyData.length >= 2) {
      const current = historicalData.yearlyData[historicalData.yearlyData.length - 1];
      const previous = historicalData.yearlyData[historicalData.yearlyData.length - 2];

      // Revenue Growth Year-over-Year
      if (current.revenue && previous.revenue) {
        historicalData.revenueGrowth = ((current.revenue - previous.revenue) / previous.revenue * 100).toFixed(1);
      }

      // EPS Growth Year-over-Year
      if (current.eps && previous.eps) {
        historicalData.epsGrowth = ((current.eps - previous.eps) / previous.eps * 100).toFixed(1);
      }

      // Calculate volatility for risk assessment
      const revenueVolatility = Math.abs(parseFloat(historicalData.revenueGrowth || 0));
      const profitChange = current.netIncome && previous.netIncome ?
        Math.abs((current.netIncome - previous.netIncome) / previous.netIncome * 100) : 0;

      historicalData.volatilityScore = Math.max(revenueVolatility, profitChange);

      // Risk level assessment
      if (historicalData.volatilityScore > 30) {
        historicalData.riskLevel = 'high';
      } else if (historicalData.volatilityScore < 15) {
        historicalData.riskLevel = 'low';
      } else {
        historicalData.riskLevel = 'moderate';
      }

      // Create context summary for Year-on-Year Profits section
      if (historicalData.yearlyData.length >= 2) {
        const currentYear = current.year;
        const previousYear = previous.year;
        const revenueChange = parseFloat(historicalData.revenueGrowth || 0);
        const profitGrowth = current.netIncome && previous.netIncome ?
          ((current.netIncome - previous.netIncome) / previous.netIncome * 100) : 0;

        let trendDescription = '';
        if (historicalData.yearlyData.length >= 3) {
          const oldest = historicalData.yearlyData[0];
          // Check if this is a recovery story
          if (profitGrowth > 15 && previous.netIncome < oldest.netIncome) {
            trendDescription = `recovering from FY${previousYear} decline`;
          } else if (profitGrowth > 10) {
            trendDescription = 'showing growth momentum';
          } else if (profitGrowth < -15) {
            trendDescription = 'experiencing declining performance';
          } else {
            trendDescription = 'showing mixed performance';
          }
        } else {
          if (profitGrowth > 10) {
            trendDescription = 'showing growth';
          } else if (profitGrowth < -10) {
            trendDescription = 'showing decline';
          } else {
            trendDescription = 'showing stable performance';
          }
        }

        historicalData.contextSummary = `Revenue ${revenueChange > 0 ? 'up' : 'down'} ${Math.abs(revenueChange).toFixed(1)}% to ₹${current.revenue} crores, ${trendDescription} with profit ${profitGrowth > 0 ? 'growth' : 'decline'} of ${profitGrowth.toFixed(1)}%`;
      }
    }

    console.log('📊 Historical Financial Analysis:');
    console.log(`   Revenue Growth YoY: ${historicalData.revenueGrowth}%`);
    console.log(`   EPS Growth YoY: ${historicalData.epsGrowth}%`);
    console.log(`   Risk Level: ${historicalData.riskLevel} (Volatility: ${historicalData.volatilityScore.toFixed(1)})`);
    console.log(`   Context: ${historicalData.contextSummary}`);

    return historicalData;

  } catch (error) {
    console.error('Error preparing historical financial data:', error.message);
    return historicalData; // Return default values
  }
}

// Modified extractKeyMetrics to include historical context
function extractKeyMetricsWithHistory(stockData) {
  // Get base metrics using existing function
  const metrics = extractKeyMetrics(stockData);

  // Add historical analysis
  const historicalData = prepareHistoricalFinancialData(stockData);

  // Populate the existing placeholder fields that were showing N/A
  metrics.revenueGrowth = historicalData.revenueGrowth;
  metrics.epsGrowth = historicalData.epsGrowth;

  // Add risk assessment to metrics
  metrics.riskLevel = historicalData.riskLevel;
  metrics.volatilityScore = historicalData.volatilityScore;

  // Add context for AI prompt
  metrics.historicalContext = historicalData.contextSummary;

  return metrics;
}

// FIXED: Extract comprehensive metrics from FINANCIALS section (not keyMetrics)
function extractKeyMetrics(stockData) {
  const metrics = {};

  try {
    // Use actual financial statements instead of unreliable keyMetrics
    const financials = stockData.financials;
    if (!financials || !Array.isArray(financials)) {
      console.log('No financials data available');
      return metrics;
    }

    let latestAnnual = null;
    for (let i = 0; i < financials.length; i++) {
      if (financials[i].Type === 'Annual') {
        latestAnnual = financials[i];
        console.log(`✅ Using Annual data for FY${latestAnnual.FiscalYear}`);
        break;
      }
    }

    if (!latestAnnual || !latestAnnual.stockFinancialMap) {
      console.log('No annual financial data found');
      return metrics;
    }

    const { INC, BAL, CAS } = latestAnnual.stockFinancialMap;

    // INCOME STATEMENT DATA (INC) - VERIFIED KEYS
    if (INC) {
      metrics.revenue = findFinancialItem(INC, 'Revenue') ||
          findFinancialItem(INC, 'TotalRevenue');

      metrics.netIncome = findFinancialItem(INC, 'NetIncome') ||
          findFinancialItem(INC, 'NetIncomeAfterTaxes');

      metrics.operatingIncome = findFinancialItem(INC, 'OperatingIncome');
      metrics.grossProfit = findFinancialItem(INC, 'GrossProfit');
      metrics.costOfRevenue = findFinancialItem(INC, 'CostofRevenueTotal');

      // Calculate margins if possible
      if (metrics.revenue && metrics.netIncome) {
        metrics.netProfitMargin = (metrics.netIncome / metrics.revenue) * 100;
      }
      if (metrics.revenue && metrics.grossProfit) {
        metrics.grossMargin = (metrics.grossProfit / metrics.revenue) * 100;
      }
      if (metrics.revenue && metrics.operatingIncome) {
        metrics.operatingMargin = (metrics.operatingIncome / metrics.revenue) * 100;
      }
    }

    // BALANCE SHEET DATA (BAL) - VERIFIED KEYS
    if (BAL) {
      metrics.totalAssets = findFinancialItem(BAL, 'TotalAssets');
      metrics.totalEquity = findFinancialItem(BAL, 'TotalEquity');
      metrics.totalDebt = findFinancialItem(BAL, 'TotalDebt') ||
          findFinancialItem(BAL, 'TotalLongTermDebt');
      metrics.cash = findFinancialItem(BAL, 'Cash') ||
          findFinancialItem(BAL, 'CashandShortTermInvestments');

      // Calculate key ratios
      if (metrics.totalDebt && metrics.totalEquity) {
        metrics.debtToEquity = metrics.totalDebt / metrics.totalEquity;
      }
      if (metrics.netIncome && metrics.totalEquity) {
        metrics.roe = (metrics.netIncome / metrics.totalEquity) * 100;
      }
      if (metrics.netIncome && metrics.totalAssets) {
        metrics.roa = (metrics.netIncome / metrics.totalAssets) * 100;
      }

      // Shares outstanding for per-share calculations
      const sharesOutstanding = findFinancialItem(BAL, 'TotalCommonSharesOutstanding');
      if (sharesOutstanding && metrics.netIncome) {
        metrics.eps = metrics.netIncome / sharesOutstanding;
      }

      // Calculate market cap if we have current price
      if (stockData.currentPrice && sharesOutstanding) {
        const currentPrice = parseFloat(stockData.currentPrice.BSE) ||
            parseFloat(stockData.currentPrice.NSE);
        if (currentPrice) {
          metrics.marketCap = currentPrice * sharesOutstanding;
          metrics.currentPrice = currentPrice;
        }
      }
    }

    // CASH FLOW DATA (CAS) - Additional insights
    if (CAS) {
      metrics.operatingCashFlow = findFinancialItem(CAS, 'CashfromOperatingActivities');
      metrics.freeCashFlow = findFinancialItem(CAS, 'CashfromOperatingActivities');

      const capex = findFinancialItem(CAS, 'CapitalExpenditures');
      if (metrics.operatingCashFlow && capex) {
        metrics.freeCashFlow = metrics.operatingCashFlow + capex; // capex is negative
      }
    }

    // Use ONLY ratios and percentages from keyMetrics (not absolute values)
    if (stockData.keyMetrics && stockData.keyMetrics.valuation) {
      const valuation = stockData.keyMetrics.valuation;
      metrics.peRatio = findFinancialItem(valuation, 'pPerEExcludingExtraordinaryItemsMostRecentFiscalYear');
      metrics.pbRatio = findFinancialItem(valuation, 'priceToBookMostRecentFiscalYear');
      metrics.dividendYield = findFinancialItem(valuation, 'currentDividendYieldCommonStockPrimaryIssueLTM');
    }

    // Market data from main response (this is usually accurate)
    metrics.yearHigh = parseFloat(stockData.yearHigh) || null;
    metrics.yearLow = parseFloat(stockData.yearLow) || null;
    metrics.percentChange = parseFloat(stockData.percentChange) || 0;

    console.log('✅ Extracted metrics from FINANCIALS section (accurate data)');
    console.log(`   Revenue: ₹${metrics.revenue} crores (vs keyMetrics inflated data)`);
    console.log(`   Net Income: ₹${metrics.netIncome} crores (vs keyMetrics inflated data)`);
    console.log(`   Net Margin: ${metrics.netProfitMargin?.toFixed(1)}%`);
    console.log(`   ROE: ${metrics.roe?.toFixed(1)}%`);
    console.log(`   Debt/Equity: ${metrics.debtToEquity?.toFixed(2)}`);

  } catch (error) {
    console.error('Error extracting metrics from financials:', error.message);
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
        metrics: extractKeyMetricsWithHistory(stockData), // <- Only this line changed
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

// Generate detailed analysis in English (SAME QUALITY AS HINDI)
async function generateDetailedEnglishAnalysis(stockData) {
  try {
    const {
      companyName,
      currentPrice,
      percentChange,
      yearHigh,
      yearLow,
      industry,
    } = stockData;

    const metrics = stockData.metrics;

    let priceFromHigh = '';
    if (currentPrice && yearHigh) {
      const dropPercent = Math.round(
        ((yearHigh - currentPrice) / yearHigh) * 100
      );
      priceFromHigh = dropPercent > 0 ? `${dropPercent}% below high` : 'near high';
    }

    const prompt = `
You are an expert Indian stock analyst providing detailed analysis in English for retail investors. 

IMPORTANT: Keep total response under 1600 characters including all formatting.

— SYMBOL DEFINITIONS (use **only** these)** —  
• ✅ if the metric is genuinely POSITIVE (e.g., profits ↑, margins healthy, low debt, valuation attractive)  
• ⚠️ if the metric is NEUTRAL/MIXED (e.g., fair valuation, moderate concerns, small declines, P/E above 30)  
• ❌ if the metric is genuinely NEGATIVE (e.g., losses, declining revenue, high debt, expensive valuation)  
• If a company has losses or declining revenue, ALWAYS use ❌ for Year-on-Year Profits.
• If a company has severe issues (negative margins, financial instability), ALWAYS use ❌ for Risks & Challenges.

— Guidelines:
- P/E ratio above 30 is generally considered high, but can be acceptable for growth stocks.
- Provide Buy Recommendation, If the company is fundamentally strong but valuation is high.
- Use simple English suitable for retail investors
- Include actual financial numbers wherever possible
- Be specific about percentages, amounts, and market cap in crores
- Use SINGLE asterisks for bold formatting (*text*)
- Provide practical investment advice with clear reasoning
- Compare with industry averages when relevant
- Mention specific business risks and opportunities
- Include exact current price and 52-week range analysis
- Use "crores" for Indian market cap and revenue figures
- Consider the ${metrics.riskLevel} risk level based on financial volatility in your recommendation
- ⚠️ Ensure the entire response, including formatting and symbols, does not exceed 1,500 characters

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

— YOUR TASK — 

Create analysis in this EXACT format:

*${companyName.toUpperCase()}:*

✅/⚠️/❌ *Company Size:* [Market cap info and size description with actual numbers]
✅/⚠️/❌ *Current Price:* [Current price with 52-week high and 52-week low and price position]
✅/⚠️/❌ *Year-on-Year Profits:* [${metrics.historicalContext || 'Profit trends with specific revenue and growth numbers'}]
✅/⚠️/❌ *Price vs Earnings (P/E):* [P/E analysis with actual ratio and valuation assessment]
✅/⚠️/❌ *Risks & Challenges:* [Specific business/market risks with debt levels and ${metrics.riskLevel} volatility risk]

*Summary:* [2-3 line summary of overall investment situation]

*Recommendation:* 👉 *BUY/HOLD/SELL* – [Brief reasoning for recommendation]
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

async function translateToHindi(englishAnalysis) {
  try {
    const translationPrompt = `
Translate this English stock analysis to conversational Hindi for 60+ Indian retail investors:

IMPORTANT: Keep total response under 1500 characters including all formatting.

PRESERVE EXACTLY:
- All WhatsApp formatting: *bold text*, symbols ✅⚠️❌
- All numbers, percentages, ₹ amounts
- Line breaks and bullet structure
- Company names and technical terms in parentheses
- Do not add, remove, or reflow any punctuation, numbers, or symbols
LANGUAGE STYLE:
- Use simple, conversational Hindi (not pure/formal Hindi)
- Mix in common English finance words sparingly
- For any finance term not listed below, either leave it in English or add a brief Hindi parenthetical
SPECIFIC TRANSLATIONS:
- "Market Cap" → "कंपनी का साइज़"
- "Debt" → "कर्जा"
- "Revenue" → "कारोबार"
- "Profit" → "प्रोफिट"
MAINTAIN STRUCTURE:
- Same headings/bullets in same order  
- Same recommendation logic and symbols (✅⚠️❌)
EXAMPLE:
"Market Cap of ₹5000cr" → "कंपनी का साइज़ ₹5000 करोड़"
CRITICAL:
- *सलाह:* 👉 *खरीदें/रुकें/बेचें* – [मुख्य संख्याओं के साथ संक्षिप्त तर्क]
NOTE: Replace \`${englishAnalysis}\` with the actual analysis text—do not include the placeholder.
  
English Analysis to Translate:
${englishAnalysis}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: translationPrompt }],
      max_tokens: 800,
      temperature: 0.2, // Lower temperature for more consistent translation
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error translating to Hindi:', error.message);
    // Fallback: Return a simple Hindi error message
    return 'विश्लेषण अनुवाद में त्रुटि हुई। कृपया बाद में कोशिश करें।\n\n⚠️ यह सिर्फ जानकारी है, निवेश सलाह नहीं है।';
  }
}

// Main analysis function with language support
async function analyzeStocks(input, language = 'hindi') {
  console.log('\n🚀 Starting Detailed Stock Analysis...');
  console.log(`📝 Input: "${input}"`);
  console.log(`🗣️ Language: ${language}`);

  const stockNames = input.split(',').map(s => s.trim()).filter(name => name.length > 0);
  const results = [];

  console.log(`\n🔍 Analyzing ${stockNames.length} stock(s)...`);

  for (const stockName of stockNames) {
    console.log(`\nFetching data for: ${stockName}`);

    const stockData = await fetchStockData(stockName);

    if (!stockData.success) {
      const errorMsg = language === 'english'
        ? `❌ ${stockName}: Stock not found. Please check the name.`
        : `❌ ${stockName}: स्टॉक नहीं मिला। सही नाम लिखें।`;
      results.push(errorMsg);
      continue;
    }

    console.log(`Generating English analysis for: ${stockData.companyName}`);
    const englishAnalysis = await generateDetailedEnglishAnalysis(stockData);

    let finalAnalysis;

    if (language === 'english') {
      // Return English analysis as-is
      finalAnalysis = englishAnalysis;
    } else {
      console.log(`Translating to Hindi for: ${stockData.companyName}`);
      finalAnalysis = await translateToHindi(englishAnalysis);
    }

    results.push(finalAnalysis);

    // Rate limiting between stocks
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Add disclaimer in appropriate language
  const disclaimer = language === 'english'
    ? '\n⚠️ This is information only, not investment advice.'
    : '\n⚠️ यह सिर्फ जानकारी है, निवेश सलाह नहीं है।';

  results.push(disclaimer);

  return results.join('\n\n---\n\n');
}

async function main() {
  const input = process.argv[2];
  const language = process.argv[3] || 'hindi';

  if (!input) {
    console.log('Usage: node stock-analysis.js "stock names" [language]');
    console.log('Examples:');
    console.log('  node stock-analysis.js "TCS" hindi');
    console.log('  node stock-analysis.js "TCS" english');
    console.log('  node stock-analysis.js "Reliance TCS" english');
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
    console.log(`📱 WHATSAPP RESPONSE (${language.toUpperCase()}) - NEW TRANSLATION APPROACH:`);
    console.log('='.repeat(70));
    console.log(result);
    console.log('='.repeat(70));
    console.log(`⏱️ Processing Time: ${processingTime}ms`);
    console.log(`🔄 Method: English-first ${language === 'hindi' ? '→ Hindi Translation' : '(Direct)'}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { analyzeStocks, fetchStockData };