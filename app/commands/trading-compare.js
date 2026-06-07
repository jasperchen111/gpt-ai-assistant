import { TYPE_TRADING } from '../../constants/command.js';
import Command from './command.js';

export default new Command({
  type: TYPE_TRADING,
  label: '策略比較',
  text: '/compare',
  reply: '',
  prompt: '',
  aliases: ['/比較', '/策略比較'],
});
