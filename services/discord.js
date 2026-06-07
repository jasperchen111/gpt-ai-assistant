import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import config from '../config/index.js';
import backtest, { STRATEGY_SMA_CROSS, STRATEGY_RSI, STRATEGY_BOLLINGER, STRATEGY_GRID } from './backtest.js';
import autoTrading from './auto-trading.js';
import exchange from './coingecko.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const userStrategies = new Map();

const parseArgs = (content) => {
  const args = content.split(/\s+/).filter(Boolean);
  const result = {
    instId: 'BTC-USDT',
    strategy: STRATEGY_SMA_CROSS,
    days: 30,
    timeframe: '1H',
    capital: 10000,
    mode: 'paper',
    interval: 60000,
  };

  for (const arg of args) {
    const upper = arg.toUpperCase();

    if (upper.includes('-USDT')) {
      result.instId = upper;
    } else if (upper.includes('-USD')) {
      result.instId = upper.replace('-USD', '-USDT');
    } else if (['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'MATIC'].includes(upper)) {
      result.instId = upper + '-USDT';
    } else if (['SMA', '均線', 'MA'].includes(upper)) {
      result.strategy = STRATEGY_SMA_CROSS;
    } else if (['RSI', '超買超賣'].includes(upper)) {
      result.strategy = STRATEGY_RSI;
    } else if (['BB', 'BOLLINGER', '布林'].includes(upper)) {
      result.strategy = STRATEGY_BOLLINGER;
    } else if (['GRID', '網格'].includes(upper)) {
      result.strategy = STRATEGY_GRID;
    } else if (upper.endsWith('D') || upper.endsWith('天')) {
      const num = parseInt(arg);
      if (!isNaN(num) && num > 0 && num <= 365) result.days = num;
    } else if (['1M', '5M', '15M', '30M', '1H', '4H', '1D'].includes(upper)) {
      result.timeframe = upper;
    } else if (['LIVE', '實盤'].includes(upper)) {
      result.mode = 'live';
    } else if (!isNaN(parseInt(arg)) && parseInt(arg) > 100) {
      result.capital = parseInt(arg);
    }
  }

  return result;
};

const getStrategyName = (strategy) => {
  const names = {
    [STRATEGY_SMA_CROSS]: 'SMA 均線交叉',
    [STRATEGY_RSI]: 'RSI 超買超賣',
    [STRATEGY_BOLLINGER]: '布林通道',
    [STRATEGY_GRID]: '網格交易',
  };
  return names[strategy] || strategy;
};

const handlePrice = async (message, content) => {
  const args = parseArgs(content);

  try {
    const result = await exchange.getTicker(args.instId);
    const data = result.data[0];

    const changePercent = (parseFloat(data.changePerc) * 100).toFixed(2);
    const changeEmoji = changePercent >= 0 ? '🟢' : '🔴';

    const embed = new EmbedBuilder()
      .setTitle(`💰 ${args.instId} 即時報價`)
      .setColor(changePercent >= 0 ? 0x00ff00 : 0xff0000)
      .addFields(
        { name: '價格', value: `$${parseFloat(data.last).toLocaleString()}`, inline: true },
        { name: '24H 漲跌', value: `${changeEmoji} ${changePercent}%`, inline: true },
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    await message.reply(`❌ 錯誤: ${error.message}`);
  }
};

const handleBacktest = async (message, content) => {
  const args = parseArgs(content);

  const loadingMsg = await message.reply('📊 正在執行回測，請稍候...');

  try {
    const result = await backtest.runBacktest({
      instId: args.instId,
      bar: args.timeframe,
      days: args.days,
      strategy: args.strategy,
      initialCapital: args.capital,
    });

    const { summary, performance, statistics } = result;
    const profitColor = performance.totalPnL >= 0 ? 0x00ff00 : 0xff0000;

    const embed = new EmbedBuilder()
      .setTitle('📊 回測報告')
      .setColor(profitColor)
      .addFields(
        { name: '📈 策略設定', value: `交易對: ${summary.instId}\n策略: ${getStrategyName(summary.strategy)}\n時間: ${summary.startDate} ~ ${summary.endDate}`, inline: false },
        { name: '💰 初始資金', value: `$${performance.initialCapital.toLocaleString()}`, inline: true },
        { name: '💵 最終資金', value: `$${performance.finalCapital.toLocaleString()}`, inline: true },
        { name: '📈 報酬率', value: `${performance.returnPercent >= 0 ? '+' : ''}${performance.returnPercent}%`, inline: true },
        { name: '📉 最大回撤', value: `-${performance.maxDrawdown}%`, inline: true },
        { name: '🎯 勝率', value: `${statistics.winRate}%`, inline: true },
        { name: '📊 交易次數', value: `${statistics.completedTrades}`, inline: true },
        { name: '💹 盈虧比', value: `${statistics.profitFactor}`, inline: true },
        { name: '📅 年化報酬', value: `${performance.annualizedReturn >= 0 ? '+' : ''}${performance.annualizedReturn}%`, inline: true },
      )
      .setTimestamp();

    await loadingMsg.edit({ content: '', embeds: [embed] });
  } catch (error) {
    await loadingMsg.edit(`❌ 回測錯誤: ${error.message}`);
  }
};

const handleCompare = async (message, content) => {
  const args = parseArgs(content);

  const loadingMsg = await message.reply('📊 正在比較策略，請稍候...');

  try {
    const results = await backtest.compareStrategies(
      args.instId,
      args.timeframe,
      args.days,
      args.capital
    );

    const validResults = results.filter((r) => !r.error);
    const sortedResults = validResults.sort((a, b) => b.returnPercent - a.returnPercent);

    let description = '';
    sortedResults.forEach((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '📌';
      description += `${medal} **${r.strategy}**\n`;
      description += `報酬: ${r.returnPercent >= 0 ? '+' : ''}${r.returnPercent}% | 勝率: ${r.winRate}% | 回撤: -${r.maxDrawdown}%\n\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`📊 策略比較 - ${args.instId}`)
      .setDescription(description)
      .setColor(0x5865f2)
      .setFooter({ text: `回測天數: ${args.days}天` })
      .setTimestamp();

    await loadingMsg.edit({ content: '', embeds: [embed] });
  } catch (error) {
    await loadingMsg.edit(`❌ 比較錯誤: ${error.message}`);
  }
};

const handleAutoStart = async (message, content) => {
  const userId = message.author.id;
  const args = parseArgs(content);

  if (userStrategies.has(userId)) {
    await message.reply('⚠️ 你已有執行中的策略，請先使用 `!stop` 停止');
    return;
  }

  try {
    const result = await autoTrading.startAutoTrading({
      instId: args.instId,
      interval: args.interval,
      mode: args.mode,
      onSignal: (signal) => {
        const emoji = signal.signal === 'BUY' ? '🟢' : signal.signal === 'SELL' ? '🔴' : '⚪';
        message.channel.send(`${emoji} **${args.instId}** ${signal.signal} (${signal.confidence}%) - ${signal.reason}`);
      },
    });

    userStrategies.set(userId, result.strategyId);

    const embed = new EmbedBuilder()
      .setTitle('🚀 自動交易已啟動')
      .setColor(0x00ff00)
      .addFields(
        { name: '交易對', value: args.instId, inline: true },
        { name: '模式', value: args.mode === 'paper' ? '模擬交易' : '實盤交易', inline: true },
        { name: '分析間隔', value: `${args.interval / 1000} 秒`, inline: true },
      )
      .setFooter({ text: '使用 !stop 停止交易 | !status 查看狀態' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    await message.reply(`❌ 啟動錯誤: ${error.message}`);
  }
};

const handleAutoStop = async (message) => {
  const userId = message.author.id;
  const strategyId = userStrategies.get(userId);

  if (!strategyId) {
    await message.reply('⚠️ 你沒有執行中的策略');
    return;
  }

  const result = autoTrading.stopAutoTrading(strategyId);
  userStrategies.delete(userId);

  const embed = new EmbedBuilder()
    .setTitle('🛑 自動交易已停止')
    .setColor(0xff0000)
    .addFields(
      { name: '總交易次數', value: `${result.totalTrades}`, inline: true },
      { name: '總信號數', value: `${result.totalSignals}`, inline: true },
      { name: '運行時間', value: result.runTime, inline: true },
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
};

const handleStatus = async (message) => {
  const userId = message.author.id;
  const strategyId = userStrategies.get(userId);

  if (!strategyId) {
    await message.reply('📊 目前沒有執行中的策略\n\n使用 `!auto BTC-USDT` 啟動自動交易');
    return;
  }

  const status = autoTrading.getStrategyStatus(strategyId);

  const embed = new EmbedBuilder()
    .setTitle('🤖 自動交易狀態')
    .setColor(0x5865f2)
    .addFields(
      { name: '交易對', value: status.instId, inline: true },
      { name: '模式', value: status.mode === 'paper' ? '模擬' : '實盤', inline: true },
      { name: '運行時間', value: status.stats.runTime, inline: true },
      { name: '信號數', value: `${status.stats.totalSignals}`, inline: true },
      { name: '交易數', value: `${status.stats.totalTrades}`, inline: true },
    )
    .setTimestamp();

  if (status.position) {
    embed.addFields({
      name: '📍 持倉中',
      value: `進場價: $${status.position.entryPrice}\n數量: ${status.position.size}`,
      inline: false,
    });
  }

  await message.reply({ embeds: [embed] });
};

const handleHelp = async (message) => {
  const embed = new EmbedBuilder()
    .setTitle('🤖 AI 交易助手指令')
    .setColor(0x5865f2)
    .setDescription('以下是可用的指令：')
    .addFields(
      { name: '💰 查詢報價', value: '`!price BTC-USDT`\n`!price ETH-USDT`', inline: true },
      { name: '📊 策略回測', value: '`!backtest BTC-USDT SMA 30天`\n`!backtest ETH-USDT RSI 60天`', inline: true },
      { name: '📈 策略比較', value: '`!compare BTC-USDT 30天`', inline: true },
      { name: '🚀 自動交易', value: '`!auto BTC-USDT`\n`!auto ETH-USDT 5分`', inline: true },
      { name: '🛑 停止交易', value: '`!stop`', inline: true },
      { name: '📋 查看狀態', value: '`!status`', inline: true },
    )
    .addFields({
      name: '📝 策略選項',
      value: '`SMA` - 均線交叉\n`RSI` - 超買超賣\n`BB` - 布林通道\n`GRID` - 網格交易',
      inline: false,
    })
    .addFields({
      name: '💱 支援幣種',
      value: 'BTC, ETH, SOL, BNB, XRP, ADA, DOGE, AVAX, DOT, MATIC, LINK, UNI, ATOM, LTC',
      inline: false,
    })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
};

client.on('ready', () => {
  console.log(`✅ Discord Bot 已啟動: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const content = message.content.slice(1).trim();
  const command = content.split(/\s+/)[0].toLowerCase();

  try {
    switch (command) {
      case 'price':
      case '價格':
      case 'p':
        await handlePrice(message, content);
        break;

      case 'backtest':
      case '回測':
      case 'bt':
        await handleBacktest(message, content);
        break;

      case 'compare':
      case '比較':
        await handleCompare(message, content);
        break;

      case 'auto':
      case '自動':
      case 'start':
        await handleAutoStart(message, content);
        break;

      case 'stop':
      case '停止':
        await handleAutoStop(message);
        break;

      case 'status':
      case '狀態':
        await handleStatus(message);
        break;

      case 'help':
      case '幫助':
      case 'h':
        await handleHelp(message);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('指令處理錯誤:', error);
    await message.reply(`❌ 發生錯誤: ${error.message}`);
  }
});

export const startDiscordBot = () => {
  const token = config.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('❌ 缺少 DISCORD_BOT_TOKEN 環境變數');
    return;
  }
  client.login(token);
};

export default {
  client,
  startDiscordBot,
};
