import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Users, Clock, Plus, Edit2, Trash2, UserPlus,
  Wand2, Settings, CalendarDays, CheckCircle2, X, Printer,
  Download, ArrowLeft, ChevronDown,
} from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ─── กลุ่มเภสัชกร 5 กลุ่ม ───
export const PHARMACIST_GROUPS = [
  { id: 'normal',       label: 'ปกติ',           color: '#6366f1', desc: 'ขึ้นเวรได้ทุกประเภท รวมดึก' },
  { id: 'r2',           label: 'R2',              color: '#0ea5e9', desc: 'มีเวร R2, ขึ้นดึกได้' },
  { id: 'r2_off_night', label: 'R2 + งดดึก',     color: '#f59e0b', desc: 'มีเวร R2, งดเวรดึก' },
  { id: 'off_night',    label: 'งดดึก',           color: '#10b981', desc: 'งดเวรดึก (di, de) แต่ขึ้นได้ทุกอย่างอื่น' },
  { id: 'off_special',  label: 'Off พิเศษ',       color: '#ef4444', desc: 'งดดึก + งด 4s, บe, บr, R1, T1, T2, G, A — ขึ้นเฉพาะที่กำหนด' },
];

// ─── Firebase Sync Hook ───
function useFirebaseSync(key, initialValue) {
  const [storedValue, setStoredValue] = useState(initialValue);
  useEffect(() => {
    const docRef = doc(db, 'shift_data', key);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        let data = docSnap.data()?.value;
        if (data === undefined || data === null) data = initialValue;
        else if (typeof initialValue === 'object' && !Array.isArray(initialValue))
          data = { ...initialValue, ...data };
        setStoredValue(data);
      } else {
        setDoc(docRef, { value: initialValue }).catch(console.error);
        setStoredValue(initialValue);
      }
    }, console.error);
    return () => unsubscribe();
  }, [key]);

  const setValue = (value) => {
    const v = value instanceof Function ? value(storedValue) : value;
    if (v !== undefined) {
      setStoredValue(v);
      setDoc(doc(db, 'shift_data', key), { value: v }).catch(console.error);
    }
  };
  return [storedValue !== undefined ? storedValue : initialValue, setValue];
}

// ─── ค่าเวรและชั่วโมง ───
const getShiftValue = (shift) => {
  if (!shift?.name) return 0;
  const n = shift.name.trim().toLowerCase();
  // 4s1-4s4: hardcode 720 เพราะไม่มี start/end ที่คำนวณได้ถูก
  if (['4s1','4s2','4s3','4s4'].includes(n)) return 720;
  // เวรอื่นคำนวณจาก start/end ที่ตั้งใน Firebase
  if (!shift.start || !shift.end) return 0;
  const [h1,m1] = shift.start.split(':').map(Number);
  const [h2,m2] = shift.end.split(':').map(Number);
  let hrs = h2 - h1 + (m2 - m1) / 60;
  if (hrs < 0) hrs += 24;
  return hrs * 100;
};

const getShiftHours = (shift) => {
  if (!shift?.start || !shift?.end) return 0;
  const [h1,m1] = shift.start.split(':').map(Number);
  const [h2,m2] = shift.end.split(':').map(Number);
  let hrs = h2 - h1 + (m2 - m1) / 60;
  if (hrs < 0) hrs += 24;
  return hrs;
};

// ─── หมวดเวร ───
// Priority: ใช้ field 'category' จาก Firebase ก่อน
// ถ้าไม่มีค่อย fallback ไป match ชื่อ
const getShiftCategory = (shift) => {
  if (!shift?.name) return 'อื่นๆ';

  // ถ้า Firebase มี category field → ใช้เลย (ไม่ต้อง hardcode)
  if (shift.category) return shift.category;

  // Fallback: match จากชื่อ (สำหรับเวรเก่าที่ยังไม่มี category field)
  const u = shift.name.trim().toUpperCase();
  const l = shift.name.trim().toLowerCase();
  if (u === 'AS/4' || u === 'AS1') return 'As/4';
  if (u === 'A/4') return 'A/4';
  if (['B','C','D','E','F','G','R1','R2','T1','T2'].includes(u)) return 'เช้า';
  if (['บI','บR','บE'].includes(u)) return 'บ่าย';
  if (['ดI','ดE'].includes(u)) return 'ดึก';
  if (['4s1','4s2','4s3','4s4'].includes(l)) return 'SMC';
  if (u === '4O') return '4o';
  if (u === '2O') return '2o';
  return 'อื่นๆ';
};

// ─── เวรที่กลุ่ม Off พิเศษ งดขึ้น ───
const OFF_SPECIAL_BANNED_CATS = new Set(['ดึก','SMC']);
const OFF_SPECIAL_BANNED_NAMES = new Set(['บe','บr','R1','T1','T2','G','A','AS1','AS/4'].map(x=>x.toUpperCase()));

const isShiftBannedForOffSpecial = (shift) => {
  const cat = getShiftCategory(shift);
  const u = shift.name.trim().toUpperCase();
  return OFF_SPECIAL_BANNED_CATS.has(cat) || OFF_SPECIAL_BANNED_NAMES.has(u);
};

