import { placeOrder, cancelOrder, getTicker, getCandles, getPendingOrders } from './okx.js';
import { calculateTechnicalIndicators, formatCandleData } from './okx.js';

// Strategy status constants
export const STRATEGY_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  STOPPED: 'stopped',
};

// Order side constants
export const SIDE = {
  BUY: 'buy',
  SELL: 'sell',
};

/**
 * Grid Trading Strategy
 * Places buy and sell orders at regular price intervals
 */
export class GridStrategy {
  constructor({
    instId,
    upperPrice,
    lowerPrice,
    gridCount,
    totalAmount,
    tdMode = 'cash',
  }) {
    this.instId = instId;
    this.upperPrice = parseFloat(upperPrice);
    this.lowerPrice = parseFloat(lowerPrice);
    this.gridCount = parseInt(gridCount, 10);
    this.totalAmount = parseFloat(totalAmount);
    this.tdMode = tdMode;
    this.status = STRATEGY_STATUS.STOPPED;
    this.orders = [];
    this.gridLines = [];
    this.profits = [];
    this.totalProfit = 0;
  }

  calculateGridLines() {
    const priceStep = (this.upperPrice - this.lowerPrice) / this.gridCount;
    const lines = [];

    for (let i = 0; i <= this.gridCount; i += 1) {
      lines.push({
        price: this.lowerPrice + priceStep * i,
        index: i,
        hasBuyOrder: false,
        hasSellOrder: false,
      });
    }

    this.gridLines = lines;
    return lines;
  }

  getAmountPerGrid() {
    return this.totalAmount / this.gridCount;
  }

  async initialize() {
    this.calculateGridLines();

    const tickerRes = await getTicker(this.instId);
    if (tickerRes.code !== '0') {
      throw new Error(`Failed to get ticker: ${tickerRes.msg}`);
    }

    const currentPrice = parseFloat(tickerRes.data[0].last);
    const amountPerGrid = this.getAmountPerGrid();

    const orders = [];

    for (const line of this.gridLines) {
      if (line.price < currentPrice) {
        // Place buy order below current price
        orders.push({
          type: 'buy',
          price: line.price.toFixed(4),
          amount: (amountPerGrid / line.price).toFixed(6),
          gridIndex: line.index,
        });
      } else if (line.price > currentPrice) {
        // Place sell order above current price
        orders.push({
          type: 'sell',
          price: line.price.toFixed(4),
          amount: (amountPerGrid / line.price).toFixed(6),
          gridIndex: line.index,
        });
      }
    }

    return {
      currentPrice,
      gridLines: this.gridLines,
      pendingOrders: orders,
      amountPerGrid,
    };
  }

  async placeGridOrders() {
    const { pendingOrders, currentPrice } = await this.initialize();
    const placedOrders = [];

    for (const order of pendingOrders) {
      try {
        const result = await placeOrder({
          instId: this.instId,
          tdMode: this.tdMode,
          side: order.type,
          ordType: 'limit',
          sz: order.amount,
          px: order.price,
          clOrdId: `grid_${this.instId}_${order.gridIndex}_${Date.now()}`,
        });

        if (result.code === '0') {
          placedOrders.push({
            ...order,
            ordId: result.data[0].ordId,
            status: 'placed',
          });
        } else {
          placedOrders.push({
            ...order,
            status: 'failed',
            error: result.msg,
          });
        }
      } catch (error) {
        placedOrders.push({
          ...order,
          status: 'failed',
          error: error.message,
        });
      }
    }

    this.orders = placedOrders;
    this.status = STRATEGY_STATUS.ACTIVE;

    return {
      status: this.status,
      currentPrice,
      placedOrders,
      successCount: placedOrders.filter((o) => o.status === 'placed').length,
      failedCount: placedOrders.filter((o) => o.status === 'failed').length,
    };
  }

