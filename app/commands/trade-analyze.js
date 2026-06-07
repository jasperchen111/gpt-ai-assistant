import { COMMAND_TRADE_ANALYZE } from '../../constants/command.js';
import { analyzeMarket, getQuickAnalysis } from '../../services/trading-ai.js';
import Command from './command.js';

export default new Command({
  type: COMMAND_TRADE_ANALYZE,
  label: 'analyze',
  aliases: ['分析', '行情', 'market'],
  hint: '[交易對] [時間框架]',
  limit: 1,
  handler: async (context) => {
    const args = context.trimmedText.split(' ').slice(1);
    const instId = (args[0] || 'BTC-USDT').toUpperCase();
    const timeframe = args[1] || '1H';

    try {
      if (args[1]) {
        const result = await analyzeMarket(instId, timeframe);
        return result.analysis;
      }

      const result = await getQuickAnalysis(instId);
      return result.summary;
    } catch (error) {
      return `分析失敗: ${error.message}`;
    }
  },
});
