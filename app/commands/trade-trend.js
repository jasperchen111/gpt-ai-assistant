import { COMMAND_TRADE_TREND } from '../../constants/command.js';
import { createTrendStrategy, getStrategy, removeStrategy, getAllStrategies } from '../../services/trading-strategies.js';
import Command from './command.js';

export default new Command({
  type: COMMAND_TRADE_TREND,
  label: 'trend',
  aliases: ['趨勢', '趨勢交易'],
  hint: '<start|check|status|stop> [交易對] [每筆金額] [時間框架]',
  limit: 1,
  handler: async (context) => {
    const args = context.trimmedText.split(' ').slice(1);
    const action = args[0]?.toLowerCase();

    if (!action || action === 'help') {
      return `📈 趨勢追蹤策略

使用方式：
/trend start BTC-USDT 100 1H
  - 交易對: BTC-USDT
  - 每筆金額: 100 USDT
  - 時間框架: 1H (1m/5m/15m/1H/4H/1D)

/trend check [策略ID]
  - 檢查信號並執行交易

/trend status [策略ID]
  - 查看策略狀態

/trend stop [策略ID]
  - 停止策略

💡 此策略基於技術指標自動判斷買賣點
   - RSI 超買超賣
   - SMA/EMA 交叉
   - MACD 動能`;
    }

    if (action === 'start') {
      const [, instId, amountPerTrade, timeframe = '1H'] = args;

      if (!instId || !amountPerTrade) {
        return '❌ 參數不足\n用法: /trend start BTC-USDT 100 1H';
      }

      try {
        const { id, strategy } = createTrendStrategy({
          instId: instId.toUpperCase(),
          amountPerTrade,
          timeframe,
        });

        strategy.start();

        const analysis = await strategy.analyzeMarket();
        const signal = strategy.generateSignal(analysis.indicators);

        return `✅ 趨勢追蹤策略已啟動

🔑 策略ID: ${id}
💱 交易對: ${instId.toUpperCase()}
💵 每筆金額: $${amountPerTrade}
⏰ 時間框架: ${timeframe}

📊 當前市場分析:
📍 現價: $${analysis.currentPrice.toFixed(4)}
📐 RSI(14): ${analysis.indicators.rsi14?.toFixed(2) || 'N/A'}
📈 信號: ${signal.signal === 'BUY' ? '🟢 買入' : signal.signal === 'SELL' ? '🔴 賣出' : '🟡 觀望'}
📊 信心度: ${signal.confidence.toFixed(0)}%

${signal.reasons.map((r) => `  • ${r}`).join('\n')}

📌 使用 /trend check ${id} 執行交易`;
      } catch (error) {
        return `❌ 建立策略失敗: ${error.message}`;
      }
    }

    if (action === 'check') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID\n用法: /trend check [策略ID]';
      }

      const entry = getStrategy(strategyId);
      if (!entry || entry.type !== 'trend') {
        return '❌ 找不到該趨勢策略';
      }

      try {
        const result = await entry.strategy.checkAndTrade();

        if (result.action === 'BUY') {
          return `🟢 買入執行成功

💱 交易對: ${entry.strategy.instId}
💰 買入價格: $${result.price.toFixed(4)}
📊 買入數量: ${result.quantity.toFixed(6)}
📝 訂單ID: ${result.ordId}`;
        }

        if (result.action === 'SELL') {
          const profitIcon = result.profit >= 0 ? '📈' : '📉';
          return `🔴 賣出執行成功

💱 交易對: ${entry.strategy.instId}
💰 賣出價格: $${result.price.toFixed(4)}
${profitIcon} 收益: $${result.profit.toFixed(2)} (${result.profitPercent.toFixed(2)}%)
📝 訂單ID: ${result.ordId}`;
        }

        if (result.action === 'HOLD') {
          const status = entry.strategy.getStatus();
          return `🟡 維持觀望

💱 交易對: ${entry.strategy.instId}
📍 現價: $${result.currentPrice?.toFixed(4) || 'N/A'}
📊 信號: ${result.signal?.signal || '無'}
💡 原因: ${result.reason || result.signal?.reasons?.join(', ') || '信心度不足'}

${status.currentPosition ? `📦 當前持倉:
- 方向: ${status.currentPosition.side}
- 入場價: $${status.currentPosition.entryPrice.toFixed(4)}
- 數量: ${status.currentPosition.quantity.toFixed(6)}` : '📭 無持倉'}`;
        }

        return `⏸️ ${result.action}: ${result.reason}`;
      } catch (error) {
        return `❌ 檢查失敗: ${error.message}`;
      }
    }

    if (action === 'status') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID\n用法: /trend status [策略ID]';
      }

      const entry = getStrategy(strategyId);
      if (!entry || entry.type !== 'trend') {
        return '❌ 找不到該趨勢策略';
      }

      const status = entry.strategy.getStatus();

      let positionText = '📭 無持倉';
      if (status.currentPosition) {
        positionText = `📦 當前持倉:
- 方向: ${status.currentPosition.side === 'long' ? '做多' : '做空'}
- 入場價: $${status.currentPosition.entryPrice.toFixed(4)}
- 數量: ${status.currentPosition.quantity.toFixed(6)}
- 持倉時間: ${Math.round((Date.now() - status.currentPosition.entryTime) / 60000)} 分鐘`;
      }

      return `📈 趨勢策略狀態

🔑 ID: ${strategyId}
💱 交易對: ${status.instId}
📊 狀態: ${status.status}
💵 每筆金額: $${status.amountPerTrade.toFixed(2)}
⏰ 時間框架: ${status.timeframe}

${positionText}

📊 交易統計:
- 交易次數: ${status.tradeCount}
- 勝率: ${status.winRate.toFixed(1)}%
- 總收益: $${status.totalProfit.toFixed(2)}`;
    }

    if (action === 'stop') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID\n用法: /trend stop [策略ID]';
      }

      const entry = getStrategy(strategyId);
      if (!entry || entry.type !== 'trend') {
        return '❌ 找不到該趨勢策略';
      }

      const status = entry.strategy.getStatus();
      removeStrategy(strategyId);

      return `⏹️ 趨勢策略已停止

🔑 ID: ${strategyId}
💱 交易對: ${status.instId}

📊 最終統計:
- 交易次數: ${status.tradeCount}
- 勝率: ${status.winRate.toFixed(1)}%
- 總收益: $${status.totalProfit.toFixed(2)}

${status.currentPosition ? '⚠️ 注意：尚有未平倉部位，請手動處理' : ''}`;
    }

    if (action === 'list') {
      const allStrategies = getAllStrategies().filter((s) => s.type === 'trend');

      if (allStrategies.length === 0) {
        return '📋 目前沒有趨勢策略\n\n使用 /trend start 開始';
      }

      const list = allStrategies
        .map((s) => `🔑 ${s.id}
   ${s.status.instId} | ${s.status.status}
   收益: $${s.status.totalProfit.toFixed(2)} | 勝率: ${s.status.winRate.toFixed(0)}%`)
        .join('\n\n');

      return `📋 趨勢策略列表\n\n${list}`;
    }

    return '❌ 未知指令，輸入 /trend help 查看使用方式';
  },
});
