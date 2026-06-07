import { createChatCompletion, ROLE_SYSTEM, ROLE_HUMAN } from './openai.js';
import { getMarketAnalysis, formatTickerData } from './okx.js';

const TRADING_SYSTEM_PROMPT = `你是一位專業的加密貨幣交易分析師。你的任務是分析市場數據並提供交易建議。

分析規則：
1. 基於技術指標（SMA、EMA、RSI、MACD、ATR）進行分析
2. 考慮市場趨勢和動能
3. 評估風險回報比
4. 提供明確的交易建議（買入/賣出/觀望）
5. 設定合理的止損和止盈價位

回覆格式：
- 市場概況：簡述當前價格和趨勢
- 技術分析：解讀各項指標
- 交易建議：明確的操作建議
- 風險提示：相關風險警告

請用繁體中文回覆，保持專業但易懂的語氣。`;

const formatMarketDataForAI = (analysis) => {
  const { ticker, indicators } = analysis;

  return `
## 市場數據 - ${ticker.symbol}

### 即時行情
- 現價: $${ticker.lastPrice.toFixed(4)}
- 24h 最高: $${ticker.high24h.toFixed(4)}
- 24h 最低: $${ticker.low24h.toFixed(4)}
- 24h 漲跌: ${ticker.priceChangePercent24h}%
- 24h 成交量: ${ticker.volume24h.toFixed(2)}

### 技術指標
- SMA(7): ${indicators.sma7?.toFixed(4) || 'N/A'}
- SMA(25): ${indicators.sma25?.toFixed(4) || 'N/A'}
- SMA(99): ${indicators.sma99?.toFixed(4) || 'N/A'}
- EMA(12): ${indicators.ema12?.toFixed(4) || 'N/A'}
- EMA(26): ${indicators.ema26?.toFixed(4) || 'N/A'}
- RSI(14): ${indicators.rsi14?.toFixed(2) || 'N/A'}
- MACD: ${indicators.macd?.macdLine?.toFixed(4) || 'N/A'}
- ATR(14): ${indicators.atr14?.toFixed(4) || 'N/A'}

### 趨勢判斷
- 短期趨勢: ${indicators.sma7 > indicators.sma25 ? '上漲' : '下跌'}
- 中期趨勢: ${indicators.sma25 > indicators.sma99 ? '上漲' : '下跌'}
- RSI 狀態: ${indicators.rsi14 > 70 ? '超買' : indicators.rsi14 < 30 ? '超賣' : '中性'}
`;
};

const analyzeMarket = async (instId, timeframe = '1H') => {
  const analysis = await getMarketAnalysis(instId, timeframe);
  const marketDataText = formatMarketDataForAI(analysis);

  const messages = [
    { role: ROLE_SYSTEM, content: TRADING_SYSTEM_PROMPT },
    {
      role: ROLE_HUMAN,
      content: `請分析以下市場數據並提供交易建議：\n${marketDataText}`,
    },
  ];

  const response = await createChatCompletion({
    messages,
    temperature: 0.7,
    maxTokens: 1000,
  });

  return {
    symbol: instId,
    timeframe,
    analysis: response.data.choices[0].message.content,
    rawData: analysis,
    timestamp: Date.now(),
  };
};

const analyzePortfolio = async (positions, tickers) => {
  const portfolioData = positions.map((pos) => {
    const ticker = tickers.find((t) => t.instId === pos.instId);
    return {
      symbol: pos.instId,
      quantity: parseFloat(pos.pos),
      avgCost: parseFloat(pos.avgPx),
      currentPrice: ticker ? parseFloat(ticker.last) : 0,
      unrealizedPnL: parseFloat(pos.upl) || 0,
      unrealizedPnLPercent: parseFloat(pos.uplRatio) * 100 || 0,
    };
  });

  const totalValue = portfolioData.reduce(
    (sum, p) => sum + p.quantity * p.currentPrice,
    0,
  );

  const portfolioText = portfolioData
    .map(
      (p) => `- ${p.symbol}: ${p.quantity} 單位, 成本 $${p.avgCost.toFixed(4)}, 現價 $${p.currentPrice.toFixed(4)}, 損益 ${p.unrealizedPnLPercent.toFixed(2)}%`,
    )
    .join('\n');

  const messages = [
    { role: ROLE_SYSTEM, content: TRADING_SYSTEM_PROMPT },
    {
      role: ROLE_HUMAN,
      content: `請分析以下投資組合並提供調整建議：

## 投資組合總覽
總價值: $${totalValue.toFixed(2)}

## 持倉明細
${portfolioText}

請評估：
1. 投資組合的風險分散程度
2. 各持倉的表現
3. 建議的調整方向`,
    },
  ];

  const response = await createChatCompletion({
    messages,
    temperature: 0.7,
    maxTokens: 1000,
  });

  return {
    portfolio: portfolioData,
    totalValue,
    analysis: response.data.choices[0].message.content,
    timestamp: Date.now(),
  };
};

