/**
 * Renderer — dashboard UI + Cognitive Load model.
 * System telemetry arrives from the main process via window.cognitive.
 * Local telemetry (keystrokes in the scratch pad) is captured here.
 */

declare const cognitive: {
  onTelemetry: (cb: (data: any) => void) => void;
  sendCLI: (cli: number, redline: boolean) => void;
  notify: (title: string, body: string) => void;
};

type Checkin = 'green' | 'yellow' | 'red' | 'none';

interface LoadModel {
  complexity: number; workHours: number; sleep: number;
  deadline: number; stress: number; assignments: number;
}

const $ = (id: string) => document.getElementById(id)!;

const state = {
  userName: 'Atharv',
  model: { complexity: 5, workHours: 3, sleep: 7, deadline: 4, stress: 4, assignments: 3 } as LoadModel,
  contextSwitches: 0,
  keystrokes: 0,
  deletes: 0,
  idleEvents: 0,
  sessionStart: Date.now(),
  cli: 0,
  redline: false,
  history: [] as number[],
  checkin: 'none' as Checkin,
  lastIdleFlag: false,
};

/* ---------- persistence ---------- */
function save(): void {
  localStorage.setItem('cr_model', JSON.stringify(state.model));
  localStorage.setItem('cr_checkin', state.checkin);
  localStorage.setItem('cr_contact', JSON.stringify({
    name: (($('contactName') as HTMLInputElement).value),
    rel: (($('contactRel') as HTMLSelectElement).value),
  }));
}
function load(): void {
  const m = localStorage.getItem('cr_model');
  if (m) state.model = JSON.parse(m);
  const c = localStorage.getItem('cr_checkin') as Checkin | null;
  if (c) state.checkin = c;
  const ct = localStorage.getItem('cr_contact');
  if (ct) {
    const o = JSON.parse(ct);
    ($('contactName') as HTMLInputElement).value = o.name || '';
    ($('contactRel') as HTMLSelectElement).value = o.rel || 'Friend';
  }
}

/* ---------- console ---------- */
let evtCount = 0;
function ts(): string {
  const d = new Date();
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}
function log(obj: object, kind: 'info' | 'ok' | 'warn' | 'err' | 'sys' = 'info'): void {
  const c = $('console');
  evtCount++; $('evtCount').textContent = String(evtCount);
  const colors: Record<string, string> = { info: '#7dd3fc', ok: '#34d399', warn: '#fbbf24', err: '#f87171', sys: '#a78bfa' };
  const line = document.createElement('div');
  line.innerHTML = `<span style="color:#475569">[${ts()}]</span> <span style="color:${colors[kind]}">›</span> <span style="color:${colors[kind]}">${JSON.stringify(obj)}</span>`;
  c.appendChild(line);
  while (c.children.length > 160) c.removeChild(c.firstChild!);
  c.scrollTop = c.scrollHeight;
}

/* ---------- CLI model ---------- */
function rawCLI(m: LoadModel): number {
  return (m.complexity * m.workHours * m.assignments * m.deadline * m.stress) / Math.max(m.sleep, 1);
}
function normalize(raw: number): number {
  return Math.min(100, Math.round(Math.sqrt(raw) * 1.9));
}
function behavioralBoost(): number {
  let b = 0;
  b += Math.min(15, state.contextSwitches * 2);
  const dr = state.keystrokes ? state.deletes / state.keystrokes : 0;
  b += Math.min(15, dr * 40);
  b += Math.min(12, state.idleEvents * 2);
  return Math.round(b);
}
function deleteRatioPct(): number {
  return state.keystrokes ? Math.round((state.deletes / state.keystrokes) * 100) : 0;
}
function sessionMinutes(): number {
  return Math.floor((Date.now() - state.sessionStart) / 60000);
}

function recalc(): void {
  const cli = Math.min(100, normalize(rawCLI(state.model)) + behavioralBoost());
  state.cli = cli;
  render(cli);
  pushHistory(cli);
  evaluateFaults();
  cognitive.sendCLI(cli, state.redline);
  if (cli > 75 && !state.redline) enterRedline();
  if (cli <= 70 && state.redline) exitRedline();
}

