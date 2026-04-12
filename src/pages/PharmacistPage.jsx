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
import { db } from '../firebase'; // ชี้ไปที่ไฟล์ firebase.js ของคุณ

// --- Custom Hook สำหรับจัดการ Firebase Sync (แทน Local Storage) ---
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

// ==========================================
// ฟังก์ชันคำนวณมูลค่าเวร
// ==========================================
const getShiftValue = (shift) => {
  if (!shift || !shift.name) return 0;
  const name = shift.name.trim();

  if (['4s1', '4s2', '4s3', '4s4'].includes(name.toLowerCase())) return 720;
  if (['as1', 'as/4'].includes(name.toLowerCase())) return 1840;

  if (!shift.start || !shift.end) return 0;
  const [h1, m1] = shift.start.split(':').map(Number);
  const [h2, m2] = shift.end.split(':').map(Number);
  let hrs = h2 - h1 + (m2 - m1) / 60;
  if (hrs < 0) hrs += 24;
  return hrs * 100;
};

// ==========================================
// ฟังก์ชันคำนวณชั่วโมงการทำงาน
// ==========================================
const getShiftHours = (shift) => {
  if (!shift || !shift.start || !shift.end) return 0;
  const [h1, m1] = shift.start.split(':').map(Number);
  const [h2, m2] = shift.end.split(':').map(Number);
  let hrs = h2 - h1 + (m2 - m1) / 60;
  if (hrs < 0) hrs += 24;
  return hrs;
};

// ==========================================
// ฟังก์ชันจัดหมวดหมู่เวร
// ==========================================
const getShiftCategory = (shift) => {
  if (!shift || !shift.name) return 'อื่นๆ';

  const rawName = shift.name.trim();
  const nameUpper = rawName.toUpperCase();
  const nameLower = rawName.toLowerCase();

  if (nameUpper === 'A') return 'A';

  const morningShifts = ['B', 'C', 'D', 'E', 'F', 'G', 'R1', 'R2', 'T1', 'T2'];
  if (morningShifts.includes(nameUpper)) return 'เช้า';

  const afternoonShifts = ['บI', 'บR', 'บE', 'บย', 'บ'];
  if (afternoonShifts.includes(nameUpper)) return 'บ่าย';

  const nightShifts = ['ดI', 'ดE', 'ดก', 'ด'];
  if (nightShifts.includes(nameUpper)) return 'ดึก';

  if (nameUpper === 'AS1' || nameUpper === 'AS/4') return 'As/4';

  const smcShifts = ['4s1', '4s2', '4s3', '4s4'];
  if (smcShifts.includes(nameLower)) return 'SMC';

  if (nameUpper === '4O' || nameUpper === '40') return '4o';
  if (nameUpper === '2O' || nameUpper === '20') return '2o';

  return 'อื่นๆ';
};

// ==========================================
// ข้อมูลตั้งต้นสำหรับเงื่อนไข (กฎใหม่ 8 ข้อ)
// ==========================================
const CATEGORIZED_RULES = {
  pharmacist: {
    label: 'เภสัชกร',
    rules: [
      { id: 'rule_1', label: '1. เวรต้องไม่ติดกัน 2 วัน' },
      { id: 'rule_2', label: '2. เวรบ่ายห้ามซ้ำชื่อ และต้องได้ บe เสมอ ในคนที่ได้บ่าย >=2 เวร' },
      { id: 'rule_3', label: '3. คนที่มี R1 จะมีเวรตัว G ร่วมด้วยเสมอ' },
      { id: 'rule_4', label: '4. คนที่มี R1 จะไม่มีเวรตัว T1 และ T2' },
      { id: 'rule_5', label: '5. คนที่มี T1 หรือ T2 จะไม่มี R1' },
      { id: 'rule_6', label: '6. เวร As/4 หรือ A มีได้แค่คนละ 1 เวร/เดือน (เวรใดเวรหนึ่ง)' },
      { id: 'rule_7', label: '7. เวรประเภทต่างๆ กระจายเท่ากัน และเวรเช้าห้ามซ้ำตำแหน่ง' },
      { id: 'rule_8', label: '8. คนงดรับดึก จะมีชั่วโมงน้อยกว่าคนรับดึก 12-16 ชม.' },
    ],
  },
};

