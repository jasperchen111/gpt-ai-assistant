import Prompt from './prompt.js';

const prompts = new Map();

/**
 * @param {string} userId
 * @param {Object|null} botConfig
 * @returns {Prompt}
 */
const getPrompt = (userId, botConfig = null) => {
  if (prompts.has(userId)) return prompts.get(userId);
  return new Prompt(botConfig ? {
    appInitPrompt: botConfig.appInitPrompt,
    humanName: botConfig.humanName,
    humanInitPrompt: botConfig.humanInitPrompt,
    botName: botConfig.botName,
    botInitPrompt: botConfig.botInitPrompt,
  } : {});
};

/**
 * @param {string} userId
 * @param {Prompt} prompt
 */
const setPrompt = (userId, prompt) => {
  prompts.set(userId, prompt);
};

/**
 * @param {string} userId
 */
const removePrompt = (userId) => {
  prompts.delete(userId);
};

const printPrompts = () => {
  if (Array.from(prompts.keys()).length < 1) return;
  const content = Array.from(prompts.keys()).map((userId) => `\n=== ${userId.slice(0, 6)} ===\n${getPrompt(userId)}\n`).join('');
  console.info(content);
};

export {
  Prompt,
  getPrompt,
  setPrompt,
  removePrompt,
  printPrompts,
};

export default prompts;
