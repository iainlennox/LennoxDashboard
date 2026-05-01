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
   ─────────────────────────────────────────────────────────── */
async function fetchVehicleStatus() {
  try {
    const response = await fetch('/.api/vehicle-status', {
      method:  'GET',
      headers: { 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(8000),   // 8-second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from /.api/vehicle-status`);
    }

    const data = await response.json();
    return { data, source: 'live' };

  } catch (err) {
    // API unavailable — fall back to mock data quietly
    console.warn('[EX30] API unavailable, using mock data:', err.message);
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
   Called by the REFRESH button (onclick in HTML) and by the
   auto-refresh interval timer.
   ─────────────────────────────────────────────────────────── */
async function refreshData() {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.classList.add('spinning');

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


/* ── Refresh button wiring ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('refresh-btn');
  if (btn) {
    btn.addEventListener('click', refreshData);
  }

  // Initial data load + kick off auto-refresh
  refreshData();
  startAutoRefresh();
});
