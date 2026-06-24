import { useState } from 'react';
import PhotoValidator from './components/admin/PhotoValidator';
import LedgerWatchtower from './components/admin/LedgerWatchtower';
import EscrowWatchtower from './components/admin/EscrowWatchtower';
import CourseSeeder from './components/CourseSeeder';
import TournamentManager from './components/admin/TournamentManager'; 
import TournamentTV from './components/admin/TournamentTV'; 
import EventGenesisConsole from './components/admin/EventGenesisConsole'; // 🔥 INJECTED: Event Creator

export default function App() {
  const [activeTab, setActiveTab] = useState<'photos' | 'escrow' | 'ledger' | 'courses' | 'tournaments' | 'genesis'>('courses');

  // 🔥 TV MODE BYPASS: Checks the URL to see if it should hijack the screen
  const isTvMode = new URLSearchParams(window.location.search).get('tv') === 'true';

  if (isTvMode) {
    return <TournamentTV />;
  }

  return (
    <div style={styles.masterContainer}>
      {/* Sidebar Navigation */}
      <div style={styles.sidebar}>
        <h1 style={styles.logo}>GOLFRIEND ADMIN</h1>
        
        <button 
          style={{...styles.navBtn, ...(activeTab === 'photos' ? styles.activeBtn : {})}}
          onClick={() => setActiveTab('photos')}
        >
          📷 Photo Watchtower
        </button>

        <button 
          style={{...styles.navBtn, ...(activeTab === 'escrow' ? styles.activeBtn : {})}}
          onClick={() => setActiveTab('escrow')}
        >
          🔒 Escrow Locks
        </button>

        <button 
          style={{...styles.navBtn, ...(activeTab === 'ledger' ? styles.activeBtn : {})}}
          onClick={() => setActiveTab('ledger')}
        >
          ⚡ Manual Override
        </button>

        {/* 🔥 THE NEW COURSE SEEDER BUTTON */}
        <button 
          style={{...styles.navBtn, ...(activeTab === 'courses' ? styles.activeBtn : {})}}
          onClick={() => setActiveTab('courses')}
        >
          ⛳ Core Seeder Engine
        </button>

        {/* 🔥 TOURNAMENT MANAGER BUTTON */}
        <button 
          style={{...styles.navBtn, ...(activeTab === 'tournaments' ? styles.activeBtn : {})}}
          onClick={() => setActiveTab('tournaments')}
        >
          🏆 Tournament Manager
        </button>

        {/* 🔥 EVENT GENESIS BUTTON */}
        <button 
          style={{...styles.navBtn, ...(activeTab === 'genesis' ? styles.activeBtn : {})}}
          onClick={() => setActiveTab('genesis')}
        >
          📅 Event Genesis
        </button>
      </div>

      {/* Main Content Area */}
      <div style={styles.content}>
        {activeTab === 'photos' && <PhotoValidator />}
        {activeTab === 'escrow' && <EscrowWatchtower />}
        {activeTab === 'ledger' && <LedgerWatchtower />}
        {/* 🔥 RENDER THE ENGINE */}
        {activeTab === 'courses' && <CourseSeeder />}
        {activeTab === 'tournaments' && <TournamentManager />}
        {activeTab === 'genesis' && <EventGenesisConsole />}
      </div>
    </div>
  );
}

const styles = {
  masterContainer: { display: 'flex', minHeight: '100vh', backgroundColor: '#0a0a0a', color: 'white', fontFamily: 'sans-serif' },
  sidebar: { width: '250px', backgroundColor: '#121212', padding: '20px', borderRight: '1px solid #333' },
  logo: { color: '#d4af37', fontSize: '20px', marginBottom: '40px', letterSpacing: '1px' },
  content: { flex: 1, overflowY: 'auto' as const },
  navBtn: { 
    display: 'block', width: '100%', padding: '15px', marginBottom: '10px', 
    backgroundColor: 'transparent', color: '#888', border: '1px solid transparent', 
    textAlign: 'left' as const, cursor: 'pointer', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold' as const
  },
  activeBtn: { backgroundColor: '#1e1e1e', color: '#d4af37', border: '1px solid #333' }
};