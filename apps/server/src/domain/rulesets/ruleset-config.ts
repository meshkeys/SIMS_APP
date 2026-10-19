// The ruleset schema is part of the API contract: the Administration screen
// edits rules with the same validation the server applies. Re-exported here
// for the server's rules engine.
export {
  DEFAULT_RULESET_CONFIG,
  type EscalationLevelConfig,
  MAX_ESCALATION_LEVELS,
  parseRulesetConfig,
  type RulesetConfig,
  rulesetConfigSchema,
} from '@sims/contracts';