  async cancelAllOrders() {
    const cancelResults = [];

    for (const order of this.orders) {
      if (order.status === 'placed' && order.ordId) {
        try {
          const result = await cancelOrder(this.instId, order.ordId);
          cancelResults.push({
            ordId: order.ordId,
            success: result.code === '0',
          });
        } catch (error) {
          cancelResults.push({
            ordId: order.ordId,
            success: false,
            error: error.message,
          });
        }
      }
    }

    this.status = STRATEGY_STATUS.STOPPED;
    this.orders = [];

    return cancelResults;
  }

  getStatus() {
    return {
      instId: this.instId,
      status: this.status,
      upperPrice: this.upperPrice,
      lowerPrice: this.lowerPrice,
      gridCount: this.gridCount,
      totalAmount: this.totalAmount,
      activeOrders: this.orders.filter((o) => o.status === 'placed').length,
      totalProfit: this.totalProfit,
    };
  }
}

/**
 * DCA (Dollar Cost Averaging) Strategy
 * Buys fixed amount at regular intervals
 */
export class DCAStrategy {
  constructor({
    instId,
    amountPerBuy,
    intervalHours = 24,
    maxBuys = 0,
    tdMode = 'cash',
  }) {
    this.instId = instId;
    this.amountPerBuy = parseFloat(amountPerBuy);
    this.intervalHours = parseInt(intervalHours, 10);
    this.maxBuys = parseInt(maxBuys, 10);
    this.tdMode = tdMode;
    this.status = STRATEGY_STATUS.STOPPED;
    this.buyHistory = [];
    this.totalInvested = 0;
    this.totalQuantity = 0;
    this.lastBuyTime = null;
  }

  async executeBuy() {
    if (this.maxBuys > 0 && this.buyHistory.length >= this.maxBuys) {
      return {
        success: false,
        reason: 'Max buys reached',
      };
    }

    const tickerRes = await getTicker(this.instId);
    if (tickerRes.code !== '0') {
      throw new Error(`Failed to get ticker: ${tickerRes.msg}`);
    }

    const currentPrice = parseFloat(tickerRes.data[0].last);
    const quantity = (this.amountPerBuy / currentPrice).toFixed(6);

    const result = await placeOrder({
      instId: this.instId,
      tdMode: this.tdMode,
      side: 'buy',
      ordType: 'market',
      sz: quantity,
      tgtCcy: 'base_ccy',
      clOrdId: `dca_${this.instId}_${Date.now()}`,
    });

    if (result.code === '0') {
      const buyRecord = {
        ordId: result.data[0].ordId,
        price: currentPrice,
        quantity: parseFloat(quantity),
        amount: this.amountPerBuy,
        timestamp: Date.now(),
      };

      this.buyHistory.push(buyRecord);
      this.totalInvested += this.amountPerBuy;
      this.totalQuantity += parseFloat(quantity);
      this.lastBuyTime = Date.now();

      return {
        success: true,
        buyRecord,
        averagePrice: this.totalInvested / this.totalQuantity,
        totalInvested: this.totalInvested,
        totalQuantity: this.totalQuantity,
      };
    }

    return {
      success: false,
      error: result.msg,
    };
  }

  shouldBuyNow() {
    if (this.status !== STRATEGY_STATUS.ACTIVE) return false;
    if (this.maxBuys > 0 && this.buyHistory.length >= this.maxBuys) return false;
    if (!this.lastBuyTime) return true;

    const hoursSinceLastBuy = (Date.now() - this.lastBuyTime) / (1000 * 60 * 60);
    return hoursSinceLastBuy >= this.intervalHours;
  }

  getStatus() {
    return {
      instId: this.instId,
      status: this.status,
      amountPerBuy: this.amountPerBuy,
      intervalHours: this.intervalHours,
      maxBuys: this.maxBuys,
      completedBuys: this.buyHistory.length,
      totalInvested: this.totalInvested,
      totalQuantity: this.totalQuantity,
      averagePrice: this.totalQuantity > 0 ? this.totalInvested / this.totalQuantity : 0,
      lastBuyTime: this.lastBuyTime,
      nextBuyTime: this.lastBuyTime
        ? new Date(this.lastBuyTime + this.intervalHours * 60 * 60 * 1000)
        : null,
    };
  }

