import config from '../../config/index.js';
import { createChatCompletion } from '../../services/openai.js';

const SYSTEM_PROMPT = `你是一位專業的股票技術分析師。針對給定的股票，請分析：
1. 目前趨勢方向（多頭/空頭/盤整）
2. 關鍵支撐與壓力位
3. 主要技術指標訊號（均線、RSI、MACD）
4. 成交量與籌碼動向
5. 近期可能的技術型態
若有提供即時行情資料（含現價），請以該價格為基礎推算支撐壓力位。以繁體中文條列回答，控制在250字內。`;

const run = async (query, realtimeContext = '') => {
  if (config.APP_ENV !== 'production') {
    return `【技術分析】${query} 目前趨勢多頭，關鍵支撐在季線，RSI處於健康區間，量能溫和放大。`;
  }
  const userContent = realtimeContext
    ? `請分析：${query}\n\n以下為即時參考資料：\n${realtimeContext}`
    : `請分析：${query}`;
  const { data } = await createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    maxTokens: 400,
    temperature: 0.3,
  });
  return data.choices[0].message.content.trim();
};

export default run;
