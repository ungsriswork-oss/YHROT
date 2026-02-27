import { useNavigate } from 'react-router-dom';
import { FaUserDoctor, FaPills, FaUserNurse } from "react-icons/fa6";

function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center p-5 font-sans absolute top-0 left-0">
      
      {/* ส่วนหัวข้อ */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-800 mb-4 tracking-tight">
          ระบบจัดการตารางเวร
        </h1>
        <p className="text-lg text-slate-600 font-medium">
          กรุณาเลือกตำแหน่งของคุณเพื่อเข้าสู่ระบบ
        </p>
      </div>
      
      {/* ส่วนการ์ดเมนู */}
      <div className="flex flex-wrap justify-center gap-8 w-full max-w-6xl">
        
        {/* การ์ดที่ 1: เภสัชกร */}
        <button 
          onClick={() => navigate('/pharmacist')}
          className="bg-white border-none rounded-[2rem] p-10 w-72 flex flex-col items-center justify-center text-center cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group"
        >
          {/* กรอบไอคอน (บังคับกึ่งกลางด้วย flex items-center justify-center) */}
          <div className="bg-blue-50 rounded-full mb-6 flex items-center justify-center w-28 h-28 group-hover:bg-blue-100 group-hover:scale-105 transition-all duration-300">
            <FaUserDoctor className="text-6xl text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">เภสัชกร</h2>
          <p className="text-slate-500 text-sm">จัดการตารางเวรสำหรับเภสัชกร</p>
        </button>

        {/* การ์ดที่ 2: เจ้าพนักงานเภสัชกรรม */}
        <button 
          onClick={() => navigate('/technician')}
          className="bg-white border-none rounded-[2rem] p-10 w-72 flex flex-col items-center justify-center text-center cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group"
        >
          <div className="bg-emerald-50 rounded-full mb-6 flex items-center justify-center w-28 h-28 group-hover:bg-emerald-100 group-hover:scale-105 transition-all duration-300">
            <FaPills className="text-6xl text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">เจ้าพนักงานฯ</h2>
          <p className="text-slate-500 text-sm">จัดการตารางเวรสำหรับเจ้าพนักงานฯ</p>
        </button>

        {/* การ์ดที่ 3: ผู้ช่วยเภสัชกร */}
        <button 
          onClick={() => navigate('/assistant')}
          className="bg-white border-none rounded-[2rem] p-10 w-72 flex flex-col items-center justify-center text-center cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group"
        >
          <div className="bg-teal-50 rounded-full mb-6 flex items-center justify-center w-28 h-28 group-hover:bg-teal-100 group-hover:scale-105 transition-all duration-300">
            <FaUserNurse className="text-6xl text-teal-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">ผู้ช่วยเภสัชกร</h2>
          <p className="text-slate-500 text-sm">จัดการตารางเวรสำหรับผู้ช่วยเภสัชกร</p>
        </button>

      </div>
    </div>
  );
}

export default HomePage;