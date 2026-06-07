import autoTrading, {
  TRADING_MODE_PAPER,
  TRADING_MODE_LIVE,
} from '../../services/auto-trading.js';
import {
  COMMAND_TRADING_AUTO_START,
  COMMAND_TRADING_AUTO_STOP,
  COMMAND_TRADING_STATUS,
} from '../commands/index.js';
import Context from '../context.js';

const userStrategies = new Map();

const parseAutoArgs = (text) => {
  const args = text.split(/\s+/).filter(Boolean);
  const result = {
    instId: 'BTC-USDT',
    mode: TRADING_MODE_PAPER,
    interval: 60000,
  };

  for (const arg of args) {
    const upper = arg.toUpperCase();

    if (upper.includes('-USDT') || upper.includes('-USDC')) {
      result.instId = upper;
    } else if (['LIVE', '實盤', '真實'].includes(upper)) {
      result.mode = TRADING_MODE_LIVE;
    } else if (['PAPER', '模擬', '測試'].includes(upper)) {
      result.mode = TRADING_MODE_PAPER;
    } else if (upper.endsWith('M') || upper.endsWith('分')) {
      const num = parseInt(arg);
      if (!isNaN(num)) result.interval = num * 60000;
    } else if (upper.endsWith('S') || upper.endsWith('秒')) {
      const num = parseInt(arg);
      if (!isNaN(num)) result.interval = num * 1000;
    }
  }

  return result;
};

const checkAutoStart = (context) => context.hasCommand(COMMAND_TRADING_AUTO_START);

const execAutoStart = (context) => checkAutoStart(context) && (
  async () => {
    try {
      const userId = context.userId;

      if (userStrategies.has(userId)) {
        context.pushText('⚠️ 你已有執行中的策略，請先停止後再啟動新策略。\n\n使用 /stop 停止當前策略');
        return context;
      }

      const args = parseAutoArgs(context.trimmedText);

      const modeText = args.mode === TRADING_MODE_PAPER ? '模擬交易' : '實盤交易';
      context.pushText(`🚀 正在啟動自動交易...\n\n📊 交易對：${args.instId}\n🔄 模式：${modeText}\n⏱️ 間隔：${args.interval / 1000} 秒`);

      const result = await autoTrading.startAutoTrading({
        instId: args.instId,
        interval: args.interval,
        mode: args.mode,
        onSignal: (signal) => {
          console.log(`[${args.instId}] 信號: ${signal.signal} (${signal.confidence}%)`);
        },
        onTrade: (trade) => {
          console.log(`[${args.instId}] 交易: ${trade.side} @ ${trade.price}`);
        },
      });

      userStrategies.set(userId, result.strategyId);

      let responseText = `✅ 自動交易已啟動！\n\n`;
      responseText += `📊 交易對：${args.instId}\n`;
      responseText += `🔄 模式：${modeText}\n`;
      responseText += `⏱️ 分析間隔：${args.interval / 1000} 秒\n`;
      responseText += `🆔 策略ID：${result.strategyId.slice(-8)}\n\n`;
      responseText += `📝 指令：\n`;
      responseText += `• /status - 查看狀態\n`;
      responseText += `• /stop - 停止交易`;

      context.pushText(responseText);
    } catch (err) {
      context.pushError(err);
    }
    return context;
  }
)();

const checkAutoStop = (context) => context.hasCommand(COMMAND_TRADING_AUTO_STOP);

const execAutoStop = (context) => checkAutoStop(context) && (
  async () => {
    try {
      const userId = context.userId;
      const strategyId = userStrategies.get(userId);

      if (!strategyId) {
        context.pushText('⚠️ 你沒有執行中的策略。\n\n使用 /auto 啟動自動交易');
        return context;
      }

      const result = autoTrading.stopAutoTrading(strategyId);
      userStrategies.delete(userId);

      if (result.success) {
        let responseText = `🛑 自動交易已停止\n\n`;
        responseText += `📊 總交易次數：${result.totalTrades}\n`;
        responseText += `📈 總信號數：${result.totalSignals}\n`;
        responseText += `⏱️ 運行時間：${result.runTime}`;
        context.pushText(responseText);
      } else {
        context.pushText(`❌ ${result.message}`);
      }
    } catch (err) {
      context.pushError(err);
    }
    return context;
  }
)();

const checkStatus = (context) => context.hasCommand(COMMAND_TRADING_STATUS);

const execStatus = (context) => checkStatus(context) && (
  async () => {
    try {
      const userId = context.userId;
      const strategyId = userStrategies.get(userId);

      if (!strategyId) {
        const activeStrategies = autoTrading.getActiveStrategies();
        if (activeStrategies.length === 0) {
          context.pushText('📊 目前沒有執行中的策略\n\n使用 /auto BTC-USDT 啟動自動交易');
        } else {
          let text = `📊 全局策略狀態\n━━━━━━━━━━━━━━━━\n\n`;
          activeStrategies.forEach((s) => {
            text += `• ${s.instId} (${s.mode})\n`;
            text += `  交易：${s.trades} | 信號：${s.signals}\n\n`;
          });
          context.pushText(text);
        }
        return context;
      }

      const status = autoTrading.getStrategyStatus(strategyId);
      const formattedStatus = autoTrading.formatStrategyStatus(status);
      context.pushText(formattedStatus);
    } catch (err) {
      context.pushError(err);
    }
    return context;
  }
)();

export {
  execAutoStart,
  execAutoStop,
  execStatus,
};
