import { useNavigate } from 'react-router-dom';
// นำเข้าไอคอนจาก react-icons (หมวดหมู่ FontAwesome 6)
import { FaUserDoctor, FaPills, FaUserNurse } from 'react-icons/fa6';
// นำเข้าไฟล์ CSS ที่เราสร้างเมื่อกี้
import './HomePage.css';

function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-container">
      <div className="home-header">
        <h1 className="home-title">ระบบจัดการตารางเวรกลุ่มงานเภสัชกรรม โรงพยาบาลเจ้าพระยายมราช</h1>
        <p className="home-subtitle">กรุณาเลือกตำแหน่งที่ต้องการจัดตารางเวร</p>
      </div>

      <div className="card-grid">
        {/* การ์ดที่ 1: เภสัชกร */}
        <button className="role-card" onClick={() => navigate('/pharmacist')}>
          <div className="icon-wrapper">
            <FaUserDoctor className="card-icon" />
          </div>
          <h2 className="card-title">เภสัชกร</h2>
          <p className="card-desc">จัดการตารางเวรสำหรับเภสัชกร</p>
        </button>

        {/* การ์ดที่ 2: เจ้าพนักงานเภสัชกรรม */}
        <button className="role-card" onClick={() => navigate('/technician')}>
          <div className="icon-wrapper">
            <FaPills className="card-icon" />
          </div>
          <h2 className="card-title">เจ้าพนักงานเภสัชกรรม</h2>
          <p className="card-desc">จัดการตารางเวรสำหรับเจ้าพนักงานฯ</p>
        </button>

        {/* การ์ดที่ 3: ผู้ช่วยเภสัชกร */}
        <button className="role-card" onClick={() => navigate('/assistant')}>
          <div className="icon-wrapper">
            <FaUserNurse className="card-icon" />
          </div>
          <h2 className="card-title">ผู้ช่วยเภสัชกร</h2>
          <p className="card-desc">จัดการตารางเวรสำหรับผู้ช่วยเภสัชกร</p>
        </button>
      </div>
    </div>
  );
}

export default HomePage;
