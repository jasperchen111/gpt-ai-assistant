import axios from 'axios';

const FOREX_PAIRS = {
  'XAUUSD': { name: '黃金/美元', symbol: 'XAU/USD' },
  'EURUSD': { name: '歐元/美元', symbol: 'EUR/USD' },
  'GBPUSD': { name: '英鎊/美元', symbol: 'GBP/USD' },
  'USDJPY': { name: '美元/日圓', symbol: 'USD/JPY' },
};

// 使用 Twelve Data API (免費: 800次/天, 8次/分鐘)
const TWELVE_DATA_URL = 'https://api.twelvedata.com';

// 備用: Alpha Vantage
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query';

export const getForexPrice = async (pair) => {
  const symbol = FOREX_PAIRS[pair]?.symbol || pair;

  try {
    // 使用 Twelve Data 免費 API (不需要 key 的基本查詢)
    const response = await axios.get(`${TWELVE_DATA_URL}/price`, {
      params: { symbol },
      timeout: 10000,
    });

    if (response.data && response.data.price) {
      return {
        code: '0',
        data: {
          pair,
          symbol,
          price: parseFloat(response.data.price),
          name: FOREX_PAIRS[pair]?.name || pair,
        },
      };
    }
  } catch (error) {
    console.error(`獲取 ${pair} 價格失敗:`, error.message);
  }

  return { code: '-1', error: '無法獲取價格' };
};

export const getForexCandles = async (pair, interval = '1h', limit = 50) => {
  const symbol = FOREX_PAIRS[pair]?.symbol || pair;

  try {
    const response = await axios.get(`${TWELVE_DATA_URL}/time_series`, {
      params: {
        symbol,
        interval,
        outputsize: limit,
      },
      timeout: 15000,
    });

    if (response.data && response.data.values) {
      // 轉換為統一格式 [timestamp, open, high, low, close, volume]
      const candles = response.data.values.map(v => [
        new Date(v.datetime).getTime().toString(),
        v.open,
        v.high,
        v.low,
        v.close,
        '0',
      ]);

      return { code: '0', data: candles };
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
  getForexPrice,
  getForexCandles,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateBollingerBands,
  calculateTechnicalIndicators,
};