/* ---------- gauge (canvas) ---------- */
function colorFor(v: number): string { return v <= 40 ? '#22c55e' : v <= 70 ? '#f59e0b' : '#ef4444'; }
function drawGauge(v: number): void {
  const cv = $('gauge') as HTMLCanvasElement;
  const ctx = cv.getContext('2d')!;
  const cx = 80, cy = 80, r = 64;
  const start = 0.75 * Math.PI, end = 2.25 * Math.PI;
  ctx.clearRect(0, 0, 160, 160);
  ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.stroke();
  const frac = v / 100;
  ctx.beginPath(); ctx.arc(cx, cy, r, start, start + (end - start) * frac);
  ctx.strokeStyle = colorFor(v);
  ctx.shadowColor = colorFor(v); ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
}

function render(v: number): void {
  drawGauge(v);
  const num = $('cliNum'); num.textContent = String(v); (num as HTMLElement).style.color = colorFor(v);
  let label: string, head: string, sub: string, cls: string;
  if (v <= 40) { label = 'OPTIMAL'; head = 'State: Healthy'; sub = 'Operating within safe parameters. Keep the rhythm.'; cls = 'green'; }
  else if (v <= 70) { label = 'ELEVATED'; head = 'State: Strained'; sub = 'Load is climbing. Consider a short break.'; cls = 'yellow'; }
  else { label = 'REDLINE'; head = 'State: Overload'; sub = 'Critical saturation. Intervention protocols engaging.'; cls = 'red'; }
  const badge = $('statusBadge');
  badge.textContent = label;
  (badge as HTMLElement).style.color = colorFor(v);
  (badge as HTMLElement).style.borderColor = colorFor(v) + '66';
  (badge as HTMLElement).style.background = colorFor(v) + '1f';
  $('headline').textContent = head; ($('headline') as HTMLElement).style.color = colorFor(v);
  $('sub').textContent = sub;
  $('mSwitch').textContent = String(state.contextSwitches);
  $('mDelete').textContent = deleteRatioPct() + '%';
  $('mSession').textContent = String(sessionMinutes());
  $('mIdle').textContent = String(state.idleEvents);
}

/* ---------- history sparkline (re-uses gauge? no, simple) ---------- */
function pushHistory(v: number): void {
  if (state.history.length && Date.now() % 1 === 0) { /* noop keep simple */ }
  state.history.push(v);
  if (state.history.length > 40) state.history.shift();
}

/* ---------- fault codes ---------- */
const FAULTS: Record<string, { test: () => boolean; msg: string }> = {
  ERR_COGNITIVE_SATURATION: { test: () => state.cli > 75, msg: 'Total load exceeds safe threshold.' },
  ERR_CONTEXT_THRASHING: { test: () => state.contextSwitches >= 6, msg: 'Excessive app/context switching.' },
  ERR_SLEEP_DEPRIVATION: { test: () => state.model.sleep <= 4, msg: 'Recovery input critically low (<5h).' },
  ERR_ATTENTION_FRAGMENTATION: { test: () => state.idleEvents >= 2, msg: 'Fragmented attention detected.' },
  ERR_EDIT_INSTABILITY: { test: () => state.keystrokes > 20 && state.deletes / state.keystrokes > 0.3, msg: 'High deletion ratio.' },
};
const activeFaults = new Set<string>();
function evaluateFaults(): void {
  const panel = $('faults');
  const current: string[] = [];
  for (const [code, f] of Object.entries(FAULTS)) {
    if (f.test()) {
      current.push(code);
      if (!activeFaults.has(code)) { activeFaults.add(code); log({ FAULT_CODE: code, status: 'RAISED', detail: f.msg }, 'err'); }
    } else if (activeFaults.has(code)) {
      activeFaults.delete(code); log({ FAULT_CODE: code, status: 'CLEARED' }, 'ok');
    }
  }
  panel.innerHTML = current.map(code =>
    `<div class="fault"><span style="color:#f87171;">⚠</span><span class="mono tiny" style="color:#fca5a5;font-weight:700;">FAULT · ${code}</span></div>`
  ).join('');
}

