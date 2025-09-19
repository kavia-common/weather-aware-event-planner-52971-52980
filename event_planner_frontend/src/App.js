import React, { useState, useEffect, useMemo } from 'react';
import './App.css';

/**
 * Ocean Professional Theme constants
 */
const themePalette = {
  primary: '#2563EB',
  secondary: '#F59E0B',
  success: '#F59E0B',
  error: '#EF4444',
  background: '#f9fafb',
  surface: '#ffffff',
  text: '#111827',
  gradientFrom: 'rgba(59,130,246,0.08)',
  gradientTo: 'rgba(249,250,251,1)'
};

/**
 * Base API URL from environment
 * For Create React App, env variables must start with REACT_APP_
 * - Ask user to set REACT_APP_BACKEND_URL in .env
 * - Fallback to same-origin
 */
const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Small API helper with error handling
 */
async function apiGet(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v);
  });
  const res = await fetch(url.toString());
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST ${path} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

/**
 * Utility: format to yyyy-mm-dd
 */
function toDateInputValue(date) {
  const d = new Date(date);
  const pad = (n) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * PUBLIC_INTERFACE
 * Root App: weather-aware event planner
 */
function App() {
  const [theme, setTheme] = useState('light');

  // Location selector state
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const selectedLocation = useMemo(
    () => locations.find(l => String(l.id) === String(selectedLocationId)),
    [locations, selectedLocationId]
  );

  // Weather and recommendation data
  const [weather, setWeather] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [loadingReco, setLoadingReco] = useState(false);
  const [error, setError] = useState('');

  // Events and form state
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    date: toDateInputValue(new Date()),
    startTime: '10:00',
    endTime: '11:00',
    locationId: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Apply data-theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load locations and events on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [locs, evs] = await Promise.all([
          apiGet('/api/locations/', { page: 1, per_page: 100 }).catch(() => []),
          apiGet('/api/events/', { page: 1, per_page: 100 }).catch(() => [])
        ]);
        if (!active) return;
        setLocations(Array.isArray(locs) ? locs : []);
        setEvents(Array.isArray(evs) ? evs : []);
        if (Array.isArray(locs) && locs.length > 0) {
          setSelectedLocationId(String(locs[0].id));
          setForm((f) => ({ ...f, locationId: String(locs[0].id) }));
        }
      } catch (e) {
        setError(String(e.message || e));
      }
    })();
    return () => { active = false; };
  }, []);

  // Fetch weather and recommendation when location changes
  useEffect(() => {
    if (!selectedLocation) return;
    const fetchWeather = async () => {
      setLoadingWeather(true);
      setError('');
      try {
        const params = buildWeatherParams(selectedLocation);
        const data = await apiGet('/api/weather/', params);
        setWeather(data);
      } catch (e) {
        setWeather(null);
        setError(String(e.message || e));
      } finally {
        setLoadingWeather(false);
      }
    };
    const fetchReco = async () => {
      setLoadingReco(true);
      try {
        const params = buildWeatherParams(selectedLocation);
        const data = await apiGet('/api/recommendation/', params);
        setRecommendation(data);
      } catch (e) {
        setRecommendation(null);
      } finally {
        setLoadingReco(false);
      }
    };
    fetchWeather();
    fetchReco();
  }, [selectedLocation]);

  function buildWeatherParams(loc) {
    const params = {};
    if (loc?.latitude && loc?.longitude) {
      params.lat = loc.latitude;
      params.lon = loc.longitude;
    } else if (loc?.city) {
      params.city = loc.city;
      if (loc.state) params.state = loc.state;
      if (loc.country) params.country = loc.country;
    }
    return params;
  }

  // PUBLIC_INTERFACE
  function toggleTheme() {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  }

  // PUBLIC_INTERFACE
  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  // PUBLIC_INTERFACE
  async function handleCreateEvent(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { title, description, date, startTime, endTime, locationId } = form;
      if (!title || !date || !startTime || !endTime) {
        throw new Error('Please fill title, date, start and end time.');
      }
      const start = new Date(`${date}T${startTime}:00`);
      const end = new Date(`${date}T${endTime}:00`);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date/time.');
      }
      if (end <= start) {
        throw new Error('End time must be after start time.');
      }
      const payload = {
        title,
        description: description || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        location_id: locationId ? Number(locationId) : (selectedLocationId ? Number(selectedLocationId) : null)
      };
      const created = await apiPost('/api/events/', payload);
      setEvents(prev => [created, ...prev]);
      // Reset minimal fields
      setForm(f => ({ ...f, title: '', description: '' }));
    } catch (e2) {
      setError(String(e2.message || e2));
    } finally {
      setSubmitting(false);
    }
  }

  // Derived daily events map
  const eventsByDate = useMemo(() => {
    const map = {};
    (events || []).forEach(ev => {
      const d = new Date(ev.start_time);
      if (isNaN(d.getTime())) return;
      const key = toDateInputValue(d);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [events]);

  return (
    <div style={styles.appRoot(theme)}>
      {/* Top Navigation / Hero */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.brand}>
            <span style={styles.brandDot}>●</span>
            <span style={styles.brandText}>Ocean Planner</span>
          </div>
          <div style={styles.subtitle}>Weather-aware event planning made simple</div>
        </div>
        <div style={styles.headerRight}>
          <select
            aria-label="Select location"
            value={selectedLocationId}
            onChange={(e) => { setSelectedLocationId(e.target.value); setForm(f => ({ ...f, locationId: e.target.value })); }}
            style={styles.locationSelect}
          >
            {locations.map(l => (
              <option key={l.id} value={String(l.id)}>
                {l.name || `${l.city || 'Unknown'}, ${l.state || ''}`.trim()}
              </option>
            ))}
          </select>
          <button style={styles.themeToggle} onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Intro + Weather Widget */}
      <section style={styles.heroSection}>
        <div style={styles.heroCard}>
          <h1 style={styles.h1}>Plan smarter with live weather</h1>
          <p style={styles.lead}>
            Book events with confidence. We overlay weather insights directly on your calendar and provide
            tailored recommendations for your chosen location.
          </p>
          <div style={styles.heroBadges}>
            <span style={styles.badge}>Live Weather</span>
            <span style={{ ...styles.badge, background: themePalette.secondary, color: '#111827' }}>Smart Picks</span>
            <span style={styles.badge}>Modern UI</span>
          </div>
        </div>

        <div style={styles.weatherCard}>
          <div style={styles.cardHeader}>
            <span style={styles.cardTitle}>Current Weather</span>
            {loadingWeather && <span style={styles.subtle}>Loading...</span>}
          </div>
          {weather ? (
            <WeatherDetails weather={weather} />
          ) : (
            <div style={styles.placeholder}>
              {loadingWeather ? 'Loading...' : 'No weather data available.'}
            </div>
          )}
          <div style={styles.recoBox}>
            <div style={styles.recoHeader}>
              <span style={styles.recoTitle}>Recommendation</span>
              {loadingReco && <span style={styles.subtle}>Updating...</span>}
            </div>
            {recommendation ? (
              <div>
                <div style={styles.recoTextTitle}>{recommendation.title}</div>
                <div style={styles.recoText}>{recommendation.suggestion}</div>
                {recommendation.summary && (
                  <div style={styles.recoSummary}>{recommendation.summary}</div>
                )}
              </div>
            ) : (
              <div style={styles.placeholderSmall}>
                {loadingReco ? 'Loading recommendation…' : 'No recommendation yet.'}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content: Calendar and Booking Form */}
      <section style={styles.mainGrid}>
        <div style={styles.calendarPane}>
          <CalendarWithWeather
            date={form.date}
            setDate={(d) => setForm(f => ({ ...f, date: d }))}
            eventsByDate={eventsByDate}
            weather={weather}
          />
        </div>
        <div style={styles.formPane}>
          <BookingForm
            form={form}
            onChange={handleFormChange}
            onSubmit={handleCreateEvent}
            submitting={submitting}
            selectedLocation={selectedLocation}
          />
        </div>
      </section>

      {/* Events List */}
      <section style={styles.eventsSection}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.h2}>Upcoming Events</h2>
          <span style={styles.subtle}>{events.length} total</span>
        </div>
        <div style={styles.eventList}>
          {events.length === 0 && <div style={styles.placeholder}>No events created yet.</div>}
          {events.map(ev => (
            <EventCard key={ev.id || `${ev.title}-${ev.start_time}`} event={ev} />
          ))}
        </div>
      </section>

      {/* Error Snackbar */}
      {error && (
        <div role="alert" style={styles.errorToast} onClick={() => setError('')}>
          {error}
        </div>
      )}

      <footer style={styles.footer}>
        <span>© {new Date().getFullYear()} Ocean Planner</span>
      </footer>
    </div>
  );
}

/**
 * WeatherDetails component
 */
function WeatherDetails({ weather }) {
  const payload = weather?.payload || {};
  const main = payload?.weather?.[0]?.main || payload?.conditions || '—';
  const desc = payload?.weather?.[0]?.description || payload?.description || '';
  const temp = payload?.main?.temp ?? payload?.temperature ?? null;
  const humidity = payload?.main?.humidity ?? payload?.humidity ?? null;
  const wind = payload?.wind?.speed ?? payload?.wind_speed ?? null;

  return (
    <div style={styles.weatherGrid}>
      <WeatherStat label="Condition" value={`${main}${desc ? ` • ${desc}` : ''}`} />
      <WeatherStat label="Temperature" value={temp !== null ? `${Math.round(temp)}°` : '—'} />
      <WeatherStat label="Humidity" value={humidity !== null ? `${humidity}%` : '—'} />
      <WeatherStat label="Wind" value={wind !== null ? `${wind} m/s` : '—'} />
    </div>
  );
}

function WeatherStat({ label, value }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

/**
 * CalendarWithWeather: simple month grid with today's focus and events/weather overlay
 */
function CalendarWithWeather({ date, setDate, eventsByDate, weather }) {
  const current = new Date(date);
  const year = current.getFullYear();
  const month = current.getMonth();
  const start = new Date(year, month, 1);
  const startDay = start.getDay(); // 0-6
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));

  const todayStr = toDateInputValue(new Date());
  const selectedStr = toDateInputValue(current);

  const weatherBadge = deriveWeatherBadge(weather);

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>Calendar</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={styles.ghostButton}
            onClick={() => {
              const prev = new Date(year, month - 1, 1);
              setDate(toDateInputValue(prev));
            }}
            aria-label="Previous month"
          >
            ‹
          </button>
          <div style={styles.monthLabel}>
            {current.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <button
            style={styles.ghostButton}
            onClick={() => {
              const next = new Date(year, month + 1, 1);
              setDate(toDateInputValue(next));
            }}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </div>

      <div style={styles.weekdayRow}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={styles.weekdayCell}>{d}</div>
        ))}
      </div>

      <div style={styles.calendarGrid}>
        {days.map((d, idx) => {
          if (!d) return <div key={`empty-${idx}`} style={styles.dayCellEmpty} />;
          const key = toDateInputValue(d);
          const isToday = key === todayStr;
          const isSelected = key === selectedStr;
          const dayEvents = eventsByDate[key] || [];

          return (
            <button
              key={key}
              onClick={() => setDate(key)}
              style={{
                ...styles.dayCell,
                ...(isToday ? styles.dayToday : {}),
                ...(isSelected ? styles.daySelected : {})
              }}
              aria-label={`Select ${d.toDateString()}`}
            >
              <div style={styles.dayNumberRow}>
                <span>{d.getDate()}</span>
                {weatherBadge && isToday && (
                  <span style={{ ...styles.weatherBadge, background: weatherBadge.bg, color: weatherBadge.fg }}>
                    {weatherBadge.text}
                  </span>
                )}
              </div>
              {/* Event dots */}
              <div style={styles.eventDots}>
                {dayEvents.slice(0, 4).map((ev, i) => (
                  <span key={i} title={ev.title} style={styles.dot} />
                ))}
                {dayEvents.length > 4 && <span style={styles.moreText}>+{dayEvents.length - 4}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function deriveWeatherBadge(weather) {
  const payload = weather?.payload || {};
  const main = (payload?.weather?.[0]?.main || payload?.conditions || '').toLowerCase();
  const temp = payload?.main?.temp ?? payload?.temperature ?? null;
  if (!main && temp === null) return null;

  // Simplistic mapping
  if (main.includes('rain') || main.includes('drizzle')) {
    return { text: 'Rain', bg: 'rgba(37,99,235,0.15)', fg: themePalette.primary };
  }
  if (main.includes('snow')) {
    return { text: 'Snow', bg: 'rgba(59,130,246,0.15)', fg: themePalette.primary };
  }
  if (main.includes('cloud')) {
    return { text: 'Cloudy', bg: 'rgba(107,114,128,0.15)', fg: '#374151' };
  }
  if (main.includes('clear')) {
    return { text: 'Sunny', bg: 'rgba(245,158,11,0.2)', fg: themePalette.secondary };
  }
  if (temp !== null) {
    return { text: `${Math.round(temp)}°`, bg: 'rgba(59,130,246,0.12)', fg: themePalette.primary };
  }
  return null;
}

/**
 * BookingForm for creating events
 */
function BookingForm({ form, onChange, onSubmit, submitting, selectedLocation }) {
  return (
    <form onSubmit={onSubmit} style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>Plan an Event</span>
      </div>
      <div style={styles.formGrid}>
        <div style={styles.formField}>
          <label style={styles.label}>Title</label>
          <input
            name="title"
            value={form.title}
            onChange={onChange}
            placeholder="Team Offsite"
            style={styles.input}
            required
          />
        </div>
        <div style={{ ...styles.formField, gridColumn: '1 / -1' }}>
          <label style={styles.label}>Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={onChange}
            placeholder="Add details, agenda or notes"
            rows={3}
            style={{ ...styles.input, resize: 'vertical' }}
          />
        </div>
        <div style={styles.formField}>
          <label style={styles.label}>Date</label>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={onChange}
            style={styles.input}
            required
          />
        </div>
        <div style={styles.formField}>
          <label style={styles.label}>Start Time</label>
          <input
            type="time"
            name="startTime"
            value={form.startTime}
            onChange={onChange}
            style={styles.input}
            required
          />
        </div>
        <div style={styles.formField}>
          <label style={styles.label}>End Time</label>
          <input
            type="time"
            name="endTime"
            value={form.endTime}
            onChange={onChange}
            style={styles.input}
            required
          />
        </div>
        <div style={styles.formField}>
          <label style={styles.label}>Location</label>
          <input
            name="location"
            value={selectedLocation ? (selectedLocation.name || selectedLocation.city || 'Selected') : ''}
            style={{ ...styles.input, background: '#f3f4f6' }}
            readOnly
            placeholder="Select from top-right"
          />
        </div>
      </div>
      <div style={styles.formActions}>
        <button type="submit" style={styles.primaryButton} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Event'}
        </button>
        <span style={styles.helperText}>Events will appear in the calendar and list.</span>
      </div>
    </form>
  );
}

/**
 * Event card for listing
 */
function EventCard({ event }) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const dateStr = isNaN(start.getTime()) ? '—' : start.toLocaleString();
  const timeStr = (!isNaN(start.getTime()) && !isNaN(end.getTime()))
    ? `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '—';
  const locationName = event.location?.name || event.location?.city || '—';

  return (
    <div style={styles.eventCard}>
      <div style={styles.eventLeft}>
        <div style={styles.eventTitle}>{event.title}</div>
        <div style={styles.eventMeta}>{dateStr} • {timeStr}</div>
        <div style={styles.eventMeta}>Location: {locationName}</div>
        {event.description && <div style={styles.eventDesc}>{event.description}</div>}
      </div>
      <div style={styles.eventRight}>
        <div style={styles.eventBadge}>Booked</div>
      </div>
    </div>
  );
}

/**
 * Inline Styles adhering to Ocean Professional theme
 * (Using inline styles for portability; could be converted to CSS Modules/Tailwind)
 */
const styles = {
  appRoot: (theme) => ({
    minHeight: '100vh',
    background: theme === 'light'
      ? `linear-gradient(180deg, ${themePalette.gradientFrom}, ${themePalette.gradientTo})`
      : '#0b1220',
    color: theme === 'light' ? themePalette.text : '#e5e7eb',
    transition: 'background 300ms ease, color 300ms ease',
  }),
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
    background: themePalette.surface,
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 700,
    fontSize: 18,
  },
  brandDot: {
    color: themePalette.primary,
    fontSize: 22,
  },
  brandText: {
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  locationSelect: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  themeToggle: {
    border: '1px solid #e5e7eb',
    background: '#fff',
    borderRadius: 10,
    width: 40,
    height: 40,
    cursor: 'pointer',
  },
  heroSection: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: 20,
    padding: 20,
  },
  heroCard: {
    background: themePalette.surface,
    borderRadius: 16,
    padding: 20,
    boxShadow: '0 10px 20px rgba(0,0,0,0.05)',
    minHeight: 160,
  },
  h1: {
    margin: 0,
    fontSize: 28,
  },
  lead: {
    color: '#4b5563',
    marginTop: 8,
    lineHeight: 1.6,
    fontSize: 15,
  },
  heroBadges: {
    marginTop: 12,
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    background: themePalette.primary,
    color: '#fff',
    padding: '6px 10px',
    borderRadius: 999,
    fontSize: 12,
    boxShadow: '0 6px 12px rgba(37,99,235,0.25)',
  },
  weatherCard: {
    background: themePalette.surface,
    borderRadius: 16,
    padding: 16,
    boxShadow: '0 10px 20px rgba(0,0,0,0.05)',
  },
  card: {
    background: themePalette.surface,
    borderRadius: 16,
    padding: 16,
    boxShadow: '0 10px 20px rgba(0,0,0,0.05)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitle: {
    fontWeight: 700,
  },
  subtle: {
    color: '#6b7280',
    fontSize: 12,
  },
  weatherGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
    gap: 12,
  },
  stat: {
    background: '#f9fafb',
    border: '1px solid #eef2f7',
    borderRadius: 12,
    padding: 12,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 700,
  },
  recoBox: {
    marginTop: 12,
    borderTop: '1px solid #eef2f7',
    paddingTop: 12,
  },
  recoHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recoTitle: {
    fontWeight: 600,
  },
  recoTextTitle: {
    fontWeight: 700,
    marginBottom: 4,
  },
  recoText: {
    color: '#374151',
  },
  recoSummary: {
    color: '#6b7280',
    marginTop: 6,
    fontSize: 13,
  },
  placeholder: {
    color: '#6b7280',
    background: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    textAlign: 'center',
    border: '1px solid #eef2f7',
  },
  placeholderSmall: {
    color: '#6b7280',
    background: '#f9fafb',
    padding: 10,
    borderRadius: 10,
    textAlign: 'center',
    border: '1px solid #eef2f7',
    fontSize: 13,
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: 20,
    padding: 20,
  },
  calendarPane: {},
  formPane: {},
  weekdayRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 6,
    padding: '0 6px 6px 6px',
  },
  weekdayCell: {
    textAlign: 'center',
    fontSize: 12,
    color: '#6b7280',
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 6,
  },
  dayCellEmpty: {
    height: 86,
  },
  dayCell: {
    height: 86,
    background: '#fff',
    border: '1px solid #eef2f7',
    borderRadius: 12,
    padding: 8,
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'transform 120ms ease, box-shadow 120ms ease',
    boxShadow: '0 4px 8px rgba(0,0,0,0.03)',
  },
  dayToday: {
    borderColor: themePalette.primary,
  },
  daySelected: {
    outline: `2px solid ${themePalette.secondary}`,
  },
  dayNumberRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontWeight: 600,
    fontSize: 14,
  },
  eventDots: {
    display: 'flex',
    gap: 4,
    marginTop: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    background: themePalette.primary,
    boxShadow: '0 2px 4px rgba(37,99,235,0.3)',
  },
  moreText: {
    fontSize: 11,
    color: '#6b7280',
  },
  weatherBadge: {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
  },
  formField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
  },
  input: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    outline: 'none',
    fontSize: 14,
  },
  formActions: {
    marginTop: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    background: themePalette.primary,
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 8px 16px rgba(37,99,235,0.3)',
  },
  ghostButton: {
    background: '#fff',
    color: '#111827',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    cursor: 'pointer',
  },
  monthLabel: {
    padding: '6px 8px',
    fontWeight: 600,
  },
  helperText: {
    color: '#6b7280',
    fontSize: 12,
  },
  eventsSection: {
    padding: 20,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  h2: {
    margin: 0,
    fontSize: 20,
  },
  eventList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
  },
  eventCard: {
    background: '#fff',
    border: '1px solid #eef2f7',
    borderRadius: 14,
    padding: 12,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
  },
  eventLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  eventRight: {
    display: 'flex',
    alignItems: 'flex-start',
  },
  eventBadge: {
    background: themePalette.secondary,
    color: '#111827',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700,
  },
  eventTitle: {
    fontWeight: 700,
  },
  eventMeta: {
    color: '#6b7280',
    fontSize: 13,
  },
  eventDesc: {
    color: '#374151',
    marginTop: 6,
  },
  errorToast: {
    position: 'fixed',
    left: 20,
    bottom: 20,
    background: themePalette.error,
    color: '#fff',
    padding: '10px 14px',
    borderRadius: 10,
    boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
    cursor: 'pointer',
    maxWidth: 420,
  },
  footer: {
    padding: 20,
    textAlign: 'center',
    color: '#6b7280',
  },
  // Responsive
  '@media (max-width: 900px)': {}, // placeholder if converting to CSS
};

export default App;
