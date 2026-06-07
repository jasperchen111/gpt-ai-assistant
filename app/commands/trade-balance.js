import { COMMAND_TRADE_BALANCE } from '../../constants/command.js';
import { getAccountBalance } from '../../services/okx.js';
import Command from './command.js';

export default new Command({
  type: COMMAND_TRADE_BALANCE,
  label: 'balance',
  aliases: ['餘額', '資產', 'wallet'],
  hint: '',
  limit: 1,
  handler: async () => {
    try {
      const response = await getAccountBalance();

      if (response.code !== '0') {
        return `查詢失敗: ${response.msg}`;
      }

      const accountData = response.data[0];

      if (!accountData || !accountData.details || accountData.details.length === 0) {
        return '帳戶無資產';
      }

      const totalEquity = parseFloat(accountData.totalEq);
      const assets = accountData.details
        .filter((d) => parseFloat(d.eq) > 0)
        .sort((a, b) => parseFloat(b.eq) - parseFloat(a.eq))
        .slice(0, 10);

      const assetText = assets
        .map((asset) => {
          const available = parseFloat(asset.availBal);
          const frozen = parseFloat(asset.frozenBal);
          const equity = parseFloat(asset.eq);
          return `💰 ${asset.ccy}
   可用: ${available.toFixed(4)}
   凍結: ${frozen.toFixed(4)}
   估值: $${equity.toFixed(2)}`;
        })
        .join('\n\n');

      return `📊 帳戶資產總覽

💵 總資產估值: $${totalEquity.toFixed(2)}

${assetText}

⏰ 更新時間: ${new Date().toLocaleString('zh-TW')}`;
    } catch (error) {
      return `查詢餘額失敗: ${error.message}`;
    }
  },
});
