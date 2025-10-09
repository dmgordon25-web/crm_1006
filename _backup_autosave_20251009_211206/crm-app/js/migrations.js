// migrations.js — safe no-op to avoid truncated logic errors
(function(){
  try{
    // original migrations intentionally disabled for this baseline; schema is created by db.js
  }catch(e){
    console.warn('migrations disabled', e);
  }
})();
