import { state, defaultSettings, showToast } from './state.js';
import * as api from './api.js';
import { navigate } from './navigation.js';
import { getThemePreference, setThemePreference } from './theme.js';

function s() { return state.settings; }
function field(label, value, type='text') { const wrap=document.createElement('label'); wrap.className='form-group'; const span=document.createElement('span'); span.textContent=label; const input=document.createElement('input'); input.type=type; input.value=value ?? ''; wrap.append(span,input); return { wrap,input }; }
function button(text, cls='btn-green') { const b=document.createElement('button'); b.type='button'; b.className=cls; b.textContent=text; return b; }
function panel(title) { const section=document.createElement('section'); section.className='settings-card'; const h=document.createElement('h3'); h.textContent=title; section.appendChild(h); return section; }
function saveFoodRow(food) {
  const row=document.createElement('div'); row.className='food-editor-row';
  const name=document.createElement('input'); name.type='text'; name.value=food.name; name.setAttribute('aria-label','Food name');
  const cal=document.createElement('input'); cal.type='number'; cal.min='1'; cal.value=food.calories; cal.setAttribute('aria-label','Calories');
  const controls=document.createElement('div'); controls.className='food-editor-actions';
  const up=button('⬆️','icon-button'), down=button('⬇️','icon-button'), visible=button(food.active ? '👁️ Hide' : '🙈 Show','btn-outline small-button'), save=button('💾 Save','btn-green small-button'), remove=button(s().emojiDelete,'icon-button danger');
  up.addEventListener('click',()=>api.reorderFood(food.id,-1)); down.addEventListener('click',()=>api.reorderFood(food.id,1));
  visible.addEventListener('click',()=>api.updateFood(food.id,{...food,active:!food.active}));
  save.addEventListener('click',()=>{ try { api.updateFood(food.id,{...food,name:name.value,calories:Number(cal.value)}); showToast('Saved food updated','success'); } catch(error) { showToast(error.message,'error'); } });
  remove.addEventListener('click',()=>{ if(confirm(`Delete saved food button “${food.name}”?`)) api.deleteFood(food.id); });
  controls.append(up,down,visible,save,remove); row.append(name,cal,controls); return row;
}
export function renderSettings() {
  const container=document.createElement('main'); container.className='screen settings active page settings-page';
  const header=document.createElement('section'); header.className='card section-header settings-header';
  const back=button(`${s().emojiPrevious} Back`,'btn-outline'); back.addEventListener('click',()=>navigate('main'));
  const title=document.createElement('div'); title.innerHTML=`<h1>${s().emojiSettings} Settings</h1><p class="subtle-label">Targets, appearance and data controls</p>`; header.append(back,title); container.appendChild(header);
  const content=document.createElement('div'); content.className='settings-content';

  const link=panel(`${s().emojiSheet} Data Sheet`);
  const sheetLink=document.createElement('a'); sheetLink.className='sheet-link'; sheetLink.href=s().googleSheetUrl || defaultSettings.googleSheetUrl; sheetLink.target='_blank'; sheetLink.rel='noopener'; sheetLink.textContent=`${s().emojiSheet} Open Google Sheet`;
  link.appendChild(sheetLink); content.appendChild(link);

  const targets=panel('🎯 Targets');
  const dailyFood=field('Daily Food Target',s().dailyCalories,'number'), dailyBurn=field('Daily Burn Target',s().dailyBurnTarget,'number'), dailyDeficit=field('Daily Deficit Target',s().dailyDeficit,'number'), bmr=field('BMR',s().bmr,'number');
  targets.append(dailyFood.wrap,dailyBurn.wrap,dailyDeficit.wrap,bmr.wrap);
  const saveTargets=button('💾 Save Targets'); saveTargets.addEventListener('click',()=>{ api.saveSettings({...s(),dailyCalories:Number(dailyFood.input.value),dailyBurnTarget:Number(dailyBurn.input.value),dailyDeficit:Number(dailyDeficit.input.value),bmr:Number(bmr.input.value)}); showToast('Targets saved','success'); }); targets.appendChild(saveTargets); content.appendChild(targets);

  const appearance=panel('🎨 Appearance');
  const theme=document.createElement('select'); ['system','light','dark'].forEach(value=>{ const option=document.createElement('option'); option.value=value; option.textContent=value[0].toUpperCase()+value.slice(1); theme.appendChild(option); }); theme.value=getThemePreference(); theme.addEventListener('change',()=>setThemePreference(theme.value));
  const themeLabel=document.createElement('label'); themeLabel.className='form-group'; themeLabel.innerHTML='<span>Theme</span>'; themeLabel.appendChild(theme); appearance.appendChild(themeLabel);
  const emojiFields = [ ['emojiFood','Food'],['emojiBurn','Burn'],['emojiDeficit','Deficit'],['emojiWeight','Weight'],['emojiBmr','BMR'],['emojiHistory','History'],['emojiSettings','Settings'],['emojiPrevious','Previous Day'],['emojiNext','Next Day'],['emojiEdit','Edit'],['emojiDelete','Delete'],['emojiSheet','Google Sheet'],['emojiSearch','Search'] ];
  const emojiGrid=document.createElement('div'); emojiGrid.className='emoji-grid'; const inputs={};
  emojiFields.forEach(([key,label])=>{ const item=field(label,s()[key],'text'); item.input.maxLength=8; inputs[key]=item.input; emojiGrid.appendChild(item.wrap); }); appearance.appendChild(emojiGrid);
  const saveEmoji=button('💾 Save Emoji Choices'); saveEmoji.addEventListener('click',()=>{ const changes={}; emojiFields.forEach(([key])=>{ changes[key]=inputs[key].value || defaultSettings[key]; }); api.saveSettings({...s(),...changes}); showToast('Emoji choices saved','success'); }); appearance.appendChild(saveEmoji); content.appendChild(appearance);

  const foods=panel(`${s().emojiFood} Saved Food Buttons`);
  const addRow=document.createElement('div'); addRow.className='food-add-row'; const newName=document.createElement('input'); newName.placeholder='New saved food'; const newCal=document.createElement('input'); newCal.type='number'; newCal.placeholder='Calories'; newCal.min='1'; const add=button(`${s().emojiFood} Add`); add.addEventListener('click',()=>{ try { api.addFood(newName.value,Number(newCal.value)); newName.value=''; newCal.value=''; } catch(error){ showToast(error.message,'error'); }}); addRow.append(newName,newCal,add); foods.appendChild(addRow);
  state.foods.forEach(food=>foods.appendChild(saveFoodRow(food))); content.appendChild(foods);

  const backup=panel('💾 Backup & Data');
  const exportButton=button('📤 Export Android-Compatible Backup','btn-outline full-button'); exportButton.addEventListener('click',async()=>{ const data=await api.exportData(); const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); link.download='chrisfit-backup.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),500); });
  const importButton=button('📥 Import Phone Backup','btn-outline full-button'); importButton.addEventListener('click',()=>{ const input=document.createElement('input'); input.type='file'; input.accept='application/json'; input.addEventListener('change',async()=>{ const file=input.files[0]; if(!file) return; try { const data=JSON.parse(await file.text()); const count=`${data.entries?.length||0} entries, ${data.foods?.length||0} saved foods and ${data.weights?.length||0} weights`; if(confirm(`Import will replace entries, saved foods and weights with ${count}. Settings will remain. Continue?`)){ await api.importData(data); showToast('Phone backup imported','success',3500); }} catch(error){ showToast(error.message||'Import failed','error',4000); }}); input.click(); });
  const reset=button('⚠️ Reset Entries, Foods & Weights','btn-red full-button'); reset.addEventListener('click',async()=>{ if(confirm('Delete all entries, saved foods and weights from the cloud sheet?')) { await api.resetAllData(); showToast('Tracking data reset','success'); }});
  backup.append(exportButton,importButton,reset); content.appendChild(backup);

  const debug=panel('🛠️ Connection Debug'); debug.classList.add('diagnostic-panel');
  const info=api.getConnectionInfo(); const status=document.createElement('p'); status.className='diagnostic-status'; status.textContent=`Mode: ${info.mode} · Pending local changes: ${info.pendingChanges} · State: ${info.syncPhase}`; const endpoint=document.createElement('p'); endpoint.className='diagnostic-endpoint'; endpoint.textContent=`Endpoint: ${info.endpoint}`;
  const output=document.createElement('textarea'); output.className='diagnostic-output'; output.readOnly=true; output.placeholder='Run the connection test to see exact results.';
  const run=button('▶️ Run Connection Test','btn-outline'); run.addEventListener('click',async()=>{ output.value='Testing…'; output.value=await api.runConnectionDebugTest(); }); const copy=button('📋 Copy Debug Report','btn-outline'); copy.addEventListener('click',async()=>{ await navigator.clipboard.writeText(output.value); showToast('Debug report copied','success'); }); const discard=button('🧹 Discard Unsynced Local Changes','btn-red'); discard.addEventListener('click',()=>api.discardPendingChanges());
  debug.append(status,endpoint,run,copy,discard,output); content.appendChild(debug);

  const notes=panel('ℹ️ Release Notes'); notes.classList.add('release-notes'); notes.innerHTML += `<p><strong>ChrisFit Web · v2.3</strong></p><p>Written and developed by Christopher Zachary Tyler · CINAEDVS Studios · 2026</p><ul><li>Added Daily Burn Target and weekly burn targets.</li><li>Added editable entries, weights and saved-food management.</li><li>Added configurable emoji labels saved in Google Sheets.</li><li>Added food search suggestions and improved desktop Settings layout.</li><li>Added root <code>icon.png</code> logo support before the title.</li></ul>`; content.appendChild(notes);
  container.appendChild(content); return container;
}
