/**
 * ChrisFit Web v2.3 Google Apps Script backend.
 * Spreadsheet is the shared data store; Android phone backups remain import-compatible.
 */
const SPREADSHEET_ID = '1rizJJ7oC2VbZPKYuMnlYD5WhhmEvLPcJM1OY_jD0bVM';
const TOKEN = '';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1rizJJ7oC2VbZPKYuMnlYD5WhhmEvLPcJM1OY_jD0bVM/edit?usp=sharing';
const SETTINGS_DEFAULTS = {
  id: 1, dailyCalories: 1500, dailyBurnTarget: 2500, dailyDeficit: 500, bmr: 2000,
  emojiFood: '🥦', emojiBurn: '🔥', emojiDeficit: '📉', emojiWeight: '⚖️', emojiBmr: '⚡',
  emojiHistory: '📜', emojiSettings: '⚙️', emojiPrevious: '⬅️', emojiNext: '➡️',
  emojiEdit: '✏️', emojiDelete: '🗑️', emojiSheet: '📊', emojiSearch: '🔎', googleSheetUrl: SHEET_URL
};
const SCHEMAS = {
  entries: ['id','date','name','calories'],
  foods: ['id','name','calories','sortOrder','active'],
  weights: ['id','value','date'],
  settings: ['id','dailyCalories','dailyDeficit','bmr','dailyBurnTarget','emojiFood','emojiBurn','emojiDeficit','emojiWeight','emojiBmr','emojiHistory','emojiSettings','emojiPrevious','emojiNext','emojiEdit','emojiDelete','emojiSheet','emojiSearch','googleSheetUrl']
};

function doGet(e) {
  try {
    validateToken_(e); ensureSchema_();
    const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
    if (action === 'settings') return json_(getSettings_());
    if (action === 'foods') return json_(getFoods_());
    if (action === 'entries') return json_(getEntries_(e.parameter.date));
    if (action === 'weights') return json_(getWeights_());
    if (action === 'export') return json_(exportAndroidCompatibleData_());
    return error_('Unknown GET action: ' + action);
  } catch (error) { return error_(error.message || String(error)); }
}
function doPost(e) {
  try {
    validateToken_(e); ensureSchema_();
    const action = String((e.parameter && e.parameter.action) || '').toLowerCase();
    const data = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (action === 'settings') return json_(saveSettings_(data));
    if (action === 'foods') return json_(addFood_(data));
    if (action === 'updatefood') return json_(updateFood_(data));
    if (action === 'deletefood') return json_(deleteRowById_('foods', data.id));
    if (action === 'entries') return json_(addEntry_(data));
    if (action === 'updateentry') return json_(updateEntry_(data));
    if (action === 'deleteentry') return json_(deleteRowById_('entries', data.id));
    if (action === 'weights') return json_(addWeight_(data));
    if (action === 'updateweight') return json_(updateWeight_(data));
    if (action === 'deleteweight') return json_(deleteRowById_('weights', data.id));
    if (action === 'batch') return json_(batchOperations_(data.operations || []));
    if (action === 'import') return json_(importAndroidData_(data));
    if (action === 'reset') return json_(resetAll_());
    return error_('Unknown POST action: ' + action);
  } catch (error) { return error_(error.message || String(error)); }
}
function validateToken_(e) { if (TOKEN && (!e.parameter || e.parameter.token !== TOKEN)) throw new Error('Unauthorized'); }
function workbook_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sheet_(name) { const sheet = workbook_().getSheetByName(name); if (!sheet) throw new Error('Missing sheet tab: ' + name); return sheet; }
function ensureSchema_() {
  Object.keys(SCHEMAS).forEach(name => {
    const target = sheet_(name); const desired = SCHEMAS[name]; const current = target.getRange(1, 1, 1, Math.max(target.getLastColumn(), 1)).getValues()[0].map(String);
    desired.forEach(header => { if (current.indexOf(header) < 0) { current.push(header); target.getRange(1, current.length).setValue(header); } });
  });
}
function headerMap_(name) { const headers = sheet_(name).getRange(1,1,1,sheet_(name).getLastColumn()).getValues()[0]; const map={}; headers.forEach((h,i)=>{ map[String(h)]=i; }); return map; }
function nextId_(name) { const target=sheet_(name), map=headerMap_(name), rows=target.getDataRange().getValues().slice(1); const ids=rows.map(row=>Number(row[map.id])).filter(Number.isFinite); return ids.length ? Math.max.apply(null, ids)+1 : 1; }
function rowById_(name, id) { const target=sheet_(name), map=headerMap_(name), rows=target.getDataRange().getValues(); for (let i=1;i<rows.length;i++){ if(String(rows[i][map.id])===String(id)) return { target, map, row:i+1, values:rows[i] }; } throw new Error('Record not found in '+name+': '+id); }
function isoDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return Utilities.formatDate(value, workbook_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const text=String(value||'').trim(); const match=text.match(/^(\d{4}-\d{2}-\d{2})/); return match ? match[1] : text;
}
function requiredDate_(date, label) { const value=isoDate_(date); if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(label+' date is invalid.'); return value; }
function parseBoolean_(value, fallback) { if(value === '' || value === undefined || value === null) return fallback; return value === true || String(value).toLowerCase() === 'true'; }

