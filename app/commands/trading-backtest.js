import { TYPE_TRADING } from '../../constants/command.js';
import Command from './command.js';

export default new Command({
  type: TYPE_TRADING,
  label: '回測',
  text: '/backtest',
  reply: '',
  prompt: '',
  aliases: ['/回測', '/bt'],
});
