import config from '../../config/index.js';
import { createChatCompletion } from '../../services/openai.js';

const SYSTEM_PROMPT = `你是一位專業的產業研究分析師。針對給定的股票或公司，請簡潔分析：
1. 所屬產業與市場規模
2. 產業成長趨勢與景氣循環位置
3. 競爭格局與公司核心競爭優勢
4. 相關政策法規環境
以繁體中文條列回答，控制在250字內。`;

const run = async (query) => {
  if (config.APP_ENV !== 'production') {
    return `【產業研究】${query} 屬於半導體產業，市場規模持續擴大，受惠AI需求爆發，競爭優勢明顯。`;
  }
  const { data } = await createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `請分析：${query}` },
    ],
    maxTokens: 400,
    temperature: 0.3,
  });
  return data.choices[0].message.content.trim();
};

export default run;
