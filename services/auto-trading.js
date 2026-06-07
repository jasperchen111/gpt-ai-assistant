import exchange from './coingecko.js';
import { createChatCompletion, ROLE_SYSTEM, ROLE_HUMAN } from './openai.js';

export const TRADING_MODE_PAPER = 'paper';
export const TRADING_MODE_LIVE = 'live';

const activeStrategies = new Map();

const analyzeMarket = async (instId, candles, indicators) => {
  const prompt = `你是專業的加密貨幣交易分析師。分析以下市場數據並給出交易建議。

交易對：${instId}
當前價格：$${indicators.currentPrice}

技術指標：
- SMA20: $${indicators.sma20?.toFixed(2) || 'N/A'}
- SMA50: $${indicators.sma50?.toFixed(2) || 'N/A'}
- RSI(14): ${indicators.rsi14?.toFixed(2) || 'N/A'}
- EMA12: $${indicators.ema12?.toFixed(2) || 'N/A'}
- EMA26: $${indicators.ema26?.toFixed(2) || 'N/A'}

最近5根K線（從新到舊）：
${candles.slice(0, 5).map((c) => `開:${c[1]} 高:${c[2]} 低:${c[3]} 收:${c[4]}`).join('\n')}

請以 JSON 格式回覆：
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": 0-100,
  "reason": "簡短說明",
  "stopLoss": 建議止損價,
  "takeProfit": 建議止盈價
}`;

  try {
    const response = await createChatCompletion({
      messages: [
        { role: ROLE_SYSTEM, content: '你是專業交易分析師，只回覆 JSON 格式。' },
        { role: ROLE_HUMAN, content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 500,
    });

    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { signal: 'HOLD', confidence: 0, reason: '無法解析分析結果' };
  } catch (error) {
    console.error('AI 分析錯誤:', error.message);
    return { signal: 'HOLD', confidence: 0, reason: error.message };
  }
};

const executeTrade = async (instId, signal, amount, mode = TRADING_MODE_PAPER) => {
  if (mode === TRADING_MODE_PAPER) {
    return {
      success: true,
      mode: 'paper',
      instId,
      side: signal.signal,
      amount,
      price: signal.currentPrice,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const side = signal.signal.toLowerCase();
    const result = await exchange.placeOrder(instId, side, 'market', amount);
    return {
      success: result.code === '0',
      mode: 'live',
      instId,
      side,
      amount,
      orderId: result.data?.[0]?.ordId,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};

export const startAutoTrading = async (options = {}) => {
  const {
    instId = 'BTC-USDT',
    interval = 60000,
    mode = TRADING_MODE_PAPER,
    positionSize = 0.01,
    minConfidence = 70,
    onSignal = null,
    onTrade = null,
    onError = null,
  } = options;

  const strategyId = `${instId}-${Date.now()}`;

  const strategy = {
    id: strategyId,
    instId,
    interval,
    mode,
    positionSize,
    minConfidence,
    isRunning: true,
    trades: [],
    signals: [],
    startTime: new Date(),
    position: null,
  };

  const runStrategy = async () => {
    if (!strategy.isRunning) return;

    try {
      const candlesResponse = await exchange.getCandles(instId, '1H', 50);
      if (candlesResponse.code !== '0') {
        throw new Error('無法取得市場數據');
      }

      const candles = candlesResponse.data;
      const indicators = exchange.calculateTechnicalIndicators(candles);

      const analysis = await analyzeMarket(instId, candles, indicators);
      analysis.currentPrice = indicators.currentPrice;
      analysis.timestamp = new Date().toISOString();

      strategy.signals.push(analysis);
      if (strategy.signals.length > 100) strategy.signals.shift();

      if (onSignal) onSignal(analysis);

      if (analysis.confidence >= minConfidence && analysis.signal !== 'HOLD') {
        const shouldTrade = (
          (analysis.signal === 'BUY' && !strategy.position) ||
          (analysis.signal === 'SELL' && strategy.position)
        );

        if (shouldTrade) {
          const trade = await executeTrade(instId, analysis, positionSize, mode);
          strategy.trades.push(trade);

          if (analysis.signal === 'BUY') {
            strategy.position = {
              entryPrice: analysis.currentPrice,
              size: positionSize,
              entryTime: new Date(),
            };
          } else {
            strategy.position = null;
          }

          if (onTrade) onTrade(trade);
        }
      }
    } catch (error) {
      console.error('策略執行錯誤:', error.message);
      if (onError) onError(error);
    }

    if (strategy.isRunning) {
      setTimeout(runStrategy, interval);
    }
  };

  activeStrategies.set(strategyId, strategy);
  runStrategy();

  return {
    strategyId,
    message: `自動交易已啟動：${instId}`,
    mode,
    interval: `${interval / 1000} 秒`,
  };
};

export const stopAutoTrading = (strategyId) => {
  const strategy = activeStrategies.get(strategyId);
  if (strategy) {
    strategy.isRunning = false;
    activeStrategies.delete(strategyId);
    return {
      success: true,
      message: `策略 ${strategyId} 已停止`,
      totalTrades: strategy.trades.length,
      totalSignals: strategy.signals.length,
      runTime: `${Math.round((new Date() - strategy.startTime) / 60000)} 分鐘`,
    };
  }
  return { success: false, message: '找不到策略' };
};

export const getActiveStrategies = () => {
  const strategies = [];
  for (const [id, strategy] of activeStrategies) {
    strategies.push({
      id,
      instId: strategy.instId,
      mode: strategy.mode,
      isRunning: strategy.isRunning,
      trades: strategy.trades.length,
      signals: strategy.signals.length,
      position: strategy.position,
      startTime: strategy.startTime,
    });
  }
  return strategies;
};

export const getStrategyStatus = (strategyId) => {
  const strategy = activeStrategies.get(strategyId);
  if (!strategy) return null;

  return {
    id: strategy.id,
    instId: strategy.instId,
    mode: strategy.mode,
    isRunning: strategy.isRunning,
    position: strategy.position,
    recentSignals: strategy.signals.slice(-5),
    recentTrades: strategy.trades.slice(-10),
    stats: {
      totalTrades: strategy.trades.length,
      totalSignals: strategy.signals.length,
      runTime: `${Math.round((new Date() - strategy.startTime) / 60000)} 分鐘`,
    },
  };
};

export const formatStrategyStatus = (status) => {
  if (!status) return '找不到策略';

  let text = `🤖 自動交易狀態\n`;
  text += `━━━━━━━━━━━━━━━━\n\n`;
  text += `📊 交易對：${status.instId}\n`;
  text += `🔄 模式：${status.mode === 'paper' ? '模擬交易' : '實盤交易'}\n`;
  text += `⏱️ 運行時間：${status.stats.runTime}\n`;
  text += `📈 信號數：${status.stats.totalSignals}\n`;
  text += `💰 交易數：${status.stats.totalTrades}\n\n`;

  if (status.position) {
    text += `📍 持倉中\n`;
    text += `• 進場價：$${status.position.entryPrice}\n`;
    text += `• 數量：${status.position.size}\n\n`;
  }

  if (status.recentSignals.length > 0) {
    text += `📡 最近信號\n`;
    status.recentSignals.slice(-3).forEach((s) => {
      const emoji = s.signal === 'BUY' ? '🟢' : s.signal === 'SELL' ? '🔴' : '⚪';
      text += `${emoji} ${s.signal} (${s.confidence}%) - ${s.reason}\n`;
    });
  }

  return text;
};

export default {
  TRADING_MODE_PAPER,
  TRADING_MODE_LIVE,
  startAutoTrading,
  stopAutoTrading,
  getActiveStrategies,
  getStrategyStatus,
  formatStrategyStatus,
};
