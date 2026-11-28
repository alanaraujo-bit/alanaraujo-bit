// Generates the Matrix-style animated SVGs for the profile README.
// usage: node gen.mjs <avatar.jpg> <outDir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert';

const [avatarPath, outDir] = process.argv.slice(2);
assert(avatarPath && outDir, 'usage: node gen.mjs <avatar.jpg> <outDir>');
mkdirSync(outDir, { recursive: true });

// Seeded RNG so regenerating gives the same file (clean git diffs).
let seed = 1337;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (s) => s[Math.floor(rnd() * s.length)];
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFZ:.=*+<>';
const esc = (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c);

function rain(width, height, { step = 18, len = 22, fs = 15 } = {}) {
  const cols = Math.floor(width / step);
  let out = '';
  for (let i = 0; i < cols; i++) {
    const dur = (5 + rnd() * 9).toFixed(2);
    const delay = (-rnd() * 14).toFixed(2);
    const x = i * step + step / 2;
    let spans = '';
    for (let j = 0; j < len; j++) {
      const head = j === len - 1;
      const op = head ? 1 : ((j + 1) / len) * 0.85;
      spans += `<tspan x="${x}" dy="${fs + 3}"${head ? ' class="h"' : ''} fill-opacity="${op.toFixed(2)}">${esc(pick(GLYPHS))}</tspan>`;
    }
    out += `<text class="c" style="animation-duration:${dur}s;animation-delay:${delay}s">${spans}</text>`;
  }
  const travel = len * (fs + 3);
  const css = `.c{font:${fs}px 'MS Gothic','Osaka',monospace;fill:#00ff41;animation:fall linear infinite}
.h{fill:#e6ffe6}
@keyframes fall{from{transform:translateY(-${travel}px)}to{transform:translateY(${height + 20}px)}}`;
  return { svg: out, css };
}

const REDUCED = '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';

// ---------- HERO ----------
{
  const W = 1000, H = 340;
  const r = rain(W, H);
  const img = `data:image/jpeg;base64,${readFileSync(avatarPath).toString('base64')}`;
  const AX = 70, AY = 50, AS = 240; // avatar box
  // Horizontal slices that jump sideways for a split second (glitch).
  const slices = [[30, 18, 2.1], [95, 10, 3.3], [150, 26, 4.7], [205, 12, 2.9]]
    .map(([y, h, d], k) => `<clipPath id="s${k}"><rect x="${AX}" y="${AY + y}" width="${AS}" height="${h}"/></clipPath>
<g clip-path="url(#s${k})"><image href="${img}" x="${AX}" y="${AY}" width="${AS}" height="${AS}" filter="url(#green)" class="g" style="animation-duration:${d}s"/></g>`).join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Alan Araújo, desenvolvedor full stack">
<style>
${r.css}
.name{font:bold 58px 'Courier New',Consolas,monospace;fill:#00ff41;letter-spacing:4px;animation:flick 6s infinite}
.sub{font:20px 'Courier New',Consolas,monospace;fill:#b8ffc8}
.tag{font:13px 'Courier New',Consolas,monospace;fill:#00ff41;opacity:.75}
.type{animation:type 3.2s steps(28) 1s both}
.cur{animation:blink 1s step-end infinite}
.g{animation:jump 3s steps(1) infinite}
.scan{animation:scan 4s linear infinite}
@keyframes flick{0%,91%,95%,100%{opacity:1;transform:none}92%{opacity:.4;transform:translateX(3px) skewX(-8deg)}94%{opacity:.8;transform:translateX(-4px)}}
@keyframes type{from{width:0}to{width:400px}}
@keyframes blink{50%{opacity:0}}
@keyframes jump{0%,86%,100%{transform:none}88%{transform:translateX(14px)}92%{transform:translateX(-9px)}}
@keyframes scan{from{transform:translateY(0)}to{transform:translateY(${AS}px)}}
${REDUCED}
</style>
<defs>
<filter id="green"><feColorMatrix type="matrix" values="0.15 0.35 0.08 0 0  0.45 1.35 0.20 0 0.05  0.12 0.35 0.06 0 0  0 0 0 1 0"/></filter>
<filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="vig" cx="55%" cy="50%" r="70%"><stop offset="0" stop-color="#000" stop-opacity=".88"/><stop offset=".6" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></radialGradient>
<pattern id="lines" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" opacity=".22"/></pattern>
<clipPath id="typeclip"><rect class="type" x="380" y="180" height="34" width="400"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="#000"/>
<g opacity=".55">${r.svg}</g>
<rect width="${W}" height="${H}" fill="url(#vig)"/>

<!-- avatar -->
<rect x="${AX - 6}" y="${AY - 6}" width="${AS + 12}" height="${AS + 12}" fill="none" stroke="#00ff41" stroke-width="1.5" opacity=".7"/>
<image href="${img}" x="${AX}" y="${AY}" width="${AS}" height="${AS}" filter="url(#green)"/>
${slices}
<rect x="${AX}" y="${AY}" width="${AS}" height="${AS}" fill="url(#lines)"/>
<rect class="scan" x="${AX}" y="${AY}" width="${AS}" height="3" fill="#00ff41" opacity=".35"/>
<path d="M${AX - 6} ${AY + 14}V${AY - 6}H${AX + 14}M${AX + AS - 8} ${AY - 6}H${AX + AS + 6}V${AY + 14}M${AX + AS + 6} ${AY + AS - 8}V${AY + AS + 6}H${AX + AS - 14}M${AX + 14} ${AY + AS + 6}H${AX - 6}V${AY + AS - 14}" stroke="#00ff41" stroke-width="3" fill="none"/>
<text class="tag" x="${AX}" y="${AY + AS + 30}">ID: ALAN_ARAUJO // NÍVEL: ESCOLHIDO</text>

<!-- identity -->
<text class="tag" x="380" y="95">&gt; conexão estabelecida... acesso concedido</text>
<text class="name" x="376" y="160" filter="url(#glow)">ALAN ARAÚJO</text>
<g clip-path="url(#typeclip)"><text class="sub" x="380" y="204">&gt; Desenvolvedor Full Stack</text></g>
<rect class="cur" x="696" y="188" width="11" height="20" fill="#00ff41"/>
<text class="tag" x="380" y="250">[ LOCAL: BRASIL ]  [ ADS @ PUC MINAS ]  [ STATUS: ONLINE ]</text>
<text class="tag" x="380" y="275">[ JAVASCRIPT ]  [ PYTHON ]  [ MYSQL ]</text>
</svg>`;
  writeFileSync(join(outDir, 'matrix-hero.svg'), svg);
}

// ---------- FOOTER ----------
{
  const W = 1000, H = 130;
  const r = rain(W, H, { len: 10, fs: 13, step: 16 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Fim da transmissão">
<style>
${r.css}
.t{font:16px 'Courier New',Consolas,monospace;fill:#00ff41;letter-spacing:2px}
.cur{animation:blink 1s step-end infinite}
@keyframes blink{50%{opacity:0}}
${REDUCED}
</style>
<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".85"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="#000"/>
<g opacity=".45">${r.svg}</g>
<rect y="35" width="${W}" height="60" fill="url(#fade)"/>
<text class="t" x="500" y="71" text-anchor="middle">// FIM DA TRANSMISSÃO. A MATRIX AINDA TEM VOCÊ.</text>
<rect class="cur" x="786" y="58" width="9" height="16" fill="#00ff41"/>
</svg>`;
  writeFileSync(join(outDir, 'matrix-footer.svg'), svg);
}
console.log('ok');
