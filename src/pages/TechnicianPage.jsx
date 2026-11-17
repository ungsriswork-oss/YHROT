import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Users,
  Clock,
  Plus,
  Edit2,
  Trash2,
  UserPlus,
  Wand2,
  Settings,
  CalendarDays,
  CheckCircle2,
  X,
  Printer,
  Download,
  ArrowLeft,
} from 'lucide-react';

// --- นำเข้าคำสั่งของ Firebase ---
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// --- Custom Hook สำหรับจัดการ Firebase Sync ---
function useFirebaseSync(key, initialValue) {
  const [storedValue, setStoredValue] = useState(initialValue);

  useEffect(() => {
    const docRef = doc(db, 'shift_data', key);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setStoredValue(docSnap.data().value);
      } else {
        setDoc(docRef, { value: initialValue });
      }
    });
    return () => unsubscribe();
  }, [key]);

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      const docRef = doc(db, 'shift_data', key);
      setDoc(docRef, { value: valueToStore });
    } catch (error) {
      console.error("Firebase Sync Error:", error);
    }
  };

  return [storedValue, setValue];
}

// === TC_ENGINE_START ===
// ==========================================
// เครื่องมือสุ่มเวรเจ้าพนักงานเภสัชกรรม (pure functions — ไม่แตะ state ของ React)
// ==========================================

// ค่าเวร: ถ้ากำหนด shift.value ไว้ ใช้ค่านั้น, ถ้าไม่กำหนด คิดแบบเดิม (ชม. × 100)
const TC_HOURLY_FALLBACK = 100;

const tcPad2 = (n) => String(n).padStart(2, '0');
const tcDateStr = (y, m0, d) => `${y}-${tcPad2(m0 + 1)}-${tcPad2(d)}`;

// ตรวจว่าเวรนี้เปิดในวันนี้หรือไม่ (ตาม allowedDays)
const tcShiftOpenOnDay = (shift, dow, isHolidayFlag) => {
  const isWeekend = dow === 0 || dow === 6;
  const isHoliday = isWeekend || isHolidayFlag;
  const allowed = shift.allowedDays || 'all';
  if (allowed === 'weekdays') return !isHoliday;
  if (allowed === 'weekends_holidays') return isHoliday;
  if (allowed === 'saturdays_only') return dow === 6;
  if (allowed === 'mon_tue_only') return [1, 2].includes(dow) && !isHoliday;
  if (allowed === 'holidays_except_saturday') return isHoliday && dow !== 6;
  if (allowed === 'weekends_only') return isWeekend;
  if (allowed === 'weekday_holidays') return !isWeekend && isHolidayFlag;
  return true;
};

// จำนวนคนที่เวรนี้ต้องการในวันนั้น (รองรับเวรที่เปิดตามยอดคนไข้ เช่น 4S2)
const tcShiftNeedOnDay = (shift, dateStr, dow, isHolidayFlag, patientCounts) => {
  if (!tcShiftOpenOnDay(shift, dow, isHolidayFlag)) return 0;
  if (shift.dynamic === 'patient') {
    const appt = Number((patientCounts || {})[dateStr]) || 0;
    const th = Number(shift.minAppt) || 0;
    if (appt <= 0 || appt < th) return 0;
    return 1;
  }
  return Math.max(1, Number(shift.min) || 1);
};

