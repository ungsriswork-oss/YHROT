import { useNavigate } from 'react-router-dom';
// เปลี่ยน Icon ใหม่ให้เหมาะสมกับงานเภสัชกรรม
import { FaPrescriptionBottleMedical, FaPills, FaHandHoldingMedical } from "react-icons/fa6";

function HomePage() {
  const navigate = useNavigate();

  // ฟังก์ชันสำหรับจัดการการคลิกเข้าสู่ระบบ
  const handleLogin = (role, path) => {
    let passwordPrompt = '';
    let correctPassword = '';

    // กำหนดข้อความแจ้งเตือนและรหัสผ่านของแต่ละตำแหน่ง
    if (role === 'pharmacist') {
      passwordPrompt = 'กรุณาใส่รหัสผ่านสำหรับเภสัชกร:';
      correctPassword = 'pharmacy';
    } else if (role === 'technician') {
      passwordPrompt = 'กรุณาใส่รหัสผ่านสำหรับเจ้าพนักงานฯ:';
      correctPassword = 'phartech'; // รหัสผ่านของเจ้าพนักงานเภสัชกรรม
    } else if (role === 'assistant') {
      passwordPrompt = 'กรุณาใส่รหัสผ่านสำหรับผู้ช่วยเภสัชกร:';
      correctPassword = 'pharass'; // รหัสผ่านของผู้ช่วยเภสัชกร
    }

    // ทำการถามรหัสผ่าน
    if (passwordPrompt) {
      const password = prompt(passwordPrompt);
      
      if (password === correctPassword) {
        navigate(path); // รหัสถูก ให้เปลี่ยนหน้า
      } else if (password !== null) {
        alert('รหัสผ่านไม่ถูกต้อง'); // รหัสผิด แจ้งเตือน (กรณีไม่ได้กด Cancel)
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center p-5 font-sans absolute top-0 left-0">
      
      {/* ส่วนหัวข้อ */}
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-6xl font-bold text-slate-800 mb-5 tracking-tight drop-shadow-sm">
          ระบบจัดการตารางเวร
        </h1>
        <p className="text-xl text-slate-600 font-medium">
          กรุณาเลือกตำแหน่งของคุณเพื่อเข้าสู่ระบบ
        </p>
      </div>
      
      {/* ส่วนการ์ดเมนู (ขยายช่องว่างและขนาดการ์ด) */}
      <div className="flex flex-wrap justify-center gap-10 w-full max-w-7xl">
        
        {/* การ์ดที่ 1: เภสัชกร */}
        <button 
          onClick={() => handleLogin('pharmacist', '/pharmacist')}
          className="bg-white border-none rounded-[2.5rem] p-12 w-80 min-h-[22rem] flex flex-col items-center justify-center text-center cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-3 transition-all duration-300 group"
        >
          {/* ขยายกรอบและ Icon */}
          <div className="bg-blue-50 rounded-full mb-8 flex items-center justify-center w-32 h-32 group-hover:bg-blue-100 group-hover:scale-110 transition-all duration-300">
            <FaPrescriptionBottleMedical className="text-7xl text-blue-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-4">เภสัชกร</h2>
          <p className="text-slate-500 text-base">จัดการตารางเวรสำหรับเภสัชกร</p>
        </button>

        {/* การ์ดที่ 2: เจ้าพนักงานเภสัชกรรม */}
        <button 
          onClick={() => handleLogin('technician', '/technician')}
          className="bg-white border-none rounded-[2.5rem] p-12 w-80 min-h-[22rem] flex flex-col items-center justify-center text-center cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-3 transition-all duration-300 group"
        >
          <div className="bg-emerald-50 rounded-full mb-8 flex items-center justify-center w-32 h-32 group-hover:bg-emerald-100 group-hover:scale-110 transition-all duration-300">
            <FaPills className="text-7xl text-emerald-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-4">เจ้าพนักงานฯ</h2>
          <p className="text-slate-500 text-base">จัดการตารางเวรสำหรับเจ้าพนักงานฯ</p>
        </button>

        {/* การ์ดที่ 3: ผู้ช่วยเภสัชกร */}
        <button 
          onClick={() => handleLogin('assistant', '/assistant')}
          className="bg-white border-none rounded-[2.5rem] p-12 w-80 min-h-[22rem] flex flex-col items-center justify-center text-center cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-3 transition-all duration-300 group"
        >
          <div className="bg-teal-50 rounded-full mb-8 flex items-center justify-center w-32 h-32 group-hover:bg-teal-100 group-hover:scale-110 transition-all duration-300">
            <FaHandHoldingMedical className="text-7xl text-teal-600" />
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-4">ผู้ช่วยเภสัชกร</h2>
          <p className="text-slate-500 text-base">จัดการตารางเวรสำหรับผู้ช่วยเภสัชกร</p>
        </button>

      </div>
    </div>
  );
}

export default HomePage;