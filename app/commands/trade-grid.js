import { COMMAND_TRADE_GRID } from '../../constants/command.js';
import { createGridStrategy, getStrategy, removeStrategy } from '../../services/trading-strategies.js';
import Command from './command.js';

export default new Command({
  type: COMMAND_TRADE_GRID,
  label: 'grid',
  aliases: ['網格', 'grid-trading'],
  hint: '<start|stop|status> [交易對] [上限價] [下限價] [格數] [總金額]',
  limit: 1,
  handler: async (context) => {
    const args = context.trimmedText.split(' ').slice(1);
    const action = args[0]?.toLowerCase();

    if (!action || action === 'help') {
      return `📊 網格交易策略

使用方式：
/grid start BTC-USDT 70000 60000 10 1000
  - 交易對: BTC-USDT
  - 上限價: 70000
  - 下限價: 60000
  - 格數: 10
  - 總金額: 1000 USDT

/grid status [策略ID]
  - 查看策略狀態

/grid stop [策略ID]
  - 停止策略

⚠️ 注意：網格交易有風險，請謹慎設定參數`;
    }

    if (action === 'start') {
      const [, instId, upperPrice, lowerPrice, gridCount, totalAmount] = args;

      if (!instId || !upperPrice || !lowerPrice || !gridCount || !totalAmount) {
        return '❌ 參數不足\n用法: /grid start BTC-USDT 70000 60000 10 1000';
      }

      try {
        const { id, strategy } = createGridStrategy({
          instId: instId.toUpperCase(),
          upperPrice,
          lowerPrice,
          gridCount,
          totalAmount,
        });

        const preview = await strategy.initialize();

        return `📊 網格策略已建立

🔑 策略ID: ${id}
💱 交易對: ${instId.toUpperCase()}
📈 上限價: $${preview.gridLines[preview.gridLines.length - 1].price.toFixed(2)}
📉 下限價: $${preview.gridLines[0].price.toFixed(2)}
📏 格數: ${gridCount}
💵 每格金額: $${preview.amountPerGrid.toFixed(2)}
💰 總金額: $${totalAmount}
📍 現價: $${preview.currentPrice.toFixed(2)}

待下訂單: ${preview.pendingOrders.length} 筆
- 買單: ${preview.pendingOrders.filter((o) => o.type === 'buy').length} 筆
- 賣單: ${preview.pendingOrders.filter((o) => o.type === 'sell').length} 筆

⚠️ 策略已建立但尚未啟動
輸入 /grid confirm ${id} 確認啟動`;
      } catch (error) {
        return `❌ 建立策略失敗: ${error.message}`;
      }
    }

    if (action === 'confirm') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID';
      }

      const entry = getStrategy(strategyId);
      if (!entry) {
        return '❌ 找不到該策略';
      }

      try {
        const result = await entry.strategy.placeGridOrders();

        return `✅ 網格策略已啟動

🔑 策略ID: ${strategyId}
📊 狀態: ${result.status}
📍 現價: $${result.currentPrice.toFixed(2)}

訂單狀態:
✅ 成功: ${result.successCount} 筆
❌ 失敗: ${result.failedCount} 筆

💡 使用 /grid status ${strategyId} 查看狀態`;
      } catch (error) {
        return `❌ 啟動策略失敗: ${error.message}`;
      }
    }

    if (action === 'status') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID\n用法: /grid status [策略ID]';
      }

      const entry = getStrategy(strategyId);
      if (!entry) {
        return '❌ 找不到該策略';
      }

      const status = entry.strategy.getStatus();

      return `📊 網格策略狀態

🔑 ID: ${strategyId}
💱 交易對: ${status.instId}
📊 狀態: ${status.status}
📈 上限: $${status.upperPrice.toFixed(2)}
📉 下限: $${status.lowerPrice.toFixed(2)}
📏 格數: ${status.gridCount}
💰 總金額: $${status.totalAmount.toFixed(2)}
📝 活躍訂單: ${status.activeOrders} 筆
💵 總收益: $${status.totalProfit.toFixed(2)}`;
    }

    if (action === 'stop') {
      const strategyId = args[1];
      if (!strategyId) {
        return '❌ 請提供策略ID\n用法: /grid stop [策略ID]';
      }

      const entry = getStrategy(strategyId);
      if (!entry) {
        return '❌ 找不到該策略';
      }

      try {
        const cancelResults = await entry.strategy.cancelAllOrders();
        removeStrategy(strategyId);

        const successCount = cancelResults.filter((r) => r.success).length;

        return `⏹️ 網格策略已停止

🔑 ID: ${strategyId}
📝 已取消訂單: ${successCount}/${cancelResults.length} 筆`;
      } catch (error) {
        return `❌ 停止策略失敗: ${error.message}`;
      }
    }

    return '❌ 未知指令，輸入 /grid help 查看使用方式';
  },
});
