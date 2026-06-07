import { COMMAND_TRADE_PRICE } from '../../constants/command.js';
import { getTicker, formatTickerData } from '../../services/okx.js';
import Command from './command.js';

export default new Command({
  type: COMMAND_TRADE_PRICE,
  label: 'price',
  aliases: ['價格', '報價', 'quote'],
  hint: '[交易對]',
  limit: 1,
  handler: async (context) => {
    const args = context.trimmedText.split(' ').slice(1);
    const symbols = args.length > 0
      ? args.map((s) => s.toUpperCase())
      : ['BTC-USDT', 'ETH-USDT'];

    try {
      const results = await Promise.all(
        symbols.map(async (instId) => {
          const response = await getTicker(instId);
          if (response.data && response.data.length > 0) {
            return formatTickerData(response.data[0]);
          }
          return null;
        }),
      );

      const validResults = results.filter((r) => r !== null);

      if (validResults.length === 0) {
        return '無法取得報價，請確認交易對名稱';
      }

      const priceText = validResults
        .map((ticker) => {
          const changeIcon = ticker.priceChangePercent24h >= 0 ? '📈' : '📉';
          const changeSign = ticker.priceChangePercent24h >= 0 ? '+' : '';
          return `${changeIcon} ${ticker.symbol}
💰 $${ticker.lastPrice.toFixed(4)}
📊 ${changeSign}${ticker.priceChangePercent24h}%
📈 高: $${ticker.high24h.toFixed(4)}
📉 低: $${ticker.low24h.toFixed(4)}`;
        })
        .join('\n\n');

      return `📊 即時報價\n\n${priceText}`;
    } catch (error) {
      return `取得報價失敗: ${error.message}`;
    }
  },
});
