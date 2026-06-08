import axios from 'axios';

const FOREX_PAIRS = {
  'XAUUSD': { name: '黃金/美元', yahoo: 'GC=F' },
  'EURUSD': { name: '歐元/美元', yahoo: 'EURUSD=X' },
  'GBPUSD': { name: '英鎊/美元', yahoo: 'GBPUSD=X' },
  'USDJPY': { name: '美元/日圓', yahoo: 'JPY=X' },
};

export const getForexCandles = async (pair, interval = '1h', limit = 50) => {
  const yahooSymbol = FOREX_PAIRS[pair]?.yahoo || pair;

  try {
    // 使用 Yahoo Finance API (完全免費，不需要 Key)
    const period1 = Math.floor(Date.now() / 1000) - (limit * 3600);
    const period2 = Math.floor(Date.now() / 1000);

    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`,
      {
        params: {
          interval: '1h',
          period1,
          period2,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 15000,
      }
    );

    const result = response.data?.chart?.result?.[0];
    if (result && result.timestamp && result.indicators?.quote?.[0]) {
      const { timestamp } = result;
      const quote = result.indicators.quote[0];

      const candles = [];
      for (let i = 0; i < timestamp.length; i++) {
        if (quote.open[i] && quote.high[i] && quote.low[i] && quote.close[i]) {
          candles.push([
            (timestamp[i] * 1000).toString(),
            quote.open[i].toString(),
            quote.high[i].toString(),
            quote.low[i].toString(),
            quote.close[i].toString(),
            (quote.volume?.[i] || 0).toString(),
          ]);
        }
      }

      return { code: '0', data: candles.reverse() };
    }
  } catch (error) {
    console.error(`獲取 ${pair} K線失敗:`, error.message);
  }

  return { code: '-1', data: [] };
};

// 技術指標計算
export const calculateSMA = (prices, period) => {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
};

export const calculateEMA = (prices, period) => {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
};

export const calculateRSI = (prices, period = 14) => {
  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

export const calculateBollingerBands = (prices, period = 20, stdDev = 2) => {
  if (prices.length < period) return null;

  const sma = calculateSMA(prices, period);
  const recentPrices = prices.slice(-period);
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: sma + stdDev * std,
    middle: sma,
    lower: sma - stdDev * std,
  };
};

export const calculateTechnicalIndicators = (candles) => {
  const closes = candles.map((c) => parseFloat(c[4])).reverse();

  return {
    sma20: calculateSMA(closes, 20),
    sma50: calculateSMA(closes, 50),
    ema12: calculateEMA(closes, 12),
    ema26: calculateEMA(closes, 26),
    rsi14: calculateRSI(closes, 14),
    bollingerBands: calculateBollingerBands(closes),
    currentPrice: closes[closes.length - 1],
  };
};

export default {
  FOREX_PAIRS,
  getForexCandles,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  calculateTechnicalIndicators,
};
