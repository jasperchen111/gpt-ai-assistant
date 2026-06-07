import axios from 'axios';

const BINANCE_BASE_URL = 'https://api.binance.com';

const client = axios.create({
  baseURL: BINANCE_BASE_URL,
  timeout: 30000,
});

const formatSymbol = (instId) => {
  return instId.replace('-', '');
};

export const getTicker = async (instId = 'BTC-USDT') => {
  const symbol = formatSymbol(instId);
  const response = await client.get(`/api/v3/ticker/24hr?symbol=${symbol}`);

  return {
    code: '0',
    data: [{
      instId,
      last: response.data.lastPrice,
      changePerc: (parseFloat(response.data.priceChangePercent) / 100).toString(),
      vol24h: response.data.volume,
      high24h: response.data.highPrice,
      low24h: response.data.lowPrice,
    }],
  };
};

export const getCandles = async (instId = 'BTC-USDT', bar = '1H', limit = 100) => {
  const symbol = formatSymbol(instId);
  const intervalMap = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1H': '1h',
    '4H': '4h',
    '1D': '1d',
  };
  const interval = intervalMap[bar] || '1h';

  const response = await client.get(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);

  const data = response.data.map((candle) => [
    candle[0].toString(),
    candle[1],
    candle[2],
    candle[3],
    candle[4],
    candle[5],
  ]);

  return { code: '0', data };
};

export const getHistoryCandles = async (instId = 'BTC-USDT', bar = '1H', after = '', before = '', limit = 100) => {
  const symbol = formatSymbol(instId);
  const intervalMap = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1H': '1h',
    '4H': '4h',
    '1D': '1d',
  };
  const interval = intervalMap[bar] || '1h';

  let url = `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  if (after) url += `&endTime=${after}`;

  const response = await client.get(url);

  const data = response.data.map((candle) => [
    candle[0].toString(),
    candle[1],
    candle[2],
    candle[3],
    candle[4],
    candle[5],
  ]);

  return { code: '0', data };
};

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

export const calculateMACD = (prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  if (prices.length < slowPeriod) return null;

  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  const macd = fastEMA - slowEMA;

  return { macd, signal: null, histogram: null };
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

export const calculateATR = (candles, period = 14) => {
  if (candles.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high = parseFloat(candles[i][2]);
    const low = parseFloat(candles[i][3]);
    const prevClose = parseFloat(candles[i - 1][4]);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
};

export const calculateTechnicalIndicators = (candles) => {
  const closes = candles.map((c) => parseFloat(c[4])).reverse();

  return {
    sma20: calculateSMA(closes, 20),
    sma50: calculateSMA(closes, 50),
    ema12: calculateEMA(closes, 12),
    ema26: calculateEMA(closes, 26),
    rsi14: calculateRSI(closes, 14),
    macd: calculateMACD(closes),
    bollingerBands: calculateBollingerBands(closes),
    atr14: calculateATR(candles, 14),
    currentPrice: closes[closes.length - 1],
  };
};

export const placeOrder = async () => {
  throw new Error('此模式不支援交易功能');
};

export const cancelOrder = async () => {
  throw new Error('此模式不支援交易功能');
};

export const getAccountBalance = async () => {
  throw new Error('此模式不支援帳戶查詢');
};

export const getOrderBook = async () => {
  throw new Error('此模式不支援訂單簿查詢');
};

export default {
  getTicker,
  getCandles,
  getHistoryCandles,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateTechnicalIndicators,
  placeOrder,
  cancelOrder,
  getAccountBalance,
  getOrderBook,
};
