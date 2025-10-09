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
import "./ui/actionbar.js";

// Pipeline / Kanban / Dashboard
import "./pipeline/kanban_dnd.js";
import "./dashboard/widgets_dnd.js";

// Calendar / ICS
import "./calendar.js";
import "./calendar_ics.js";
import "./calendar_export.js";
import "./ical.js";

// Documents / Reports
import "./doccenter_rules.js";
import "./documents.js";
import "./reports.js";

// Misc feature modules (safe to import after core)
import "./notifications.js";
import "./importer.js";
import "./export_csv.js";

import "./services/stage_tracker.js";
import "./services/doc_checklist.js";
import "./ui/contact_extras.js";
import "./ui/print_cards.js";

// Nothing exported. Sequence ensures deterministic wiring.
import "./services/uuidv5_none_partner.js";
import "./services/snapshot.js";
import "./importer_hardening.js";
