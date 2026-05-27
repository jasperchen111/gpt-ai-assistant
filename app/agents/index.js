import fetchStockContext from './fetch-stock-context.js';
import runIndustryResearch from './industry-research.js';
import runTechnicalAnalysis from './technical-analysis.js';
import runNewsSummary from './news-summary.js';
import runQuantBacktest from './quant-backtest.js';
import runRiskControl from './risk-control.js';
import runMasterControl from './master-control.js';

/**
 * @param {string} query - Stock symbol or company name
 * @returns {Promise<string>} Master agent's integrated recommendation
 */
const runInvestmentAgentTeam = async (query) => {
  const realtimeContext = await fetchStockContext(query);

  const [industryResearch, technicalAnalysis, newsSummary, quantBacktest, riskControl] = await Promise.all([
    runIndustryResearch(query, realtimeContext),
    runTechnicalAnalysis(query, realtimeContext),
    runNewsSummary(query, realtimeContext),
    runQuantBacktest(query, realtimeContext),
    runRiskControl(query, realtimeContext),
  ]);

  const masterDecision = await runMasterControl(query, {
    industryResearch,
    technicalAnalysis,
    newsSummary,
    quantBacktest,
    riskControl,
  });

  return masterDecision;
};

export {
  fetchStockContext,
  runIndustryResearch,
  runTechnicalAnalysis,
  runNewsSummary,
  runQuantBacktest,
  runRiskControl,
  runMasterControl,
  runInvestmentAgentTeam,
};

export default runInvestmentAgentTeam;
