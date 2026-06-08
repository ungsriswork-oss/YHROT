import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, Users, Clock, Plus, Edit2, Trash2, UserPlus,
  Wand2, Settings, CalendarDays, CheckCircle2, X, Printer,
  Download, ArrowLeft,
} from 'lucide-react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// ─── กลุ่มเภสัชกร 5 กลุ่ม ───
export const PHARMACIST_GROUPS = [
  { id: 'normal',       label: 'ปกติ',           color: '#6366f1', desc: 'ขึ้นเวรได้ทุกประเภท รวมดึก' },
  { id: 'r2',           label: 'R2',              color: '#0ea5e9', desc: 'มีเวร R2, ขึ้นดึกได้' },
  { id: 'r2_off_night', label: 'R2 + งดดึก',     color: '#f59e0b', desc: 'มีเวร R2, งดเวรดึก' },
  { id: 'off_night',    label: 'งดดึก',           color: '#10b981', desc: 'งดเวรดึก (di, de) แต่ขึ้นได้ทุกอย่างอื่น' },
  { id: 'off_special',  label: 'Off พิเศษ',       color: '#ef4444', desc: 'งดดึก + งด 4s, บe, R1, T1, T2, G, A — รับได้เฉพาะ บi, บr และเวรที่กำหนด' },
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
        // document ไม่มี → ใช้ค่า default ใน memory เท่านั้น
        // ไม่เขียนทับ Firebase เพราะอาจเป็น network error หรือ timeout
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
  // SMC category ทุกตัว (4s1-4s5 หรือเพิ่มในอนาคต): hardcode 720
  if (getShiftCategory(shift) === 'SMC') return 720;
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
  if (/^4s\d+$/i.test(shift.name.trim())) return 'SMC';
  if (u === '4O') return '4o';
  if (u === '2O') return '2o';
  return 'อื่นๆ';
};

