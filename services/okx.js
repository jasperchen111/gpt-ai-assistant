import axios from 'axios';
import crypto from 'crypto';
import config from '../config/index.js';

const OKX_BASE_URL = 'https://www.okx.com';

const client = axios.create({
  baseURL: OKX_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const generateSignature = (timestamp, method, requestPath, body = '') => {
  const prehash = timestamp + method + requestPath + body;
  return crypto
    .createHmac('sha256', config.OKX_SECRET_KEY || '')
    .update(prehash)
    .digest('base64');
};

const getAuthHeaders = (method, requestPath, body = '') => {
  const timestamp = new Date().toISOString();
  const sign = generateSignature(timestamp, method, requestPath, body);

  return {
    'OK-ACCESS-KEY': config.OKX_API_KEY || '',
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': config.OKX_PASSPHRASE || '',
    'x-simulated-trading': config.OKX_SIMULATED === 'true' ? '1' : '0',
  };
};

export const getTicker = async (instId = 'BTC-USDT') => {
  const response = await client.get(`/api/v5/market/ticker?instId=${instId}`);
  return response.data;
};

export const getCandles = async (instId = 'BTC-USDT', bar = '1H', limit = 100) => {
  const response = await client.get(
    `/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`
  );
  return response.data;
};

export const getHistoryCandles = async (instId = 'BTC-USDT', bar = '1H', after = '', before = '', limit = 100) => {
  let url = `/api/v5/market/history-candles?instId=${instId}&bar=${bar}&limit=${limit}`;
  if (after) url += `&after=${after}`;
  if (before) url += `&before=${before}`;
  const response = await client.get(url);
  return response.data;
};

export const getOrderBook = async (instId = 'BTC-USDT', sz = 20) => {
  const response = await client.get(`/api/v5/market/books?instId=${instId}&sz=${sz}`);
  return response.data;
};

export const getAccountBalance = async () => {
  const requestPath = '/api/v5/account/balance';
  const headers = getAuthHeaders('GET', requestPath);
  const response = await client.get(requestPath, { headers });
  return response.data;
};

export const placeOrder = async (instId, side, ordType, sz, px = null) => {
  const requestPath = '/api/v5/trade/order';
  const body = {
    instId,
    tdMode: 'cash',
    side,
    ordType,
    sz: String(sz),
  };
  if (px) body.px = String(px);

  const bodyStr = JSON.stringify(body);
  const headers = getAuthHeaders('POST', requestPath, bodyStr);
  const response = await client.post(requestPath, body, { headers });
  return response.data;
};

export const cancelOrder = async (instId, ordId) => {
  const requestPath = '/api/v5/trade/cancel-order';
  const body = { instId, ordId };
  const bodyStr = JSON.stringify(body);
  const headers = getAuthHeaders('POST', requestPath, bodyStr);
  const response = await client.post(requestPath, body, { headers });
  return response.data;
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

export default {
  getTicker,
  getCandles,
  getHistoryCandles,
  getOrderBook,
  getAccountBalance,
  placeOrder,
  cancelOrder,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateTechnicalIndicators,
};
