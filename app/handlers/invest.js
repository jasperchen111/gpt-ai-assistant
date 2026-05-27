import { t } from '../../locales/index.js';
import { runInvestmentAgentTeam } from '../agents/index.js';
import { COMMAND_BOT_INVEST, COMMAND_BOT_FORGET } from '../commands/index.js';
import Context from '../context.js';

/**
 * @param {Context} context
 * @returns {boolean}
 */
const check = (context) => context.hasCommand(COMMAND_BOT_INVEST);

/**
 * @param {Context} context
 * @returns {Promise<Context>}
 */
const exec = (context) => check(context) && (
  async () => {
    const query = context.trimmedText
      .replace(COMMAND_BOT_INVEST.text, '')
      .replace('/invest', '')
      .replace('Invest', '')
      .trim();

    if (!query) {
      context.pushText(t('__COMMAND_BOT_INVEST_USAGE'));
      return context;
    }

    try {
      const result = await runInvestmentAgentTeam(query);
      context.pushText(result, [COMMAND_BOT_FORGET]);
    } catch (err) {
      context.pushError(err);
    }
    return context;
  }
)();

export default exec;
