
/* db_compat.js — compatibility aliases for legacy modules */
(function(){
  if (typeof window.openDB !== 'function' && typeof window.opendb === 'function') window.openDB = window.opendb;
  if (typeof window.opendb !== 'function' && typeof window.openDB === 'function') window.opendb = window.openDB;
  if (typeof window.dbGet !== 'function' && typeof window.dbget === 'function') window.dbGet = window.dbget;
  if (typeof window.dbget !== 'function' && typeof window.dbGet === 'function') window.dbget = window.dbGet;
})();
