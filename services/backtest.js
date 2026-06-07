import okx from './okx.js';

export const STRATEGY_SMA_CROSS = 'sma_cross';
export const STRATEGY_RSI = 'rsi';
export const STRATEGY_MACD = 'macd';
export const STRATEGY_BOLLINGER = 'bollinger';
export const STRATEGY_GRID = 'grid';

const parseCandle = (candle) => ({
  timestamp: parseInt(candle[0]),
  open: parseFloat(candle[1]),
  high: parseFloat(candle[2]),
  low: parseFloat(candle[3]),
  close: parseFloat(candle[4]),
  volume: parseFloat(candle[5]),
});

export const fetchBacktestData = async (instId = 'BTC-USDT', bar = '1H', days = 30) => {
  const allCandles = [];
  let after = '';
  const barsPerDay = {
    '1m': 1440,
    '5m': 288,
    '15m': 96,
    '30m': 48,
    '1H': 24,
    '4H': 6,
    '1D': 1,
  };

  const targetBars = (barsPerDay[bar] || 24) * days;
  const fetchLimit = 100;

  while (allCandles.length < targetBars) {
    const response = await okx.getHistoryCandles(instId, bar, after, '', fetchLimit);
    if (response.code !== '0' || !response.data || response.data.length === 0) break;

    allCandles.push(...response.data);
    after = response.data[response.data.length - 1][0];

    if (response.data.length < fetchLimit) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return allCandles.map(parseCandle).reverse();
};

const smaCrossStrategy = (candles, params = {}) => {
  const { shortPeriod = 10, longPeriod = 30 } = params;
  const signals = [];
  const closes = candles.map((c) => c.close);

  for (let i = longPeriod; i < candles.length; i++) {
    const shortSma = okx.calculateSMA(closes.slice(0, i + 1), shortPeriod);
    const longSma = okx.calculateSMA(closes.slice(0, i + 1), longPeriod);
    const prevShortSma = okx.calculateSMA(closes.slice(0, i), shortPeriod);
    const prevLongSma = okx.calculateSMA(closes.slice(0, i), longPeriod);

    if (prevShortSma <= prevLongSma && shortSma > longSma) {
      signals.push({ index: i, type: 'BUY', price: candles[i].close, timestamp: candles[i].timestamp });
    } else if (prevShortSma >= prevLongSma && shortSma < longSma) {
      signals.push({ index: i, type: 'SELL', price: candles[i].close, timestamp: candles[i].timestamp });
    }
  }

  return signals;
};

const rsiStrategy = (candles, params = {}) => {
  const { period = 14, oversold = 30, overbought = 70 } = params;
  const signals = [];
  const closes = candles.map((c) => c.close);

  for (let i = period + 1; i < candles.length; i++) {
    const rsi = okx.calculateRSI(closes.slice(0, i + 1), period);
    const prevRsi = okx.calculateRSI(closes.slice(0, i), period);

    if (prevRsi <= oversold && rsi > oversold) {
      signals.push({ index: i, type: 'BUY', price: candles[i].close, timestamp: candles[i].timestamp, rsi });
    } else if (prevRsi >= overbought && rsi < overbought) {
      signals.push({ index: i, type: 'SELL', price: candles[i].close, timestamp: candles[i].timestamp, rsi });
    }
  }

  return signals;
};

const bollingerStrategy = (candles, params = {}) => {
  const { period = 20, stdDev = 2 } = params;
  const signals = [];
  const closes = candles.map((c) => c.close);

  for (let i = period; i < candles.length; i++) {
    const bb = okx.calculateBollingerBands(closes.slice(0, i + 1), period, stdDev);
    const price = candles[i].close;
    const prevPrice = candles[i - 1].close;

    if (prevPrice >= bb.lower && price < bb.lower) {
      signals.push({ index: i, type: 'BUY', price, timestamp: candles[i].timestamp });
    } else if (prevPrice <= bb.upper && price > bb.upper) {
      signals.push({ index: i, type: 'SELL', price, timestamp: candles[i].timestamp });
    }
  }

  return signals;
};

const gridStrategy = (candles, params = {}) => {
  const { gridCount = 10, upperPrice, lowerPrice } = params;

  const prices = candles.map((c) => c.close);
  const maxPrice = upperPrice || Math.max(...prices) * 1.02;
  const minPrice = lowerPrice || Math.min(...prices) * 0.98;
  const gridSize = (maxPrice - minPrice) / gridCount;

  const grids = [];
  for (let i = 0; i <= gridCount; i++) {
    grids.push(minPrice + i * gridSize);
  }

  const signals = [];
  let lastGridIndex = null;

  for (let i = 0; i < candles.length; i++) {
    const price = candles[i].close;
    const currentGridIndex = Math.floor((price - minPrice) / gridSize);

    if (lastGridIndex !== null && currentGridIndex !== lastGridIndex) {
      if (currentGridIndex < lastGridIndex) {
        signals.push({ index: i, type: 'BUY', price, timestamp: candles[i].timestamp, grid: currentGridIndex });
      } else {
        signals.push({ index: i, type: 'SELL', price, timestamp: candles[i].timestamp, grid: currentGridIndex });
      }
    }

    lastGridIndex = currentGridIndex;
  }

  return signals;
};

const executeStrategy = (candles, strategy, params = {}) => {
  switch (strategy) {
    case STRATEGY_SMA_CROSS:
      return smaCrossStrategy(candles, params);
    case STRATEGY_RSI:
      return rsiStrategy(candles, params);
    case STRATEGY_BOLLINGER:
      return bollingerStrategy(candles, params);
    case STRATEGY_GRID:
      return gridStrategy(candles, params);
    default:
      return smaCrossStrategy(candles, params);
  }
};

export const runBacktest = async (options = {}) => {
  const {
    instId = 'BTC-USDT',
    bar = '1H',
    days = 30,
    strategy = STRATEGY_SMA_CROSS,
    strategyParams = {},
    initialCapital = 10000,
    positionSize = 0.1,
    feeRate = 0.001,
    stopLoss = null,
    takeProfit = null,
  } = options;

  const candles = await fetchBacktestData(instId, bar, days);
  if (candles.length < 50) {
    throw new Error('數據不足，無法進行回測');
  }

  const signals = executeStrategy(candles, strategy, strategyParams);

  let capital = initialCapital;
  let position = 0;
  let entryPrice = 0;
  const trades = [];
  let totalFees = 0;

  for (const signal of signals) {
    const tradeAmount = capital * positionSize;

    if (signal.type === 'BUY' && position === 0) {
      const fee = tradeAmount * feeRate;
      const qty = (tradeAmount - fee) / signal.price;
      position = qty;
      entryPrice = signal.price;
      capital -= tradeAmount;
      totalFees += fee;

      trades.push({
        type: 'BUY',
        price: signal.price,
        qty,
        fee,
        capital,
        timestamp: signal.timestamp,
        date: new Date(signal.timestamp).toISOString(),
      });
    } else if (signal.type === 'SELL' && position > 0) {
      const sellValue = position * signal.price;
      const fee = sellValue * feeRate;
      const pnl = (signal.price - entryPrice) * position - fee;
      capital += sellValue - fee;
      totalFees += fee;

      trades.push({
        type: 'SELL',
        price: signal.price,
        qty: position,
        fee,
        pnl,
        pnlPercent: ((signal.price - entryPrice) / entryPrice) * 100,
        capital,
        timestamp: signal.timestamp,
        date: new Date(signal.timestamp).toISOString(),
      });

      position = 0;
      entryPrice = 0;
    }
  }

  if (position > 0) {
    const lastPrice = candles[candles.length - 1].close;
    capital += position * lastPrice;
  }

  const winningTrades = trades.filter((t) => t.type === 'SELL' && t.pnl > 0);
  const losingTrades = trades.filter((t) => t.type === 'SELL' && t.pnl <= 0);
  const sellTrades = trades.filter((t) => t.type === 'SELL');

  const totalPnL = capital - initialCapital;
  const returnPercent = (totalPnL / initialCapital) * 100;
  const winRate = sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0;

  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length)
    : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  let maxDrawdown = 0;
  let peak = initialCapital;
  for (const trade of trades) {
    if (trade.capital > peak) peak = trade.capital;
    const drawdown = ((peak - trade.capital) / peak) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const startDate = new Date(candles[0].timestamp);
  const endDate = new Date(candles[candles.length - 1].timestamp);
  const tradingDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
  const annualizedReturn = (Math.pow(capital / initialCapital, 365 / tradingDays) - 1) * 100;

  return {
    summary: {
      instId,
      strategy,
      period: `${days} 天`,
      timeframe: bar,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      totalCandles: candles.length,
    },
    performance: {
      initialCapital,
      finalCapital: Math.round(capital * 100) / 100,
      totalPnL: Math.round(totalPnL * 100) / 100,
      returnPercent: Math.round(returnPercent * 100) / 100,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      totalFees: Math.round(totalFees * 100) / 100,
    },
    statistics: {
      totalTrades: trades.length,
      completedTrades: sellTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: Math.round(winRate * 100) / 100,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: profitFactor === Infinity ? '∞' : Math.round(profitFactor * 100) / 100,
    },
    trades: trades.slice(-20),
    openPosition: position > 0 ? { qty: position, entryPrice, currentValue: position * candles[candles.length - 1].close } : null,
  };
};

export const formatBacktestResult = (result) => {
  const { summary, performance, statistics } = result;

  let text = `📊 回測報告\n`;
  text += `━━━━━━━━━━━━━━━━\n\n`;

  text += `📈 策略設定\n`;
  text += `• 交易對：${summary.instId}\n`;
  text += `• 策略：${getStrategyName(summary.strategy)}\n`;
  text += `• 時間週期：${summary.timeframe}\n`;
  text += `• 回測期間：${summary.startDate} ~ ${summary.endDate}\n`;
  text += `• 資料筆數：${summary.totalCandles}\n\n`;

  text += `💰 績效表現\n`;
  text += `• 初始資金：$${performance.initialCapital.toLocaleString()}\n`;
  text += `• 最終資金：$${performance.finalCapital.toLocaleString()}\n`;
  text += `• 總損益：${performance.totalPnL >= 0 ? '+' : ''}$${performance.totalPnL.toLocaleString()}\n`;
  text += `• 報酬率：${performance.returnPercent >= 0 ? '+' : ''}${performance.returnPercent}%\n`;
  text += `• 年化報酬：${performance.annualizedReturn >= 0 ? '+' : ''}${performance.annualizedReturn}%\n`;
  text += `• 最大回撤：-${performance.maxDrawdown}%\n`;
  text += `• 總手續費：$${performance.totalFees.toLocaleString()}\n\n`;

  text += `📉 交易統計\n`;
  text += `• 總交易次數：${statistics.totalTrades}\n`;
  text += `• 完成交易：${statistics.completedTrades}\n`;
  text += `• 獲利次數：${statistics.winningTrades}\n`;
  text += `• 虧損次數：${statistics.losingTrades}\n`;
  text += `• 勝率：${statistics.winRate}%\n`;
  text += `• 平均獲利：$${statistics.avgWin.toLocaleString()}\n`;
  text += `• 平均虧損：$${statistics.avgLoss.toLocaleString()}\n`;
  text += `• 盈虧比：${statistics.profitFactor}\n`;

  if (result.openPosition) {
    text += `\n⚠️ 未平倉部位\n`;
    text += `• 數量：${result.openPosition.qty.toFixed(6)}\n`;
    text += `• 進場價：$${result.openPosition.entryPrice.toLocaleString()}\n`;
    text += `• 當前市值：$${result.openPosition.currentValue.toLocaleString()}\n`;
  }

  return text;
};

const getStrategyName = (strategy) => {
  const names = {
    [STRATEGY_SMA_CROSS]: 'SMA 均線交叉',
    [STRATEGY_RSI]: 'RSI 超買超賣',
    [STRATEGY_MACD]: 'MACD 動能',
    [STRATEGY_BOLLINGER]: '布林通道',
    [STRATEGY_GRID]: '網格交易',
  };
  return names[strategy] || strategy;
};

export const compareStrategies = async (instId = 'BTC-USDT', bar = '1H', days = 30, initialCapital = 10000) => {
  const strategies = [
    { strategy: STRATEGY_SMA_CROSS, params: { shortPeriod: 10, longPeriod: 30 } },
    { strategy: STRATEGY_RSI, params: { period: 14, oversold: 30, overbought: 70 } },
    { strategy: STRATEGY_BOLLINGER, params: { period: 20, stdDev: 2 } },
    { strategy: STRATEGY_GRID, params: { gridCount: 10 } },
  ];

  const results = [];

  for (const { strategy, params } of strategies) {
    try {
      const result = await runBacktest({
        instId,
        bar,
        days,
        strategy,
        strategyParams: params,
        initialCapital,
      });
      results.push({
        strategy: getStrategyName(strategy),
        returnPercent: result.performance.returnPercent,
        winRate: result.statistics.winRate,
        maxDrawdown: result.performance.maxDrawdown,
        trades: result.statistics.totalTrades,
        profitFactor: result.statistics.profitFactor,
      });
    } catch (error) {
      results.push({
        strategy: getStrategyName(strategy),
        error: error.message,
      });
    }
  }

  return results;
};

export const formatComparisonResult = (results, instId, days) => {
  let text = `📊 策略比較報告\n`;
  text += `━━━━━━━━━━━━━━━━\n`;
  text += `交易對：${instId} | 回測天數：${days}\n\n`;

  const validResults = results.filter((r) => !r.error);
  const sortedResults = validResults.sort((a, b) => b.returnPercent - a.returnPercent);

  sortedResults.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '📌';
    text += `${medal} ${r.strategy}\n`;
    text += `   報酬：${r.returnPercent >= 0 ? '+' : ''}${r.returnPercent}% | 勝率：${r.winRate}%\n`;
    text += `   回撤：-${r.maxDrawdown}% | 交易：${r.trades}次\n\n`;
  });

  if (sortedResults.length > 0) {
    text += `\n💡 建議：${sortedResults[0].strategy} 在此期間表現最佳`;
  }

  return text;
};

export default {
  STRATEGY_SMA_CROSS,
  STRATEGY_RSI,
  STRATEGY_MACD,
  STRATEGY_BOLLINGER,
  STRATEGY_GRID,
  fetchBacktestData,
  runBacktest,
  formatBacktestResult,
  compareStrategies,
  formatComparisonResult,
};
