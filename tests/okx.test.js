import { describe, expect, test } from '@jest/globals';
import {
  formatTickerData,
  formatCandleData,
  calculateTechnicalIndicators,
} from '../services/okx.js';

describe('OKX Service', () => {
  describe('formatTickerData', () => {
    test('should format ticker data correctly', () => {
      const rawTicker = {
        instId: 'BTC-USDT',
        last: '50000.5',
        high24h: '51000',
        low24h: '49000',
        vol24h: '1000',
        open24h: '49500',
        bidPx: '50000',
        askPx: '50001',
        ts: '1700000000000',
      };

      const formatted = formatTickerData(rawTicker);

      expect(formatted.symbol).toBe('BTC-USDT');
      expect(formatted.lastPrice).toBe(50000.5);
      expect(formatted.high24h).toBe(51000);
      expect(formatted.low24h).toBe(49000);
      expect(formatted.volume24h).toBe(1000);
      expect(formatted.bidPrice).toBe(50000);
      expect(formatted.askPrice).toBe(50001);
      expect(formatted.timestamp).toBe(1700000000000);
      expect(parseFloat(formatted.priceChangePercent24h)).toBeCloseTo(1.01, 1);
    });
  });

  describe('formatCandleData', () => {
    test('should format candle data correctly', () => {
      const rawCandle = [
        '1700000000000',
        '50000',
        '51000',
        '49000',
        '50500',
        '1000',
      ];

      const formatted = formatCandleData(rawCandle);

      expect(formatted.timestamp).toBe(1700000000000);
      expect(formatted.open).toBe(50000);
      expect(formatted.high).toBe(51000);
      expect(formatted.low).toBe(49000);
      expect(formatted.close).toBe(50500);
      expect(formatted.volume).toBe(1000);
    });
  });

  describe('calculateTechnicalIndicators', () => {
    test('should calculate SMA correctly', () => {
      const candles = Array.from({ length: 100 }, (_, i) => ({
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 100 + i,
        volume: 1000,
        timestamp: Date.now() - (100 - i) * 3600000,
      }));

      const indicators = calculateTechnicalIndicators(candles);

      expect(indicators.sma7).not.toBeNull();
      expect(indicators.sma25).not.toBeNull();
      expect(indicators.sma99).not.toBeNull();
      expect(indicators.currentPrice).toBe(199);
    });

    test('should calculate RSI correctly', () => {
      const candles = Array.from({ length: 20 }, (_, i) => ({
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 100 + i + (i % 2 === 0 ? 2 : -1),
        volume: 1000,
        timestamp: Date.now() - (20 - i) * 3600000,
      }));

      const indicators = calculateTechnicalIndicators(candles);

      expect(indicators.rsi14).not.toBeNull();
      expect(indicators.rsi14).toBeGreaterThanOrEqual(0);
      expect(indicators.rsi14).toBeLessThanOrEqual(100);
    });

    test('should return null for insufficient data', () => {
      const candles = [
        { open: 100, high: 105, low: 95, close: 100, volume: 1000, timestamp: Date.now() },
      ];

      const indicators = calculateTechnicalIndicators(candles);

      expect(indicators.sma99).toBeNull();
      expect(indicators.rsi14).toBeNull();
    });
  });
});
