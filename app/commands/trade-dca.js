import { COMMAND_TRADE_DCA } from '../../constants/command.js';
import { createDCAStrategy, getStrategy, removeStrategy, getAllStrategies } from '../../services/trading-strategies.js';
import Command from './command.js';

export default new Command({
  type: COMMAND_TRADE_DCA,
  label: 'dca',
  aliases: ['定投', '定期定額'],
  hint: '<start|buy|status|stop> [交易對] [每次金額] [間隔小時] [最大次數]',
  limit: 1,
  handler: async (context) => {
    const args = context.trimmedText.split(' ').slice(1);
    const action = args[0]?.toLowerCase();

    if (!action || action === 'help') {
      return `💰 DCA 定投策略

使用方式：
/dca start BTC-USDT 100 24 30
  - 交易對: BTC-USDT
  - 每次金額: 100 USDT
  - 間隔: 24 小時
  - 最大次數: 30 次 (0=無限)

/dca buy [策略ID]
  - 立即執行一次買入

/dca status [策略ID]
  - 查看定投狀態

/dca stop [策略ID]
  - 停止定投

/dca list
  - 列出所有 DCA 策略

💡 DCA 適合長期投資，降低擇時風險`;
    }

    if (action === 'start') {
      const [, instId, amountPerBuy, intervalHours = '24', maxBuys = '0'] = args;

      if (!instId || !amountPerBuy) {
        return '❌ 參數不足\n用法: /dca start BTC-USDT 100 24 30';
      }

      try {
        const { id, strategy } = createDCAStrategy({
          instId: instId.toUpperCase(),
          amountPerBuy,
          intervalHours,
          maxBuys,
        });

        strategy.start();

        return `✅ DCA 定投策略已啟動

🔑 策略ID: ${id}
💱 交易對: ${instId.toUpperCase()}
💵 每次金額: $${amountPerBuy}
⏰ 間隔: ${intervalHours} 小時
🔢 最大次數: ${maxBuys === '0' ? '無限' : maxBuys}

📌 使用 /dca buy ${id} 立即買入
📊 使用 /dca status ${id} 查看狀態`;
      } catch (error) {
        return `❌ 建立策略失敗: ${error.message}`;
      }
    }

    if (action === 'buy') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID\n用法: /dca buy [策略ID]';
      }

      const entry = getStrategy(strategyId);
      if (!entry || entry.type !== 'dca') {
        return '❌ 找不到該 DCA 策略';
      }

      try {
        const result = await entry.strategy.executeBuy();

        if (result.success) {
          return `✅ DCA 買入成功

💱 交易對: ${entry.strategy.instId}
💰 買入價格: $${result.buyRecord.price.toFixed(4)}
📊 買入數量: ${result.buyRecord.quantity.toFixed(6)}
💵 花費金額: $${result.buyRecord.amount.toFixed(2)}

📈 累計統計:
- 總投入: $${result.totalInvested.toFixed(2)}
- 總數量: ${result.totalQuantity.toFixed(6)}
- 均價: $${result.averagePrice.toFixed(4)}`;
        }

        return `❌ 買入失敗: ${result.reason || result.error}`;
      } catch (error) {
        return `❌ 買入失敗: ${error.message}`;
      }
    }

    if (action === 'status') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID\n用法: /dca status [策略ID]';
      }

      const entry = getStrategy(strategyId);
      if (!entry || entry.type !== 'dca') {
        return '❌ 找不到該 DCA 策略';
      }

      const status = entry.strategy.getStatus();

      return `💰 DCA 定投狀態

🔑 ID: ${strategyId}
💱 交易對: ${status.instId}
📊 狀態: ${status.status}
💵 每次金額: $${status.amountPerBuy.toFixed(2)}
⏰ 間隔: ${status.intervalHours} 小時
🔢 已買入: ${status.completedBuys}${status.maxBuys > 0 ? `/${status.maxBuys}` : ''} 次

📈 累計統計:
- 總投入: $${status.totalInvested.toFixed(2)}
- 總數量: ${status.totalQuantity.toFixed(6)}
- 均價: $${status.averagePrice.toFixed(4)}

${status.nextBuyTime ? `⏰ 下次買入: ${status.nextBuyTime.toLocaleString('zh-TW')}` : ''}`;
    }

    if (action === 'stop') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID\n用法: /dca stop [策略ID]';
      }

      const entry = getStrategy(strategyId);
      if (!entry || entry.type !== 'dca') {
        return '❌ 找不到該 DCA 策略';
      }

      const status = entry.strategy.getStatus();
      removeStrategy(strategyId);

      return `⏹️ DCA 定投已停止

🔑 ID: ${strategyId}
💱 交易對: ${status.instId}

📈 最終統計:
- 總投入: $${status.totalInvested.toFixed(2)}
- 總數量: ${status.totalQuantity.toFixed(6)}
- 均價: $${status.averagePrice.toFixed(4)}
- 買入次數: ${status.completedBuys} 次`;
    }

    if (action === 'list') {
      const allStrategies = getAllStrategies().filter((s) => s.type === 'dca');

      if (allStrategies.length === 0) {
        return '📋 目前沒有 DCA 策略\n\n使用 /dca start 開始定投';
      }

      const list = allStrategies
        .map((s) => `🔑 ${s.id}
   ${s.status.instId} | ${s.status.status}
   投入: $${s.status.totalInvested.toFixed(2)} | 次數: ${s.status.completedBuys}`)
        .join('\n\n');

      return `📋 DCA 策略列表\n\n${list}`;
    }

    return '❌ 未知指令，輸入 /dca help 查看使用方式';
  },
});