function getSettings_() {
  const target=sheet_('settings'), map=headerMap_('settings'), rows=target.getDataRange().getValues();
  if (rows.length < 2 || rows[1][map.id] === '') return Object.assign({}, SETTINGS_DEFAULTS);
  const row=rows[1], result=Object.assign({}, SETTINGS_DEFAULTS);
  Object.keys(result).forEach(key => { if(map[key] !== undefined && row[map[key]] !== '' && row[map[key]] !== undefined) result[key]=row[map[key]]; });
  ['id','dailyCalories','dailyBurnTarget','dailyDeficit','bmr'].forEach(key => { result[key]=Number(result[key]); });
  return result;
}
function saveSettings_(data) {
  const target=sheet_('settings'), map=headerMap_('settings'), values=Object.assign({}, getSettings_(), data, { id:1 });
  const row = new Array(target.getLastColumn()).fill('');
  Object.keys(values).forEach(key => { if(map[key] !== undefined) row[map[key]]=values[key]; });
  target.getRange(2,1,1,row.length).setValues([row]); return { success:true, settings:getSettings_() };
}
function getFoods_() {
  const target=sheet_('foods'), map=headerMap_('foods');
  return target.getDataRange().getValues().slice(1).filter(row=>row[map.id] !== '').map((row,index)=>({ id:Number(row[map.id]), name:String(row[map.name]||''), calories:Number(row[map.calories]), sortOrder: row[map.sortOrder] === '' ? index+1 : Number(row[map.sortOrder]), active:parseBoolean_(row[map.active], true) })).sort((a,b)=>a.sortOrder-b.sortOrder || a.id-b.id);
}
function addFood_(data) {
  const name=String(data.name||'').trim(); if(!name) throw new Error('Food name is required.');
  const target=sheet_('foods'), map=headerMap_('foods'), id=nextId_('foods'), order=Number(data.sortOrder) || (getFoods_().reduce((max,food)=>Math.max(max,food.sortOrder),0)+1), row=new Array(target.getLastColumn()).fill('');
  row[map.id]=id; row[map.name]=name; row[map.calories]=Math.abs(Number(data.calories)); row[map.sortOrder]=order; row[map.active]=data.active === false ? false : true; target.appendRow(row); return {success:true,id:id};
}
function updateFood_(data) {
  const found=rowById_('foods',data.id), name=String(data.name||'').trim(); if(!name) throw new Error('Food name is required.');
  found.values[found.map.name]=name; found.values[found.map.calories]=Math.abs(Number(data.calories)); found.values[found.map.sortOrder]=Number(data.sortOrder); found.values[found.map.active]=Boolean(data.active); found.target.getRange(found.row,1,1,found.values.length).setValues([found.values]); return {success:true};
}
function getEntries_(date) {
  const target=sheet_('entries'), map=headerMap_('entries'), selected=date ? isoDate_(date) : '';
  return target.getDataRange().getValues().slice(1).filter(row=>row[map.id] !== '' && (!selected || isoDate_(row[map.date])===selected)).map(row=>({id:Number(row[map.id]),date:isoDate_(row[map.date]),name:String(row[map.name]||''),calories:Number(row[map.calories])})).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
}
function addEntry_(data) { const date=requiredDate_(data.date,'Entry'), name=String(data.name||'').trim(); if(!name) throw new Error('Entry name is required.'); const target=sheet_('entries'), map=headerMap_('entries'), row=new Array(target.getLastColumn()).fill(''), id=nextId_('entries'); row[map.id]=id; row[map.date]=date; row[map.name]=name; row[map.calories]=Number(data.calories); target.appendRow(row); return {success:true,id:id}; }
function updateEntry_(data) { const found=rowById_('entries',data.id), name=String(data.name||'').trim(); if(!name) throw new Error('Entry name is required.'); found.values[found.map.date]=requiredDate_(data.date,'Entry'); found.values[found.map.name]=name; found.values[found.map.calories]=Number(data.calories); found.target.getRange(found.row,1,1,found.values.length).setValues([found.values]); return {success:true}; }
function getWeights_() { const target=sheet_('weights'), map=headerMap_('weights'); return target.getDataRange().getValues().slice(1).filter(row=>row[map.id] !== '').map(row=>({id:Number(row[map.id]),value:Number(row[map.value]),date:isoDate_(row[map.date])})).sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id); }
function addWeight_(data) { const target=sheet_('weights'), map=headerMap_('weights'), row=new Array(target.getLastColumn()).fill(''), id=nextId_('weights'); row[map.id]=id; row[map.value]=Number(data.value); row[map.date]=requiredDate_(data.date,'Weight'); target.appendRow(row); return {success:true,id:id}; }
function updateWeight_(data) { const found=rowById_('weights',data.id); found.values[found.map.value]=Number(data.value); found.values[found.map.date]=requiredDate_(data.date,'Weight'); found.target.getRange(found.row,1,1,found.values.length).setValues([found.values]); return {success:true}; }
function deleteRowById_(name,id) { const found=rowById_(name,id); found.target.deleteRow(found.row); return {success:true}; }
function batchOperations_(operations) {
  if(!Array.isArray(operations)) throw new Error('Batch operations must be an array.'); const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try { operations.forEach(operation => { const type=String(operation.type||'').toLowerCase(), data=operation.data||{}; if(type==='entries') addEntry_(data); else if(type==='updateentry') updateEntry_(data); else if(type==='deleteentry') deleteRowById_('entries',data.id); else if(type==='foods') addFood_(data); else if(type==='updatefood') updateFood_(data); else if(type==='deletefood') deleteRowById_('foods',data.id); else if(type==='weights') addWeight_(data); else if(type==='updateweight') updateWeight_(data); else if(type==='deleteweight') deleteRowById_('weights',data.id); else if(type==='settings') saveSettings_(data); else throw new Error('Unknown batch operation: '+type); }); SpreadsheetApp.flush(); return {success:true,processed:operations.length}; } finally { lock.releaseLock(); }
}
function exportAndroidCompatibleData_() { return { entries:getEntries_().map(entry=>({date:entry.date,name:entry.name,calories:entry.calories})), foods:getFoods_().map(food=>({name:food.name,calories:food.calories})), weights:getWeights_().map(weight=>({date:weight.date,value:weight.value})) }; }
function importAndroidData_(data) {
  if(!data || !Array.isArray(data.entries) || !Array.isArray(data.foods) || !Array.isArray(data.weights)) throw new Error('Backup must contain entries, foods and weights arrays.'); const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try { resetAll_(); const entries=data.entries.map((entry,index)=>[index+1,requiredDate_(entry.date,'Entry'),String(entry.name||''),Number(entry.calories)]); const foods=data.foods.map((food,index)=>[index+1,String(food.name||''),Number(food.calories),index+1,true]); const weights=data.weights.map((weight,index)=>[index+1,Number(weight.value),requiredDate_(weight.date,'Weight')]); if(entries.length) sheet_('entries').getRange(2,1,entries.length,4).setValues(entries); if(foods.length) sheet_('foods').getRange(2,1,foods.length,5).setValues(foods); if(weights.length) sheet_('weights').getRange(2,1,weights.length,3).setValues(weights); SpreadsheetApp.flush(); return {success:true,entries:entries.length,foods:foods.length,weights:weights.length}; } finally { lock.releaseLock(); }
}
function resetAll_() { ['entries','foods','weights'].forEach(name=>{ const target=sheet_(name); if(target.getLastRow()>1) target.deleteRows(2,target.getLastRow()-1); }); return {success:true}; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function error_(message) { return json_({success:false,error:message}); }
