import config from '../../config/index.js';
import { createChatCompletion } from '../../services/openai.js';

const SYSTEM_PROMPT = `你是一位頂尖的投資決策總監，整合以下五位專家的分析報告後，做出最終投資建議。

請輸出格式如下：
📊 投資標的：[名稱]
⭐ 綜合評級：[強力買進/買進/中立/賣出/強力賣出]
🎯 目標價位：[區間或描述]
💡 核心論點：[2-3個主要投資理由]
⚠️ 主要風險：[1-2個最重要風險]
📌 操作建議：[具體進出場策略]

以繁體中文回答，語言精煉、重點突出，控制在300字內。`;

const run = async (query, { industryResearch, technicalAnalysis, newsSummary, quantBacktest, riskControl }) => {
  if (config.APP_ENV !== 'production') {
    return `📊 投資標的：${query}
⭐ 綜合評級：買進
🎯 目標價位：合理估值區間
💡 核心論點：
• 產業趨勢正面，AI需求強勁
• 基本面穩健，獲利能力突出
• 技術面突破整理區
⚠️ 主要風險：地緣政治、景氣循環
📌 操作建議：可分批建立部位，設8%停損`;
  }

  const combinedAnalysis = `
【產業研究員報告】
${industryResearch}

【技術分析師報告】
${technicalAnalysis}

【新聞分析師報告】
${newsSummary}

【量化分析師報告】
${quantBacktest}

【風控分析師報告】
${riskControl}
`.trim();

  const { data } = await createChatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `投資標的：${query}\n\n五位分析師報告如下：\n${combinedAnalysis}\n\n請整合以上報告，給出最終投資建議。` },
    ],
    maxTokens: 600,
    temperature: 0.4,
  });
  return data.choices[0].message.content.trim();
};

export default run;
