import { describe, expect, test } from '@jest/globals';
import {
  GridStrategy,
  DCAStrategy,
  TrendStrategy,
  STRATEGY_STATUS,
} from '../services/trading-strategies.js';

describe('Trading Strategies', () => {
  describe('GridStrategy', () => {
    test('should calculate grid lines correctly', () => {
      const strategy = new GridStrategy({
        instId: 'BTC-USDT',
        upperPrice: 70000,
        lowerPrice: 60000,
        gridCount: 10,
        totalAmount: 1000,
      });

      const lines = strategy.calculateGridLines();

      expect(lines.length).toBe(11);
      expect(lines[0].price).toBe(60000);
      expect(lines[10].price).toBe(70000);
      expect(lines[5].price).toBe(65000);
    });

    test('should calculate amount per grid correctly', () => {
      const strategy = new GridStrategy({
        instId: 'BTC-USDT',
        upperPrice: 70000,
        lowerPrice: 60000,
        gridCount: 10,
        totalAmount: 1000,
      });

      expect(strategy.getAmountPerGrid()).toBe(100);
    });

    test('should have correct initial status', () => {
      const strategy = new GridStrategy({
        instId: 'BTC-USDT',
        upperPrice: 70000,
        lowerPrice: 60000,
        gridCount: 10,
        totalAmount: 1000,
      });

      const status = strategy.getStatus();

      expect(status.instId).toBe('BTC-USDT');
      expect(status.status).toBe(STRATEGY_STATUS.STOPPED);
      expect(status.upperPrice).toBe(70000);
      expect(status.lowerPrice).toBe(60000);
      expect(status.gridCount).toBe(10);
      expect(status.totalAmount).toBe(1000);
    });
  });

  describe('DCAStrategy', () => {
    test('should initialize with correct parameters', () => {
      const strategy = new DCAStrategy({
        instId: 'BTC-USDT',
        amountPerBuy: 100,
        intervalHours: 24,
        maxBuys: 30,
      });

      const status = strategy.getStatus();

      expect(status.instId).toBe('BTC-USDT');
      expect(status.amountPerBuy).toBe(100);
      expect(status.intervalHours).toBe(24);
      expect(status.maxBuys).toBe(30);
      expect(status.completedBuys).toBe(0);
      expect(status.totalInvested).toBe(0);
    });

    test('should track buy history', () => {
      const strategy = new DCAStrategy({
        instId: 'BTC-USDT',
        amountPerBuy: 100,
        intervalHours: 24,
        maxBuys: 30,
      });

      strategy.buyHistory.push({
        price: 50000,
        quantity: 0.002,
        amount: 100,
        timestamp: Date.now(),
      });
      strategy.totalInvested = 100;
      strategy.totalQuantity = 0.002;

      const status = strategy.getStatus();

      expect(status.completedBuys).toBe(1);
      expect(status.totalInvested).toBe(100);
      expect(status.averagePrice).toBe(50000);
    });

    test('should determine buy timing correctly', () => {
      const strategy = new DCAStrategy({
        instId: 'BTC-USDT',
        amountPerBuy: 100,
        intervalHours: 24,
        maxBuys: 0,
      });

      strategy.start();

      expect(strategy.shouldBuyNow()).toBe(true);

      strategy.lastBuyTime = Date.now();
      expect(strategy.shouldBuyNow()).toBe(false);

      strategy.lastBuyTime = Date.now() - 25 * 60 * 60 * 1000;
      expect(strategy.shouldBuyNow()).toBe(true);
    });

    test('should respect max buys limit', () => {
      const strategy = new DCAStrategy({
        instId: 'BTC-USDT',
        amountPerBuy: 100,
        intervalHours: 24,
        maxBuys: 2,
      });

      strategy.start();
      strategy.buyHistory = [{ }, { }];

      expect(strategy.shouldBuyNow()).toBe(false);
    });
  });

  describe('TrendStrategy', () => {
    test('should initialize with correct parameters', () => {
      const strategy = new TrendStrategy({
        instId: 'BTC-USDT',
        amountPerTrade: 100,
        timeframe: '1H',
      });

      const status = strategy.getStatus();

      expect(status.instId).toBe('BTC-USDT');
      expect(status.amountPerTrade).toBe(100);
      expect(status.timeframe).toBe('1H');
      expect(status.tradeCount).toBe(0);
      expect(status.totalProfit).toBe(0);
    });

    test('should generate buy signal on oversold RSI', () => {
      const strategy = new TrendStrategy({
        instId: 'BTC-USDT',
        amountPerTrade: 100,
        rsiOversold: 30,
        rsiOverbought: 70,
      });

      const signal = strategy.generateSignal({
        rsi14: 25,
        sma7: 51000,
        sma25: 50000,
        ema12: 51000,
        ema26: 50000,
        macd: { macdLine: 100 },
      });

      expect(signal.signal).toBe('BUY');
      expect(signal.buySignals).toBeGreaterThan(signal.sellSignals);
    });

    test('should generate sell signal on overbought RSI', () => {
      const strategy = new TrendStrategy({
        instId: 'BTC-USDT',
        amountPerTrade: 100,
        rsiOversold: 30,
        rsiOverbought: 70,
      });

      const signal = strategy.generateSignal({
        rsi14: 75,
        sma7: 49000,
        sma25: 50000,
        ema12: 49000,
        ema26: 50000,
        macd: { macdLine: -100 },
      });

      expect(signal.signal).toBe('SELL');
      expect(signal.sellSignals).toBeGreaterThan(signal.buySignals);
    });

    test('should generate hold signal on mixed conditions', () => {
      const strategy = new TrendStrategy({
        instId: 'BTC-USDT',
        amountPerTrade: 100,
      });

      const signal = strategy.generateSignal({
        rsi14: 50,
        sma7: 51000,
        sma25: 50000,
        ema12: 49000,
        ema26: 50000,
        macd: { macdLine: 50 },
      });

      expect(signal.signal).toBe('HOLD');
    });

    test('should track trade history and calculate win rate', () => {
      const strategy = new TrendStrategy({
        instId: 'BTC-USDT',
        amountPerTrade: 100,
      });

      strategy.tradeHistory = [
        { profit: 50, profitPercent: 5 },
        { profit: -20, profitPercent: -2 },
        { profit: 30, profitPercent: 3 },
      ];
      strategy.totalProfit = 60;

      const status = strategy.getStatus();

      expect(status.tradeCount).toBe(3);
      expect(status.totalProfit).toBe(60);
      expect(status.winRate).toBeCloseTo(66.67, 1);
    });
  });
});
