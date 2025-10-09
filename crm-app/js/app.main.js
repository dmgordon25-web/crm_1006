/* crm-app/js/app.main.js
 * Logical feature bundle. Import feature modules & screens after core.
 * Keep this list deterministic. DO NOT import dated patch files here.
 */

// Contacts & Partners (lists, details, merge, stage tracker)
import "./contacts.js";
import "./contacts_merge.js";
import "./contact_stage_tracker.js";

import "./partners.js";
import "./partners_merge.js";

// Pipeline / Kanban / Dashboard
import "./pipeline/kanban_dnd.js";
import "./dashboard/widgets_dnd.js";

// Calendar / ICS
import "./calendar.js";
import "./calendar_ics.js";
import "./ical.js";

// Documents / Reports
import "./doccenter_rules.js";
import "./documents.js";
import "./reports.js";

// Misc feature modules (safe to import after core)
import "./notifications.js";
import "./importer.js";

// Nothing exported. Sequence ensures deterministic wiring.