// เพดานจำนวนเวรต่อคนต่อเดือน: นับรวมทุกเวรในกลุ่มเดียวกัน
// - เวรที่เปิดตามยอดคนไข้ นับเป็นกลุ่มเดียวกัน
const tcCapGroupKey = (shift) => (shift.dynamic ? `dyn:${shift.dynamic}` : shift.id);
const tcCapOf = (shift) => {
  if (shift.capPerPerson !== undefined && shift.capPerPerson !== null && shift.capPerPerson !== '') {
    const v = Number(shift.capPerPerson);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  return null;
};

// วันที่ (YYYY-MM-DD) อยู่ในช่วงงดเวรของพนักงานหรือไม่ — from/to ว่างได้ (= ไม่จำกัด)
const tcInOffRange = (emp, dateStr) =>
  (emp.offRanges || []).some(
    (r) => r && (r.from || r.to) && (!r.from || dateStr >= r.from) && (!r.to || dateStr <= r.to)
  );
const TC_TH_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const tcFmtThaiDate = (ds) => {
  if (!ds) return '';
  const [y, m, d] = ds.split('-').map(Number);
  if (!y || !m || !d) return ds;
  return `${d} ${TC_TH_MONTH_SHORT[m - 1]} ${y + 543}`;
};
const tcMoneyOffsetOf = (emp) => {
  const v = Number(emp && emp.moneyOffset);
  return Number.isFinite(v) ? v : 0;
};

// ขั้นต่ำต่อคนต่อเดือน: เวรที่ตั้ง "กลุ่มขั้นต่ำ" ชื่อเดียวกันจะนับรวมกัน (เช่น OE + IE = กลุ่ม "บ่าย")
const tcMinPerPersonOf = (shift) => {
  const v = Number(shift.minPerPerson);
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const tcMinGroupKey = (shift) =>
  shift.minGroup && String(shift.minGroup).trim() ? `g:${String(shift.minGroup).trim()}` : `id:${shift.id}`;
const tcMinGroupLabel = (shift, shifts) => {
  if (!(shift.minGroup && String(shift.minGroup).trim())) return shift.name;
  const key = tcMinGroupKey(shift);
  return shifts
    .filter((x) => tcMinPerPersonOf(x) > 0 && tcMinGroupKey(x) === key)
    .map((x) => x.name)
    .join('/');
};

// สร้าง context: วัน, ช่องเวร, สิทธิ์ของพนักงาน
function tcBuildContext({
  year,
  month,
  employees,
  shifts,
  holidays,
  patientCounts,
  rules,
  prevDayWorkers,
  prevDayRestWorkers,
  nextDayWorkers,
}) {
  const D = new Date(year, month + 1, 0).getDate();
  const shiftIdx = {};
  shifts.forEach((s, i) => (shiftIdx[s.id] = i));
  const shiftValue = shifts.map((s) => tcGetShiftValue(s));
  const capKeys = [];
  const capGroup = shifts.map((s) => {
    const k = tcCapGroupKey(s);
    let g = capKeys.indexOf(k);
    if (g < 0) {
      capKeys.push(k);
      g = capKeys.length - 1;
    }
    return g;
  });
  const capOf = shifts.map((s) => tcCapOf(s));
  const balanceShift = shifts.map((s) => !!s.balanceAmong);

  const days = [];
  for (let d = 1; d <= D; d++) {
    const dateStr = tcDateStr(year, month, d);
    const dow = new Date(year, month, d).getDay();
    const hol = !!(holidays || {})[dateStr];
    const slots = [];
    shifts.forEach((s, si) => {
      const need = tcShiftNeedOnDay(s, dateStr, dow, hol, patientCounts);
      for (let k = 0; k < need; k++) slots.push(si);
    });
    days.push({ dateStr, dow, slots });
  }

  const N = employees.length;
  // can[i][si] = พนักงาน i ลงเวร si ได้ไหม (ไม่สนวัน)
  const can = employees.map((e) =>
    shifts.map((s) => {
      if (e.offShifts && e.offShifts.includes(s.id)) return false;
      if (e.specificShifts && e.specificShifts.length > 0 && !e.specificShifts.includes(s.id))
        return false;
      return true;
    })
  );
  // ห้ามเวรนี้เฉพาะบางวันในสัปดาห์
  const offDow = employees.map((e) =>
    shifts.map((s) => {
      const arr = (e.offShiftDays || {})[s.id];
      return Array.isArray(arr) ? arr.map(Number) : [];
    })
  );
  // จำนวนเวรตายตัว (เช่น อารียา P = 5)
  const fixed = employees.map((e) =>
    shifts.map((s) => {
      const v = (e.fixedCounts || {})[s.id];
      return v === undefined || v === null || v === '' ? null : Number(v);
    })
  );
  // กลุ่มขั้นต่ำ
  const minGroups = [];
  const minGroupOf = shifts.map(() => -1);
  shifts.forEach((sh, si) => {
    const mn = tcMinPerPersonOf(sh);
    if (mn <= 0) return;
    const key = tcMinGroupKey(sh);
    let g = minGroups.findIndex((x) => x.key === key);
    if (g < 0) {
      minGroups.push({ key, members: [], min: 0, label: tcMinGroupLabel(sh, shifts) });
      g = minGroups.length - 1;
    }
    minGroups[g].members.push(si);
    minGroups[g].min = Math.max(minGroups[g].min, mn);
    minGroupOf[si] = g;
  });
  minGroups.forEach((g) => {
    g.eligible = [];
    employees.forEach((_, i) => {
      if (g.members.some((si) => can[i][si])) g.eligible.push(i);
    });
  });
  // ช่วงงดเวร (ลาคลอด / ยังไม่เริ่มขึ้นเวร ฯลฯ): unavail[i][d]
  const unavail = employees.map((e) => days.map((dy) => tcInOffRange(e, dy.dateStr)));
  const fullMonth = unavail.map((arr) => arr.every((x) => !x));
  // เวรที่ห้ามอยู่ในคนเดียวกันในเดือนเดียวกัน (เช่น S1/4O กับ 4S1)
  const excl = shifts.map((s) =>
    (s.exclusiveWith || []).map((id) => shiftIdx[id]).filter((x) => x !== undefined)
  );
  // คนที่ลงเวรนี้ วันถัดไปห้ามมีเวร (เช่น ด1, ด2)
  const restAfter = shifts.map((s) => !!s.restAfter);
  const moneyOffset = employees.map((e) => tcMoneyOffsetOf(e));
  // เฉลี่ยเงินเฉพาะคนที่อยู่เวรได้ทั้งเดือน
  const balance = employees.map((e, i) => !e.excludeFromBalance && fullMonth[i]);
  const dedicated = employees.map((e) => !!(e.specificShifts && e.specificShifts.length > 0));
  const empIdx = {};
  employees.forEach((e, i) => (empIdx[e.id] = i));
  const toIdxSet = (ids) => {
    const set = new Set();
    (ids || []).forEach((id) => {
      if (empIdx[id] !== undefined) set.add(empIdx[id]);
    });
    return set;
  };

  return {
    D,
    N,
    S: shifts.length,
    days,
    shifts,
    shiftIdx,
    shiftValue,
    capGroup,
    capOf,
    G: capKeys.length,
    balanceShift,
    minGroups,
    minGroupOf,
    can,
    offDow,
    fixed,
    balance,
    dedicated,
    employees,
    unavail,
    fullMonth,
    excl,
    restAfter,
    moneyOffset,
    // กฎห้ามเวรติดกันของเจ้าพนักงาน = "พยายามหลีกเลี่ยง" (ไม่บังคับ) — บังคับเฉพาะหลังเวรที่ต้องพัก (ด1/ด2)
    noConsec: false,
    softConsec: rules ? rules.tech_noConsecutive !== false : true,
    balanceTypes: rules ? rules.tech_balanceTypes !== false : true,
    balanceMoney: rules ? rules.tech_balanceMoneyHours !== false : true,
    prevSet: toIdxSet(prevDayWorkers),
    prevRestSet: toIdxSet(prevDayRestWorkers),
    nextSet: toIdxSet(nextDayWorkers),
  };
}

const tcGetShiftValue = (shift) => {
  if (!shift) return 0;
  if (shift.value !== undefined && shift.value !== null && shift.value !== '') {
    const v = Number(shift.value);
    if (Number.isFinite(v)) return v;
  }
  if (!shift.name || !shift.start || !shift.end) return 0;
  const [h1, m1] = shift.start.split(':').map(Number);
  const [h2, m2] = shift.end.split(':').map(Number);
  let hrs = h2 - h1 + (m2 - m1) / 60;
  if (hrs < 0) hrs += 24;
  return hrs * TC_HOURLY_FALLBACK;
};

// ---------- state ของการสุ่ม 1 รอบ ----------
function tcNewState(ctx) {
  const { D, N, S, days } = ctx;
  return {
    dayEmp: days.map(() => new Array(N).fill(-1)), // dayEmp[d][i] = slot index หรือ -1
    slotEmp: days.map((dy) => new Array(dy.slots.length).fill(-1)),
    cnt: Array.from({ length: N }, () => new Array(S).fill(0)),
    gcnt: Array.from({ length: N }, () => new Array(ctx.G).fill(0)),
    money: new Array(N).fill(0),
    total: new Array(N).fill(0),
    log: null, // undo log (ใช้ตอน repair)
  };
}

function tcAssign(ctx, st, d, k, i) {
  const si = ctx.days[d].slots[k];
  st.slotEmp[d][k] = i;
  st.dayEmp[d][i] = k;
  st.cnt[i][si]++;
  st.gcnt[i][ctx.capGroup[si]]++;
  st.money[i] += ctx.shiftValue[si];
  st.total[i]++;
  if (st.log) st.log.push([0, d, k, i]);
}
function tcUnassign(ctx, st, d, k) {
  const i = st.slotEmp[d][k];
  if (i < 0) return -1;
  const si = ctx.days[d].slots[k];
  st.slotEmp[d][k] = -1;
  st.dayEmp[d][i] = -1;
  st.cnt[i][si]--;
  st.gcnt[i][ctx.capGroup[si]]--;
  st.money[i] -= ctx.shiftValue[si];
  st.total[i]--;
  if (st.log) st.log.push([1, d, k, i]);
  return i;
}
function tcRollback(ctx, st, mark) {
  const log = st.log;
  st.log = null;
  while (log.length > mark) {
    const [op, d, k, i] = log.pop();
    if (op === 0) tcUnassign(ctx, st, d, k);
    else tcAssign(ctx, st, d, k, i);
  }
  st.log = log;
}

// พนักงาน i ลงเวร si ในวัน d ได้ตามคุณสมบัติ (ไม่รวมเรื่องวันติดกัน)
function tcStaticOk(ctx, st, i, d, si) {
  if (!ctx.can[i][si]) return false;
  if (ctx.unavail[i][d]) return false;
  // เวรที่ห้ามอยู่คนเดียวกันในเดือนเดียวกัน
  for (const x of ctx.excl[si]) if (st.cnt[i][x] > 0) return false;
  // พักหลังเวรดึก: เมื่อวานลงเวรที่ต้องพัก → วันนี้ห้ามมีเวร
  if (d === 0) {
    if (ctx.prevRestSet.has(i)) return false;
  } else {
    const kp = st.dayEmp[d - 1][i];
    if (kp >= 0 && ctx.restAfter[ctx.days[d - 1].slots[kp]]) return false;
  }
  // เวรนี้ต้องพัก → พรุ่งนี้ต้องว่าง
  if (ctx.restAfter[si]) {
    if (d === ctx.D - 1 ? ctx.nextSet.has(i) : st.dayEmp[d + 1][i] >= 0) return false;
  }
  if (ctx.offDow[i][si].includes(ctx.days[d].dow)) return false;
  const fx = ctx.fixed[i][si];
  if (fx !== null && st.cnt[i][si] >= fx) return false;
  const cap = ctx.capOf[si];
  if (cap !== null && st.gcnt[i][ctx.capGroup[si]] >= cap) return false;
  return true;
}
// มีเวรในวัน d±1 (รวมข้ามเดือน) หรือไม่
function tcWorksAdjacent(ctx, st, i, d) {
  if (!ctx.noConsec) return false;
  if (d === 0 ? ctx.prevSet.has(i) : st.dayEmp[d - 1][i] >= 0) return true;
  if (d === ctx.D - 1 ? ctx.nextSet.has(i) : st.dayEmp[d + 1][i] >= 0) return true;
  return false;
}

// ลำดับความชอบของพนักงานสำหรับเวร si (ต่ำ = ได้ก่อน)
// มีเวรวันก่อน/วันถัดไปหรือไม่ (ใช้กับกฎ "พยายามไม่ให้ติดกัน")
function tcAdjacentSoft(ctx, st, i, d) {
  if (d === 0 ? ctx.prevSet.has(i) : st.dayEmp[d - 1][i] >= 0) return true;
  if (d === ctx.D - 1 ? ctx.nextSet.has(i) : st.dayEmp[d + 1][i] >= 0) return true;
  return false;
}
// จำนวนคู่วันที่มีเวรติดกัน (รวมข้ามเดือน)
function tcConsecCount(ctx, st) {
  let c = 0;
  for (let i = 0; i < ctx.N; i++) {
    if (ctx.prevSet.has(i) && st.dayEmp[0][i] >= 0) c++;
    for (let d = 1; d < ctx.D; d++) if (st.dayEmp[d][i] >= 0 && st.dayEmp[d - 1][i] >= 0) c++;
    if (ctx.nextSet.has(i) && st.dayEmp[ctx.D - 1][i] >= 0) c++;
  }
  return c;
}

function tcPrefKey(ctx, st, i, si, noise, d) {
  let key = 0;
  const fx = ctx.fixed[i][si];
  if (fx !== null && st.cnt[i][si] < fx) key -= 1e9; // ต้องได้ครบจำนวนตายตัว
  const mg = ctx.minGroupOf[si];
  if (mg >= 0 && tcGroupCount(ctx, st, i, mg) < ctx.minGroups[mg].min) key -= 5e8; // ยังไม่ถึงขั้นต่ำ
  if (ctx.balanceShift[si]) key += st.cnt[i][si] * 1e8; // เวรที่ต้องเฉลี่ยให้เท่ากันระหว่างคนที่ลงได้
  else if (ctx.dedicated[i]) key -= 1e8; // คนที่ลงได้เฉพาะบางเวร ให้ได้เวรนั้นก่อน
  if (ctx.balanceTypes && fx === null) key += st.cnt[i][si] * 1e6; // หลีกเลี่ยงตัวเวรซ้ำ
  if (ctx.softConsec && tcAdjacentSoft(ctx, st, i, d)) key += 5e5; // พยายามไม่ให้เวรติดกัน
  if (ctx.balanceMoney && ctx.balance[i]) key += st.money[i] + ctx.moneyOffset[i];
  key += st.total[i] * 50;
  key += noise() * 400;
  return key;
}

// ---------- Phase 1: จับคู่ทีละวัน โดยมองวันพรุ่งนี้ไปพร้อมกัน ----------
function tcGreedyDay(ctx, st, d, rand) {
  const { days, N, D } = ctx;
  const noConsec = ctx.softConsec; // ขั้นจับคู่: พยายามไม่ให้ติดกัน (ช่องที่เหลือจะเติมในขั้นซ่อม)
  const left = []; // {d, k, si}
  const scarcity = (dd, si) => {
    let c = 0;
    for (let i = 0; i < N; i++) if (tcStaticOk(ctx, st, i, dd, si)) c++;
    return c;
  };
  const pushDay = (dd) => {
    const arr = days[dd].slots.map((si, k) => ({ d: dd, k, si, sc: scarcity(dd, si) + rand() }));
    arr.sort((a, b) => a.sc - b.sc);
    arr.forEach((x) => left.push(x));
  };
  pushDay(d);
  const look = noConsec && d + 1 < D;
  if (look) pushDay(d + 1);

  // คนที่ลงวัน d ได้ / วัน d+1 ได้ (เรื่องวันติดกัน)
  const okDay = (i, dd) => {
    if (st.dayEmp[dd][i] >= 0) return false;
    if (!noConsec) return true;
    if (dd === 0 ? ctx.prevSet.has(i) : st.dayEmp[dd - 1][i] >= 0) return false;
    if (dd === D - 1 ? ctx.nextSet.has(i) : st.dayEmp[dd + 1][i] >= 0) return false;
    return true;
  };

  const adj = left.map((u) => {
    const cands = [];
    for (const i of st.perm) {
      if (!okDay(i, u.d)) continue;
      if (!tcStaticOk(ctx, st, i, u.d, u.si)) continue;
      cands.push({ i, key: tcPrefKey(ctx, st, i, u.si, rand, u.d) });
    }
    cands.sort((a, b) => a.key - b.key);
    return cands.map((c) => c.i);
  });

  const matchR = new Array(N).fill(-1); // person -> left index
  const tryKuhn = (u, seen) => {
    for (const i of adj[u]) {
      if (seen[i]) continue;
      seen[i] = 1;
      if (matchR[i] === -1 || tryKuhn(matchR[i], seen)) {
        matchR[i] = u;
        return true;
      }
    }
    return false;
  };
  for (let u = 0; u < left.length; u++) tryKuhn(u, new Uint8Array(N));

  for (let i = 0; i < N; i++) {
    const u = matchR[i];
    if (u >= 0 && left[u].d === d) tcAssign(ctx, st, d, left[u].k, i);
  }
}

// ---------- Phase 2: ซ่อมช่องว่างด้วยการย้ายต่อกันเป็นทอด (ejection chain) ----------
function tcTryFill(ctx, st, d, k, depth, banned, rand) {
  const { N, D, noConsec } = ctx;
  if (--st.budget < 0) return false;
  const si = ctx.days[d].slots[k];
  const order = [];
  for (let i = 0; i < N; i++) order.push(i);
  for (let a = order.length - 1; a > 0; a--) {
    const b = Math.floor(rand() * (a + 1));
    [order[a], order[b]] = [order[b], order[a]];
  }
  // ลองคนที่ไม่ต้องย้ายใครก่อน
  for (const i of order) {
    if (banned.has(i)) continue;
    if (st.dayEmp[d][i] >= 0) continue;
    if (!tcStaticOk(ctx, st, i, d, si)) continue;
    if (tcWorksAdjacent(ctx, st, i, d)) continue;
    tcAssign(ctx, st, d, k, i);
    return true;
  }
  if (depth <= 0) return false;
  for (const i of order) {
    if (banned.has(i)) continue;
    if (!ctx.can[i][si] || ctx.offDow[i][si].includes(ctx.days[d].dow)) continue;
    // ช่องที่ขวางอยู่
    const conflicts = [];
    if (st.dayEmp[d][i] >= 0) conflicts.push([d, st.dayEmp[d][i]]);
    if (noConsec) {
      if (d === 0 ? ctx.prevSet.has(i) : false) continue; // ข้ามเดือนย้ายไม่ได้
      if (d === D - 1 ? ctx.nextSet.has(i) : false) continue;
      if (d > 0 && st.dayEmp[d - 1][i] >= 0) conflicts.push([d - 1, st.dayEmp[d - 1][i]]);
      if (d < D - 1 && st.dayEmp[d + 1][i] >= 0) conflicts.push([d + 1, st.dayEmp[d + 1][i]]);
    }
    if (conflicts.length === 0 || conflicts.length > 2) continue;
    const mark = st.log.length;
    conflicts.forEach(([cd, ck]) => tcUnassign(ctx, st, cd, ck));
    if (!tcStaticOk(ctx, st, i, d, si)) {
      tcRollback(ctx, st, mark);
      continue;
    }
    tcAssign(ctx, st, d, k, i);
    const nb = new Set(banned);
    nb.add(i);
    let ok = true;
    for (const [cd, ck] of conflicts) {
      if (!tcTryFill(ctx, st, cd, ck, depth - 1, nb, rand)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
    tcRollback(ctx, st, mark);
  }
  return false;
}

function tcRepair(ctx, st, rand) {
  st.log = [];
  let total = 30000; // จำกัดงานต่อรอบ กันหน้าเว็บค้างเมื่อเดือนนั้นจัดให้ครบไม่ได้จริง ๆ
  for (let depth = 1; depth <= 3; depth++) {
    for (let d = 0; d < ctx.D; d++) {
      for (let k = 0; k < ctx.days[d].slots.length; k++) {
        if (st.slotEmp[d][k] >= 0) continue;
        if (total <= 0) break;
        st.log.length = 0;
        st.budget = Math.min(4000, total);
        const before = st.budget;
        tcTryFill(ctx, st, d, k, depth, new Set(), rand);
        total -= before - Math.max(0, st.budget);
      }
    }
  }
  st.log = null;
}

// ---------- คะแนน ----------
function tcDupCount(ctx, st, i) {
  let dup = 0;
  for (let si = 0; si < ctx.S; si++) {
    if (ctx.fixed[i][si] !== null) continue;
    if (st.cnt[i][si] > 1) dup += st.cnt[i][si] - 1;
  }
  return dup;
}
// เวรที่ติ๊ก "เฉลี่ยให้เท่ากัน": ผลรวมของ (มากสุด − น้อยสุด − 1) ระหว่างคนที่ลงได้ (ต่างกันไม่เกิน 1 = ไม่ปรับ)
function tcBalanceGap(ctx, st) {
  let gap = 0;
  for (let si = 0; si < ctx.S; si++) {
    if (!ctx.balanceShift[si]) continue;
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < ctx.N; i++) {
      if (!ctx.can[i][si]) continue;
      mn = Math.min(mn, st.cnt[i][si]);
      mx = Math.max(mx, st.cnt[i][si]);
    }
    if (mx - mn > 1) gap += mx - mn - 1;
  }
  return gap;
}
function tcFixedDiff(ctx, st) {
  let diff = 0;
  for (let i = 0; i < ctx.N; i++)
    for (let si = 0; si < ctx.S; si++) {
      const fx = ctx.fixed[i][si];
      if (fx !== null) diff += Math.abs(fx - st.cnt[i][si]);
    }
  return diff;
}
function tcMoneyStats(ctx, st) {
  const vals = [];
  for (let i = 0; i < ctx.N; i++) if (ctx.balance[i]) vals.push(st.money[i] + ctx.moneyOffset[i]);
  if (vals.length === 0) return { std: 0, range: 0, min: 0, max: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, v) => a + (v - mean) * (v - mean), 0) / vals.length);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return { std, range: max - min, min, max };
}
function tcGroupCount(ctx, st, i, g) {
  let c = 0;
  for (const si of ctx.minGroups[g].members) c += st.cnt[i][si];
  return c;
}
// จำนวนเวรที่ยังขาดจากขั้นต่ำ รวมทุกคนทุกกลุ่ม
function tcMinShort(ctx, st) {
  let short = 0;
  ctx.minGroups.forEach((grp, g) => {
    grp.eligible.forEach((i) => {
      const c = tcGroupCount(ctx, st, i, g);
      if (c < grp.min) short += grp.min - c;
    });
  });
  return short;
}
function tcSoftScore(ctx, st) {
  let dup = 0;
  for (let i = 0; i < ctx.N; i++) dup += tcDupCount(ctx, st, i);
  const m = tcMoneyStats(ctx, st);
  let s = tcFixedDiff(ctx, st) * 1e6;
  s += tcBalanceGap(ctx, st) * 5000;
  s += tcMinShort(ctx, st) * 2e6;
  if (ctx.balanceTypes) s += dup * 200;
  if (ctx.balanceMoney) s += m.std * 2 + m.range * 0.5;
  if (ctx.softConsec) s += tcConsecCount(ctx, st) * 30;
  return s;
}
function tcMissing(ctx, st) {
  let miss = 0;
  st.slotEmp.forEach((arr) => arr.forEach((i) => (i < 0 ? miss++ : 0)));
  return miss;
}

// ---------- Phase 3: ปรับให้เงิน/ตัวเวรสมดุล (ไม่ละเมิดกฎบังคับ) ----------
function tcImprove(ctx, st, rand, iters) {
  const { D, N } = ctx;
  let cur = tcSoftScore(ctx, st);
  for (let it = 0; it < iters; it++) {
    const d = Math.floor(rand() * D);
    const nk = ctx.days[d].slots.length;
    if (nk === 0) continue;
    const k1 = Math.floor(rand() * nk);
    const i = st.slotEmp[d][k1];
    if (i < 0) continue;
    const si1 = ctx.days[d].slots[k1];
    const mv = rand();
    if (mv < 0.34) {
      // แลกเวรต่างวันกัน: i รับเวรของ j ในวัน d2, j รับเวรของ i ในวัน d
      const d2 = Math.floor(rand() * D);
      const nk2 = ctx.days[d2].slots.length;
      if (d2 === d || nk2 === 0) continue;
      const k2 = Math.floor(rand() * nk2);
      const j = st.slotEmp[d2][k2];
      if (j < 0 || j === i) continue;
      if (st.dayEmp[d2][i] >= 0 || st.dayEmp[d][j] >= 0) continue;
      const si2 = ctx.days[d2].slots[k2];
      tcUnassign(ctx, st, d, k1);
      tcUnassign(ctx, st, d2, k2);
      if (tcStaticOk(ctx, st, i, d2, si2) && tcStaticOk(ctx, st, j, d, si1)) {
        tcAssign(ctx, st, d2, k2, i);
        tcAssign(ctx, st, d, k1, j);
        // ตรวจซ้ำหลังลงทั้งคู่ (กฎพักหลังเวรดึก / เวรห้ามคู่กันในเดือน)
        tcUnassign(ctx, st, d2, k2);
        const okI = tcStaticOk(ctx, st, i, d2, si2);
        tcAssign(ctx, st, d2, k2, i);
        tcUnassign(ctx, st, d, k1);
        const okJ = tcStaticOk(ctx, st, j, d, si1);
        tcAssign(ctx, st, d, k1, j);
        if (okI && okJ) {
          const nw = tcSoftScore(ctx, st);
          if (nw <= cur) {
            cur = nw;
            continue;
          }
        }
        tcUnassign(ctx, st, d, k1);
        tcUnassign(ctx, st, d2, k2);
      }
      tcAssign(ctx, st, d, k1, i);
      tcAssign(ctx, st, d2, k2, j);
    } else if (mv < 0.67) {
      // สลับเวรกันในวันเดียวกัน
      const k2 = Math.floor(rand() * nk);
      const j = st.slotEmp[d][k2];
      const si2 = ctx.days[d].slots[k2];
      if (k2 === k1 || j < 0 || si2 === si1) continue;
      tcUnassign(ctx, st, d, k1);
      tcUnassign(ctx, st, d, k2);
      if (tcStaticOk(ctx, st, i, d, si2) && tcStaticOk(ctx, st, j, d, si1)) {
        tcAssign(ctx, st, d, k2, i);
        tcAssign(ctx, st, d, k1, j);
        const nw = tcSoftScore(ctx, st);
        if (nw <= cur) {
          cur = nw;
          continue;
        }
        tcUnassign(ctx, st, d, k1);
        tcUnassign(ctx, st, d, k2);
      }
      tcAssign(ctx, st, d, k1, i);
      tcAssign(ctx, st, d, k2, j);
    } else {
      // ย้ายเวรให้คนที่ว่าง
      const j = Math.floor(rand() * N);
      if (j === i || st.dayEmp[d][j] >= 0) continue;
      if (tcWorksAdjacent(ctx, st, j, d)) continue;
      tcUnassign(ctx, st, d, k1);
      if (tcStaticOk(ctx, st, j, d, si1)) {
        tcAssign(ctx, st, d, k1, j);
        const nw = tcSoftScore(ctx, st);
        if (nw <= cur) {
          cur = nw;
          continue;
        }
        tcUnassign(ctx, st, d, k1);
      }
      tcAssign(ctx, st, d, k1, i);
    }
  }
}

// ---------- Phase 3b: เติมขั้นต่ำให้คนที่ยังไม่ได้ (ย้าย/สลับจากคนที่ได้เกิน) ----------
function tcFixMinimum(ctx, st, rand) {
  const { D } = ctx;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    ctx.minGroups.forEach((grp, g) => {
      const needers = grp.eligible.filter((i) => tcGroupCount(ctx, st, i, g) < grp.min);
      for (const i of needers) {
        const dOrder = Array.from({ length: D }, (_, d) => d).sort(() => rand() - 0.5);
        let done = false;
        for (const d of dOrder) {
          if (done) break;
          const slots = ctx.days[d].slots;
          for (let k = 0; k < slots.length && !done; k++) {
            if (!grp.members.includes(slots[k])) continue;
            const j = st.slotEmp[d][k];
            if (j < 0 || j === i) continue;
            if (tcGroupCount(ctx, st, j, g) <= grp.min) continue; // ไม่เอาจากคนที่มีพอดี
            const before = tcSoftScore(ctx, st);
            const si = slots[k];
            const ki = st.dayEmp[d][i];
            if (ki < 0) {
              // ย้าย: i ว่างวันนี้
              if (tcWorksAdjacent(ctx, st, i, d)) continue;
              tcUnassign(ctx, st, d, k);
              if (tcStaticOk(ctx, st, i, d, si)) {
                tcAssign(ctx, st, d, k, i);
                if (tcSoftScore(ctx, st) < before) {
                  done = changed = true;
                  continue;
                }
                tcUnassign(ctx, st, d, k);
              }
              tcAssign(ctx, st, d, k, j);
            } else {
              // สลับ: i มีเวรอื่นวันนี้ → ให้ j รับเวรของ i แทน
              const si2 = slots[ki];
              tcUnassign(ctx, st, d, k);
              tcUnassign(ctx, st, d, ki);
              if (tcStaticOk(ctx, st, i, d, si) && tcStaticOk(ctx, st, j, d, si2)) {
                tcAssign(ctx, st, d, k, i);
                tcAssign(ctx, st, d, ki, j);
                if (tcSoftScore(ctx, st) < before) {
                  done = changed = true;
                  continue;
                }
                tcUnassign(ctx, st, d, k);
                tcUnassign(ctx, st, d, ki);
              }
              tcAssign(ctx, st, d, k, j);
              tcAssign(ctx, st, d, ki, i);
            }
          }
        }
      }
    });
    if (!changed) break;
  }
}

