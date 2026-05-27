import config from '../../config/index.js';
import { createChatCompletion } from '../../services/openai.js';

const SYSTEM_PROMPT = `你是一位專業的量化分析師。針對給定的股票，請評估：
1. 估值指標（本益比、股價淨值比、EV/EBITDA 與歷史及同業比較）
2. 獲利品質（EPS成長率、ROE、毛利率與營業利益率趨勢）
3. 財務健康度（負債比率、現金流量、股利政策）
4. 歷史報酬與波動度特徵
以繁體中文條列回答，控制在250字內。`;

const run = async (query) => {
  if (config.APP_ENV !== 'production') {
    return `【量化回測】${query} 本益比合理，ROE維持高水準，近五年年化報酬約15%，波動度中等。`;
  }
  const { data } = await createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `請分析：${query}` },
    ],
    maxTokens: 400,
    temperature: 0.2,
  });
  return data.choices[0].message.content.trim();
};

export default run;
