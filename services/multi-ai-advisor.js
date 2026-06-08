import axios from 'axios';
import config from '../config/index.js';
import okx from './okx.js';

const groqClient = axios.create({
  baseURL: 'https://api.groq.com/openai/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.GROQ_API_KEY}`,
  },
});

const callGroq = async (systemPrompt, userPrompt) => {
  const response = await groqClient.post('/chat/completions', {
    model: 'llama-3.1-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });
  return response.data.choices[0].message.content;
};

const AI_ADVISORS = {
  technicalAnalyst: {
    name: '技術分析師',
    emoji: '📊',
    systemPrompt: `你是專業的技術分析師，專注於：
- RSI、MACD、布林通道等指標
- K線形態識別
- 支撐壓力位分析
只回覆 JSON 格式：{"opinion": "BUY/SELL/HOLD", "confidence": 0-100, "reason": "簡短原因"}`,
  },
  trendAnalyst: {
    name: '趨勢判斷師',
    emoji: '📈',
    systemPrompt: `你是市場趨勢專家，專注於：
- 判斷大週期趨勢（多頭/空頭/盤整）
- 均線排列分析
- 成交量趨勢
只回覆 JSON 格式：{"opinion": "BUY/SELL/HOLD", "confidence": 0-100, "reason": "簡短原因"}`,
  },
  riskManager: {
    name: '風險管理師',
    emoji: '🛡️',
    systemPrompt: `你是風險管理專家，專注於：
- 波動率評估
- 倉位建議
- 止損止盈位置
只回覆 JSON 格式：{"opinion": "BUY/SELL/HOLD", "confidence": 0-100, "reason": "簡短原因", "positionSize": "小/中/大"}`,
  },
};

export class MultiAIAdvisor {
  constructor() {
    this.lastAnalysis = new Map();
  }

  async getMarketData(instId) {
    try {
      const candlesResponse = await okx.getCandles(instId, '1H', 50);
      if (candlesResponse.code !== '0') return null;

      const candles = candlesResponse.data;
      const indicators = okx.calculateTechnicalIndicators(candles);
      const closes = candles.map(c => parseFloat(c[4])).reverse();

      const shortSma = okx.calculateSMA(closes, 10);
      const longSma = okx.calculateSMA(closes, 30);

      return {
        instId,
        currentPrice: indicators.currentPrice,
        rsi14: indicators.rsi14,
        sma20: indicators.sma20,
        sma50: indicators.sma50,
        shortSma,
        longSma,
        bollingerBands: indicators.bollingerBands,
        trend: shortSma > longSma ? '上漲趨勢' : '下跌趨勢',
        recentCandles: candles.slice(0, 10).map(c => ({
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
        })),
      };
    } catch (error) {
      console.error('取得市場數據失敗:', error.message);
      return null;
    }
  }

  async askAdvisor(advisorKey, marketData) {
    const advisor = AI_ADVISORS[advisorKey];
    if (!advisor) return null;

    const prompt = `分析以下 ${marketData.instId} 數據，給出交易建議：

當前價格：$${marketData.currentPrice?.toFixed(2)}
RSI(14)：${marketData.rsi14?.toFixed(1) || 'N/A'}
SMA(20)：$${marketData.sma20?.toFixed(2) || 'N/A'}
SMA(50)：$${marketData.sma50?.toFixed(2) || 'N/A'}
短期均線(10)：$${marketData.shortSma?.toFixed(2) || 'N/A'}
長期均線(30)：$${marketData.longSma?.toFixed(2) || 'N/A'}
布林通道：上軌 $${marketData.bollingerBands?.upper?.toFixed(2) || 'N/A'} / 下軌 $${marketData.bollingerBands?.lower?.toFixed(2) || 'N/A'}
趨勢：${marketData.trend}

請給出你的分析意見。`;

    try {
      const content = await callGroq(advisor.systemPrompt, prompt);
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          advisor: advisor.name,
          emoji: advisor.emoji,
          ...result,
        };
      }
    } catch (error) {
      console.error(`${advisor.name} 分析失敗:`, error.message);
    }

    return {
      advisor: advisor.name,
      emoji: advisor.emoji,
      opinion: 'HOLD',
      confidence: 0,
      reason: '分析失敗',
    };
  }

  async analyzeWithAllAdvisors(instId) {
    const marketData = await this.getMarketData(instId);
    if (!marketData) {
      return { error: '無法取得市場數據' };
    }

    console.log(`🤖 多 AI 開始分析 ${instId}...`);

    // 並行詢問所有顧問
    const advisorKeys = Object.keys(AI_ADVISORS);
    const opinions = await Promise.all(
      advisorKeys.map(key => this.askAdvisor(key, marketData))
    );

    // 統計投票
    const votes = { BUY: 0, SELL: 0, HOLD: 0 };
    const totalConfidence = { BUY: 0, SELL: 0, HOLD: 0 };

    opinions.forEach(op => {
      if (op && op.opinion) {
        votes[op.opinion]++;
        totalConfidence[op.opinion] += op.confidence || 0;
      }
    });

    // 決定最終建議
    let finalDecision = 'HOLD';
    let maxVotes = 0;

    for (const [action, count] of Object.entries(votes)) {
      if (count > maxVotes || (count === maxVotes && totalConfidence[action] > totalConfidence[finalDecision])) {
        maxVotes = count;
        finalDecision = action;
      }
    }

    // 計算平均信心度
    const avgConfidence = maxVotes > 0
      ? Math.round(totalConfidence[finalDecision] / maxVotes)
      : 0;

    // 找出風險管理師的倉位建議
    const riskOpinion = opinions.find(o => o?.advisor === '風險管理師');
    const positionSize = riskOpinion?.positionSize || '中';

    const result = {
      instId,
      marketData,
      opinions,
      votes,
      finalDecision,
      confidence: avgConfidence,
      positionSize,
      timestamp: new Date(),
    };

    this.lastAnalysis.set(instId, result);
    return result;
  }

  formatDiscordMessage(analysis) {
    if (analysis.error) {
      return `❌ ${analysis.error}`;
    }

    let message = `**🤖 多 AI 協作分析 - ${analysis.instId}**\n`;
    message += `💰 當前價格：$${analysis.marketData.currentPrice?.toFixed(2)}\n\n`;

    // 各顧問意見
    message += `**📋 專家意見：**\n`;
    for (const op of analysis.opinions) {
      const actionEmoji = op.opinion === 'BUY' ? '🟢' : op.opinion === 'SELL' ? '🔴' : '⚪';
      message += `${op.emoji} **${op.advisor}**：${actionEmoji} ${op.opinion} (${op.confidence}%)\n`;
      message += `   └ ${op.reason}\n`;
    }

    // 投票結果
    message += `\n**🗳️ 投票結果：**\n`;
    message += `🟢 買入：${analysis.votes.BUY} 票 | ⚪ 觀望：${analysis.votes.HOLD} 票 | 🔴 賣出：${analysis.votes.SELL} 票\n`;

    // 最終決策
    const decisionEmoji = analysis.finalDecision === 'BUY' ? '🟢' : analysis.finalDecision === 'SELL' ? '🔴' : '⚪';
    message += `\n**📊 最終決策：${decisionEmoji} ${analysis.finalDecision}**\n`;
    message += `信心度：${analysis.confidence}% | 建議倉位：${analysis.positionSize}\n`;

    return message;
  }

  async analyzeMultipleCoins(instIds) {
    console.log(`🤖 多 AI 開始分析 ${instIds.length} 個幣種...`);

    const results = [];

    for (const instId of instIds) {
      try {
        const analysis = await this.analyzeWithAllAdvisors(instId);
        if (!analysis.error) {
          results.push(analysis);
        }
        await new Promise(r => setTimeout(r, 500)); // 避免 API 限制
      } catch (error) {
        console.error(`${instId} 分析失敗:`, error.message);
      }
    }

    // 按照推薦程度排序：BUY > SELL > HOLD，再按信心度
    results.sort((a, b) => {
      const actionScore = { BUY: 3, SELL: 2, HOLD: 1 };
      const scoreA = actionScore[a.finalDecision] * 100 + a.confidence;
      const scoreB = actionScore[b.finalDecision] * 100 + b.confidence;
      return scoreB - scoreA;
    });

    return results;
  }

  formatMultiCoinMessage(results) {
    if (results.length === 0) {
      return '❌ 無法取得任何幣種的分析結果';
    }

    let message = `**🤖 多 AI 協作分析 - ${results.length} 個幣種**\n\n`;

    // 總覽表格
    message += `**📊 分析總覽：**\n`;
    for (const r of results) {
      const emoji = r.finalDecision === 'BUY' ? '🟢' : r.finalDecision === 'SELL' ? '🔴' : '⚪';
      const votes = `(${r.votes.BUY}/${r.votes.HOLD}/${r.votes.SELL})`;
      message += `${emoji} **${r.instId}** | ${r.finalDecision} ${r.confidence}% | 價格: $${r.marketData.currentPrice?.toFixed(2)} | 投票${votes}\n`;
    }

    // 最佳機會
    const buyOpportunities = results.filter(r => r.finalDecision === 'BUY');
    const sellOpportunities = results.filter(r => r.finalDecision === 'SELL');

    if (buyOpportunities.length > 0) {
      message += `\n**🎯 最佳買入機會：**\n`;
      const best = buyOpportunities[0];
      message += `**${best.instId}** - 信心度 ${best.confidence}%\n`;
      for (const op of best.opinions) {
        message += `  ${op.emoji} ${op.advisor}: ${op.reason}\n`;
      }
    }

    if (sellOpportunities.length > 0) {
      message += `\n**⚠️ 建議賣出：**\n`;
      for (const s of sellOpportunities) {
        message += `**${s.instId}** - 信心度 ${s.confidence}%\n`;
      }
    }

    if (buyOpportunities.length === 0 && sellOpportunities.length === 0) {
      message += `\n**💤 目前無明顯機會，建議觀望**\n`;
    }

    return message;
  }
}

export const multiAIAdvisor = new MultiAIAdvisor();

export default {
  MultiAIAdvisor,
  multiAIAdvisor,
  AI_ADVISORS,
};
