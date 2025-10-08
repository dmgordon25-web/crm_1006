import "../env.js";

export const CORE = [
  "/js/env.js",
  "/js/db.js",
  "/js/core/renderGuard.js",
  "/js/services/selection.js",
  "/js/utils.js",
  "/js/render.js",
  "/js/db_compat.js",
  "/js/ui/Toast.js",
  "/js/ui/Confirm.js",
  "/js/data/settings.js",
  "/js/ical.js",
  "/js/migrations.js",
  "/js/presets.js",
  "/js/filters.js",
  "/js/ui_shims.js",
  "/js/templates.js",
  "/js/state/selectionStore.js",
  "/js/state/actionBarGuards.js",
  "/js/header_ui.js",
  "/js/ui/notifications_panel.js",
  "/js/add_contact.js",
  "/js/quick_add.js",
  "/js/doccenter_rules.js",
  "/js/contacts.js",
  "/js/partners.js",
  "/js/partners_modal.js",
  "/js/contacts_merge.js",
  "/js/dash_range.js",
  "/js/importer.js",
  "/js/reports.js",
  "/js/commissions.js",
  "/js/notifications.js",
  "/js/calendar_impl.js",
  "/js/calendar.js",
  "/js/calendar_ics.js",
  "/js/post_funding.js",
  "/js/qa.js",
  "/js/bulk_log.js",
  "/js/print.js",
  "/js/app.js",
  "/js/settings_forms.js",
  "/js/services/pipelineStages.js",
  "/js/services/softDelete.js",
];

export const PATCHES = [];
// Runtime patch importing is temporarily disabled by SafeBoot. Re-enable intentionally when bundle is ready.

export default {
  CORE,
  PATCHES,
};

// Note: Patch importing is Safe-Mode guarded in boot_hardener.js. Enable patches with ?patches=on or localStorage 'crm:patches=on'.
// Optional strict abort with ?strict=1 or localStorage 'crm:strictBoot=1'.
