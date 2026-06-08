import exchange from './coingecko.js';
import backtest from './backtest.js';

export const WATCH_LIST = [
  'BTC-USDT',
  'ETH-USDT',
  'SOL-USDT',
  'BNB-USDT',
  'XRP-USDT',
  'ADA-USDT',
  'DOGE-USDT',
  'AVAX-USDT',
  'DOT-USDT',
  'MATIC-USDT',
];

export const STRATEGIES = {
  SMA_CROSS: { name: 'sma_cross', label: 'SMA均線交叉', params: { shortPeriod: 10, longPeriod: 30 } },
  RSI: { name: 'rsi', label: 'RSI超買超賣', params: { period: 14, oversold: 30, overbought: 70 } },
  BOLLINGER: { name: 'bollinger', label: '布林通道', params: { period: 20, stdDev: 2 } },
};

export class MultiCoinTrading {
  constructor() {
    this.isRunning = false;
    this.watchList = [...WATCH_LIST];
    this.positions = new Map();
    this.trades = [];
    this.config = {
      maxPositions: 3,
      positionSize: 0.1,
      minScore: 60,
      evaluationInterval: 60000,
    };
    this.capital = 10000;
    this.startTime = null;
    this.lastSignals = new Map();
  }

  async scanAllCoins() {
    const opportunities = [];

    for (const instId of this.watchList) {
      try {
        const result = await this.analyzeOne(instId);
        if (result) {
          opportunities.push(result);
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (error) {
        console.error(`${instId} 分析失敗:`, error.message);
      }
    }

    return opportunities.sort((a, b) => b.score - a.score);
  }

  async analyzeOne(instId) {
    const candlesResponse = await exchange.getCandles(instId, '1H', 50);
    if (candlesResponse.code !== '0' || !candlesResponse.data) return null;

    const candles = candlesResponse.data;
    const indicators = exchange.calculateTechnicalIndicators(candles);
    const closes = candles.map(c => parseFloat(c[4])).reverse();

    const signals = [];

    // SMA 交叉
    const shortSma = exchange.calculateSMA(closes, 10);
    const longSma = exchange.calculateSMA(closes, 30);
    const prevShortSma = exchange.calculateSMA(closes.slice(0, -1), 10);
    const prevLongSma = exchange.calculateSMA(closes.slice(0, -1), 30);

    if (shortSma && longSma && prevShortSma && prevLongSma) {
      if (prevShortSma <= prevLongSma && shortSma > longSma) {
        signals.push({ strategy: 'SMA', action: 'BUY', strength: 80 });
      } else if (prevShortSma >= prevLongSma && shortSma < longSma) {
        signals.push({ strategy: 'SMA', action: 'SELL', strength: 80 });
      }
    }

    // RSI
    const rsi = indicators.rsi14;
    if (rsi) {
      if (rsi < 30) {
        signals.push({ strategy: 'RSI', action: 'BUY', strength: 90 - rsi });
      } else if (rsi > 70) {
        signals.push({ strategy: 'RSI', action: 'SELL', strength: rsi - 10 });
      }
    }

    // 布林通道
    const bb = indicators.bollingerBands;
    if (bb) {
      const price = indicators.currentPrice;
      if (price < bb.lower) {
        const strength = Math.min(90, 60 + ((bb.lower - price) / price) * 1000);
        signals.push({ strategy: 'BB', action: 'BUY', strength });
      } else if (price > bb.upper) {
        const strength = Math.min(90, 60 + ((price - bb.upper) / price) * 1000);
        signals.push({ strategy: 'BB', action: 'SELL', strength });
      }
    }

    // 計算趨勢強度
    const trendStrength = shortSma && longSma ? ((shortSma - longSma) / longSma) * 100 : 0;

    // 計算綜合得分
    const buySignals = signals.filter(s => s.action === 'BUY');
    const sellSignals = signals.filter(s => s.action === 'SELL');

    let action = 'HOLD';
    let score = 0;
    let reasons = [];

    if (buySignals.length > 0) {
      score = buySignals.reduce((sum, s) => sum + s.strength, 0) / buySignals.length;
      score += buySignals.length * 10;
      action = 'BUY';
      reasons = buySignals.map(s => s.strategy);
    } else if (sellSignals.length > 0) {
      score = sellSignals.reduce((sum, s) => sum + s.strength, 0) / sellSignals.length;
      score += sellSignals.length * 10;
      action = 'SELL';
      reasons = sellSignals.map(s => s.strategy);
    }

    return {
      instId,
      action,
      score: Math.round(score),
      reasons,
      price: indicators.currentPrice,
      rsi: rsi?.toFixed(1),
      trend: trendStrength > 0 ? '上漲' : '下跌',
      trendStrength: Math.abs(trendStrength).toFixed(2),
    };
  }

  async findBestOpportunity() {
    const opportunities = await this.scanAllCoins();

    // 過濾出買入機會
    const buyOpportunities = opportunities.filter(o =>
      o.action === 'BUY' &&
      o.score >= this.config.minScore &&
      !this.positions.has(o.instId)
    );

    // 過濾出賣出機會（針對持倉）
    const sellOpportunities = opportunities.filter(o =>
      o.action === 'SELL' &&
      this.positions.has(o.instId)
    );

    return {
      buy: buyOpportunities,
      sell: sellOpportunities,
      all: opportunities,
    };
  }

  async start(options = {}) {
    const {
      watchList = WATCH_LIST,
      interval = 60000,
      initialCapital = 10000,
      maxPositions = 3,
      onOpportunity = null,
      onTrade = null,
      onScan = null,
    } = options;

    this.isRunning = true;
    this.watchList = watchList;
    this.capital = initialCapital;
    this.config.maxPositions = maxPositions;
    this.config.evaluationInterval = interval;
    this.startTime = new Date();

    console.log(`🚀 多幣種智能交易啟動，監控 ${watchList.length} 個幣種`);

    const runLoop = async () => {
      if (!this.isRunning) return;

      try {
        console.log('📡 掃描市場機會...');
        const opportunities = await this.findBestOpportunity();

        if (onScan) {
          onScan(opportunities.all);
        }

        // 處理賣出信號
        for (const opp of opportunities.sell) {
          const trade = this.executeSell(opp);
          if (trade && onTrade) {
            onTrade(trade);
          }
        }

        // 處理買入信號
        if (this.positions.size < this.config.maxPositions) {
          for (const opp of opportunities.buy) {
            if (this.positions.size >= this.config.maxPositions) break;

            if (onOpportunity) {
              onOpportunity(opp);
            }

            const trade = this.executeBuy(opp);
            if (trade && onTrade) {
              onTrade(trade);
            }
          }
        }

        this.lastSignals = new Map(opportunities.all.map(o => [o.instId, o]));

      } catch (error) {
        console.error('掃描錯誤:', error.message);
      }

      if (this.isRunning) {
        setTimeout(runLoop, this.config.evaluationInterval);
      }
    };

    runLoop();

    return {
      message: '多幣種智能交易已啟動',
      watchList: this.watchList,
      maxPositions: this.config.maxPositions,
    };
  }

  executeBuy(opportunity) {
    const tradeAmount = this.capital * this.config.positionSize;
    if (tradeAmount < 10) return null;

    const qty = tradeAmount / opportunity.price;

    this.positions.set(opportunity.instId, {
      entryPrice: opportunity.price,
      qty,
      entryTime: new Date(),
      reasons: opportunity.reasons,
    });

    this.capital -= tradeAmount;

    const trade = {
      type: 'BUY',
      instId: opportunity.instId,
      price: opportunity.price,
      qty,
      score: opportunity.score,
      reasons: opportunity.reasons,
      capital: this.capital,
      timestamp: new Date(),
    };

    this.trades.push(trade);
    return trade;
  }

  executeSell(opportunity) {
    const position = this.positions.get(opportunity.instId);
    if (!position) return null;

    const sellValue = position.qty * opportunity.price;
    const pnl = (opportunity.price - position.entryPrice) * position.qty;
    const pnlPercent = ((opportunity.price - position.entryPrice) / position.entryPrice) * 100;

    this.capital += sellValue;
    this.positions.delete(opportunity.instId);

    const trade = {
      type: 'SELL',
      instId: opportunity.instId,
      price: opportunity.price,
      qty: position.qty,
      pnl,
      pnlPercent,
      reasons: opportunity.reasons,
      capital: this.capital,
      timestamp: new Date(),
    };

    this.trades.push(trade);
    return trade;
  }

  stop() {
    this.isRunning = false;

    const completedTrades = this.trades.filter(t => t.type === 'SELL');
    const totalPnl = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winCount = completedTrades.filter(t => t.pnl > 0).length;
    const winRate = completedTrades.length > 0 ? (winCount / completedTrades.length) * 100 : 0;

    return {
      message: '多幣種交易已停止',
      finalCapital: this.capital,
      totalTrades: this.trades.length,
      completedTrades: completedTrades.length,
      totalPnl,
      winRate,
      positions: Array.from(this.positions.entries()),
      runTime: `${Math.round((new Date() - this.startTime) / 60000)} 分鐘`,
    };
  }

  getStatus() {
    const completedTrades = this.trades.filter(t => t.type === 'SELL');
    const totalPnl = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    return {
      isRunning: this.isRunning,
      watchList: this.watchList,
      capital: this.capital,
      positionsCount: this.positions.size,
      positions: Array.from(this.positions.entries()).map(([instId, pos]) => ({
        instId,
        entryPrice: pos.entryPrice,
        qty: pos.qty,
        currentValue: pos.qty * (this.lastSignals.get(instId)?.price || pos.entryPrice),
      })),
      trades: this.trades.length,
      completedTrades: completedTrades.length,
      totalPnl,
      runTime: this.startTime ? `${Math.round((new Date() - this.startTime) / 60000)} 分鐘` : '0',
    };
  }

  async getMarketOverview() {
    const opportunities = await this.scanAllCoins();

    return {
      timestamp: new Date(),
      coins: opportunities,
      bestBuy: opportunities.filter(o => o.action === 'BUY').slice(0, 3),
      bestSell: opportunities.filter(o => o.action === 'SELL').slice(0, 3),
    };
  }
}

export const multiCoinTrader = new MultiCoinTrading();

export default {
  WATCH_LIST,
  STRATEGIES,
  MultiCoinTrading,
  multiCoinTrader,
};
