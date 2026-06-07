import backtest, {
  STRATEGY_SMA_CROSS,
  STRATEGY_RSI,
  STRATEGY_BOLLINGER,
  STRATEGY_GRID,
} from '../../services/backtest.js';
import { COMMAND_TRADING_BACKTEST, COMMAND_TRADING_COMPARE } from '../commands/index.js';
import Context from '../context.js';

const parseBacktestArgs = (text) => {
  const args = text.split(/\s+/).filter(Boolean);
  const result = {
    instId: 'BTC-USDT',
    strategy: STRATEGY_SMA_CROSS,
    days: 30,
    timeframe: '1H',
    capital: 10000,
  };

  for (const arg of args) {
    const upper = arg.toUpperCase();

    if (upper.includes('-USDT') || upper.includes('-USDC')) {
      result.instId = upper;
    } else if (['SMA', '均線', 'MA'].includes(upper)) {
      result.strategy = STRATEGY_SMA_CROSS;
    } else if (['RSI', '超買超賣'].includes(upper)) {
      result.strategy = STRATEGY_RSI;
    } else if (['BB', 'BOLLINGER', '布林', '布林通道'].includes(upper)) {
      result.strategy = STRATEGY_BOLLINGER;
    } else if (['GRID', '網格'].includes(upper)) {
      result.strategy = STRATEGY_GRID;
    } else if (upper.endsWith('D') || upper.endsWith('天')) {
      const num = parseInt(arg);
      if (!isNaN(num)) result.days = num;
    } else if (['1M', '5M', '15M', '30M', '1H', '4H', '1D'].includes(upper)) {
      result.timeframe = upper;
    } else if (!isNaN(parseInt(arg)) && parseInt(arg) > 100) {
      result.capital = parseInt(arg);
    }
  }

  return result;
};

const checkBacktest = (context) => context.hasCommand(COMMAND_TRADING_BACKTEST);

const execBacktest = (context) => checkBacktest(context) && (
  async () => {
    try {
      context.pushText('📊 正在執行回測，請稍候...');

      const args = parseBacktestArgs(context.trimmedText);

      const result = await backtest.runBacktest({
        instId: args.instId,
        bar: args.timeframe,
        days: args.days,
        strategy: args.strategy,
        initialCapital: args.capital,
      });

      const formattedResult = backtest.formatBacktestResult(result);
      context.pushText(formattedResult);
    } catch (err) {
      context.pushError(err);
    }
    return context;
  }
)();

const checkCompare = (context) => context.hasCommand(COMMAND_TRADING_COMPARE);

const execCompare = (context) => checkCompare(context) && (
  async () => {
    try {
      context.pushText('📊 正在比較策略，請稍候...');

      const args = parseBacktestArgs(context.trimmedText);

      const results = await backtest.compareStrategies(
        args.instId,
        args.timeframe,
        args.days,
        args.capital
      );

      const formattedResult = backtest.formatComparisonResult(results, args.instId, args.days);
      context.pushText(formattedResult);
    } catch (err) {
      context.pushError(err);
    }
    return context;
  }
)();

export {
  execBacktest,
  execCompare,
};
