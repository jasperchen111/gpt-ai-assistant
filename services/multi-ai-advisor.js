import okx from './okx.js';

const AI_ADVISORS = {
  technicalAnalyst: {
    name: '技術分析師',
    emoji: '📊',
  },
  trendAnalyst: {
    name: '趨勢判斷師',
    emoji: '📈',
  },
  riskManager: {
    name: '風險管理師',
    emoji: '🛡️',
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
      const rsi = indicators.rsi14;
      const bb = indicators.bollingerBands;
      const price = indicators.currentPrice;

      // 計算價格變化
      const priceChange24h = ((closes[closes.length - 1] - closes[closes.length - 25]) / closes[closes.length - 25]) * 100;

      return {
        instId,
        currentPrice: price,
        rsi14: rsi,
        sma20: indicators.sma20,
        sma50: indicators.sma50,
        shortSma,
        longSma,
        bollingerBands: bb,
        priceChange24h,
        trend: shortSma > longSma ? '上漲' : '下跌',
        closes,
      };
    } catch (error) {
      console.error('取得市場數據失敗:', error.message);
      return null;
    }
  }

  // 技術分析師 - 專注指標
  analyzeTechnical(marketData) {
    const { rsi14, bollingerBands, currentPrice } = marketData;
    let opinion = 'HOLD';
    let confidence = 50;
    let reason = '指標中性';

    if (rsi14) {
      if (rsi14 < 30) {
        opinion = 'BUY';
        confidence = 80 + (30 - rsi14);
        reason = `RSI ${rsi14.toFixed(1)} 超賣，反彈機率高`;
      } else if (rsi14 > 70) {
        opinion = 'SELL';
        confidence = 80 + (rsi14 - 70);
        reason = `RSI ${rsi14.toFixed(1)} 超買，回調風險`;
      } else if (rsi14 < 40) {
        opinion = 'BUY';
        confidence = 60;
        reason = `RSI ${rsi14.toFixed(1)} 偏低，可考慮買入`;
      } else if (rsi14 > 60) {
        opinion = 'SELL';
        confidence = 60;
        reason = `RSI ${rsi14.toFixed(1)} 偏高，注意風險`;
      } else {
        reason = `RSI ${rsi14.toFixed(1)} 中性區間`;
      }
    }

    // 布林通道加強判斷
    if (bollingerBands && currentPrice) {
      if (currentPrice < bollingerBands.lower) {
        if (opinion === 'BUY') confidence += 10;
        else { opinion = 'BUY'; confidence = 70; }
        reason += '，價格觸及下軌';
      } else if (currentPrice > bollingerBands.upper) {
        if (opinion === 'SELL') confidence += 10;
        else { opinion = 'SELL'; confidence = 70; }
        reason += '，價格觸及上軌';
      }
    }

    return {
      advisor: AI_ADVISORS.technicalAnalyst.name,
      emoji: AI_ADVISORS.technicalAnalyst.emoji,
      opinion,
      confidence: Math.min(confidence, 95),
      reason,
    };
  }

  // 趨勢判斷師 - 專注趨勢
  analyzeTrend(marketData) {
    const { shortSma, longSma, sma20, sma50, priceChange24h, closes } = marketData;
    let opinion = 'HOLD';
    let confidence = 50;
    let reason = '趨勢不明';

    // SMA 交叉判斷
    if (shortSma && longSma) {
      const smaDiff = ((shortSma - longSma) / longSma) * 100;

      if (smaDiff > 2) {
        opinion = 'BUY';
        confidence = 70 + Math.min(smaDiff * 5, 20);
        reason = `短均線高於長均線 ${smaDiff.toFixed(1)}%，多頭趨勢`;
      } else if (smaDiff < -2) {
        opinion = 'SELL';
        confidence = 70 + Math.min(Math.abs(smaDiff) * 5, 20);
        reason = `短均線低於長均線 ${Math.abs(smaDiff).toFixed(1)}%，空頭趨勢`;
      } else {
        reason = '均線糾結，盤整狀態';
      }
    }

    // 24小時漲跌幅
    if (priceChange24h) {
      if (priceChange24h > 5) {
        if (opinion !== 'SELL') {
          opinion = 'BUY';
          confidence = Math.max(confidence, 65);
        }
        reason += `，24h漲 ${priceChange24h.toFixed(1)}%`;
      } else if (priceChange24h < -5) {
        if (opinion !== 'BUY') {
          opinion = 'SELL';
          confidence = Math.max(confidence, 65);
        }
        reason += `，24h跌 ${Math.abs(priceChange24h).toFixed(1)}%`;
      }
    }

    return {
      advisor: AI_ADVISORS.trendAnalyst.name,
      emoji: AI_ADVISORS.trendAnalyst.emoji,
      opinion,
      confidence: Math.min(confidence, 95),
      reason,
    };
  }

  // 風險管理師 - 專注風險
  analyzeRisk(marketData) {
    const { rsi14, priceChange24h, bollingerBands, currentPrice } = marketData;
    let opinion = 'HOLD';
    let confidence = 60;
    let reason = '風險中等';
    let positionSize = '中';

    // 波動率評估
    let volatilityRisk = 'medium';
    if (bollingerBands) {
      const bandWidth = ((bollingerBands.upper - bollingerBands.lower) / bollingerBands.middle) * 100;
      if (bandWidth > 10) {
        volatilityRisk = 'high';
        positionSize = '小';
        reason = `波動率高 (${bandWidth.toFixed(1)}%)，建議輕倉`;
      } else if (bandWidth < 3) {
        volatilityRisk = 'low';
        positionSize = '大';
        reason = `波動率低，可適度加倉`;
      }
    }

    // 綜合風險判斷
    if (rsi14) {
      if (rsi14 < 25) {
        opinion = 'BUY';
        confidence = 75;
        reason = `極度超賣，風險報酬比佳`;
        positionSize = '中';
      } else if (rsi14 > 75) {
        opinion = 'SELL';
        confidence = 75;
        reason = `極度超買，風險偏高`;
        positionSize = '小';
      }
    }

    // 大幅波動警示
    if (Math.abs(priceChange24h) > 10) {
      opinion = 'HOLD';
      confidence = 80;
      reason = `24h波動 ${Math.abs(priceChange24h).toFixed(1)}%，建議觀望`;
      positionSize = '小';
    }

    return {
      advisor: AI_ADVISORS.riskManager.name,
      emoji: AI_ADVISORS.riskManager.emoji,
      opinion,
      confidence: Math.min(confidence, 95),
      reason,
      positionSize,
    };
  }

  async analyzeWithAllAdvisors(instId) {
    const marketData = await this.getMarketData(instId);
    if (!marketData) {
      return { error: '無法取得市場數據' };
    }

    console.log(`🤖 多 AI 開始分析 ${instId}...`);

    // 三個專家分析
    const opinions = [
      this.analyzeTechnical(marketData),
      this.analyzeTrend(marketData),
      this.analyzeRisk(marketData),
    ];

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
    message += `💰 當前價格：$${analysis.marketData.currentPrice?.toFixed(2)}\n`;
    message += `📊 RSI: ${analysis.marketData.rsi14?.toFixed(1) || 'N/A'} | 趨勢: ${analysis.marketData.trend}\n\n`;

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
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        console.error(`${instId} 分析失敗:`, error.message);
      }
    }

    // 按照推薦程度排序
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
      message += `${emoji} **${r.instId}** | ${r.finalDecision} ${r.confidence}% | $${r.marketData.currentPrice?.toFixed(2)} | RSI:${r.marketData.rsi14?.toFixed(0) || 'N/A'} | 投票${votes}\n`;
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
