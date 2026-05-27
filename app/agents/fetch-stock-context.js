import config from '../../config/index.js';
import { search } from '../../services/serpapi.js';

const extractSnippets = (data) => {
  const parts = [];
  const { answer_box: ab, knowledge_graph: kg, organic_results: or } = data;
  if (ab?.answer) parts.push(ab.answer);
  if (ab?.result) parts.push(ab.result);
  if (ab?.snippet) parts.push(ab.snippet);
  if (kg?.description) parts.push(`${kg.title}：${kg.description}`);
  if (or?.length) parts.push(...or.slice(0, 3).map((r) => r.snippet).filter(Boolean));
  return parts.join('\n');
};

/**
 * Fetches real-time stock context via SerpAPI (price + news).
 * Returns empty string in non-production or when SERPAPI_API_KEY is absent.
 * @param {string} query
 * @returns {Promise<string>}
 */
const fetchStockContext = async (query) => {
  if (config.APP_ENV !== 'production' || !config.SERPAPI_API_KEY) return '';

  const [priceRes, newsRes] = await Promise.all([
    search({ q: `${query} 股價 即時` }).catch(() => null),
    search({ q: `${query} 最新消息 財報 2024 2025` }).catch(() => null),
  ]);

  const parts = [];
  if (priceRes?.data) parts.push(`【即時行情】\n${extractSnippets(priceRes.data)}`);
  if (newsRes?.data) parts.push(`【近期新聞】\n${extractSnippets(newsRes.data)}`);

  return parts.join('\n\n');
};

export default fetchStockContext;