// ─── เวรที่กลุ่ม Off พิเศษ งดขึ้น ───
const OFF_SPECIAL_BANNED_CATS = new Set(['ดึก','SMC']);
// บe ห้าม, บi/บr อนุญาต (นิธิรับบi+บr ได้)
const OFF_SPECIAL_BANNED_NAMES = new Set(['บe','R1','T1','T2','G','A','AS1','AS/4'].map(x=>x.toUpperCase()));

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
          @page { size: A4 landscape; margin: 3mm; margin-top: 0; margin-bottom: 3mm; }
          html, body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; zoom: 0.68; }
          .print-hidden { display: none !important; }
          main { padding: 0 !important; }
          .overflow-auto, .custom-scrollbar { overflow: visible !important; }
          table { width: 100% !important; border-collapse: collapse; table-layout: fixed; }
          tr { page-break-inside: avoid; }
          .min-w-\\[1300px\\] { min-width: 0px !important; }
          th, td { padding: 1px 1px !important; font-size: 14px !important; word-wrap: break-word; overflow: hidden; line-height: 1.3 !important; }
          .text-xs { font-size: 13px !important; line-height: 1.2 !important; }
          .rounded-xl, .rounded-2xl { border-radius: 0 !important; }
          .shadow-sm, .shadow { box-shadow: none !important; }
          td:first-child, th:first-child { width: 75px !important; max-width: 75px !important; font-size: 14px !important; padding: 1px 2px !important; }
          .print\\:block { display: none !important; }
        }
      `}</style>
      <header className="bg-slate-900 px-5 py-3 flex justify-between items-center z-20 relative print-hidden">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => navigate(-1)}
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
  const [generatedScheduleIds, setGeneratedScheduleIds] = useState(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const hasGenerated = generatedScheduleIds.has(activeScheduleId);
  const [telemedModal, setTelemedModal] = useState(false);
  // Spacebar shortcut → สุ่มเวร
  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        document.querySelector('[data-auto-gen]')?.click();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
  const thaiMonths = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const thaiDays = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const activeSchedule = schedules.find(s => s.id === activeScheduleId) 
    || (schedules.length > 0 ? schedules[schedules.length - 1] : null);

  const handleCreateSchedule = () => {
    const newId = `${createYear}-${createMonth}`;
    if (schedules.find(s => s.id === newId)) return alert('มีตารางของเดือนนี้อยู่แล้ว!');
    const newSchedule = { id: newId, year: createYear, month: createMonth, assignments: {}, holidays: {} };
    const updated = [...schedules, newSchedule];
    setSchedules(updated);
    setActiveScheduleId(newId);
    setIsCreateModalOpen(false);
    // scroll ไปที่ปุ่มเดือนใหม่หลัง render
    setTimeout(() => {
      const btn = document.querySelector(`[data-schedule-id="${newId}"]`);
      btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      btn?.click();
    }, 100);
  };

  const handleDeleteSchedule = () => {
    if (!activeSchedule) return;
    if (confirm(`ลบตารางเดือน ${thaiMonths[activeSchedule.month]} ${activeSchedule.year + 543}?`)) {
      const updated = schedules.filter(s => s.id !== activeSchedule.id);
      setSchedules(updated);
      setActiveScheduleId(updated.length > 0 ? updated[updated.length - 1].id : null);
    }
  };

  const handleExportExcel = () => {
    if (!activeSchedule) return;
    const dim = new Date(activeSchedule.year, activeSchedule.month + 1, 0).getDate();
    let csv = '\uFEFFพนักงาน,กลุ่ม,';
    for (let i = 1; i <= dim; i++) csv += i + ',';
    csv += 'เช้า,บ่าย,ดึก,As/4,A/4,SMC,4o,2o,4T,ชั่วโมง,รวมเงิน\n';
    employees.filter(e => !e.onLeave).forEach(emp => {
      const grp = PHARMACIST_GROUPS.find(g => g.id === emp.group)?.label || 'ปกติ';
      let row = [`"${emp.name}"`, `"${grp}"`];
      let money = 0, hours = 0;
      let cnt = { เช้า:0, บ่าย:0, ดึก:0, 'As/4':0, 'A/4':0, SMC:0, '4o':0, '2o':0, '4T':0 };
      for (let d = 1; d <= dim; d++) {
        const ds = fmtDateFor(activeSchedule, d);
        const s = shifts.find(s => s.id === activeSchedule.assignments[`${emp.id}_${ds}`]);
        row.push(s ? `"${s.name}"` : '');
        if (s) {
          money += getShiftValue(s);
          hours += getShiftHours(s);
          if (s.isTelemed) cnt['4T']++;
          else { const c = getShiftCategory(s); if (cnt[c] !== undefined) cnt[c]++; }
        }
      }
      row.push(cnt['เช้า'], cnt['บ่าย'], cnt['ดึก'], cnt['As/4'], cnt['A/4'], cnt['SMC'], cnt['4o'], cnt['2o'], cnt['4T'], hours, money);
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
    setIsGenerating(true);
    setRetryCount(0);
    setTimeout(() => {
    const MAX_AUTO_RETRY = 40;
    const dim = new Date(activeSchedule.year, activeSchedule.month + 1, 0).getDate();
    let TARGET_NORMAL = 60;
    let TARGET_OFF_NIGHT = 44;

    const scoreResult = (assignments) => {
      const getH = (empId) => {
        let h = 0;
        for (let d = 1; d <= dim; d++) {
          const ds = `${activeSchedule.year}-${String(activeSchedule.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const s = shifts.find(s => s.id === assignments[`${empId}_${ds}`]);
          if (s) h += getShiftHours(s);
        }
        return h;
      };
      const normalEmps = employees.filter(e => !e.onLeave && (e.group==='normal'||e.group==='r2'||!e.group));
      const offEmps = employees.filter(e => !e.onLeave && ['off_night','r2_off_night'].includes(e.group));
      const nH = normalEmps.map(e => getH(e.id)).filter(h => h > 0);
      const oH = offEmps.map(e => getH(e.id)).filter(h => h > 0);
      const spread = (hrs) => hrs.length < 2 ? 0 : Math.max(...hrs) - Math.min(...hrs);
      const std = (hrs) => {
        if (hrs.length < 2) return 0;
        const m = hrs.reduce((a,b)=>a+b,0)/hrs.length;
        return Math.sqrt(hrs.reduce((a,b)=>a+(b-m)**2,0)/hrs.length);
      };
      let missing = 0;
      for (let d = 1; d <= dim; d++) {
        const ds = `${activeSchedule.year}-${String(activeSchedule.month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dow = new Date(activeSchedule.year, activeSchedule.month, d).getDay();
        const isSat = dow === 6;
        const hol = dow===0||dow===6||!!(activeSchedule.holidays?.[ds]);
        shifts.forEach(s => {
          const a = s.allowedDays||'all';
          let ok = false;
          if (a==='all') ok=true;
          else if (a==='weekdays'&&!hol) ok=true;
          else if (a==='weekends_holidays'&&hol) ok=true;
          else if (a==='saturdays_only'&&isSat) ok=true;
          else if (a==='mon_tue_only'&&[1,2].includes(dow)&&!hol) ok=true;
          else if (a==='holidays_except_saturday'&&hol&&!isSat) ok=true;
          else if (a==='first_day_of_holidays') {
            if (hol) {
              const pd=d-1, pDow=pd>=1?new Date(activeSchedule.year,activeSchedule.month,pd).getDay():-1;
              const pDs=`${activeSchedule.year}-${String(activeSchedule.month+1).padStart(2,'0')}-${String(pd).padStart(2,'0')}`;
              const pH=pDow===0||pDow===6||!!(activeSchedule.holidays?.[pDs]);
              if (d===1||!pH) ok=true;
            }
          }
          if (!ok) return;
          const filled = employees.filter(e => assignments[`${e.id}_${ds}`]===s.id).length;
          if (filled < (s.min||1)) missing += (s.min||1)-filled;
        });
      }
      const nSpread=spread(nH), nStd=std(nH), oSpread=spread(oH), oStd=std(oH);
      const isGood = missing===0 && nSpread<=8 && nStd<=2.5 && (oH.length<2||(oSpread<=6&&oStd<=2.5));
      return { missing, nSpread, nStd, oSpread, oStd, isGood };
    };

    const runOnce = () => {
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
    // กรองเฉพาะคนที่ไม่ได้พักงาน
    const activeEmployees = employees.filter(e => !e.onLeave);

    const getGroup = (emp) => emp.group || 'normal';

    const canDoNight = (emp) => {
      const g = getGroup(emp);
      return g === 'normal' || g === 'r2';
    };

    const isOffSpecial = (emp) => getGroup(emp) === 'off_special';

    // ─── init empStats สำหรับทุกคน (รวมคนพักงาน เพื่อป้องกัน undefined) ───
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

    // ─── doSwap: ย้ายเวรจาก fromEmp → toEmp พร้อม update empStats ───
    const doSwap = (fromEmpId, toEmpId, dateStr, shift) => {
      const cat = getShiftCategory(shift);
      const u = shift.name.trim().toUpperCase();
      const hrs = getShiftHours(shift);

      // ลบออกจาก fromEmp
      delete newAssignments[`${fromEmpId}_${dateStr}`];
      empStats[fromEmpId].hours -= hrs;
      empStats[fromEmpId].money -= getShiftValue(shift);
      empStats[fromEmpId].totalShifts--;
      empStats[fromEmpId].catCounts[cat] = Math.max(0, (empStats[fromEmpId].catCounts[cat] || 1) - 1);
      if (cat === 'บ่าย') {
        empStats[fromEmpId].afternoonCount = Math.max(0, empStats[fromEmpId].afternoonCount - 1);
        // rebuild assignedAfternoons
        empStats[fromEmpId].assignedAfternoons = new Set();
        for (let d2 = 1; d2 <= dim; d2++) {
          const s2 = shifts.find(s => s.id === newAssignments[`${fromEmpId}_${fmtD(d2)}`]);
          if (s2 && getShiftCategory(s2) === 'บ่าย') empStats[fromEmpId].assignedAfternoons.add(s2.name.trim().toUpperCase());
        }
      }
      if (cat === 'SMC') empStats[fromEmpId].smcHours -= hrs;
      if (cat === 'ดึก') {
        empStats[fromEmpId].assignedNights = new Set();
        for (let d2 = 1; d2 <= dim; d2++) {
          const s2 = shifts.find(s => s.id === newAssignments[`${fromEmpId}_${fmtD(d2)}`]);
          if (s2 && getShiftCategory(s2) === 'ดึก') empStats[fromEmpId].assignedNights.add(s2.name.trim().toUpperCase());
        }
      }

      // เพิ่มให้ toEmp
      newAssignments[`${toEmpId}_${dateStr}`] = shift.id;
      empStats[toEmpId].hours += hrs;
      empStats[toEmpId].money += getShiftValue(shift);
      empStats[toEmpId].totalShifts++;
      empStats[toEmpId].catCounts[cat] = (empStats[toEmpId].catCounts[cat] || 0) + 1;
      if (cat === 'บ่าย') {
        empStats[toEmpId].assignedAfternoons.add(u);
        empStats[toEmpId].afternoonCount++;
        if (u === 'บE') empStats[toEmpId].hasBe = true;
      }
      if (cat === 'SMC') empStats[toEmpId].smcHours += hrs;
      if (cat === 'ดึก') empStats[toEmpId].assignedNights.add(u);
      if (cat === 'เช้า') empStats[toEmpId].assignedMornings.add(u);
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
    const normalEmpsAll = activeEmployees.filter(e => canDoNight(e));
    const offNightEmpsAll = activeEmployees.filter(e => !canDoNight(e) && getGroup(e) !== 'off_special');

    // คำนวณ total hours ทั้งหมดที่ต้องจัดในเดือนนี้ (รวม 2o ด้วย)
    let totalAllHours = 0;
    for (let d = 1; d <= dim; d++) {
      shifts.forEach(s => {
        if (!isApplicable(s, d)) return;
        totalAllHours += getShiftHours(s) * (s.min || 1);
      });
    }

    // ─── TARGET_NORMAL คำนวณจาก total hours จริง ───
    // รองรับเดือนที่มีวันหยุดเยอะ (พ.ค.) ที่ total hours สูงกว่าปกติ
    // off_night ได้น้อยกว่า GAP ชั่วโมง
    // total = nN × TARGET_NORMAL + nO × (TARGET_NORMAL - GAP)
    // TARGET_NORMAL = (totalAllHours + nO × GAP) / (nN + nO)
    const nN = normalEmpsAll.length || 1;
    const nO = offNightEmpsAll.length || 0;
    const GAP = 16;
    TARGET_NORMAL = nN > 0
      ? Math.max(56, Math.round((totalAllHours + nO * GAP) / (nN + nO)))
      : 60;
    TARGET_OFF_NIGHT = Math.max(40, TARGET_NORMAL - GAP);

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

      // กลุ่ม r2 และ r2_off_night: ห้ามได้ A/4, As/4 (มี R2 เป็นเช้าอยู่แล้ว)
      if ((getGroup(emp) === 'r2' || getGroup(emp) === 'r2_off_night') && (cat === 'As/4' || cat === 'A/4')) return false;

      // Rule 2: บ่ายห้ามซ้ำตำแหน่ง (ยกเว้น off_special เพราะได้เวรน้อย)
      if (rules.rule_2 && cat === 'บ่าย' && !isOffSpecial(emp) && st.assignedAfternoons.has(u)) return false;

      // เวรดึกห้ามซ้ำตำแหน่ง (ยกเว้น R2 ที่อาจได้หลายครั้ง)
      if (cat === 'ดึก' && u !== 'R2' && st.assignedNights.has(u)) return false;

      // Rule 3: R1↔G pairing — บังคับใน canAssign
      if (rules.rule_3) {
        if (u === 'G') {
          // ถ้ามีคนอื่นที่มี R1 แต่ยังไม่มี G → ให้คนนั้นได้ G ก่อน
          const r1WithoutG = normalEmpsAll.some(e =>
            e.id !== emp.id &&
            empStats[e.id].hasR1 &&
            !empStats[e.id].hasG &&
            !newAssignments[`${e.id}_${dateStr}`] &&
            !e.offShifts?.includes(shift.id)
          );
          if (r1WithoutG) return false;
        }
        if (u === 'R1') {
          // ตรวจว่ายังมี G slot เหลือในเดือนนี้ไหม
          // ถ้า G slots ที่เหลือ < คนที่มี R1 แต่ไม่มี G → block
          let gSlotsLeft = 0;
          const gShift = shifts.find(s => s.name.trim().toUpperCase() === 'G');
          if (gShift) {
            for (let d2 = d; d2 <= dim; d2++) {
              if (isApplicable(gShift, d2)) gSlotsLeft += (gShift.min || 1);
            }
          }
          const r1WithoutG = normalEmpsAll.filter(e =>
            empStats[e.id].hasR1 && !empStats[e.id].hasG
          ).length;
          // ถ้า G slots เหลือน้อยกว่าคนที่ต้องการ G → block R1 ใหม่
          if (gSlotsLeft <= r1WithoutG) return false;
        }
      }
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

        // กลุ่ม r2: โอกาสได้ดึก 2 ครั้ง = 20% เท่านั้น (80% ได้แค่ 1)
        // ใช้ empId เป็น seed เพื่อให้ consistent ตลอดเดือน
        if (cat === 'ดึก' && getGroup(emp) === 'r2') {
          const allow2Nights = (parseInt(emp.id, 36) % 10) < 2; // ~20%
          const nightCap = allow2Nights ? CAP['ดึก'] : 1;
          if ((st.catCounts['ดึก'] || 0) >= nightCap) return false;
        }
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
      // ยกเว้น: บ่าย — ถ้ายังได้บ่ายน้อยกว่า CAP ควรได้ก่อนเสมอ
      if (u !== 'R2' && canDoNight(emp) && cat !== 'บ่าย') {
        const shiftHrs = getShiftHours(shift);
        if (st.hours + shiftHrs > TARGET_NORMAL) {
          // ตรวจว่ามีคนอื่นในกลุ่มปกติที่:
          // 1. ชั่วโมงน้อยกว่าคนนี้ AND
          // 2. รับเวรนี้ได้โดยไม่เกิน TARGET
          const hasOtherUnderTarget = normalEmpsAll.some(e => {
            if (e.id === emp.id) return false;
            // ต้องมีชั่วโมงน้อยกว่าคนนี้ AND รับได้โดยไม่เกิน TARGET
            if (empStats[e.id].hours >= st.hours) return false;
            if (empStats[e.id].hours + shiftHrs > TARGET_NORMAL) return false;
            if (newAssignments[`${e.id}_${dateStr}`]) return false;
            // ตรวจ rule_1: วันก่อน/หลังต้องว่าง (ไม่งั้นจะ block แล้วไม่มีใครรับได้จริง)
            if (rules.rule_1) {
              const prevDs = fmtD(d - 1);
              const nextDs = fmtD(d + 1);
              if (prevDs && newAssignments[`${e.id}_${prevDs}`]) {
                const prevShift = shifts.find(s => s.id === newAssignments[`${e.id}_${prevDs}`]);
                if (!prevShift || prevShift.name.trim().toUpperCase() !== 'R2') return false;
              }
              if (nextDs && newAssignments[`${e.id}_${nextDs}`]) {
                const nextShift = shifts.find(s => s.id === newAssignments[`${e.id}_${nextDs}`]);
                if (!nextShift || nextShift.name.trim().toUpperCase() !== 'R2') return false;
              }
            }
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
              if (!isOffSpecial(e) && empStats[e.id].assignedAfternoons.has(u)) return false;
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
        // ไม่มี hard emergency cap — hasOtherUnderTarget จัดการทั้งหมด
        // ถ้าไม่มีใครรับได้โดยไม่เกิน TARGET → รับได้ (เวรไม่หาย)
        // ถ้ามีคนอื่นรับได้ → block (ชั่วโมงกระจาย)
      }

      // Cap เฉพาะกลุ่ม off_night (ใช้ CAP เดิม ไม่ hardcode)
      // ไม่ต้องเพิ่มอะไรที่นี่ เพราะ CAP block ด้านบนครอบคลุมแล้ว

      // Hours cap กลุ่ม off_night: ไม่เกิน TARGET_OFF_NIGHT
      // block ถ้ายังมีคนปกติที่ชั่วโมง < TARGET_NORMAL รับได้จริง (ไม่ติด rule_1)
      if (u !== 'R2' && !canDoNight(emp) && !isOffSpecial(emp)) {
        const shiftHrs = getShiftHours(shift);

        // Pace check: off_night ไม่ควรสะสม hours เร็วเกินไป
        // ใช้ expected hours ณ วันนั้น = TARGET_OFF_NIGHT * (d/dim) + buffer 1 shift
        const expectedHrsAtDay = TARGET_OFF_NIGHT * (d / dim) + getShiftHours(shift);
        if (st.hours >= expectedHrsAtDay) {
          // ตรวจว่ามีคน off_night อื่นที่ hours น้อยกว่ารับได้ไหม
          const hasOtherOffNight = offNightEmpsAll.some(e => {
            if (e.id === emp.id) return false;
            if (newAssignments[`${e.id}_${dateStr}`]) return false;
            if (e.offShifts?.includes(shift.id)) return false;
            if (empStats[e.id].hours >= expectedHrsAtDay) return false;
            if (empStats[e.id].hours + shiftHrs > TARGET_OFF_NIGHT) return false;
            const prevDs = fmtD(d - 1);
            const nextDs = fmtD(d + 1);
            if (prevDs && newAssignments[`${e.id}_${prevDs}`]) return false;
            if (nextDs && newAssignments[`${e.id}_${nextDs}`]) return false;
            return true;
          });
          if (hasOtherOffNight) return false;
        }

        if (st.hours + shiftHrs > TARGET_OFF_NIGHT) {
          const hasNormalUnderTarget = normalEmpsAll.some(e => {
            if (empStats[e.id].hours + shiftHrs > TARGET_NORMAL) return false;
            if (newAssignments[`${e.id}_${dateStr}`]) return false;
            if (e.offShifts?.includes(shift.id)) return false;
            if (e.specificShifts?.length > 0 && !e.specificShifts.includes(shift.id)) return false;
            if (cat === 'เช้า' && empStats[e.id].assignedMornings.has(u)) return false;
            if (cat === 'บ่าย' && empStats[e.id].assignedAfternoons.has(u)) return false;
            if ((empStats[e.id].catCounts[cat] || 0) >= (cat === 'เช้า' ? 3 : 2)) return false;
            // ตรวจ rule_1 — ถ้าติดก็ไม่นับว่า "รับได้"
            if (rules.rule_1) {
              const prevDs = fmtD(d - 1);
              const nextDs = fmtD(d + 1);
              if (prevDs && newAssignments[`${e.id}_${prevDs}`]) {
                const ps = shifts.find(s => s.id === newAssignments[`${e.id}_${prevDs}`]);
                if (!ps || ps.name.trim().toUpperCase() !== 'R2') return false;
              }
              if (nextDs && newAssignments[`${e.id}_${nextDs}`]) {
                const ns = shifts.find(s => s.id === newAssignments[`${e.id}_${nextDs}`]);
                if (!ns || ns.name.trim().toUpperCase() !== 'R2') return false;
              }
            }
            return true;
          });
          if (hasNormalUnderTarget) return false;
        }
        // Emergency: ไม่เกิน TARGET_OFF_NIGHT + 8h ไม่ว่ากรณีใด
        if (st.hours + shiftHrs > TARGET_OFF_NIGHT + 8) return false;
      }

      return true;
    };

    // ─── sortEligible ───
    const sortEligible = (eligible, shift, d = 1) => {
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

        // ดึก: คนที่ได้ดึกน้อยกว่าได้ก่อน — กระจาย deterministic
        if (cat === 'ดึก') {
          const aNight = sa.catCounts['ดึก'] || 0;
          const bNight = sb.catCounts['ดึก'] || 0;
          if (aNight !== bNight) return aNight - bNight;
        }

        // Primary: กระจาย totalShifts ก่อน — ป้องกันคนเดิมได้เวรสะสม
        if (sa.totalShifts !== sb.totalShifts) return sa.totalShifts - sb.totalShifts;

        // Secondary: คนที่ห่างจาก TARGET มากกว่า (hours น้อยกว่า) ได้ก่อน
        // off_night: ใช้ pace = hours / TARGET_OFF_NIGHT เทียบกับ d/dim
        // เพื่อกระจายให้ทั่วเดือน ไม่ให้เต็มก่อนถึงปลายเดือน
        const aCanNight = canDoNight(a), bCanNight = canDoNight(b);
        if (aCanNight === bCanNight) {
          const myTarget = aCanNight ? TARGET_NORMAL : TARGET_OFF_NIGHT;
          const aGap = myTarget - sa.hours;
          const bGap = myTarget - sb.hours;
          if (aGap !== bGap) return bGap - aGap;
        } else {
          // off_night vs normal: ให้ off_night รับเฉพาะเมื่อ normal เต็มแล้ว
          // ตรวจจาก hours ratio vs วันที่ในเดือน
          const monthRatio = d / dim; // 0-1
          const aRatio = sa.hours / (aCanNight ? TARGET_NORMAL : TARGET_OFF_NIGHT);
          const bRatio = sb.hours / (bCanNight ? TARGET_NORMAL : TARGET_OFF_NIGHT);
          // คนที่ ratio น้อยกว่า monthRatio ยังได้รับเวรได้
          const aBehind = aRatio < monthRatio;
          const bBehind = bRatio < monthRatio;
          if (aBehind !== bBehind) return aBehind ? -1 : 1;
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

    const totalEmps = activeEmployees.length || 1;
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
      '4o':   Math.max(2, Math.ceil(slotsByCat['4o'] / (normalEmpsAll.length || 1))),
      '2o':   dynamicCap('2o',   1),
      'As/4': 1,
      'A/4':  1,
    };

    // morning cap รวม (เช้า + As/4 + A/4)
    // ปกติ: ใช้ dynamic cap แต่ไม่เกิน 3
    // off_night: ≤ 2 เสมอ
    const MORNING_CAP_NORMAL = Math.min(3, dynamicCap('เช้า', 2));
    const MORNING_CAP_OFF = 2;

    // R2 ต้องได้ก่อนเวรอื่นเสมอในวันหยุด เพื่อป้องกัน rule_1 block คนกลุ่ม r2
    const r2Shift = shifts.find(s => s.name.trim().toUpperCase() === 'R2');
    const t1Shift = shifts.find(s => s.name.trim().toUpperCase() === 'T1');
    const t2Shift = shifts.find(s => s.name.trim().toUpperCase() === 'T2');
    const mainShifts = shifts.filter(s => getShiftCategory(s) !== '2o');

    // ─── helper: นับ min ต่อวัน (รองรับ Telemed ที่ min ต่างกันแต่ละวัน) ───
    const getShiftMinForDay = (shift, dateStr) => {
      // เวร Telemed: ใช้ค่าจาก schedule.telemed[dateStr] แทน shift.min
      if (shift.isTelemed && activeSchedule?.telemed) {
        return activeSchedule.telemed[dateStr] ?? 0;
      }
      return shift.min || 1;
    };

    // identify เวร Telemed (category = 'อื่นๆ' และ isTelemed = true)
    const telemedShifts = shifts.filter(s => s.isTelemed);

    for (let d = 1; d <= dim; d++) {
      const dateStr = fmtD(d);
      const hol = isHol(d);
      const dow = getDow(d);

      // ── STEP A: จัด R2 ก่อนทุกอย่างในวันหยุด (ไม่มี rule_1 สำหรับ R2) ──
      if (hol && r2Shift) {
        const slots = r2Shift.min || 1;
        const r2Emps = activeEmployees.filter(e =>
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
          const eligible = activeEmployees.filter(emp => canAssign(emp, dateStr, d, t1Shift));
          if (eligible.length === 0) break;
          doAssign(sortEligible(eligible, t1Shift, d)[0], dateStr, d, t1Shift);
        }
      }

      // ── STEP C: จัด T2 (เสาร์ + วันแรกของช่วงหยุดนักขัตฤกษ์) ──
      if (isT2Day && t2Shift) {
        for (let slot = 0; slot < (t2Shift.min || 1); slot++) {
          const eligible = activeEmployees.filter(emp => canAssign(emp, dateStr, d, t2Shift));
          if (eligible.length === 0) break;
          doAssign(sortEligible(eligible, t2Shift, d)[0], dateStr, d, t2Shift);
        }
      }

      // ── STEP D: จัดเวรที่เหลือทั้งหมด ──
      // เรียง: 4h (SMC,4o) ก่อน → 8h (บ่าย,ดึก,เช้า) → 12h (As/4,A/4)
      // เพราะ 4h ใช้คนน้อย ไม่ block rule_1 ของเวร 8h ที่จะตามมา
      const todayShifts = mainShifts.filter(s => {
        const u = s.name.trim().toUpperCase();
        if (u === 'R2') return false;
        if (u === 'T1') return false;
        if (u === 'T2') return false;
        return isApplicable(s, d);
      });
      shuffle(todayShifts);
      todayShifts.sort((a, b) => {
        const ha = getShiftHours(a), hb = getShiftHours(b);
        // วันหยุด: 8h ก่อน (B,C,D,E,F,G ต้องได้คนก่อน) แล้ว 12h แล้ว 4h
        // วันทำการ: 4h ก่อน (SMC,4o ใช้คนน้อย) แล้ว 8h
        if (isHol(d)) {
          if (ha === hb) return 0;
          if (ha === 8) return -1;
          if (hb === 8) return 1;
          if (ha === 12) return -1;
          if (hb === 12) return 1;
          return ha - hb;
        } else {
          return ha - hb; // 4h ก่อน 8h วันทำการ
        }
      });
      for (const shift of todayShifts) {
        const shiftMinToday = getShiftMinForDay(shift, dateStr);
        if (shiftMinToday === 0) continue; // Telemed วันนี้ไม่ต้องการคน
        for (let slot = 0; slot < shiftMinToday; slot++) {
          // รอบ 1: ปกติ — ผ่านทุก rule
          let eligible = activeEmployees.filter(emp => canAssign(emp, dateStr, d, shift));

          // รอบ 2: ผ่อน hours cap — ยอมให้คนที่ชั่วโมงเกิน TARGET รับได้
          if (eligible.length === 0) {
            eligible = activeEmployees.filter(emp => {
              if (newAssignments[`${emp.id}_${dateStr}`]) return false;
              if (emp.offShifts?.includes(shift.id)) return false;
              if (emp.specificShifts?.length > 0 && !emp.specificShifts.includes(shift.id)) return false;
              if (isOffSpecial(emp) && isShiftBannedForOffSpecial(shift)) return false;
              if (!canDoNight(emp) && getShiftCategory(shift) === 'ดึก') return false;
              // ตรวจ rule_1 เท่านั้น
              if (empStats[emp.id].lastDay !== null && d - empStats[emp.id].lastDay === 1) {
                const prevDs = fmtD(d - 1);
                const prevShiftId = prevDs ? newAssignments[`${emp.id}_${prevDs}`] : null;
                const prevShift = prevShiftId ? shifts.find(s => s.id === prevShiftId) : null;
                if (!prevShift || prevShift.name.trim().toUpperCase() !== 'R2') return false;
              }
              const nextDs = fmtD(d + 1);
              if (nextDs && newAssignments[`${emp.id}_${nextDs}`]) {
                const nextShift = shifts.find(s => s.id === newAssignments[`${emp.id}_${nextDs}`]);
                if (!nextShift || nextShift.name.trim().toUpperCase() !== 'R2') return false;
              }
              return true;
            });
          }

          // รอบ 3: fallback สุดท้าย — ผ่อน hours cap แต่ยัง keep rule_2, rule_7, cat cap
          if (eligible.length === 0) {
            const cat3 = getShiftCategory(shift);
            const u3 = shift.name.trim().toUpperCase();
            eligible = activeEmployees.filter(emp => {
              if (newAssignments[`${emp.id}_${dateStr}`]) return false;
              if (!canDoNight(emp) && cat3 === 'ดึก') return false;
              if (emp.offShifts?.includes(shift.id)) return false;
              if (isOffSpecial(emp) && isShiftBannedForOffSpecial(shift)) return false;
              const st3 = empStats[emp.id];
              // rule_1
              const prevDs = fmtD(d - 1);
              const nextDs = fmtD(d + 1);
              if (prevDs && newAssignments[`${emp.id}_${prevDs}`]) {
                const ps = shifts.find(s => s.id === newAssignments[`${emp.id}_${prevDs}`]);
                if (!ps || ps.name.trim().toUpperCase() !== 'R2') return false;
              }
              if (nextDs && newAssignments[`${emp.id}_${nextDs}`]) {
                const ns = shifts.find(s => s.id === newAssignments[`${emp.id}_${nextDs}`]);
                if (!ns || ns.name.trim().toUpperCase() !== 'R2') return false;
              }
              // rule_2: บ่ายซ้ำตำแหน่ง
              if (cat3 === 'บ่าย' && !isOffSpecial(emp) && st3.assignedAfternoons.has(u3)) return false;
              // rule_7: เช้าซ้ำตำแหน่ง
              if (cat3 === 'เช้า' && u3 !== 'R2' && st3.assignedMornings.has(u3)) return false;
              // ดึก cap
              if (cat3 === 'ดึก' && (st3.catCounts['ดึก'] || 0) >= CAP['ดึก']) return false;
              return true;
            });
          }

          if (eligible.length === 0) continue; // ไม่มีใครว่างจริงๆ (ทุกคนติด rule_1)
          doAssign(sortEligible(eligible, shift, d)[0], dateStr, d, shift);
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
            eligible = activeEmployees.filter(emp => {
              if (!canAssign(emp, dateStr, d, shift)) return false;
              return (empStats[emp.id].catCounts['2o'] || 0) < MAX_2O;
            });
          }

          // รอบ 4: fallback ป้องกันเวรขาด
          if (eligible.length === 0) {
            eligible = activeEmployees.filter(emp => canAssign(emp, dateStr, d, shift));
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

    // ─── PHASE 3: Post-process swap ───
    // หาคนที่ได้ > TARGET+4h แล้วสลับเวร 8h กับคนที่ได้ < TARGET-2h
    // เงื่อนไข swap: ต้องไม่ผิด rule_1 (ติดกัน) และ rule_7 (เช้าซ้ำ)
    const calcHours = (empId) => {
      let h = 0;
      for (let d = 1; d <= dim; d++) {
        const ds = fmtD(d);
        const s = shifts.find(s => s.id === newAssignments[`${empId}_${ds}`]);
        if (s) h += getShiftHours(s);
      }
      return h;
    };

    const MAX_SWAP_ROUNDS = 20;
    for (let round = 0; round < MAX_SWAP_ROUNDS; round++) {
      let swapped = false;

      // หาคนที่เกิน TARGET (จับทุกคนที่เกินเลย ไม่มี buffer)
      const overEmps = normalEmpsAll.filter(e =>
        calcHours(e.id) > TARGET_NORMAL
      ).sort((a,b) => calcHours(b.id) - calcHours(a.id));

      for (const overEmp of overEmps) {
        const overHours = calcHours(overEmp.id);

        // หาเวรของคนนี้ที่ swap ได้ — รวม 8h, 4h และ 2o(2h)
        // R2 ห้าม swap, เรียงดึกก่อน แล้ว 2o แล้ว 8h แล้ว 4h
        const overShifts = [];
        for (let d = 1; d <= dim; d++) {
          const ds = fmtD(d);
          const sid = newAssignments[`${overEmp.id}_${ds}`];
          if (!sid) continue;
          const s = shifts.find(s => s.id === sid);
          if (!s) continue;
          const u = s.name.trim().toUpperCase();
          if (u === 'R2') continue;
          const h = getShiftHours(s);
          if (h === 8 || h === 4 || h === 2) overShifts.push({ d, ds, s, h });
        }
        // เรียง: ดึกก่อน → 2o → 8h → 4h
        overShifts.sort((a,b) => {
          const aCat = getShiftCategory(a.s);
          const bCat = getShiftCategory(b.s);
          if (aCat === 'ดึก' && bCat !== 'ดึก') return -1;
          if (bCat === 'ดึก' && aCat !== 'ดึก') return 1;
          if (a.h === 2 && b.h !== 2) return -1;
          if (b.h === 2 && a.h !== 2) return 1;
          if (a.h > b.h) return -1;
          if (b.h > a.h) return 1;
          return 0;
        });

        // หาคนที่ under — เรียงจากน้อยสุดก่อน
        // ถ้า swap ดึก → ต้องเป็นคนที่ขึ้นดึกได้ด้วย
        const swapCat = overShifts[0] ? getShiftCategory(overShifts[0].s) : '';
        const underPool = swapCat === 'ดึก'
          ? activeEmployees.filter(e => canDoNight(e))
          : normalEmpsAll;

        const underEmps = underPool.filter(e => {
          if (e.id === overEmp.id) return false;
          return calcHours(e.id) < overHours;
        }).sort((a,b) => calcHours(a.id) - calcHours(b.id));

        let foundSwap = false;
        for (const underEmp of underEmps) {
          if (foundSwap) break;
          const underHours = calcHours(underEmp.id);

          for (const shiftItem of overShifts) {
            if (foundSwap) break;
            const { d, ds, s: overShift, h: overShiftH } = shiftItem;

            // ตรวจว่า underEmp ว่างวันนี้ไหม
            if (newAssignments[`${underEmp.id}_${ds}`]) continue;

            // ตรวจ rule_1: ไม่ติดกับวันก่อน/หลัง
            const prevDs = fmtD(d - 1);
            const nextDs = fmtD(d + 1);
            if (prevDs && newAssignments[`${underEmp.id}_${prevDs}`]) continue;
            if (nextDs && newAssignments[`${underEmp.id}_${nextDs}`]) continue;

            // ตรวจดึก: ถ้าเป็นเวรดึก คนรับต้องมีดึก < CAP และไม่ซ้ำตำแหน่ง
            const cat = getShiftCategory(overShift);
            const u = overShift.name.trim().toUpperCase();
            if (cat === 'ดึก') {
              let nightCount = 0;
              let hasSameNight = false;
              for (let d2 = 1; d2 <= dim; d2++) {
                const sid2 = newAssignments[`${underEmp.id}_${fmtD(d2)}`];
                if (!sid2) continue;
                const s2 = shifts.find(s => s.id === sid2);
                if (!s2) continue;
                if (getShiftCategory(s2) === 'ดึก') {
                  nightCount++;
                  if (s2.name.trim().toUpperCase() === u) hasSameNight = true;
                }
              }
              if (nightCount >= CAP['ดึก']) continue;
              if (hasSameNight) continue;
            }
            if (['เช้า','As/4','A/4'].includes(cat)) {
              let alreadyHas = false;
              for (let d2 = 1; d2 <= dim; d2++) {
                const sid2 = newAssignments[`${underEmp.id}_${fmtD(d2)}`];
                if (!sid2) continue;
                const s2 = shifts.find(s => s.id === sid2);
                if (s2 && s2.name.trim().toUpperCase() === u) { alreadyHas = true; break; }
              }
              if (alreadyHas) continue;
            }

            // ตรวจชั่วโมงหลัง swap
            // under ได้ไม่เกิน overHours-1 (ไม่กลายเป็น over เอง)
            const shiftH = overShiftH || getShiftHours(overShift);
            const newUnderHours = underHours + shiftH;
            if (newUnderHours > overHours - 1) continue;

            // SWAP!
            doSwap(overEmp.id, underEmp.id, ds, overShift);
            foundSwap = true;
            swapped = true;
            break;
          }
        }
      }
      if (!swapped) break; // ไม่มีอะไรให้ swap แล้ว
    }

    // ─── PHASE 3b: swap บ่าย — คนที่มี 3 บ่าย → ให้คนที่มี 1 บ่าย ───
    // แล้วเอา 4h ของคนบ่าย=1 นั้น → ให้คนอื่นที่ชั่วโมงน้อยสุด
    const countAfternoon = (empId) => {
      let n = 0;
      for (let d = 1; d <= dim; d++) {
        const s = shifts.find(s => s.id === newAssignments[`${empId}_${fmtD(d)}`]);
        if (s && getShiftCategory(s) === 'บ่าย') n++;
      }
      return n;
    };

    const MAX_AFT_SWAP = 5;
    for (let round = 0; round < MAX_AFT_SWAP; round++) {
      let swapped3b = false;

      // หาคนที่บ่าย >= 3 — รวม off_night ด้วย
      const overAft = [...normalEmpsAll, ...offNightEmpsAll].filter(e => countAfternoon(e.id) >= 3)
        .sort((a,b) => countAfternoon(b.id) - countAfternoon(a.id));

      for (const overEmp of overAft) {
        const overHours = calcHours(overEmp.id);

        // หาเวรบ่ายของคนนี้ที่ swap ออกได้ (ไม่ใช่ R2)
        const aftShifts = [];
        for (let d = 1; d <= dim; d++) {
          const ds = fmtD(d);
          const sid = newAssignments[`${overEmp.id}_${ds}`];
          if (!sid) continue;
          const s = shifts.find(s => s.id === sid);
          if (!s || getShiftCategory(s) !== 'บ่าย') continue;
          aftShifts.push({ d, ds, s });
        }

        // หาคนที่บ่าย = 1 — รวม off_special (นิธิ) ที่ควรได้บ่ายเพิ่ม
        // off_special ยกเว้น rule_2 ซ้ำตำแหน่ง
        const underAft = [...normalEmpsAll, ...activeEmployees.filter(e => isOffSpecial(e))].filter(e =>
          e.id !== overEmp.id && countAfternoon(e.id) <= 1
        ).sort((a,b) => calcHours(a.id) - calcHours(b.id));

        for (const underEmp of underAft) {
          if (swapped3b) break;
          const underHours = calcHours(underEmp.id);

          for (const { d, ds, s: aftShift } of aftShifts) {
            if (swapped3b) break;

            // underEmp ต้องว่างวันนี้
            if (newAssignments[`${underEmp.id}_${ds}`]) continue;

            // rule_1: ไม่ติดกัน
            const prevDs = fmtD(d - 1);
            const nextDs = fmtD(d + 1);
            if (prevDs && newAssignments[`${underEmp.id}_${prevDs}`]) continue;
            if (nextDs && newAssignments[`${underEmp.id}_${nextDs}`]) continue;

            // rule_2: ไม่ซ้ำตำแหน่งบ่าย (ยกเว้น off_special)
            const u = aftShift.name.trim().toUpperCase();
            if (!isOffSpecial(underEmp)) {
              let hasAftDup = false;
              for (let d2 = 1; d2 <= dim; d2++) {
                const s2 = shifts.find(s => s.id === newAssignments[`${underEmp.id}_${fmtD(d2)}`]);
                if (s2 && s2.name.trim().toUpperCase() === u) { hasAftDup = true; break; }
              }
              if (hasAftDup) continue;
            }
            // off_special: ห้ามแค่ บe
            if (isOffSpecial(underEmp) && u === 'บE') continue;

            // หา 4h ของ underEmp ที่จะ swap กลับให้ overEmp
            // เพื่อให้ชั่วโมงสมดุล: under +8-4=+4, over -8+4=-4
            const fourHOfUnder = [];
            for (let d2 = 1; d2 <= dim; d2++) {
              const ds2 = fmtD(d2);
              const sid2 = newAssignments[`${underEmp.id}_${ds2}`];
              if (!sid2) continue;
              const s2 = shifts.find(s => s.id === sid2);
              if (!s2 || getShiftHours(s2) !== 4) continue;
              // ตรวจว่า overEmp รับ 4h วันนั้นได้ไหม (ว่างและไม่ติดกัน)
              if (newAssignments[`${overEmp.id}_${ds2}`]) continue;
              const pd2 = fmtD(d2-1), nd2 = fmtD(d2+1);
              if (pd2 && newAssignments[`${overEmp.id}_${pd2}`]) continue;
              if (nd2 && newAssignments[`${overEmp.id}_${nd2}`]) continue;
              fourHOfUnder.push({ d: d2, ds: ds2, s: s2 });
            }

            if (fourHOfUnder.length === 0) continue;

            // ตรวจ hours หลัง 2-way swap
            const { d: d4, ds: ds4, s: s4 } = fourHOfUnder[0];
            const newUnderHours = underHours + 8 - 4;
            const newOverHours = overHours - 8 + 4;
            if (newUnderHours > 64) continue;
            if (newOverHours >= overHours) continue;
            if (!canDoNight(overEmp) && newOverHours > TARGET_OFF_NIGHT) continue;

            // ─ 2-WAY SWAP ─
            doSwap(overEmp.id, underEmp.id, ds, aftShift);
            doSwap(underEmp.id, overEmp.id, ds4, s4);
            swapped3b = true;
            break;
          }
        }
      }
      if (!swapped3b) break;
    }

    // ─── PHASE 3c: swap 4s/4h ของกลุ่ม off_night ที่ hours > TARGET_OFF_NIGHT ───
    // swap ให้ off_night คนอื่นที่ hours 40-44h หรือคนปกติ
    const MAX_OFF_HOURS = TARGET_OFF_NIGHT; // ใช้ TARGET จริง ไม่ hardcode 48
    const MAX_3C_ROUNDS = 5;

    for (let round = 0; round < MAX_3C_ROUNDS; round++) {
      let swapped3c = false;

      // หา off_night ที่ hours > MAX_OFF_HOURS
      const overOffEmps = activeEmployees.filter(e => {
        const g = getGroup(e);
        return (g === 'r2_off_night' || g === 'off_night') && calcHours(e.id) > MAX_OFF_HOURS;
      }).sort((a,b) => calcHours(b.id) - calcHours(a.id));

      for (const overEmp of overOffEmps) {
        if (swapped3c) break;
        const overHours = calcHours(overEmp.id);

        // หาเวร 4h (SMC/4o) ของคนนี้ที่ swap ออกได้
        const fourHShifts = [];
        for (let d = 1; d <= dim; d++) {
          const ds = fmtD(d);
          const sid = newAssignments[`${overEmp.id}_${ds}`];
          if (!sid) continue;
          const s = shifts.find(s => s.id === sid);
          if (!s) continue;
          const u = s.name.trim().toUpperCase();
          if (u === 'R2') continue; // R2 ห้าม swap
          if (getShiftHours(s) === 4) fourHShifts.push({ d, ds, s });
        }

        // หาคนรับ: คนปกติ + off_night ที่ชั่วโมงน้อยกว่าและไม่เกิน MAX_OFF_HOURS
        const underPool = [
          ...normalEmpsAll.filter(e => calcHours(e.id) + 4 <= 60),
          ...offNightEmpsAll.filter(e =>
            e.id !== overEmp.id &&
            calcHours(e.id) < overHours &&
            calcHours(e.id) + 4 <= MAX_OFF_HOURS &&
            (empStats[e.id].catCounts['4o'] || 0) < CAP['4o']
          )
        ].sort((a,b) => {
          const aIsOff = !canDoNight(a), bIsOff = !canDoNight(b);
          const aOk = aIsOff && calcHours(a.id) + 4 <= MAX_OFF_HOURS;
          const bOk = bIsOff && calcHours(b.id) + 4 <= MAX_OFF_HOURS;
          if (aOk !== bOk) return aOk ? -1 : 1;
          return calcHours(a.id) - calcHours(b.id);
        });

        for (const underEmp of underPool) {
          if (swapped3c) break;
          const underHours = calcHours(underEmp.id);

          for (const { d, ds, s: fourShift } of fourHShifts) {
            if (swapped3c) break;

            // underEmp ต้องว่าง
            if (newAssignments[`${underEmp.id}_${ds}`]) continue;

            // rule_1
            const prevDs = fmtD(d - 1);
            const nextDs = fmtD(d + 1);
            if (prevDs && newAssignments[`${underEmp.id}_${prevDs}`]) continue;
            if (nextDs && newAssignments[`${underEmp.id}_${nextDs}`]) continue;

            // ตรวจ SMC cap ของ underEmp
            const cat = getShiftCategory(fourShift);
            if (cat === 'SMC') {
              let smcCount = 0;
              for (let d2 = 1; d2 <= dim; d2++) {
                const s2 = shifts.find(s => s.id === newAssignments[`${underEmp.id}_${fmtD(d2)}`]);
                if (s2 && getShiftCategory(s2) === 'SMC') smcCount++;
              }
              if (smcCount >= CAP['SMC']) continue;
            }

            // ชั่วโมงหลัง swap
            const newUnderHours = underHours + 4;
            const isNormalEmp = canDoNight(underEmp);
            if (isNormalEmp && newUnderHours > 60) continue;
            if (!isNormalEmp && newUnderHours > MAX_OFF_HOURS) continue;

            // SWAP!
            doSwap(overEmp.id, underEmp.id, ds, fourShift);
            swapped3c = true;
            break;
          }
        }
      }
      if (!swapped3c) break;
    }

    // ─── PHASE 3d: swap SMC จากคนที่ได้ ≥ 3 → คนที่ได้น้อยกว่า ───
    const countSMC = (empId) => {
      let n = 0;
      for (let d = 1; d <= dim; d++) {
        const s = shifts.find(s => s.id === newAssignments[`${empId}_${fmtD(d)}`]);
        if (s && getShiftCategory(s) === 'SMC') n++;
      }
      return n;
    };

    const MAX_3D_ROUNDS = 5;
    for (let round = 0; round < MAX_3D_ROUNDS; round++) {
      let swapped3d = false;

      // หาคนที่ SMC >= 3
      const overSMC = [...normalEmpsAll, ...offNightEmpsAll].filter(e =>
        countSMC(e.id) >= 3
      ).sort((a,b) => countSMC(b.id) - countSMC(a.id));

      for (const overEmp of overSMC) {
        if (swapped3d) break;

        // หาเวร SMC ของคนนี้
        const smcShifts = [];
        for (let d = 1; d <= dim; d++) {
          const ds = fmtD(d);
          const sid = newAssignments[`${overEmp.id}_${ds}`];
          if (!sid) continue;
          const s = shifts.find(s => s.id === sid);
          if (!s || getShiftCategory(s) !== 'SMC') continue;
          smcShifts.push({ d, ds, s });
        }

        // หาคนที่ SMC น้อยกว่า เรียงน้อยสุดก่อน
        const underPool = [...normalEmpsAll, ...offNightEmpsAll]
          .filter(e => e.id !== overEmp.id && countSMC(e.id) < countSMC(overEmp.id))
          .sort((a,b) => countSMC(a.id) - countSMC(b.id) || calcHours(a.id) - calcHours(b.id));

        for (const underEmp of underPool) {
          if (swapped3d) break;

          for (const { d, ds, s: smcShift } of smcShifts) {
            if (swapped3d) break;
            if (newAssignments[`${underEmp.id}_${ds}`]) continue;

            // rule_1
            const prevDs = fmtD(d - 1);
            const nextDs = fmtD(d + 1);
            if (prevDs && newAssignments[`${underEmp.id}_${prevDs}`]) continue;
            if (nextDs && newAssignments[`${underEmp.id}_${nextDs}`]) continue;

            // SMC cap
            if (countSMC(underEmp.id) >= CAP['SMC']) continue;

            // hours check
            const newUnderHrs = calcHours(underEmp.id) + 4;
            const isNormal = canDoNight(underEmp);
            if (isNormal && newUnderHrs > TARGET_NORMAL + 4) continue;
            if (!isNormal && newUnderHrs > TARGET_OFF_NIGHT + 4) continue;

            // SWAP!
            doSwap(overEmp.id, underEmp.id, ds, smcShift);
            swapped3d = true;
            break;
          }
        }
      }
      if (!swapped3d) break;
    }

    // ─── PHASE 3e: swap G↔R1 pairing ───
    // หาคนที่มี R1 แต่ไม่มี G และคนที่มี G แต่ไม่มี R1 → swap G กัน
    const getShiftDay = (empId, shiftName) => {
      for (let d = 1; d <= dim; d++) {
        const ds = fmtD(d);
        const s = shifts.find(s => s.id === newAssignments[`${empId}_${ds}`]);
        if (s && s.name.trim().toUpperCase() === shiftName.toUpperCase()) return { d, ds, s };
      }
      return null;
    };

    // หาคนที่มี R1 แต่ไม่มี G
    const r1NoG = normalEmpsAll.filter(e => {
      const hrs = calcHours(e.id);
      let hasR1 = false, hasG = false;
      for (let d = 1; d <= dim; d++) {
        const s = shifts.find(s => s.id === newAssignments[`${e.id}_${fmtD(d)}`]);
        if (!s) continue;
        if (s.name.trim().toUpperCase() === 'R1') hasR1 = true;
        if (s.name.trim().toUpperCase() === 'G') hasG = true;
      }
      return hasR1 && !hasG;
    });

    // หาคนที่มี G แต่ไม่มี R1
    const gNoR1 = normalEmpsAll.filter(e => {
      let hasR1 = false, hasG = false;
      for (let d = 1; d <= dim; d++) {
        const s = shifts.find(s => s.id === newAssignments[`${e.id}_${fmtD(d)}`]);
        if (!s) continue;
        if (s.name.trim().toUpperCase() === 'R1') hasR1 = true;
        if (s.name.trim().toUpperCase() === 'G') hasG = true;
      }
      return hasG && !hasR1;
    });

    // swap G จาก gNoR1 → r1NoG
    for (const fromEmp of gNoR1) {
      const toEmp = r1NoG.find(e => {
        // ตรวจว่า toEmp ยังไม่มี G
        for (let d = 1; d <= dim; d++) {
          const s = shifts.find(s => s.id === newAssignments[`${e.id}_${fmtD(d)}`]);
          if (s && s.name.trim().toUpperCase() === 'G') return false;
        }
        return true;
      });
      if (!toEmp) continue;

      const gInfo = getShiftDay(fromEmp.id, 'G');
      if (!gInfo) continue;
      const { d: gd, ds: gds, s: gShift } = gInfo;

      // ตรวจว่า toEmp ว่างวันที่มี G
      if (newAssignments[`${toEmp.id}_${gds}`]) continue;
      // rule_1
      const prevDs = fmtD(gd - 1);
      const nextDs = fmtD(gd + 1);
      if (prevDs && newAssignments[`${toEmp.id}_${prevDs}`]) continue;
      if (nextDs && newAssignments[`${toEmp.id}_${nextDs}`]) continue;

      // ชั่วโมงหลัง swap ต้องสมดุล
      const fromH = calcHours(fromEmp.id);
      const toH = calcHours(toEmp.id);
      if (toH > fromH) continue; // ไม่เพิ่มความไม่เท่าเทียม

      // SWAP G!
      doSwap(fromEmp.id, toEmp.id, gds, gShift);
    }

    // ─── PHASE 3f: swap วันของเวรตำแหน่งเดียวกัน ───
    // off_night มีเวร X ต้นเดือน ↔ คนปกติมีเวร X ปลายเดือน (วันหยุด)
    // สลับวันกัน ทำให้ off_night ได้เวรวันหยุดปลายเดือน
    // hours รวมเท่าเดิม ไม่มีใครได้เพิ่ม
    const lateStart = Math.max(1, dim - 6); // 6 วันสุดท้าย
    const earlyEnd = Math.min(14, dim);     // 14 วันแรก

    const MAX_3F_ROUNDS = 8;
    for (let round = 0; round < MAX_3F_ROUNDS; round++) {
      let swapped3f = false;

      // หา off_night ที่ไม่มีเวรวันหยุดปลายเดือน
      const offNightNoLate = offNightEmpsAll.filter(e => {
        for (let d = lateStart; d <= dim; d++) {
          if (isHol(d) && newAssignments[`${e.id}_${fmtD(d)}`]) return false;
        }
        return true;
      });

      for (const offEmp of offNightNoLate) {
        if (swapped3f) break;

        // หาเวรต้นเดือนของ off_night (วัน 1-14)
        for (let d1 = 1; d1 <= earlyEnd; d1++) {
          if (swapped3f) break;
          const ds1 = fmtD(d1);
          const sid1 = newAssignments[`${offEmp.id}_${ds1}`];
          if (!sid1) continue;
          const s1 = shifts.find(s => s.id === sid1);
          if (!s1) continue;
          const u1 = s1.name.trim().toUpperCase();
          // ห้าม swap R2, G, R1, As/4, A/4 ออกจาก off_night
          // และห้าม swap G/R1 ออกจาก normal (เพื่อรักษา G↔R1 pairing)
          if (['R2','G','R1','AS/4','A/4'].includes(u1)) continue;

          // หาคนปกติที่มีเวรตำแหน่งเดียวกัน (u1) ในวันหยุดปลายเดือน
          for (let d2 = lateStart; d2 <= dim; d2++) {
            if (swapped3f) break;
            if (!isHol(d2)) continue;
            const ds2 = fmtD(d2);

            // หาคนปกติที่มีเวร u1 วันที่ d2
            const normalEmp = normalEmpsAll.find(e => {
              const sid2 = newAssignments[`${e.id}_${ds2}`];
              if (!sid2) return false;
              const s2 = shifts.find(s => s.id === sid2);
              if (!s2) return false;
              if (s2.name.trim().toUpperCase() !== u1) return false;
              return true;
            });
            if (!normalEmp) continue;

            const sid2 = newAssignments[`${normalEmp.id}_${ds2}`];
            const s2 = shifts.find(s => s.id === sid2);
            if (!s2) continue;
            // ห้าม swap G/R1 ออกจาก normal ด้วย (รักษา pairing)
            const u2 = s2.name.trim().toUpperCase();
            if (['R2','G','R1','AS/4','A/4'].includes(u2)) continue;

            // ตรวจ rule_1 สำหรับ off_night วันที่ d2
            const prev2 = fmtD(d2 - 1), next2 = fmtD(d2 + 1);
            if (prev2 && newAssignments[`${offEmp.id}_${prev2}`]) continue;
            if (next2 && newAssignments[`${offEmp.id}_${next2}`]) continue;

            // ตรวจ rule_1 สำหรับ normalEmp วันที่ d1
            const prev1 = fmtD(d1 - 1), next1 = fmtD(d1 + 1);
            if (prev1 && newAssignments[`${normalEmp.id}_${prev1}`]) {
              const ps = shifts.find(s => s.id === newAssignments[`${normalEmp.id}_${prev1}`]);
              if (!ps || ps.name.trim().toUpperCase() !== 'R2') continue;
            }
            if (next1 && newAssignments[`${normalEmp.id}_${next1}`]) {
              const ns = shifts.find(s => s.id === newAssignments[`${normalEmp.id}_${next1}`]);
              if (!ns || ns.name.trim().toUpperCase() !== 'R2') continue;
            }

            // ตรวจว่า off ไม่มีเวรวันที่ d2 (ก่อน swap step1)
            if (newAssignments[`${offEmp.id}_${ds2}`]) continue;
            // ตรวจว่า normal ไม่มีเวรวันที่ d1 (นอกจาก d1 ที่จะถูก swap ออก)
            // normalEmp มี ds2 อยู่แล้ว ซึ่งจะถูก swap ออก → OK

            // SWAP วัน! ใช้ doSwap เพื่อ update empStats ด้วย
            doSwap(offEmp.id, normalEmp.id, ds1, s1);
            doSwap(normalEmp.id, offEmp.id, ds2, s2);

            swapped3f = true;
            break;
          }
        }
      }
      if (!swapped3f) break;
    }

    // ─── PHASE 3g: สมดุลชั่วโมงในกลุ่ม off_night ───
    const MAX_3G_ROUNDS = 5;
    for (let round = 0; round < MAX_3G_ROUNDS; round++) {
      let swapped3g = false;
      const offSorted = [...offNightEmpsAll].sort((a,b) => calcHours(b.id) - calcHours(a.id));
      if (offSorted.length < 2) break;
      for (const overEmp of offSorted) {
        if (swapped3g) break;
        const overHours = calcHours(overEmp.id);
        const underEmps = offSorted.filter(e =>
          e.id !== overEmp.id && calcHours(e.id) <= overHours - 8
        ).sort((a,b) => calcHours(a.id) - calcHours(b.id));
        if (underEmps.length === 0) continue;
        for (const underEmp of underEmps) {
          if (swapped3g) break;
          const underHours = calcHours(underEmp.id);
          for (let d = 1; d <= dim; d++) {
            if (swapped3g) break;
            const ds = fmtD(d);
            const sid = newAssignments[`${overEmp.id}_${ds}`];
            if (!sid) continue;
            const s = shifts.find(s => s.id === sid);
            if (!s || getShiftHours(s) !== 4) continue;
            if (s.name.trim().toUpperCase() === 'R2') continue;
            if (newAssignments[`${underEmp.id}_${ds}`]) continue;
            const prevDs = fmtD(d-1), nextDs = fmtD(d+1);
            if (prevDs && newAssignments[`${underEmp.id}_${prevDs}`]) continue;
            if (nextDs && newAssignments[`${underEmp.id}_${nextDs}`]) continue;
            const newUnderHours = underHours + 4;
            if (newUnderHours > MAX_OFF_HOURS) continue;
            if (newUnderHours >= overHours) continue;
            if (getShiftCategory(s) === 'SMC') {
              let smcCount = 0;
              for (let d2 = 1; d2 <= dim; d2++) {
                const s2 = shifts.find(s => s.id === newAssignments[`${underEmp.id}_${fmtD(d2)}`]);
                if (s2 && getShiftCategory(s2) === 'SMC') smcCount++;
              }
              if (smcCount >= CAP['SMC']) continue;
            }
            doSwap(overEmp.id, underEmp.id, ds, s);
            swapped3g = true;
            break;
          }
        }
      }
      if (!swapped3g) break;
    }

    setSchedules(schedules.map(s => s.id === activeSchedule?.id ? { ...s, assignments: newAssignments } : s));
    setTargetNormalDisplay(TARGET_NORMAL);
    setTargetOffNightDisplay(TARGET_OFF_NIGHT);
      return newAssignments;
    }; // end runOnce

    let bestAssignments = null;
    let bestScore = null;
    const isBetter = (n, o) => {
      if (!o) return true;
      if (n.missing !== o.missing) return n.missing < o.missing;
      if (n.nSpread+n.oSpread !== o.nSpread+o.oSpread) return n.nSpread+n.oSpread < o.nSpread+o.oSpread;
      return n.nStd+n.oStd < o.nStd+o.oStd;
    };
    for (let attempt = 0; attempt < MAX_AUTO_RETRY; attempt++) {
      const assignments = runOnce();
      const score = scoreResult(assignments);
      if (isBetter(score, bestScore)) { bestAssignments = assignments; bestScore = score; }
      if (score.isGood) { setRetryCount(attempt + 1); break; }
      setRetryCount(attempt + 1);
    }
    setSchedules(schedules.map(s => s.id === activeSchedule?.id ? { ...s, assignments: bestAssignments } : s));
    setGeneratedScheduleIds(prev => new Set([...prev, activeSchedule.id]));
    setIsGenerating(false);
    }, 50);
  };

  const handleAssignShift = (shiftId) => {
    if (!activeSchedule) return;
    const { empId, dateStr } = assignmentModal;
    const updated = { ...activeSchedule.assignments };
    if (shiftId === null) delete updated[`${empId}_${dateStr}`];
    else updated[`${empId}_${dateStr}`] = shiftId;
    setSchedules(schedules.map(s => s.id === activeSchedule?.id ? { ...s, assignments: updated } : s));
    setAssignmentModal({ isOpen: false, empId: null, dateStr: null });
  };

  // ─── Telemed: อ่าน min ต่อวัน จาก schedule.telemed ───
  const getTelemedMin = (dateStr) => {
    if (!activeSchedule?.telemed) return 0;
    return activeSchedule.telemed[dateStr] ?? 0;
  };

  const handleSetTelemed = (dateStr, val) => {
    if (!activeSchedule) return;
    const updated = { ...(activeSchedule.telemed || {}) };
    if (val === 0) delete updated[dateStr];
    else updated[dateStr] = val;
    setSchedules(schedules.map(s => s.id === activeSchedule?.id ? { ...s, telemed: updated } : s));
  };

  const handleToggleHoliday = (dateStr) => {
    if (!activeSchedule) return;
    const updated = { ...activeSchedule.holidays };
    if (updated[dateStr]) delete updated[dateStr];
    else updated[dateStr] = 'วันหยุดพิเศษ';
    setSchedules(schedules.map(s => s.id === activeSchedule?.id ? { ...s, holidays: updated } : s));
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

    // คำนวณชั่วโมงต่อคน
    const empHours = {};
    employees.forEach(emp => {
      let h = 0;
      monthDates.forEach(d => {
        const s = shifts.find(s => s.id === activeSchedule.assignments[`${emp.id}_${d.dateStr}`]);
        if (s) h += getShiftHours(s);
      });
      empHours[emp.id] = h;
    });

    if (sortByMoney) {
      // เรียงตามกลุ่ม → ชั่วโมงมากไปน้อยในกลุ่ม
      const groupOrder = { normal:1, r2:2, r2_off_night:3, off_night:4, off_special:5 };
      return [...employees].sort((a,b) => {
        const ga = groupOrder[a.group || 'normal'] || 1;
        const gb = groupOrder[b.group || 'normal'] || 1;
        if (ga !== gb) return ga - gb;
        return empHours[b.id] - empHours[a.id]; // มากไปน้อยในกลุ่ม
      });
    }

    // default: เรียงชั่วโมงมากไปน้อย
    return [...employees].sort((a,b) => empHours[b.id] - empHours[a.id]);
  }, [employees, activeSchedule?.assignments, shifts, monthDates, sortByMoney]);

  const activeRules = RULES_LIST.filter(r => rules[r.id]);
  const inactiveRules = RULES_LIST.filter(r => !rules[r.id]);
  const hasR2Group = employees.some(e => e.group === 'r2' || e.group === 'r2_off_night');

  return (
    <div className="flex flex-col h-full w-full">
      {/* Loading overlay */}
      {isGenerating && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm">
          <div className="bg-white rounded-2xl px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            <div className="text-center">
              <div className="text-lg font-bold text-gray-800">กำลังสุ่มเวร...</div>
              <div className="text-sm text-gray-400 mt-1">รอบที่ {retryCount}/40</div>
              <div className="w-48 bg-gray-200 rounded-full h-1.5 mt-2">
                <div className="bg-purple-600 h-1.5 rounded-full transition-all" style={{width:`${(retryCount/40)*100}%`}} />
              </div>
            </div>
          </div>
        </div>
      )}
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
            <button key={sch.id} type="button" data-schedule-id={sch.id} onClick={() => setActiveScheduleId(sch.id)}
              className={`px-3 py-1.5 text-sm font-bold rounded transition-colors ${activeSchedule?.id === sch.id ? 'bg-indigo-600 text-white' : 'bg-transparent text-gray-600 hover:bg-gray-100'}`}>
              {thaiMonths[sch.month]} {sch.year + 543}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleAutoGenerate} disabled={!activeSchedule} data-auto-gen="true"
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-700 active:scale-95 shadow-sm disabled:opacity-40">
            <Wand2 className="w-4 h-4" /> สุ่มเวรอัตโนมัติ
          </button>
          <button type="button" onClick={() => setIsCreateModalOpen(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm">
            <Plus className="w-4 h-4" /> สร้างใหม่
          </button>
        </div>
      </div>

      {/* Rules bar — Collapsible */}
      <div className="mb-3 shrink-0 print-hidden">
        <button type="button" onClick={() => setShowRuleDropdown(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 bg-indigo-50/70 border border-indigo-100 rounded-xl hover:bg-indigo-100/50 transition-colors">
          <div className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-xs font-bold text-indigo-800">กฎการสุ่มเวร</span>
            <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full">{activeRules.length}/{RULES_LIST.length} ข้อ</span>
          </div>
          <span className="text-indigo-400 text-xs">{showRuleDropdown ? '▲ ซ่อน' : '▼ แสดง'}</span>
        </button>
        {showRuleDropdown && (
          <div className="mt-2 px-3 py-2.5 bg-indigo-50/50 border border-indigo-100 rounded-xl">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {activeRules.length === 0 ? <span className="text-xs text-gray-400 italic">ไม่มีเงื่อนไขที่เปิดใช้งาน</span>
                : activeRules.map(r => (
                  <div key={r.id} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white text-gray-700 rounded-lg text-[11px] font-medium border border-gray-200 shadow-sm">
                    <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                    <span className="truncate max-w-[280px]">{r.label}</span>
                    <button type="button" onClick={() => setRules({...rules,[r.id]:false})} className="ml-1 text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                  </div>
                ))}
            </div>
            {inactiveRules.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-indigo-100">
                <span className="text-[10px] text-indigo-400 font-medium self-center">เพิ่มกฎ:</span>
                {inactiveRules.map(r => (
                  <button key={r.id} type="button" onClick={() => setRules({...rules,[r.id]:true})}
                    className="px-2.5 py-1 bg-white border border-dashed border-indigo-300 text-indigo-600 text-[11px] rounded-lg hover:bg-indigo-50 font-medium">
                    + {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      {activeSchedule && (
        <div className="flex justify-end gap-2 shrink-0 items-center mb-3 print-hidden">
          {(() => {
            const dim = new Date(activeSchedule.year, activeSchedule.month+1, 0).getDate();
            // TARGET real-time
            let totalAllHrs = 0;
            for (let d = 1; d <= dim; d++) {
              const ds = fmtDateFor(activeSchedule, d);
              shifts.forEach(s => {
                if (!isApplicableGlobal(s, d, activeSchedule)) return;
                const minToday = s.isTelemed
                  ? (activeSchedule?.telemed?.[ds] ?? 0)
                  : (s.min || 1);
                totalAllHrs += getShiftHours(s) * minToday;
              });
            }
            const activeEmps = employees.filter(e=>!e.onLeave);
            const nNrt = activeEmps.filter(e=>e.group==='normal'||e.group==='r2'||!e.group).length||1;
            const nOrt = activeEmps.filter(e=>['off_night','r2_off_night'].includes(e.group)).length||0;
            const TARGET_N = Math.max(56, Math.round((totalAllHrs + nOrt*16) / (nNrt+nOrt)));
            const TARGET_O = Math.max(40, TARGET_N - 16);
            let actualHrs=0, actualMoney=0;
            employees.forEach(emp=>{ monthDates.forEach(d=>{ const s=shifts.find(s=>s.id===activeSchedule.assignments[`${emp.id}_${d.dateStr}`]); if(s){actualHrs+=getShiftHours(s);actualMoney+=getShiftValue(s);} }); });
            const isOk=actualHrs>=totalAllHrs, hasData=actualHrs>0;
            const calcScore=(emps,sG,sO,stdG,stdO)=>{
              const hrs=emps.filter(e=>!e.onLeave).map(emp=>{let h=0;monthDates.forEach(d=>{const s=shifts.find(s=>s.id===activeSchedule.assignments?.[`${emp.id}_${d.dateStr}`]);if(s)h+=getShiftHours(s);});return h;}).filter(h=>h>0);
              if(hrs.length<2)return null;
              const sp=Math.max(...hrs)-Math.min(...hrs),m=hrs.reduce((a,b)=>a+b,0)/hrs.length,st=Math.sqrt(hrs.reduce((a,b)=>a+(b-m)**2,0)/hrs.length);
              let icon,color;
              if(sp<=sG&&st<=stdG){icon='✅';color='text-green-600';}else if(sp<=sO&&st<=stdO){icon='⚠️';color='text-yellow-600';}else{icon='❌';color='text-red-600';}
              return{sp,st:st.toFixed(1),icon,color};
            };
            const nScore=hasData?calcScore(employees.filter(e=>e.group==='normal'||e.group==='r2'||!e.group),8,10,2.5,3.0):null;
            const oScore=hasData?calcScore(employees.filter(e=>['off_night','r2_off_night'].includes(e.group)),4,6,2.0,2.5):null;
            const missing=[], over=[];
            if(hasData){
              for(let d=1;d<=dim;d++){
                const ds=fmtDateFor(activeSchedule,d);
                shifts.forEach(s=>{
                  if(!isApplicableGlobal(s,d,activeSchedule))return;
                  const minToday = s.isTelemed
                    ? (activeSchedule?.telemed?.[ds] ?? 0)
                    : (s.min||1);
                  if (minToday === 0) return; // Telemed วันนี้ไม่มี → ข้าม
                  const filled=employees.filter(e=>activeSchedule.assignments?.[`${e.id}_${ds}`]===s.id).length;
                  if(filled<minToday)missing.push({day:d,shiftName:s.name,shiftColor:s.color});
                  if(filled>minToday)over.push({day:d,shiftName:s.name,shiftColor:s.color,reason:`เกิน(${filled}/${minToday})`});
                });
              }
              employees.forEach(emp=>{
                monthDates.forEach(({dateStr,dateNum})=>{
                  const sid=activeSchedule.assignments?.[`${emp.id}_${dateStr}`];if(!sid)return;
                  const s=shifts.find(s=>s.id===sid);if(!s)return;
                  const g=emp.group||'normal';
                  if(g==='off_special'&&isShiftBannedForOffSpecial(s))over.push({day:dateNum,shiftName:s.name,shiftColor:s.color,reason:`${emp.name}(off_special)`});
                  if(['off_night','r2_off_night','off_special'].includes(g)&&getShiftCategory(s)==='ดึก')over.push({day:dateNum,shiftName:s.name,shiftColor:s.color,reason:`${emp.name}(งดดึก)`});
                  if(!isApplicableGlobal(s,dateNum,activeSchedule))over.push({day:dateNum,shiftName:s.name,shiftColor:s.color,reason:`${emp.name}(ผิดวัน)`});
                });
              });
            }
            return (
              <div className="mr-auto flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                  <span className="text-gray-500">🎯</span>
                  <span className="font-bold text-indigo-600">{TARGET_N}h</span>
                  <span className="text-gray-300">|</span>
                  <span className="font-bold text-gray-400">{TARGET_O}h</span>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-bold ${!hasData?'bg-gray-50 text-gray-400 border border-gray-200':isOk?'bg-green-50 text-green-700 border border-green-200':'bg-red-50 text-red-600 border border-red-200'}`}>
                  📊 {hasData?`${actualHrs}/${totalAllHrs}h ${isOk?'✅':`⚠️ ขาด ${totalAllHrs-actualHrs}h`}`:`${totalAllHrs}h`}
                </div>
                <div className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-bold text-emerald-700">💰 {actualMoney.toLocaleString()} บ.</div>
                {hasData&&missing.length===0&&over.length===0&&<div className="px-2.5 py-1.5 bg-green-50 border border-green-200 rounded-lg text-sm font-bold text-green-700">✅ เวรครบ</div>}
                {hasData&&missing.length>0&&(<div className="flex items-center gap-1.5 flex-wrap"><span className="text-sm font-bold text-red-600">❌ ขาด {missing.length}:</span>{missing.map((m,i)=><span key={i} className="px-2 py-0.5 rounded-md text-white text-xs font-bold" style={{backgroundColor:m.shiftColor}}>วัน {m.day}·{m.shiftName}</span>)}</div>)}
                {hasData&&over.length>0&&(<div className="flex items-center gap-1.5 flex-wrap"><span className="text-sm font-bold text-orange-600">⚠️ เกิน/ผิด {over.length}:</span>{over.map((o,i)=><span key={i} className="px-2 py-0.5 rounded-md text-white text-xs font-bold ring-2 ring-orange-400" style={{backgroundColor:o.shiftColor}}>วัน {o.day}·{o.shiftName}·{o.reason}</span>)}</div>)}
                {nScore&&<div className={`px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold ${nScore.color}`}>⚖️ ปกติ {nScore.icon} {nScore.sp}h</div>}
                {oScore&&<div className={`px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold ${oScore.color}`}>⚖️ off {oScore.icon} {oScore.sp}h</div>}
              </div>
            );
          })()}
          <button type="button" onClick={handleDeleteSchedule}
            className="text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-red-100 mr-2">
            <Trash2 className="w-3.5 h-3.5" /> ลบตารางนี้
          </button>
          <button type="button" onClick={() => setTelemedModal(true)}
            className="text-cyan-700 bg-cyan-50 border border-cyan-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-cyan-100">
            <CalendarDays className="w-3.5 h-3.5" /> ตั้งค่า Telemed
          </button>
          <button type="button" onClick={() => setSortByMoney(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${sortByMoney ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
            <span>⇅</span> {sortByMoney ? 'เรียงตามกลุ่ม ✓' : 'เรียงตามกลุ่ม'}
          </button>
          <button type="button" onClick={handleExportExcel}
            className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button type="button" onClick={() => {
            const prev = document.title;
            document.title = `ตารางเวร เภสัชกร ${thaiMonths[activeSchedule.month]} ${activeSchedule.year + 543}`;
            window.print();
            document.title = prev;
          }}
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
            <div className="hidden print:block text-center font-bold text-sm mb-2 print:hidden">
              ตารางปฏิบัติงาน เภสัชกร ประจำเดือน {thaiMonths[activeSchedule.month]} พ.ศ. {activeSchedule.year + 543}
            </div>
            <table className="w-full border-collapse text-center table-fixed min-w-[1300px] print:min-w-0">
              <thead>
                <tr className="bg-slate-50 sticky top-0 z-20 shadow-sm">
                  <th className="p-2 border-b border-r border-gray-200 w-[130px] text-sm text-gray-700">พนักงาน</th>
                  {monthDates.map(d => (
                    <th key={d.dateStr} onClick={() => handleToggleHoliday(d.dateStr)}
                      className={`p-0 border-b border-r border-gray-200 w-[30px] cursor-pointer hover:bg-red-100 ${d.isHoliday ? 'bg-red-100 text-red-700 font-bold' : 'text-slate-600'}`}>
                      <div className="text-[10px] leading-tight pt-1">{d.dayStr}</div>
                      <div className="text-xs pb-1">{d.dateNum}</div>
                    </th>
                  ))}
                  {[['เช้า','bg-blue-50/50','text-blue-700'],['บ่าย','bg-orange-50/50','text-orange-700'],['ดึก','bg-purple-50/50','text-purple-700'],['As/4','bg-teal-50/50','text-teal-700'],['A/4','bg-indigo-50/50','text-indigo-700'],['SMC','bg-rose-50/50','text-rose-700'],['4o','bg-yellow-50/50','text-yellow-700'],['2o','bg-lime-50/50','text-lime-700'],['4T','bg-cyan-50/50','text-cyan-700'],['ช.ม.','bg-gray-100','text-gray-700']].map(([label,bg,tc]) => (
                    <th key={label} className={`p-1 border-b border-r border-gray-200 w-[30px] text-[10px] font-bold ${bg} ${tc}`}>{label}</th>
                  ))}
                  <th className="p-2 border-b border-gray-200 w-[70px] text-emerald-700 text-sm font-bold">รวม(บ.)</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map(emp => {
                  let totalMoney = 0, totalHours = 0;
                  let cnt = { เช้า:0, บ่าย:0, ดึก:0, 'As/4':0, 'A/4':0, SMC:0, '4o':0, '2o':0, '4T':0 };
                  // pre-calculate cnt ก่อน render เพื่อใช้ highlight
                  monthDates.forEach(d => {
                    const s = shifts.find(s => s.id === activeSchedule.assignments[`${emp.id}_${d.dateStr}`]);
                    if (s) {
                      totalMoney += getShiftValue(s);
                      totalHours += getShiftHours(s);
                      const c = getShiftCategory(s);
                      if (s.isTelemed) cnt['4T']++;
                      else if (cnt[c] !== undefined) cnt[c]++;
                    }
                  });
                  const grp = PHARMACIST_GROUPS.find(g => g.id === (emp.group || 'normal'));
                  const isOffNight = ['off_night','r2_off_night','off_special'].includes(emp.group);
                  const isR2Group = ['r2','r2_off_night'].includes(emp.group);
                  const isOnLeave = !!emp.onLeave;
                  const rowBg = isOnLeave ? 'bg-gray-50 opacity-40' : isOffNight ? 'bg-gray-100/70' : isR2Group ? 'bg-green-50/60' : '';
                  const empCanNight = !isOffNight;
                  const empTarget = empCanNight ? TARGET_NORMAL_DISPLAY : TARGET_OFF_NIGHT_DISPLAY;
                  const aftCount = cnt['บ่าย'];
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
                        const isAftOver = sData && getShiftCategory(sData) === 'บ่าย' && aftCount >= 3;
                        return (
                          <td key={d.dateStr} onClick={() => setAssignmentModal({ isOpen: true, empId: emp.id, dateStr: d.dateStr })}
                            className={`p-0 border-b border-r border-gray-200 cursor-pointer relative ${d.isHoliday ? 'bg-red-100/50' : ''}`}>
                            {sData && <div className={`absolute inset-[2px] rounded-[3px] text-[9px] flex items-center justify-center font-bold text-white shadow-sm ${isAftOver ? 'ring-2 ring-red-500 ring-offset-1' : ''}`} style={{ backgroundColor: isAftOver ? '#ef4444' : sData.color }}>{sData.name}</div>}
                          </td>
                        );
                      })}
                      {[cnt['เช้า'],cnt['บ่าย'],cnt['ดึก'],cnt['As/4'],cnt['A/4'],cnt['SMC'],cnt['4o'],cnt['2o'],cnt['4T']].map((v,i) => (
                        <td key={i} className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-gray-700">{v > 0 ? v : '-'}</td>
                      ))}
                      <td className={`px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold
                        ${totalHours > empTarget + 4 ? 'bg-red-100 text-red-700' :
                          totalHours > empTarget ? 'bg-orange-50 text-orange-600' :
                          totalHours >= empTarget - 2 ? 'bg-green-50 text-green-700' : 'text-gray-700'}`}>
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

      {/* Telemed Modal */}
      {telemedModal && activeSchedule && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
          onClick={() => setTelemedModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">ตั้งค่า Telemed</h3>
              <button type="button" onClick={() => setTelemedModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-gray-400 mb-4">กำหนดจำนวนเภสัชกรที่ต้องการต่อวัน (0 = ไม่มี Telemed วันนั้น)</p>
            {(() => {
              const telemedShift = shifts.find(s => s.isTelemed);
              if (!telemedShift) return (
                <div className="text-center py-8 text-gray-400">
                  <p className="font-medium">ยังไม่มีเวร Telemed</p>
                  <p className="text-xs mt-1">กรุณาไปแท็บ <b>ประเภทเวร</b> → เพิ่มเวร → เปิด "เวร Telemed"</p>
                </div>
              );
              return (
                <div className="overflow-y-auto flex-1">
                  <div className="grid grid-cols-5 gap-2">
                    {monthDates.map(({ dateNum, dateStr, dayStr, isHoliday }) => (
                      <div key={dateStr} className={`rounded-xl p-2 border text-center ${isHoliday ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="text-[10px] text-gray-400">{dayStr}</div>
                        <div className="text-sm font-bold text-gray-700 mb-1.5">{dateNum}</div>
                        <div className="flex justify-center gap-1">
                          {[0,1,2].map(v => {
                            const cur = getTelemedMin(dateStr);
                            return (
                              <button key={v} type="button"
                                onClick={() => handleSetTelemed(dateStr, v)}
                                className={`w-6 h-6 rounded-md text-xs font-bold transition-all ${
                                  cur === v
                                    ? 'bg-cyan-500 text-white shadow-sm'
                                    : 'bg-white text-gray-400 border border-gray-200 hover:border-cyan-300'
                                }`}>
                                {v}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-400">
                รวม Telemed เดือนนี้: <b className="text-cyan-600">
                  {monthDates.reduce((sum, d) => sum + getTelemedMin(d.dateStr), 0)} slot
                </b>
              </div>
              <button type="button" onClick={() => setTelemedModal(false)}
                className="px-5 py-2 bg-cyan-600 text-white rounded-xl text-sm font-bold hover:bg-cyan-700">
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

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
  const [editPwdModal, setEditPwdModal] = useState({ isOpen: false, emp: null });
  const [editPwdInput, setEditPwdInput] = useState('');
  const [editPwdError, setEditPwdError] = useState('');
  const EDIT_PASSWORD = 'MSMSRX';

  const handleEditClick = (emp) => {
    setEditPwdModal({ isOpen: true, emp });
    setEditPwdInput('');
    setEditPwdError('');
  };

  const handleEditConfirm = () => {
    if (editPwdInput === EDIT_PASSWORD) {
      openEdit(editPwdModal.emp);
      setIsModalOpen(true);
      setEditPwdModal({ isOpen: false, emp: null });
    } else {
      setEditPwdError('รหัสผ่านไม่ถูกต้อง');
      setEditPwdInput('');
    }
  };

  const handleSave = () => {
    if (!formData.name) return alert('กรุณากรอกชื่อ');
    if (formData.id) setEmployees(employees.map(e => e.id === formData.id ? formData : e));
    else setEmployees([...employees, { ...formData, id: Date.now().toString() }]);
    setIsModalOpen(false);
  };

  const openAdd = () => setFormData({ name: '', group: 'normal', offShifts: [], specificShifts: [] });
  const openEdit = (emp) => setFormData({ ...emp, group: emp.group || 'normal', offShifts: emp.offShifts || [], specificShifts: emp.specificShifts || [] });

  const displayed = filterGroup === 'all' ? employees : employees.filter(e => (e.group || 'normal') === filterGroup);

  // จัดกลุ่มเวรตามหมวด dynamic จาก Firebase — รองรับเวรใหม่อัตโนมัติ
  const shiftGroups = [
    { label: 'เวรบ่าย', cats: ['บ่าย'] },
    { label: 'เวรดึก', cats: ['ดึก'] },
    { label: 'เวรเช้า', cats: ['เช้า','As/4','A/4'] },
    { label: 'เวร 4o/SMC/2o', cats: ['4o','SMC','2o','อื่นๆ'] },
  ];

  const renderShiftCheckboxes = (section) => {
    const isSpecific = section === 'specific';
    const selectedIds = isSpecific ? (formData.specificShifts || []) : (formData.offShifts || []);
    const otherIds = isSpecific ? (formData.offShifts || []) : (formData.specificShifts || []);

    return shiftGroups.map(grp => {
      const grpShifts = shifts.filter(s => grp.cats.includes(getShiftCategory(s)));
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
              <th className="p-4 font-bold w-[15%]">กลุ่ม</th>
              <th className="p-4 font-bold w-[8%] text-center">พักงาน</th>
              <th className="p-4 font-bold w-[18%]">เวรเฉพาะ (ลงแค่เวรนี้)</th>
              <th className="p-4 font-bold w-[18%]">งดรับเวร</th>
              <th className="p-4 font-bold text-center w-[9%]">จัดการ</th>
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
                  <td className="p-4 text-center">
                    <button type="button"
                      onClick={() => setEmployees(employees.map(e => e.id === emp.id ? { ...e, onLeave: !e.onLeave } : e))}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${emp.onLeave ? 'bg-orange-100 text-orange-700 border border-orange-300' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                      {emp.onLeave ? '⏸ พักงาน' : '-'}
                    </button>
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
                    <button type="button" onClick={() => handleEditClick(emp)} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg mr-1"><Edit2 className="w-4 h-4" /></button>
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
      {/* Password modal */}
      {editPwdModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
          onClick={() => setEditPwdModal({ isOpen: false, emp: null })}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Edit2 className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">ยืนยันการแก้ไข</h3>
              <p className="text-xs text-gray-500 mt-1">{editPwdModal.emp?.name}</p>
            </div>
            <input
              type="password"
              value={editPwdInput}
              onChange={e => { setEditPwdInput(e.target.value); setEditPwdError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleEditConfirm()}
              placeholder="รหัสผ่าน"
              autoFocus
              className={`w-full border rounded-xl px-4 py-2.5 text-sm text-center tracking-widest mb-2 outline-none focus:ring-2 focus:ring-blue-500 ${editPwdError ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
            />
            {editPwdError && <p className="text-xs text-red-500 text-center mb-2">{editPwdError}</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setEditPwdModal({ isOpen: false, emp: null })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50">
                ยกเลิก
              </button>
              <button type="button" onClick={handleEditConfirm}
                disabled={!editPwdInput}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                ยืนยัน
              </button>
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

  // ─── Password modal state ───
  const [pwdModal, setPwdModal] = useState({ isOpen: false, action: null, payload: null });
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState('');
  const EDIT_PASSWORD = 'MSMSRX';

  const requirePassword = (action, payload = null) => {
    setPwdModal({ isOpen: true, action, payload });
    setPwdInput('');
    setPwdError('');
  };

  const handlePwdConfirm = () => {
    if (pwdInput !== EDIT_PASSWORD) {
      setPwdError('รหัสผ่านไม่ถูกต้อง');
      setPwdInput('');
      return;
    }
    const { action, payload } = pwdModal;
    setPwdModal({ isOpen: false, action: null, payload: null });

    if (action === 'add') {
      setFormData({ name: '', color: '#3b82f6', start: '', end: '', min: 1, allowedDays: 'all', category: '' });
      setIsModalOpen(true);
    } else if (action === 'edit') {
      setFormData(payload);
      setIsModalOpen(true);
    } else if (action === 'delete') {
      setShifts(shifts.filter(x => x.id !== payload.id));
    }
  };

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
    { value: 'SMC', label: 'SMC (4s1, 4s2, ... ทุกตัว)' },
    { value: '4o', label: '4o' },
    { value: '2o', label: '2o' },
    { value: 'อื่นๆ', label: 'อื่นๆ' },
  ];

  const dayLabels = { all:'ทุกวัน', weekdays:'วันธรรมดา (จ-ศ)', weekends_holidays:'วันหยุด (ส-อา+นักขัตฤกษ์)', saturdays_only:'วันเสาร์', mon_tue_only:'จ-อ (ทำการ)', holidays_except_saturday:'วันหยุดนักขัตฤกษ์ (ยกเว้นเสาร์)', first_day_of_holidays:'วันแรกของช่วงหยุด (T2)' };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">จัดการประเภทเวร (เภสัชกร)</h2>
        <button type="button" onClick={() => requirePassword('add')}
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
                <button type="button" onClick={() => requirePassword('edit', s)} className="text-blue-500 bg-blue-50 p-1.5 rounded-lg hover:bg-blue-100"><Edit2 className="w-4 h-4" /></button>
                <button type="button" onClick={() => requirePassword('delete', s)} className="text-red-500 bg-red-50 p-1.5 rounded-lg hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>
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

      {/* Add/Edit Modal */}
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
              <div className={formData.isTelemed ? 'opacity-40 pointer-events-none' : ''}>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  จำนวนคนต้องการ / วัน
                  {formData.isTelemed && <span className="ml-2 text-xs font-normal text-gray-400">(ไม่ใช้)</span>}
                </label>
                <input type="number" min="1" className="w-full border border-gray-300 rounded-xl p-3 outline-none bg-gray-50"
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
              <div className={formData.isTelemed ? 'opacity-40 pointer-events-none' : ''}>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">
                  เงื่อนไขวันที่จัดได้
                  {formData.isTelemed && <span className="ml-2 text-xs font-normal text-gray-400">(ไม่ใช้)</span>}
                </label>
                <select className="w-full border border-gray-300 rounded-xl p-3 outline-none bg-gray-50"
                  value={formData.allowedDays} onChange={e => setFormData({ ...formData, allowedDays: e.target.value })}>
                  {Object.entries(dayLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-cyan-200 bg-cyan-50/50 hover:bg-cyan-50">
                  <input type="checkbox" checked={!!formData.isTelemed}
                    onChange={e => setFormData({ ...formData, isTelemed: e.target.checked })}
                    className="w-4 h-4 accent-cyan-600" />
                  <div>
                    <div className="text-sm font-bold text-cyan-800">เวร Telemed</div>
                    <div className="text-xs text-cyan-600">จำนวนคนต่อวันจะถูกกำหนดจากหน้าตารางเวร ไม่ใช้ค่า min ด้านบน</div>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-8 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">ยกเลิก</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md">บันทึกเวร</button>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {pwdModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm"
          onClick={() => setPwdModal({ isOpen: false, action: null, payload: null })}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                {pwdModal.action === 'delete'
                  ? <Trash2 className="w-5 h-5 text-red-500" />
                  : <Edit2 className="w-5 h-5 text-blue-600" />}
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {pwdModal.action === 'add' ? 'เพิ่มเวรใหม่'
                  : pwdModal.action === 'edit' ? 'แก้ไขเวร'
                  : 'ลบเวร'}
              </h3>
              {pwdModal.payload?.name && (
                <p className="text-xs text-gray-500 mt-1">{pwdModal.payload.name}</p>
              )}
            </div>
            <input
              type="password"
              value={pwdInput}
              onChange={e => { setPwdInput(e.target.value); setPwdError(''); }}
              onKeyDown={e => e.key === 'Enter' && handlePwdConfirm()}
              placeholder="รหัสผ่าน"
              autoFocus
              className={`w-full border rounded-xl px-4 py-2.5 text-sm text-center tracking-widest mb-2 outline-none focus:ring-2 focus:ring-blue-500 ${pwdError ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
            />
            {pwdError && <p className="text-xs text-red-500 text-center mb-2">{pwdError}</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setPwdModal({ isOpen: false, action: null, payload: null })}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50">
                ยกเลิก
              </button>
              <button type="button" onClick={handlePwdConfirm}
                disabled={!pwdInput}
                className={`flex-1 px-4 py-2 text-white rounded-xl text-sm font-medium disabled:opacity-50 ${pwdModal.action === 'delete' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
                ยืนยัน
              </button>
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

// ─── isApplicable module-level — ใช้ทุกที่ แก้ที่เดียว ───
function isApplicableGlobal(shift, d, schedule) {
  if (!schedule) return false;
  const dow = new Date(schedule.year, schedule.month, d).getDay();
  const isSat = dow === 6;
  const ds = fmtDateFor(schedule, d);
  const hol = dow === 0 || dow === 6 || !!(schedule.holidays?.[ds]);
  const a = shift.allowedDays || 'all';
  if (a === 'all') return true;
  if (a === 'weekdays') return !hol;
  if (a === 'weekends_holidays') return hol;
  if (a === 'saturdays_only') return isSat;
  if (a === 'mon_tue_only') return [1,2].includes(dow) && !hol;
  if (a === 'holidays_except_saturday') return hol && !isSat;
  if (a === 'first_day_of_holidays') {
    if (!hol) return false;
    const pd = d - 1;
    const pDow = pd >= 1 ? new Date(schedule.year, schedule.month, pd).getDay() : -1;
    const pDs = fmtDateFor(schedule, pd);
    const pHol = pDow === 0 || pDow === 6 || !!(schedule.holidays?.[pDs]);
    return d === 1 || !pHol;
  }
  return true;
}