// ─── กฎ 9 ข้อ ───
const RULES_LIST = [
  { id: 'rule_1', label: '1. ห้ามเวรติดกัน 2 วัน' },
  { id: 'rule_2', label: '2. เวรบ่ายห้ามซ้ำตำแหน่ง และต้องได้ บe หากบ่าย ≥ 2' },
  { id: 'rule_3', label: '3. คนที่มี R1 จะมีเวร G ร่วมด้วยเสมอ' },
  { id: 'rule_4', label: '4. R1 ≠ T1/T2 (ร่วมกันไม่ได้)' },
  { id: 'rule_5', label: '5. T1 หรือ T2 ≠ R1' },
  { id: 'rule_6', label: '6. As/4 หรือ A ได้แค่คนละ 1 เวร/เดือน' },
  { id: 'rule_7', label: '7. เวรเช้าห้ามซ้ำตำแหน่ง (A,B,C...T2) กระจายเท่ากัน' },
  { id: 'rule_8', label: '8. กลุ่มงดดึกมีค่าเวรน้อยกว่ากลุ่มปกติ' },
  { id: 'rule_9', label: '9. T1 หรือ T2 ได้แค่อย่างใดอย่างหนึ่ง' },
];

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function PharmacistPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('schedule');
  const tabs = [
    { id: 'schedule', name: 'ตารางเวร', icon: Calendar },
    { id: 'employees', name: 'พนักงาน', icon: Users },
    { id: 'shift_types', name: 'ประเภทเวร', icon: Clock },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-50 font-sans text-slate-800 flex flex-col">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        @media print {
          @page { size: A4 landscape; margin: 3mm; }
          html, body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; zoom: 0.82; }
          .print-hidden { display: none !important; }
          main { padding: 0 !important; }
          .overflow-auto, .custom-scrollbar { overflow: visible !important; }
          table { width: 100% !important; border-collapse: collapse; table-layout: fixed; }
          tr { page-break-inside: avoid; }
          .min-w-\\[1300px\\] { min-width: 0px !important; }
          th, td { padding: 1px 0px !important; font-size: 7.5px !important; word-wrap: break-word; overflow: hidden; }
          .text-xs { font-size: 7px !important; line-height: 1 !important; }
        }
      `}</style>
      <header className="bg-slate-900 px-5 py-3 flex justify-between items-center z-20 relative print-hidden">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-mono text-xs tracking-wider">BACK</span>
          </button>
          <div className="w-px h-5 bg-slate-700" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold font-mono">Rx</span>
            </div>
            <div>
              <div className="text-white font-semibold text-sm leading-tight">ตารางเวร เภสัชกร</div>
              <div className="text-slate-500 text-[10px] font-mono tracking-wider">PHARMACIST SCHEDULE</div>
            </div>
          </div>
        </div>
        <div className="flex gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}>
              <tab.icon className="w-3.5 h-3.5" /> {tab.name}
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

// ══════════════════════════════════════════════════════════════
// 1. ScheduleManager
// ══════════════════════════════════════════════════════════════
function ScheduleManager() {
  const [rawEmployees] = useFirebaseSync('ph_employees', []);
  const [rawShifts] = useFirebaseSync('ph_shift_types', []);
  const [rawSchedules, setSchedules] = useFirebaseSync('ph_schedules', []);
  const [activeScheduleId, setActiveScheduleId] = useFirebaseSync('ph_active_schedule', null);

  const employees = Array.isArray(rawEmployees) ? rawEmployees : [];
  const shifts = Array.isArray(rawShifts) ? rawShifts : [];
  const schedules = Array.isArray(rawSchedules) ? rawSchedules : [];

  const defaultRules = Object.fromEntries(RULES_LIST.map(r => [r.id, true]));
  const [rawRules, setRawRules] = useFirebaseSync('ph_rules', defaultRules);
  const rules = { ...defaultRules, ...(rawRules || {}) };
  const setRules = (r) => setRawRules(r);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createMonth, setCreateMonth] = useState(new Date().getMonth());
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [assignmentModal, setAssignmentModal] = useState({ isOpen: false, empId: null, dateStr: null });
  const [showRuleDropdown, setShowRuleDropdown] = useState(false);
  const [sortByMoney, setSortByMoney] = useState(false);
  const [TARGET_NORMAL_DISPLAY, setTargetNormalDisplay] = useState(60);
  const [TARGET_OFF_NIGHT_DISPLAY, setTargetOffNightDisplay] = useState(44);

  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const thaiDays = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const activeSchedule = schedules.find(s => s.id === activeScheduleId);

  // ─── helper: is holiday ───
  const isHoliday = (d, dow, dateStr) =>
    dow === 0 || dow === 6 || !!(activeSchedule?.holidays?.[dateStr]);

  // ─── helper: is "first day of holiday block" ───
  const isFirstHolidayOfBlock = (d, activeSchedule, daysInMonth) => {
    const dateStr = fmtDateFor(activeSchedule, d);
    const dow = new Date(activeSchedule.year, activeSchedule.month, d).getDay();
    if (!isHolidayRaw(d, dow, dateStr, activeSchedule)) return false;
    if (d === 1) return true;
    const pd = d - 1;
    const pDow = new Date(activeSchedule.year, activeSchedule.month, pd).getDay();
    const pStr = fmtDateFor(activeSchedule, pd);
    return !isHolidayRaw(pd, pDow, pStr, activeSchedule);
  };

  const handleCreateSchedule = () => {
    const newId = `${createYear}-${createMonth}`;
    if (schedules.find(s => s.id === newId)) return alert('มีตารางของเดือนนี้อยู่แล้ว!');
    const newSchedule = { id: newId, year: createYear, month: createMonth, assignments: {}, holidays: {} };
    setSchedules([...schedules, newSchedule]);
    setActiveScheduleId(newId);
    setIsCreateModalOpen(false);
  };

  const handleDeleteSchedule = () => {
    if (!activeSchedule) return;
    if (confirm(`ลบตารางเดือน ${thaiMonths[activeSchedule.month]} ${activeSchedule.year + 543}?`)) {
      const updated = schedules.filter(s => s.id !== activeScheduleId);
      setSchedules(updated);
      setActiveScheduleId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleExportExcel = () => {
    if (!activeSchedule) return;
    const dim = new Date(activeSchedule.year, activeSchedule.month + 1, 0).getDate();
    let csv = '\uFEFFพนักงาน,กลุ่ม,';
    for (let i = 1; i <= dim; i++) csv += i + ',';
    csv += 'เช้า,บ่าย,ดึก,As/4,A/4,SMC,4o,2o,ชั่วโมง,รวมเงิน\n';
    employees.forEach(emp => {
      const grp = PHARMACIST_GROUPS.find(g => g.id === emp.group)?.label || 'ปกติ';
      let row = [`"${emp.name}"`, `"${grp}"`];
      let money = 0, hours = 0;
      let cnt = { เช้า:0, บ่าย:0, ดึก:0, 'As/4':0, 'A/4':0, SMC:0, '4o':0, '2o':0 };
      for (let d = 1; d <= dim; d++) {
        const ds = fmtDateFor(activeSchedule, d);
        const s = shifts.find(s => s.id === activeSchedule.assignments[`${emp.id}_${ds}`]);
        row.push(s ? `"${s.name}"` : '');
        if (s) { money += getShiftValue(s); hours += getShiftHours(s); const c = getShiftCategory(s); if (cnt[c] !== undefined) cnt[c]++; }
      }
      row.push(cnt['เช้า'], cnt['บ่าย'], cnt['ดึก'], cnt['As/4'], cnt['A/4'], cnt['SMC'], cnt['4o'], cnt['2o'], hours, money);
      csv += row.join(',') + '\n';
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `ตารางเวร_${thaiMonths[activeSchedule.month]}.csv`;
    a.click();
  };

  // ══════════════════════════════════════════════════════════════
  // AUTO-GENERATE
  // ══════════════════════════════════════════════════════════════
  const handleAutoGenerate = () => {
    if (!activeSchedule) return;
    const dim = new Date(activeSchedule.year, activeSchedule.month + 1, 0).getDate();
    const newAssignments = {};

    const fmtD = (d) => {
      if (d < 1 || d > dim) return null;
      return `${activeSchedule.year}-${String(activeSchedule.month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    };

    const getDow = (d) => new Date(activeSchedule.year, activeSchedule.month, d).getDay();

    const isHol = (d) => {
      if (d < 1 || d > dim) return false;
      const dow = getDow(d);
      const ds = fmtD(d);
      return dow === 0 || dow === 6 || !!(activeSchedule.holidays?.[ds]);
    };

    const isFirstHol = (d) => {
      if (!isHol(d)) return false;
      return d === 1 || !isHol(d - 1);
    };

    // ─── กำหนดกลุ่มของแต่ละคน ───
    // group: normal | r2 | r2_off_night | off_night | off_special
    const getGroup = (emp) => emp.group || 'normal';

    const canDoNight = (emp) => {
      const g = getGroup(emp);
      return g === 'normal' || g === 'r2';
    };

    const isOffSpecial = (emp) => getGroup(emp) === 'off_special';

    // ─── init empStats ───
    const empStats = {};
    employees.forEach(e => {
      empStats[e.id] = {
        money: 0, hours: 0, totalShifts: 0,
        catCounts: { เช้า:0, บ่าย:0, ดึก:0, SMC:0, 'As/4':0, 'A/4':0, '4o':0, '2o':0, อื่นๆ:0 },
        smcHours: 0,       // ชม.ค่าเวร smc สำหรับกระจาย
        countA_As4: 0,
        assignedMornings: new Set(),   // unique morning positions
        assignedNights: new Set(),
        assignedAfternoons: new Set(),
        afternoonCount: 0,
        hasBe: false, hasR1: false, hasG: false, hasT1: false, hasT2: false,
        lastDay: null,     // วันล่าสุดที่มีเวร (ตรวจ rule_1 ทั้งหน้า-หลัง)
      };
    });

    // ─── shuffle ───
    const shuffle = (arr) => {
      for (let k = arr.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [arr[k], arr[j]] = [arr[j], arr[k]];
      }
    };

    // ─── doAssign ───
    const doAssign = (emp, dateStr, d, shift) => {
      const cat = getShiftCategory(shift);
      const u = shift.name.trim().toUpperCase();
      newAssignments[`${emp.id}_${dateStr}`] = shift.id;
      const hrs = getShiftHours(shift);
      empStats[emp.id].money += getShiftValue(shift);
      empStats[emp.id].hours += hrs;
      empStats[emp.id].totalShifts++;
      empStats[emp.id].catCounts[cat] = (empStats[emp.id].catCounts[cat] || 0) + 1;
      if (cat === 'SMC') empStats[emp.id].smcHours += getShiftHours(shift);
      if (u === 'A/4' || u === 'AS1' || u === 'AS/4') empStats[emp.id].countA_As4++;
      if (cat === 'เช้า') {
        empStats[emp.id].assignedMornings.add(u);
        if (u === 'R1') empStats[emp.id].hasR1 = true;
        if (u === 'G')  empStats[emp.id].hasG  = true;
        if (u === 'T1') empStats[emp.id].hasT1 = true;
        if (u === 'T2') empStats[emp.id].hasT2 = true;
      }
      if (cat === 'ดึก') empStats[emp.id].assignedNights.add(u);
      if (cat === 'บ่าย') {
        empStats[emp.id].assignedAfternoons.add(u);
        empStats[emp.id].afternoonCount++;
        if (u === 'บE') empStats[emp.id].hasBe = true;
      }
      empStats[emp.id].lastDay = d;
    };

    // ─── isApplicable: วันที่จัดได้ ───
    const isApplicable = (shift, d) => {
      const dow = getDow(d);
      const isSat = dow === 6;
      const hol = isHol(d);
      const a = shift.allowedDays || 'all';
      if (a === 'weekdays' && hol) return false;
      if (a === 'weekends_holidays' && !hol) return false;
      if (a === 'saturdays_only' && !isSat) return false;
      if (a === 'mon_tue_only' && (![1,2].includes(dow) || hol)) return false;
      if (a === 'holidays_except_saturday' && (!hol || isSat)) return false;
      if (a === 'first_day_of_holidays') {
        if (!hol) return false;
        return isFirstHol(d);
      }
      return true;
    };

    // ─── คำนวณ target hours ต่อคน (คงที่ตลอดเดือน) ───
    // ต้องอยู่หลัง isApplicable เพราะต้องเรียกใช้
    const normalEmpsAll = employees.filter(e => canDoNight(e));
    const offNightEmpsAll = employees.filter(e => !canDoNight(e) && getGroup(e) !== 'off_special');

    // คำนวณ total hours ทั้งหมดที่ต้องจัดในเดือนนี้
    let totalAllHours = 0;
    for (let d = 1; d <= dim; d++) {
      shifts.forEach(s => {
        if (!isApplicable(s, d)) return;
        const cat = getShiftCategory(s);
        if (cat === '2o') return;
        totalAllHours += getShiftHours(s) * (s.min || 1);
      });
    }

    // off_night แต่ละคนได้ประมาณ TARGET_NORMAL - GAP
    // total = normalCount × TARGET_NORMAL + offNightCount × (TARGET_NORMAL - GAP)
    // total = TARGET_NORMAL × (normalCount + offNightCount) - offNightCount × GAP
    // TARGET_NORMAL = (total + offNightCount × GAP) / (normalCount + offNightCount)
    const GAP = 16;
    const nN = normalEmpsAll.length || 1;
    const nO = offNightEmpsAll.length || 0;
    const TARGET_NORMAL = nN > 0
      ? Math.round((totalAllHours + nO * GAP) / (nN + nO))
      : 60;
    const OFF_NIGHT_GAP = TARGET_NORMAL <= 60 ? 16 : 12;
    const TARGET_OFF_NIGHT = TARGET_NORMAL - OFF_NIGHT_GAP;

    // ─── canAssign (rule checks) ───
    const canAssign = (emp, dateStr, d, shift) => {
      const cat = getShiftCategory(shift);
      const u = shift.name.trim().toUpperCase();
      const st = empStats[emp.id];

      // งดรับเวร / เวรเฉพาะ (personal constraints)
      if (emp.offShifts?.includes(shift.id)) return false;
      if (emp.specificShifts?.length > 0 && !emp.specificShifts.includes(shift.id)) return false;

      // กลุ่ม off_special: งดเวรที่ระบุ
      if (isOffSpecial(emp) && isShiftBannedForOffSpecial(shift)) return false;

      // กลุ่มงดดึก
      if (!canDoNight(emp) && cat === 'ดึก') return false;

      // วันนี้มีเวรแล้ว
      if (newAssignments[`${emp.id}_${dateStr}`]) return false;

      // Rule 1: ห้ามเวรติดกัน (ตรวจทั้งวันก่อนและหลัง)
      // ยกเว้น: ถ้าวันก่อนหน้าเป็น R2 (mandatory) → ไม่นับเป็นการ block
      if (rules.rule_1) {
        if (st.lastDay !== null && d - st.lastDay === 1) {
          // ตรวจว่าเวรวันก่อนเป็น R2 ไหม
          const prevDs = fmtD(d - 1);
          const prevShiftId = prevDs ? newAssignments[`${emp.id}_${prevDs}`] : null;
          const prevShift = prevShiftId ? shifts.find(s => s.id === prevShiftId) : null;
          const prevWasR2 = prevShift?.name?.trim().toUpperCase() === 'R2';
          if (!prevWasR2) return false;
        }
        const nextDs = fmtD(d + 1);
        if (nextDs && newAssignments[`${emp.id}_${nextDs}`]) {
          const nextShiftId = newAssignments[`${emp.id}_${nextDs}`];
          const nextShift = shifts.find(s => s.id === nextShiftId);
          const nextWasR2 = nextShift?.name?.trim().toUpperCase() === 'R2';
          if (!nextWasR2) return false;
        }
      }

      // Rule 2: บ่ายห้ามซ้ำตำแหน่ง
      if (rules.rule_2 && cat === 'บ่าย' && st.assignedAfternoons.has(u)) return false;

      // เวรดึกห้ามซ้ำตำแหน่ง (ยกเว้น R2 ที่อาจได้หลายครั้ง)
      if (cat === 'ดึก' && u !== 'R2' && st.assignedNights.has(u)) return false;

      // Rule 4+5: R1 ≠ T1/T2
      if (rules.rule_4 || rules.rule_5) {
        if (u === 'R1' && (st.hasT1 || st.hasT2)) return false;
        if ((u === 'T1' || u === 'T2') && st.hasR1) return false;
      }

      // Rule 9: T1 XOR T2
      if (rules.rule_9) {
        if (u === 'T1' && st.hasT2) return false;
        if (u === 'T2' && st.hasT1) return false;
      }

      // Rule 6: A/As4 ได้แค่ 1 ครั้ง
      if (rules.rule_6 && (u === 'A/4' || u === 'AS1' || u === 'AS/4') && st.countA_As4 >= 1) return false;

      // Rule 7: เวรเช้าห้ามซ้ำตำแหน่ง (ยกเว้น R2 ที่ต้องได้ทุกวันหยุด)
      if (rules.rule_7 && cat === 'เช้า' && u !== 'R2' && st.assignedMornings.has(u)) return false;

      // Hard cap per category — R2 ไม่มี cap เลย
      // ใช้ CAP object คำนวณจาก Firebase — รองรับเวรใหม่อัตโนมัติ
      if (u !== 'R2') {
        if (cat === 'ดึก' && (st.catCounts['ดึก'] || 0) >= CAP['ดึก']) return false;
        if (cat === 'บ่าย' && (st.catCounts['บ่าย'] || 0) >= CAP['บ่าย']) return false;

        // 4o: คนที่มี As4/A4 แล้ว (ใช้ countA_As4 ที่ update ทันที) → ห้ามได้ 4o
        const hasAs4 = st.countA_As4 > 0;
        const fourOCap = hasAs4 ? 0 : CAP['4o'];
        if (cat === '4o' && (st.catCounts['4o'] || 0) >= fourOCap) return false;

        if (cat === '2o' && (st.catCounts['2o'] || 0) >= CAP['2o']) return false;
        if (cat === 'SMC' && (st.catCounts['SMC'] || 0) >= CAP['SMC']) return false;

        // เช้า cap รวม (เช้า + As/4 + A/4)
        const totalMorning = (st.catCounts['เช้า'] || 0) + (st.catCounts['As/4'] || 0) + (st.catCounts['A/4'] || 0);
        if (['เช้า','As/4','A/4'].includes(cat)) {
          const mornCap = canDoNight(emp) ? MORNING_CAP_NORMAL : MORNING_CAP_OFF;
          if (totalMorning >= mornCap) return false;
        }

        // เวรอื่นๆ (4T, เวรใหม่ในอนาคต) คำนวณ cap จาก Firebase อัตโนมัติ
        if (!['ดึก','เช้า','บ่าย','4o','2o','SMC','As/4','A/4'].includes(cat)) {
          const otherCap = isOffSpecial(emp) ? 2 : Math.max(2, CAP[cat] || 3);
          if ((st.catCounts[cat] || 0) >= otherCap) return false;
        }
      }

      // As/4 → SMC ไม่เกิน 1
      if (cat === 'SMC' && st.countA_As4 >= 1 && (st.catCounts['SMC'] || 0) >= 1) return false;

      // Hard hours cap กลุ่มปกติ/R2
      if (u !== 'R2' && canDoNight(emp)) {
        const shiftHrs = getShiftHours(shift);
        if (st.hours + shiftHrs > TARGET_NORMAL) {
          // ตรวจว่ามีคนอื่นในกลุ่มปกติที่:
          // 1. ชั่วโมงน้อยกว่าคนนี้ AND
          // 2. รับเวรนี้ได้โดยไม่เกิน TARGET
          const hasOtherUnderTarget = normalEmpsAll.some(e => {
            if (e.id === emp.id) return false;
            if (empStats[e.id].hours + shiftHrs > TARGET_NORMAL) return false; // ต้องรับได้โดยไม่เกิน TARGET
            if (newAssignments[`${e.id}_${dateStr}`]) return false;
            if (e.offShifts?.includes(shift.id)) return false;
            if (e.specificShifts?.length > 0 && !e.specificShifts.includes(shift.id)) return false;
            if (isOffSpecial(e) && isShiftBannedForOffSpecial(shift)) return false;
            if (cat === 'ดึก' && empStats[e.id].assignedNights.has(u)) return false;
            if (cat === 'ดึก' && (empStats[e.id].catCounts['ดึก'] || 0) >= CAP['ดึก']) return false;
            if (['เช้า','As/4','A/4'].includes(cat)) {
              const eTotalMorning = (empStats[e.id].catCounts['เช้า']||0) + (empStats[e.id].catCounts['As/4']||0) + (empStats[e.id].catCounts['A/4']||0);
              if (eTotalMorning >= MORNING_CAP_NORMAL) return false;
              if (cat === 'เช้า' && empStats[e.id].assignedMornings.has(u)) return false;
            }
            if (cat === 'บ่าย') {
              if (empStats[e.id].assignedAfternoons.has(u)) return false;
              if ((empStats[e.id].catCounts['บ่าย']||0) >= CAP['บ่าย']) return false;
            }
            if (cat === 'SMC' && (empStats[e.id].catCounts['SMC']||0) >= CAP['SMC']) return false;
            if (cat === '4o') {
              const eHasAs4 = empStats[e.id].countA_As4 > 0;
              if (eHasAs4) return false;
              if ((empStats[e.id].catCounts['4o']||0) >= CAP['4o']) return false;
            }
            return true;
          });
          if (hasOtherUnderTarget) return false;
        }
        // Emergency hard cap: ป้องกันเวรขาด
        const maxShiftHrs = Math.max(...shifts.map(s => getShiftHours(s)).filter(h => h > 0));
        if (st.hours + shiftHrs > TARGET_NORMAL + maxShiftHrs - 1) return false;
      }

      // Cap เฉพาะกลุ่ม off_night (ใช้ CAP เดิม ไม่ hardcode)
      // ไม่ต้องเพิ่มอะไรที่นี่ เพราะ CAP block ด้านบนครอบคลุมแล้ว

      // Hours cap กลุ่ม off_night: ไม่เกิน TARGET_OFF_NIGHT
      // block ถ้ายังมีคนปกติที่ชั่วโมง < TARGET_NORMAL รับได้
      if (u !== 'R2' && !canDoNight(emp) && !isOffSpecial(emp)) {
        const shiftHrs = getShiftHours(shift);
        if (st.hours + shiftHrs > TARGET_OFF_NIGHT) {
          const hasNormalUnderTarget = normalEmpsAll.some(e =>
            empStats[e.id].hours + shiftHrs <= TARGET_NORMAL &&
            !newAssignments[`${e.id}_${dateStr}`] &&
            !e.offShifts?.includes(shift.id) &&
            !(e.specificShifts?.length > 0 && !e.specificShifts.includes(shift.id)) &&
            (cat !== 'เช้า' || !empStats[e.id].assignedMornings.has(u)) &&
            (cat !== 'บ่าย' || !empStats[e.id].assignedAfternoons.has(u)) &&
            (empStats[e.id].catCounts[cat] || 0) < (cat === 'เช้า' ? 3 : 2)
          );
          if (hasNormalUnderTarget) return false;
        }
        // Emergency: ไม่เกิน TARGET_OFF_NIGHT + 8h ไม่ว่ากรณีใด
        if (st.hours + shiftHrs > TARGET_OFF_NIGHT + 8) return false;
      }

      return true;
    };

    // ─── sortEligible ───
    const sortEligible = (eligible, shift) => {
      const cat = getShiftCategory(shift);
      const u = shift.name.trim().toUpperCase();
      shuffle(eligible);
      eligible.sort((a, b) => {
        const sa = empStats[a.id], sb = empStats[b.id];

        // Rule 3: R1↔G pairing priority
        if (rules.rule_3) {
          if (u === 'G') {
            const aN = sa.hasR1 && !sa.hasG, bN = sb.hasR1 && !sb.hasG;
            if (aN !== bN) return aN ? -1 : 1;
          }
          if (u === 'R1') {
            const aN = sa.hasG && !sa.hasR1, bN = sb.hasG && !sb.hasR1;
            if (aN !== bN) return aN ? -1 : 1;
          }
        }

        // Rule 2: บe preference
        if (rules.rule_2 && cat === 'บ่าย' && u === 'บE') {
          const aN = !sa.hasBe ? sa.afternoonCount : -1;
          const bN = !sb.hasBe ? sb.afternoonCount : -1;
          if (aN !== bN) return bN - aN;
        }

        // SMC: กระจายตามชั่วโมงค่าเวร smc
        if (cat === 'SMC') {
          if (sa.smcHours !== sb.smcHours) return sa.smcHours - sb.smcHours;
        }

        // เช้า: นับรวม เช้า + As/4 + A/4 — คนที่รวมแล้ว < 2 ได้ก่อน
        if (['เช้า','As/4','A/4'].includes(cat)) {
          const aTotal = (sa.catCounts['เช้า']||0) + (sa.catCounts['As/4']||0) + (sa.catCounts['A/4']||0);
          const bTotal = (sb.catCounts['เช้า']||0) + (sb.catCounts['As/4']||0) + (sb.catCounts['A/4']||0);
          const aUnder = aTotal < 2, bUnder = bTotal < 2;
          if (aUnder !== bUnder) return aUnder ? -1 : 1;
        }

        // Primary: กระจาย totalShifts ก่อน — ป้องกันคนเดิมได้เวรสะสม
        if (sa.totalShifts !== sb.totalShifts) return sa.totalShifts - sb.totalShifts;

        // Secondary: คนที่ห่างจาก TARGET มากกว่า (hours น้อยกว่า) ได้ก่อน
        const aCanNight = canDoNight(a), bCanNight = canDoNight(b);
        if (aCanNight === bCanNight) {
          const myTarget = aCanNight ? TARGET_NORMAL : TARGET_OFF_NIGHT;
          const aGap = myTarget - sa.hours;
          const bGap = myTarget - sb.hours;
          if (aGap !== bGap) return bGap - aGap;
        }

        // Tertiary: catCounts ของประเภทนี้
        const cd = (sa.catCounts[cat] || 0) - (sb.catCounts[cat] || 0);
        if (cd !== 0) return cd;

        // soft: money ascending
        return sa.money - sb.money;
      });
      return eligible;
    };

    // ─── คำนวณ CAP ต่อคนแบบ dynamic จาก Firebase ทุกประเภทเวร ───
    // หลักการ: cap = ceil(total_slots / eligible_people) แต่ไม่น้อยกว่าค่า min
    // รองรับการเพิ่มเวรใหม่ (4s5, 4T, 2o เพิ่ม) โดยไม่ต้องแก้ code
    const slotsByCat = {};
    for (let d = 1; d <= dim; d++) {
      shifts.forEach(s => {
        if (!isApplicable(s, d)) return;
        const cat = getShiftCategory(s);
        slotsByCat[cat] = (slotsByCat[cat] || 0) + (s.min || 1);
      });
    }

    const totalEmps = employees.length || 1;
    const normalCount = normalEmpsAll.length || 1;

    // eligible คน = คนที่รับเวรนั้นได้จริง
    const eligibleCount = (cat) => {
      if (cat === 'ดึก') return normalCount; // เฉพาะคนปกติ
      return totalEmps; // ทุกคน
    };

    const dynamicCap = (cat, minCap = 1) =>
      Math.max(minCap, Math.ceil((slotsByCat[cat] || 0) / eligibleCount(cat)));

    const CAP = {
      'ดึก':  dynamicCap('ดึก',  2),
      'บ่าย': dynamicCap('บ่าย', 2),
      'เช้า': dynamicCap('เช้า', 2),
      'SMC':  dynamicCap('SMC',  2),
      '4o':   dynamicCap('4o',   1),
      '2o':   dynamicCap('2o',   1),
      'As/4': 1,
      'A/4':  1,
    };

    // morning cap รวม (เช้า + As/4 + A/4)
    // ปกติ: ใช้ dynamic cap แต่ไม่เกิน 3
    // off_night: ≤ 2 เสมอ
    const MORNING_CAP_NORMAL = Math.min(3, dynamicCap('เช้า', 2));
    const MORNING_CAP_OFF = 2;

    // SMC_CAP ยังใช้ชื่อเดิมเพื่อ backward compat
    const SMC_CAP = CAP['SMC'];
    // R2 ต้องได้ก่อนเวรอื่นเสมอในวันหยุด เพื่อป้องกัน rule_1 block คนกลุ่ม r2
    const r2Shift = shifts.find(s => s.name.trim().toUpperCase() === 'R2');
    const t1Shift = shifts.find(s => s.name.trim().toUpperCase() === 'T1');
    const t2Shift = shifts.find(s => s.name.trim().toUpperCase() === 'T2');
    const mainShifts = shifts.filter(s => getShiftCategory(s) !== '2o');

    for (let d = 1; d <= dim; d++) {
      const dateStr = fmtD(d);
      const hol = isHol(d);
      const dow = getDow(d);

      // ── STEP A: จัด R2 ก่อนทุกอย่างในวันหยุด (ไม่มี rule_1 สำหรับ R2) ──
      if (hol && r2Shift) {
        const slots = r2Shift.min || 1;
        const r2Emps = employees.filter(e =>
          (getGroup(e) === 'r2' || getGroup(e) === 'r2_off_night') &&
          !newAssignments[`${e.id}_${dateStr}`]
        );
        // สุ่มลำดับก่อน แล้วเอาแค่ slots คน
        shuffle(r2Emps);
        r2Emps.sort((a,b) => empStats[a.id].catCounts['เช้า'] - empStats[b.id].catCounts['เช้า']);
        r2Emps.slice(0, slots).forEach(emp => {
          doAssign(emp, dateStr, d, r2Shift);
        });
      }

      // ── STEP B/C: คำนวณ flag วันนี้ก่อน ──
      const isNationalHol = hol && dow !== 0 && dow !== 6;
      // T1 มีทุกวันหยุด (ส, อา, นักขัตฤกษ์)
      const isT1Day = hol;
      // T2 มีเฉพาะ "วันแรกของช่วงหยุด" เท่านั้น
      const isT2Day = hol && isFirstHol(d);

      // ── STEP B: จัด T1 (วันหยุดนักขัตฤกษ์ทุกวัน) ──
      if (isT1Day && t1Shift) {
        for (let slot = 0; slot < (t1Shift.min || 1); slot++) {
          const eligible = employees.filter(emp => canAssign(emp, dateStr, d, t1Shift));
          if (eligible.length === 0) break;
          doAssign(sortEligible(eligible, t1Shift)[0], dateStr, d, t1Shift);
        }
      }

      // ── STEP C: จัด T2 (เสาร์ + วันแรกของช่วงหยุดนักขัตฤกษ์) ──
      if (isT2Day && t2Shift) {
        for (let slot = 0; slot < (t2Shift.min || 1); slot++) {
          const eligible = employees.filter(emp => canAssign(emp, dateStr, d, t2Shift));
          if (eligible.length === 0) break;
          doAssign(sortEligible(eligible, t2Shift)[0], dateStr, d, t2Shift);
        }
      }

      // ── STEP D: จัดเวรที่เหลือทั้งหมด ──
      const todayShifts = mainShifts.filter(s => {
        const u = s.name.trim().toUpperCase();
        if (u === 'R2') return false;              // จัดแล้ว STEP A
        if (u === 'T1') return false;              // จัดด้วย isT1Day ข้างบนแล้ว หรือไม่ใช่วันนี้
        if (u === 'T2') return false;              // จัดด้วย isT2Day ข้างบนแล้ว หรือไม่ใช่วันนี้
        return isApplicable(s, d);
      });
      shuffle(todayShifts);
      for (const shift of todayShifts) {
        for (let slot = 0; slot < (shift.min || 1); slot++) {
          const eligible = employees.filter(emp => canAssign(emp, dateStr, d, shift));
          if (eligible.length === 0) continue;
          doAssign(sortEligible(eligible, shift)[0], dateStr, d, shift);
        }
      }
    }

    // ─── PHASE 2: เวร 2o ───
    const twoOShifts = shifts.filter(s => getShiftCategory(s) === '2o');
    const MAX_2O = 1; // กระจายคนละ 1 ครั้ง

    for (let d = 1; d <= dim; d++) {
      const dateStr = fmtD(d);
      for (const shift of twoOShifts) {
        if (!isApplicable(shift, d)) continue;
        for (let slot = 0; slot < (shift.min || 1); slot++) {

          // รอบ 1: คนปกติที่ hours < TARGET_NORMAL (เติมให้เข้าใกล้ 60h ก่อน)
          let eligible = normalEmpsAll.filter(emp => {
            if (!canAssign(emp, dateStr, d, shift)) return false;
            if ((empStats[emp.id].catCounts['2o'] || 0) >= MAX_2O) return false;
            return empStats[emp.id].hours < TARGET_NORMAL;
          });

          // รอบ 2: คนปกติทั่วไป (ถ้ารอบ 1 ไม่มี)
          if (eligible.length === 0) {
            eligible = normalEmpsAll.filter(emp => {
              if (!canAssign(emp, dateStr, d, shift)) return false;
              return (empStats[emp.id].catCounts['2o'] || 0) < MAX_2O;
            });
          }

          // รอบ 3: off_night (หลังจากคนปกติเต็มแล้ว)
          if (eligible.length === 0) {
            eligible = employees.filter(emp => {
              if (!canAssign(emp, dateStr, d, shift)) return false;
              return (empStats[emp.id].catCounts['2o'] || 0) < MAX_2O;
            });
          }

          // รอบ 4: fallback ป้องกันเวรขาด
          if (eligible.length === 0) {
            eligible = employees.filter(emp => canAssign(emp, dateStr, d, shift));
          }

          if (eligible.length === 0) continue;
          shuffle(eligible);
          eligible.sort((a, b) => {
            // เรียงตาม gap จาก TARGET (คนห่างมากได้ก่อน)
            const aTarget = canDoNight(a) ? TARGET_NORMAL : TARGET_OFF_NIGHT;
            const bTarget = canDoNight(b) ? TARGET_NORMAL : TARGET_OFF_NIGHT;
            const aGap = aTarget - empStats[a.id].hours;
            const bGap = bTarget - empStats[b.id].hours;
            if (aGap !== bGap) return bGap - aGap;
            return (empStats[a.id].catCounts['2o'] || 0) - (empStats[b.id].catCounts['2o'] || 0);
          });
          doAssign(eligible[0], dateStr, d, shift);
        }
      }
    }

    setSchedules(schedules.map(s => s.id === activeScheduleId ? { ...s, assignments: newAssignments } : s));
    setTargetNormalDisplay(TARGET_NORMAL);
    setTargetOffNightDisplay(TARGET_OFF_NIGHT);
  };

  const handleAssignShift = (shiftId) => {
    if (!activeSchedule) return;
    const { empId, dateStr } = assignmentModal;
    const updated = { ...activeSchedule.assignments };
    if (shiftId === null) delete updated[`${empId}_${dateStr}`];
    else updated[`${empId}_${dateStr}`] = shiftId;
    setSchedules(schedules.map(s => s.id === activeScheduleId ? { ...s, assignments: updated } : s));
    setAssignmentModal({ isOpen: false, empId: null, dateStr: null });
  };

  const handleToggleHoliday = (dateStr) => {
    if (!activeSchedule) return;
    const updated = { ...activeSchedule.holidays };
    if (updated[dateStr]) delete updated[dateStr];
    else updated[dateStr] = 'วันหยุดพิเศษ';
    setSchedules(schedules.map(s => s.id === activeScheduleId ? { ...s, holidays: updated } : s));
  };

  let monthDates = [];
  if (activeSchedule) {
    const dim = new Date(activeSchedule.year, activeSchedule.month + 1, 0).getDate();
    monthDates = Array.from({ length: dim }, (_, i) => {
      const d = new Date(activeSchedule.year, activeSchedule.month, i + 1);
      const dateStr = fmtDateFor(activeSchedule, i + 1);
      return {
        dateNum: i + 1, dayStr: thaiDays[d.getDay()], dateStr,
        isHoliday: d.getDay() === 0 || d.getDay() === 6 || !!(activeSchedule.holidays?.[dateStr]),
      };
    });
  }

  // เรียงพนักงานแบบสุ่ม (shuffle) หรือตามกลุ่ม→เงิน
  const sortedEmployees = useMemo(() => {
    if (!activeSchedule) return employees;
    if (sortByMoney) {
      const groupOrder = { normal:1, r2:2, r2_off_night:3, off_night:4, off_special:5 };
      const empMoney = {};
      employees.forEach(emp => {
        let m = 0;
        monthDates.forEach(d => {
          const s = shifts.find(s => s.id === activeSchedule.assignments[`${emp.id}_${d.dateStr}`]);
          if (s) m += getShiftValue(s);
        });
        empMoney[emp.id] = m;
      });
      return [...employees].sort((a,b) => {
        const ga = groupOrder[a.group || 'normal'] || 1;
        const gb = groupOrder[b.group || 'normal'] || 1;
        if (ga !== gb) return ga - gb;
        return empMoney[b.id] - empMoney[a.id];
      });
    }
    // default: สุ่มลำดับ (shuffle) เพื่อให้ตารางไม่ซ้ำกันทุกครั้ง
    const arr = [...employees];
    for (let k = arr.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [arr[k], arr[j]] = [arr[j], arr[k]];
    }
    return arr;
  }, [employees, activeSchedule, shifts, monthDates, sortByMoney]);

  const activeRules = RULES_LIST.filter(r => rules[r.id]);
  const inactiveRules = RULES_LIST.filter(r => !rules[r.id]);
  const hasR2Group = employees.some(e => e.group === 'r2' || e.group === 'r2_off_night');

  return (
    <div className="flex flex-col h-full w-full">
      {/* Warning: ไม่มีคนกลุ่ม R2 */}
      {!hasR2Group && (
        <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-800 text-xs font-medium flex items-center gap-2 print-hidden shrink-0">
          ⚠️ ยังไม่มีพนักงานในกลุ่ม <strong>R2</strong> หรือ <strong>R2+งดดึก</strong> — เวร R2 จะไม่ถูกจัดในตาราง กรุณาไปตั้งกลุ่มให้พนักงานในแท็บ <strong>พนักงาน</strong> ก่อน
        </div>
      )}
      {/* Controls top */}
      <div className="flex justify-between items-center mb-3 shrink-0 print-hidden">
        <div className="flex gap-1 bg-white p-1 rounded-md border border-gray-200 flex-wrap">
          {schedules.map(sch => (
            <button key={sch.id} type="button" onClick={() => setActiveScheduleId(sch.id)}
              className={`px-3 py-1.5 text-sm font-bold rounded transition-colors ${activeScheduleId === sch.id ? 'bg-indigo-600 text-white' : 'bg-transparent text-gray-600 hover:bg-gray-100'}`}>
              {thaiMonths[sch.month]} {sch.year + 543}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleAutoGenerate} disabled={!activeSchedule}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-700 active:scale-95 shadow-sm disabled:opacity-40">
            <Wand2 className="w-4 h-4" /> สุ่มเวรอัตโนมัติ
          </button>
          <button type="button" onClick={() => setIsCreateModalOpen(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm">
            <Plus className="w-4 h-4" /> สร้างใหม่
          </button>
        </div>
      </div>

      {/* Rules bar */}
      <div className="flex flex-col mb-4 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 shrink-0 print-hidden">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-1"><Settings className="w-4 h-4" /> กฎการสุ่มเวร</h3>
          <div className="relative">
            <button type="button" onClick={() => setShowRuleDropdown(!showRuleDropdown)}
              className="text-xs bg-white border border-dashed border-indigo-300 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 flex items-center gap-1 font-medium">
              <Plus className="w-3.5 h-3.5" /> เพิ่มเงื่อนไข
            </button>
            {showRuleDropdown && (
              <div className="absolute right-0 top-full mt-2 w-[380px] bg-white border border-gray-200 shadow-xl rounded-xl z-50 py-2 max-h-[50vh] overflow-y-auto">
                {inactiveRules.length === 0 ? (
                  <div className="px-5 py-4 text-xs text-gray-400 text-center">ไม่มีเงื่อนไขเพิ่มเติม</div>
                ) : inactiveRules.map(r => (
                  <button key={r.id} type="button" onClick={() => { setRules({...rules,[r.id]:true}); setShowRuleDropdown(false); }}
                    className="w-full text-left px-5 py-2.5 text-xs text-gray-600 hover:bg-indigo-50">{r.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap min-h-[30px]">
          {activeRules.length === 0 ? <span className="text-xs text-gray-400 italic">ไม่มีเงื่อนไขที่เปิดใช้งาน</span>
            : activeRules.map(r => (
              <div key={r.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 rounded-lg text-[11px] font-medium border border-gray-200 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <span className="truncate max-w-[300px]">{r.label}</span>
                <button type="button" onClick={() => setRules({...rules,[r.id]:false})} className="ml-1 text-gray-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* Action bar */}
      {activeSchedule && (
        <div className="flex justify-end gap-2 shrink-0 items-center mb-3 print-hidden">
          {activeSchedule && TARGET_NORMAL_DISPLAY > 0 && (
            <div className="text-xs text-gray-500 mr-auto flex gap-3">
              <span>🎯 ปกติ <b className="text-indigo-600">{TARGET_NORMAL_DISPLAY}h</b></span>
              <span>🎯 off_night <b className="text-gray-500">{TARGET_OFF_NIGHT_DISPLAY}h</b></span>
            </div>
          )}
          <button type="button" onClick={handleDeleteSchedule}
            className="text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-red-100 mr-2">
            <Trash2 className="w-3.5 h-3.5" /> ลบตารางนี้
          </button>
          <button type="button" onClick={() => setSortByMoney(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${sortByMoney ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
            <span>฿</span> {sortByMoney ? 'เรียงตามกลุ่ม ✓' : 'เรียงตามกลุ่ม'}
          </button>
          <button type="button" onClick={handleExportExcel}
            className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button type="button" onClick={() => window.print()}
            className="text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50">
            <Printer className="w-4 h-4" /> PDF
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 flex flex-col overflow-hidden border border-gray-200 rounded-xl shadow-sm">
        {!activeSchedule ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Calendar className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-base font-medium">ยังไม่มีตารางเวร</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <div className="hidden print:block text-center font-bold text-sm mb-2">
              ตารางปฏิบัติงาน เภสัชกร ประจำเดือน {thaiMonths[activeSchedule.month]} พ.ศ. {activeSchedule.year + 543}
            </div>
            <table className="w-full border-collapse text-center table-fixed min-w-[1300px] print:min-w-0">
              <thead>
                <tr className="bg-slate-50 sticky top-0 z-20 shadow-sm">
                  <th className="p-2 border-b border-r border-gray-200 w-[130px] text-sm text-gray-700">พนักงาน</th>
                  {monthDates.map(d => (
                    <th key={d.dateStr} onClick={() => handleToggleHoliday(d.dateStr)}
                      className={`p-0 border-b border-r border-gray-200 w-[30px] cursor-pointer hover:bg-red-50 ${d.isHoliday ? 'bg-red-50 text-red-600 font-bold' : 'text-slate-600'}`}>
                      <div className="text-[10px] leading-tight pt-1">{d.dayStr}</div>
                      <div className="text-xs pb-1">{d.dateNum}</div>
                    </th>
                  ))}
                  {[['เช้า','bg-blue-50/50','text-blue-700'],['บ่าย','bg-orange-50/50','text-orange-700'],['ดึก','bg-purple-50/50','text-purple-700'],['As/4','bg-teal-50/50','text-teal-700'],['A/4','bg-indigo-50/50','text-indigo-700'],['SMC','bg-rose-50/50','text-rose-700'],['4o','bg-yellow-50/50','text-yellow-700'],['2o','bg-lime-50/50','text-lime-700'],['ช.ม.','bg-gray-100','text-gray-700']].map(([label,bg,tc]) => (
                    <th key={label} className={`p-1 border-b border-r border-gray-200 w-[30px] text-[10px] font-bold ${bg} ${tc}`}>{label}</th>
                  ))}
                  <th className="p-2 border-b border-gray-200 w-[70px] text-emerald-700 text-sm font-bold">รวม(บ.)</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map(emp => {
                  let totalMoney = 0, totalHours = 0;
                  let cnt = { เช้า:0, บ่าย:0, ดึก:0, 'As/4':0, 'A/4':0, SMC:0, '4o':0, '2o':0 };
                  const grp = PHARMACIST_GROUPS.find(g => g.id === (emp.group || 'normal'));
                  const isOffNight = ['off_night','r2_off_night','off_special'].includes(emp.group);
                  const isR2Group = ['r2','r2_off_night'].includes(emp.group);
                  const rowBg = isOffNight ? 'bg-gray-100/70' : isR2Group ? 'bg-green-50/60' : '';
                  // คำนวณ TARGET ของคนนี้
                  const empCanNight = !isOffNight;
                  const empTarget = empCanNight ? TARGET_NORMAL_DISPLAY : TARGET_OFF_NIGHT_DISPLAY;
                  return (
                    <tr key={emp.id} className={`hover:brightness-95 h-8 ${rowBg}`}>
                      <td className={`sticky left-0 px-2 py-1 border-b border-r border-gray-200 text-left truncate ${rowBg || 'bg-white'}`}>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-800">{emp.name}</span>
                          {grp && <span className="text-[9px] font-medium px-1 rounded" style={{ color: grp.color }}>{grp.label}</span>}
                        </div>
                      </td>
                      {monthDates.map(d => {
                        const sData = shifts.find(s => s.id === activeSchedule.assignments[`${emp.id}_${d.dateStr}`]);
                        if (sData) { totalMoney += getShiftValue(sData); totalHours += getShiftHours(sData); const c = getShiftCategory(sData); if (cnt[c] !== undefined) cnt[c]++; }
                        return (
                          <td key={d.dateStr} onClick={() => setAssignmentModal({ isOpen: true, empId: emp.id, dateStr: d.dateStr })}
                            className={`p-0 border-b border-r border-gray-200 cursor-pointer relative ${d.isHoliday ? 'bg-red-50/30' : ''}`}>
                            {sData && <div className="absolute inset-[2px] rounded-[3px] text-[9px] flex items-center justify-center font-bold text-white shadow-sm" style={{ backgroundColor: sData.color }}>{sData.name}</div>}
                          </td>
                        );
                      })}
                      {[cnt['เช้า'],cnt['บ่าย'],cnt['ดึก'],cnt['As/4'],cnt['A/4'],cnt['SMC'],cnt['4o'],cnt['2o']].map((v,i) => (
                        <td key={i} className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-gray-700">{v > 0 ? v : '-'}</td>
                      ))}
                      <td className={`px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold
                        ${totalHours > empTarget + 4 ? 'bg-red-100 text-red-700' :
                          totalHours > empTarget ? 'bg-orange-50 text-orange-600' :
                          totalHours === empTarget ? 'bg-green-50 text-green-700' : 'text-gray-700'}`}>
                        {totalHours > 0 ? `${totalHours}h` : '-'}
                      </td>
                      <td className="px-2 py-1 border-b border-gray-200 text-emerald-600 font-bold text-xs text-right">{totalMoney.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-xl font-bold mb-5">สร้างตารางเวรใหม่</h3>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">เดือน</label>
                <select className="w-full border border-gray-300 rounded-lg p-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500" value={createMonth} onChange={e => setCreateMonth(Number(e.target.value))}>
                  {thaiMonths.map((m,i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">ปี (ค.ศ.)</label>
                <input type="number" className="w-full border border-gray-300 rounded-lg p-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500" value={createYear} onChange={e => setCreateYear(Number(e.target.value))} />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={handleCreateSchedule} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">สร้างตาราง</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign shift modal */}
      {assignmentModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setAssignmentModal({ isOpen: false, empId: null, dateStr: null })}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold border-b border-gray-100 pb-3 mb-3 flex items-center justify-between">
              เลือกเวรประจำวัน
              <button type="button" onClick={() => handleAssignShift(null)} className="py-1 px-3 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 font-medium">ว่าง (ลบเวร)</button>
            </h3>
            {(() => {
              const emp = employees.find(e => e.id === assignmentModal.empId);
              if (!emp) return null;
              const isOff = ['off_night','r2_off_night','off_special'].includes(emp.group);
              const target = isOff ? TARGET_OFF_NIGHT_DISPLAY : TARGET_NORMAL_DISPLAY;
              let curHours = 0;
              monthDates.forEach(d => {
                const s = shifts.find(s => s.id === activeSchedule?.assignments[`${emp.id}_${d.dateStr}`]);
                if (s) curHours += getShiftHours(s);
              });
              const over = curHours > target;
              return (
                <div className={`flex items-center gap-2 text-xs mb-3 px-3 py-2 rounded-lg ${over ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>
                  <span className="font-bold">{emp.name}</span>
                  <span>ชั่วโมงปัจจุบัน: <b>{curHours}h</b></span>
                  <span>/ เป้า <b>{target}h</b></span>
                  {over && <span className="font-bold text-red-600">⚠️ เกิน {curHours - target}h</span>}
                </div>
              );
            })()}
            <div className="grid grid-cols-3 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {shifts.map(s => (
                <button key={s.id} type="button" onClick={() => handleAssignShift(s.id)}
                  className="py-2.5 px-1 rounded-lg text-white text-sm font-bold truncate shadow-sm hover:scale-105 transition-transform" style={{ backgroundColor: s.color }}>
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

// ══════════════════════════════════════════════════════════════
// 2. EmployeesManager — UI กลุ่มเภสัชกร
// ══════════════════════════════════════════════════════════════
function EmployeesManager() {
  const [rawShifts] = useFirebaseSync('ph_shift_types', []);
  const [rawEmployees, setEmployees] = useFirebaseSync('ph_employees', []);
  const shifts = Array.isArray(rawShifts) ? rawShifts : [];
  const employees = Array.isArray(rawEmployees) ? rawEmployees : [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', group: 'normal', offShifts: [], specificShifts: [] });
  const [filterGroup, setFilterGroup] = useState('all');

  const handleSave = () => {
    if (!formData.name) return alert('กรุณากรอกชื่อ');
    if (formData.id) setEmployees(employees.map(e => e.id === formData.id ? formData : e));
    else setEmployees([...employees, { ...formData, id: Date.now().toString() }]);
    setIsModalOpen(false);
  };

  const openAdd = () => setFormData({ name: '', group: 'normal', offShifts: [], specificShifts: [] });
  const openEdit = (emp) => setFormData({ ...emp, group: emp.group || 'normal', offShifts: emp.offShifts || [], specificShifts: emp.specificShifts || [] });

  const displayed = filterGroup === 'all' ? employees : employees.filter(e => (e.group || 'normal') === filterGroup);

  // จัดกลุ่มเวรตามหมวด สำหรับ checkbox
  const shiftGroups = [
    { label: 'เวรบ่าย', names: ['บi','บr','บe'] },
    { label: 'เวรดึก', names: ['ดi','ดe'] },
    { label: 'เวรเช้า', names: ['A','B','C','D','E','F','G','R1','R2','T1','T2','AS1','AS/4'] },
    { label: 'เวร 4o/4s/2o', names: ['4o','4s1','4s2','4s3','4s4','2o'] },
  ];

  const renderShiftCheckboxes = (section) => {
    const isSpecific = section === 'specific';
    const selectedIds = isSpecific ? (formData.specificShifts || []) : (formData.offShifts || []);
    const otherIds = isSpecific ? (formData.offShifts || []) : (formData.specificShifts || []);

    return shiftGroups.map(grp => {
      const grpShifts = shifts.filter(s => grp.names.some(n => s.name.trim().toUpperCase() === n.toUpperCase()));
      if (grpShifts.length === 0) return null;
      return (
        <div key={grp.label} className="mb-3">
          <div className="text-[11px] font-bold text-gray-500 mb-1.5 uppercase tracking-wide">{grp.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {grpShifts.map(s => {
              const isChecked = selectedIds.includes(s.id);
              const isDisabled = otherIds.includes(s.id);
              return (
                <label key={s.id} className={`flex items-center gap-1.5 border px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-all select-none
                  ${isChecked ? 'bg-white shadow-sm' : 'bg-white/50 hover:bg-white'}
                  ${isDisabled ? 'opacity-40 pointer-events-none' : ''}
                  ${isChecked && isSpecific ? 'border-blue-400' : isChecked ? 'border-red-300' : 'border-gray-200'}`}>
                  <input type="checkbox" className="w-3.5 h-3.5" disabled={isDisabled} checked={isChecked}
                    onChange={e => {
                      const newIds = e.target.checked ? [...selectedIds, s.id] : selectedIds.filter(id => id !== s.id);
                      if (isSpecific) setFormData({ ...formData, specificShifts: newIds, offShifts: (formData.offShifts||[]).filter(id=>id!==s.id) });
                      else setFormData({ ...formData, offShifts: newIds });
                    }} />
                  <span style={{ color: s.color }}>{s.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800">จัดการรายชื่อเภสัชกร</h2>
          <span className="text-sm text-gray-400">({employees.length} คน)</span>
        </div>
        <button type="button" onClick={() => { openAdd(); setIsModalOpen(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm">
          <UserPlus className="w-4 h-4" /> เพิ่มเภสัชกร
        </button>
      </div>

      {/* Group filter tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
        <button type="button" onClick={() => setFilterGroup('all')}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${filterGroup === 'all' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
          ทั้งหมด ({employees.length})
        </button>
        {PHARMACIST_GROUPS.map(g => {
          const count = employees.filter(e => (e.group || 'normal') === g.id).length;
          return (
            <button key={g.id} type="button" onClick={() => setFilterGroup(g.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${filterGroup === g.id ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              style={filterGroup === g.id ? { color: g.color } : {}}>
              {g.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Group legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PHARMACIST_GROUPS.map(g => (
          <div key={g.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs shadow-sm">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }}></div>
            <span className="font-bold" style={{ color: g.color }}>{g.label}</span>
            <span className="text-gray-400">— {g.desc}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border border-gray-200 rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 text-sm text-gray-600 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <th className="p-4 font-bold w-[5%]">#</th>
              <th className="p-4 font-bold w-[22%]">ชื่อ</th>
              <th className="p-4 font-bold w-[18%]">กลุ่ม</th>
              <th className="p-4 font-bold w-[22%]">เวรเฉพาะ (ลงแค่เวรนี้)</th>
              <th className="p-4 font-bold w-[22%]">งดรับเวร</th>
              <th className="p-4 font-bold text-center w-[11%]">จัดการ</th>
            </tr>
          </thead>
          <tbody className="text-sm">
            {displayed.length === 0 && (
              <tr><td colSpan="6" className="text-center p-8 text-gray-400">ยังไม่มีข้อมูลพนักงาน</td></tr>
            )}
            {displayed.map((emp, idx) => {
              const grp = PHARMACIST_GROUPS.find(g => g.id === (emp.group || 'normal'));
              return (
                <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="p-4 font-bold text-gray-900">{emp.name}</td>
                  <td className="p-4">
                    {grp && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: grp.color }}>
                        {grp.label}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(!emp.specificShifts || emp.specificShifts.length === 0)
                        ? <span className="text-gray-400 text-xs">-</span>
                        : emp.specificShifts.map(id => {
                          const s = shifts.find(x => x.id === id);
                          return s ? <span key={id} className="px-2 py-0.5 rounded-md text-xs text-white font-medium" style={{ backgroundColor: s.color }}>{s.name}</span> : null;
                        })}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1.5">
                      {(!emp.offShifts || emp.offShifts.length === 0)
                        ? <span className="text-gray-400 text-xs">-</span>
                        : emp.offShifts.map(id => {
                          const s = shifts.find(x => x.id === id);
                          return s ? <span key={id} className="px-2 py-0.5 rounded-md text-xs text-white font-medium opacity-80" style={{ backgroundColor: s.color }}>{s.name}</span> : null;
                        })}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <button type="button" onClick={() => { openEdit(emp); setIsModalOpen(true); }} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg mr-1"><Edit2 className="w-4 h-4" /></button>
                    <button type="button" onClick={() => { if (confirm('ยืนยันลบพนักงาน?')) setEmployees(employees.filter(e => e.id !== emp.id)); }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-2xl flex flex-col max-h-[92vh]">
            <h3 className="text-xl font-bold mb-5 border-b border-gray-100 pb-3">{formData.id ? 'แก้ไขข้อมูล' : 'เพิ่มรายชื่อใหม่'}</h3>
            <div className="space-y-5 overflow-y-auto flex-1 pr-1">
              {/* ชื่อ */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">ชื่อพนักงาน *</label>
                <input type="text" placeholder="ระบุชื่อพนักงาน" className="w-full border border-gray-300 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>

              {/* กลุ่ม */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">กลุ่มเภสัชกร</label>
                <div className="grid grid-cols-1 gap-2">
                  {PHARMACIST_GROUPS.map(g => (
                    <label key={g.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData.group === g.id ? 'border-current bg-opacity-5' : 'border-gray-200 hover:border-gray-300'}`}
                      style={formData.group === g.id ? { borderColor: g.color, backgroundColor: g.color + '10' } : {}}>
                      <input type="radio" name="group" value={g.id} checked={formData.group === g.id} onChange={() => setFormData({ ...formData, group: g.id })} className="w-4 h-4" />
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.color }}></div>
                      <div className="flex-1">
                        <div className="font-bold text-sm" style={{ color: g.color }}>{g.label}</div>
                        <div className="text-xs text-gray-500">{g.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* เวรเฉพาะ */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <label className="block text-sm font-bold text-blue-800 mb-3">เวรเฉพาะ (บังคับลงแค่เวรเหล่านี้)</label>
                {renderShiftCheckboxes('specific')}
              </div>

              {/* งดรับเวร */}
              <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                <label className="block text-sm font-bold text-red-800 mb-3">งดรับเวร (เวรที่ไม่ต้องการขึ้น)</label>
                {renderShiftCheckboxes('off')}
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-gray-100 shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm">บันทึกพนักงาน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// 3. ShiftTypesManager
// ══════════════════════════════════════════════════════════════
function ShiftTypesManager() {
  const [rawShifts, setShifts] = useFirebaseSync('ph_shift_types', []);
  const shifts = Array.isArray(rawShifts) ? rawShifts : [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', color: '#3b82f6', start: '', end: '', min: 1, allowedDays: 'all', category: '' });

  const colors = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#06b6d4','#84cc16','#f43f5e','#d946ef','#0ea5e9','#eab308','#64748b'];

  const handleSave = () => {
    if (!formData.name) return alert('กรุณากรอกชื่อเวร');
    if (!formData.category) return alert('กรุณาเลือกหมวดเวร');
    if (formData.id) setShifts(shifts.map(s => s.id === formData.id ? formData : s));
    else setShifts([...shifts, { ...formData, id: Date.now().toString() }]);
    setIsModalOpen(false);
  };

  const CATEGORIES = [
    { value: 'เช้า', label: 'เช้า (B,C,D,E,F,G,R1,R2,T1,T2)' },
    { value: 'บ่าย', label: 'บ่าย (บi,บr,บe)' },
    { value: 'ดึก', label: 'ดึก (ดi,ดe)' },
    { value: 'As/4', label: 'As/4 (วันเสาร์)' },
    { value: 'A/4', label: 'A/4 (วันหยุดอื่น)' },
    { value: 'SMC', label: 'SMC (4s1-4s4)' },
    { value: '4o', label: '4o' },
    { value: '2o', label: '2o' },
    { value: 'อื่นๆ', label: 'อื่นๆ' },
  ];

  const dayLabels = { all:'ทุกวัน', weekdays:'วันธรรมดา (จ-ศ)', weekends_holidays:'วันหยุด (ส-อา+นักขัตฤกษ์)', saturdays_only:'วันเสาร์', mon_tue_only:'จ-อ (ทำการ)', holidays_except_saturday:'วันหยุดนักขัตฤกษ์ (ยกเว้นเสาร์)', first_day_of_holidays:'วันแรกของช่วงหยุด (T2)' };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">จัดการประเภทเวร (เภสัชกร)</h2>
        <button type="button" onClick={() => { setFormData({ name:'', color:'#3b82f6', start:'', end:'', min:1, allowedDays:'all', category:'' }); setIsModalOpen(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm">
          <Plus className="w-4 h-4" /> เพิ่มเวร
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 overflow-y-auto pr-2 pb-4">
        {shifts.map(s => (
          <div key={s.id} className="border border-gray-200 rounded-2xl p-5 bg-white relative overflow-hidden shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: s.color }}></div>
            <div className="flex justify-between items-start mb-4 mt-1">
              <div>
                <span className="font-bold text-xl text-gray-800 truncate pr-2">{s.name}</span>
                {s.category
                  ? <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full">{s.category}</span>
                  : <span className="ml-1 px-2 py-0.5 bg-red-100 text-red-500 text-[10px] font-bold rounded-full">⚠️ ไม่มีหมวด</span>
                }
              </div>
              <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => { setFormData(s); setIsModalOpen(true); }} className="text-blue-500 bg-blue-50 p-1.5 rounded-lg hover:bg-blue-100"><Edit2 className="w-4 h-4" /></button>
                <button type="button" onClick={() => { if (confirm('ลบเวรนี้?')) setShifts(shifts.filter(x => x.id !== s.id)); }} className="text-red-500 bg-red-50 p-1.5 rounded-lg hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2.5"><Clock className="w-4 h-4 text-gray-400" /> {s.start||'--:--'} - {s.end||'--:--'}</div>
              <div className="flex items-center gap-2.5"><Users className="w-4 h-4 text-gray-400" /> รับ: <span className="font-bold text-gray-800">{s.min}</span> คน</div>
              <div className="flex items-center gap-2.5"><CalendarDays className="w-4 h-4 text-gray-400" /> {dayLabels[s.allowedDays] || 'ทุกวัน'}</div>
              <div className="flex items-center gap-2.5 border-t pt-3 mt-3"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-600 font-bold">{getShiftValue(s).toLocaleString()} บ.</span></div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md p-7 shadow-2xl">
            <h3 className="text-xl font-bold mb-6 border-b border-gray-100 pb-3">{formData.id ? 'แก้ไขเวร' : 'เพิ่มเวรใหม่'}</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">ชื่อเวร *</label>
                <input type="text" placeholder="เช่น di, de, บi, T1, 4s1" className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">สีป้ายเวร</label>
                <div className="flex gap-2 flex-wrap p-3 bg-gray-50 rounded-xl border border-gray-100">
                  {colors.map(c => (
                    <button key={c} type="button" onClick={() => setFormData({ ...formData, color: c })}
                      className={`w-8 h-8 rounded-lg transition-all ${formData.color === c ? 'ring-2 ring-offset-2 ring-gray-800 scale-110' : 'hover:scale-110 shadow-sm border border-black/10'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">เวลาเริ่ม</label>
                  <input type="time" className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.start} onChange={e => setFormData({ ...formData, start: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">เวลาสิ้นสุด</label>
                  <input type="time" className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.end} onChange={e => setFormData({ ...formData, end: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">จำนวนคนต้องการ / วัน</label>
                <input type="number" min="1" className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={formData.min} onChange={e => setFormData({ ...formData, min: parseInt(e.target.value) || 1 })} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">หมวดเวร *</label>
                <select className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                  <option value="">-- เลือกหมวดเวร --</option>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">เงื่อนไขวันที่จัดได้</label>
                <select className="w-full border border-gray-300 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={formData.allowedDays} onChange={e => setFormData({ ...formData, allowedDays: e.target.value })}>
                  {Object.entries(dayLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-8 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md">บันทึกเวร</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helpers (module-level) ───
function fmtDateFor(schedule, d) {
  return `${schedule.year}-${String(schedule.month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function isHolidayRaw(d, dow, dateStr, schedule) {
  return dow === 0 || dow === 6 || !!(schedule?.holidays?.[dateStr]);
}
