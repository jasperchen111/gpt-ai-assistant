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
  const [industryResearch, technicalAnalysis, newsSummary, quantBacktest, riskControl] = await Promise.all([
    runIndustryResearch(query),
    runTechnicalAnalysis(query),
    runNewsSummary(query),
    runQuantBacktest(query),
    runRiskControl(query),
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
  runIndustryResearch,
  runTechnicalAnalysis,
  runNewsSummary,
  runQuantBacktest,
  runRiskControl,
  runMasterControl,
  runInvestmentAgentTeam,
};

export default runInvestmentAgentTeam;