// สุ่ม 1 รอบ
function tcRunAttempt(ctx, rand) {
  const st = tcNewState(ctx);
  // สุ่มลำดับคนอยู่เวรใหม่ทุกรอบ (ใช้ตัดสินเมื่อคะแนนความเหมาะสมเท่ากัน)
  st.perm = Array.from({ length: ctx.N }, (_, i) => i);
  for (let a = st.perm.length - 1; a > 0; a--) {
    const b = Math.floor(rand() * (a + 1));
    [st.perm[a], st.perm[b]] = [st.perm[b], st.perm[a]];
  }
  for (let d = 0; d < ctx.D; d++) tcGreedyDay(ctx, st, d, rand);
  tcRepair(ctx, st, rand);
  if (ctx.minGroups.length > 0) tcFixMinimum(ctx, st, rand);
  tcImprove(ctx, st, rand, 60000);
  if (ctx.minGroups.length > 0 && tcMinShort(ctx, st) > 0) tcFixMinimum(ctx, st, rand);
  // ลองเติมช่องว่างอีกครั้งหลังปรับ
  if (tcMissing(ctx, st) > 0) tcRepair(ctx, st, rand);
  const missing = tcMissing(ctx, st);
  const fixedDiff = tcFixedDiff(ctx, st);
  const gap = tcBalanceGap(ctx, st);
  const minShort = tcMinShort(ctx, st);
  const soft = tcSoftScore(ctx, st);
  const fair = soft - fixedDiff * 1e6 - gap * 5000 - minShort * 2e6; // ส่วนความสมดุลเงิน/ตัวเวรซ้ำ
  return { st, missing, fixedDiff, gap, minShort, fair, soft, score: missing * 1e9 + soft };
}

// แปลงผลเป็น assignments ของตาราง + รายงาน
function tcResultToOutput(ctx, res) {
  const { st } = res;
  const assignments = {};
  const missingList = [];
  ctx.days.forEach((dy, d) => {
    dy.slots.forEach((si, k) => {
      const i = st.slotEmp[d][k];
      if (i >= 0) assignments[`${ctx.employees[i].id}_${dy.dateStr}`] = ctx.shifts[si].id;
      else missingList.push({ dateStr: dy.dateStr, shiftName: ctx.shifts[si].name });
    });
  });
  let dup = 0;
  const dupList = [];
  for (let i = 0; i < ctx.N; i++) {
    const c = tcDupCount(ctx, st, i);
    dup += c;
    if (c > 0) {
      const names = [];
      for (let si = 0; si < ctx.S; si++)
        if (ctx.fixed[i][si] === null && st.cnt[i][si] > 1)
          names.push(`${ctx.shifts[si].name}×${st.cnt[i][si]}`);
      dupList.push(`${ctx.employees[i].name}: ${names.join(', ')}`);
    }
  }
  const consec = tcConsecCount(ctx, st);
  const fixedIssues = [];
  for (let i = 0; i < ctx.N; i++)
    for (let si = 0; si < ctx.S; si++) {
      const fx = ctx.fixed[i][si];
      if (fx !== null && st.cnt[i][si] !== fx)
        fixedIssues.push(
          `${ctx.employees[i].name}: ${ctx.shifts[si].name} ได้ ${st.cnt[i][si]}/${fx}`
        );
    }
  const balanceInfo = [];
  for (let si = 0; si < ctx.S; si++) {
    if (!ctx.balanceShift[si]) continue;
    const parts = [];
    for (let i = 0; i < ctx.N; i++)
      if (ctx.can[i][si]) parts.push(`${ctx.employees[i].name} ${st.cnt[i][si]}`);
    balanceInfo.push(`${ctx.shifts[si].name}: ${parts.join(' / ')}`);
  }
  const minIssues = [];
  ctx.minGroups.forEach((grp, g) => {
    grp.eligible.forEach((i) => {
      const c = tcGroupCount(ctx, st, i, g);
      if (c < grp.min) minIssues.push(`${ctx.employees[i].name}: ${grp.label} ${c}/${grp.min}`);
    });
  });
  return {
    assignments,
    report: {
      missingList,
      dup,
      dupList,
      consec,
      fixedIssues,
      balanceInfo,
      minIssues,
      money: tcMoneyStats(ctx, st),
    },
  };
}

// ตรวจตารางปัจจุบัน (cross-check) — ใช้ได้ทั้งหลังสุ่มและหลังแก้เวรเอง
function tcCrossCheck({
  schedule,
  employees,
  shifts,
  rules,
  prevDayWorkers,
  prevDayRestWorkers,
  nextDayWorkers,
}) {
  const { year, month } = schedule;
  const D = new Date(year, month + 1, 0).getDate();
  const asg = schedule.assignments || {};
  const holidays = schedule.holidays || {};
  const shiftById = {};
  shifts.forEach((s) => (shiftById[s.id] = s));
  const missing = []; // {day, shiftName, color, lack}
  const over = []; // {day, shiftName, color, reason}
  const violations = []; // {day, name, shiftName, color, reason}
  const dayFill = []; // {filled, need}
  const fixedIssues = [];
  const prevRest = new Set(prevDayRestWorkers || []);
  const next = new Set(nextDayWorkers || []);
  const counts = {}; // empId -> shiftId -> n

  for (let d = 1; d <= D; d++) {
    const ds = tcDateStr(year, month, d);
    const dow = new Date(year, month, d).getDay();
    const hol = !!holidays[ds];
    const filledBy = {};
    employees.forEach((e) => {
      const sid = asg[`${e.id}_${ds}`];
      if (!sid) return;
      const s = shiftById[sid];
      if (!s) return;
      filledBy[sid] = (filledBy[sid] || 0) + 1;
      counts[e.id] = counts[e.id] || {};
      counts[e.id][sid] = (counts[e.id][sid] || 0) + 1;
      const v = (reason) =>
        violations.push({ day: d, name: e.name, shiftName: s.name, color: s.color, reason });
      if (e.offShifts && e.offShifts.includes(sid)) v('งดรับเวรนี้');
      if (e.specificShifts && e.specificShifts.length > 0 && !e.specificShifts.includes(sid))
        v('ไม่ใช่เวรเฉพาะของคนนี้');
      const offD = (e.offShiftDays || {})[sid];
      if (Array.isArray(offD) && offD.map(Number).includes(dow)) v('ห้ามเวรนี้วันนี้');
      if (tcInOffRange(e, ds)) v('อยู่ในช่วงงดเวร');
      // พักหลังเวรดึก (ด1/ด2): วันถัดไปห้ามมีเวร
      if (s.restAfter) {
        const nextDs = d < D ? tcDateStr(year, month, d + 1) : null;
        if (nextDs && asg[`${e.id}_${nextDs}`] && shiftById[asg[`${e.id}_${nextDs}`]])
          v(`วันที่ ${d + 1} ต้องพักหลังเวร ${s.name}`);
        if (d === D && next.has(e.id)) v('วันแรกของเดือนถัดไปต้องพัก');
      }
      if (d === 1 && prevRest.has(e.id)) v('ต้องพักหลังเวรดึกวันสุดท้ายของเดือนก่อน');
    });
    let need = 0;
    let filled = 0;
    shifts.forEach((s) => {
      const n = tcShiftNeedOnDay(s, ds, dow, hol, schedule.patientCounts);
      const f = filledBy[s.id] || 0;
      need += n;
      filled += Math.min(f, n);
      if (f < n) missing.push({ day: d, shiftName: s.name, color: s.color, lack: n - f });
      if (f > n)
        over.push({
          day: d,
          shiftName: s.name,
          color: s.color,
          reason: n === 0 ? 'วันนี้ไม่มีเวรนี้' : `เกิน (${f}/${n})`,
        });
    });
    dayFill.push({ filled, need });
  }
  // เพดานต่อคนต่อเดือน (เช่น M รวมกันได้ 1 เวร)
  const capViol = [];
  employees.forEach((e) => {
    const byGroup = {};
    Object.entries(counts[e.id] || {}).forEach(([sid, n]) => {
      const s = shiftById[sid];
      if (!s || tcCapOf(s) === null) return;
      const k = tcCapGroupKey(s);
      byGroup[k] = byGroup[k] || { n: 0, cap: tcCapOf(s), names: [] };
      byGroup[k].n += n;
      byGroup[k].cap = Math.min(byGroup[k].cap, tcCapOf(s));
      byGroup[k].names.push(s.name);
    });
    Object.values(byGroup).forEach((b) => {
      if (b.n > b.cap) capViol.push(`${e.name}: ${b.names.join('+')} ${b.n} เวร (จำกัด ${b.cap})`);
    });
  });
  // เวรที่ห้ามอยู่คนเดียวกันในเดือนเดียวกัน (เช่น S1/4O กับ 4S1)
  employees.forEach((e) => {
    const got = counts[e.id] || {};
    const seen = new Set();
    shifts.forEach((s) => {
      if (!got[s.id]) return;
      (s.exclusiveWith || []).forEach((oid) => {
        const o = shiftById[oid];
        if (!o || !got[oid]) return;
        const key = [s.id, oid].sort().join('|');
        if (seen.has(key)) return;
        seen.add(key);
        capViol.push(`${e.name}: มีทั้ง ${s.name} และ ${o.name} ในเดือนเดียวกัน`);
      });
    });
  });
  employees.forEach((e) => {
    Object.entries(e.fixedCounts || {}).forEach(([sid, n]) => {
      const s = shiftById[sid];
      if (!s) return;
      const got = (counts[e.id] || {})[sid] || 0;
      if (got !== Number(n)) fixedIssues.push(`${e.name}: ${s.name} ${got}/${n}`);
    });
  });
  // ขั้นต่ำต่อคน (เช่น ด1 ≥ 1, OE/IE ≥ 1)
  const minIssues = [];
  const groups = {};
  shifts.forEach((s) => {
    const mn = tcMinPerPersonOf(s);
    if (mn <= 0) return;
    const key = tcMinGroupKey(s);
    groups[key] = groups[key] || { ids: [], min: 0, label: tcMinGroupLabel(s, shifts) };
    groups[key].ids.push(s.id);
    groups[key].min = Math.max(groups[key].min, mn);
  });
  Object.values(groups).forEach((g) => {
    employees.forEach((e) => {
      const eligible = g.ids.some(
        (sid) =>
          !(e.offShifts && e.offShifts.includes(sid)) &&
          !(e.specificShifts && e.specificShifts.length > 0 && !e.specificShifts.includes(sid))
      );
      if (!eligible) return;
      const c = g.ids.reduce((a, sid) => a + ((counts[e.id] || {})[sid] || 0), 0);
      if (c < g.min) minIssues.push(`${e.name}: ${g.label} ${c}/${g.min}`);
    });
  });
  return { missing, over, violations, dayFill, fixedIssues, capViol, minIssues };
}

