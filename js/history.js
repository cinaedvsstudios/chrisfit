import { state } from './state.js';
import * as api from './api.js';
import * as dateUtils from './date-utils.js';
import * as calc from './calculations.js';
import { navigate } from './navigation.js';
import { showEntryDialog, showWeightDialog } from './dialogs.js';

const openMonths = new Set();
const openWeeks = new Set();
const openDays = new Set();
let defaultsApplied = false;
function i() { return state.settings; }
function button(text, cls, fn, title='') { const b=document.createElement('button'); b.type='button'; b.className=cls; b.textContent=text; b.title=title; b.addEventListener('click', fn); return b; }
function toggle(set, key) { set.has(key) ? set.delete(key) : set.add(key); navigate('history'); }
function group(entries) {
  const output = {};
  entries.forEach(entry => { const month=dateUtils.getMonthKey(entry.date), week=dateUtils.getWeekStart(entry.date); output[month] ||= {}; output[month][week] ||= []; output[month][week].push(entry); });
  return output;
}
function summary(stats) {
  const box=document.createElement('div'); box.className='history-summary';
  [[i().emojiFood,'Total Food',stats.intake,stats.weeklyFoodTarget],[i().emojiBurn,'Total Burn',stats.burn,stats.weeklyBurnTarget],[i().emojiDeficit,'Total Deficit',stats.net,`-${stats.weeklyDeficitTarget}`]].forEach(([icon,label,value,target]) => {
    const row=document.createElement('div'); row.innerHTML=`<span>${icon} ${label}</span><strong>${value} / ${target}</strong>`; box.appendChild(row);
  });
  const estimate=document.createElement('p'); estimate.className='weight-estimate'; estimate.textContent=calc.estimateWeightText(stats.net); box.appendChild(estimate); return box;
}
export function renderHistory() {
  const container=document.createElement('main'); container.className='screen history active page';
  const header=document.createElement('section'); header.className='card section-header';
  header.append(button(`${i().emojiPrevious} Back`, 'btn-outline', () => navigate('main')));
  const title=document.createElement('div'); title.innerHTML=`<h1>${i().emojiHistory} History</h1><p class="subtle-label">Food, burn and weight over time</p>`; header.appendChild(title); container.appendChild(header);
  const grouped=group(state.entriesFull);
  if (!defaultsApplied) { const selected=dateUtils.toIso(state.selectedDate); openMonths.add(dateUtils.getMonthKey(selected)); openWeeks.add(dateUtils.getWeekStart(selected)); defaultsApplied=true; }
  const stack=document.createElement('section'); stack.className='history-stack';
  if (!Object.keys(grouped).length) stack.innerHTML='<section class="card"><p class="empty-state">No food or burn history yet.</p></section>';
  Object.keys(grouped).sort().reverse().forEach(month => {
    const card=document.createElement('section'); card.className='card history-month';
    const mh=button('', 'history-toggle month-toggle', () => toggle(openMonths, month)); mh.innerHTML=`<strong>${dateUtils.formatMonthHeading(month)}</strong><span>${openMonths.has(month) ? '−' : '+'}</span>`; card.appendChild(mh);
    if (openMonths.has(month)) Object.keys(grouped[month]).sort().reverse().forEach(week => {
      const entries=grouped[month][week], stats=calc.calculateWeek(entries, i());
      const wrap=document.createElement('div'); wrap.className='week-block';
      const wh=button('', 'history-toggle week-toggle', () => toggle(openWeeks, week)); wh.innerHTML=`<span>Week ${dateUtils.formatDisplay(week)} – ${dateUtils.formatDisplay(dateUtils.getWeekEnd(week))}</span><strong>${openWeeks.has(week) ? '−' : '+'}</strong>`; wrap.appendChild(wh);
      if (openWeeks.has(week)) {
        wrap.appendChild(summary(stats));
        const days={}; entries.forEach(entry => { (days[entry.date] ||= []).push(entry); });
        Object.keys(days).sort().reverse().forEach(day => {
          const key=`${week}:${day}`, totals=calc.calculateDay(days[day], i());
          const dh=button('', 'history-day-row', () => toggle(openDays, key));
          dh.innerHTML=`<span class="day-label">${dateUtils.formatHistoryLabel(day)}</span><span>${i().emojiFood} Food <strong>${totals.intake}</strong></span><span>${i().emojiBurn} Burn <strong>${totals.burn}</strong></span><span>${i().emojiDeficit} Deficit <strong>${totals.net}</strong></span><b>${openDays.has(key) ? '−' : '+'}</b>`; wrap.appendChild(dh);
          if (openDays.has(key)) {
            const list=document.createElement('div'); list.className='history-entries';
            days[day].forEach(entry => { const row=document.createElement('div'); row.className='history-entry'; const icon=Number(entry.calories)<0?i().emojiBurn:i().emojiFood; const actions=document.createElement('div'); actions.className='entry-actions'; actions.append(button(i().emojiEdit,'icon-button',()=>showEntryDialog(Number(entry.calories)<0?'burn':'food',entry),'Edit'),button(i().emojiDelete,'icon-button danger',()=>api.deleteEntry(entry.id),'Delete')); row.innerHTML=`<span>${icon} ${entry.name || 'Unnamed entry (imported)'}</span><strong>${Number(entry.calories)>0?'+':''}${entry.calories}</strong>`; row.appendChild(actions); list.appendChild(row); });
            wrap.appendChild(list);
          }
        });
      }
      card.appendChild(wrap);
    });
    stack.appendChild(card);
  });
  container.appendChild(stack);
  const weights=document.createElement('section'); weights.className='card weight-history'; weights.innerHTML=`<div class="card-heading"><div><h2>${i().emojiWeight} Weight History</h2><p>Recorded weights and BMI</p></div></div>`;
  if (!state.weights.length) weights.innerHTML += '<p class="empty-state">No weights recorded.</p>';
  state.weights.forEach(weight => { const row=document.createElement('div'); row.className='weight-row'; row.innerHTML=`<span>${dateUtils.formatDisplay(weight.date)}</span><strong>${weight.value} kg</strong><span>${calc.calculateBMI(weight.value).toFixed(1)} BMI</span>`; const actions=document.createElement('div'); actions.className='entry-actions'; actions.append(button(i().emojiEdit,'icon-button',()=>showWeightDialog(weight),'Edit'),button(i().emojiDelete,'icon-button danger',()=>api.deleteWeight(weight.id),'Delete')); row.appendChild(actions); weights.appendChild(row); });
  container.appendChild(weights); return container;
}