  start() {
    this.status = STRATEGY_STATUS.ACTIVE;
  }

  pause() {
    this.status = STRATEGY_STATUS.PAUSED;
  }

  stop() {
    this.status = STRATEGY_STATUS.STOPPED;
  }
}

/**
 * Trend Following Strategy
 * Uses technical indicators to determine buy/sell signals
 */
export class TrendStrategy {
  constructor({
    instId,
    amountPerTrade,
    timeframe = '1H',
    tdMode = 'cash',
    rsiOversold = 30,
    rsiOverbought = 70,
    useMACD = true,
    useSMA = true,
  }) {
    this.instId = instId;
    this.amountPerTrade = parseFloat(amountPerTrade);
    this.timeframe = timeframe;
    this.tdMode = tdMode;
    this.rsiOversold = rsiOversold;
    this.rsiOverbought = rsiOverbought;
    this.useMACD = useMACD;
    this.useSMA = useSMA;
    this.status = STRATEGY_STATUS.STOPPED;
    this.position = null;
    this.tradeHistory = [];
    this.totalProfit = 0;
  }

  async analyzeMarket() {
    const candlesRes = await getCandles(this.instId, this.timeframe, 100);
    if (candlesRes.code !== '0') {
      throw new Error(`Failed to get candles: ${candlesRes.msg}`);
    }

    const candles = candlesRes.data.map(formatCandleData).reverse();
    const indicators = calculateTechnicalIndicators(candles);

    const tickerRes = await getTicker(this.instId);
    const currentPrice = parseFloat(tickerRes.data[0].last);

    return {
      currentPrice,
      indicators,
      candles: candles.slice(-10),
    };
  }

  generateSignal(indicators) {
    let buySignals = 0;
    let sellSignals = 0;
    const reasons = [];

    // RSI signals
    if (indicators.rsi14 !== null) {
      if (indicators.rsi14 < this.rsiOversold) {
        buySignals += 2;
        reasons.push(`RSI(${indicators.rsi14.toFixed(1)}) 超賣`);
      } else if (indicators.rsi14 > this.rsiOverbought) {
        sellSignals += 2;
        reasons.push(`RSI(${indicators.rsi14.toFixed(1)}) 超買`);
      }
    }

    // SMA crossover signals
    if (this.useSMA && indicators.sma7 && indicators.sma25) {
      if (indicators.sma7 > indicators.sma25) {
        buySignals += 1;
        reasons.push('SMA7 > SMA25 (上升趨勢)');
      } else {
        sellSignals += 1;
        reasons.push('SMA7 < SMA25 (下降趨勢)');
      }
    }

    // MACD signals
    if (this.useMACD && indicators.macd?.macdLine !== null) {
      if (indicators.macd.macdLine > 0) {
        buySignals += 1;
        reasons.push('MACD > 0 (多頭動能)');
      } else {
        sellSignals += 1;
        reasons.push('MACD < 0 (空頭動能)');
      }
    }

    // EMA trend
    if (indicators.ema12 && indicators.ema26) {
      if (indicators.ema12 > indicators.ema26) {
        buySignals += 1;
      } else {
        sellSignals += 1;
      }
    }

    let signal = 'HOLD';
    if (buySignals >= 3 && buySignals > sellSignals) {
      signal = 'BUY';
    } else if (sellSignals >= 3 && sellSignals > buySignals) {
      signal = 'SELL';
    }

    return {
      signal,
      buySignals,
      sellSignals,
      confidence: Math.abs(buySignals - sellSignals) / (buySignals + sellSignals || 1) * 100,
      reasons,
    };
  }