// ตรวจล่วงหน้าว่าเดือนนี้ "จัดครบได้ทางคณิตศาสตร์" หรือไม่
function tcPrecheck(ctx) {
  const warnings = [];
  const { D, N, days, noConsec } = ctx;
  const dummy = tcNewState(ctx); // cnt = 0 ทั้งหมด
  const canDay = (i, d) => {
    if (d === 0 && noConsec && ctx.prevSet.has(i)) return false;
    if (d === D - 1 && noConsec && ctx.nextSet.has(i)) return false;
    return days[d].slots.some((si) => tcStaticOk(ctx, dummy, i, d, si));
  };
  const dayNum = (d) => Number(days[d].dateStr.slice(8));
  for (let d = 0; d < D; d++) {
    const need = days[d].slots.length;
    let avail = 0;
    for (let i = 0; i < N; i++) if (canDay(i, d)) avail++;
    if (need > avail)
      warnings.push(`วันที่ ${dayNum(d)} ต้องใช้ ${need} คน แต่มีคนลงได้เพียง ${avail} คน`);
    if (noConsec && d + 1 < D) {
      const need2 = need + days[d + 1].slots.length;
      let avail2 = 0;
      for (let i = 0; i < N; i++) if (canDay(i, d) || canDay(i, d + 1)) avail2++;
      if (need2 > avail2)
        warnings.push(
          `วันที่ ${dayNum(d)}–${dayNum(d + 1)} ต้องใช้รวม ${need2} คน แต่มีคนลงได้ ${avail2} คน (กฎห้ามเวรติดกัน ทำให้คนเดียวลงได้แค่ 1 ใน 2 วัน)`
        );
    }
  }
  // ขั้นต่ำต่อคน: ช่องเวรในกลุ่มทั้งเดือน ต้องพอให้ทุกคนได้ขั้นต่ำ
  ctx.minGroups.forEach((grp) => {
    let slots = 0;
    days.forEach((dy) => dy.slots.forEach((si) => (grp.members.includes(si) ? slots++ : 0)));
    const needSlots = grp.eligible.length * grp.min;
    if (slots < needSlots)
      warnings.push(
        `เวร ${grp.label} เดือนนี้มี ${slots} ช่อง แต่ต้องให้ ${grp.eligible.length} คน ได้คนละอย่างน้อย ${grp.min} เวร (ต้องใช้ ${needSlots} ช่อง)`
      );
  });
  // เพดานต่อคน: ช่องเวรในกลุ่มทั้งเดือน ต้องไม่เกิน (จำนวนคนที่ลงได้ × เพดาน)
  for (let g = 0; g < ctx.G; g++) {
    const members = [];
    for (let si = 0; si < ctx.S; si++) if (ctx.capGroup[si] === g && ctx.capOf[si] !== null) members.push(si);
    if (members.length === 0) continue;
    const cap = Math.min(...members.map((si) => ctx.capOf[si]));
    let slots = 0;
    days.forEach((dy) => dy.slots.forEach((si) => (members.includes(si) ? slots++ : 0)));
    let people = 0;
    for (let i = 0; i < N; i++) if (members.some((si) => ctx.can[i][si])) people++;
    if (slots > people * cap)
      warnings.push(
        `เวร ${members.map((si) => ctx.shifts[si].name).join('/')} เดือนนี้มี ${slots} ช่อง แต่จำกัด ${cap} เวร/คน และมีคนลงได้ ${people} คน (รับได้สูงสุด ${people * cap} ช่อง)`
      );
  }
  // จำนวนเวรตายตัว: ลงได้สูงสุดกี่ครั้งถ้าห้ามติดกัน
  for (let i = 0; i < N; i++)
    for (let si = 0; si < ctx.S; si++) {
      const fx = ctx.fixed[i][si];
      if (fx === null) continue;
      let max = 0;
      let run = 0;
      const flush = () => {
        max += noConsec ? Math.ceil(run / 2) : run;
        run = 0;
      };
      for (let d = 0; d < D; d++) {
        const open =
          days[d].slots.includes(si) &&
          ctx.can[i][si] &&
          !ctx.offDow[i][si].includes(days[d].dow) &&
          !(d === 0 && noConsec && ctx.prevSet.has(i)) &&
          !(d === D - 1 && noConsec && ctx.nextSet.has(i));
        if (open) run++;
        else flush();
      }
      flush();
      if (fx > max)
        warnings.push(
          `${ctx.employees[i].name}: กำหนดเวร ${ctx.shifts[si].name} ไว้ ${fx} เวร แต่เดือนนี้ลงได้สูงสุด ${max} เวร (ไม่ติดกัน)`
        );
    }
  return warnings;
}

// ตัวสุ่มจริงจากระบบปฏิบัติการ (crypto.getRandomValues — ใช้ entropy ของเครื่อง เดาล่วงหน้าไม่ได้)
function tcMakeCryptoRng() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!c || !c.getRandomValues) return Math.random;
  const buf = new Uint32Array(4096);
  let pos = buf.length;
  return () => {
    if (pos >= buf.length) {
      c.getRandomValues(buf);
      pos = 0;
    }
    return buf[pos++] / 4294967296;
  };
}

// เลือกผลลัพธ์: สุ่มเลือก 1 ตารางจากกลุ่มที่ "ดีเกือบเท่าตารางที่ดีที่สุด"
// (ขาดเท่ากัน + เวรตายตัวเท่ากัน + เวรที่ต้องเฉลี่ยสมดุลเท่ากัน + ความสมดุลเงิน/ตัวเวรไม่เกิน 10% จากที่ดีที่สุด)
function tcPickResult(results, rand) {
  if (results.length === 0) return null;
  let best = results[0];
  results.forEach((r) => {
    if (r.score < best.score) best = r;
  });
  const pool = results.filter(
    (r) =>
      r.missing === best.missing &&
      r.fixedDiff === best.fixedDiff &&
      r.gap === best.gap &&
      r.minShort === best.minShort &&
      r.fair <= best.fair * 1.1 + 20
  );
  return pool[Math.floor(rand() * pool.length)] || best;
}

// หมวดเวรสำหรับสรุปท้ายตาราง: S1 / ช / บ / ด / 4S / 4O / 2O
const TC_SUMMARY_GROUPS = [
  ['S1', 'bg-rose-50/60', 'text-rose-700'],
  ['ช', 'bg-blue-50/60', 'text-blue-700'],
  ['บ', 'bg-orange-50/60', 'text-orange-700'],
  ['ด', 'bg-indigo-50/60', 'text-indigo-700'],
  ['4S', 'bg-purple-50/60', 'text-purple-700'],
  ['4o', 'bg-teal-50/60', 'text-teal-700'],
  ['2O', 'bg-lime-50/60', 'text-lime-700'],
];
const tcShiftGroup = (shift) => {
  if (!shift || !shift.name) return null;
  const n = shift.name.trim().toUpperCase();
  if (/^S\d/.test(n)) return 'S1';
  if (shift.dynamic === 'patient' || /^4S/.test(n)) return '4S';
  if (/^4\d+$/.test(n) || /^4O/.test(n)) return '4o';
  if (/^2O/.test(n)) return '2O';
  const startH = shift.start ? Number(shift.start.split(':')[0]) : null;
  if (n.startsWith('ด') || startH === 0) return 'ด';
  if (n.startsWith('บ') || (startH !== null && startH >= 14)) return 'บ';
  if (startH !== null && startH < 14) return 'ช';
  return null;
};

// ตัวสุ่มเลขแบบกำหนด seed ได้ — ใช้เฉพาะตอนทดสอบระบบ (หน้าเว็บใช้ tcMakeCryptoRng)
// eslint-disable-next-line no-unused-vars
function tcMakeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
// === TC_ENGINE_END ===

// === TC_SEED_START ===
// ==========================================
// ข้อมูลตั้งต้น (ตามเอกสารรายละเอียดเวรเจ้าพนักงานเภสัชกรรม)
// ==========================================
const TC_SEED_SHIFTS = [
  { id: 'tc_S1', name: 'S1/4O', color: '#e11d48', start: '08:00', end: '20:00', min: 1, allowedDays: 'weekends_holidays', value: 1225, exclusiveWith: ['tc_4S1'] },
  { id: 'tc_CH2', name: 'ช2', color: '#3b82f6', start: '08:00', end: '16:00', min: 1, allowedDays: 'weekends_holidays', value: 530 },
  { id: 'tc_CH3', name: 'ช3', color: '#3b82f6', start: '08:00', end: '16:00', min: 1, allowedDays: 'weekends_holidays', value: 530 },
  { id: 'tc_CH4', name: 'ช4', color: '#3b82f6', start: '08:00', end: '16:00', min: 1, allowedDays: 'weekends_holidays', value: 530 },
  { id: 'tc_CH5', name: 'ช5', color: '#3b82f6', start: '08:00', end: '16:00', min: 1, allowedDays: 'weekends_holidays', value: 530 },
  { id: 'tc_CH6', name: 'ช6', color: '#3b82f6', start: '08:00', end: '16:00', min: 1, allowedDays: 'weekends_holidays', value: 530 },
  { id: 'tc_CH7', name: 'ช7', color: '#3b82f6', start: '08:00', end: '16:00', min: 1, allowedDays: 'weekends_holidays', value: 530 },
  { id: 'tc_B1', name: 'บ1', color: '#f97316', start: '16:00', end: '00:00', min: 1, allowedDays: 'all', value: 530 },
  { id: 'tc_B2', name: 'บ2', color: '#f97316', start: '16:00', end: '00:00', min: 1, allowedDays: 'all', value: 530 },
  { id: 'tc_B3', name: 'บ3', color: '#f97316', start: '16:00', end: '00:00', min: 1, allowedDays: 'all', value: 530 },
  { id: 'tc_B4', name: 'บ4', color: '#f97316', start: '16:00', end: '00:00', min: 1, allowedDays: 'all', value: 530 },
  { id: 'tc_D1', name: 'ด1', color: '#6366f1', start: '00:00', end: '08:00', min: 1, allowedDays: 'all', value: 530, restAfter: true },
  { id: 'tc_D2', name: 'ด2', color: '#6366f1', start: '00:00', end: '08:00', min: 1, allowedDays: 'all', value: 530, restAfter: true },
  { id: 'tc_2O', name: '2O', color: '#84cc16', start: '16:00', end: '18:00', min: 1, allowedDays: 'mon_tue_only', value: 132.5 },
  { id: 'tc_4O', name: '4O', color: '#14b8a6', start: '16:00', end: '20:00', min: 1, allowedDays: 'weekdays', value: 265 },
  { id: 'tc_4S1', name: '4S1', color: '#8b5cf6', start: '16:30', end: '20:30', min: 1, allowedDays: 'weekdays', value: 480, exclusiveWith: ['tc_S1'] },
  { id: 'tc_4S2', name: '4S2', color: '#a855f7', start: '16:30', end: '20:30', min: 1, allowedDays: 'weekdays', value: 480, dynamic: 'patient', minAppt: 351 },
];

const tcSeedEmployees = () => {
  const names = [
    'กมลทิพย์', 'กฤษติกา', 'จักรกฤษ', 'จุลลดา', 'ชุตาภา', 'นงลักษณ์', 'นัตยา', 'บุศราภรณ์',
    'ปิ่นอนงค์', 'ปิยะณัฐ', 'ผกามาศ', 'พงษกร', 'พรทิพย์', 'พิชญุตม์', 'พีรดา', 'ฟ้าใส',
    'มุทิตา', 'โยธิน', 'วรรณพร', 'วรัญญา', 'วะลาพร', 'สัญญา', 'สุทธิลักษณ์', 'สุรีย์',
    'เสกสินธุ์', 'เสริมสิริ', 'อภิชัย', 'อรวรรณ', 'อรุณี', 'อัจฉรา',
  ];
  const list = [];
  const add = (name, extra) =>
    list.push({
      id: `tc_emp_${String(list.length + 1).padStart(2, '0')}`,
      name,
      role: 'technician',
      offShifts: [],
      specificShifts: [],
      offShiftDays: {},
      fixedCounts: {},
      excludeFromBalance: false,
      offRanges: [],
      moneyOffset: 0,
      note: '',
      ...extra,
    });
  names.forEach((n) => add(n, {}));
  add('พัชราภา', { offShifts: ['tc_D1', 'tc_D2'], moneyOffset: 1060, note: 'ไม่ลงเวร ด1/ด2' });
  add('พิธุภา', {
    offRanges: [{ from: '', to: '2027-03-31' }],
    note: 'งดเวร 6 เดือน (ก่อนคลอด 3 เดือน + หลังคลอด 3 เดือน) สิ้นสุด มี.ค. 2570',
  });
  add('ณัฐกมล', { offRanges: [{ from: '', to: '2027-01-31' }], note: 'เริ่มขึ้นเวร ก.พ. 2570' });
  add('ธฤษวรรณ', { offRanges: [{ from: '', to: '2027-01-31' }], note: 'เริ่มขึ้นเวร ก.พ. 2570' });
  return list;
};
// === TC_SEED_END ===


// ==========================================
// ฟังก์ชันคำนวณมูลค่าเวร
// ==========================================
// ใช้ค่าเวรที่กำหนดในประเภทเวร (shift.value) ถ้าไม่กำหนดจะคิด ชม. × 100 แบบเดิม
const getShiftValue = (shift) => tcGetShiftValue(shift);

// ==========================================
// ข้อมูลตั้งต้นสำหรับเงื่อนไข (เจ้าพนักงานเภสัชกรรม)
// ==========================================
const CATEGORIZED_RULES = {
  technician: {
    label: 'เจ้าพนักงานเภสัชกรรม',
    rules: [
      { id: 'tech_noConsecutive', label: '1. ต้องไม่ได้รับเวรติดกัน 2 วัน' },
      { id: 'tech_balanceTypes', label: '2. กระจายตัวเวร ไม่ให้คนเดียวได้ตัวเวรซ้ำ' },
      {
        id: 'tech_balanceMoneyHours',
        label: '3. เงินรวมต้องเฉลี่ยให้เท่ากันมากที่สุด',
      },
    ],
  },
};

export default function TechnicianPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('schedule');
  const tabs = [
    { id: 'schedule', name: 'ตารางเวร', icon: Calendar },
    { id: 'employees', name: 'พนักงาน', icon: Users },
    { id: 'shift_types', name: 'ประเภทเวร', icon: Clock },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-50 font-sans text-slate-800 flex flex-col p-0 m-0">
      <style>{`
        @media print {
          @page { 
            size: A4 landscape; 
            margin: 3mm; 
          }
          html, body { 
            background-color: white !important; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
            zoom: 0.82; 
          }
          .print-hidden { display: none !important; }
          main { padding: 0 !important; }
          .overflow-auto, .custom-scrollbar { overflow: visible !important; }
          
          table { 
            width: 100% !important; 
            max-width: 100% !important;
            border-collapse: collapse; 
            table-layout: fixed; 
          }
          
          tr { page-break-inside: avoid; }
          .min-w-\[1300px\] { min-width: 0px !important; }
          
          th.w-\[120px\] { width: 70px !important; } 
          th.w-\[30px\] { width: 22px !important; }  
          th.w-\[70px\] { width: 45px !important; }  

          th, td { 
            padding: 1px 0px !important; 
            font-size: 7.5px !important; 
            word-wrap: break-word;
            overflow: hidden;
          }
          
          .text-xs { font-size: 7px !important; line-height: 1 !important; }
          .text-\[11px\] { font-size: 7px !important; }
          .text-\[10px\] { font-size: 6px !important; }
          .text-\[9px\] { font-size: 6px !important; }
          .h-8 { height: auto !important; }
        }
      `}</style>

      <header className="bg-white shadow-sm px-4 py-2 flex justify-between items-center z-20 relative print-hidden">
        <div className="flex items-center gap-4 text-indigo-600">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> กลับหน้าหลัก
          </button>
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <Calendar className="w-5 h-5" />
            <h1 className="text-lg font-bold">
              ตารางเวร: เจ้าพนักงานเภสัชกรรม
            </h1>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.name}
            </button>
          ))}
        </div>
      </header>

      <main className="w-full flex-1 flex flex-col p-3 print:p-0">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex-1 flex flex-col overflow-hidden print:border-none print:shadow-none print:p-0">
          {activeTab === 'schedule' && <ScheduleManager />}
          {activeTab === 'employees' && <EmployeesManager />}
          {activeTab === 'shift_types' && <ShiftTypesManager />}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// 1. Component: จัดการตารางเวร (เจ้าพนักงานเภสัชกรรม)
