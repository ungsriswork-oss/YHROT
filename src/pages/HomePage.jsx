import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const ROLES = [
  {
    id: 'pharmacist',
    path: '/pharmacist',
    password: 'pharmacy',
    label: 'เภสัชกร',
    labelEn: 'Pharmacist',
    abbr: 'RPh',
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
    desc: 'จัดตารางเวรเภสัชกร',
  },
  {
    id: 'technician',
    path: '/technician',
    password: 'phartech',
    label: 'เจ้าพนักงานเภสัชกรรม',
    labelEn: 'Pharmacy Technician',
    abbr: 'PhT',
    color: '#047857',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    desc: 'จัดตารางเวรเจ้าพนักงานฯ',
  },
  {
    id: 'assistant',
    path: '/assistant',
    password: 'pharass',
    label: 'ผู้ช่วยเภสัชกร',
    labelEn: 'Pharmacy Assistant',
    abbr: 'PA',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    desc: 'จัดตารางเวรผู้ช่วยเภสัชกร',
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [active, setActive] = useState(null);
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSelect = (role) => {
    setActive(role);
    setPwd('');
    setError('');
  };

  const handleLogin = () => {
    if (!active) return;
    if (pwd === active.password) {
      setLoading(true);
      setTimeout(() => navigate(active.path), 400);
    } else {
      setError('รหัสผ่านไม่ถูกต้อง');
      setPwd('');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Sarabun', 'IBM Plex Sans Thai', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .role-card { transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; cursor: pointer; }
        .role-card:hover { transform: translateY(-2px); }
        .role-card.selected { transform: translateY(-2px); }
        .login-btn { transition: background 0.15s, transform 0.1s; }
        .login-btn:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        input:focus { outline: none; }
      `}</style>

      {/* Top bar */}
      <div style={{
        background: '#0f172a',
        padding: '12px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32,
            background: '#3b82f6',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'white', fontSize: 14, fontWeight: 700, fontFamily: 'IBM Plex Mono' }}>Rx</span>
          </div>
          <span style={{ color: '#94a3b8', fontSize: 13, letterSpacing: '0.05em', fontFamily: 'IBM Plex Mono' }}>
            YHROT · SHIFT MANAGEMENT SYSTEM
          </span>
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: 12,
          color: '#475569',
          letterSpacing: '0.05em',
        }}>
          v2.0
        </div>
      </div>

      {/* Main */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        gap: 48,
      }}>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: 11,
            color: '#3b82f6',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}>
            โรงพยาบาลเจ้าพระยายมราช · ฝ่ายเภสัชกรรม
          </div>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 42px)',
            fontWeight: 700,
            color: '#0f172a',
            margin: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
          }}>
            ระบบจัดการตารางเวร
          </h1>
          <p style={{
            color: '#64748b',
            marginTop: 8,
            fontSize: 16,
            fontWeight: 400,
          }}>
            เลือกตำแหน่งเพื่อเข้าสู่ระบบ
          </p>
        </div>

        {/* Role cards */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'center',
          maxWidth: 900,
          width: '100%',
        }}>
          {ROLES.map(role => {
            const isSelected = active?.id === role.id;
            return (
              <div
                key={role.id}
                className={`role-card ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(role)}
                style={{
                  background: 'white',
                  border: `2px solid ${isSelected ? role.color : '#e2e8f0'}`,
                  borderRadius: 16,
                  padding: '24px 28px',
                  width: 260,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  boxShadow: isSelected
                    ? `0 0 0 4px ${role.color}18, 0 8px 24px ${role.color}22`
                    : '0 1px 3px rgba(0,0,0,0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    background: role.bg,
                    border: `1px solid ${role.border}`,
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontFamily: 'IBM Plex Mono',
                    fontSize: 13,
                    fontWeight: 600,
                    color: role.color,
                    letterSpacing: '0.05em',
                  }}>
                    {role.abbr}
                  </div>
                  {isSelected && (
                    <div style={{
                      width: 20, height: 20,
                      borderRadius: '50%',
                      background: role.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: '#0f172a' }}>{role.label}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{role.labelEn}</div>
                </div>
                <div style={{
                  fontSize: 13,
                  color: '#64748b',
                  paddingTop: 8,
                  borderTop: '1px solid #f1f5f9',
                }}>
                  {role.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* Login panel */}
        <div style={{
          width: '100%',
          maxWidth: 360,
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          padding: 28,
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          opacity: active ? 1 : 0.4,
          pointerEvents: active ? 'auto' : 'none',
          transition: 'opacity 0.2s',
        }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>
              {active ? `รหัสผ่าน · ${active.label}` : 'เลือกตำแหน่งก่อน'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={pwd}
                onChange={e => { setPwd(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="••••••••"
                style={{
                  flex: 1,
                  border: `1.5px solid ${error ? '#fca5a5' : '#e2e8f0'}`,
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontSize: 16,
                  color: '#0f172a',
                  background: error ? '#fff5f5' : '#f8fafc',
                  letterSpacing: '0.15em',
                  transition: 'border-color 0.15s',
                }}
              />
              <button
                className="login-btn"
                onClick={handleLogin}
                disabled={!pwd || loading}
                style={{
                  background: active ? active.color : '#94a3b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: pwd && !loading ? 'pointer' : 'not-allowed',
                  opacity: pwd && !loading ? 1 : 0.6,
                  whiteSpace: 'nowrap',
                  fontFamily: 'Sarabun, sans-serif',
                }}
              >
                {loading ? '...' : 'เข้าสู่ระบบ'}
              </button>
            </div>
            {error && (
              <div style={{
                marginTop: 8,
                fontSize: 13,
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span>✕</span> {error}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Footer */}
      <div style={{
        padding: '16px 32px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'center',
        gap: 32,
      }}>
        {['เภสัชกร', 'เจ้าพนักงานฯ', 'ผู้ช่วยเภสัชกร'].map((t, i) => (
          <span key={i} style={{ fontSize: 12, color: '#cbd5e1', fontFamily: 'IBM Plex Mono' }}>{t}</span>
        ))}
      </div>
    </div>
  );
}
