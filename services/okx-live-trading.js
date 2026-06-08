import okx from './okx.js';
import config from '../config/index.js';

export const LIVE_WATCH_LIST = [
  'BTC-USDT',
  'ETH-USDT',
  'SOL-USDT',
  'XRP-USDT',
  'DOGE-USDT',
  'PAXG-USDT',  // 黃金代幣，與實體黃金 1:1 掛鉤
];

export class OKXLiveTrading {
  constructor() {
    this.isRunning = false;
    this.watchList = [...LIVE_WATCH_LIST];
    this.positions = new Map();
    this.trades = [];
    this.config = {
      maxPositions: 2,
      positionSizeUSDT: 50,
      minScore: 70,
      evaluationInterval: 60000,
    };
    this.startTime = null;
    this.lastSignals = new Map();
    this.isLive = config.OKX_SIMULATED !== 'true';
  }

  async getBalance() {
    try {
      const result = await okx.getAccountBalance();
      if (result.code === '0' && result.data && result.data[0]) {
        const details = result.data[0].details || [];
        const usdt = details.find(d => d.ccy === 'USDT');
        return {
          usdt: parseFloat(usdt?.availBal || 0),
          total: parseFloat(result.data[0].totalEq || 0),
        };
      }
      return { usdt: 0, total: 0 };
    } catch (error) {
      console.error('取得餘額失敗:', error.message);
      return { usdt: 0, total: 0 };
    }
  }

  async scanAllCoins() {
    const opportunities = [];

    for (const instId of this.watchList) {
      try {
        const result = await this.analyzeOne(instId);
        if (result) {
          opportunities.push(result);
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        console.error(`${instId} 分析失敗:`, error.message);
      }
    }

    return opportunities.sort((a, b) => b.score - a.score);
  }

  async analyzeOne(instId) {
    const candlesResponse = await okx.getCandles(instId, '1H', 50);
    if (candlesResponse.code !== '0' || !candlesResponse.data) return null;

    const candles = candlesResponse.data;
    const indicators = okx.calculateTechnicalIndicators(candles);
    const closes = candles.map(c => parseFloat(c[4])).reverse();

    const signals = [];

    // SMA 交叉
    const shortSma = okx.calculateSMA(closes, 10);
    const longSma = okx.calculateSMA(closes, 30);
    const prevShortSma = okx.calculateSMA(closes.slice(0, -1), 10);
    const prevLongSma = okx.calculateSMA(closes.slice(0, -1), 30);

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
    };
  }

