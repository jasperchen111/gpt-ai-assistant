import forex from './forex.js';

const FOREX_WATCH_LIST = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];

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

export class ForexAIAdvisor {
  constructor() {
    this.lastAnalysis = new Map();
  }

  async getMarketData(pair) {
    try {
      const candlesResponse = await forex.getForexCandles(pair, '1h', 50);
      if (candlesResponse.code !== '0' || !candlesResponse.data.length) {
        return null;
      }

      const candles = candlesResponse.data;
      const indicators = forex.calculateTechnicalIndicators(candles);
      const closes = candles.map(c => parseFloat(c[4])).reverse();

      const shortSma = forex.calculateSMA(closes, 10);
      const longSma = forex.calculateSMA(closes, 30);
      const rsi = indicators.rsi14;
      const bb = indicators.bollingerBands;
      const price = indicators.currentPrice;

      const priceChange24h = closes.length >= 25
        ? ((closes[closes.length - 1] - closes[closes.length - 25]) / closes[closes.length - 25]) * 100
        : 0;

      return {
        pair,
        name: forex.FOREX_PAIRS[pair]?.name || pair,
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
      console.error(`取得 ${pair} 市場數據失敗:`, error.message);
      return null;
    }
  }

  // 技術分析師
  analyzeTechnical(marketData) {
    const { rsi14, bollingerBands, currentPrice, pair } = marketData;
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
        reason = `RSI ${rsi14.toFixed(1)} 偏低，可考慮做多`;
      } else if (rsi14 > 60) {
        opinion = 'SELL';
        confidence = 60;
        reason = `RSI ${rsi14.toFixed(1)} 偏高，注意風險`;
      } else {
        reason = `RSI ${rsi14.toFixed(1)} 中性區間`;
      }
    }

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