const generateTradingSignal = (indicators) => {
  const signals = [];
  let bullishScore = 0;
  let bearishScore = 0;

  if (indicators.sma7 > indicators.sma25) {
    bullishScore += 1;
    signals.push({ indicator: 'SMA', signal: 'bullish', reason: 'SMA7 > SMA25' });
  } else {
    bearishScore += 1;
    signals.push({ indicator: 'SMA', signal: 'bearish', reason: 'SMA7 < SMA25' });
  }

  if (indicators.ema12 > indicators.ema26) {
    bullishScore += 1;
    signals.push({ indicator: 'EMA', signal: 'bullish', reason: 'EMA12 > EMA26' });
  } else {
    bearishScore += 1;
    signals.push({ indicator: 'EMA', signal: 'bearish', reason: 'EMA12 < EMA26' });
  }

  if (indicators.rsi14 !== null) {
    if (indicators.rsi14 < 30) {
      bullishScore += 2;
      signals.push({ indicator: 'RSI', signal: 'bullish', reason: '超賣區域' });
    } else if (indicators.rsi14 > 70) {
      bearishScore += 2;
      signals.push({ indicator: 'RSI', signal: 'bearish', reason: '超買區域' });
    } else {
      signals.push({ indicator: 'RSI', signal: 'neutral', reason: '中性區域' });
    }
  }

  if (indicators.macd?.macdLine > 0) {
    bullishScore += 1;
    signals.push({ indicator: 'MACD', signal: 'bullish', reason: 'MACD > 0' });
  } else if (indicators.macd?.macdLine < 0) {
    bearishScore += 1;
    signals.push({ indicator: 'MACD', signal: 'bearish', reason: 'MACD < 0' });
  }

  let overallSignal = 'HOLD';
  if (bullishScore >= 3) overallSignal = 'BUY';
  else if (bearishScore >= 3) overallSignal = 'SELL';

  return {
    signals,
    bullishScore,
    bearishScore,
    overallSignal,
    confidence: Math.abs(bullishScore - bearishScore) / (bullishScore + bearishScore) * 100,
  };
};

const getQuickAnalysis = async (instId) => {
  const analysis = await getMarketAnalysis(instId, '1H');
  const signal = generateTradingSignal(analysis.indicators);

  const ticker = analysis.ticker;
  const summary = `
📊 ${ticker.symbol} 快速分析

💰 現價: $${ticker.lastPrice.toFixed(4)} (${ticker.priceChangePercent24h > 0 ? '+' : ''}${ticker.priceChangePercent24h}%)
📈 24H 高/低: $${ticker.high24h.toFixed(4)} / $${ticker.low24h.toFixed(4)}

📉 技術信號: ${signal.overallSignal === 'BUY' ? '🟢 買入' : signal.overallSignal === 'SELL' ? '🔴 賣出' : '🟡 觀望'}
📊 信心度: ${signal.confidence.toFixed(0)}%
📐 RSI(14): ${analysis.indicators.rsi14?.toFixed(2) || 'N/A'}

⚠️ 此為自動分析，請自行評估風險`;

  return {
    summary,
    signal,
    ticker,
    indicators: analysis.indicators,
  };
};

export {
  analyzeMarket,
  analyzePortfolio,
  generateTradingSignal,
  getQuickAnalysis,
  formatMarketDataForAI,
};