  async executeBuy(opportunity) {
    const { instId, price, score, reasons } = opportunity;

    // 計算購買數量
    const qty = (this.config.positionSizeUSDT / price).toFixed(6);

    console.log(`🟢 準備買入 ${instId}: ${qty} @ $${price}`);

    try {
      const result = await okx.placeOrder(instId, 'buy', 'market', qty);

      if (result.code === '0') {
        this.positions.set(instId, {
          entryPrice: price,
          qty: parseFloat(qty),
          entryTime: new Date(),
          orderId: result.data?.[0]?.ordId,
        });

        const trade = {
          type: 'BUY',
          instId,
          price,
          qty: parseFloat(qty),
          score,
          reasons,
          orderId: result.data?.[0]?.ordId,
          timestamp: new Date(),
          live: this.isLive,
        };

        this.trades.push(trade);
        console.log(`✅ 買入成功: ${instId}`);
        return trade;
      } else {
        console.error(`❌ 買入失敗: ${result.msg}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ 買入錯誤: ${error.message}`);
      return null;
    }
  }

  async executeSell(opportunity) {
    const { instId, price, reasons } = opportunity;
    const position = this.positions.get(instId);
    if (!position) return null;

    console.log(`🔴 準備賣出 ${instId}: ${position.qty} @ $${price}`);

    try {
      const result = await okx.placeOrder(instId, 'sell', 'market', position.qty.toFixed(6));

      if (result.code === '0') {
        const pnl = (price - position.entryPrice) * position.qty;
        const pnlPercent = ((price - position.entryPrice) / position.entryPrice) * 100;

        this.positions.delete(instId);

        const trade = {
          type: 'SELL',
          instId,
          price,
          qty: position.qty,
          pnl,
          pnlPercent,
          reasons,
          orderId: result.data?.[0]?.ordId,
          timestamp: new Date(),
          live: this.isLive,
        };

        this.trades.push(trade);
        console.log(`✅ 賣出成功: ${instId}, 損益: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
        return trade;
      } else {
        console.error(`❌ 賣出失敗: ${result.msg}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ 賣出錯誤: ${error.message}`);
      return null;
    }
  }

  async start(options = {}) {
    const {
      watchList = LIVE_WATCH_LIST,
      interval = 60000,
      positionSize = 50,
      maxPositions = 2,
      onOpportunity = null,
      onTrade = null,
      onScan = null,
      onError = null,
    } = options;

    this.isRunning = true;
    this.watchList = watchList;
    this.config.positionSizeUSDT = positionSize;
    this.config.maxPositions = maxPositions;
    this.config.evaluationInterval = interval;
    this.startTime = new Date();

    const modeText = this.isLive ? '🔴 實盤交易' : '🟡 模擬交易';
    console.log(`🚀 OKX ${modeText} 啟動，監控 ${watchList.length} 個幣種`);

    // 檢查餘額
    const balance = await this.getBalance();
    console.log(`💰 帳戶餘額: ${balance.usdt.toFixed(2)} USDT`);

    const runLoop = async () => {
      if (!this.isRunning) return;

      try {
        console.log('📡 掃描市場...');
        const opportunities = await this.scanAllCoins();

        if (onScan) {
          onScan(opportunities);
        }

        // 處理賣出信號
        const sellOpps = opportunities.filter(o =>
          o.action === 'SELL' && this.positions.has(o.instId)
        );
        for (const opp of sellOpps) {
          const trade = await this.executeSell(opp);
          if (trade && onTrade) {
            onTrade(trade);
          }
        }

        // 處理買入信號
        if (this.positions.size < this.config.maxPositions) {
          const buyOpps = opportunities.filter(o =>
            o.action === 'BUY' &&
            o.score >= this.config.minScore &&
            !this.positions.has(o.instId)
          );

          for (const opp of buyOpps) {
            if (this.positions.size >= this.config.maxPositions) break;

            if (onOpportunity) {
              onOpportunity(opp);
            }

            const trade = await this.executeBuy(opp);
            if (trade && onTrade) {
              onTrade(trade);
            }
          }
        }

        this.lastSignals = new Map(opportunities.map(o => [o.instId, o]));

      } catch (error) {
        console.error('掃描錯誤:', error.message);
        if (onError) onError(error);
      }

      if (this.isRunning) {
        setTimeout(runLoop, this.config.evaluationInterval);
      }
    };

    runLoop();

    return {
      message: `OKX ${this.isLive ? '實盤' : '模擬'}交易已啟動`,
      mode: this.isLive ? 'LIVE' : 'SIMULATED',
      watchList: this.watchList,
      balance,
    };
  }

  stop() {
    this.isRunning = false;

    const completedTrades = this.trades.filter(t => t.type === 'SELL');
    const totalPnl = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winCount = completedTrades.filter(t => t.pnl > 0).length;
    const winRate = completedTrades.length > 0 ? (winCount / completedTrades.length) * 100 : 0;

    return {
      message: 'OKX 交易已停止',
      mode: this.isLive ? 'LIVE' : 'SIMULATED',
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
      mode: this.isLive ? 'LIVE' : 'SIMULATED',
      watchList: this.watchList,
      positionsCount: this.positions.size,
      positions: Array.from(this.positions.entries()).map(([instId, pos]) => ({
        instId,
        entryPrice: pos.entryPrice,
        qty: pos.qty,
      })),
      trades: this.trades.length,
      completedTrades: completedTrades.length,
      totalPnl,
      runTime: this.startTime ? `${Math.round((new Date() - this.startTime) / 60000)} 分鐘` : '0',
    };
  }
}

export default {
  LIVE_WATCH_LIST,
  OKXLiveTrading,
};
