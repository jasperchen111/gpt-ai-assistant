import config from '../../config/index.js';
import { createChatCompletion } from '../../services/openai.js';

const SYSTEM_PROMPT = `你是一位專業的風控分析師。針對給定的股票，請評估：
1. 主要風險因子（市場風險、產業風險、公司特定風險）
2. 地緣政治與供應鏈風險
3. 流動性風險與市值規模評估
4. 建議持倉比重與停損參考
5. 整體風險等級（低/中/高）
以繁體中文條列回答，控制在250字內。`;

const run = async (query) => {
  if (config.APP_ENV !== 'production') {
    return `【風控評估】${query} 整體風險中等，主要風險來自地緣政治，建議持倉不超過總資產10%，設停損8%。`;
  }
  const { data } = await createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `請評估：${query}` },
    ],
    maxTokens: 400,
    temperature: 0.2,
  });
  return data.choices[0].message.content.trim();
};

export default run;