/* ---------- redline + decompression ---------- */
let decompTimer: number | undefined;
function enterRedline(): void {
  state.redline = true;
  document.body.classList.add('redline');
  log({ event: 'COGNITIVE_REDLINE', status: 'TRIGGERED', cli: state.cli }, 'err');
  cognitive.sendCLI(state.cli, true);
  cognitive.notify('⚠ Cognitive Redline', 'Load exceeds safe threshold. Recovery required.');
  showDecomp();
  triggerIntervention();
}
function exitRedline(): void {
  state.redline = false;
  document.body.classList.remove('redline');
  log({ event: 'COGNITIVE_REDLINE', status: 'RESOLVED', cli: state.cli }, 'ok');
}
function showDecomp(): void {
  const ov = $('decomp'); ov.classList.add('on');
  let n = 30; $('decompCount').textContent = String(n);
  const btn = $('decompBtn') as HTMLButtonElement;
  btn.disabled = true; btn.style.opacity = '.4'; btn.textContent = 'Resume (locked)';
  const phases = ['Breathe in…', 'Hold…', 'Breathe out…', 'Hold…']; let bi = 0;
  $('breathText').textContent = phases[0];
  const breath = window.setInterval(() => { $('breathText').textContent = phases[++bi % 4]; }, 4000);
  window.clearInterval(decompTimer);
  decompTimer = window.setInterval(() => {
    n--; $('decompCount').textContent = String(n);
    if (n <= 0) {
      window.clearInterval(decompTimer); window.clearInterval(breath);
      btn.disabled = false; btn.style.opacity = '1'; btn.textContent = "Resume — I'm ready ✓";
      log({ event: 'decompression', status: 'complete', duration: 30 }, 'ok');
    }
  }, 1000);
}

/* ---------- intervention ---------- */
function triggerIntervention(): void {
  const name = ($('contactName') as HTMLInputElement).value.trim();
  if (!name) return;
  $('interventionMsg').textContent = `${state.userName} may need support today. Consider checking in.`;
  window.setTimeout(() => {
    ($('intervention') as HTMLElement).style.display = 'block';
    log({ event: 'intervention', to: name, payload: 'STATUS_RED_ONLY', private_data: 'NONE' }, 'sys');
  }, 1000);
}

/* ---------- check-in ---------- */
function setCheckin(c: Checkin): void {
  state.checkin = c; save();
  document.querySelectorAll('.checkin').forEach(b => {
    (b as HTMLElement).style.borderColor = ''; (b as HTMLElement).style.boxShadow = ''; (b as HTMLElement).style.background = '';
  });
  const col = c === 'green' ? '#22c55e' : c === 'yellow' ? '#f59e0b' : '#ef4444';
  const el = $('ci-' + c) as HTMLElement;
  el.style.borderColor = col; el.style.boxShadow = `0 0 12px ${col}88`; el.style.background = col + '22';
  $('ciLabel').textContent = c === 'green' ? 'Good 🟢' : c === 'yellow' ? 'Struggling 🟡' : 'Overwhelmed 🔴';
  log({ event: 'daily_checkin', status: c.toUpperCase(), data_shared: 'color_only' }, c === 'red' ? 'err' : c === 'yellow' ? 'warn' : 'ok');
  if (c === 'red') triggerIntervention();
}

/* ---------- sliders ---------- */
const SLIDERS: { id: keyof LoadModel; label: string; min: number; max: number }[] = [
  { id: 'complexity', label: 'Task Complexity', min: 1, max: 10 },
  { id: 'workHours', label: 'Consecutive Work Hours', min: 1, max: 12 },
  { id: 'sleep', label: 'Hours of Sleep', min: 1, max: 12 },
  { id: 'deadline', label: 'Deadline Urgency', min: 1, max: 10 },
  { id: 'stress', label: 'Stress Multiplier', min: 1, max: 10 },
];
function buildSliders(): void {
  const host = $('sliders'); host.innerHTML = '';
  for (const s of SLIDERS) {
    const wrap = document.createElement('div'); wrap.className = 'slider';
    wrap.innerHTML = `<label>${s.label} <span class="mono" style="color:var(--accent);" id="v-${s.id}">${state.model[s.id]}</span></label>
      <input type="range" min="${s.min}" max="${s.max}" value="${state.model[s.id]}" id="s-${s.id}" />`;
    host.appendChild(wrap);
    const input = wrap.querySelector('input')! as HTMLInputElement;
    input.addEventListener('input', () => {
      state.model[s.id] = Number(input.value);
      $('v-' + s.id).textContent = input.value;
      save(); log({ event: 'model_input', param: s.id, value: Number(input.value) }, 'info'); recalc();
    });
  }
}

