const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const ICONS_DIR = path.join(__dirname, 'icons');
if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR);

const STATES = {
  green:  { fill: '#15803d', ring: '#22c55e', pupil: '#15803d' },
  yellow: { fill: '#ca8a04', ring: '#fde047', pupil: '#ca8a04' },
  red:    { fill: '#b91c1c', ring: '#ef4444', pupil: '#b91c1c' },
};

function drawIcon(size, state) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // Outer circle fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = state.fill;
  ctx.fill();

  // Inner ring stroke (~4% of size)
  const ringWidth = Math.max(2, size * 0.04);
  const ringR = r - ringWidth * 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = state.ring;
  ctx.lineWidth = ringWidth;
  ctx.stroke();

  // Eye: horizontal ellipse in white
  // Position eye slightly above center (leave room for text below)
  const eyeCY = cy - size * 0.06;
  const eyeRx = size * 0.22;
  const eyeRy = size * 0.13;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, eyeCY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // Pupil: filled circle in state color
  const pupilR = eyeRy * 0.65;
  ctx.beginPath();
  ctx.arc(cx, eyeCY, pupilR, 0, Math.PI * 2);
  ctx.fillStyle = state.pupil;
  ctx.fill();

  // Pupil shine
  const shineR = pupilR * 0.3;
  ctx.beginPath();
  ctx.arc(cx - pupilR * 0.3, eyeCY - pupilR * 0.3, shineR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();

  // "GLANCE" text below eye
  const fontSize = Math.max(8, Math.round(size * 0.10));
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('GLANCE', cx, eyeCY + eyeRy + size * 0.04);

  return canvas;
}

function drawBadge(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // White circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Black eye shape
  const eyeRx = size * 0.32;
  const eyeRy = size * 0.19;
  ctx.beginPath();
  ctx.ellipse(cx, cy, eyeRx, eyeRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();

  // Black pupil
  const pupilR = eyeRy * 0.65;
  ctx.beginPath();
  ctx.arc(cx, cy, pupilR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Shine on pupil
  const shineR = pupilR * 0.3;
  ctx.beginPath();
  ctx.arc(cx - pupilR * 0.3, cy - pupilR * 0.3, shineR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  return canvas;
}

function saveCanvas(canvas, filename) {
  const out = path.join(ICONS_DIR, filename);
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(out, buf);
  console.log(`  ✓ ${filename} (${buf.length} bytes)`);
}

console.log('Generating icons…');

for (const [name, state] of Object.entries(STATES)) {
  saveCanvas(drawIcon(192, state), `icon-${name}-192.png`);
  saveCanvas(drawIcon(512, state), `icon-${name}-512.png`);
}

saveCanvas(drawBadge(96), 'badge-96.png');

console.log('Done. All icons written to ./icons/');
