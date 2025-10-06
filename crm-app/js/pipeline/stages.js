// crm-app/js/pipeline/stages.js
export const PIPELINE_STAGES = [
  "Long Shot",
  "Application",
  "Pre-Approved",
  "Processing",
  "Underwriting",
  "Approved",
  "CTC",
  "Funded",
];

const FALLBACK_STAGE = PIPELINE_STAGES[0];

const SYNONYMS = [
  ["Lead", "Long Shot"],
  ["Leads", "Long Shot"],
  ["Prospect", "Long Shot"],
  ["New Lead", "Long Shot"],
  ["Buyer Lead", "Long Shot"],
  ["LongShot", "Long Shot"],
  ["Long-Shot", "Long Shot"],
  ["PreApproved", "Pre-Approved"],
  ["Preapproved", "Pre-Approved"],
  ["Pre Approved", "Pre-Approved"],
  ["Pre-Approved", "Pre-Approved"],
  ["Pre App", "Pre-Approved"],
  ["Pre-App", "Pre-Approved"],
  ["Preapp", "Pre-Approved"],
  ["Pre Application", "Pre-Approved"],
  ["Pre-Application", "Pre-Approved"],
  ["Preapproval", "Pre-Approved"],
  ["Pre-Approval", "Pre-Approved"],
  ["UW", "Underwriting"],
  ["Under-write", "Underwriting"],
  ["Underwrite", "Underwriting"],
  ["Under Writing", "Underwriting"],
  ["Application Started", "Application"],
  ["App Started", "Application"],
  ["Nurture", "Application"],
  ["Clear to Close", "CTC"],
  ["Clear-To-Close", "CTC"],
  ["Clear-to-Close", "CTC"],
  ["Clear 2 Close", "CTC"],
  ["Clear2Close", "CTC"],
  ["Funded/Closed", "Funded"],
  ["Closed", "Funded"],
  ["Clients", "Funded"],
  ["Client", "Funded"],
  ["Past Client", "Funded"],
  ["Past Clients", "Funded"],
  ["Post Close", "Funded"],
  ["Post-Close", "Funded"],
];

function stageKeyFromNormalizedLabel(label) {
  const raw = String(label ?? "").trim();
  if (!raw) return "long-shot";
  const lowered = raw.toLowerCase();
  if (lowered === "pre-approved" || lowered === "pre approved") return "preapproved";
  if (lowered === "ctc") return "cleared-to-close";
  return lowered
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "long-shot";
}

const KEY_TO_LABEL = new Map();
PIPELINE_STAGES.forEach((label) => {
  KEY_TO_LABEL.set(stageKeyFromNormalizedLabel(label), label);
});

const STAGE_KEY_ALIASES = new Map();

function register(map, key, value) {
  if (!key) return;
  const variants = new Set([
    key,
    key.toLowerCase(),
    key.toUpperCase(),
    key.replace(/\s+/g, ""),
    key.toLowerCase().replace(/\s+/g, ""),
    key.replace(/[^a-z0-9]/gi, ""),
    key.toLowerCase().replace(/[^a-z0-9]/g, ""),
  ]);
  variants.forEach((token) => {
    if (token) map.set(token, value);
  });
}

function registerKeyAlias(input, key) {
  const raw = String(input ?? "").trim();
  if (!raw) return;
  const lowered = raw.toLowerCase();
  const dashed = lowered.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const squished = lowered.replace(/[^a-z0-9]+/g, "");
  [lowered, dashed, squished].forEach((token) => {
    if (token) STAGE_KEY_ALIASES.set(token, key);
  });
}

export const NORMALIZE_STAGE = (function () {
  const map = new Map();
  PIPELINE_STAGES.forEach((stage) => register(map, stage, stage));
  SYNONYMS.forEach(([input, output]) => register(map, String(input ?? ""), output));

  return function normalize(value) {
    if (!value) return FALLBACK_STAGE;
    const raw = String(value).trim();
    if (!raw) return FALLBACK_STAGE;
    const direct =
      map.get(raw) ||
      map.get(raw.toLowerCase()) ||
      map.get(raw.replace(/\s+/g, "")) ||
      map.get(raw.toLowerCase().replace(/\s+/g, "")) ||
      map.get(raw.replace(/[^a-z0-9]/gi, "")) ||
      map.get(raw.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (direct && PIPELINE_STAGES.includes(direct)) return direct;
    const lowered = raw.toLowerCase();
    const labelMatch = PIPELINE_STAGES.find((stage) => stage.toLowerCase() === lowered);
    if (labelMatch) return labelMatch;
    return FALLBACK_STAGE;
  };
})();

PIPELINE_STAGES.forEach((stage) => registerKeyAlias(stage, stageKeyFromNormalizedLabel(stage)));
SYNONYMS.forEach(([input, output]) => registerKeyAlias(input, stageKeyFromNormalizedLabel(output)));
registerKeyAlias("application-started", stageKeyFromNormalizedLabel("Application"));
registerKeyAlias("nurture", stageKeyFromNormalizedLabel("Application"));
registerKeyAlias("buyer-lead", stageKeyFromNormalizedLabel("Long Shot"));
registerKeyAlias("lost", "lost");
registerKeyAlias("denied", "denied");

export function stageKeyFromLabel(label) {
  const raw = String(label ?? "").trim();
  if (!raw) return stageKeyFromNormalizedLabel(FALLBACK_STAGE);
  const lowered = raw.toLowerCase();
  const dashed = lowered.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const squished = lowered.replace(/[^a-z0-9]+/g, "");
  if (STAGE_KEY_ALIASES.has(lowered)) return STAGE_KEY_ALIASES.get(lowered);
  if (STAGE_KEY_ALIASES.has(dashed)) return STAGE_KEY_ALIASES.get(dashed);
  if (STAGE_KEY_ALIASES.has(squished)) return STAGE_KEY_ALIASES.get(squished);
  if (lowered === "lost" || lowered === "denied") return lowered;
  const normalized = NORMALIZE_STAGE(raw);
  return stageKeyFromNormalizedLabel(normalized);
}

export function stageLabelFromKey(key) {
  const normalizedKey = String(key ?? "").trim().toLowerCase();
  if (KEY_TO_LABEL.has(normalizedKey)) return KEY_TO_LABEL.get(normalizedKey);
  const normalizedStage = NORMALIZE_STAGE(key);
  const derived = stageKeyFromNormalizedLabel(normalizedStage);
  return KEY_TO_LABEL.get(derived) || normalizedStage || FALLBACK_STAGE;
}

export const PIPELINE_STAGE_KEYS = PIPELINE_STAGES.map(stageKeyFromNormalizedLabel);
