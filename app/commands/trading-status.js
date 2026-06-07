import { TYPE_TRADING } from '../../constants/command.js';
import Command from './command.js';

export default new Command({
  type: TYPE_TRADING,
  label: '交易狀態',
  text: '/status',
  reply: '',
  prompt: '',
  aliases: ['/狀態', '/交易狀態'],
});
