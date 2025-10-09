/* crm-app/js/app.core.js
 * Logical core bundle. Import foundational modules in strict order.
 * DO NOT add dated patch files here. Keep side effects stable.
 */

// 1) Environment & storage compatibility
import "./env.js";
import "./db.js";
import "./db_compat.js";

// 2) Render discipline & global utilities
import "./core/renderGuard.js";      // double-rAF guard; must precede any paints
import "./utils.js";

// 3) Core services needed across the app
import "./services/selection.js";
import "./services/pipelineStages.js";
import "./services/softDelete.js";

// 4) Data/boot helpers
import "./data/settings.js";
import "./migrations.js";
import "./presets.js";

// 5) UI primitives that are safe to load early
import "./ui/Toast.js";
import "./ui/Confirm.js";

// 6) Top-level render orchestrator (defines renderAll, etc.)
import "./render.js";

// Nothing exported. This file’s purpose is to guarantee load order.