export default function PharmacistPage() {
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
          @page { size: A4 landscape; margin: 3mm; }
          html, body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; zoom: 0.82; }
          .print-hidden { display: none !important; }
          main { padding: 0 !important; }
          .overflow-auto, .custom-scrollbar { overflow: visible !important; }
          
          table { width: 100% !important; max-width: 100% !important; border-collapse: collapse; table-layout: fixed; }
          tr { page-break-inside: avoid; }
          .min-w-\[1300px\] { min-width: 0px !important; }
          th.w-\[120px\] { width: 70px !important; } 
          th.w-\[30px\] { width: 22px !important; }  
          th.w-\[70px\] { width: 45px !important; }  
          th, td { padding: 1px 0px !important; font-size: 7.5px !important; word-wrap: break-word; overflow: hidden; }
          .text-xs { font-size: 7px !important; line-height: 1 !important; }
          .text-\[11px\] { font-size: 7px !important; }
          .text-\[10px\] { font-size: 6px !important; }
          .text-\[9px\] { font-size: 6px !important; }
          .h-8 { height: auto !important; }
        }
      `}</style>

      {/* Header พร้อมปุ่มย้อนกลับ */}
      <header className="bg-white shadow-sm px-4 py-2 flex justify-between items-center z-20 relative print-hidden">
        <div className="flex items-center gap-4 text-indigo-600">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> กลับหน้าหลัก
          </button>
          <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
            <Calendar className="w-5 h-5" />
            <h1 className="text-lg font-bold">ตารางเวร: เภสัชกร</h1>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
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
// 1. Component: จัดการตารางเวร (เภสัชกร)
// ==========================================
function ScheduleManager() {
  const [employeesRaw] = useFirebaseSync('ph_employees', []);
  const [shiftsRaw] = useFirebaseSync('ph_shift_types', []);
  const [schedulesRaw, setSchedules] = useFirebaseSync('ph_schedules', []);
  const [activeScheduleId, setActiveScheduleId] = useFirebaseSync('ph_active_schedule', null);

  // ป้องกันค่า Undefined ทำแอปพัง
  const employees = Array.isArray(employeesRaw) ? employeesRaw : [];
  const shifts = Array.isArray(shiftsRaw) ? shiftsRaw : [];
  const schedules = Array.isArray(schedulesRaw) ? schedulesRaw : [];

  // รวมค่ากฎเก่า(ถ้ามี) เข้ากับกฎใหม่ทั้งหมด กันคีย์พัง
  const defaultRules = { rule_1: true, rule_2: true, rule_3: true, rule_4: true, rule_5: true, rule_6: true, rule_7: true, rule_8: true };
  const [rawRules, setRawRules] = useFirebaseSync('ph_rules', defaultRules);
  const rules = { ...defaultRules, ...(rawRules || {}) };

  const setRules = (newRules) => {
    setRawRules(newRules);
  };

  const [selectedRuleRole] = useState('pharmacist');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createMonth, setCreateMonth] = useState(new Date().getMonth());
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [assignmentModal, setAssignmentModal] = useState({ isOpen: false, empId: null, dateStr: null });
  const [showRuleDropdown, setShowRuleDropdown] = useState(false);

  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const thaiDays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

  const activeSchedule = schedules.find((s) => s.id === activeScheduleId);

  const handleCreateSchedule = () => {
    const newId = `${createYear}-${createMonth}`;
    if (schedules.find((s) => s.id === newId)) return alert('มีตารางของเดือนนี้อยู่แล้ว!');
    const newSchedule = { id: newId, year: createYear, month: createMonth, assignments: {}, holidays: {} };
    setSchedules([...schedules, newSchedule]);
    setActiveScheduleId(newId);
    setIsCreateModalOpen(false);
  };

  const handleDeleteSchedule = () => {
    if (!activeSchedule) return;
    if (confirm(`ต้องการลบตารางเดือน ${thaiMonths[activeSchedule.month]} ${activeSchedule.year + 543} ใช่หรือไม่?`)) {
      const updated = schedules.filter((s) => s.id !== activeScheduleId);
      setSchedules(updated);
      setActiveScheduleId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleExportExcel = () => {
    if (!activeSchedule) return;
    const daysInMonth = new Date(activeSchedule.year, activeSchedule.month + 1, 0).getDate();
    let csvContent = '\uFEFFพนักงาน,หมวดหมู่,';
    for (let i = 1; i <= daysInMonth; i++) csvContent += i + ',';
    csvContent += 'เช้า,บ่าย,ดึก,As/4,A,SMC,4o,2o,รวมชั่วโมง,รวมเงิน\n'; 

    employees.forEach((emp) => {
      let row = [`"${emp.name}"`, `"เภสัชกร"`];
      let totalMoney = 0; let totalHours = 0; 
      let counts = { A: 0, เช้า: 0, บ่าย: 0, ดึก: 0, 'As/4': 0, SMC: 0, '4o': 0, '2o': 0 };

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${activeSchedule.year}-${String(activeSchedule.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const sData = shifts.find((s) => s.id === activeSchedule.assignments[`${emp.id}_${dateStr}`]);
        row.push(sData ? `"${sData.name}"` : '');
        if (sData) {
          totalMoney += getShiftValue(sData);
          totalHours += getShiftHours(sData); 
          const cat = getShiftCategory(sData);
          if (counts[cat] !== undefined) counts[cat]++;
        }
      }
      row.push(counts['เช้า'], counts['บ่าย'], counts['ดึก'], counts['As/4'], counts['A'], counts['SMC'], counts['4o'], counts['2o'], totalHours, totalMoney);
      csvContent += row.join(',') + '\n';
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    link.download = `ตารางเวร_${thaiMonths[activeSchedule.month]}.csv`;
    link.click();
  };

  const handleAutoGenerate = () => {
    if (!activeSchedule) return;
    const daysInMonth = new Date(activeSchedule.year, activeSchedule.month + 1, 0).getDate();
    const newAssignments = {};
    const empStats = {};

    // ดึงรายชื่อเวรดึก เพื่อนำไปตรวจสอบคนที่งดรับเวรดึก
    const nightShiftIds = shifts.filter(s => getShiftCategory(s) === 'ดึก').map(s => s.id);

    employees.forEach((e) => {
      // เช็คว่าพนักงานคนนี้ตั้งค่างดเวรดึกหรือไม่
      let isOptOutNight = false;
      if (nightShiftIds.length > 0) {
        if (e.specificShifts && e.specificShifts.length > 0) {
          isOptOutNight = !nightShiftIds.some(id => e.specificShifts.includes(id));
        } else if (e.offShifts && e.offShifts.length > 0) {
          isOptOutNight = nightShiftIds.every(id => e.offShifts.includes(id));
        }
      }

      empStats[e.id] = {
        money: 0, hours: 0, totalShifts: 0, counts: {},
        catCounts: { A: 0, เช้า: 0, บ่าย: 0, ดึก: 0, SMC: 0, 'As/4': 0, '4o': 0, '2o': 0, อื่นๆ: 0 },
        countA_As4: 0,
        assignedUniqueMornings: new Set(),
        assignedNights: new Set(),
        assignedAfternoons: new Set(),
        afternoonCount: 0,
        hasBe: false,
        hasR1: false,
        hasG: false,
        hasT1_T2: false,
        isOptOutNight: isOptOutNight,
      };
    });

    const assignShiftsForPass = (shiftsToProcess, isFillerPass) => {
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${activeSchedule.year}-${String(activeSchedule.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const prevDateStr = `${activeSchedule.year}-${String(activeSchedule.month + 1).padStart(2, '0')}-${String(d - 1).padStart(2, '0')}`;
        const nextDateStr = `${activeSchedule.year}-${String(activeSchedule.month + 1).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`;

        const dayOfWeek = new Date(activeSchedule.year, activeSchedule.month, d).getDay();
        const isSaturday = dayOfWeek === 6;
        const isHoliday = dayOfWeek === 0 || dayOfWeek === 6 || !!activeSchedule.holidays[dateStr];

        shiftsToProcess.forEach((shift) => {
          const allowed = shift.allowedDays || 'all';
          if (allowed === 'weekdays' && isHoliday) return;
          if (allowed === 'weekends_holidays' && !isHoliday) return;
          if (allowed === 'saturdays_only' && !isSaturday) return;
          if (allowed === 'mon_tue_only' && (![1, 2].includes(dayOfWeek) || isHoliday)) return;
          if (allowed === 'holidays_except_saturday' && (!isHoliday || isSaturday)) return;

          if (allowed === 'first_day_of_holidays') {
            if (!isHoliday) return; 
            const prevDate = new Date(activeSchedule.year, activeSchedule.month, d - 1);
            const prevDateString = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
            let isPrevHoliday = prevDate.getDay() === 0 || prevDate.getDay() === 6;

            if (activeSchedule.month === prevDate.getMonth()) {
              if (activeSchedule.holidays[prevDateString]) isPrevHoliday = true;
            } else {
              const prevMonthSchedule = schedules.find((s) => s.year === prevDate.getFullYear() && s.month === prevDate.getMonth());
              if (prevMonthSchedule && prevMonthSchedule.holidays[prevDateString]) isPrevHoliday = true;
            }
            if (isPrevHoliday) return;
          }

          for (let i = 0; i < shift.min; i++) {
            let eligible = employees.filter((emp) => {
              if (newAssignments[`${emp.id}_${dateStr}`]) return false;
              if (emp.offShifts && emp.offShifts.includes(shift.id)) return false;
              if (emp.specificShifts && emp.specificShifts.length > 0 && !emp.specificShifts.includes(shift.id)) return false;

              const upperName = shift.name.toUpperCase();
              const cat = getShiftCategory(shift);

              // 🔴 กฎข้อ 1. เวรต้องไม่ติดกัน 2 วัน
              if (rules.rule_1) {
                if (newAssignments[`${emp.id}_${prevDateStr}`]) return false;
                if (newAssignments[`${emp.id}_${nextDateStr}`]) return false;
              }

              // 🔴 กฎข้อ 2. เวรบ่ายห้ามซ้ำชื่อกัน
              if (rules.rule_2 && cat === 'บ่าย') {
                if (empStats[emp.id].assignedAfternoons.has(upperName)) return false;
              }

              // 🔴 กฎข้อ 4 และ 5. คนที่มี R1 ไม่มี T1,T2 (และสลับกัน)
              if (rules.rule_4 || rules.rule_5) {
                if (upperName === 'R1' && empStats[emp.id].hasT1_T2) return false;
                if ((upperName === 'T1' || upperName === 'T2') && empStats[emp.id].hasR1) return false;
              }

              // 🔴 กฎข้อ 6. As/4 หรือ A มีได้แค่คนละ 1 เวร/เดือน (เวรใดเวรหนึ่ง)
              if (rules.rule_6 && (upperName === 'A' || upperName === 'AS1' || upperName === 'AS/4')) {
                if (empStats[emp.id].countA_As4 >= 1) return false;
              }

              // 🔴 กฎข้อ 7. เวรเช้าต้องไม่ซ้ำตำแหน่งกัน
              if (rules.rule_7 && cat === 'เช้า') {
                if (empStats[emp.id].assignedUniqueMornings.has(upperName)) return false;
              }

              return true;
            });

            if (eligible.length > 0) {
              for (let k = eligible.length - 1; k > 0; k--) {
                const j = Math.floor(Math.random() * (k + 1));
                [eligible[k], eligible[j]] = [eligible[j], eligible[k]];
              }

              const cat = getShiftCategory(shift);
              const shiftNameUpper = shift.name.toUpperCase();

              eligible.sort((a, b) => {
                // 🔴 กฎข้อ 3. คนที่มี R1 จะมีเวรตัว G ร่วมด้วยเสมอ (ดึงคนมี R1 มารับ G ก่อน)
                if (rules.rule_3 && shiftNameUpper === 'G') {
                   const aNeedsG = empStats[a.id].hasR1 && !empStats[a.id].hasG;
                   const bNeedsG = empStats[b.id].hasR1 && !empStats[b.id].hasG;
                   if (aNeedsG && !bNeedsG) return -1;
                   if (!aNeedsG && bNeedsG) return 1;
                }
                if (rules.rule_3 && shiftNameUpper === 'R1') {
                   const aNeedsR1 = empStats[a.id].hasG && !empStats[a.id].hasR1;
                   const bNeedsR1 = empStats[b.id].hasG && !empStats[b.id].hasR1;
                   if (aNeedsR1 && !bNeedsR1) return -1;
                   if (!aNeedsR1 && bNeedsR1) return 1;
                }

                // 🔴 กฎข้อ 2. ต้องได้ บe เสมอ ในคนที่สุ่มได้เวรบ่าย 2 เวรขึ้นไป
                if (rules.rule_2 && cat === 'บ่าย') {
                   const isShiftBe = shiftNameUpper === 'บE' || shiftNameUpper === 'บe';
                   if (isShiftBe) {
                       const aNeedsBe = empStats[a.id].afternoonCount >= 1 && !empStats[a.id].hasBe;
                       const bNeedsBe = empStats[b.id].afternoonCount >= 1 && !empStats[b.id].hasBe;
                       if (aNeedsBe && !bNeedsBe) return -1;
                       if (!aNeedsBe && bNeedsBe) return 1;
                   } else {
                       const aSavingForBe = empStats[a.id].afternoonCount >= 1 && !empStats[a.id].hasBe;
                       const bSavingForBe = empStats[b.id].afternoonCount >= 1 && !empStats[b.id].hasBe;
                       if (aSavingForBe && !bSavingForBe) return 1; // ผลักให้รอไปลง บe
                       if (!aSavingForBe && bSavingForBe) return -1;
                   }
                }

                // 🔴 กฎข้อ 7 และ 8. กระจายชั่วโมงและเวรเท่ากัน + ให้คนงดดึกชั่วโมงน้อยกว่า 12-16 ชม.
                const getEffectiveHours = (empId) => {
                   let hrs = empStats[empId].hours;
                   // จำลองให้คนงดดึกเหมือนทำงานไปแล้ว 14 ชม. เพื่อให้ระบบหยุดให้เวรเร็วกว่าปกติ
                   if (rules.rule_8 && empStats[empId].isOptOutNight) {
                       hrs += 14; 
                   }
                   return hrs;
                };

                if (rules.rule_7 || rules.rule_8) {
                   const effHoursA = getEffectiveHours(a.id);
                   const effHoursB = getEffectiveHours(b.id);
                   if (effHoursA !== effHoursB) return effHoursA - effHoursB;
                   
                   if (empStats[a.id].totalShifts !== empStats[b.id].totalShifts)
                       return empStats[a.id].totalShifts - empStats[b.id].totalShifts;
                }

                return 0;
              });

              const chosen = eligible[0];
              newAssignments[`${chosen.id}_${dateStr}`] = shift.id;

              empStats[chosen.id].money += getShiftValue(shift);
              empStats[chosen.id].hours += getShiftHours(shift);
              empStats[chosen.id].totalShifts += 1;
              empStats[chosen.id].catCounts[cat]++;
              if (!empStats[chosen.id].counts[shift.id]) empStats[chosen.id].counts[shift.id] = 0;
              empStats[chosen.id].counts[shift.id]++;

              const assignedNameUpper = shift.name.toUpperCase();
              if (assignedNameUpper === 'A' || assignedNameUpper === 'AS1' || assignedNameUpper === 'AS/4')
                empStats[chosen.id].countA_As4 += 1;
              
              if (cat === 'เช้า') {
                empStats[chosen.id].assignedUniqueMornings.add(assignedNameUpper);
                if (assignedNameUpper === 'R1') empStats[chosen.id].hasR1 = true;
                if (assignedNameUpper === 'G') empStats[chosen.id].hasG = true;
                if (assignedNameUpper === 'T1' || assignedNameUpper === 'T2') empStats[chosen.id].hasT1_T2 = true;
              }
              if (cat === 'ดึก') empStats[chosen.id].assignedNights.add(assignedNameUpper);
              
              if (cat === 'บ่าย') {
                empStats[chosen.id].assignedAfternoons.add(assignedNameUpper);
                empStats[chosen.id].afternoonCount += 1;
                if (assignedNameUpper === 'บE' || assignedNameUpper === 'บe') {
                   empStats[chosen.id].hasBe = true;
                }
              }
            }
          }
        });
      }
    };

    const mainShifts = shifts.filter((s) => getShiftCategory(s) !== '2o');
    const fillerShifts = shifts.filter((s) => getShiftCategory(s) === '2o');

    mainShifts.sort((a, b) => {
      const priority = { ดึก: 1, บ่าย: 2, SMC: 3, 'As/4': 4, เช้า: 5, A: 6, '4o': 7, อื่นๆ: 8 };
      return (priority[getShiftCategory(a)] || 9) - (priority[getShiftCategory(b)] || 9);
    });

    assignShiftsForPass(mainShifts, false);
    assignShiftsForPass(fillerShifts, true);

    setSchedules(
      schedules.map((s) =>
        s.id === activeScheduleId ? { ...s, assignments: newAssignments } : s
      )
    );
  };

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
    const daysInMonth = new Date(activeSchedule.year, activeSchedule.month + 1, 0).getDate();
    monthDates = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(activeSchedule.year, activeSchedule.month, i + 1);
      const dateStr = `${activeSchedule.year}-${String(activeSchedule.month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      return {
        dateNum: i + 1,
        dayStr: thaiDays[d.getDay()],
        dateStr,
        isHoliday: d.getDay() === 0 || d.getDay() === 6 || !!activeSchedule.holidays[dateStr],
      };
    });
  }

  const activeCategoryRules = CATEGORIZED_RULES[selectedRuleRole].rules;
  const inactiveRules = activeCategoryRules.filter((r) => !rules[r.id]);
  const currentlyActiveRules = activeCategoryRules.filter((r) => rules[r.id]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-between items-center mb-3 shrink-0 print-hidden">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-white p-1 rounded-md border border-gray-200">
            {schedules.map((sch) => (
              <button
                key={sch.id}
                type="button"
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
            type="button"
            onClick={handleAutoGenerate}
            disabled={!activeSchedule}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-700 active:scale-95 transition-transform shadow-sm"
          >
            <Wand2 className="w-4 h-4" /> สุ่มเวรอัตโนมัติ
          </button>
          <button
            type="button"
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
              type="button"
              onClick={() => setShowRuleDropdown(!showRuleDropdown)}
              className="text-xs bg-white border border-dashed border-indigo-300 text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 flex items-center gap-1 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มเงื่อนไข
            </button>
            {showRuleDropdown && (
              <div className="absolute right-0 top-full mt-2 w-[400px] bg-white border border-gray-200 shadow-xl rounded-xl z-50 py-2">
                <div className="px-4 py-1.5 bg-gray-50 text-xs font-bold text-gray-700 mb-1 border-b border-gray-100">
                  เงื่อนไขของ: {CATEGORIZED_RULES[selectedRuleRole].label}
                </div>
                {inactiveRules.length > 0 ? (
                  inactiveRules.map((rule) => (
                    <button
                      key={rule.id}
                      type="button"
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 rounded-lg text-[11px] font-medium border border-gray-200 shadow-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <span>{rule.label}</span>
                <button
                  type="button"
                  onClick={() => setRules({ ...rules, [rule.id]: false })}
                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          ) : (
            <span className="text-xs text-gray-400 italic">
              ไม่มีเงื่อนไขที่ถูกเปิดใช้งาน
            </span>
          )}
        </div>
      </div>

      {activeSchedule && (
        <div className="flex justify-end gap-2 shrink-0 items-center mb-3">
          <button type="button" onClick={handleDeleteSchedule} className="text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-red-100 transition-colors mr-2"><Trash2 className="w-3.5 h-3.5" /> ลบตารางนี้</button>
          <button type="button" onClick={handleExportExcel} className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100 transition-colors"><Download className="w-4 h-4" /> Excel</button>
          <button type="button" onClick={() => window.print()} className="text-slate-700 bg-white border border-slate-200 shadow-sm px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors"><Printer className="w-4 h-4" /> PDF</button>
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
            <div className="hidden print:block text-center font-bold text-sm text-black mb-2 pb-1">
              ตารางปฏิบัติงาน เภสัชกร ประจำเดือน {thaiMonths[activeSchedule.month]} พ.ศ. {activeSchedule.year + 543}
            </div>
            <table className="w-full border-collapse text-center table-fixed min-w-[1300px] print:min-w-0" id="schedule-table">
              <thead>
                <tr className="bg-slate-50 sticky top-0 z-20 shadow-sm">
                  <th className="p-2 border-b border-r border-gray-200 w-[120px] text-sm text-gray-700 print:w-[80px]">พนักงาน</th>
                  {monthDates.map((d) => (
                    <th key={d.dateStr} onClick={() => handleToggleHoliday(d.dateStr)} className={`p-0 border-b border-r border-gray-200 w-[30px] cursor-pointer hover:bg-red-50 transition-colors ${d.isHoliday ? 'bg-red-50 text-red-600 font-bold print:bg-gray-100' : 'text-slate-600'}`}>
                      <div className="text-[10px] print:text-[8px] leading-tight pt-1">{d.dayStr}</div>
                      <div className="text-xs print:text-[10px] pb-1">{d.dateNum}</div>
                    </th>
                  ))}
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-blue-50/50">เช้า</th>
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-orange-50/50">บ่าย</th>
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-purple-50/50">ดึก</th>
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-teal-50/50">As/4</th>
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-indigo-50/50">A</th>
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-rose-50/50">SMC</th>
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-yellow-50/50">4o</th>
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-lime-50/50">2o</th>
                  <th className="p-1 border-b border-r border-gray-200 w-[30px] text-[10px] text-gray-600 font-bold bg-gray-100/80">ช.ม.</th>
                  <th className="p-2 border-b border-gray-200 w-[70px] text-emerald-700 text-sm font-bold print:text-black">รวม(บ.)</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  let totalMoney = 0; let totalHours = 0;
                  let counts = { A: 0, เช้า: 0, บ่าย: 0, ดึก: 0, 'As/4': 0, SMC: 0, '4o': 0, '2o': 0 };

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors h-8">
                      <td className="sticky left-0 bg-white group-hover:bg-gray-50 px-2 py-1 border-b border-r border-gray-200 text-left text-xs font-bold text-gray-800 truncate print:static print:text-[10px]">
                        <div className="flex flex-col">
                          <span>{emp.name}</span><span className="text-[9px] font-normal text-gray-400">เภสัชกร</span>
                        </div>
                      </td>
                      {monthDates.map((d) => {
                        const sData = shifts.find((s) => s.id === activeSchedule.assignments[`${emp.id}_${d.dateStr}`]);
                        if (sData) { totalMoney += getShiftValue(sData); totalHours += getShiftHours(sData); const cat = getShiftCategory(sData); if (counts[cat] !== undefined) counts[cat]++; }
                        return (
                          <td key={d.dateStr} onClick={() => setAssignmentModal({ isOpen: true, empId: emp.id, dateStr: d.dateStr })} className={`p-0 border-b border-r border-gray-200 cursor-pointer relative ${d.isHoliday ? 'bg-red-50/30 print:bg-gray-100' : ''}`}>
                            {sData && (<div className="absolute inset-[2px] rounded-[3px] text-[9px] flex items-center justify-center font-bold text-white leading-none overflow-hidden print:text-black print:border print:border-gray-800 shadow-sm" style={{ backgroundColor: sData.color }}>{sData.name}</div>)}
                          </td>
                        );
                      })}
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-blue-700 bg-blue-50/30">{counts['เช้า'] > 0 ? counts['เช้า'] : '-'}</td>
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-orange-700 bg-orange-50/30">{counts['บ่าย'] > 0 ? counts['บ่าย'] : '-'}</td>
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-purple-700 bg-purple-50/30">{counts['ดึก'] > 0 ? counts['ดึก'] : '-'}</td>
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-teal-700 bg-teal-50/30">{counts['As/4'] > 0 ? counts['As/4'] : '-'}</td>
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-indigo-700 bg-indigo-50/30">{counts['A'] > 0 ? counts['A'] : '-'}</td>
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-rose-700 bg-rose-50/30">{counts['SMC'] > 0 ? counts['SMC'] : '-'}</td>
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-yellow-700 bg-yellow-50/30">{counts['4o'] > 0 ? counts['4o'] : '-'}</td>
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-lime-700 bg-lime-50/30">{counts['2o'] > 0 ? counts['2o'] : '-'}</td>
                      <td className="px-1 py-1 border-b border-r border-gray-200 text-[11px] text-center font-bold text-gray-700 bg-gray-50/80">{totalHours > 0 ? totalHours : '-'}</td>
                      <td className="px-2 py-1 border-b border-gray-200 text-emerald-600 font-bold text-xs text-right print:text-black">{totalMoney.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">เดือน</label>
                <select className="w-full border border-gray-300 rounded-lg p-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500" value={createMonth} onChange={(e) => setCreateMonth(Number(e.target.value))}>
                  {thaiMonths.map((m, i) => (<option key={i} value={i}>{m}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">ปี (ค.ศ.)</label>
                <input type="number" className="w-full border border-gray-300 rounded-lg p-2.5 text-base outline-none focus:ring-2 focus:ring-blue-500" value={createYear} onChange={(e) => setCreateYear(Number(e.target.value))} />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button type="button" onClick={handleCreateSchedule} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">สร้างตาราง</button>
            </div>
          </div>
        </div>
      )}

      {assignmentModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setAssignmentModal({ isOpen: false, empId: null, dateStr: null })}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold border-b border-gray-100 pb-3 mb-4 flex items-center justify-between">
              เลือกเวรประจำวัน
              <button type="button" onClick={() => handleAssignShift(null)} className="py-1 px-3 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 font-medium transition-colors">ว่าง (ลบเวร)</button>
            </h3>
            <div className="grid grid-cols-3 gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {shifts.map((s) => (
                <button key={s.id} type="button" onClick={() => handleAssignShift(s.id)} className="py-2.5 px-1 rounded-lg text-white text-sm font-bold truncate shadow-sm hover:scale-105 transition-transform" style={{ backgroundColor: s.color }}>
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
// 2. Component: จัดการพนักงาน (เภสัชกร)
// ==========================================
function EmployeesManager() {
  const [shiftsRaw] = useFirebaseSync('ph_shift_types', []);
  const [employeesRaw, setEmployees] = useFirebaseSync('ph_employees', []);
  const shifts = Array.isArray(shiftsRaw) ? shiftsRaw : [];
  const employees = Array.isArray(employeesRaw) ? employeesRaw : [];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', role: 'pharmacist', offShifts: [], specificShifts: [] });

  const handleSave = () => {
    if (!formData.name) return alert('กรุณากรอกชื่อ');
    if (formData.id) setEmployees(employees.map((e) => (e.id === formData.id ? formData : e)));
    else setEmployees([...employees, { ...formData, id: Date.now().toString() }]);
    setIsModalOpen(false);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-bold text-gray-800">จัดการรายชื่อเภสัชกร</h2>
        <button type="button" onClick={() => { setFormData({ name: '', role: 'pharmacist', offShifts: [], specificShifts: [] }); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm">
          <UserPlus className="w-4 h-4" /> เพิ่มเภสัชกร
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
            {employees.length === 0 && (<tr><td colSpan="5" className="text-center p-8 text-gray-400">ยังไม่มีข้อมูลพนักงาน</td></tr>)}
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="p-4 font-bold text-gray-900">{emp.name}</td>
                <td className="p-4 text-gray-600 font-medium"><span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-xs">เภสัชกร</span></td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {(!emp.specificShifts || emp.specificShifts.length === 0) && <span className="text-gray-400 text-xs">-</span>}
                    {emp.specificShifts?.map((id) => {
                      const s = shifts.find((x) => x.id === id);
                      return s ? <span key={id} className="px-2 py-1 rounded-md text-xs text-white font-medium shadow-sm" style={{ backgroundColor: s.color }}>{s.name}</span> : null;
                    })}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {(!emp.offShifts || emp.offShifts.length === 0) && <span className="text-gray-400 text-xs">-</span>}
                    {emp.offShifts?.map((id) => {
                      const s = shifts.find((x) => x.id === id);
                      return s ? <span key={id} className="px-2 py-1 rounded-md text-xs text-white font-medium shadow-sm opacity-80" style={{ backgroundColor: s.color }}>{s.name}</span> : null;
                    })}
                  </div>
                </td>
                <td className="p-4 text-center">
                  <button type="button" onClick={() => { setFormData({ ...emp, role: 'pharmacist', offShifts: emp.offShifts || [], specificShifts: emp.specificShifts || [] }); setIsModalOpen(true); }} className="text-blue-500 hover:bg-blue-50 p-2 rounded-lg mr-1 transition-colors"><Edit2 className="w-4 h-4" /></button>
                  <button type="button" onClick={() => { if (confirm('ยืนยันลบพนักงาน?')) setEmployees(employees.filter((e) => e.id !== emp.id)); }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-xl font-bold mb-5 border-b border-gray-100 pb-3">{formData.id ? 'แก้ไขข้อมูล' : 'เพิ่มรายชื่อใหม่'}</h3>
            <div className="space-y-5 overflow-y-auto flex-1 pr-2 custom-scrollbar">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">ชื่อพนักงาน *</label>
                <input type="text" placeholder="ระบุชื่อพนักงาน" className="w-full border border-gray-300 rounded-lg p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                <label className="block text-sm font-bold text-blue-800 mb-1">เวรเฉพาะ (บังคับลงแค่เวรเหล่านี้)</label>
                <div className="flex flex-wrap gap-2">
                  {shifts.map((s) => (
                    <label key={s.id} className={`flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${formData.specificShifts?.includes(s.id) ? 'bg-white border-blue-400 shadow-sm' : 'bg-white/50 border-gray-200 hover:bg-white'}`}>
                      <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" checked={formData.specificShifts?.includes(s.id)} onChange={(e) => { const newSpecific = e.target.checked ? [...(formData.specificShifts || []), s.id] : (formData.specificShifts || []).filter((id) => id !== s.id); const newOff = (formData.offShifts || []).filter((id) => id !== s.id); setFormData({ ...formData, specificShifts: newSpecific, offShifts: newOff }); }} />
                      <span style={{ color: s.color }}>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                <label className="block text-sm font-bold text-red-800 mb-1">งดรับเวร (เวรที่ไม่ต้องการขึ้น)</label>
                <div className="flex flex-wrap gap-2">
                  {shifts.map((s) => (
                    <label key={s.id} className={`flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${formData.offShifts?.includes(s.id) ? 'bg-white border-red-300 shadow-sm' : 'bg-white/50 border-gray-200 hover:bg-white'} ${formData.specificShifts?.includes(s.id) ? 'opacity-50 pointer-events-none' : ''}`}>
                      <input type="checkbox" className="w-4 h-4 text-red-500 rounded" disabled={formData.specificShifts?.includes(s.id)} checked={formData.offShifts?.includes(s.id)} onChange={(e) => { const newOff = e.target.checked ? [...(formData.offShifts || []), s.id] : (formData.offShifts || []).filter((id) => id !== s.id); setFormData({ ...formData, offShifts: newOff }); }} />
                      <span style={{ color: s.color }}>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-gray-100 shrink-0">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">บันทึกพนักงาน</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 3. Component: จัดการประเภทเวร (เภสัชกร)
// ==========================================
function ShiftTypesManager() {
  const [rawShifts, setShifts] = useFirebaseSync('ph_shift_types', []);
  const shifts = Array.isArray(rawShifts) ? rawShifts : [];
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', color: '#3b82f6', start: '', end: '', min: 1, allowedDays: 'all' });

  const colorOptions = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
    '#6366f1', '#06b6d4', '#84cc16', '#f43f5e', '#d946ef', '#0ea5e9', '#eab308', '#64748b',
  ];

  const handleSave = () => {
    if (!formData.name) return alert('กรุณากรอกชื่อเวร');
    if (formData.id) setShifts(shifts.map((s) => (s.id === formData.id ? formData : s)));
    else setShifts([...shifts, { ...formData, id: Date.now().toString() }]);
    setIsModalOpen(false);
  };

  const getAllowedDaysText = (val) => {
    if (val === 'weekdays') return 'วันธรรมดา';
    if (val === 'weekends_holidays') return 'วันหยุด';
    if (val === 'saturdays_only') return 'วันเสาร์';
    if (val === 'mon_tue_only') return 'จันทร์-อังคาร';
    if (val === 'holidays_except_saturday') return 'วันหยุด (ยกเว้นเสาร์)';
    if (val === 'first_day_of_holidays') return 'วันแรกของช่วงหยุด (T2)'; 
    return 'ทุกวัน';
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">จัดการประเภทเวร (เภสัชกร)</h2>
        <button type="button" onClick={() => { setFormData({ name: '', color: '#3b82f6', start: '', end: '', min: 1, allowedDays: 'all' }); setIsModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700 shadow-sm">
          <Plus className="w-4 h-4" /> เพิ่มเวร
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 overflow-y-auto pr-2 pb-4">
        {shifts.map((s) => (
          <div key={s.id} className="border border-gray-200 rounded-2xl p-5 bg-white relative overflow-hidden shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 left-0 w-full h-1.5" style={{ backgroundColor: s.color }}></div>
            <div className="flex justify-between items-start mb-4 mt-1">
              <span className="font-bold text-xl text-gray-800 truncate pr-2">{s.name}</span>
              <div className="flex gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => { setFormData(s); setIsModalOpen(true); }} className="text-blue-500 bg-blue-50 p-1.5 rounded-lg hover:bg-blue-100"><Edit2 className="w-4 h-4" /></button>
                <button type="button" onClick={() => { if (confirm('ลบเวรนี้?')) setShifts(shifts.filter((x) => x.id !== s.id)); }} className="text-red-500 bg-red-50 p-1.5 rounded-lg hover:bg-red-100"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center gap-2.5"><Clock className="w-4 h-4 text-gray-400" /> {s.start || '--:--'} - {s.end || '--:--'}</div>
              <div className="flex items-center gap-2.5"><Users className="w-4 h-4 text-gray-400" /> รับ: <span className="font-bold text-gray-800">{s.min}</span> คน</div>
              <div className="flex items-center gap-2.5"><CalendarDays className="w-4 h-4 text-gray-400" /> {getAllowedDaysText(s.allowedDays)}</div>
              <div className="flex items-center gap-2.5 border-t pt-3 mt-3"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-600 font-bold">{getShiftValue(s).toLocaleString('th-TH')} บ.</span></div>
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
                <input type="text" placeholder="เช่น เช้า, บ่าย, ดึก, T2" className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">สีป้ายเวร</label>
                <div className="flex gap-2 flex-wrap p-3 bg-gray-50 rounded-xl border border-gray-100">
                  {colorOptions.map((color) => (<button key={color} type="button" onClick={() => setFormData({ ...formData, color })} className={`w-8 h-8 rounded-lg transition-all ${formData.color === color ? 'ring-2 ring-offset-2 ring-gray-800 scale-110' : 'hover:scale-110 shadow-sm border border-black/10'}`} style={{ backgroundColor: color }} />))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">เวลาเริ่ม</label>
                  <input type="time" className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none" value={formData.start} onChange={(e) => setFormData({ ...formData, start: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1.5">เวลาสิ้นสุด</label>
                  <input type="time" className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none" value={formData.end} onChange={(e) => setFormData({ ...formData, end: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">จำนวนคนต้องการ / วัน</label>
                <input type="number" min="1" className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none" value={formData.min} onChange={(e) => setFormData({ ...formData, min: parseInt(e.target.value) || 1, })} />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1.5">เงื่อนไขวันที่จัดได้</label>
                <select className="w-full border border-gray-300 rounded-xl p-3 text-base focus:ring-2 focus:ring-blue-500 outline-none bg-white" value={formData.allowedDays} onChange={(e) => setFormData({ ...formData, allowedDays: e.target.value })}>
                  <option value="all">ลงได้ทุกวัน (รวมวันหยุด)</option>
                  <option value="weekdays">เฉพาะวันธรรมดา (จ.-ศ.)</option>
                  <option value="weekends_holidays">เฉพาะวันหยุด (ส.-อา. และนักขัตฤกษ์)</option>
                  <option value="saturdays_only">เฉพาะวันเสาร์</option>
                  <option value="mon_tue_only">เฉพาะ จันทร์-อังคาร</option>
                  <option value="holidays_except_saturday">เฉพาะวันหยุด (ยกเว้นเสาร์)</option>
                  <option value="first_day_of_holidays">วันแรกของช่วงหยุดยาว/ส.-อา. (สำหรับ T2)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-8 pt-4 border-t border-gray-100">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button type="button" onClick={handleSave} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md hover:shadow-lg transition-all">บันทึกเวร</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}