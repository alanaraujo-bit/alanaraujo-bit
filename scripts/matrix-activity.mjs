// Builds a Matrix-style activity panel (heatmap of glyphs + real stats) as an animated SVG.
// usage:
//   GH_TOKEN=... USERS=alanaraujo-bit node scripts/matrix-activity.mjs dist/matrix-activity.svg
//   node scripts/matrix-activity.mjs --demo out.svg   (fake data, no network; also runs self-checks)
// USERS accepts several accounts separated by commas; their calendars are summed day by day.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import assert from 'node:assert/strict';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾙﾚﾛﾜﾝ01234567890Z';
const COLORS = ['#123d1d', '#0b6b24', '#109a35', '#1fd14b', '#00ff41'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// ---------- data ----------
async function gql(token, query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'matrix-activity' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GitHub API: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const QUERY = `query($login:String!){user(login:$login){
  contributionsCollection{
    totalCommitContributions totalPullRequestContributions totalIssueContributions restrictedContributionsCount
    contributionCalendar{weeks{contributionDays{date contributionCount}}}
  }
  repositories(first:100, ownerAffiliations:OWNER, isFork:false){nodes{languages(first:10){edges{size node{name}}}}}
}}`;

async function fetchUser(token, login) {
  const { user } = await gql(token, QUERY, { login });
  if (!user) throw new Error(`usuário não encontrado: ${login}`);
  const c = user.contributionsCollection;
  const days = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays).map((d) => ({ date: d.date, count: d.contributionCount }));
  const langs = {};
  for (const r of user.repositories.nodes) for (const e of r.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
  return {
    days, langs,
    commits: c.totalCommitContributions + c.restrictedContributionsCount,
    prs: c.totalPullRequestContributions, issues: c.totalIssueContributions,
  };
}

// Sums several accounts into one dataset (calendars keyed by date).
function merge(list) {
  const byDate = new Map(), langs = {};
  let commits = 0, prs = 0, issues = 0;
  for (const u of list) {
    for (const d of u.days) byDate.set(d.date, (byDate.get(d.date) || 0) + d.count);
    for (const [k, v] of Object.entries(u.langs)) langs[k] = (langs[k] || 0) + v;
    commits += u.commits; prs += u.prs; issues += u.issues;
  }
  const days = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
  return { days, langs, commits, prs, issues };
}

// ---------- stats ----------
export function stats(days) {
  const total = days.reduce((s, d) => s + d.count, 0);
  let longest = { len: 0, from: null, to: null }, run = 0, runFrom = null;
  for (const d of days) {
    if (d.count > 0) {
      if (run === 0) runFrom = d.date;
      run++;
      if (run > longest.len) longest = { len: run, from: runFrom, to: d.date };
    } else run = 0;
  }
  // Current streak: today may still be empty, so it starts counting from yesterday in that case.
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  let cur = 0, curFrom = null;
  for (; i >= 0 && days[i].count > 0; i--) { cur++; curFrom = days[i].date; }
  const best = days.reduce((b, d) => (d.count > b.count ? d : b), { count: 0, date: null });
  const perWeekday = Array(7).fill(0);
  for (const d of days) perWeekday[new Date(`${d.date}T12:00:00Z`).getUTCDay()] += d.count;
  const topWeekday = perWeekday.indexOf(Math.max(...perWeekday));
  return { total, longest, current: { len: cur, from: curFrom }, best, topWeekday };
}

// Level 0..4 by quartiles of the non-zero days, like GitHub's own graph.
export function levels(days) {
  const nz = days.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
  const q = (p) => nz[Math.max(0, Math.ceil(p * nz.length) - 1)] ?? 0;
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return days.map((d) => (d.count === 0 ? 0 : d.count <= q1 ? 1 : d.count <= q2 ? 2 : d.count <= q3 ? 3 : 4));
}

// ---------- render ----------
function render(data, users) {
  const W = 1000, X0 = 70, PITCH = 16.6, Y0 = 92;
  const s = stats(data.days);
  const lv = levels(data.days);
  let seed = data.days.length * 7919;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

  // Place days on a week grid (columns start on Sunday).
  const firstDow = new Date(`${data.days[0].date}T12:00:00Z`).getUTCDay();
  let cells = '', months = '', lastMonth = -1, lastLabelX = -Infinity;
  data.days.forEach((d, i) => {
    const idx = i + firstDow, col = Math.floor(idx / 7), row = idx % 7;
    const x = X0 + col * PITCH, y = Y0 + row * PITCH;
    const m = Number(d.date.slice(5, 7)) - 1;
    if (m !== lastMonth) {
      lastMonth = m;
      if (x - lastLabelX >= 3 * PITCH) { months += `<text class="lbl" x="${x}" y="${Y0 - 14}">${MESES[m]}</text>`; lastLabelX = x; }
    }
    const ch = lv[i] === 0 ? '·' : GLYPHS[Math.floor(rnd() * GLYPHS.length)];
    const today = i === data.days.length - 1 ? ' today' : '';
    cells += `<text class="cell l${lv[i]}${today}" x="${x}" y="${y}" style="animation-delay:${(col * 0.035).toFixed(2)}s"><title>${ddmm(d.date)}: ${d.count} contribuições</title>${esc(ch)}</text>`;
  });
  const gridW = Math.ceil((data.days.length + firstDow) / 7) * PITCH;

  const box = (i, label, big, sub) => {
    const bw = 200, gap = (W - 2 * 50 - 4 * bw) / 3, x = 50 + i * (bw + gap), y = 228;
    return `<g><rect x="${x}" y="${y}" width="${bw}" height="92" rx="4" class="box"/>
<text class="lbl" x="${x + 14}" y="${y + 22}">${esc(label)}</text>
<text class="big" x="${x + 14}" y="${y + 60}" filter="url(#glow)">${esc(big)}</text>
<text class="sub" x="${x + 14}" y="${y + 80}">${esc(sub)}</text></g>`;
  };
  const dias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
  const boxes = [
    box(0, 'CONTRIBUIÇÕES', s.total.toLocaleString('pt-BR'), `${data.commits.toLocaleString('pt-BR')} commits · ${data.prs} PRs`),
    box(1, 'SEQUÊNCIA ATUAL', dias(s.current.len), s.current.len ? `desde ${ddmm(s.current.from)}` : 'bora quebrar o zero'),
    box(2, 'MAIOR SEQUÊNCIA', dias(s.longest.len), s.longest.len ? `${ddmm(s.longest.from)} até ${ddmm(s.longest.to)}` : 'ainda por vir'),
    box(3, 'DIA MAIS ATIVO', DIAS[s.topWeekday], s.best.date ? `recorde: ${s.best.count} em ${ddmm(s.best.date)}` : 'sem registros'),
  ].join('\n');

  // Top 5 languages as terminal-style bars.
  const langTotal = Object.values(data.langs).reduce((a, b) => a + b, 0);
  const top = Object.entries(data.langs).sort((a, b) => b[1] - a[1]).slice(0, 5);
  let langs = `<text class="lbl" x="50" y="352">LINGUAGENS &gt;</text>`;
  top.forEach(([name, size], i) => {
    const pct = (size / langTotal) * 100, x = 160 + i * 168;
    const filled = Math.max(1, Math.round(pct / 10));
    langs += `<text class="sub" x="${x}" y="352">${esc(name)} ${pct.toFixed(0)}%</text>
<text class="bar" x="${x}" y="368">${'█'.repeat(filled)}<tspan class="off">${'░'.repeat(10 - filled)}</tspan></text>`;
  });

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const H = 400;
  const header = `> rastreando ${users.join(' + ')} ... ${s.total.toLocaleString('pt-BR')} sinais nos últimos 12 meses`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Painel de atividade no GitHub: ${s.total} contribuições nos últimos 12 meses, sequência atual de ${s.current.len} dias">
<style>
text{font-family:'Courier New',Consolas,monospace}
.hd{font-size:15px;fill:#00ff41}
.lbl{font-size:11px;fill:#4d8f5c;letter-spacing:1px}
.sub{font-size:12px;fill:#b8ffc8}
.big{font-size:30px;font-weight:bold;fill:#00ff41}
.bar{font-size:12px;fill:#00ff41}.off{fill:#123d1d}
.box{fill:#020a04;stroke:#0f5a22}
.cell{font-family:'MS Gothic','Osaka',monospace;font-size:13px;text-anchor:middle;opacity:0;animation:in .5s ease-out forwards}
${COLORS.map((c, i) => `.l${i}{fill:${c}}`).join('')}
.l4{filter:url(#glow)}
.today{animation:in .5s ease-out forwards,blink 1.2s step-end 2.5s infinite}
.scan{animation:scan 7s linear infinite}
.cur{animation:blink 1s step-end infinite}
@keyframes in{to{opacity:1}}
@keyframes blink{50%{opacity:.15}}
@keyframes scan{from{transform:translateX(0)}to{transform:translateX(${gridW + 40}px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.cell{opacity:1}}
</style>
<defs>
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="beam" x1="0" x2="1"><stop offset="0" stop-color="#00ff41" stop-opacity="0"/><stop offset="1" stop-color="#00ff41" stop-opacity=".22"/></linearGradient>
<clipPath id="grid"><rect x="${X0 - 12}" y="${Y0 - 14}" width="${gridW + 14}" height="${7 * PITCH + 4}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" rx="6" fill="#000"/>
<text class="hd" x="50" y="40">${esc(header)}</text>
<rect class="cur" x="${Math.min(940, 50 + (header.length + 1) * 9)}" y="28" width="9" height="15" fill="#00ff41"/>
${months}
<text class="lbl" x="50" y="${Y0 + PITCH + 4}" text-anchor="end">seg</text>
<text class="lbl" x="50" y="${Y0 + 3 * PITCH + 4}" text-anchor="end">qua</text>
<text class="lbl" x="50" y="${Y0 + 5 * PITCH + 4}" text-anchor="end">sex</text>
${cells}
<g clip-path="url(#grid)"><rect class="scan" x="${X0 - 52}" y="${Y0 - 14}" width="40" height="${7 * PITCH + 4}" fill="url(#beam)"/></g>
${boxes}
${langs}
<text class="lbl" x="950" y="390" text-anchor="end">atualizado em ${esc(now)} · passe o mouse nos símbolos para ver o dia</text>
</svg>`;
}

// ---------- main ----------
function demoData() {
  const days = [], start = new Date('2025-11-30T12:00:00Z');
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 364; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, count: rnd() < 0.35 ? 0 : Math.floor(rnd() * 25) });
  }
  return { days, langs: { JavaScript: 60, TypeScript: 25, Python: 10, CSS: 4, HTML: 1 }, commits: 900, prs: 12, issues: 6 };
}

function selfCheck() {
  const D = (counts) => counts.map((count, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, count }));
  let r = stats(D([1, 1, 0, 2, 2, 2, 0]));        // today empty -> streak counts from yesterday
  assert.equal(r.total, 8); assert.equal(r.longest.len, 3); assert.equal(r.current.len, 3);
  r = stats(D([1, 0, 0])); assert.equal(r.current.len, 0);
  r = stats(D([0, 5, 1])); assert.equal(r.current.len, 2); assert.equal(r.best.count, 5);
  assert.deepEqual(levels(D([0, 1, 2, 3, 4])), [0, 1, 2, 3, 4]);
  const m = merge([{ days: D([1, 2]), langs: { JS: 1 }, commits: 1, prs: 0, issues: 0 }, { days: D([3]), langs: { JS: 2 }, commits: 2, prs: 1, issues: 0 }]);
  assert.deepEqual(m.days.map((d) => d.count), [4, 2]); assert.equal(m.langs.JS, 3); assert.equal(m.commits, 3);
}

const args = process.argv.slice(2);
const demo = args[0] === '--demo';
const out = demo ? args[1] : args[0];
assert(out, 'informe o arquivo de saída');
let data, users;
if (demo) {
  selfCheck();
  data = demoData(); users = ['demo'];
} else {
  const token = process.env.GH_TOKEN;
  assert(token, 'defina GH_TOKEN');
  users = (process.env.USERS || '').split(',').map((u) => u.trim()).filter(Boolean);
  assert(users.length, 'defina USERS');
  for (const u of users) assert(/^[A-Za-z0-9-]{1,39}$/.test(u), `usuário inválido: ${u}`);
  data = merge(await Promise.all(users.map((u) => fetchUser(token, u))));
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, render(data, users));
console.log(`ok: ${out}`);