  async executeSignal(signal, currentPrice) {
    if (signal.signal === 'BUY' && !this.position) {
      const quantity = (this.amountPerTrade / currentPrice).toFixed(6);

      const result = await placeOrder({
        instId: this.instId,
        tdMode: this.tdMode,
        side: 'buy',
        ordType: 'market',
        sz: quantity,
        tgtCcy: 'base_ccy',
        clOrdId: `trend_buy_${Date.now()}`,
      });

      if (result.code === '0') {
        this.position = {
          side: 'long',
          entryPrice: currentPrice,
          quantity: parseFloat(quantity),
          entryTime: Date.now(),
        };

        return {
          action: 'BUY',
          price: currentPrice,
          quantity: parseFloat(quantity),
          ordId: result.data[0].ordId,
        };
      }
    } else if (signal.signal === 'SELL' && this.position?.side === 'long') {
      const result = await placeOrder({
        instId: this.instId,
        tdMode: this.tdMode,
        side: 'sell',
        ordType: 'market',
        sz: this.position.quantity.toFixed(6),
        tgtCcy: 'base_ccy',
        clOrdId: `trend_sell_${Date.now()}`,
      });

      if (result.code === '0') {
        const profit = (currentPrice - this.position.entryPrice) * this.position.quantity;
        const profitPercent = ((currentPrice - this.position.entryPrice) / this.position.entryPrice) * 100;

        this.tradeHistory.push({
          entryPrice: this.position.entryPrice,
          exitPrice: currentPrice,
          quantity: this.position.quantity,
          profit,
          profitPercent,
          duration: Date.now() - this.position.entryTime,
        });

        this.totalProfit += profit;
        this.position = null;

        return {
          action: 'SELL',
          price: currentPrice,
          profit,
          profitPercent,
          ordId: result.data[0].ordId,
        };
      }
    }

    return {
      action: 'HOLD',
      reason: signal.signal === 'HOLD' ? '無明確信號' : '無持倉或信號方向不符',
    };
  }

  async checkAndTrade() {
    if (this.status !== STRATEGY_STATUS.ACTIVE) {
      return { action: 'INACTIVE', reason: '策略未啟動' };
    }

    const analysis = await this.analyzeMarket();
    const signal = this.generateSignal(analysis.indicators);

    if (signal.signal !== 'HOLD' && signal.confidence >= 50) {
      return this.executeSignal(signal, analysis.currentPrice);
    }

    return {
      action: 'HOLD',
      signal,
      currentPrice: analysis.currentPrice,
      position: this.position,
    };
  }

  getStatus() {
    return {
      instId: this.instId,
      status: this.status,
      amountPerTrade: this.amountPerTrade,
      timeframe: this.timeframe,
      currentPosition: this.position,
      tradeCount: this.tradeHistory.length,
      totalProfit: this.totalProfit,
      winRate: this.tradeHistory.length > 0
        ? (this.tradeHistory.filter((t) => t.profit > 0).length / this.tradeHistory.length) * 100
        : 0,
      recentTrades: this.tradeHistory.slice(-5),
    };
  }

  start() {
    this.status = STRATEGY_STATUS.ACTIVE;
  }

  pause() {
    this.status = STRATEGY_STATUS.PAUSED;
  }

  stop() {
    this.status = STRATEGY_STATUS.STOPPED;
  }
}

// Strategy manager to track active strategies
const activeStrategies = new Map();

export const createGridStrategy = (params) => {
  const strategy = new GridStrategy(params);
  const id = `grid_${params.instId}_${Date.now()}`;
  activeStrategies.set(id, { type: 'grid', strategy });
  return { id, strategy };
};

export const createDCAStrategy = (params) => {
  const strategy = new DCAStrategy(params);
  const id = `dca_${params.instId}_${Date.now()}`;
  activeStrategies.set(id, { type: 'dca', strategy });
  return { id, strategy };
};

export const createTrendStrategy = (params) => {
  const strategy = new TrendStrategy(params);
  const id = `trend_${params.instId}_${Date.now()}`;
  activeStrategies.set(id, { type: 'trend', strategy });
  return { id, strategy };
};

export const getStrategy = (id) => activeStrategies.get(id);

export const getAllStrategies = () => {
  const result = [];
  for (const [id, { type, strategy }] of activeStrategies) {
    result.push({ id, type, status: strategy.getStatus() });
  }
  return result;
};

export const removeStrategy = (id) => {
  const entry = activeStrategies.get(id);
  if (entry) {
    entry.strategy.stop();
    activeStrategies.delete(id);
    return true;
  }
  return false;
};
