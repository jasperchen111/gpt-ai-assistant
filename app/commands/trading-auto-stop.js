import { TYPE_TRADING } from '../../constants/command.js';
import Command from './command.js';

export default new Command({
  type: TYPE_TRADING,
  label: '停止自動交易',
  text: '/stop',
  reply: '',
  prompt: '',
  aliases: ['/停止', '/停止交易', '/stop-auto'],
});
