/* ============================================================
   volvo-ex30.js — Knight Rider Dashboard for Volvo EX30

   Data flow:
     1. fetchVehicleStatus() calls /.api/vehicle-status (Azure Function)
     2. On any error or non-OK response, falls back to MOCK_VEHICLE_DATA
     3. renderDashboard(data) builds all card HTML from the data shape
     4. Auto-refresh runs every 60 seconds

   To wire up a real Azure Function:
     - Deploy a Function App alongside this Static Web App
     - Point the Function at the Volvo Connected Vehicle API
     - The Function should return JSON matching the shape of MOCK_VEHICLE_DATA
     - Do NOT put Volvo API keys, OAuth secrets or refresh tokens here
   ============================================================ */

'use strict';


/* ── Mock Data ──────────────────────────────────────────────────
   Used as a fallback when the Azure Function is unavailable.
   The shape of this object defines the contract between the
   frontend and the /.api/vehicle-status Function endpoint.
   ─────────────────────────────────────────────────────────── */
const MOCK_VEHICLE_DATA = {
  vehicle: {
    name:       'My EX30',
    colour:     'Onyx Black',
    modelYear:  2024,
  },
  battery: {
    chargePercentage:     78,    // 0–100
    estimatedRangeKm:     312,
    isCharging:           false,
    isPluggedIn:          false,
    chargeRateKw:         null,  // e.g. 11 when charging
    minutesToFullCharge:  null,  // e.g. 45 when charging
  },
  climate: {
    cabinTemperatureCelsius:    19.5,
    isClimatisationActive:      false,
    targetTemperatureCelsius:   20,
  },
  security: {
    isLocked:     true,
    isAlarmArmed: true,
  },
  location: {
    address:   'Gothenburg, Sweden',
    latitude:  57.7089,
    longitude: 11.9746,
    isParked:  true,
  },
  odometer: {
    distanceKm: 12847,
  },
  lastSyncTime: new Date().toISOString(),  // ISO 8601 string
};


/* ── Azure Function Fetch ───────────────────────────────────────
   Calls the Azure Function proxy endpoint bundled with this
   Static Web App.  Returns { data, source } where source is
   'live' (API succeeded) or 'mock' (fallback).

   The Function at /.api/vehicle-status is responsible for:
     - Authenticating with the Volvo Connected Vehicle API
     - Refreshing OAuth tokens (never expose these here)
     - Returning JSON matching the MOCK_VEHICLE_DATA shape

   NOTE: A 404 on /.api/vehicle-status is expected when no Azure
   Function has been deployed yet.  The browser will log it; that
   is normal and the dashboard will fall back to mock data.
   ─────────────────────────────────────────────────────────── */
