import axios from 'axios';
import crypto from 'crypto';
import config from '../config/index.js';
import { handleFulfilled, handleRejected, handleRequest } from './utils/index.js';

const client = axios.create({
  baseURL: config.OKX_BASE_URL,
  timeout: config.OKX_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip, deflate, compress',
  },
});

const generateSignature = (timestamp, method, requestPath, body = '') => {
  const message = timestamp + method + requestPath + body;
  return crypto
    .createHmac('sha256', config.OKX_SECRET_KEY)
    .update(message)
    .digest('base64');
};

const getTimestamp = () => new Date().toISOString();

client.interceptors.request.use((c) => {
  const timestamp = getTimestamp();
  const method = c.method.toUpperCase();
  const requestPath = c.url;
  const body = c.data ? JSON.stringify(c.data) : '';

  c.headers['OK-ACCESS-KEY'] = config.OKX_API_KEY;
  c.headers['OK-ACCESS-SIGN'] = generateSignature(timestamp, method, requestPath, body);
  c.headers['OK-ACCESS-TIMESTAMP'] = timestamp;
  c.headers['OK-ACCESS-PASSPHRASE'] = config.OKX_PASSPHRASE;

  if (config.OKX_SIMULATED) {
    c.headers['x-simulated-trading'] = '1';
  }

  return handleRequest(c);
});

client.interceptors.response.use(handleFulfilled, (err) => {
  if (err.response?.data?.msg) {
    err.message = err.response.data.msg;
  }
  return handleRejected(err);
});

const getTickers = async (instType = 'SPOT') => {
  const response = await client.get('/api/v5/market/tickers', {
    params: { instType },
  });
  return response.data;
};

const getTicker = async (instId) => {
  const response = await client.get('/api/v5/market/ticker', {
    params: { instId },
  });
  return response.data;
};

const getCandles = async (instId, bar = '1H', limit = 100) => {
  const response = await client.get('/api/v5/market/candles', {
    params: { instId, bar, limit },
  });
  return response.data;
};

const getOrderBook = async (instId, sz = 20) => {
  const response = await client.get('/api/v5/market/books', {
    params: { instId, sz },
  });
  return response.data;
};

const getTrades = async (instId, limit = 100) => {
  const response = await client.get('/api/v5/market/trades', {
    params: { instId, limit },
  });
  return response.data;
};

const getAccountBalance = async () => {
  const response = await client.get('/api/v5/account/balance');
  return response.data;
};

const getPositions = async (instType) => {
  const params = instType ? { instType } : {};
  const response = await client.get('/api/v5/account/positions', { params });
  return response.data;
};

const placeOrder = async ({
  instId,
  tdMode = 'cash',
  side,
  ordType = 'limit',
  sz,
  px,
  tgtCcy,
  clOrdId,
}) => {
  const body = {
    instId,
    tdMode,
    side,
    ordType,
    sz,
  };

  if (px) body.px = px;
  if (tgtCcy) body.tgtCcy = tgtCcy;
  if (clOrdId) body.clOrdId = clOrdId;

  const response = await client.post('/api/v5/trade/order', body);
  return response.data;
};

const cancelOrder = async (instId, ordId, clOrdId) => {
  const body = { instId };
  if (ordId) body.ordId = ordId;
  if (clOrdId) body.clOrdId = clOrdId;

  const response = await client.post('/api/v5/trade/cancel-order', body);
  return response.data;
};

const getOrderDetails = async (instId, ordId, clOrdId) => {
  const params = { instId };
  if (ordId) params.ordId = ordId;
  if (clOrdId) params.clOrdId = clOrdId;

  const response = await client.get('/api/v5/trade/order', { params });
  return response.data;
};

const getPendingOrders = async (instType, instId) => {
  const params = {};
  if (instType) params.instType = instType;
  if (instId) params.instId = instId;

  const response = await client.get('/api/v5/trade/orders-pending', { params });
  return response.data;
};

const getOrderHistory = async (instType = 'SPOT', limit = 100) => {
  const response = await client.get('/api/v5/trade/orders-history', {
    params: { instType, limit },
  });
  return response.data;
};

const getInstruments = async (instType = 'SPOT') => {
  const response = await client.get('/api/v5/public/instruments', {
    params: { instType },
  });
  return response.data;
};

const formatTickerData = (ticker) => ({
  symbol: ticker.instId,
  lastPrice: parseFloat(ticker.last),
  high24h: parseFloat(ticker.high24h),
  low24h: parseFloat(ticker.low24h),
  volume24h: parseFloat(ticker.vol24h),
  priceChange24h: parseFloat(ticker.last) - parseFloat(ticker.open24h),
  priceChangePercent24h: ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h) * 100).toFixed(2),
  bidPrice: parseFloat(ticker.bidPx),
  askPrice: parseFloat(ticker.askPx),
  timestamp: parseInt(ticker.ts, 10),
});

const formatCandleData = (candle) => ({
  timestamp: parseInt(candle[0], 10),
  open: parseFloat(candle[1]),
  high: parseFloat(candle[2]),
  low: parseFloat(candle[3]),
  close: parseFloat(candle[4]),
  volume: parseFloat(candle[5]),
});

const calculateTechnicalIndicators = (candles) => {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const sma = (period) => {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  const ema = (period) => {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let emaValue = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i += 1) {
      emaValue = closes[i] * k + emaValue * (1 - k);
    }
    return emaValue;
  };

  const rsi = (period = 14) => {
    if (closes.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = closes.length - period; i < closes.length; i += 1) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const macd = () => {
    const ema12 = ema(12);
    const ema26 = ema(26);
    if (ema12 === null || ema26 === null) return null;
    const macdLine = ema12 - ema26;
    return { macdLine, signal: null, histogram: null };
  };

  const atr = (period = 14) => {
    if (candles.length < period + 1) return null;
    let atrSum = 0;
    for (let i = candles.length - period; i < candles.length; i += 1) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1]),
      );
      atrSum += tr;
    }
    return atrSum / period;
  };

  return {
    sma7: sma(7),
    sma25: sma(25),
    sma99: sma(99),
    ema12: ema(12),
    ema26: ema(26),
    rsi14: rsi(14),
    macd: macd(),
    atr14: atr(14),
    currentPrice: closes[closes.length - 1],
  };
};

const getMarketAnalysis = async (instId, bar = '1H') => {
  const [tickerRes, candlesRes] = await Promise.all([
    getTicker(instId),
    getCandles(instId, bar, 100),
  ]);

  const ticker = formatTickerData(tickerRes.data[0]);
  const candles = candlesRes.data.map(formatCandleData).reverse();
  const indicators = calculateTechnicalIndicators(candles);

  return {
    ticker,
    indicators,
    candles: candles.slice(-20),
  };
};

export {
  getTickers,
  getTicker,
  getCandles,
  getOrderBook,
  getTrades,
  getAccountBalance,
  getPositions,
  placeOrder,
  cancelOrder,
  getOrderDetails,
  getPendingOrders,
  getOrderHistory,
  getInstruments,
  formatTickerData,
  formatCandleData,
  calculateTechnicalIndicators,
  getMarketAnalysis,
};
