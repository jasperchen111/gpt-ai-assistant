import config from '../config/index.js';
import { reply } from '../services/line.js';

const replyMessage = (context) => {
  const { replyToken, messages } = context;
  if (config.APP_ENV !== 'production') return { replyToken, messages };
  return reply({ replyToken, messages, token: context.lineChannelAccessToken });
};

export default replyMessage;
