import config from '../../config/index.js';
import { createChatCompletion } from '../../services/openai.js';

const SYSTEM_PROMPT = `你是一位專業的財經新聞分析師。針對給定的股票或公司，請整理：
1. 近期重大新聞與事件（法說會、財報、併購、人事異動）
2. 市場情緒與分析師評級動向
3. 總體經濟對該股的影響（升降息、匯率、供應鏈）
4. 潛在催化劑或利空因素
以繁體中文條列回答，控制在250字內。知識截止日若有限制，請說明並給出一般性分析框架。`;

const run = async (query) => {
  if (config.APP_ENV !== 'production') {
    return `【新聞整理】${query} 近期法說會釋出正面展望，分析師多數維持買入評級，外資持續買超。`;
  }
  const { data } = await createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `請整理：${query}` },
    ],
    maxTokens: 400,
    temperature: 0.4,
  });
  return data.choices[0].message.content.trim();
};

export default run;
