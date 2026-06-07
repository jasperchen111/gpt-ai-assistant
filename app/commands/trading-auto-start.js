import { TYPE_TRADING } from '../../constants/command.js';
import Command from './command.js';

export default new Command({
  type: TYPE_TRADING,
  label: '啟動自動交易',
  text: '/auto',
  reply: '',
  prompt: '',
  aliases: ['/自動', '/自動交易', '/start-auto'],
});