async function fetchVehicleStatus() {
  try {
    const response = await fetch('/.api/vehicle-status', {
      method:  'GET',
      headers: { 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(8000),   // 8-second timeout
    });

    if (!response.ok) {
      // 404 = Function not yet deployed; any other status = server error.
      // Both cases fall through to mock data — no action needed.
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return { data, source: 'live' };

  } catch (err) {
    // Expected when Azure Function is not deployed — use mock data.
    console.info('[EX30] /.api/vehicle-status unavailable, using mock data.', err.message);
    return { data: MOCK_VEHICLE_DATA, source: 'mock' };
  }
}


/* ── SVG Icon Library ───────────────────────────────────────────
   Each icon is an inline SVG string, sized by the .card-icon
   container in the CSS.  Uses currentColor so they inherit the
   red accent from .card-icon.
   ─────────────────────────────────────────────────────────── */
const ICONS = {

  battery: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="1" y="6" width="16" height="12" rx="2"/>
    <line x1="23" y1="11" x2="23" y2="13"/>
    <rect x="4" y="9" width="5" height="6" rx="1"
          fill="currentColor" stroke="none"/>
  </svg>`,

  range: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
             fill="currentColor" stroke="none"/>
  </svg>`,

  charging: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>`,

  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>`,

  temperature: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
  </svg>`,

  location: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>`,

  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`,

};


/* ── Formatting Helpers ─────────────────────────────────────── */

/**
 * Format an ISO 8601 datetime string into two parts:
 *   { time: "16:23", date: "01 May 2024" }
 * Falls back to '--' on invalid input.
 */
function formatSyncTime(isoString) {
  if (!isoString) return { time: '--', date: '' };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { time: '--', date: '' };

  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  return { time, date };
}

/** Return a safe temperature string like "19.5", or "--" */
function formatTemp(celsius) {
  if (celsius == null) return '--';
  return Number(celsius).toFixed(1);
}


/* ── Card Builders ──────────────────────────────────────────────
   Each function accepts the relevant slice of vehicle data and
   returns an HTML string.  Assembled by renderDashboard().
   ─────────────────────────────────────────────────────────── */

function buildBatteryCard(battery) {
  const pct      = battery.chargePercentage ?? '--';
  const barWidth = typeof pct === 'number' ? Math.min(100, Math.max(0, pct)) : 0;

  // Bar colour class — shifts amber at low charge, critical at very low
  let barClass = '';
  if (typeof pct === 'number') {
    if      (pct < 20) barClass = 'critical';
    else if (pct < 50) barClass = 'low';
  }

  return `
    <div class="card" id="card-battery">
      <div class="card-header">
        <div class="card-icon">${ICONS.battery}</div>
        <span class="card-label">Battery</span>
      </div>
      <div class="card-value">${pct}<span class="unit">%</span></div>
      <div class="battery-bar-track">
        <div class="battery-bar-fill ${barClass}" style="width:${barWidth}%"></div>
      </div>
    </div>`;
}

function buildRangeCard(battery) {
  const km = battery.estimatedRangeKm ?? '--';
  return `
    <div class="card" id="card-range">
      <div class="card-header">
        <div class="card-icon">${ICONS.range}</div>
        <span class="card-label">Estimated Range</span>
      </div>
      <div class="card-value">${km}<span class="unit">km</span></div>
      <div class="card-sub">Based on current driving pattern</div>
    </div>`;
}

function buildChargingCard(battery) {
  let badgeClass, badgeLabel, detail;

  if (battery.isCharging) {
    const rate = battery.chargeRateKw       ? `${battery.chargeRateKw} kW`       : '';
    const eta  = battery.minutesToFullCharge ? `Full in ~${battery.minutesToFullCharge} min` : '';
    badgeClass = 'charging';
    badgeLabel = '⚡ CHARGING';
    detail     = [rate, eta].filter(Boolean).join(' · ') || 'Charging in progress';
  } else if (battery.isPluggedIn) {
    badgeClass = 'plugged-in';
    badgeLabel = '⏸ PLUGGED IN';
    detail     = 'Connected but not charging';
  } else {
    badgeClass = 'not-charging';
    badgeLabel = '○ NOT CHARGING';
    detail     = 'Vehicle unplugged';
  }

  return `
    <div class="card" id="card-charging">
      <div class="card-header">
        <div class="card-icon">${ICONS.charging}</div>
        <span class="card-label">Charging</span>
      </div>
      <div><span class="status-badge ${badgeClass}">${badgeLabel}</span></div>
      <div class="card-sub">${detail}</div>
    </div>`;
}

function buildLockCard(security) {
  const locked     = security.isLocked;
  const badgeClass = locked ? 'locked'    : 'unlocked';
  const badgeLabel = locked ? '🔒 LOCKED' : '🔓 UNLOCKED';
  const detail     = security.isAlarmArmed ? 'Alarm armed' : 'Alarm disarmed';

  return `
    <div class="card" id="card-lock">
      <div class="card-header">
        <div class="card-icon">${ICONS.lock}</div>
        <span class="card-label">Lock Status</span>
      </div>
      <div><span class="status-badge ${badgeClass}">${badgeLabel}</span></div>
      <div class="card-sub">${detail}</div>
    </div>`;
}

function buildTemperatureCard(climate) {
  const temp   = formatTemp(climate.cabinTemperatureCelsius);
  const active = climate.isClimatisationActive;
  const detail = active
    ? `Climatisation active → target ${climate.targetTemperatureCelsius}°C`
    : 'Climatisation off';

  return `
    <div class="card" id="card-temperature">
      <div class="card-header">
        <div class="card-icon">${ICONS.temperature}</div>
        <span class="card-label">Cabin Temperature</span>
      </div>
      <div class="card-value">${temp}<span class="unit">°C</span></div>
      <div class="card-sub">${detail}</div>
    </div>`;
}

function buildLocationCard(location) {
  // Prefer human-readable address; fall back to co-ordinates
  const display = location.address
    || `${location.latitude?.toFixed(4) ?? '?'}, ${location.longitude?.toFixed(4) ?? '?'}`;
  const status  = location.isParked ? 'Vehicle parked' : 'In transit';

  return `
    <div class="card" id="card-location">
      <div class="card-header">
        <div class="card-icon">${ICONS.location}</div>
        <span class="card-label">Location</span>
      </div>
      <div class="card-value card-value--text">${display}</div>
      <div class="card-sub">${status}</div>
    </div>`;
}

function buildLastSyncCard(isoString) {
  const { time, date } = formatSyncTime(isoString);

  return `
    <div class="card" id="card-sync">
      <div class="card-header">
        <div class="card-icon">${ICONS.clock}</div>
        <span class="card-label">Last Sync</span>
      </div>
      <div class="sync-time">${time}</div>
      <div class="sync-date">${date}</div>
      <div class="card-sub">Auto-refresh every 60 seconds</div>
    </div>`;
}


/* ── Dashboard Renderer ─────────────────────────────────────────
   Builds all card HTML from the data object and inserts it into
   the cards grid.  Called after every successful fetch.
   ─────────────────────────────────────────────────────────── */
function renderDashboard(data) {
  const grid    = document.getElementById('cards-grid');
  const loading = document.getElementById('cards-loading');

  // Hide the loading spinner
  if (loading) loading.classList.add('hidden');

  // Build cards in display order
  const html = [
    buildBatteryCard(data.battery),
    buildRangeCard(data.battery),
    buildChargingCard(data.battery),
    buildLockCard(data.security),
    buildTemperatureCard(data.climate),
    buildLocationCard(data.location),
    buildLastSyncCard(data.lastSyncTime),
  ].join('');

  // Preserve (hidden) loading element; replace everything else
  grid.innerHTML = `<div class="cards-loading hidden" id="cards-loading"></div>${html}`;

  // Populate the vehicle identity line in the header
  const metaEl = document.getElementById('vehicle-meta');
  if (metaEl && data.vehicle) {
    metaEl.textContent = `${data.vehicle.colour} · ${data.vehicle.modelYear}`;
  }
}


/* ── Connection Status Indicator ────────────────────────────── */
function setConnectionStatus(source) {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  const states = {
    live:  { cls: 'live',  label: 'LIVE DATA'  },
    mock:  { cls: 'mock',  label: 'DEMO MODE'  },
    error: { cls: 'error', label: 'OFFLINE'    },
  };

  const state    = states[source] ?? states.error;
  dot.className  = `status-dot ${state.cls}`;
  text.textContent = state.label;
}


/* ── Refresh ────────────────────────────────────────────────────
   On the very first load, mock data is rendered immediately so
   the page is never blank while the API call is in-flight.
   The API call then happens in the background; if it succeeds
   the cards are updated with live data.
   ─────────────────────────────────────────────────────────── */
let _firstLoad = true;

async function refreshData() {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.classList.add('spinning');

  // Render mock data straight away on first load — no spinner wait
  if (_firstLoad) {
    renderDashboard(MOCK_VEHICLE_DATA);
    setConnectionStatus('mock');
    _firstLoad = false;
  }

  // Fetch from Azure Function in background; update if live data arrives
  const { data, source } = await fetchVehicleStatus();
  renderDashboard(data);
  setConnectionStatus(source);

  if (btn) btn.classList.remove('spinning');
}


/* ── Auto-Refresh ────────────────────────────────────────────── */
const REFRESH_INTERVAL_MS = 60_000;  // 60 seconds

function startAutoRefresh() {
  setInterval(refreshData, REFRESH_INTERVAL_MS);
}


/* ── Sound Button ────────────────────────────────────────────────
   Plays the KITT scanner sound on click.
   Audio is created lazily on first interaction to satisfy
   browser autoplay policies.
   ─────────────────────────────────────────────────────────── */
let kittAudio = null;

function initSound() {
  if (kittAudio) return;
  kittAudio = new Audio('sounds/kitt-scanner.mp3');
  kittAudio.preload = 'auto';
}

function playKittSound() {
  initSound();
  const btn = document.getElementById('sound-btn');

  // Rewind so repeated clicks always play from the start
  kittAudio.currentTime = 0;
  kittAudio.play().catch(err => {
    console.warn('[EX30] Audio play failed:', err.message);
  });

  // Visual feedback while audio plays
  if (btn) {
    btn.classList.add('playing');
    kittAudio.onended = () => btn.classList.remove('playing');
  }
}


/* ── 3D Car Viewer ───────────────────────────────────────────────
   Builds a Knight Rider-style neon wireframe of the EX30.

   The body uses THREE.ExtrudeGeometry on a 2-D side profile drawn
   with THREE.Shape, giving a genuine car silhouette (A-pillar,
   windscreen rake, roofline, C-pillar, wheel arches) rather than
   stacked boxes.  Three.js r134 global build (local file).
   ─────────────────────────────────────────────────────────── */
function initCarViewer() {
  if (typeof THREE === 'undefined') {
    console.warn('[EX30] Three.js not loaded — 3D viewer disabled.');
    return;
  }

  const container = document.getElementById('car-viewer');
  if (!container) return;

  const H = 340;

  // ── Scene ──────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);

  // ── Camera ─────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  camera.position.set(6.0, 2.8, 6.0);
  camera.lookAt(0, 0.76, 0);

  // ── Renderer ───────────────────────────────────────────────────
  // Three.js creates and owns the canvas so setSize() tracking is clean.
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const placeholder = document.getElementById('car-canvas');
  if (placeholder) placeholder.remove();
  renderer.domElement.id = 'car-canvas';
  renderer.domElement.style.display = 'block';
  container.insertBefore(renderer.domElement, container.firstChild);

  function resize() {
    const w = container.offsetWidth || 900;
    renderer.setSize(w, H);
    camera.aspect = w / H;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(container);

  // ── Materials ──────────────────────────────────────────────────
  // DoubleSide handles any winding-order differences in extruded geo
  const bodyMat    = new THREE.MeshBasicMaterial({ color: 0x1c0606, side: THREE.DoubleSide });
  const edgeRed    = new THREE.LineBasicMaterial({ color: 0xff2222 });
  const edgeDim    = new THREE.LineBasicMaterial({ color: 0x881111 });
  const scannerMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const emitRed    = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const emitDim    = new THREE.MeshBasicMaterial({ color: 0x550000 });

  const car = new THREE.Group();
  scene.add(car);

  // ── Car body — extruded side profile ───────────────────────────
  //
  //  Proportions measured against real EX30 data:
  //    Total length  ≈ 4.23 m  → x = -2.12 … +2.12
  //    Wheelbase     ≈ 2.65 m
  //    Front overhang≈ 0.84 m  → front wheel x ≈ +1.28
  //    Rear overhang ≈ 0.74 m  → rear  wheel x ≈ -1.37
  //    Ride height   ≈ 0.18 m  → sill y ≈ 0.32
  //    Wheel radius  ≈ 0.32 m  (20" tyre)
  //    Roof height   ≈ 1.52 m
  //
  //  X = car length (front = +X)   Y = height   Z = width (extruded)
  //
  //  Profile traced clockwise; DoubleSide material handles the inversion.
  //  absarc(cx, cy, r, 0, π, true) sweeps CW (DOWN) from (cx+r,cy)
  //  through the arch trough to (cx-r,cy) — carving the wheel opening.
  // ────────────────────────────────────────────────────────────────

  const profile = new THREE.Shape();

  // ── Bottom — front section, arches, sill ──────────────────────
  profile.moveTo( 2.10, 0.00);   // front bumper, ground level
  profile.lineTo( 1.66, 0.00);   // run to front arch entry (x-level)
  profile.lineTo( 1.66, 0.32);   // rise to sill / arch height

  // Front wheel arch  cx=1.28, r=0.38
  // CW sweep: (1.66,0.32) → lowest (1.28,-0.06) → (0.90,0.32)
  profile.absarc( 1.28, 0.32, 0.38, 0, Math.PI, true);

  // Sill between arches — EX30 sill is flat and relatively high
  profile.lineTo(-0.99, 0.32);

  // Rear wheel arch  cx=-1.37, r=0.38
  // CW sweep: (-0.99,0.32) → lowest (-1.37,-0.06) → (-1.75,0.32)
  profile.absarc(-1.37, 0.32, 0.38, 0, Math.PI, true);

  profile.lineTo(-1.75, 0.00);   // drop to ground
  profile.lineTo(-2.10, 0.00);   // rear bumper, ground level

  // ── Rear face — EX30 has fairly upright, boxy tail ────────────
  profile.lineTo(-2.18, 0.14);
  profile.lineTo(-2.18, 0.48);   // rear bumper upper
  profile.lineTo(-2.08, 0.68);   // boot lip / tail lamp centre
  profile.lineTo(-1.90, 0.88);   // rear body upper

  // ── C-pillar — steep drop, signature EX30 look ────────────────
  profile.lineTo(-1.40, 1.40);   // C-pillar mid
  profile.lineTo(-0.88, 1.52);   // roof rear edge

  // ── Roof — long and flat (EX30 is a crossover, not fastback) ──
  profile.lineTo( 0.50, 1.52);   // roof front edge

  // ── Windscreen + A-pillar ─────────────────────────────────────
  // EX30 A-pillar is upright; screen raked ~58° from horizontal
  profile.lineTo( 1.05, 1.36);   // A-pillar top (screen-to-roof join)
  profile.lineTo( 1.18, 0.90);   // A-pillar base (scuttle panel)

  // ── Bonnet — short, slightly domed ────────────────────────────
  profile.lineTo( 1.30, 0.82);   // bonnet surface at scuttle
  profile.lineTo( 1.92, 0.72);   // bonnet leading edge / DRL recess
  profile.lineTo( 2.12, 0.56);   // front face upper
  profile.lineTo( 2.18, 0.38);   // front bumper upper
  profile.lineTo( 2.18, 0.14);   // front bumper face
  profile.lineTo( 2.10, 0.00);   // close back to start

  // Extrude 1.84 m wide (EX30 is 1837 mm), centred on Z
  const extruded = new THREE.ExtrudeGeometry(profile, { depth: 1.84, bevelEnabled: false });
  extruded.translate(0, 0, -0.92);

  car.add(new THREE.Mesh(extruded, bodyMat));

  // Edge lines — threshold 15° suppresses triangulation diagonals
  // on flat surfaces while keeping every real shape boundary visible
  car.add(new THREE.LineSegments(new THREE.EdgesGeometry(extruded, 15), edgeRed));

  // ── Door crease / belt line (both flanks) ─────────────────────
  // Runs at the body shoulder height along the door panel
  [0.92, -0.92].forEach(z => {
    const pts = [
      new THREE.Vector3(-1.30, 0.80, z),
      new THREE.Vector3( 1.05, 0.80, z),
    ];
    car.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), edgeDim));
  });

  // ── KITT scanner strip ─────────────────────────────────────────
  const scanMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 1.70), scannerMat);
  scanMesh.position.set(2.16, 0.28, 0);
  car.add(scanMesh);

  // ── Headlights — thin horizontal strips (EX30 DRL style) ──────
  const litGeo = new THREE.BoxGeometry(0.05, 0.05, 0.32);
  [-0.62, 0.62].forEach(z => {
    const h = new THREE.Mesh(litGeo, emitRed);
    h.position.set(2.16, 0.54, z);
    car.add(h);
  });

  // ── Rear light bar — full-width horizontal strip (real EX30) ──
  const rearBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.78), emitDim);
  rearBar.position.set(-2.16, 0.65, 0);
  car.add(rearBar);

  // ── Wheels ─────────────────────────────────────────────────────
  // CylinderGeometry default axis = Y; rotation.x = π/2 → axis along Z.
  // Wheel centres match arch centres: front x=1.28, rear x=-1.37.
  const WHEEL_R = 0.30;
  const WHEEL_W = 0.22;
  const tyreGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 28);
  const hubGeo  = new THREE.CylinderGeometry(0.11, 0.11, WHEEL_W + 0.02, 8);

  [
    [ 1.28, WHEEL_R,  0.92],
    [ 1.28, WHEEL_R, -0.92],
    [-1.37, WHEEL_R,  0.92],
    [-1.37, WHEEL_R, -0.92],
  ].forEach(([x, y, z]) => {
    const tyre = new THREE.Mesh(tyreGeo, new THREE.MeshBasicMaterial({ color: 0x0c0202 }));
    tyre.position.set(x, y, z);
    tyre.rotation.x = Math.PI / 2;
    car.add(tyre);

    const te = new THREE.LineSegments(new THREE.EdgesGeometry(tyreGeo, 25), edgeDim);
    te.position.set(x, y, z);
    te.rotation.x = Math.PI / 2;
    car.add(te);

    const hub = new THREE.Mesh(hubGeo, new THREE.MeshBasicMaterial({ color: 0x2a0808 }));
    hub.position.set(x, y, z);
    hub.rotation.x = Math.PI / 2;
    car.add(hub);

    const he = new THREE.LineSegments(new THREE.EdgesGeometry(hubGeo, 25), edgeRed);
    he.position.set(x, y, z);
    he.rotation.x = Math.PI / 2;
    car.add(he);
  });

  // ── Ground grid ────────────────────────────────────────────────
  scene.add(new THREE.GridHelper(20, 28, 0x2a0000, 0x160000));

  // ── HUD ────────────────────────────────────────────────────────
  const hudRotate = document.getElementById('hud-rotate');
  let t = 0;

  (function animate() {
    requestAnimationFrame(animate);
    t += 0.018;
    car.rotation.y += 0.004;

    const pulse = (Math.sin(t * 2.2) + 1) / 2;
    scannerMat.color.setRGB(1.0, pulse * 0.04, 0);

    if (hudRotate) {
      const deg = Math.round(((car.rotation.y % (Math.PI * 2)) * 180 / Math.PI + 360) % 360);
      hudRotate.textContent = `ROT ${String(deg).padStart(3, '0')}°`;
    }

    renderer.render(scene, camera);
  })();
}


/* ── Refresh button wiring ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.addEventListener('click', refreshData);
  }

  const soundBtn = document.getElementById('sound-btn');
  if (soundBtn) {
    soundBtn.addEventListener('click', playKittSound);
  }

  // Initial data load + kick off auto-refresh
  refreshData();
  startAutoRefresh();

  // Initialise 3D car viewer (requires Three.js CDN to have loaded)
  initCarViewer();
});