  // 趨勢判斷師
  analyzeTrend(marketData) {
    const { shortSma, longSma, priceChange24h } = marketData;
    let opinion = 'HOLD';
    let confidence = 50;
    let reason = '趨勢不明';

    if (shortSma && longSma) {
      const smaDiff = ((shortSma - longSma) / longSma) * 100;

      if (smaDiff > 0.5) {
        opinion = 'BUY';
        confidence = 70 + Math.min(smaDiff * 10, 20);
        reason = `短均線高於長均線 ${smaDiff.toFixed(2)}%，多頭趨勢`;
      } else if (smaDiff < -0.5) {
        opinion = 'SELL';
        confidence = 70 + Math.min(Math.abs(smaDiff) * 10, 20);
        reason = `短均線低於長均線 ${Math.abs(smaDiff).toFixed(2)}%，空頭趨勢`;
      } else {
        reason = '均線糾結，盤整狀態';
      }
    }

    if (priceChange24h) {
      if (priceChange24h > 1) {
        if (opinion !== 'SELL') {
          opinion = 'BUY';
          confidence = Math.max(confidence, 65);
        }
        reason += `，24h漲 ${priceChange24h.toFixed(2)}%`;
      } else if (priceChange24h < -1) {
        if (opinion !== 'BUY') {
          opinion = 'SELL';
          confidence = Math.max(confidence, 65);
        }
        reason += `，24h跌 ${Math.abs(priceChange24h).toFixed(2)}%`;
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

  // 風險管理師
  analyzeRisk(marketData) {
    const { rsi14, priceChange24h, bollingerBands, pair } = marketData;
    let opinion = 'HOLD';
    let confidence = 60;
    let reason = '風險中等';
    let positionSize = '中';

    if (bollingerBands) {
      const bandWidth = ((bollingerBands.upper - bollingerBands.lower) / bollingerBands.middle) * 100;
      if (bandWidth > 3) {
        positionSize = '小';
        reason = `波動率偏高 (${bandWidth.toFixed(2)}%)，建議輕倉`;
      } else if (bandWidth < 1) {
        positionSize = '大';
        reason = `波動率低，可適度加倉`;
      }
    }

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

    if (Math.abs(priceChange24h) > 3) {
      opinion = 'HOLD';
      confidence = 80;
      reason = `24h波動 ${Math.abs(priceChange24h).toFixed(2)}%，建議觀望`;
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

  async analyzeWithAllAdvisors(pair) {
    const marketData = await this.getMarketData(pair);
    if (!marketData) {
      return { error: `無法取得 ${pair} 市場數據` };
    }

    console.log(`🌍 外匯 AI 開始分析 ${pair}...`);

    const opinions = [
      this.analyzeTechnical(marketData),
      this.analyzeTrend(marketData),
      this.analyzeRisk(marketData),
    ];

    const votes = { BUY: 0, SELL: 0, HOLD: 0 };
    const totalConfidence = { BUY: 0, SELL: 0, HOLD: 0 };

    opinions.forEach(op => {
      if (op && op.opinion) {
        votes[op.opinion]++;
        totalConfidence[op.opinion] += op.confidence || 0;
      }
    });

    let finalDecision = 'HOLD';
    let maxVotes = 0;

    for (const [action, count] of Object.entries(votes)) {
      if (count > maxVotes || (count === maxVotes && totalConfidence[action] > totalConfidence[finalDecision])) {
        maxVotes = count;
        finalDecision = action;
      }
    }

    const avgConfidence = maxVotes > 0
      ? Math.round(totalConfidence[finalDecision] / maxVotes)
      : 0;

    const riskOpinion = opinions.find(o => o?.advisor === '風險管理師');
    const positionSize = riskOpinion?.positionSize || '中';

    const result = {
      pair,
      name: marketData.name,
      marketData,
      opinions,
      votes,
      finalDecision,
      confidence: avgConfidence,
      positionSize,
      timestamp: new Date(),
    };

    this.lastAnalysis.set(pair, result);
    return result;
  }

  formatDiscordMessage(analysis) {
    if (analysis.error) {
      return `❌ ${analysis.error}`;
    }

    const priceDecimals = analysis.pair === 'USDJPY' ? 3 : (analysis.pair === 'XAUUSD' ? 2 : 5);

    let message = `**🌍 外匯 AI 分析 - ${analysis.name} (${analysis.pair})**\n`;
    message += `💰 當前價格：${analysis.marketData.currentPrice?.toFixed(priceDecimals)}\n`;
    message += `📊 RSI: ${analysis.marketData.rsi14?.toFixed(1) || 'N/A'} | 趨勢: ${analysis.marketData.trend}\n\n`;

    message += `**📋 專家意見：**\n`;
    for (const op of analysis.opinions) {
      const actionEmoji = op.opinion === 'BUY' ? '🟢' : op.opinion === 'SELL' ? '🔴' : '⚪';
      message += `${op.emoji} **${op.advisor}**：${actionEmoji} ${op.opinion} (${op.confidence}%)\n`;
      message += `   └ ${op.reason}\n`;
    }

    message += `\n**🗳️ 投票結果：**\n`;
    message += `🟢 做多：${analysis.votes.BUY} 票 | ⚪ 觀望：${analysis.votes.HOLD} 票 | 🔴 做空：${analysis.votes.SELL} 票\n`;

    const decisionEmoji = analysis.finalDecision === 'BUY' ? '🟢' : analysis.finalDecision === 'SELL' ? '🔴' : '⚪';
    const decisionText = analysis.finalDecision === 'BUY' ? '做多' : analysis.finalDecision === 'SELL' ? '做空' : '觀望';
    message += `\n**📊 最終決策：${decisionEmoji} ${decisionText}**\n`;
    message += `信心度：${analysis.confidence}% | 建議倉位：${analysis.positionSize}\n`;

    return message;
  }

  async analyzeAllForex() {
    console.log(`🌍 外匯 AI 開始分析 ${FOREX_WATCH_LIST.length} 個貨幣對...`);

    const results = [];

    for (const pair of FOREX_WATCH_LIST) {
      try {
        const analysis = await this.analyzeWithAllAdvisors(pair);
        if (!analysis.error) {
          results.push(analysis);
        }
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error(`${pair} 分析失敗:`, error.message);
      }
    }

    results.sort((a, b) => {
      const actionScore = { BUY: 3, SELL: 2, HOLD: 1 };
      const scoreA = actionScore[a.finalDecision] * 100 + a.confidence;
      const scoreB = actionScore[b.finalDecision] * 100 + b.confidence;
      return scoreB - scoreA;
    });

    return results;
  }

  formatMultiForexMessage(results) {
    if (results.length === 0) {
      return '❌ 無法取得任何外匯數據';
    }

    let message = `**🌍 外匯 AI 分析 - ${results.length} 個貨幣對**\n\n`;

    message += `**📊 分析總覽：**\n`;
    for (const r of results) {
      const emoji = r.finalDecision === 'BUY' ? '🟢' : r.finalDecision === 'SELL' ? '🔴' : '⚪';
      const decisionText = r.finalDecision === 'BUY' ? '做多' : r.finalDecision === 'SELL' ? '做空' : '觀望';
      const votes = `(${r.votes.BUY}/${r.votes.HOLD}/${r.votes.SELL})`;
      const priceDecimals = r.pair === 'USDJPY' ? 3 : (r.pair === 'XAUUSD' ? 2 : 5);
      message += `${emoji} **${r.name}** | ${decisionText} ${r.confidence}% | ${r.marketData.currentPrice?.toFixed(priceDecimals)} | RSI:${r.marketData.rsi14?.toFixed(0) || 'N/A'} | ${votes}\n`;
    }

    const buyOpportunities = results.filter(r => r.finalDecision === 'BUY');
    const sellOpportunities = results.filter(r => r.finalDecision === 'SELL');

    if (buyOpportunities.length > 0) {
      message += `\n**🎯 最佳做多機會：**\n`;
      const best = buyOpportunities[0];
      message += `**${best.name}** - 信心度 ${best.confidence}%\n`;
      for (const op of best.opinions) {
        message += `  ${op.emoji} ${op.advisor}: ${op.reason}\n`;
      }
    }

    if (sellOpportunities.length > 0) {
      message += `\n**📉 建議做空：**\n`;
      for (const s of sellOpportunities) {
        message += `**${s.name}** - 信心度 ${s.confidence}%\n`;
      }
    }

    if (buyOpportunities.length === 0 && sellOpportunities.length === 0) {
      message += `\n**💤 目前無明顯機會，建議觀望**\n`;
    }

    return message;
  }
}

export const forexAIAdvisor = new ForexAIAdvisor();

export default {
  FOREX_WATCH_LIST,
  ForexAIAdvisor,
  forexAIAdvisor,
};
