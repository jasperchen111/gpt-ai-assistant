import exchange from './coingecko.js';
import backtest from './backtest.js';
import { createChatCompletion, ROLE_SYSTEM, ROLE_HUMAN } from './openai.js';

export const STRATEGIES = {
  SMA_CROSS: { name: 'sma_cross', label: 'SMA均線交叉', params: { shortPeriod: 10, longPeriod: 30 } },
  RSI: { name: 'rsi', label: 'RSI超買超賣', params: { period: 14, oversold: 30, overbought: 70 } },
  BOLLINGER: { name: 'bollinger', label: '布林通道', params: { period: 20, stdDev: 2 } },
  GRID: { name: 'grid', label: '網格交易', params: { gridCount: 10 } },
};

class AdaptiveTrading {
  constructor() {
    this.strategies = new Map();
    this.performanceHistory = new Map();
    this.currentStrategy = null;
    this.isRunning = false;
    this.trades = [];
    this.config = {
      evaluationPeriod: 10,
      minTradesForEvaluation: 3,
      switchThreshold: -5,
      learningRate: 0.1,
    };
  }

  async evaluateAllStrategies(instId, days = 14) {
    const results = [];

    for (const [key, strategy] of Object.entries(STRATEGIES)) {
      try {
        const result = await backtest.runBacktest({
          instId,
          bar: '1H',
          days,
          strategy: strategy.name,
          strategyParams: strategy.params,
          initialCapital: 10000,
        });

        results.push({
          key,
          strategy: strategy.name,
          label: strategy.label,
          params: strategy.params,
          returnPercent: result.performance.returnPercent,
          winRate: result.statistics.winRate,
          maxDrawdown: result.performance.maxDrawdown,
          trades: result.statistics.completedTrades,
          score: this.calculateScore(result),
        });
      } catch (error) {
        console.error(`策略 ${strategy.label} 評估失敗:`, error.message);
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  calculateScore(result) {
    const returnWeight = 0.4;
    const winRateWeight = 0.3;
    const drawdownWeight = 0.3;

    const returnScore = Math.min(result.performance.returnPercent / 10, 10);
    const winRateScore = result.statistics.winRate / 10;
    const drawdownScore = Math.max(0, 10 - result.performance.maxDrawdown / 2);

    return (returnScore * returnWeight) + (winRateScore * winRateWeight) + (drawdownScore * drawdownWeight);
  }

  async selectBestStrategy(instId) {
    const evaluations = await this.evaluateAllStrategies(instId);

    if (evaluations.length === 0) {
      return STRATEGIES.SMA_CROSS;
    }

    const best = evaluations[0];
    console.log(`最佳策略: ${best.label} (得分: ${best.score.toFixed(2)})`);

    return {
      name: best.strategy,
      label: best.label,
      params: best.params,
      score: best.score,
    };
  }

  async optimizeParameters(instId, strategyName, currentParams) {
    const variations = this.generateParameterVariations(strategyName, currentParams);
    let bestParams = currentParams;
    let bestScore = -Infinity;

    for (const params of variations) {
      try {
        const result = await backtest.runBacktest({
          instId,
          bar: '1H',
          days: 14,
          strategy: strategyName,
          strategyParams: params,
          initialCapital: 10000,
        });

        const score = this.calculateScore(result);
        if (score > bestScore) {
          bestScore = score;
          bestParams = params;
        }
      } catch (error) {
        continue;
      }
    }

    return bestParams;
  }

  generateParameterVariations(strategyName, currentParams) {
    const variations = [currentParams];

    switch (strategyName) {
      case 'sma_cross':
        [5, 10, 15, 20].forEach(short => {
          [20, 30, 50].forEach(long => {
            if (short < long) {
              variations.push({ shortPeriod: short, longPeriod: long });
            }
          });
        });
        break;

      case 'rsi':
        [10, 14, 21].forEach(period => {
          [20, 25, 30].forEach(oversold => {
            [70, 75, 80].forEach(overbought => {
              variations.push({ period, oversold, overbought });
            });
          });
        });
        break;

      case 'bollinger':
        [15, 20, 25].forEach(period => {
          [1.5, 2, 2.5].forEach(stdDev => {
            variations.push({ period, stdDev });
          });
        });
        break;

      case 'grid':
        [5, 10, 15, 20].forEach(gridCount => {
          variations.push({ gridCount });
        });
        break;
    }

    return variations;
  }

  recordTrade(trade) {
    this.trades.push({
      ...trade,
      strategy: this.currentStrategy?.name,
      timestamp: new Date(),
    });

    if (this.trades.length > 100) {
      this.trades.shift();
    }
  }

  evaluateRecentPerformance() {
    const recentTrades = this.trades.slice(-this.config.minTradesForEvaluation);

    if (recentTrades.length < this.config.minTradesForEvaluation) {
      return null;
    }

    const completedTrades = recentTrades.filter(t => t.type === 'SELL' && t.pnl !== undefined);

    if (completedTrades.length === 0) {
      return null;
    }

    const totalPnl = completedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winCount = completedTrades.filter(t => t.pnl > 0).length;
    const winRate = (winCount / completedTrades.length) * 100;

    return {
      totalPnl,
      winRate,
      tradeCount: completedTrades.length,
      avgPnl: totalPnl / completedTrades.length,
    };
  }

  async shouldSwitchStrategy(instId) {
    const performance = this.evaluateRecentPerformance();

    if (!performance) {
      return false;
    }

    if (performance.totalPnl < this.config.switchThreshold || performance.winRate < 30) {
      console.log(`策略表現不佳 (PnL: ${performance.totalPnl.toFixed(2)}, 勝率: ${performance.winRate.toFixed(1)}%)，準備切換...`);
      return true;
    }

    return false;
  }

  async getAIAdvice(instId, candles, indicators, recentPerformance) {
    const prompt = `你是專業的量化交易顧問。分析以下數據並給出策略調整建議。

交易對：${instId}
當前價格：$${indicators.currentPrice?.toFixed(2)}

技術指標：
- RSI(14): ${indicators.rsi14?.toFixed(2) || 'N/A'}
- SMA20: $${indicators.sma20?.toFixed(2) || 'N/A'}
- SMA50: $${indicators.sma50?.toFixed(2) || 'N/A'}

當前策略：${this.currentStrategy?.label || '未選擇'}

最近表現：
${recentPerformance ? `
- 總損益: ${recentPerformance.totalPnl.toFixed(2)}
- 勝率: ${recentPerformance.winRate.toFixed(1)}%
- 交易次數: ${recentPerformance.tradeCount}
` : '資料不足'}

請給出建議，JSON 格式：
{
  "action": "KEEP" | "SWITCH" | "OPTIMIZE",
  "reason": "簡短說明",
  "suggestedStrategy": "sma_cross | rsi | bollinger | grid",
  "confidence": 0-100
}`;

    try {
      const response = await createChatCompletion({
        messages: [
          { role: ROLE_SYSTEM, content: '你是量化交易顧問，只回覆 JSON 格式。' },
          { role: ROLE_HUMAN, content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 300,
      });

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('AI 建議獲取失敗:', error.message);
    }

    return { action: 'KEEP', reason: '無法獲取建議', confidence: 0 };
  }

  async start(options = {}) {
    const {
      instId = 'BTC-USDT',
      interval = 60000,
      initialCapital = 10000,
      positionSize = 0.1,
      onUpdate = null,
      onTrade = null,
      onStrategyChange = null,
    } = options;

    this.isRunning = true;
    this.instId = instId;
    this.capital = initialCapital;
    this.positionSize = positionSize;
    this.position = null;
    this.startTime = new Date();

    console.log(`🚀 自適應交易系統啟動: ${instId}`);

    this.currentStrategy = await this.selectBestStrategy(instId);
    console.log(`📊 選擇策略: ${this.currentStrategy.label}`);

    if (onStrategyChange) {
      onStrategyChange(this.currentStrategy);
    }

    const runLoop = async () => {
      if (!this.isRunning) return;

      try {
        const candlesResponse = await exchange.getCandles(instId, '1H', 50);
        if (candlesResponse.code !== '0') throw new Error('無法取得數據');

        const candles = candlesResponse.data;
        const indicators = exchange.calculateTechnicalIndicators(candles);

        const signal = this.generateSignal(candles, indicators);

        if (onUpdate) {
          onUpdate({
            price: indicators.currentPrice,
            strategy: this.currentStrategy,
            signal,
            indicators,
          });
        }

        if (signal.action !== 'HOLD') {
          const trade = this.executeTrade(signal, indicators.currentPrice);
          this.recordTrade(trade);

          if (onTrade) {
            onTrade(trade);
          }
        }

        if (this.trades.length % this.config.evaluationPeriod === 0) {
          const shouldSwitch = await this.shouldSwitchStrategy(instId);

          if (shouldSwitch) {
            const newStrategy = await this.selectBestStrategy(instId);

            if (newStrategy.name !== this.currentStrategy.name) {
              console.log(`🔄 切換策略: ${this.currentStrategy.label} → ${newStrategy.label}`);
              this.currentStrategy = newStrategy;

              if (onStrategyChange) {
                onStrategyChange(newStrategy);
              }
            } else {
              const optimizedParams = await this.optimizeParameters(instId, this.currentStrategy.name, this.currentStrategy.params);
              this.currentStrategy.params = optimizedParams;
              console.log(`⚙️ 優化參數:`, optimizedParams);
            }
          }
        }
      } catch (error) {
        console.error('執行錯誤:', error.message);
      }

      if (this.isRunning) {
        setTimeout(runLoop, interval);
      }
    };

    runLoop();

    return {
      message: `自適應交易已啟動`,
      strategy: this.currentStrategy,
      instId,
    };
  }

  generateSignal(candles, indicators) {
    const closes = candles.map(c => parseFloat(c[4])).reverse();
    const currentPrice = indicators.currentPrice;
    const params = this.currentStrategy.params;

    switch (this.currentStrategy.name) {
      case 'sma_cross': {
        const shortSma = exchange.calculateSMA(closes, params.shortPeriod);
        const longSma = exchange.calculateSMA(closes, params.longPeriod);
        const prevShortSma = exchange.calculateSMA(closes.slice(0, -1), params.shortPeriod);
        const prevLongSma = exchange.calculateSMA(closes.slice(0, -1), params.longPeriod);

        if (prevShortSma <= prevLongSma && shortSma > longSma) {
          return { action: 'BUY', reason: '短均線上穿長均線', confidence: 75 };
        } else if (prevShortSma >= prevLongSma && shortSma < longSma) {
          return { action: 'SELL', reason: '短均線下穿長均線', confidence: 75 };
        }
        break;
      }

      case 'rsi': {
        const rsi = indicators.rsi14;
        if (rsi < params.oversold) {
          return { action: 'BUY', reason: `RSI 超賣 (${rsi.toFixed(1)})`, confidence: 70 };
        } else if (rsi > params.overbought) {
          return { action: 'SELL', reason: `RSI 超買 (${rsi.toFixed(1)})`, confidence: 70 };
        }
        break;
      }

      case 'bollinger': {
        const bb = exchange.calculateBollingerBands(closes, params.period, params.stdDev);
        if (bb && currentPrice < bb.lower) {
          return { action: 'BUY', reason: '價格低於下軌', confidence: 65 };
        } else if (bb && currentPrice > bb.upper) {
          return { action: 'SELL', reason: '價格高於上軌', confidence: 65 };
        }
        break;
      }

      case 'grid': {
        break;
      }
    }

    return { action: 'HOLD', reason: '無明確信號', confidence: 0 };
  }

  executeTrade(signal, price) {
    const tradeAmount = this.capital * this.positionSize;

    if (signal.action === 'BUY' && !this.position) {
      const qty = tradeAmount / price;
      this.position = { entryPrice: price, qty, entryTime: new Date() };
      this.capital -= tradeAmount;

      return {
        type: 'BUY',
        price,
        qty,
        capital: this.capital,
        reason: signal.reason,
      };
    } else if (signal.action === 'SELL' && this.position) {
      const sellValue = this.position.qty * price;
      const pnl = (price - this.position.entryPrice) * this.position.qty;
      const pnlPercent = ((price - this.position.entryPrice) / this.position.entryPrice) * 100;
      this.capital += sellValue;

      const trade = {
        type: 'SELL',
        price,
        qty: this.position.qty,
        pnl,
        pnlPercent,
        capital: this.capital,
        reason: signal.reason,
      };

      this.position = null;
      return trade;
    }

    return null;
  }

  stop() {
    this.isRunning = false;
    const performance = this.evaluateRecentPerformance();

    return {
      message: '自適應交易已停止',
      finalCapital: this.capital,
      totalTrades: this.trades.length,
      performance,
      runTime: `${Math.round((new Date() - this.startTime) / 60000)} 分鐘`,
    };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      instId: this.instId,
      currentStrategy: this.currentStrategy,
      capital: this.capital,
      position: this.position,
      trades: this.trades.length,
      recentPerformance: this.evaluateRecentPerformance(),
      runTime: this.startTime ? `${Math.round((new Date() - this.startTime) / 60000)} 分鐘` : '0',
    };
  }
}

export { AdaptiveTrading };

export const adaptiveTrader = new AdaptiveTrading();

export default {
  STRATEGIES,
  AdaptiveTrading,
  adaptiveTrader,
};