/* ---------- simulate / reset ---------- */
function simulateBurnout(): void {
  log({ event: 'DEMO', action: 'SIMULATE_BURNOUT_EVENT', note: 'injecting synthetic overload' }, 'sys');
  state.model = { complexity: 9, workHours: 11, sleep: 3, deadline: 9, stress: 9, assignments: 7 };
  ($('assignNum') as HTMLInputElement).value = '7'; $('assignVal').textContent = '7';
  buildSliders(); save();
  state.contextSwitches += 7; state.keystrokes += 120; state.deletes += 52; state.idleEvents += 3;
  const burst: [object, 'warn' | 'err'][] = [
    [{ type: 'context_switch', from: 'Notes', to: 'Discord', rapid: true }, 'warn'],
    [{ type: 'delete_spike', ratio: 0.43, severity: 'high' }, 'err'],
    [{ type: 'idle_period', idleSec: 18.5, note: 'attention gap' }, 'warn'],
    [{ type: 'session_intensity', consecutiveHrs: 11, breaks: 0, status: 'critical' }, 'err'],
  ];
  burst.forEach((b, i) => window.setTimeout(() => log(b[0], b[1]), i * 220));
  window.setTimeout(() => setCheckin('red'), 1300);
  window.setTimeout(recalc, 1200);
}
function reset(): void {
  state.model = { complexity: 4, workHours: 2, sleep: 8, deadline: 3, stress: 3, assignments: 2 };
  state.contextSwitches = 0; state.keystrokes = 0; state.deletes = 0; state.idleEvents = 0;
  ($('assignNum') as HTMLInputElement).value = '2'; $('assignVal').textContent = '2';
  buildSliders(); save();
  ($('decomp') as HTMLElement).classList.remove('on');
  ($('intervention') as HTMLElement).style.display = 'none';
  window.clearInterval(decompTimer);
  exitRedline(); recalc();
  log({ event: 'system_reset', status: 'baseline restored' }, 'ok');
}

/* ---------- system telemetry from main process ---------- */
let idleCounted = false;
cognitive.onTelemetry((d: any) => {
  if (d.type === 'context_switch') {
    state.contextSwitches++;
    log({ type: 'context_switch', from: d.from, to: d.to, event: 'focus_change' }, 'warn');
    recalc();
  } else if (d.type === 'idle_sample') {
    if (d.idleSec > 12 && !idleCounted) {
      state.idleEvents++; idleCounted = true;
      log({ type: 'micro_stutter', event: 'idle_period', idleSec: Number(d.idleSec.toFixed(1)) }, 'warn');
      recalc();
    } else if (d.idleSec < 4) {
      idleCounted = false;
    }
  }
});

/* ---------- wire up DOM ---------- */
function init(): void {
  load();
  buildSliders();
  ($('assignNum') as HTMLInputElement).value = String(state.model.assignments);
  $('assignVal').textContent = String(state.model.assignments);

  $('simBtn').addEventListener('click', simulateBurnout);
  $('resetBtn').addEventListener('click', reset);
  $('decompBtn').addEventListener('click', () => {
    if (!($('decompBtn') as HTMLButtonElement).disabled) ($('decomp') as HTMLElement).classList.remove('on');
  });
  $('closeIntervention').addEventListener('click', () => { ($('intervention') as HTMLElement).style.display = 'none'; });

  ($('assignNum') as HTMLInputElement).addEventListener('input', () => {
    state.model.assignments = Number(($('assignNum') as HTMLInputElement).value) || 0;
    $('assignVal').textContent = String(state.model.assignments);
    save(); recalc();
  });

  document.querySelectorAll('.checkin').forEach(b => {
    b.addEventListener('click', () => setCheckin((b as HTMLElement).dataset.c as Checkin));
  });
  $('contactName').addEventListener('change', save);
  $('contactRel').addEventListener('change', save);

  // local keystroke telemetry (scratch pad)
  ($('note') as HTMLTextAreaElement).addEventListener('keydown', (e: KeyboardEvent) => {
    state.keystrokes++;
    if (e.key === 'Backspace' || e.key === 'Delete') state.deletes++;
    render(state.cli);
  });

  if (state.checkin !== 'none') setCheckin(state.checkin);

  log({ event: 'session_start', engine: 'native telemetry online', mode: 'system + local' }, 'sys');
  log({ event: 'privacy', note: 'all processing local — no network, no accounts' }, 'ok');
  $('permNote').style.display = 'block';
  recalc();

  window.setInterval(recalc, 6000);
}

init();
