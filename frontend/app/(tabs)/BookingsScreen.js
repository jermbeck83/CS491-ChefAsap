import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import getEnvVars from '../../config';

const START_HOUR = 6;
const END_HOUR = 23;
const STEP_MIN = 30;
const SLOT_HEIGHT = 40;
const PX_PER_MIN = SLOT_HEIGHT / STEP_MIN;

const TIME_COL_WIDTH = 68;
const DAY_COLUMN_WIDTH = 100;
const HEADER_HEIGHT = 50;

const GREEN = '#2d6a4f';
const GREEN_LIGHT = '#d8f3dc';
const BG = '#fefce8';
const BORDER = '#e2ece2';
const TEXT_DARK = '#1a2e1a';
const TEXT_MID = '#4a7c59';
const TEXT_SOFT = '#8aab8a';

const normalizeStatus = (s) => String(s || '').toLowerCase();
const CHEF_ALLOWED = new Set(['accepted', 'completed', 'confirm', 'confirmed']);
const CUSTOMER_ALLOWED = new Set(['pending', 'accepted', 'completed']);

async function fetchJsonSafe(url, options) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function getWeekStart(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function buildWeekDays(baseDate) {
  const start = getWeekStart(baseDate);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function buildTimeSlotsForDay(day) {
  const slots = [];
  const start = new Date(day);
  start.setHours(START_HOUR, 0, 0, 0);
  const end = new Date(day);
  end.setHours(END_HOUR, 0, 0, 0);
  for (let t = new Date(start); t < end; t = new Date(t.getTime() + STEP_MIN * 60000)) {
    slots.push({ start: new Date(t), end: new Date(t.getTime() + STEP_MIN * 60000) });
  }
  return slots;
}

function formatHourLabel(d) {
  const h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12} ${ampm}`;
}

function parseLocalDateTime(ymd, hm) {
  if (!ymd) return new Date(NaN);
  const [y, m, da] = ymd.split('-').map((x) => parseInt(x, 10));
  let hh = 0, mm = 0;
  if (hm && typeof hm === 'string') {
    const parts = hm.split(':').map((x) => parseInt(x, 10));
    hh = parts[0] || 0;
    mm = parts[1] || 0;
  }
  return new Date(y, (m || 1) - 1, da || 1, hh, mm, 0, 0);
}

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }
function formatYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatTime(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function formatHeader(d) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function BookingsScreen() {
  const { apiUrl } = getEnvVars();
  const { token, userType, profileId } = useAuth();
  const router = useRouter();

  const BOOKING_API_PREFIX = `${apiUrl}/booking`;

  const [baseDate, setBaseDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const weekDays = useMemo(() => buildWeekDays(baseDate), [baseDate]);

  const customerCalendarEndpoint = useMemo(() => {
    if (!token || !profileId || userType !== 'customer') return null;
    const start = formatYmd(weekDays[0]);
    const end = formatYmd(weekDays[6]);
    return `${BOOKING_API_PREFIX}/customer/${profileId}/calendar?start=${start}&end=${end}`;
  }, [BOOKING_API_PREFIX, token, userType, profileId, weekDays]);

  const chefCalendarEndpoint = useMemo(() => {
    if (!token || !profileId || userType !== 'chef') return null;
    const start = formatYmd(weekDays[0]);
    const end = formatYmd(weekDays[6]);
    return `${BOOKING_API_PREFIX}/chef/${profileId}/calendar?start=${start}&end=${end}`;
  }, [BOOKING_API_PREFIX, token, userType, profileId, weekDays]);

  const triggerRefresh = useCallback(() => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!token || !profileId) return;

      const weekStart = new Date(weekDays[0]); weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekDays[6]); weekEnd.setHours(23, 59, 59, 999);

      try {
        const endpoint = userType === 'chef' ? chefCalendarEndpoint : customerCalendarEndpoint;
        const allowed = userType === 'chef' ? CHEF_ALLOWED : CUSTOMER_ALLOWED;

        if (endpoint) {
          const payload = await fetchJsonSafe(endpoint, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const raw = Array.isArray(payload) ? payload : (payload?.data ?? []);
          const mapped = (raw || [])
            .map((b) => {
              const start = parseLocalDateTime(b.booking_date, b.booking_time);
              const dur = Number.isFinite(b?.duration_minutes) ? b.duration_minutes : 60;
              const end = new Date(start.getTime() + dur * 60000);
              const status = normalizeStatus(b.status || 'pending');
              return {
                id: b.booking_id ?? b.id,
                startDate: start,
                endDate: end,
                notes: b.special_notes ?? '',
                status,
                chef_id: b.chef_id,
                customer_id: b.customer_id,
                title: b.cuisine_type ? `${b.cuisine_type}${b.meal_type ? ` (${b.meal_type})` : ''}` : 'Booking',
              };
            })
            .filter((e) => e.startDate >= weekStart && e.startDate <= weekEnd)
            .filter((e) => allowed.has(e.status));
          if (!cancelled) setEvents(mapped);
          return;
        }
        if (!cancelled) setEvents([]);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, profileId, userType, customerCalendarEndpoint, chefCalendarEndpoint, baseDate, weekDays, refreshKey]);

  // Auto-scroll vertically to first event time (or 8 AM default)
  // AND horizontally to the day that has the first event
  useEffect(() => {
    if (loading) return;
    let targetHour = 8;
    let targetDayIdx = -1;

    if (events.length > 0) {
      const sorted = [...events].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
      const firstEvent = sorted[0];
      targetHour = Math.max(START_HOUR, new Date(firstEvent.startDate).getHours() - 1);

      // Find which day column index the first event falls on (0=Mon ... 6=Sun)
      const eventDate = new Date(firstEvent.startDate);
      const monday = getWeekStart(baseDate);
      const diffDays = Math.round((eventDate - monday) / (24 * 3600 * 1000));
      if (diffDays >= 0 && diffDays < 7) targetDayIdx = diffDays;
    }

    const scrollY = (targetHour - START_HOUR) * 60 * PX_PER_MIN;
    // Scroll to center the target day — subtract half screen width so it's centered
    const scrollX = targetDayIdx > 0 ? Math.max(0, targetDayIdx * DAY_COLUMN_WIDTH - DAY_COLUMN_WIDTH) : 0;

    setTimeout(() => {
      verticalScrollRef.current?.scrollTo({ y: scrollY, animated: true });
      if (scrollX > 0) {
        gridHScrollRef.current?.scrollTo({ x: scrollX, animated: true });
        headerHScrollRef.current?.scrollTo({ x: scrollX, animated: true });
      }
    }, 350);
  }, [events, loading]);

  // Auto-jump calendar to week of earliest upcoming booking
  // Only runs once after first load, not on every event change
  const hasAutoJumped = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (hasAutoJumped.current) return;

    // Fetch ALL bookings (not just current week) to find the next upcoming one
    const fetchUpcoming = async () => {
      if (!token || !profileId) return;
      try {
        const url = userType === 'chef'
          ? `${apiUrl}/booking/chef/${profileId}/bookings`
          : `${apiUrl}/booking/chef/${profileId}/bookings`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        const bookings = data.bookings || data || [];
        // Compare by date only (not time) so today's bookings are included
        const todayYmd = formatYmd(new Date());
        const upcoming = bookings
          .map(b => ({ ...b, startDate: parseLocalDateTime(b.booking_date, b.booking_time) }))
          .filter(b => b.booking_date >= todayYmd && (b.status === 'accepted' || b.status === 'pending'))
          .sort((a, b) => a.startDate - b.startDate);
        if (upcoming.length > 0) {
          hasAutoJumped.current = true;
          setBaseDate(upcoming[0].startDate);
        }
      } catch (e) {}
    };
    fetchUpcoming();
  }, [loading]);

  const onPrevWeek = () => setBaseDate((d) => { const nd = new Date(d); nd.setDate(d.getDate() - 7); return nd; });
  const onNextWeek = () => setBaseDate((d) => { const nd = new Date(d); nd.setDate(d.getDate() + 7); return nd; });
  const onToday = () => setBaseDate(new Date());

  const eventsByDay = useMemo(() => {
    const map = Array.from({ length: 7 }).map(() => []);
    const monday = getWeekStart(baseDate);
    events.forEach((e) => {
      const d = new Date(e.startDate);
      const idx = Math.floor(
        getWeekStart(d).getTime() === monday.getTime()
          ? (d.getDay() + 6) % 7
          : Math.round((d - monday) / (24 * 3600 * 1000))
      );
      if (idx >= 0 && idx < 7) map[idx].push(e);
    });
    return map;
  }, [events, baseDate]);

  const headerHScrollRef = useRef(null);
  const gridHScrollRef = useRef(null);
  const syncSourceRef = useRef(null);
  const verticalScrollRef = useRef(null);

  return (
    <View style={s.screen}>

      {/* Week controls */}
      <View style={s.weekBar}>
        <Text style={s.weekLabel}>Week of {formatHeader(weekDays[0])}</Text>
        <View style={s.weekBtns}>
          {[
            { label: 'Prev', onPress: onPrevWeek, active: false },
            { label: 'Today', onPress: onToday, active: true },
            { label: 'Next', onPress: onNextWeek, active: false },
          ].map(({ label, onPress, active }) => (
            <TouchableOpacity
              key={label}
              onPress={onPress}
              style={[s.weekBtn, active && s.weekBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.weekBtnText, active && s.weekBtnTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Day header */}
      <View style={s.dayHeaderRow}>
        <View style={{ width: TIME_COL_WIDTH, height: HEADER_HEIGHT, borderRightWidth: 1, borderRightColor: BORDER }} />
        <ScrollView
          ref={headerHScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            if (syncSourceRef.current === 'grid') return;
            syncSourceRef.current = 'header';
            gridHScrollRef.current?.scrollTo({ x, animated: false });
          }}
          onScrollEndDrag={() => { syncSourceRef.current = null; }}
          onMomentumScrollEnd={() => { syncSourceRef.current = null; }}
        >
          <View style={{ width: DAY_COLUMN_WIDTH * 7, height: HEADER_HEIGHT, flexDirection: 'row' }}>
            {weekDays.map((d, i) => (
              <View key={i} style={[s.dayHeaderCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: BORDER }]}>
                <Text style={s.dayHeaderText}>{formatHeader(d)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Grid */}
      <ScrollView ref={verticalScrollRef} nestedScrollEnabled scrollEventThrottle={16} showsVerticalScrollIndicator>
        <View style={{ flexDirection: 'row' }}>

          {/* Time column */}
          <View style={{ width: TIME_COL_WIDTH, borderRightWidth: 1, borderRightColor: BORDER }}>
            {(() => {
              const timeSlots = buildTimeSlotsForDay(weekDays[0]);
              const gridHeight = timeSlots.length * SLOT_HEIGHT;
              return (
                <View style={{ position: 'relative', height: gridHeight, backgroundColor: BG }}>
                  {timeSlots.map((slot, idx) => (
                    <View key={idx} style={{ height: SLOT_HEIGHT, borderTopWidth: slot.start.getMinutes() === 0 ? 1 : 0, borderTopColor: BORDER, backgroundColor: BG }} />
                  ))}
                  <View style={{ position: 'absolute', top: 8, left: 0, right: 0, height: gridHeight }}>
                    {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => {
                      const hour = START_HOUR + i;
                      const labelDate = new Date(weekDays[0]);
                      labelDate.setHours(hour, 0, 0, 0);
                      const top = i * 60 * PX_PER_MIN;
                      return (
                        <Text key={hour} style={[s.hourLabel, { top: Math.max(top - 8, 0) }]}>
                          {formatHourLabel(labelDate)}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              );
            })()}
          </View>

          {/* Day columns */}
          <ScrollView
            ref={gridHScrollRef}
            horizontal
            showsHorizontalScrollIndicator
            bounces={false}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              if (syncSourceRef.current === 'header') return;
              syncSourceRef.current = 'grid';
              headerHScrollRef.current?.scrollTo({ x, animated: false });
            }}
            onScrollEndDrag={() => { syncSourceRef.current = null; }}
            onMomentumScrollEnd={() => { syncSourceRef.current = null; }}
          >
            <View style={{ width: DAY_COLUMN_WIDTH * 7, flexDirection: 'row' }}>
              {weekDays.map((day, dayIdx) => {
                const daySlots = buildTimeSlotsForDay(day);
                const dayEvents = eventsByDay[dayIdx] || [];
                const dayStart = new Date(day); dayStart.setHours(START_HOUR, 0, 0, 0);
                const dayEnd = new Date(day); dayEnd.setHours(END_HOUR, 0, 0, 0);
                const gridHeight = daySlots.length * SLOT_HEIGHT;

                return (
                  <View key={dayIdx} style={[{ width: DAY_COLUMN_WIDTH, position: 'relative' }, dayIdx > 0 && { borderLeftWidth: 1, borderLeftColor: BORDER }]}>
                    {daySlots.map((slot, sIdx) => (
                      <View
                        key={sIdx}
                        style={{
                          height: SLOT_HEIGHT,
                          backgroundColor: BG,
                          borderTopWidth: slot.start.getMinutes() === 0 ? 1 : 0,
                          borderTopColor: BORDER,
                          borderBottomWidth: 1,
                          borderBottomColor: '#f0f5f0',
                        }}
                      />
                    ))}
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: gridHeight }} pointerEvents="box-none">
                      {dayEvents.map((evt) => {
                        const start = new Date(evt.startDate);
                        const end = new Date(evt.endDate);
                        const clippedStart = start < dayStart ? dayStart : start;
                        const clippedEnd = end > dayEnd ? dayEnd : end;
                        if (clippedEnd <= clippedStart) return null;

                        const minutesFromDayStart = (clippedStart - dayStart) / 60000;
                        const durationMin = (clippedEnd - clippedStart) / 60000;
                        const top = minutesFromDayStart * PX_PER_MIN;
                        const height = Math.max(durationMin * PX_PER_MIN - 4, 24);

                        const status = evt.status || 'scheduled';
                        const evtBg = status === 'cancelled' ? '#fee2e2' : status === 'completed' ? GREEN_LIGHT : '#dbeafe';
                        const evtBorder = status === 'cancelled' ? '#ef4444' : status === 'completed' ? GREEN : '#3b82f6';
                        const evtText = status === 'cancelled' ? '#991b1b' : status === 'completed' ? '#1a4731' : '#1e40af';

                        return (
                          <TouchableOpacity
                            key={evt.id || `${start.getTime()}`}
                            onPress={() => setSelected(evt)}
                            activeOpacity={0.8}
                            style={{
                              position: 'absolute', top, height,
                              left: 2, right: 2,
                              backgroundColor: evtBg,
                              borderLeftWidth: 3,
                              borderLeftColor: evtBorder,
                              borderRadius: 6,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              overflow: 'hidden',
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '600', color: evtText }}>
                              {formatTime(clippedStart)}–{formatTime(clippedEnd)} {evt.title || 'Booking'}
                            </Text>
                            {!!evt.notes && (
                              <Text numberOfLines={1} style={{ fontSize: 10, color: evtText, marginTop: 1 }}>
                                {evt.notes}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={s.footer}>
        <TouchableOpacity style={s.primaryBtn} onPress={triggerRefresh} activeOpacity={0.85}>
          <Text style={s.primaryBtnText}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
        </TouchableOpacity>
        {userType === 'customer' && (
          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.push('/ChefOrdersScreen')} activeOpacity={0.85}>
            <Text style={s.secondaryBtnText}>View My Bookings</Text>
          </TouchableOpacity>
        )}
        {userType === 'chef' && (
          <TouchableOpacity style={s.secondaryBtn} onPress={() => router.push('/ChefOrdersScreen')} activeOpacity={0.85}>
            <Text style={s.secondaryBtnText}>View My Orders</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Event modal */}
      <Modal visible={!!selected} animationType="fade" transparent onRequestClose={() => setSelected(null)}>
        <View style={s.modalOverlay}>
          <Pressable onPress={() => setSelected(null)} style={{ position: 'absolute', inset: 0 }} />
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{selected?.title || 'Booking'}</Text>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <Text style={s.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.modalBody}>
              {selected?.status && (
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Status</Text>
                  <Text style={s.modalValue}>{String(selected.status).charAt(0).toUpperCase() + String(selected.status).slice(1)}</Text>
                </View>
              )}
              {selected?.startDate && (
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Date</Text>
                  <Text style={s.modalValue}>{formatHeader(new Date(selected.startDate))}</Text>
                </View>
              )}
              {selected?.startDate && selected?.endDate && (
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Time</Text>
                  <Text style={s.modalValue}>{formatTime(new Date(selected.startDate))} – {formatTime(new Date(selected.endDate))}</Text>
                </View>
              )}
              {selected?.startDate && selected?.endDate && (
                <View style={s.modalRow}>
                  <Text style={s.modalLabel}>Duration</Text>
                  <Text style={s.modalValue}>{Math.max(1, Math.round((new Date(selected.endDate) - new Date(selected.startDate)) / 60000))} min</Text>
                </View>
              )}
              {!!selected?.notes && (
                <View style={[s.modalRow, { marginTop: 8 }]}>
                  <Text style={s.modalLabel}>Notes</Text>
                  <Text style={s.modalValue}>{selected.notes}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={[s.primaryBtn, { margin: 16, marginTop: 0 }]} onPress={() => setSelected(null)}>
              <Text style={s.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  weekBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: BG, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  weekLabel: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  weekBtns: { flexDirection: 'row', gap: 6 },
  weekBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: BG,
  },
  weekBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  weekBtnText: { fontSize: 13, fontWeight: '600', color: TEXT_MID },
  weekBtnTextActive: { color: '#fff' },
  dayHeaderRow: {
    flexDirection: 'row', backgroundColor: BG,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  dayHeaderCell: {
    width: DAY_COLUMN_WIDTH, height: HEADER_HEIGHT,
    alignItems: 'center', justifyContent: 'center',
  },
  dayHeaderText: { fontSize: 12, fontWeight: '600', color: TEXT_MID },
  hourLabel: {
    position: 'absolute', right: 8,
    fontSize: 11, fontWeight: '600', color: TEXT_SOFT, textAlign: 'right',
  },
  footer: {
    backgroundColor: BG, padding: 12,
    borderTopWidth: 1, borderTopColor: BORDER, gap: 8,
  },
  primaryBtn: {
    backgroundColor: GREEN, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: BG,
  },
  secondaryBtnText: { color: TEXT_MID, fontSize: 15, fontWeight: '600' },
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    width: '88%', maxWidth: 360, backgroundColor: '#fff',
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: TEXT_DARK },
  modalClose: { fontSize: 18, color: TEXT_SOFT, fontWeight: '400' },
  modalBody: { padding: 16, gap: 10 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modalLabel: { fontSize: 13, color: TEXT_SOFT, fontWeight: '500' },
  modalValue: { fontSize: 13, color: TEXT_DARK, fontWeight: '600', flex: 1, textAlign: 'right' },
});