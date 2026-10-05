'use strict';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

// Open-Meteo weather codes -> [description, emoji]
const WEATHER_CODES = {
  0: ['Clear sky', '☀️'],
  1: ['Mostly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Freezing fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌦️'],
  56: ['Freezing drizzle', '🌧️'],
  57: ['Heavy freezing drizzle', '🌧️'],
  61: ['Light rain', '🌧️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'],
  67: ['Heavy freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '❄️'],
  80: ['Light showers', '🌦️'],
  81: ['Showers', '🌧️'],
  82: ['Violent showers', '⛈️'],
  85: ['Snow showers', '🌨️'],
  86: ['Heavy snow showers', '🌨️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm with hail', '⛈️'],
  99: ['Severe thunderstorm with hail', '⛈️']
};

const $ = (id) => document.getElementById(id);
const els = {
  form: $('search-form'),
  input: $('city'),
  status: $('status'),
  current: $('current'),
  place: $('place'),
  icon: $('icon'),
  temp: $('temp'),
  desc: $('desc'),
  feels: $('feels'),
  humidity: $('humidity'),
  wind: $('wind'),
  forecast: $('forecast'),
  list: $('forecast-list'),
  unitButtons: document.querySelectorAll('.units button')
};

let unit = 'celsius';
let currentPlace = null;
let requestId = 0; // ignores out-of-date responses

/* ---------- Storage (safe if blocked) ---------- */
const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
  }
};

/* ---------- API calls (Fetch) ---------- */
async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The weather service returned an error (${response.status}).`);
  }
  return response.json();
}

async function findCity(name) {
  const params = new URLSearchParams({ name, count: 1, language: 'en', format: 'json' });
  const data = await getJSON(`${GEO_URL}?${params}`);

  if (!data.results || data.results.length === 0) {
    throw new Error(`No city found for "${name}". Check the spelling and try again.`);
  }

  const { name: city, country, admin1, latitude, longitude } = data.results[0];
  return { city, country, region: admin1, latitude, longitude };
}

function getWeather(place) {
  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: 5,
    timezone: 'auto',
    temperature_unit: unit,
    wind_speed_unit: unit === 'celsius' ? 'kmh' : 'mph'
  });
  return getJSON(`${WEATHER_URL}?${params}`);
}

/* ---------- UI helpers ---------- */
function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle('is-error', isError);
}

function friendlyError(err) {
  return err instanceof TypeError
    ? 'Network error. Check your internet connection and try again.'
    : err.message;
}

function describe(code) {
  return WEATHER_CODES[code] || ['Unknown conditions', '🌡️'];
}

function updateUnitButtons() {
  els.unitButtons.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.unit === unit));
  });
}

function render(place, data) {
  const symbol = unit === 'celsius' ? '°C' : '°F';
  const windUnit = unit === 'celsius' ? 'km/h' : 'mph';
  const c = data.current;
  const [text, emoji] = describe(c.weather_code);

  els.place.textContent = [place.city, place.region, place.country].filter(Boolean).join(', ');
  els.icon.textContent = emoji;
  els.temp.textContent = `${Math.round(c.temperature_2m)}${symbol}`;
  els.desc.textContent = text;
  els.feels.textContent = `${Math.round(c.apparent_temperature)}${symbol}`;
  els.humidity.textContent = `${c.relative_humidity_2m}%`;
  els.wind.textContent = `${Math.round(c.wind_speed_10m)} ${windUnit}`;
  els.current.hidden = false;

  // Forecast (built with DOM methods, no innerHTML)
  els.list.replaceChildren();
  data.daily.time.forEach((date, i) => {
    const [dayText, dayEmoji] = describe(data.daily.weather_code[i]);
    const label = i === 0
      ? 'Today'
      : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });

    const li = document.createElement('li');

    const day = document.createElement('span');
    day.className = 'day';
    day.textContent = label;

    const cond = document.createElement('span');
    cond.textContent = `${dayEmoji} ${dayText}`;

    const range = document.createElement('span');
    range.className = 'range';
    const hi = document.createElement('span');
    hi.textContent = `${Math.round(data.daily.temperature_2m_max[i])}°`;
    const lo = document.createElement('span');
    lo.className = 'lo';
    lo.textContent = ` / ${Math.round(data.daily.temperature_2m_min[i])}°`;
    range.append(hi, lo);

    li.append(day, cond, range);
    els.list.append(li);
  });
  els.forecast.hidden = false;
}

/* ---------- Main flow ---------- */
async function run(task) {
  const id = ++requestId;
  els.form.setAttribute('aria-busy', 'true');
  setStatus('Loading weather…');

  try {
    const { place, data } = await task();
    if (id !== requestId) return;
    currentPlace = place;
    store.set('wx-place', JSON.stringify(place));
    render(place, data);
    setStatus('');
  } catch (err) {
    if (id !== requestId) return;
    els.current.hidden = true;
    els.forecast.hidden = true;
    setStatus(friendlyError(err), true);
  } finally {
    if (id === requestId) els.form.removeAttribute('aria-busy');
  }
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = els.input.value.trim();

  if (!query) {
    setStatus('Enter a city name.', true);
    els.input.focus();
    return;
  }

  run(async () => {
    const place = await findCity(query);
    const data = await getWeather(place);
    return { place, data };
  });
});

els.unitButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.unit === unit) return;
    unit = btn.dataset.unit;
    store.set('wx-unit', unit);
    updateUnitButtons();

    if (currentPlace) {
      run(async () => ({ place: currentPlace, data: await getWeather(currentPlace) }));
    }
  });
});

/* ---------- Init: restore last unit and city ---------- */
(function init() {
  unit = store.get('wx-unit') === 'fahrenheit' ? 'fahrenheit' : 'celsius';
  updateUnitButtons();

  const saved = store.get('wx-place');
  if (saved) {
    try {
      const place = JSON.parse(saved);
      els.input.value = place.city;
      run(async () => ({ place, data: await getWeather(place) }));
    } catch { /* ignore bad data */ }
  }
})();