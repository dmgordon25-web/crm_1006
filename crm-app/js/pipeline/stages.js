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

export const NORMALIZE_STAGE = (function () {
  const entries = [
    // Canonical
    ["Long Shot", "Long Shot"],
    ["Application", "Application"],
    ["Pre-Approved", "Pre-Approved"],
    ["Processing", "Processing"],
    ["Underwriting", "Underwriting"],
    ["Approved", "Approved"],
    ["CTC", "CTC"],
    ["Funded", "Funded"],
    // Common legacy/synonyms → canonical
    ["Lead", "Long Shot"],
    ["Prospect", "Long Shot"],
    ["PreApproved", "Pre-Approved"],
    ["Pre Approved", "Pre-Approved"],
    ["UW", "Underwriting"],
    ["Under-write", "Underwriting"],
    ["Clear to Close", "CTC"],
    ["Clear-To-Close", "CTC"],
    ["Closed", "Funded"],
    ["Clients", "Funded"],
    ["Past Client", "Funded"],
  ];
  const map = new Map(entries);
  return function normalize(s) {
    if (!s) return "Long Shot";
    const k = String(s).trim();
    if (map.has(k)) return map.get(k);
    const squished = k.replace(/\s+/g, "");
    return map.get(squished) || "Long Shot";
  };
})();