// ==========================================
function ScheduleManager() {
  const [employees] = useFirebaseSync('tech_employees', []);
  const [shifts] = useFirebaseSync('tech_shift_types', []);
  const [schedules, setSchedules] = useFirebaseSync('tech_schedules', []);
  const [activeScheduleId, setActiveScheduleId] = useFirebaseSync(
    'tech_active_schedule',
    null
  );

  const [rules, setRules] = useFirebaseSync('tech_rules', {
    tech_noConsecutive: true,
    tech_balanceTypes: true,
    tech_balanceMoneyHours: true,
  });

  const [selectedRuleRole] = useState('technician');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createMonth, setCreateMonth] = useState(new Date().getMonth());
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [assignmentModal, setAssignmentModal] = useState({
    isOpen: false,
    empId: null,
    dateStr: null,
  });
  const [showRuleDropdown, setShowRuleDropdown] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genReport, setGenReport] = useState(null);
  const [genBestMissing, setGenBestMissing] = useState(null);
  const [isApptModalOpen, setIsApptModalOpen] = useState(false);
  const [apptDraft, setApptDraft] = useState({});

  const thaiMonths = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];
  const thaiDays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

  const activeSchedule = schedules.find((s) => s.id === activeScheduleId);

  const handleCreateSchedule = () => {
    const newId = `${createYear}-${createMonth}`;
    if (schedules.find((s) => s.id === newId))
      return alert('มีตารางของเดือนนี้อยู่แล้ว!');
    const newSchedule = {
      id: newId,
      year: createYear,
      month: createMonth,
      assignments: {},
      holidays: {},
    };
    setSchedules([...schedules, newSchedule]);
    setActiveScheduleId(newId);
    setIsCreateModalOpen(false);
  };

  const handleDeleteSchedule = () => {
    if (!activeSchedule) return;
    if (
      confirm(
        `ต้องการลบตารางเดือน ${thaiMonths[activeSchedule.month]} ${
          activeSchedule.year + 543
        } ใช่หรือไม่?`
      )
    ) {
      const updated = schedules.filter((s) => s.id !== activeScheduleId);
      setSchedules(updated);
      setActiveScheduleId(updated.length > 0 ? updated[0].id : null);
    }
  };

  // CSV เดิม (ไว้ส่งให้ Claude ตรวจ / ใช้ภายใน)
  const handleExportCSV = () => {
    if (!activeSchedule) return;
    const daysInMonth = new Date(
      activeSchedule.year,
      activeSchedule.month + 1,
      0
    ).getDate();
    let csvContent = '\uFEFFพนักงาน,หมวดหมู่,';
    for (let i = 1; i <= daysInMonth; i++) csvContent += i + ',';
    csvContent +=
      TC_SUMMARY_GROUPS.map(([label]) => label).join(',') + ',รวมเวร,รวมเงิน\n';

    employees.forEach((emp) => {
      let row = [`"${emp.name}"`, `"เจ้าพนักงานเภสัชกรรม"`];
      let totalMoney = 0;
      const grpCnt = {};
      let totalShifts = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${activeSchedule.year}-${String(
          activeSchedule.month + 1
        ).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const sData = shifts.find(
          (s) => s.id === activeSchedule.assignments[`${emp.id}_${dateStr}`]
        );
        row.push(sData ? `"${sData.name}"` : '');
        if (sData) {
          totalMoney += getShiftValue(sData);
          totalShifts++;
          const g = tcShiftGroup(sData);
          if (g) grpCnt[g] = (grpCnt[g] || 0) + 1;
        }
      }
      TC_SUMMARY_GROUPS.forEach(([label]) => row.push(grpCnt[label] || 0));
      row.push(totalShifts);
      row.push(totalMoney);
      csvContent += row.join(',') + '\n';
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    );
    link.download = `ตารางเวรเจ้าพนักงาน_${thaiMonths[activeSchedule.month]}.csv`;
    link.click();
  };

  // ─── หาคนที่มีเวรในวันสุดท้ายของเดือนก่อน / วันแรกของเดือนถัดไป (กันเวรติดกันข้ามเดือน) ───
  const getBoundaryWorkers = (sch) => {
    const prevY = sch.month === 0 ? sch.year - 1 : sch.year;
    const prevM = sch.month === 0 ? 11 : sch.month - 1;
    const nextY = sch.month === 11 ? sch.year + 1 : sch.year;
    const nextM = sch.month === 11 ? 0 : sch.month + 1;
    const prevSch = schedules.find((s) => s.id === `${prevY}-${prevM}`);
    const nextSch = schedules.find((s) => s.id === `${nextY}-${nextM}`);
    const prevLast = tcDateStr(prevY, prevM, new Date(prevY, prevM + 1, 0).getDate());
    const nextFirst = tcDateStr(nextY, nextM, 1);
    const pick = (s2, ds, onlyRest) =>
      s2
        ? Object.keys(s2.assignments || {})
            .filter((k) => k.endsWith(`_${ds}`))
            .filter((k) => {
              const sh = shifts.find((x) => x.id === s2.assignments[k]);
              return !!sh && (!onlyRest || !!sh.restAfter);
            })
            .map((k) => k.slice(0, k.length - ds.length - 1))
        : [];
    return {
      prev: pick(prevSch, prevLast, false),
      prevRest: pick(prevSch, prevLast, true),
      next: pick(nextSch, nextFirst, false),
    };
  };

  const TC_ATTEMPTS = 30;

  const handleAutoGenerate = () => {
    if (!activeSchedule || isGenerating) return;
    if (employees.length === 0 || shifts.length === 0)
      return alert('กรุณาเพิ่มพนักงานและประเภทเวรก่อน');

    const patientCounts = activeSchedule.patientCounts || {};
    const hasPatientShift = shifts.some((s) => s.dynamic === 'patient');
    const hasPatientInput = Object.values(patientCounts).some((v) => Number(v) > 0);
    if (
      hasPatientShift &&
      !hasPatientInput &&
      !confirm(
        'ยังไม่ได้กรอกยอดคนไข้ของเดือนนี้ — จะไม่มีเวร 4S2 ในตาราง\nต้องการสุ่มต่อหรือไม่?'
      )
    )
      return;
    if (
      Object.keys(activeSchedule.assignments || {}).length > 0 &&
      !confirm('ตารางเดือนนี้มีเวรอยู่แล้ว การสุ่มใหม่จะเขียนทับทั้งหมด ต้องการสุ่มต่อหรือไม่?')
    )
      return;

    const boundary = getBoundaryWorkers(activeSchedule);
    const ctx = tcBuildContext({
      year: activeSchedule.year,
      month: activeSchedule.month,
      employees,
      shifts,
      holidays: activeSchedule.holidays || {},
      patientCounts,
      rules,
      prevDayWorkers: boundary.prev,
      prevDayRestWorkers: boundary.prevRest,
      nextDayWorkers: boundary.next,
    });
    const warnings = tcPrecheck(ctx);
    const rng = tcMakeCryptoRng();
    const scheduleId = activeSchedule.id;
    const results = [];
    let best = null;
    let done = 0;
    setIsGenerating(true);
    setGenProgress(0);
    setGenBestMissing(null);
    setGenReport(null);

    // สุ่มเป็นชุดเล็ก ๆ เพื่อไม่ให้หน้าเว็บค้าง
    const runChunk = () => {
      const t0 = Date.now();
      while (done < TC_ATTEMPTS && Date.now() - t0 < 120) {
        const r = tcRunAttempt(ctx, rng);
        results.push(r);
        if (!best || r.score < best.score) best = r;
        done++;
      }
      setGenProgress(done);
      setGenBestMissing(best ? best.missing : null);
      if (done < TC_ATTEMPTS) {
        setTimeout(runChunk, 0);
        return;
      }
      const out = tcResultToOutput(ctx, tcPickResult(results, rng));
      setSchedules(
        schedules.map((s) =>
          s.id === scheduleId ? { ...s, assignments: out.assignments } : s
        )
      );
      setGenReport({ ...out.report, warnings });
      setIsGenerating(false);
    };
    setTimeout(runChunk, 30);
  };

  // ─── ยอดคนไข้รายวัน (เปิดเวร 4S2 เมื่อถึงเกณฑ์) ───
  const openApptModal = () => {
    if (!activeSchedule) return;
    setApptDraft({ ...(activeSchedule.patientCounts || {}) });
    setIsApptModalOpen(true);
  };
  const saveAppts = () => {
    const clean = (obj) => {
      const o = {};
      Object.entries(obj).forEach(([k, v]) => {
        const n = parseInt(v, 10);
        if (n > 0) o[k] = n;
      });
      return o;
    };
    setSchedules(
      schedules.map((s) =>
        s.id === activeScheduleId
          ? { ...s, patientCounts: clean(apptDraft) }
          : s
      )
    );
    setIsApptModalOpen(false);
  };
  const dynamicShiftsFor = (kind, appt) =>
    shifts
      .filter((s) => s.dynamic === kind && appt > 0 && appt >= (Number(s.minAppt) || 0))
      .map((s) => s.name);

  const handleAssignShift = (shiftId) => {
    if (!activeSchedule) return;
    const { empId, dateStr } = assignmentModal;
    const updatedAssignments = { ...activeSchedule.assignments };
    if (shiftId === null) delete updatedAssignments[`${empId}_${dateStr}`];
    else updatedAssignments[`${empId}_${dateStr}`] = shiftId;
    setSchedules(
      schedules.map((s) =>
        s.id === activeScheduleId
          ? { ...s, assignments: updatedAssignments }
          : s
      )
    );
    setAssignmentModal({ isOpen: false, empId: null, dateStr: null });
  };

  const handleToggleHoliday = (dateStr) => {
    if (!activeSchedule) return;
    const updatedHolidays = { ...activeSchedule.holidays };
    if (updatedHolidays[dateStr]) delete updatedHolidays[dateStr];
    else updatedHolidays[dateStr] = 'วันหยุดพิเศษ';
    setSchedules(
      schedules.map((s) =>
        s.id === activeScheduleId ? { ...s, holidays: updatedHolidays } : s
      )
    );
  };

  let monthDates = [];
  if (activeSchedule) {
    const daysInMonth = new Date(
      activeSchedule.year,
      activeSchedule.month + 1,
      0
    ).getDate();
    monthDates = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(activeSchedule.year, activeSchedule.month, i + 1);
      const dateStr = `${activeSchedule.year}-${String(
        activeSchedule.month + 1
      ).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      return {
        dateNum: i + 1,
        dayStr: thaiDays[d.getDay()],
        dateStr,
        isHoliday:
          d.getDay() === 0 ||
          d.getDay() === 6 ||
          !!activeSchedule.holidays[dateStr],
      };
    });
  }

  const activeCategoryRules = CATEGORIZED_RULES[selectedRuleRole].rules;
  const inactiveRules = activeCategoryRules.filter((r) => !rules[r.id]);
  const currentlyActiveRules = activeCategoryRules.filter((r) => rules[r.id]);

  // ─── Cross-check ตารางปัจจุบัน (คำนวณใหม่ทุกครั้งที่ตารางเปลี่ยน รวมถึงแก้เวรเอง) ───
  let check = null;
  let checkMoney = 0;
  const hasAssignments =
    !!activeSchedule && Object.keys(activeSchedule.assignments || {}).length > 0;
  if (activeSchedule && hasAssignments) {
    const bw = getBoundaryWorkers(activeSchedule);
    check = tcCrossCheck({
      schedule: activeSchedule,
      employees,
      shifts,
      rules,
      prevDayWorkers: bw.prev,
      prevDayRestWorkers: bw.prevRest,
      nextDayWorkers: bw.next,
    });
    Object.entries(activeSchedule.assignments || {}).forEach(([key, sid]) => {
      if (!employees.some((e) => key.startsWith(`${e.id}_`))) return;
      const sh = shifts.find((x) => x.id === sid);
      if (sh) checkMoney += getShiftValue(sh);
    });
  }
  const checkNeed = check ? check.dayFill.reduce((a, x) => a + x.need, 0) : 0;
  const checkFilled = check ? check.dayFill.reduce((a, x) => a + x.filled, 0) : 0;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-between items-center mb-3 shrink-0 print-hidden">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-white p-1 rounded-md border border-gray-200">
            {schedules.map((sch) => (
              <button
                key={sch.id}
                onClick={() => setActiveScheduleId(sch.id)}
                className={`px-3 py-1.5 text-sm font-bold rounded transition-colors ${
                  activeScheduleId === sch.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-transparent text-gray-600 hover:bg-gray-100'
                }`}
              >
                {thaiMonths[sch.month]} {sch.year + 543}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openApptModal}
            disabled={!activeSchedule || isGenerating}
            className="bg-white text-amber-700 border border-amber-300 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-amber-50 shadow-sm disabled:opacity-50"
          >
            <CalendarDays className="w-4 h-4" /> ยอดคนไข้ (4S2)
          </button>
          <button
            onClick={handleAutoGenerate}
            disabled={!activeSchedule || isGenerating}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-700 active:scale-95 transition-transform shadow-sm disabled:opacity-60"
          >
            <Wand2 className="w-4 h-4" />{' '}
            {isGenerating
              ? `กำลังสุ่ม... ${Math.round((genProgress / TC_ATTEMPTS) * 100)}%`
              : 'สุ่มเวรอัตโนมัติ'}
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm"
          >
            <Plus className="w-4 h-4" /> สร้างใหม่
          </button>
        </div>
      </div>

      <div className="flex flex-col mb-4 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 shrink-0 print-hidden">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-1">
              <Settings className="w-4 h-4" /> กฎการสุ่มเวร
            </h3>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowRuleDropdown(!showRuleDropdown)}
              className="text-xs bg-white border border-dashed border-indigo-300 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 flex items-center gap-1 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มเงื่อนไข
            </button>
            {showRuleDropdown && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 shadow-xl rounded-xl z-50 py-2">
                <div className="px-4 py-1.5 bg-gray-50 text-xs font-bold text-gray-700 mb-1 border-b border-gray-100">
                  เงื่อนไขของ: {CATEGORIZED_RULES[selectedRuleRole].label}
                </div>
                {inactiveRules.length > 0 ? (
                  inactiveRules.map((rule) => (
                    <button
                      key={rule.id}
                      onClick={() => {
                        setRules({ ...rules, [rule.id]: true });
                        setShowRuleDropdown(false);
                      }}
                      className="w-full text-left px-5 py-2.5 text-xs text-gray-600 hover:bg-indigo-50 transition-colors"
                    >
                      {rule.label}
                    </button>
                  ))
                ) : (
                  <div className="px-5 py-4 text-xs text-gray-400 text-center">
                    ไม่มีเงื่อนไขเพิ่มเติมให้เลือก
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap min-h-[30px]">
          {currentlyActiveRules.length > 0 ? (
            currentlyActiveRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 rounded-lg text-xs font-medium border border-gray-200 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                {rule.label}
                <button
                  onClick={() => setRules({ ...rules, [rule.id]: false })}
                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          ) : (
            <span className="text-xs text-gray-400 italic">
              ไม่มีเงื่อนไขที่ถูกเปิดใช้งานสำหรับหมวดหมู่นี้ หรือเว้นว่างไว้
            </span>
          )}
        </div>
      </div>

      {genReport && (
        <div
          className={`mb-3 p-3 rounded-xl border text-xs shrink-0 print-hidden ${
            genReport.missingList.length === 0 &&
            genReport.fixedIssues.length === 0 &&
            (genReport.minIssues || []).length === 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="space-y-1">
              <div className="font-bold text-sm">
                {genReport.missingList.length === 0
                  ? '✅ จัดเวรครบทุกช่อง'
                  : `⚠️ มีช่องที่จัดไม่ได้ ${genReport.missingList.length} ช่อง (เว้นว่างไว้ — กดสุ่มใหม่ หรือจัดเองได้)`}
              </div>
              {genReport.missingList.length > 0 && (
                <div>
                  {genReport.missingList
                    .map((m) => `${Number(m.dateStr.slice(8))}: ${m.shiftName}`)
                    .join(' · ')}
                </div>
              )}
              {genReport.fixedIssues.length > 0 && (
                <div>จำนวนเวรตายตัวไม่ครบ: {genReport.fixedIssues.join(' · ')}</div>
              )}
              {(genReport.minIssues || []).length > 0 && (
                <div>ยังไม่ได้ขั้นต่ำ: {genReport.minIssues.join(' · ')}</div>
              )}
              {(genReport.balanceInfo || []).length > 0 && (
                <div>เวรที่เฉลี่ย: {genReport.balanceInfo.join(' · ')}</div>
              )}
              {genReport.warnings.length > 0 && (
                <div>
                  <div className="font-bold mt-1">ข้อจำกัดของเดือนนี้ (จัดให้ครบไม่ได้ทางคณิตศาสตร์):</div>
                  <ul className="list-disc ml-5">
                    {genReport.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-gray-600">
                เงินรวม (เฉพาะคนที่นำมาเฉลี่ย): ต่ำสุด{' '}
                {Math.round(genReport.money.min).toLocaleString()} – สูงสุด{' '}
                {Math.round(genReport.money.max).toLocaleString()} บาท (ห่างกัน{' '}
                {Math.round(genReport.money.range).toLocaleString()}) · ตัวเวรซ้ำรวม{' '}
                {genReport.dup} ครั้ง · เวรติดกัน {genReport.consec} ครั้ง (ไม่บังคับ)
              </div>
              {(genReport.dupList || []).length > 0 && (
                <div className="text-gray-600">ตัวเวรซ้ำ: {genReport.dupList.join(' · ')}</div>
              )}
            </div>
            <button
              onClick={() => setGenReport(null)}
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {activeSchedule && (
        <div className="flex justify-end gap-2 shrink-0 items-center mb-3">
          {check && (
            <div className="mr-auto flex items-center gap-2 flex-wrap print-hidden">
              <div
                className={`px-2.5 py-1.5 rounded-lg text-sm font-bold border ${
                  checkFilled === checkNeed
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-red-50 text-red-600 border-red-200'
                }`}
                title="จำนวนช่องเวรที่ลงแล้ว / ที่ต้องมีทั้งเดือน (รวมเวร 4S2 ตามยอดคนไข้)"
              >
                📊 {checkFilled}/{checkNeed} ช่อง
              </div>
              <div className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-bold text-emerald-700">
                💰 {checkMoney.toLocaleString()} บ.
              </div>
              {check.missing.length === 0 &&
                check.over.length === 0 &&
                check.violations.length === 0 &&
                check.capViol.length === 0 &&
                check.minIssues.length === 0 && (
                  <div className="px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm font-bold text-green-700">
                    ✅ เวรครบทุกตำแหน่ง ไม่ผิดเงื่อนไข
                  </div>
                )}
              {check.missing.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-bold text-red-600">
                    ❌ ขาด {check.missing.reduce((a, m) => a + m.lack, 0)}:
                  </span>
                  {check.missing.map((m, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md text-white text-xs font-bold"
                      style={{ backgroundColor: m.color }}
                    >
                      วัน {m.day}·{m.shiftName}
                      {m.lack > 1 ? ` ×${m.lack}` : ''}
                    </span>
                  ))}
                </div>
              )}
              {check.over.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-bold text-orange-600">
                    ⚠️ เกิน/ผิดวัน {check.over.length}:
                  </span>
                  {check.over.map((o, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md text-white text-xs font-bold ring-2 ring-orange-400"
                      style={{ backgroundColor: o.color }}
                    >
                      วัน {o.day}·{o.shiftName}·{o.reason}
                    </span>
                  ))}
                </div>
              )}
              {check.violations.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-bold text-orange-600">
                    ⚠️ ผิดเงื่อนไข {check.violations.length}:
                  </span>
                  {check.violations.map((v, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md text-white text-xs font-bold ring-2 ring-orange-400"
                      style={{ backgroundColor: v.color }}
                    >
                      วัน {v.day}·{v.shiftName}·{v.name} ({v.reason})
                    </span>
                  ))}
                </div>
              )}
              {check.minIssues.length > 0 && (
                <div className="px-2.5 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-bold text-orange-700">
                  ⚠️ ยังไม่ได้ขั้นต่ำ: {check.minIssues.join(' · ')}
                </div>
              )}
              {check.capViol.length > 0 && (
                <div className="px-2.5 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-bold text-orange-700">
                  ⚠️ เกินเพดานต่อคน: {check.capViol.join(' · ')}
                </div>
              )}
              {check.fixedIssues.length > 0 && (
                <div
                  className="px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700"
                  title="จำนวนเวรตายตัวที่ตั้งไว้ในหน้าพนักงาน"
                >
                  🎯 เวรตายตัว: {check.fixedIssues.join(' · ')}
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleDeleteSchedule}
            className="text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-red-100 transition-colors mr-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> ลบตารางนี้
          </button>
          <button
            onClick={handleExportCSV}
            className="text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="text-slate-700 bg-white border border-slate-200 shadow-sm px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
          >
            <Printer className="w-4 h-4" /> PDF
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden border border-gray-200 rounded-xl shadow-sm">
        {!activeSchedule ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Calendar className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-base font-medium">ยังไม่มีตารางเวร</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1 custom-scrollbar">
            <table
              className="w-full border-collapse text-center table-fixed min-w-[1300px] print:min-w-0"
              id="schedule-table"
            >
              <thead>
                <tr className="bg-slate-50 sticky top-0 z-20 shadow-sm">
                  <th className="p-2 border-b border-r border-gray-200 w-[120px] text-sm text-gray-700 print:w-[80px]">
                    พนักงาน
                  </th>
                  {monthDates.map((d) => (
                    <th
                      key={d.dateStr}
                      onClick={() => handleToggleHoliday(d.dateStr)}
                      className={`p-0 border-b border-r border-gray-200 w-[30px] cursor-pointer hover:bg-red-50 transition-colors ${
                        d.isHoliday
                          ? 'bg-red-50 text-red-600 font-bold print:bg-gray-100'
                          : 'text-slate-600'
                      }`}
                    >
                      <div className="text-[10px] print:text-[8px] leading-tight pt-1">
                        {d.dayStr}
                      </div>
                      <div className="text-xs print:text-[10px] pb-1">
                        {d.dateNum}
                      </div>
                    </th>
                  ))}
                  {TC_SUMMARY_GROUPS.map(([label, bg, tc]) => (
                    <th
                      key={label}
                      className={`p-0 border-b border-r border-gray-200 w-[28px] text-[10px] font-bold ${bg} ${tc} print:text-black`}
                    >
                      {label}
                    </th>
                  ))}
                  <th className="p-0 border-b border-r border-gray-200 w-[34px] text-[10px] font-bold bg-gray-100 text-gray-700">
                    รวมเวร
                  </th>
                  <th className="p-2 border-b border-gray-200 w-[70px] text-emerald-700 text-sm font-bold print:text-black">
                    รวม(บ.)
                  </th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  let totalMoney = 0;
                  const grpCnt = {};
                  let totalShifts = 0;
                  monthDates.forEach((d) => {
                    const s0 = shifts.find(
                      (s) => s.id === activeSchedule.assignments[`${emp.id}_${d.dateStr}`]
                    );
                    if (!s0) return;
                    totalShifts++;
                    const g = tcShiftGroup(s0);
                    if (g) grpCnt[g] = (grpCnt[g] || 0) + 1;
                  });

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-gray-50 transition-colors h-8"
                    >
                      <td className="sticky left-0 bg-white group-hover:bg-gray-50 px-2 py-1 border-b border-r border-gray-200 text-left text-xs font-bold text-gray-800 truncate print:static print:text-[10px]">
                        <div className="flex flex-col">
                          <span>{emp.name}</span>
                          <span className="text-[9px] font-normal text-gray-400">
                            เจ้าพนักงานเภสัชกรรม
                          </span>
                        </div>
                      </td>
                      {monthDates.map((d) => {
                        const sData = shifts.find(
                          (s) =>
                            s.id ===
                            activeSchedule.assignments[`${emp.id}_${d.dateStr}`]
                        );
                        if (sData) {
                          totalMoney += getShiftValue(sData);
                        }
                        return (
                          <td
                            key={d.dateStr}
                            onClick={() =>
                              setAssignmentModal({
                                isOpen: true,
                                empId: emp.id,
                                dateStr: d.dateStr,
                              })
                            }
                            className={`p-0 border-b border-r border-gray-200 cursor-pointer relative ${
                              d.isHoliday
                                ? 'bg-red-50/30 print:bg-gray-100'
                                : ''
                            }`}
                          >
                            {sData && (
                              <div
                                className="absolute inset-[2px] rounded-[3px] text-[9px] flex items-center justify-center font-bold text-white leading-none overflow-hidden print:text-black print:border print:border-gray-800 shadow-sm"
                                style={{ backgroundColor: sData.color }}
                              >
                                {sData.name}
                              </div>
                            )}
                            {!sData && tcInOffRange(emp, d.dateStr) && (
                              <div
                                className="absolute inset-0 bg-gray-200/70 text-[8px] text-gray-500 flex items-center justify-center print:hidden"
                                title="ช่วงงดเวร"
                              >
                                งด
                              </div>
                            )}
                          </td>
                        );
                      })}
                      {TC_SUMMARY_GROUPS.map(([label, bg]) => (
                        <td
                          key={label}
                          className={`px-0.5 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-gray-700 ${bg}`}
                        >
                          {grpCnt[label] || '-'}
                        </td>
                      ))}
                      <td className="px-0.5 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-gray-800 bg-gray-50">
                        {totalShifts || '-'}
                      </td>
                      <td className="px-2 py-1 border-b border-gray-200 text-emerald-600 font-bold text-xs text-right print:text-black">
                        {totalMoney.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {check && (
                <tfoot>
                  <tr className="bg-slate-50 h-8">
                    <td className="sticky left-0 bg-slate-50 px-2 py-1 border-t-2 border-r border-gray-300 text-left text-[11px] font-bold text-gray-700">
                      ลงแล้ว / ต้องมี
                    </td>
                    {check.dayFill.map((f, i) => (
                      <td
                        key={i}
                        className={`p-0 border-t-2 border-r border-gray-300 text-[9px] font-bold leading-tight ${
                          f.filled === f.need ? 'text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                        title={`วันที่ ${i + 1}: ลงแล้ว ${f.filled} จาก ${f.need} ช่อง`}
                      >
                        {f.filled}/{f.need}
                      </td>
                    ))}
                    <td
                      colSpan={TC_SUMMARY_GROUPS.length + 2}
                      className="border-t-2 border-gray-300"
                    ></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-5">สร้างตารางเวรใหม่</h3>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  เดือน
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500"
                  value={createMonth}
                  onChange={(e) => setCreateMonth(Number(e.target.value))}
                >
                  {thaiMonths.map((m, i) => (
                    <option key={i} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ปี (ค.ศ.)
                </label>
                <input
                  type="number"
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500"
                  value={createYear}
                  onChange={(e) => setCreateYear(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCreateSchedule}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                สร้างตาราง
              </button>
            </div>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4 print-hidden">
          <style>{`
            @keyframes tcDice { 0%{transform:rotate(0) scale(1)} 25%{transform:rotate(90deg) scale(1.15)} 50%{transform:rotate(180deg) scale(1)} 75%{transform:rotate(270deg) scale(1.15)} 100%{transform:rotate(360deg) scale(1)} }
            @keyframes tcCell { 0%,100%{opacity:.25; transform:scale(.85)} 50%{opacity:1; transform:scale(1)} }
          `}</style>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-lg" style={{ animation: 'tcDice 1.2s ease-in-out infinite' }}>
              <Wand2 className="w-7 h-7" />
            </div>
            <div className="grid grid-cols-7 gap-1 w-40 mx-auto mt-5">
              {Array.from({ length: 21 }, (_, i) => (
                <div
                  key={i}
                  className="h-3 rounded-sm"
                  style={{
                    backgroundColor: ['#8b5cf6', '#3b82f6', '#f97316', '#10b981', '#ec4899', '#eab308', '#6366f1'][(i * 3) % 7],
                    animation: `tcCell 1s ease-in-out ${(i % 7) * 0.12 + Math.floor(i / 7) * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
            <div className="mt-5 font-bold text-gray-800">กำลังสุ่มตารางเวร...</div>
            <div className="text-xs text-gray-500 mt-1">
              รอบที่ {genProgress} / {TC_ATTEMPTS}
              {genBestMissing !== null &&
                (genBestMissing === 0 ? ' · พบตารางที่ครบทุกช่องแล้ว ✅' : ` · ดีที่สุดตอนนี้ขาด ${genBestMissing} ช่อง`)}
            </div>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-150"
                style={{ width: `${Math.round((genProgress / TC_ATTEMPTS) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {isApptModalOpen && activeSchedule && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-xl p-5 shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-base font-bold border-b border-gray-100 pb-3 mb-2">
              ยอดคนไข้รายวัน — {thaiMonths[activeSchedule.month]} {activeSchedule.year + 543}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              กรอกยอดคนไข้ของวันทำการ (เว้นว่าง = ไม่มี) · ระบบจะเปิดเวร 4S2 ให้เองเมื่อยอดถึงเกณฑ์ที่ตั้งไว้ในหน้า "ประเภทเวร"
            </p>
            <div className="overflow-y-auto flex-1 pr-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">วันที่</th>
                    <th className="p-2">ยอดคนไข้</th>
                  </tr>
                </thead>
                <tbody>
                  {monthDates
                    .filter((d) => !d.isHoliday)
                    .map((d) => {
                      const pv = apptDraft[d.dateStr] ?? '';
                      const pList = dynamicShiftsFor('patient', Number(pv) || 0);
                      return (
                        <tr key={d.dateStr} className="border-b border-gray-100">
                          <td className="p-2 whitespace-nowrap">
                            {d.dayStr} {d.dateNum}
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              className="w-24 border border-gray-300 rounded-lg p-1.5 text-center"
                              value={pv}
                              onChange={(e) =>
                                setApptDraft({ ...apptDraft, [d.dateStr]: e.target.value })
                              }
                            />
                            <div className="text-[10px] text-purple-700 mt-0.5 min-h-[12px]">
                              {pList.length > 0 ? `เปิด ${pList.join(' ')}` : ''}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 justify-end pt-4 border-t border-gray-100 mt-3">
              <button
                onClick={() => setIsApptModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={saveAppts}
                className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                บันทึกยอดคนไข้
              </button>
            </div>
          </div>
        </div>
      )}

      {assignmentModal.isOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() =>
            setAssignmentModal({ isOpen: false, empId: null, dateStr: null })
          }
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold border-b border-gray-100 pb-3 mb-4 flex items-center justify-between">
              เลือกเวรประจำวัน
              <button
                onClick={() => handleAssignShift(null)}
                className="py-1 px-3 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 font-medium transition-colors"
              >
                ว่าง (ลบเวร)
              </button>
            </h3>
            <div className="grid grid-cols-3 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {shifts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleAssignShift(s.id)}
                  className="py-2.5 px-1 rounded-lg text-white text-sm font-bold truncate shadow-sm hover:scale-105 transition-transform"
                  style={{ backgroundColor: s.color }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. Component: จัดการพนักงาน (เจ้าพนักงานเภสัชกรรม)
// ==========================================
function EmployeesManager() {
  const [shifts] = useFirebaseSync('tech_shift_types', []);
  const [employees, setEmployees] = useFirebaseSync('tech_employees', []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    role: 'technician',
    offShifts: [],
    specificShifts: [],
    offShiftDays: {},
    fixedCounts: {},
    excludeFromBalance: false,
    offRanges: [],
    moneyOffset: 0,
    note: '',
  });
  const dowNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const shiftName = (id) => shifts.find((x) => x.id === id)?.name;

  const handleSave = () => {
    if (!formData.name) return alert('กรุณากรอกชื่อ');
    if (formData.id)
      setEmployees(employees.map((e) => (e.id === formData.id ? formData : e)));
    else
      setEmployees([...employees, { ...formData, id: Date.now().toString() }]);
    setIsModalOpen(false);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-gray-800">
          จัดการรายชื่อเจ้าพนักงานเภสัชกรรม
        </h2>
        <button
          onClick={() => {
            setFormData({
              name: '',
              role: 'technician',
              offShifts: [],
              specificShifts: [],
              offShiftDays: {},
              fixedCounts: {},
              excludeFromBalance: false,
              offRanges: [],
              moneyOffset: 0,
              note: '',
            });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm"
        >
          <UserPlus className="w-4 h-4" /> เพิ่มเจ้าพนักงานเภสัชกรรม
        </button>
      </div>
      <div className="flex-1 overflow-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-sm text-gray-600 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="p-4 font-bold w-[25%]">ชื่อ</th>
              <th className="p-4 font-bold w-[20%]">หมวดหมู่</th>
              <th className="p-4 font-bold w-[20%]">เวรเฉพาะ (ลงแค่เวรนี้)</th>
              <th className="p-4 font-bold w-[20%]">งดรับเวร</th>
              <th className="p-4 font-bold text-center w-[15%]">จัดการ</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {employees.length === 0 && (
              <tr>
                <td colSpan="5" className="text-center p-8 text-gray-400">
                  ยังไม่มีข้อมูลพนักงาน
                </td>
              </tr>
            )}
            {employees.map((emp) => (
              <tr
                key={emp.id}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="p-4 font-bold text-gray-900">{emp.name}</td>
                <td className="p-4 text-gray-600 font-medium">
                  <span className="px-2 py-1 bg-teal-100 text-teal-800 rounded text-xs">
                    เจ้าพนักงานเภสัชกรรม
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {(!emp.specificShifts ||
                      emp.specificShifts.length === 0) && (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                    {emp.specificShifts?.map((id) => {
                      const s = shifts.find((x) => x.id === id);
                      return s ? (
                        <span
                          key={id}
                          className="px-2 py-1 rounded-md text-xs text-white font-medium shadow-sm"
                          style={{ backgroundColor: s.color }}
                        >
                          {s.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {(!emp.offShifts || emp.offShifts.length === 0) && (
                      <span className="text-gray-400 text-xs">-</span>
                    )}
                    {emp.offShifts?.map((id) => {
                      const s = shifts.find((x) => x.id === id);
                      return s ? (
                        <span
                          key={id}
                          className="px-2 py-1 rounded-md text-xs text-white font-medium shadow-sm opacity-80"
                          style={{ backgroundColor: s.color }}
                        >
                          {s.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <div className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                    {Object.entries(emp.offShiftDays || {})
                      .filter(([id, days]) => shiftName(id) && days && days.length > 0)
                      .map(([id, days]) => (
                        <div key={id}>
                          ห้าม {shiftName(id)} วัน{days.map((d) => dowNames[d]).join(',')}
                        </div>
                      ))}
                    {Object.entries(emp.fixedCounts || {})
                      .filter(([id]) => shiftName(id))
                      .map(([id, n]) => (
                        <div key={id}>
                          {shiftName(id)} ตายตัว {n} เวร/เดือน
                        </div>
                      ))}
                    {emp.excludeFromBalance && <div>ไม่นำมาเฉลี่ยเงิน</div>}
                    {tcMoneyOffsetOf(emp) !== 0 && (
                      <div>เงินเป้าหมายน้อยกว่าคนอื่น {tcMoneyOffsetOf(emp).toLocaleString()} บาท</div>
                    )}
                    {(emp.offRanges || [])
                      .filter((r) => r && (r.from || r.to))
                      .map((r, i) => (
                        <div key={i} className="text-rose-600 font-medium">
                          งดเวร {tcFmtThaiDate(r.from) || 'ตั้งแต่ก่อนหน้า'} – {tcFmtThaiDate(r.to) || 'ไม่กำหนด'}
                        </div>
                      ))}
                    {emp.note && <div className="italic">{emp.note}</div>}
                  </div>
                </td>
                <td className="p-4 text-center">
                  <button
                    onClick={() => {
                      setFormData({
                        ...emp,
                        role: 'technician',
                        offShifts: emp.offShifts || [],
                        specificShifts: emp.specificShifts || [],
                        offShiftDays: emp.offShiftDays || {},
                        fixedCounts: emp.fixedCounts || {},
                        excludeFromBalance: !!emp.excludeFromBalance,
                        offRanges: emp.offRanges || [],
                        moneyOffset: emp.moneyOffset || 0,
                        note: emp.note || '',
                      });
                      setIsModalOpen(true);
                    }}
                    className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg mr-1 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('ยืนยันลบพนักงาน?'))
                        setEmployees(employees.filter((e) => e.id !== emp.id));
                    }}
                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-xl font-bold mb-5 border-b border-gray-100 pb-3">
              {formData.id ? 'แก้ไขข้อมูล' : 'เพิ่มรายชื่อใหม่'}
            </h3>
            <div className="space-y-5 overflow-y-auto flex-1 pr-2 custom-scrollbar">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  ชื่อพนักงาน *
                </label>
                <input
                  type="text"
                  placeholder="ระบุชื่อพนักงาน"
                  className="w-full border border-gray-300 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <label className="block text-sm font-bold text-blue-800 mb-1">
                  เวรเฉพาะ (บังคับลงแค่เวรเหล่านี้)
                </label>
                <div className="flex flex-wrap gap-2">
                  {shifts.map((s) => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        formData.specificShifts?.includes(s.id)
                          ? 'bg-white border-blue-400 shadow-sm'
                          : 'bg-white/50 border-gray-200 hover:bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-blue-600 rounded"
                        checked={formData.specificShifts?.includes(s.id)}
                        onChange={(e) => {
                          const newSpecific = e.target.checked
                            ? [...(formData.specificShifts || []), s.id]
                            : (formData.specificShifts || []).filter(
                                (id) => id !== s.id
                              );
                          const newOff = (formData.offShifts || []).filter(
                            (id) => id !== s.id
                          );
                          setFormData({
                            ...formData,
                            specificShifts: newSpecific,
                            offShifts: newOff,
                          });
                        }}
                      />
                      <span style={{ color: s.color }}>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                <label className="block text-sm font-bold text-red-800 mb-1">
                  งดรับเวร (เวรที่ไม่ต้องการขึ้น)
                </label>
                <div className="flex flex-wrap gap-2">
                  {shifts.map((s) => (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        formData.offShifts?.includes(s.id)
                          ? 'bg-white border-red-300 shadow-sm'
                          : 'bg-white/50 border-gray-200 hover:bg-white'
                      } ${
                        formData.specificShifts?.includes(s.id)
                          ? 'opacity-50 pointer-events-none'
                          : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-red-500 rounded"
                        disabled={formData.specificShifts?.includes(s.id)}
                        checked={formData.offShifts?.includes(s.id)}
                        onChange={(e) => {
                          const newOff = e.target.checked
                            ? [...(formData.offShifts || []), s.id]
                            : (formData.offShifts || []).filter(
                                (id) => id !== s.id
                              );
                          setFormData({ ...formData, offShifts: newOff });
                        }}
                      />
                      <span style={{ color: s.color }}>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100">
                <label className="block text-sm font-bold text-orange-800 mb-1">
                  ห้ามเวรนี้เฉพาะบางวัน (เช่น ห้าม T วันอาทิตย์)
                </label>
                {Object.entries(formData.offShiftDays || {}).map(([id, days]) => (
                  <div key={id} className="flex items-center gap-1.5 flex-wrap mb-2 text-xs">
                    <span className="font-bold w-12">{shiftName(id) || '?'}</span>
                    {dowNames.map((dn, dow) => {
                      const on = (days || []).includes(dow);
                      return (
                        <button
                          key={dow}
                          type="button"
                          onClick={() => {
                            const nd = on ? days.filter((x) => x !== dow) : [...(days || []), dow];
                            setFormData({
                              ...formData,
                              offShiftDays: { ...formData.offShiftDays, [id]: nd },
                            });
                          }}
                          className={`px-2 py-1 rounded border ${
                            on ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-gray-200'
                          }`}
                        >
                          {dn}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        const nd = { ...formData.offShiftDays };
                        delete nd[id];
                        setFormData({ ...formData, offShiftDays: nd });
                      }}
                      className="text-red-400 hover:text-red-600 ml-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <select
                  className="border border-gray-300 rounded-lg p-1.5 text-xs bg-white"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setFormData({
                      ...formData,
                      offShiftDays: { ...(formData.offShiftDays || {}), [e.target.value]: [] },
                    });
                  }}
                >
                  <option value="">+ เลือกเวร</option>
                  {shifts
                    .filter((s) => !(formData.offShiftDays || {})[s.id])
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                <label className="block text-sm font-bold text-emerald-800 mb-1">
                  จำนวนเวรตายตัวต่อเดือน (เช่น P = 5 เวร)
                </label>
                {Object.entries(formData.fixedCounts || {}).map(([id, n]) => (
                  <div key={id} className="flex items-center gap-2 mb-2 text-xs">
                    <span className="font-bold w-12">{shiftName(id) || '?'}</span>
                    <input
                      type="number"
                      min="0"
                      className="w-20 border border-gray-300 rounded-lg p-1.5 text-center"
                      value={n}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          fixedCounts: {
                            ...formData.fixedCounts,
                            [id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                          },
                        })
                      }
                    />
                    <span>เวร</span>
                    <button
                      type="button"
                      onClick={() => {
                        const nf = { ...formData.fixedCounts };
                        delete nf[id];
                        setFormData({ ...formData, fixedCounts: nf });
                      }}
                      className="text-red-400 hover:text-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <select
                  className="border border-gray-300 rounded-lg p-1.5 text-xs bg-white"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setFormData({
                      ...formData,
                      fixedCounts: { ...(formData.fixedCounts || {}), [e.target.value]: 1 },
                    });
                  }}
                >
                  <option value="">+ เลือกเวร</option>
                  {shifts
                    .filter((s) => (formData.fixedCounts || {})[s.id] === undefined)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!formData.excludeFromBalance}
                  onChange={(e) =>
                    setFormData({ ...formData, excludeFromBalance: e.target.checked })
                  }
                />
                ไม่นำมาเฉลี่ยเงิน (เช่น คนที่ลงได้เฉพาะบางเวร)
              </label>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  ให้เงินรวมน้อยกว่าคนอื่นประมาณ (บาท)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0 = เฉลี่ยเท่าคนอื่น"
                  className="w-40 border border-gray-300 rounded-lg p-2 text-sm"
                  value={formData.moneyOffset || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      moneyOffset: e.target.value === '' ? 0 : Number(e.target.value),
                    })
                  }
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  เช่น พัชราภา 1,060 บาท (งด ด1/ด2) — ระบบจะตั้งเป้าให้เงินต่ำกว่าคนอื่นเท่านี้
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  ช่วงงดเวร (ลา / ยังไม่เริ่มขึ้นเวร)
                </label>
                {(formData.offRanges || []).map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2 text-sm">
                    <span className="text-gray-500">ตั้งแต่</span>
                    <input
                      type="date"
                      className="border border-gray-300 rounded-lg p-1.5"
                      value={r.from || ''}
                      onChange={(e) => {
                        const nr = [...formData.offRanges];
                        nr[idx] = { ...nr[idx], from: e.target.value };
                        setFormData({ ...formData, offRanges: nr });
                      }}
                    />
                    <span className="text-gray-500">ถึง</span>
                    <input
                      type="date"
                      className="border border-gray-300 rounded-lg p-1.5"
                      value={r.to || ''}
                      onChange={(e) => {
                        const nr = [...formData.offRanges];
                        nr[idx] = { ...nr[idx], to: e.target.value };
                        setFormData({ ...formData, offRanges: nr });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          offRanges: formData.offRanges.filter((_, j) => j !== idx),
                        })
                      }
                      className="text-red-500 hover:bg-red-50 p-1 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      offRanges: [...(formData.offRanges || []), { from: '', to: '' }],
                    })
                  }
                  className="text-xs text-blue-600 border border-dashed border-blue-300 px-3 py-1.5 rounded-lg hover:bg-blue-50"
                >
                  + เพิ่มช่วงงดเวร
                </button>
                <p className="text-[11px] text-gray-400 mt-1">
                  เว้นช่อง "ตั้งแต่" ว่าง = งดมาตั้งแต่ก่อนหน้า · เว้น "ถึง" ว่าง = งดไปเรื่อย ๆ · เดือนที่อยู่เวรไม่ครบทั้งเดือนจะไม่นำมาเฉลี่ยเงิน
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">หมายเหตุ</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                  value={formData.note || ''}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100 shrink-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors"
              >
                บันทึกพนักงาน
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. Component: จัดการประเภทเวร (เจ้าพนักงานเภสัชกรรม)
// ==========================================
function ShiftTypesManager() {
  const [shifts, setShifts] = useFirebaseSync('tech_shift_types', []);
  const [, setEmployees] = useFirebaseSync('tech_employees', []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    color: '#3b82f6',
    start: '',
    end: '',
    min: 1,
    allowedDays: 'all',
    value: '',
    dynamic: '',
    minAppt: '',
    capPerPerson: '',
    balanceAmong: false,
    minPerPerson: '',
    minGroup: '',
    restAfter: false,
    exclusiveWith: [],
  });

  // อัปเดตเฉพาะ "กฎ" ของเวรที่มีอยู่ให้ตรงค่าแนะนำ (ไม่แตะชื่อ/สี/เวลา/ค่าเวร/พนักงาน/ตาราง)
  const TC_RULE_KEYS = ['restAfter', 'exclusiveWith', 'dynamic', 'minAppt'];
  const handleApplyRecommendedRules = () => {
    const changes = [];
    const next = shifts.map((sh) => {
      const seed =
        TC_SEED_SHIFTS.find((x) => x.id === sh.id) ||
        TC_SEED_SHIFTS.find((x) => x.name === (sh.name || '').trim());
      if (!seed) return sh;
      const upd = { ...sh };
      const diff = [];
      TC_RULE_KEYS.forEach((k) => {
        if (seed[k] === undefined) return;
        if (JSON.stringify(upd[k]) !== JSON.stringify(seed[k])) {
          upd[k] = seed[k];
          diff.push(k);
        }
      });
      if (diff.length > 0) changes.push(sh.name);
      return upd;
    });
    if (changes.length === 0) {
      alert('กฎของทุกเวรตรงกับค่าแนะนำอยู่แล้ว');
      return;
    }
    if (
      !confirm(
        `จะตั้งกฎตามค่าแนะนำให้เวร: ${changes.join(', ')}\n\n` +
          '• ด1, ด2: วันถัดไปห้ามมีเวร\n' +
          '• S1/4O กับ 4S1: ห้ามอยู่คนเดียวกันในเดือนเดียวกัน\n' +
          '• 4S2: เปิดเมื่อยอดคนไข้ ≥ 351\n\n' +
          'ไม่แตะชื่อ สี เวลา ค่าเวร รายชื่อพนักงาน และตารางเดิม — ยืนยัน?'
      )
    )
      return;
    setShifts(next);
    alert('อัปเดตกฎเรียบร้อย — กดสุ่มเวรใหม่ได้เลย');
  };

  const handleSeed = () => {
    if (
      !confirm(
        'นำเข้าประเภทเวรและรายชื่อเจ้าพนักงานเภสัชกรรม 34 คนตามเอกสาร?\n⚠️ ประเภทเวรและรายชื่อเดิมของหน้าเจ้าพนักงานฯ จะถูกเขียนทับทั้งหมด (ไม่กระทบหน้าเภสัชกร/ผู้ช่วยเภสัชกร)'
      )
    )
      return;
    setShifts(TC_SEED_SHIFTS.map((x) => ({ ...x })));
    setEmployees(tcSeedEmployees());
    alert('นำเข้าเรียบร้อย — ตรวจชื่อ/เงื่อนไขในแท็บ "พนักงาน" ได้เลย');
  };

  const colorOptions = [
    '#3b82f6',
    '#ef4444',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#14b8a6',
    '#f97316',
    '#6366f1',
    '#06b6d4',
    '#84cc16',
    '#f43f5e',
    '#d946ef',
    '#0ea5e9',
    '#eab308',
    '#64748b',
  ];

  const handleSave = () => {
    if (!formData.name) return alert('กรุณากรอกชื่อเวร');
    const saved = formData.id ? formData : { ...formData, id: Date.now().toString() };
    const ex = saved.exclusiveWith || [];
    let next = formData.id
      ? shifts.map((s) => (s.id === saved.id ? saved : s))
      : [...shifts, saved];
    // ทำให้ "ห้ามอยู่คนเดียวกันในเดือน" เป็นสองทาง
    next = next.map((s) => {
      if (s.id === saved.id) return s;
      const cur = s.exclusiveWith || [];
      const has = cur.includes(saved.id);
      if (ex.includes(s.id) && !has) return { ...s, exclusiveWith: [...cur, saved.id] };
      if (!ex.includes(s.id) && has) return { ...s, exclusiveWith: cur.filter((x) => x !== saved.id) };
      return s;
    });
    setShifts(next);
    setIsModalOpen(false);
  };

  const getAllowedDaysText = (val) => {
    if (val === 'weekdays') return 'วันธรรมดา';
    if (val === 'weekends_holidays') return 'วันหยุด';
    if (val === 'saturdays_only') return 'วันเสาร์';
    if (val === 'mon_tue_only') return 'จันทร์-อังคาร';
    if (val === 'holidays_except_saturday') return 'วันหยุด (ยกเว้นเสาร์)';
    if (val === 'weekends_only') return 'เสาร์-อาทิตย์ (ไม่รวมนักขัตฤกษ์)';
    if (val === 'weekday_holidays') return 'นักขัตฤกษ์ที่ตรง จ.-ศ.';
    return 'ทุกวัน';
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">จัดการประเภทเวร (เจ้าพนักงานเภสัชกรรม)</h2>
        <div className="flex gap-2">
        <button
          onClick={handleApplyRecommendedRules}
          className="bg-white text-green-700 border border-green-300 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-green-50 shadow-sm"
        >
          <CheckCircle2 className="w-4 h-4" /> ตั้งกฎตามค่าแนะนำ
        </button>
        <button
          onClick={handleSeed}
          className="bg-white text-indigo-700 border border-indigo-300 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-indigo-50 shadow-sm"
        >
          <Download className="w-4 h-4" /> นำเข้าข้อมูลตั้งต้น
        </button>
        <button
          onClick={() => {
            setFormData({
              name: '',
              color: '#3b82f6',
              start: '',
              end: '',
              min: 1,
              allowedDays: 'all',
              value: '',
              dynamic: '',
              minAppt: '',
              capPerPerson: '',
              balanceAmong: false,
              minPerPerson: '',
              minGroup: '',
              restAfter: false,
              exclusiveWith: [],
            });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm"
        >
          <Plus className="w-4 h-4" /> เพิ่มเวร
        </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 overflow-y-auto pr-2 pb-4">
        {shifts.map((s) => (
          <div
            key={s.id}
            className="border border-gray-200 rounded-2xl p-5 bg-white relative overflow-hidden shadow-sm hover:shadow-md transition-all group"
          >
            <div
              className="absolute top-0 left-0 w-full h-1.5"
              style={{ backgroundColor: s.color }}
            ></div>
            <div className="flex justify-between items-start mb-4 mt-1">
              <span className="font-bold text-xl text-gray-800 truncate pr-2">
                {s.name}
              </span>
              <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setFormData(s);
                    setIsModalOpen(true);
                  }}
                  className="text-blue-500 bg-blue-50 p-1.5 rounded-lg hover:bg-blue-100"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm('ลบเวรนี้?'))
                      setShifts(shifts.filter((x) => x.id !== s.id));
                  }}
                  className="text-red-500 bg-red-50 p-1.5 rounded-lg hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-gray-400" /> {s.start || '--:--'}{' '}
                - {s.end || '--:--'}
              </div>
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-gray-400" /> รับ:{' '}
                <span className="font-bold text-gray-800">{s.min}</span> คน
              </div>
              <div className="flex items-center gap-2.5">
                <CalendarDays className="w-4 h-4 text-gray-400" />{' '}
                {getAllowedDaysText(s.allowedDays)}
              </div>
              {s.dynamic === 'patient' && (
                <div className="flex items-center gap-2.5 text-amber-700 text-xs font-medium">
                  เปิดเมื่อยอดคนไข้ ≥ {s.minAppt || 1}
                </div>
              )}
              {s.restAfter && (
                <div className="flex items-center gap-2.5 text-indigo-700 text-xs font-medium">
                  วันถัดไปห้ามมีเวร (พักหลังเวร)
                </div>
              )}
              {(s.exclusiveWith || []).length > 0 && (
                <div className="flex items-center gap-2.5 text-rose-700 text-xs font-medium">
                  ห้ามอยู่คนเดียวกันในเดือนกับ{' '}
                  {(s.exclusiveWith || [])
                    .map((id) => (shifts.find((x) => x.id === id) || {}).name)
                    .filter(Boolean)
                    .join(', ')}
                </div>
              )}
              {tcCapOf(s) !== null && (
                <div className="flex items-center gap-2.5 text-rose-700 text-xs font-medium">
                  จำกัด {tcCapOf(s)} เวร/คน/เดือน
                  {s.dynamic ? ' (นับรวมทุกเวรตามยอดคนไข้)' : ''}
                </div>
              )}
              {s.balanceAmong && (
                <div className="flex items-center gap-2.5 text-sky-700 text-xs font-medium">
                  เฉลี่ยให้เท่ากันระหว่างคนที่ลงได้
                </div>
              )}
              {tcMinPerPersonOf(s) > 0 && (
                <div className="flex items-center gap-2.5 text-green-700 text-xs font-medium">
                  ทุกคนต้องได้อย่างน้อย {tcMinPerPersonOf(s)} เวร
                  {s.minGroup && String(s.minGroup).trim()
                    ? ` (นับรวมกลุ่ม ${tcMinGroupLabel(s, shifts)})`
                    : ''}
                </div>
              )}
              <div className="flex items-center gap-2.5 border-t pt-3 mt-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />{' '}
                <span className="text-emerald-600 font-bold">
                  {getShiftValue(s).toLocaleString('th-TH')} บ.
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-7 shadow-2xl max-h-[92vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6 border-b border-gray-100 pb-3">
              {formData.id ? 'แก้ไขเวร' : 'เพิ่มเวรใหม่'}
            </h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  ชื่อเวร *
                </label>
                <input
                  type="text"
                  placeholder="เช่น เช้า, บ่าย, ดึก"
                  className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  สีป้ายเวร
                </label>
                <div className="flex gap-2 flex-wrap p-3 bg-gray-50 rounded-xl border border-gray-100">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-lg transition-all ${
                        formData.color === color
                          ? 'ring-2 ring-offset-2 ring-gray-800 scale-110'
                          : 'hover:scale-110 shadow-sm border border-black/10'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    เวลาเริ่ม
                  </label>
                  <input
                    type="time"
                    className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.start}
                    onChange={(e) =>
                      setFormData({ ...formData, start: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    เวลาสิ้นสุด
                  </label>
                  <input
                    type="time"
                    className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.end}
                    onChange={(e) =>
                      setFormData({ ...formData, end: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  จำนวนคนต้องการ / วัน
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.min}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      min: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  เงื่อนไขวันที่จัดได้
                </label>
                <select
                  className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={formData.allowedDays}
                  onChange={(e) =>
                    setFormData({ ...formData, allowedDays: e.target.value })
                  }
                >
                  <option value="all">ลงได้ทุกวัน (รวมวันหยุด)</option>
                  <option value="weekdays">เฉพาะวันธรรมดา (จ.-ศ.)</option>
                  <option value="weekends_holidays">
                    เฉพาะวันหยุด (ส.-อา. และนักขัตฤกษ์)
                  </option>
                  <option value="saturdays_only">เฉพาะวันเสาร์</option>
                  <option value="mon_tue_only">เฉพาะ จันทร์-อังคาร</option>
                  <option value="holidays_except_saturday">
                    เฉพาะวันหยุด (ยกเว้นเสาร์)
                  </option>
                  <option value="weekends_only">
                    เฉพาะเสาร์-อาทิตย์ (ไม่รวมนักขัตฤกษ์)
                  </option>
                  <option value="weekday_holidays">
                    เฉพาะนักขัตฤกษ์ที่ตรงวัน จ.-ศ.
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  ค่าเวร (บาท)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="เว้นว่าง = คิดจากชั่วโมง × 100"
                  className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.value ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      value: e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    เปิดเวรตามยอดคนไข้
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-xl p-3 text-base outline-none bg-white"
                    value={formData.dynamic || ''}
                    onChange={(e) => setFormData({ ...formData, dynamic: e.target.value })}
                  >
                    <option value="">ไม่ใช่ (เปิดทุกวันที่กำหนด)</option>
                    <option value="patient">ตามยอดคนไข้</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    เปิดเมื่อยอดคนไข้ ≥
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={!formData.dynamic}
                    className="w-full border border-gray-300 rounded-xl p-3 text-base outline-none disabled:bg-gray-100"
                    value={formData.minAppt ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minAppt: e.target.value === '' ? '' : Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  จำกัดต่อคนต่อเดือน (เวร)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="เว้นว่าง = ไม่จำกัด"
                  className="w-full border border-gray-300 rounded-xl p-3 text-base outline-none"
                  value={formData.capPerPerson ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      capPerPerson: e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  เวรที่เปิดตามยอดคนไข้นับรวมกัน
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!formData.restAfter}
                  onChange={(e) => setFormData({ ...formData, restAfter: e.target.checked })}
                />
                ลงเวรนี้แล้ว วันถัดไปห้ามมีเวร (เช่น ด1, ด2)
              </label>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  ห้ามอยู่คนเดียวกันในเดือนเดียวกันกับเวร
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {shifts
                    .filter((x) => x.id !== formData.id)
                    .map((x) => {
                      const on = (formData.exclusiveWith || []).includes(x.id);
                      return (
                        <button
                          type="button"
                          key={x.id}
                          onClick={() =>
                            setFormData({
                              ...formData,
                              exclusiveWith: on
                                ? (formData.exclusiveWith || []).filter((y) => y !== x.id)
                                : [...(formData.exclusiveWith || []), x.id],
                            })
                          }
                          className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                            on ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'
                          }`}
                          style={on ? { backgroundColor: x.color } : {}}
                        >
                          {x.name}
                        </button>
                      );
                    })}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  เช่น S1/4O กับ 4S1: คนที่ได้เวรหนึ่งในเดือนนั้น จะไม่ได้อีกเวร (ระบบตั้งให้ทั้งสองฝั่งเมื่อบันทึก)
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!formData.balanceAmong}
                  onChange={(e) => setFormData({ ...formData, balanceAmong: e.target.checked })}
                />
                เฉลี่ยจำนวนเวรนี้ให้เท่ากันระหว่างคนที่ลงได้ (เช่น เวร ช)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    ทุกคนต้องได้อย่างน้อย (เวร/เดือน)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="เว้นว่าง = ไม่บังคับ"
                    className="w-full border border-gray-300 rounded-xl p-3 text-base outline-none"
                    value={formData.minPerPerson ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minPerPerson: e.target.value === '' ? '' : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">
                    ชื่อกลุ่มขั้นต่ำ
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น บ่าย"
                    className="w-full border border-gray-300 rounded-xl p-3 text-base outline-none"
                    value={formData.minGroup ?? ''}
                    onChange={(e) => setFormData({ ...formData, minGroup: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 -mt-3">
                เวรที่ใส่ชื่อกลุ่มเดียวกันจะนับรวมกัน เช่น OE และ IE ใส่ "บ่าย" ทั้งคู่ = ทุกคนต้องได้ OE หรือ IE อย่างน้อย 1 เวร · ไม่นับคนที่ลงเวรนี้ไม่ได้
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-8 pt-4 border-t border-gray-100">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md hover:shadow-lg transition-all"
              >
                บันทึกเวร
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}